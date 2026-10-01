/**
 * Генераторы звуков действий (docs/zvuki.md): шумы, удары, металл, стекло, треск, пузыри и голоса — то, чего нет среди
 * инструментов музыки. Генератор устроен как удар набора DRUMS (synth.ts): длина в секундах и `make(rnd, sr)`, который
 * отдаёт отсчёт по времени удара; render.ts считает его в отсчёты и кладёт в шину с панорамой и посылом в зал.
 * Случайность — только из `rnd` шины (засеян id звука): звук всегда одинаковый.
 *
 * Числа здесь — физика звука: частоты мод металла и стекла, время спада, полосы шума. Звук целиком собирается в
 * sounds.ts из этих кирпичей и нот инструментов музыки.
 */

/** Генератор: длина звучания, с, и рисунок отсчётов по времени (зовётся подряд, t растёт с шагом 1/sr). */
export interface Gen {
  sec: number;
  make: (rnd: () => number, sr: number) => (t: number) => number;
}

/** Мода — затухающий синус: частота Гц, время спада с (до 1/e), громкость. */
export type Mode = [freq: number, tau: number, gain: number];

// ─── Фильтры ─────────────────────────────────────────────────────────────

/**
 * Фильтр переменного состояния (TPT, Задорожный): ФНЧ, полоса и ФВЧ сразу, срез можно менять на каждом отсчёте без
 * щелчков и без развала на высоких частотах — на нём держатся все свисты и шорохи с ездящей полосой.
 */
function svf(sr: number) {
  let ic1 = 0;
  let ic2 = 0;
  const out = { lp: 0, bp: 0, hp: 0 };
  return (x: number, fc: number, q: number) => {
    const g = Math.tan((Math.PI * Math.min(Math.max(fc, 10), sr * 0.45)) / sr);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out.lp = v2;
    out.bp = v1;
    out.hp = x - k * v1 - v2;
    return out;
  };
}

/** Полосовой биквад с пиком 0 дБ на постоянной частоте: форманты голоса, резонансы доски и стекла. */
function bandpass(sr: number, fc: number, q: number): (x: number) => number {
  const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b0 = al / a0;
  const b2 = -al / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - al) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Шум в полосе lo..hi: ФВЧ и ФНЧ первого порядка. */
function band(rnd: () => number, sr: number, lo: number, hi: number): () => number {
  const ah = 1 - Math.exp((-2 * Math.PI * lo) / sr);
  const al = 1 - Math.exp((-2 * Math.PI * hi) / sr);
  let h = 0;
  let l = 0;
  return () => {
    const x = rnd() * 2 - 1;
    h += ah * (x - h);
    l += al * (x - h - l);
    return l;
  };
}

const TAU = 2 * Math.PI;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Частота между f0 и f1 по доле k — по логарифму, как слышит ухо. */
const glide = (f0: number, f1: number, k: number): number => f0 * Math.pow(f1 / f0, clamp01(k));
/** Мягкое насыщение: громкое прижимается, тихое как есть. */
const sat = (x: number, d: number): number => (d ? Math.tanh(x * d) / Math.tanh(d) : x);

// ─── Воздух ──────────────────────────────────────────────────────────────

/**
 * Свист воздуха (взмах, бросок, полёт): шум через полосу, которая едет f0 → fPeak → f1, громкость нарастает к `peak`
 * (доля длины) и спадает. Взмах клинка — короткий и высокий, дубины — длинный и низкий.
 */
export function whoosh(o: { dur: number; f0: number; fPeak: number; f1?: number; q?: number; peak?: number; lp?: boolean }): Gen {
  const { dur, f0, fPeak } = o;
  const f1 = o.f1 ?? f0;
  const q = o.q ?? 1.2;
  const peak = o.peak ?? 0.6;
  return {
    sec: dur,
    make: (rnd, sr) => {
      const f = svf(sr);
      return (t) => {
        const x = t / dur;
        const env = x < peak ? Math.sin((x / peak) * (Math.PI / 2)) ** 2 : Math.cos(((x - peak) / (1 - peak)) * (Math.PI / 2)) ** 2;
        const fc = x < peak ? glide(f0, fPeak, x / peak) : glide(fPeak, f1, (x - peak) / (1 - peak));
        const r = f(rnd() * 2 - 1, fc, q);
        return (o.lp ? r.lp : r.bp * Math.sqrt(q)) * env * 1.4;
      };
    },
  };
}

