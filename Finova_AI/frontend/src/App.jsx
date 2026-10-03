import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';

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
  const sessionActive = sessionStorage.getItem(SESSION_FLAG);

  if (!token || !storedUser || sessionActive !== '1') {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (error) {
    clearSession();
    return null;
  }
}

function App() {
  const [user, setUser] = useState(() => readSession());

  const [view, setView] = useState(() => {
    return readSession() ? 'dashboard' : 'landing';
  });

  const [registeredEmail, setRegisteredEmail] = useState('');

  // Keep dashboard protected
  useEffect(() => {
    if (view === 'dashboard' && !user) {
      setView('landing');
    }
  }, [view, user]);

  // Scroll to top whenever the screen changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);

    sessionStorage.setItem(
      SESSION_FLAG,
      '1'
    );

    setView('dashboard');
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setView('landing');
  };

  return (
    <>
      {view === 'landing' && (
        <LandingPage setView={setView} />
      )}

      {view === 'login' && (
        <Login
          setView={setView}
          setUser={handleLogin}
          registeredEmail={registeredEmail}
        />
      )}

      {view === 'register' && (
        <Register
          setView={setView}
          setUser={setUser}
          setRegisteredEmail={setRegisteredEmail}
        />
      )}

      {view === 'dashboard' && user && (
        <div
          style={{
            padding: '50px',
            fontSize: '30px',
            textAlign: 'center',
          }}
        >
          DASHBOARD TEST
        </div>
      )}
    </>
  );
}

export default App;
