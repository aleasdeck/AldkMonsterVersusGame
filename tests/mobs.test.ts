import { describe, expect, it } from 'vitest';
import { renderSheet, type Sheet } from '../src/ui/mobs/pixel';
import { MOB_STYLE } from '../src/ui/mobs/styles';
import { MOB_MODELS } from '../src/ui/mobs';
import { ENEMY_LIST } from '../src/data/enemies';
import { hasDrawnSheet } from '../src/ui/characterSize';
import { ENEMY_BODY_HEIGHT } from '../src/data/characterSizes';

/** Последняя строка кадра, где есть непрозрачный пиксель (тень на земле полупрозрачна и не считается). */
function lowestRow(sheet: Sheet, f: Uint8ClampedArray): number {
  for (let j = sheet.h - 1; j >= 0; j--) {
    for (let i = 0; i < sheet.w; i++) if (f[(j * sheet.w + i) * 4 + 3] === 255) return j;
  }
  return -1;
}

/** Отпечаток кадра (FNV-1a): сравнить кадры без Buffer — в tsconfig нет типов Node. */
function print(f: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < f.length; k++) h = Math.imul(h ^ f[k], 16777619);
  return h >>> 0;
}

/** Доля непрозрачных пикселей, которые отличаются между кадрами. */
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0, opaque = 0;
  for (let k = 0; k < a.length; k += 4) {
    if (a[k + 3] === 255 || b[k + 3] === 255) opaque++;
    if (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2] || a[k + 3] !== b[k + 3]) changed++;
  }
  return changed / Math.max(1, opaque);
}

/** Средняя яркость непрозрачных пикселей кадра. */
function brightness(f: Uint8ClampedArray): number {
  let sum = 0, n = 0;
  for (let k = 0; k < f.length; k += 4) if (f[k + 3] === 255) { sum += f[k] + f[k + 1] + f[k + 2]; n++; }
  return sum / Math.max(1, n) / 3;
}

const MODELS = Object.entries(MOB_MODELS);
const sheets = new Map(MODELS.map(([id, m]) => [id, {
  idle: renderSheet(m, MOB_STYLE),
  attack: renderSheet(m, MOB_STYLE, 'attack'),
  hurt: renderSheet(m, MOB_STYLE, 'hurt'),
}]));

describe('пиксельная лепка (v0.52)', () => {
  it('локация переходит на лепку целиком: модель у каждого её врага без рисованного листа, лишних моделей нет', () => {
    const ids = new Set(ENEMY_LIST.map((e) => e.id));
    for (const id of Object.keys(MOB_MODELS)) {
      expect(ids.has(id), `${id}: нет такого врага`).toBe(true);
      // Лепка в enemySprite проверяется первой и перекрыла бы рисованный лист (скелеты, некромант).
      expect(hasDrawnSheet(id), `${id}: у врага рисованный лист`).toBe(false);
    }
    const locs = new Set(ENEMY_LIST.filter((e) => Object.hasOwn(MOB_MODELS, e.id)).map((e) => e.location));
    for (const loc of locs) {
      for (const e of ENEMY_LIST.filter((x) => x.location === loc && !hasDrawnSheet(x.id))) {
        expect(Object.hasOwn(MOB_MODELS, e.id), `${loc}: у ${e.id} нет модели`).toBe(true);
      }
    }
  });

  it('кадры покоя непустые, враг стоит на земле, рост по таблице', () => {
    for (const [id, model] of MODELS) {
      const sh = sheets.get(id)!.idle;
      expect(sh.frames, id).toHaveLength(MOB_STYLE.frames);
      const ground = sh.h - sh.foot;
      for (const f of sh.frames) {
        let opaque = 0;
        for (let k = 3; k < f.length; k += 4) if (f[k] === 255) opaque++;
        expect(opaque, id).toBeGreaterThan(40);
        // Ступни на линии земли (контур может уйти на пиксель ниже); кто парит (`flies`, мышь), тот не сверяется.
        if (!model.flies) expect(Math.abs(lowestRow(sh, f) + 1 - ground), id).toBeLessThanOrEqual(2);
      }
      // Рост от макушки до земли — как в ENEMY_BODY_HEIGHT, кроме моделей со своим ростом по замыслу
      // (`ownHeight` с причиной: крыса длинная и низкая, у мыши в рамку входит просвет до пола).
      if (!model.ownHeight) {
        const body = (ground - sh.top) * sh.d;
        expect(Math.abs(body - ENEMY_BODY_HEIGHT[id]) / ENEMY_BODY_HEIGHT[id], `${id}: ${body}`).toBeLessThan(0.12);
      }
    }
  });

  it('клипы удара и урона: своё число кадров, тот же размер кадра, что у покоя', () => {
    for (const [id] of MODELS) {
      const s = sheets.get(id)!;
      expect(s.attack.frames, id).toHaveLength(MOB_STYLE.clips.attack.frames);
      expect(s.hurt.frames, id).toHaveLength(MOB_STYLE.clips.hurt.frames);
      expect([s.attack.w, s.attack.h, s.hurt.w, s.hurt.h], id).toEqual([s.idle.w, s.idle.h, s.idle.w, s.idle.h]);
    }
  });

  it('клип кончается позой покоя: переход к первому кадру покоя без скачка', () => {
    for (const [id] of MODELS) {
      const s = sheets.get(id)!;
      expect(diff(s.attack.frames[s.attack.frames.length - 1], s.idle.frames[0]), `${id}: удар`).toBeLessThan(0.02);
      expect(diff(s.hurt.frames[s.hurt.frames.length - 1], s.idle.frames[0]), `${id}: урон`).toBeLessThan(0.02);
    }
  });

  it('удар заметно меняет позу к кадру контакта, урон начинается белой вспышкой', () => {
    const contact = MOB_STYLE.clips.attack.contact ?? 4;
    for (const [id] of MODELS) {
      const s = sheets.get(id)!;
      expect(diff(s.attack.frames[contact], s.idle.frames[0]), `${id}: контакт`).toBeGreaterThan(0.15);
      expect(brightness(s.hurt.frames[0]), `${id}: вспышка`).toBeGreaterThan(brightness(s.idle.frames[0]) + 60);
    }
  });

  it('замах и выпад не упираются в край листа: иначе в игре срежет нос, клинок или снаряд — модели нужен больше pad', () => {
    for (const [id] of MODELS) {
      const s = sheets.get(id)!;
      for (const [clip, sh] of Object.entries(s)) {
        sh.frames.forEach((f, k) => {
          let touch = 0;
          for (let j = 0; j < sh.h; j++) {
            for (let i = 0; i < sh.w; i++) {
              if ((i === 0 || i === sh.w - 1 || j === 0) && f[(j * sh.w + i) * 4 + 3] > 0) touch++;
            }
          }
          expect(touch, `${id}: ${clip}, кадр ${k}`).toBe(0);
        });
      }
    }
  });

  it('рисунок детерминирован: та же модель — те же пиксели, без Math.random', () => {
    const a = renderSheet(MOB_MODELS.wolf, MOB_STYLE, 'attack');
    const b = renderSheet(MOB_MODELS.wolf, MOB_STYLE, 'attack');
    for (let f = 0; f < a.frames.length; f++) expect(print(a.frames[f])).toBe(print(b.frames[f]));
  });

  it('покой живой: больше половины кадров цикла различаются', () => {
    const sh = sheets.get('goblin_shaman')!.idle;
    const distinct = new Set(sh.frames.map(print));
    expect(distinct.size).toBeGreaterThan(sh.frames.length / 2);
  });
});
