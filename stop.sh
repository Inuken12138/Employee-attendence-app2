#!/bin/bash

# Employee Attendance App - Automated Stop Script
# This script gracefully stops all services

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Employee Attendance App Shutdown${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Stop backend
echo -e "${YELLOW}[1/3] Stopping Django backend...${NC}"
if [ -f "$SCRIPT_DIR/.backend.pid" ]; then
    BACKEND_PID=$(cat "$SCRIPT_DIR/.backend.pid")
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        rm "$SCRIPT_DIR/.backend.pid"
        echo -e "${GREEN}✓ Django backend stopped (PID: $BACKEND_PID)${NC}"
    else
        echo -e "${YELLOW}Backend process not running${NC}"
        rm "$SCRIPT_DIR/.backend.pid"
    fi
else
    echo -e "${YELLOW}No backend PID file found${NC}"
fi
echo ""

# Stop frontend
echo -e "${YELLOW}[2/3] Stopping Next.js frontend...${NC}"
if [ -f "$SCRIPT_DIR/.frontend.pid" ]; then
    FRONTEND_PID=$(cat "$SCRIPT_DIR/.frontend.pid")
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        rm "$SCRIPT_DIR/.frontend.pid"
        echo -e "${GREEN}✓ Next.js frontend stopped (PID: $FRONTEND_PID)${NC}"
    else
        echo -e "${YELLOW}Frontend process not running${NC}"
        rm "$SCRIPT_DIR/.frontend.pid"
    fi
else
    echo -e "${YELLOW}No frontend PID file found${NC}"
fi
echo ""

# Stop PostgreSQL (optional - user can choose to keep it running)
echo -e "${YELLOW}[3/3] Stopping PostgreSQL...${NC}"
read -p "Do you want to stop PostgreSQL? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo service postgresql stop
    echo -e "${GREEN}✓ PostgreSQL stopped${NC}"
else
    echo -e "${YELLOW}PostgreSQL left running${NC}"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Shutdown Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
