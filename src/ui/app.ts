import { h } from './dom';
import type { BattleEvent, GearKind, PlayerAction, RunState } from '../engine/types';
import * as R from '../engine/run';
import { STATUS_NAMES, canUseAction } from '../engine/combat';
import { clearRun, loadBest, loadRun, recordResult, saveRun, type BestRecord } from './save';
import { menuScreen } from './screens/menu';
import { heroSelectScreen } from './screens/heroSelect';
import { mapScreen } from './screens/map';
import { battleScreen } from './screens/battle';
import { rewardScreen } from './screens/reward';
import { eventScreen } from './screens/event';
import { campScreen } from './screens/camp';
import { endScreen } from './screens/end';

const ENEMY_STEP_MS = 600;
const FLOAT_MS = 900;

export class App {
  root: HTMLElement;
  run: RunState | null = null;
  screen: 'menu' | 'heroSelect' | 'run' = 'menu';
  /** Выбранная цель в бою (uid врага). */
  target: number | null = null;
  /** Идёт ход врагов — кнопки заблокированы. */
  busy = false;
  best: BestRecord;
  private stepTimer: number | null = null;
  private resultRecorded = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.best = loadBest();
  }

  start(): void {
    this.run = loadRun();
    if (this.run && R.isRunOver(this.run)) {
      clearRun();
      this.run = null;
    }
    // Сохранение посреди хода врагов — доигрываем его при загрузке.
    if (this.run?.battle?.phase === 'enemy') {
      let guard = 0;
      while (this.run.battle.phase === 'enemy' && guard++ < 50) R.battleEnemyStep(this.run);
      this.run.battle.events = [];
    }
    this.screen = 'menu';
    this.render();
  }

  hasSave(): boolean {
    return !!this.run && !R.isRunOver(this.run);
  }

  render(): void {
    let el: HTMLElement;
    if (this.screen === 'heroSelect') el = heroSelectScreen(this);
    else if (this.screen === 'menu' || !this.run) el = menuScreen(this);
    else {
      switch (this.run.phase) {
        case 'map':
          el = mapScreen(this);
          break;
        case 'battle':
          el = battleScreen(this);
          break;
        case 'reward':
          el = rewardScreen(this);
          break;
        case 'event':
          el = eventScreen(this);
          break;
        case 'camp':
          el = campScreen(this);
          break;
        default:
          el = endScreen(this);
      }
    }
    this.root.replaceChildren(el);
  }

  private commit(): void {
    if (this.run && !R.isRunOver(this.run)) saveRun(this.run);
    this.render();
  }

  /** Забег закончился — записать результат, снести сохранение. */
  private afterPhaseChange(): void {
    if (this.run && R.isRunOver(this.run)) {
      if (!this.resultRecorded) {
        this.resultRecorded = true;
        this.best = recordResult(this.run);
      }
      clearRun();
      this.render();
      return;
    }
    this.commit();
  }

  // ─── Навигация ───────────────────────────────────────────────────────────

  showMenu(): void {
    this.stopStepping();
    if (this.run && R.isRunOver(this.run)) this.run = null;
    this.screen = 'menu';
    this.render();
  }

  showHeroSelect(): void {
    this.stopStepping();
    if (this.run && R.isRunOver(this.run)) this.run = null;
    this.screen = 'heroSelect';
    this.render();
  }

  newRun(heroId: string, seed?: number): void {
    this.run = R.newRun(heroId, seed);
    this.target = null;
    this.resultRecorded = false;
    this.screen = 'run';
    this.commit();
  }

  continueRun(): void {
    if (!this.hasSave()) return;
    this.screen = 'run';
    this.resultRecorded = false;
    this.render();
  }

  abandonRun(): void {
    if (!this.run) return;
    if (!window.confirm('Бросить текущий забег? Прогресс пропадёт.')) return;
    this.stopStepping();
    clearRun();
    this.run = null;
    this.showMenu();
  }

  // ─── Комнаты ─────────────────────────────────────────────────────────────

  enterRoom(): void {
    if (!this.run) return;
    R.enterRoom(this.run);
    this.target = null;
    this.commit();
  }

  // ─── Бой ─────────────────────────────────────────────────────────────────

  currentTarget(): number {
    const b = this.run?.battle;
    if (!b) return -1;
    if (this.target !== null && b.enemies.some((e) => e.uid === this.target)) return this.target;
    return b.enemies[0]?.uid ?? -1;
  }

  selectTarget(uid: number): void {
    this.target = uid;
    this.render();
  }

  battleAction(action: PlayerAction): void {
    const run = this.run;
    if (!run?.battle || this.busy) return;
    if (canUseAction(run.battle, action)) return;
    R.battleAction(run, action);
    const events = run.battle.events.splice(0);
    this.commit();
    this.playEvents(events);
  }

  endTurn(): void {
    const run = this.run;
    if (!run?.battle || this.busy || run.battle.phase !== 'player') return;
    R.battleEndTurn(run);
    this.busy = true;
    this.render();
    this.scheduleStep();
  }

  private scheduleStep(): void {
    this.stepTimer = window.setTimeout(() => this.step(), ENEMY_STEP_MS);
  }

  private step(): void {
    this.stepTimer = null;
    const run = this.run;
    if (!run?.battle) {
      this.busy = false;
      return;
    }
    R.battleEnemyStep(run);
    const events = run.battle.events.splice(0);
    if (run.battle.phase === 'enemy') {
      this.render();
      this.playEvents(events);
      this.scheduleStep();
    } else {
      this.busy = false;
      saveRun(run);
      this.render();
      this.playEvents(events);
    }
  }

  private stopStepping(): void {
    if (this.stepTimer !== null) window.clearTimeout(this.stepTimer);
    this.stepTimer = null;
    this.busy = false;
  }

  finishBattle(): void {
    if (!this.run) return;
    R.finishBattle(this.run);
    this.target = null;
    this.afterPhaseChange();
  }

  // ─── Награды, события, привал ────────────────────────────────────────────

  takeReward(index: number): void {
    if (!this.run) return;
    R.takeReward(this.run, index);
    this.afterPhaseChange();
  }

  skipReward(): void {
    if (!this.run) return;
    R.skipReward(this.run);
    this.afterPhaseChange();
  }

  pendingPlace(kind: GearKind, index: number): void {
    if (!this.run) return;
    R.pendingPlace(this.run, kind, index);
    this.afterPhaseChange();
  }

  pendingDiscard(): void {
    if (!this.run) return;
    R.pendingDiscard(this.run);
    this.afterPhaseChange();
  }

  pendingCancel(): void {
    if (!this.run) return;
    R.pendingCancel(this.run);
    this.render();
  }

  chooseEvent(id: string): void {
    if (!this.run) return;
    R.chooseEvent(this.run, id);
    this.afterPhaseChange();
  }

  campRest(): void {
    if (!this.run) return;
    R.campRest(this.run);
    this.afterPhaseChange();
  }

  campForge(kind: GearKind, index: number): void {
    if (!this.run) return;
    R.campForge(this.run, kind, index);
    this.afterPhaseChange();
  }

  // ─── Анимация событий боя ────────────────────────────────────────────────

  private spriteWrap(target: 'hero' | number): HTMLElement | null {
    const sel = target === 'hero' ? '.hero-zone .sprite-wrap' : `[data-uid="${target}"] .sprite-wrap`;
    return this.root.querySelector<HTMLElement>(sel);
  }

  playEvents(events: BattleEvent[]): void {
    const counters = new Map<string, number>();
    for (const ev of events) {
      if (ev.type === 'log') continue;
      const wrap = this.spriteWrap(ev.target);
      if (!wrap) continue;
      const key = String(ev.target);
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      let text = '';
      let cls = '';
      switch (ev.type) {
        case 'damage':
          if (ev.kind === 'blocked') {
            text = 'блок';
            cls = 'f-block';
          } else {
            text = ev.kind === 'crit' ? `−${ev.amount} крит!` : `−${ev.amount}`;
            cls = ev.kind === 'crit' ? 'f-crit' : ev.kind === 'dot' ? 'f-dot' : 'f-dmg';
            shake(wrap);
          }
          break;
        case 'heal':
          text = `+${ev.amount}`;
          cls = 'f-heal';
          break;
        case 'block':
          text = `+${ev.amount} ⛨`;
          cls = 'f-shield';
          break;
        case 'status':
          text = STATUS_NAMES[ev.status];
          cls = 'f-status';
          break;
        case 'enemyAction':
          text = ev.name;
          cls = 'f-action';
          wrap.closest('.enemy')?.classList.add('acting');
          break;
        case 'stunned':
          text = 'оглушён';
          cls = 'f-status';
          break;
        case 'summon':
          text = 'появляется';
          cls = 'f-status';
          break;
        default:
          continue;
      }
      floatText(wrap, text, cls, n);
    }
  }
}

function shake(el: HTMLElement): void {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function floatText(wrap: HTMLElement, text: string, cls: string, index: number): void {
  const el = h('div', { class: `float ${cls}`, style: `top:${-8 - index * 20}px` }, text);
  wrap.appendChild(el);
  window.setTimeout(() => el.remove(), FLOAT_MS);
}
