#!/usr/bin/env bash
# Render the master in resumable chunks, for machines short on memory. A chunk that is already on disk is skipped.
# Usage: bash production/render_parts.sh [max_seconds]     Run `npx remotion bundle --out-dir=out/bundle` first.
# production/join_parts.py then joins the chunks and adds the soundtrack.
LIMIT=${1:-520}
START=$(date +%s)
TOTAL=1800
STEP=300
mkdir -p out/parts
for ((a = 0; a < TOTAL; a += STEP)); do
  b=$((a + STEP - 1))
  f=$(printf "out/parts/part_%04d.mp4" "$a")
  [ -f "$f" ] && continue
  # the next chunk takes about 4.5 minutes; stop rather than be cut off mid-chunk
  [ $(($(date +%s) - START)) -gt $((LIMIT - 280)) ] && { echo "paused before $a"; exit 0; }
  npx remotion render out/bundle FestiveCreatorBootcamp "out/parts/tmp.mp4" --frames=$a-$b --scale=1.3333333333333333 \
    --image-format=jpeg --jpeg-quality=100 --muted --codec=h264 --crf=14 --x264-preset=medium \
    --color-space=bt709 --pixel-format=yuv420p --concurrency=1 2>&1 | grep -E "Error|Encoded $STEP/" | cut -c1-200
  [ -f out/parts/tmp.mp4 ] && mv out/parts/tmp.mp4 "$f" && echo "done $f $(($(date +%s) - START))s" || { echo "FAILED at $a"; exit 1; }
done
echo "all chunks done"
