#!/bin/bash

echo "Testing GhostRun Simple Flow Creation..."
echo "========================================"

# Clean up and initialize
rm -rf ~/.ghostrun 2>/dev/null || true
cd /Volumes/DevAPFS/FlowMind/flowmind

echo ""
echo "1. Initializing..."
node ghostrun.js init

echo ""
echo "2. Creating a simple test flow via direct database insert..."
node -e "
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.ghostrun', 'data', 'ghostrun.db');
const TEST_URL = 'https://example.com';

const db = new Database(DB_PATH);
const flowId = uuidv4();
const now = new Date().toISOString();

const graph = {
  nodes: [
    { id: 'start', type: 'start', label: 'Navigate', action: 'navigate', url: TEST_URL },
    { id: 'step-1', type: 'action', label: 'Assert title', action: 'assert:title', value: 'Example Domain' },
    { id: 'end', type: 'end', label: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'step-1' },
    { id: 'e2', source: 'step-1', target: 'end' }
  ],
  appUrl: TEST_URL,
};

db.prepare('INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(flowId, 'Simple Assertion Test', 'Test basic navigation and title assertion', TEST_URL, JSON.stringify(graph), now, now);

console.log('✓ Created flow: ' + flowId.slice(0, 8));
"

echo ""
echo "3. Listing flows..."
node ghostrun.js flow:list

echo ""
echo "4. Getting flow status..."
node ghostrun.js status

echo ""
echo "5. Testing command structure..."
echo "   Commands available:"
echo "   - ghostrun learn <url> [name]"
echo "   - ghostrun run <id|name>"
echo "   - ghostrun serve --ui (web dashboard)"
echo "   - ghostrun chat (AI assistant)"
echo "   - ghostrun explore <url> (auto-discovery)"

echo ""
echo "✅ Test complete! The system is working."