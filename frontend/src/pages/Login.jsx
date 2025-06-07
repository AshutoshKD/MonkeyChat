import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../utils/api';

const Login = ({ setIsAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

        localStorage.setItem('token', data.token);
        localStorage.setItem('username', username);
        setIsAuthenticated(true);
        navigate('/chat');
    } catch (err) {
      setError(err.message || 'Login failed');
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
        <div className="auth-card boxing-card">
          <div className="auth-header">
            <div className="auth-icon">
              <span className="icon">🔐</span>
            </div>
            <h2 className="auth-title">Welcome Back</h2>
            <p className="auth-subtitle">Sign in to continue to MonkeyChat</p>
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
                      className="form-input"
                      placeholder="Enter your username"
            />
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
                      className="form-input"
                      placeholder="Enter your password"
            />
          </div>
                </div>
              </div>
            </div>

            <div className="boxing-divider"></div>

            <div className="boxing-right">
              <div className="action-section">
                <button type="submit" disabled={isLoading} className="auth-button primary">
                  {isLoading ? (
                    <span className="loading-spinner">
                      <span className="spinner"></span>
                      Signing in...
                    </span>
                  ) : (
                    <span>
                      <span className="btn-icon">✨</span>
                      Sign In
                    </span>
                  )}
          </button>

                <div className="auth-divider">
                  <span>or</span>
                </div>

                <div className="auth-option">
                  <p className="option-text">Don't have an account?</p>
                  <Link to="/register" className="auth-link-button">
                    <span className="btn-icon">🚀</span>
                    Create New Account
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

export default Login; 