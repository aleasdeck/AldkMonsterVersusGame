import { describe, expect, it } from 'vitest';
import { EVADE_DROP, getStatus, statusValue, turnsToFlee } from '../src/engine/combat';
import { GNOME_BOUNTY, GNOME_STEAL } from '../src/engine/loot';
import { battleAction, battleEndTurn, battleEnemyStep, finishBattle, newRun, startEvent } from '../src/engine/run';
import { enemyDef } from '../src/data/enemies';
import { heroDef } from '../src/data/heroes';
import { addArtifact, socketRefs } from '../src/engine/equipment';
import type { RunState } from '../src/engine/types';

/** Забег ровно перед клеткой события, где сидит вор. */
function gnomeRun(seed = 1, heroId = 'warrior'): RunState {
  const run = newRun(heroId, seed, 0);
  run.roomIndex = 2;
  startEvent(run, 'gnome');
  return run;
}

/** Пропустить ход целиком: герой ничего не делает, вор ходит. */
function passTurn(run: RunState): void {
  battleEndTurn(run);
  let guard = 0;
  while (run.battle!.phase === 'enemy' && guard++ < 20) battleEnemyStep(run);
}

describe('гном-деньгокрад', () => {
  it('событие сразу начинает бой с вором', () => {
    const run = gnomeRun();
    expect(run.phase).toBe('battle');
    expect(run.battle!.enemies).toHaveLength(1);
    expect(run.battle!.enemies[0].defId).toBe('gnome_thief');
    expect(run.event).toEqual({ kind: 'gnome', result: 'fight', gold: 0, artifact: null });
  });

  it('входит в бой с процентным уворотом, который падает с каждой кражей', () => {
    const run = gnomeRun();
    const start = enemyDef('gnome_thief').evade!;
    expect(statusValue(run.battle!.enemies[0], 'evade')).toBe(start);
    passTurn(run); // первый приём цикла — «Срезать кошель»
    expect(run.battle!.stolen).toBe(GNOME_STEAL);
    expect(statusValue(run.battle!.enemies[0], 'evade')).toBe(start - EVADE_DROP);
  });

  it('уворот гасит удары, но не раны: кровотечение проходит всегда', () => {
    const run = gnomeRun();
    const b = run.battle!;
    const gnome = b.enemies[0];
    // Уворот 100 %: ни один удар не доходит.
    getStatus(gnome, 'evade')!.value = 100;
    const before = gnome.hp;
    battleAction(run, { type: 'attack', target: gnome.uid });
    expect(gnome.hp).toBe(before);
    gnome.statuses.push({ id: 'bleed', value: 3, turns: 2 });
    passTurn(run);
    expect(b.enemies[0].hp).toBeLessThan(before);
  });

  it('счётчик побега честно отсчитывает ходы до бегства', () => {
    const run = gnomeRun();
    const gnome = () => run.battle!.enemies[0];
    const seen: number[] = [turnsToFlee(gnome())!];
    for (let i = 0; i < 3 && run.battle!.phase !== 'won'; i++) {
      passTurn(run);
      if (run.battle!.enemies.length > 0) seen.push(turnsToFlee(gnome())!);
    }
    expect(seen).toEqual([4, 3, 2, 1]);
    expect(run.battle!.fled).toBe(false);
    passTurn(run);
    expect(run.battle!.fled).toBe(true);
  });

  it('через четыре хода удирает с добычей, и золото списывается', () => {
    const run = gnomeRun();
    run.gold = 50;
    for (let i = 0; i < 4 && run.battle!.phase !== 'won'; i++) passTurn(run);
    expect(run.battle!.fled).toBe(true);
    expect(run.battle!.stolen).toBe(GNOME_STEAL * 2);
    expect(run.battle!.stats.kills).toBe(0);
    finishBattle(run);
    expect(run.phase).toBe('event');
    expect(run.event).toMatchObject({ kind: 'gnome', result: 'fled', gold: GNOME_STEAL * 2 });
    expect(run.gold).toBe(50 - GNOME_STEAL * 2);
  });

  it('унести больше, чем есть в кошеле, не может', () => {
    const run = gnomeRun();
    run.gold = 3;
    for (let i = 0; i < 4 && run.battle!.phase !== 'won'; i++) passTurn(run);
    finishBattle(run);
    expect(run.gold).toBe(0);
    expect(run.event).toMatchObject({ result: 'fled', gold: 3 });
  });

  it('убитый возвращает украденное и отдаёт свой мешок', () => {
    const run = gnomeRun();
    run.gold = 20;
    passTurn(run); // дать украсть один кошель
    run.battle!.enemies[0].hp = 0;
    run.battle!.enemies[0].statuses = [];
    battleAction(run, { type: 'attack', target: run.battle!.enemies[0].uid });
    expect(run.battle!.phase).toBe('won');
    finishBattle(run);
    expect(run.phase).toBe('event');
    expect(run.event).toMatchObject({ kind: 'gnome', result: 'slain', gold: GNOME_STEAL + GNOME_BOUNTY });
    expect(run.gold).toBe(20 + GNOME_STEAL + GNOME_BOUNTY);
  });
});

