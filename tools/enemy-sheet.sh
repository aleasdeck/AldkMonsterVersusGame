#!/bin/sh
# Сжать мастер скелета, сохранив размеры атласа и прозрачность для enemySprite.ts.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
enemy=${1:-skeleton-warrior}
case "$enemy" in
  skeleton-warrior|skeleton-archer|necromancer) ;;
  *) echo "Usage: $0 [skeleton-warrior|skeleton-archer|necromancer]" >&2; exit 1 ;;
esac
cwebp -q 92 -m 6 -alpha_q 100 \
  "$project_root/art/$enemy-sheet.png" \
  -o "$project_root/src/assets/enemies/$enemy.webp"
