import { describe, expect, it } from 'vitest';
import { heroDef } from '../src/data/heroes';
import { createBattle } from '../src/engine/combat';
import { newRun } from '../src/engine/run';
import { delayEnemyShots, HIT_GAP, planEnemyFx } from '../src/ui/fx';

describe('стрелы скелета-лучника', () => {
  it.each([['Выстрел', 1], ['Залп', 2]] as const)('%s ждёт замаха и попадает в выбранную цель', (name, hits) => {
    const run = newRun('warrior', 6, 0);
    run.battle = createBattle(heroDef('warrior'), run.hero, ['skeleton_archer'], run.rng);
    const target = run.battle.enemies[0].uid;
    const before = JSON.stringify(run);
    const plan = planEnemyFx(run, [{ type: 'enemyAction', target, name }], 99);
    expect(plan.shots).toHaveLength(hits);
    expect(plan.shots.every((s) => s.kind === 'arrow' && s.to === 99 && s.from === target)).toBe(true);
    const flight = plan.impact;
    delayEnemyShots(plan, target, 500);
    expect(plan.shots.map((s) => s.delay)).toEqual(hits === 1 ? [500] : [500, 500 + HIT_GAP]);
    expect(plan.impact).toBe(500 + flight);
    expect(plan.lunged.has(target)).toBe(true);
    expect(JSON.stringify(run)).toBe(before);
  });

  it('оставляет врага без fx без снарядов', () => {
    const run = newRun('warrior', 6, 0);
    run.battle = createBattle(heroDef('warrior'), run.hero, ['skeleton_warrior'], run.rng);
    const target = run.battle.enemies[0].uid;
    const plan = planEnemyFx(run, [{ type: 'enemyAction', target, name: 'Удар мечом' }], 'hero');
    delayEnemyShots(plan, target, 320);
    expect(plan.shots).toEqual([]);
    expect(plan.impact).toBe(0);
  });
});

it('тёмная стрела некроманта выпускается после жеста и попадает через время полёта', () => {
  const run = newRun('warrior', 6, 0);
  run.battle = createBattle(heroDef('warrior'), run.hero, ['necromancer'], run.rng);
  const target = run.battle.enemies[0].uid;
  const before = JSON.stringify(run);
  const plan = planEnemyFx(run, [{ type: 'enemyAction', target, name: 'Тёмная стрела' }], 'hero');
  expect(plan.shots).toHaveLength(1);
  expect(plan.shots[0]).toMatchObject({ kind: 'orb', from: target, to: 'hero', color: '#7a3fb0' });
  delayEnemyShots(plan, target, 420);
  expect(plan.shots[0].delay).toBe(420);
  expect(plan.impact).toBe(750);
  expect(JSON.stringify(run)).toBe(before);
});
