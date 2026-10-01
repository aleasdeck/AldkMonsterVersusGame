/**
 * Синтезатор музыки локаций без DOM (docs/muzyka.md). Звук — в духе 32-битных приставок (PS1, Saturn): CD-частота
 * 44,1 кГц и 32-битные float-отсчёты без урезания разрядности, щипковые струны по Карплусу — Стронгу (лютня, арфа, цимбалы),
 * хоры и духовые с формантными фильтрами, струнные и медь хорусом из нескольких голосов, резонансный фильтр, органные
 * таблицы, FM-колокола и гонги, ударные-сэмплы и большой зал — реверберация (как у звукового процессора PS1) плюс эхо.
 *
 * Трек — бесшовная петля: хвосты нот, эха и реверберации с конца петли заворачиваются в её начало, поэтому
 * `loop = true` у источника не щёлкает на стыке. Один и тот же код рендерит в игре (Web Worker, worker.ts) и в инструменте
 * tools/music-render.mjs. Случайность (шум, фазы хоруса, возбуждение струн) — свой детерминированный генератор:
 * трек всегда звучит одинаково.
 */
import type { LocationId } from '../../engine/types';
import { freqOf, type Seq } from './score';

export const SAMPLE_RATE = 44100;

/** Огибающая громкости: атака и спад в секундах, уровень удержания 0..1, отпускание в секундах. */
export interface Env {
  a: number;
  d: number;
  s: number;
  r: number;
}

/** Форманта — полосовой фильтр: частота Гц (до 16 — во столько раз выше частоты ноты), добротность, громкость. */
export type Formant = [freq: number, q: number, gain: number];

export interface Instrument {
  /**
   * pulse — прямоугольник со скважностью, saw — пила, tri — треугольник, sine, fm — два оператора, table — органная таблица
   * гармоник, noise — шум (с формантой на частоте ноты — свист ветра), pluck — струна Карплуса — Стронга.
   */
  wave: 'pulse' | 'saw' | 'tri' | 'sine' | 'fm' | 'table' | 'noise' | 'pluck';
  /** Скважность прямоугольника 0..1 (0.5 — меандр). */
  duty?: number;
  /** Качание скважности: частота Гц и размах. */
  pwm?: { rate: number; depth: number };
  /** FM: частота модулятора к частоте ноты, индекс в начале и в конце, время перехода с, обратная связь модулятора. */
  ratio?: number;
  index?: number;
  indexEnd?: number;
  indexTime?: number;
  feedback?: number;
  /** table: веса гармоник 1, 2, 3… */
  harmonics?: number[];
  /** Хорус: столько одинаковых генераторов, разнесённых по высоте на `cents` (весь разброс). У струны — столько струн. */
  unison?: { voices: number; cents: number };
  /** Перегруз до фильтров: 0 — чисто. */
  drive?: number;
  /** Форманты (хор, дудук, гобой, скрипка): параллельные полосовые фильтры вместо голого генератора. */
  formants?: Formant[];
  env: Env;
  /** Резонансный ФНЧ: срез Гц, прибавка от частоты ноты, прибавка огибающей и её время, резонанс 0..1. */
  cutoff?: number;
  track?: number;
  cutEnv?: number;
  cutTime?: number;
  reso?: number;
  /** Вибрато: частота Гц, глубина в центах, задержка с. */
  vib?: { rate: number; depth: number; delay: number };
  /** Подъезд к ноте: полутона и время с (минус — снизу). */
  bend?: { semis: number; time: number };
  /** Портаменто от прошлой ноты партии, с. */
  glide?: number;
  /** Шум дыхания или смычка 0..1. */
  breath?: number;
  /** Тремоло: частота Гц и глубина 0..1 (тремоло струнных, дрожащий свет). */
  trem?: { rate: number; depth: number };
  /** Струна: яркость возбуждения 0..1 и время затухания до −60 дБ, с. */
  pluck?: { bright: number; decay: number };
  gain: number;
}

/** Партия трека: инструмент (или барабаны набора DRUMS), ноты, громкость, панорама −1..1, посылы в эхо и в зал. */
export interface Part {
  name: string;
  inst: Instrument | 'drums';
  seq: Seq;
  vol: number;
  pan: number;
  echo?: number;
  rev?: number;
  /** Ширина аккорда 0..1: звуки одного аккорда расходятся по панораме от −spread до +spread. */
  spread?: number;
}

export interface Song {
  /** «forest-b»: локация и вариант. */
  id: string;
  location: LocationId;
  variant: string;
  /** Название для паузы, инструмента и страницы обсуждения. */
  title: string;
  /** Одна строка о характере — для страницы обсуждения. */
  mood: string;
  /** Тональность словами: «ре минор», «ми фригийский». */
  key: string;
  bpm: number;
  beatsPerBar: number;
  /** Размер для подписи, если доля — не четверть: «6/8» при двух долях с точкой. */
  meter?: string;
  /** Свинг восьмых: на сколько доли восьмой сдвигается слабая восьмая (0.17 ≈ триольный). */
  swing?: number;
  /** Эхо: задержка в долях, обратная связь, громкость, срез фильтра в петле Гц, перекрёстная связь каналов. */
  echo?: { beats: number; fb: number; wet: number; tone: number; cross?: number };
  /** Зал: размер 0..1, глушение высоких 0..1, громкость, предзадержка мс. */
  reverb?: { size: number; damp: number; wet: number; pre?: number };
  parts: Part[];
}

/** Готовый трек: 32-битные float-каналы, их частота и множитель сведения (во сколько раз трек подняли до TARGET_RMS). */
export interface Rendered {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  gain: number;
}

/** Частота рендера и, для инструмента, только эти партии (послушать партию отдельно, свести баланс). */
export interface RenderOpts {
  sr?: number;
  only?: string[];
}

/**
 * Громкость трека после сведения (RMS, −17,5 дБ — тише прежнего: мрачной музыке нужен запас на динамику). Пики выше KNEE
 * мягко прижимает лимитер (`limit`), но поднять трек больше чем на HEADROOM над его пиком нельзя — иначе лимитер начнёт
 * душить уже не удары, а музыку.
 */
