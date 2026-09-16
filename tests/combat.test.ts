import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { ENEMY_LIST, PHASE_SHIFT, enemyDef } from '../src/data/enemies';
import { LOCATIONS } from '../src/data/locations';
import {
  canUseAction,
  computeAllyIntent,
  computeIntent,
  INTENT_ICON,
  createBattle,
  describeAction,
  endTurn,
  enemyStep,
  getStatus,
  onDeathInfo,
  performAction,
  previewAttack,
  previewOnTarget,
  resolveEnemyTurn,
  riposteDamage,
} from '../src/engine/combat';
import type { ArtifactInstance, BattleState, GearTier, HeroPersistent } from '../src/engine/types';

const LEGACY_PAIR: Record<string, [string, string]> = {
  warrior: ['crippling_shot', 'troll_heart'],
  mage: ['fireball', 'mana_shield'],
  assassin: ['smoke_bomb', 'poison_vial'],
  paladin: ['heal', 'turtle_shell'],
  berserk: ['war_cry', 'rage'],
  archer: ['aimed_shot', 'crippling_shot'],
};

function mkHero(heroId: string, extra: ArtifactInstance[] = [], potion: string | null = null): HeroPersistent {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  // Фиксируем урон оружия на среднем значении, чтобы ожидания в тестах были точными.
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  // Классическая пара до v0.14 (приём + второй артефакт): тесты приёмов писались под неё.
  const pair = LEGACY_PAIR[heroId];
  gear.weapon.slots = [{ id: pair[0], tier: 1 }];
  gear.armor.slots = [{ id: pair[1], tier: 1 }];
  // Дополнительные артефакты — в расширенные слоты оружия.
  for (const a of extra) gear.weapon.slots.push(a);
  return { defId: heroId, signature: def.signatures[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion };
}

function mkBattle(heroId: string, enemies: string[], opts: { extra?: ArtifactInstance[]; seed?: number; potion?: string } = {}) {
  const rng = createRng(opts.seed ?? 1);
  const hero = mkHero(heroId, opts.extra, opts.potion ?? null);
  const state = createBattle(heroDef(heroId), hero, enemies, rng);
  // криты выключаем, чтобы урон был детерминирован
  state.hero.stats.crit = 0;
  return { state, rng };
}

function first(state: BattleState) {
  return state.enemies[0];
}

function pass(state: BattleState, rng: ReturnType<typeof createRng>, times = 1) {
  for (let i = 0; i < times; i++) {
    endTurn(state);
    resolveEnemyTurn(state, rng);
  }
}

describe('базовые действия', () => {
  it('удар наносит урон оружия и тратит стамину', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    expect(state.hero.sta).toBe(3);
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(first(state).hp).toBe(12 - 5);
    expect(state.hero.sta).toBe(2);
  });

  it('каждая следующая атака в ходу слабее', () => {
    const { state, rng } = mkBattle('warrior', ['bear']);
    const bear = first(state);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // 5, floor(5 × 0.75) = 3, floor(5 × 0.5625) = 2
    expect(bear.hp).toBe(35 - 5 - 3 - 2);
    // на новом ходу усталость сбрасывается
    pass(state, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 5 - 3 - 2 - 5);
  });

  it('берсерк выдыхается медленнее остальных', () => {
    const w = mkBattle('warrior', ['bear']);
    const b = mkBattle('berserk', ['bear']);
    expect(w.state.hero.stats.fatigue).toBe(0.75); // у Воина своя, как у Берсерка
    expect(b.state.hero.stats.fatigue).toBeCloseTo(0.85); // своя 0.8 + перк топора
  });

  it('защита даёт 80 % от DEF героя + DEF брони, округление вверх; блок съедает урон врага', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    // (6 героя + 1 кольчуга + 1 Парирование меча) × 0,8 = 6,4 → 7
    expect(state.hero.block).toBe(7);
    const hpBefore = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hpBefore);
    expect(state.turn).toBe(2);
    expect(state.hero.block).toBe(0);
  });

  it('защита — раз за ход', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    expect(canUseAction(state, { type: 'defend' })).toMatch(/раз за ход/);
    pass(state, rng);
    expect(canUseAction(state, { type: 'defend' })).toBeNull();
  });

  it('без блока враг бьёт по HP, стамина восстанавливается', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    const hpBefore = state.hero.hp;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    pass(state, rng);
    // Укус 5, Кольца кольчуги воина гасят 1
    expect(state.hero.hp).toBe(hpBefore - 4);
    expect(state.hero.sta).toBe(3);
    expect(state.phase).toBe('player');
  });

  it('нельзя действовать без стамины', () => {
    const { state, rng } = mkBattle('mage', ['boar']);
    const uid = first(state).uid;
    performAction(state, { type: 'attack', target: uid }, rng);
    performAction(state, { type: 'attack', target: uid }, rng);
    expect(canUseAction(state, { type: 'defend' })).toBe('Нет стамины');
    expect(() => performAction(state, { type: 'attack', target: uid }, rng)).toThrow();
  });

  it('убийство всех врагов — победа', () => {
    const { state, rng } = mkBattle('berserk', ['wolf']);
    const uid = first(state).uid;
    first(state).hp = 4;
    performAction(state, { type: 'attack', target: uid }, rng);
    expect(state.enemies.length).toBe(0);
    expect(state.phase).toBe('won');
    expect(state.stats.kills).toBe(1);
  });

  it('смерть героя — поражение', () => {
    const { state, rng } = mkBattle('mage', ['golem']);
    state.hero.hp = 3;
    pass(state, rng);
    expect(state.hero.hp).toBe(0);
    expect(state.phase).toBe('lost');
  });
});

describe('намерения', () => {
  it('показывают итоговый урон с учётом баффа силы', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    const wolf = first(state);
    expect(computeIntent(wolf)).toMatchObject({ kind: 'attack', label: '5' });
    pass(state, rng, 3); // укус, укус, вой
    expect(getStatus(wolf, 'strength')?.value).toBe(2);
    expect(computeIntent(wolf)).toMatchObject({ kind: 'attack', label: '7' });
  });

  it('вой усиливает всех волков, но не кабана', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'boar']);
    pass(state, rng, 3);
    expect(getStatus(state.enemies[0], 'strength')?.value).toBe(4);
    expect(getStatus(state.enemies[1], 'strength')?.value).toBe(4);
    expect(getStatus(state.enemies[2], 'strength')).toBeUndefined();
  });

  it('множественный удар подписан как N×M, замах — без чисел', () => {
    const { state } = mkBattle('warrior', ['cutthroat', 'egg_cluster']);
    const e = first(state);
    e.intent = 'double';
    expect(computeIntent(e).label).toBe('3×2');
    // Замах Минотавра с v0.38 даёт блок — чистый ход без эффекта остался у Пульсации кладки.
    const m = state.enemies[1];
    m.intent = 'pulse';
    expect(computeIntent(m)).toMatchObject({ kind: 'special', label: '', text: 'Пульсация' });
  });

  it('предпросмотр остатка HP цели: блок гасит удар, но не пробивающий и не заклинание', () => {
    const { state } = mkBattle('warrior', ['wolf']);
    const wolf = first(state);
    wolf.block = 3;
    expect(wolf.hp).toBe(12);
    // Удар 4–6 сквозь блок 3: снимет 1–3, останется 9–11.
    expect(previewOnTarget(state, wolf, { min: 4, max: 6 })).toEqual({ min: 9, max: 11 });
    expect(previewOnTarget(state, wolf, { min: 4, max: 6 }, 'spell')).toEqual({ min: 9, max: 11 });
    state.hero.stats.pierceBlock = 1;
    expect(previewOnTarget(state, wolf, { min: 4, max: 6 })).toEqual({ min: 6, max: 8 });
    expect(previewOnTarget(state, wolf, { min: 4, max: 6 }, 'spell')).toEqual({ min: 9, max: 11 });
    // Урон больше HP — остаток не уходит в минус.
    expect(previewOnTarget(state, wolf, { min: 20, max: 30 })).toEqual({ min: 0, max: 0 });
    wolf.statuses.push({ id: 'invuln', value: 1, turns: 1 });
    expect(previewOnTarget(state, wolf, { min: 4, max: 6 })).toEqual({ min: 12, max: 12 });
  });
});

