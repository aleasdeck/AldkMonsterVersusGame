import type { LocationId } from '../engine/types';

/**
 * Тонировка бойцов под свет локации (v0.41.5): герой, союзники и враги нарисованы каждый в своей палитре
 * и на рисованном фоне смотрятся наклеенными — слишком чистыми и яркими для сцены. Тонировка красит их
 * цветом света локации: в Пещерах бойцов ведёт в жар лавы, на Корабле — в лунную синь.
 *
 * Поверх спрайта ничего не кладётся: цвет меняет фильтр `feColorMatrix`, то есть то же умножение канала
 * на цвет света, что делает любой движок при освещении сцены. Альфа не трогается, пиксельная сетка не
 * размывается. CSS-фильтрами (`sepia`/`hue-rotate`) то же самое пришлось бы подбирать на глаз, и на
 * холодной локации они дают грязь.
 */

interface LocationTint {
  /**
   * Цвет света, #rrggbb, нормированный по максимуму канала (самый яркий канал — 255).
   * Так тонировка красит, но почти не темнит: нетронутым остаётся тот канал, которым локация и светит.
   */
  light: string;
  /** Насколько цвет света забирает себе краски спрайта, 0..1. */
  k: number;
}

/**
 * Цвета сняты с самих фонов (`src/assets/backgrounds/<loc>-wide.png`): медиана пикселей ярче 12 % и
 * насыщеннее 12 %, нормированная по максимуму канала. Лесу и Болотам замер даёт болезненную желтизну
 * (в кадре много тёплой земли), поэтому у них взят зелёный поворот — иначе бойцы уходят в «старое фото».
 * Сила подобрана по скриншотам боя: у тёплых локаций цвет насыщенный и хватает 0.3–0.35, у зелёных и
 * холодных он бледный, и та же заметность требует 0.45–0.5.
 */
const TINTS: Record<LocationId, LocationTint> = {
  forest: { light: '#e4ffd2', k: 0.45 },
  swamp: { light: '#eaffc0', k: 0.5 },
  crypt: { light: '#ff9f87', k: 0.35 },
  hive: { light: '#ff7a50', k: 0.3 },
  caves: { light: '#ff6442', k: 0.35 },
  ship: { light: '#c2cdff', k: 0.5 },
};

/** Насыщенность спрайта под тонировкой: плоские заливки процедурных врагов рядом с рисованным фоном слишком чистые. */
const SAT = 0.85;
/** Общее притемнение: фоны тёмные, боец без него остаётся ярче сцены. */
const DIM = 0.95;

/** Веса яркости (Rec. 709) — по ним считается обесцвечивание. */
const LUM = [0.2126, 0.7152, 0.0722];

function hexToRgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

/**
 * Матрица 4×5 для `feColorMatrix`: сначала обесцвечивание, потом умножение канала на цвет света и притемнение.
 * Строка альфы единичная — силуэт спрайта не меняется.
 */
function matrix({ light, k }: LocationTint): string {
  const rgb = hexToRgb(light);
  const rows = [0, 1, 2].map((i) => {
    const gain = (1 - k + k * rgb[i]) * DIM;
    // Строка обесцвечивания: свой канал держит SAT, остальное добирается яркостью пикселя.
    return [0, 1, 2].map((j) => gain * (LUM[j] * (1 - SAT) + (i === j ? SAT : 0))).concat([0, 0]);
  });
  rows.push([0, 0, 0, 1, 0]);
  return rows
    .flat()
    .map((v) => Number(v.toFixed(4)))
    .join(' ');
}

const filterId = (id: LocationId): string => `mv-tint-${id}`;

/** Матрица тонировки локации для страниц обсуждения (tools/hl-proto): те же числа, что у фильтра в бою. */
export function tintMatrix(id: LocationId): string {
  return matrix(TINTS[id]);
}

/** Отладочная подмена чисел (`&tint=` в main.ts): подбирать цвет и силу удобно прямо в бою. */
let enabled = true;
let override: Partial<LocationTint> | null = null;
let injected = false;

