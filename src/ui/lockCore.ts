import type { LockGrade } from '../engine/types';

// ─── Взлом сундука: время и засечки (v0.54.2) ────────────────────────────────
// Мини-игра «Штифты» (решение пользователя, вариант B прототипа): по кольцу скважины бежит отмычка, на кольце зона — узкая
// золотая в начале по ходу, бронзовая за ней. Тап в золоте — «отлично», в бронзе — «хорошо», мимо или не успели — срыв.
// Штифтов столько, сколько вещей в сундуке (`chestPins`): после каждой засечки отмычка разворачивается и ускоряется.
// Здесь только время и углы, без DOM: рисует chestLock.ts, итог уходит в движок `openChest(run, grades)`. Случайность —
// своя (Math.random по умолчанию): где стоит зона, решает интерфейс, поток RNG забега взлом не трогает.

/** Числа взлома — как в прототипе, который пользователь принял «как есть». Углы в градусах, 0 — верх, по часовой. */
export const LOCK = {
  /** Круг отмычки на первом штифте, мс. */
  lapMs: 1400,
  /** Вся зона («хорошо») и её золотое начало («отлично»): на первом круге 233 и 62 мс. */
  good: 60,
  great: 16,
  /** Отмычка стоит в начале, пока игрок видит зону. */
  readyMs: 450,
  /** Пауза после засечки: штифт встаёт, следующая зона уже видна. */
  pauseMs: 260,
  /** Отмычка вышла из зоны — срыв засчитывается с запасом: тап, отправленный до выхода, мог прийти после кадра анимации. */
  graceMs: 40,
  /** Ускорение на каждый следующий штифт. */
  speedup: 1.2,
  /** Где может встать зона: первая — во второй половине круга, следующие — впереди по ходу. */
  first: [120, 300] as [number, number],
  next: [110, 250] as [number, number],
};

export type LockPhase = 'ready' | 'run' | 'pause' | 'done';

export interface LockHit {
  grade: LockGrade;
  /** Отклонение от середины золотой зоны, мс: минус — рано, плюс — поздно; null — не успели. */
  ms: number | null;
}

export const norm = (a: number): number => ((a % 360) + 360) % 360;

/** Один взлом: состояние отмычки во времени. Время — `performance.now()` или `event.timeStamp` (одна шкала). */
export class LockRun {
  readonly pins: number;
  phase: LockPhase = 'ready';
  hits: LockHit[] = [];
  /** Направление хода: 1 — по часовой, −1 — против. */
  dir = 1;
  /** Отмычка стартует из `a0` в момент `t0` со скоростью `spd` (градусов в мс). */
  a0 = 0;
  t0 = 0;
  spd = 0;
  /** Начало зоны по ходу, её длина и золотая часть, градусы; `dist` — сколько ехать от `a0` до начала зоны. */
  zoneStart = 0;
  zoneLen = LOCK.good;
  greatLen = LOCK.great;
  dist = 0;
  /** Где отмычка остановилась на последней засечке и когда. */
  hitAngle = 0;
  hitAt = -Infinity;
  private until = 0;
  private mult = 1;
  private readonly rand: () => number;

  constructor(pins: number, now: number, rand: () => number = Math.random) {
    this.pins = Math.max(1, pins);
    this.rand = rand;
    this.until = now + LOCK.readyMs;
    this.zone(this.until, 0, LOCK.first);
  }

  /** Новая зона впереди по ходу; отмычка трогается из `a0` в `t0`. */
  private zone(t0: number, a0: number, [lo, hi]: [number, number]): void {
    this.t0 = t0;
    this.a0 = a0;
    this.dist = lo + this.rand() * (hi - lo);
    this.spd = (360 / LOCK.lapMs) * this.mult;
    this.zoneStart = norm(a0 + this.dir * this.dist);
  }

  /** Сколько градусов отмычка проехала от старта зоны к моменту `t`. */
  travelled(t: number): number {
    return this.spd * Math.max(0, t - this.t0);
  }

  angle(t: number): number {
    if (this.phase === 'pause' || this.phase === 'done') return this.hitAngle;
    return norm(this.a0 + this.dir * this.travelled(t));
  }

  /** Момент, когда отмычка выходит из зоны. */
  exitAt(): number {
    return this.t0 + (this.dist + this.zoneLen) / this.spd;
  }

  /** Номер текущего штифта с нуля. */
  get current(): number {
    return Math.min(this.hits.length, this.pins - 1);
  }

  /** Засечки взлома для движка — до первого срыва. */
  get grades(): LockGrade[] {
    return this.hits.map((h) => h.grade);
  }

  /** Худшая засечка: взлом «отличный», только если отличные все. */
  get worst(): LockGrade {
    const g = this.grades;
    return g.includes('miss') ? 'miss' : g.includes('good') ? 'good' : 'great';
  }

  /** Сдвинуть фазы ко времени `now`: старт после паузы, срыв, если отмычка ушла из зоны без тапа. */
  update(now: number): void {
    if ((this.phase === 'ready' || this.phase === 'pause') && now >= this.until) this.phase = 'run';
    if (this.phase === 'run' && now >= this.exitAt() + LOCK.graceMs) this.hit(this.exitAt() + LOCK.graceMs, true);
  }

  /** Тап в момент `t`; false — сейчас не принимается (отмычка ещё не тронулась, пауза, взлом окончен). */
  tap(t: number): boolean {
    this.update(t);
    if (this.phase !== 'run') return false;
    this.hit(t, false);
    return true;
  }

  private hit(t: number, timeout: boolean): void {
    const p = this.travelled(t) - this.dist;
    const grade: LockGrade = timeout ? 'miss' : p >= 0 && p < this.greatLen ? 'great' : p >= 0 && p < this.zoneLen ? 'good' : 'miss';
    this.hitAngle = norm(this.a0 + this.dir * this.travelled(t));
    this.hitAt = t;
    this.hits.push({ grade, ms: timeout ? null : (p - this.greatLen / 2) / this.spd });
    if (grade === 'miss' || this.hits.length >= this.pins) {
      this.phase = 'done';
      return;
    }
    this.phase = 'pause';
    this.until = t + LOCK.pauseMs;
    this.dir = -this.dir;
    this.mult *= LOCK.speedup;
    this.zone(this.until, this.hitAngle, LOCK.next);
  }
}