describe('статусы', () => {
  it('кровотечение тикает 3 хода, стакается и игнорирует блок', () => {
    // Второй тир: на первом Кровопускание применяется раз в ход (v0.37.1), а здесь нужен стак в один ход.
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'bleed_cut', tier: 2 }] });
    const boar = first(state);
    boar.hp = 50;
    boar.maxHp = 50;
    boar.intent = 'bristle';
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toMatchObject({ value: 4, turns: 3 });
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toMatchObject({ value: 8, turns: 3 });
    const hp0 = boar.hp;
    pass(state, rng);
    expect(boar.hp).toBe(hp0 - 8);
    pass(state, rng, 2);
    expect(boar.hp).toBe(hp0 - 24);
    expect(getStatus(boar, 'bleed')).toBeUndefined();
  });

  it('v0.37.1: Кровопускание на первом тире — раз в ход, на следующем ходу снова доступно', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'bleed_cut', tier: 1 }] });
    const boar = first(state);
    boar.hp = 50;
    boar.maxHp = 50;
    boar.intent = 'bristle';
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toMatchObject({ value: 3, turns: 3 });
    expect(canUseAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid })).toMatch(/Не больше 1 раз за ход/);
    expect(state.hero.sta).toBe(2); // стамина осталась, дело не в ней
    pass(state, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid })).toBeNull();
  });

  it('оглушение заставляет врага пропустить действие', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stun_strike', tier: 1 }] });
    const boar = first(state);
    const hp0 = state.hero.hp;
    performAction(state, { type: 'artifact', artifactId: 'stun_strike', target: boar.uid }, rng);
    expect(getStatus(boar, 'stun')).toBeDefined();
    expect(state.hero.cooldowns.stun_strike).toBe(3);
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0);
    expect(getStatus(boar, 'stun')).toBeUndefined();
    expect(boar.intent).toBe('ram');
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 6); // таран 7, Кольца кольчуги гасят 1
  });

  it('слабость режет урон героя на 25 %', () => {
    const { state, rng } = mkBattle('warrior', ['ghost']);
    pass(state, rng);
    expect(getStatus(state.hero, 'weak')).toBeDefined();
    const ghost = first(state);
    const hp0 = ghost.hp;
    performAction(state, { type: 'attack', target: ghost.uid }, rng);
    expect(ghost.hp).toBe(hp0 - Math.floor(5 * 0.75));
  });

  it('изнурение отнимает стамину на следующем ходу', () => {
    const { state, rng } = mkBattle('warrior', ['bear']);
    first(state).intent = 'hug';
    pass(state, rng);
    expect(state.hero.sta).toBe(2);
    pass(state, rng);
    expect(state.hero.sta).toBe(3);
  });

  it('уклонение героя съедает один удар', () => {
    const { state, rng } = mkBattle('mage', ['cutthroat'], { extra: [{ id: 'dodge', tier: 1 }] });
    first(state).intent = 'double';
    performAction(state, { type: 'artifact', artifactId: 'dodge' }, rng);
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 3);
    expect(getStatus(state.hero, 'dodge')).toBeUndefined();
  });

  it('шипы героя ранят атакующего', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], { extra: [{ id: 'thorns', tier: 2 }] });
    pass(state, rng);
    expect(first(state).hp).toBe(12 - 2);
  });

  // Обратная сторона (шипы героя против блока врага) в игре недостижима: блок врага сгорает в начале его хода,
  // а шипы отвечают на его же удар — к этому моменту блока у него нет. Симметрию в damageEnemy оставили на будущее.
  it('шипы врага упираются в блок героя, но не тратят уклонение', () => {
    const { state, rng } = mkBattle('warrior', ['beetle']);
    const beetle = first(state);
    beetle.statuses.push({ id: 'thorns', value: 3, turns: -1 });
    state.hero.block = 2; // шипы 3: двойку съест блок, единица дойдёт до HP
    const hp0 = state.hero.hp;
    performAction(state, { type: 'attack', target: beetle.uid }, rng);
    expect(state.hero.block).toBe(0);
    expect(state.hero.hp).toBe(hp0 - 1);
  });

  it('вампирский клык лечит при базовой атаке', () => {
    const { state, rng } = mkBattle('berserk', ['boar'], { extra: [{ id: 'vampire_fang', tier: 1 }] });
    state.hero.hp = state.hero.maxHp - 10;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.hero.hp).toBe(state.hero.maxHp - 9);
  });
});

