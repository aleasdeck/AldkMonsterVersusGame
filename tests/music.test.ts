import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../src/data/locations';
import { SONGS } from '../src/ui/music/songs';
import { DRUMS, renderSong, secAt, songBeats, songSeconds, type Instrument, type Song } from '../src/ui/music/synth';
import { cat, degree, harmony, midiOf, parseChord, rest, scaleOf, score, under, MINOR } from '../src/ui/music/score';

describe('нотная запись', () => {
  it('ноты и аккорды', () => {
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('A4')).toBe(69);
    expect(midiOf('F#3')).toBe(54);
    expect(midiOf('Bb2')).toBe(46);
    expect(parseChord('Em')).toEqual({ root: 4, ivs: [0, 3, 7] });
    expect(parseChord('B7')).toEqual({ root: 11, ivs: [0, 4, 7, 10] });
    expect(() => parseChord('Hm')).toThrow();
  });

  it('ступени аккорда: терция и септима по аккорду, октавы штрихом и запятой', () => {
    const em = parseChord('Em').ivs;
    const b7 = parseChord('B7').ivs;
    expect(degree('3', em)).toBe(3);
    expect(degree('3', b7)).toBe(4);
    expect(degree('7', b7)).toBe(10);
    expect(degree("3'", em)).toBe(15);
    expect(degree('5,', em)).toBe(-5);
    expect(degree('b2', em)).toBe(1);
  });

  it('мелодия: «-» тянет, «.» обрывает, сила по суффиксу', () => {
    const m = score(4);
    const s = m.line('E5 - - B4! . . G4? -', 2);
    expect(s.beats).toBe(4);
    expect(s.items).toEqual([
      { t: 0, len: 1.5, midi: 76, vel: 0.8 },
      { t: 1.5, len: 0.5, midi: 71, vel: 1 },
      { t: 3, len: 1, midi: 67, vel: 0.5 },
    ]);
    // Без суффикса силу задаёт место в такте: первая доля громче остальных долей, доли громче долей между ними.
    const v = m.line('C4 D4 E4 F4 G4 A4 B4 C5', 2).items.map((n) => n.vel);
    expect(v[0]).toBeGreaterThan(v[2]);
    expect(v[2]).toBeGreaterThan(v[1]);
  });

  it('черта такта сверяет число токенов', () => {
    const m = score(4);
    expect(() => m.line('C4 - - | D4 - - -', 1)).toThrow(/Такт 1/);
    expect(() => m.line('C4 - -', 1)).toThrow();
    expect(() => m.drums('k...s...k.', 4)).toThrow();
  });

  it('партия по аккордам и подушка', () => {
    const m = score(4);
    const prog = m.chords('Em C_G');
    expect(prog.items.map((c) => [c.name, c.t, c.len])).toEqual([
      ['Em', 0, 4],
      ['C', 4, 2],
      ['G', 6, 2],
    ]);
    const bass = m.over(prog, '1 - 5 -', 1, 2);
    expect(bass.items.map((n) => n.midi)).toEqual([40, 47, 36, 50]);
    const pad = m.pad(prog, 62);
    for (const n of pad.items) expect(Math.abs(n.midi - 62)).toBeLessThanOrEqual(6);
  });

  it('второй голос: под нотой звук аккорда на 3–9 полутонов ниже; по гамме — терция ниже', () => {
    const m = score(4);
    const prog = m.chords('C');
    const tune = m.line('G5 F5 E5 C5', 1);
    const low = under(tune, prog);
    low.items.forEach((n, i) => {
      const gap = tune.items[i].midi - n.midi;
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(9);
      expect([0, 4, 7]).toContain(n.midi % 12);
    });
    const third = harmony(m.line('E5 B4 . .', 1), scaleOf('E', MINOR), -2);
    expect(third.items.map((n) => n.midi)).toEqual([midiOf('C5'), midiOf('G4')]);
  });

  it('склейка сдвигает время', () => {
    const m = score(4);
    const s = cat(m.line('C4 - - -', 1), rest(4), m.line('D4 - - -', 1));
    expect(s.beats).toBe(12);
    expect(s.items.map((n) => n.t)).toEqual([0, 8]);
  });
});

