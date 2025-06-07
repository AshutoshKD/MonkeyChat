import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../utils/api';

const Register = ({ setIsAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate form
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const data = await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

        localStorage.setItem('token', data.token);
        localStorage.setItem('username', username);
        setIsAuthenticated(true);
        navigate('/chat');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-background">
        <div className="auth-particles"></div>
      </div>
      <div className="auth-container boxing-layout">
        <div className="auth-card boxing-card register-card">
          <div className="auth-header">
            <div className="auth-icon">
              <span className="icon">🚀</span>
            </div>
            <h2 className="auth-title">Join MonkeyChat</h2>
            <p className="auth-subtitle">Create your account to get started</p>
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="boxing-form">
            <div className="boxing-left">
              <div className="form-fields">
          <div className="form-group">
                  <label htmlFor="username" className="form-label">
                    <span className="label-icon">👤</span>
                    Username
                  </label>
                  <div className="input-wrapper">
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
                      className="form-input"
                      placeholder="Choose a username (3+ characters)"
            />
          </div>
                  <div className="form-hint">
                    <span className="hint-icon">💡</span>
                    This will be your unique identifier
                  </div>
                </div>

          <div className="form-group">
                  <label htmlFor="password" className="form-label">
                    <span className="label-icon">🔒</span>
                    Password
                  </label>
                  <div className="input-wrapper">
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
                      className="form-input"
                      placeholder="Create a secure password (4+ characters)"
            />
          </div>
                </div>

          <div className="form-group">
                  <label htmlFor="confirmPassword" className="form-label">
                    <span className="label-icon">🔐</span>
                    Confirm Password
                  </label>
                  <div className="input-wrapper">
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={4}
                      className={`form-input ${confirmPassword && password !== confirmPassword ? 'error' : ''}`}
                      placeholder="Confirm your password"
            />
                  </div>
            {confirmPassword && password !== confirmPassword && (
                    <div className="field-error">
                      <span className="error-icon">❌</span>
                      Passwords do not match
                    </div>
                  )}
                  {confirmPassword && password === confirmPassword && confirmPassword.length >= 4 && (
                    <div className="field-success">
                      <span className="success-icon">✅</span>
                      Passwords match!
                    </div>
            )}
          </div>
              </div>
            </div>

            <div className="boxing-divider"></div>

            <div className="boxing-right">
              <div className="action-section">
                <button type="submit" disabled={isLoading || (confirmPassword && password !== confirmPassword)} className="auth-button primary">
                  {isLoading ? (
                    <span className="loading-spinner">
                      <span className="spinner"></span>
                      Creating account...
                    </span>
                  ) : (
                    <span>
                      <span className="btn-icon">🎉</span>
                      Create Account
                    </span>
                  )}
          </button>

                <div className="auth-divider">
                  <span>or</span>
                </div>

                <div className="auth-option">
                  <p className="option-text">Already have an account?</p>
                  <Link to="/login" className="auth-link-button">
                    <span className="btn-icon">🔐</span>
                    Sign In Here
                  </Link>
                </div>
              </div>
            </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default Register; 