import type { Mat, Painter } from './pixel';

/**
 * Огонь пиксельной лепки — общий для врагов Пещер (Имп, дракон, элементаль, жаровни) и эффектов приёмов
 * (src/ui/fx/: Огненный шар, горение, взрыв). Три светящихся слоя, между ними без линий; на огненном фоне
 * Пещер тонировка ведёт жёлтое в оранжевое, поэтому пламя насыщенное (docs/lepka.md, «Огонь на огненном фоне»).
 */

/** Пламя из трёх светящихся слоёв: тёмно-красный край, оранжевая середина, жёлтое ядро. Общее для всех огней Пещер. */
export const FLAME = {
  outer: { base: '#e83c10', glow: true, dither: 0, ramp: ['#c8300a', '#d8380c', '#e8420e', '#f85414', '#ff6a1a'] } as Mat,
  mid: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#f06a10', '#ff7c14', '#ff8e18', '#ffa21e', '#ffb428'] } as Mat,
  core: { base: '#ffd23a', glow: true, dither: 0, noOutline: true, ramp: ['#ffb82a', '#ffc632', '#ffd23a', '#ffe060', '#ffec90'] } as Mat,
};

/**
 * Язык пламени от основания (x, y) вверх длиной `len`: три слоя, кончик клонится на `lean` и дрожит `sway`.
 * `r` — полуширина у основания. Части — `flame`, `flameMid`, `flameCore` с суффиксом `tag`.
 */
export function flame(p: Painter, x: number, y: number, r: number, len: number, sway: number, lean = 0, tag = ''): void {
  const tip: [number, number] = [x + lean + sway, y - len];
  const mid: [number, number] = [x + lean * 0.45 - sway * 0.5, y - len * 0.5];
  p.chain([[x, y, r], [mid[0], mid[1], r * 0.62], [tip[0], tip[1], 0.6]], FLAME.outer, { part: `flame${tag}` });
  p.chain([[x, y + r * 0.15, r * 0.66], [mid[0] + 0.3, mid[1] + len * 0.08, r * 0.38], [tip[0] - sway * 0.3, tip[1] + len * 0.28, 0.5]], FLAME.mid, { part: `flameMid${tag}`, noLine: true });
  if (r > 2.2) p.chain([[x, y + r * 0.25, r * 0.36], [mid[0] + 0.3, mid[1] + len * 0.2, r * 0.18]], FLAME.core, { part: `flameCore${tag}`, noLine: true });
}

/**
 * Гребень пламени вдоль хребта: зубчатая полоса языков над точками основания `base`, высоты языков — `hs`
 * (по одному на промежуток между точками). Языки клонятся на `lean` назад, каждый дрожит своей волной `sway(i)`.
 * Три слоя — край, середина, ядро; низ полосы прячется в теле.
 */
export function flameRow(p: Painter, base: Array<[number, number]>, hs: number[], lean: number, sway: (i: number) => number, tag = ''): void {
  const layer = (k: number, drop: number, mat: Mat, part: string, noLine = false): void => {
    const pts: number[] = [];
    for (let i = base.length - 1; i >= 0; i--) pts.push(base[i][0], base[i][1] + drop);
    for (let i = 0; i < base.length; i++) {
      const [x, y] = base[i];
      const hv = i === 0 || i === base.length - 1 ? 0 : (hs[i - 1] + hs[i]) * 0.12 * k;
      pts.push(x, y - hv);
      if (i < hs.length) {
        const [nx, ny] = base[i + 1];
        pts.push((x + nx) / 2 + lean * k + sway(i) * k, (y + ny) / 2 - hs[i] * k);
      }
    }
    p.poly(pts, mat, { part, bevel: 1.2, noLine });
  };
  layer(1, 2, FLAME.outer, `row${tag}`);
  layer(0.6, 0.5, FLAME.mid, `rowMid${tag}`, true);
  // Ядро — у самых высоких языков, а не сплошной полосой.
  for (let i = 0; i < hs.length; i++) {
    if (hs[i] < 8) continue;
    const x = (base[i][0] + base[i + 1][0]) / 2, y = (base[i][1] + base[i + 1][1]) / 2;
    p.chain([[x, y, 1.6], [x + lean * 0.25 + sway(i) * 0.2, y - hs[i] * 0.32, 0.7]], FLAME.core, { part: `rowCore${tag}`, noLine: true });
  }
}

/** Огненный шар (плевок, снаряд): светящееся ядро и хвост искр позади — по ходу полёта вправо. */
export function fireball(p: Painter, x: number, y: number, r: number, tail: number, tag = ''): void {
  p.glow(x, y, r * 2.4, '#ff9a2a', 0.35);
  p.chain([[x + tail, y + 0.5, r * 0.35], [x + tail * 0.45, y - 0.5, r * 0.75], [x, y, r]], FLAME.outer, { part: `ball${tag}` });
  p.ellipse(x - r * 0.1, y, r * 0.7, r * 0.66, FLAME.mid, { part: `ballMid${tag}`, noLine: true });
  p.ellipse(x - r * 0.25, y - r * 0.1, r * 0.38, r * 0.36, FLAME.core, { part: `ballCore${tag}`, noLine: true });
}
