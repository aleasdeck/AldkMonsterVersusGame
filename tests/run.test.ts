import { describe, expect, it } from 'vitest';
import { HERO_LIST, SIGNATURE_OWNER } from '../src/data/heroes';
import { runReport } from '../src/engine/report';
import { GAME_VERSION } from '../src/engine/types';
import { artifactDef } from '../src/data/artifacts';
import { ACTS, ACT_DMG_BONUS, ACT_TOUGH_HP, BOSS_HEAL_PCT, EVENT_WEIGHTS, FIGHT_DMG_MULT, FIGHT_HP_MULT, FIGHTS_PER_RUN, LOCATIONS, ROOMS_PER_LOCATION, ROOM_KINDS, enemyScale, pickRunLocations } from '../src/data/locations';
import { enemyDef } from '../src/data/enemies';
import { createRng } from '../src/engine/rng';
import { canUseAction, performAction } from '../src/engine/combat';
import {
  advanceRoom,
  altarPray,
  altarSacrifice,
  battleAction,
  battleEndTurn,
  battleEnemyStep,
  battleTitle,
  campForge,
  campRest,
  canAltarSacrifice,
  canForge,
  canPendingPlace,
  canReroll,
  rerollReward,
  canShopBuyGear,
  canShopBuyPotion,
  canShopHeal,
  canShopReroll,
  currentRoomKind,
  enterRoom,
  finishBattle,
  forgeUpgrade,
  heroStats,
  isRunOver,
  leaveEvent,
  leaveShop,
  newRun,
  pendingCancel,
  pendingDiscard,
  pendingPlace,
  shopBuyArtifact,
  shopBuyGear,
  shopBuyPotion,
  shopHeal,
  shopHealAmount,
  shopReroll,
  skipReward,
  startEvent,
  takeChest,
  takeReward,
  awaitsFocus,
  canChooseFocus,
  chooseRewardFocus,
} from '../src/engine/run';
import { POTION_DROP_CHANCE, REROLL_COST, SHOP_HEAL_COST, SHOP_HEAL_PCT, SHOP_POTION_PRICE, artifactPrice, canDropFor, forgePrice, gearPrice, rollArtifact, rollEventKind } from '../src/engine/loot';
import { POTION_IDS } from '../src/data/potions';
import { freeSocketFor, gearOf } from '../src/engine/equipment';
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

