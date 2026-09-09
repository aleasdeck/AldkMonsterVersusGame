import { h } from './dom';
import type { BattleEvent, GearKind, LocationId, PlayerAction, RunState } from '../engine/types';
import * as R from '../engine/run';
import { STATUS_NAMES, canUseAction } from '../engine/combat';
import { claimChest, clearRun, loadProfile, loadRun, recordEnemies, recordResult, saveRun, type Profile } from './save';
import { rollCollectible } from '../data/collection';
import { HERO_LIST } from '../data/heroes';
import { createRng } from '../engine/rng';
import { menuScreen } from './screens/menu';
import { heroSelectScreen } from './screens/heroSelect';
import { mapScreen } from './screens/map';
import { battleScreen } from './screens/battle';
import { rewardScreen } from './screens/reward';
import { eventScreen } from './screens/event';
import { shopScreen } from './screens/shop';
import { campScreen } from './screens/camp';
import { endScreen } from './screens/end';
import { collectionScreen } from './screens/collection';
import { bestiaryScreen } from './screens/bestiary';
import { SPIN_MS, buildStrip, chestScreen, type ChestState } from './screens/chest';
import { hideTooltip, installTooltips } from './tooltip';
import { formatClock } from './topbar';
import { heroSheet } from './screens/heroSheet';
import { pauseMenu } from './screens/pause';
import { installHotkeys } from './hotkeys';

const ENEMY_STEP_MS = 600;
const FLOAT_MS = 900;

