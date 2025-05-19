import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const Home = () => {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [nameError, setNameError] = useState('');
  const navigate = useNavigate();

  const validateName = () => {
    if (!userName.trim()) {
      setNameError('Please enter your name');
      return false;
    }
    setNameError('');
    return true;
  };

  const createRoom = () => {
    if (!validateName()) return;
    
    const newRoomId = uuidv4();
    navigate(`/room/${newRoomId}`, { state: { userName } });
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (!validateName()) return;
    
    if (roomId) {
      navigate(`/room/${roomId}`, { state: { userName } });
    }
  };

  return (
    <div className="home">
      <div className="container">
        <h2>Welcome to MonkeyChat</h2>
        <p>Create a new room or join an existing one</p>
        
        <div className="name-input-container">
          <input
            type="text"
            placeholder="Enter Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            required
            className={nameError ? 'error' : ''}
          />
          {nameError && <div className="error-message">{nameError}</div>}
        </div>
        
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
    </div>
  );
};

export default Home; 