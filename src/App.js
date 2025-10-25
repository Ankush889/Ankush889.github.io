import './App.css';
import Chat from './Chat';
import Login from './Login';
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams } from 'react-router-dom';

function SharedChat() {
  const { token: shareToken } = useParams(); // Rename to avoid conflict
  return <Chat sharedToken={shareToken} />;
}

function App() {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setToken(t);
    const u = localStorage.getItem('username');
    if (u) setUsername(u);
  }, []);

  const handleAuth = (t) => {
    setToken(t);
    const u = localStorage.getItem('username');
    if (u) setUsername(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken(null);
    setUsername(null);
  };

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>CYPHER</h1>
        </header>
        <main>
          <Routes>
            <Route path="/share/:token" element={<SharedChat />} />
            <Route
              path="/"
              element={
                !token ? (
                  <Login onAuth={handleAuth} />
                ) : (
                  <Chat token={token} username={username} onLogout={handleLogout} />
                )
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
