import { describe, expect, it } from 'vitest';
import type { Sheet } from '../src/ui/mobs/pixel';
import { MOB_CONTACT_MS } from '../src/ui/mobs';
import { avatarCells, HERO_MODELS } from '../src/ui/heroes';
import { renderAvatar } from '../src/ui/heroes/avatar';
import { modelClip, modelClips } from '../src/ui/heroes/model';
import { contactMs, HERO_CLIPS, HERO_STYLE, renderHeroClip, type SculptClip } from '../src/ui/heroes/clips';
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

const HEROES = Object.entries(HERO_MODELS);
/** Листы всех клипов, которые рисует модель: общие и её личные. */
const sheets = new Map(HEROES.map(([id, m]) => [id, Object.fromEntries(modelClips(m).map((c) => [c, renderHeroClip(m, c, HERO_STYLE)])) as Partial<Record<SculptClip, Sheet>>]));
/** Лист клипа героя (клип модель рисует — иначе тест упадёт на `!`). */
const sheet = (id: string, c: SculptClip): Sheet => sheets.get(id)![c]!;

describe('герои пиксельной лепкой', () => {
  it('модели только у настоящих героев', () => {
    const ids = new Set(HERO_LIST.map((h) => h.id));
    for (const [id] of HEROES) expect(ids.has(id), id).toBe(true);
  });

  it('покой: кадры непустые, герой стоит на земле, рост по таблице HERO_BODY_HEIGHT', () => {
    for (const [id] of HEROES) {
      const sh = sheet(id, 'idle');
      expect(sh.frames, id).toHaveLength(HERO_CLIPS.idle.frames);
      const ground = sh.h - sh.foot;
      for (const f of sh.frames) expect(Math.abs(lowestRow(sh, f) + 1 - ground), id).toBeLessThanOrEqual(2);
      const body = (ground - sh.top) * sh.d;
      expect(Math.abs(body - HERO_BODY_HEIGHT[id]), `${id}: рост ${body}`).toBeLessThanOrEqual(6);
    }
  });

  it('каждый клип: своё число кадров по таблице, тот же размер кадра, что у покоя', () => {
    for (const [id, m] of HEROES) {
      const idle = sheet(id, 'idle');
      for (const c of modelClips(m)) {
        expect(sheet(id, c).frames, `${id}: ${c}`).toHaveLength(HERO_CLIPS[c].frames);
        expect([sheet(id, c).w, sheet(id, c).h], `${id}: ${c}`).toEqual([idle.w, idle.h]);
      }
    }
  });

  it('клип кончается позой покоя, кроме смерти — она лежит', () => {
    for (const [id, m] of HEROES) {
      const rest = sheet(id, 'idle').frames[0];
      for (const c of modelClips(m)) {
        if (c === 'idle') continue;
        const fr = sheet(id, c).frames;
        const last = fr[fr.length - 1];
        if (HERO_CLIPS[c].hold) expect(diff(last, rest), `${id}: ${c} держит свой кадр`).toBeGreaterThan(0.3);
        else expect(diff(last, rest), `${id}: ${c}`).toBeLessThan(0.02);
      }
    }
  });

  it('кадр контакта заметно отличается от покоя, урон начинается белой вспышкой', () => {
    for (const [id, m] of HEROES) {
      const rest = sheet(id, 'idle').frames[0];
      for (const c of modelClips(m)) {
        const k = HERO_CLIPS[c].contact;
        if (k !== undefined) expect(diff(sheet(id, c).frames[k], rest), `${id}: ${c}`).toBeGreaterThan(0.15);
      }
      expect(brightness(sheet(id, 'hurt').frames[0]), id).toBeGreaterThan(brightness(rest) + 60);
    }
  });

  it('личные клипы рисует только их хозяин, остальные играют замену; общие рисует каждый', () => {
    for (const [id, m] of HEROES) {
      const drawn = modelClips(m);
      for (const c of Object.keys(HERO_CLIPS) as SculptClip[]) {
        const spec = HERO_CLIPS[c];
        if (!spec.own) expect(drawn, `${id}: ${c}`).toContain(c);
        if (spec.own) expect(spec.instead, `${c}: нет замены`).toBeDefined();
        if (spec.own && !drawn.includes(c)) expect(modelClip(m, c), `${id}: ${c}`).toBe(spec.instead);
      }
      for (const c of m.own ?? []) expect(HERO_CLIPS[c].own, `${id}: ${c} — не личный клип`).toBe(true);
    }
    // Герой без личных клипов (будущий Маг) на Щитовой удар играет сильный удар, на Ответный — блок.
    const bare = { ...HERO_MODELS.warrior, own: [] };
    expect(modelClips(bare)).not.toContain('bash');
    expect(modelClip(bare, 'bash')).toBe('heavy');
    expect(modelClip(bare, 'riposte')).toBe('block');
  });

  it('удар героя касается цели в тот же момент, что удар врага-лепки: бой ждёт одного контакта', () => {
    expect(contactMs('attack')).toBeCloseTo(MOB_CONTACT_MS, 5);
  });

  it('замах, выпад и падение не упираются в край листа', () => {
    for (const [id, m] of HEROES) {
      for (const c of modelClips(m)) {
        const sh = sheet(id, c);
        sh.frames.forEach((f, k) => {
          let touch = 0;
          for (let j = 0; j < sh.h; j++) for (let i = 0; i < sh.w; i++) if ((i === 0 || i === sh.w - 1 || j === 0) && f[(j * sh.w + i) * 4 + 3] > 0) touch++;
          expect(touch, `${id}: ${c}, кадр ${k}`).toBe(0);
        });
      }
    }
  });

  it('конец оружия не уходит под землю — кроме клипов, где он там нарочно (у Воина лечение, сильный удар, смерть)', () => {
    for (const [id, model] of HEROES) {
      const probe = model.probe;
      if (!probe) continue;
      for (const c of modelClips(model)) {
        if (probe.grounded.includes(c)) continue;
        const tips: number[] = [];
        probe.on = (info) => tips.push(info.tipY - info.ground);
        renderHeroClip(model, c, HERO_STYLE);
        probe.on = undefined;
        tips.forEach((below, k) => expect(below, `${id}: ${c}, кадр ${k}`).toBeLessThanOrEqual(1));
      }
    }
    // Все клипы всех шести героев рисуются заново — секунд пять-шесть, дольше таймаута по умолчанию.
  }, 30_000);

  it('аватарка: квадрат без прозрачных клеток, герой в кадре, тот же рисунок при повторе — на всех размерах игры', () => {
    for (const [id, m] of HEROES) {
      for (const px of [112, 80, 44, 24]) {
        const n = avatarCells(px);
        const a = renderAvatar(m, n);
        expect(a.length, `${id}: ${px}`).toBe(n * n * 4);
        let holes = 0;
        for (let k = 3; k < a.length; k += 4) if (a[k] !== 255) holes++;
        expect(holes, `${id}: ${px}`).toBe(0);
        // Без фигуры остаются фон и рамка: герой должен закрывать заметную часть кадра.
        const bare = renderAvatar({ ...m, avatar: { ...m.avatar, draw: () => undefined } }, n);
        expect(diff(a, bare), `${id}: ${px}`).toBeGreaterThan(0.3);
        expect(print(renderAvatar(m, n)), `${id}: ${px}`).toBe(print(a));
      }
    }
  });

  it('рисунок детерминирован: та же модель — те же пиксели', () => {
    for (const [id, m] of HEROES) {
      const a = renderHeroClip(m, 'attack', HERO_STYLE);
      const b = renderHeroClip(m, 'attack', HERO_STYLE);
      for (let f = 0; f < a.frames.length; f++) expect(print(a.frames[f]), id).toBe(print(b.frames[f]));
    }
  });
});
