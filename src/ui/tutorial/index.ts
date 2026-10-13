import { h } from '../dom';
import { heroAvatar } from '../heroSprite';
import { saveRun } from '../save';
import { chestClosed, isRunOver } from '../../engine/run';
import type { GearInstance, RunState } from '../../engine/types';
import { THOUGHTS, thoughtView, turnSnap, type Finder, type Thought, type ThoughtCtx, type ThoughtView, type TurnSnap } from './thoughts';
import type { App } from '../app';

/**
 * Мысли героя в обучении (v0.58.0): очередь, облачко и подсветка. Облачко и рамки подсветки — свой слой поверх кадра:
 * он переезжает в новое дерево после каждой перерисовки (как слой анимаций боя), а рамки ставятся по месту узлов, которые
 * назвала мысль, — сами узлы экрана не трогаются, их анимации и стили остаются своими. Прочитанные мысли — в забеге
 * (`run.tutorial.seen`): обучение, продолженное из меню, не повторяет сказанного.
 */

const FRAME_W = 960;
const FRAME_H = 540;
/** Шаг опроса: мысли, которые зависят от времени («выдохся и стоит»), и срок жизни облачка. */
const TICK_MS = 250;
/** Пауза между двумя мыслями: облачко не сменяется другим в тот же миг. */
const GAP_MS = 450;
/** Сколько мыслей ждут своей очереди; лишние не теряются — придут, когда условие выполнится снова. */
const QUEUE_MAX = 2;
/** Срочная мысль (про удар в этот же ход) сменяет прежнюю, если та провисела хотя бы столько. */
const PREEMPT_MS = 2000;

/** Сколько облачко висит: время прочесть и найти глазами подсвеченное. Клик убирает раньше. */
function lifeMs(t: Thought): number {
  return Math.min(11000, Math.max(5500, 3500 + t.text.length * 55));
}

/**
 * Где стоит облачко на хабах (кадровые пиксели): между содержимым центра и консолью, чтобы не закрывать кнопки
 * и карточки, о которых думает герой. Числа — с кадров страницы обсуждения.
 */
const HUB_SPOT: Record<Exclude<ThoughtView, 'battle' | 'end'>, { x: number; y?: number; b?: number; w: number }> = {
  map: { x: 330, y: 150, w: 420 },
  pool: { x: 160, b: 357, w: 680 },
  reward: { x: 352, b: 357, w: 586 },
  placing: { x: 400, y: 160, w: 420 },
  shop: { x: 300, b: 357, w: 636 },
  event: { x: 18, y: 96, w: 290 },
  camp: { x: 486, y: 232, w: 450 },
};

function holds(t: Thought, c: ThoughtCtx): boolean {
  try {
    return t.when(c);
  } catch {
    return false;
  }
}

interface Shown {
  t: Thought;
  view: string;
  /** Когда появилось (performance.now) — от него идёт вспышка подсветки, сколько бы раз слой ни переезжал. */
  at: number;
  /** Сколько было видно: под паузой и листом персонажа облачко ждёт, а не тает. */
  shownFor: number;
  /** Облачко в бою уже поставлено над героем. */
  placed?: boolean;
}

export class Thinker {
  private layer = h('div', { class: 'thought-layer' });
  private boxes = h('div', { class: 'th-boxes' });
  private bubble: HTMLElement | null = null;
  private cur: Shown | null = null;
  private queue: { t: Thought; view: string }[] = [];
  private timer: number | null = null;
  private lastAt = 0;
  private gapUntil = 0;
  private view = '';
  private boxSig = '';
  /** Бой, ход героя в нём сейчас и в конце прошлого хода — для реакций на ход врагов. */
  private battleKey = '';
  private live: TurnSnap | null = null;
  private prev: TurnSnap | null = null;
  /** С какого момента в бою ничего не меняется. */
  private sig = '';
  private changedAt = 0;
  /** Броня прошлого опроса и последняя смена: оберег переезжает в новую. */
  private armor: GearInstance | null = null;
  private armorKey = '';
  private armorSwap: ThoughtCtx['armorSwap'] = null;

  constructor(private app: App) {
    this.layer.append(this.boxes);
  }

  /** После каждой перерисовки App: слой — в новое дерево, мысли — по новому состоянию. */
  afterRender(): void {
    if (!this.active()) return this.sleep();
    if (this.timer === null) this.timer = window.setInterval(() => this.update(), TICK_MS);
    const screen = this.app.root.firstElementChild;
    if (screen && this.layer.parentElement !== screen) screen.appendChild(this.layer);
    this.boxSig = '';
    this.update();
  }

  /** Обучение на экране и не закончено; итоги рисуют своё облачко сами (screens/end.ts). */
  private active(): RunState | null {
    const run = this.app.run;
    return this.app.screen === 'run' && run?.tutorial && !isRunOver(run) ? run : null;
  }

  private sleep(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.layer.remove();
    this.drop();
    this.queue = [];
    this.view = '';
    this.battleKey = '';
    this.live = this.prev = null;
    this.armor = null;
    this.armorKey = '';
    this.armorSwap = null;
  }

