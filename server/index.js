const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ChatSession = require('./models/ChatSession');
const User = require('./models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const app = express();

// MongoDB Connection with better error handling and retries
const connectWithRetry = async () => {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
        console.error('MONGODB_URI is not set in environment variables');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoURI, {
            retryWrites: true,
            w: 'majority',
            dbName: 'chatbot',
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        console.log('Successfully connected to MongoDB Atlas');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    }
};

// Handle MongoDB connection errors
mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    connectWithRetry();
});

// Handle application termination
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
    }
});

connectWithRetry();
// Use port 5000 by default to match CRA's proxy configuration
const port = process.env.PORT || 5000;

// Log the port we're using to help debug proxy issues
console.log(`Starting server - will listen on port ${port}`);

// Debug: Log environment variables
console.log('Environment variables loaded:', {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Set (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'Not set',
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'Not set',
    PORT: process.env.PORT || 'Not set'
});

// Add CORS middleware
const cors = require('cors');
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL]
    : ['http://localhost:3000', 'http://localhost:5000'];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

// --- Authentication endpoints ---
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

        const existing = await User.findOne({ username });
        if (existing) return res.status(409).json({ error: 'Username already taken' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, passwordHash });

        const token = jwt.sign({ sub: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username: user.username } });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Error creating user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });

        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ sub: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username: user.username } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error logging in' });
    }
});

// Auth middleware
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    const token = auth.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.sub;
        req.username = payload.username;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Get current user data
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-passwordHash');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { id: user._id, username: user.username } });
    } catch (err) {
        console.error('Error fetching user data:', err);
        res.status(500).json({ error: 'Error fetching user data' });
    }
});

// Basic health
app.get('/ping', (req, res) => res.json({ ok: true }));

// Get all chat sessions for the authenticated user
app.get('/api/chat/sessions', authMiddleware, async (req, res) => {
    try {
        const sessions = await ChatSession.find({ owner: req.userId }).sort({ lastUpdated: -1 });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching chat sessions' });
    }
});

// Create new chat session
app.post('/api/chat/sessions', authMiddleware, async (req, res) => {
    try {
        console.log('Creating new chat session for user', req.userId);
        const title = req.body.title || 'New Chat';
        const session = await ChatSession.create({
            title,
            owner: req.userId,
            messages: []
        });
        console.log('Created new session:', session._id);
        res.json(session);
    } catch (err) {
        console.error('Error creating chat session:', err);
        res.status(500).json({ error: 'Error creating chat session: ' + err.message });
    }
});

// Get specific chat session
app.get('/api/chat/sessions/:sessionId', authMiddleware, async (req, res) => {
    try {
        const session = await ChatSession.findById(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Chat session not found' });
        }
        if (String(session.owner) !== String(req.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: 'Error fetching chat session' });
    }
});

