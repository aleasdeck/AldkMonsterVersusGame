import type { Model } from '../mobs/pixel';
import type { AvatarSpec } from './avatar';
import { HERO_CLIPS, type SculptClip } from './clips';

/**
 * Модель героя-лепки: лепка врага (`Model` — рамка, земля, поле, `draw` по кадру) плюс то, что есть только у героя:
 * портрет для аватарки и зонд точек кадра для инструментов и тестов. Запись в `HERO_MODELS` (heroes/index.ts) —
 * всё, что нужно игре: спрайт, клипы, время удара, силуэт и аватарка дальше общие.
 */
export interface HeroModel extends Model {
  /** Личные клипы, которые модель рисует сама (`own` в HERO_CLIPS); общие рисует каждая модель. */
  own?: readonly SculptClip[];
  avatar: AvatarSpec;
  probe?: HeroProbe;
}

/** Клипы, которые рисует модель: все общие и её личные. По ним — прогрев в игре, тесты и листы инструментов. */
export function modelClips(m: HeroModel): SculptClip[] {
  return (Object.keys(HERO_CLIPS) as SculptClip[]).filter((c) => !HERO_CLIPS[c].own || !!m.own?.includes(c));
}

/** Какой клип модель сыграет вместо `clip`: свой — его же, чужой личный — замену из таблицы (`instead`). */
export function modelClip(m: HeroModel, clip: SculptClip): SculptClip {
  const spec = HERO_CLIPS[clip];
  return !spec.own || m.own?.includes(clip) ? clip : spec.instead ?? 'attack';
}

/**
 * Точки кадра в единицах поля: таз, кисть с оружием, конец оружия (острие, навершие посоха, стрела), линия земли.
 * Риг руки — по желанию модели (у Паладина есть): плечевой сустав `shX`/`shY`, локоть `elX`/`elY`, другой конец
 * оружия `butX`/`butY` (навершие), угол оружия к предплечью `wrist` и сгиб локтя `elbow` (180 — прямая рука), градусы.
 * По ним `tools/hero-proto/rig.mjs` печатает суставы и рисует кости поверх кадров — для ревью риггинга.
 */
export interface ProbeInfo extends Record<string, number> {
  hipX: number; hipY: number;
  handX: number; handY: number;
  tipX: number; tipY: number;
  ground: number;
}

/**
 * Зонд: модель зовёт `on` на каждом кадре, пока он задан (`tools/hero-proto/probe.mjs` печатает путь кисти и острия,
 * тест проверяет, что оружие не уходит под землю).
 */
export interface HeroProbe {
  on?: (info: ProbeInfo) => void;
  /** Клипы, где конец оружия в земле нарочно: воткнутый меч, удар в землю, падение. Тест их не проверяет. */
  grounded: readonly SculptClip[];
}
