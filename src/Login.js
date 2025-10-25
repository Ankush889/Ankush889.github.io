import React, { useState } from 'react';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login'); // or 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Auth failed');
      } else {
        // store token and notify parent
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.user?.username || username);
        onAuth(data.token);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>{mode === 'login' ? 'Login' : 'Sign up'}</h2>
      <form onSubmit={submit} className="auth-form">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder='Username' required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder='Password' required />
        {error && <div className="auth-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="submit" disabled={loading}>{loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Create account')}</button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Login'}
          </button>
        </div>
      </form>
    </div>
  );
}
