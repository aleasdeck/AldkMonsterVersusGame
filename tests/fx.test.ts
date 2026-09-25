import { describe, expect, it } from 'vitest';
import { heroDef } from '../src/data/heroes';
import { createBattle } from '../src/engine/combat';
import { newRun } from '../src/engine/run';
import { planHeroFx } from '../src/ui/fx';
import { bakeRgba, dissolve } from '../src/ui/fx/bake';
import { FX_CLIPS } from '../src/ui/fx/clips';
import { eachRing, type Mask } from '../src/ui/fx/mask';
import { drawPlates, plateAfter, plateSync, PLATE_MS, type PlatePhase } from '../src/ui/fx/plates';
import { MOB_MODELS } from '../src/ui/mobs';
import { renderSheet } from '../src/ui/mobs/pixel';
import { MOB_STYLE } from '../src/ui/mobs/styles';

/** Лепка эффектов (v0.53, docs/lepka.md → «Лепка эффектов»): клипы, растворение, латы блока, рёв клича. */

const opaque = (px: Uint8ClampedArray): number => {
  let n = 0;
  for (let k = 3; k < px.length; k += 4) if (px[k] > 0) n++;
  return n;
};

describe('клипы лепки эффектов', () => {
  const clips = Object.entries(FX_CLIPS);

  it.each(clips)('%s: одинаковый от запуска к запуску', (_, c) => {
    const a = bakeRgba(c.w, c.h, c.n, c.draw, c.opts);
    const b = bakeRgba(c.w, c.h, c.n, c.draw, c.opts);
    expect(a.map((f) => f.px)).toEqual(b.map((f) => f.px));
  });

  it.each(clips)('%s: ничего не упирается в край кадра', (_, c) => {
    // Эффект, срезанный рамкой, в бою обрывается прямой линией — рамку клипа надо расширить.
    for (const { px, W, H } of bakeRgba(c.w, c.h, c.n, c.draw, c.opts)) {
      for (let i = 0; i < W; i++) for (const j of [0, H - 1]) expect(px[(j * W + i) * 4 + 3]).toBe(0);
      for (let j = 0; j < H; j++) for (const i of [0, W - 1]) expect(px[(j * W + i) * 4 + 3]).toBe(0);
    }
  });

  it.each(clips)('%s: виден с первого кадра и к последнему тает', (_, c) => {
    const frames = bakeRgba(c.w, c.h, c.n, c.draw, c.opts).map((f) => opaque(f.px));
    expect(frames[0]).toBeGreaterThan(0);
    expect(frames[frames.length - 1]).toBeLessThan(Math.max(...frames) * 0.5);
  });
});

describe('растворение', () => {
  const block = (): { px: Uint8ClampedArray; W: number; H: number } => {
    const W = 16, H = 16;
    const px = new Uint8ClampedArray(W * H * 4);
    for (let j = 2; j < 14; j++) for (let i = 2; i < 14; i++) px[(j * W + i) * 4 + 3] = 255;
    return { px, W, H };
  };

  it('на нуле кадр не трогает, на единице гасит весь', () => {
    const a = block();
    dissolve(a.px, a.W, a.H, 0);
    expect(opaque(a.px)).toBe(144);
    dissolve(a.px, a.W, a.H, 1);
    expect(opaque(a.px)).toBe(0);
  });

  it('погасшая клетка не возвращается, края уходят первыми', () => {
    const low = block(), high = block();
    dissolve(low.px, low.W, low.H, 0.35);
    dissolve(high.px, high.W, high.H, 0.7);
    for (let k = 3; k < low.px.length; k += 4) if (low.px[k] === 0) expect(high.px[k]).toBe(0);
    // Середина квадрата на малом уровне цела, край уже тает.
    expect(low.px[(8 * 16 + 8) * 4 + 3]).toBe(255);
    expect(opaque(low.px)).toBeLessThan(144);
  });
});

describe('кольца вокруг силуэта', () => {
  it('контур снаружи и край внутри квадрата 4×4', () => {
    const M: Mask = { x0: 10, y0: 20, w: 4, h: 4, m: new Uint8Array(16).fill(1) };
    let out = 0, inn = 0;
    eachRing(M, (x, y, dOut, dIn) => {
      if (dOut === 1) {
        out++;
        expect(x >= 9 && x <= 14 && y >= 19 && y <= 24).toBe(true);
      }
      if (dIn === 1) inn++;
    });
    // Контур по четырём соседям — без углов: по 4 клетки на сторону; внутри край — 12 клеток из 16.
    expect(out).toBe(16);
    expect(inn).toBe(12);
  });
});

