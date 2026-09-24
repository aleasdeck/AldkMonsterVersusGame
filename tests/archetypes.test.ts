import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { ARTIFACTS, artifactDef } from '../src/data/artifacts';
import { ARCHETYPE_LIST, activeSets, archetypeCounts, setMods } from '../src/data/archetypes';
import { canUseAction, createBattle, defendBlock, endTurn, getStatus, performAction, resolveEnemyTurn } from '../src/engine/combat';
import { computeStats } from '../src/engine/stats';
import { rollArtifact } from '../src/engine/loot';
import { canPendingSmelt, newRun, pendingSmelt, smeltTargets } from '../src/engine/run';
import type { ArtifactInstance, BattleState, HeroPersistent } from '../src/engine/types';

/** Герой со средним уроном оружия и артефактами только из списка — без стартовой сигнатуры, чтобы наборы считались чисто. */
function mkHero(heroId: string, arts: ArtifactInstance[]): HeroPersistent {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  gear.weapon.slots = arts.slice();
  gear.weapon.slotKinds = [];
  gear.armor.slots = [];
  gear.armor.slotKinds = [];
  return { defId: heroId, signature: def.signatures[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
}

function mkBattle(heroId: string, enemies: string[], arts: ArtifactInstance[]) {
  const rng = createRng(1);
  const hero = mkHero(heroId, arts);
  const state = createBattle(heroDef(heroId), hero, enemies, rng);
  state.hero.stats.crit = 0;
  return { state, rng, hero };
}

function pass(state: BattleState, rng: ReturnType<typeof createRng>) {
  endTurn(state);
  resolveEnemyTurn(state, rng);
}

const a = (id: string, tier: 1 | 2 | 3 = 1): ArtifactInstance => ({ id, tier });

describe('архетипы и наборы (v0.43)', () => {
  it('у каждой метки есть архетип, у ключевой вещи — метка', () => {
    const ids = new Set(ARCHETYPE_LIST.map((x) => x.id));
    for (const def of Object.values(ARTIFACTS)) {
      for (const t of def.tags ?? []) expect(ids.has(t), `${def.id}: ${t}`).toBe(true);
      if (def.keystone) expect(def.tags?.length, def.id).toBeGreaterThan(0);
    }
  });

  it('счёт набора: вещь с двумя метками идёт в оба, пороги 2 и 3', () => {
    const counts = archetypeCounts([a('bleed_cut'), a('leech_charm'), a('fireball')]);
    expect(counts).toEqual({ blood: 2, poison: 1, fire: 1 });
    const sets = activeSets(counts);
    expect(sets.map((s) => s.arch.id)).toEqual(['blood']);
    expect(setMods(archetypeCounts([a('bleed_cut'), a('blood_trail'), a('jagged_edge')]))).toEqual([{ bleedAdd: 1 }, { bleedTwice: 1 }]);
  });

  it('бонус набора попадает в статы героя', () => {
    const hero = mkHero('warrior', [a('bleed_cut'), a('blood_trail')]);
    const s = computeStats(heroDef('warrior'), hero.weapon, hero.armor);
    expect(s.bleedAdd).toBe(1);
    expect(s.bleedTwice).toBe(0);
  });

  it('Кровь 2/3: каждое Кровотечение от героя сильнее на 1', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('bleed_cut'), a('blood_trail')]);
    const bear = state.enemies[0];
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')).toEqual({ id: 'bleed', value: 4, turns: 3 });
  });

  it('Кровь 3/3: кровь тикает ещё раз перед ходом героя', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('bleed_cut'), a('blood_trail'), a('jagged_edge')]);
    const bear = state.enemies[0];
    bear.statuses.push({ id: 'bleed', value: 3, turns: 3 });
    const hp = bear.hp;
    pass(state, rng);
    // Тик в ход медведя и ещё один перед ходом героя.
    expect(bear.hp).toBe(hp - 6);
    expect(state.log.some((l) => l.includes('истекает кровью: 3'))).toBe(true);
  });

  it('Зазубренное лезвие: удар вешает кровь, Кровавый след — доля по кровоточащей', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('jagged_edge')]);
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')).toEqual({ id: 'bleed', value: 1, turns: 2 });
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')?.value).toBe(2);
  });

  it('Клятва крови: удар слабее на 30 %, кровь в полтора раза (вверх)', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('blood_oath'), a('bleed_cut')]);
    const bear = state.enemies[0];
    const hp = bear.hp;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // Меч 5 × 0.7 = 3.5 → 3
    expect(bear.hp).toBe(hp - 3);
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: bear.uid }, rng);
    // Порез: Кровотечение (3 + набор «Кровь» 2/3: 1) × 1.5 = 6
    expect(getStatus(bear, 'bleed')?.value).toBe(6);
  });

  it('Кровавая баня: кровь с цели расходится на остальных долей силы', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'wolf'], [a('blood_bath')]);
    const [x, y, z] = state.enemies;
    x.statuses.push({ id: 'bleed', value: 5, turns: 3 });
    performAction(state, { type: 'artifact', artifactId: 'blood_bath', target: x.uid }, rng);
    // 50 % от 5 = 2.5 → 3 (округление к ближнему), срок тот же.
    expect(getStatus(y, 'bleed')).toEqual({ id: 'bleed', value: 3, turns: 3 });
    expect(getStatus(z, 'bleed')).toEqual({ id: 'bleed', value: 3, turns: 3 });
    expect(getStatus(x, 'bleed')?.value).toBe(5);
  });

  it('Огонь: Тлеющий клинок поджигает ударом, набор 2/3 усиливает Горение', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('smoldering_blade'), a('fan_flames')]);
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'burn')).toEqual({ id: 'burn', value: 2, turns: 2 });
  });

  it('Испепеление: только по горящей, Горение × mult мимо блока, огонь остаётся', () => {
    const { state, rng } = mkBattle('mage', ['boar'], [a('incinerate')]);
    const boar = state.enemies[0];
    expect(canUseAction(state, { type: 'artifact', artifactId: 'incinerate', target: boar.uid })).toBe('Цель не горит');
    boar.statuses.push({ id: 'burn', value: 4, turns: 2 });
    boar.block = 10;
    performAction(state, { type: 'artifact', artifactId: 'incinerate', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 8);
    expect(boar.block).toBe(10);
    expect(getStatus(boar, 'burn')?.value).toBe(4);
    expect(state.dealtBy.incinerate).toBe(8);
  });

  it('Жаропрочность: Горение на герое не держится, блок за каждого горящего врага', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], [a('heat_ward', 2)]);
    for (const e of state.enemies) {
      e.statuses.push({ id: 'burn', value: 1, turns: 3 });
      e.intent = 'howl';
    }
    pass(state, rng);
    // Два горящих врага × 2 блока в начале хода.
    expect(state.hero.block).toBe(4);
    expect(state.log.some((l) => l.includes('жаропрочность, горят 2'))).toBe(true);
  });

  it('Жаропрочность: взрыв с Горением не поджигает героя', () => {
    const { state, rng } = mkBattle('warrior', ['kamikaze_imp'], [a('heat_ward')]);
    const imp = state.enemies[0];
    imp.intent = 'boom';
    pass(state, rng);
    expect(getStatus(state.hero, 'burn')).toBeUndefined();
  });

  it('Пироман: удар вдвое слабее, каждое заклинание поджигает всех', () => {
    const { state, rng } = mkBattle('mage', ['bear', 'bear'], [a('pyromancer'), a('magic_missile')]);
    const [x, y] = state.enemies;
    const hp = x.hp;
    performAction(state, { type: 'attack', target: x.uid }, rng);
    // Посох Мага: кубик 3–6 → середина 5 (4.5 вверх), × 0.5 = 2
    expect(hp - x.hp).toBe(Math.floor(5 * 0.5));
    performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: y.uid }, rng);
    // Пироман и стрела — не набор: Горение 1 без прибавки.
    expect(getStatus(x, 'burn')?.value).toBe(1);
    expect(getStatus(y, 'burn')?.value).toBe(1);
  });

  it('Огонь 3/3: погибший горящий враг поджигает остальных', () => {
    const { state, rng } = mkBattle('warrior', ['rat', 'wolf'], [a('smoldering_blade'), a('fan_flames'), a('flame_burst')]);
    const [rat, wolf] = state.enemies;
    rat.hp = 1;
    rat.statuses.push({ id: 'burn', value: 3, turns: 2 });
    performAction(state, { type: 'attack', target: rat.uid }, rng);
    expect(state.enemies).toHaveLength(1);
    // 3 от пожара (кубик удара ушёл в крысу, заводка удара легла на неё же).
    expect(getStatus(wolf, 'burn')?.value).toBe(3);
    expect(state.log.some((l) => l.startsWith('Пожар: Крыса'))).toBe(true);
  });
});

