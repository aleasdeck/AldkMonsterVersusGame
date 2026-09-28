import { describe, expect, it } from 'vitest';
import type { Sheet } from '../src/ui/mobs/pixel';
import { MOB_CONTACT_MS } from '../src/ui/mobs';
import { HERO_MODELS } from '../src/ui/heroes';
import { contactMs, HERO_CLIPS, HERO_STYLE, renderHeroClip, type SculptClip } from '../src/ui/heroes/clips';
import { warriorProbe } from '../src/ui/heroes/warrior';
import { HERO_LIST } from '../src/data/heroes';
import { HERO_BODY_HEIGHT } from '../src/data/characterSizes';

/** Последняя строка кадра с непрозрачным пикселем (тень на земле полупрозрачна и не считается). */
function lowestRow(sheet: Sheet, f: Uint8ClampedArray): number {
  for (let j = sheet.h - 1; j >= 0; j--) {
    for (let i = 0; i < sheet.w; i++) if (f[(j * sheet.w + i) * 4 + 3] === 255) return j;
  }
  return -1;
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

/** Отпечаток кадра (FNV-1a). */
function print(f: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < f.length; k++) h = Math.imul(h ^ f[k], 16777619);
  return h >>> 0;
}

const CLIPS = Object.keys(HERO_CLIPS) as SculptClip[];
const HEROES = Object.entries(HERO_MODELS);
const sheets = new Map(HEROES.map(([id, m]) => [id, Object.fromEntries(CLIPS.map((c) => [c, renderHeroClip(m, c, HERO_STYLE)])) as Record<SculptClip, Sheet>]));

describe('герои пиксельной лепкой', () => {
  it('модели только у настоящих героев', () => {
    const ids = new Set(HERO_LIST.map((h) => h.id));
    for (const [id] of HEROES) expect(ids.has(id), id).toBe(true);
  });

  it('покой: кадры непустые, герой стоит на земле, рост по таблице HERO_BODY_HEIGHT', () => {
    for (const [id] of HEROES) {
      const sh = sheets.get(id)!.idle;
      expect(sh.frames, id).toHaveLength(HERO_CLIPS.idle.frames);
      const ground = sh.h - sh.foot;
      for (const f of sh.frames) expect(Math.abs(lowestRow(sh, f) + 1 - ground), id).toBeLessThanOrEqual(2);
      const body = (ground - sh.top) * sh.d;
      expect(Math.abs(body - HERO_BODY_HEIGHT[id]), `${id}: рост ${body}`).toBeLessThanOrEqual(6);
    }
  });

  it('каждый клип: своё число кадров по таблице, тот же размер кадра, что у покоя', () => {
    for (const [id] of HEROES) {
      const s = sheets.get(id)!;
      for (const c of CLIPS) {
        expect(s[c].frames, `${id}: ${c}`).toHaveLength(HERO_CLIPS[c].frames);
        expect([s[c].w, s[c].h], `${id}: ${c}`).toEqual([s.idle.w, s.idle.h]);
      }
    }
  });

  it('клип кончается позой покоя, кроме смерти — она лежит', () => {
    for (const [id] of HEROES) {
      const s = sheets.get(id)!;
      for (const c of CLIPS) {
        if (c === 'idle') continue;
        const last = s[c].frames[s[c].frames.length - 1];
        if (HERO_CLIPS[c].hold) expect(diff(last, s.idle.frames[0]), `${id}: ${c} держит свой кадр`).toBeGreaterThan(0.3);
        else expect(diff(last, s.idle.frames[0]), `${id}: ${c}`).toBeLessThan(0.02);
      }
    }
  });

  it('кадр контакта заметно отличается от покоя, урон начинается белой вспышкой', () => {
    for (const [id] of HEROES) {
      const s = sheets.get(id)!;
      for (const c of CLIPS) {
        const k = HERO_CLIPS[c].contact;
        if (k !== undefined) expect(diff(s[c].frames[k], s.idle.frames[0]), `${id}: ${c}`).toBeGreaterThan(0.15);
      }
      expect(brightness(s.hurt.frames[0]), id).toBeGreaterThan(brightness(s.idle.frames[0]) + 60);
    }
  });

  it('удар героя касается цели в тот же момент, что удар врага-лепки: бой ждёт одного контакта', () => {
    expect(contactMs('attack')).toBeCloseTo(MOB_CONTACT_MS, 5);
  });

  it('замах, выпад и падение не упираются в край листа', () => {
    for (const [id] of HEROES) {
      const s = sheets.get(id)!;
      for (const c of CLIPS) {
        s[c].frames.forEach((f, k) => {
          let touch = 0;
          const sh = s[c];
          for (let j = 0; j < sh.h; j++) for (let i = 0; i < sh.w; i++) if ((i === 0 || i === sh.w - 1 || j === 0) && f[(j * sh.w + i) * 4 + 3] > 0) touch++;
          expect(touch, `${id}: ${c}, кадр ${k}`).toBe(0);
        });
      }
    }
  });

  it('Воин: острие меча не уходит под землю — кроме нарочно воткнутого (лечение, сильный удар в землю)', () => {
    const model = HERO_MODELS.warrior;
    for (const c of CLIPS) {
      if (c === 'heal' || c === 'heavy' || c === 'death') continue;
      const tips: number[] = [];
      warriorProbe.on = (info) => tips.push(info.tipY - info.ground);
      renderHeroClip(model, c, HERO_STYLE);
      warriorProbe.on = undefined;
      tips.forEach((below, k) => expect(below, `${c}, кадр ${k}`).toBeLessThanOrEqual(1));
    }
  });

  it('рисунок детерминирован: та же модель — те же пиксели', () => {
    const a = renderHeroClip(HERO_MODELS.warrior, 'attack', HERO_STYLE);
    const b = renderHeroClip(HERO_MODELS.warrior, 'attack', HERO_STYLE);
    for (let f = 0; f < a.frames.length; f++) expect(print(a.frames[f])).toBe(print(b.frames[f]));
  });
});