export function setTint(on: boolean, tune?: Partial<LocationTint>): void {
  enabled = on;
  override = tune ?? null;
  injected = false;
  document.querySelector('.tint-defs')?.remove();
}

/**
 * Свет на цели (подсветка `&hl=`, tools/hl-proto): гамма, а не яркость. Яркость множит все тона и выбеливает светлое,
 * гамма поднимает тени сильнее светов — тёмная лепка выходит из сумрака сцены, а сталь и глаза не слепнут.
 */
export const LIFT = { exponent: 0.72, amplitude: 1.06 };
export const LIFT_ID = 'mv-lift';

/**
 * Обводка силуэта (вариант «Контур»): клетка лепки (2 px) вокруг непрозрачных пикселей. Тени на полу, свечения и плёнки
 * крыльев полупрозрачны и порог альфы их отбрасывает — иначе обводка ложится полосой под ноги. `lift` — ещё и свет цели.
 */
export const OUTLINES = [
  { id: 'mv-ol', color: '#7d6c4a', lift: false },
  { id: 'mv-ol-lift', color: '#ffd166', lift: true },
];

/** Один раз кладёт в документ блок `<svg>` с фильтром на каждую локацию и светом цели. Сам он ничего не рисует. */
function ensureFilters(): void {
  if (injected) return;
  injected = true;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tint-defs');
  svg.setAttribute('aria-hidden', 'true');
  for (const [id, tint] of Object.entries(TINTS) as [LocationId, LocationTint][]) {
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', filterId(id));
    // Без sRGB браузер считает матрицу в линейном пространстве и тонировка выходит блёклой.
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    // Область фильтра с запасом: по умолчанию она обрезает содержимое на 120 % рамки.
    filter.setAttribute('x', '-25%');
    filter.setAttribute('y', '-25%');
    filter.setAttribute('width', '150%');
    filter.setAttribute('height', '150%');
    const m = document.createElementNS(NS, 'feColorMatrix');
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', matrix({ ...tint, ...override }));
    filter.appendChild(m);
    svg.appendChild(filter);
  }
  // Свет цели и обводка вешаются на обёртку спрайта, а лепка выходит за её края замахом: область с запасом вдвое.
  const el = (tag: string, attrs: Record<string, string | number>, ...kids: Element[]): Element => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    for (const kid of kids) node.appendChild(kid);
    return node;
  };
  const box = { x: '-50%', y: '-50%', width: '200%', height: '200%', 'color-interpolation-filters': 'sRGB' };
  const gamma = (result: string): Element =>
    el('feComponentTransfer', { in: 'SourceGraphic', result }, ...['R', 'G', 'B'].map((ch) => el(`feFunc${ch}`, { type: 'gamma', exponent: LIFT.exponent, amplitude: LIFT.amplitude })));
  svg.appendChild(el('filter', { id: LIFT_ID, ...box }, gamma('lit')));
  for (const o of OUTLINES) {
    svg.appendChild(el('filter', { id: o.id, ...box },
      el('feComponentTransfer', { in: 'SourceAlpha', result: 'a' }, el('feFuncA', { type: 'discrete', tableValues: '0 1' })),
      el('feMorphology', { in: 'a', operator: 'dilate', radius: 2, result: 'd' }),
      el('feFlood', { 'flood-color': o.color }),
      el('feComposite', { in2: 'd', operator: 'in', result: 'ol' }),
      ...(o.lift ? [gamma('src')] : []),
      el('feMerge', {}, el('feMergeNode', { in: 'ol' }), el('feMergeNode', { in: o.lift ? 'src' : 'SourceGraphic' })),
    ));
  }
  document.body.appendChild(svg);
}

/** Значение переменной `--tint` для поля боя: её читают спрайты бойцов в style.css. Пусто — тонировки нет. */
export function tintVar(id: LocationId): string {
  ensureFilters();
  if (!enabled) return '';
  return `--tint:url(#${filterId(id)});`;
}
