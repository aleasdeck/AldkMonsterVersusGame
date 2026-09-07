import { describe, expect, it } from 'vitest';
import { HERO_LIST } from '../src/data/heroes';
import { artifactDef } from '../src/data/artifacts';
import { ACTS, FIGHTS_PER_RUN, LOCATIONS, ROOMS_PER_LOCATION, enemyScale, pickRunLocations } from '../src/data/locations';
import { enemyDef } from '../src/data/enemies';
import { createRng } from '../src/engine/rng';
import { canUseAction } from '../src/engine/combat';
import {
  battleAction,
  battleEndTurn,
  battleEnemyStep,
  campForge,
  campRest,
  canShopBuyGear,
  canShopHeal,
  canShopReroll,
  chooseEvent,
  currentRoomKind,
  enterRoom,
  finishBattle,
  heroStats,
  isRunOver,
  leaveShop,
  newRun,
  pendingCancel,
  pendingDiscard,
  pendingPlace,
  shopBuyArtifact,
  shopBuyGear,
  shopHeal,
  shopHealAmount,
  shopReroll,
  skipReward,
  takeReward,
} from '../src/engine/run';
import { REROLL_COST, SHOP_HEAL_COST, SHOP_HEAL_PCT, artifactPrice, gearPrice } from '../src/engine/loot';
import { gearOf, socketRefs } from '../src/engine/equipment';
import type { RunState } from '../src/engine/types';

/** Простейший бот: бьёт первого врага, пока есть стамина, потом заканчивает ход. */
function playBattle(run: RunState): void {
  let guard = 0;
  let lastTurn = -1;
  const used = new Set<string>();
  while (run.battle && run.battle.phase !== 'won' && run.battle.phase !== 'lost' && guard++ < 2000) {
    const b = run.battle;
    if (b.phase === 'player') {
      if (b.turn !== lastTurn) {
        used.clear();
        lastTurn = b.turn;
      }
      const target = b.enemies[0]?.uid;
      // каждый активный артефакт — не чаще раза за ход, иначе бот зациклится на баффах
      const usable = b.hero.artifacts.find(
        (a) =>
          artifactDef(a.id).kind === 'active' &&
          !used.has(a.id) &&
          canUseAction(b, { type: 'artifact', artifactId: a.id, target }) === null,
      );
      if (usable) {
        used.add(usable.id);
        battleAction(run, { type: 'artifact', artifactId: usable.id, target });
      } else if (target !== undefined && canUseAction(b, { type: 'attack', target }) === null) battleAction(run, { type: 'attack', target });
      else battleEndTurn(run);
    } else if (b.phase === 'enemy') {
      battleEnemyStep(run);
    }
  }
  finishBattle(run);
}

/** Разместить ожидающий артефакт в первый свободный слот, иначе выбросить. */
function resolvePending(run: RunState): void {
  const free = socketRefs(run.hero).find((s) => !s.art);
  if (free) pendingPlace(run, free.kind, free.index);
  else pendingDiscard(run);
}

/** Играет забег до конца: бой ботом, награды — первая опция, привал — отдых. */
function playRun(run: RunState, immortal = false): void {
  let guard = 0;
  while (!isRunOver(run) && guard++ < 800) {
    if (immortal && run.phase === 'battle' && run.battle) {
      run.battle.hero.hp = 99999;
      run.battle.hero.maxHp = 99999;
    }
    if (run.pending) {
      resolvePending(run);
      continue;
    }
    switch (run.phase) {
      case 'map':
        enterRoom(run);
        break;
      case 'battle':
        playBattle(run);
        break;
      case 'reward':
        takeReward(run, 0);
        break;
      case 'event':
        chooseEvent(run, immortal ? 'spring' : 'chest');
        break;
      case 'shop':
        leaveShop(run);
        break;
      case 'camp':
        campRest(run);
        break;
    }
  }
  if (!isRunOver(run)) throw new Error(`Run stuck in phase ${run.phase}`);
}

function winCurrentBattle(run: RunState): void {
  run.battle!.hero.hp = 99999;
  run.battle!.hero.maxHp = 99999;
  run.battle!.hero.stats.dmgMin = 999;
  run.battle!.hero.stats.dmgMax = 999;
  playBattle(run);
}

