# AI Chatbot

A full-stack AI chatbot application with user authentication, chat sessions, and share functionality.

## Features

- 🔐 User authentication (Login/Signup)
- 💬 Multiple chat sessions
- 🤖 AI-powered responses using Google Gemini API
- 🔗 Share chat sessions with others
- 📱 Responsive design
- 💾 MongoDB for data persistence

## Tech Stack

**Frontend:**
- React
- React Router
- CSS

**Backend:**
- Node.js
- Express
- MongoDB (Mongoose)
- JWT Authentication
- Google Gemini AI API

## Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account
- Google Gemini API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/ai-chatbot.git
cd ai-chatbot
```

2. Install dependencies:
```bash
npm install
```

3. Install server dependencies:
```bash
cd server
npm install
cd ..
```

4. Create a `.env` file in the `server/` folder:
```bash
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_secret_key
PORT=5000
APP_URL=http://localhost:3000
```

## Running the Application

### Development Mode (Both servers together):
```bash
npm run dev
```

### Or run separately:

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm start
```

The frontend will run on `http://localhost:3000` and backend on `http://localhost:5000`.

## Usage

1. Sign up for a new account or login
2. Start a new chat session
3. Type your message and get AI responses
4. Share chat sessions with others using the share button
5. Manage multiple chat sessions from the sidebar

## Environment Variables

Create a `server/.env` file with:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `GEMINI_API_KEY` | Google Gemini API key |
| `JWT_SECRET` | Secret key for JWT tokens |
| `PORT` | Backend port (default: 5000) |
| `APP_URL` | Frontend URL for share links |

## Building for Production

```bash
npm run build
```

Then set `NODE_ENV=production` and run:
```bash
npm run server
```

## Project Structure

```
ai-chatbot/
├── public/              # Static files
├── src/                 # React frontend
│   ├── App.js
│   ├── Chat.js
│   ├── Login.js
│   └── App.css
├── server/              # Backend
│   ├── index.js
│   ├── models/
│   │   ├── ChatSession.js
│   │   └── User.js
│   └── .env
├── package.json
└── README.md
```

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Author

Ankush Kumar V
Apurva Gupta