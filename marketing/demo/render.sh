#!/usr/bin/env bash
# Renders the Shared Profiles demo GIFs (light and dark) and writes them into this repo's docs/.
#   bash marketing/demo/render.sh   → docs/demo.gif and docs/demo-dark.gif
# Needs: Node 18+, ffmpeg and gifsicle. Set REMOTION_BROWSER to a Chrome Headless Shell you already have to skip
# Remotion's download. Remotion renders PNG frames; encode.mjs turns them into the GIF (it says why).
set -euo pipefail
cd "$(dirname "$0")"
DOCS="../../docs"
[ -d node_modules ] || npm install --no-audit --no-fund
mkdir -p out "$DOCS"
BROWSER=()
[ -n "${REMOTION_BROWSER:-}" ] && BROWSER=(--browser-executable="$REMOTION_BROWSER")
for theme in light dark; do
  comp=$([ "$theme" = light ] && echo DemoLight || echo DemoDark)
  name=$([ "$theme" = light ] && echo demo.gif || echo demo-dark.gif)
  frames="out/frames-$theme"
  rm -rf "./${frames:?}"
  npx remotion render src/index.ts "$comp" "$frames" --sequence --image-format=png \
    --image-sequence-pattern='frame-[frame].[ext]' --concurrency=6 ${BROWSER[@]+"${BROWSER[@]}"} --log=error
  node encode.mjs "$frames" "$DOCS/$name"
  bytes=$(wc -c < "$DOCS/$name" | tr -d ' ')
  echo "→ docs/$name  $(( bytes / 1024 )) KB"
  if [ "$bytes" -gt 4194304 ]; then echo "  over the 4 MB ceiling" >&2; exit 1
  elif [ "$bytes" -gt 2097152 ]; then echo "  over the 2 MB aim" >&2; fi
done
