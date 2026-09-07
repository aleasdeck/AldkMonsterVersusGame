import { describe, expect, it } from 'vitest';
import { HERO_LIST } from '../src/data/heroes';
import { artifactDef } from '../src/data/artifacts';
import { FIGHTS_PER_RUN, ROOMS_PER_LOCATION } from '../src/data/locations';
import { canUseAction } from '../src/engine/combat';
import {
  battleAction,
  battleEndTurn,
  battleEnemyStep,
  campForge,
  campRest,
  chooseEvent,
  currentRoomKind,
  enterRoom,
  finishBattle,
  heroStats,
  isRunOver,
  newRun,
  pendingCancel,
  pendingDiscard,
  pendingPlace,
  skipReward,
  takeReward,
} from '../src/engine/run';
import { socketRefs } from '../src/engine/equipment';
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
    const a = newRun('rogue', 777);
    const b = newRun('rogue', 777);
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
    run.rewards = [{ title: 'x', options: [{ kind: 'artifact', artifact: { id: 'thorns', tier: 1 } }] }];
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
    run.rewards = [{ title: 'x', options: [{ kind: 'artifact', artifact: { id: 'thorns', tier: 1 } }] }];
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
    run.rewards = [{ title: 'x', options: [{ kind: 'artifact', artifact: { id: 'troll_heart', tier: 1 } }] }];
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
        options: [
          {
            kind: 'gear',
            gear: { kind: 'armor', tier: 5, name: 'Тест', dmgMin: 0, dmgMax: 0, def: 5, hp: 15, affix: null, slots: [null, null, null, null] },
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
        options: [{ kind: 'gear', gear: { kind: 'armor', tier: 1, name: 'Тряпка', dmgMin: 0, dmgMax: 0, def: 0, hp: 0, affix: null, slots: [null] } }],
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

  it('босс леса даёт экипировку 3 тира и артефакт', () => {
    const run = newRun('berserk', 5);
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
