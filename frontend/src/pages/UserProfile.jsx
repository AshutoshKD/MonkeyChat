import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import UserAvatar from '../components/UserAvatar';
import { BASE_URL } from '../config';

const UserProfile = () => {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [isCurrentUser, setIsCurrentUser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${BASE_URL}/users/${username}/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else {
          setProfile(null);
        }
      } catch {
        setProfile(null);
      }
      setLoading(false);
    };
    fetchProfile();
    setIsCurrentUser(localStorage.getItem('username') === username);
  }, [username]);

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-not-found">
        <div className="error-icon">👤</div>
        <h2>Profile not found</h2>
        <p>The user you're looking for doesn't exist or has been removed.</p>
        <Link to="/chat" className="nav-btn">Back to Chat</Link>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        {/* Profile Header with Avatar and Basic Info */}
        <div className="profile-header">
          <div className="profile-avatar-section">
            <div className="profile-avatar">
              <img
                src={profile.profilePic ? 
                  (profile.profilePic.startsWith('/uploads/') ? 
                    `http://localhost:8080${profile.profilePic}` : 
                    profile.profilePic) : 
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username)}&background=8b5cf6&color=fff&size=130`
                }
                alt={profile.username}
              />
            </div>
          </div>
          
          <div className="profile-info">
            <h1 className="profile-username">{profile.username}</h1>
            <div className="profile-member-info">
              <span className="member-badge">
                <span className="badge-icon">🎉</span>
                Member since {new Date(profile.createdAt || Date.now()).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        
        {/* Profile Content Sections */}
        <div className="profile-content">
          {/* About Section */}
          <div className="profile-section about-section">
            <div className="section-header">
              <h3 className="section-title">
                <span className="section-icon">📝</span>
                About {profile.username}
              </h3>
            </div>
            <div className="section-content">
              {profile.bio ? (
                <p className="bio-text">{profile.bio}</p>
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">💭</span>
                  <p className="empty-text">
                    {isCurrentUser 
                      ? "Tell others about yourself by adding a bio!" 
                      : `${profile.username} hasn't shared anything about themselves yet.`
                    }
                  </p>
                  {isCurrentUser && (
                    <Link to={`/${username}/edit`} className="add-bio-btn">
                      Add Bio
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Edit Profile Section - Only shown for current user */}
      {isCurrentUser && (
            <div className="profile-section edit-section">
              <div className="section-content">
                <div className="edit-profile-actions">
                  <Link to={`/${username}/edit`} className="edit-profile-btn">
                    <span className="btn-icon">✏️</span>
                    Edit Profile
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile; 