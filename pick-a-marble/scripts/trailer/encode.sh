#!/usr/bin/env bash
# Usage: scripts/trailer/encode.sh <capture-dir> <output.mp4>
# Muxes the captured 30 fps frames with the offline-rendered soundtrack.
set -euo pipefail
dir="$1"; out="$2"
ffmpeg -y -hide_banner -loglevel error \
  -framerate 30 -i "$dir/frames/%05d.jpg" -i "$dir/audio.wav" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 192k -movflags +faststart -shortest "$out"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration -of compact "$out"
