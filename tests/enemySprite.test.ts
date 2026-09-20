import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enemyDef } from '../src/data/enemies';

const ctx = {
  clearRect: vi.fn(), save: vi.fn(), scale: vi.fn(), translate: vi.fn(),
  rotate: vi.fn(), drawImage: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true,
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
