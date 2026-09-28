import { HERO_BODY_HEIGHT } from '../../data/characterSizes';
import { packMask, type MobMask } from '../mobs';
import { renderAvatar } from './avatar';
import { clipMs, contactMs, HERO_CLIPS, HERO_STYLE, renderHeroClip, type SculptClip } from './clips';
import { modelClip, modelClips, type HeroModel } from './model';
import { warriorModel } from './warrior';

/**
 * Герои пиксельной лепкой в игре (Воин первым; остальные пока рисованными листами — heroSprite.ts).
 * Каждый клип — своя картинка в ряд кадров (data URL): клипов у героя одиннадцать, и рисовать их все разом —
 * больше секунды, поэтому они запекаются по одному (`warmHero` — очередью из `App.warmArt()`, покой первым),
 * а клип, которого ещё нет, — сразу, когда понадобился. Кадры листает CSS (`.hero-sheet::before` в style.css).
 *
 * Спрайт занимает в разметке квадрат `px` по фигуре в покое, как прежний рисованный: середина фигуры — по середине
 * квадрата, земля — по его низу, а кадр целиком (с полем под выпад, замах и падение) рисуется `::before` поверх.
 * Идущий клип переживает `App.render()`: состояние лежит на герое, новый спрайт продолжает его с той же точки.
 */
export const HERO_MODELS: Record<string, HeroModel> = { warrior: warriorModel() };

/** Рисуется ли герой лепкой. */
export function hasHeroArt(id: string): boolean {
  return Object.hasOwn(HERO_MODELS, id);
}

/** Запечённый клип: картинка в ряд кадров, их число и силуэты (бит на клетку — по ним латы блока ложатся по контуру). */
interface BakedClip { url: string; n: number; masks: Uint8Array[] }
/**
 * Лист героя: размер кадра в клетках (`w`×`h`, пиксель `d`), опора в пикселях поля — середина фигуры в покое `ax`
 * и линия земли `ay` от левого верхнего угла кадра — и запечённые клипы.
 */
interface HeroBake { w: number; h: number; d: number; ax: number; ay: number; clips: Partial<Record<SculptClip, BakedClip>> }
const bakes = new Map<string, HeroBake>();

function bakeClip(id: string, clip: SculptClip): BakedClip {
  let hb = bakes.get(id);
  const hit = hb?.clips[clip];
  if (hit) return hit;
  const sh = renderHeroClip(HERO_MODELS[id], clip, HERO_STYLE);
  if (!hb) {
    // Опора — по первому кадру покоя: при отрисовке любого другого клипа сперва запекается покой.
    const idle = clip === 'idle' ? sh : renderHeroClip(HERO_MODELS[id], 'idle', HERO_STYLE);
    hb = { w: idle.w, h: idle.h, d: idle.d, ax: 0, ay: (idle.h - idle.foot) * idle.d, clips: {} };
    const f = idle.frames[0];
    let x0 = idle.w, x1 = 0;
    for (let j = 0; j < idle.h; j++) for (let i = 0; i < idle.w; i++) if (f[(j * idle.w + i) * 4 + 3] === 255) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); }
    hb.ax = ((x0 + x1 + 1) / 2) * idle.d;
    bakes.set(id, hb);
    if (clip !== 'idle') hb.clips.idle = pack(idle);
  }
  const out = pack(sh);
  hb.clips[clip] = out;
  return out;
}

function pack(sh: ReturnType<typeof renderHeroClip>): BakedClip {
  const n = sh.frames.length;
  const canvas = document.createElement('canvas');
  canvas.width = sh.w * n;
  canvas.height = sh.h;
  const ctx = canvas.getContext('2d');
  if (ctx) sh.frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), sh.w, sh.h), i * sh.w, 0));
  const url = canvas.toDataURL();
  // Картинку раскодировать заранее: иначе первый показ клипа мигает пустым кадром, пока браузер её разбирает.
  const img = new Image();
  img.src = url;
  void img.decode?.().catch(() => undefined);
  return { url, n, masks: sh.frames.map((f) => packMask(f, sh.w, sh.h)) };
}

/** Порядок прогрева: покой и то, что играет в первом же бою, — раньше; смерть — последней. */
const WARM_ORDER: SculptClip[] = ['idle', 'attack', 'block', 'hurt', 'heavy', 'power', 'heal', 'buff', ...(Object.keys(HERO_CLIPS) as SculptClip[]).filter((c) => HERO_CLIPS[c].own), 'death'];
const queue: Array<[string, SculptClip]> = [];
let warming = false;

