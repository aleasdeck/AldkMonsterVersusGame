/**
 * Рендер звуков действий (docs/zvuki.md). Звук — запись `Take`: слои по времени — ноты инструментов музыки
 * (src/ui/music/instruments.ts), удары её набора DRUMS и генераторы gens.ts. Звучит всё тем же синтезатором, что
 * музыка локаций: 44,1 кГц, 32-битный float, зал «Фривёрб» — только без петли, хвост зала уходит в тишину после звука.
 *
 * Сведение: громкость звука меряется самым громким окном в 50 мс (так ухо слышит короткое) и тянется к `TARGET`
 * плюс `level` звука в дБ, пики выше колена мягко прижимает тот же лимитер, что у музыки. Поэтому громкость слоёв
 * внутри звука — только баланс между ними, а громкость звука против других задаёт `level` в каталоге (sounds.ts).
 */
import { midiOf } from '../music/score';
import { DRUMS, finishShot, makeBus, playDrum, playNote, playSamples, SAMPLE_RATE, type Instrument } from '../music/synth';
import type { Gen } from './gens';

/** Зал: размер 0..1, глушение высоких 0..1, громкость, предзадержка мс — как у трека музыки. */
export interface Room {
  size: number;
  damp: number;
  wet: number;
  pre?: number;
}

/** Сила, панорама (−1 слева, у героя; +1 справа, у врагов), панорама в конце слоя и посыл в зал. */
export interface LayerOpts {
  vel?: number;
  pan?: number;
  panTo?: number;
  rev?: number;
}

type Layer = LayerOpts & { at: number } & ({ kind: 'note'; inst: Instrument; midi: number; len: number } | { kind: 'drum'; letter: string; cut?: number } | { kind: 'gen'; gen: Gen });

/** Запись звука: слои по времени в секундах. Методы возвращают саму запись — их можно вызывать цепочкой. */
export class Take {
  readonly layers: Layer[] = [];

  /** Нота или аккорд разом: «D4», «D3+A3+D4». */
  note(at: number, inst: Instrument, notes: string, len: number, o: LayerOpts = {}): this {
    for (const n of notes.split('+')) this.layers.push({ kind: 'note', at, inst, midi: midiOf(n.trim()), len, ...o });
    return this;
  }

  /** Ноты по очереди через `step` секунд: «D4 F4 A4 E5» — арпеджио. */
  arp(at: number, inst: Instrument, notes: string, step: number, len: number, o: LayerOpts = {}): this {
    notes
      .split(/\s+/)
      .filter(Boolean)
      .forEach((n, i) => this.note(at + i * step, inst, n, len, o));
    return this;
  }

  /** Удар набора музыки (DRUMS в synth.ts): K тайко, N гонг, q гром, z цепи, n скрип, a наковальня…; `cut` — оборвать. */
  drum(at: number, letter: string, o: LayerOpts & { cut?: number } = {}): this {
    if (!DRUMS[letter]) throw new Error(`Нет удара «${letter}»`);
    this.layers.push({ kind: 'drum', at, letter, ...o });
    return this;
  }

  gen(at: number, gen: Gen, o: LayerOpts = {}): this {
    this.layers.push({ kind: 'gen', at, gen, ...o });
    return this;
  }

  /** Вклеить другую запись со сдвигом (крит поверх удара клинком). */
  put(at: number, other: Take): this {
    for (const l of other.layers) this.layers.push({ ...l, at: l.at + at });
    return this;
  }
}

/** Готовый звук: float-каналы, частота, громкость самого громкого окна и пик после сведения, дБ; `raw` — громкость до сведения. */
export interface SfxRendered {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  loud: number;
  peak: number;
  raw: number;
}

/** Громкость звука с `level` 0 — самое громкое окно 50 мс, −15 дБ: на 2,5 дБ громче музыки по RMS, но не громче её пиков. */
const TARGET = Math.pow(10, -15 / 20);
const KNEE = 0.75;
const MAX_PEAK = 1.1;
/** Порог обрезки хвоста в игре, дБ от пика: ниже под музыкой не слышно, а память звуков на треть меньше. */
export const GAME_FLOOR_DB = -45;

/** Зал короткого звука по умолчанию: небольшое помещение, чтобы звук не стоял в пустоте. */
export const DEFAULT_ROOM: Room = { size: 0.5, damp: 0.5, wet: 0.16, pre: 10 };

