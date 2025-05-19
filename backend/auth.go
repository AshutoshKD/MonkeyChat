package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/valyala/fasthttp"
)

var (
	// Secret key for JWT signing
	jwtSecret = []byte("monkeychat_secret_key")

	// User store (in-memory for this demo)
	userStore      = sync.Map{}
	activeRooms    = sync.Map{}
	userMutex      = &sync.RWMutex{}
	roomsMutex     = &sync.RWMutex{}
	tokenBlacklist = sync.Map{}
)

// User represents a registered user
type User struct {
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"` // Don't include in JSON output
	CreatedAt    time.Time `json:"createdAt"`
}

// Room represents an active chat room
type ActiveRoom struct {
	ID        string    `json:"id"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

// JWT claims structure
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// Init initializes the auth module with test users
func InitAuth() {
	// Add test users
	addTestUser("ashu", "admin")
	addTestUser("rijey", "admin")

	logMessage("INFO", "Auth module initialized with test users")
}

// Initialize test users
func addTestUser(username, password string) {
	passwordHash := hashPassword(password)
	user := User{
		Username:     username,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
	}
	userStore.Store(username, user)
}

// Hash a password (simple SHA-256 for demo purposes)
func hashPassword(password string) string {
	hasher := sha256.New()
	hasher.Write([]byte(password))
	return base64.StdEncoding.EncodeToString(hasher.Sum(nil))
}

// Verify a password against a hash
func verifyPassword(password, hash string) bool {
	return hashPassword(password) == hash
}

// Generate a JWT token for a user
func generateToken(username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   username,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)

	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// Validate a JWT token
func validateToken(tokenString string) (*Claims, error) {
	// Check if token is blacklisted
	if _, blacklisted := tokenBlacklist.Load(tokenString); blacklisted {
		return nil, fmt.Errorf("token is blacklisted")
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// Extract token from Authorization header
func extractToken(ctx *fasthttp.RequestCtx) string {
	auth := string(ctx.Request.Header.Peek("Authorization"))
	if auth == "" {
		return ""
	}

	parts := strings.Split(auth, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ""
	}

	return parts[1]
}

// Authentication middleware for fasthttp
func authMiddleware(next func(ctx *fasthttp.RequestCtx, username string)) fasthttp.RequestHandler {
	return func(ctx *fasthttp.RequestCtx) {
		// Skip auth for certain endpoints
		path := string(ctx.Path())
		if path == "/login" || path == "/register" || path == "/health" || path == "/ws" {
			if path == "/ws" {
				// For WebSocket, check for token in query param
				token := string(ctx.QueryArgs().Peek("token"))
				if token != "" {
					claims, err := validateToken(token)
					if err == nil {
						next(ctx, claims.Username)
						return
					}
				}
				// Continue without authentication for WebSocket if no valid token
				next(ctx, "")
				return
			}

			// No auth for login, register, health
			next(ctx, "")
			return
		}

		// Get token from header
		tokenString := extractToken(ctx)
		if tokenString == "" {
			ctx.SetStatusCode(fasthttp.StatusUnauthorized)
			ctx.SetBodyString(`{"error":"unauthorized: missing token"}`)
			return
		}

		// Validate token
		claims, err := validateToken(tokenString)
		if err != nil {
			ctx.SetStatusCode(fasthttp.StatusUnauthorized)
			ctx.SetBodyString(fmt.Sprintf(`{"error":"unauthorized: %s"}`, err.Error()))
			return
		}

		// Call next handler with username
		next(ctx, claims.Username)
	}
}

// Handler for user login
func handleLogin(ctx *fasthttp.RequestCtx) {
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	// Parse request body
	if err := json.Unmarshal(ctx.PostBody(), &creds); err != nil {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid request body"}`)
		return
	}

	// Get user from store
	userVal, exists := userStore.Load(creds.Username)
	if !exists {
		ctx.SetStatusCode(fasthttp.StatusUnauthorized)
		ctx.SetBodyString(`{"error":"invalid username or password"}`)
		return
	}

	user := userVal.(User)

	// Verify password
	if !verifyPassword(creds.Password, user.PasswordHash) {
		ctx.SetStatusCode(fasthttp.StatusUnauthorized)
		ctx.SetBodyString(`{"error":"invalid username or password"}`)
		return
	}

	// Generate token
	token, err := generateToken(creds.Username)
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString(`{"error":"error generating token"}`)
		return
	}

	// Return token
	response := struct {
		Token    string `json:"token"`
		Username string `json:"username"`
	}{
		Token:    token,
		Username: creds.Username,
	}

	responseJSON, _ := json.Marshal(response)
	ctx.SetContentType("application/json")
	ctx.SetBody(responseJSON)
}

// Handler for user registration
func handleRegister(ctx *fasthttp.RequestCtx) {
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	// Parse request body
	if err := json.Unmarshal(ctx.PostBody(), &creds); err != nil {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"invalid request body"}`)
		return
	}

	// Validate input
	if len(creds.Username) < 3 || len(creds.Password) < 4 {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"username must be at least 3 characters and password at least 4 characters"}`)
		return
	}

	// Check if username exists
	_, exists := userStore.Load(creds.Username)
	if exists {
		ctx.SetStatusCode(fasthttp.StatusConflict)
		ctx.SetBodyString(`{"error":"username already exists"}`)
		return
	}

	// Create user
	passwordHash := hashPassword(creds.Password)
	user := User{
		Username:     creds.Username,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
	}

	userStore.Store(creds.Username, user)

	// Generate token
	token, err := generateToken(creds.Username)
	if err != nil {
		ctx.SetStatusCode(fasthttp.StatusInternalServerError)
		ctx.SetBodyString(`{"error":"error generating token"}`)
		return
	}

	// Return token
	response := struct {
		Token    string `json:"token"`
		Username string `json:"username"`
	}{
		Token:    token,
		Username: creds.Username,
	}

	responseJSON, _ := json.Marshal(response)
	ctx.SetContentType("application/json")
	ctx.SetBody(responseJSON)
}

// Handler for user logout
func handleLogout(ctx *fasthttp.RequestCtx, username string) {
	tokenString := extractToken(ctx)
	if tokenString == "" {
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		ctx.SetBodyString(`{"error":"no token provided"}`)
		return
	}

	// Add token to blacklist
	tokenBlacklist.Store(tokenString, true)

	ctx.SetContentType("application/json")
	ctx.SetBodyString(`{"message":"successfully logged out"}`)
}

// Handler for getting active rooms
func handleGetRooms(ctx *fasthttp.RequestCtx, username string) {
	rooms := []ActiveRoom{}

	activeRooms.Range(func(key, value interface{}) bool {
		room := value.(ActiveRoom)
		rooms = append(rooms, room)
		return true
	})

	responseJSON, _ := json.Marshal(rooms)
	ctx.SetContentType("application/json")
	ctx.SetBody(responseJSON)
}

// Add a new room to active rooms
func addActiveRoom(roomID string, createdBy string) {
	room := ActiveRoom{
		ID:        roomID,
		CreatedBy: createdBy,
		CreatedAt: time.Now(),
	}

	activeRooms.Store(roomID, room)
	logMessage("INFO", "New active room added: %s created by %s", roomID, createdBy)
}

// Remove a room from active rooms
func removeActiveRoom(roomID string) {
	activeRooms.Delete(roomID)
	logMessage("INFO", "Room removed from active rooms: %s", roomID)
}