/** Запечь клипы героя впрок, по одному за такт: первый удар в бою начинается без заминки. */
export function warmHero(id: string): void {
  if (!hasHeroArt(id)) return;
  const drawn = modelClips(HERO_MODELS[id]);
  for (const clip of WARM_ORDER.filter((c) => drawn.includes(c))) if (!bakes.get(id)?.clips[clip] && !queue.some(([h, c]) => h === id && c === clip)) queue.push([id, clip]);
  if (warming || queue.length === 0) return;
  warming = true;
  const next = (): void => {
    const job = queue.shift();
    if (!job) {
      warming = false;
      return;
    }
    bakeClip(job[0], job[1]);
    window.setTimeout(next, 40);
  };
  window.setTimeout(next, 40);
}

// ─── Аватарка ───────────────────────────────────────────────────────────────

const avatars = new Map<string, string>();

/**
 * Клеток в аватарке под размер на экране: крупная (плитка выбора 112, лист персонажа 80) — пиксель 2, как у врагов;
 * мелкая (консоль 44) — пиксель 1, иначе лицо в 22 клетки не читается; подсказка 24 ужимает ту же, что в консоли.
 */
export function avatarCells(px: number): number {
  return px >= 64 ? Math.round(px / 2) : 44;
}

/** Аватарка героя-лепки в data URL — рисуется при первом показе этого размера (≈10 мс) и дальше берётся готовой. */
export function heroAvatarUrl(id: string, px: number): string {
  const n = avatarCells(px);
  const key = `${id}:${n}`;
  let url = avatars.get(key);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    canvas.getContext('2d')?.putImageData(new ImageData(renderAvatar(HERO_MODELS[id], n), n, n), 0, 0);
    url = canvas.toDataURL();
    avatars.set(key, url);
  }
  return url;
}

// ─── Спрайт и клипы ─────────────────────────────────────────────────────────

const IDLE_MS = clipMs('idle');

/**
 * Состояние героя на экране: фаза покоя (сдвиг от общих часов) и идущий клип. Герой на экране один, поэтому
 * состояние — по id героя; смерть держит последний кадр, пока спрайт просят в смерти.
 */
interface HeroState { offset: number; run?: { clip: SculptClip; started: number } }
const states = new Map<string, HeroState>();
/** Что показывает элемент: герой и где у него кадр (в пикселях поля от левого верхнего угла квадрата). */
interface ElInfo { id: string; base: 'idle' | 'death'; fx: number; fy: number; fw: number; fh: number }
const byEl = new WeakMap<HTMLElement, ElInfo>();

function stateOf(id: string): HeroState {
  let st = states.get(id);
  if (!st) states.set(id, (st = { offset: 0 }));
  return st;
}

/** Клип кончился: покой продолжается с первого кадра — последний кадр клипа с ним совпадает. */
function endClip(st: HeroState): void {
  const run = st.run;
  if (!run) return;
  const end = run.started + clipMs(run.clip);
  st.offset = (IDLE_MS - (end % IDLE_MS)) % IDLE_MS;
  st.run = undefined;
}

function setClip(el: HTMLElement, id: string, clip: SculptClip, delay: number, once: boolean): void {
  const b = bakeClip(id, clip);
  el.style.setProperty('--sheet', `url(${b.url})`);
  el.style.setProperty('--n', String(b.n));
  el.style.setProperty('--dur', `${clipMs(clip)}ms`);
  el.style.setProperty('--delay', `${delay}ms`);
  el.classList.toggle('once', once);
}

/** Выставить на элемент клип и фазу: идущий клип с той же точки, смерть — до последнего кадра, иначе покой от общих часов. */
function apply(el: HTMLElement, now: number): void {
  const info = byEl.get(el);
  if (!info) return;
  const st = stateOf(info.id);
  if (info.base === 'death') {
    if (st.run?.clip !== 'death') st.run = { clip: 'death', started: now };
  } else if (st.run?.clip === 'death') st.run = undefined; // новый забег: герой снова стоит
  const run = st.run;
  if (run) {
    const elapsed = now - run.started;
    if (run.clip === 'death' || elapsed < clipMs(run.clip) - 1) {
      setClip(el, info.id, run.clip, -elapsed, true);
      return;
    }
    endClip(st);
  }
  setClip(el, info.id, 'idle', -((now + st.offset) % IDLE_MS), false);
}

