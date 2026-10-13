import { describe, expect, it } from 'vitest';
import { awaitsFocus, battleAction, battleEndTurn, battleEnemyStep, chooseRewardFocus, enterRoom, finishBattle, isRunOver, leaveEvent, newRun, openChest, takeReward } from '../src/engine/run';
import { canUseAction } from '../src/engine/combat';
import { TUTORIAL_HERO, TUTORIAL_SIGNATURE, TUTORIAL_TRAIT } from '../src/data/tutorial';
import type { GearInstance, PlayerAction } from '../src/engine/types';
import { THOUGHTS, thoughtView, turnSnap, type ThoughtCtx, type TurnSnap } from '../src/ui/tutorial/thoughts';
import { chooseCamp, chooseEventRoom, chooseReward, planTurn, resolvePending, shopVisit } from './sim/bot';

/**
 * Мысли обучения (v0.58.0) на прогонах умного бота: условие каждой мысли хоть раз выполняется — иначе её триггер мёртвый
 * (страница обсуждения, «Как устроить»). Контекст собирается так же, как в контроллере (ui/tutorial/index.ts): снимки хода
 * героя, смена брони; «выбранный удар» и «выдохся и стоит» бот изображает перед ударом и перед концом хода.
 */

/** Мысли, которые очередь не показывает: облачко итогов стоит на экране само. */
const STATIC = new Set(['z1', 'x6']);

/**
 * Новичок, которого бот не изображает: срывает замок, не закрывается от Разгона кабана, берёт оберег за волков, а у медведя —
 * латы. Реакции на его ошибки и «оберег переехал в латы» иначе на прогонах умного бота не случаются.
 */
function playTutorial(seed: number, fired: Set<string>, novice = false): void {
  const run = newRun(TUTORIAL_HERO, seed, 0, TUTORIAL_SIGNATURE, TUTORIAL_TRAIT, { tutorial: true, locked: [] });
  let battleKey = '';
  let live: TurnSnap | null = null;
  let prev: TurnSnap | null = null;
  const copy = (g: GearInstance) => ({ ...g, slots: [...g.slots] });
  let armor = copy(run.hero.armor);
  let armorSwap: ThoughtCtx['armorSwap'] = null;

  const look = (extra: Partial<ThoughtCtx> = {}) => {
    const view = thoughtView(run);
    const b = view === 'battle' ? run.battle : null;
    const key = b ? `${run.roomIndex}` : '';
    if (key !== battleKey) {
      battleKey = key;
      live = prev = null;
    }
    if (b && b.phase === 'player') {
      if (live && live.turn !== b.turn) prev = live;
      live = turnSnap(b);
    }
    const cur = run.hero.armor;
    if (cur.base !== armor.base || cur.tier !== armor.tier || cur.name !== armor.name) armorSwap = { from: armor, to: cur };
    if (view === 'battle') armorSwap = null;
    armor = copy(cur);
    const ctx: ThoughtCtx = { run, view, armed: null, armedTargets: null, idleMs: 0, prev, armorSwap, ...extra };
    for (const t of THOUGHTS) if (t.when(ctx)) fired.add(t.id);
  };

  const battle = (): void => {
    let lastTurn = -1;
    let plan: { actions: PlayerAction[]; alive: number[] } = { actions: [], alive: [] };
    let step = 0;
    let guard = 0;
    while (run.battle && run.battle.phase !== 'won' && run.battle.phase !== 'lost' && guard++ < 400) {
      const b = run.battle;
      if (b.phase !== 'player') {
        battleEnemyStep(run);
        look();
        continue;
      }
      if (b.turn !== lastTurn) {
        lastTurn = b.turn;
        look();
        plan = planTurn(b, run.rng);
        step = 0;
      }
      // Новичок стоит столбом, пока кабан не разгонится: бот убивает его раньше, чем тот дойдёт до Разгона.
      if (novice && run.roomIndex === 3 && b.enemies.some((e) => e.defId === 'boar') && b.turn <= 4) {
        battleEndTurn(run);
        look();
        continue;
      }
      if (step >= plan.actions.length) {
        look({ idleMs: 3000 });
        battleEndTurn(run);
        look();
        continue;
      }
      const a = plan.actions[step];
      if (canUseAction(b, a) !== null) {
        plan = planTurn(b, run.rng);
        step = 0;
        if (plan.actions.length === 0) battleEndTurn(run);
        continue;
      }
      if (a.type === 'attack') look({ armed: 'attack', armedTargets: b.enemies.filter((e) => canUseAction(b, { type: 'attack', target: e.uid }) === null).map((e) => e.uid) });
      battleAction(run, a);
      step++;
      look();
      if (run.battle && run.battle.phase === 'player' && run.battle.enemies.length !== plan.alive[step - 1]) {
        plan = planTurn(run.battle, run.rng);
        step = 0;
      }
    }
    look();
    finishBattle(run);
  };

  let guard = 0;
  while (!isRunOver(run) && guard++ < 400) {
    look();
    if (run.pending) {
      resolvePending(run);
      continue;
    }
    switch (run.phase) {
      case 'map':
        enterRoom(run);
        break;
      case 'battle':
        battle();
        break;
      case 'reward': {
        // Пул по очереди, а не по боту: иначе на одной клетке всегда один и тот же пул, и карточки другого не видно никогда.
        if (awaitsFocus(run.rewards[0])) {
          chooseRewardFocus(run, novice || (seed + run.roomIndex) % 2 ? 'defense' : 'attack');
          break;
        }
        const pick = novice ? (run.rewards[0]?.options ?? []).findIndex((o) => (o.kind === 'artifact' && o.artifact.id === 'mana_shield') || (o.kind === 'gear' && o.gear.base === 'plate' && o.gear.tier === 3)) : -1;
        if (pick >= 0) takeReward(run, pick);
        else chooseReward(run);
        break;
      }
      case 'event':
        if (novice && run.event?.kind === 'chest' && !run.event.opened && !run.event.jammed) {
          openChest(run, ['miss']);
          look();
          leaveEvent(run);
        } else chooseEventRoom(run);
        break;
      case 'shop':
        shopVisit(run);
        break;
      case 'camp':
        chooseCamp(run);
        break;
    }
  }
  look();
}

describe('мысли обучения (v0.58.0)', () => {
  it('у каждой мысли свой id и текст', () => {
    const ids = THOUGHTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(63);
    for (const t of THOUGHTS) expect(t.text.length).toBeGreaterThan(10);
    // «Следом» — только за мыслью, которая есть в списке раньше.
    for (const t of THOUGHTS) if (t.after) expect(ids.indexOf(t.after)).toBeLessThan(ids.indexOf(t.id));
  });

  it('условие каждой мысли срабатывает на прогонах бота', () => {
    const fired = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) playTutorial(seed, fired);
    for (let seed = 1; seed <= 4; seed++) playTutorial(seed, fired, true);
    const dead = THOUGHTS.map((t) => t.id).filter((id) => !STATIC.has(id) && !fired.has(id));
    expect(dead).toEqual([]);
  }, 120_000);
});
