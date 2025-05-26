FROM golang:1.21 as backend-builder

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy the entire project
COPY . .

# Make scripts executable
RUN chmod +x build.sh start.sh

# Build the application
RUN ./build.sh

# Start the application
CMD ["./start.sh"] 