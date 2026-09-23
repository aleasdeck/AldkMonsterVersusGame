import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { HERO_LIST, heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { TRAITS } from '../src/data/traits';
import { createBattle, endTurn, getStatus, performAction, rageThreshold, resolveEnemyTurn, statusValue } from '../src/engine/combat';
import type { ArtTier, ArtifactInstance, BattleState, HeroPersistent } from '../src/engine/types';

/** Герой в забеге: навык своего уровня и черта; оружие на среднем уроне, дополнительные артефакты — в оружии. */
function mkBattle(heroId: string, enemies: string[], opts: { level?: ArtTier; arts?: ArtifactInstance[]; innate?: boolean } = {}) {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  gear.weapon.slots = opts.arts ?? [];
  gear.weapon.slotKinds = [];
  const hero: HeroPersistent = {
    defId: heroId,
    signature: def.signatures[0],
    innateTier: opts.innate === false ? undefined : (opts.level ?? 1),
    trait: def.traits[0],
    hp: 999,
    weapon: gear.weapon,
    armor: gear.armor,
    potion: null,
  };
  const rng = createRng(1);
  const state = createBattle(def, hero, enemies, rng);
  state.hero.stats.crit = 0;
  return { state, rng };
}

function pass(state: BattleState, rng: ReturnType<typeof createRng>) {
  endTurn(state);
  resolveEnemyTurn(state, rng);
}

describe('черты героев (v0.44)', () => {
  it('у каждого героя своя черта, и она существует', () => {
    for (const def of HERO_LIST) {
      expect(def.traits.length).toBeGreaterThan(0);
      for (const t of def.traits) expect(TRAITS[t]?.hero, `${def.id}: ${t}`).toBe(def.id);
    }
  });

  it('врождённый навык — плитка в бою с тиром уровня', () => {
    const { state } = mkBattle('warrior', ['bear'], { level: 3 });
    expect(state.hero.artifacts).toEqual([{ id: 'shield_bash', tier: 3 }]);
    expect(state.hero.innate).toBe('shield_bash');
  });

  it('Воин «Стойка»: удар оружием даёт блок, с третьей локации — 2', () => {
    const one = mkBattle('warrior', ['bear']);
    performAction(one.state, { type: 'attack', target: one.state.enemies[0].uid }, one.rng);
    expect(one.state.hero.block).toBe(1);
    const three = mkBattle('warrior', ['bear'], { level: 3 });
    performAction(three.state, { type: 'attack', target: three.state.enemies[0].uid }, three.rng);
    expect(three.state.hero.block).toBe(2);
  });

  it('Маг «Заряд»: заклинание копит заряд до трёх, обычный удар тратит все', () => {
    const { state, rng } = mkBattle('mage', ['bear']);
    const bear = state.enemies[0];
    performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid }, rng);
    performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid }, rng);
    expect(statusValue(state.hero, 'charge')).toBe(2);
    const hp = bear.hp;
    state.hero.sta = 2;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // Посох на середине кубика 5 (3–6) + 2 заряда × 3 = 11
    expect(hp - bear.hp).toBe(11);
    expect(getStatus(state.hero, 'charge')).toBeUndefined();
  });

  it('Ассасин «Отравитель»: удар в спину вешает Яд 2', () => {
    const { state, rng } = mkBattle('assassin', ['bear']);
    // Тёмный покров даёт тень на старте боя — первый удар из тени.
    expect(getStatus(state.hero, 'stealth')).toBeDefined();
    performAction(state, { type: 'attack', target: state.enemies[0].uid }, rng);
    expect(getStatus(state.enemies[0], 'poison')).toEqual({ id: 'poison', value: 2, turns: 3 });
  });

  it('Паладин «Вера»: половина лечения сверх максимума — блок', () => {
    const { state, rng } = mkBattle('paladin', ['bear']);
    state.hero.hp = state.hero.maxHp - 1;
    // Молот света лечит 2 на первом уровне: 1 до максимума, 1 сверху — половина (округление) в блок.
    performAction(state, { type: 'artifact', artifactId: 'light_hammer', target: state.enemies[0].uid }, rng);
    expect(state.hero.hp).toBe(state.hero.maxHp);
    expect(state.hero.block).toBe(Math.round(1 * 0.5));
    state.hero.block = 0;
    state.hero.statuses.push({ id: 'regen', value: 6, turns: 2 });
    pass(state, rng);
    expect(state.log.some((l) => l.includes('вера: избыток лечения'))).toBe(true);
  });

  it('Берсерк «Ярость»: треть HP полученного урона — Неистовство: +1 STA и удары без усталости', () => {
    const { state, rng } = mkBattle('berserk', ['bear']);
    const need = rageThreshold(state.hero);
    state.hero.statuses.push({ id: 'rage', value: need, turns: -1 });
    state.enemies[0].intent = 'roar';
    pass(state, rng);
    expect(getStatus(state.hero, 'fury')).toBeDefined();
    expect(state.hero.sta).toBe(4);
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // Без усталости во втором ударе хода нет множителя усталости.
    expect(state.log.filter((l) => l.startsWith('Герой бьёт')).slice(-1)[0]).not.toContain('усталость');
    // Урон копит Ярость.
    const before = statusValue(state.hero, 'rage');
    state.enemies[0].intent = 'paw';
    pass(state, rng);
    expect(statusValue(state.hero, 'rage')).toBeGreaterThan(before);
  });

  it('Лучник «Дистанция»: удар по второму в ряду сильнее на 25 %', () => {
    const { state, rng } = mkBattle('archer', ['bear', 'bear']);
    const [a, b] = state.enemies;
    const hpA = a.hp;
    performAction(state, { type: 'attack', target: a.uid }, rng);
    const nearDmg = hpA - a.hp;
    state.hero.attacks = 0;
    const hpB = b.hp;
    performAction(state, { type: 'attack', target: b.uid }, rng);
    expect(hpB - b.hp).toBe(Math.floor(nearDmg * 1.25));
    expect(state.log.some((l) => l.includes('дистанция +25 %'))).toBe(true);
  });

  it('без уровня навыка (тестовый герой) — ни навыка, ни черты', () => {
    const { state } = mkBattle('warrior', ['bear'], { innate: false });
    expect(state.hero.artifacts).toEqual([]);
    expect(state.hero.innate).toBeNull();
  });
});
