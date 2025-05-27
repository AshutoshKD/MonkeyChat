package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/fasthttp/websocket"
	"github.com/valyala/fasthttp"
)

var (
	addr    = flag.String("addr", ":8080", "http service address")
	rooms   = make(map[string][]*Connection)
	mutex   = sync.RWMutex{}
	logFile *os.File
)

// Connection represents a WebSocket connection with user info
type Connection struct {
	Conn     *websocket.Conn
	UserName string
	UserID   int64
}

type Message struct {
	Event   string          `json:"event"`
	RoomID  string          `json:"roomId"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// UserInfo holds user information from join payload
type UserInfo struct {
	UserName string `json:"userName"`
}

// Logger function
func logMessage(level, format string, v ...interface{}) {
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logMsg := fmt.Sprintf("[%s] [%s] %s", timestamp, level, fmt.Sprintf(format, v...))
	log.Print(logMsg)

	// Also print to terminal stdout
	fmt.Println(logMsg)
}

func main() {
	flag.Parse()

	// Set up logging to file
	setupLogging()
	defer logFile.Close()

	// Initialize database
	logMessage("INFO", "Initializing database...")
	if err := InitDatabase(); err != nil {
		logMessage("ERROR", "Failed to initialize database: %v", err)
		os.Exit(1)
	}

	// Initialize authentication system with test users
	InitAuth()

	logMessage("INFO", "Starting MonkeyChat server on %s", *addr)

	// Create a CORS middleware
	corsMiddleware := func(next fasthttp.RequestHandler) fasthttp.RequestHandler {
		return func(ctx *fasthttp.RequestCtx) {
			origin := string(ctx.Request.Header.Peek("Origin"))
			if origin == "" {
				origin = "*"
			}

			logMessage("DEBUG", "Request from origin: %s, path: %s, method: %s",
				origin, ctx.Path(), ctx.Method())

			// Set CORS headers
			ctx.Response.Header.Set("Access-Control-Allow-Origin", origin)
			ctx.Response.Header.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
			ctx.Response.Header.Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			ctx.Response.Header.Set("Access-Control-Allow-Credentials", "true")

			// Handle preflight requests
			if string(ctx.Method()) == "OPTIONS" {
				ctx.SetStatusCode(fasthttp.StatusOK)
				return
			}

			next(ctx)
		}
	}

	// Apply Auth middleware to the router
	router := authMiddleware(func(ctx *fasthttp.RequestCtx, username string, userID int64) {
		path := string(ctx.Path())
		method := string(ctx.Method())

		switch {
		case path == "/ws":
			handleWebSocket(ctx, username, userID)
		case path == "/health":
			ctx.SetBodyString("OK")
		case path == "/logs":
			// Endpoint to download server logs
			serveLogFile(ctx)
		case path == "/login" && method == "POST":
			handleLogin(ctx)
		case path == "/register" && method == "POST":
			handleRegister(ctx)
		case path == "/logout" && method == "POST":
			handleLogout(ctx, username, userID)
		case path == "/rooms" && method == "GET":
			handleGetRooms(ctx, username, userID)
		case path == "/rooms/delete" && method == "POST":
			handleDeleteRoom(ctx, username, userID)
		default:
			logMessage("WARN", "404 Not Found: %s", path)
			ctx.SetStatusCode(fasthttp.StatusNotFound)
		}
	})

	// Apply CORS middleware
	handler := corsMiddleware(router)

	// Start the server
	logMessage("INFO", "Server started on %s", *addr)
	if err := fasthttp.ListenAndServe(*addr, handler); err != nil {
		logMessage("ERROR", "Error in ListenAndServe: %v", err)
		os.Exit(1)
	}
}

func setupLogging() {
	// Create logs directory if it doesn't exist
	if _, err := os.Stat("logs"); os.IsNotExist(err) {
		if err := os.Mkdir("logs", 0755); err != nil {
			log.Fatalf("Failed to create logs directory: %v", err)
		}
	}

	// Use a single log file that gets rewritten on each start
	var err error
	logFile, err = os.OpenFile("logs/monkeychat.log",
		os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		log.Fatalf("Failed to open log file: %v", err)
	}

	// Set log output to file only (console output is handled by logMessage function)
	log.SetOutput(logFile)

	// Write initial log entry
	logMessage("INFO", "=== MonkeyChat Server Started ===")
	logMessage("INFO", "Log file initialized: %s", logFile.Name())
}

func serveLogFile(ctx *fasthttp.RequestCtx) {
	// Set headers for file download
	ctx.Response.Header.Set("Content-Type", "text/plain")
	ctx.Response.Header.Set("Content-Disposition", "attachment; filename=monkeychat_server_logs.log")

	// Create a copy of the current log file
	if logFile != nil {
		logFile.Sync() // Flush any buffers
		data, err := os.ReadFile(logFile.Name())
		if err != nil {
			logMessage("ERROR", "Failed to read log file: %v", err)
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			return
		}
		ctx.SetBody(data)
	} else {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
	}
}

var upgrader = websocket.FastHTTPUpgrader{
	CheckOrigin: func(ctx *fasthttp.RequestCtx) bool {
		// Log origin information
		origin := string(ctx.Request.Header.Peek("Origin"))
		logMessage("DEBUG", "WebSocket connection from origin: %s", origin)
		return true
	},
}

func handleWebSocket(ctx *fasthttp.RequestCtx, authUsername string, userID int64) {
	clientIP := ctx.RemoteIP().String()
	logMessage("INFO", "WebSocket connection request from %s", clientIP)

	err := upgrader.Upgrade(ctx, func(ws *websocket.Conn) {
		// Create a new connection without user info yet
		conn := &Connection{
			Conn:     ws,
			UserName: authUsername, // Use the authenticated username if available
			UserID:   userID,       // Use the authenticated user ID if available
		}

		defer ws.Close()
		logMessage("INFO", "WebSocket connection established from %s", clientIP)

		// Process messages
		for {
			_, message, err := ws.ReadMessage()
			if err != nil {
				logMessage("WARN", "Error reading message from %s: %v", clientIP, err)
				cleanupConnection(conn)
				break
			}

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				logMessage("ERROR", "Error unmarshaling message from %s: %v", clientIP, err)
				continue
			}

			roomID := msg.RoomID
			logMessage("INFO", "Received %s message from %s for room %s", msg.Event, clientIP, roomID)

			switch msg.Event {
			case "join":
				// Extract user name from payload if not authenticated
				if conn.UserName == "" && len(msg.Payload) > 0 {
					var userInfo UserInfo
					if err := json.Unmarshal(msg.Payload, &userInfo); err == nil && userInfo.UserName != "" {
						conn.UserName = userInfo.UserName
						logMessage("INFO", "User '%s' is joining room %s", conn.UserName, roomID)
					} else {
						conn.UserName = "Anonymous"
					}
				}

				// Add connection to room
				mutex.Lock()
				if _, ok := rooms[roomID]; !ok {
					rooms[roomID] = []*Connection{}
					logMessage("INFO", "New room created: %s", roomID)

					// If user is authenticated, add room to active rooms and database
					if conn.UserName != "" && conn.UserName != "Anonymous" && conn.UserID > 0 {
						addActiveRoom(roomID, conn.UserName, conn.UserID)
					}
				}

				// Notify existing peers about the new user
				for _, existingConn := range rooms[roomID] {
					// Tell existing user about the new user
					notifyUserJoined(existingConn, roomID, conn.UserName)

					// Tell the new user about existing users
					notifyUserJoined(conn, roomID, existingConn.UserName)
				}

				// Add the new connection to the room
				rooms[roomID] = append(rooms[roomID], conn)
				connectionCount := len(rooms[roomID])
				mutex.Unlock()

				logMessage("INFO", "User '%s' joined room %s, connections: %d", conn.UserName, roomID, connectionCount)

				// Send join confirmation
				response := Message{
					Event:  "joined",
					RoomID: roomID,
				}
				respondJSON(conn, response)

				// Log room status
				logRoomStatus()

			case "leave":
				// Notify other users in the room that this user is leaving
				var userInfo UserInfo
				if err := json.Unmarshal(msg.Payload, &userInfo); err == nil {
					// Use the provided username or the connection's username
					leavingUserName := userInfo.UserName
					if leavingUserName == "" {
						leavingUserName = conn.UserName
					}

					logMessage("INFO", "User '%s' is leaving room %s", leavingUserName, roomID)

					// Notify other users in the room
					notifyUserLeft(conn, roomID, leavingUserName)
				}

				// Clean up the connection
				cleanupConnection(conn)
				break

			case "offer", "answer", "ice-candidate":
				// Relay message to other peers in the room
				relayMessageToRoom(conn, roomID, message)
			}
		}
	})

	if err != nil {
		logMessage("ERROR", "Error upgrading to websocket: %v", err)
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
	}
}

func notifyUserJoined(conn *Connection, roomID, userName string) {
	payload, _ := json.Marshal(map[string]string{
		"userName": userName,
	})

	userJoinedMsg := Message{
		Event:   "user-joined",
		RoomID:  roomID,
		Payload: payload,
	}

	respondJSON(conn, userJoinedMsg)
}

func notifyUserLeft(leavingConn *Connection, roomID, userName string) {
	payload, _ := json.Marshal(map[string]string{
		"userName": userName,
	})

	userLeftMsg := Message{
		Event:   "user-left",
		RoomID:  roomID,
		Payload: payload,
	}

	// Find the room
	mutex.RLock()
	defer mutex.RUnlock()

	connections, ok := rooms[roomID]
	if !ok {
		return
	}

	// Notify all other users in the room
	for _, conn := range connections {
		if conn.Conn != leavingConn.Conn {
			respondJSON(conn, userLeftMsg)
			logMessage("INFO", "Notified user '%s' that '%s' left room %s",
				conn.UserName, userName, roomID)
		}
	}
}

func cleanupConnection(conn *Connection) {
	mutex.Lock()
	defer mutex.Unlock()

	for roomID, connections := range rooms {
		for i, c := range connections {
			if c.Conn == conn.Conn {
				// Remove this connection
				rooms[roomID] = append(connections[:i], connections[i+1:]...)
				logMessage("INFO", "Removed connection for user '%s' from room %s", conn.UserName, roomID)

				// Keep the room alive even if empty
				// Only update active room status in memory, but don't delete from database
				if len(rooms[roomID]) == 0 {
					logMessage("INFO", "Room %s is now empty, but will be kept alive", roomID)
				}
				return
			}
		}
	}
}

func relayMessageToRoom(sender *Connection, roomID string, message []byte) {
	mutex.RLock()
	defer mutex.RUnlock()

	connections, ok := rooms[roomID]
	if !ok {
		logMessage("WARN", "Room %s not found", roomID)
		return
	}

	var msgType string
	var msg Message
	if err := json.Unmarshal(message, &msg); err == nil {
		msgType = msg.Event
	} else {
		msgType = "unknown"
	}

	for _, conn := range connections {
		if conn.Conn != sender.Conn {
			if err := conn.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				logMessage("ERROR", "Error sending %s message: %v", msgType, err)
			} else {
				logMessage("INFO", "Relayed %s message from '%s' to '%s' in room %s",
					msgType, sender.UserName, conn.UserName, roomID)
			}
		}
	}
}

func respondJSON(conn *Connection, v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		logMessage("ERROR", "Error marshaling JSON: %v", err)
		return
	}

	if err := conn.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
		logMessage("ERROR", "Error sending message: %v", err)
	}
}

func logRoomStatus() {
	mutex.RLock()
	defer mutex.RUnlock()

	logMessage("INFO", "Current room status:")
	for roomID, connections := range rooms {
		userNames := make([]string, len(connections))
		for i, conn := range connections {
			userNames[i] = conn.UserName
		}
		logMessage("INFO", "  Room %s: %d connections - Users: %v", roomID, len(connections), userNames)
	}
}

func handleDeleteRoom(ctx *fasthttp.RequestCtx, username string, userID int64) {
	// Parse request body
	var requestBody struct {
		RoomID string `json:"roomId"`
	}

	if err := json.Unmarshal(ctx.PostBody(), &requestBody); err != nil {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid request body"}`)
		return
	}

	roomID := requestBody.RoomID
	if roomID == "" {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"room ID is required"}`)
		return
	}

	// Get room from database
	room, err := GetRoomByID(roomID)
	if err != nil {
		logMessage("ERROR", "Error fetching room: %v", err)
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString(`{"error":"internal server error"}`)
		return
	}

	if room == nil {
		ctx.SetStatusCode(fasthttp.StatusNotFound)
		ctx.SetBodyString(`{"error":"room not found"}`)
		return
	}

	// Check if user is the creator of the room
	if room.CreatedBy != userID {
		ctx.SetStatusCode(fasthttp.StatusForbidden)
		ctx.SetBodyString(`{"error":"only the room creator can delete the room"}`)
		return
	}

	// Remove room from database
	if err := DeleteRoom(roomID); err != nil {
		logMessage("ERROR", "Error deleting room: %v", err)
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString(`{"error":"error deleting room"}`)
		return
	}

	// Remove room from active rooms map
	mutex.Lock()
	delete(rooms, roomID)
	mutex.Unlock()

	// Remove from active rooms tracking
	activeRooms.Delete(roomID)

	logMessage("INFO", "Room %s deleted by user %s (%d)", roomID, username, userID)

	ctx.SetContentType("application/json")
	ctx.SetBodyString(`{"message":"room deleted successfully"}`)
}