/**
 * Спрайт героя-лепки: квадрат `px` по росту в покое (`HERO_BODY_HEIGHT` — масштаб 1, ровно пиксель `HERO_PIXEL`),
 * кадр рисуется поверх, земля — по низу квадрата. `base` — что играть без клипа: покой или смерть (держит последний кадр).
 */
export function heroSheetSprite(id: string, px: number, base: 'idle' | 'death' = 'idle'): HTMLElement {
  bakeClip(id, 'idle');
  const hb = bakes.get(id)!;
  const k = px / (HERO_BODY_HEIGHT[id] ?? 128);
  const info: ElInfo = { id, base, fx: Math.round(px / 2 - hb.ax * k), fy: Math.round(px - hb.ay * k), fw: hb.w * hb.d * k, fh: hb.h * hb.d * k };
  const el = document.createElement('div');
  el.className = 'sprite hero-sheet';
  el.dataset.hero = id;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', id);
  el.style.setProperty('--box', `${px}px`);
  el.style.setProperty('--fx', `${info.fx}px`);
  el.style.setProperty('--fy', `${info.fy}px`);
  el.style.setProperty('--fw', `${info.fw}px`);
  el.style.setProperty('--fh', `${info.fh}px`);
  byEl.set(el, info);
  apply(el, performance.now());
  el.addEventListener('animationend', (e) => {
    if (e.animationName !== 'hero-once') return;
    const st = stateOf(id);
    if (st.run?.clip === 'death') return;
    endClip(st);
    apply(el, performance.now());
  });
  return el;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Проиграть клип героя-лепки на спрайте в бою; `from` — с какого момента клипа, мс (блок — сразу с удара о щит).
 * false — движение отключено: игра оставит свой наскок и тряску.
 */
export function playHeroSculptClip(root: HTMLElement, id: string, want: SculptClip, from = 0): boolean {
  if (reducedMotion() || !hasHeroArt(id)) return false;
  const clip = modelClip(HERO_MODELS[id], want);
  const st = stateOf(id);
  st.run = { clip, started: performance.now() - from };
  const el = root.querySelector<HTMLElement>('.hero-zone .hero-sheet');
  if (el && byEl.has(el)) {
    // Тот же одноразовый клип подряд иначе не начнётся заново: снимаем анимацию и возвращаем.
    el.classList.add('restart');
    void el.offsetWidth;
    el.classList.remove('restart');
    apply(el, performance.now());
  }
  return true;
}

/**
 * Момент контакта клипа от его начала, мс (0 — у клипа нет контакта): к нему игра приурочивает удар, цифру и эффект.
 * Чужой личный клип — по его замене: герой сыграет её.
 */
export function heroClipContact(id: string, clip: SculptClip): number {
  return contactMs(modelClip(HERO_MODELS[id], clip));
}

/** Длительность кадра клипа, мс. */
export function heroFrameMs(id: string, clip: SculptClip): number {
  return 1000 / HERO_CLIPS[modelClip(HERO_MODELS[id], clip)].fps;
}

/**
 * Какой кадр показывает спрайт героя-лепки прямо сейчас — тем же счётом, что CSS, — его силуэт и где кадр лежит
 * относительно квадрата спрайта (пиксели поля). По нему слой эффектов кладёт латы блока ровно по контуру.
 */
export function heroMaskNow(el: HTMLElement, now = performance.now()): { mask: MobMask; fx: number; fy: number; fw: number; fh: number } | null {
  const info = byEl.get(el);
  const hb = info ? bakes.get(info.id) : undefined;
  if (!info || !hb) return null;
  const st = stateOf(info.id);
  const run = st.run;
  let clip: SculptClip = 'idle';
  let frame = 0;
  const idle = hb.clips.idle;
  if (!idle) return null;
  if (run) {
    const dur = clipMs(run.clip);
    const elapsed = now - run.started;
    const b = hb.clips[run.clip];
    if (b && (run.clip === 'death' || elapsed < dur)) {
      clip = run.clip;
      frame = Math.min(b.n - 1, Math.floor(elapsed / (dur / b.n)));
    } else frame = Math.floor((((now - run.started - dur) % IDLE_MS) / IDLE_MS) * idle.n) % idle.n;
  } else frame = Math.floor((((now + st.offset) % IDLE_MS) / IDLE_MS) * idle.n) % idle.n;
  const bits = (hb.clips[clip] ?? idle).masks[Math.max(0, frame)];
  return { mask: { w: hb.w, h: hb.h, bits }, fx: info.fx, fy: info.fy, fw: info.fw, fh: info.fh };
}
