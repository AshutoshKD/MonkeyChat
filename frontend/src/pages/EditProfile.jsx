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

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #eee', padding: 32 }}>
      <h2>Edit Profile</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      {showNameChangeWarning && (
        <div style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: 10, marginBottom: 16 }}>
          Changing your name will log you out and you will need to log in again.<br />
          After saving, you will be redirected to the login page.
        </div>
      )}
      {uploading && <div style={{ color: '#8b5cf6', marginBottom: 12 }}>Uploading image...</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label>Name</label>
          <input name="username" value={form.username} onChange={handleChange} required style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Bio</label>
          <textarea name="bio" value={form.bio} onChange={handleChange} rows={3} style={{ width: '100%', padding: 8, marginTop: 4 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Profile Picture</label>
          <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ width: '100%', padding: 8, marginTop: 4 }} />
          {form.profilePic && (
            <img src={form.profilePic} alt="Profile Preview" style={{ width: 80, height: 80, borderRadius: '50%', marginTop: 8, objectFit: 'cover' }} />
          )}
        </div>
        <button type="submit" className="nav-btn" style={{ width: '100%' }} disabled={uploading}>
          {uploading ? "Uploading..." : "Save"}
        </button>
      </form>
    </div>
  );
};

export default EditProfile; 