/**
 * Звуки действий в игре (docs/zvuki.md): все звуки каталога рендерятся один раз в Web Worker (worker.ts) — частые
 * первыми — и играют готовыми буферами через общий с музыкой AudioContext (audio.ts). Какой звук у какого действия —
 * cues.ts, точки вызова — App (app.ts).
 *
 * Звук приурочивается к удару: `play(id, { impact })` ставит его так, чтобы момент удара в звуке (`hit` из каталога)
 * пришёлся через `impact` мс — на кадр контакта клипа или попадание снаряда. Если замаха звука до удара уже не
 * хватает, звук начинается с середины замаха. Одинаковый звук в одно мгновение (вихрь по трём врагам, гибель двоих)
 * звучит не больше двух раз, второй тише, — иначе громкость складывается. Не готов (рендер ещё идёт) — молчит.
 *
 * Память: 75 звуков, стерео, 44,1 кГц float — около 45 МБ (хвосты зала обрезаны на −45 дБ, GAME_FLOOR_DB).
 */
import { sharedAudio } from '../audio';
import type { Cue } from './cues';
import type { SfxReply } from './worker';
import { SFX_VOLUME } from '../save';

export interface PlayOpts {
  /** Через сколько мс должен прозвучать удар звука; без него — звук с начала, сейчас (призыв, рёв, кнопка). */
  impact?: number;
  /** Не начинать с середины замаха: до удара не хватает — звук целиком с начала, удар придёт позже. */
  whole?: boolean;
  /** Зеркально по панораме: звук записан со стороны героя, а звучит у врага. */
  flip?: boolean;
  /** Громкость поверх уровня звука, 0..1. */
  gain?: number;
}

/** Одинаковый звук ближе этого, с, — «одновременно». */
const SAME_SEC = 0.06;
/** Больше стольких звуков разом не звучит: остальные молчат, а не копятся в хрип. */
const MAX_VOICES = 24;

interface Loaded {
  buf: AudioBuffer;
  hit: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Loaded>();
  private started = false;
  private volume = SFX_VOLUME;
  private muted = false;
  private disabled = false;
  /** Когда (время контекста) начинались звуки — для правила «не больше двух одинаковых разом». */
  private recent = new Map<string, number[]>();
  private voices = 0;
  /** Сколько звуков заказано с начала страницы: клик кнопки без своего звука щёлкает сам (App). */
  played = 0;
  /** Последние заказанные звуки — для отладки и Playwright (`mv.sfx.log`). */
  readonly log: { id: string; t: number; ready: boolean }[] = [];

  /** Слушатели жеста и видимости — один раз за страницу; рендер начинается сразу после разбора параметров страницы. */
  install(): void {
    if (typeof window === 'undefined') return;
    const unlock = (): void => this.unlock();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, true);
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
    // После main.ts: `&sfx=off` успевает выключить звуки до заказа рендера.
    window.setTimeout(() => this.start(), 0);
  }

  disable(): void {
    this.disabled = true;
  }

  /** Громкость 0..1 и «выключено» — из профиля игрока. Громкость на слух — по квадрату шкалы, как у музыки. */
  setVolume(volume: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.03);
    if (!this.silent()) this.start();
  }

  /** Готов ли звук (для тестов в браузере). */
  ready(id: string): boolean {
    return this.buffers.has(id);
  }

  /** Сыграть звук каталога по id; см. PlayOpts. */
  play(id: string, o: PlayOpts = {}): void {
    this.played++;
    const e = this.buffers.get(id);
    this.log.push({ id, t: Math.round(performance.now()), ready: !!e });
    if (this.log.length > 60) this.log.shift();
    const ctx = this.ctx;
    if (!e || !ctx || !this.master || this.silent() || ctx.state !== 'running') return;
    // Удар звука — через impact: звук начинается раньше на свой замах; не хватает — с середины замаха.
    let lead = o.impact === undefined ? 0 : o.impact / 1000 - e.hit;
    if (o.whole && lead < 0) lead = 0;
    const when = ctx.currentTime + Math.max(0, lead);
    const offset = Math.max(0, -lead);
    if (offset >= e.buf.duration) return;
    const times = (this.recent.get(id) ?? []).filter((t) => t > ctx.currentTime - 1);
    const same = times.filter((t) => Math.abs(t - when) < SAME_SEC).length;
    if (same >= 2 || this.voices >= MAX_VOICES) return;
    times.push(when);
    this.recent.set(id, times);
    const src = ctx.createBufferSource();
    src.buffer = e.buf;
    const gain = ctx.createGain();
    gain.gain.value = (o.gain ?? 1) * (same ? 0.55 : 1);
    let out: AudioNode = src;
    if (o.flip) {
      // Зеркало: левый канал в правый и наоборот — снаряд врага летит справа налево.
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      src.connect(split);
      split.connect(merge, 0, 1);
      split.connect(merge, 1, 0);
      out = merge;
    }
    out.connect(gain).connect(this.master);
    src.start(when, offset);
    this.voices++;
    src.onended = () => {
      this.voices--;
      gain.disconnect();
    };
  }

  /** Сыграть набор звуков (cues.ts). */
  cues(list: Cue[]): void {
    for (const c of list) this.play(c.id, c);
  }

  private level(): number {
    return this.silent() ? 0 : this.volume * this.volume;
  }

  private silent(): boolean {
    return this.disabled || this.muted || this.volume <= 0;
  }

  /** Первый жест игрока: контекст (общий с музыкой) и своя шина громкости. */
  private unlock(): void {
    if (this.disabled) return;
    try {
      if (!this.ctx) {
        const ctx = sharedAudio();
        if (!ctx) {
          this.disabled = true;
          return;
        }
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.level();
        this.master.connect(ctx.destination);
      }
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
    } catch {
      this.disabled = true;
    }
  }

  /**
   * Заказать рендер всех звуков воркеру — один раз и только если звуки не выключены. Без воркера звуков нет: рендер
   * в главном потоке стоил бы секунд подвисания, а музыка без воркера и так рендерится там кусками.
   */
  private start(): void {
    if (this.started || this.silent()) return;
    this.started = true;
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<SfxReply>) => this.done(ev.data);
      w.onerror = () => w.terminate();
      w.postMessage('start');
    } catch {
      // Воркер не поднялся — играем молча.
    }
  }

  private done(r: SfxReply): void {
    try {
      const buf = new AudioBuffer({ length: r.left.length, numberOfChannels: 2, sampleRate: r.sampleRate });
      buf.getChannelData(0).set(r.left);
      buf.getChannelData(1).set(r.right);
      this.buffers.set(r.id, { buf, hit: r.hit });
    } catch {
      // Старый браузер без конструктора AudioBuffer — этот звук молчит.
    }
  }
}

/** Одни звуки на страницу. */
export const sfx = new Sfx();
