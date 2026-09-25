import type { EnemyDef } from '../engine/types';
import { ENEMY_BODY_HEIGHT } from '../data/characterSizes';
import { spriteBounds, spriteSize } from './sprites';
import { hasMobArt, mobMetrics } from './mobs';

/**
 * Размер изображения и убираемые поля. Бестиарий может задать уменьшение всей шкалы.
 * `px` — высота изображения (у квадратных спрайтов и ширина); `width` — ширина самой фигуры без пустых краёв:
 * по ней альбом ужимает широких (медведь боком шире своего роста).
 */
export function enemySize(def: EnemyDef, scale = 1): { px: number; width: number; top: number; foot: number; body: number } {
  if (hasMobArt(def.id)) {
    // Пиксельная лепка рисуется ровно своим пикселем: рост задаёт модель, пересчёт по таблице размыл бы сетку.
    const m = mobMetrics(def.id);
    return { px: m.h * scale, width: (m.w - m.left - m.right) * scale, top: m.top * scale, foot: m.foot * scale, body: (m.h - m.top - m.foot) * scale };
  }
  const body = (ENEMY_BODY_HEIGHT[def.id] ?? 108) * scale;
  const bounds = spriteBounds(def.sprite, def.id);
  const size = spriteSize(def.sprite);
  const unit = body / bounds.height;
  return { px: size * unit, width: size * unit, top: bounds.top * unit, foot: (size - bounds.bottom) * unit, body };
}

export function enemySizeStyle(size: ReturnType<typeof enemySize>): string {
  return `--sprite-top:${size.top}px;--sprite-foot:${size.foot}px`;
}