const TARGET_RMS = 0.133;
const KNEE = 0.75;
const HEADROOM = 1.4;

/** Мягкий лимитер: до KNEE — как есть, выше — плавно к 1, без жёсткого среза. */
function limit(x: number): number {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  const y = KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE));
  return x < 0 ? -y : y;
}

// ─── Время ───────────────────────────────────────────────────────────────

/** Длина трека в долях — у всех партий она одна (тест музыки это сверяет). */
export function songBeats(song: Song): number {
  return Math.max(...song.parts.map((p) => p.seq.beats));
}

/** Доля → секунды со свингом: слабая восьмая сдвинута на `swing` восьмой, сильные доли стоят на месте. */
export function secAt(song: Song, beat: number): number {
  const s = song.swing ?? 0;
  const b = Math.floor(beat + 1e-9);
  const f = Math.max(0, beat - b);
  const g = !s ? f : f < 0.5 ? (f * (0.5 + s)) / 0.5 : 0.5 + s + ((f - 0.5) * (0.5 - s)) / 0.5;
  return ((b + g) * 60) / song.bpm;
}

export function songSeconds(song: Song): number {
  return secAt(song, songBeats(song));
}

// ─── Генераторы ──────────────────────────────────────────────────────────

/** xorshift32: свой шум у каждого трека, всегда одинаковый. */
function makeRnd(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

/** Число из строки — зерно шума трека. */
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const TAB = 4096;
const SIN = new Float32Array(TAB + 1);
for (let i = 0; i <= TAB; i++) SIN[i] = Math.sin((2 * Math.PI * i) / TAB);

/** Синус по таблице; аргумент — в периодах. */
function sinC(c: number): number {
  const x = (c - Math.floor(c)) * TAB;
  const i = x | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (x - i);
}

/** Таблица одного периода по весам гармоник, пик 1. */
const tables = new Map<string, Float32Array>();
function tableOf(harmonics: number[]): Float32Array {
  const key = harmonics.join(',');
  let t = tables.get(key);
  if (t) return t;
  t = new Float32Array(TAB + 1);
  let peak = 0;
  for (let i = 0; i <= TAB; i++) {
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) if (harmonics[h]) v += harmonics[h] * Math.sin((2 * Math.PI * (h + 1) * i) / TAB);
    t[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i <= TAB; i++) t[i] /= peak || 1;
  tables.set(key, t);
  return t;
}

function tableC(t: Float32Array, c: number): number {
  const x = (c - Math.floor(c)) * TAB;
  const i = x | 0;
  return t[i] + (t[i + 1] - t[i]) * (x - i);
}

/** PolyBLEP: сглаживание скачка пилы и прямоугольника — меньше алиасинга на высоких нотах. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

function osc(wave: Instrument['wave'], ph: number, dt: number, duty: number): number {
  switch (wave) {
    case 'saw':
      return 2 * ph - 1 - blep(ph, dt);
    case 'pulse': {
      let v = ph < duty ? 1 : -1;
      v += blep(ph, dt);
      let t2 = ph - duty;
      if (t2 < 0) t2 += 1;
      v -= blep(t2, dt);
      return v - (2 * duty - 1);
    }
    case 'tri':
      return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    default:
      return sinC(ph);
  }
}

/** Коэффициенты биквада (RBJ): ФНЧ и полосовой с пиком 0 дБ — в массив [b0, b1, b2, a1, a2]. */
function lowpassCoefs(out: Float64Array, o: number, fc: number, q: number, sr: number): void {
  const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  out[o] = (1 - cs) / 2 / a0;
  out[o + 1] = (1 - cs) / a0;
  out[o + 2] = out[o];
  out[o + 3] = (-2 * cs) / a0;
  out[o + 4] = (1 - al) / a0;
}

function bandpassCoefs(out: Float64Array, o: number, fc: number, q: number, sr: number): void {
  const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  out[o] = al / a0;
  out[o + 1] = 0;
  out[o + 2] = -al / a0;
  out[o + 3] = (-2 * cs) / a0;
  out[o + 4] = (1 - al) / a0;
}

// ─── Шина ────────────────────────────────────────────────────────────────

/** Сухие каналы и посылы в эхо и зал; запись заворачивается по кругу — петля без шва. */
interface Bus {
  L: Float32Array;
  R: Float32Array;
  EL: Float32Array | null;
  ER: Float32Array | null;
  VL: Float32Array | null;
  VR: Float32Array | null;
  sr: number;
  rnd: () => number;
  /** Готовые сэмплы ударных этого трека (drumSample). */
  drums: Map<string, Float32Array>;
}

/** Громкости ноты по каналам: сухой звук, посыл в эхо, посыл в зал. */
interface Out {
  gL: number;
  gR: number;
  eL: number;
  eR: number;
  vL: number;
  vR: number;
}

function outOf(pan: number, k: number, echo: number, rev: number): Out {
  const th = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gL = Math.cos(th) * k;
  const gR = Math.sin(th) * k;
  return { gL, gR, eL: gL * echo, eR: gR * echo, vL: gL * rev, vR: gR * rev };
}

/** Отсчёт ноты в шину: сухой и посылы. */
function emit(bus: Bus, idx: number, v: number, o: Out): void {
  bus.L[idx] += v * o.gL;
  bus.R[idx] += v * o.gR;
  if (bus.EL && o.eL) {
    bus.EL[idx] += v * o.eL;
    bus.ER![idx] += v * o.eR;
  }
  if (bus.VL && o.vL) {
    bus.VL[idx] += v * o.vL;
    bus.VR![idx] += v * o.vR;
  }
}

/** Огибающая по шагам, без экспоненты на каждый отсчёт: атака — прямая, спад — умножением, отпускание — квадрат доли. */
class EnvGen {
  private attackS: number;
  private gateS: number;
  private decayMul: number;
  private relStep: number;
  private sus: number;
  private dec: number;
  private atGate = 0;
  private relQ = 1;
  readonly total: number;
  constructor(e: Env, gate: number, sr: number) {
    this.attackS = Math.max(1, Math.round(Math.max(e.a, 0.002) * sr));
    this.gateS = Math.max(1, Math.round(Math.max(gate, 0.01) * sr));
    this.decayMul = Math.exp(-1 / ((Math.max(e.d, 0.001) / 3) * sr));
    const rel = Math.max(e.r, 0.012);
    this.relStep = 1 / (rel * sr);
    this.sus = e.s;
    this.dec = 1 - e.s;
    this.total = this.gateS + Math.ceil(rel * sr);
  }
  next(n: number): number {
    if (n < this.gateS) {
      let env: number;
      if (n < this.attackS) env = n / this.attackS;
      else {
        env = this.sus + this.dec;
        this.dec *= this.decayMul;
      }
      this.atGate = env;
      return env;
    }
    this.relQ -= this.relStep;
    return this.relQ > 0 ? this.atGate * this.relQ * this.relQ : 0;
  }
}

/** Одна нота инструмента с начала s0 (в отсчётах), gate — сколько секунд держится до отпускания. */
function tone(bus: Bus, inst: Instrument, s0: number, gate: number, midi: number, fromMidi: number, vel: number, o: Out): void {
  if (inst.wave === 'pluck') {
    pluck(bus, inst, s0, gate, midi, vel, o);
    return;
  }
  const sr = bus.sr;
  const N = bus.L.length;
  const invSr = 1 / sr;
  const env = new EnvGen(inst.env, gate, sr);
  const total = env.total;
  const freq = freqOf(midi);
  const glideSemis = inst.glide && fromMidi ? fromMidi - midi : 0;
  // Хорус: голоса разнесены по высоте равномерно на весь разброс, фазы случайны; громкость — по корню из числа голосов.
  const uv = Math.max(1, inst.unison?.voices ?? 1);
  const cents = inst.unison?.cents ?? 0;
  const ratios = new Float64Array(uv);
  const phases = new Float64Array(uv);
  for (let u = 0; u < uv; u++) {
    ratios[u] = uv === 1 ? 1 : Math.pow(2, (cents * (u / (uv - 1) - 0.5)) / 1200);
    phases[u] = uv === 1 ? 0 : bus.rnd();
  }
  const uNorm = 1 / Math.sqrt(uv);
  const wave = inst.wave;
  const table = wave === 'table' ? tableOf(inst.harmonics ?? [1]) : null;
  const ratio = inst.ratio ?? 1;
  const fb = inst.feedback ?? 0;
  const i0 = inst.index ?? 1;
  const i1 = inst.indexEnd ?? 0;
  const iT = Math.max(inst.indexTime ?? 0.2, 0.001);
  const drive = inst.drive ?? 0;
  const driveNorm = drive ? (1 + drive) / drive : 1;
  const breath = inst.breath ?? 0;
  // Акцент ярче: срез фильтра растёт с силой ноты.
  const bright = 0.65 + 0.35 * vel;
  const filt = inst.cutoff !== undefined;
  const q = 0.707 + (inst.reso ?? 0) * 7;
  const lp = new Float64Array(5);
  let lx1 = 0;
  let lx2 = 0;
  let ly1 = 0;
  let ly2 = 0;
  // Форманты: коэффициенты и состояния по четыре на фильтр. Относительные (до 16) следуют за высотой ноты.
  const fm = inst.formants ?? [];
  const nf = fm.length;
  const fc = new Float64Array(nf * 5);
  const fs = new Float64Array(nf * 4);
  const relFormant = fm.some((f) => f[0] <= 16);
  for (let k = 0; k < nf; k++) bandpassCoefs(fc, k * 5, fm[k][0] <= 16 ? fm[k][0] * freq : fm[k][0], fm[k][1], sr);
  // FM с модулятором ×1 даёт боковую полосу на нуле герц — постоянную составляющую, которая гудит под басом.
  // Её снимает блокиратор постоянного тока: ФВЧ около 20 Гц на каждой ноте.
  const dcR = 1 - (2 * Math.PI * 20) / sr;
  let dcX = 0;
  let dcY = 0;
  let pm = 0;
  let prevMod = 0;
  let dt = freq / sr;
  let duty = inst.duty ?? 0.5;
  let index = i0;
  let trem = 1;
  let idx = s0 % N;
  for (let n = 0; n < total; n++) {
    // Высота, срез и прочие модуляции — раз в 16 отсчётов (2,7 кГц хватает и вибрато, и подъезду).
    if ((n & 15) === 0) {
      const t = n * invSr;
      let semis = 0;
      if (inst.bend) {
        const k = 1 - t / inst.bend.time;
        if (k > 0) semis += inst.bend.semis * k * k;
      }
      if (glideSemis) {
        const k = 1 - t / inst.glide!;
        if (k > 0) semis += glideSemis * k;
      }
      if (inst.vib) {
        const ramp = Math.min(1, Math.max(0, (t - inst.vib.delay) / 0.3));
        if (ramp > 0) semis += (inst.vib.depth / 100) * ramp * sinC(inst.vib.rate * t);
      }
      const f = semis ? freq * Math.pow(2, semis / 12) : freq;
      dt = f / sr;
      if (filt) lowpassCoefs(lp, 0, ((inst.cutoff ?? 0) + (inst.track ?? 0) * f + (inst.cutEnv ? inst.cutEnv * Math.exp(-t / (inst.cutTime ?? 0.1)) : 0)) * bright, q, sr);
      if (relFormant) for (let k = 0; k < nf; k++) if (fm[k][0] <= 16) bandpassCoefs(fc, k * 5, fm[k][0] * f, fm[k][1], sr);
      if (inst.pwm) duty = (inst.duty ?? 0.5) + inst.pwm.depth * sinC(inst.pwm.rate * t);
      if (wave === 'fm') index = i1 + (i0 - i1) * Math.exp(-t / iT);
      if (inst.trem) trem = 1 - inst.trem.depth * (0.5 + 0.5 * sinC(inst.trem.rate * t));
    }
    let v = 0;
    if (wave === 'fm') {
      pm += dt * ratio;
      if (pm >= 1) pm -= 1;
      const mod = sinC(pm + fb * prevMod);
      prevMod = mod;
      for (let u = 0; u < uv; u++) {
        v += sinC(phases[u] + (index * mod) / (2 * Math.PI));
        phases[u] += dt * ratios[u];
        if (phases[u] >= 1) phases[u] -= 1;
      }
    } else if (wave === 'noise') {
      v = bus.rnd() * 2 - 1;
    } else if (table) {
      for (let u = 0; u < uv; u++) {
        v += tableC(table, phases[u]);
        phases[u] += dt * ratios[u];
        if (phases[u] >= 1) phases[u] -= 1;
      }
    } else {
      for (let u = 0; u < uv; u++) {
        const d = dt * ratios[u];
        v += osc(wave, phases[u], d, duty);
        phases[u] += d;
        if (phases[u] >= 1) phases[u] -= 1;
      }
    }
    v *= uNorm;
    if (breath) v += breath * (bus.rnd() * 2 - 1);
    if (drive) {
      const x = v * drive;
      v = (x / (1 + Math.abs(x))) * driveNorm;
    }
    if (nf) {
      let s = 0;
      for (let k = 0; k < nf; k++) {
        const c = k * 5;
        const st = k * 4;
        const y = fc[c] * v + fc[c + 1] * fs[st] + fc[c + 2] * fs[st + 1] - fc[c + 3] * fs[st + 2] - fc[c + 4] * fs[st + 3];
        fs[st + 1] = fs[st];
        fs[st] = v;
        fs[st + 3] = fs[st + 2];
        fs[st + 2] = y;
        s += y * fm[k][2];
      }
      v = s;
    }
    if (filt) {
      const y = lp[0] * v + lp[1] * lx1 + lp[2] * lx2 - lp[3] * ly1 - lp[4] * ly2;
      lx2 = lx1;
      lx1 = v;
      ly2 = ly1;
      ly1 = y;
      v = y;
    }
    dcY = v - dcX + dcR * dcY;
    dcX = v;
    v = dcY * env.next(n) * trem;
    emit(bus, idx, v, o);
    if (++idx >= N) idx = 0;
  }
}

/**
 * Струна Карплуса — Стронга: линия задержки длиной в период, заполненная шумом, и в петле — усреднение соседних
 * отсчётов (струна темнеет, как живая) с потерей под время затухания. Дробная часть периода — фазовращателем, иначе
 * высокие ноты фальшивят. Несколько струн (`unison`) — цимбалы и лютня с парными струнами.
 */
function pluck(bus: Bus, inst: Instrument, s0: number, gate: number, midi: number, vel: number, o: Out): void {
  const sr = bus.sr;
  const N = bus.L.length;
  const p = inst.pluck ?? { bright: 0.5, decay: 2 };
  const env = new EnvGen(inst.env, gate, sr);
  const total = env.total;
  const uv = Math.max(1, inst.unison?.voices ?? 1);
  const cents = inst.unison?.cents ?? 0;
  const out = new Float32Array(total);
  const bright = Math.min(1, p.bright * (0.6 + 0.4 * vel));
  for (let u = 0; u < uv; u++) {
    const f = freqOf(midi) * (uv === 1 ? 1 : Math.pow(2, (cents * (u / (uv - 1) - 0.5)) / 1200));
    const period = sr / f;
    const L = Math.max(2, Math.floor(period - 0.5));
    const frac = period - 0.5 - L;
    const C = (1 - frac) / (1 + frac);
    const loss = Math.pow(0.001, 1 / (f * p.decay));
    const buf = new Float32Array(L);
    let lpv = 0;
    let mean = 0;
    for (let i = 0; i < L; i++) {
      lpv += bright * (bus.rnd() * 2 - 1 - lpv);
      buf[i] = lpv;
      mean += lpv;
    }
    mean /= L;
    for (let i = 0; i < L; i++) buf[i] -= mean;
    let r = 0;
    let prev = 0;
    let apX = 0;
    let apY = 0;
    for (let n = 0; n < total; n++) {
      const x = buf[r];
      const avg = 0.5 * (x + prev);
      prev = x;
      const ap = C * avg + apX - C * apY;
      apX = avg;
      apY = ap;
      buf[r] = ap * loss;
      if (++r >= L) r = 0;
      out[n] += x;
    }
  }
  const filt = inst.cutoff !== undefined;
  const lp = new Float64Array(5);
  if (filt) lowpassCoefs(lp, 0, (inst.cutoff ?? 0) + (inst.track ?? 0) * freqOf(midi), 0.707 + (inst.reso ?? 0) * 7, sr);
  let lx1 = 0;
  let lx2 = 0;
  let ly1 = 0;
  let ly2 = 0;
  const norm = 2.2 / Math.sqrt(uv);
  let idx = s0 % N;
  for (let n = 0; n < total; n++) {
    let v = out[n] * norm;
    if (filt) {
      const y = lp[0] * v + lp[1] * lx1 + lp[2] * lx2 - lp[3] * ly1 - lp[4] * ly2;
      lx2 = lx1;
      lx1 = v;
      ly2 = ly1;
      ly1 = y;
      v = y;
    }
    emit(bus, idx, v * env.next(n), o);
    if (++idx >= N) idx = 0;
  }
}

// ─── Барабаны ────────────────────────────────────────────────────────────

/** Удар набора: длина звучания с, громкость, панорама и рисунок звука по времени удара. */
interface Drum {
  sec: number;
  gain: number;
  pan: number;
  make: (rnd: () => number, sr: number) => (t: number) => number;
}

/** Шум через ФВЧ первого порядка: чем выше `cut`, тем тоньше. */
function hiNoise(rnd: () => number, sr: number, cut: number): () => number {
  const a = 1 - Math.exp((-2 * Math.PI * cut) / sr);
  let lp = 0;
  return () => {
    const x = rnd() * 2 - 1;
    lp += a * (x - lp);
    return x - lp;
  };
}

/** Шум в полосе: ФВЧ `lo`, потом ФНЧ `hi`. */
function bandNoise(rnd: () => number, sr: number, lo: number, hi: number): () => number {
  const hp = hiNoise(rnd, sr, lo);
  const a = 1 - Math.exp((-2 * Math.PI * hi) / sr);
  let y = 0;
  return () => {
    y += a * (hp() - y);
    return y;
  };
}

/** Мягкая трапеция 0→1→0 с фронтами 6 мс: слоги кваканья, удары сердца. */
function trap(t: number, from: number, to: number): number {
  const edge = 0.006;
  if (t < from || t > to) return 0;
  return Math.min(1, (t - from) / edge, (to - t) / edge);
}

function tom(base: number): Drum['make'] {
  return (rnd, sr) => {
    let ph = 0;
    return (t) => {
      ph += (base * (1 + 0.6 * Math.exp(-t / 0.03))) / sr;
      return sinC(ph) * Math.exp(-t / 0.22) + (rnd() * 2 - 1) * 0.25 * Math.exp(-t / 0.008);
    };
  };
}

function timpani(base: number): Drum['make'] {
  return (rnd, sr) => {
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    return (t) => {
      const drop = 1 + 0.04 * Math.exp(-t / 0.05);
      p1 += (base * drop) / sr;
      p2 += (base * 1.5 * drop) / sr;
      p3 += (base * 1.98 * drop) / sr;
      return sinC(p1) * Math.exp(-t / 0.7) + 0.5 * sinC(p2) * Math.exp(-t / 0.4) + 0.3 * sinC(p3) * Math.exp(-t / 0.25) + (rnd() * 2 - 1) * 0.3 * Math.exp(-t / 0.01);
    };
  };
}

/**
 * Набор ударных по буквам. Старый набор: k бочка, s малый, h закрытая тарелка, o открытая, p шейкер, r римшот (кость,
 * тиканье часов), x хлопок, c крэш, T/t/y низкий/средний/высокий том, g/G/D литавра соль, до и ре, d капля, i щелчок
 * хитина, a наковальня, f кваканье, j бубен, w накат волны. Мрачный набор: K тайко, F рамочный барабан, z цепи,
 * N гонг (там-там), q гул и гром, u порыв ветра, v сердце, n скрип дерева, L пузырь.
 */
export const DRUMS: Record<string, Drum> = {
  k: {
    sec: 0.4,
    gain: 1,
    pan: 0,
    make: (rnd, sr) => {
      let ph = 0;
      return (t) => {
        ph += (52 + 120 * Math.exp(-t / 0.035)) / sr;
        const x = 1.4 * (sinC(ph) * Math.exp(-t / 0.16) + (rnd() * 2 - 1) * 0.35 * Math.exp(-t / 0.002));
        return x / (1 + Math.abs(x));
      };
    },
  },
  s: {
    sec: 0.3,
    gain: 1.15,
    pan: 0.05,
    make: (rnd, sr) => {
      let ph = 0;
      const nz = hiNoise(rnd, sr, 1200);
      return (t) => {
        ph += (190 * (1 + 0.3 * Math.exp(-t / 0.01))) / sr;
        return sinC(ph) * Math.exp(-t / 0.045) * 0.55 + nz() * Math.exp(-t / 0.1);
      };
    },
  },
  h: { sec: 0.08, gain: 1, pan: 0.3, make: (rnd, sr) => { const nz = hiNoise(rnd, sr, 6500); return (t) => nz() * Math.exp(-t / 0.018); } },
  o: { sec: 0.4, gain: 0.7, pan: 0.3, make: (rnd, sr) => { const nz = hiNoise(rnd, sr, 6000); return (t) => nz() * Math.exp(-t / 0.13); } },
  p: {
    sec: 0.1,
    gain: 1,
    pan: -0.3,
    make: (rnd, sr) => {
      const nz = bandNoise(rnd, sr, 4000, 10000);
      return (t) => nz() * Math.min(1, t / 0.012) * Math.exp(-Math.max(0, t - 0.012) / 0.03);
    },
  },
  r: { sec: 0.09, gain: 0.9, pan: -0.15, make: () => (t) => sinC(1700 * t) * Math.exp(-t / 0.01) + 0.6 * sinC(520 * t) * Math.exp(-t / 0.025) },
  x: {
    sec: 0.25,
    gain: 0.75,
    pan: 0,
    make: (rnd, sr) => {
      const nz = bandNoise(rnd, sr, 900, 3500);
      return (t) => {
        let env = 0;
        for (const b of [0, 0.011, 0.022]) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / 0.004));
        if (t >= 0.022) env = Math.max(env, 0.7 * Math.exp(-(t - 0.022) / 0.07));
        return nz() * env * 1.6;
      };
    },
  },
  c: {
    sec: 1.8,
    gain: 0.8,
    pan: -0.35,
    make: (rnd, sr) => {
      const nz = hiNoise(rnd, sr, 4500);
      const ring = [587, 845, 1172, 1470, 2213];
      return (t) => {
        let m = 0;
        for (const f of ring) m += sinC(f * t) > 0 ? 1 : -1;
        return nz() * Math.exp(-t / 0.55) + (m / ring.length) * 0.18 * Math.exp(-t / 0.35);
      };
    },
  },
  T: { sec: 0.7, gain: 0.75, pan: -0.3, make: tom(82) },
  t: { sec: 0.6, gain: 0.7, pan: 0, make: tom(123) },
  y: { sec: 0.5, gain: 0.65, pan: 0.3, make: tom(165) },
  g: { sec: 1.6, gain: 0.85, pan: 0, make: timpani(98) },
  G: { sec: 1.8, gain: 0.9, pan: 0, make: timpani(65.4) },
  D: { sec: 1.8, gain: 0.9, pan: 0, make: timpani(73.4) },
  d: {
    sec: 0.2,
    gain: 0.3,
    pan: 0.45,
    make: (_rnd, sr) => {
      let ph = 0;
      return (t) => {
        ph += (1600 - 1100 * Math.exp(-t / 0.025)) / sr;
        return sinC(ph) * Math.exp(-t / 0.06) * Math.min(1, t / 0.002);
      };
    },
  },
  i: {
    sec: 0.05,
    gain: 0.4,
    pan: -0.4,
    make: () => (t) => sinC(3200 * t + (3 * Math.exp(-t / 0.006) * sinC(4800 * t)) / (2 * Math.PI)) * Math.exp(-t / 0.012),
  },
  a: {
    sec: 1.1,
    gain: 0.35,
    pan: 0.2,
    make: (rnd) => (t) =>
      sinC(740 * t) * Math.exp(-t / 0.35) +
      0.6 * sinC(2042 * t) * Math.exp(-t / 0.22) +
      0.4 * sinC(3996 * t) * Math.exp(-t / 0.12) +
      0.25 * sinC(6586 * t) * Math.exp(-t / 0.06) +
      (rnd() * 2 - 1) * 0.4 * Math.exp(-t / 0.003),
  },
  f: {
    sec: 0.26,
    gain: 0.4,
    pan: -0.45,
    make: (_rnd, sr) => {
      let ph = 0;
      let lp = 0;
      const a = 1 - Math.exp((-2 * Math.PI * 1100) / sr);
      return (t) => {
        ph += (130 - 120 * t) / sr;
        const x = sinC(ph + (2.6 * sinC(ph * 2.01)) / (2 * Math.PI)) * (0.55 + 0.45 * sinC(32 * t));
        lp += a * (x - lp);
        return lp * (trap(t, 0, 0.09) + 0.8 * trap(t, 0.13, 0.24));
      };
    },
  },
  j: {
    sec: 0.22,
    gain: 1,
    pan: 0.4,
    make: (rnd, sr) => {
      const nz = bandNoise(rnd, sr, 5000, 12000);
      return (t) => nz() * (Math.exp(-t / 0.05) + (t > 0.014 ? 0.6 * Math.exp(-(t - 0.014) / 0.07) : 0)) * (0.7 + 0.3 * sinC(7300 * t));
    },
  },
  w: {
    sec: 3,
    gain: 0.22,
    pan: 0,
    make: (rnd, sr) => {
      let lp = 0;
      return (t) => {
        const env = t < 1.1 ? Math.sin((t / 1.1) * (Math.PI / 2)) : Math.max(0, 1 - (t - 1.1) / 1.9) ** 2;
        const a = 1 - Math.exp((-2 * Math.PI * (300 + 1500 * env)) / sr);
        lp += a * (rnd() * 2 - 1 - lp);
        return lp * env * 2.2;
      };
    },
  },
  // ─── Мрачный набор ───
  K: {
    sec: 1.6,
    gain: 1.1,
    pan: 0,
    make: (rnd, sr) => {
      let p1 = 0;
      let p2 = 0;
      let lp = 0;
      const a = 1 - Math.exp((-2 * Math.PI * 900) / sr);
      return (t) => {
        const f = 52 + 45 * Math.exp(-t / 0.05);
        p1 += f / sr;
        p2 += (f * 1.58) / sr;
        lp += a * (rnd() * 2 - 1 - lp);
        const x = 1.6 * (sinC(p1) * Math.exp(-t / 0.55) + 0.35 * sinC(p2) * Math.exp(-t / 0.2) + lp * 1.4 * Math.exp(-t / 0.025));
        return x / (1 + Math.abs(x));
      };
    },
  },
  F: {
    sec: 0.5,
    gain: 1.3,
    pan: -0.15,
    make: (rnd, sr) => {
      let ph = 0;
      const nz = bandNoise(rnd, sr, 200, 2200);
      return (t) => {
        ph += (95 * (1 + 0.3 * Math.exp(-t / 0.02))) / sr;
        return sinC(ph) * Math.exp(-t / 0.16) + nz() * 0.9 * Math.exp(-t / 0.035);
      };
    },
  },
  z: {
    sec: 0.55,
    gain: 1.8,
    pan: 0.35,
    make: (rnd, sr) => {
      const hits = Array.from({ length: 7 }, (_, i) => ({ t: i * 0.045 + rnd() * 0.03, f: 2400 + rnd() * 2600, g: 0.4 + rnd() * 0.6 }));
      const nz = hiNoise(rnd, sr, 3500);
      return (t) => {
        let v = 0;
        for (const h of hits) if (t >= h.t) {
          const k = Math.exp(-(t - h.t) / 0.025);
          v += h.g * k * (sinC(h.f * (t - h.t)) * 0.6 + 0.4 * sinC(h.f * 1.73 * (t - h.t)));
        }
        return v * 0.6 + nz() * 0.25 * Math.exp(-t / 0.2);
      };
    },
  },
  N: {
    sec: 6,
    gain: 0.7,
    pan: -0.1,
    make: (rnd, sr) => {
      const parts = [1, 1.47, 2.09, 2.56, 3.11, 3.9, 4.62, 5.23, 6.4].map((r, i) => ({ f: 92 * r, d: 4.5 - i * 0.4, g: 1 / (1 + i * 0.5) }));
      const nz = bandNoise(rnd, sr, 300, 3000);
      return (t) => {
        const bloom = 1 - Math.exp(-t / 0.12);
        let v = 0;
        for (const p of parts) v += p.g * sinC(p.f * t) * Math.exp(-t / p.d);
        return v * 0.4 * bloom + nz() * 0.6 * Math.exp(-t / 0.05);
      };
    },
  },
  q: {
    sec: 4.5,
    gain: 1.6,
    pan: 0,
    make: (rnd, sr) => {
      let lp1 = 0;
      let lp2 = 0;
      return (t) => {
        const env = Math.min(1, t / 0.35) * Math.exp(-t / 1.6) * (0.7 + 0.3 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
        const a = 1 - Math.exp((-2 * Math.PI * (90 + 160 * env)) / sr);
        lp1 += a * (rnd() * 2 - 1 - lp1);
        lp2 += a * (lp1 - lp2);
        return lp2 * env * 9;
      };
    },
  },
  u: {
    sec: 4,
    gain: 0.5,
    pan: 0.2,
    make: (rnd, sr) => {
      const hp = hiNoise(rnd, sr, 250);
      let lp = 0;
      return (t) => {
        const env = Math.sin(Math.min(1, t / 4) * Math.PI) ** 2;
        const center = 400 + 700 * Math.sin(Math.min(1, t / 4) * Math.PI);
        const a = 1 - Math.exp((-2 * Math.PI * center) / sr);
        lp += a * (hp() - lp);
        return lp * env * 3;
      };
    },
  },
  v: {
    sec: 0.7,
    gain: 1.4,
    pan: 0,
    make: (_rnd, sr) => {
      let ph = 0;
      return (t) => {
        ph += (48 + 30 * Math.exp(-((t % 0.28) / 0.03))) / sr;
        const k = trap(t, 0, 0.16) * Math.exp(-t / 0.07) + 0.7 * trap(t, 0.28, 0.5) * Math.exp(-(t - 0.28) / 0.08);
        return sinC(ph) * k * 1.6;
      };
    },
  },
  n: {
    sec: 0.9,
    gain: 2.5,
    pan: -0.4,
    make: (rnd, sr) => {
      // Трение дерева: редкие щелчки, частота которых растёт, через два резонанса доски.
      const c = new Float64Array(10);
      bandpassCoefs(c, 0, 620, 9, sr);
      bandpassCoefs(c, 5, 1450, 7, sr);
      const s = new Float64Array(8);
      let ph = 0;
      return (t) => {
        ph += (35 + 70 * Math.min(1, t / 0.7)) / sr;
        let x = 0;
        if (ph >= 1) {
          ph -= 1;
          x = 0.6 + rnd() * 0.8;
        }
        let v = 0;
        for (let k = 0; k < 2; k++) {
          const o = k * 5;
          const st = k * 4;
          const y = c[o] * x + c[o + 1] * s[st] + c[o + 2] * s[st + 1] - c[o + 3] * s[st + 2] - c[o + 4] * s[st + 3];
          s[st + 1] = s[st];
          s[st] = x;
          s[st + 3] = s[st + 2];
          s[st + 2] = y;
          v += y;
        }
        return v * 6 * Math.sin(Math.min(1, t / 0.85) * Math.PI);
      };
    },
  },
  L: {
    sec: 0.3,
    gain: 1.4,
    pan: -0.3,
    make: (_rnd, sr) => {
      let ph = 0;
      return (t) => {
        ph += (520 - 340 * Math.exp(-t / 0.04)) / sr;
        return sinC(ph) * Math.exp(-t / 0.07) * Math.min(1, t / 0.004);
      };
    },
  },
};