describe('торговец после элиты', () => {
  /** Довести забег до торговца: элита выигрывается читом, награда пропускается. */
  function toShop(seed: number, heroId = 'warrior'): RunState {
    const run = newRun(heroId, seed);
    run.roomIndex = 5;
    enterRoom(run);
    winCurrentBattle(run);
    skipReward(run);
    expect(run.phase).toBe('shop');
    return run;
  }

  it('открывается после награды за элиту, после обычного боя — нет', () => {
    const run = toShop(31);
    expect(run.shop?.gear).not.toBeNull();
    expect(run.shop?.artifact).not.toBeNull();
    expect(run.shop?.healed).toBe(false);
    expect(run.shop?.rerolled).toBe(false);

    const plain = newRun('warrior', 31);
    enterRoom(plain);
    winCurrentBattle(plain);
    skipReward(plain);
    expect(plain.phase).toBe('map');
    expect(plain.shop).toBeNull();
  });

  it('лекарь: доля максимума за золото, один раз, не сверх максимума', () => {
    const run = toShop(32);
    const max = heroStats(run).maxHp;
    run.hero.hp = 10;
    run.gold = 20;
    expect(shopHealAmount(run)).toBe(Math.floor(max * SHOP_HEAL_PCT));
    expect(shopHeal(run)).toBe(true);
    expect(run.hero.hp).toBe(10 + Math.floor(max * SHOP_HEAL_PCT));
    expect(run.gold).toBe(20 - SHOP_HEAL_COST);
    expect(canShopHeal(run)).toMatch(/уже/);
    expect(shopHeal(run)).toBe(false);

    const full = toShop(32);
    full.hero.hp = heroStats(full).maxHp;
    expect(canShopHeal(full)).toMatch(/полное/);

    const almost = toShop(32);
    almost.hero.hp = heroStats(almost).maxHp - 2;
    expect(shopHealAmount(almost)).toBe(2);
  });

  it('экипировка надевается сразу, артефакт ждёт слота без отмены, товары уходят с прилавка', () => {
    const run = toShop(33);
    run.gold = 100;
    const gear = run.shop!.gear!;
    const art = run.shop!.artifact!;
    expect(shopBuyGear(run)).toBe(true);
    expect(run.gold).toBe(100 - gearPrice(gear));
    expect(run.shop!.gear).toBeNull();
    expect(gearOf(run.hero, gear.kind).name).toBe(gear.name);
    expect(canShopBuyGear(run)).toBe('Продано');
    expect(shopBuyGear(run)).toBe(false);

    expect(shopBuyArtifact(run)).toBe(true);
    expect(run.gold).toBe(100 - gearPrice(gear) - artifactPrice(art));
    expect(run.shop!.artifact).toBeNull();
    expect(run.phase).toBe('shop');
    if (run.pending) {
      // Новый артефакт ждёт выбора слота; пока он висит, уйти нельзя, отменить покупку — тоже.
      expect(run.pending.cancellable).toBe(false);
      leaveShop(run);
      expect(run.phase).toBe('shop');
      resolvePending(run);
    }
    expect(run.pending).toBeNull();
    expect(run.phase).toBe('shop');
    leaveShop(run);
    expect(run.phase).toBe('map');
    expect(run.roomIndex).toBe(6);
    expect(run.shop).toBeNull();
  });

  it('без золота ничего не купить и не перебросить', () => {
    const run = toShop(34);
    run.gold = 0;
    run.hero.hp = 5;
    const hp = run.hero.hp;
    expect(canShopHeal(run)).toMatch(/золота/);
    expect(canShopBuyGear(run)).toMatch(/золота/);
    expect(canShopReroll(run)).toMatch(/золота/);
    expect(shopHeal(run)).toBe(false);
    expect(shopBuyGear(run)).toBe(false);
    expect(shopBuyArtifact(run)).toBe(false);
    expect(shopReroll(run)).toBe(false);
    expect(run.hero.hp).toBe(hp);
    expect(run.shop!.gear).not.toBeNull();
  });

  it('переброс обновляет только непроданное, один раз за визит', () => {
    const run = toShop(35);
    run.gold = 100;
    expect(shopBuyGear(run)).toBe(true);
    const gold = run.gold;
    expect(shopReroll(run)).toBe(true);
    expect(run.gold).toBe(gold - REROLL_COST);
    expect(run.shop!.rerolled).toBe(true);
    expect(run.shop!.gear).toBeNull();
    expect(run.shop!.artifact).not.toBeNull();
    expect(canShopReroll(run)).toMatch(/уже/);
    expect(shopReroll(run)).toBe(false);

    const empty = toShop(35);
    empty.gold = 100;
    shopBuyGear(empty);
    shopBuyArtifact(empty);
    if (empty.pending) resolvePending(empty);
    expect(canShopReroll(empty)).toMatch(/Нечего/);
  });
});

