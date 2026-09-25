import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { LOCATIONS } from '../src/data/locations';
import { enemyDef } from '../src/data/enemies';
import { BOONS, BOON_LIST, DIFFICULTY_LIST, boonsOf, wolfFriendHp } from '../src/data/boons';
import { trialValue } from '../src/data/trials';
import { createBattle, endTurn, getStatus, heroDefendGain, performAction, resolveEnemyTurn } from '../src/engine/combat';
import { advanceRoom, awaitsBoon, awaitsThreshold, awaitsTrial, canChooseBoon, chooseBoon, enterRoom, finishBattle, newRun, startEvent } from '../src/engine/run';
import { runReport } from '../src/engine/report';
import { boonValue, playRun } from './sim/bot';
import type { BattleState, HeroPersistent } from '../src/engine/types';

// Сложность забега и благословения локаций: «Лёгкий» — два благословения из трёх перед локацией, выбор обязателен,
// действует до конца локации; «Средний» — без выбора; «Сложный» — испытания (tests/trials.test.ts).

function mkBattle(enemies: string[], boon: string | null, heroId = 'warrior', act = 0) {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  const hero: HeroPersistent = { defId: heroId, signature: def.signatures[0], innateTier: 1, trait: def.traits[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
  const rng = createRng(1);
  const state = createBattle(def, hero, enemies, rng, act, null, boon);
  state.hero.stats = { ...state.hero.stats, crit: 0 };
  return { state, rng };
}

const pass = (state: BattleState, rng: ReturnType<typeof createRng>) => {
  endTurn(state);
  resolveEnemyTurn(state, rng);
};

const stun = (state: BattleState) => state.enemies.forEach((e) => e.statuses.push({ id: 'stun', value: 1, turns: -1 }));

describe('сложность и благословения: данные и порог', () => {
  it('три сложности; у каждой локации ровно три благословения', () => {
    expect(DIFFICULTY_LIST.map((d) => d.id)).toEqual(['easy', 'normal', 'hard']);
    for (const loc of LOCATIONS) expect(boonsOf(loc.id).length, loc.id).toBe(3);
    expect(BOON_LIST.length).toBe(18);
  });

  it('«Средний» (по умолчанию) — без порога; «Сложный» — испытания; «Лёгкий» — благословения', () => {
    const normal = newRun('warrior', 5);
    expect(normal.difficulty).toBe('normal');
    expect(awaitsThreshold(normal)).toBe(false);
    const hard = newRun('warrior', 5, 0, undefined, undefined, { difficulty: 'hard' });
    expect(awaitsTrial(hard)).toBe(true);
    expect(awaitsBoon(hard)).toBe(false);
    const easy = newRun('warrior', 5, 0, undefined, undefined, { difficulty: 'easy' });
    expect(awaitsTrial(easy)).toBe(false);
    expect(awaitsBoon(easy)).toBe(true);
    expect(easy.boonOffer.length).toBe(2);
    for (const id of easy.boonOffer) expect(BOONS[id].location).toBe(easy.locations[0]);
  });

  it('до выбора благословения в клетку не войти; выбранное идёт в бой и в статистику', () => {
    const run = newRun('warrior', 5, 0, undefined, undefined, { difficulty: 'easy' });
    enterRoom(run);
    expect(run.phase).toBe('map');
    expect(run.battle).toBeNull();
    const other = boonsOf(run.locations[0]).find((b) => !run.boonOffer.includes(b.id))!;
    expect(canChooseBoon(run, other.id)).toBe('Этого благословения нет в предложении');
    expect(chooseBoon(run, run.boonOffer[1])).toBe(true);
    expect(canChooseBoon(run, run.boonOffer[0] ?? 'x')).toBe('Благословение уже выбрано');
    expect(run.boonLog).toEqual([run.boon]);
    enterRoom(run);
    expect(run.phase).toBe('battle');
    expect(run.battle!.boon).toBe(run.boon);
    expect(run.battle!.trial).toBeNull();
    const r = runReport(run, { event: 'abandoned', player: 'p', playerRuns: 0, debug: true, now: 0 } as Parameters<typeof runReport>[1]);
    expect(r.difficulty).toBe('easy');
    expect(r.boons).toBe(run.boon);
    expect(r.trials).toBe('');
  });

  it('новая локация — новое предложение, прежнее благословение снято', () => {
    const run = newRun('warrior', 5, 0, undefined, undefined, { difficulty: 'easy' });
    chooseBoon(run, run.boonOffer[0]);
    run.roomIndex = 9;
    advanceRoom(run);
    expect(run.locationIndex).toBe(1);
    expect(run.boon).toBeNull();
    expect(awaitsBoon(run)).toBe(true);
    for (const id of run.boonOffer) expect(BOONS[id].location).toBe(run.locations[1]);
  });

  it('бой с вором видит благословение, но не испытание', () => {
    const run = newRun('warrior', 5, 0, undefined, undefined, { difficulty: 'easy' });
    run.boon = 'shroud';
    run.boonOffer = [];
    run.roomIndex = 2;
    startEvent(run, 'gnome');
    expect(run.battle!.boon).toBe('shroud');
    expect(getStatus(run.battle!.enemies[0], 'weak')).toBeTruthy();
  });

  it('бот выбирает благословение по сборке и проходит забег на лёгкой сложности', () => {
    const mage = newRun('mage', 11, 0, undefined, undefined, { difficulty: 'easy' });
    expect(boonValue(mage, 'tailwind')).toBeGreaterThan(boonValue(newRun('warrior', 11), 'tailwind'));
    const run = newRun('warrior', 3, 0, undefined, undefined, { difficulty: 'easy' });
    expect(['victory', 'defeat', 'stall']).toContain(playRun(run));
    expect(run.boonLog.length).toBeGreaterThan(0);
    expect(run.trialLog).toEqual([]);
  });
});

describe('благословения: правила в бою', () => {
  it('Волчий друг — волк-союзник с HP по акту', () => {
    const { state } = mkBattle(['rat'], 'wolf_friend', 'warrior', 2);
    expect(state.allies.length).toBe(1);
    expect(state.allies[0].defId).toBe('wolf');
    expect(state.allies[0].maxHp).toBe(wolfFriendHp(2));
    expect(wolfFriendHp(0)).toBe(enemyDef('wolf').hp);
  });

  it('Следопыт, Болотный смрад, Жар горна и Саван — на врагах с начала боя', () => {
    expect(getStatus(mkBattle(['rat'], 'tracker').state.enemies[0], 'vulnerable')?.turns).toBe(1);
    expect(getStatus(mkBattle(['rat'], 'miasma', 'warrior', 2).state.enemies[0], 'poison')).toEqual({ id: 'poison', value: trialValue(2, 2), turns: 3 });
    expect(getStatus(mkBattle(['rat'], 'forge_heat', 'warrior', 1).state.enemies[0], 'burn')).toEqual({ id: 'burn', value: trialValue(2, 1), turns: 2 });
    expect(getStatus(mkBattle(['rat'], 'shroud').state.enemies[0], 'weak')?.turns).toBe(2);
  });

  it('Следопыт: Уязвимость держится первый ход и спадает ко второму', () => {
    const { state, rng } = mkBattle(['golem'], 'tracker');
    stun(state);
    pass(state, rng);
    expect(getStatus(state.enemies[0], 'vulnerable')).toBeUndefined();
  });

  it('Кочки, Добрые огни, Хитин, Маточное молочко и Жало — на герое в начале боя', () => {
    const plain = mkBattle(['rat'], null).state;
    const hum = mkBattle(['rat'], 'hummock').state;
    expect(hum.hero.sta).toBe(plain.hero.sta + 1);
    expect(getStatus(mkBattle(['rat'], 'wisp_guide').state.hero, 'dodge')?.value).toBe(1);
    expect(getStatus(mkBattle(['rat'], 'chitin', 'warrior', 1).state.hero, 'thorns')?.value).toBe(trialValue(2, 1));
    expect(getStatus(mkBattle(['rat'], 'royal_jelly', 'warrior', 2).state.hero, 'regen')?.value).toBe(trialValue(1, 2));
    expect(getStatus(mkBattle(['rat'], 'stinger').state.hero, 'focus')).toBeTruthy();
  });

  it('Святая вода — лечение в полтора раза сильнее; Закалка — «Защититься» на 30 % сильнее', () => {
    const heal = (boon: string | null) => {
      const { state, rng } = mkBattle(['golem'], boon);
      stun(state);
      state.hero.hp = 10;
      state.hero.statuses.push({ id: 'regen', value: 4, turns: -1 });
      pass(state, rng);
      return state.hero.hp - 10;
    };
    expect(heal('holy_water')).toBe(Math.round(heal(null) * 1.5));
    expect(heroDefendGain(mkBattle(['rat'], 'tempered').state)).toBe(Math.round(heroDefendGain(mkBattle(['rat'], null).state) * 1.3));
  });

  it('Жатва душ, Абордажный азарт и Лавовые жилы — на каждого павшего', () => {
    const soul = mkBattle(['rat', 'rat'], 'soul_harvest');
    soul.state.hero.hp = 10;
    soul.state.enemies[0].hp = 1;
    performAction(soul.state, { type: 'attack', target: soul.state.enemies[0].uid }, soul.rng);
    expect(soul.state.hero.hp).toBe(10 + trialValue(2, 0));
    const loot = mkBattle(['rat', 'rat'], 'plunder');
    loot.state.enemies[0].hp = 1;
    performAction(loot.state, { type: 'attack', target: loot.state.enemies[0].uid }, loot.rng);
    expect(getStatus(loot.state.hero, 'strength')?.value).toBe(1);
    const lava = mkBattle(['rat', 'golem'], 'lava_veins');
    const rat = lava.state.enemies.find((e) => e.defId === 'rat')!;
    const golem = lava.state.enemies.find((e) => e.defId === 'golem')!;
    const hp = golem.hp;
    rat.hp = 1;
    // Крыса может стоять вторым в ряду — ближнему бою до неё не дотянуться, поэтому её добивает раной мимо ряда.
    rat.statuses.push({ id: 'bleed', value: 5, turns: 1 });
    golem.statuses.push({ id: 'stun', value: 1, turns: -1 });
    pass(lava.state, lava.rng);
    expect(lava.state.enemies).not.toContain(rat);
    expect(golem.hp).toBe(hp - trialValue(3, 0));
  });

  it('Бортовой залп: на третьем ходу враги теряют 10 % максимума, герой — нет', () => {
    const { state, rng } = mkBattle(['golem'], 'broadside');
    const golem = state.enemies[0];
    stun(state);
    pass(state, rng);
    // Оглушение тратится за один пропущенный ход — на второй вешаем снова.
    stun(state);
    const eHp = golem.hp;
    const hHp = state.hero.hp;
    pass(state, rng);
    expect(state.turn).toBe(3);
    expect(golem.hp).toBe(eHp - Math.ceil(golem.maxHp * 0.1));
    expect(state.hero.hp).toBe(hHp);
  });

  it('Попутный ветер: со второго хода +1 MP к регену', () => {
    const run = (boon: string | null) => {
      const { state, rng } = mkBattle(['golem'], boon, 'mage');
      stun(state);
      state.hero.mp = 0;
      pass(state, rng);
      return state.hero.mp;
    };
    expect(run('tailwind')).toBe(run(null) + 1);
  });

  it('Целебные травы: после выигранного боя герой лечится, подпись — на награде', () => {
    const run = newRun('warrior', 5, 0, undefined, undefined, { difficulty: 'easy' });
    run.boon = 'herbs';
    run.boonOffer = [];
    enterRoom(run);
    const b = run.battle!;
    b.hero.hp = 10;
    b.phase = 'won';
    finishBattle(run);
    expect(run.hero.hp).toBe(10 + trialValue(4, 0));
    expect(run.rewards[0].note).toContain('Целебные травы');
  });
});
