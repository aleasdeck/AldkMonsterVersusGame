// ─── Прототипы интерфейса: переключатель вариантов (v0.50) ─────────────────
// Три задачи разгрузки интерфейса — экран выбора героя, карточки экипировки, карточки артефактов — сделаны в нескольких
// вариантах, чтобы выбрать вживую, а не по описанию. `old` — нынешний вид (по умолчанию), a/b/c — варианты; у артефактов ещё d.
// Выбор задаётся адресом (&hs=a&gc=b&ac=c, &ui=a — все три сразу), живёт в localStorage и листается Shift+1/2/3
// на любом экране. Когда вариант выбран, остальные удаляются вместе с этим файлом.

export type Variant = 'old' | 'a' | 'b' | 'c' | 'd';

export interface UiVariants {
  /** Экран выбора героя. */
  hs: Variant;
  /** Карточки оружия и брони. */
  gc: Variant;
  /** Карточки артефактов. */
  ac: Variant;
}

export type UiArea = keyof UiVariants;

const KEY = 'mv_ui_variants';
const ORDER: Variant[] = ['old', 'a', 'b', 'c', 'd'];
/** Какие варианты есть у области: D — только у артефактов («как экипировка», после выбора B у предметов). */
const AREA_ORDER: Record<'hs' | 'gc' | 'ac', Variant[]> = {
  hs: ['old', 'a', 'b', 'c'],
  gc: ['old', 'a', 'b', 'c'],
  ac: ['old', 'a', 'b', 'c', 'd'],
};

export const AREA_NAMES: Record<UiArea, string> = {
  hs: 'Выбор героя',
  gc: 'Карточки оружия и брони',
  ac: 'Карточки артефактов',
};

/** Короткие имена вариантов — для всплывающей строки при переключении. */
export const VARIANT_NAMES: Record<UiArea, Record<Variant, string>> = {
  hs: { old: 'как сейчас', a: 'A — две вкладки: Герой / Старт', b: 'B — одна страница, выбор переключателями', c: 'C — три вкладки: Герой / Старт / Мастерство', d: 'как сейчас' },
  gc: { old: 'как сейчас', a: 'A — паспорт предмета', b: 'B — сравнение с надетым', c: 'C — компакт, детали в подсказке', d: 'как сейчас' },
  ac: { old: 'как сейчас', a: 'A — полоса параметров', b: 'B — карта с углами', c: 'C — рейка слева', d: 'D — как экипировка' },
};

function isVariant(v: unknown): v is Variant {
  return typeof v === 'string' && (ORDER as string[]).includes(v);
}

function load(): UiVariants {
  const out: UiVariants = { hs: 'old', gc: 'old', ac: 'old' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<UiArea, unknown>>;
    for (const area of Object.keys(out) as UiArea[]) if (isVariant(raw[area])) out[area] = raw[area] as Variant;
  } catch {
    // Пустое или битое хранилище — нынешний вид.
  }
  return out;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(UI));
  } catch {
    // Хранилище закрыто (приватное окно) — выбор проживёт до перезагрузки.
  }
}

/** Текущие варианты. Компоненты читают поле своей области при каждой отрисовке. */
export const UI: UiVariants = load();

/** Разобрать адрес: &ui=a — все области, &hs= / &gc= / &ac= — по одной; заданное запоминается. */
export function applyUiParams(params: URLSearchParams): void {
  const all = params.get('ui');
  if (isVariant(all)) UI.hs = UI.gc = UI.ac = all;
  for (const area of Object.keys(UI) as UiArea[]) {
    const v = params.get(area);
    if (isVariant(v)) UI[area] = v;
  }
  if (all || params.has('hs') || params.has('gc') || params.has('ac')) save();
}

/** Следующий вариант области по кругу: old → a → b → c → old. Возвращает подпись для всплывающей строки. */
export function cycleVariant(area: UiArea): string {
  const order = AREA_ORDER[area];
  UI[area] = order[(order.indexOf(UI[area]) + 1) % order.length];
  save();
  return `${AREA_NAMES[area]}: ${VARIANT_NAMES[area][UI[area]]}`;
}