describe('новые механики врагов', () => {
  it('пробивающая атака игнорирует блок', () => {
    const { state, rng } = mkBattle('warrior', ['goblin']);
    first(state).intent = 'sneak';
    performAction(state, { type: 'defend' }, rng);
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 4); // 5 сквозь блок, Кольца кольчуги гасят 1
  });

  it('уклонение врага съедает атаку, но не заклинание', () => {
    const { state, rng } = mkBattle('mage', ['bat']);
    const bat = first(state);
    bat.intent = 'flutter';
    pass(state, rng);
    expect(getStatus(bat, 'dodge')).toBeDefined();
    performAction(state, { type: 'attack', target: bat.uid }, rng);
    expect(bat.hp).toBe(9);
    expect(getStatus(bat, 'dodge')).toBeUndefined();
    bat.intent = 'flutter';
    pass(state, rng);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: bat.uid }, rng);
    // 5 по тиру (v0.38) + 1 к заклинаниям от магического посоха
    expect(bat.hp).toBe(9 - 6);
  });

  it('вампирская атака лечит врага', () => {
    const { state, rng } = mkBattle('warrior', ['vampire']);
    const v = first(state);
    v.hp = 10;
    v.intent = 'bite';
    pass(state, rng);
    expect(v.hp).toBe(18); // укус 9 − 1 Кольца кольчуги = 8 лечения
  });

  it('слизень делится при смерти', () => {
    const { state, rng } = mkBattle('warrior', ['grave_slime']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.phase).toBe('player');
    expect(state.enemies.map((e) => e.defId)).toEqual(['slimelet', 'slimelet']);
  });

  it('лавовый слизень взрывается при смерти', () => {
    const { state, rng } = mkBattle('warrior', ['lava_slime']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    const hp0 = state.hero.hp;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.phase).toBe('won');
    expect(state.hero.hp).toBe(hp0 - 7); // взрыв 8, Кольца кольчуги гасят 1
    expect(getStatus(state.hero, 'burn')?.value).toBe(2);
  });

  it('враг не копит уклонение поверх непотраченного заряда', () => {
    const { state, rng } = mkBattle('warrior', ['bat']);
    // Цикл мыши — Укус / Порхание. Герой не бьёт, так что заряд остаётся непотраченным.
    pass(state, rng, 2);
    expect(getStatus(first(state), 'dodge')?.value).toBe(1);
    // Без условия здесь копилось бы 2, 3, 4… до конца боя: заряды складываются и не спадают.
    pass(state, rng, 4);
    expect(getStatus(first(state), 'dodge')?.value).toBe(1);
    // Заряд съеден ударом — значит на следующем ходу мышь снова может порхнуть.
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(getStatus(first(state), 'dodge')).toBeUndefined();
    pass(state, rng, 2);
    expect(getStatus(first(state), 'dodge')?.value).toBe(1);
  });

  it('кладка щетинится, вылупляется на третий ход и не щетинится дважды', () => {
    const { state, rng } = mkBattle('warrior', ['egg_cluster']);
    const hp0 = state.hero.hp;
    pass(state, rng); // Щетина: шипы 3, сама не бьёт
    expect(state.hero.hp).toBe(hp0);
    expect(getStatus(first(state), 'thorns')?.value).toBe(3);
    pass(state, rng); // Пульсация: ничего
    expect(state.enemies.length).toBe(1);
    pass(state, rng); // Вылупление: две личинки — вперёд, заслоняя кладку (v0.26)
    expect(state.enemies.map((e) => e.defId)).toEqual(['larva', 'larva', 'egg_cluster']);
    const egg = state.enemies.find((e) => e.defId === 'egg_cluster')!;
    // Второй круг: щетина не накладывается поверх своей же — шипы остаются 3.
    pass(state, rng, 3);
    expect(getStatus(egg, 'thorns')?.value).toBe(3);
  });

  it('разбитая кладка не оставляет ни личинок, ни предсмертия', () => {
    const { state, rng } = mkBattle('warrior', ['egg_cluster']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    expect(getStatus(first(state), 'doom')).toBeUndefined();
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.phase).toBe('won');
    expect(state.enemies.length).toBe(0);
  });

  it('ядовитые приёмы врагов травят, а не ослабляют', () => {
    const { state, rng } = mkBattle('warrior', ['spider']);
    first(state).intent = 'bite';
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(getStatus(state.hero, 'poison')?.value).toBe(1);
    expect(getStatus(state.hero, 'weak')).toBeUndefined();
    // Яд капает в начале хода героя и идёт мимо блока.
    expect(state.hero.hp).toBe(hp0 - 3 - 1); // укус 4, Кольца кольчуги гасят 1, затем яд 1
  });

  it('проклятие мумии портит урон, а не пускает кровь', () => {
    const { state, rng } = mkBattle('warrior', ['mummy']);
    first(state).intent = 'curse';
    pass(state, rng);
    expect(getStatus(state.hero, 'weak')?.turns).toBe(3);
    expect(getStatus(state.hero, 'bleed')).toBeUndefined();
  });

  it('огонь импа висит на Огненном плевке, а не на Пакости', () => {
    const { state, rng } = mkBattle('warrior', ['imp']);
    first(state).intent = 'spit';
    pass(state, rng);
    expect(getStatus(state.hero, 'burn')?.value).toBe(3);
  });

  it('приём «блок + шипы» читается щитом с числом, шипы уходят вторым бейджем', () => {
    const beetle = enemyDef('beetle');
    const info = describeAction(beetle, beetle.actions.find((a) => a.id === 'shell')!);
    expect(info.kind).toBe('defend');
    expect(info.icon).toBe(INTENT_ICON.defend);
    expect(info.label).toBe('12');
    expect(info.kinds).toEqual(['defend', 'buff']);
    expect(info.selfStatuses).toEqual(['thorns']);
  });

  it('травяной отвар лечит и снимает все отрицательные эффекты', () => {
    const { state, rng } = mkBattle('warrior', ['spider'], { extra: [{ id: 'herbal_brew', tier: 1 }] });
    const h = state.hero;
    h.hp = h.stats.maxHp - 10;
    h.statuses.push({ id: 'bleed', value: 3, turns: 3 }, { id: 'poison', value: 2, turns: 3 }, { id: 'weak', value: 1, turns: 2 });
    performAction(state, { type: 'artifact', artifactId: 'herbal_brew' }, rng);
    expect(h.hp).toBe(h.stats.maxHp - 7); // отвар тира 1 лечит 3
    expect(getStatus(h, 'bleed')).toBeUndefined();
    expect(getStatus(h, 'poison')).toBeUndefined();
    expect(getStatus(h, 'weak')).toBeUndefined();
  });

  it('глухая оборона даёт блок и снимает только Слабость и Изнурение, раны остаются', () => {
    const { state, rng } = mkBattle('warrior', ['spider'], { extra: [{ id: 'deaf_defense', tier: 1 }] });
    const h = state.hero;
    h.statuses.push({ id: 'bleed', value: 3, turns: 3 }, { id: 'weak', value: 1, turns: 2 }, { id: 'exhaust', value: 1, turns: 2 });
    const block0 = h.block;
    performAction(state, { type: 'artifact', artifactId: 'deaf_defense' }, rng);
    expect(h.block).toBe(block0 + 4);
    expect(getStatus(h, 'weak')).toBeUndefined();
    expect(getStatus(h, 'exhaust')).toBeUndefined();
    expect(getStatus(h, 'bleed')).toBeDefined();
  });

  it('бронные пассивки v0.31.1 работают как перки брони: удар слабее, первая атака мимо', () => {
    const { state } = mkBattle('warrior', ['spider'], {
      extra: [
        { id: 'stone_hide', tier: 3 },
        { id: 'evasion_amulet', tier: 3 },
      ],
    });
    const s = state.hero.stats;
    expect(s.hitReduce).toBe(2 + 1); // + Кольца стартовой кольчуги
    expect(s.dodgeStart).toBe(2);
    // Уклонение из Амулета вешается в начале боя, как Тень плаща.
    expect(getStatus(state.hero, 'dodge')?.value).toBe(2);
  });

  it('споровик при гибели оставляет облако спор', () => {
    const { state, rng } = mkBattle('warrior', ['sporeling', 'larva']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.phase).toBe('player');
    expect(getStatus(state.hero, 'vulnerable')?.turns).toBe(2);
  });

  it('щупальце при гибели изнуряет', () => {
    const { state, rng } = mkBattle('warrior', ['tentacle', 'larva']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    const hp0 = state.hero.hp;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.hero.hp).toBe(hp0 - 5); // захват 6, Кольца кольчуги гасят 1
    expect(getStatus(state.hero, 'exhaust')).toBeTruthy();
  });

  it('порох мартышки рвётся, если убить её до Подрыва, и только один раз, если она подорвалась сама', () => {
    const early = mkBattle('warrior', ['powder_monkey']);
    early.state.hero.stats.dmgMin = 99;
    early.state.hero.stats.dmgMax = 99;
    const hp0 = early.state.hero.hp;
    performAction(early.state, { type: 'attack', target: first(early.state).uid }, early.rng);
    expect(early.state.phase).toBe('won');
    expect(early.state.hero.hp).toBe(hp0 - 5); // порох 6, Кольца кольчуги гасят 1

    // Подорвалась сама: считается только её собственный взрыв, onDeath не добавляется.
    const self = mkBattle('warrior', ['powder_monkey']);
    first(self.state).intent = 'boom';
    const hp1 = self.state.hero.hp;
    pass(self.state, self.rng);
    expect(self.state.phase).toBe('won');
    expect(self.state.hero.hp).toBe(hp1 - 19); // подрыв 20, Кольца кольчуги гасят 1

    // Фитиль на два хода: два броска бочонка, Подрыв только третьим действием.
    const fuse = mkBattle('warrior', ['powder_monkey']);
    expect(first(fuse.state).intent).toBe('throw');
    pass(fuse.state, fuse.rng);
    expect(first(fuse.state).intent).toBe('throw');
    pass(fuse.state, fuse.rng);
    expect(first(fuse.state).intent).toBe('boom');
    expect(fuse.state.phase).toBe('player');
    fuse.state.hero.hp = 99;
    pass(fuse.state, fuse.rng);
    expect(fuse.state.phase).toBe('won');
  });

  it('метка «Предсмертие» висит только на врагах с эффектом при смерти и расписывает его', () => {
    const { state } = mkBattle('warrior', ['sporeling', 'larva']);
    const [spore, larva] = state.enemies;
    expect(getStatus(spore, 'doom')).toBeTruthy();
    expect(getStatus(larva, 'doom')).toBeUndefined();
    const info = onDeathInfo(spore)!;
    expect(info.name).toBe('Облако спор');
    expect(info.detail).toContain('Уязвимость');
    expect(onDeathInfo(larva)).toBeNull();
  });

  it('имп-бомбардир подрывается сам', () => {
    const { state, rng } = mkBattle('warrior', ['kamikaze_imp']);
    first(state).intent = 'boom';
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 17); // подрыв 18, Кольца кольчуги гасят 1
    expect(state.enemies.length).toBe(0);
    expect(state.phase).toBe('won');
  });

  it('тролль регенерирует только раненым', () => {
    const { state, rng } = mkBattle('warrior', ['troll']);
    const t = first(state);
    expect(t.intent).toBe('club');
    pass(state, rng);
    // здоров — регенерация пропущена, цикл идёт дальше
    expect(t.intent).toBe('club');
    t.hp = 20;
    pass(state, rng);
    expect(t.intent).toBe('stomp');
    pass(state, rng);
    expect(t.intent).toBe('club');
    pass(state, rng);
    expect(t.intent).toBe('regen');
  });

  it('все враги из таблиц встреч существуют', () => {
    const ids = new Set(ENEMY_LIST.map((e) => e.id));
    for (const loc of LOCATIONS) {
      for (const table of Object.values(loc.encounters)) {
        for (const group of table) for (const id of group) expect(ids.has(id), `${loc.id}: ${id}`).toBe(true);
      }
    }
  });
});

describe('мана и артефакты', () => {
  it('огненный шар тратит ману, бьёт по тиру + сила заклинаний и поджигает, раз в ход', () => {
    const { state, rng } = mkBattle('mage', ['boar']);
    const boar = first(state);
    // 5 маны + 2 Резерв посоха
    expect(state.hero.mp).toBe(7);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid }, rng);
    // 5 по тиру (v0.38) + 1 магический посох; Горение 2 на 2 хода
    expect(boar.hp).toBe(18 - 6);
    expect(getStatus(boar, 'burn')).toEqual({ id: 'burn', value: 2, turns: 2 });
    expect(state.hero.mp).toBe(5);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid })).toMatch(/Перезарядка/);
    pass(state, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid })).toBeNull();
  });

  it('мана восстанавливается на реген со второго хода', () => {
    const { state, rng } = mkBattle('mage', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: first(state).uid }, rng);
    expect(state.hero.mp).toBe(5);
    pass(state, rng);
    expect(state.hero.mp).toBe(7);
  });

  it('лечение паладина: стоит ману и стамину, кулдаун 3', () => {
    const { state, rng } = mkBattle('paladin', ['boar']);
    state.hero.hp = 10;
    performAction(state, { type: 'artifact', artifactId: 'heal' }, rng);
    expect(state.hero.hp).toBe(15);
    expect(state.hero.sta).toBe(2);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'heal' })).toMatch(/Перезарядка/);
    pass(state, rng, 3);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'heal' })).toBeNull();
  });

  it('кольцо выносливости даёт стамину только в первый ход', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stamina_ring', tier: 2 }] });
    expect(state.hero.sta).toBe(5);
    pass(state, rng);
    expect(state.hero.sta).toBe(3);
  });

  it('кулдаун убывает по ходам', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'second_wind', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'second_wind' }, rng);
    expect(state.hero.sta).toBe(4); // +1 STA на первом тире
    expect(canUseAction(state, { type: 'artifact', artifactId: 'second_wind' })).toMatch(/Перезарядка/);
    pass(state, rng, 4);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'second_wind' })).toBeNull();
  });

  it('боевой клич: временная сила на два хода и кулдаун', () => {
    const { state, rng } = mkBattle('berserk', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'war_cry' }, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(2);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'war_cry' })).toMatch(/Перезарядка/);
    const boar = first(state);
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    // топор 3–6 на среднем — 5, Сила +2
    expect(boar.hp).toBe(18 - 7);
    pass(state, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(2);
    pass(state, rng);
    expect(getStatus(state.hero, 'strength')).toBeUndefined();
  });

  it('вихрь бьёт всех', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], { extra: [{ id: 'whirlwind', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'whirlwind' }, rng);
    // вихрь бьёт вполсилы: floor(5 × 0.5) = 2
    expect(state.enemies.every((e) => e.hp === 10)).toBe(true);
  });

});

