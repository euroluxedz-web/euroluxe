#!/usr/bin/env bash
# Optimize background.mp4: strip audio, scale to 1280x720, faststart for progressive download
set -e
INPUT="/home/z/my-project/upload/background.mp4"
OUTPUT="/home/z/my-project/public/background.mp4"

ffmpeg -y -i "$INPUT" \
  -an \
  -vf "scale=1280:720:flags=lanczos" \
  -c:v libx264 \
  -profile:v high \
  -level 4.0 \
  -pix_fmt yuv420p \
  -crf 28 \
  -preset slow \
  -movflags +faststart \
  "$OUTPUT"

ls -lh "$OUTPUT"