  /** Поверх кадра открыт другой слой: облачко прячется и ждёт, новые мысли не приходят. */
  private hidden(): boolean {
    const a = this.app;
    return a.sheetOpen || a.pauseOpen || a.notesOpen || !!a.chestLock || a.logOpen;
  }

  private update(): void {
    const run = this.active();
    if (!run) return this.sleep();
    const now = performance.now();
    const dt = this.lastAt ? Math.min(500, now - this.lastAt) : 0;
    this.lastAt = now;
    const ctx = this.track(run, now);
    const key = viewKey(run, ctx.view);
    if (key !== this.view) {
      this.view = key;
      this.queue = this.queue.filter((q) => q.view === key);
      if (this.cur && this.cur.view !== key) this.drop();
    }
    const hidden = this.hidden();
    this.layer.hidden = hidden;
    if (hidden) return;
    this.listen(ctx, key);
    if (this.cur) {
      this.cur.shownFor += dt;
      const next = this.queue[0];
      const preempt = !!next && (next.t.urgent || next.t.react) && !this.cur.t.urgent && !this.cur.t.react && this.cur.shownFor >= PREEMPT_MS;
      if (this.cur.shownFor >= lifeMs(this.cur.t) || preempt) this.drop(now);
    }
    if (!this.cur && now >= this.gapUntil) this.showNext(run, ctx, now);
    this.place(ctx);
  }

  /** Контекст условий: вид экрана, снимки ходов, простой боя, смена брони. */
  private track(run: RunState, now: number): ThoughtCtx {
    const view = thoughtView(run);
    const b = view === 'battle' ? run.battle : null;
    const bkey = b ? `${run.locationIndex}:${run.roomIndex}` : '';
    if (bkey !== this.battleKey) {
      this.battleKey = bkey;
      this.live = this.prev = null;
    }
    if (b && b.phase === 'player') {
      if (this.live && this.live.turn !== b.turn) this.prev = this.live;
      this.live = turnSnap(b);
    }
    const sig = b ? [b.phase, b.turn, b.hero.sta, b.hero.hp, b.hero.block, ...b.enemies.map((e) => `${e.uid}:${e.hp}`)].join('|') : view;
    if (sig !== this.sig) {
      this.sig = sig;
      this.changedAt = now;
    }
    const armor = run.hero.armor;
    const akey = `${armor.base}:${armor.tier}:${armor.name}`;
    if (this.armor && akey !== this.armorKey) this.armorSwap = { from: this.armor, to: armor };
    if (view === 'battle') this.armorSwap = null;
    this.armor = { ...armor, slots: [...armor.slots] };
    this.armorKey = akey;
    const app = this.app;
    return { run, view, armed: app.armed, armedTargets: app.armed ? app.armedTargets() : null, idleMs: now - this.changedAt, prev: this.prev, armorSwap: this.armorSwap };
  }

  /** Новые мысли в очередь: в порядке сценария, реакции и срочные — вперёд. */
  private listen(ctx: ThoughtCtx, key: string): void {
    const seen = new Set(ctx.run.tutorial!.seen);
    const busy = new Set(this.queue.map((q) => q.t.id));
    if (this.cur) busy.add(this.cur.t.id);
    for (const t of THOUGHTS) {
      if (seen.has(t.id) || busy.has(t.id)) continue;
      if (t.after && (!seen.has(t.after) || busy.has(t.after))) continue;
      if (!holds(t, ctx)) continue;
      const item = { t, view: key };
      // Реакция, срочное и «следом» — вперёд: продолжение мысли не ждёт за посторонней.
      if (t.react || t.urgent || t.after) this.queue.unshift(item);
      else if (this.queue.length < QUEUE_MAX) this.queue.push(item);
      else continue;
      busy.add(t.id);
      if (this.queue.length > QUEUE_MAX) busy.delete(this.queue.pop()!.t.id);
    }
  }

  /** Следующая мысль из очереди — если её повод ещё на экране. */
  private showNext(run: RunState, ctx: ThoughtCtx, now: number): void {
    while (this.queue.length) {
      const { t, view } = this.queue.shift()!;
      if (!holds(t, ctx)) continue;
      this.cur = { t, view, at: now, shownFor: 0 };
      run.tutorial!.seen.push(t.id);
      saveRun(run);
      const hub = ctx.view !== 'battle';
      const el = h(
        'div',
        {
          class: `th-bubble enter ${hub ? 'hub' : 'field'} ${t.react ? 'react' : ''}`.replace(/\s+/g, ' ').trim(),
          onclick: () => {
            this.drop(performance.now());
            this.update();
          },
        },
        hub ? heroAvatar(run.hero.defId, 44) : null,
        h('span', { class: 'th-text' }, t.text),
      );
      el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      this.bubble = el;
      this.layer.append(el);
      this.boxSig = '';
      return;
    }
  }