/**
 * Шипение и шорох: шум в полосе lo..hi с атакой и спадом; `flutter` — дрожь громкости (пергамент, ткань, дым, кислота).
 */
export function hiss(o: { dur: number; lo: number; hi: number; attack?: number; tau?: number; flutter?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const nz = band(rnd, sr, o.lo, o.hi);
      const a = o.attack ?? 0.01;
      const tau = o.tau ?? o.dur / 3;
      let fl = 1;
      let target = 1;
      const fa = 1 - Math.exp(-1 / (0.012 * sr));
      return (t) => {
        if (o.flutter) {
          if (rnd() < 60 / sr) target = 1 - o.flutter * rnd();
          fl += fa * (target - fl);
        }
        return nz() * Math.min(1, t / a) * Math.exp(-Math.max(0, t - a) / tau) * fl * 2.2;
      };
    },
  };
}

/** Короткий выброс шума в полосе — шлепок, хруст, вспышка; основа почти любого удара. */
export function burst(o: { lo: number; hi: number; tau: number; attack?: number }): Gen {
  return hiss({ dur: Math.min(1.5, o.tau * 7 + (o.attack ?? 0.001)), lo: o.lo, hi: o.hi, attack: o.attack ?? 0.001, tau: o.tau });
}

/** Гул и раскат: тёмный шум двумя ФНЧ, нарастает за `attack`, катится и спадает; `wobble` — раскаты грома. */
export function rumble(o: { dur: number; cut: number; attack?: number; tau?: number; wobble?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      let l1 = 0;
      let l2 = 0;
      const a = 1 - Math.exp((-2 * Math.PI * o.cut) / sr);
      const att = o.attack ?? 0.05;
      const tau = o.tau ?? o.dur / 3;
      const wob = o.wobble ?? 0;
      return (t) => {
        l1 += a * (rnd() * 2 - 1 - l1);
        l2 += a * (l1 - l2);
        const w = wob ? 1 - wob * (0.5 + 0.5 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1)) : 1;
        return l2 * Math.min(1, t / att) * Math.exp(-Math.max(0, t - att) / tau) * w * (14000 / (o.cut + 200)) ** 0.5 * 0.9;
      };
    },
  };
}

/** Пламя: ревущий тёмный шум, полоса которого дышит, — костёр, факел, полёт огненного шара. */
export function flame(o: { dur: number; cut?: number; attack?: number; release?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const f = svf(sr);
      const base = o.cut ?? 700;
      const att = o.attack ?? 0.08;
      const rel = o.release ?? 0.25;
      let wob = 0;
      let target = 0;
      const wa = 1 - Math.exp(-1 / (0.03 * sr));
      return (t) => {
        if (rnd() < 25 / sr) target = rnd() * 2 - 1;
        wob += wa * (target - wob);
        const env = Math.min(1, t / att) * Math.min(1, Math.max(0, (o.dur - t) / rel));
        const r = f(rnd() * 2 - 1, base * (1 + 0.6 * wob), 0.9);
        return (r.lp * 1.6 + r.bp * 0.5) * env * (0.8 + 0.3 * wob);
      };
    },
  };
}

// ─── Удары ───────────────────────────────────────────────────────────────

/**
 * Глухой удар — тело, земля, щит изнутри: синус, который падает по высоте f0 → f1 за `drop` с, спадает за `tau`, плюс
 * щелчок шума на касании. `drive` — перегруз: удар толще и злее.
 */