describe('боссы', () => {
  it('взлёт даёт неуязвимость и обязательное пикирование', () => {
    const { state, rng } = mkBattle('warrior', ['dragon']);
    const d = first(state);
    d.intent = 'takeoff';
    pass(state, rng);
    expect(getStatus(d, 'invuln')).toBeDefined();
    expect(d.intent).toBe('dive');
    const hp0 = d.hp;
    performAction(state, { type: 'attack', target: d.uid }, rng);
    expect(d.hp).toBe(hp0);
    const heroHp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(heroHp - 29); // пике 30, Кольца кольчуги гасят 1
    expect(getStatus(d, 'invuln')).toBeUndefined();
    expect(d.intent).not.toBe('dive');
  });

  it('призыв не превышает лимит поля', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf', 'wolf', 'wolf']);
    first(state).intent = 'howl';
    pass(state, rng);
    expect(state.enemies.length).toBe(3);
  });

  it('вожак призывает волка, если есть место; волк встаёт вперёд', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf']);
    first(state).intent = 'howl';
    pass(state, rng);
    expect(state.enemies.map((e) => e.defId)).toEqual(['wolf', 'alpha_wolf']);
  });

  it('рёв дракона используется не больше двух раз', () => {
    const { state, rng } = mkBattle('warrior', ['dragon']);
    const d = first(state);
    state.hero.hp = 100000;
    state.hero.maxHp = 100000;
    let roars = 0;
    for (let i = 0; i < 60; i++) {
      if (d.intent === 'roar') roars++;
      pass(state, rng);
    }
    expect(roars).toBeLessThanOrEqual(2);
    expect(getStatus(d, 'strength')?.value ?? 0).toBeLessThanOrEqual(6);
  });

  it('лич высасывает ману', () => {
    const { state, rng } = mkBattle('mage', ['lich']);
    first(state).intent = 'wither';
    pass(state, rng);
    // 5 базовых + 2 посох, −3 иссушение, +2 реген в начале следующего хода
    expect(state.hero.mp).toBe(7 - 3 + 2);
  });

  it('вожак на половине HP сразу переходит во вторую фазу: аура, блок, вой и старое разрывание отключаются', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf', 'wolf']);
    const a = first(state);
    a.hp = 29; // порог — 28 из 55, любой удар переводит
    performAction(state, { type: 'attack', target: a.uid }, rng);
    expect(a.phase).toBe(2);
    expect(a.aura).toBe('#ff3b3b');
    expect(a.block).toBe(6);
    expect(state.events.filter((ev) => ev.type === 'phase' && ev.target === a.uid).length).toBe(1);
    // Переход стоит хода: намерение — «Раненый зверь» без эффектов, герой в этот ход врагов цел.
    expect(a.intent).toBe(PHASE_SHIFT);
    expect(computeIntent(a).text).toMatch(/не атакует.*Шипы 6 на 2 хода/);
    const hpBefore = state.hero.hp;
    state.enemies = [a]; // волк-напарник в этом замере не нужен
    pass(state, rng);
    expect(state.hero.hp).toBe(hpBefore);
    // Стража перехода: щетина на свободный ход героя, к следующему ходу врагов спадает.
    expect(getStatus(a, 'thorns')).toEqual({ id: 'thorns', value: 6, turns: 1 });
    expect(a.intent).not.toBe(PHASE_SHIFT);
    pass(state, rng);
    expect(getStatus(a, 'thorns')).toBeUndefined();
    state.hero.hp = 100000;
    state.hero.maxHp = 100000;
    for (let i = 0; i < 30; i++) {
      expect(['howl', 'rend', PHASE_SHIFT]).not.toContain(a.intent);
      pass(state, rng);
    }
    // переход одноразовый: добили ниже — второй вспышки нет
    a.hp = 5;
    performAction(state, { type: 'attack', target: a.uid }, rng);
    expect(state.events.filter((ev) => ev.type === 'phase').length).toBe(1);
  });

  it('пламенный покров дракона: блок и шипы ложатся ещё в ход героя, рёв больше не выбирается', () => {
    const { state, rng } = mkBattle('warrior', ['dragon']);
    const d = first(state);
    d.hp = 61; // порог — 60 из 120
    performAction(state, { type: 'attack', target: d.uid }, rng);
    expect(d.phase).toBe(2);
    expect(d.block).toBe(10);
    expect(getStatus(d, 'thorns')?.value).toBe(2);
    // Ход перехода — покров: две атаки мимо, шипы остаются.
    expect(d.intent).toBe(PHASE_SHIFT);
    pass(state, rng);
    expect(getStatus(d, 'dodge')?.value).toBe(2);
    expect(getStatus(d, 'thorns')?.value).toBe(2);
    state.hero.hp = 100000;
    state.hero.maxHp = 100000;
    for (let i = 0; i < 20; i++) {
      expect(d.intent).not.toBe('roar');
      pass(state, rng);
    }
  });

  it('лич после смерти встаёт развоплощённым — с аурой и вспышкой, бой не окончен', () => {
    const { state, rng } = mkBattle('warrior', ['lich']);
    const l = first(state);
    l.hp = 1;
    performAction(state, { type: 'attack', target: l.uid }, rng);
    expect(state.phase).toBe('player');
    expect(state.enemies.map((e) => e.defId)).toEqual(['lich_ghost']);
    expect(state.enemies[0].aura).toBe('#8a2be2');
    expect(state.events.some((ev) => ev.type === 'phase' && ev.target === state.enemies[0].uid)).toBe(true);
  });

  it('призрак капитана появляется с уворотом 30 %', () => {
    const { state, rng } = mkBattle('warrior', ['cursed_captain']);
    first(state).hp = 1;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(first(state).defId).toBe('captain_ghost');
    expect(getStatus(first(state), 'evade')?.value).toBe(30);
  });
});

describe('пошаговый ход врагов', () => {
  it('enemyStep обрабатывает по одному врагу', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf']);
    const hp0 = state.hero.hp;
    endTurn(state);
    expect(state.phase).toBe('enemy');
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 4); // укус 5, Кольца кольчуги гасят 1
    expect(state.phase).toBe('enemy');
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 8);
    enemyStep(state, rng);
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(2);
  });
});

describe('лучник', () => {
  it('Прицельный выстрел критует даже при нулевом шансе крита', () => {
    const { state, rng } = mkBattle('archer', ['bear']);
    const e = first(state);
    const hp = e.hp;
    performAction(state, { type: 'artifact', artifactId: 'aimed_shot', target: e.uid }, rng);
    // урон лука зафиксирован на 5, бонус тира 1 — +1 (v0.38), Прицел лука — +2 к первому удару; крит Лучника 170 % от 8
    expect(hp - e.hp).toBe(13);
    expect(state.hero.sta).toBe(1);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'aimed_shot', target: e.uid })).toMatch(/Перезарядка/);
  });

  it('Подсечный выстрел бьёт и вешает Слабость', () => {
    const { state, rng } = mkBattle('archer', ['bear']);
    const e = first(state);
    const hp = e.hp;
    performAction(state, { type: 'artifact', artifactId: 'crippling_shot', target: e.uid }, rng);
    // 5 лука + 2 Прицел первого удара
    expect(hp - e.hp).toBe(7);
    expect(getStatus(e, 'weak')?.turns).toBe(1);
  });
});

