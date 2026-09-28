import { hexToRgb, Painter, type RGB } from '../mobs/pixel';
import { HERO_STYLE } from './clips';
import type { HeroModel } from './model';

/**
 * Аватарка героя из его же лепки (Воин первым): бюст из кадра лепки на фоне с ореолом и силуэтами,
 * в пиксельной рамке. Рисунок — без DOM (как клипы): игра кладёт его в data URL (heroes/index.ts), инструменты —
 * в PNG. Прежние аватарки были рисованными портретами генератора (tools/hero-avatars.py) — у героев без лепки
 * они остаются, поэтому фон и рамка повторяют их устройство: цвет героя, ореол за головой, силуэты его мира.
 */
export interface AvatarSpec {
  /**
   * Портрет в своей позе — модель рисует её той же лепкой, что клипы (у Воина `drawWarrior` с позой `PORTRAIT`).
   * Без поля — первый кадр покоя; но в покое оружие обычно опущено и срезается кадром бюста.
   */
  draw?: (p: Painter) => void;
  /** Кадр бюста в единицах модели: левый верхний угол и сторона квадрата. Голова — чуть выше середины. */
  crop: readonly [number, number, number];
  /** Ореол за головой: центр и радиус в единицах модели. */
  halo: readonly [number, number, number];
  /** Цвета: небо сверху и снизу, ореол и его кромка, силуэты, рамка (тень, тело, блик). */
  colors: {
    top: string;
    bottom: string;
    halo: string;
    haloEdge: string;
    skyline: string;
    frameDark: string;
    frame: string;
    frameLight: string;
  };
  /**
   * Силуэты за героем — башни: середина и ширина (доли стороны кадра), высота стены и острого верха (доли от низа).
   * Пусто — без силуэтов. По краям их видно, в середине их закрывает сам герой.
   */
  skyline?: ReadonlyArray<readonly [number, number, number, number]>;
}

/** Упорядоченный дизеринг 4×4 — тот же, что у рампа лепки. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Ступеней в небе: полосы с дизерингом на стыке, как тоны лепки. */
const SKY_TONES = 4;

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)) as RGB;

/**
 * Аватарка `n`×`n` клеток: фон, силуэты, герой, рамка — RGBA по строкам. Пиксель рисунка — `crop / n` единиц модели,
 * поэтому одна и та же модель даёт тот же бюст любого размера; мельче 40 клеток лицо уже не читается.
 */
export function renderAvatar(model: HeroModel, n: number): Uint8ClampedArray<ArrayBuffer> {
  const spec = model.avatar;
  const [x0, y0, size] = spec.crop;
  const d = size / n;
  const pad = model.pad ?? 22;
  const c = spec.colors;
  const top = hexToRgb(c.top), bottom = hexToRgb(c.bottom), halo = hexToRgb(c.halo), haloEdge = hexToRgb(c.haloEdge), sky = hexToRgb(c.skyline);
  const out = new Uint8ClampedArray(n * n * 4);
  const put = (i: number, j: number, rgb: RGB): void => {
    const k = (j * n + i) * 4;
    out[k] = rgb[0];
    out[k + 1] = rgb[1];
    out[k + 2] = rgb[2];
    out[k + 3] = 255;
  };

  // Небо полосами сверху вниз, ореол за головой, силуэты.
  const hx = (spec.halo[0] - x0) / d, hy = (spec.halo[1] - y0) / d, hr = spec.halo[2] / d;
  const towers = (spec.skyline ?? []).map(([u, w, wall, roof]) => ({ l: (u - w / 2) * n, r: (u + w / 2) * n, wall: (1 - wall) * n, roof: roof * n }));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const b = BAYER[(j & 3) * 4 + (i & 3)] - 0.5;
      const level = Math.max(0, Math.min(SKY_TONES - 1, Math.floor((j / (n - 1)) * (SKY_TONES - 1) + 0.5 + b * 0.9)));
      let rgb = mix(top, bottom, level / (SKY_TONES - 1));
      const r = Math.hypot(i + 0.5 - hx, j + 0.5 - hy);
      // Ореол — два тона: светлая середина и полутон к краю, на стыке дизеринг; по краю — кромка в клетку.
      if (r < hr) rgb = r > hr - 1 ? haloEdge : r / hr + b * 0.2 < 0.7 ? halo : mix(halo, rgb, 0.5);
      for (const t of towers) {
        if (i + 0.5 < t.l || i + 0.5 > t.r) continue;
        const mid = (t.l + t.r) / 2, half = (t.r - t.l) / 2;
        // Острый верх — треугольник над стеной; плоский — зубцы через клетку.
        const edge = t.roof > 0 ? t.wall - t.roof * (1 - Math.abs(i + 0.5 - mid) / half) : t.wall - (i % 2);
        if (j + 0.5 >= edge) rgb = sky;
      }
      put(i, j, rgb);
    }
  }

  // Герой: кадр позы тем же рисунком, что в бою, только пиксель — под размер аватарки.
  const p = new Painter(model, { ...HERO_STYLE, d }, 0);
  if (spec.draw) spec.draw(p);
  else model.draw(p);
  const fig = p.finish();
  const i0 = Math.round((x0 + pad) / d), j0 = Math.round((y0 + pad) / d);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const fi = i + i0, fj = j + j0;
      if (fi < 0 || fj < 0 || fi >= p.W || fj >= p.H) continue;
      const k = (fj * p.W + fi) * 4;
      const a = fig[k + 3] / 255;
      if (a <= 0) continue;
      const o = (j * n + i) * 4;
      for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.round(out[o + ch] + (fig[k + ch] - out[o + ch]) * a);
    }
  }

  // Рамка: тень снаружи, тело с бликом сверху-слева и тенью снизу-справа, тень внутри, заклёпки в углах.
  const dark = hexToRgb(c.frameDark), body = hexToRgb(c.frame), light = hexToRgb(c.frameLight), shade = mix(body, dark, 0.45);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const e = Math.min(i, j, n - 1 - i, n - 1 - j);
      if (e === 0 || e === 2) put(i, j, dark);
      else if (e === 1) put(i, j, i === 1 || j === 1 ? (i === n - 2 || j === n - 2 ? body : light) : shade);
    }
  }
  if (n >= 40) {
    for (const [ci, cj] of [[3, 3], [n - 5, 3], [3, n - 5], [n - 5, n - 5]]) {
      put(ci, cj, light);
      put(ci + 1, cj, body);
      put(ci, cj + 1, body);
      put(ci + 1, cj + 1, dark);
    }
  }
  return out;
}
