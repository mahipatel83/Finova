import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export default function Register({ setView, setRegisteredEmail }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Render Django backend
      const apiBase = 'https://finova-yu4v.onrender.com';

      const response = await fetch(`${apiBase}/api/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Mandatory login: Do NOT log in automatically.
      // Clear any previous login information.
      localStorage.removeItem('finova_token');
      localStorage.removeItem('finova_user');

      if (setRegisteredEmail) {
        setRegisteredEmail(email);
      }

      localStorage.setItem('finova_registered_email', email);

      setSuccess(
        'Account created successfully! Please sign in with your credentials to continue.'
      );

      setTimeout(() => {
        setView('login');
      }, 1500);

    } catch (err) {
      setError(
        err.message ||
        'Something went wrong. Make sure backend is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-header">
          <div
            className="auth-logo"
            style={{ cursor: 'pointer' }}
            onClick={() => setView('landing')}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="4"
                y="16"
                width="4"
                height="10"
                rx="2"
                fill="#10B981"
              />

              <rect
                x="11"
                y="10"
                width="4"
                height="16"
                rx="2"
                fill="#FF5A5F"
              />

              <rect
                x="18"
                y="4"
                width="4"
                height="22"
                rx="2"
                fill="#10B981"
              />

              <circle
                cx="27"
                cy="6"
                r="3"
                fill="#FF5A5F"
              />
            </svg>

            <span>Finova</span>
          </div>

          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginTop: '10px'
            }}
          >
            Create Account
          </h2>

          <p className="auth-subtitle">
            Start tracking your cash flow for free today
          </p>
        </div>

        {success && (
          <div
            style={{
              backgroundColor: '#ECFDF5',
              color: '#065F46',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              marginBottom: '20px',
              fontWeight: '600',
              border: '1px solid #A7F3D0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={18} color="#10B981" />
            {success}
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: '#FEE2E2',
              color: '#EF4444',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '20px',
              fontWeight: '500',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div className="auth-form-group">
            <label className="auth-label">
              Full Name
            </label>

            <input
              type="text"
              className="auth-input"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="auth-form-group">
            <label className="auth-label">
              Email Address
            </label>

            <input
              type="email"
              className="auth-input"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-form-group">
            <label className="auth-label">
              Password
            </label>

            <div className="password-input-wrapper">

              <input
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                className="password-toggle-btn"
                title={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>

            </div>
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={loading}
          >
            {loading
              ? 'Creating Account...'
              : 'Register'}
          </button>

        </form>

        <div className="auth-footer">
          Already have an account?{' '}

          <a
            href="#"
            className="auth-link"
            onClick={(e) => {
              e.preventDefault();
              setView('login');
            }}
          >
            Sign In
          </a>
        </div>

      </div>
    </div>
  );
}
