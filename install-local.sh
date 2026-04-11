#!/bin/bash

# Flowmind V1 - Local Install Script
# Run this from ANY project to install Flowmind as a local dependency
#
# Usage:
#   cd my-project
#   bash /path/to/flowmind/install-local.sh
#
# This copies flowmind to node_modules/@flowmind/cli and creates a symlink

set -e

# Get the Flowmind directory (where this script is located)
FLOWMIND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Get the target directory (where we're running from)
TARGET_DIR="${1:-$PWD}"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║   🧠 Flowmind Local Installer                               ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "📦 Installing Flowmind into: $TARGET_DIR"
echo ""

# Change to target directory
cd "$TARGET_DIR"

# Create node_modules/@flowmind directory
mkdir -p node_modules/@flowmind

# Copy flowmind files
echo "📁 Copying Flowmind files..."
rm -rf node_modules/@flowmind/cli 2>/dev/null || true
mkdir -p node_modules/@flowmind/cli

# Copy main files
cp "$FLOWMIND_DIR/flowmind.js" node_modules/@flowmind/cli/
cp "$FLOWMIND_DIR/package.json" node_modules/@flowmind/cli/

# Create bin symlink
mkdir -p node_modules/.bin
ln -sf ../@flowmind/cli/flowmind.js node_modules/.bin/flowmind
ln -sf ../@flowmind/cli/flowmind.js node_modules/.bin/flowmind-cli

# Install dependencies if not already installed
echo ""
echo "📦 Installing dependencies..."
cd node_modules/@flowmind/cli
npm install --silent 2>/dev/null || npm install

# Go back to target directory
cd "$TARGET_DIR"

echo ""
echo "✅ Installation complete!"
echo ""
echo "🎯 Available commands:"
echo ""
echo "   npx flowmind init              # Initialize"
echo "   npx flowmind flow:list        # List flows"
echo "   npx flowmind run <id>          # Run a flow"
echo "   npx flowmind run:list          # List runs"
echo "   npx flowmind status            # Status"
echo ""
echo "   # Or use the CLI directly:"
echo "   node node_modules/@flowmind/cli/flowmind.js"
echo ""
echo "📁 Installed at: $TARGET_DIR/node_modules/@flowmind/cli"
echo ""

# Offer to run init
read -p "Run 'npx flowmind init'? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx flowmind init
fi
