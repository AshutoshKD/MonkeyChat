import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { BASE_URL } from '../config';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get userName from localStorage (authenticated) or location state as fallback
  const userName = localStorage.getItem('username') || location.state?.userName || 'Anonymous';
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [errorMessage, setErrorMessage] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [peerName, setPeerName] = useState('');
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const webSocketRef = useRef(null);
  
  // Configuration for STUN/TURN servers
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Check for authentication
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    
    // This is a backup check since we're already using ProtectedRoute
    if (!token || !storedUsername) {
      navigate('/login');
    }
  }, [navigate]);

  // Logger function to help with debugging
  const logEvent = (type, message, data) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type,
      message,
      data,
      roomId,
      userName
    };
    console.log(`[${timestamp}] [${type}] ${message}`, data || '');
    
    // Store logs - avoid using localStorage and save to file later
    const logFileName = `monkeychat_${roomId}.logs`;
    try {
      // Create log content as string
      const logContent = JSON.stringify(logEntry) + '\n';
      
      // In a browser environment, we can't write directly to a file system
      // So we'll just add to an array in localStorage that can be downloaded later
      const logs = JSON.parse(localStorage.getItem('monkeyChatLogsData') || '[]');
      logs.push(logEntry);
      localStorage.setItem('monkeyChatLogsData', JSON.stringify(logs));
    } catch (error) {
      console.error('Error logging:', error);
    }
  };

  useEffect(() => {
    // Connect to WebSocket server
    const token = localStorage.getItem('token');
    const wsUrl = token 
      ? `${BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')}/ws?token=${token}` 
      : `${BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`;
      
    logEvent('INFO', 'Connecting to WebSocket server', { wsUrl });
    
    try {
      webSocketRef.current = new WebSocket(wsUrl);
      
      webSocketRef.current.onopen = () => {
        logEvent('INFO', 'WebSocket connected successfully');
        // Clear any connection error when WebSocket connects
        setErrorMessage('');
        
        // Join the room with userName
        sendMessage({
          event: 'join',
          roomId: roomId,
          payload: JSON.stringify({ userName: userName })
        });
        
        // Initialize local video
        initLocalVideo();
      };
      
      webSocketRef.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        logEvent('INFO', 'Received WebSocket message', { event: message.event, payload: message.payload });
        
        switch (message.event) {
          case 'joined':
            setConnectionStatus('Connected to room: ' + roomId);
            // Clear error message when successfully joined
            setErrorMessage('');
            setIsConnected(true);
            break;
            
          case 'user-joined':
            if (message.payload) {
              try {
                const data = JSON.parse(message.payload);
                if (data.userName) {
                  // Ensure we don't set our own name as the peer name
                  if (data.userName !== userName) {
                    logEvent('INFO', 'Setting peer name from user-joined event', { 
                      peerName: data.userName,
                      currentPeerName: peerName,
                      myUserName: userName
                    });
                    
                    setPeerName(data.userName);
                    
                    // If we already have a remote stream, update the connection status
                    if (remoteStream) {
                      setConnectionStatus(`Connected to ${data.userName}`);
                    }
                  } else {
                    logEvent('INFO', 'Ignored own username from user-joined event');
                  }
                }
              } catch (err) {
                logEvent('ERROR', 'Error parsing user-joined payload', { error: err.message, payload: message.payload });
              }
            }
            break;
            
          case 'user-left':
            logEvent('INFO', 'Peer left the room');
            handlePeerDisconnect();
            break;
            
          case 'offer':
            handleOffer(JSON.parse(message.payload));
            break;
            
          case 'answer':
            handleAnswer(JSON.parse(message.payload));
            break;
            
          case 'ice-candidate':
            handleIceCandidate(JSON.parse(message.payload));
            break;
        }
      };
      
      webSocketRef.current.onclose = () => {
        logEvent('WARN', 'WebSocket disconnected');
        setConnectionStatus('Server disconnected');
        if (isConnected) {
          setErrorMessage('Connection to server lost. Please refresh the page to reconnect.');
          
          // Clean up the peer connection
          if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            setRemoteStream(null);
          }
          
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }
        }
      };
      
      webSocketRef.current.onerror = (error) => {
        logEvent('ERROR', 'WebSocket error', error);
        setConnectionStatus('Connection error');
        setErrorMessage('Failed to connect to signaling server. Please check if the backend is running.');
      };
    } catch (error) {
      logEvent('ERROR', 'Failed to create WebSocket connection', error);
      setConnectionStatus('Connection error');
      setErrorMessage('Failed to create WebSocket connection: ' + error.message);
    }
    
    // Cleanup function
    return () => {
      if (localStream) {
        logEvent('INFO', 'Stopping local media tracks');
        localStream.getTracks().forEach(track => track.stop());
      }
      
      if (peerConnectionRef.current) {
        logEvent('INFO', 'Closing peer connection');
        peerConnectionRef.current.close();
      }
      
      if (webSocketRef.current) {
        logEvent('INFO', 'Closing WebSocket connection');
        webSocketRef.current.close();
      }
    };
  }, [roomId, userName]);

  // Effect to update video elements when streams change
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      logEvent('INFO', 'Setting local video stream');
      localVideoRef.current.srcObject = localStream;
    }
    
    if (remoteVideoRef.current && remoteStream) {
      logEvent('INFO', 'Setting remote video stream');
      remoteVideoRef.current.srcObject = remoteStream;
      // We have a remote stream, so we're fully connected to a peer
      setConnectionStatus(peerName ? `Connected to ${peerName}` : 'Connected to peer');
      setErrorMessage('');
    }
  }, [localStream, remoteStream, peerName]);

  const initLocalVideo = async () => {
    logEvent('INFO', 'Initializing local video');
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'getUserMedia is not supported in this browser';
        logEvent('ERROR', errorMsg);
        setErrorMessage(errorMsg);
        setConnectionStatus('Failed to access camera');
        return;
      }

      // Request permission explicitly
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      logEvent('INFO', 'Camera and microphone access granted', { 
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });
      
      // Verify that we actually got video tracks
      if (stream.getVideoTracks().length === 0) {
        logEvent('WARN', 'No video tracks found in media stream');
      }

      // Ensure all tracks start in the enabled state
      stream.getTracks().forEach(track => {
        track.enabled = true;
        logEvent('INFO', `Initial track enabled state: ${track.enabled}`, 
          { kind: track.kind, id: track.id });
      });
      
      // Reset UI state
      setIsAudioMuted(false);
      setIsVideoOff(false);
      
      setLocalStream(stream);
      
      // Initialize WebRTC peer connection
      createPeerConnection();
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        logEvent('INFO', 'Adding track to peer connection', { kind: track.kind });
        peerConnectionRef.current.addTrack(track, stream);
      });
      
    } catch (error) {
      logEvent('ERROR', 'Error accessing media devices', { error: error.message, name: error.name });
      setConnectionStatus('Failed to access camera/microphone');
      
      // Provide more specific error messages based on error type
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setErrorMessage('Camera/microphone access denied. Please allow camera and microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera or microphone found. Please connect a device and try again.');
      } else {
        setErrorMessage(`Error accessing media devices: ${error.message}`);
      }
    }
  };
  
  const createPeerConnection = () => {
    logEvent('INFO', 'Creating RTCPeerConnection');
    try {
      // Create RTCPeerConnection
      peerConnectionRef.current = new RTCPeerConnection(iceServers);
      
      // Set up event handlers
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          logEvent('INFO', 'Generated ICE candidate', { candidate: event.candidate.candidate });
          
          // Include username with ICE candidate
          const candidateWithName = {
            candidate: event.candidate,
            userName: userName
          };
          
          sendMessage({
            event: 'ice-candidate',
            roomId: roomId,
            payload: JSON.stringify(candidateWithName),
          });
        }
      };
      
      peerConnectionRef.current.ontrack = (event) => {
        logEvent('INFO', 'Received remote track', { kind: event.track.kind });
        // Make sure we use the same stream if multiple tracks are received
        setRemoteStream(event.streams[0]);
        
        // When we get a remote track, we know the peer is connected
        setConnectionStatus('Connected to peer');
        
        // If we don't have a peer name yet, we should show a generic name
        // rather than "Waiting for peer..." since we're clearly connected
        if (!peerName) {
          setPeerName('Peer');
          logEvent('INFO', 'Setting generic peer name since actual name not received yet');
        }
      };
      
      peerConnectionRef.current.onnegotiationneeded = async () => {
        logEvent('INFO', 'Negotiation needed, creating offer');
        try {
          // Create and send offer
          const offer = await peerConnectionRef.current.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerConnectionRef.current.setLocalDescription(offer);
          
          // Include user name with the offer
          const offerWithName = {
            sdp: peerConnectionRef.current.localDescription,
            userName: userName
          };
          
          logEvent('INFO', 'Sending offer', { type: offer.type });
          sendMessage({
            event: 'offer',
            roomId: roomId,
            payload: JSON.stringify(offerWithName),
          });
        } catch (error) {
          logEvent('ERROR', 'Error creating offer', { error: error.message });
        }
      };
      
      peerConnectionRef.current.oniceconnectionstatechange = () => {
        const state = peerConnectionRef.current.iceConnectionState;
        logEvent('INFO', 'ICE connection state changed', { state });
        
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          handlePeerDisconnect();
        } else if (state === 'connected') {
          setConnectionStatus('Connected to peer');
          // Clear error message when ICE connection is established
          setErrorMessage('');
        }
      };
    } catch (error) {
      logEvent('ERROR', 'Error creating peer connection', { error: error.message });
      setErrorMessage(`Failed to create peer connection: ${error.message}`);
    }
  };
  
  const handleOffer = async (offerData) => {
    logEvent('INFO', 'Received offer, creating answer', { offerData });
    try {
      // Extract the SDP and userName
      const { sdp, userName: peerUserName } = offerData;
      
      // Update peer name if it was included in the offer
      if (peerUserName && peerUserName !== userName) {
        logEvent('INFO', 'Setting peer name from offer', { 
          peerName: peerUserName,
          currentPeerName: peerName,
          myUserName: userName
        });
        setPeerName(peerUserName);
      }
      
      // Set remote description based on received offer
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      
      // Create and send answer
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      
      // Include user name with the answer
      const answerWithName = {
        sdp: peerConnectionRef.current.localDescription,
        userName: userName
      };
      
      logEvent('INFO', 'Sending answer', { type: answer.type, myUserName: userName });
      sendMessage({
        event: 'answer',
        roomId: roomId,
        payload: JSON.stringify(answerWithName),
      });
    } catch (error) {
      logEvent('ERROR', 'Error handling offer', { error: error.message });
    }
  };
  
  const handleAnswer = async (answerData) => {
    logEvent('INFO', 'Received answer', { answerData });
    try {
      // Extract the SDP and userName
      const { sdp, userName: peerUserName } = answerData;
      
      // Update peer name if it was included in the answer
      if (peerUserName && peerUserName !== userName) {
        logEvent('INFO', 'Setting peer name from answer', { 
          peerName: peerUserName,
          currentPeerName: peerName,
          myUserName: userName
        });
        setPeerName(peerUserName);
      }
      
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (error) {
      logEvent('ERROR', 'Error handling answer', { error: error.message });
    }
  };
  
  const handleIceCandidate = async (candidateData) => {
    logEvent('INFO', 'Received ICE candidate', { candidateData });
    try {
      // Extract the candidate and userName
      const { candidate, userName: peerUserName } = candidateData;
      
      // Update peer name if it was included in the candidate and we don't have one yet
      if (peerUserName && peerUserName !== userName && (!peerName || peerName === 'Peer')) {
        logEvent('INFO', 'Setting peer name from ICE candidate', { 
          peerName: peerUserName,
          currentPeerName: peerName,
          myUserName: userName
        });
        setPeerName(peerUserName);
      }
      
      if (candidate && peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      logEvent('ERROR', 'Error adding ice candidate', { error: error.message });
    }
  };
  
  const sendMessage = (message) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      logEvent('INFO', 'Sending WebSocket message', { event: message.event });
      webSocketRef.current.send(JSON.stringify(message));
    } else {
      logEvent('ERROR', 'Cannot send message, WebSocket not open');
    }
  };
  
  const leaveRoom = () => {
    logEvent('INFO', 'Leaving room');
    
    // Notify server that user is leaving
    sendMessage({
      event: 'leave',
      roomId: roomId,
      payload: JSON.stringify({ userName: userName })
    });
    
    // Clean up resources
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    if (webSocketRef.current) {
      webSocketRef.current.close();
    }
    
    navigate('/home');
  };
  
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    logEvent('INFO', 'Room ID copied to clipboard');
    alert('Room ID copied to clipboard!');
  };

  // Media control functions
  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        // Get current state (before toggling)
        const isCurrentlyEnabled = audioTracks[0].enabled;
        
        // Toggle to opposite state
        const newEnabledState = !isCurrentlyEnabled;
        
        // Apply to all audio tracks
        audioTracks.forEach(track => {
          track.enabled = newEnabledState;
          logEvent('INFO', `Setting audio track enabled to: ${newEnabledState}`, { trackId: track.id });
        });
        
        // Update UI state
        setIsAudioMuted(!newEnabledState);
        logEvent('INFO', newEnabledState ? 'Audio unmuted' : 'Audio muted');
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        // Get current state (before toggling)
        const isCurrentlyEnabled = videoTracks[0].enabled;
        
        // Toggle to opposite state
        const newEnabledState = !isCurrentlyEnabled;
        
        // Apply to all video tracks
        videoTracks.forEach(track => {
          track.enabled = newEnabledState;
          logEvent('INFO', `Setting video track enabled to: ${newEnabledState}`, { trackId: track.id });
        });
        
        // Update UI state
        setIsVideoOff(!newEnabledState);
        logEvent('INFO', newEnabledState ? 'Video turned on' : 'Video turned off');
      }
    }
  };

  // Add a new function to send a name refresh request
  const requestPeerNameRefresh = () => {
    logEvent('INFO', 'Manually requesting peer name refresh');
    // Resend our name to trigger a reciprocal response
    sendMessage({
      event: 'join',
      roomId: roomId,
      payload: JSON.stringify({ userName: userName })
    });
  };

  // Add this function to handle peer disconnection properly
  const handlePeerDisconnect = () => {
    logEvent('INFO', 'Peer disconnected, cleaning up resources');
    
    // Stop displaying the remote stream
    if (remoteStream) {
      // Stop all tracks
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
    
    // Reset state related to peer
    setPeerName('');
    setConnectionStatus('Peer disconnected. Waiting for new connection...');
    
    // Close and recreate peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      createPeerConnection();
    }
  };

  return (
    <div className="room">
      <div className="room-header">
        <h2>Room: {roomId}</h2>
        <div className="room-actions">
          <button onClick={copyRoomId}>Copy Room ID</button>
          <button onClick={leaveRoom}>Leave Room</button>
          {remoteStream && !peerName && (
            <button onClick={requestPeerNameRefresh} className="refresh-btn">
              Refresh Peer Name
            </button>
          )}
        </div>
        <div className="connection-status">Status: {connectionStatus}</div>
        {errorMessage && <div className="error-message">{errorMessage}</div>}
      </div>
      
      <div className="video-container">
        <div className="video-wrapper local-video">
          <video ref={localVideoRef} autoPlay muted playsInline></video>
          <div className="video-label">{userName} (You)</div>
          {isVideoOff && <div className="video-off-indicator">Video Off</div>}
          <div className="media-controls">
            <button 
              onClick={toggleAudio} 
              className={`media-btn ${isAudioMuted ? 'off' : ''}`}
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? '🔇' : '🔊'}
            </button>
            <button 
              onClick={toggleVideo} 
              className={`media-btn ${isVideoOff ? 'off' : ''}`}
              title={isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
            >
              {isVideoOff ? '🚫' : '📹'}
            </button>
          </div>
        </div>
        
        <div className="video-wrapper remote-video">
          <video ref={remoteVideoRef} autoPlay playsInline></video>
          <div className="video-label">
            {remoteStream 
              ? (peerName && peerName !== 'Peer' ? peerName : userName) 
              : 'Waiting for peer...'}
          </div>
          {!remoteStream && <div className="waiting-message">Waiting for peer to join...</div>}
        </div>
      </div>
    </div>
  );
};

export default Room; 