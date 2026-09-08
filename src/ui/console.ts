import { button, h } from './dom';
import { heroDef } from '../data/heroes';
import { potionDef } from '../data/potions';
import { canUseAction } from '../engine/combat';
import { heroStats } from '../engine/run';
import type { PlayerAction } from '../engine/types';
import { bar, gearCard, potionChip, potionTitle, segBar } from './components';
import { spriteImg } from './sprites';
import type { App } from './app';

/** Строка зелья под полосками: в бою кликабельна, во время хода врагов серая. Пустой слот — пунктирный чип с подписью. */
function potionLine(app: App): HTMLElement {
  const run = app.run!;
  const b = run.phase === 'battle' ? run.battle : null;
  const id = b ? b.hero.potion : run.hero.potion;
  if (!id) {
    return h('div', { class: 'potion-line empty', tip: 'Слот зелья пуст. Зелья падают с монстров и продаются у торговца' }, potionChip(null), h('span', { class: 'dim' }, 'слот зелья пуст'));
  }
  const def = potionDef(id);
  if (b) {
    const act: PlayerAction = { type: 'potion', target: app.currentTarget() };
    const err = app.busy ? 'Ход врагов' : canUseAction(b, act);
    return h(
      'button',
      {
        class: `potion-line clickable ${err ? 'off' : ''}`,
        disabled: !!err,
        tip: `${potionTitle(id)}${err ? `\n— ${err}` : '\nКлик — выпить'}`,
        onclick: () => app.battleAction(act),
      },
      potionChip(id),
      h('span', { class: 'potion-name' }, def.name),
    );
  }
  return h('div', { class: 'potion-line', tip: potionTitle(id) }, potionChip(id), h('span', { class: 'potion-name' }, def.name));
}

/**
 * Блок героя в консоли, одинаковый на всех экранах забега: портрет, имя со ссылкой «Персонаж ›»,
 * HP, STA и MP полосками во всю ширину друг под другом, ниже зелье. Статусов и блока здесь нет — они над героем в поле;
 * статов нет — они в оверлее «Персонаж».
 */
export function heroBlock(app: App): HTMLElement {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  const b = run.phase === 'battle' ? run.battle : null;
  const s = heroStats(run);
  const hp = b ? b.hero.hp : run.hero.hp;
  const maxHp = b ? b.hero.maxHp : s.maxHp;
  const sta = b ? b.hero.sta : s.sta;
  const maxSta = b ? b.hero.maxSta : s.sta;
  const mp = b ? b.hero.mp : s.maxMp;
  const maxMp = b ? b.hero.maxMp : s.maxMp;
  return h(
    'div',
    { class: 'c-hero' },
    h(
      'div',
      { class: 'c-hero-head' },
      spriteImg(def.sprite, def.id, 44),
      h(
        'div',
        { class: 'c-hero-title' },
        h('div', { class: 'name' }, def.name),
        h('button', { class: 'link', onclick: () => app.toggleSheet(), tip: 'Статы, экипировка, умения (C)' }, 'Персонаж ›'),
      ),
    ),
    bar('hp', hp, maxHp, 'HP'),
    segBar('sta', sta, maxSta),
    maxMp > 0 ? segBar('mp', mp, maxMp) : h('div', { class: 'bar-gap' }),
    potionLine(app),
  );
}

/** Центр консоли на хабах: оружие и броня героя. Пока компактные карточки; плитки с сокетами придут с оверлеем «Персонаж». */
export function hubGear(app: App): HTMLElement {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  return h('div', { class: 'c-gear' }, gearCard(run.hero.weapon, { def, compact: true }), gearCard(run.hero.armor, { def, compact: true }));
}

export interface ConsoleParts {
  /** Центр консоли: ридаут и плитки в бою, экипировка на хабах. */
  mid: HTMLElement;
  /** Правый блок 110 px — «Конец хода» в бою. */
  right?: HTMLElement | null;
  /** Вертикальная кнопка лога у правого края. */
  log?: boolean;
}

/** Консоль 180 px: блок героя 205 | центр | правый блок 110 | кнопка лога 40. */
export function consoleBar(app: App, parts: ConsoleParts): HTMLElement {
  const logBtn = parts.log
    ? button(app.logOpen ? '✕ Закрыть' : 'Лог боя', () => app.toggleLog(), {
        class: `log-toggle ${app.logOpen ? 'open' : ''}`,
        tip: app.logOpen ? 'Скрыть лог (L)' : 'Показать лог боя (L)',
      })
    : null;
  return h('div', { class: 'console' }, heroBlock(app), h('div', { class: 'c-mid' }, parts.mid), parts.right ? h('div', { class: 'c-right' }, parts.right) : null, logBtn);
}
