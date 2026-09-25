import type { EventTarget } from '../../engine/types';
import type { Mat } from '../mobs/pixel';
import { bake, hashCell, rng, type FxClip } from './bake';
import { particles, type Particle, type PxLayer } from './layer';

/**
 * Боевой клич — «Рёв» (v0.53, выбор пользователя из трёх вариантов: рёв, жар в жилах, знак силы).
 * Клич — это крик, поэтому эффект показывает действие, а не статус: от лица героя к врагам расходятся волны,
 * у ног взметается пыль и подскакивают камешки, поле вздрагивает на 2 px. Что герой набрал Силу, видно по иконке.
 */

const DUST: Mat = { base: '#8a7a62', tex: { kind: 'noise', scale: 3, amp: 0.1 }, noOutline: true, spread: 0.3 };

/** Пыль у ног: клубы катятся по полу в сторону `dir` (1 — вправо, −1 — влево) и тают. */
export function dustClip(dir: number): FxClip {
  return {
    // Дальний клуб к концу откатывается на ~78 единиц от ног — рамка с запасом, иначе край срежет его прямой линией.
    w: 168, h: 40, n: 7,
    draw: (p, u) => {
      for (let i = 0; i < 4; i++) {
        const x = dir * (4 + i * 7 + 22 * u * (1 + i * 0.3));
        const y = 9 - 6 * u - i * 1.5;
        const r = (3 + i) * (0.6 + 0.8 * Math.min(1, u * 2));
        p.ellipse(x, y, r * 1.3, r, DUST, { part: 'dust', flat: 0.3 });
      }
    },
    opts: { fade: [0, 0, 0.1, 0.3, 0.5, 0.7, 0.88], alpha: 0.9 },
  };
}

/** Цвета волны от фронта назад: белый край, золото, огонь, багровый хвост. */
const WAVE = ['#fff6e0', '#ffd27a', '#f28a2a', '#b8401c'];

/** Рёв: волны крика, пыль, камешки, толчок поля и вспышка героя. Приём на себя — без попадания, ждать нечего. */
export function roar(L: PxLayer, target: EventTarget = 'hero'): void {
  const h = L.body(target);
  if (!h) return;
  const side = L.sideOf(target);
  const mx = h.cx + side * h.w * 0.28, my = h.top + h.h * 0.2;
  L.flash(target, 300, 20);
  L.shake(300, 60);
  L.cells({
    at: 40, dur: 720,
    draw: (put, t) => {
      for (let k = 0; k < 4; k++) {
        const age = t - k * 120;
        if (age < 0 || age > 560) continue;
        const R = 5 + age * 0.22;
        const fade = 1 - age / 560;
        const span = 0.62;
        const n = Math.ceil(R * span * 2.4);
        // Толщина убывает с расстоянием: у лица четыре клетки, у врагов одна.
        const thick = Math.max(1, Math.round(4 * fade));
        for (let s = 0; s <= n; s++) {
          const th = -span + (2 * span * s) / n;
          const cs = side * Math.cos(th), sn = Math.sin(th) * 1.15;
          if (my + sn * R > h.bottom - 1) continue;
          // Дальние волны рвутся на куски: клетки выпадают по шуму, чем дальше — тем больше.
          if (hashCell(s * 3 + k * 17, Math.round(R)) > fade * 1.35) continue;
          for (let d = 0; d < thick; d++) put(mx + cs * (R - d), my + sn * (R - d), WAVE[Math.min(3, d)], (d === 0 ? 1 : 0.85) * (0.35 + 0.65 * fade));
        }
      }
    },
  });
  L.sprite(bake('dust:1', dustClip(1)), { at: 60, pos: () => [h.cx + h.w * 0.35, h.bottom - 7] });
  L.sprite(bake('dust:-1', dustClip(-1)), { at: 80, pos: () => [h.cx - h.w * 0.35, h.bottom - 7] });
  const r = rng(101);
  const pebbles: Particle[] = [];
  for (let k = 0; k < 8; k++) {
    pebbles.push({ x: h.cx + (r() - 0.5) * h.w * 1.2, y: h.bottom - 1, vx: (r() - 0.5) * 30, vy: -40 - r() * 40, g: 320, life: 600, born: 60 + r() * 80, colors: ['#b8a482', '#8a7a62', '#5e5140'], floor: h.bottom - 1 });
  }
  particles(L, 0, pebbles);
}
