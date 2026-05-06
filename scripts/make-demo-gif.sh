#!/bin/bash
# make-demo-gif.sh
# Convert QuickTime screen recordings into optimized GIFs for README demos.
#
# Usage:
#   ./scripts/make-demo-gif.sh chat-demo.mov
#   ./scripts/make-demo-gif.sh chat-demo.mov docs/chat-demo.gif
#   FPS=10 SCALE=720 ./scripts/make-demo-gif.sh chat-demo.mov

set -euo pipefail

INPUT="${1:-}"
OUTPUT="${2:-}"
FPS="${FPS:-15}"
SCALE="${SCALE:-800}"
COLORS="${COLORS:-128}"

if [[ -z "$INPUT" ]]; then
	echo "Usage: $0 <input.mov> [output.gif]"
	echo ""
	echo "Environment variables:"
	echo "  FPS     Frames per second (default: 15)"
	echo "  SCALE   Output width in pixels (default: 800)"
	echo "  COLORS  Palette size, 64-256 (default: 128)"
	exit 1
fi

if [[ ! -f "$INPUT" ]]; then
	echo "Error: file not found: $INPUT"
	exit 1
fi

# Default output name if not provided
if [[ -z "$OUTPUT" ]]; then
	BASE="$(basename "$INPUT" .mov)"
	OUTPUT="${BASE}.gif"
fi

echo "Converting: $INPUT → $OUTPUT"
echo "  FPS=$FPS, SCALE=$SCALE, COLORS=$COLORS"

ffmpeg -y -i "$INPUT" \
	-vf "fps=${FPS},scale=${SCALE}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${COLORS}[p];[s1][p]paletteuse=dither=bayer" \
	-loop 0 \
	"$OUTPUT"

FILESIZE=$(du -h "$OUTPUT" | cut -f1)
echo "Done. Size: $FILESIZE"
