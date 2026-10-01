/**
 * Синтезатор музыки локаций без DOM (docs/muzyka.md): трек целиком превращается в 16-битный стерео-PCM с частотой 32 кГц,
 * как у SNES. Звук — в духе 16-битных приставок: FM-бас и колокола (Mega Drive), прямоугольники с переменной скважностью,
 * пила и треугольник, органные таблицы, шумовые барабаны, а поверх — эхо с затуханием и фильтром (DSP-эхо SNES).
 *
 * Трек — бесшовная петля: хвосты нот и эха с конца петли заворачиваются в её начало, поэтому `loop = true` у источника
 * не щёлкает на стыке. Один и тот же код рендерит в игре (Web Worker, worker.ts) и в инструменте tools/music-render.mjs.
 * Случайность (шум барабанов, фазы хоруса) — свой детерминированный генератор: трек всегда звучит одинаково.
 */
import { freqOf, type Seq } from './score';

export const SAMPLE_RATE = 32000;

/** Огибающая громкости: атака и спад в секундах, уровень удержания 0..1, отпускание в секундах. */
export interface Env {
  a: number;
  d: number;
  s: number;
  r: number;
}

export interface Instrument {
  /** pulse — прямоугольник со скважностью, saw — пила, tri — треугольник, sine, fm — два оператора, table — органная таблица гармоник. */
  wave: 'pulse' | 'saw' | 'tri' | 'sine' | 'fm' | 'table';
  /** Скважность прямоугольника 0..1 (0.5 — меандр, 0.125 — тонкий «писк»). */
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
  /** Второй такой же генератор выше на столько центов — хорус. */
  detune?: number;
  /** Перегруз до фильтра (гитара Пещер): 0 — чисто. */
  drive?: number;
  env: Env;
  /** Фильтр нижних частот (две ступени по 6 дБ): срез Гц, прибавка от частоты ноты, прибавка огибающей и её время. */
  cutoff?: number;
  track?: number;
  cutEnv?: number;
  cutTime?: number;
  /** Вибрато: частота Гц, глубина в центах, задержка с. */
  vib?: { rate: number; depth: number; delay: number };
  /** Подъезд к ноте: полутона и время с (минус — снизу). */
  bend?: { semis: number; time: number };
  /** Портаменто от прошлой ноты партии, с. */
  glide?: number;
  /** Шум дыхания (флейта, кларнет) 0..1. */
  breath?: number;
  gain: number;
}

/** Партия трека: инструмент (или барабаны набора DRUMS), ноты, громкость, панорама −1..1 и доля в эхо. */
export interface Part {
  name: string;
  inst: Instrument | 'drums';
  seq: Seq;
  vol: number;
  pan: number;
  echo: number;
}

export interface Song {
  id: string;
  /** Название для паузы и инструмента. */
  title: string;
  bpm: number;
  beatsPerBar: number;
  /** Свинг восьмых: на сколько доли восьмой сдвигается слабая восьмая (0.17 ≈ триольный). */
  swing?: number;
  /** Эхо: задержка в долях, обратная связь, громкость, срез фильтра в петле Гц, перекрёстная связь каналов. */
  echo: { beats: number; fb: number; wet: number; tone: number; cross?: number };
  parts: Part[];
}

/** Готовый трек: 16-битные каналы, их частота и множитель сведения (во сколько раз трек подняли до TARGET_RMS). */
export interface Rendered {
  sampleRate: number;
  left: Int16Array;
  right: Int16Array;
  gain: number;
}

/** Частота рендера и, для инструмента, только эти партии (послушать партию отдельно, свести баланс). */
export interface RenderOpts {
  sr?: number;
  only?: string[];
}

/**
 * Громкость трека после сведения (RMS). Пики выше KNEE мягко прижимает лимитер (`limit`): одиночные удары барабанов
 * не делают трек тише остальных. Но поднять трек больше чем на HEADROOM над его пиком нельзя — иначе лимитер
 * начнёт душить уже не удары, а музыку.
 */
const TARGET_RMS = 0.15;
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

// ─── Шина ────────────────────────────────────────────────────────────────

/** Сухие каналы и посыл в эхо; запись заворачивается по кругу — петля без шва. */
interface Bus {
  L: Float32Array;
  R: Float32Array;
  EL: Float32Array;
  ER: Float32Array;
  sr: number;
  rnd: () => number;
  /** Готовые сэмплы ударных этого трека (drumSample). */
  drums: Map<string, Float32Array>;
}

function panGains(pan: number): [number, number] {
  const th = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(th), Math.sin(th)];
}

