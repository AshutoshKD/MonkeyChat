import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { apiRequest } from '../utils/api';

const Home = () => {
  const [roomId, setRoomId] = useState('');
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showCameraTest, setShowCameraTest] = useState(false);
  const [testStream, setTestStream] = useState(null);
  const navigate = useNavigate();
  
  // Get the current username from localStorage
  const currentUsername = localStorage.getItem('username');

  useEffect(() => {
    fetchAvailableRooms();
    // Listen for room update events from WebSocket
    const handleRoomUpdate = (event) => {
      const { type } = event.detail;
      if (type === 'room-added' || type === 'room-removed') {
        fetchAvailableRooms();
      }
    };
    window.addEventListener('roomUpdate', handleRoomUpdate);
    return () => {
      window.removeEventListener('roomUpdate', handleRoomUpdate);
    };
  }, []);

  const fetchAvailableRooms = async () => {
    try {
      setErrorMessage('');
      const rooms = await apiRequest('/rooms');
        setAvailableRooms(rooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setErrorMessage(error.message || 'Network error while fetching rooms');
    }
  };

  const createRoom = () => {
    const newRoomId = uuidv4();
    navigate(`/room/${newRoomId}`);
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (roomId) {
      navigate(`/room/${roomId}`);
    }
  };

  const joinExistingRoom = (roomId) => {
    navigate(`/room/${roomId}`);
  };
  
  const deleteRoom = async (roomId) => {
    try {
      setIsDeleting(true);
      setErrorMessage('');
      setSuccessMessage('');
      
      await apiRequest('/rooms/delete', {
        method: 'POST',
        body: JSON.stringify({ roomId })
      });
      
        // Room deleted successfully, refresh room list
        setSuccessMessage('Room deleted successfully');
        fetchAvailableRooms();
    } catch (error) {
      setErrorMessage(error.message || 'Failed to delete room');
    } finally {
      setIsDeleting(false);
    }
  };

  // Split rooms into 'yourRooms' and 'otherRooms'
  const yourRooms = availableRooms.filter(room => room.createdBy === currentUsername);
  const otherRooms = availableRooms.filter(room => room.createdBy !== currentUsername);

  // Camera test functions
  const testCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setTestStream(stream);
      setShowCameraTest(true);
      setErrorMessage('');
      setSuccessMessage('Camera test successful! You can now join video calls.');
    } catch (error) {
      setErrorMessage(`Camera test failed: ${error.message}. Please check your camera permissions.`);
    }
  };

  const stopCameraTest = () => {
    if (testStream) {
      testStream.getTracks().forEach(track => track.stop());
      setTestStream(null);
    }
    setShowCameraTest(false);
  };

  // Camera test modal
  const CameraTestModal = () => (
    showCameraTest && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          maxWidth: '500px',
          textAlign: 'center'
        }}>
          <h3>Camera Test</h3>
          <div style={{
            width: '400px',
            height: '300px',
            backgroundColor: '#000',
            borderRadius: '8px',
            marginBottom: '1rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <video
              autoPlay
              playsInline
              muted
              ref={(video) => {
                if (video && testStream) {
                  video.srcObject = testStream;
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>
          <p>Can you see yourself in the video above?</p>
          <button 
            onClick={stopCameraTest}
            style={{
              padding: '10px 20px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Close Test
          </button>
        </div>
      </div>
    )
  );

  return (
    <div className="home dashboard-layout">
      <CameraTestModal />
      <div className="container left-panel">
        <h2>Welcome to MonkeyChat</h2>
        <p>Create a new chat room or join an existing one</p>
        
        {errorMessage && (
          <div className="error-message">{errorMessage}</div>
        )}
        
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}
        
        <button 
          onClick={testCamera}
          style={{
            backgroundColor: '#10b981',
            marginBottom: '1rem',
            width: '100%'
          }}
        >
          🎥 Test Camera & Microphone
        </button>
        
        <button onClick={createRoom} className="create-room-btn">
          Create a New Room
        </button>
        
        <div className="divider">OR</div>
        
        <form onSubmit={joinRoom} className="join-form">
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            required
          />
          <button type="submit">Join Room</button>
        </form>
      </div>
      <div className="dashboard-right">
        <div className="dashboard-cards">
          <div className="dashboard-card available-rooms-card">
            <div className="dashboard-card-header">
              <h3 className="rooms-title">Available Rooms</h3>
              <button 
                onClick={fetchAvailableRooms} 
                className="refresh-btn"
                title="Refresh room list"
              >↻</button>
            </div>
            <ul className="rooms-list scrollable-list">
              {otherRooms.length === 0 && (
                <li className="no-rooms">No other rooms available yet.</li>
              )}
              {otherRooms.map(room => (
                <li key={room.id} className="room-item">
                  <div className="room-info">
                    <span className="room-id">{room.id}</span>
                    <span className="room-creator">Created by: {room.createdBy}</span>
                  </div>
                  <div className="room-actions">
                    <button 
                      onClick={() => joinExistingRoom(room.id)}
                      className="join-room-btn"
                    >
                      Join
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="dashboard-card your-rooms-card">
            <div className="dashboard-card-header">
              <h3 className="rooms-title">Your Rooms</h3>
            </div>
            <ul className="rooms-list scrollable-list">
              {yourRooms.length === 0 && (
                <li className="no-rooms">You haven't created any rooms yet.</li>
              )}
              {yourRooms.map(room => (
                <li key={room.id} className="room-item">
                  <div className="room-info">
                    <span className="room-id">{room.id}</span>
                    <span className="room-creator">Created by: {room.createdBy}</span>
                  </div>
                  <div className="room-actions">
                    <button 
                      onClick={() => joinExistingRoom(room.id)}
                      className="join-room-btn"
                    >
                      Join
                    </button>
                    <button 
                      onClick={() => deleteRoom(room.id)}
                      className="delete-room-btn"
                      disabled={isDeleting}
                      title="Delete this room"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 