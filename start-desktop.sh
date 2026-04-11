#!/bin/bash

# Flowmind Desktop Viewer Launcher

set -e

cd "$(dirname "$0")"
FLOWMIND_DIR="$(pwd)"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🧠 Flowmind Desktop Viewer                                ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Install electron if not present
if [ ! -f "apps/desktop-viewer/node_modules/.bin/electron" ]; then
    echo "⚠️  Electron not found. Installing..."
    cd apps/desktop-viewer
    npm install
    cd ../..
fi

# Launch Electron using local binary
echo "🚀 Starting Desktop Viewer..."
cd apps/desktop-viewer
"$(pwd)/node_modules/.bin/electron" src/main.js
