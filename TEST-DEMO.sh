#!/bin/bash

# Flowmind V1 - Quick Demo Script
# This script demonstrates all the features working

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   ███████╗██╗   ██╗ ██████╗ ██████╗██╗    ██╗ █████╗      ║"
echo "║   ██╔════╝██║   ██║██╔═══██╗██╔════╝██║    ██║██╔══██╗     ║"
echo "║   ███████╗██║   ██║██║   ██║██║     ██║ █╗ ██║███████║     ║"
echo "║   ╚════██║██║   ██║██║   ██║██║     ██║███╗██║██╔══██║     ║"
echo "║   ███████║╚██████╔╝╚██████╔╝╚██████╗╚███╔███╔╝██║  ██║     ║"
echo "║   ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚══╝╚══╝ ╚═╝  ╚═╝     ║"
echo "║                                                            ║"
echo "║   V1 Demo - Complete Working Version                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Ensure we're in the right directory
cd "$(dirname "$0")"
FLOWMIND_DIR="$(pwd)"

# Clean up old data
echo "🧹 Cleaning up old data..."
rm -rf ~/.flowmind 2>/dev/null || true

# Initialize
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 1: Initialize Flowmind"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js init

# Create a simple flow with ABSOLUTE path
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 2: Create a test flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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
    { id: 'end', type: 'end', label: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'step-1' },
    { id: 'e2', source: 'step-1', target: 'end' },
  ],
  appUrl: MOCK_URL,
};

db.prepare('INSERT INTO flows (id, name, description, app_url, graph, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .run(flowId, 'Home Page Test', 'Verify home page loads correctly', MOCK_URL, JSON.stringify(graph), now, now);

console.log('Created flow: ' + flowId.slice(0, 8));
"

# List flows
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 3: List Flows"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js flow:list

# Get the flow ID
FLOW_ID=$(node -e "
const Database = require('better-sqlite3');
const path = require('path');
const HOME_DIR = process.env.HOME || '.';
const DB_PATH = path.join(HOME_DIR, '.flowmind', 'data', 'flowmind.db');
const db = new Database(DB_PATH);
const flow = db.prepare('SELECT id FROM flows').get();
console.log(flow.id.slice(0, 8));
")

# Run the flow
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 4: Run the Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js run $FLOW_ID

# List runs
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 5: List Runs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js run:list

# Show status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Step 6: Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node flowmind.js status

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✅ Demo Complete!"
echo ""
echo "  📁 Screenshots saved to: ~/.flowmind/screenshots/"
echo "  📊 Database location: ~/.flowmind/data/flowmind.db"
echo ""
echo "  🔧 Try these commands:"
echo "     node flowmind.js learn <url>    - Learn a new flow"
echo "     node flowmind.js run <id>       - Run a flow"
echo "     node flowmind.js run:show <id>  - View run details"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
