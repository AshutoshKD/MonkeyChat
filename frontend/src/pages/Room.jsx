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
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  
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
      // Ensure video plays
      localVideoRef.current.play().catch(error => {
        console.warn('Auto-play failed for local video:', error);
      });
    }
    
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // Ensure video plays
      remoteVideoRef.current.play().catch(error => {
        console.warn('Auto-play failed for remote video:', error);
      });
      // We have a remote stream, so we're fully connected to a peer
      setConnectionStatus(peerName ? `Connected to ${peerName}` : 'Connected to peer');
      setErrorMessage('');
    }
  }, [localStream, remoteStream, peerName]);

  const initLocalVideo = async () => {
    try {
      // Clear any previous error messages
      setErrorMessage('');
      setConnectionStatus('Requesting camera access...');

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const errorMsg = 'getUserMedia is not supported in this browser. Please use Chrome, Firefox, or Edge.';
        setErrorMessage(errorMsg);
        setConnectionStatus('Browser not supported');
        return;
      }

      // Check if we're on HTTPS (required in production)
      if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        setErrorMessage('Video chat requires HTTPS in production. Please use HTTPS or test locally.');
        setConnectionStatus('HTTPS required');
        return;
      }

      // Try different media constraints in order of preference
      const constraints = [
        // First try: Full video and audio
        { video: true, audio: true },
        // Fallback: Video only
        { video: true, audio: false },
        // Last resort: Low quality video
        { 
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            frameRate: { ideal: 15 } 
          }, 
          audio: true 
        }
      ];

      let stream = null;
      let lastError = null;

      for (const constraint of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          break; // Success, exit the loop
        } catch (error) {
          lastError = error;
          continue; // Try next constraint
        }
      }

      if (!stream) {
        throw lastError || new Error('Could not access media devices with any constraints');
      }
      
      // Verify that we actually got video tracks
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      if (videoTracks.length === 0) {
        setErrorMessage('No video tracks found in media stream. Please check your camera.');
        setConnectionStatus('No video available');
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      // Ensure all tracks start in the enabled state
      stream.getTracks().forEach(track => {
        track.enabled = true;
      });
      
      // Reset UI state
      setIsAudioMuted(false);
      setIsVideoOff(false);
      
      setLocalStream(stream);
      setConnectionStatus('Camera access granted');
      
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
        setErrorMessage(`Camera/microphone access denied. Please:
        1. Click the camera icon in your browser's address bar
        2. Allow camera and microphone access
        3. Refresh the page`);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setErrorMessage('No camera or microphone found. Please connect a device and refresh the page.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setErrorMessage('Camera is already in use by another application. Please close other apps using the camera and try again.');
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        setErrorMessage('Camera does not support the required video settings. Please try with a different camera.');
      } else if (error.name === 'AbortError') {
        setErrorMessage('Camera access was aborted. Please try again.');
      } else if (error.name === 'NotSupportedError') {
        setErrorMessage('Camera access is not supported in this browser. Please use Chrome, Firefox, or Edge.');
      } else {
        setErrorMessage(`Error accessing media devices: ${error.message}. Please check browser permissions and try again.`);
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
    
    navigate('/chat');
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

  // Add retry function
  const retryVideoAccess = () => {
    // Stop existing stream if any
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    // Retry initialization
    initLocalVideo();
  };

  // Troubleshooting modal component
  const TroubleshootingModal = () => (
    showTroubleshooting && (
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
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          margin: '1rem'
        }}>
          <h3>Video Chat Troubleshooting</h3>
          
          <h4>🎥 Camera Not Working?</h4>
          <ol>
            <li>Check if your camera is connected and working</li>
            <li>Close other applications that might be using your camera (Zoom, Teams, etc.)</li>
            <li>In your browser, click the camera icon in the address bar and allow access</li>
            <li>Try refreshing the page</li>
            <li>Check if your browser supports video chat (Chrome, Firefox, Edge recommended)</li>
          </ol>

          <h4>🔊 Audio Issues?</h4>
          <ol>
            <li>Check if your microphone is connected</li>
            <li>Make sure microphone isn't muted in your system settings</li>
            <li>Allow microphone access in your browser</li>
            <li>Try using headphones to prevent echo</li>
          </ol>

          <h4>🌐 Connection Problems?</h4>
          <ol>
            <li>Check your internet connection</li>
            <li>Try using a different network (mobile hotspot)</li>
            <li>Make sure the backend server is running</li>
            <li>For HTTPS sites, ensure SSL certificate is valid</li>
          </ol>

          <h4>🖥️ Browser Issues?</h4>
          <ul>
            <li><strong>Chrome:</strong> Best support for WebRTC</li>
            <li><strong>Firefox:</strong> Good alternative</li>
            <li><strong>Safari:</strong> Limited support, use Chrome instead</li>
            <li><strong>Edge:</strong> Good support</li>
          </ul>

          <p><strong>Still having issues?</strong> Try opening developer tools (F12) and check the console for error messages.</p>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button 
              onClick={() => setShowTroubleshooting(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Close
            </button>
            <button 
              onClick={() => {
                setShowTroubleshooting(false);
                retryVideoAccess();
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  );

  return (
    <div className="room">
      <TroubleshootingModal />
      <div className="room-header">
        <div>
          <h2>Room: {roomId}</h2>
          <div className="connection-status">{connectionStatus}</div>
          {errorMessage && (
            <div className="error-message">
              {errorMessage}
              {(errorMessage.includes('Camera/microphone access denied') || 
                errorMessage.includes('Error accessing media devices') ||
                errorMessage.includes('No camera found') ||
                errorMessage.includes('Camera is already in use')) && (
                <button 
                  onClick={retryVideoAccess}
                  style={{
                    marginLeft: '10px',
                    padding: '5px 10px',
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Retry Video Access
                </button>
              )}
            </div>
          )}
        </div>
        <div className="room-actions">
          <button onClick={copyRoomId}>Copy Room ID</button>
          <button 
            onClick={() => setShowTroubleshooting(true)}
            style={{ backgroundColor: '#f59e0b' }}
          >
            Troubleshoot
          </button>
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
          {!localStream && (
            <div className="video-off-indicator">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📹</div>
                <div>Your video will appear here</div>
                <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', opacity: 0.8 }}>
                  Allow camera access when prompted
                </div>
              </div>
            </div>
          )}
          {localStream && (
            <div className="video-label">You ({userName})</div>
          )}
          <div className="media-controls">
            <button
              className={`media-btn ${isAudioMuted ? 'off' : ''}`}
              onClick={toggleAudio}
              title={isAudioMuted ? "Unmute" : "Mute"}
              disabled={!localStream}
            >
              {isAudioMuted ? "🔇" : "🔊"}
            </button>
            <button
              className={`media-btn ${isVideoOff ? 'off' : ''}`}
              onClick={toggleVideo}
              title={isVideoOff ? "Turn on video" : "Turn off video"}
              disabled={!localStream}
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
          {!remoteStream && (
            <div className="waiting-message">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                <div>Waiting for {peerName || 'peer'} to join...</div>
                <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', opacity: 0.8 }}>
                  Share the room ID: <strong>{roomId}</strong>
                </div>
              </div>
            </div>
          )}
          {remoteStream && peerName && (
            <div className="video-label">{peerName}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Room; 