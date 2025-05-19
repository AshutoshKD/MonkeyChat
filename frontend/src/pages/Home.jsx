import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const Home = () => {
  const [roomId, setRoomId] = useState('');
  const [availableRooms, setAvailableRooms] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Since we're using ProtectedRoute, we know the user is authenticated
    fetchAvailableRooms();
  }, []);

  const fetchAvailableRooms = async () => {
    try {
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
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
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

  return (
    <div className="home">
      <div className="container">
        <h2>Welcome to MonkeyChat</h2>
        <p>Create a new room or join an existing one</p>
        
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
            <ul className="rooms-list">
              {availableRooms.map(room => (
                <li key={room.id} className="room-item">
                  <div className="room-info">
                    <span className="room-id">{room.id}</span>
                    <span className="room-creator">Created by: {room.createdBy}</span>
                  </div>
                  <button 
                    onClick={() => joinExistingRoom(room.id)}
                    className="join-room-btn"
                  >
                    Join
                  </button>
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