/** Разместить ожидающий артефакт в первый свободный подходящий сокет, иначе выбросить. */
function resolvePending(run: RunState): void {
  const free = freeSocketFor(run.hero, run.pending!.artifacts[0].id);
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
      // И всесокрушающий: простой бот берёт первую награду и может остаться с чужим оружием на половине кубика,
      // а Осиная королева с бесконечными Феромонами такого героя не выпускает — тест про структуру забега, не про урон.
      run.battle.hero.stats.dmgMin = 50;
      run.battle.hero.stats.dmgMax = 50;
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
        // Пул простой бот чередует по клетке: так забег видит оба пула.
        if (awaitsFocus(run.rewards[0])) chooseRewardFocus(run, run.roomIndex % 2 === 0 ? 'attack' : 'defense');
        else takeReward(run, 0);
        break;
      case 'event':
        if (run.event?.kind === 'chest') takeChest(run);
        else if (run.event?.kind === 'altar') altarPray(run);
        else leaveEvent(run);
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

describe('торговец из события', () => {
  /** Довести забег до торговца: в клетке события выпадает торговец, товары раскладываются при входе. */
  function toShop(seed: number, heroId = 'warrior'): RunState {
    const run = newRun(heroId, seed);
    run.roomIndex = ROOM_KINDS.indexOf('event');
    startEvent(run, 'shop');
    expect(run.phase).toBe('shop');
    expect(run.event?.kind).toBe('shop');
    return run;
  }

  it('торговец открывается из события с полным прилавком, после ухода — следующая клетка', () => {
    const run = toShop(31);
    expect(run.shop?.gear).not.toBeNull();
    expect(run.shop?.artifact).not.toBeNull();
    expect(run.shop?.healed).toBe(false);
    expect(run.shop?.rerolled).toBe(false);
    leaveShop(run);
    expect(run.phase).toBe('map');
    expect(run.shop).toBeNull();
    expect(run.event).toBeNull();
    expect(run.roomIndex).toBe(ROOM_KINDS.indexOf('event') + 1);

    const plain = newRun('warrior', 31);
    enterRoom(plain);
    winCurrentBattle(plain);
    skipReward(plain);
    expect(plain.phase).toBe('map');
    expect(currentRoomKind(plain)).toBe('fight');
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
    expect(currentRoomKind(run)).toBe('fight');
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

  it('переброс завозит новый товар на все места, включая купленные и лекаря, один раз за визит', () => {
    const run = toShop(35);
    run.gold = 100;
    run.hero.hp = 5;
    expect(shopBuyGear(run)).toBe(true);
    expect(shopHeal(run)).toBe(true);
    expect(run.shop!.gear).toBeNull();
    expect(run.shop!.healed).toBe(true);
    const gold = run.gold;
    expect(shopReroll(run)).toBe(true);
    expect(run.gold).toBe(gold - REROLL_COST);
    expect(run.shop!.rerolled).toBe(true);
    // Раскупленное вернулось на прилавок, лекарь снова принимает.
    expect(run.shop!.gear).not.toBeNull();
    expect(run.shop!.artifact).not.toBeNull();
    expect(run.shop!.potion).not.toBeNull();
    expect(run.shop!.healed).toBe(false);
    expect(canShopHeal(run)).toBeNull();
    expect(canShopReroll(run)).toMatch(/уже/);
    expect(shopReroll(run)).toBe(false);

    // Даже с пустым прилавком переброс имеет смысл — он завозит всё заново.
    const empty = toShop(35);
    empty.gold = 100;
    shopBuyGear(empty);
    shopBuyArtifact(empty);
    if (empty.pending) resolvePending(empty);
    shopBuyPotion(empty);
    empty.gold = 100;
    expect(canShopReroll(empty)).toBeNull();
    expect(shopReroll(empty)).toBe(true);
    expect(empty.shop!.potion).not.toBeNull();
  });

  it('зелье у торговца: цена, ложится в слот и вытесняет старое, переброс обновляет', () => {
    const run = toShop(36);
    run.gold = 100;
    const potion = run.shop!.potion!;
    expect(POTION_IDS).toContain(potion);
    run.hero.potion = 'antidote';
    expect(shopBuyPotion(run)).toBe(true);
    expect(run.gold).toBe(100 - SHOP_POTION_PRICE);
    expect(run.hero.potion).toBe(potion);
    expect(run.shop!.potion).toBeNull();
    expect(canShopBuyPotion(run)).toBe('Продано');
    expect(shopBuyPotion(run)).toBe(false);

    const poor = toShop(36);
    poor.gold = SHOP_POTION_PRICE - 1;
    expect(canShopBuyPotion(poor)).toMatch(/золота/);
    expect(shopBuyPotion(poor)).toBe(false);
    expect(poor.hero.potion).toBeNull();

    const re = toShop(36);
    re.gold = 100;
    expect(shopReroll(re)).toBe(true);
    expect(re.shop!.potion).not.toBeNull();
  });

  it('зелье маны не продаётся герою без маны', () => {
    for (let seed = 40; seed < 70; seed++) expect(toShop(seed, 'berserk').shop!.potion).not.toBe('mana_potion');
  });
});

describe('зелья в забеге', () => {
  /** Первый сид, на котором с первого монстра выпадает зелье: экран зелья стоит после основной награды. */
  function toPotionDrop(): RunState {
    for (let seed = 1; seed < 500; seed++) {
      const run = newRun('warrior', seed);
      enterRoom(run);
      winCurrentBattle(run);
      if (run.rewards.length === 2 && run.rewards[1].source === 'potion') return run;
    }
    throw new Error('no potion drop in 500 seeds');
  }

  it('зелье с монстра — отдельный экран после награды, без переброса, ложится в слот', () => {
    const run = toPotionDrop();
    expect(run.rewards[0].source).toBe('fight');
    expect(run.rewards[1].options).toHaveLength(1);
    const potion = run.rewards[1].options[0];
    expect(potion.kind).toBe('potion');
    skipReward(run);
    expect(run.phase).toBe('reward');
    expect(run.rewards[0].source).toBe('potion');
    expect(canReroll(run)).toMatch(/Зелье/);
    takeReward(run, 0);
    expect(run.hero.potion).toBe(potion.kind === 'potion' ? potion.potion : null);
    expect(run.phase).toBe('map');
    expect(run.rewards).toHaveLength(0);
  });

  it('зелье можно пропустить — слот остаётся прежним', () => {
    const run = toPotionDrop();
    run.hero.potion = 'antidote';
    skipReward(run);
    skipReward(run);
    expect(run.hero.potion).toBe('antidote');
    expect(run.phase).toBe('map');
  });

  it('шанс дропа около 10 %: на 400 первых боях выпадает от 20 до 70 зелий', () => {
    let drops = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const run = newRun('mage', seed * 31);
      enterRoom(run);
      winCurrentBattle(run);
      if (run.rewards.some((r) => r.source === 'potion')) drops++;
    }
    expect(POTION_DROP_CHANCE).toBe(0.1);
    expect(drops).toBeGreaterThanOrEqual(20);
    expect(drops).toBeLessThanOrEqual(70);
  });

  it('выпитое в бою зелье не возвращается, невыпитое остаётся после победы', () => {
    const run = newRun('warrior', 5);
    run.hero.potion = 'stone_skin';
    enterRoom(run);
    expect(run.battle!.hero.potion).toBe('stone_skin');
    battleAction(run, { type: 'potion' });
    expect(run.battle!.hero.block).toBe(10);
    winCurrentBattle(run);
    expect(run.hero.potion).toBeNull();

    const keep = newRun('warrior', 5);
    keep.hero.potion = 'stone_skin';
    enterRoom(keep);
    winCurrentBattle(keep);
    expect(keep.hero.potion).toBe('stone_skin');
  });

  it('после финального босса зелье не предлагается — сразу победа', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const run = newRun('warrior', seed);
      run.locationIndex = 2;
      run.roomIndex = ROOM_KINDS.indexOf('boss');
      enterRoom(run);
      winCurrentBattle(run);
      expect(run.phase).toBe('victory');
      expect(run.rewards).toHaveLength(0);
    }
  });
});

