package main

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var db *sql.DB

// Database configuration - get from environment or use defaults
var (
	dbUsername = getEnv("DB_USERNAME", "d9iqoueBRZHuCAV.root")
	dbPassword = getEnv("DB_PASSWORD", "CY6mkPlqOrWMbJUM")
	dbHost     = getEnv("DB_HOST", "gateway01.ap-southeast-1.prod.aws.tidbcloud.com")
	dbPort     = getEnv("DB_PORT", "4000")
	dbName     = getEnv("DB_NAME", "test")
)

// Helper function to get environment variables with fallback
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// DbUser represents a user record in the database
type DbUser struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"` // Hashed password, not returned in JSON
	CreatedAt time.Time `json:"createdAt"`
}

// DbRoom represents a room record in the database
type DbRoom struct {
	ID        string    `json:"id"`
	CreatedBy int64     `json:"createdBy"` // Foreign key to users.id
	CreatedAt time.Time `json:"createdAt"`
}

// InitDatabase initializes the database connection and creates tables if they don't exist
func InitDatabase() error {
	// Use TiDB Cloud connection format with TLS and skip verification
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&tls=skip-verify",
		dbUsername, dbPassword, dbHost, dbPort, dbName)

	var err error
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("error opening database connection: %v", err)
	}

	// Set connection pool settings for TiDB Cloud
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	// Test the connection
	if err = db.Ping(); err != nil {
		return fmt.Errorf("error connecting to the database: %v", err)
	}

	logMessage("INFO", "Connected to TiDB Cloud database")

	// Create tables if they don't exist
	if err = createTables(); err != nil {
		return fmt.Errorf("error creating tables: %v", err)
	}

	return nil
}

// createTables creates the necessary tables if they don't exist
func createTables() error {
	// Create users table
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id BIGINT NOT NULL AUTO_INCREMENT,
			username VARCHAR(50) NOT NULL UNIQUE,
			password VARCHAR(100) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id)
		)
	`)
	if err != nil {
		return fmt.Errorf("error creating users table: %v", err)
	}

	// Create rooms table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS rooms (
			id VARCHAR(50) NOT NULL,
			created_by BIGINT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			FOREIGN KEY (created_by) REFERENCES users(id)
		)
	`)
	if err != nil {
		return fmt.Errorf("error creating rooms table: %v", err)
	}

	return nil
}

// CreateUser creates a new user in the database
func CreateUser(username, passwordHash string) (*DbUser, error) {
	result, err := db.Exec(
		"INSERT INTO users (username, password) VALUES (?, ?)",
		username,
		passwordHash,
	)
	if err != nil {
		return nil, fmt.Errorf("error creating user: %v", err)
	}

	userID, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("error getting user ID: %v", err)
	}

	// Fetch the created user
	user, err := GetUserByID(userID)
	if err != nil {
		return nil, fmt.Errorf("error fetching created user: %v", err)
	}

	logMessage("INFO", "User created in database: %s (ID: %d)", username, userID)
	return user, nil
}

// GetUserByUsername retrieves a user by username
func GetUserByUsername(username string) (*DbUser, error) {
	var user DbUser
	err := db.QueryRow(
		"SELECT id, username, password, created_at FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil // User not found, but not an error
	} else if err != nil {
		return nil, fmt.Errorf("error fetching user: %v", err)
	}

	return &user, nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(id int64) (*DbUser, error) {
	var user DbUser
	err := db.QueryRow(
		"SELECT id, username, password, created_at FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &user.Password, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil // User not found, but not an error
	} else if err != nil {
		return nil, fmt.Errorf("error fetching user: %v", err)
	}

	return &user, nil
}

// CreateRoom creates a new room in the database
func CreateRoom(roomID string, userID int64) (*DbRoom, error) {
	_, err := db.Exec(
		"INSERT INTO rooms (id, created_by) VALUES (?, ?)",
		roomID,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("error creating room: %v", err)
	}

	// Fetch the created room
	room, err := GetRoomByID(roomID)
	if err != nil {
		return nil, fmt.Errorf("error fetching created room: %v", err)
	}

	logMessage("INFO", "Room created in database: %s (Created by: %d)", roomID, userID)
	return room, nil
}

// GetRoomByID retrieves a room by ID
func GetRoomByID(roomID string) (*DbRoom, error) {
	var room DbRoom
	err := db.QueryRow(
		"SELECT id, created_by, created_at FROM rooms WHERE id = ?",
		roomID,
	).Scan(&room.ID, &room.CreatedBy, &room.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil // Room not found, but not an error
	} else if err != nil {
		return nil, fmt.Errorf("error fetching room: %v", err)
	}

	return &room, nil
}

// GetRoomsByUserID retrieves all rooms created by a specific user
func GetRoomsByUserID(userID int64) ([]*DbRoom, error) {
	rows, err := db.Query(
		"SELECT id, created_by, created_at FROM rooms WHERE created_by = ?",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("error fetching user's rooms: %v", err)
	}
	defer rows.Close()

	var rooms []*DbRoom
	for rows.Next() {
		var room DbRoom
		if err := rows.Scan(&room.ID, &room.CreatedBy, &room.CreatedAt); err != nil {
			return nil, fmt.Errorf("error scanning room row: %v", err)
		}
		rooms = append(rooms, &room)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating room rows: %v", err)
	}

	return rooms, nil
}

// GetAllRooms retrieves all rooms
func GetAllRooms() ([]*DbRoom, error) {
	rows, err := db.Query("SELECT id, created_by, created_at FROM rooms")
	if err != nil {
		return nil, fmt.Errorf("error fetching all rooms: %v", err)
	}
	defer rows.Close()

	var rooms []*DbRoom
	for rows.Next() {
		var room DbRoom
		if err := rows.Scan(&room.ID, &room.CreatedBy, &room.CreatedAt); err != nil {
			return nil, fmt.Errorf("error scanning room row: %v", err)
		}
		rooms = append(rooms, &room)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating room rows: %v", err)
	}

	return rooms, nil
}

// DeleteRoom deletes a room by ID
func DeleteRoom(roomID string) error {
	_, err := db.Exec("DELETE FROM rooms WHERE id = ?", roomID)
	if err != nil {
		return fmt.Errorf("error deleting room: %v", err)
	}

	logMessage("INFO", "Room deleted from database: %s", roomID)
	return nil
}
