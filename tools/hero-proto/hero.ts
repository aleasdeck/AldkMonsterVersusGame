/**
 * Черновик лепки героев (страница обсуждения «Лепка героев», в игру не входит).
 *
 * Движок тот же, что у врагов (`src/ui/mobs/pixel.ts`), стиль — `MOB_STYLE` (пять тонов, выборочный контур) с пикселем
 * 1,5 вместо 2 (решение пользователя: «плотнее, но не сильно») — герой стоит в одной сцене с врагами-лепкой. Отличия от врага:
 * - смотрит вправо, на врагов: x растёт к ним, «вперёд» — плюс;
 * - клипов больше: кроме покоя, удара и урона — сильный удар, приём, лечение, клич, блок, смерть и личные приёмы;
 * - позы клипа задаются ключами по кадрам (`HeroPose`), а не общими кривыми `WIND`/`STRIKE`: у героя клипы разной
 *   длины и контакт на разных кадрах, а поз в каждом больше, чем «замах — выпад».
 *
 * Painter принимает имя клипа строкой — его типы знают только `idle | attack | hurt`, поэтому здесь приведение:
 * движку имя клипа не нужно, его читает модель (`clipAt`).
 */
import { Painter, type MobClip, type Model, type Sheet, type Style } from '../../src/ui/mobs/pixel';
import { MOB_STYLE } from '../../src/ui/mobs/styles';

export type HeroClip = 'idle' | 'attack' | 'heavy' | 'power' | 'heal' | 'buff' | 'block' | 'hurt' | 'death' | 'bash' | 'riposte';

export interface HeroClipSpec {
  frames: number;
  fps: number;
  /** Кадр контакта (с нуля): к нему игра приурочивает цифру урона, снаряд или удар о щит. */
  contact?: number;
  /** Белая вспышка по кадрам — как у врагов в клипе урона. */
  flash?: number[];
  /** Последний кадр держится (смерть): стык с покоем не нужен. */
  hold?: boolean;
  /** Подпись и когда играет — для страницы и документа. */
  name: string;
  when: string;
  /** Личный клип героя (есть не у всех). */
  own?: boolean;
}

/**
 * Клипы героя. Удар и урон — те же 8 и 5 кадров по 12 в секунду, что у врагов: контакт на пятом кадре (333 мс).
 * Смерть держит последний кадр. Личные клипы Воина — его пара сигнатур: Щитовой удар и Ответный удар.
 */
export const HERO_CLIPS: Record<HeroClip, HeroClipSpec> = {
  idle: { frames: 24, fps: 8, name: 'Покой', when: 'стойка в бою и на экранах вне боя; 3 с цикл' },
  attack: { frames: 8, fps: 12, contact: 4, name: 'Удар', when: 'обычная атака оружием' },
  heavy: { frames: 10, fps: 12, contact: 5, name: 'Сильный удар', when: 'приём оружием вплотную (Вихрь, Порез, Таран…)' },
  power: { frames: 8, fps: 12, contact: 4, name: 'Приём', when: 'заклинание, бросок, выстрел — всё, что летит' },
  heal: { frames: 10, fps: 10, name: 'Лечение', when: 'приём с лечением, зелье' },
  buff: { frames: 10, fps: 12, contact: 4, name: 'Клич', when: 'приём на себя без лечения: Боевой клич, Ярость, бафы' },
  block: { frames: 6, fps: 12, contact: 2, name: 'Блок', when: '«Защититься» и удар врага, погашенный блоком' },
  hurt: { frames: 5, fps: 12, flash: [0.7, 0.3], name: 'Урон', when: 'удар врага прошёл в HP' },
  death: { frames: 14, fps: 12, hold: true, name: 'Смерть', when: 'гибель; последний кадр держится до итогов' },
  bash: { frames: 8, fps: 12, contact: 4, own: true, name: 'Щитовой удар', when: 'сигнатура Воина: удар щитом, цель отлетает' },
  riposte: { frames: 8, fps: 12, contact: 4, own: true, name: 'Ответный удар', when: 'сигнатура Воина: блок погасил удар — ответ мечом' },
};

