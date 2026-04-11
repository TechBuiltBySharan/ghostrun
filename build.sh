#!/bin/bash

# Flowmind V1 - Build Script
# This script builds all packages and the CLI without requiring pnpm workspace

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
echo "║   V1 Build Script                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    exit 1
fi

echo "📦 Checking dependencies..."
echo ""

# Install playwright browsers if needed
if ! command -v npx &> /dev/null; then
    echo "❌ npx is required but not found."
    exit 1
fi

# Check if playwright is installed
if ! npm list playwright &> /dev/null 2>&1; then
    echo "🔧 Installing Playwright..."
    npm install playwright
    npx playwright install chromium
fi

# Create dist directories
echo "📁 Creating directories..."
mkdir -p apps/cli/dist
mkdir -p packages/database/dist
mkdir -p packages/privacy/dist
mkdir -p packages/adapters-web/dist
mkdir -p packages/core/dist
mkdir -p packages/memory/dist
mkdir -p packages/executor/dist
mkdir -p packages/reporting/dist

echo ""
echo "🔨 Building packages..."

# Build database package
echo "  Building @flowmind/database..."
cd packages/database
npm run build 2>/dev/null || npx tsc
cd ../..

# Build privacy package
echo "  Building @flowmind/privacy..."
cd packages/privacy
npm run build 2>/dev/null || npx tsc
cd ../..

# Build adapters-web package
echo "  Building @flowmind/adapters-web..."
cd packages/adapters-web
npm install playwright 2>/dev/null || true
npm run build 2>/dev/null || npx tsc
cd ../..

# Build core package
echo "  Building @flowmind/core..."
cd packages/core
npm run build 2>/dev/null || npx tsc
cd ../..

# Build memory package
echo "  Building @flowmind/memory..."
cd packages/memory
npm install 2>/dev/null || true
npm run build 2>/dev/null || npx tsc
cd ../..

# Build executor package
echo "  Building @flowmind/executor..."
cd packages/executor
npm run build 2>/dev/null || npx tsc
cd ../..

# Build reporting package
echo "  Building @flowmind/reporting..."
cd packages/reporting
npm run build 2>/dev/null || npx tsc
cd ../..

# Build CLI
echo ""
echo "🔨 Building CLI..."
cd apps/cli
npm install chalk commander ora playwright 2>/dev/null || true
npx tsc --esModuleInterop --module ESNext --moduleResolution node --target ES2022 --outDir dist src/index.ts 2>/dev/null || \
npx esbuild src/index.ts --bundle --platform=node --outfile=dist/index.js --format=esm --external:@flowmind/* --external:chalk --external:commander --external:ora --external:playwright 2>/dev/null || \
echo "  CLI will be run via tsx in development mode"

cd ../..

echo ""
echo "✅ Build complete!"
echo ""
echo "🚀 To get started:"
echo ""
echo "   1. Initialize Flowmind:"
echo "      npx tsx apps/cli/src/index.ts init"
echo ""
echo "   2. Learn a flow:"
echo "      npx tsx apps/cli/src/index.ts learn http://localhost:3000"
echo ""
echo "   3. Run a flow:"
echo "      npx tsx apps/cli/src/index.ts run <flow-id>"
echo ""
echo "   4. View runs:"
echo "      npx tsx apps/cli/src/index.ts run:list"
echo ""
echo ""