describe('призыв волка', () => {
  it('волк появляется рядом, после хода героя кусает самого раненого врага (дальность союзника не держит), а враги бьют волка вместо героя', () => {
    const { state, rng } = mkBattle('mage', ['wolf', 'rat'], { extra: [{ id: 'wolf_whistle', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    expect(state.allies.map((a) => a.name)).toEqual(['Волк']);
    expect(state.allies[0].hp).toBe(12);
    const heroHp = state.hero.hp;
    pass(state, rng);
    // укус 5 по крысе (7 HP) — самому раненому, хотя она стоит второй
    expect(state.enemies.find((e) => e.defId === 'rat')!.hp).toBe(2);
    // волк 5 + крыса 3 пришлись на союзника
    expect(state.hero.hp).toBe(heroHp);
    expect(state.allies[0].hp).toBe(12 - 5 - 3);
  });

  it('павший волк исчезает, удары снова идут в героя', () => {
    const { state, rng } = mkBattle('mage', ['wolf'], { extra: [{ id: 'wolf_whistle', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    state.allies[0].hp = 1;
    const heroHp = state.hero.hp;
    pass(state, rng);
    expect(state.allies).toEqual([]);
    expect(state.hero.hp).toBe(heroHp);
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(heroHp);
  });

  it('намерение волка: укус по самому раненому, после двух укусов — вой', () => {
    const { state, rng } = mkBattle('mage', ['wolf', 'rat'], { extra: [{ id: 'wolf_whistle', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    const ally = state.allies[0];
    expect(computeAllyIntent(state, ally)).toMatchObject({ kind: 'attack', label: '5', name: 'Укус', target: 'Крыса' });
    pass(state, rng, 2);
    // Цикл волка: укус, укус, вой — третий ход без цели.
    expect(computeAllyIntent(state, ally)).toMatchObject({ kind: 'buff', label: '', name: 'Вой', target: null });
  });

  it('рядом помещаются два волка, третьему нет места', () => {
    const { state, rng } = mkBattle('mage', ['bear'], { extra: [{ id: 'wolf_whistle', tier: 3 }] });
    for (let i = 0; i < 2; i++) {
      state.hero.cooldowns = {};
      state.hero.mp = 10;
      performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    }
    state.hero.cooldowns = {};
    state.hero.mp = 10;
    expect(state.allies.length).toBe(2);
    expect(state.allies[0].maxHp).toBe(20);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'wolf_whistle' })).toMatch(/места/);
  });
});

describe('перки брони', () => {
  /** Герой со стартовой экипировкой, но с другой базой брони нужного тира. */
  function mkArmorBattle(heroId: string, base: string, enemies: string[], tier: GearTier = 1) {
    const rng = createRng(1);
    const hero = mkHero(heroId);
    hero.armor.base = base;
    hero.armor.tier = tier;
    const state = createBattle(heroDef(heroId), hero, enemies, rng);
    state.hero.stats.crit = 0;
    return { state, rng };
  }

  it('кольчуга: каждый удар слабее на 1, с 4 тира — на 2', () => {
    const t1 = mkArmorBattle('warrior', 'mail', ['wolf']);
    const hp1 = t1.state.hero.hp;
    pass(t1.state, t1.rng);
    expect(t1.state.hero.hp).toBe(hp1 - 4);
    const t4 = mkArmorBattle('warrior', 'mail', ['wolf'], 4);
    const hp4 = t4.state.hero.hp;
    pass(t4.state, t4.rng);
    expect(t4.state.hero.hp).toBe(hp4 - 3);
  });

  it('латы: «Защититься» даёт блок сверх DEF', () => {
    const { state, rng } = mkArmorBattle('warrior', 'plate', ['wolf'], 3);
    performAction(state, { type: 'defend' }, rng);
    expect(state.hero.block).toBe(Math.ceil((state.hero.stats.def + 2) * 0.8));
  });

  it('панцирь: часть блока переживает начало хода', () => {
    const { state, rng } = mkArmorBattle('warrior', 'shell', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    // 7 блока − укус 5 = 2, до 2 остаются на следующий ход
    pass(state, rng);
    expect(state.hero.block).toBe(2);
  });

  it('роба: заклинание даёт блок', () => {
    const { state, rng } = mkArmorBattle('mage', 'robe', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: first(state).uid }, rng);
    expect(state.hero.block).toBe(1);
  });

  it('плащ: первая атака врага в бою промахивается', () => {
    const { state, rng } = mkArmorBattle('archer', 'cloak', ['wolf']);
    expect(getStatus(state.hero, 'dodge')?.value).toBe(1);
    const hp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'dodge')).toBeUndefined();
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(hp);
  });

  it('доспех: лишняя стамина только в первый ход', () => {
    const { state, rng } = mkArmorBattle('archer', 'harness', ['boar']);
    expect(state.hero.sta).toBe(state.hero.maxSta + 1);
    pass(state, rng);
    expect(state.hero.sta).toBe(state.hero.maxSta);
  });
});

describe('ассасин: скрытность', () => {
  it('входит в бой в тени на 1 ход врага: враг промахивается, на второй ход тень спала', () => {
    const { state, rng } = mkBattle('assassin', ['rat']);
    expect(getStatus(state.hero, 'stealth')?.turns).toBe(1);
    const hp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(hp);
  });

  it('удар из тени — крит с бонусом стилета и снимает скрытность', () => {
    const { state, rng } = mkBattle('assassin', ['bear']);
    const bear = first(state);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // стилет 3–5 на среднем — 4, Удар в спину +3, крит Ассасина 190 % от 7
    expect(bear.hp).toBe(35 - 13);
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();
  });

  it('сроки скрытности складываются: шашка поверх Тени покрова — два хода врага мимо, третий в цель', () => {
    const { state, rng } = mkBattle('assassin', ['rat']);
    expect(getStatus(state.hero, 'stealth')?.turns).toBe(1);
    performAction(state, { type: 'artifact', artifactId: 'smoke_bomb' }, rng);
    expect(getStatus(state.hero, 'stealth')?.turns).toBe(2);
    expect(state.hero.cooldowns.smoke_bomb).toBe(4);
    const hp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(hp);
  });

  it('дымовая шашка: 2 STA, КД 4, скрытность на 1/2/2 хода, удар из тени — крит в спину и снимает скрытность', () => {
    const t1 = mkBattle('warrior', ['bear'], { extra: [{ id: 'smoke_bomb', tier: 1 }] });
    performAction(t1.state, { type: 'artifact', artifactId: 'smoke_bomb' }, t1.rng);
    expect(t1.state.hero.sta).toBe(1);
    expect(t1.state.hero.cooldowns.smoke_bomb).toBe(4);
    expect(getStatus(t1.state.hero, 'stealth')?.turns).toBe(1);
    const t3 = mkBattle('warrior', ['bear'], { extra: [{ id: 'smoke_bomb', tier: 3 }] });
    performAction(t3.state, { type: 'artifact', artifactId: 'smoke_bomb' }, t3.rng);
    expect(t3.state.hero.sta).toBe(1);
    expect(getStatus(t3.state.hero, 'stealth')?.turns).toBe(2);
    const hp = first(t3.state).hp;
    performAction(t3.state, { type: 'attack', target: first(t3.state).uid }, t3.rng);
    // стартовый меч воина 4–6 + Сила, крит Воина 150 %
    expect(hp - first(t3.state).hp).toBeGreaterThanOrEqual(Math.floor(1.5 * (4 + t3.state.hero.stats.str)));
    expect(getStatus(t3.state.hero, 'stealth')).toBeUndefined();
  });

  it('скрытность прикрывает столько ходов врага, сколько написано: шашка на 2 хода — два хода мимо, третий в цель', () => {
    // Второй тир: на первом шашка с v0.28 даёт один ход, а проверяем именно «два хода мимо, третий в цель».
    const { state, rng } = mkBattle('warrior', ['rat'], { extra: [{ id: 'smoke_bomb', tier: 2 }] });
    performAction(state, { type: 'artifact', artifactId: 'smoke_bomb' }, rng);
    const hp = state.hero.hp;
    // Статус наложен в свой ход и не должен потерять ход на тике конца хода — иначе «2 хода» прикрыли бы один.
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'stealth')?.turns).toBe(1);
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(hp);
  });

  it('яд тикает в начале хода врага и бросок не выдаёт героя', () => {
    const { state, rng } = mkBattle('assassin', ['bear']);
    const bear = first(state);
    performAction(state, { type: 'artifact', artifactId: 'poison_vial', target: bear.uid }, rng);
    expect(getStatus(bear, 'poison')).toMatchObject({ value: 2, turns: 4 });
    expect(getStatus(state.hero, 'stealth')).toBeDefined();
    const hp = state.hero.hp;
    pass(state, rng);
    expect(bear.hp).toBe(35 - 2);
    expect(state.hero.hp).toBe(hp);
  });

  it('шашке нужно 2 STA — после одного удара её ещё бросить, после двух уже нет', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'smoke_bomb', tier: 1 }] });
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'smoke_bomb' })).toBeNull();
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'smoke_bomb' })).toMatch(/стамин/);
  });
});

