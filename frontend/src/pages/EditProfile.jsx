import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BASE_URL } from '../config';

const EditProfile = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', bio: '', profilePic: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNameChangeWarning, setShowNameChangeWarning] = useState(false);
  const [originalUsername, setOriginalUsername] = useState(username);
  const fileInputRef = useRef();
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const currentUser = localStorage.getItem('username');
    if (currentUser !== username) {
      navigate(`/${username}/profile`);
      return;
    }
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${BASE_URL}/users/${username}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setForm({ username: data.username, bio: data.bio || '', profilePic: data.profilePic || '' });
          setOriginalUsername(data.username);
        }
      } catch {}
      setLoading(false);
    };
    fetchProfile();
  }, [username, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'username' && value !== originalUsername) {
      setShowNameChangeWarning(true);
    } else if (name === 'username' && value === originalUsername) {
      setShowNameChangeWarning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/users/${username}/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        if (form.username !== originalUsername) {
          // Log out and redirect to login
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          window.location.replace('/login');
        } else {
          navigate(`/${form.username}/profile`);
        }
      } else {
        setError('Failed to update profile.');
      }
    } catch {
      setError('Failed to update profile.');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm((prev) => ({ ...prev, profilePic: ev.target.result }));
    };
    reader.readAsDataURL(file);
    // Upload to backend
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', file);
    setUploading(true);
    try {
      const res = await fetch(`${BASE_URL}/users/${username}/upload-profile-pic`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setForm((prev) => ({ ...prev, profilePic: data.url }));
      } else {
        alert('Failed to upload image');
      }
    } catch {
      alert('Failed to upload image');
    }
    setUploading(false);
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div className="edit-profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  const getProfileImageUrl = () => {
    if (!form.profilePic) {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(form.username || 'User')}&background=8b5cf6&color=fff&size=130`;
    }
    if (form.profilePic.startsWith('/uploads/')) {
      return `http://localhost:8080${form.profilePic}`;
    }
    return form.profilePic;
  };

  return (
    <div className="edit-profile-page">
      <div className="edit-profile-container">
        <div className="edit-profile-header">
          <h1>✏️ Edit Profile</h1>
        </div>

        {error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            {error}
        </div>
      )}

        {showNameChangeWarning && (
          <div className="warning-banner">
            <span className="warning-icon">🔄</span>
            <div>
              <strong>Username Change Warning</strong>
              <p>Changing your username will log you out and you'll need to log in again with your new username.</p>
            </div>
        </div>
        )}

        {uploading && (
          <div className="upload-banner">
            <span className="upload-icon">📤</span>
            Uploading image...
        </div>
        )}

        <form onSubmit={handleSubmit} className="edit-profile-form">
          {/* Profile Picture Section */}
          <div className="edit-section photo-section">
            <div className="section-content">
              <div className="photo-upload-container">
                <div className="current-photo" onClick={handlePhotoClick}>
                  <img
                    src={getProfileImageUrl()}
                    alt="Profile Preview"
                  />
                  <div className="photo-overlay">
                    <span className="camera-icon">📷</span>
                    <p>Change Photo</p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Basic Information Section */}
          <div className="edit-section basic-info-section">
            <div className="section-content">
              <div className="form-group">
                <label className="form-label">
                  <span className="label-icon">✨</span>
                  Username
                </label>
                <input
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  required
                  className="form-input"
                  placeholder="Enter your username"
                />
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="edit-section about-edit-section">
            <div className="section-content">
              <div className="form-group">
                <label className="form-label">
                  <span className="label-icon">📝</span>
                  About
                </label>
                <textarea
                  name="bio"
                  value={form.bio}
                  onChange={handleChange}
                  rows={4}
                  className="form-textarea"
                  placeholder="Tell others about yourself..."
                />
                <div className="char-count">
                  {form.bio.length}/500 characters
                </div>
              </div>
            </div>
        </div>

          <div className="form-actions">
            <button
              type="button"
              onClick={() => navigate(`/${originalUsername}/profile`)}
              className="cancel-btn"
            >
              <span className="btn-icon">❌</span>
              Cancel
            </button>
            <button
              type="submit"
              className="save-btn"
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <span className="btn-spinner"></span>
                  Saving...
                </>
              ) : (
                <>
                  <span className="btn-icon">💾</span>
                  Save Changes
                </>
              )}
        </button>
          </div>
      </form>
      </div>
    </div>
  );
};

export default EditProfile; 