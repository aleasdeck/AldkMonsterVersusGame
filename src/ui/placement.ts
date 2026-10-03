import { button, h } from './dom';
import { artifactDef } from '../data/artifacts';
import { heroDef } from '../data/heroes';
import { ART_TIER_COLORS } from '../data/gear';
import { ARCHETYPES, archetypeCounts } from '../data/archetypes';
import { SLOT_KIND_NAME, canPlaceArtifact, findSameArtifact, gearOf, slotAccepts, slotKindAt, socketRefs } from '../engine/equipment';
import { innateOf, socketedArtifacts } from '../engine/stats';
import { currentLocation } from '../engine/run';
import type { ArchetypeId, ArtifactInstance, GearKind, HeroPersistent, RunState } from '../engine/types';
import { SLOT_ICON } from './components';
import { artifactCard, placeGearTile } from './cards';
import { markKeywords } from './keywords';
import { uiIcon } from './icons';
import { backgroundStyle } from './backgrounds';
import { paramTip, whyTip } from './tips';
import type { App } from './app';

// ─── Размещение артефакта без окна ─────────────────────────────────────────
// Решение пользователя (страница обсуждения интерфейса, вариант B без вкладок): пока артефакт ждёт сокета, экран не закрывается
// окном. Центр хаба — карточка «в руке» и что станет при наведённом сокете, плитки консоли — цели: сокеты крупными кнопками,
// подходящие подписаны «Заменить» или «Вставить», неподходящие тусклые. Клик по сокету ставит артефакт сразу. Наведение пишет
// в готовый узел предпросмотра и ничего не хранит в App — как preview.ts; любое действие перерисует экран.

/** Вещи каждого архетипа у героя: сокеты и врождённый навык — тот же счёт, что у листа «Персонаж». */
function setCounts(hero: HeroPersistent): Partial<Record<ArchetypeId, number>> {
  const innate = innateOf(hero);
  return archetypeCounts([...socketedArtifacts(hero.weapon, hero.armor), ...(innate ? [innate] : [])]);
}

/** Наборы, которые изменит артефакт в этом сокете: «♦ Кровь 2 → 3/3 · бонус» зелёным, потерянный порог красным. */
function setLines(run: RunState, art: ArtifactInstance, kind: GearKind, index: number): HTMLElement[] {
  const before = setCounts(run.hero);
  const clone = structuredClone(run.hero);
  gearOf(clone, kind).slots[index] = art;
  const after = setCounts(clone);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)] as ArchetypeId[]);
  const out: HTMLElement[] = [];
  for (const id of ids) {
    const from = before[id] ?? 0;
    const to = after[id] ?? 0;
    if (from === to) continue;
    const arch = ARCHETYPES[id];
    const gained = to > from && to <= 3 ? arch.sets[to as 2 | 3] : undefined;
    const lost = to < from && from <= 3 ? arch.sets[from as 2 | 3] : undefined;
    out.push(
      h(
        'div',
        { class: `pl-line ${gained ? 'good' : lost ? 'bad' : 'dim'}` },
        h('span', { class: 'pl-glyph', style: `color:${arch.color}` }, arch.glyph),
        h('span', null, `${arch.name} ${Math.min(from, 3)} → ${Math.min(to, 3)}/3`, gained ? ` · ${gained.text}` : lost ? ` · без «${lost.text}»` : ''),
      ),
    );
  }
  return out;
}

/** Предпросмотр сокета: что заменяется, какие наборы изменятся и куда денется стоявший артефакт. */
function previewLines(run: RunState, art: ArtifactInstance, kind: GearKind, index: number): HTMLElement[] {
  const old = gearOf(run.hero, kind).slots[index];
  const lines: HTMLElement[] = [h('h3', null, old ? `Заменить: ${artifactDef(old.id).name}` : 'Вставить'), ...setLines(run, art, kind, index)];
  if (old) {
    const def = artifactDef(old.id);
    // Вытесненный встаёт в очередь (pendingPlace): если под него есть другой сокет, его можно будет переставить, иначе — только выбросить.
    const elsewhere = socketRefs(run.hero).some((s) => !(s.kind === kind && s.index === index) && slotAccepts(s.slot, def.slot));
    lines.push(
      h('div', { class: 'pl-line dim' }, uiIcon(elsewhere ? 'arrow' : 'cross', 14), elsewhere ? `${def.name} вытеснится: переставите в другой сокет или выбросите` : `${def.name} пропадёт: другого сокета под него нет`),
      h('div', { class: 'pl-old' }, ...markKeywords(def.describe(old.tier), { icons: true, numbers: true })),
    );
  }
  return lines;
}