describe('зелья', () => {
  it('без зелья кнопка недоступна, с зельем — бесплатна: стамина не тратится, слот пустеет', () => {
    const empty = mkBattle('warrior', ['rat']);
    expect(canUseAction(empty.state, { type: 'potion' })).toMatch(/Нет зелья/);

    const { state, rng } = mkBattle('warrior', ['rat'], { potion: 'heal_potion' });
    state.hero.hp = 10;
    const sta = state.hero.sta;
    expect(canUseAction(state, { type: 'potion' })).toBeNull();
    performAction(state, { type: 'potion' }, rng);
    expect(state.hero.hp).toBe(25);
    expect(state.hero.sta).toBe(sta);
    expect(state.hero.attacks).toBe(0);
    expect(state.hero.potion).toBeNull();
    expect(canUseAction(state, { type: 'potion' })).toMatch(/Нет зелья/);
    expect(() => performAction(state, { type: 'potion' }, rng)).toThrow();
  });

  it('лечение не сверх максимума, мана не сверх максимума, бодрость даёт стамину', () => {
    const heal = mkBattle('warrior', ['rat'], { potion: 'heal_potion' });
    heal.state.hero.hp = heal.state.hero.maxHp - 3;
    performAction(heal.state, { type: 'potion' }, heal.rng);
    expect(heal.state.hero.hp).toBe(heal.state.hero.maxHp);

    const mana = mkBattle('mage', ['rat'], { potion: 'mana_potion' });
    mana.state.hero.mp = 2;
    performAction(mana.state, { type: 'potion' }, mana.rng);
    expect(mana.state.hero.mp).toBe(Math.min(mana.state.hero.maxMp, 8));

    const sta = mkBattle('warrior', ['rat'], { potion: 'stamina_potion' });
    const before = sta.state.hero.sta;
    performAction(sta.state, { type: 'potion' }, sta.rng);
    expect(sta.state.hero.sta).toBe(before + 2);
  });

  it('склянка бьёт всех врагов заклинанием и выводит из скрытности, противоядие снимает раны', () => {
    const { state, rng } = mkBattle('assassin', ['rat', 'rat'], { potion: 'fire_flask' });
    state.hero.stats.spellPower = 0;
    const hp = state.enemies.map((e) => e.hp);
    expect(getStatus(state.hero, 'stealth')).toBeTruthy();
    performAction(state, { type: 'potion' }, rng);
    for (const [i, e] of state.enemies.entries()) expect(e.hp).toBe(Math.max(0, hp[i] - 8));
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();

    const cure = mkBattle('warrior', ['rat'], { potion: 'antidote' });
    cure.state.hero.statuses.push({ id: 'bleed', value: 3, turns: 2 }, { id: 'weak', value: 1, turns: 2 }, { id: 'strength', value: 2, turns: -1 });
    performAction(cure.state, { type: 'potion' }, cure.rng);
    expect(getStatus(cure.state.hero, 'bleed')).toBeUndefined();
    expect(getStatus(cure.state.hero, 'weak')).toBeUndefined();
    expect(getStatus(cure.state.hero, 'strength')?.value).toBe(2);
  });

  it('зелье силы держится до конца боя, каменная кожа даёт блок', () => {
    const str = mkBattle('warrior', ['rat'], { potion: 'strength_potion' });
    str.state.hero.stats.dmgMin = 5;
    str.state.hero.stats.dmgMax = 5;
    str.state.hero.stats.str = 0;
    performAction(str.state, { type: 'potion' }, str.rng);
    expect(getStatus(str.state.hero, 'strength')).toEqual({ id: 'strength', value: 3, turns: -1 });
    expect(previewAttack(str.state)).toEqual({ min: 8, max: 8 });

    const skin = mkBattle('warrior', ['rat'], { potion: 'stone_skin' });
    performAction(skin.state, { type: 'potion' }, skin.rng);
    expect(skin.state.hero.block).toBe(10);
  });
});

describe('v0.14: уязвимость и новые артефакты', () => {
  it('уязвимость: удары и заклинания по врагу сильнее на четверть с округлением к ближайшему, раны не растут', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'hex', tier: 1 }] });
    const bear = first(state);
    performAction(state, { type: 'artifact', artifactId: 'hex' }, rng);
    expect(getStatus(bear, 'vulnerable')?.turns).toBe(2);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // меч 5 → 6.25 → 6
    expect(bear.hp).toBe(35 - 6);
  });

  it('уязвимость на герое: удар врага сильнее, Противоядие снимает', () => {
    const { state, rng } = mkBattle('warrior', ['goblin_shaman'], { potion: 'antidote' });
    const shaman = first(state);
    shaman.intent = 'curse';
    pass(state, rng);
    expect(getStatus(state.hero, 'vulnerable')).toBeDefined();
    performAction(state, { type: 'potion' }, rng);
    expect(getStatus(state.hero, 'vulnerable')).toBeUndefined();
  });

  it('метка охотника: первый удар в ходу вешает уязвимость, второй бьёт сильнее', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'hunters_mark', tier: 1 }] });
    const bear = first(state);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 5);
    expect(getStatus(bear, 'vulnerable')?.turns).toBe(1);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // 5 × 0.75 усталости = 3 → ×1.25 = 3.75 → 4
    expect(bear.hp).toBe(35 - 5 - 4);
  });

  it('кровавый жетон лечит за убийство, плащ странника даёт блок в начале каждого хода', () => {
    const { state, rng } = mkBattle('warrior', ['rat'], { extra: [{ id: 'blood_token', tier: 1 }, { id: 'wanderer_cloak', tier: 2 }] });
    expect(state.hero.block).toBe(5);
    // v0.37: блок сгорает в начале хода, плащ тут же выдаёт свой заново — на каждом ходу, а не только в первом.
    const cloak = mkBattle('warrior', ['rat'], { extra: [{ id: 'wanderer_cloak', tier: 2 }] });
    cloak.state.hero.block += 4;
    pass(cloak.state, cloak.rng);
    expect(cloak.state.hero.block).toBe(5);
    state.hero.hp = 20;
    first(state).hp = 3;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.enemies.length).toBe(0);
    expect(state.hero.hp).toBe(22);
  });

  it('адреналин: стамина сейчас, изнурение на следующем ходу', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'adrenaline', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'adrenaline' }, rng);
    expect(state.hero.sta).toBe(4);
    pass(state, rng);
    expect(state.hero.sta).toBe(2);
  });

  it('щитовой удар и молот света: удар с блоком, удар с лечением за ману', () => {
    const w = mkBattle('warrior', ['bear'], { extra: [{ id: 'shield_bash', tier: 1 }] });
    const bear = first(w.state);
    performAction(w.state, { type: 'artifact', artifactId: 'shield_bash', target: bear.uid }, w.rng);
    // v0.37: полный удар оружия — 5 урона; блок — 60 % от них: 3
    expect(bear.hp).toBe(35 - 5);
    expect(w.state.hero.block).toBe(3);

    const p = mkBattle('paladin', ['bear'], { extra: [{ id: 'light_hammer', tier: 1 }] });
    p.state.hero.hp = 10;
    performAction(p.state, { type: 'artifact', artifactId: 'light_hammer', target: first(p.state).uid }, p.rng);
    expect(p.state.hero.hp).toBe(12);
    expect(p.state.hero.sta).toBe(2);
    expect(p.state.hero.mp).toBe(5);
    expect(canUseAction(p.state, { type: 'artifact', artifactId: 'light_hammer', target: first(p.state).uid })).toMatch(/Перезарядка/);
  });
});

describe('v0.33: вторые персональные артефакты', () => {
  it('Ответный удар: блок погасил удар — ударивший получает долю среднего урона оружия, раз за свой ход, без блока ответа нет', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], { extra: [{ id: 'riposte', tier: 1 }] });
    const wolf = first(state);
    expect(state.hero.stats.riposte).toBe(60);
    // Меч 4–6 → среднее 5, Силы нет: 60 % = 3.
    expect(riposteDamage(state.hero)).toBe(3);
    performAction(state, { type: 'defend' }, rng);
    expect(state.hero.block).toBeGreaterThan(0);
    const hp0 = state.hero.hp;
    pass(state, rng);
    // Укус 5, кольчуга −1, остаток в блок целиком: герой цел, волк получил ответ.
    expect(state.hero.hp).toBe(hp0);
    expect(wolf.hp).toBe(12 - 3);
    expect(state.log.some((l) => /Ответный удар: 3 урона Волк/.test(l))).toBe(true);
    // Без блока укус проходит по HP и ответа нет.
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 4);
    expect(wolf.hp).toBe(12 - 3);
    // Многоударный враг получает только один ответ за ход, даже если блок гасит оба удара.
    const two = mkBattle('warrior', ['cutthroat'], { extra: [{ id: 'riposte', tier: 3 }] });
    const swarm = first(two.state);
    swarm.intent = 'double';
    two.state.hero.block = 20;
    const swarmHp = swarm.hp;
    pass(two.state, two.rng);
    expect(swarm.hp).toBe(swarmHp - riposteDamage(two.state.hero));
    expect(riposteDamage(two.state.hero)).toBe(5);
  });

  it('Огненная волна: 2 MP, урон заклинания + сила посоха всем и Горение всем на 2 хода, раз в ход', () => {
    const { state, rng } = mkBattle('mage', ['bear', 'bear'], { extra: [{ id: 'fire_wave', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'fire_wave' }, rng);
    expect(state.hero.mp).toBe(7 - 2); // 5 маны Мага + 2 посоха
    expect(state.hero.cooldowns.fire_wave).toBe(1);
    // 2 урона + 1 сила заклинаний посоха, Горение 1 на 2 хода — каждому.
    for (const e of state.enemies) {
      expect(e.hp).toBe(35 - 3);
      expect(getStatus(e, 'burn')).toEqual({ id: 'burn', value: 1, turns: 2 });
    }
    expect(canUseAction(state, { type: 'artifact', artifactId: 'fire_wave' })).toBe('Перезарядка: 1');
  });

  it('Двойной выпад: два удара по 75 % за 1 STA считаются одной атакой, из тени в спину бьёт только первый', () => {
    const { state, rng } = mkBattle('assassin', ['bear'], { extra: [{ id: 'double_lunge', tier: 1 }] });
    const bear = first(state);
    expect(getStatus(state.hero, 'stealth')).toBeDefined();
    performAction(state, { type: 'artifact', artifactId: 'double_lunge', target: bear.uid }, rng);
    expect(state.hero.sta).toBe(2);
    expect(state.hero.attacks).toBe(1);
    // Первый удар из тени: (4 + 3 в спину) × 0.75 = 5, крит 190 % = 9; второй уже на виду: 4 × 0.75 = 3, без крита.
    expect(bear.hp).toBe(35 - 9 - 3);
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();
    // Следующая обычная атака — вторая в ходу (усталость 0.7: floor(4 × 0.7) = 2): выпад считался одной атакой.
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 12 - 2);
  });

  it('Ореол возмездия: 1 MP, КД 3, Шипы и Регенерация на себя на 3 хода — враг ранится об удар, герой лечится в начале хода', () => {
    const { state, rng } = mkBattle('paladin', ['bear'], { extra: [{ id: 'vengeance_halo', tier: 1 }] });
    const bear = first(state);
    state.hero.hp = 20;
    performAction(state, { type: 'artifact', artifactId: 'vengeance_halo' }, rng);
    expect(state.hero.mp).toBe(6 - 1);
    expect(state.hero.sta).toBe(3);
    expect(state.hero.cooldowns.vengeance_halo).toBe(3);
    expect(getStatus(state.hero, 'thorns')).toEqual({ id: 'thorns', value: 2, turns: 3 });
    expect(getStatus(state.hero, 'regen')).toEqual({ id: 'regen', value: 2, turns: 3 });
    pass(state, rng);
    expect(bear.hp).toBe(35 - 2); // медведь бьёт Лапой — и ранится о шипы
    expect(state.hero.hp).toBe(20 - 9 + 2); // Лапа 9, регенерация 2 в начале хода
  });

  it('Боевой транс: Сила, лишняя стамина и гашение удара приходят только ниже половины HP', () => {
    const { state, rng } = mkBattle('berserk', ['bear'], { extra: [{ id: 'battle_trance', tier: 1 }] });
    const bear = first(state);
    expect(state.hero.stats.lowHpStr).toBe(3);
    expect(state.hero.stats.lowHpSta).toBe(1);
    expect(state.hero.stats.lowHpReduce).toBe(1);
    expect(state.hero.maxHp).toBe(44);
    state.hero.hp = 22; // ровно половина — ещё не транс
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 5);
    expect(previewAttack(state)).toEqual({ min: Math.floor(5 * 0.85), max: Math.floor(5 * 0.85) });
    // Удар медведя по не раненому герою — без гашения: тот же первый удар в отдельном бою.
    const calm = mkBattle('berserk', ['bear'], { extra: [{ id: 'battle_trance', tier: 1 }] });
    calm.state.hero.hp = 22;
    pass(calm.state, calm.rng);
    const fullHit = 22 - calm.state.hero.hp;
    expect(fullHit).toBeGreaterThan(1);
    state.hero.hp = 21;
    expect(previewAttack(state)).toEqual({ min: Math.floor(8 * 0.85), max: Math.floor(8 * 0.85) });
    pass(state, rng);
    // Раненому транс гасит единицу с удара; в начале хода 3 STA + 1 от транса.
    expect(state.hero.hp).toBe(21 - (fullHit - 1));
    expect(state.hero.sta).toBe(4);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 5 - 8);
  });

  it('Дождь из стрел: 2 STA, КД 2, 60 % урона по всем врагам через весь ряд', () => {
    const { state, rng } = mkBattle('archer', ['bear', 'bear', 'bear'], { extra: [{ id: 'arrow_rain', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'arrow_rain' }, rng);
    expect(state.hero.sta).toBe(1);
    expect(state.hero.cooldowns.arrow_rain).toBe(2);
    // Лук 3–7 на среднем — 5, Прицел лука +2 первому выстрелу в ходу: (5 + 2) × 0.6 = 4 каждому.
    for (const e of state.enemies) expect(e.hp).toBe(35 - 4);
    expect(state.hero.attacks).toBe(1);
  });
});