describe('дроп и переплавка (v0.43)', () => {
  it('ключевая вещь выпадает только тиром 1', () => {
    const run = newRun('warrior', 5);
    const rng = createRng(9);
    for (let i = 0; i < 400; i++) {
      const art = rollArtifact(rng, run.hero, [2, 3], []);
      if (art && artifactDef(art.id).keystone) expect(art.tier).toBe(1);
    }
  });

  it('тяга к архетипу: с вещью Крови в сокете вещи Крови выпадают чаще', () => {
    const count = (withBlood: boolean) => {
      const run = newRun('warrior', 5);
      run.hero.weapon.slots = withBlood ? [a('bleed_burst')] : [null];
      run.hero.armor.slots = [null];
      const rng = createRng(3);
      let blood = 0;
      for (let i = 0; i < 1500; i++) {
        const art = rollArtifact(rng, run.hero, [1], []);
        if (art && artifactDef(art.id).tags?.includes('blood')) blood++;
      }
      return blood;
    };
    expect(count(true)).toBeGreaterThan(count(false) * 1.5);
  });

  it('переплавка: цель — тот же архетип не на максимуме, +1 тир, артефакт пропадает', () => {
    const run = newRun('warrior', 5);
    run.hero.weapon.slots = [a('bleed_burst', 1)];
    run.hero.weapon.slotKinds = ['weapon'];
    run.hero.armor.slots = [a('troll_heart', 1)];
    run.hero.armor.slotKinds = ['armor'];
    run.phase = 'reward';
    run.pending = { artifacts: [a('jagged_edge', 2)], cancellable: true, consumeReward: false };
    expect(smeltTargets(run, 'jagged_edge').map((s) => s.art!.id)).toEqual(['bleed_burst']);
    expect(canPendingSmelt(run, 'armor', 0)).toBe('Нет общего архетипа');
    expect(pendingSmelt(run, 'weapon', 0)).toBe(true);
    expect(run.hero.weapon.slots[0]).toEqual({ id: 'bleed_burst', tier: 2 });
    expect(run.pending).toBeNull();
  });

  it('переплавка общей вещи — в любой артефакт', () => {
    const run = newRun('warrior', 5);
    run.hero.weapon.slots = [a('bleed_burst', 3)];
    run.hero.armor.slots = [a('troll_heart', 1)];
    run.pending = { artifacts: [a('stamina_ring')], cancellable: false, consumeReward: false };
    // Вскрытие на максимуме — не цель.
    expect(smeltTargets(run, 'stamina_ring').map((s) => s.art!.id)).toEqual(['troll_heart']);
  });
});

