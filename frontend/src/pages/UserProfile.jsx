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

  if (loading) return <div>Loading profile...</div>;
  if (!profile) return <div>Profile not found.</div>;

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #eee', padding: 32, textAlign: 'center' }}>
      <UserAvatar username={profile.username} profilePic={profile.profilePic} size={80} showName={true} />
      <h2 style={{ margin: '1rem 0 0.5rem 0' }}>{profile.username}</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{profile.bio || 'No bio yet.'}</p>
      {isCurrentUser && (
        <Link to={`/${username}/edit`} className="nav-btn" style={{ marginTop: 16, display: 'inline-block' }}>Edit Profile</Link>
      )}
    </div>
  );
};

export default UserProfile; 