/** Какой клип и кадр рисует Painter: `null` — покой (фаза `p.t`). */
export function clipAt(p: Painter): { clip: HeroClip; f: number; n: number } | null {
  const clip = p.clip as string as HeroClip;
  if (clip === 'idle') return null;
  const n = HERO_CLIPS[clip].frames;
  return { clip, f: Math.round(p.u * (n - 1)), n };
}

/** Лист одного клипа героя: те же кадры, что `renderSheet` у врагов, но по таблице `HERO_CLIPS`. */
export function renderHeroClip(model: Model, clip: HeroClip, style: Style = MOB_STYLE): Sheet {
  const spec = HERO_CLIPS[clip];
  const n = spec.frames;
  const frames: Uint8ClampedArray[] = [];
  let w = 0, h = 0, top = Infinity, minX = Infinity, maxX = -1;
  for (let f = 0; f < n; f++) {
    const p = clip === 'idle' ? new Painter(model, style, f / n) : new Painter(model, style, 0, clip as string as MobClip, n > 1 ? f / (n - 1) : 0);
    model.draw(p);
    const px = p.finish();
    w = p.W;
    h = p.H;
    const flash = spec.flash?.[f] ?? 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        if (px[k + 3] !== 255) continue;
        if (j < top) top = j;
        if (i < minX) minX = i;
        if (i > maxX) maxX = i;
        if (flash) for (let c = 0; c < 3; c++) px[k + c] = Math.round(px[k + c] + (255 - px[k + c]) * flash);
      }
    }
    frames.push(px);
  }
  const groundRow = Math.round((model.ground + (model.pad ?? 22)) / style.d);
  return {
    w, h, d: style.d, frames, fps: spec.fps,
    top: Number.isFinite(top) ? top : 0,
    foot: Math.max(0, h - groundRow),
    left: Number.isFinite(minX) ? minX : 0,
    right: maxX >= 0 ? w - 1 - maxX : 0,
  };
}

// ─── Позы по ключевым кадрам ───────────────────────────────────────────────

/** Ключи клипа: номер кадра → изменённые поля позы. Между ключами — линейно, крайние держатся. */
export type PoseKeys<P> = Array<[number, Partial<P>]>;

/**
 * Поза кадра `f` из ключей: каждое поле интерполируется по своим ключам (поле, которого в ключе нет, туда не
 * смотрит). До первого ключа — поза покоя `rest`; после последнего — снова покой к последнему кадру, поэтому
 * клип приходит в покой сам. `hold` (смерть) — после последнего ключа поле держится.
 */
export function poseAt<P extends Record<string, number>>(rest: P, keysOf: PoseKeys<P>, f: number, n: number, hold = false): P {
  const out = { ...rest };
  for (const field of Object.keys(rest) as Array<keyof P>) {
    const ks: Array<[number, number]> = [[0, rest[field]]];
    for (const [kf, part] of keysOf) if (part[field] !== undefined) ks.push([kf, part[field] as number]);
    if (ks[ks.length - 1][0] < n - 1) ks.push([n - 1, hold ? ks[ks.length - 1][1] : rest[field]]);
    // Ключ на нулевом кадре заменяет покой.
    if (ks.length > 1 && ks[1][0] === 0) ks.shift();
    let v = ks[ks.length - 1][1];
    for (let k = 1; k < ks.length; k++) {
      if (f <= ks[k][0]) {
        const [f0, v0] = ks[k - 1], [f1, v1] = ks[k];
        v = f1 === f0 ? v1 : v0 + ((v1 - v0) * (f - f0)) / (f1 - f0);
        break;
      }
    }
    (out as Record<string, number>)[field as string] = v;
  }
  return out;
}