describe('забег', () => {
  it('этаж из 10 клеток: бой, бой, событие, бой, бой, событие, бой, элита, событие, босс', () => {
    const run = newRun('warrior', 42);
    const kinds = [];
    for (let i = 0; i < ROOMS_PER_LOCATION; i++) {
      run.roomIndex = i;
      kinds.push(currentRoomKind(run));
    }
    expect(kinds).toEqual(['fight', 'fight', 'event', 'fight', 'fight', 'event', 'fight', 'elite', 'event', 'boss']);
    expect(FIGHTS_PER_RUN).toBe(21);
  });

  it('событие выпадает по весам: на 3000 бросках доли близки к 10/5/25/25/25/10', () => {
    const rng = createRng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const k = rollEventKind(rng);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const [kind, weight] of Object.entries(EVENT_WEIGHTS)) {
      const share = ((counts[kind] ?? 0) / 3000) * 100;
      expect(Math.abs(share - weight)).toBeLessThan(3);
    }
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
    const a = newRun('archer', 777, 1000);
    const b = newRun('archer', 777, 1000);
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
    // Сначала слепой выбор пула (v0.39), три карточки катятся после него.
    expect(awaitsFocus(run.rewards[0])).toBe(true);
    expect(run.rewards[0].options.length).toBe(0);
    expect(chooseRewardFocus(run, 'attack')).toBe(true);
    expect(run.rewards[0].options.length).toBe(3);
    skipReward(run);
    expect(run.phase).toBe('map');
    expect(run.roomIndex).toBe(1);
  });

  describe('пул награды «Нападение» / «Защита» (v0.39)', () => {
    it('«Нападение» — только оружие и оружейные артефакты, «Защита» — броня и бронные; переброс остаётся в пуле', () => {
      for (const [focus, kind] of [
        ['attack', 'weapon'],
        ['defense', 'armor'],
      ] as const) {
        for (let seed = 1; seed <= 30; seed++) {
          const run = newRun('mage', seed);
          run.gold = 100;
          enterRoom(run);
          winCurrentBattle(run);
          expect(chooseRewardFocus(run, focus)).toBe(true);
          expect(run.rewards[0].focus).toBe(focus);
          const check = () => {
            expect(run.rewards[0].options).toHaveLength(3);
            for (const o of run.rewards[0].options) {
              if (o.kind === 'gear') expect(o.gear.kind).toBe(kind);
              else if (o.kind === 'artifact') expect(artifactDef(o.artifact.id).slot).toBe(kind);
              else throw new Error('зелье в тройке награды');
            }
          };
          check();
          expect(rerollReward(run)).toBe(true);
          check();
        }
      }
    });

    it('пока пул не выбран: переброса и взятия нет, повторный выбор невозможен, пропустить можно', () => {
      const run = newRun('warrior', 7);
      enterRoom(run);
      winCurrentBattle(run);
      expect(canChooseFocus(run)).toBeNull();
      expect(canReroll(run)).toMatch(/пул/);
      expect(rerollReward(run)).toBe(false);
      takeReward(run, 0);
      expect(run.phase).toBe('reward');
      expect(chooseRewardFocus(run, 'defense')).toBe(true);
      expect(canChooseFocus(run)).toMatch(/уже/);
      expect(chooseRewardFocus(run, 'attack')).toBe(false);
      expect(run.rewards[0].focus).toBe('defense');
      expect(canReroll(run)).toBeNull();

      const run2 = newRun('warrior', 8);
      enterRoom(run2);
      winCurrentBattle(run2);
      skipReward(run2);
      expect(run2.rewards.some((r) => r.source === 'fight')).toBe(false);
    });

    it('элита тоже выбирает пул с тиром на ступень выше; босс и зелье пула не ждут', () => {
      const run = newRun('warrior', 4);
      run.roomIndex = 2;
      startEvent(run, 'elite');
      winCurrentBattle(run);
      expect(awaitsFocus(run.rewards[0])).toBe(true);
      chooseRewardFocus(run, 'defense');
      for (const o of run.rewards[0].options) if (o.kind === 'gear') expect([2, 3]).toContain(o.gear.tier);
      expect(awaitsFocus({ title: 'x', source: 'bossGear', options: [], rerolled: false })).toBe(false);
      expect(awaitsFocus({ title: 'x', source: 'potion', options: [], rerolled: false })).toBe(false);
      expect(awaitsFocus(undefined)).toBe(false);
    });
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

  it('неподходящий сокет не принимает ожидающий артефакт: причина в canPendingPlace, pendingPlace ничего не делает', () => {
    const run = newRun('warrior', 11);
    run.hero.weapon.slots = [{ id: 'crippling_shot', tier: 1 }];
    enterRoom(run);
    winCurrentBattle(run);
    // Стартовая кольчуга: один бронный сокет. Огненный шар — оружейный, ему туда нельзя.
    run.rewards = [{ title: 'x', source: 'fight', rerolled: false, options: [{ kind: 'artifact', artifact: { id: 'fireball', tier: 1 } }] }];
    takeReward(run, 0);
    expect(run.pending).not.toBeNull();
    expect(canPendingPlace(run, 'armor', 0)).toMatch(/Бронный сокет/);
    expect(pendingPlace(run, 'armor', 0)).toBe(false);
    expect(run.pending).not.toBeNull();
    expect(run.hero.armor.slots[0]).toBeNull();
    // Оружейный сокет занят Подсечным выстрелом — замена разрешена, тип совпадает; вытесненный ждёт решения.
    expect(canPendingPlace(run, 'weapon', 0)).toBeNull();
    expect(pendingPlace(run, 'weapon', 0)).toBe(true);
    expect(run.hero.weapon.slots[0]?.id).toBe('fireball');
    expect(run.pending?.artifacts.map((a) => a.id)).toEqual(['crippling_shot']);
    pendingDiscard(run);
    expect(run.phase).toBe('map');
  });

  it('«Заменить» ставит вытесненный артефакт в очередь: его можно переставить или выбросить, отмена после этого закрыта', () => {
    const run = newRun('warrior', 11);
    run.hero.weapon.slots = [{ id: 'shield_bash', tier: 1 }, { id: 'crippling_shot', tier: 1 }];
    run.hero.weapon.slotKinds = ['weapon', 'any'];
    enterRoom(run);
    winCurrentBattle(run);
    run.rewards = [{ title: 'x', source: 'fight', rerolled: false, options: [{ kind: 'artifact', artifact: { id: 'fireball', tier: 1 } }] }];
    takeReward(run, 0);
    expect(run.pending?.cancellable).toBe(true);
    // Шар вместо Мощного удара: удар не пропал, а ждёт своей очереди; награда уже потрачена — отмены нет.
    expect(pendingPlace(run, 'weapon', 1)).toBe(true);
    expect(run.hero.weapon.slots[1]?.id).toBe('fireball');
    expect(run.pending?.artifacts.map((a) => a.id)).toEqual(['crippling_shot']);
    expect(run.pending?.displaced).toEqual(['crippling_shot']);
    expect(run.pending?.cancellable).toBe(false);
    expect(run.phase).toBe('reward');
    expect(run.rewards.length).toBe(1);
    // Мощный удар — в бронный сокет нельзя, вместо Щитового удара — можно: тот в свою очередь встаёт в очередь.
    expect(canPendingPlace(run, 'armor', 0)).toMatch(/Бронный сокет/);
    expect(pendingPlace(run, 'weapon', 0)).toBe(true);
    expect(run.hero.weapon.slots.map((a) => a?.id)).toEqual(['crippling_shot', 'fireball']);
    expect(run.pending?.artifacts.map((a) => a.id)).toEqual(['shield_bash']);
    pendingDiscard(run);
    expect(run.pending).toBeNull();
    expect(run.rewards.length).toBe(0);
    expect(run.phase).toBe('map');
  });

  it('смена предмета: не поместившийся артефакт можно переставить во второй предмет, вытеснив оттуда другой', () => {
    const run = newRun('warrior', 11);
    run.hero.weapon.slots = [{ id: 'shield_bash', tier: 1 }, { id: 'troll_heart', tier: 1 }];
    run.hero.weapon.slotKinds = ['weapon', 'any'];
    run.hero.armor.slots = [{ id: 'thorns', tier: 1 }];
    run.hero.armor.slotKinds = ['armor'];
    run.phase = 'reward';
    run.rewards = [
      {
        title: 'x',
        source: 'fight',
        rerolled: false,
        options: [{ kind: 'gear', gear: { kind: 'weapon', tier: 2, base: 'sword', name: 'Тест', dmgMin: 4, dmgMax: 8, def: 0, hp: 0, affix: null, slots: [null, null], slotKinds: ['weapon', 'weapon'] } }],
      },
    ];
    takeReward(run, 0);
    // Сердцу тролля в новом мече места нет — оно в очереди; Шипы из брони вытесняет, Шипы решает игрок.
    expect(run.pending?.artifacts.map((a) => a.id)).toEqual(['troll_heart']);
    expect(pendingPlace(run, 'armor', 0)).toBe(true);
    expect(run.hero.armor.slots[0]?.id).toBe('troll_heart');
    expect(run.pending?.artifacts.map((a) => a.id)).toEqual(['thorns']);
    pendingDiscard(run);
    expect(run.pending).toBeNull();
    expect(run.phase).toBe('map');
  });

  it('дубликат из награды апгрейдит сразу, без выбора слота', () => {
    const run = newRun('warrior', 11);
    enterRoom(run);
    winCurrentBattle(run);
    run.hero.armor.slots[0] = { id: 'troll_heart', tier: 1 };
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
            gear: { kind: 'armor', tier: 5, base: 'mail', name: 'Тест', dmgMin: 0, dmgMax: 0, def: 5, hp: 15, affix: null, slots: [null, null, null, null], slotKinds: [] },
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
        options: [{ kind: 'gear', gear: { kind: 'armor', tier: 1, base: 'robe', name: 'Тряпка', dmgMin: 0, dmgMax: 0, def: 0, hp: 0, affix: null, slots: [null], slotKinds: [] } }],
      },
    ];
    takeReward(run, 0);
    expect(run.hero.hp).toBe(max0);
  });

  it('алтарь: молитва лечит 30 %, жертва режет 10 % HP и даёт артефакт без отмены', () => {
    const run = newRun('paladin', 9);
    run.roomIndex = 2;
    run.hero.hp = 10;
    startEvent(run, 'altar');
    expect(run.phase).toBe('event');
    expect(run.event?.kind).toBe('altar');
    const max = heroStats(run).maxHp;
    altarPray(run);
    expect(run.hero.hp).toBe(10 + Math.floor(max * 0.3));
    expect(run.phase).toBe('map');
    expect(run.roomIndex).toBe(3);

    const run2 = newRun('paladin', 9);
    run2.roomIndex = 2;
    startEvent(run2, 'altar');
    expect(run2.event?.kind === 'altar' && run2.event.artifact).toBeTruthy();
    // Артефакт подставляем сам: случайный может оказаться дубликатом стоящего и уйти в апгрейд без выбора слота.
    if (run2.event?.kind === 'altar') run2.event.artifact = { id: 'thorns', tier: 1 };
    expect(canAltarSacrifice(run2)).toBeNull();
    const max2 = heroStats(run2).maxHp;
    expect(altarSacrifice(run2)).toBe(true);
    // новый артефакт → выбор слота, отменить нельзя (HP уже отдан)
    expect(run2.pending).not.toBeNull();
    expect(run2.pending?.cancellable).toBe(false);
    pendingDiscard(run2);
    expect(run2.hero.hp).toBe(max2 - Math.floor(max2 * 0.1));
    expect(run2.phase).toBe('map');

    // Мимо алтаря можно пройти
    const run3 = newRun('paladin', 9);
    run3.roomIndex = 2;
    startEvent(run3, 'altar');
    leaveEvent(run3);
    expect(run3.phase).toBe('map');
    expect(run3.roomIndex).toBe(3);
  });

  it('сундук: экипировка надевается сразу, можно оставить', () => {
    const run = newRun('warrior', 9);
    run.roomIndex = 2;
    startEvent(run, 'chest');
    expect(run.event?.kind).toBe('chest');
    const gear = run.event?.kind === 'chest' ? run.event.gear : null;
    takeChest(run);
    if (run.pending) resolvePending(run);
    expect(gearOf(run.hero, gear!.kind).name).toBe(gear!.name);
    expect(run.phase).toBe('map');

    const run2 = newRun('warrior', 9);
    run2.roomIndex = 2;
    startEvent(run2, 'chest');
    const before = run2.hero.weapon.name + run2.hero.armor.name;
    leaveEvent(run2);
    expect(run2.hero.weapon.name + run2.hero.armor.name).toBe(before);
    expect(run2.phase).toBe('map');
  });

  it('кузнец: поднимает тир предмета за золото, аффикс и артефакты остаются, сокеты добавляются', () => {
    const run = newRun('warrior', 3);
    run.roomIndex = 2;
    startEvent(run, 'forge');
    expect(run.event?.kind).toBe('forge');
    run.gold = 0;
    expect(canForge(run, 'weapon')).toMatch(/золота/);
    const price = forgePrice(run.hero.weapon);
    expect(price).toBe(gearPrice({ ...run.hero.weapon, tier: 2 }));
    run.gold = price;
    run.hero.weapon.affix = { stat: 'str', value: 1 };
    const art = run.hero.weapon.slots[0];
    expect(forgeUpgrade(run, 'weapon')).toBe(true);
    expect(run.gold).toBe(0);
    expect(run.hero.weapon.tier).toBe(2);
    expect(run.hero.weapon.slots.length).toBe(2);
    expect(run.hero.weapon.slots[0]).toEqual(art);
    expect(run.hero.weapon.affix).toEqual({ stat: 'str', value: 1 });
    expect(run.hero.weapon.dmgMin).toBeGreaterThanOrEqual(4);
    expect(run.phase).toBe('map');

    // Броня: HP растёт вместе с максимумом
    const run2 = newRun('warrior', 3);
    run2.roomIndex = 2;
    startEvent(run2, 'forge');
    run2.gold = 99;
    const hpBefore = run2.hero.hp;
    const maxBefore = heroStats(run2).maxHp;
    expect(forgeUpgrade(run2, 'armor')).toBe(true);
    expect(heroStats(run2).maxHp).toBeGreaterThan(maxBefore);
    expect(run2.hero.hp).toBe(hpBefore + heroStats(run2).maxHp - maxBefore);

    // Предел тира
    const run3 = newRun('warrior', 3);
    run3.roomIndex = 2;
    startEvent(run3, 'forge');
    run3.gold = 99;
    run3.hero.weapon.tier = 5;
    expect(canForge(run3, 'weapon')).toMatch(/Предел/);
  });

  it('элита из события: золото и награда как за клетку элиты', () => {
    const run = newRun('warrior', 4);
    run.roomIndex = 2;
    startEvent(run, 'elite');
    expect(run.phase).toBe('battle');
    expect(enemyDef(run.battle!.enemies[0].defId).rank).toBe('elite');
    const gold = run.gold;
    winCurrentBattle(run);
    expect(run.gold).toBe(gold + 4);
    expect(run.rewards[0].source).toBe('elite');
    while (run.phase === 'reward') skipReward(run);
    expect(run.phase).toBe('map');
    expect(run.roomIndex).toBe(3);
    expect(run.event).toBeNull();
  });

  it('привал из события: отдых лечит половину, кузница поднимает тир, дальше — следующая клетка', () => {
    const run = newRun('warrior', 2);
    run.roomIndex = 5;
    run.hero.hp = 1;
    startEvent(run, 'camp');
    expect(run.phase).toBe('camp');
    campRest(run);
    expect(run.hero.hp).toBe(1 + Math.floor(heroStats(run).maxHp * 0.5));
    expect(run.locationIndex).toBe(0);
    expect(run.roomIndex).toBe(6);
    expect(run.phase).toBe('map');

    const run2 = newRun('warrior', 2);
    run2.roomIndex = 5;
    run2.hero.armor.slots[0] = { id: 'troll_heart', tier: 1 };
    startEvent(run2, 'camp');
    expect(campForge(run2, 'armor', 0)).toBe(true);
    expect(run2.hero.armor.slots[0]?.tier).toBe(2);
    expect(run2.roomIndex).toBe(6);
  });

  it('после босса: лечение на 30 % максимума и сразу следующая локация, без привала', () => {
    const run = newRun('warrior', 6);
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    enterRoom(run);
    winCurrentBattle(run);
    run.hero.hp = 10; // бой выигран читом; проверяем само лечение
    run.battle = null;
    // finishBattle уже отработал в winCurrentBattle — повторим сценарий вручную на втором забеге
    const run2 = newRun('warrior', 6);
    run2.roomIndex = ROOMS_PER_LOCATION - 1;
    enterRoom(run2);
    run2.battle!.hero.stats.dmgMin = 999;
    run2.battle!.hero.stats.dmgMax = 999;
    run2.battle!.hero.hp = 10;
    playBattle(run2);
    const max = heroStats(run2).maxHp;
    const hpAfterFight = run2.hero.hp;
    expect(hpAfterFight).toBeLessThanOrEqual(max);
    expect(hpAfterFight).toBeGreaterThanOrEqual(10);
    expect(run2.phase).toBe('reward');
    expect(run2.rewards[0].note).toMatch(/Раны затянулись/);
    while (run2.phase === 'reward') {
      const before = run2.hero.hp;
      skipReward(run2);
      expect(run2.hero.hp).toBe(before);
    }
    expect(run2.phase).toBe('map');
    expect(run2.locationIndex).toBe(1);
    expect(run2.roomIndex).toBe(0);
    expect(BOSS_HEAL_PCT).toBe(0.3);
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
    expect(run.phase).toBe('map');
    expect(run.locationIndex).toBe(1);
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
    // Длина боя (v0.46): поверх акта HP ×FIGHT_HP_MULT и урон ×FIGHT_DMG_MULT — всем рангам одинаково.
    const H = FIGHT_HP_MULT;
    const D = FIGHT_DMG_MULT;
    // крыса из леса (tier 1) в третьем акте — почти втрое толще, урон ×1,95 и ещё надбавка акта
    expect(enemyScale(1, 2).hp).toBeCloseTo(2.7 * H);
    expect(enemyScale(1, 2).dmg).toBeCloseTo(1.95 * ACT_DMG_BONUS[2] * D);
    // враг пещер (tier 3) в первом акте — наоборот, тоньше; боссы растут мягче рядовых
    expect(enemyScale(3, 0).hp).toBeCloseTo((1 / 2.7) * H);
    expect(enemyScale(3, 0).dmg).toBeCloseTo((1 / 1.95) * ACT_DMG_BONUS[0] * D);
    expect(enemyScale(1, 2, 'boss').hp).toBeCloseTo(2.4 * H);
    expect(enemyScale(1, 2, 'boss').dmg).toBeCloseTo(1.7 * ACT_DMG_BONUS[2] * D);
    expect(enemyScale(2, 1).dmg).toBeCloseTo(ACT_DMG_BONUS[1] * D);
    // v0.37.1: элита и босс первого акта толще на ACT_TOUGH_HP[0]; рядовых и поздних актов это не касается.
    expect(enemyScale(1, 0, 'elite').hp).toBeCloseTo(ACT_TOUGH_HP[0] * H);
    expect(enemyScale(1, 0, 'boss').hp).toBeCloseTo(ACT_TOUGH_HP[0] * H);
    expect(enemyScale(1, 0).hp).toBeCloseTo(H);
    expect(enemyScale(1, 1, 'elite').hp).toBeCloseTo(1.5 * H);
    expect(enemyScale(1, 0, 'elite').dmg).toBeCloseTo(ACT_DMG_BONUS[0] * D);
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
      const run = newRun('archer', 21);
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

  it('бессмертный герой доходит до победы минимум через 21 бой (элита из события — сверх того)', () => {
    const run = newRun('warrior', 12345);
    playRun(run, true);
    expect(run.phase).toBe('victory');
    expect(run.stats.roomsCleared).toBeGreaterThanOrEqual(FIGHTS_PER_RUN);
    expect(run.stats.roomsCleared).toBeLessThanOrEqual(FIGHTS_PER_RUN + 9);
  });
});

describe('персональные артефакты', () => {
  it('не выпадают никому (v0.44): выбранный — врождённый навык, невыбранный в забеге не нужен', () => {
    const rng = createRng(3);
    const mage = newRun('mage', 1).hero;
    const assassin = newRun('assassin', 1).hero;
    for (let i = 0; i < 400; i++) {
      expect(SIGNATURE_OWNER[rollArtifact(rng, mage, [1], [])!.id]).toBeUndefined();
      expect(SIGNATURE_OWNER[rollArtifact(rng, assassin, [1], [])!.id]).toBeUndefined();
    }
    expect(canDropFor(mage, 'magic_missile')).toBe(false);
    expect(canDropFor(mage, 'rage')).toBe(false);
    expect(canDropFor(mage, 'fireball')).toBe(true);
  });

  it('врождённый навык растёт с локацией: уровень = номер локации, в бою — плитка своего тира', () => {
    const run = newRun('warrior', 1);
    expect(run.hero.innateTier).toBe(1);
    expect(run.hero.trait).toBe('stance');
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    run.phase = 'reward';
    advanceRoom(run);
    expect(run.locationIndex).toBe(1);
    expect(run.hero.innateTier).toBe(2);
    enterRoom(run);
    expect(run.battle!.hero.artifacts.find((a) => a.id === 'shield_bash')).toEqual({ id: 'shield_bash', tier: 2 });
    expect(run.battle!.hero.innate).toBe('shield_bash');
  });

  it('v0.33: у каждого героя пара, забег начинается с выбранным, невыбранный не выпадает никому', () => {
    for (const def of HERO_LIST) {
      expect(def.signatures).toHaveLength(2);
      expect(def.signatures[0]).not.toBe(def.signatures[1]);
      for (const id of def.signatures) expect(SIGNATURE_OWNER[id]).toBe(def.id);
    }
    const plain = newRun('warrior', 1);
    expect(plain.hero.signature).toBe('shield_bash');
    const second = newRun('warrior', 1, 0, 'riposte');
    expect(second.hero.signature).toBe('riposte');
    // Навык вне сокетов (v0.44): оба стартовых сокета пусты, пассивка навыка — в статах.
    expect(second.hero.weapon.slots).toEqual([null]);
    expect(second.hero.armor.slots).toEqual([null]);
    expect(heroStats(second).riposte).toBe(45);
    expect(canDropFor(second.hero, 'riposte')).toBe(false);
    expect(canDropFor(plain.hero, 'crippling_shot')).toBe(true);
    expect(() => newRun('warrior', 1, 0, 'rage')).toThrow(/Not a signature/);
    expect(() => newRun('warrior', 1, 0, 'shield_bash', 'charge')).toThrow(/Not a trait/);
  });
});

describe('журнал забега', () => {
  it('каждый бой попадает в журнал с заголовком, итогом и всеми строками лога', () => {
    const run = newRun('warrior', 5);
    expect(run.logs).toEqual([]);
    enterRoom(run);
    const roster = run.battle!.roster.join(', ');
    expect(roster.length).toBeGreaterThan(0);
    winCurrentBattle(run);
    expect(run.logs.length).toBe(1);
    expect(run.logs[0].title).toBe(`Акт 1 · ${LOCATIONS.find((l) => l.id === run.locations[0])!.name} · Бой 1: ${roster}`);
    expect(run.logs[0].result).toBe('won');
    expect(run.logs[0].lines[0]).toBe('— Ход 1 —');
    expect(run.logs[0].lines.some((l) => l.includes('кубик'))).toBe(true);
    while (run.phase === 'reward') skipReward(run);
    enterRoom(run);
    winCurrentBattle(run);
    expect(run.logs.length).toBe(2);
    expect(run.logs[1].title).toContain('Бой 2');
  });

  it('проигранный бой тоже в журнале, с итогом «поражение»', () => {
    const run = newRun('mage', 5);
    enterRoom(run);
    run.battle!.hero.hp = 1;
    run.battle!.hero.maxHp = 1;
    for (const e of run.battle!.enemies) e.hp = 999;
    playBattle(run);
    expect(run.phase).toBe('defeat');
    expect(run.logs.length).toBe(1);
    expect(run.logs[0].result).toBe('lost');
    expect(run.logs[0].lines.some((l) => l.includes('Герой пал'))).toBe(true);
  });
});

describe('статистика забега (report.ts)', () => {
  const ctx = { player: 'p-1', playerRuns: 3, debug: false, now: 5_000_000 };

  it('победа: акт 3, клетка босса, длительность по отметкам, бои без строк лога', () => {
    const run = newRun('warrior', 11, 1_000_000);
    playRun(run, true);
    run.stats.finishedAt = 1_000_000 + 754_400; // 12 мин 34 с
    const r = runReport(run, { ...ctx, event: 'victory' });
    expect(r.event).toBe('victory');
    expect(r.version).toBe(GAME_VERSION);
    expect(r.debug).toBe(false);
    expect(r.player).toBe('p-1');
    expect(r.playerRuns).toBe(3);
    expect(r.hero).toBe('warrior');
    expect(r.seed).toBe(11);
    expect(r.phase).toBe('victory');
    expect(r.act).toBe(3);
    expect(r.room).toBe(ROOMS_PER_LOCATION);
    expect(r.roomKind).toBe('boss');
    expect(r.location).toBe(run.locations[2]);
    expect(r.locations).toBe(run.locations.join(','));
    expect(r.duration).toBe(754);
    expect(r.roomsCleared).toBe(run.stats.roomsCleared);
    expect(r.kills).toBe(run.stats.kills);
    expect(r.battles).toBe(run.logs.length);
    expect(r.lastBattle).toBe(run.logs.at(-1)!.title);
    expect(r.detail.battles).toHaveLength(run.logs.length);
    expect(r.detail.battles.some((b) => 'lines' in b)).toBe(false);
    expect(r.detail.stats).toBe(run.stats);
  });

  it('гибель: клетка и состав боя, снаряжение и артефакты строками', () => {
    const run = newRun('mage', 5, 1_000_000);
    enterRoom(run);
    run.battle!.phase = 'lost';
    finishBattle(run);
    run.stats.finishedAt = 1_000_000 + 30_000;
    const r = runReport(run, { ...ctx, event: 'defeat' });
    expect(r.event).toBe('defeat');
    expect(r.phase).toBe('defeat');
    expect(r.act).toBe(1);
    expect(r.room).toBe(1);
    expect(r.roomKind).toBe('fight');
    expect(r.location).toBe(run.locations[0]);
    expect(r.lastBattle).toContain(LOCATIONS.find((l) => l.id === run.locations[0])!.name);
    expect(r.lastBattle).toContain('Бой 1');
    expect(r.battles).toBe(1);
    expect(r.hp).toBe(0);
    expect(r.maxHp).toBe(heroStats(run).maxHp);
    expect(r.weapon).toBe(`${run.hero.weapon.base}@${run.hero.weapon.tier}`);
    expect(r.armor).toBe(`${run.hero.armor.base}@${run.hero.armor.tier}`);
    // Навык вне сокетов (v0.44): в колонке артефактов только сокеты, навык — в signature.
    expect(r.artifacts).toBe('');
    expect(r.signature).toBe('magic_missile');
    expect(r.potion).toBe('');
    expect(r.duration).toBe(30);
    expect(r.detail.hero).toBe(run.hero);
    expect(r.detail.event).toBeNull();
  });

  it('брошенный: фаза и клетка на момент записи, длительность до `now`, пометка debug', () => {
    const run = newRun('archer', 7, 1_000_000);
    run.roomIndex = 2;
    startEvent(run, 'shop');
    run.hero.weapon.affix = { stat: 'crit', value: 0.05 };
    const r = runReport(run, { ...ctx, event: 'abandoned', now: 1_000_000 + 90_400, debug: true });
    expect(r.event).toBe('abandoned');
    expect(r.phase).toBe('shop');
    expect(r.room).toBe(3);
    expect(r.roomKind).toBe('event:shop');
    expect(r.detail.event).toBe('shop');
    expect(r.duration).toBe(90);
    expect(r.debug).toBe(true);
    expect(r.gold).toBe(run.gold);
    expect(r.weapon).toBe(`${run.hero.weapon.base}@${run.hero.weapon.tier} +crit`);
  });

  it('новый забег не отладочный — пометка живёт в состоянии и переживает сохранение', () => {
    const run = newRun('warrior', 1);
    expect(run.debug).toBe(false);
    run.debug = true;
    expect((JSON.parse(JSON.stringify(run)) as RunState).debug).toBe(true);
  });

  it('новый забег ещё не отправлен — отметка живёт в состоянии и переживает сохранение', () => {
    const run = newRun('warrior', 1);
    expect(run.reported).toBe(false);
    run.reported = true;
    expect((JSON.parse(JSON.stringify(run)) as RunState).reported).toBe(true);
  });

  it('гибель до кнопки «К итогам»: незакрытый бой попадает в запись со своими цифрами', () => {
    const run = newRun('mage', 5, 1_000_000);
    enterRoom(run);
    const b = run.battle!;
    b.turn = 4;
    b.stats.kills = 2;
    b.stats.damageDealt = 37;
    b.stats.damageTaken = 19;
    b.hero.hp = 0;
    b.phase = 'lost';
    // Запись собирается прямо на плашке «Герой пал», finishBattle ещё не вызван.
    const r = runReport(run, { ...ctx, event: 'defeat' });
    expect(r.phase).toBe('battle');
    expect(r.battles).toBe(1);
    expect(r.lastBattle).toBe(battleTitle(run));
    expect(r.kills).toBe(2);
    expect(r.turns).toBe(4);
    expect(r.damageDealt).toBe(37);
    expect(r.damageTaken).toBe(19);
    expect(r.hp).toBe(0);
    expect(r.detail.battles).toEqual([{ title: battleTitle(run), kind: 'fight', result: 'lost', turns: 4 }]);
    expect(r.detail.stats.kills).toBe(2);
    // Те же цифры, что и у записи после кнопки: клик ничего не добавляет и не теряет.
    finishBattle(run);
    const after = runReport(run, { ...ctx, event: 'defeat' });
    expect({ ...after, phase: 'battle' }).toEqual(r);
  });

  it('брошенный посреди боя: бой идёт в запись как незакрытый, цифры не теряются', () => {
    const run = newRun('archer', 7, 1_000_000);
    enterRoom(run);
    run.battle!.turn = 3;
    run.battle!.stats.damageDealt = 12;
    const r = runReport(run, { ...ctx, event: 'abandoned' });
    expect(r.battles).toBe(1);
    expect(r.turns).toBe(3);
    expect(r.damageDealt).toBe(12);
    expect(r.detail.battles).toEqual([{ title: battleTitle(run), kind: 'fight', result: 'unfinished', turns: 3 }]);
  });

  it('доля урона от удара (v0.42): закрытые бои и незакрытый складываются, перебор не считается', () => {
    const run = newRun('warrior', 3, 1_000_000);
    enterRoom(run);
    const b = run.battle!;
    // Удар по первому врагу засчитывается удару — не больше его остатка HP.
    const target = b.enemies[0];
    target.hp = 2;
    performAction(b, { type: 'attack', target: target.uid }, run.rng);
    expect(b.dealtBy.attack).toBe(2);
    b.dealtBy.dot = 6;
    const r = runReport(run, { ...ctx, event: 'abandoned' });
    expect(r.detail.dealt).toEqual({ attack: 2, dot: 6 });
    expect(r.attackShare).toBe(25);
  });

  it('лог боя хранит вид клетки и разбор урона (v0.42)', () => {
    const run = newRun('warrior', 3, 1_000_000);
    enterRoom(run);
    const b = run.battle!;
    b.dealtBy = { attack: 10, shield_bash: 5 };
    b.phase = 'won';
    finishBattle(run);
    expect(run.logs[0].kind).toBe('fight');
    expect(run.logs[0].dealt).toEqual({ attack: 10, shield_bash: 5 });
  });
});
