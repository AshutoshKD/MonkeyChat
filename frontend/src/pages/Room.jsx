import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getWebSocketUrl } from '../utils/api';

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
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 3;
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const webSocketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  
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

  const connectWebSocket = () => {
    const wsUrl = getWebSocketUrl();
    
    try {
      webSocketRef.current = new WebSocket(wsUrl);
      
      webSocketRef.current.onopen = () => {
        // Clear any connection error when WebSocket connects
        setErrorMessage('');
        setReconnectAttempts(0); // Reset reconnect attempts on successful connection
        
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
                    setPeerName(data.userName);
                    
                    // If we already have a remote stream, update the connection status
                    if (remoteStream) {
                      setConnectionStatus(`Connected to ${data.userName}`);
                    }
                  }
                }
              } catch (err) {
                setErrorMessage('Error processing user join message');
              }
            }
            break;
            
          case 'user-left':
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
        setConnectionStatus('Server disconnected');
        if (isConnected) {
          setErrorMessage('Connection to server lost. Attempting to reconnect...');
          
          // Clean up the peer connection
          if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            setRemoteStream(null);
          }
          
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }

          // Attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttempts < maxReconnectAttempts) {
            const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000); // Exponential backoff with max 10s
            reconnectTimeoutRef.current = setTimeout(() => {
              setReconnectAttempts(prev => prev + 1);
              connectWebSocket();
            }, timeout);
          } else {
            setErrorMessage('Failed to reconnect after multiple attempts. Please refresh the page.');
          }
        }
      };
      
      webSocketRef.current.onerror = (error) => {
        setConnectionStatus('Connection error');
        setErrorMessage('Failed to connect to signaling server. Please check if the backend is running.');
      };
    } catch (error) {
      setConnectionStatus('Connection error');
      setErrorMessage('Failed to create WebSocket connection: ' + error.message);
    }
  };

  useEffect(() => {
    connectWebSocket();
    
    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
    };
  }, [roomId, userName]);

  // Effect to update video elements when streams change
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // We have a remote stream, so we're fully connected to a peer
      setConnectionStatus(peerName ? `Connected to ${peerName}` : 'Connected to peer');
      setErrorMessage('');
    }
  }, [localStream, remoteStream, peerName]);

  const initLocalVideo = async () => {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'getUserMedia is not supported in this browser';
        setErrorMessage(errorMsg);
        setConnectionStatus('Failed to access camera');
        return;
      }

      // Request permission explicitly
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      // Verify that we actually got video tracks
      if (stream.getVideoTracks().length === 0) {
        setErrorMessage('No video tracks found in media stream');
      }

      // Ensure all tracks start in the enabled state
      stream.getTracks().forEach(track => {
        track.enabled = true;
      });
      
      // Reset UI state
      setIsAudioMuted(false);
      setIsVideoOff(false);
      
      setLocalStream(stream);
      
      // Initialize WebRTC peer connection
      createPeerConnection();
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
      
    } catch (error) {
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
    try {
      // Create RTCPeerConnection
      peerConnectionRef.current = new RTCPeerConnection(iceServers);
      
      // Set up event handlers
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
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
        // Make sure we use the same stream if multiple tracks are received
        setRemoteStream(event.streams[0]);
        
        // When we get a remote track, we know the peer is connected
        setConnectionStatus('Connected to peer');
        
        // If we don't have a peer name yet, we should show a generic name
        // rather than "Waiting for peer..." since we're clearly connected
        if (!peerName) {
          setPeerName('Peer');
        }
      };
      
      peerConnectionRef.current.onnegotiationneeded = async () => {
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
          
          sendMessage({
            event: 'offer',
            roomId: roomId,
            payload: JSON.stringify(offerWithName),
          });
        } catch (error) {
          setErrorMessage('Error creating offer: ' + error.message);
        }
      };
      
      peerConnectionRef.current.oniceconnectionstatechange = () => {
        const state = peerConnectionRef.current.iceConnectionState;
        
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          handlePeerDisconnect();
        } else if (state === 'connected') {
          setConnectionStatus('Connected to peer');
          // Clear error message when ICE connection is established
          setErrorMessage('');
        }
      };
    } catch (error) {
      setErrorMessage(`Failed to create peer connection: ${error.message}`);
    }
  };
  
  const handleOffer = async (offerData) => {
    try {
      // Extract the SDP and userName
      const { sdp, userName: peerUserName } = offerData;
      
      // Update peer name if it was included in the offer
      if (peerUserName && peerUserName !== userName) {
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
      
      sendMessage({
        event: 'answer',
        roomId: roomId,
        payload: JSON.stringify(answerWithName),
      });
    } catch (error) {
      setErrorMessage('Error handling offer: ' + error.message);
    }
  };
  
  const handleAnswer = async (answerData) => {
    try {
      // Extract the SDP and userName
      const { sdp, userName: peerUserName } = answerData;
      
      // Update peer name if it was included in the answer
      if (peerUserName && peerUserName !== userName) {
        setPeerName(peerUserName);
      }
      
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (error) {
      setErrorMessage('Error handling answer: ' + error.message);
    }
  };
  
  const handleIceCandidate = async (candidateData) => {
    try {
      // Extract the candidate and userName
      const { candidate, userName: peerUserName } = candidateData;
      
      // Update peer name if it was included in the candidate and we don't have one yet
      if (peerUserName && peerUserName !== userName && (!peerName || peerName === 'Peer')) {
        setPeerName(peerUserName);
      }
      
      if (candidate && peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      setErrorMessage('Error adding ice candidate: ' + error.message);
    }
  };
  
  const sendMessage = (message) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify(message));
    }
  };
  
  const leaveRoom = () => {
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
        });
        
        // Update UI state
        setIsAudioMuted(!newEnabledState);
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
        });
        
        // Update UI state
        setIsVideoOff(!newEnabledState);
      }
    }
  };

  // Add a new function to send a name refresh request
  const requestPeerNameRefresh = () => {
    // Resend our name to trigger a reciprocal response
    sendMessage({
      event: 'join',
      roomId: roomId,
      payload: JSON.stringify({ userName: userName })
    });
  };

  // Add this function to handle peer disconnection properly
  const handlePeerDisconnect = () => {
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
        <div>
          <h2>Room: {roomId}</h2>
          <div className="connection-status">{connectionStatus}</div>
          {errorMessage && <div className="error-message">{errorMessage}</div>}
        </div>
        <div className="room-actions">
          <button onClick={copyRoomId}>Copy Room ID</button>
          <button onClick={leaveRoom}>Leave Room</button>
        </div>
      </div>
      
      <div className="video-container">
        <div className="video-wrapper">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="local-video"
          />
          <div className="media-controls">
            <button
              className="media-btn"
              onClick={toggleAudio}
              title={isAudioMuted ? "Unmute" : "Mute"}
            >
              {isAudioMuted ? "🔇" : "🔊"}
            </button>
            <button
              className="media-btn"
              onClick={toggleVideo}
              title={isVideoOff ? "Turn on video" : "Turn off video"}
            >
              {isVideoOff ? "📹" : "🎥"}
            </button>
          </div>
        </div>
        
        <div className="video-wrapper">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="remote-video"
          />
        </div>
      </div>
    </div>
  );
};

export default Room; 