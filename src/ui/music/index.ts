/**
 * Музыка в игре (docs/muzyka.md): трек текущей локации играет на всех экранах забега и сменяется плавным переходом,
 * когда меняется локация. Вне забега, на плашке гибели и на итогах — тишина.
 *
 * Трек рендерится целиком в Web Worker (worker.ts) и играет петлёй из готового буфера — без шва и без нагрузки
 * на главный поток во время боя. Готовых буферов держится два (текущая локация и следующая — её трек заказывается
 * к концу акта, как фон), каждый — около 20–25 МБ (44,1 кГц, 32-битный float, стерео, минута).
 *
 * Внутри всё по id трека — это id его локации.
 *
 * Браузер не даёт звуку начаться без жеста игрока, поэтому AudioContext создаётся на первом нажатии мыши или клавиши;
 * до этого `want` только запоминает, что играть, и заказывает рендер. Вкладка в фоне — звук на паузе.
 */
import type { LocationId } from '../../engine/types';
import { sharedAudio } from '../audio';
import { SONGS } from './songs';
import { renderSteps, type Rendered } from './synth';
import type { MusicReply } from './worker';

/** Вход трека и уход прошлого, с. */
const FADE_IN = 1.6;
const FADE_OUT = 1.2;
/** Сколько готовых треков держать в памяти. */
const KEEP = 2;
/** Без воркера рендер идёт кусками по столько миллисекунд между кадрами. */
const SLICE_MS = 8;

interface Playing {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: Playing | null = null;
  /** Что должно играть по экрану (App.render) и что задано отладкой `&music=…` поверх него — id треков. */
  private wanted: string | null = null;
  private forced: string | null = null;
  /** Готовые треки; порядок вставки — порядок давности. */
  private buffers = new Map<string, AudioBuffer>();
  private rendering = new Set<string>();
  /** undefined — ещё не создавали, null — воркеры недоступны (рендер кусками в главном потоке). */
  private worker: Worker | null | undefined;
  private volume = 0.5;
  private muted = false;
  /** Отладка `&music=off`: музыка выключена на эту страницу, профиль не трогается. */
  private disabled = false;

  /** Слушатели жеста и видимости вкладки — один раз за страницу. */
  install(): void {
    if (typeof window === 'undefined') return;
    // Жестом считаются не все события: старые iOS будят звук только на touchend и click, поэтому слушаем все.
    const unlock = (): void => this.unlock();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Громкость 0..1 и «выключено» — из профиля игрока. */
  setVolume(volume: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
    this.sync();
  }

  disable(): void {
    this.disabled = true;
    this.sync();
  }

  /** Отладка: играть на любом экране трек локации («crypt»); null — снова по экрану. */
  force(id: string | null): void {
    this.forced = id && id in SONGS ? SONGS[id as LocationId].id : null;
    this.sync();
  }

  /** Какую локацию играть сейчас; null — тишина. Зовётся на каждой перерисовке, повтор ничего не стоит. */
  want(loc: LocationId | null): void {
    const id = loc ? SONGS[loc].id : null;
    if (id === this.wanted) return;
    this.wanted = id;
    this.sync();
  }

  /** Заказать трек впрок (следующая локация к концу акта). */
  warm(loc: LocationId): void {
    if (!this.silent()) this.request(SONGS[loc].id);
  }

  /** Название играющего или ожидаемого трека — для паузы. */
  title(): string | null {
    const id = this.target() ?? this.forced ?? this.wanted;
    return id ? (SONGS[id as LocationId]?.title ?? null) : null;
  }

  private level(): number {
    // Громкость на слух растёт по квадрату: середина шкалы — четверть мощности.
    return this.silent() ? 0 : this.volume * this.volume;
  }

  private silent(): boolean {
    return this.disabled || this.muted || this.volume <= 0;
  }

  private target(): string | null {
    return this.silent() ? null : (this.forced ?? this.wanted);
  }

  /** Первый жест игрока: создать AudioContext (или разбудить его — iOS усыпляет контекст сам). */
  private unlock(): void {
    if (this.disabled) return;
    try {
      if (!this.ctx) {
        // Контекст общий со звуками действий (audio.ts): кто первым попросил на жесте, тот и создал.
        const ctx = sharedAudio();
        if (!ctx) {
          this.disabled = true;
          return;
        }
        this.ctx = ctx;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.level();
        this.master.connect(this.ctx.destination);
        this.sync();
      }
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
    } catch {
      // Звук недоступен (политика браузера, нет устройства) — играем молча.
      this.disabled = true;
    }
  }

  /** Привести звучащее к нужному: увести прошлый трек, завести новый, когда его буфер готов. */
  private sync(): void {
    const id = this.target();
    if (id) this.request(id);
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (this.current && this.current.id !== id) {
      const old = this.current;
      const now = ctx.currentTime;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
      old.src.stop(now + FADE_OUT + 0.05);
      this.current = null;
    }
    const buf = id ? this.buffers.get(id) : undefined;
    if (id && buf && !this.current) {
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE_IN);
      src.connect(gain).connect(this.master);
      src.start(now + 0.05);
      this.current = { id, src, gain };
    }
  }

  /** Заказать рендер трека, если его нет и он ещё не в работе. */
  private request(id: string): void {
    if (this.buffers.has(id) || this.rendering.has(id)) {
      // Трек нужен снова — он свежий, вытеснять его последним.
      const b = this.buffers.get(id);
      if (b) {
        this.buffers.delete(id);
        this.buffers.set(id, b);
      }
      return;
    }
    this.rendering.add(id);
    const w = this.workerOf();
    if (w) w.postMessage({ id });
    else this.renderHere(id);
  }

  private workerOf(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<MusicReply>) => this.done(ev.data.id, ev.data);
      w.onerror = () => {
        // Воркер не поднялся (старый браузер, файл не отдался) — всё, что было в работе, дорендерим здесь.
        this.worker = null;
        const pending = [...this.rendering];
        this.rendering.clear();
        for (const id of pending) this.request(id);
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  /** Без воркера: тот же рендер кусками по SLICE_MS между кадрами, чтобы не подвешивать экран. */
  private renderHere(id: string): void {
    const it = renderSteps(SONGS[id as LocationId]);
    const step = (): void => {
      const until = performance.now() + SLICE_MS;
      for (;;) {
        const r = it.next();
        if (r.done) {
          this.done(id, r.value);
          return;
        }
        if (performance.now() > until) break;
      }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  }

  /** Трек готов: каналы → AudioBuffer, лишние старые — из памяти. */
  private done(id: string, r: Pick<Rendered, 'sampleRate' | 'left' | 'right'>): void {
    this.rendering.delete(id);
    let buf: AudioBuffer;
    try {
      buf = new AudioBuffer({ length: r.left.length, numberOfChannels: 2, sampleRate: r.sampleRate });
    } catch {
      return;
    }
    buf.getChannelData(0).set(r.left);
    buf.getChannelData(1).set(r.right);
    this.buffers.set(id, buf);
    const keep = new Set([this.target(), this.current?.id, id]);
    for (const old of this.buffers.keys()) {
      if (this.buffers.size <= KEEP) break;
      if (!keep.has(old)) this.buffers.delete(old);
    }
    this.sync();
  }
}

/** Одна музыка на страницу. */
export const music = new Music();
