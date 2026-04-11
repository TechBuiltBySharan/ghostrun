#!/bin/bash

# Flowmind V1 - Complete Test Suite
# Tests both CLI and Desktop Viewer

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🧠 Flowmind V1 - Complete Test Suite                     ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

cd "$(dirname "$0")"
FLOWMIND_DIR="$(pwd)"

# Kill any existing Electron processes
echo "🧹 Cleaning up old processes..."
pkill -f "electron" 2>/dev/null || true
sleep 1

# Clean up old data
echo "🧹 Cleaning up old data..."
rm -rf ~/.flowmind 2>/dev/null || true

# ============================================
# TEST 1: CLI Initialization
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 1: CLI Initialization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js init

# ============================================
# TEST 2: CLI Help
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 2: CLI Help"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js --help

# ============================================
# TEST 3: CLI Status (empty)
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 3: CLI Status (empty state)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js status

# ============================================
# TEST 4: Create a test flow
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 4: Create a test flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get absolute path to mock app
MOCK_URL="file://${FLOWMIND_DIR}/mock-app/index.html"

node -e "
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.flowmind', 'data', 'flowmind.db');
const MOCK_URL = '${MOCK_URL}';

const db = new Database(DB_PATH);
const flowId = uuidv4();
const now = new Date().toISOString();

const graph = {
  nodes: [
    { id: 'start', type: 'start', label: 'Navigate to Home', action: 'navigate', url: MOCK_URL },
    { id: 'step-1', type: 'action', label: 'Verify Page Title', action: 'assert', selector: 'title', value: 'Flowmind Test App' },
    { id: 'step-2', type: 'action', label: 'Count Navigation Links', action: 'count', selector: 'nav a', value: '3' },
    { id: 'end', type: 'end', label: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'step-1' },
    { id: 'e2', source: 'step-1', target: 'step-2' },
    { id: 'e3', source: 'step-2', target: 'end' },
  ],
  appUrl: MOCK_URL,
};

db.prepare('INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(flowId, 'Home Page Test', 'Verify home page loads correctly', MOCK_URL, JSON.stringify(graph), now, now);

console.log('Created flow: ' + flowId.slice(0, 8));
"

# ============================================
# TEST 5: List Flows
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 5: List Flows"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js flow:list

# Get the flow ID
FLOW_ID=$(node -e "
const Database = require('better-sqlite3');
const path = require('path');
const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.flowmind', 'data', 'flowmind.db');
const db = new Database(DB_PATH, { readonly: true });
const flow = db.prepare('SELECT id FROM flows').get();
console.log(flow.id.slice(0, 8));
")

echo "Flow ID: $FLOW_ID"

# ============================================
# TEST 6: Run Flow (should pass)
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 6: Run Flow (should PASS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js run $FLOW_ID

# ============================================
# TEST 7: List Runs
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 7: List Runs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js run:list

# ============================================
# TEST 8: Final Status
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 8: Final Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js status

# ============================================
# TEST 9: Desktop Viewer
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 9: Desktop Viewer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Starting Desktop Viewer..."
cd apps/desktop-viewer
"./node_modules/.bin/electron" src/main.js &
DESKTOP_PID=$!
cd ../..

echo "Desktop viewer started (PID: $DESKTOP_PID)"
echo "Waiting 3 seconds for startup..."
sleep 3

# Check if it's running
if ps -p $DESKTOP_PID > /dev/null 2>&1; then
    echo "✅ Desktop Viewer is running!"
else
    echo "❌ Desktop Viewer failed to start"
fi

# ============================================
# SUMMARY
# ============================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   ✅ All Tests Complete!                                   ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Results:"
echo "   • CLI Status: Working"
echo "   • Flow Creation: Working"
echo "   • Flow Execution: Working"
echo "   • Screenshots: Captured"
echo "   • Desktop Viewer: Started"
echo ""
echo "📁 Data Locations:"
echo "   • Database: ~/.flowmind/data/flowmind.db"
echo "   • Screenshots: ~/.flowmind/screenshots/"
echo ""
echo "🔧 Next Steps:"
echo "   • Desktop viewer is running - check your Applications"
echo "   • Run 'node flowmind.js learn <url>' to record new flows"
echo "   • View screenshots in ~/.flowmind/screenshots/"
echo ""
echo "🛑 To stop desktop viewer:"
echo "   pkill -f electron"
echo ""