function limit(x: number): number {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  const y = KNEE + (1 - KNEE) * Math.tanh((a - KNEE) / (1 - KNEE));
  return x < 0 ? -y : y;
}

/** Сколько звучит слой, с: нота — до конца отпускания, удар — до обрыва, генератор — своя длина. */
function layerSec(l: Layer): number {
  if (l.kind === 'note') return l.len + l.inst.env.r + (l.inst.wave === 'pluck' ? 0.05 : 0);
  if (l.kind === 'drum') return l.cut ?? DRUMS[l.letter].sec;
  return l.gen.sec;
}

/** Длина звука без хвоста зала, с. */
export function takeSeconds(take: Take): number {
  return Math.max(0, ...take.layers.map((l) => l.at + layerSec(l)));
}

/**
 * Звук в отсчёты: слои в шину, зал без петли, ФВЧ, обрезка тишины в конце и сведение к громкости `level` дБ.
 * `seed` — id звука: шум засеян им, звук всегда одинаковый. `floorDb` — порог обрезки хвоста от пика.
 */
export function renderTake(seed: string, take: Take, room: Room = DEFAULT_ROOM, level = 0, sr = SAMPLE_RATE, floorDb = -60): SfxRendered {
  const tail = 0.25 + room.size * 2.2 * Math.min(1, room.wet * 4);
  const N = Math.max(1, Math.ceil((takeSeconds(take) + tail) * sr));
  const bus = makeBus(N, sr, seed);
  for (const l of take.layers) {
    const s0 = Math.round(l.at * sr);
    const vel = l.vel ?? 0.8;
    const pan = l.pan ?? 0;
    const rev = l.rev ?? 0.25;
    if (l.kind === 'note') playNote(bus, l.inst, s0, l.len, l.midi, vel, pan, rev);
    else if (l.kind === 'drum') playDrum(bus, l.letter, s0, vel, pan, rev, l.cut);
    else {
      const gen = l.gen.make(bus.rnd, sr);
      const n = Math.ceil(l.gen.sec * sr);
      const fade = Math.min(n, Math.round(0.006 * sr));
      const smp = new Float32Array(n);
      for (let i = 0; i < n; i++) smp[i] = gen(i / sr) * Math.min(1, (n - i) / fade);
      playSamples(bus, smp, s0, vel, pan, l.panTo ?? pan, rev);
    }
  }
  finishShot(bus, room);
  const { L, R } = bus;
  // Хвост: последний отсчёт громче `floorDb` от пика (на странице −60 дБ, в игре −45: под музыкой тише не слышно, а память
  // звуков от этого на треть меньше), дальше — тишина, её отрезаем с гашением 20 мс.
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const floor = peak * Math.pow(10, floorDb / 20);
  let end = N;
  while (end > 1 && Math.abs(L[end - 1]) < floor && Math.abs(R[end - 1]) < floor) end--;
  end = Math.min(N, end + Math.round(0.02 * sr));
  const fade = Math.round(0.02 * sr);
  const left = L.slice(0, end);
  const right = R.slice(0, end);
  for (let i = Math.max(0, end - fade); i < end; i++) {
    const k = (end - i) / fade;
    left[i] *= k;
    right[i] *= k;
  }
  // Громкость — самое громкое окно 50 мс с шагом 10 мс.
  const win = Math.round(0.05 * sr);
  const hop = Math.round(0.01 * sr);
  let loud = 0;
  for (let a = 0; a < Math.max(1, end - win + 1); a += hop) {
    let s = 0;
    const b = Math.min(end, a + win);
    for (let i = a; i < b; i++) s += left[i] * left[i] + right[i] * right[i];
    loud = Math.max(loud, Math.sqrt(s / (2 * Math.max(1, b - a))));
  }
  const g = loud > 0 ? Math.min((TARGET * Math.pow(10, level / 20)) / loud, MAX_PEAK / peak) : 0;
  let outPeak = 0;
  for (let i = 0; i < end; i++) {
    left[i] = limit(left[i] * g);
    right[i] = limit(right[i] * g);
    outPeak = Math.max(outPeak, Math.abs(left[i]), Math.abs(right[i]));
  }
  return { sampleRate: sr, left, right, loud: 20 * Math.log10(Math.max(1e-9, loud * g)), peak: 20 * Math.log10(Math.max(1e-9, outPeak)), raw: 20 * Math.log10(Math.max(1e-9, loud)) };
}
