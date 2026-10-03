import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';

// A login only counts for the browser tab/window it happened in.
// Opening the app fresh always shows the landing page and requires login;
// a page refresh inside the same tab keeps the session.
const SESSION_FLAG = 'finova_session_active';

function clearSession() {
  localStorage.removeItem('finova_token');
  localStorage.removeItem('finova_user');
  localStorage.removeItem('finova_active_tab');
  sessionStorage.removeItem(SESSION_FLAG);
  sessionStorage.removeItem('finova_chat_history');
}

function readSession() {
  const token = localStorage.getItem('finova_token');
  const storedUser = localStorage.getItem('finova_user');
  if (!token || !storedUser || !sessionStorage.getItem(SESSION_FLAG)) {
    clearSession();
    return null;
  }
  try {
    return JSON.parse(storedUser);
  } catch (_) {
    clearSession();
    return null;
  }
}

function App() {
  const [user, setUser] = useState(() => readSession());
  // Landing page is always the first screen; only a live session in this tab skips ahead.
  const [view, setView] = useState(() => (readSession() ? 'dashboard' : 'landing'));
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Route guard: the dashboard is unreachable without a logged-in user.
  useEffect(() => {
    if (view === 'dashboard' && !user) {
      clearSession();
      setView('login');
    }
  }, [view, user]);

  // Keep the page at the top when switching screens (important on phones)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  return (
    <>
      {view === 'landing' && <LandingPage setView={setView} />}
      {view === 'login' && <Login setView={setView} setUser={setUser} registeredEmail={registeredEmail} />}
      {view === 'register' && <Register setView={setView} setUser={setUser} setRegisteredEmail={setRegisteredEmail} />}
      {view === 'dashboard' && user && <Dashboard user={user} setView={setView} setUser={setUser} />}
    </>
  );
}

export default App;