describe('v0.18: блок от урона и удар блоком', () => {
  it('щитовой удар: блок растёт с уроном, на третьем тире — 80 % от него', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'shield_bash', tier: 3 }] });
    state.hero.stats.str = 10;
    const bear = first(state);
    performAction(state, { type: 'artifact', artifactId: 'shield_bash', target: bear.uid }, rng);
    // v0.37: удар оружия целиком — 5 + 10 = 15, блок 80 % от него — 12
    expect(bear.hp).toBe(35 - 15);
    expect(state.hero.block).toBe(12);
  });

  it('щитовой удар отбрасывает цель на клетку назад, последнего в ряду толкать некуда', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'bear', 'rat'], { extra: [{ id: 'shield_bash', tier: 1 }] });
    const wolf = first(state);
    performAction(state, { type: 'artifact', artifactId: 'shield_bash', target: wolf.uid }, rng);
    // Волк ушёл на вторую клетку, медведь встал первым — до него теперь достаёт ближний бой.
    expect(state.enemies.map((e) => e.name)).toEqual(['Медведь', 'Волк', 'Крыса']);
    expect(state.log.some((l) => /Волк отброшен назад/.test(l))).toBe(true);
    // Последнего толкать некуда: строй тот же, приём всё равно доступен ради блока.
    const last = state.enemies[2];
    state.hero.cooldowns.shield_bash = 0;
    expect(canUseAction(state, { type: 'artifact', artifactId: 'shield_bash', target: last.uid })).toBe('Только первый в ряду');
    state.enemies = [last];
    expect(canUseAction(state, { type: 'artifact', artifactId: 'shield_bash', target: last.uid })).toBe(null);
    performAction(state, { type: 'artifact', artifactId: 'shield_bash', target: last.uid }, rng);
    expect(state.enemies.map((e) => e.name)).toEqual(['Крыса']);
  });

  it('таран: урон равен текущему блоку × множитель, блок не тратится, без блока недоступен', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'shield_ram', tier: 2 }] });
    const bear = first(state);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'shield_ram', target: bear.uid })).toBe('Нет блока');
    performAction(state, { type: 'defend' }, rng);
    const block = state.hero.block;
    expect(block).toBeGreaterThan(0);
    performAction(state, { type: 'artifact', artifactId: 'shield_ram', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - Math.floor(block * 1.5));
    expect(state.hero.block).toBe(block);
    // Не атака оружием: усталость не растёт, но цель видит героя.
    expect(state.hero.attacks).toBe(0);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'shield_ram', target: bear.uid })).toMatch(/Перезарядка/);
  });
});

describe('лимит применений за ход', () => {
  it('волшебная стрела: не больше 2 раз за ход на 1 тире, на следующем ходу снова доступна', () => {
    const { state, rng } = mkBattle('mage', ['bear'], { extra: [{ id: 'magic_missile', tier: 1 }] });
    const bear = first(state);
    for (let i = 0; i < 2; i++) performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid }, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid })).toMatch(/2 раз/);
    expect(state.hero.mp).toBe(7 - 2);
    pass(state, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid })).toBeNull();
  });
});

describe('лог боя', () => {
  it('удар героя пишет раскладку урона и что съел блок, статусы и блок врага — свои строки', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'hex', tier: 1 }] });
    const bear = first(state);
    bear.block = 2;
    performAction(state, { type: 'artifact', artifactId: 'hex' }, rng);
    expect(state.log.at(-1)).toBe('Медведь: Уязвимость на 2 хода');
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // меч 5 → уязвимость 6.25 → 6, блок 2 → 4 по HP
    expect(state.log.at(-1)).toBe('Герой бьёт Медведь: 5 (кубик 5) → 4 по HP (уязвимость ×1.25 = 6, блок −2)');
    performAction(state, { type: 'defend' }, rng);
    expect(state.log.at(-1)).toMatch(/^Герой защищается: \+\d+ блока$/);
  });

  it('удар врага пишет, что гасит кольчуга и блок; лечение и статусы врагов — тоже в логе', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    pass(state, rng);
    const hit = state.log.find((l) => l.startsWith('Волк атакует:'));
    expect(hit).toMatch(/кольчуга −1/);
    expect(hit).toMatch(/блок −/);
    const t = mkBattle('warrior', ['troll']);
    const troll = first(t.state);
    troll.hp = 10;
    troll.intent = 'regen';
    pass(t.state, t.rng);
    expect(t.state.log.some((l) => l.startsWith('Тролль: +') && l.includes('HP'))).toBe(true);
  });
});

