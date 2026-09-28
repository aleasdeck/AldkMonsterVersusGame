import { describe, expect, it } from 'vitest';
import { LOCK, LockRun } from '../src/ui/lockCore';

// Взлом сундука (v0.54.2): время и засечки без DOM. Зона встаёт посередине диапазона (rand = 0.5), время — в мс.
const mid = () => 0.5;
/** Когда отмычка входит в зону текущего штифта. */
const enterAt = (lr: LockRun) => lr.t0 + lr.dist / lr.spd;

describe('взлом сундука: отмычка и засечки', () => {
  it('первая зона — во второй половине круга, отмычка трогается после паузы на старте', () => {
    const lr = new LockRun(1, 0, mid);
    expect(lr.dist).toBe((LOCK.first[0] + LOCK.first[1]) / 2);
    expect(lr.zoneStart).toBe(210);
    expect(lr.phase).toBe('ready');
    // До старта тап не принимается и ничего не ломает.
    expect(lr.tap(LOCK.readyMs - 10)).toBe(false);
    expect(lr.hits).toHaveLength(0);
    lr.update(LOCK.readyMs);
    expect(lr.phase).toBe('run');
    expect(lr.angle(LOCK.readyMs + LOCK.lapMs / 4)).toBeCloseTo(90);
  });

  it('золото — «отлично», бронза — «хорошо», раньше зоны — срыв', () => {
    const great = new LockRun(1, 0, mid);
    expect(great.tap(enterAt(great) + (LOCK.great / 2) / great.spd)).toBe(true);
    expect(great.grades).toEqual(['great']);
    expect(great.hits[0].ms).toBeCloseTo(0);
    expect(great.phase).toBe('done');

    const good = new LockRun(1, 0, mid);
    good.tap(enterAt(good) + 150);
    expect(good.grades).toEqual(['good']);
    expect(good.hits[0].ms).toBeGreaterThan(0);

    const early = new LockRun(1, 0, mid);
    early.tap(enterAt(early) - 30);
    expect(early.grades).toEqual(['miss']);
    expect(early.hits[0].ms).toBeLessThan(0);
  });

  it('не успели: отмычка ушла из зоны — срыв сам, с запасом на задержку тапа', () => {
    const lr = new LockRun(1, 0, mid);
    const exit = lr.exitAt();
    // Тап, отправленный до выхода, засчитывается даже после кадра, который его опередил.
    lr.update(exit + LOCK.graceMs - 1);
    expect(lr.phase).toBe('run');
    lr.update(exit + LOCK.graceMs);
    expect(lr.grades).toEqual(['miss']);
    expect(lr.hits[0].ms).toBeNull();
    expect(lr.tap(exit + 100)).toBe(false);
  });

  it('штифты: после засечки разворот и ускорение, итог — худшая, первый срыв останавливает', () => {
    const lr = new LockRun(3, 0, mid);
    lr.tap(enterAt(lr) + 5);
    expect(lr.phase).toBe('pause');
    expect(lr.dir).toBe(-1);
    expect(lr.spd).toBeCloseTo((360 / LOCK.lapMs) * LOCK.speedup);
    // Следующая зона — впереди по новому ходу, пока пауза, отмычка стоит на месте засечки.
    const stop = lr.hitAngle;
    expect(lr.angle(lr.hitAt + 100)).toBe(stop);
    expect(lr.tap(lr.hitAt + 100)).toBe(false);
    lr.tap(enterAt(lr) + 150);
    expect(lr.grades).toEqual(['great', 'good']);
    expect(lr.worst).toBe('good');
    expect(lr.current).toBe(2);
    lr.tap(enterAt(lr) - 50);
    expect(lr.grades).toEqual(['great', 'good', 'miss']);
    expect(lr.worst).toBe('miss');
    expect(lr.phase).toBe('done');

    const stopped = new LockRun(3, 0, mid);
    stopped.tap(enterAt(stopped) - 50);
    expect(stopped.grades).toEqual(['miss']);
    expect(stopped.phase).toBe('done');
  });
});