/**
 * Удар — готовый сэмпл: каждый вид рендерится один раз на трек и потом только подмешивается с силой удара, как
 * сэмплы ударных на приставках. Это и быстрее раз в десять, и честнее к эпохе: каждый удар звучит одинаково.
 * Хвост последних 10 % гаснет к нулю — обрезанный звук не щёлкает.
 */
function drumSample(bus: Bus, kind: string): Float32Array {
  let smp = bus.drums.get(kind);
  if (smp) return smp;
  const d = DRUMS[kind];
  if (!d) throw new Error(`Нет удара «${kind}»`);
  const sr = bus.sr;
  const gen = d.make(bus.rnd, sr);
  const total = Math.ceil(d.sec * sr);
  const fade = Math.max(1, Math.floor(total * 0.1));
  smp = new Float32Array(total);
  for (let n = 0; n < total; n++) smp[n] = gen(n / sr) * d.gain * Math.min(1, (total - n) / fade);
  bus.drums.set(kind, smp);
  return smp;
}

function hit(bus: Bus, kind: string, s0: number, vel: number, part: Part): void {
  const smp = drumSample(bus, kind);
  const N = bus.L.length;
  const o = outOf(part.pan + DRUMS[kind].pan, vel * part.vol, part.echo ?? 0, part.rev ?? 0);
  let idx = s0 % N;
  for (let n = 0; n < smp.length; n++) {
    emit(bus, idx, smp[n], o);
    if (++idx >= N) idx = 0;
  }
}