/** Чип артефакта в сокете-цели — без своей подсказки: всё нужное пишет предпросмотр в центре. */
function plainChip(inst: ArtifactInstance): HTMLElement {
  const color = ART_TIER_COLORS[inst.tier];
  return h('span', { class: 'chip', style: `border-color:${color}` }, h('span', { class: 'chip-glyph' }, artifactDef(inst.id).glyph), h('span', { class: 'chip-tier', style: `color:${color}` }, '●'.repeat(inst.tier)));
}

/**
 * Центр и консоль экрана, пока артефакт ждёт сокета; null — ждать нечего. Зовёт runFrame, поэтому размещение одинаково
 * у награды, торговца, сундука и алтаря.
 */
export function placementParts(app: App): { center: HTMLElement; mid: HTMLElement } | null {
  const run = app.run;
  const p = run?.pending;
  const art = p?.artifacts[0];
  if (!run || !p || !art) return null;
  const prev = h('div', { class: 'pl-prev' });
  prev.hidden = true;
  const show = (kind: GearKind, index: number) => {
    prev.replaceChildren(...previewLines(run, art, kind, index));
    prev.hidden = false;
  };
  const hide = () => {
    prev.hidden = true;
  };
  const displaced = !!p.displaced?.includes(art.id);
  const queue = p.artifacts.length - 1;
  const center = h(
    'div',
    { class: 'main hub-main placing', style: backgroundStyle(currentLocation(run).id, 0.78) },
    h(
      'div',
      { class: 'pl-body' },
      h('div', { class: 'pl-hand' }, h('div', { class: 'pl-label' }, displaced ? 'Вытеснен' : 'В руке', queue > 0 ? h('span', { class: 'dim' }, ` · ещё ${queue}`) : null), artifactCard(art, undefined, undefined, run)),
      h(
        'div',
        { class: 'pl-side' },
        prev,
        h(
          'div',
          { class: 'row' },
          p.cancellable
            ? button('Отмена', () => app.pendingCancel())
            : button('Выбросить', () => app.pendingDiscard(), { class: 'danger', tip: paramTip('cross', 'Выбросить', `«${artifactDef(art.id).name}» пропадёт насовсем`, { color: '#ff6b6b' }) }),
        ),
      ),
    ),
  );
  const same = findSameArtifact(run.hero, art.id);
  const tile = (kind: GearKind) => {
    const gear = gearOf(run.hero, kind);
    return placeGearTile(
      gear,
      heroDef(run.hero.defId),
      gear.slots.map((a, index) => {
        const sk = slotKindAt(gear, index);
        const why = same && same.kind === kind && same.index === index ? 'Этот артефакт уже стоит здесь' : canPlaceArtifact(run.hero, kind, index, art.id);
        // Без атрибута disabled: выключенной кнопке браузер не шлёт наведение, а причина должна показаться подсказкой.
        const el = h(
          'button',
          {
            class: `pl-sock k-${sk} ${why ? 'off' : 'ok'} ${a ? '' : 'empty'}`.replace(/\s+/g, ' ').trim(),
            'aria-disabled': why ? 'true' : null,
            tip: why ? whyTip(why, 'Сюда нельзя') : null,
            onclick: () => {
              if (!why) app.pendingPlace(kind, index);
            },
          },
          a ? plainChip(a) : h('span', { class: `chip chip-empty k-${sk}` }, uiIcon(SLOT_ICON[sk], 16)),
          h('span', { class: 'pl-name' }, a ? artifactDef(a.id).name : SLOT_KIND_NAME[sk]),
          h('span', { class: 'pl-act' }, why ? 'не подходит' : a ? 'Заменить' : 'Вставить'),
        );
        if (!why) {
          el.addEventListener('mouseenter', () => show(kind, index));
          el.addEventListener('focus', () => show(kind, index));
          el.addEventListener('mouseleave', hide);
          el.addEventListener('blur', hide);
        }
        return el;
      }),
    );
  };
  return { center, mid: h('div', { class: 'c-gear placing' }, tile('weapon'), tile('armor')) };
}