describe('гном-вещекрад', () => {
  /**
   * Забег с боем против вещекрада. На старте у героя в сокете только персональный артефакт, который вор не трогает,
   * поэтому по умолчанию докладываем обычный — как после первой же награды.
   */
  function snatcherRun(seed = 3, heroId = 'warrior', extra: string[] = ['luck_talisman', 'thorns']): RunState {
    const run = newRun(heroId, seed, 0);
    // На старте сокетов мало, а вору нужно из чего выбирать: расширяем броню и докладываем чужие артефакты.
    if (extra.length) run.hero.armor.slots = [null, null];
    for (const id of extra) addArtifact(run.hero, { id, tier: 1 });
    run.roomIndex = 2;
    startEvent(run, 'gnome_art');
    return run;
  }

  it('первый ход крадёт без уворота, а прикрывается только вторым', () => {
    const run = snatcherRun();
    // Пока руки в чужих карманах, уворота нет: это окно героя.
    expect(statusValue(run.battle!.enemies[0], 'evade')).toBe(0);
    passTurn(run);
    const stolen = run.battle!.stolenArtifact;
    expect(stolen).not.toBeNull();
    expect(socketRefs(run.hero).some((s) => s.art?.id === stolen!.id)).toBe(true); // из сокета пропадёт только после боя
    expect(statusValue(run.battle!.enemies[0], 'evade')).toBe(0); // «Мелькнуть» будет только следующим ходом
    passTurn(run);
    expect(statusValue(run.battle!.enemies[0], 'evade')).toBe(50);
  });

  it('тянет и персональный артефакт: неприкосновенных нет', () => {
    const run = snatcherRun(3, 'mage', []);
    const signature = heroDef('mage').signature;
    // У Мага на старте в сокете только Волшебная стрела — её и стянут.
    expect(run.battle!.hero.artifacts.map((a) => a.id)).toEqual([signature]);
    passTurn(run);
    expect(run.battle!.stolenArtifact?.id).toBe(signature);
    expect(run.battle!.hero.artifacts).toHaveLength(0); // приём пропал из боя сразу
  });

  it('удирает на пятый ход и уносит артефакт из сокета навсегда', () => {
    const run = snatcherRun();
    for (let i = 0; i < 5 && run.battle!.phase !== 'won'; i++) passTurn(run);
    const stolen = run.battle!.stolenArtifact!;
    expect(run.battle!.fled).toBe(true);
    finishBattle(run);
    expect(run.phase).toBe('event');
    expect(run.event).toMatchObject({ kind: 'gnome_art', result: 'fled', artifact: stolen });
    expect(socketRefs(run.hero).some((s) => s.art?.id === stolen.id)).toBe(false);
  });

  it('убитый оставляет артефакт на месте', () => {
    const run = snatcherRun();
    passTurn(run); // дать украсть
    const stolen = run.battle!.stolenArtifact!;
    run.battle!.enemies[0].hp = 0;
    run.battle!.enemies[0].statuses = [];
    battleAction(run, { type: 'attack', target: run.battle!.enemies[0].uid });
    finishBattle(run);
    expect(run.event).toMatchObject({ kind: 'gnome_art', result: 'slain', artifact: stolen });
    expect(socketRefs(run.hero).some((s) => s.art?.id === stolen.id)).toBe(true);
  });

  it('пустые сокеты — вор уходит ни с чем, ставки нет', () => {
    const run = newRun('warrior', 3, 0);
    for (const g of [run.hero.weapon, run.hero.armor]) g.slots = g.slots.map(() => null);
    run.roomIndex = 2;
    startEvent(run, 'gnome_art');
    const gold = run.gold;
    passTurn(run);
    expect(run.battle!.stolenArtifact).toBeNull();
    run.battle!.enemies[0].hp = 0;
    run.battle!.enemies[0].statuses = [];
    battleAction(run, { type: 'attack', target: run.battle!.enemies[0].uid });
    finishBattle(run);
    expect(run.event).toMatchObject({ kind: 'gnome_art', result: 'slain', artifact: null });
    expect(run.gold).toBe(gold);
  });
});