// ─── Эффекты ─────────────────────────────────────────────────────────────

/** Сколько секунд конца петли прогнать впустую, чтобы хвост эффекта лёг в её начало. */
function warmFrom(N: number, sr: number, sec: number): number {
  return Math.max(0, N - Math.min(N, Math.ceil(sec * sr)));
}

/** Эхо по кругу петли: сначала конец петли разогревает линию, потом проход по всей петле пишет результат. */
function applyEcho(bus: Bus, song: Song): void {
  const ec = song.echo;
  if (!ec || !bus.EL || !bus.ER) return;
  const { L, R, EL, ER, sr } = bus;
  const N = L.length;
  const D = Math.max(1, Math.min(N - 1, Math.round(((ec.beats * 60) / song.bpm) * sr)));
  const cross = ec.cross ?? 0.35;
  const a = 1 - Math.exp((-2 * Math.PI * ec.tone) / sr);
  const eL = new Float32Array(N);
  const eR = new Float32Array(N);
  let lL = 0;
  let lR = 0;
  // Хвост эха живёт, пока повторы не упадут на 60 дБ.
  const tail = (Math.log(0.001) / Math.log(Math.max(ec.fb, 0.01)) + 1) * (D / sr);
  const start = warmFrom(N, sr, tail);
  for (let i = start; i < N * 2; i++) {
    const j = i % N;
    let k = j - D;
    if (k < 0) k += N;
    const inL = EL[k] + ec.fb * ((1 - cross) * eL[k] + cross * eR[k]);
    const inR = ER[k] + ec.fb * ((1 - cross) * eR[k] + cross * eL[k]);
    lL += a * (inL - lL);
    lR += a * (inR - lR);
    eL[j] = lL;
    eR[j] = lR;
  }
  for (let j = 0; j < N; j++) {
    L[j] += ec.wet * eL[j];
    R[j] += ec.wet * eR[j];
  }
}

