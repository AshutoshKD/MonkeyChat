import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Room from './pages/Room';
import LandingPage from './pages/LandingPage';
import { BASE_URL } from './config';
import './App.css';
import UserAvatar from './components/UserAvatar';
import UserProfile from './pages/UserProfile';
import EditProfile from './pages/EditProfile';

// Header component with auth controls
const Header = ({ isAuthenticated, setIsAuthenticated }) => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [profilePic, setProfilePic] = useState(null);
  const navigate = useNavigate();

  // Update username when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      const storedUsername = localStorage.getItem('username');
      setUsername(storedUsername || '');
    } else {
      setUsername('');
      setProfilePic(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const checkAuth = () => {
      const storedUsername = localStorage.getItem('username');
      setUsername(storedUsername || '');
    };
    
    checkAuth();
    window.addEventListener('storage', checkAuth);
    window.addEventListener('authChange', checkAuth);
    
    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('authChange', checkAuth);
    };
  }, []);

  // Fetch profile picture for the current user
  useEffect(() => {
    const fetchProfilePic = async () => {
      if (!username) return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${BASE_URL}/users/${username}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProfilePic(data.profilePic || null);
        } else {
          setProfilePic(null);
        }
      } catch {
        setProfilePic(null);
      }
    };
    if (isAuthenticated && username) fetchProfilePic();
  }, [isAuthenticated, username]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch(`${BASE_URL}/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      localStorage.removeItem('token');
      localStorage.removeItem('username');
      setUsername('');
      setIsAuthenticated(false);
      
      window.dispatchEvent(new Event('authChange'));
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="app-header">
      <Link to="/about" className="logo-link">
        <h1>MonkeyChat</h1>
      </Link>
      <nav>
        {isAuthenticated && (
          <div className="nav-links">
            <Link to="/home" className="nav-link">Home</Link>
            <Link to="/about" className="nav-link">About</Link>
          </div>
        )}
        {isAuthenticated ? (
          <div className="user-info">
            <UserAvatar username={username} profilePic={profilePic} size={36} showName={true} />
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        ) : (
          <div className="auth-buttons">
            <Link to="/login" className="nav-btn">Login</Link>
            <Link to="/register" className="nav-btn">Register</Link>
          </div>
        )}
      </nav>
    </header>
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  const ProtectedRoute = ({ children }) => {
    if (isLoading) {
      return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
      return <Navigate to="/" />;
    }

    return children;
  };

  const PublicRoute = ({ children }) => {
    if (isLoading) {
      return <div>Loading...</div>;
    }

    if (isAuthenticated) {
      return <Navigate to="/home" />;
    }

    return children;
  };

  return (
    <Router>
      <div className="app">
        <Header isAuthenticated={isAuthenticated} setIsAuthenticated={setIsAuthenticated} />
        <main className="app-content">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <Login setIsAuthenticated={setIsAuthenticated} />
                </PublicRoute>
              } 
            />
            <Route 
              path="/register" 
              element={
                <PublicRoute>
                  <Register setIsAuthenticated={setIsAuthenticated} />
                </PublicRoute>
              } 
            />

            {/* Protected routes */}
            <Route 
              path="/home" 
              element={
                <ProtectedRoute>
                  <Home setIsAuthenticated={setIsAuthenticated} />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/about" 
              element={
                <ProtectedRoute>
                  <LandingPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/room/:roomId" 
              element={
                <ProtectedRoute>
                  <Room setIsAuthenticated={setIsAuthenticated} />
                </ProtectedRoute>
              } 
            />
            {/* User profile routes */}
            <Route path=":username/profile" element={<UserProfile />} />
            <Route path=":username/edit" element={<EditProfile />} />

            {/* Catch all route - redirect to home if authenticated, landing page if not */}
            <Route 
              path="*" 
              element={
                isAuthenticated ? <Navigate to="/home" /> : <Navigate to="/" />
              } 
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
