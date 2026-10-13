import { describe, expect, it } from 'vitest';
import { advanceRoom, awaitsThreshold, chestPins, chooseRewardFocus, currentRoomKind, enterRoom, finishBattle, newRun } from '../src/engine/run';
import { ROOMS_PER_LOCATION } from '../src/data/locations';
import { enemyDef } from '../src/data/enemies';
import { TUTORIAL_EVENTS, TUTORIAL_FIGHTS, TUTORIAL_HERO, TUTORIAL_POTION, TUTORIAL_SEED, TUTORIAL_SIGNATURE, TUTORIAL_TRAIT, tutorialRewards } from '../src/data/tutorial';
import { createRng } from '../src/engine/rng';
import type { EventState, LootItem, RunState } from '../src/engine/types';
import { playRun } from './sim/bot';

function tutorialRun(): RunState {
  return newRun(TUTORIAL_HERO, TUTORIAL_SEED, 0, TUTORIAL_SIGNATURE, TUTORIAL_TRAIT, { tutorial: true, locked: [] });
}

/** Выиграть текущий бой читом: враги падают от первого удара. */
function winBattle(run: RunState): void {
  const b = run.battle!;
  for (const e of b.enemies) e.hp = 0;
  b.phase = 'won';
  finishBattle(run);
}

const names = (items: LootItem[]) => items.map((i) => (i.kind === 'artifact' ? `art:${i.artifact.id}` : i.kind === 'gear' ? `${i.gear.kind}:${i.gear.base}@${i.gear.tier}` : `p:${i.potion}`));

describe('обучение (v0.58.0)', () => {
  it('одна локация Леса, «Средний» без порога, мысли пусты', () => {
    const run = tutorialRun();
    expect(run.locations).toEqual(['forest']);
    expect(run.difficulty).toBe('normal');
    expect(awaitsThreshold(run)).toBe(false);
    expect(run.tutorial).toEqual({ seen: [] });
    expect(run.hero.defId).toBe('warrior');
  });

  it('встречи и события клеток — по сценарию', () => {
    const run = tutorialRun();
    for (let room = 0; room < ROOMS_PER_LOCATION; room++) {
      run.roomIndex = room;
      run.phase = 'map';
      run.battle = null;
      run.event = null;
      enterRoom(run);
      const fight = TUTORIAL_FIGHTS[room];
      if (fight) {
        expect(run.phase).toBe('battle');
        expect(run.battle!.enemies.map((e) => e.defId).sort()).toEqual([...fight].sort());
      } else {
        expect((run.event as EventState | null)?.kind).toBe(TUTORIAL_EVENTS[room]);
      }
    }
  });

  it('награда за волков: тройка задана для обоих пулов', () => {
    const run = tutorialRun();
    enterRoom(run);
    winBattle(run);
    expect(run.phase).toBe('reward');
    chooseRewardFocus(run, 'defense');
    expect(names(run.rewards[0].options)).toEqual(['armor:plate@2', 'art:mana_shield', 'armor:robe@2']);
    expect(names(tutorialRewards(0, 'attack', run.hero, createRng(1))!)).toEqual(['weapon:sword@2', 'art:grapple_hook', 'weapon:bow@2']);
  });

  it('«дубликат» поднимает вставленную вещь, «нужна вещь Щита» не повторяет того, что уже есть', () => {
    const run = tutorialRun();
    // Без вещей в сокетах — вместо дубликата приходит недостающая вещь «Щита».
    expect(names(tutorialRewards(3, 'defense', run.hero, createRng(1))!)).toEqual(['art:mana_shield', 'art:turtle_shell', 'armor:harness@2']);
    run.hero.armor.slots[0] = { id: 'mana_shield', tier: 1 };
    expect(names(tutorialRewards(3, 'defense', run.hero, createRng(1))!)[0]).toBe('art:mana_shield');
    // Магический щит уже есть — недостающая бронная вещь «Щита» следующая по списку.
    expect(names(tutorialRewards(4, 'defense', run.hero, createRng(1))!)[0]).toBe('art:wanderer_cloak');
    // Обе карточки «нужна вещь» в одной тройке не совпадают.
    const elite = names(tutorialRewards(7, 'defense', run.hero, createRng(1))!);
    expect(new Set(elite).size).toBe(elite.length);
    expect(elite[0]).toBe('art:bastion');
  });

  it('сундук на два штифта: оберег «Щита» и булава', () => {
    const run = tutorialRun();
    run.roomIndex = 5;
    enterRoom(run);
    const ev = run.event!;
    expect(ev.kind).toBe('chest');
    if (ev.kind !== 'chest') return;
    expect(chestPins(ev)).toBe(2);
    expect(ev.gear?.base).toBe('mace');
    expect(ev.artifact?.id).toBe('mana_shield');
    expect(ev.potion ?? null).toBeNull();
  });

  it('зелье лечения — наверняка после боя с пауком и только там', () => {
    const run = tutorialRun();
    enterRoom(run);
    winBattle(run);
    expect(run.rewards.some((r) => r.source === 'potion')).toBe(false);
    run.rewards = [];
    run.roomIndex = TUTORIAL_POTION.room;
    run.phase = 'map';
    enterRoom(run);
    winBattle(run);
    expect(run.rewards.map((r) => r.source)).toEqual(['fight', 'potion']);
    expect(run.rewards[1].options).toEqual([{ kind: 'potion', potion: TUTORIAL_POTION.potion }]);
  });

  it('после босса Леса — победа, без трофея', () => {
    const run = tutorialRun();
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    expect(currentRoomKind(run)).toBe('boss');
    enterRoom(run);
    winBattle(run);
    expect(run.rewards).toEqual([]);
    expect(run.phase).toBe('victory');
  });

  it('обычный забег после той же клетки идёт в следующую локацию', () => {
    const run = newRun('warrior', 3);
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    advanceRoom(run);
    expect(run.locationIndex).toBe(1);
    expect(run.phase).toBe('map');
  });

  it('умный бот проходит этаж обучения до конца, встречи — по сценарию', () => {
    let wins = 0;
    for (let i = 0; i < 20; i++) {
      const run = newRun(TUTORIAL_HERO, TUTORIAL_SEED + i, 0, TUTORIAL_SIGNATURE, TUTORIAL_TRAIT, { tutorial: true, locked: [] });
      const outcome = playRun(run);
      expect(outcome).not.toBe('stall');
      if (outcome === 'victory') wins++;
      // Каждый сыгранный бой — встреча сценария своей клетки (элита и босс — по имени в заголовке).
      for (const log of run.logs) {
        const room = Number(/ (\d+): /.exec(log.title)?.[1]) - 1;
        const fight = TUTORIAL_FIGHTS[room]!;
        expect(log.title).toContain(enemyDef(fight[0]).name);
      }
    }
    // Числа честные, первого акта на «Среднем»: бот выигрывает этаж почти всегда, но не всегда.
    expect(wins).toBeGreaterThan(10);
  });
});