/** Гребёнки и фазовращатели «Фривёрба» (Jezar) на 44,1 кГц; правый канал длиннее на 23 отсчёта — ширина. */
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const STEREO_SPREAD = 23;

/**
 * Зал: восемь гребёнок с глушением высоких в обратной связи и четыре фазовращателя на канал, предзадержка. Как и эхо,
 * по кругу петли: конец петли разогревает зал (хвост до 8 с), и только потом идёт проход, который пишет.
 */
function applyReverb(bus: Bus, song: Song): void {
  const rv = song.reverb;
  if (!rv || !bus.VL || !bus.VR) return;
  const { L, R, sr } = bus;
  const N = L.length;
  const scale = sr / 44100;
  const room = 0.7 + 0.28 * Math.max(0, Math.min(1, rv.size));
  const damp = 0.4 * Math.max(0, Math.min(1, rv.damp));
  const pre = Math.round(((rv.pre ?? 20) / 1000) * sr);
  // Вход общий (сумма каналов): так поступает и «Фривёрб», стерео даёт разная длина линий.
  const input = new Float32Array(N);
  for (let i = 0; i < N; i++) input[i] = (bus.VL[i] + bus.VR[i]) * 0.015;
  const start = warmFrom(N, sr, 8);
  const nc = COMBS.length;
  const na = ALLPASSES.length;
  [L, R].forEach((ch, side) => {
    const extra = side ? STEREO_SPREAD : 0;
    const cb = COMBS.map((c) => new Float32Array(Math.max(1, Math.round((c + extra) * scale))));
    const ab = ALLPASSES.map((c) => new Float32Array(Math.max(1, Math.round((c + extra) * scale))));
    const ci = new Int32Array(nc);
    const ai = new Int32Array(na);
    const store = new Float64Array(nc);
    const wet = rv.wet * 3;
    for (let n = start; n < N * 2; n++) {
      const j = n < N ? n : n - N;
      let k = j - pre;
      if (k < 0) k += N;
      const x = input[k];
      let out = 0;
      for (let c = 0; c < nc; c++) {
        const buf = cb[c];
        const y = buf[ci[c]];
        store[c] = y * (1 - damp) + store[c] * damp;
        buf[ci[c]] = x + store[c] * room;
        if (++ci[c] >= buf.length) ci[c] = 0;
        out += y;
      }
      for (let a = 0; a < na; a++) {
        const buf = ab[a];
        const b = buf[ai[a]];
        buf[ai[a]] = out + b * 0.5;
        if (++ai[a] >= buf.length) ai[a] = 0;
        out = b - out;
      }
      if (n >= N) ch[j] += out * wet;
    }
  });
}

