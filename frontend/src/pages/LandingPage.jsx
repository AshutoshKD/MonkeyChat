import { Link } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <div className="hero-section">
        <h1>Welcome to MonkeyChat</h1>
        <p className="hero-subtitle">Your Secure Video Chat Platform</p>
        <div className="cta-buttons">
          <Link to="/login" className="cta-button primary">Get Started</Link>
          <Link to="/register" className="cta-button secondary">Create Account</Link>
        </div>
      </div>

      <div className="features-section">
        <h2>Why Choose MonkeyChat?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎥</div>
            <h3>High-Quality Video Calls</h3>
            <p>Experience crystal-clear video calls with our advanced streaming technology.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Secure & Private</h3>
            <p>Your conversations are protected with end-to-end encryption.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🚀</div>
            <h3>Easy to Use</h3>
            <p>Simple interface for creating and joining video chat rooms instantly.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">👥</div>
            <h3>Room Management</h3>
            <p>Create private rooms and manage participants with ease.</p>
          </div>
        </div>
      </div>

      <div className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Create an Account</h3>
            <p>Sign up for free and get started in seconds</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Create a Room</h3>
            <p>Generate a unique room ID for your video call</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Share & Connect</h3>
            <p>Share your room ID with others and start chatting</p>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <p>© 2024 MonkeyChat. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LandingPage; 