export function thud(o: { f0: number; f1: number; tau: number; drop?: number; click?: number; drive?: number }): Gen {
  return {
    sec: Math.min(2.5, o.tau * 7),
    make: (rnd, sr) => {
      let ph = 0;
      const drop = o.drop ?? o.tau * 0.6;
      const click = o.click ?? 0.3;
      const lp = band(rnd, sr, 200, 4000);
      return (t) => {
        ph += (o.f1 + (o.f0 - o.f1) * Math.exp(-t / drop)) / sr;
        const x = Math.sin(TAU * ph) * Math.exp(-t / o.tau) * Math.min(1, t / 0.0015) + lp() * click * 2 * Math.exp(-t / 0.006);
        return sat(x, o.drive ?? 0);
      };
    },
  };
}

/**
 * Металл, дерево, кость, стекло — набор мод: затухающие синусы со случайной фазой, возбуждённые коротким шумом.
 * `scale` — сдвиг всех частот (тот же предмет больше или меньше), `damp` — во сколько раз короче звон.
 */
export function modal(modes: Mode[], o: { scale?: number; damp?: number; strike?: number; strikeTau?: number; beat?: number } = {}): Gen {
  const scale = o.scale ?? 1;
  const damp = o.damp ?? 1;
  const longest = Math.max(...modes.map((m) => m[1])) / damp;
  return {
    sec: Math.min(4, longest * 6.5 + 0.02),
    make: (rnd, sr) => {
      const ms = modes.map(([f, tau, g]) => ({ w: (TAU * f * scale) / sr, d: Math.exp(-1 / ((tau / damp) * sr)), g, ph: rnd() * TAU, amp: 1, beat: (o.beat ?? 0) * (rnd() - 0.5) }));
      const strike = o.strike ?? 0.35;
      const sTau = o.strikeTau ?? 0.003;
      const hp = band(rnd, sr, 1500, 12000);
      let n = 0;
      const sum = ms.reduce((s, m) => s + m.g, 0) || 1;
      return () => {
        let v = 0;
        for (const m of ms) {
          v += Math.sin(m.ph + n * m.w * (1 + m.beat * 0.004)) * m.amp * m.g;
          m.amp *= m.d;
        }
        const t = n / sr;
        n++;
        return (v / sum) * 1.6 * Math.min(1, t / 0.0008) + hp() * strike * 2 * Math.exp(-t / sTau);
      };
    },
  };
}

/** Звонкая сталь клинка — «дзынь» удара мечом. */
export const STEEL: Mode[] = [[1840, 0.09, 1], [2970, 0.07, 0.75], [4310, 0.05, 0.55], [5620, 0.035, 0.4], [7480, 0.025, 0.25]];
/** Глухое железо лат — лязг доспеха. */
export const ARMOR: Mode[] = [[410, 0.07, 1], [980, 0.06, 0.8], [1630, 0.045, 0.6], [2470, 0.035, 0.45], [3550, 0.025, 0.3]];
/** Щит гудит под ударом: низкие моды держатся долго, пары мод бьются. */
export const SHIELD: Mode[] = [[220, 0.45, 1], [233, 0.4, 0.6], [540, 0.3, 0.7], [1010, 0.22, 0.5], [1590, 0.16, 0.35], [2380, 0.11, 0.25], [3300, 0.07, 0.15]];
/** Доска, древко, деревянный щит. */
export const WOOD: Mode[] = [[190, 0.06, 1], [430, 0.045, 0.8], [760, 0.035, 0.6], [1180, 0.025, 0.4], [1900, 0.015, 0.25]];
/** Кость и камень — сухой короткий щелчок. */
export const BONE: Mode[] = [[1150, 0.014, 1], [2380, 0.01, 0.7], [3900, 0.007, 0.4]];
/** Толстое стекло склянки и лёд — высокий долгий звон. */
export const GLASS_MODES: Mode[] = [[2890, 0.16, 1], [4760, 0.11, 0.7], [7110, 0.07, 0.45], [9300, 0.05, 0.3]];
/** Глыба льда: ниже и дольше стекла. */
export const ICE: Mode[] = [[1320, 0.5, 1], [2890, 0.38, 0.75], [4150, 0.28, 0.55], [5980, 0.2, 0.35], [8100, 0.12, 0.2]];

