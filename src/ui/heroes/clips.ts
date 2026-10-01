import { Painter, type MobClip, type Model, type Sheet, type Style } from '../mobs/pixel';
import { MOB_STYLE } from '../mobs/styles';

/**
 * Клипы героев-лепки (Воин первым; как лепить — docs/lepka-geroev.md).
 *
 * Движок тот же, что у врагов (`mobs/pixel.ts`), стиль — `MOB_STYLE` (пять тонов, выборочный контур) с пикселем
 * `HERO_PIXEL` 1,5 вместо 2 (решение пользователя: «плотнее, но не сильно»): герой стоит в одной сцене с врагами-лепкой.
 * Отличия от врага: смотрит вправо, на врагов; клипов больше — кроме покоя, удара и урона сильный удар, приём,
 * лечение, клич, блок, смерть и личные приёмы; позы клипа задаются ключами по кадрам (`poseAt`), а не общими
 * кривыми `WIND`/`STRIKE`: клипы разной длины, и контакт на разных кадрах.
 *
 * Painter принимает имя клипа строкой — его типы знают только `idle | attack | hurt`, поэтому здесь приведение:
 * движку имя клипа не нужно, его читает модель (`clipAt`).
 */
export type SculptClip = 'idle' | 'attack' | 'heavy' | 'power' | 'heal' | 'buff' | 'block' | 'hurt' | 'death' | 'bash' | 'riposte' | 'smite' | 'vanish';

/** Пиксель героя в пикселях поля: 85 точек роста у Воина, на FullHD ровно три точки экрана на пиксель. */
export const HERO_PIXEL = 1.5;
export const HERO_STYLE: Style = { ...MOB_STYLE, d: HERO_PIXEL };

export interface HeroClipSpec {
  frames: number;
  fps: number;
  /** Кадр контакта (с нуля): к нему игра приурочивает цифру урона, снаряд или удар о щит. */
  contact?: number;
  /** Белая вспышка по кадрам — как у врагов в клипе урона. */
  flash?: number[];
  /** Последний кадр держится (смерть): стык с покоем не нужен. */
  hold?: boolean;
  /** Подпись и когда играет — для документа и страницы обсуждения. */
  name: string;
  when: string;
  /** Личный клип героя: рисуют его только модели, у которых он в `own` (model.ts), остальные играют `instead`. */
  own?: boolean;
  /** Что играет герой без этого личного клипа (Щитовой удар у героя без щита — сильный удар). */
  instead?: SculptClip;
  /** Клип сам рисует эффект приёма (дым Исчезновения): свечение бафа на герое поверх него не играет. */
  selfFx?: boolean;
  /**
   * До какого кадра (с нуля) ввод закрыт: приём на себя без снаряда открывает ввод в кадр контакта, и следующий удар
   * обрывал бы клип посреди эффекта (дым Исчезновения пропадал за кадр, фигура выскакивала из стены).
   */
  lock?: number;
}

/**
 * Клипы героя. Удар и урон — те же 8 и 5 кадров по 12 в секунду, что у врагов: контакт на пятом кадре (333 мс).
 * Смерть держит последний кадр. Общие клипы (без `own`) рисует каждый герой-лепка; личные — только свои
 * (у Воина — пара сигнатур: Щитовой удар и Ответный удар, у Паладина — Молот света, у Ассасина — Дымовая шашка),
 * новый личный клип — строка здесь
 * с `own` и `instead`.
 */
export const HERO_CLIPS: Record<SculptClip, HeroClipSpec> = {
  idle: { frames: 24, fps: 8, name: 'Покой', when: 'стойка в бою и на экранах вне боя; 3 с цикл' },
  attack: { frames: 8, fps: 12, contact: 4, name: 'Удар', when: 'обычная атака оружием: укол с шага от бедра' },
  heavy: { frames: 10, fps: 12, contact: 5, name: 'Сильный удар', when: 'приём оружием вплотную (Вихрь, Порез, Таран…): рубка сверху с широким шагом, клинок в землю' },
  power: { frames: 8, fps: 12, contact: 4, name: 'Приём', when: 'заклинание, бросок, выстрел — всё, что летит' },
  heal: { frames: 12, fps: 10, contact: 2, name: 'Лечение', when: 'приём с лечением, зелье: на колено, меч остриём в землю' },
  buff: { frames: 10, fps: 12, contact: 4, name: 'Клич', when: 'приём на себя без лечения: Боевой клич, Ярость, бафы' },
  block: { frames: 6, fps: 12, contact: 2, name: 'Блок', when: '«Защититься» и удар врага, погашенный блоком' },
  hurt: { frames: 5, fps: 12, flash: [0.7, 0.3], name: 'Урон', when: 'удар врага прошёл в HP' },
  death: { frames: 14, fps: 12, hold: true, name: 'Смерть', when: 'гибель; последний кадр держится до итогов' },
  bash: { frames: 8, fps: 12, contact: 4, own: true, instead: 'heavy', name: 'Щитовой удар', when: 'сигнатура Воина: удар щитом, цель отлетает' },
  riposte: { frames: 8, fps: 12, contact: 4, own: true, instead: 'block', name: 'Ответный удар', when: 'сигнатура Воина: блок погасил удар — ответ мечом' },
  smite: { frames: 10, fps: 12, contact: 5, own: true, instead: 'heavy', name: 'Молот света', when: 'сигнатура Паладина: удар с сиянием — боёк загорается светом и бьёт, свет лечит' },
  vanish: { frames: 14, fps: 12, contact: 4, own: true, instead: 'buff', selfFx: true, lock: 11, name: 'Исчезновение', when: 'Дымовая шашка у Ассасина: шашка под ноги, дым встаёт стеной, силуэт растворяется в нём и выходит из дыма тенью' },
};

/** Длительность клипа и момент контакта от его начала, мс. */
export const clipMs = (clip: SculptClip): number => (HERO_CLIPS[clip].frames / HERO_CLIPS[clip].fps) * 1000;
export const contactMs = (clip: SculptClip): number => ((HERO_CLIPS[clip].contact ?? 0) / HERO_CLIPS[clip].fps) * 1000;
/** Сколько мс от начала клипа ввод закрыт (`lock`; 0 — открывается вместе с контактом). */
export const lockMs = (clip: SculptClip): number => ((HERO_CLIPS[clip].lock ?? 0) / HERO_CLIPS[clip].fps) * 1000;

/** Какой клип и кадр рисует Painter: `null` — покой (фаза `p.t`). */
export function clipAt(p: Painter): { clip: SculptClip; f: number; n: number } | null {
  const clip = p.clip as string as SculptClip;
  if (clip === 'idle') return null;
  const n = HERO_CLIPS[clip].frames;
  return { clip, f: Math.round(p.u * (n - 1)), n };
}

/** Лист одного клипа героя: те же кадры, что `renderSheet` у врагов, но по таблице `HERO_CLIPS`. */
export function renderHeroClip(model: Model, clip: SculptClip, style: Style = HERO_STYLE): Sheet {
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
