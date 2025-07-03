package main

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var db *sql.DB

// DbUser represents a user record in the database
type DbUser struct {
	ID         int64     `json:"id"`
	Username   string    `json:"username"`
	Password   string    `json:"-"` // Hashed password, not returned in JSON
	Bio        string    `json:"bio"`
	ProfilePic string    `json:"profilePic"`
	CreatedAt  time.Time `json:"createdAt"`
}

// DbRoom represents a room record in the database
type DbRoom struct {
	ID        string    `json:"id"`
	CreatedBy int64     `json:"createdBy"` // Foreign key to users.id
	CreatedAt time.Time `json:"createdAt"`
}

// InitDatabase initializes the database connection and creates tables if they don't exist
func InitDatabase() error {
	// Check if we're in production or development
	isProd := os.Getenv("ENV") == "production"

	// Read DB config from environment variables (after godotenv.Load)
	dbUsername := os.Getenv("DB_USERNAME")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbName := os.Getenv("DB_NAME")

	// Log environment variables
	logMessage("DEBUG", "Database configuration: username=%s, host=%s, port=%s, dbname=%s",
		dbUsername, dbHost, dbPort, dbName)

	// Configure DSN based on environment
	var dsn string
	if isProd {
		// Production: Use TiDB Cloud with TLS
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&tls=skip-verify",
			dbUsername, dbPassword, dbHost, dbPort, dbName)
	} else {
		// Development: Use local MySQL
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
			dbUsername, dbPassword, dbHost, dbPort, dbName)
	}

	logMessage("DEBUG", "DSN configured for %s environment", func() string {
		if isProd {
			return "production"
		}
		return "development"
	}())

	var err error
	logMessage("DEBUG", "Opening database connection...")
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		logMessage("ERROR", "Failed to open database connection: %v", err)
		return fmt.Errorf("error opening database connection: %v", err)
	}

	// Set connection pool settings
	if isProd {
		// Production settings
		db.SetMaxOpenConns(10)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(time.Hour)
		logMessage("DEBUG", "Applied production connection pool settings")
	} else {
		// Development settings
		db.SetMaxOpenConns(5)
		db.SetMaxIdleConns(2)
		db.SetConnMaxLifetime(30 * time.Minute)
		logMessage("DEBUG", "Applied development connection pool settings")
	}

	// Test the connection
	logMessage("DEBUG", "Testing database connection with ping...")
	if err = db.Ping(); err != nil {
		logMessage("ERROR", "Failed to ping database: %v", err)
		return fmt.Errorf("error connecting to the database: %v", err)
	}

	envMsg := "development"
	if isProd {
		envMsg = "production"
	}
	logMessage("INFO", "Connected to %s database in %s environment", dbName, envMsg)

	// Create tables if they don't exist
	if err = createTables(); err != nil {
		return fmt.Errorf("error creating tables: %v", err)
	}

	// --- AUTO-MIGRATION: Add missing columns if needed ---
	if err = autoMigrateUsersTable(); err != nil {
		return fmt.Errorf("error in auto-migration: %v", err)
	}

	return nil
}