/**
 * Треск: редкие щелчки (пуассоновский поток) через резонанс в полосе lo..hi — огонь, лёд, хруст кости, искры.
 * `rate` — щелчков в секунду в начале и в конце, `q` — звонкость щелчка.
 */
export function crackle(o: { dur: number; rate: number; rateEnd?: number; lo: number; hi: number; q?: number; tau?: number; attack?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const q = o.q ?? 4;
      const res = [0, 1, 2].map((i) => bandpass(sr, glide(o.lo, o.hi, (i + 0.5) / 3), q));
      const tau = o.tau ?? o.dur;
      const att = o.attack ?? 0.002;
      const r1 = o.rateEnd ?? o.rate;
      return (t) => {
        const x = t / o.dur;
        const rate = o.rate + (r1 - o.rate) * x;
        let imp = 0;
        let which = 0;
        if (rnd() < rate / sr) {
          imp = (rnd() * 2 - 1) * (0.3 + rnd());
          which = (rnd() * 3) | 0;
        }
        let v = 0;
        for (let i = 0; i < 3; i++) v += res[i](i === which ? imp : 0);
        return v * q * 5 * Math.min(1, t / att) * Math.exp(-t / tau);
      };
    },
  };
}

/** Россыпь мелких ударов модами — звон монет, осколки стекла, обломки лат. */
export function scatter(o: { n: number; spread: number; modes: Mode[]; fVar?: number; decay?: number; strike?: number }): Gen {
  const longest = Math.max(...o.modes.map((m) => m[1]));
  return {
    sec: o.spread + longest * 6,
    make: (rnd, sr) => {
      const hits = Array.from({ length: o.n }, (_, i) => {
        const at = i === 0 ? 0 : rnd() * o.spread;
        const k = 1 + (rnd() * 2 - 1) * (o.fVar ?? 0.15);
        const g = Math.pow(o.decay ?? 1, i) * (0.5 + 0.5 * rnd());
        return { at, g, ms: o.modes.map(([f, tau, mg]) => ({ w: (TAU * f * k) / sr, tau, mg, ph: rnd() * TAU })) };
      });
      const hp = band(rnd, sr, 2000, 12000);
      let n = 0;
      return () => {
        const t = n / sr;
        n++;
        let v = 0;
        let s = 0;
        for (const h of hits) {
          const dt = t - h.at;
          if (dt < 0) continue;
          for (const m of h.ms) v += Math.sin(m.ph + m.w * dt * sr) * Math.exp(-dt / m.tau) * m.mg * h.g;
          if (dt < 0.004) s += h.g * Math.exp(-dt / 0.0012);
        }
        return v * 0.7 + hp() * s * (o.strike ?? 0.5);
      };
    },
  };
}

// ─── Вода и кровь ────────────────────────────────────────────────────────

/** Пузыри: синусы, которые растут по высоте и гаснут, — бульканье яда, глоток зелья, болотная жижа. */
export function bubbles(o: { dur: number; rate: number; lo: number; hi: number; tau?: number; rise?: number }): Gen {
  return {
    sec: o.dur + 0.1,
    make: (rnd, sr) => {
      const live: { f: number; t0: number; g: number; ph: number }[] = [];
      const tau = o.tau ?? 0.035;
      const rise = o.rise ?? 2.5;
      return (t) => {
        if (t < o.dur && rnd() < o.rate / sr) live.push({ f: glide(o.lo, o.hi, rnd()), t0: t, g: 0.4 + 0.6 * rnd(), ph: 0 });
        let v = 0;
        for (let i = live.length - 1; i >= 0; i--) {
          const b = live[i];
          const dt = t - b.t0;
          if (dt > tau * 7) {
            live.splice(i, 1);
            continue;
          }
          b.ph += (b.f * (1 + (rise * dt) / (tau * 3))) / sr;
          v += Math.sin(TAU * b.ph) * Math.exp(-dt / tau) * Math.min(1, dt / 0.002) * b.g;
        }
        return v * 0.8;
      };
    },
  };
}

