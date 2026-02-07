#!/bin/bash

# Employee Attendance App - Automated Stop Script
# This script gracefully stops all services

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# helper: stop a process from a pidfile
stop_from_pidfile() {
    local pidfile=$1
    local name=$2
    local graceful_timeout=${3:-5} # seconds to wait for graceful stop

    echo -e "${YELLOW}Stopping ${name}...${NC}"

    if [ ! -f "$pidfile" ]; then
        echo -e "${YELLOW}No ${name} PID file found (${pidfile})${NC}"
        echo ""
        return
    fi

    PID="$(cat "$pidfile" 2>/dev/null || true)"
    # trim whitespace
    PID="${PID##*( )}"
    PID="${PID%%*( )}"

    if [[ -z "$PID" ]]; then
        echo -e "${YELLOW}PID file is empty, removing: $pidfile${NC}"
        rm -f "$pidfile"
        echo ""
        return
    fi

    if ! [[ "$PID" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}Invalid PID in $pidfile: '$PID' — removing file${NC}"
        rm -f "$pidfile"
        echo ""
        return
    fi

    if ! kill -0 "$PID" 2>/dev/null; then
        echo -e "${YELLOW}${name} process (PID: $PID) not running, removing PID file${NC}"
        rm -f "$pidfile"
        echo ""
        return
    fi

    # try graceful termination
    if kill "$PID" 2>/dev/null; then
        echo -e "${GREEN}Sent SIGTERM to ${name} (PID: $PID). Waiting up to ${graceful_timeout}s for exit...${NC}"
    else
        echo -e "${RED}Failed to send SIGTERM to PID $PID. You may need to run this as a user with permission (or use sudo).${NC}"
    fi

    local waited=0
    while kill -0 "$PID" 2>/dev/null && [ $waited -lt $graceful_timeout ]; do
        sleep 1
        waited=$((waited+1))
    done

    if kill -0 "$PID" 2>/dev/null; then
        echo -e "${YELLOW}${name} did not exit after ${graceful_timeout}s, sending SIGKILL...${NC}"
        if kill -9 "$PID" 2>/dev/null; then
            sleep 1
            if kill -0 "$PID" 2>/dev/null; then
                echo -e "${RED}Failed to kill ${name} (PID: $PID). You may need to investigate manually.${NC}"
            else
                echo -e "${GREEN}✓ ${name} force-killed (PID: $PID)${NC}"
                rm -f "$pidfile"
            fi
        else
            echo -e "${RED}Failed to send SIGKILL to PID $PID. Permission issue?${NC}"
        fi
    else
        echo -e "${GREEN}✓ ${name} stopped (PID: $PID)${NC}"
        rm -f "$pidfile"
    fi

    echo ""
}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Employee Attendance App Shutdown${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1) Stop backend
echo -e "${YELLOW}[1/3] Stopping Django backend...${NC}"
stop_from_pidfile "$SCRIPT_DIR/.backend.pid" "Django backend" 5

# 2) Stop frontend (PID-based first)
FRONTEND_PORT=3000
echo -e "${YELLOW}[2/3] Stopping Next.js frontend...${NC}"
stop_from_pidfile "$SCRIPT_DIR/.frontend.pid" "Next.js frontend" 5

# If site still accessible, fallback: kill any process listening on $FRONTEND_PORT
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:$FRONTEND_PORT -sTCP:LISTEN -P -n >/dev/null 2>&1; then
    echo -e "${YELLOW}Detected a process still listening on port ${FRONTEND_PORT}. Attempting to stop it...${NC}"
    PIDS=$(lsof -t -i:$FRONTEND_PORT 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "Found PIDs: $PIDS"
        sudo kill $PIDS 2>/dev/null || true
        sleep 1
        REMAIN=$(lsof -t -i:$FRONTEND_PORT 2>/dev/null || true)
        if [ -n "$REMAIN" ]; then
            echo -e "${YELLOW}Forcing kill on: $REMAIN${NC}"
            sudo kill -9 $REMAIN 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ Processes on port ${FRONTEND_PORT} killed${NC}"
    else
        echo -e "${YELLOW}No PIDs found on port ${FRONTEND_PORT}${NC}"
    fi
fi

echo ""

# 3) Stop PostgreSQL (optional - user can choose to keep it running)
echo -e "${YELLOW}[3/3] Stopping PostgreSQL...${NC}"
read -p "Do you want to stop PostgreSQL? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if sudo service postgresql stop; then
        echo -e "${GREEN}✓ PostgreSQL stopped${NC}"
    else
        echo -e "${RED}Failed to stop PostgreSQL. You may need to run this script with permissions or stop it manually.${NC}"
    fi
else
    echo -e "${YELLOW}PostgreSQL left running${NC}"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Shutdown Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""