#!/bin/bash

echo "Testing GhostRun with simple flow..."
echo "====================================="

# Clean up
rm -rf ~/.ghostrun 2>/dev/null || true

# Kill any existing server
pkill -f "python3 -m http.server 3333" 2>/dev/null || true

# Start mock server with simple static file
echo ""
echo "Starting simple HTTP server..."
cd /tmp
echo "<html><body><h1>Test Page</h1><input id='test' value='hello'></body></html>" > test.html
python3 -m http.server 3334 > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 1

cd /Volumes/DevAPFS/FlowMind/flowmind

echo ""
echo "1. Testing initialization..."
node ghostrun.js init

echo ""
echo "2. Testing flow creation (simple navigation)..."
node -e "
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.ghostrun', 'data', 'ghostrun.db');
const TEST_URL = 'http://localhost:3334/test.html';

const db = new Database(DB_PATH);
const flowId = uuidv4();
const now = new Date().toISOString();

const graph = {
  nodes: [
    { id: 'start', type: 'start', label: 'Navigate to test', action: 'navigate', url: TEST_URL },
    { id: 'step-1', type: 'action', label: 'Check page loaded', action: 'assert:visible', selector: 'body', value: 'Page loaded' },
    { id: 'end', type: 'end', label: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'step-1' },
    { id: 'e2', source: 'step-1', target: 'end' }
  ],
  appUrl: TEST_URL,
};

db.prepare('INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(flowId, 'Simple Test', 'Test simple page load', TEST_URL, JSON.stringify(graph), now, now);

console.log('✓ Created flow: ' + flowId.slice(0, 8));
"

echo ""
echo "3. Running the flow..."
FLOW_ID=$(node -e "
const Database = require('better-sqlite3');
const path = require('path');
const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.ghostrun', 'data', 'ghostrun.db');
const db = new Database(DB_PATH);
const flow = db.prepare('SELECT id FROM flows').get();
console.log(flow.id);
")

echo "Running flow: $FLOW_ID"
node ghostrun.js run $FLOW_ID

# Kill server
kill $SERVER_PID 2>/dev/null

echo ""
echo "Test complete!"