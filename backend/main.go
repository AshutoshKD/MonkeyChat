package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/fasthttp/websocket"
	"github.com/joho/godotenv"
	"github.com/valyala/fasthttp"
)

var (
	rooms   = make(map[string][]*Connection)
	mutex   = sync.RWMutex{}
	logFile *os.File
)

func init() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		// Only log error if we're in development
		if os.Getenv("ENV") != "production" {
			log.Printf("Warning: Error loading .env file: %v", err)
		}
	}
}

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

// Logger function with environment-based logging
func logMessage(level, format string, v ...interface{}) {
	isProd := os.Getenv("ENV") == "production"
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	logMsg := fmt.Sprintf("[%s] [%s] %s", timestamp, level, fmt.Sprintf(format, v...))

	// Always write to the log file
	if logFile != nil {
		if _, err := logFile.WriteString(logMsg + "\n"); err != nil {
			fmt.Printf("Error writing to log file: %v\n", err)
		}
		logFile.Sync() // Ensure the log is written to disk
	}

	// In development, also print to console with colors
	if !isProd {
		var color string
		switch level {
		case "ERROR":
			color = "\033[31m" // Red
		case "WARN":
			color = "\033[33m" // Yellow
		case "INFO":
			color = "\033[32m" // Green
		case "DEBUG":
			color = "\033[36m" // Cyan
		default:
			color = "\033[0m" // Reset
		}
		fmt.Printf("%s%s\033[0m\n", color, logMsg)
	}
}

