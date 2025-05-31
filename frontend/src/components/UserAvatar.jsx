import React from 'react';
import { Link } from 'react-router-dom';

const defaultAvatar = 'https://ui-avatars.com/api/?name=User&background=8b5cf6&color=fff&size=64';

const getAvatarUrl = (profilePic, username) => {
  if (profilePic && profilePic.startsWith('/uploads/')) {
    // Use the main backend port for local images
    return `http://localhost:8080${profilePic}`;
  }
  if (profilePic) return profilePic;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'User')}&background=8b5cf6&color=fff&size=64`;
};

const UserAvatar = ({ username, profilePic, size = 40, showName = true }) => {
  const avatarUrl = getAvatarUrl(profilePic, username);
  return (
    <Link to={`/${username}/profile`} className="user-avatar-link" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'inherit' }}>
      <img
        src={avatarUrl}
        alt={username || 'User'}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #8b5cf6' }}
      />
      {showName && <span style={{ fontWeight: 500 }}>{username}</span>}
    </Link>
  );
};

export default UserAvatar; 