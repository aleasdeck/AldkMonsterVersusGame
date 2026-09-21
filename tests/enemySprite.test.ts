import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enemyDef } from '../src/data/enemies';

const ctx = {
  clearRect: vi.fn(), save: vi.fn(), scale: vi.fn(), translate: vi.fn(),
  rotate: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true,
  globalAlpha: 1, fillStyle: '',
};
let frames: FrameRequestCallback[];
let sprite: typeof import('../src/ui/enemySprite');

beforeEach(async () => {
  vi.resetModules();
  frames = [];
  vi.stubGlobal('Image', class {
    complete = true;
    naturalWidth = 1774;
    src = '';
  });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('document', {
    createElement: () => ({
      style: {}, dataset: {}, isConnected: true,
      setAttribute: vi.fn(), getContext: () => ctx,
    }),
  });
  vi.spyOn(performance, 'now').mockReturnValue(100);
  sprite = await import('../src/ui/enemySprite');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('рисованный враг: время первого кадра', () => {
  it.each(['attack', 'block', 'hurt'] as const)('%s: ранний timestamp RAF не оставляет пустой canvas', (clip) => {
    const def = enemyDef('skeleton_warrior');
    const canvas = sprite.enemySprite(def.sprite, def.id, 144, '', {});
    const root = { querySelector: () => canvas } as unknown as HTMLElement;
    expect(sprite.playEnemyClip(root, 1, clip)).toBe(true);
    const initialDraws = ctx.drawImage.mock.calls.length;

    // RAF датирован началом кадра; событие, запустившее клип, могло произойти позже в том же кадре.
    const first = frames.shift()!;
    expect(() => first(99.8)).not.toThrow();
    expect(ctx.drawImage.mock.calls.length).toBe(initialDraws + 1);
    expect(frames).toHaveLength(1);

    // После раннего кадра цикл продолжает рисовать и возвращается в покой.
    frames.shift()!(420);
    expect(canvas.dataset.clip).toBe(clip);
    frames.shift()!(1000);
    expect(canvas.dataset.clip).toBe('idle');
    expect(ctx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(initialDraws + 3);
  });
});

describe('скелет-лучник', () => {
  function mount(instance = {}) {
    const def = enemyDef('skeleton_archer');
    const canvas = sprite.enemySprite(def.sprite, def.id, 144, '', instance);
    const root = { querySelector: () => canvas } as unknown as HTMLElement;
    return { canvas, root };
  }

  function tick(now: number) {
    frames.splice(0).forEach((callback) => callback(now));
  }

  it.each(['shoot', 'volley', 'hurt'] as const)('%s не исчезает при раннем RAF и возвращается в покой', (clip) => {
    const { canvas, root } = mount();
    expect(sprite.playEnemyClip(root, 1, clip)).toBe(true);
    ctx.drawImage.mockClear();
    tick(99.8);
    expect(ctx.drawImage).toHaveBeenCalled();
    for (const args of ctx.drawImage.mock.calls) {
      expect(args.slice(1).every((value) => Number.isFinite(value))).toBe(true);
    }
    expect(canvas.dataset.clip).toBe(clip);
    tick(1100);
    expect(canvas.dataset.clip).toBe('idle');
    expect(frames).toHaveLength(1);
  });

  it('залп дважды отпускает тетиву с интервалом попаданий', async () => {
    const { HIT_GAP } = await import('../src/ui/fx');
    const { root } = mount();
    const release = sprite.playEnemyAction(root, 1, 'Залп');
    expect(release).toBeGreaterThan(0);
    const poseAt = (time: number) => {
      tick(time);
      return ctx.drawImage.mock.calls.at(-1)?.slice(1, 5);
    };
    const aiming = poseAt(100 + release - 1);
    const released = poseAt(100 + release);
    expect(released).not.toEqual(aiming);
    expect(poseAt(100 + release + HIT_GAP - 1)).toEqual(aiming);
    expect(poseAt(100 + release + HIT_GAP)).toEqual(released);
  });

  it('продолжает выстрел после render, но новый противник начинает в покое', () => {
    const instance = {};
    const first = mount(instance);
    sprite.playEnemyAction(first.root, 1, 'Выстрел');
    tick(500);
    Object.defineProperty(first.canvas, 'isConnected', { value: false });
    vi.mocked(performance.now).mockReturnValue(650);
    const second = mount(instance);
    expect(second.canvas.dataset.clip).toBe('shoot');
    tick(900);
    expect(second.canvas.dataset.clip).toBe('idle');
    expect(frames).toHaveLength(1);
    expect(mount().canvas.dataset.clip).toBe('idle');
  });

  it('в reduced motion показывает статичный спрайт, сохраняя время выстрела', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { root, canvas } = mount();
    const idle = ctx.drawImage.mock.calls.at(-1);
    expect(sprite.playEnemyAction(root, 1, 'Выстрел')).toBeGreaterThan(0);
    tick(600);
    expect(ctx.drawImage.mock.calls.at(-1)).toEqual(idle);
    tick(900);
    expect(canvas.dataset.clip).toBe('idle');
  });

  it('не подменяет блок лучника кадрами меча или выстрела', () => {
    const { root } = mount();
    expect(sprite.playEnemyClip(root, 1, 'block')).toBe(false);
    expect(sprite.playEnemyAction(root, 1, 'Удар мечом')).toBe(0);
  });
});

describe('некромант', () => {
  function mount(instance = {}) {
    const def = enemyDef('necromancer');
    const canvas = sprite.enemySprite(def.sprite, def.id, 144, '', instance);
    const root = { querySelector: () => canvas } as unknown as HTMLElement;
    return { canvas, root };
  }
  function tick(now: number) { frames.splice(0).forEach((callback) => callback(now)); }

  it.each(['bolt', 'summon', 'curse', 'block', 'hurt'] as const)('%s: ранний RAF, полный клип и возврат в покой', (clip) => {
    const { canvas, root } = mount();
    expect(sprite.playEnemyClip(root, 1, clip)).toBe(true);
    for (let now = 99.8; now < 1300; now += 40) {
      ctx.drawImage.mockClear();
      tick(now);
      expect(ctx.drawImage).toHaveBeenCalled();
      for (const args of ctx.drawImage.mock.calls) {
        expect(args.slice(1).every(Number.isFinite)).toBe(true);
        const [, x, y, w, h] = args as unknown as [unknown, number, number, number, number];
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(1161);
        expect(y + h).toBeLessThanOrEqual(1355);
      }
    }
    expect(canvas.dataset.clip).toBe('idle');
    expect(frames).toHaveLength(1);
  });

  it.each(['Тёмная стрела', 'Поднять скелета', 'Проклятие'])('%s: эффект совпадает со сменой позы на выброс', (name) => {
    const { root } = mount();
    const release = sprite.playEnemyAction(root, 1, name);
    expect(release).toBeGreaterThan(0);
    tick(100 + release - 1);
    const before = ctx.drawImage.mock.calls.at(-1)?.slice(1, 5);
    tick(100 + release);
    expect(ctx.drawImage.mock.calls.at(-1)?.slice(1, 5)).not.toEqual(before);
  });

  it('продолжает призыв после render и не передаёт клип новому врагу', () => {
    const instance = {};
    const first = mount(instance);
    sprite.playEnemyAction(first.root, 1, 'Поднять скелета');
    tick(660);
    Object.defineProperty(first.canvas, 'isConnected', { value: false });
    vi.mocked(performance.now).mockReturnValue(720);
    const second = mount(instance);
    expect(second.canvas.dataset.clip).toBe('summon');
    tick(1300);
    expect(second.canvas.dataset.clip).toBe('idle');
    expect(frames).toHaveLength(1);
    expect(mount().canvas.dataset.clip).toBe('idle');
  });

  it('после падения цельное тело плавно исчезает и не воскрешает врага', () => {
    const { canvas, root } = mount();
    sprite.playEnemyClip(root, 1, 'death');
    tick(99.8);
    ctx.drawImage.mockClear();
    tick(800);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    ctx.drawImage.mockClear();
    tick(1400);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.globalAlpha).toBeCloseTo(0.5);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    ctx.drawImage.mockClear();
    ctx.fillRect.mockClear();
    tick(4000);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(canvas.dataset.clip).toBe('death');
  });

  it('исчезновение в reduced motion плавное, без осколков и искр', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { root } = mount();
    sprite.playEnemyClip(root, 1, 'death');
    ctx.drawImage.mockClear();
    tick(1400);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.globalAlpha).toBeCloseTo(0.5);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('reduced motion сохраняет время заклинаний и статичный силуэт', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    const { root, canvas } = mount();
    const idle = ctx.drawImage.mock.calls.at(-1);
    expect(sprite.playEnemyAction(root, 1, 'Проклятие')).toBe(440);
    tick(650);
    expect(ctx.drawImage.mock.calls.at(-1)).toEqual(idle);
    tick(1300);
    expect(canvas.dataset.clip).toBe('idle');
  });

  it('не проигрывает чужие атаки', () => {
    const { root } = mount();
    expect(sprite.playEnemyAction(root, 1, 'Выстрел')).toBe(0);
    expect(sprite.playEnemyAction(root, 1, 'Удар мечом')).toBe(0);
  });
});