describe('треки локаций', () => {
  const all = Object.values(SONGS);

  it('у каждой локации свой трек', () => {
    for (const loc of LOCATIONS) {
      const song = SONGS[loc.id];
      expect(song, loc.id).toBeTruthy();
      expect(song.id).toBe(loc.id);
      expect(song.location).toBe(loc.id);
      expect(song.title.length).toBeGreaterThan(0);
      expect(song.mood.length).toBeGreaterThan(0);
    }
    expect(new Set(all.map((s) => s.title)).size).toBe(all.length);
  });

  it('все партии одной длины, целое число тактов, петля 40–80 с', () => {
    for (const song of all) {
      const beats = songBeats(song);
      expect(beats % song.beatsPerBar, song.id).toBe(0);
      for (const p of song.parts) {
        expect(p.seq.beats, `${song.id}: ${p.name}`).toBe(beats);
        for (const n of p.seq.items) expect(n.t, `${song.id}: ${p.name}`).toBeLessThan(beats);
      }
      const sec = songSeconds(song);
      expect(sec, song.id).toBeGreaterThan(40);
      expect(sec, song.id).toBeLessThan(80);
    }
  });

  it('ноты в разумном диапазоне, удары — из набора, имена партий не повторяются', () => {
    for (const song of all) {
      const names = song.parts.map((p) => p.name);
      expect(new Set(names).size, song.id).toBe(names.length);
      for (const p of song.parts) {
        expect(p.seq.items.length, `${song.id}: ${p.name}`).toBeGreaterThan(0);
        for (const n of p.seq.items) {
          if (p.inst === 'drums') expect(DRUMS[n.drum ?? ''], `${song.id}: ${p.name} «${n.drum}»`).toBeTruthy();
          else {
            expect(n.midi, `${song.id}: ${p.name}`).toBeGreaterThanOrEqual(midiOf('E1'));
            expect(n.midi, `${song.id}: ${p.name}`).toBeLessThanOrEqual(midiOf('G6'));
          }
        }
      }
    }
  });

  it('рендер: float без перегруза, не тишина, громкость к общей', () => {
    for (const song of all) {
      // Низкая частота — ради скорости теста: проверяется сведение, а не звук.
      const r = renderSong(song, { sr: 6000 });
      expect(r.left.length).toBe(Math.round(songSeconds(song) * 6000));
      let sum = 0;
      let peak = 0;
      let bad = 0;
      for (let i = 0; i < r.left.length; i++) {
        const v = r.left[i];
        if (!Number.isFinite(v)) bad++;
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      expect(bad, song.id).toBe(0);
      const rms = Math.sqrt(sum / r.left.length);
      expect(peak, song.id).toBeLessThanOrEqual(1);
      // Сведение тянет к −17,5 дБ; лимитер и запас по пику дают разброс в пару децибел.
      expect(rms, song.id).toBeGreaterThan(0.07);
      expect(rms, song.id).toBeLessThan(0.22);
    }
  });
});

describe('синтезатор', () => {
  const SINE: Instrument = { wave: 'sine', env: { a: 0.01, d: 0.1, s: 1, r: 0.1 }, gain: 1 };
  /** Трек из одной ноты, которая тянется через конец петли, с залом и эхом. */
  const seam: Song = {
    id: 'seam',
    location: 'forest',
    title: 'шов',
    mood: '',
    key: 'ля',
    bpm: 120,
    beatsPerBar: 4,
    echo: { beats: 0.5, fb: 0.3, wet: 0.3, tone: 3000 },
    reverb: { size: 0.8, damp: 0.5, wet: 0.2 },
    parts: [{ name: 'тон', inst: SINE, seq: { items: [{ t: 3, len: 2, midi: 69, vel: 0.8 }], beats: 4 }, vol: 1, pan: 0, echo: 0.5, rev: 0.3 }],
  };

  it('нота через конец петли продолжается в её начале — стык без щелчка', () => {
    const r = renderSong(seam, { sr: 16000 });
    const n = r.left.length;
    // Ля 440 Гц на 16 кГц: соседние отсчёты отличаются не больше чем на 2π·440/16000 амплитуды; у стыка — так же.
    let amp = 0;
    for (let i = n - 200; i < n; i++) amp = Math.max(amp, Math.abs(r.left[i]));
    expect(amp).toBeGreaterThan(0.03);
    const maxStep = amp * 2 * Math.PI * (440 / 16000) * 1.6;
    expect(Math.abs(r.left[0] - r.left[n - 1])).toBeLessThan(maxStep);
    let head = 0;
    for (let i = 0; i < 400; i++) head = Math.max(head, Math.abs(r.left[i]));
    expect(head).toBeGreaterThan(amp * 0.3);
  });

  it('один и тот же трек — те же отсчёты', () => {
    const parts = ['гобой', 'барабан', 'колокол'];
    for (const name of parts) expect(SONGS.swamp.parts.map((p) => p.name)).toContain(name);
    const a = renderSong(SONGS.swamp, { sr: 4000, only: parts });
    const b = renderSong(SONGS.swamp, { sr: 4000, only: parts });
    expect(a.left.some((v) => v !== 0)).toBe(true);
    // Typed-массивы в сотни тысяч отсчётов toEqual сравнивает секундами — сравниваем циклом.
    const same = (x: Float32Array, y: Float32Array): boolean => x.length === y.length && x.every((v, i) => v === y[i]);
    expect(same(a.left, b.left)).toBe(true);
    expect(same(a.right, b.right)).toBe(true);
  });

  it('свинг двигает слабую восьмую, сильные доли на месте', () => {
    const song: Song = { ...seam, swing: 0.16 };
    expect(secAt(song, 1)).toBeCloseTo(0.5);
    expect(secAt(song, 1.5)).toBeCloseTo((1 + 0.66) * 0.5);
    expect(secAt(seam, 1.5)).toBeCloseTo(0.75);
  });
});