  /** Убрать облачко и подсветку; следующая мысль — после паузы. */
  private drop(now = 0): void {
    this.bubble?.remove();
    this.bubble = null;
    this.cur = null;
    this.boxes.replaceChildren();
    this.boxSig = '';
    if (now) this.gapUntil = now + GAP_MS;
  }

  /** Узлы экрана для подсветки мысли. */
  private finder(): Finder {
    const root = this.app.root;
    const all = (sel: string, from: ParentNode = root): Element[] => [...from.querySelectorAll(sel)];
    const cards = () => all('.run-center .cards > *');
    const within = (el: Element | undefined | null, sel?: string): Element[] => (el ? (sel ? all(sel, el) : [el]) : []);
    return {
      all: (sel) => all(sel),
      tile: (name) => all('.tiles .tile').filter((t) => t.querySelector('.tile-name')?.textContent === name),
      enemy: (uid, sel) => within(root.querySelector(`.enemy[data-uid="${uid}"]`), sel),
      card: (i, sel) => within(cards()[i], sel),
      cardRow: (i, word) => within(cards()[i], '.art-tbl-row').filter((r) => r.textContent?.includes(word)),
      button: (text) => all('button').filter((b) => b.textContent?.trim().startsWith(text)),
    };
  }

  /** Рамки подсветки и место облачка — в кадровых пикселях (кадр масштабируется целиком, main.ts). */
  private place(ctx: ThoughtCtx): void {
    const cur = this.cur;
    const bubble = this.bubble;
    if (!cur || !bubble) return;
    const fr = this.app.root.getBoundingClientRect();
    if (!fr.width) return;
    const k = FRAME_W / fr.width;
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: (r.left - fr.left) * k, y: (r.top - fr.top) * k, w: r.width * k, h: r.height * k };
    };

    let els: Element[] = [];
    try {
      els = cur.t.point?.(ctx, this.finder()) ?? [];
    } catch {
      els = [];
    }
    const boxes = els.map(rect).filter((r) => r.w > 0 && r.h > 0);
    const sig = boxes.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`).join(';');
    if (sig !== this.boxSig) {
      this.boxSig = sig;
      // Вспышка идёт от появления мысли: пересозданная рамка продолжает её с того же места, а не вспыхивает заново.
      const delay = `${Math.round(cur.at - performance.now())}ms`;
      this.boxes.replaceChildren(...boxes.map((r) => h('div', { class: 'th-box', style: `left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w + 6}px;height:${r.h + 6}px;animation-delay:${delay}` })));
    }

    if (ctx.view === 'battle') {
      // В бою — над героем, хвостиком к нему: выше значков блока и статусов. Место считается один раз на мысль: герой дышит
      // и покачивается, а облачко, бегущее за ним по пикселю, читать трудно.
      if (cur.placed) return;
      const sprite = this.app.root.querySelector('.hero-zone .sprite-wrap');
      if (!sprite) return;
      const s = rect(sprite);
      let top = s.y;
      const badges = this.app.root.querySelector('.hero-zone .badges');
      if (badges) {
        const r = rect(badges);
        if (r.h > 0) top = Math.min(top, r.y);
      }
      const cx = s.x + s.w / 2;
      const width = Math.min(bubble.offsetWidth || 300, 320);
      const left = Math.max(8, Math.min(FRAME_W - width - 8, cx - 36));
      Object.assign(bubble.style, { left: `${left}px`, top: '', bottom: `${FRAME_H - top + 10}px`, maxWidth: '300px' });
      bubble.style.setProperty('--tail', `${Math.round(cx - left - 6)}px`);
      cur.placed = true;
      return;
    }
    const spot = HUB_SPOT[ctx.view as keyof typeof HUB_SPOT];
    if (!spot) return;
    Object.assign(bubble.style, {
      left: `${spot.x}px`,
      top: spot.y !== undefined ? `${spot.y}px` : '',
      bottom: spot.b !== undefined ? `${FRAME_H - spot.b}px` : '',
      maxWidth: `${spot.w}px`,
    });
  }
}

/** Ключ экрана: сменился — мысли прошлого экрана в очереди больше не к месту. */
function viewKey(run: RunState, view: ThoughtView): string {
  switch (view) {
    // Ход — часть ключа: мысль про прошлый ход («выдохся», «сейчас кинутся») с новым ходом уходит, реакции приходят уже в новом;
    // конец боя — тоже: над плашкой победы или гибели старая мысль не висит.
    case 'battle': {
      const b = run.battle;
      return `battle:${run.locationIndex}:${run.roomIndex}:${b?.turn ?? 0}:${b?.phase === 'won' || b?.phase === 'lost' ? b.phase : ''}`;
    }
    case 'pool':
    case 'reward': {
      const screen = run.rewards[0];
      return `${view}:${run.roomIndex}:${run.rewards.length}:${screen?.source}:${screen?.rerolled ? 1 : 0}`;
    }
    case 'event':
      return `event:${run.roomIndex}:${chestClosed(run) ? 1 : 0}`;
    default:
      return `${view}:${run.roomIndex}`;
  }
}