/** Чавканье: шум через резонансный ФНЧ, который падает f0 → f1, — рана, брызги крови, плевок. */
export function squelch(o: { dur: number; f0: number; f1: number; q?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const f = svf(sr);
      const q = o.q ?? 3;
      return (t) => {
        const x = t / o.dur;
        const r = f(rnd() * 2 - 1, glide(o.f0, o.f1, Math.sqrt(x)), q);
        return r.lp * Math.min(1, t / 0.003) * (1 - x) ** 2 * 1.3;
      };
    },
  };
}

// ─── Высота ──────────────────────────────────────────────────────────────

/** Скольжение тона f0 → f1 (синус или треугольник) — вытягивание маны, хлопок пробки, «тёмный хлопок» сгустка. */
export function chirp(o: { dur: number; f0: number; f1: number; tri?: boolean; attack?: number; trem?: number }): Gen {
  return {
    sec: o.dur,
    make: (_rnd, sr) => {
      let ph = 0;
      const a = o.attack ?? 0.003;
      return (t) => {
        const x = t / o.dur;
        ph += glide(o.f0, o.f1, x) / sr;
        const p = ph - Math.floor(ph);
        const w = o.tri ? (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) : Math.sin(TAU * ph);
        const tr = o.trem ? 1 - 0.5 * (1 + Math.sin(TAU * o.trem * t)) * 0.6 : 1;
        return w * Math.min(1, t / a) * (1 - x) ** 1.5 * tr;
      };
    },
  };
}

/** Скрежет: шум через несколько узких резонансов, которые едут по высоте, и зернистая громкость — точильный камень, отмычка. */
export function scrape(o: { dur: number; f0: number; f1: number; q?: number; grit?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const fs = [svf(sr), svf(sr), svf(sr)];
      const ratios = [1, 1.47, 2.13];
      const q = o.q ?? 25;
      let g = 1;
      return (t) => {
        const x = t / o.dur;
        if (rnd() < 400 / sr) g = 1 - (o.grit ?? 0.6) * rnd();
        const fc = glide(o.f0, o.f1, x);
        const n = rnd() * 2 - 1;
        let v = 0;
        for (let i = 0; i < 3; i++) v += fs[i](n, fc * ratios[i], q).bp / (i + 1);
        return ((v * 1.5) / Math.sqrt(q)) * g * Math.sin(Math.PI * x) ** 0.6;
      };
    },
  };
}

/** Электрический треск молнии: рваный шум, включаемый случайным прямоугольником, плюс низкое жужжание разряда. */
export function zap(o: { dur: number; buzz?: number }): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const hp = band(rnd, sr, 900, 11000);
      let gate = 1;
      let ph = 0;
      const buzz = o.buzz ?? 0.35;
      return (t) => {
        const x = t / o.dur;
        if (rnd() < 180 / sr) gate = rnd() < 0.55 ? 1 : 0.15;
        ph += 110 / sr;
        const saw = 2 * (ph - Math.floor(ph)) - 1;
        return (hp() * gate * 1.8 + sat(saw * 2, 2) * buzz) * (1 - x) ** 1.2 * Math.min(1, t / 0.001);
      };
    },
  };
}

// ─── Голос ───────────────────────────────────────────────────────────────

/** Гласные голоса: форманты Гц / добротность / громкость (те же, что у хоров музыки, плюс «э» и «и»). */
export const VOWELS = {
  a: [[700, 6, 1], [1100, 8, 0.6], [2500, 10, 0.3]],
  o: [[450, 6, 1], [800, 8, 0.5], [2830, 10, 0.15]],
  u: [[325, 6, 1], [700, 8, 0.35], [2530, 10, 0.1]],
  e: [[500, 6, 1], [1700, 9, 0.5], [2500, 10, 0.3]],
  i: [[290, 6, 1], [2250, 10, 0.4], [3000, 12, 0.25]],
} satisfies Record<string, [number, number, number][]>;

/**
 * Голос без слов — рык, хрип, вой: пила голосовых связок и шум дыхания через форманты гласной. Высота — по точкам
 * `pitch` ([доля длины, Гц]), гласная может перетекать `vowel` → `vowelTo`, `size` растягивает форманты (больше 1 —
 * голос меньше и выше, меньше 1 — зверь крупнее), `drive` — надрыв.
 */
