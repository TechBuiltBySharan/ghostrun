#!/bin/bash

echo "Testing GhostRun functionality..."
echo "================================="

# Clean up
rm -rf ~/.ghostrun 2>/dev/null || true

# Kill any existing server
pkill -f "python3 -m http.server 3333" 2>/dev/null || true

# Start mock server
echo ""
echo "Starting mock server..."
cd mock-app
python3 -m http.server 3333 > server.log 2>&1 &
SERVER_PID=$!
sleep 2

cd ..

echo ""
echo "1. Testing initialization..."
node ghostrun.js init

echo ""
echo "2. Testing flow creation via direct DB insert (simulating learned flow)..."
node -e "
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.ghostrun', 'data', 'ghostrun.db');
const MOCK_URL = 'http://localhost:3333';

const db = new Database(DB_PATH);
const flowId = uuidv4();
const now = new Date().toISOString();

const graph = {
  nodes: [
    { id: 'start', type: 'start', label: 'Navigate to Login', action: 'navigate', url: MOCK_URL + '/login.html' },
    { id: 'step-1', type: 'action', label: 'Fill email', action: 'fill', selector: '#email', value: 'test@flowmind.com' },
    { id: 'step-2', type: 'action', label: 'Fill phone', action: 'fill', selector: '#phone', value: '555-123-4567' },
    { id: 'step-3', type: 'action', label: 'Fill password', action: 'fill', selector: '#password', value: 'password123' },
    { id: 'step-4', type: 'action', label: 'Click submit', action: 'click', selector: '#submit-btn' },
    { id: 'step-5', type: 'action', label: 'Verify dashboard', action: 'assert:visible', selector: '#dashboard', value: 'Dashboard loaded' },
    { id: 'end', type: 'end', label: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'step-1' },
    { id: 'e2', source: 'step-1', target: 'step-2' },
    { id: 'e3', source: 'step-2', target: 'step-3' },
    { id: 'e4', source: 'step-3', target: 'step-4' },
    { id: 'e5', source: 'step-4', target: 'step-5' },
    { id: 'e6', source: 'step-5', target: 'end' }
  ],
  appUrl: MOCK_URL,
};

db.prepare('INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(flowId, 'Login Flow Test', 'Test login functionality', MOCK_URL, JSON.stringify(graph), now, now);

console.log('✓ Created flow: ' + flowId.slice(0, 8));
"

echo ""
echo "3. Listing flows..."
node ghostrun.js flow:list

echo ""
echo "4. Running the flow..."
FLOW_ID=$(node -e "
const Database = require('better-sqlite3');
const path = require('path');
const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.ghostrun', 'data', 'ghostrun.db');
const db = new Database(DB_PATH);
const flow = db.prepare('SELECT id FROM flows').get();
console.log(flow.id);
")

node ghostrun.js run $FLOW_ID --visible --output json

echo ""
echo "5. Checking run history..."
node ghostrun.js run:list

echo ""
echo "6. Checking status..."
node ghostrun.js status

# Kill server
kill $SERVER_PID 2>/dev/null

echo ""
echo "Test complete!"