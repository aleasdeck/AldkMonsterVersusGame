import { button, h } from '../dom';
import { COLLECTIBLES, type CollectibleKind } from '../../data/collection';
import { collectibleTile } from '../components';
import type { App } from '../app';

const SECTIONS: { kind: CollectibleKind; title: string }[] = [
  { kind: 'artifact', title: 'Артефакты' },
  { kind: 'weapon', title: 'Оружие' },
  { kind: 'armor', title: 'Броня' },
];

export function collectionScreen(app: App): HTMLElement {
  const have = new Set(app.profile.collection);
  const found = COLLECTIBLES.filter((c) => have.has(c.id)).length;

  const sections = SECTIONS.map(({ kind, title }) => {
    const items = COLLECTIBLES.filter((c) => c.kind === kind);
    const open = items.filter((c) => have.has(c.id)).length;
    return h(
      'div',
      { class: 'coll-section' },
      h('div', { class: 'coll-head' }, h('span', null, title), h('span', { class: 'dim' }, `${open}/${items.length}`)),
      h('div', { class: 'coll-grid' }, ...items.map((c) => collectibleTile(c, !have.has(c.id)))),
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
      h('span', { class: 'dim' }, `${found}/${COLLECTIBLES.length} найдено · сундуков: ${app.profile.chests}`),
    ),
    h('div', { class: 'coll-body' }, ...sections),
    h(
      'div',
      { class: 'coll-foot' },
      app.profile.chests > 0 ? button(`Открыть сундук (${app.profile.chests})`, () => app.showChest(), { class: 'primary' }) : null,
      h('span', { class: 'hint' }, 'Предметы находятся в сундуках за пройденные забеги. На сам забег коллекция не влияет.'),
    ),
  );
}
