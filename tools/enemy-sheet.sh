#!/bin/sh
# Сжать мастер скелета, сохранив размеры атласа и прозрачность для enemySprite.ts.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cwebp -q 92 -m 6 -alpha_q 100 \
  "$project_root/art/skeleton-warrior-sheet.png" \
  -o "$project_root/src/assets/enemies/skeleton-warrior.webp"