describe('латы блока', () => {
  it('фазы переходят сами по времени', () => {
    expect(plateAfter('build', PLATE_MS.BUILD - 1)).toBe('build');
    expect(plateAfter('build', PLATE_MS.BUILD)).toBe('hold');
    expect(plateAfter('hit', PLATE_MS.HIT)).toBe('hold');
    expect(plateAfter('hold', 1e6)).toBe('hold');
    expect(plateAfter('melt', PLATE_MS.MELT)).toBeNull();
    expect(plateAfter('break', PLATE_MS.BREAK)).toBeNull();
  });

  it.each<[PlatePhase | null, number, boolean | null, PlatePhase | 'keep']>([
    [null, 5, null, 'hold'], // блок на старте боя или после перезагрузки — латы просто стоят
    [null, 5, true, 'hold'],
    ['hold', 5, true, 'hit'], // удар в блок, блок остался — звенят
    ['build', 5, true, 'keep'], // только встают — не перебивать
    ['hold', 5, false, 'keep'],
    ['hold', 0, true, 'break'], // пробили
    ['hold', 0, false, 'melt'], // сгорел в начале хода или снят приёмом
    ['hold', 0, null, 'keep'], // перерисовка без событий ничего не снимает
    ['melt', 5, false, 'build'], // растаяли, а блок снова есть
    [null, 0, true, 'keep'],
  ])('лат %s, блок %i, удар %s → %s', (phase, block, struck, want) => {
    expect(plateSync(phase, block, struck)).toBe(want);
  });

  // Силуэт волка из его листа лепки — тот же, что игра берёт у врага на поле.
  const wolf = renderSheet(MOB_MODELS.wolf, MOB_STYLE).frames[0];
  const { w, h } = renderSheet(MOB_MODELS.wolf, MOB_STYLE);
  const M: Mask = { x0: 0, y0: 0, w, h, m: Uint8Array.from({ length: w * h }, (_, k) => (wolf[k * 4 + 3] === 255 ? 1 : 0)) };
  const cells = (phase: PlatePhase, t: number): Map<string, number> => {
    const out = new Map<string, number>();
    drawPlates((x, y) => out.set(`${x},${y}`, 1), M, phase, t, -1);
    return out;
  };
  const rings = new Map<string, number>();
  eachRing(M, (x, y, dOut) => rings.set(`${x},${y}`, dOut));

  it('ложатся только вокруг фигуры: встают в две клетки, стоят в одну', () => {
    const build = cells('build', PLATE_MS.BUILD_UP + 20);
    const hold = cells('hold', 1000);
    expect(build.size).toBeGreaterThan(hold.size);
    for (const k of build.keys()) expect([1, 2]).toContain(rings.get(k));
    for (const k of hold.keys()) expect(rings.get(k)).toBe(1);
  });

  it('встают снизу вверх, тают до конца', () => {
    const early = [...cells('build', 30).keys()].map((k) => Number(k.split(',')[1]));
    expect(Math.min(...early)).toBeGreaterThan(h * 0.6);
    expect(cells('melt', PLATE_MS.MELT - 1).size).toBeLessThan(cells('hold', 0).size * 0.1);
  });

  it('удар сбивает пластины со стороны героя', () => {
    const before = cells('hold', 0);
    const after = cells('hit', 200);
    // Враг: бьют слева (side −1) — пропавшие клетки лежат на левой половине фигуры.
    const lost = [...before.keys()].filter((k) => !after.has(k)).map((k) => Number(k.split(',')[0]));
    expect(lost.length).toBeGreaterThan(0);
    const mid = lost.reduce((a, b) => a + b, 0) / lost.length;
    expect(mid).toBeLessThan(w / 2);
  });
});

describe('Боевой клич и приёмы блока в плане анимации', () => {
  const run = newRun('warrior', 6, 0);
  run.battle = createBattle(heroDef('warrior'), run.hero, ['goblin'], run.rng);

  it('клич — рёв лепки вместо свечения', () => {
    const plan = planHeroFx(run, { type: 'artifact', artifactId: 'war_cry' });
    expect(plan.after).toEqual([{ kind: 'sculpt', sculpt: 'roar', color: '#ffd166', target: 'hero' }]);
    expect(plan.shots).toEqual([]);
  });

  it('приём с блоком на себя — латы', () => {
    const plan = planHeroFx(run, { type: 'artifact', artifactId: 'mana_shield' });
    expect(plan.after.map((a) => a.kind)).toEqual(['shield']);
  });
});
