import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

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
    // Since we're using ProtectedRoute, we know the user is authenticated
    fetchAvailableRooms();
  }, []);

  const fetchAvailableRooms = async () => {
    try {
      setErrorMessage('');
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:8080/rooms', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const rooms = await response.json();
        setAvailableRooms(rooms);
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to fetch rooms');
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setErrorMessage('Network error while fetching rooms');
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
      
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch('http://localhost:8080/rooms/delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ roomId })
      });
      
      if (response.ok) {
        // Room deleted successfully, refresh room list
        setSuccessMessage('Room deleted successfully');
        fetchAvailableRooms();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || 'Failed to delete room');
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      setErrorMessage('Network error while deleting room');
    } finally {
      setIsDeleting(false);
    }
  };

  // Check if user is the creator of a room
  const isRoomCreator = (room) => {
    return room.createdBy === currentUsername;
  };

  return (
    <div className="home">
      <div className="container">
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

        {availableRooms.length > 0 && (
          <div className="available-rooms">
            <h3 className="rooms-title">Available Rooms</h3>
            <div className="refresh-container">
              <button 
                onClick={fetchAvailableRooms} 
                className="refresh-btn"
                title="Refresh room list"
              >
                ↻
              </button>
            </div>
            <ul className="rooms-list">
              {availableRooms.map(room => (
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
                    
                    {isRoomCreator(room) && (
                      <button 
                        onClick={() => deleteRoom(room.id)}
                        className="delete-room-btn"
                        disabled={isDeleting}
                        title="Delete this room"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home; 