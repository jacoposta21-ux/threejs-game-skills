#!/bin/bash
# assemble.sh <land|port> <out.mp4>
set -e
S=$(dirname "$0"); M=$1; O=$2
mkdir -p $S/seq_$M; rm -f $S/seq_$M/*
i=0
for f in $S/$M/f*.jpg $S/end_$M/e*.jpg; do ln -s "$f" $S/seq_$M/$(printf 's%04d.jpg' $i); i=$((i+1)); done
echo "$M frames: $i"
ffmpeg -v error -y -framerate 30 -i $S/seq_$M/s%04d.jpg -i $S/audio.wav \
  -filter_complex "[0:v]fade=t=in:st=0:d=0.4,format=yuv420p[v];[1:a]atrim=0:30,afade=t=in:st=0:d=0.3,afade=t=out:st=28.8:d=1.2[a]" \
  -map "[v]" -map "[a]" -t 30 -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -movflags +faststart $O
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_name $O
