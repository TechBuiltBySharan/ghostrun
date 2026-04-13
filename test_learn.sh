#!/bin/bash

echo "Testing GhostRun learn mode..."
echo "==============================="

# First, let's check if we can initialize
echo ""
echo "1. Testing initialization..."
node ghostrun.js init

echo ""
echo "2. Testing learn command (this will open a browser for 10 seconds)..."
echo "   We'll test with: http://localhost:3333"
echo "   Note: This test will timeout after 10 seconds as we can't automate browser interaction"
echo ""

# Start learn in background with a timeout
timeout 15 node ghostrun.js learn http://localhost:3333 "Test Flow" &
LEARN_PID=$!

# Wait a bit, then kill it
sleep 10
kill $LEARN_PID 2>/dev/null

echo ""
echo "3. Checking if flows were created..."
node ghostrun.js flow:list

echo ""
echo "4. Checking status..."
node ghostrun.js status

echo ""
echo "Test complete!"