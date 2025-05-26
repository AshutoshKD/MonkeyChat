#!/bin/bash

# Build backend
echo "Building backend..."
cd backend
go build -o main
cd ..

# Build frontend
echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Create a directory for the combined build
mkdir -p dist
cp backend/main dist/
cp -r frontend/dist/* dist/
cp backend/.env dist/ 2>/dev/null || true

echo "Build completed!" 