// Delete specific chat session
app.delete('/api/chat/sessions/:sessionId', authMiddleware, async (req, res) => {
    try {
        const session = await ChatSession.findById(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Chat session not found' });
        }
        if (String(session.owner) !== String(req.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await ChatSession.findByIdAndDelete(req.params.sessionId);
        res.json({ message: 'Chat session deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error deleting chat session' });
    }
});

// Generate share token for a session
app.post('/api/chat/sessions/:sessionId/share', authMiddleware, async (req, res) => {
    try {
        const session = await ChatSession.findById(req.params.sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Chat session not found' });
        }
        if (String(session.owner) !== String(req.userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const crypto = require('crypto');
        const shareToken = crypto.randomBytes(16).toString('hex');

        await ChatSession.findByIdAndUpdate(req.params.sessionId, { shareToken });

        // Use APP_URL from environment or construct from request
        const host = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const shareUrl = `${host}/share/${shareToken}`;

        res.json({ shareToken, shareUrl });
    } catch (err) {
        console.error('Error generating share token:', err);
        res.status(500).json({ error: 'Error generating share token' });
    }
});

// Get session by share token (public endpoint - NO authMiddleware)
app.get('/api/chat/share/:token', async (req, res) => {
    try {
        const session = await ChatSession.findOne({ shareToken: req.params.token });
        if (!session) {
            return res.status(404).json({ error: 'Shared chat not found' });
        }
        res.json(session);
    } catch (err) {
        console.error('Error fetching shared chat:', err);
        res.status(500).json({ error: 'Error fetching shared chat' });
    }
});

// Proxy endpoint to call Gemini-like API. Expects { input: 'user message' }
app.post('/api/chat/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
    const { input } = req.body;
    const { sessionId } = req.params;

    console.log('Received message request:', { sessionId, input });

    if (!input) return res.status(400).json({ error: 'Missing input' });
    if (!sessionId) return res.status(400).json({ error: 'Missing session ID' });

    let session;
    // Verify session exists
    try {
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
            console.error('Invalid session ID format:', sessionId);
            return res.status(400).json({ error: 'Invalid session ID format' });
        }

        session = await ChatSession.findById(sessionId);
        if (!session) {
            console.error('Session not found:', sessionId);
            return res.status(404).json({ error: 'Chat session not found' });
        }
    } catch (err) {
        console.error('Error verifying session:', err);
        return res.status(500).json({ error: 'Error verifying chat session: ' + err.message });
    }

    if (String(session.owner) !== String(req.userId)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        // Development fallback: return an echo reply
        console.warn('GEMINI_API_KEY not set — returning development echo response');
        return res.json({ reply: `Echo (dev): ${input} — set GEMINI_API_KEY to use real Gemini.` });
    }

    try {
        // Use the model name from .env or default to the modern, fast model
        const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

        // FIX: Use the stable 'v1beta' API version and the standard generativelanguage domain.
        // The API Key will be passed in the 'x-goog-api-key' header.
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

        // console.log(`Sending request to Gemini: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // FIX: Pass the API key using the correct header 
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                // Correct nested structure for prompt input
                contents: [{
                    parts: [{
                        text: "You are a helpful assistant. Always respond in common, unformatted, plain text only. Do not use Markdown, symbols like asterisks (*), or hashtags (#) for formatting.\n\n" + input
                    }]
                }],
                // Correct name for generation configuration
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40
                }
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();

            // Log full upstream error details
            // console.error(`Gemini API returned ${response.status} from ${endpoint}:`, errorBody);

            let hint;
            if (response.status === 404) {
                // If 404 persists, the API key might not be provisioned for this model/version
                hint = `404 Not Found. Check the Model Name (${MODEL_NAME}) and API version (v1beta). Try regenerating your API key.`;
            } else if (response.status === 403) {
                hint = '403 Forbidden. Your API key may be invalid, or billing/quota limits may be reached.';
            } else if (response.status === 400 && errorBody.includes("API_KEY_INVALID")) {
                hint = '400 Bad Request / API_KEY_INVALID. The API key is likely incorrect or expired.';
            }

            // Return structured JSON so frontend can display a clearer message
            return res.status(502).json({
                error: 'Upstream API error',
                upstreamStatus: response.status,
                upstreamBody: errorBody,
                hint,
            });
        }

        const data = await response.json();
        // console.log('Gemini raw response:', JSON.stringify(data, null, 2));

        // Handle response from Gemini API v1beta
        let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (reply) {
            // Update chat session with new messages
            await ChatSession.findByIdAndUpdate(
                sessionId,
                {
                    $push: {
                        messages: [
                            { role: 'user', content: input },
                            { role: 'assistant', content: reply }
                        ]
                    },
                    lastUpdated: new Date()
                }
            );

            // Update title for new sessions (first message)
            const session = await ChatSession.findById(sessionId);
            if (session.messages.length === 2) {
                await ChatSession.findByIdAndUpdate(
                    sessionId,
                    { title: input.slice(0, 50) + (input.length > 50 ? '...' : '') }
                );
            }

            res.json({ reply });
        } else if (data?.promptFeedback?.blockReason) {
            // Handle cases where the model blocks the prompt (e.g., safety filter)
            reply = `Your prompt was blocked due to: ${data.promptFeedback.blockReason}.`;

            // Update chat session with new messages
            await ChatSession.findByIdAndUpdate(
                sessionId,
                {
                    $push: {
                        messages: [
                            { role: 'user', content: input },
                            { role: 'assistant', content: reply }
                        ]
                    },
                    lastUpdated: new Date()
                }
            );

            res.json({ reply });
        }
        else {
            console.warn('Unexpected Gemini response structure or no text generated:', data);
            res.status(502).json({
                error: "The model returned a response, but I couldn't find the text or reason for failure.",
                data: data
            });
        }
    } catch (err) {
        // console.error('chat error', err);
        res.status(500).json({ error: String(err) });
    }
});

// Serve static build in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'build')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'build', 'index.html')));
}

app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
});
