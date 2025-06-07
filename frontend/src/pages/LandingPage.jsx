import { Link } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <div className="hero-section">
        <div className="hero-background"></div>
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-text">🚀 New Features Available</span>
          </div>
          <h1 className="hero-title">
            Welcome to <span className="brand-highlight">MonkeyChat</span>
          </h1>
          <p className="hero-subtitle">
            Experience the future of video communication with our secure, 
            high-quality platform designed for seamless connections.
          </p>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-number">10K+</span>
              <span className="stat-label">Happy Users</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">99.9%</span>
              <span className="stat-label">Uptime</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">HD</span>
              <span className="stat-label">Video Quality</span>
            </div>
          </div>
        <div className="cta-buttons">
            <Link to="/login" className="cta-button primary">
              <span className="btn-icon">✨</span>
              Get Started Free
            </Link>
            <Link to="/register" className="cta-button secondary">
              <span className="btn-icon">👤</span>
              Create Account
            </Link>
          </div>
        </div>
        <div className="hero-illustration">
          <div className="floating-card card-1">
            <div className="card-content">
              <div className="avatar"></div>
              <div className="call-indicator">📹</div>
            </div>
          </div>
          <div className="floating-card card-2">
            <div className="card-content">
              <div className="avatar"></div>
              <div className="call-indicator">🔊</div>
            </div>
          </div>
          <div className="floating-card card-3">
            <div className="card-content">
              <div className="avatar"></div>
              <div className="call-indicator">💬</div>
            </div>
          </div>
        </div>
      </div>

      <div className="features-section">
        <div className="section-header">
          <h2 className="section-title">Why Choose MonkeyChat?</h2>
          <p className="section-subtitle">Discover the features that make us the preferred choice for video communication</p>
        </div>
        <div className="features-grid">
          <div className="feature-card featured">
            <div className="feature-icon-wrapper">
            <div className="feature-icon">🎥</div>
              <div className="icon-glow"></div>
            </div>
            <h3>High-Quality Video Calls</h3>
            <p>Experience crystal-clear video calls with our advanced streaming technology and adaptive quality.</p>
            <div className="feature-tags">
              <span className="tag">4K Ready</span>
              <span className="tag">Low Latency</span>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">
            <div className="feature-icon">🔒</div>
              <div className="icon-glow"></div>
            </div>
            <h3>Secure & Private</h3>
            <p>Your conversations are protected with end-to-end encryption and advanced security protocols.</p>
            <div className="feature-tags">
              <span className="tag">E2E Encrypted</span>
              <span className="tag">GDPR Compliant</span>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">
            <div className="feature-icon">🚀</div>
              <div className="icon-glow"></div>
            </div>
            <h3>Lightning Fast</h3>
            <p>Join rooms instantly with our optimized infrastructure and global server network.</p>
            <div className="feature-tags">
              <span className="tag">Sub-1s Join</span>
              <span className="tag">Global CDN</span>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">
            <div className="feature-icon">👥</div>
              <div className="icon-glow"></div>
            </div>
            <h3>Smart Room Management</h3>
            <p>Create and manage private rooms with intelligent controls and participant management.</p>
            <div className="feature-tags">
              <span className="tag">Auto Moderation</span>
              <span className="tag">Custom Controls</span>
            </div>
          </div>
        </div>
      </div>

      <div className="how-it-works">
        <div className="section-header">
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">Get started in three simple steps and begin your video chat journey</p>
        </div>
        <div className="steps-container">
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
              <div className="step-content">
                <h3>Create Your Account</h3>
                <p>Sign up for free in seconds with just your email. No credit card required, no hidden fees.</p>
                <div className="step-features">
                  <span className="feature">✓ Instant Setup</span>
                  <span className="feature">✓ Free Forever</span>
                </div>
              </div>
          </div>
            <div className="step-connector"></div>
          <div className="step">
            <div className="step-number">2</div>
              <div className="step-content">
                <h3>Create Your Room</h3>
                <p>Generate a unique, secure room ID with advanced privacy settings and custom configurations.</p>
                <div className="step-features">
                  <span className="feature">✓ Unique Room IDs</span>
                  <span className="feature">✓ Custom Settings</span>
                </div>
              </div>
          </div>
            <div className="step-connector"></div>
          <div className="step">
            <div className="step-number">3</div>
              <div className="step-content">
            <h3>Share & Connect</h3>
                <p>Share your room ID with friends and family. Start high-quality video calls instantly.</p>
                <div className="step-features">
                  <span className="feature">✓ Instant Sharing</span>
                  <span className="feature">✓ HD Quality</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="testimonials-section">
        <div className="section-header">
          <h2 className="section-title">What Our Users Say</h2>
          <p className="section-subtitle">Join thousands of satisfied users worldwide</p>
        </div>
        <div className="testimonials-grid">
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"MonkeyChat has revolutionized how we conduct remote meetings. The quality is outstanding!"</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">👩‍💼</div>
              <div className="author-info">
                <span className="author-name">Sarah Johnson</span>
                <span className="author-role">Product Manager</span>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"The security features give us peace of mind for confidential business discussions."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">👨‍💻</div>
              <div className="author-info">
                <span className="author-name">Mike Chen</span>
                <span className="author-role">Tech Lead</span>
              </div>
            </div>
          </div>
          <div className="testimonial-card">
            <div className="testimonial-content">
              <p>"Simple to use, reliable, and the video quality is consistently excellent across all devices."</p>
            </div>
            <div className="testimonial-author">
              <div className="author-avatar">👩‍🎓</div>
              <div className="author-info">
                <span className="author-name">Dr. Emily White</span>
                <span className="author-role">Educator</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-main">
            <div className="footer-brand">
              <h3>MonkeyChat</h3>
              <p>Connecting people through secure, high-quality video communication.</p>
            </div>
            <div className="footer-links">
              <div className="link-group">
                <h4>Product</h4>
                <Link to="/chat">Video Calls</Link>
                <Link to="/login">Get Started</Link>
              </div>
              <div className="link-group">
                <h4>Company</h4>
                <Link to="/home">About Us</Link>
                <Link to="/home">Contact</Link>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copyright">
        <p>© 2024 MonkeyChat. All rights reserved.</p>
            </div>
            <div className="footer-credits">
              <p>
                Developed with ❤️ by{' '}
                <a href="mailto:ashutosh.db.mail@gmail.com" className="developer-link">
                  Ashutosh Dubey
                </a>
              </p>
              <p className="developer-email">ashutosh.db.mail@gmail.com</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage; 