describe('забег', () => {
  it('этаж из 7 комнат: бой, бой, событие, бой, бой, элита, босс', () => {
    const run = newRun('warrior', 42);
    const kinds = [];
    for (let i = 0; i < ROOMS_PER_LOCATION; i++) {
      run.roomIndex = i;
      kinds.push(currentRoomKind(run));
    }
    expect(kinds).toEqual(['fight', 'fight', 'event', 'fight', 'fight', 'elite', 'boss']);
    expect(FIGHTS_PER_RUN).toBe(18);
  });

  it('новый забег: герой с полным HP, стартовая комната — лёгкий бой', () => {
    const run = newRun('warrior', 42);
    run.locations = ['forest', 'crypt', 'caves'];
    expect(run.phase).toBe('map');
    expect(run.hero.hp).toBe(heroStats(run).maxHp);
    expect(currentRoomKind(run)).toBe('fight');
    enterRoom(run);
    expect(run.phase).toBe('battle');
    expect(run.battle?.enemies.length).toBeGreaterThan(0);
    const easy = ['wolf', 'boar', 'rat', 'bat', 'spider', 'goblin'];
    expect(run.battle?.enemies.every((e) => easy.includes(e.defId))).toBe(true);
  });

  it('один и тот же сид даёт один и тот же забег', () => {
    // Время старта фиксируем: иначе startedAt в статистике разъезжается на миллисекунду и тест мигает.
    const a = newRun('rogue', 777, 1000);
    const b = newRun('rogue', 777, 1000);
    playRun(a);
    playRun(b);
    expect(a.phase).toBe(b.phase);
    expect(a.stats).toEqual(b.stats);
    expect(a.locationIndex).toBe(b.locationIndex);
  });

  it('после победы выдаётся награда, после награды — следующая комната', () => {
    const run = newRun('berserk', 3);
    enterRoom(run);
    winCurrentBattle(run);
    expect(run.phase).toBe('reward');
    expect(run.rewards[0].options.length).toBe(3);
    skipReward(run);
    expect(run.phase).toBe('map');
    expect(run.roomIndex).toBe(1);
  });

  it('артефакт из награды: выбор слота, отмена возвращает к награде, замена завершает', () => {
    const run = newRun('warrior', 11);
    enterRoom(run);
    winCurrentBattle(run);
    run.rewards = [{ title: 'x', source: 'fight', rerolled: false, options: [{ kind: 'artifact', artifact: { id: 'thorns', tier: 1 } }] }];
    takeReward(run, 0);
    expect(run.pending?.artifacts[0].id).toBe('thorns');
    expect(run.pending?.cancellable).toBe(true);
    expect(run.phase).toBe('reward');
    pendingCancel(run);
    expect(run.pending).toBeNull();
    expect(run.rewards.length).toBe(1);
    takeReward(run, 0);
    pendingPlace(run, 'armor', 0);
    expect(run.pending).toBeNull();
    expect(run.hero.armor.slots[0]?.id).toBe('thorns');
    expect(run.phase).toBe('map');
  });

  it('свободный слот: игрок сам выбирает, куда вставить', () => {
    const run = newRun('warrior', 11);
    run.hero.weapon.slots.push(null);
    run.hero.armor.slots.push(null);
    enterRoom(run);
    winCurrentBattle(run);
    run.rewards = [{ title: 'x', source: 'fight', rerolled: false, options: [{ kind: 'artifact', artifact: { id: 'thorns', tier: 1 } }] }];
    takeReward(run, 0);
    expect(run.pending).not.toBeNull();
    pendingPlace(run, 'armor', 1);
    expect(run.hero.armor.slots[1]?.id).toBe('thorns');
    expect(run.hero.weapon.slots[1]).toBeNull();
    expect(run.phase).toBe('map');
  });

  it('дубликат из награды апгрейдит сразу, без выбора слота', () => {
    const run = newRun('warrior', 11);
    enterRoom(run);
    winCurrentBattle(run);
    run.rewards = [{ title: 'x', source: 'fight', rerolled: false, options: [{ kind: 'artifact', artifact: { id: 'troll_heart', tier: 1 } }] }];
    takeReward(run, 0);
    expect(run.pending).toBeNull();
    expect(run.hero.armor.slots[0]?.tier).toBe(2);
    expect(run.phase).toBe('map');
  });

  it('смена брони пересчитывает HP: прирост добавляется, излишек режется', () => {
    const run = newRun('mage', 1);
    const max0 = heroStats(run).maxHp;
    run.hero.hp = max0;
    run.phase = 'reward';
    run.rewards = [
      {
        title: 'x',
        source: 'fight',
        rerolled: false,
        options: [
          {
            kind: 'gear',
            gear: { kind: 'armor', tier: 5, base: 'mail', name: 'Тест', dmgMin: 0, dmgMax: 0, def: 5, hp: 15, affix: null, slots: [null, null, null, null] },
          },
        ],
      },
    ];
    takeReward(run, 0);
    expect(heroStats(run).maxHp).toBe(max0 + 15);
    expect(run.hero.hp).toBe(max0 + 15);
    run.phase = 'reward';
    run.rewards = [
      {
        title: 'x',
        source: 'fight',
        rerolled: false,
        options: [{ kind: 'gear', gear: { kind: 'armor', tier: 1, base: 'robe', name: 'Тряпка', dmgMin: 0, dmgMax: 0, def: 0, hp: 0, affix: null, slots: [null] } }],
      },
    ];
    takeReward(run, 0);
    expect(run.hero.hp).toBe(max0);
  });

  it('событие: родник лечит, алтарь режет HP и даёт артефакт', () => {
    const run = newRun('paladin', 9);
    run.roomIndex = 2;
    run.hero.hp = 10;
    enterRoom(run);
    expect(run.phase).toBe('event');
    const max = heroStats(run).maxHp;
    chooseEvent(run, 'spring');
    expect(run.hero.hp).toBe(10 + Math.floor(max * 0.3));
    expect(run.phase).toBe('map');
    expect(run.roomIndex).toBe(3);

    const run2 = newRun('paladin', 9);
    run2.roomIndex = 2;
    enterRoom(run2);
    const altar = run2.event!.options.find((o) => o.id === 'altar');
    expect(altar).toBeDefined();
    const max2 = heroStats(run2).maxHp;
    chooseEvent(run2, 'altar');
    // новый артефакт → выбор слота, отменить нельзя (HP уже отдан)
    expect(run2.pending).not.toBeNull();
    expect(run2.pending?.cancellable).toBe(false);
    pendingDiscard(run2);
    expect(run2.hero.hp).toBe(max2 - Math.floor(max2 * 0.1));
    expect(run2.phase).toBe('map');
  });

  it('привал: отдых лечит половину, кузница поднимает тир', () => {
    const run = newRun('warrior', 2);
    run.phase = 'camp';
    run.roomIndex = ROOMS_PER_LOCATION;
    run.hero.hp = 1;
    campRest(run);
    expect(run.hero.hp).toBe(1 + Math.floor(heroStats(run).maxHp * 0.5));
    expect(run.locationIndex).toBe(1);
    expect(run.roomIndex).toBe(0);
    expect(run.phase).toBe('map');

    const run2 = newRun('warrior', 2);
    run2.phase = 'camp';
    expect(campForge(run2, 'armor', 0)).toBe(true);
    expect(run2.hero.armor.slots[0]?.tier).toBe(2);
    expect(run2.locationIndex).toBe(1);
  });

  it('босс первого акта даёт экипировку 3 тира и артефакт', () => {
    const run = newRun('berserk', 5);
    run.locations = ['forest', 'crypt', 'caves'];
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    enterRoom(run);
    expect(run.battle?.enemies[0].defId).toBe('alpha_wolf');
    winCurrentBattle(run);
    expect(run.phase).toBe('reward');
    expect(run.rewards.length).toBe(2);
    expect(run.rewards[0].options.every((o) => o.kind === 'gear' && o.gear.tier === 3)).toBe(true);
    takeReward(run, 0);
    expect(run.rewards.length).toBe(1);
    expect(run.rewards[0].options.every((o) => o.kind === 'artifact')).toBe(true);
    takeReward(run, 0);
    if (run.pending) resolvePending(run);
    expect(run.phase).toBe('camp');
  });

  it('после финального босса награды нет — сразу победа', () => {
    const run = newRun('warrior', 11);
    run.locationIndex = 2;
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    enterRoom(run);
    expect(enemyDef(run.battle!.enemies[0].defId).rank).toBe('boss');
    winCurrentBattle(run);
    expect(run.rewards.length).toBe(0);
    expect(run.phase).toBe('victory');
  });

  it('забег получает три разные локации, набор зависит от сида', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const run = newRun('warrior', seed);
      expect(run.locations.length).toBe(3);
      expect(new Set(run.locations).size).toBe(3);
      for (const id of run.locations) expect(LOCATIONS.some((l) => l.id === id)).toBe(true);
      seen.add(run.locations.join(','));
    }
    expect(seen.size).toBeGreaterThan(5);
    expect(pickRunLocations(createRng(9))).toEqual(pickRunLocations(createRng(9)));
  });

  it('враги масштабируются под акт, а не под родную локацию', () => {
    // крыса из леса (tier 1) в третьем акте — почти втрое толще, урон ×1,95 и ещё +15 % надбавки акта
    expect(enemyScale(1, 2).hp).toBeCloseTo(2.7);
    expect(enemyScale(1, 2).dmg).toBeCloseTo(1.95 * 1.15);
    // враг пещер (tier 3) в первом акте — наоборот, тоньше, и без надбавки; боссы растут мягче рядовых
    expect(enemyScale(3, 0).hp).toBeCloseTo(1 / 2.7);
    expect(enemyScale(3, 0).dmg).toBeCloseTo(1 / 1.95);
    expect(enemyScale(1, 2, 'boss').hp).toBeCloseTo(2.4);
    expect(enemyScale(1, 2, 'boss').dmg).toBeCloseTo(1.7 * 1.15);
    expect(enemyScale(2, 1).dmg).toBeCloseTo(1.15);
    const run = newRun('warrior', 3);
    run.locations = ['ship', 'forest', 'swamp'];
    enterRoom(run);
    const e = run.battle!.enemies[0];
    const def = enemyDef(e.defId);
    const sc = enemyScale(LOCATIONS.find((l) => l.id === def.location)!.tier, 0, def.rank);
    expect(e.maxHp).toBe(Math.max(1, Math.round(def.hp * sc.hp)));
    expect(e.dmgMult).toBeCloseTo(sc.dmg);
  });

  it('лут привязан к акту: босс второго акта даёт 4 тир в любой локации', () => {
    for (const first of ['swamp', 'ship'] as const) {
      const run = newRun('rogue', 21);
      run.locations = [first, 'hive', 'crypt'];
      run.locationIndex = 1;
      run.roomIndex = ROOMS_PER_LOCATION - 1;
      enterRoom(run);
      winCurrentBattle(run);
      expect(run.rewards[0].options.every((o) => o.kind === 'gear' && o.gear.tier === ACTS[1].bossGearTier)).toBe(true);
    }
  });

  it('все герои доигрывают забег без ошибок на разных сидах', () => {
    for (const hero of HERO_LIST) {
      for (let seed = 1; seed <= 6; seed++) {
        const run = newRun(hero.id, seed * 101);
        playRun(run);
        expect(['victory', 'defeat']).toContain(run.phase);
      }
    }
  });

  it('бессмертный герой доходит до победы через 18 боёв', () => {
    const run = newRun('warrior', 12345);
    playRun(run, true);
    expect(run.phase).toBe('victory');
    expect(run.stats.roomsCleared).toBe(FIGHTS_PER_RUN);
  });
});
