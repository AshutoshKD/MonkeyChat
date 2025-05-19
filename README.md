# MonkeyChat

A simple 2-person live video chat application built with Go (backend) and Vite.js/React (frontend).

## Features

- Create or join a video chat room
- Real-time video and audio communication
- WebRTC for peer-to-peer connection
- Simple and intuitive interface

## Prerequisites

- Go (1.16+)
- Node.js (14+)
- npm (6+)

## Project Structure

```
MonkeyChat/
├── backend/        # Go backend with WebSocket signaling server
├── frontend/       # Vite.js/React frontend
```

## Running the Application

### Backend

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Run the Go server:
   ```
   go run main.go
   ```
   The server will start on port 8080 by default.

### Frontend

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```
   The frontend will be available at http://localhost:5173

## How to Use

1. Open the application in your browser
2. On the home page, choose "Create a New Room" or enter an existing Room ID
3. Allow camera and microphone access when prompted
4. Share the Room ID with another person to join the video chat
5. When the other person joins, you'll be able to see and hear each other

## Logging and Debugging

### Frontend Logs
The frontend application stores logs in the browser's localStorage. You can:
- View logs in the browser console
- Download logs as a JSON file using the "Download Logs" button in the room
- Clear logs using the "Clear Logs" button

### Backend Logs
The backend server stores logs in the `logs` directory. You can:
- View logs directly from the log files in the logs directory
- Download current logs via the `/logs` endpoint (http://localhost:8080/logs)

## Troubleshooting

### Camera Not Showing
1. Make sure your browser has permission to access your camera and microphone
2. Check browser console for any error messages
3. Try using a different browser (Chrome and Firefox work best with WebRTC)
4. Make sure no other application is using your camera
5. Download logs and check for specific error messages

### Connection Issues
1. Ensure both the backend and frontend servers are running
2. Verify the backend server is accessible at http://localhost:8080/health
3. Check if your firewall or network blocks WebRTC traffic
4. Try using a different network if possible
5. Check logs for WebSocket or ICE connection errors

### Browser Compatibility
WebRTC works best in modern browsers. Recommended browsers:
- Google Chrome (latest version)
- Mozilla Firefox (latest version)
- Microsoft Edge (latest version)

## Technical Details

- **Backend**: Go with fasthttp for API and WebSocket handling
- **Frontend**: React with Vite.js
- **Communication**: WebSocket for signaling, WebRTC for peer-to-peer video/audio
- **STUN servers**: Google's public STUN servers for NAT traversal

## License

MIT 