#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Building FlowMind demo video..."

# Ensure output directory exists
mkdir -p out

# Render the video
npx remotion render src/Root.tsx FlowMindDemo out/demo.mp4 \
  --props='{}' \
  --log=verbose

echo "==> Video rendered: out/demo.mp4"

# Convert to GIF (requires ffmpeg)
if command -v ffmpeg &> /dev/null; then
  echo "==> Converting to GIF..."
  ffmpeg -i out/demo.mp4 \
    -vf "fps=15,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
    -loop 0 \
    out/flowmind-demo.gif
  echo "==> GIF created: out/flowmind-demo.gif"
else
  echo "    (skipping GIF — ffmpeg not found in PATH)"
fi

echo ""
echo "Done!"
echo "  Video : $SCRIPT_DIR/out/demo.mp4"
echo "  GIF   : $SCRIPT_DIR/out/flowmind-demo.gif"
