#!/bin/bash

# Check if mysql command is available
if ! command -v mysql &> /dev/null
then
    echo "mysql command could not be found. Please install MySQL."
    exit 1
fi

# Default values
DB_USER="root"
DB_PASSWORD="admin123"  # Empty default password
DB_HOST="localhost"
DB_PORT="3306"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --user=*)
      DB_USER="${1#*=}"
      shift
      ;;
    --password=*)
      DB_PASSWORD="${1#*=}"
      shift
      ;;
    --host=*)
      DB_HOST="${1#*=}"
      shift
      ;;
    --port=*)
      DB_PORT="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

echo "Setting up MonkeyChat database with:"
echo "  User: $DB_USER"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"

# Run the SQL script
if [ -z "$DB_PASSWORD" ]; then
  # If password is empty, don't include password parameter
  mysql -u"$DB_USER" -h"$DB_HOST" -P"$DB_PORT" < setup_database.sql
else
  mysql -u"$DB_USER" -p"$DB_PASSWORD" -h"$DB_HOST" -P"$DB_PORT" < setup_database.sql
fi

if [ $? -eq 0 ]; then
    echo "Database setup completed successfully!"
    
    # Export environment variables for the Go application
    export DB_USERNAME="$DB_USER"
    export DB_PASSWORD="$DB_PASSWORD"
    export DB_HOST="$DB_HOST"
    export DB_PORT="$DB_PORT"
    export DB_NAME="monkeychat"
    
    echo ""
    echo "Environment variables have been set for this session:"
    echo "  DB_USERNAME=$DB_USER"
    echo "  DB_PASSWORD=******"
    echo "  DB_HOST=$DB_HOST"
    echo "  DB_PORT=$DB_PORT"
    echo "  DB_NAME=monkeychat"
    echo ""
    echo "To make these permanent, add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "export DB_USERNAME=\"$DB_USER\""
    echo "export DB_PASSWORD=\"$DB_PASSWORD\""
    echo "export DB_HOST=\"$DB_HOST\""
    echo "export DB_PORT=\"$DB_PORT\""
    echo "export DB_NAME=\"monkeychat\""
    echo ""
    echo "You can now run the application with: go run ."
else
    echo "Failed to set up database. Please check your MySQL credentials and permissions."
    echo "Possible solutions:"
    echo "  1. Try with an empty password (many default MySQL installations)"
    echo "  2. Use your actual MySQL password"
    echo "  3. Create a new MySQL user with:"
    echo "     mysql -u root -p"
    echo "     CREATE USER 'monkeychat'@'localhost' IDENTIFIED BY 'password';"
    echo "     GRANT ALL PRIVILEGES ON monkeychat.* TO 'monkeychat'@'localhost';"
    echo "     FLUSH PRIVILEGES;"
    echo "     exit"
    echo "     Then use: ./setup_db.sh --user=monkeychat --password=password"
    exit 1
fi 