describe('v0.38: связки', () => {
  it('Вскрытие: удар плюс всё оставшееся кровотечение сразу, мимо блока; кровь снята', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'bleed_cut', tier: 1 }, { id: 'bleed_burst', tier: 1 }] });
    const boar = first(state);
    boar.block = 4;
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toEqual({ id: 'bleed', value: 3, turns: 3 });
    performAction(state, { type: 'artifact', artifactId: 'bleed_burst', target: boar.uid }, rng);
    // удар 5 упирается в блок 4 (1 по HP), взрыв 3 × 3 = 9 мимо блока
    expect(boar.hp).toBe(18 - 1 - 9);
    expect(getStatus(boar, 'bleed')).toBeUndefined();
    expect(state.log.some((l) => l.startsWith('Взрыв ран по Кабан: 9'))).toBe(true);
    // без крови взрывать нечего — приём всё равно бьёт оружием
    pass(state, rng, 2);
    performAction(state, { type: 'artifact', artifactId: 'bleed_burst', target: boar.uid }, rng);
    expect(state.log.some((l) => l.startsWith('Взрывать нечего'))).toBe(true);
  });

  it('Кровавый след и Резонанс: удар сильнее по кровоточащей цели и за каждое проклятие на ней', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'bleed_cut', tier: 1 }, { id: 'blood_trail', tier: 1 }, { id: 'resonance', tier: 1 }, { id: 'net', tier: 1 }] });
    const boar = first(state);
    expect(previewAttack(state, 0, 1, boar)).toEqual({ min: 5, max: 5 });
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    performAction(state, { type: 'artifact', artifactId: 'net', target: boar.uid }, rng);
    // кубик 5 + по крови 2 + резонанс 1 × 2 проклятия (кровь, слабость)
    expect(previewAttack(state, 0, 1, boar)).toEqual({ min: 9, max: 9 });
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 9);
    expect(state.log.some((l) => l.includes('по крови 2') && l.includes('резонанс 2'))).toBe(true);
  });

  it('Пиявка: тик крови или яда на враге лечит героя', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'bleed_cut', tier: 1 }, { id: 'leech_charm', tier: 1 }] });
    const boar = first(state);
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    state.hero.hp = 10;
    boar.intent = 'bristle';
    pass(state, rng);
    expect(boar.hp).toBe(18 - 3);
    expect(state.hero.hp).toBe(11);
    expect(state.log).toContain('Герой: +1 HP (пиявка)');
  });

  it('Гниль: отравленная цель получает больше от ударов, предпросмотр это видит', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'poison_vial', tier: 1 }, { id: 'rot', tier: 1 }] });
    const boar = first(state);
    performAction(state, { type: 'artifact', artifactId: 'poison_vial', target: boar.uid }, rng);
    expect(previewOnTarget(state, boar, { min: 5, max: 5 })).toEqual({ min: 12, max: 12 });
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    // 5 × 1.15 = 5.75 → 6
    expect(boar.hp).toBe(18 - 6);
    expect(state.log.some((l) => l.includes('гниль = 6'))).toBe(true);
  });

  it('Заражение: яд с цели копируется на остальных с той же силой и сроком', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], { extra: [{ id: 'poison_vial', tier: 1 }, { id: 'contagion', tier: 1 }] });
    const [a, b] = state.enemies;
    performAction(state, { type: 'artifact', artifactId: 'poison_vial', target: b.uid }, rng);
    performAction(state, { type: 'artifact', artifactId: 'contagion', target: b.uid }, rng);
    expect(getStatus(a, 'poison')).toEqual({ id: 'poison', value: 2, turns: 4 });
    expect(getStatus(b, 'poison')).toEqual({ id: 'poison', value: 2, turns: 4 });
    expect(state.hero.sta).toBe(0);
  });

  it('Взрыв пламени: горение снимается со всех и суммой бьёт каждого', () => {
    const { state, rng } = mkBattle('mage', ['wolf', 'wolf'], { extra: [{ id: 'flame_burst', tier: 1 }] });
    const [a, b] = state.enemies;
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: a.uid }, rng);
    expect(a.hp).toBe(12 - 6);
    expect(getStatus(a, 'burn')).toEqual({ id: 'burn', value: 2, turns: 2 });
    performAction(state, { type: 'artifact', artifactId: 'flame_burst', target: a.uid }, rng);
    // 2 × 2 хода = 4 каждому, блок и уязвимость не участвуют
    expect(a.hp).toBe(12 - 6 - 4);
    expect(b.hp).toBe(12 - 4);
    expect(getStatus(a, 'burn')).toBeUndefined();
    expect(state.hero.mp).toBe(7 - 4);
  });

  it('Раздуть: заклинание по горящей цели сильнее и продлевает горение', () => {
    const { state, rng } = mkBattle('mage', ['boar'], { extra: [{ id: 'fan_flames', tier: 1 }] });
    const boar = first(state);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid }, rng);
    boar.intent = 'ram';
    pass(state, rng);
    expect(boar.hp).toBe(18 - 6 - 2);
    expect(getStatus(boar, 'burn')).toEqual({ id: 'burn', value: 2, turns: 1 });
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid }, rng);
    // 6 × 1.3 = 7.8 → 8; горение продлено на ход и сложилось с новым
    expect(boar.hp).toBe(18 - 6 - 2 - 8);
    expect(getStatus(boar, 'burn')).toEqual({ id: 'burn', value: 4, turns: 2 });
  });

  it('Ледяной осколок бьёт вдвое по уже Слабой цели', () => {
    const { state, rng } = mkBattle('mage', ['boar'], { extra: [{ id: 'ice_shard', tier: 1 }] });
    const boar = first(state);
    performAction(state, { type: 'artifact', artifactId: 'ice_shard', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 4);
    expect(getStatus(boar, 'weak')).toEqual({ id: 'weak', value: 1, turns: 1 });
    boar.intent = 'ram';
    pass(state, rng);
    // Слабость сгорела в конце хода кабана — второй осколок бьёт как первый; с ещё висящей — вдвое
    expect(getStatus(boar, 'weak')).toBeUndefined();
    performAction(state, { type: 'artifact', artifactId: 'ice_shard', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 4 - 4);
    boar.intent = 'ram';
    pass(state, rng);
    boar.statuses.push({ id: 'weak', value: 1, turns: 2 });
    performAction(state, { type: 'artifact', artifactId: 'ice_shard', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 4 - 4 - 8);
    expect(state.log.some((l) => l.includes('по слабому ×2'))).toBe(true);
  });

  it('Пролом щита: снимает блок цели и наносит его уроном; без блока недоступен', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'shield_break', tier: 2 }] });
    const boar = first(state);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'shield_break', target: boar.uid })).toBe('У цели нет блока');
    boar.block = 6;
    performAction(state, { type: 'artifact', artifactId: 'shield_break', target: boar.uid }, rng);
    expect(boar.block).toBe(0);
    expect(boar.hp).toBe(18 - 9);
    expect(state.hero.attacks).toBe(0);
  });

  it('Финишер: урон за каждую атаку в ходу, сам атакой не считается; без атак недоступен', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'finisher', tier: 1 }] });
    const boar = first(state);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'finisher', target: boar.uid })).toBe('Сначала атакуйте');
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 5 - 3);
    performAction(state, { type: 'artifact', artifactId: 'finisher', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 5 - 3 - 6);
    expect(state.hero.attacks).toBe(2);
  });

  it('Эхо удара: следующая атака бьёт дважды с той же усталостью', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'echo_strike', tier: 1 }] });
    const boar = first(state);
    performAction(state, { type: 'artifact', artifactId: 'echo_strike', target: boar.uid }, rng);
    expect(getStatus(state.hero, 'echo')).toBeDefined();
    expect(state.hero.sta).toBe(3);
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 5 - 5);
    expect(getStatus(state.hero, 'echo')).toBeUndefined();
    expect(state.hero.attacks).toBe(1);
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 5 - 5 - 3);
  });

  it('Цепная атака: после приёма бесплатный удар по его цели', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], { extra: [{ id: 'chain_strike', tier: 1 }] });
    const wolf = first(state);
    performAction(state, { type: 'artifact', artifactId: 'crippling_shot', target: wolf.uid }, rng);
    expect(wolf.hp).toBe(12 - 5 - 2);
    expect(state.log.some((l) => l.startsWith('Цепная атака по Волк: 2'))).toBe(true);
  });

  it('Перекрёстный ток: первое заклинание в ходу возвращает стамину, первый приём — ману, раз в ход', () => {
    const { state, rng } = mkBattle('mage', ['boar'], { extra: [{ id: 'cross_current', tier: 1 }, { id: 'crippling_shot', tier: 1 }] });
    const boar = first(state);
    expect(state.hero.sta).toBe(2);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid }, rng);
    expect(state.hero.sta).toBe(3);
    expect(state.hero.mp).toBe(5);
    performAction(state, { type: 'artifact', artifactId: 'crippling_shot', target: boar.uid }, rng);
    expect(state.hero.mp).toBe(6);
    performAction(state, { type: 'artifact', artifactId: 'mana_shield', target: boar.uid }, rng);
    expect(state.hero.sta).toBe(2);
    expect(state.hero.mp).toBe(4);
  });

  it('Добивание: убитая цель возвращает стамину', () => {
    const { state, rng } = mkBattle('warrior', ['rat', 'wolf'], { extra: [{ id: 'execute_strike', tier: 1 }] });
    const rat = first(state);
    rat.hp = 3;
    performAction(state, { type: 'artifact', artifactId: 'execute_strike', target: rat.uid }, rng);
    expect(state.enemies.length).toBe(1);
    expect(state.hero.sta).toBe(3);
    expect(state.log).toContain('Добивание: +1 STA');
  });

  it('Оглушающий удар: пока вставлен, удар по оглушённому — крит', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stun_strike', tier: 1 }] });
    const boar = first(state);
    expect(state.hero.stats.stunCrit).toBe(1);
    performAction(state, { type: 'artifact', artifactId: 'stun_strike', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 5);
    expect(getStatus(boar, 'stun')).toBeDefined();
    expect(previewAttack(state, 0, 1, boar)).toEqual({ min: 3, max: 3 });
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    // 5 × 0.7 = 3, крит 150 % = 4
    expect(boar.hp).toBe(18 - 5 - 4);
    expect(state.log.some((l) => l.includes('крит 150 %'))).toBe(true);
  });
});