// createTables creates the necessary tables if they don't exist
func createTables() error {
	logMessage("DEBUG", "Creating database tables if they don't exist...")

	// Create users table
	logMessage("DEBUG", "Creating users table...")
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id BIGINT NOT NULL AUTO_INCREMENT,
			username VARCHAR(50) NOT NULL UNIQUE,
			password VARCHAR(100) NOT NULL,
			bio TEXT,
			profile_pic TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id)
		)
	`)
	if err != nil {
		logMessage("ERROR", "Failed to create users table: %v", err)
		return fmt.Errorf("error creating users table: %v", err)
	}
	logMessage("DEBUG", "Users table created successfully")

	// Create rooms table
	logMessage("DEBUG", "Creating rooms table...")
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
		logMessage("ERROR", "Failed to create rooms table: %v", err)
		return fmt.Errorf("error creating rooms table: %v", err)
	}
	logMessage("DEBUG", "Rooms table created successfully")

	logMessage("INFO", "All database tables created successfully")
	return nil
}

// CreateUser creates a new user in the database
func CreateUser(username, passwordHash string) (*DbUser, error) {
	logMessage("DEBUG", "Attempting to create user: %s", username)

	result, err := db.Exec(
		"INSERT INTO users (username, password) VALUES (?, ?)",
		username,
		passwordHash,
	)
	if err != nil {
		logMessage("ERROR", "Failed to execute INSERT query for user '%s': %v", username, err)
		return nil, fmt.Errorf("error creating user: %v", err)
	}

	logMessage("DEBUG", "INSERT query executed successfully for user: %s", username)

	userID, err := result.LastInsertId()
	if err != nil {
		logMessage("ERROR", "Failed to get last insert ID for user '%s': %v", username, err)
		return nil, fmt.Errorf("error getting user ID: %v", err)
	}

	logMessage("DEBUG", "User '%s' inserted with ID: %d", username, userID)

	// Fetch the created user
	logMessage("DEBUG", "Fetching created user by ID: %d", userID)
	user, err := GetUserByID(userID)
	if err != nil {
		logMessage("ERROR", "Failed to fetch created user '%s' with ID %d: %v", username, userID, err)
		return nil, fmt.Errorf("error fetching created user: %v", err)
	}

	logMessage("INFO", "User created successfully in database: %s (ID: %d)", username, userID)
	return user, nil
}

// GetUserByUsername retrieves a user by username
func GetUserByUsername(username string) (*DbUser, error) {
	var user DbUser
	err := db.QueryRow(
		"SELECT id, username, password, COALESCE(bio, ''), COALESCE(profile_pic, ''), created_at FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.Password, &user.Bio, &user.ProfilePic, &user.CreatedAt)

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
		"SELECT id, username, password, COALESCE(bio, ''), COALESCE(profile_pic, ''), created_at FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &user.Password, &user.Bio, &user.ProfilePic, &user.CreatedAt)

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

// UpdateUserProfile updates a user's profile by username
func UpdateUserProfile(oldUsername, newUsername, bio, profilePic string) error {
	_, err := db.Exec("UPDATE users SET username = ?, bio = ?, profile_pic = ? WHERE username = ?", newUsername, bio, profilePic, oldUsername)
	return err
}

// autoMigrateUsersTable checks and adds missing columns to the users table
func autoMigrateUsersTable() error {
	columns := []struct {
		Name       string
		Definition string
	}{
		{"bio", "TEXT"},
		{"profile_pic", "TEXT"},
	}
	for _, col := range columns {
		var exists int
		query := `SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`
		err := db.QueryRow(query, col.Name).Scan(&exists)
		if err != nil {
			return fmt.Errorf("error checking for column '%s': %v", col.Name, err)
		}
		if exists == 0 {
			alter := fmt.Sprintf("ALTER TABLE users ADD COLUMN %s %s", col.Name, col.Definition)
			_, err := db.Exec(alter)
			if err != nil {
				return fmt.Errorf("error adding '%s' column: %v", col.Name, err)
			}
			logMessage("INFO", "Added missing column '%s' to users table", col.Name)
		} else {
			// Column exists, check if it's nullable and fix if needed
			logMessage("DEBUG", "Column '%s' already exists, checking if it needs to be made nullable", col.Name)
			var isNullable string
			nullQuery := `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`
			err := db.QueryRow(nullQuery, col.Name).Scan(&isNullable)
			if err != nil {
				logMessage("WARN", "Could not check nullability of column '%s': %v", col.Name, err)
			} else if isNullable == "NO" {
				// Column is NOT NULL, make it nullable
				logMessage("INFO", "Making column '%s' nullable", col.Name)
				alter := fmt.Sprintf("ALTER TABLE users MODIFY COLUMN %s %s", col.Name, col.Definition)
				_, err := db.Exec(alter)
				if err != nil {
					logMessage("ERROR", "Failed to modify column '%s' to be nullable: %v", col.Name, err)
				} else {
					logMessage("INFO", "Successfully modified column '%s' to be nullable", col.Name)
				}
			}
		}
	}
	return nil
}
