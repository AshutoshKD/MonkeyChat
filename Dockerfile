# Build stage
FROM golang:1.23 as backend-builder

# Set working directory
WORKDIR /app

# Copy go.mod and go.sum first for better caching
COPY backend/go.mod backend/go.sum ./

# Download dependencies
RUN go mod download

# Copy backend files
COPY backend/ .

# Build the Go application
RUN GOOS=linux GOARCH=amd64 go build -o main

# Frontend build stage
FROM node:20 as frontend-builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for better caching
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy frontend files
COPY frontend/ .

# Build frontend
RUN npm run build

# Final stage
FROM ubuntu:22.04

# Install Python for the HTTP server
RUN apt-get update && \
    apt-get install -y python3 && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the built backend binary
COPY --from=backend-builder /app/main .

# Copy the built frontend files
COPY --from=frontend-builder /app/dist ./dist

# Copy start script
COPY start.sh .

# Make scripts executable
RUN chmod +x start.sh main

# Expose ports
EXPOSE 8080 3000

# Start the application
CMD ["./start.sh"] 