func main() {
	fmt.Println("================ MonkeyChat server starting ================")
	fmt.Printf("ENV: '%s'\n", os.Getenv("ENV"))
	fmt.Printf("PORT: '%s'\n", os.Getenv("PORT"))
	fmt.Printf("DB_USERNAME: '%s'\n", os.Getenv("DB_USERNAME"))
	fmt.Printf("DB_PASSWORD: '%s'\n", os.Getenv("DB_PASSWORD"))
	fmt.Printf("DB_HOST: '%s'\n", os.Getenv("DB_HOST"))
	fmt.Printf("DB_PORT: '%s'\n", os.Getenv("DB_PORT"))
	fmt.Printf("DB_NAME: '%s'\n", os.Getenv("DB_NAME"))
	fmt.Printf("JWT_SECRET: '%s'\n", os.Getenv("JWT_SECRET"))
	fmt.Printf("CLOUDINARY_URL: '%s'\n", os.Getenv("CLOUDINARY_URL"))

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port if not specified
		log.Printf("No PORT environment variable set, using default port: %s", port)
	} else {
		log.Printf("Using PORT from environment: %s", port)
	}

	// Set up server address
	addr := ":" + port // Ensure we bind to all interfaces with the specified port
	log.Printf("Server will bind to address: %s", addr)

	// Set up logging based on environment
	isProd := os.Getenv("ENV") == "production"
	log.Printf("Environment: %s", os.Getenv("ENV"))
	if isProd {
		log.Printf("Setting up production logging")
		setupProductionLogging()
	} else {
		log.Printf("Setting up development logging")
		setupDevelopmentLogging()
	}
	defer logFile.Close()

	// Initialize database
	logMessage("INFO", "Initializing database...")
	log.Printf("Database configuration - Host: %s, Port: %s, User: %s, DB: %s",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_NAME"))

	if err := InitDatabase(); err != nil {
		logMessage("ERROR", "Failed to initialize database: %v", err)
		log.Printf("Fatal error initializing database: %v", err)
		os.Exit(1)
	}

	// Initialize authentication system with test users
	log.Printf("Initializing auth system...")
	InitAuth()

	logMessage("INFO", "Starting MonkeyChat server on %s", addr)
	log.Printf("Server starting on %s", addr)

	// Create a CORS middleware
	corsMiddleware := func(next fasthttp.RequestHandler) fasthttp.RequestHandler {
		return func(ctx *fasthttp.RequestCtx) {
			origin := string(ctx.Request.Header.Peek("Origin"))
			if origin == "" {
				origin = "*"
			}

			if !isProd {
				logMessage("DEBUG", "Request from origin: %s, path: %s, method: %s",
					origin, ctx.Path(), ctx.Method())
			}

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

	// Serve static files from /uploads/ in development (before auth)
	var handler fasthttp.RequestHandler
	if !isProd {
		handler = func(ctx *fasthttp.RequestCtx) {
			path := string(ctx.Path())
			if strings.HasPrefix(path, "/uploads/") {
				absUploadDir, _ := filepath.Abs("uploads")
				filename := strings.TrimPrefix(path, "/uploads/")
				filePath := filepath.Join(absUploadDir, filename)
				fasthttp.ServeFile(ctx, filePath)
				return
			}
			authMiddleware(func(ctx *fasthttp.RequestCtx, username string, userID int64) {
				path := string(ctx.Path())
				method := string(ctx.Method())
				switch {
				case path == "/ws":
					handleWebSocket(ctx, username, userID)
				case path == "/health":
					ctx.SetBodyString("OK")
				case path == "/logs":
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
				case strings.HasPrefix(path, "/users/") && strings.HasSuffix(path, "/profile") && method == "GET":
					handleGetUserProfile(ctx, username, userID)
				case strings.HasPrefix(path, "/users/") && strings.HasSuffix(path, "/profile") && method == "PUT":
					handleUpdateUserProfile(ctx, username, userID)
				case strings.HasPrefix(path, "/users/") && strings.HasSuffix(path, "/upload-profile-pic") && method == "POST":
					handleUploadProfilePic(ctx, username, userID)
				default:
					logMessage("WARN", "404 Not Found: %s", path)
					ctx.SetStatusCode(fasthttp.StatusNotFound)
				}
			})(ctx)
		}
	} else {
		handler = func(ctx *fasthttp.RequestCtx) {
			authMiddleware(func(ctx *fasthttp.RequestCtx, username string, userID int64) {
				path := string(ctx.Path())
				method := string(ctx.Method())
				switch {
				case path == "/ws":
					handleWebSocket(ctx, username, userID)
				case path == "/health":
					ctx.SetBodyString("OK")
				case path == "/logs":
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
				case strings.HasPrefix(path, "/users/") && strings.HasSuffix(path, "/profile") && method == "GET":
					handleGetUserProfile(ctx, username, userID)
				case strings.HasPrefix(path, "/users/") && strings.HasSuffix(path, "/profile") && method == "PUT":
					handleUpdateUserProfile(ctx, username, userID)
				case strings.HasPrefix(path, "/users/") && strings.HasSuffix(path, "/upload-profile-pic") && method == "POST":
					handleUploadProfilePic(ctx, username, userID)
				default:
					logMessage("WARN", "404 Not Found: %s", path)
					ctx.SetStatusCode(fasthttp.StatusNotFound)
				}
			})(ctx)
		}
	}
	// Apply CORS middleware
	h := corsMiddleware(handler)
	// Start the server
	logMessage("INFO", "Server started on %s", addr)
	log.Printf("Attempting to start server on %s", addr)
	server := &fasthttp.Server{
		Handler:            h,
		MaxRequestBodySize: 100 * 1024 * 1024, // 100 MB
	}
	if err := server.ListenAndServe(addr); err != nil {
		logMessage("ERROR", "Error in ListenAndServe: %v", err)
		log.Printf("Fatal error starting server: %v", err)
		os.Exit(1)
	}
}

func setupProductionLogging() {
	// Just log to stdout in production for Render
	log.SetOutput(os.Stdout)
}

func setupDevelopmentLogging() {
	// Create logs directory if it doesn't exist
	if _, err := os.Stat("logs"); os.IsNotExist(err) {
		if err := os.Mkdir("logs", 0755); err != nil {
			log.Fatalf("Failed to create logs directory: %v", err)
		}
	}

	// In development, log to both console and a development log file
	var err error
	logFile, err = os.OpenFile("logs/monkeychat.dev.log",
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Fatalf("Failed to open development log file: %v", err)
	}

	// Set up multi-writer to log to both console and file
	mw := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(mw)
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

func handleGetUserProfile(ctx *fasthttp.RequestCtx, authUsername string, userID int64) {
	// Extract username from path
	path := string(ctx.Path())
	parts := strings.Split(path, "/")
	if len(parts) < 3 {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid path"}`)
		return
	}
	username := parts[2]
	user, err := GetUserByUsername(username)
	if err != nil || user == nil {
		ctx.SetStatusCode(fasthttp.StatusNotFound)
		ctx.SetBodyString(`{"error":"user not found"}`)
		return
	}
	resp := struct {
		Username   string `json:"username"`
		Bio        string `json:"bio"`
		ProfilePic string `json:"profilePic"`
	}{
		Username:   user.Username,
		Bio:        user.Bio,
		ProfilePic: user.ProfilePic,
	}
	ctx.SetContentType("application/json")
	json.NewEncoder(ctx).Encode(resp)
}

func handleUpdateUserProfile(ctx *fasthttp.RequestCtx, authUsername string, userID int64) {
	// Extract username from path
	path := string(ctx.Path())
	parts := strings.Split(path, "/")
	if len(parts) < 3 {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid path"}`)
		return
	}
	username := parts[2]
	if authUsername != username {
		ctx.SetStatusCode(fasthttp.StatusForbidden)
		ctx.SetBodyString(`{"error":"cannot edit another user's profile"}`)
		return
	}
	var req struct {
		Username   string `json:"username"`
		Bio        string `json:"bio"`
		ProfilePic string `json:"profilePic"`
	}
	if err := json.Unmarshal(ctx.PostBody(), &req); err != nil {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid request body"}`)
		return
	}
	// Use helper function
	if err := UpdateUserProfile(username, req.Username, req.Bio, req.ProfilePic); err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString(`{"error":"failed to update profile"}`)
		return
	}
	ctx.SetContentType("application/json")
	ctx.SetBodyString(`{"message":"profile updated"}`)
}

func handleUploadProfilePic(ctx *fasthttp.RequestCtx, authUsername string, userID int64) {
	// Extract username from path
	path := string(ctx.Path())
	parts := strings.Split(path, "/")
	if len(parts) < 3 {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid path"}`)
		return
	}
	username := parts[2]
	if authUsername != username {
		ctx.SetStatusCode(fasthttp.StatusForbidden)
		ctx.SetBodyString(`{"error":"cannot upload for another user"}`)
		return
	}
	isProd := os.Getenv("ENV") == "production"
	// Parse multipart form
	form, err := ctx.MultipartForm()
	if err != nil || form == nil || len(form.File["image"]) == 0 {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"no image uploaded"}`)
		return
	}
	fileHeader := form.File["image"][0]
	file, err := fileHeader.Open()
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString(`{"error":"failed to open image"}`)
		return
	}
	defer file.Close()
	var imageURL string
	if isProd {
		// Upload to Cloudinary
		cld, err := cloudinary.NewFromURL(os.Getenv("CLOUDINARY_URL"))
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString(`{"error":"cloudinary config error"}`)
			return
		}
		uploadRes, err := cld.Upload.Upload(ctx, file, uploader.UploadParams{
			Folder:    "monkeychat/profile_pics",
			PublicID:  username + "_" + time.Now().Format("20060102150405"),
			Overwrite: func(b bool) *bool { return &b }(true),
		})
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString(`{"error":"cloudinary upload failed"}`)
			return
		}
		imageURL = uploadRes.SecureURL
	} else {
		// Save locally
		uploadDir := "uploads"
		os.MkdirAll(uploadDir, 0755)
		filename := username + "_" + time.Now().Format("20060102150405") + filepath.Ext(fileHeader.Filename)
		filePath := filepath.Join(uploadDir, filename)
		out, err := os.Create(filePath)
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString(`{"error":"failed to save image"}`)
			return
		}
		defer out.Close()
		_, err = io.Copy(out, file)
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusInternalServerError)
			ctx.SetBodyString(`{"error":"failed to save image"}`)
			return
		}
		imageURL = "/uploads/" + filename
	}
	ctx.SetContentType("application/json")
	ctx.SetBodyString(fmt.Sprintf(`{"url":"%s"}`, imageURL))
}
