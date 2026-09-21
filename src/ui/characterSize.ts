import type { EnemyDef } from '../engine/types';
import { ENEMY_BODY_HEIGHT } from '../data/characterSizes';
import { spriteBounds, spriteSize } from './sprites';

// Рост тела от макушки до стоп в координатах canvas 256, отдельно от посоха/оружия.
// Некромант: макушка 35, стопы 197 в исходной позе; внутренний масштаб 1.02.
const DRAWN_METRICS: Readonly<Record<string, { body: number; top: number; foot: number }>> = {
  skeleton_warrior: { body: 179, top: 73, foot: 4 },
  skeleton_archer: { body: 179, top: 73, foot: 4 },
  necromancer: { body: 162 * 1.02, top: 252 - 192 * 1.02, foot: 4 },
};

/** Размер изображения и убираемые поля. Бестиарий может задать уменьшение всей шкалы. */
export function enemySize(def: EnemyDef, scale = 1): { px: number; top: number; foot: number; body: number } {
  const body = (ENEMY_BODY_HEIGHT[def.id] ?? 108) * scale;
  const drawn = DRAWN_METRICS[def.id];
  if (drawn) {
    const px = body * 256 / drawn.body;
    return { px, top: px * drawn.top / 256, foot: px * drawn.foot / 256, body };
  }
  const bounds = spriteBounds(def.sprite, def.id);
  const size = spriteSize(def.sprite);
  const unit = body / bounds.height;
  return { px: size * unit, top: bounds.top * unit, foot: (size - bounds.bottom) * unit, body };
}

export function enemySizeStyle(size: ReturnType<typeof enemySize>): string {
  return `--sprite-top:${size.top}px;--sprite-foot:${size.foot}px`;
}
