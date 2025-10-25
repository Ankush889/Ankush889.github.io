import React, { useState, useRef, useEffect } from 'react';

export default function Chat({ token, username, onLogout, sharedToken }) {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState(null);
  const [cpSuccess, setCpSuccess] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null); // Track which session menu is open
  const [sharedError, setSharedError] = useState(null);

  // Ref to scroll to the latest message
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const avatarRef = useRef(null);
  const menuRef = useRef(null);

  // Effect to scroll to the bottom whenever messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  // Load chat sessions when component mounts or load shared session
  useEffect(() => {
    if (sharedToken) {
      // Load shared session
      const loadSharedSession = async () => {
        try {
          const response = await fetch(`/api/chat/share/${sharedToken}`)

          if (response.ok) {
            const session = await response.json();
            setCurrentSession(session);
            const formattedMessages = session.messages.map(msg => ({
              role: msg.role === 'assistant' ? 'bot' : 'user',
              text: msg.content,
              ts: new Date(msg.timestamp).getTime()
            }));
            setMessages(formattedMessages);
            setSharedError(null);
          } else {
            const errorText = await response.text();
            console.error('Failed to load shared session', response.status, errorText);
            setSharedError(`Failed to load shared chat: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.error('Error loading shared session:', error);
          setSharedError('Error loading shared chat. Please check the link and try again.');
        }
      };
      loadSharedSession();
    } else {
      // Load user's sessions
      const loadSessions = async () => {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          const response = await fetch('/api/chat/sessions', { headers });
          if (response.ok) {
            const loadedSessions = await response.json();
            setSessions(loadedSessions);
          } else {
            console.error('Failed to load sessions', response.status);
          }
        } catch (error) {
          console.error('Error loading chat sessions:', error);
        }
      };
      loadSessions();
    }
  }, [token, sharedToken]);

  // Create new chat session
  const createNewSession = async () => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'New Chat' })
      });
      
      if (response.ok) {
        const newSession = await response.json();
        setSessions(prev => [newSession, ...prev]);
        setCurrentSession(newSession);
        setMessages([]);
        return newSession;
      }
    } catch (error) {
      console.error('Error creating new session:', error);
    }
    return null;
  };

  // Load specific session
  const loadSession = async (sessionId) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/chat/sessions/${sessionId}`, { headers });
      if (response.ok) {
        const session = await response.json();
        setCurrentSession(session);
        const formattedMessages = session.messages.map(msg => ({
          role: msg.role === 'assistant' ? 'bot' : 'user',
          text: msg.content,
          ts: new Date(msg.timestamp).getTime()
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close profile menu when clicking outside
  useEffect(() => {
    function handleDocClick(e) {
      if (showProfileMenu) {
        if (
          menuRef.current && !menuRef.current.contains(e.target)
          && avatarRef.current && !avatarRef.current.contains(e.target)
        ) {
          setShowProfileMenu(false);
        }
      }
      // Close session menu if clicking outside
      if (menuOpen) {
        setMenuOpen(null);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [showProfileMenu, menuOpen]);

  // helper to append a message with timestamp
  const pushMessage = (role, text) => {
    const msg = { role, text, ts: Date.now() };
    setMessages((m) => [...m, msg]);
  };

  async function sendMessage(e) {
    if (e) e.preventDefault();
    const messageToSend = input.trim();
    if (!messageToSend || loading) return;

    setLoading(true);
    let session = currentSession;

    try {
      // If no current session, create one first
      if (!session) {
        session = await createNewSession();
        if (!session) {
          throw new Error('Failed to create new session');
        }
      }

      // append user message and clear input
      pushMessage('user', messageToSend);
      setInput('');

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/chat/sessions/${session._id}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: messageToSend }),
      });

      const rawBody = await res.text();
      let finalReply;

      if (!res.ok) {
        try {
          const errorData = JSON.parse(rawBody);
          finalReply = errorData.error
            ? `${errorData.error}${errorData.hint ? ' — ' + errorData.hint : ''}`
            : `Server Error ${res.status}: ${rawBody}`;
        } catch (parseErr) {
          finalReply = `Server returned HTTP ${res.status}: ${rawBody || 'No response body'}`;
        }
      } else {
        try {
          const data = JSON.parse(rawBody);
          finalReply = data.reply || 'No text reply found in the response.';
        } catch (parseErr) {
          finalReply = `Successful but unparseable response: ${rawBody}`;
        }
      }

      pushMessage('bot', finalReply);
    } catch (error) {
      console.error('Error in sendMessage:', error);
      pushMessage('bot', 'Error: Failed to send message. Please try again.');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

const shareSession = async (session) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/chat/sessions/${session._id}/share`, {
      method: 'POST',
      headers,
    });
    if (response.ok) {
      const data = await response.json();
      const shareUrl = data.shareUrl;
      await navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    } else {
      console.error('Failed to generate share link', response.status);
      alert('Failed to generate share link');
    }
  } catch (err) {
    console.error('Failed to share session:', err);
    alert('Failed to share session');
  }
  setMenuOpen(null);
};

  // Delete session
  const deleteSession = async (sessionId) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers,
      });
      if (response.ok) {
        setSessions(prev => prev.filter(s => s._id !== sessionId));
        if (currentSession?._id === sessionId) {
          setCurrentSession(null);
          setMessages([]);
        }
      } else {
        console.error('Failed to delete session', response.status);
        alert('Failed to delete session');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error deleting session');
    }
    setMenuOpen(null);
  };

  return (
    <div className="chat-container" role="region" aria-label="AI chat">
      {!sharedToken && (
        <div className="sidebar">
          <div className="sidebar-top">
            <button
              className="new-chat-button"
              onClick={createNewSession}
              aria-label="Start new chat"
            >
              New Chat
            </button>
            <div className="sessions-list">
              {sessions.map(session => (
                <div key={session._id} className="session-item-container">
                  <button
                    className={`session-item ${currentSession?._id === session._id ? 'active' : ''}`}
                    onClick={() => loadSession(session._id)}
                  >
                    {session.title}
                  </button>
                  <button
                    className="session-menu-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === session._id ? null : session._id);
                    }}
                    aria-label="Session options"
                  >
                    ⋮
                  </button>
                  {menuOpen === session._id && (
                    <div className="session-menu">
                      <button onClick={() => shareSession(session)}>Share</button>
                      <button onClick={() => deleteSession(session._id)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-footer">
            {username && (
              <div style={{ position: 'relative' }}>
                <button
                  ref={avatarRef}
                  className="header-avatar"
                  title={username}
                  aria-haspopup="true"
                  aria-expanded={showProfileMenu}
                  onClick={() => setShowProfileMenu((s) => !s)}
                >
                  {username.charAt(0).toUpperCase()}
                </button>

                {showProfileMenu && (
                  <div ref={menuRef} className="profile-menu" role="menu" aria-label="Profile menu">
                    <button className="profile-menu-item" onClick={() => { setShowChangePassword(true); setShowProfileMenu(false); }}>Change password</button>
                    <button className="profile-menu-item" onClick={() => { setShowProfileMenu(false); onLogout && onLogout(); }}>Log out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="chat-main">
        {sharedToken && currentSession && (
          <div className="shared-chat-header">
            <h2>{currentSession.title}</h2>
            <p>Shared Chat</p>
          </div>
        )}
        <div className="messages-area" aria-live="polite">
          {sharedError ? (
            <div className="empty-state" style={{ color: 'red' }}>{sharedError}</div>
          ) : !currentSession ? (
            <div className="empty-state">{sharedToken ? 'Loading shared chat...' : 'Select a chat or start a new one'}</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">{sharedToken ? 'This shared chat has no messages.' : 'Start the conversation — ask me anything.'}</div>
          ) : null}

          {messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.role}`}>
              <div className="avatar" aria-hidden>
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              <div className="message-bubble">
                <div className="message-text">{msg.text}</div>
                <div className="message-meta">
                  <span className="role-label">{msg.role === 'user' ? 'You' : 'Bot'}</span>
                  <time className="ts">{formatTime(msg.ts)}</time>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-row bot loading">
              <div className="avatar" aria-hidden>AI</div>
              <div className="message-bubble">
                <div className="message-text">
                  <span className="spinner" aria-hidden></span> Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {sharedToken ? null : (
          <form onSubmit={sendMessage} className="input-row" aria-label="Send message">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={loading ? 'Waiting for response...' : 'Type a message and press Enter'}
              disabled={loading}
              aria-label="Chat input"
              autoFocus
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Send">
              {loading ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
        {showChangePassword && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="change-password-modal">
              <h3>Change password</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setCpError(null);
                setCpSuccess(null);

                if (!oldPassword || !newPassword) {
                  setCpError('Please fill both fields');
                  return;
                }
                if (newPassword !== confirmPassword) {
                  setCpError('New password and confirmation do not match');
                  return;
                }

                setCpLoading(true);
                try {
                  const headers = { 'Content-Type': 'application/json' };
                  if (token) headers.Authorization = `Bearer ${token}`;
                  const res = await fetch('/api/auth/change-password', {
                    method: 'POST', headers, body: JSON.stringify({ oldPassword, newPassword })
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setCpError(data.error || 'Failed to change password');
                  } else {
                    setCpSuccess('Password changed successfully');
                    setOldPassword(''); setNewPassword(''); setConfirmPassword('');
                    // auto-close after short delay
                    setTimeout(() => setShowChangePassword(false), 900);
                  }
                } catch (err) {
                  setCpError('Network error');
                } finally {
                  setCpLoading(false);
                }
              }}>
                <label>
                  Current password
                  <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
                </label>
                <label>
                  New password
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </label>
                <label>
                  Confirm new password
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="submit" disabled={cpLoading}>{cpLoading ? 'Saving...' : 'Save'}</button>
                  <button type="button" onClick={() => setShowChangePassword(false)}>Cancel</button>
                </div>
                {cpError && <div className="auth-error" style={{ marginTop: 8 }}>{cpError}</div>}
                {cpSuccess && <div style={{ color: 'green', marginTop: 8 }}>{cpSuccess}</div>}
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}