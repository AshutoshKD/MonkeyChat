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
			ctx.Response.Header.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			ctx.Response.Header.Set("Access-Control-Allow-Headers", "Content-Type")
			ctx.Response.Header.Set("Access-Control-Allow-Credentials", "true")

			// Handle preflight requests
			if string(ctx.Method()) == "OPTIONS" {
				ctx.SetStatusCode(fasthttp.StatusOK)
				return
			}

			next(ctx)
		}
	}

	// Set up the router
	router := func(ctx *fasthttp.RequestCtx) {
		path := string(ctx.Path())

		switch path {
		case "/ws":
			handleWebSocket(ctx)
		case "/health":
			ctx.SetBodyString("OK")
		case "/logs":
			// Endpoint to download server logs
			serveLogFile(ctx)
		default:
			logMessage("WARN", "404 Not Found: %s", path)
			ctx.SetStatusCode(fasthttp.StatusNotFound)
		}
	}

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

	// Create log file with timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	var err error
	logFile, err = os.OpenFile(fmt.Sprintf("logs/monkeychat_%s.log", timestamp),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Fatalf("Failed to open log file: %v", err)
	}

	// Set log output to file only (console output is handled by logMessage function)
	log.SetOutput(logFile)
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

func handleWebSocket(ctx *fasthttp.RequestCtx) {
	clientIP := ctx.RemoteIP().String()
	logMessage("INFO", "WebSocket connection request from %s", clientIP)

	err := upgrader.Upgrade(ctx, func(ws *websocket.Conn) {
		// Create a new connection without user info yet
		conn := &Connection{
			Conn:     ws,
			UserName: "Unknown",
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
				// Extract user name from payload
				if len(msg.Payload) > 0 {
					var userInfo UserInfo
					if err := json.Unmarshal(msg.Payload, &userInfo); err == nil {
						conn.UserName = userInfo.UserName
						logMessage("INFO", "User '%s' is joining room %s", conn.UserName, roomID)
					}
				}

				// Add connection to room
				mutex.Lock()
				if _, ok := rooms[roomID]; !ok {
					rooms[roomID] = []*Connection{}
					logMessage("INFO", "New room created: %s", roomID)
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

func cleanupConnection(conn *Connection) {
	mutex.Lock()
	defer mutex.Unlock()

	for roomID, connections := range rooms {
		for i, c := range connections {
			if c.Conn == conn.Conn {
				// Remove this connection
				rooms[roomID] = append(connections[:i], connections[i+1:]...)
				logMessage("INFO", "Removed connection for user '%s' from room %s", conn.UserName, roomID)

				// If room is empty, remove it
				if len(rooms[roomID]) == 0 {
					delete(rooms, roomID)
					logMessage("INFO", "Removed empty room %s", roomID)
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