export function voice(o: {
  dur: number;
  pitch: [number, number][];
  vowel: keyof typeof VOWELS;
  vowelTo?: keyof typeof VOWELS;
  size?: number;
  noise?: number;
  drive?: number;
  attack?: number;
  release?: number;
  vib?: number;
}): Gen {
  return {
    sec: o.dur,
    make: (rnd, sr) => {
      const v0 = VOWELS[o.vowel];
      const v1 = VOWELS[o.vowelTo ?? o.vowel];
      const size = o.size ?? 1;
      const fs = v0.map(() => svf(sr));
      const noise = o.noise ?? 0.2;
      const att = o.attack ?? 0.04;
      const rel = o.release ?? 0.12;
      let ph = 0;
      let jit = 0;
      const dcR = 1 - (TAU * 20) / sr;
      let dcX = 0;
      let dcY = 0;
      return (t) => {
        const x = t / o.dur;
        let hz = o.pitch[0][1];
        for (let i = 1; i < o.pitch.length; i++) {
          const [x0, f0] = o.pitch[i - 1];
          const [x1, f1] = o.pitch[i];
          if (x >= x0 && x <= x1) hz = glide(f0, f1, (x - x0) / (x1 - x0 || 1));
          else if (x > x1) hz = f1;
        }
        if (rnd() < 80 / sr) jit = (rnd() * 2 - 1) * 0.02;
        ph += (hz * (1 + jit + (o.vib ? 0.012 * Math.sin(TAU * o.vib * t) : 0))) / sr;
        const p = ph - Math.floor(ph);
        const src = (2 * p - 1) * (1 - noise) + (rnd() * 2 - 1) * noise * 1.5;
        let v = 0;
        for (let i = 0; i < v0.length; i++) {
          const f = (v0[i][0] + (v1[i][0] - v0[i][0]) * x) * size;
          const q = v0[i][1];
          v += fs[i](src, f, q).bp * (v0[i][2] + (v1[i][2] - v0[i][2]) * x) * Math.sqrt(q);
        }
        const env = Math.min(1, t / att) * Math.min(1, Math.max(0, (o.dur - t) / rel));
        // Надрыв несимметричной волны даёт постоянную составляющую — её снимает блокиратор (ФВЧ ~20 Гц).
        const y = sat(v * 0.16, o.drive ?? 0.5);
        dcY = y - dcX + dcR * dcY;
        dcX = y;
        return dcY * env;
      };
    },
  };
}

// ─── Шаги ────────────────────────────────────────────────────────────────

/** Шаги по земле и гравию: глухой толчок плюс хруст, `n` шагов через `gap`, тише и тише, если `fade`. */
export function steps(o: { n: number; gap: number; fade?: number; grit?: number }): Gen {
  return {
    sec: o.n * o.gap + 0.3,
    make: (rnd, sr) => {
      const hits = Array.from({ length: o.n }, (_, i) => ({ at: i * o.gap * (1 + (rnd() - 0.5) * 0.1), g: Math.pow(o.fade ?? 1, i) * (0.8 + 0.2 * rnd()) }));
      const grit = band(rnd, sr, 1200, 6000);
      const low = band(rnd, sr, 60, 500);
      return (t) => {
        const g = grit();
        const l = low();
        let v = 0;
        for (const h of hits) {
          const dt = t - h.at;
          if (dt < 0 || dt > 0.25) continue;
          const body = Math.sin(TAU * (90 * dt + 1.6 * (1 - Math.exp(-dt / 0.02)))) * Math.exp(-dt / 0.035);
          // Гравий — зернистый: шум то пропадает, то вспыхивает.
          const crunch = g * (rnd() < 0.4 ? 1.6 : 0.4) * Math.exp(-dt / 0.05) * (o.grit ?? 0.5);
          v += h.g * (body * 0.9 + l * 1.4 * Math.exp(-dt / 0.03) + crunch);
        }
        return v;
      };
    },
  };
}
