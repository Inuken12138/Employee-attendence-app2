#!/bin/bash

# Employee Attendance App - Automated Startup Script
# This script automates the startup process for both backend and frontend

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory (works even if called from elsewhere)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Employee Attendance App Startup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Step 1: Check if virtual environment exists
echo -e "${YELLOW}[1/5] Checking virtual environment...${NC}"
if [ ! -d ".songfeiVENV" ]; then
    echo -e "${RED}Error: Virtual environment '.songfeiVENV' not found!${NC}"
    echo "Please run: python3 -m venv .songfeiVENV && source .songfeiVENV/bin/activate && pip install -r requirements.txt"
    exit 1
fi
echo -e "${GREEN}✓ Virtual environment found${NC}"
echo ""

# Step 2: Start PostgreSQL
echo -e "${YELLOW}[2/5] Starting PostgreSQL...${NC}"
if ! sudo service postgresql status > /dev/null 2>&1; then
    sudo service postgresql start
    echo -e "${GREEN}✓ PostgreSQL started${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL already running${NC}"
fi
echo ""

# Step 3: Activate virtual environment and start Django backend
echo -e "${YELLOW}[3/5] Starting Django backend server...${NC}"
cd "$SCRIPT_DIR/django_backend"

# Create a log directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Start backend in background
nohup bash -c "source '$SCRIPT_DIR/.songfeiVENV/bin/activate' && python manage.py runserver 0.0.0.0:8000" > "$SCRIPT_DIR/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$SCRIPT_DIR/.backend.pid"
echo -e "${GREEN}✓ Django backend started (PID: $BACKEND_PID)${NC}"
echo "  Backend logs: $SCRIPT_DIR/logs/backend.log"
echo "  Backend URL: http://localhost:8000/"
echo "  Admin URL: http://localhost:8000/admin"
echo ""

# Wait a moment for backend to start
sleep 3

# Step 4: Start Next.js frontend
echo -e "${YELLOW}[4/5] Starting Next.js frontend server...${NC}"
cd "$SCRIPT_DIR/nextjs_frontend/songfei"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}node_modules not found. Installing dependencies...${NC}"
    npm install
fi

# Start frontend in background
nohup npm run dev > "$SCRIPT_DIR/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$SCRIPT_DIR/.frontend.pid"
echo -e "${GREEN}✓ Next.js frontend started (PID: $FRONTEND_PID)${NC}"
echo "  Frontend logs: $SCRIPT_DIR/logs/frontend.log"
echo ""

# Wait a moment for frontend to start
sleep 3

# Step 5: Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}[5/5] Startup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Services running:${NC}"
echo "  • PostgreSQL: Running"
echo "  • Django Backend (PID: $BACKEND_PID): http://localhost:8000/"
echo "  • Next.js Frontend (PID: $FRONTEND_PID): http://localhost:3000/"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo "  Backend:  tail -f $SCRIPT_DIR/logs/backend.log"
echo "  Frontend: tail -f $SCRIPT_DIR/logs/frontend.log"
echo ""
echo -e "${YELLOW}To stop all services:${NC}"
echo "  Run: ./stop.sh"
echo "  Or manually: kill $BACKEND_PID $FRONTEND_PID && sudo service postgresql stop"
echo ""
