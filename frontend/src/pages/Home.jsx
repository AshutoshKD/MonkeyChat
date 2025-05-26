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

  return (
    <div className="home dashboard-layout">
      <div className="container left-panel">
        <h2>Welcome to MonkeyChat</h2>
        <p>Create a new room or join an existing one</p>
        
        {errorMessage && (
          <div className="error-message">{errorMessage}</div>
        )}
        
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}
        
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