describe('архетипы фазы 6 (v0.47)', () => {
  it('чистка пула: каждая вещь либо в архетипе, либо в коротком списке общих', () => {
    const general = [
      'troll_heart', 'mana_crystal', 'stamina_ring', 'second_wind', 'herbal_brew', 'healer_salve', 'evasion_amulet', 'dodge',
      'blood_token', 'cross_current', 'wolf_whistle', 'shield_break', 'chain_lightning', 'resonance', 'elemental_edge', 'magic_missile',
    ];
    const untagged = Object.values(ARTIFACTS).filter((d) => !d.tags?.length).map((d) => d.id);
    expect(untagged.sort()).toEqual(general.sort());
    // У каждого архетипа ключевая вещь — бронная и одна.
    for (const arch of ARCHETYPE_LIST) {
      const keys = Object.values(ARTIFACTS).filter((d) => d.keystone && d.tags?.includes(arch.id));
      expect(keys.length, arch.id).toBe(1);
      expect(keys[0].slot, arch.id).toBe('armor');
      expect(arch.sets[2] && arch.sets[3], arch.id).toBeTruthy();
    }
  });

  it('Яд: клинок вешает яд ударом, набор 2 — +1 к яду, набор 3 — отравленный бьёт на 20 % слабее', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], [a('venom_blade'), a('poison_vial'), a('rot')]);
    const wolf = state.enemies[0];
    expect(state.hero.stats.poisonAdd).toBe(1);
    expect(state.hero.stats.poisonWeaken).toBeCloseTo(0.25);
    wolf.hp = 99;
    performAction(state, { type: 'attack', target: wolf.uid }, rng);
    expect(getStatus(wolf, 'poison')).toEqual({ id: 'poison', value: 2, turns: 3 });
    wolf.intent = 'bite';
    const hp = state.hero.hp;
    pass(state, rng);
    // Укус 5 × 0.75 = 3.75 → 4, кольчуга −1.
    expect(state.hero.hp).toBe(hp - 3);
  });

  it('Катализатор: яд цели ×2, без яда недоступен; Токсиколог — яд бессрочный, удар −25 %', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], [a('catalyst'), a('toxicologist')]);
    const wolf = state.enemies[0];
    expect(canUseAction(state, { type: 'artifact', artifactId: 'catalyst', target: wolf.uid })).toBe('На цели нет: Яд');
    wolf.statuses.push({ id: 'poison', value: 3, turns: 2 });
    performAction(state, { type: 'artifact', artifactId: 'catalyst', target: wolf.uid }, rng);
    expect(getStatus(wolf, 'poison')?.value).toBe(6);
    expect(state.hero.stats.poisonNoDecay).toBe(1);
    expect(state.hero.stats.strikeMult).toBeCloseTo(-0.25);
  });

  it('Щит: набор 2 — «Защититься» +2, набор 3 — удар сильнее на 20 % блока', () => {
    const { state, rng } = mkBattle('warrior', ['goblin'], [a('shield_ram'), a('turtle_shell'), a('mana_shield')]);
    performAction(state, { type: 'defend' }, rng);
    expect(state.hero.stats.blockSkillAdd).toBe(2);
    expect(state.hero.block).toBe(defendBlock(state.hero.stats) + 2);
    const gob = state.enemies[0];
    gob.hp = 99;
    const block = state.hero.block;
    performAction(state, { type: 'attack', target: gob.uid }, rng);
    expect(state.log.some((l) => l.includes(`щит ${Math.floor(block * 0.2)}`))).toBe(true);
  });

  it('Обвал щита: весь блок уходит, каждый враг получает долю; Бастион — блок держится, HP −20 %', () => {
    const { state, rng } = mkBattle('warrior', ['rat', 'rat'], [a('shield_slam', 3), a('bastion')]);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'shield_slam' })).toBe('Нет блока');
    state.hero.block = 10;
    const [r1, r2] = state.enemies;
    r1.hp = r2.hp = 99;
    performAction(state, { type: 'artifact', artifactId: 'shield_slam' }, rng);
    expect(state.hero.block).toBe(0);
    expect(r1.hp).toBe(89);
    expect(r2.hp).toBe(89);
    const plain = mkBattle('warrior', ['rat'], []);
    expect(state.hero.maxHp).toBe(Math.round(plain.state.hero.maxHp * 0.8));
    state.hero.block = 7;
    r1.intent = 'bite';
    r2.intent = 'bite';
    r1.statuses.push({ id: 'stun', value: 1, turns: -1 });
    r2.statuses.push({ id: 'stun', value: 1, turns: -1 });
    pass(state, rng);
    expect(state.hero.block).toBe(7);
  });

  it('Возмездие: Насмешка усиливает шипы в полтора раза, набор 3 колет всех; Око за око бьёт полученным', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'rat'], [a('thorns', 2), a('spiked_armor'), a('taunt'), a('eye_for_eye')]);
    const [wolf, rat] = state.enemies;
    wolf.hp = rat.hp = 99;
    expect(state.hero.stats.thornsAll).toBe(1);
    performAction(state, { type: 'artifact', artifactId: 'taunt' }, rng);
    wolf.intent = 'bite';
    rat.statuses.push({ id: 'stun', value: 1, turns: -1 });
    state.hero.block = 0;
    const hp = state.hero.hp;
    pass(state, rng);
    // Шипы: 4 (тир 2) + 2 (набор 2) = 6, ×1.5 насмешкой (v0.49) = 9 — каждому врагу.
    expect(wolf.hp).toBe(99 - 9);
    expect(rat.hp).toBe(99 - 9);
    const taken = hp - state.hero.hp;
    expect(state.hero.takenLast).toBe(taken);
    const before = wolf.hp;
    performAction(state, { type: 'artifact', artifactId: 'eye_for_eye', target: wolf.uid }, rng);
    expect(before - wolf.hp).toBe(5 + Math.floor(taken * 0.5));
  });

  it('Мученик: лечение не действует, пропущенный удар даёт Силу', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], [a('martyr'), a('vampire_fang')]);
    const wolf = state.enemies[0];
    wolf.hp = 99;
    state.hero.hp = 20;
    performAction(state, { type: 'attack', target: wolf.uid }, rng);
    expect(state.hero.hp).toBe(20);
    wolf.intent = 'bite';
    pass(state, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(1);
  });

  it('Свет: набор 2 — лечение +1, набор 3 — лечение жжёт первого врага и не добивает; Кара бьёт вылеченным', () => {
    const { state, rng } = mkBattle('paladin', ['wolf'], [a('heal'), a('regen_amulet'), a('smite')]);
    const wolf = state.enemies[0];
    wolf.hp = 99;
    state.hero.hp = 10;
    performAction(state, { type: 'artifact', artifactId: 'heal' }, rng);
    // Лечение 5 + 1 набора = 6; свет жжёт волка на 6.
    expect(state.hero.hp).toBe(16);
    expect(wolf.hp).toBe(93);
    // Регенерация амулета в начале хода (1 + 1 набора) тоже лечение этого хода.
    expect(state.hero.healedTurn).toBe(8);
    const before = wolf.hp;
    performAction(state, { type: 'artifact', artifactId: 'smite', target: wolf.uid }, rng);
    expect(state.log.some((l) => l.includes('Кара: +8'))).toBe(true);
    // Прибавка Кары в раскладке удара — своим именем, отдельно от прибавки самого приёма (v0.51).
    expect(state.log.some((l) => l.startsWith('Удар по Волк') && l.includes('кара 8'))).toBe(true);
    expect(before - wolf.hp).toBeGreaterThan(8);
    wolf.hp = 2;
    state.hero.hp = 1;
    performAction(state, { type: 'attack', target: wolf.uid }, rng);
    const w2 = mkBattle('paladin', ['wolf'], [a('heal'), a('regen_amulet'), a('smite')]);
    w2.state.enemies[0].hp = 3;
    w2.state.hero.hp = 1;
    performAction(w2.state, { type: 'artifact', artifactId: 'heal' }, w2.rng);
    expect(w2.state.enemies[0].hp).toBe(1);
  });

  it('Обет: HP −25 %, лечение вдвое; Благодать — избыток лечения в блок', () => {
    const { state, rng } = mkBattle('paladin', ['wolf'], [a('heal'), a('vow'), a('grace', 3)]);
    const plain = mkBattle('paladin', ['wolf'], []);
    expect(state.hero.maxHp).toBe(Math.round(plain.state.hero.maxHp * 0.75));
    state.hero.hp = state.hero.maxHp - 4;
    performAction(state, { type: 'artifact', artifactId: 'heal' }, rng);
    // Лечение (5 + 1 набора «Свет» 2) × 2 = 12: 4 в HP, 8 избытка — в блок целиком (Благодать 3-го тира).
    expect(state.hero.hp).toBe(state.hero.maxHp);
    expect(state.hero.block).toBe(8);
  });

  it('Серия: Разгон растит каждый следующий удар, набор 3 — третий удар без стамины', () => {
    const { state, rng } = mkBattle('berserk', ['bear'], [a('momentum'), a('war_cry'), a('adrenaline')]);
    const bear = state.enemies[0];
    bear.hp = 999;
    const sta = state.hero.sta;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(state.log.some((l) => l.includes('разгон 1'))).toBe(true);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(state.log.some((l) => l.includes('разгон 2'))).toBe(true);
    expect(state.log).toContain('Серия: третий удар без стамины');
    expect(state.hero.sta).toBe(sta - 2);
  });

  it('Безрассудство: усталости нет, «Защититься» недоступно', () => {
    const { state } = mkBattle('berserk', ['bear'], [a('recklessness')]);
    expect(state.hero.stats.fatigue).toBe(1);
    expect(canUseAction(state, { type: 'defend' })).toBe('Безрассудство: защищаться нельзя');
  });

  it('Тень: Верный глаз — крит наверняка одним ударом; Хладнокровие — случайного крита нет; набор 3 — крит возвращает STA раз в ход', () => {
    const { state, rng } = mkBattle('assassin', ['bear'], [a('steady_aim'), a('luck_talisman'), a('gambler_coin')]);
    const bear = state.enemies[0];
    bear.hp = 999;
    state.hero.statuses = state.hero.statuses.filter((st) => st.id !== 'stealth');
    performAction(state, { type: 'artifact', artifactId: 'steady_aim' }, rng);
    expect(getStatus(state.hero, 'focus')).toBeDefined();
    const sta = state.hero.sta;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(state.log.some((l) => l.startsWith('Герой бьёт') && l.includes('крит'))).toBe(true);
    expect(getStatus(state.hero, 'focus')).toBeUndefined();
    // Удар стоил 1 STA, крит вернул 1.
    expect(state.hero.sta).toBe(sta);
    const cold = mkBattle('assassin', ['bear'], [a('cold_blood')]);
    expect(cold.state.hero.stats.critOnlySure).toBe(1);
    cold.state.hero.stats.crit = 1;
    cold.state.hero.statuses = cold.state.hero.statuses.filter((st) => st.id !== 'stealth');
    performAction(cold.state, { type: 'attack', target: cold.state.enemies[0].uid }, cold.rng);
    expect(cold.state.log.some((l) => l.startsWith('Герой бьёт') && l.includes('крит'))).toBe(false);
  });

  it('v0.51.1: Хладнокровие — случайного крита нет, но оглушённый и скованный льдом критуют (правило оглушения)', () => {
    const { state, rng } = mkBattle('archer', ['bear'], [a('cold_blood')]);
    const bear = state.enemies[0];
    bear.hp = 999;
    // Случайного крита нет даже при шансе 100 %; крит. урон Лучника 170 + 100.
    state.hero.stats.crit = 1;
    const crits = () => state.log.filter((l) => l.startsWith('Герой бьёт') && l.includes('крит 270 %')).length;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(crits()).toBe(0);
    // Оглушил «Засадой» или пращой — верный крит.
    bear.statuses.push({ id: 'stun', value: 1, turns: -1 });
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(crits()).toBe(1);
    bear.statuses = bear.statuses.filter((st) => st.id !== 'stun');
    bear.statuses.push({ id: 'frozen', value: 1, turns: -1 });
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(crits()).toBe(2);
  });

  it('Холод: клинок морозит первые удары хода, набор 2 +1, три — Оцепенение, набор 3 — Уязвимость', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('frost_blade'), a('crippling_shot'), a('net')]);
    const bear = state.enemies[0];
    bear.hp = 999;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // Холод 1 + 1 набора = 2.
    expect(getStatus(bear, 'cold')?.value).toBe(2);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // Клинок первого тира — только первый удар хода.
    expect(getStatus(bear, 'cold')?.value).toBe(2);
    performAction(state, { type: 'artifact', artifactId: 'net' }, rng);
    expect(getStatus(bear, 'cold')).toBeUndefined();
    expect(getStatus(bear, 'frozen')).toBeDefined();
    expect(getStatus(bear, 'vulnerable')).toBeDefined();
  });

  it('лёд крепчает: первое Оцепенение — 4 Холода, второе — 6, скованный Холод не копит', () => {
    const { state, rng } = mkBattle('mage', ['bear'], [a('ice_shard', 3)]);
    const bear = state.enemies[0];
    bear.hp = 999;
    bear.statuses.push({ id: 'cold', value: 2, turns: -1 });
    performAction(state, { type: 'artifact', artifactId: 'ice_shard', target: bear.uid }, rng);
    expect(getStatus(bear, 'frozen')).toBeDefined();
    expect(bear.freezes).toBe(1);
    // Лог пишет счётчик до Оцепенения (v0.51.1) — тот же, что на значке Холода.
    expect(state.log).toContain('Медведь: Холод 2 — 4/4 до Оцепенения');
    state.hero.cooldowns.ice_shard = 0;
    state.hero.uses = {};
    performAction(state, { type: 'artifact', artifactId: 'ice_shard', target: bear.uid }, rng);
    expect(getStatus(bear, 'cold')).toBeUndefined();
    pass(state, rng);
    expect(getStatus(bear, 'frozen')).toBeUndefined();
    bear.statuses.push({ id: 'cold', value: 4, turns: -1 });
    performAction(state, { type: 'artifact', artifactId: 'ice_shard', target: bear.uid }, rng);
    // 4 + 2 = 6 — ровно новый порог.
    expect(getStatus(bear, 'frozen')).toBeDefined();
    expect(bear.freezes).toBe(2);
    expect(state.log).toContain('Медведь: Холод 2 — 6/6 до Оцепенения');
  });

  it('Раскол: по оцепеневшему ×mult и снимает лёд; Вечная мерзлота — два хода; удар по оцепеневшему — крит', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('shatter'), a('permafrost'), a('stun_strike')]);
    const bear = state.enemies[0];
    bear.hp = 999;
    bear.statuses.push({ id: 'cold', value: 2, turns: -1 });
    performAction(state, { type: 'artifact', artifactId: 'stun_strike', target: bear.uid }, rng);
    // stun_strike — метка Холода, но Холода не вешает: заморозим руками.
    bear.statuses = bear.statuses.filter((st) => st.id !== 'stun');
    bear.statuses.push({ id: 'frozen', value: 2, turns: -1 });
    const hp = bear.hp;
    performAction(state, { type: 'artifact', artifactId: 'shatter', target: bear.uid }, rng);
    // Удар 5 × 2 (раскол) × 0.75 (усталость второй атаки) × 0.7 (мерзлота) → крит по оцепеневшему.
    expect(hp - bear.hp).toBeGreaterThan(5);
    expect(getStatus(bear, 'frozen')).toBeUndefined();
    expect(state.log.some((l) => l.includes('лёд расколот'))).toBe(true);
  });
});