/** Одна нота инструмента с начала s0 (в отсчётах), gate — сколько секунд держится до отпускания. */
function tone(bus: Bus, inst: Instrument, s0: number, gate: number, midi: number, fromMidi: number, vel: number, amp: number, pan: number, send: number): void {
  const sr = bus.sr;
  const N = bus.L.length;
  const e = inst.env;
  const a = Math.max(e.a, 0.002);
  const tau = Math.max(e.d, 0.001) / 3;
  const sus = e.s;
  const rel = Math.max(e.r, 0.012);
  // Огибающая считается по шагам, без экспоненты на каждый отсчёт: атака — прямая, спад — умножением, отпускание —
  // квадрат убывающей доли (доходит до нуля ровно, без щелчка).
  const invSr = 1 / sr;
  const attackS = Math.max(1, Math.round(a * sr));
  const gateS = Math.max(1, Math.round(Math.max(gate, 0.01) * sr));
  const decayMul = Math.exp(-1 / (tau * sr));
  const relStep = 1 / (rel * sr);
  const total = gateS + Math.ceil(rel * sr);
  let dec = 1 - sus;
  let atGate = 0;
  let relQ = 1;
  const [pl, pr] = panGains(pan);
  const k = vel * inst.gain * amp;
  const gL = pl * k;
  const gR = pr * k;
  const sL = gL * send;
  const sR = gR * send;
  const freq = freqOf(midi);
  const glideSemis = inst.glide && fromMidi ? fromMidi - midi : 0;
  const det = inst.detune ? Math.pow(2, inst.detune / 1200) : 0;
  const filt = inst.cutoff !== undefined;
  const table = inst.wave === 'table' ? tableOf(inst.harmonics ?? [1]) : null;
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
  // FM с модулятором ×1 даёт боковую полосу на нуле герц — постоянную составляющую, которая гудит под басом.
  // Её снимает блокиратор постоянного тока: ФВЧ около 20 Гц на каждой ноте.
  const dcR = 1 - (2 * Math.PI * 20) / sr;
  let dcX = 0;
  let dcY = 0;
  let ph = 0;
  let ph2 = bus.rnd();
  let pm = 0;
  let prevMod = 0;
  let y1 = 0;
  let y2 = 0;
  let ca = 1;
  let dt = freq / sr;
  let duty = inst.duty ?? 0.5;
  let index = i0;
  let idx = s0 % N;
  for (let n = 0; n < total; n++) {
    // Высота, срез и прочие модуляции — раз в 16 отсчётов (2 кГц хватает и вибрато, и подъезду).
    if ((n & 15) === 0) {
      const t = n * invSr;
      let semis = 0;
      if (inst.bend) {
        const q = 1 - t / inst.bend.time;
        if (q > 0) semis += inst.bend.semis * q * q;
      }
      if (glideSemis) {
        const q = 1 - t / inst.glide!;
        if (q > 0) semis += glideSemis * q;
      }
      if (inst.vib) {
        const ramp = Math.min(1, Math.max(0, (t - inst.vib.delay) / 0.25));
        if (ramp > 0) semis += (inst.vib.depth / 100) * ramp * sinC(inst.vib.rate * t);
      }
      const f = semis ? freq * Math.pow(2, semis / 12) : freq;
      dt = f / sr;
      if (filt) {
        const fc = Math.min(((inst.cutoff ?? 0) + (inst.track ?? 0) * f + (inst.cutEnv ? inst.cutEnv * Math.exp(-t / (inst.cutTime ?? 0.1)) : 0)) * bright, sr * 0.45);
        ca = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      }
      if (inst.pwm) duty = (inst.duty ?? 0.5) + inst.pwm.depth * sinC(inst.pwm.rate * t);
      if (inst.wave === 'fm') index = i1 + (i0 - i1) * Math.exp(-t / iT);
    }
    let v: number;
    if (inst.wave === 'fm') {
      pm += dt * ratio;
      if (pm >= 1) pm -= 1;
      const mod = sinC(pm + fb * prevMod);
      prevMod = mod;
      v = sinC(ph + (index * mod) / (2 * Math.PI));
    } else if (table) {
      v = tableC(table, ph);
      if (det) v = 0.5 * (v + tableC(table, ph2));
    } else {
      v = osc(inst.wave, ph, dt, duty);
      if (det) v = 0.5 * (v + osc(inst.wave, ph2, dt * det, duty));
    }
    ph += dt;
    if (ph >= 1) ph -= 1;
    if (det) {
      ph2 += dt * det;
      if (ph2 >= 1) ph2 -= 1;
    }
    if (breath) v += breath * (bus.rnd() * 2 - 1);
    if (drive) {
      const x = v * drive;
      v = (x / (1 + Math.abs(x))) * driveNorm;
    }
    if (filt) {
      y1 += ca * (v - y1);
      y2 += ca * (y1 - y2);
      v = y2;
    }
    dcY = v - dcX + dcR * dcY;
    dcX = v;
    v = dcY;
    let env: number;
    if (n < gateS) {
      if (n < attackS) env = n / attackS;
      else {
        env = sus + dec;
        dec *= decayMul;
      }
      atGate = env;
    } else {
      relQ -= relStep;
      env = relQ > 0 ? atGate * relQ * relQ : 0;
    }
    v *= env;
    bus.L[idx] += v * gL;
    bus.R[idx] += v * gR;
    if (send) {
      bus.EL[idx] += v * sL;
      bus.ER[idx] += v * sR;
    }
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

/** Мягкая трапеция 0→1→0 с фронтами 6 мс: «квак» лягушки из двух слогов. */
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
 * Набор ударных по буквам: k бочка, s малый, h закрытая тарелка, o открытая, p шейкер, r римшот (кость), x хлопок,
 * c крэш, T/t/y низкий/средний/высокий том, g/G литавра соль/до, d капля, i щелчок насекомого, a наковальня,
 * f кваканье, j бубен, w накат волны.
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
};

/**
 * Удар — готовый сэмпл: каждый вид рендерится один раз на трек и потом только подмешивается с силой удара, как
 * сэмплы ударных на SNES. Это и быстрее раз в десять, и честнее к эпохе: каждый удар звучит одинаково.
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

function hit(bus: Bus, kind: string, s0: number, vel: number, amp: number, pan: number, send: number): void {
  const smp = drumSample(bus, kind);
  const N = bus.L.length;
  const [pl, pr] = panGains(pan + DRUMS[kind].pan);
  const k = vel * amp;
  const total = smp.length;
  let idx = s0 % N;
  for (let n = 0; n < total; n++) {
    const v = smp[n] * k;
    bus.L[idx] += v * pl;
    bus.R[idx] += v * pr;
    if (send) {
      bus.EL[idx] += v * pl * send;
      bus.ER[idx] += v * pr * send;
    }
    if (++idx >= N) idx = 0;
  }
}

// ─── Рендер ──────────────────────────────────────────────────────────────

/** Эхо по кругу петли: два прохода, чтобы хвост конца успел лечь в начало. */
function applyEcho(bus: Bus, song: Song): void {
  const { L, R, EL, ER, sr } = bus;
  const N = L.length;
  const D = Math.max(1, Math.min(N - 1, Math.round(((song.echo.beats * 60) / song.bpm) * sr)));
  const fb = song.echo.fb;
  const cross = song.echo.cross ?? 0.35;
  const a = 1 - Math.exp((-2 * Math.PI * song.echo.tone) / sr);
  const eL = new Float32Array(N);
  const eR = new Float32Array(N);
  let lL = 0;
  let lR = 0;
  for (let i = 0; i < 2 * N; i++) {
    const j = i % N;
    let k = j - D;
    if (k < 0) k += N;
    const inL = EL[k] + fb * ((1 - cross) * eL[k] + cross * eR[k]);
    const inR = ER[k] + fb * ((1 - cross) * eR[k] + cross * eL[k]);
    lL += a * (inL - lL);
    lR += a * (inR - lR);
    eL[j] = lL;
    eR[j] = lR;
  }
  const wet = song.echo.wet;
  for (let j = 0; j < N; j++) {
    L[j] += wet * eL[j];
    R[j] += wet * eR[j];
  }
}

/**
 * ФВЧ первого порядка на всём миксе: срезает гул ниже ~30 Гц (бочка «галопом» и FM-бас копят его так, что маленькие
 * колонки хрипят). По кругу петли, как эхо: первый проход только разогревает фильтр, второй пишет.
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
  const bus: Bus = { L: new Float32Array(N), R: new Float32Array(N), EL: new Float32Array(N), ER: new Float32Array(N), sr, rnd: makeRnd(0x9e3779b9 ^ song.id.length * 7919), drums: new Map() };
  const total = noteCount(song) || 1;
  // Небольшой разброс силы, всегда одинаковый: ряд одинаковых нот не звучит машинно.
  const human = makeRnd(1234567);
  let done = 0;
  for (const part of song.parts) {
    if (onlyParts && !onlyParts.includes(part.name)) {
      done += part.seq.items.length;
      continue;
    }
    let prevMidi = 0;
    let prevEnd = -Infinity;
    for (const n of part.seq.items) {
      const t0 = secAt(song, n.t);
      const s0 = Math.round(t0 * sr);
      const vel = n.vel * (0.94 + 0.06 * human());
      if (part.inst === 'drums') hit(bus, n.drum ?? 'k', s0, vel, part.vol, part.pan, part.echo);
      else {
        const gate = secAt(song, n.t + n.len) - t0;
        // Портаменто — только связной игрой: от ноты, которая звучала до этой или кончилась меньше чем за долю.
        const from = n.t - prevEnd < 1 ? prevMidi : 0;
        tone(bus, part.inst, s0, gate, n.midi, from, vel, part.vol, part.pan, part.echo);
        prevMidi = n.midi;
        prevEnd = n.t + n.len;
      }
      if (++done % 48 === 0) yield done / total;
    }
  }
  applyEcho(bus, song);
  highPass(bus, 32);
  // Сведение: громкость к TARGET_RMS, пики — в лимитер; потом 16 бит — честные 16 бит, как у приставки.
  const { L, R } = bus;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sum += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sum / (2 * N));
  const g = rms > 0 ? Math.min(TARGET_RMS / rms, HEADROOM / peak) : 0;
  const left = new Int16Array(N);
  const right = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    left[i] = Math.round(limit(L[i] * g) * 32767);
    right[i] = Math.round(limit(R[i] * g) * 32767);
  }
  return { sampleRate: sr, left, right, gain: g };
}

/** Рендер трека целиком. */
export function renderSong(song: Song, opts: RenderOpts = {}): Rendered {
  const it = renderSteps(song, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
