#!/bin/bash

# Start the backend server in the background
cd dist
./main &
BACKEND_PID=$!

# Start a simple HTTP server for the frontend
python3 -m http.server 3000 &
FRONTEND_PID=$!

# Function to handle shutdown
function cleanup {
    echo "Shutting down services..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit 0
}

# Trap SIGTERM and SIGINT
trap cleanup SIGTERM SIGINT

# Keep the script running
while true; do
    sleep 1
done 