export class App {
  root: HTMLElement;
  run: RunState | null = null;
  screen: 'menu' | 'heroSelect' | 'run' | 'collection' | 'bestiary' | 'chest' = 'menu';
  /** Выбранная цель в бою (uid врага). */
  target: number | null = null;
  /** Идёт ход врагов — кнопки заблокированы. */
  busy = false;
  /** Лог боя раскрыт вместо плиток приёмов. Сбрасывается по концу боя. */
  logOpen = false;
  /** Открыт оверлей «Персонаж». Живёт только в App, не сохраняется. */
  sheetOpen = false;
  /** Открыта пауза. */
  pauseOpen = false;
  profile: Profile;
  /** Состояние крутки сундука; null — сундук ещё не открыт. */
  chest: ChestState | null = null;
  /** Герой, подсвеченный в сетке выбора: справа показано его превью. */
  heroPick: string = HERO_LIST[0].id;
  /** Текст поля «Сид» на экране выбора — переживает перерисовку при клике по плитке. */
  seedText = '';
  /** Вкладка-локация и выбранная запись в бестиарии. */
  bestiaryLoc: LocationId = 'forest';
  bestiaryPick: string | null = null;
  private stepTimer: number | null = null;
  /** Тикает раз в секунду и пишет время забега в топбар напрямую, без перерисовки. */
  private clockTimer: number | null = null;
  private spinTimer: number | null = null;
  private resultRecorded = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.profile = loadProfile();
    installTooltips(root);
    installHotkeys(this);
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
    this.noteEnemies();
    let el: HTMLElement;
    if (this.screen === 'heroSelect') el = heroSelectScreen(this);
    else if (this.screen === 'collection') el = collectionScreen(this);
    else if (this.screen === 'bestiary') el = bestiaryScreen(this);
    else if (this.screen === 'chest') el = chestScreen(this);
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
        case 'shop':
          el = shopScreen(this);
          break;
        case 'camp':
          el = campScreen(this);
          break;
        default:
          el = endScreen(this);
      }
    }
    // Оверлеи рисуются той же перерисовкой из состояния App: ход врагов по таймеру их не снесёт,
    // а клики по полю и плиткам под ними не проходят.
    if (this.screen === 'run' && this.run && !R.isRunOver(this.run)) {
      if (this.sheetOpen) el.appendChild(heroSheet(this));
      else if (this.pauseOpen) el.appendChild(pauseMenu(this));
    }
    hideTooltip();
    this.root.replaceChildren(el);
    this.syncClock();
  }

  /**
   * Каждый враг, показавшийся в бою, открывается в бестиарии — призванные и отделившиеся тоже.
   * Проверка при каждой перерисовке: любое появление врага на поле проходит через render().
   */
  private noteEnemies(): void {
    const enemies = this.run?.battle?.enemies;
    if (!enemies) return;
    const fresh = enemies.map((e) => e.defId).filter((id, i, all) => !this.profile.bestiary.includes(id) && all.indexOf(id) === i);
    if (fresh.length) this.profile = recordEnemies(fresh);
  }

  // ─── Таймер забега ───────────────────────────────────────────────────────

  /** Сколько идёт забег, мс. Законченный — до момента конца. */
  runElapsed(): number {
    const s = this.run?.stats;
    if (!s?.startedAt) return 0;
    return (s.finishedAt || Date.now()) - s.startedAt;
  }

  /** Таймер живёт только на экранах забега; в меню и на итогах останавливается. */
  private syncClock(): void {
    const active = this.screen === 'run' && !!this.run && !R.isRunOver(this.run);
    if (active && this.clockTimer === null) {
      this.clockTimer = window.setInterval(() => {
        const el = this.root.querySelector('.run-clock');
        if (el) el.textContent = `⏱ ${formatClock(this.runElapsed())}`;
      }, 1000);
    } else if (!active && this.clockTimer !== null) {
      window.clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  // ─── Оверлеи ─────────────────────────────────────────────────────────────

  toggleSheet(): void {
    this.sheetOpen = !this.sheetOpen;
    this.pauseOpen = false;
    this.render();
  }

  togglePause(): void {
    this.pauseOpen = !this.pauseOpen;
    this.sheetOpen = false;
    this.render();
  }

  /** Из паузы — к логу боя: пауза закрывается, лог раскрывается. */
  toggleLogFromPause(): void {
    this.pauseOpen = false;
    this.toggleLog();
  }

  /** Esc: закрыть верхний слой, а если слоёв нет — открыть паузу. */
  escape(): void {
    if (this.sheetOpen) this.toggleSheet();
    else if (this.pauseOpen) this.togglePause();
    else if (this.logOpen && this.run?.phase === 'battle') this.toggleLog();
    else this.togglePause();
  }

  private overlayOpen(): boolean {
    return this.sheetOpen || this.pauseOpen;
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
        this.run.stats.finishedAt = Date.now();
        this.profile = recordResult(this.run);
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
    this.stopSpin();
    this.chest = null;
    this.sheetOpen = false;
    this.pauseOpen = false;
    if (this.run && R.isRunOver(this.run)) this.run = null;
    this.screen = 'menu';
    this.render();
  }

  showHeroSelect(): void {
    this.stopStepping();
    this.stopSpin();
    this.chest = null;
    if (this.run && R.isRunOver(this.run)) this.run = null;
    this.screen = 'heroSelect';
    this.render();
  }

  selectHero(id: string): void {
    this.heroPick = id;
    this.render();
  }

  showCollection(): void {
    this.stopSpin();
    this.chest = null;
    this.screen = 'collection';
    this.render();
  }

  showBestiary(loc?: LocationId): void {
    this.stopSpin();
    this.chest = null;
    if (loc) this.bestiaryLoc = loc;
    this.screen = 'bestiary';
    this.render();
  }

  bestiarySelect(id: string): void {
    this.bestiaryPick = id;
    this.render();
  }

  showChest(): void {
    this.stopSpin();
    this.chest = null;
    this.screen = 'chest';
    this.render();
  }

  /** Списывает сундук, сразу записывает находку и запускает прокрутку ленты. */
  openChest(): void {
    if (this.profile.chests <= 0) return;
    const rng = createRng(R.randomSeed());
    const prize = rollCollectible(rng, this.profile.collection);
    if (!prize) return;
    this.stopSpin();
    this.profile = claimChest(prize);
    this.chest = buildStrip(rng, prize);
    this.screen = 'chest';
    this.render();
    this.spinTimer = window.setTimeout(() => {
      this.spinTimer = null;
      this.finishSpin();
    }, SPIN_MS);
  }

  skipSpin(): void {
    this.stopSpin();
    this.finishSpin();
  }

  private finishSpin(): void {
    if (!this.chest || this.chest.phase === 'done') return;
    this.chest.phase = 'done';
    this.render();
  }

  private stopSpin(): void {
    if (this.spinTimer !== null) window.clearTimeout(this.spinTimer);
    this.spinTimer = null;
  }

  newRun(heroId: string, seed?: number): void {
    this.stopSpin();
    this.chest = null;
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
    this.sheetOpen = false;
    this.pauseOpen = false;
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
    // Под оверлеем ход врагов стоит: ждём, пока игрок закроет персонажа или паузу.
    if (this.overlayOpen()) {
      this.scheduleStep();
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

  toggleLog(): void {
    this.logOpen = !this.logOpen;
    this.render();
  }

  finishBattle(): void {
    if (!this.run) return;
    R.finishBattle(this.run);
    this.target = null;
    this.logOpen = false;
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

  rerollReward(): void {
    if (!this.run) return;
    if (R.rerollReward(this.run)) this.commit();
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

  // Событие: сундук, алтарь, кузнец. Каждый выбор либо ведёт к следующей клетке, либо открывает выбор слота.
  leaveEvent(): void {
    if (!this.run) return;
    R.leaveEvent(this.run);
    this.afterPhaseChange();
  }

  takeChest(): void {
    if (!this.run) return;
    R.takeChest(this.run);
    this.afterPhaseChange();
  }

  altarPray(): void {
    if (!this.run) return;
    R.altarPray(this.run);
    this.afterPhaseChange();
  }

  altarSacrifice(): void {
    if (!this.run) return;
    if (R.altarSacrifice(this.run)) this.afterPhaseChange();
  }

  forgeUpgrade(kind: GearKind): void {
    if (!this.run) return;
    if (R.forgeUpgrade(this.run, kind)) this.afterPhaseChange();
  }

  // ─── Магазин ─────────────────────────────────────────────────────────────

  shopHeal(): void {
    if (!this.run) return;
    if (R.shopHeal(this.run)) this.commit();
  }

  shopBuyGear(): void {
    if (!this.run) return;
    if (R.shopBuyGear(this.run)) this.afterPhaseChange();
  }

  shopBuyArtifact(): void {
    if (!this.run) return;
    if (R.shopBuyArtifact(this.run)) this.afterPhaseChange();
  }

  shopBuyPotion(): void {
    if (!this.run) return;
    if (R.shopBuyPotion(this.run)) this.commit();
  }

  shopReroll(): void {
    if (!this.run) return;
    if (R.shopReroll(this.run)) this.commit();
  }

  leaveShop(): void {
    if (!this.run) return;
    R.leaveShop(this.run);
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
          wrap.closest('.enemy, .ally')?.classList.add('acting');
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
