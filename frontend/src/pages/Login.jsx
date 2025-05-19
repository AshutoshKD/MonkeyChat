import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usernameExists, setUsernameExists] = useState(false);
  const navigate = useNavigate();

  // Check if already logged in, redirect to home if true
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    
    if (token && storedUsername) {
      navigate('/');
    }
  }, [navigate]);

  // Check username availability when typing in register mode
  useEffect(() => {
    if (!isLogin && username.length >= 3) {
      const checkUsernameTimeout = setTimeout(async () => {
        try {
          const response = await fetch(`http://localhost:8080/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password: 'checkonly' }),
          });
          
          // If login would succeed with any password, username exists
          setUsernameExists(response.ok);
          
        } catch (err) {
          console.error('Error checking username:', err);
        }
      }, 500);
      
      return () => clearTimeout(checkUsernameTimeout);
    }
  }, [username, isLogin]);

  const validateForm = () => {
    setError('');
    
    // Basic validation
    if (!username) {
      setError('Username is required');
      return false;
    }
    
    if (!password) {
      setError('Password is required');
      return false;
    }
    
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return false;
    }
    
    // Registration-specific validation
    if (!isLogin) {
      if (usernameExists) {
        setError('Username already exists, please choose another');
        return false;
      }
      
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    try {
      const endpoint = isLogin ? '/login' : '/register';
      const response = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      // Store token and username in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      
      // Force a refresh of the page to ensure all components update with the new auth state
      window.location.href = '/';
    } catch (err) {
      if (isLogin && err.message === 'invalid username or password') {
        setError('Invalid username or password');
      } else if (!isLogin && err.message.includes('username already exists')) {
        setError('Username already exists, please choose another');
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h2>{isLogin ? 'Login' : 'Register'}</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className={!isLogin && usernameExists ? 'error' : ''}
            />
            {!isLogin && usernameExists && username.length >= 3 && (
              <div className="error-message">Username already exists</div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>
          
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={4}
                className={confirmPassword && password !== confirmPassword ? 'error' : ''}
              />
              {confirmPassword && password !== confirmPassword && (
                <div className="error-message">Passwords do not match</div>
              )}
            </div>
          )}
          
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        
        <div className="toggle-form">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button" 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setPassword('');
                setConfirmPassword('');
              }}
              className="toggle-btn"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login; 