/**
 * ФВЧ первого порядка на всём миксе: срезает гул ниже ~30 Гц (тайко, гонг и басовые гулы копят его так, что маленькие
 * колонки хрипят). По кругу петли: первый проход только разогревает фильтр, второй пишет.
 */
function highPass(bus: Bus, cut: number): void {
  const N = bus.L.length;
  const r = 1 - (2 * Math.PI * cut) / bus.sr;
  for (const ch of [bus.L, bus.R]) {
    let x1 = ch[N - 1];
    let y = 0;
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < N; i++) {
        const x = ch[i];
        const out = x - x1 + r * y;
        x1 = x;
        y = out;
        if (pass === 1) ch[i] = out;
      }
  }
}

// ─── Рендер ──────────────────────────────────────────────────────────────

/** Сколько нот у трека — для доли готовности. */
function noteCount(song: Song): number {
  return song.parts.reduce((s, p) => s + p.seq.items.length, 0);
}

/**
 * Рендер по шагам: генератор отдаёт долю готовности (0..1) после каждой порции нот, в конце — готовый трек.
 * Воркер прогоняет его целиком; без воркера тот же генератор можно крутить кусками между кадрами.
 */
export function* renderSteps(song: Song, opts: RenderOpts = {}): Generator<number, Rendered> {
  const sr = opts.sr ?? SAMPLE_RATE;
  const onlyParts = opts.only;
  const N = Math.max(1, Math.round(songSeconds(song) * sr));
  const parts = song.parts.filter((p) => !onlyParts || onlyParts.includes(p.name));
  const wantEcho = !!song.echo && parts.some((p) => p.echo);
  const wantRev = !!song.reverb && parts.some((p) => p.rev);
  const bus: Bus = {
    L: new Float32Array(N),
    R: new Float32Array(N),
    EL: wantEcho ? new Float32Array(N) : null,
    ER: wantEcho ? new Float32Array(N) : null,
    VL: wantRev ? new Float32Array(N) : null,
    VR: wantRev ? new Float32Array(N) : null,
    sr,
    rnd: makeRnd(hashOf(song.id)),
    drums: new Map(),
  };
  const total = noteCount(song) || 1;
  // Небольшой разброс силы, всегда одинаковый: ряд одинаковых нот не звучит машинно.
  const human = makeRnd(1234567);
  let done = 0;
  for (const part of parts) {
    let prevMidi = 0;
    let prevEnd = -Infinity;
    const items = part.seq.items;
    for (let i = 0; i < items.length; i++) {
      const n = items[i];
      const t0 = secAt(song, n.t);
      const s0 = Math.round(t0 * sr);
      const vel = n.vel * (0.94 + 0.06 * human());
      if (part.inst === 'drums') hit(bus, n.drum ?? 'k', s0, vel, part);
      else {
        const gate = secAt(song, n.t + n.len) - t0;
        // Ширина аккорда: звуки, взятые разом, расходятся по панораме.
        let pan = part.pan;
        if (part.spread) {
          let first = i;
          while (first > 0 && items[first - 1].t === n.t) first--;
          let last = i;
          while (last < items.length - 1 && items[last + 1].t === n.t) last++;
          if (last > first) pan += part.spread * ((2 * (i - first)) / (last - first) - 1);
        }
        // Портаменто — только связной игрой: от ноты, которая звучала до этой или кончилась меньше чем за долю.
        const from = n.t - prevEnd < 1 ? prevMidi : 0;
        tone(bus, part.inst, s0, gate, n.midi, from, vel, outOf(pan, vel * part.inst.gain * part.vol, part.echo ?? 0, part.rev ?? 0));
        prevMidi = n.midi;
        prevEnd = n.t + n.len;
      }
      if (++done % 32 === 0) yield done / total;
    }
  }
  applyEcho(bus, song);
  applyReverb(bus, song);
  highPass(bus, 30);
  // Сведение: громкость к TARGET_RMS, пики — в лимитер. Отсчёты остаются 32-битными float.
  const { L, R } = bus;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sum += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sum / (2 * N));
  const g = rms > 0 ? Math.min(TARGET_RMS / rms, HEADROOM / peak) : 0;
  for (let i = 0; i < N; i++) {
    L[i] = limit(L[i] * g);
    R[i] = limit(R[i] * g);
  }
  return { sampleRate: sr, left: L, right: R, gain: g };
}

/** Рендер трека целиком. */
export function renderSong(song: Song, opts: RenderOpts = {}): Rendered {
  const it = renderSteps(song, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
