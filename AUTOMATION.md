# Automation Scripts Usage Guide

## Overview

This repository now includes automated startup and shutdown scripts that allow you to manage the entire Employee Attendance application stack with simple commands.

## Quick Reference

### Starting the Application
```bash
./start.sh
```

### Stopping the Application
```bash
./stop.sh
```

## What Gets Automated

The `start.sh` script performs the following tasks automatically:

1. **Checks Virtual Environment** - Verifies that `.songfeiVENV` exists
2. **Starts PostgreSQL** - Starts the PostgreSQL service if not already running
3. **Starts Django Backend** - Launches the Django server at http://localhost:8000/
4. **Starts Next.js Frontend** - Launches the Next.js dev server at http://localhost:3000/

All services run in the background, and their output is logged to:
- `logs/backend.log` - Django backend logs
- `logs/frontend.log` - Next.js frontend logs

## Script Features

### start.sh Features
- ✅ Automatic virtual environment validation
- ✅ PostgreSQL service management
- ✅ Background process execution
- ✅ PID tracking for process management
- ✅ Colored terminal output
- ✅ Comprehensive logging
- ✅ Works from any directory
- ✅ Error checking with helpful messages

### stop.sh Features
- ✅ Graceful process termination
- ✅ PID-based process management
- ✅ Optional PostgreSQL shutdown
- ✅ Cleanup of PID files
- ✅ Status reporting

## Usage Examples

### Starting the Application
```bash
# From the repository root
cd ~/project/songfei/Employee\ attendence\ app2
./start.sh
```

Expected output:
```
========================================
Employee Attendance App Startup
========================================

[1/5] Checking virtual environment...
✓ Virtual environment found

[2/5] Starting PostgreSQL...
✓ PostgreSQL started

[3/5] Starting Django backend server...
✓ Django backend started (PID: 12345)
  Backend logs: /path/to/logs/backend.log
  Backend URL: http://localhost:8000/
  Admin URL: http://localhost:8000/admin

[4/5] Starting Next.js frontend server...
✓ Next.js frontend started (PID: 12346)
  Frontend logs: /path/to/logs/frontend.log

[5/5] Startup Complete!
========================================

Services running:
  • PostgreSQL: Running
  • Django Backend (PID: 12345): http://localhost:8000/
  • Next.js Frontend (PID: 12346): http://localhost:3000/
```

### Stopping the Application
```bash
./stop.sh
```

You will be prompted whether to stop PostgreSQL:
```
Do you want to stop PostgreSQL? (y/n):
```

### Viewing Logs
```bash
# Watch backend logs in real-time
tail -f logs/backend.log

# Watch frontend logs in real-time
tail -f logs/frontend.log

# View last 50 lines of backend logs
tail -n 50 logs/backend.log
```

## Troubleshooting

### Issue: "Permission denied" when running scripts
**Solution**: Make the scripts executable
```bash
chmod +x start.sh stop.sh
```

### Issue: "Virtual environment '.songfeiVENV' not found"
**Solution**: Create and set up the virtual environment
```bash
python3 -m venv .songfeiVENV
source .songfeiVENV/bin/activate
pip install -r requirements.txt
```

### Issue: Services won't start
**Solution**: Check if ports are already in use
```bash
# Check backend port (8000)
lsof -i :8000

# Check frontend port (3000)
lsof -i :3000

# Kill process on port if needed
kill -9 <PID>
```

### Issue: PostgreSQL won't start
**Solution**: Check PostgreSQL status and logs
```bash
sudo service postgresql status
sudo tail /var/log/postgresql/postgresql-15-main.log
```

### Issue: Need to restart a service
**Solution**: Stop and start again
```bash
./stop.sh
./start.sh
```

## Advanced Usage

### Running Without PostgreSQL Auto-Start
If you want to manage PostgreSQL separately, edit `start.sh` and comment out the PostgreSQL section:

```bash
# Comment out lines 34-41 in start.sh
# echo -e "${YELLOW}[2/5] Starting PostgreSQL...${NC}"
# if ! sudo service postgresql status > /dev/null 2>&1; then
#     sudo service postgresql start
#     echo -e "${GREEN}✓ PostgreSQL started${NC}"
# else
#     echo -e "${GREEN}✓ PostgreSQL already running${NC}"
# fi
```

### Custom Log Locations
Edit the log paths in `start.sh` if you want logs elsewhere:

```bash
# Change line 51 and 74 to your preferred location
nohup ... > "/your/custom/path/backend.log" 2>&1 &
nohup ... > "/your/custom/path/frontend.log" 2>&1 &
```

## Process Management

### Checking Process Status
```bash
# Check if processes are running
ps aux | grep "manage.py runserver"
ps aux | grep "next-server"

# Check PIDs from files
cat .backend.pid
cat .frontend.pid
```

### Manual Process Termination
If `stop.sh` doesn't work, you can manually kill processes:
```bash
# Kill backend
kill $(cat .backend.pid)

# Kill frontend
kill $(cat .frontend.pid)

# Or kill by port
kill -9 $(lsof -t -i:8000)  # Backend
kill -9 $(lsof -t -i:3000)  # Frontend
```

## File Structure

```
Employee-attendence-app2/
├── start.sh              # Main startup script
├── stop.sh               # Shutdown script
├── .backend.pid          # Backend process ID (auto-generated)
├── .frontend.pid         # Frontend process ID (auto-generated)
├── logs/                 # Log directory (auto-generated)
│   ├── backend.log       # Django backend logs
│   └── frontend.log      # Next.js frontend logs
├── django_backend/       # Django application
├── nextjs_frontend/      # Next.js application
└── .songfeiVENV/         # Python virtual environment
```

## Notes

- The scripts are designed to work from the repository root directory
- All services run in the background as daemon processes
- Log files are rotated automatically by the system
- PID files are used to track and manage background processes
- PostgreSQL typically remains running between development sessions
- The scripts work on both WSL2 and native Linux environments

## See Also

- Main README.md for complete setup instructions
- Django backend documentation in `django_backend/`
- Next.js frontend documentation in `nextjs_frontend/songfei/`
