#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "   CRM Local Development"
echo "============================================"
echo ""

if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js not found!${NC}"
    echo "Install from: https://nodejs.org"
    exit 1
fi

echo -e "${YELLOW}[1/4] Setting up environment...${NC}"
cp -f "$DIR/.env.development" "$DIR/backend/.env"

if [ ! -d "$DIR/node_modules" ]; then
    echo -e "${YELLOW}[2/4] Installing frontend dependencies...${NC}"
    cd "$DIR" && npm install
else
    echo -e "${GREEN}[2/4] Frontend deps OK${NC}"
fi

if [ ! -d "$DIR/backend/node_modules" ]; then
    echo -e "${YELLOW}[3/4] Installing backend dependencies...${NC}"
    cd "$DIR/backend" && npm install
    cd "$DIR"
else
    echo -e "${GREEN}[3/4] Backend deps OK${NC}"
fi

echo -e "${YELLOW}[4/4] Building & starting backend...${NC}"
cd "$DIR/backend" && npx tsup src/server.ts --format cjs --clean > /dev/null 2>&1
cd "$DIR"

# Start backend in background with log
cd "$DIR/backend"
node dist/server.js > "$DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$DIR"

echo "  Backend PID: $BACKEND_PID"
echo "  Waiting for backend to start..."
sleep 4

# Check if backend is running
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend failed to start!${NC}"
    echo ""
    echo "Last 30 lines of backend.log:"
    echo "---"
    tail -30 "$DIR/backend.log"
    echo "---"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ Backend is running on http://localhost:5000${NC}"
echo ""
echo "  Frontend: http://localhost:8080"
echo "  Backend:  http://localhost:5000"
echo "  API:      http://localhost:5000/api"
echo ""
echo "  Press Ctrl+C to stop everything"
echo "============================================"
echo ""

# Kill backend on Ctrl+C
trap "echo ''; echo '🛑 Stopping...'; kill $BACKEND_PID 2>/dev/null; exit 0" INT

# Start frontend in foreground
cd "$DIR"
npx vite --host 0.0.0.0 --port 8080
