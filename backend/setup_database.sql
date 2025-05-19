-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS monkeychat;

-- Use the database
USE monkeychat;

-- Drop existing tables if needed to avoid constraint issues
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(50) NOT NULL,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_room_user FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create some indexes for better performance
CREATE INDEX idx_rooms_created_by ON rooms(created_by); 