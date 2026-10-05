import type { EnemyDef } from '../engine/types';
import { ENEMY_BODY_HEIGHT } from '../data/characterSizes';
import { spriteBounds, spriteSize } from './sprites';
import { hasMobArt, mobMetrics } from './mobs';

/**
 * Размер изображения и убираемые поля. Бестиарий может задать уменьшение всей шкалы.
 * `px` — высота изображения (у квадратных спрайтов и ширина); `width` — ширина самой фигуры без пустых краёв:
 * по ней альбом ужимает широких (медведь боком шире своего роста); `dx` — насколько середина фигуры правее середины
 * кадра (у лепки поля под замах слева и справа разные): по `width` и `dx` подсветка цели встаёт по телу, а не по кадру.
 */
export function enemySize(def: EnemyDef, scale = 1): { px: number; width: number; dx: number; top: number; foot: number; body: number } {
  if (hasMobArt(def.id)) {
    // Пиксельная лепка рисуется ровно своим пикселем: рост задаёт модель, пересчёт по таблице размыл бы сетку.
    const m = mobMetrics(def.id);
    return { px: m.h * scale, width: (m.w - m.left - m.right) * scale, dx: ((m.left - m.right) / 2) * scale, top: m.top * scale, foot: m.foot * scale, body: (m.h - m.top - m.foot) * scale };
  }
  const body = (ENEMY_BODY_HEIGHT[def.id] ?? 108) * scale;
  const bounds = spriteBounds(def.sprite, def.id);
  const size = spriteSize(def.sprite);
  const unit = body / bounds.height;
  return { px: size * unit, width: size * unit, dx: 0, top: bounds.top * unit, foot: (size - bounds.bottom) * unit, body };
}

/** Поля кадра и тело фигуры в переменных CSS: поля убирает разметка, тело (`--body-w`, `--body-dx`) читает подсветка цели. */
export function enemySizeStyle(size: ReturnType<typeof enemySize>): string {
  return `--sprite-top:${size.top}px;--sprite-foot:${size.foot}px;--body-w:${size.width}px;--body-dx:${size.dx}px`;
}
