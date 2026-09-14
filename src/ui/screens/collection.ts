import { button, h } from '../dom';
import { ART_TIERS, COLLECTIBLES, foundState, type CollectibleKind } from '../../data/collection';
import { collectibleTile } from '../components';
import type { App } from '../app';

const SECTIONS: { kind: CollectibleKind; title: string }[] = [
  { kind: 'artifact', title: 'Артефакты' },
  { kind: 'weapon', title: 'Оружие' },
  { kind: 'armor', title: 'Броня' },
  { kind: 'potion', title: 'Зелья' },
];

export function collectionScreen(app: App): HTMLElement {
  const have = new Set(app.profile.collection);
  const states = COLLECTIBLES.map((c) => ({ c, st: foundState(have, c) }));
  const found = states.filter((s) => s.st.open).length;

  const sections = SECTIONS.map(({ kind, title }) => {
    const items = states.filter((s) => s.c.kind === kind);
    const open = items.filter((s) => s.st.open).length;
    // У артефактов тиры открываются по отдельности, поэтому в шапке раздела ещё и счётчик тиров.
    const tiers = kind === 'artifact' ? ` · тиров ${items.reduce((n, s) => n + s.st.tiers.filter(Boolean).length, 0)}/${items.length * ART_TIERS.length}` : '';
    return h(
      'div',
      { class: 'coll-section' },
      h('div', { class: 'coll-head' }, h('span', null, title), h('span', { class: 'dim' }, `${open}/${items.length}${tiers}`)),
      h('div', { class: 'coll-grid' }, ...items.map((s) => collectibleTile(s.c, s.st))),
    );
  });

  return h(
    'div',
    { class: 'screen collection' },
    h(
      'div',
      { class: 'topbar' },
      button('← Меню', () => app.showMenu(), { class: 'small' }),
      h('span', { class: 'title-sm' }, 'Коллекция'),
      h('span', { class: 'dim' }, `${found}/${COLLECTIBLES.length} найдено`),
    ),
    h('div', { class: 'coll-body' }, ...sections),
    h(
      'div',
      { class: 'coll-foot' },
      h('span', { class: 'hint' }, 'Запись открывается, когда предмет достался герою в забеге. У артефакта открывается тот тир, каким он был у героя, — метки в углу плитки. На сам забег коллекция не влияет.'),
    ),
  );
}
