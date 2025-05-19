import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Room from './pages/Room'
import Login from './pages/Login'
import './App.css'

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  
  if (!token || !username) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Header component with auth controls
const Header = () => {
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const navigate = useNavigate();

  // Check for username in localStorage on mount and when localStorage changes
  useEffect(() => {
    const checkAuth = () => {
      const storedUsername = localStorage.getItem('username');
      setUsername(storedUsername || '');
    };
    
    // Initial check
    checkAuth();
    
    // Set up event listener for storage changes
    window.addEventListener('storage', checkAuth);
    
    // Create a custom event listener for auth changes within the app
    window.addEventListener('authChange', checkAuth);
    
    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('authChange', checkAuth);
    };
  }, []);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch('http://localhost:8080/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Clear localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      setUsername('');
      
      // Dispatch auth change event
      window.dispatchEvent(new Event('authChange'));
      
      // Redirect to login
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className="app-header">
      <h1>MonkeyChat</h1>
      <nav>
        {username && <Link to="/">Home</Link>}
        {username ? (
          <div className="user-info">
            <span>Welcome, {username}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        ) : (
          <Link to="/login">Login / Register</Link>
        )}
      </nav>
    </header>
  );
};

function App() {
  // Listen for authentication changes
  useEffect(() => {
    const handleAuthChange = () => {
      console.log("Auth state changed");
    };
    
    window.addEventListener('authChange', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    
    return () => {
      window.removeEventListener('authChange', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);
  
  return (
    <Router>
      <div className="app">
        <Header />
        <main className="app-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } />
            <Route path="/room/:roomId" element={
              <ProtectedRoute>
                <Room />
              </ProtectedRoute>
            } />
            {/* Redirect all other paths to login if not logged in, or home if logged in */}
            <Route path="*" element={
              localStorage.getItem('token') ? <Navigate to="/" /> : <Navigate to="/login" />
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App
