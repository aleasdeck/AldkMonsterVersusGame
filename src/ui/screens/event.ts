import { button, h } from '../dom';
import { artifactDef, artifactFullText } from '../../data/artifacts';
import { GEAR_TIERS, upgradePreview } from '../../data/gear';
import { heroDef } from '../../data/heroes';
import { forgePrice } from '../../engine/loot';
import { altarHealAmount, altarSacrificeCost, canAltarSacrifice, canForge, chestLockStakes, chestPins, currentLocation, heroStats } from '../../engine/run';
import { artifactChip, coin, pendingModal, pickable, potionReplaceNote, tierTip } from '../components';
import { artifactCard, gearCard, potionCard } from '../cards';
import { uiIcon } from '../icons';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import { markKeywords } from '../keywords';
import { paramTip, whyTip } from '../tips';
import type { ChestItem, EventState, GearKind, GearTier, LockGrade } from '../../engine/types';
import type { App } from '../app';

/** Заголовок и подпись экрана по виду события; у сундука — закрытого и открытого. */
const HEADS: Record<'chestClosed' | 'chest' | 'altar' | 'forge', [string, string]> = {
  chestClosed: ['Сундук', 'Внутри золото и вещи. Взломайте или пройдите мимо.'],
  chest: ['Сундук', 'Золото уже в кошельке. Вещи — по одной, лишнее можно оставить.'],
  altar: ['Алтарь', 'Помолиться о здоровье или отдать кровь за артефакт. Одно из двух.'],
  forge: ['Кузнец', 'Тир оружия или брони +1 за золото; аффикс, сокеты и артефакты остаются. Один предмет.'],
};

function narrow(el: HTMLElement): HTMLElement {
  el.classList.add('chest-narrow');
  return el;
}

/** Взятая из сундука вещь: место остаётся, чтобы ряд не прыгал, — как «Куплено» у торговца. */
function takenCard(what: string, narrow: boolean): HTMLElement {
  return h(
    'div',
    { class: `card shop-card sold ${narrow ? 'chest-narrow' : ''}`.trim() },
    h('div', { class: 'glyph big' }, '✓'),
    h('div', { class: 'card-name' }, what),
    h('div', { class: 'card-desc' }, 'Взято'),
  );
}

/** Штифты замка квадратиками: пустой — ещё не взломан, цветом — засечка. */
function lockPins(pins: number, grades: LockGrade[] = []): HTMLElement {
  return h('span', { class: 'lock-pins' }, ...Array.from({ length: pins }, (_, j) => h('i', { class: `lock-pin ${grades[j] ?? ''}`.trim() })));
}

function pinsWord(n: number): string {
  return n === 1 ? 'штифт' : n < 5 ? 'штифта' : 'штифтов';
}

/**
 * Сундук (v0.54.1): закрытый — что внутри, не видно; открытый — ряд как у торговца: золото (уже в кошельке),
 * потом то, что выпало из предмета, артефакта и зелья. Берётся только кнопкой — клик по карточке ничего не забирает.
 * С v0.54.2 закрытый взламывается (`app.startChestLock`): на карточке штифты замка — столько же, сколько вещей, — и ставки
 * засечки; открытый пишет под золотом, что принёс взлом.
 */
function chestCards(app: App, ev: EventState & { kind: 'chest' }): HTMLElement[] {
  const run = app.run!;
  if (!ev.opened) {
    const pins = chestPins(ev);
    const stakes = chestLockStakes(run);
    const skip = !!app.profile.lockSkip;
    const tip = skip
      ? paramTip('chest', 'Открыть', 'Взлом без мини-игры (настройка в паузе): сундук открывается сразу — без золота за засечки и без иглы.', { action: 'Клик или Space — открыть' })
      : paramTip(
          'chest',
          'Взлом',
          `Штифтов в замке столько же, сколько вещей в сундуке, — засечка на каждый. По кольцу бежит отмычка: тап в любом месте или пробел, когда она в зоне.\nЗолотая часть зоны — «отлично», +${stakes.gold} золота за засечку. Бронзовая — «хорошо».\nМимо или не успели — срыв: укол иглы, ${stakes.needle} урона, взлом кончается. Вещи ваши при любом исходе.`,
          { action: 'Клик или Space — начать' },
        );
    const closed = h(
      'div',
      { class: 'card event-card chest-closed' },
      h('div', { class: 'glyph big' }, uiIcon('chest', 64)),
      h('div', { class: 'card-name' }, 'Закрытый сундук'),
      h('div', { class: 'lock-row' }, lockPins(pins), h('span', { class: 'dim' }, `${pins} ${pinsWord(pins)} — столько же вещей`)),
      skip
        ? h('div', { class: 'card-desc' }, 'Золото и вещи этого акта. Взлом выключен в паузе — сундук откроется сразу.')
        : h(
            'div',
            { class: 'card-desc' },
            'Золотая засечка — ',
            h('b', { class: 'lock-plus' }, `+${stakes.gold}`),
            ' ',
            coin(),
            ', срыв — игла ',
            h('b', { class: 'lock-minus' }, `−${stakes.needle} HP`),
            '. Вещи ваши при любом исходе.',
          ),
      h('div', { class: 'card-foot' }, button(skip ? 'Открыть' : 'Взломать', () => app.startChestLock(), { class: 'primary', tip })),
    );
    return [pickable(closed, () => app.startChestLock())];
  }
  const def = heroDef(run.hero.defId);
  const off = !!run.pending;
  const taken = ev.taken ?? [];
  const take = (label: string, item: ChestItem) => button(label, () => app.takeChestItem(item), { class: 'primary', disabled: off });
  const gold = h(
    'div',
    { class: 'card shop-card chest-narrow' },
    h('div', { class: 'glyph big' }, '⛁'),
    h('div', { class: 'card-name' }, 'Золото'),
    h('div', { class: 'card-desc' }, h('span', null, `+${(ev.gold ?? 0) + (ev.lockGold ?? 0)} `, coin(), ` — уже в кошельке (всего ${run.gold}).`)),
    ev.lock
      ? h(
          'div',
          { class: 'lock-result' },
          lockPins(ev.lock.length, ev.lock),
          ev.lockGold ? h('span', null, 'засечки ', h('b', { class: 'lock-plus' }, `+${ev.lockGold}`)) : null,
          ev.needle ? h('span', null, 'игла ', h('b', { class: 'lock-minus' }, `−${ev.needle} HP`)) : null,
        )
      : null,
  );
  const cards: HTMLElement[] = [gold];
  if (ev.gear) cards.push(gearCard(ev.gear, { def, run, footer: take('Надеть', 'gear') }));
  else if (taken.includes('gear')) cards.push(takenCard('Экипировка', false));
  if (ev.artifact) cards.push(artifactCard(ev.artifact, take('Забрать', 'artifact'), undefined, run));
  else if (taken.includes('artifact')) cards.push(takenCard('Артефакт', false));
  // Зелье — узкая колонка, как у торговца.
  if (ev.potion) cards.push(narrow(potionCard(ev.potion, take('Взять', 'potion'), potionReplaceNote(run))));
  else if (taken.includes('potion')) cards.push(takenCard('Зелье', true));
  return cards;
}

/** Алтарь: молитва лечит, жертва режет HP и даёт артефакт (виден до выбора). */
function altarCards(app: App, ev: EventState & { kind: 'altar' }): HTMLElement[] {
  const run = app.run!;
  const max = heroStats(run).maxHp;
  const heal = altarHealAmount(run);
  const prayErr = run.pending ? 'Сначала разместите артефакт' : heal <= 0 ? 'HP и так полное' : null;
  const prayCard = h(
    'div',
    { class: 'card event-card' },
    h('div', { class: 'glyph big' }, '✝'),
    h('div', { class: 'card-name' }, 'Молитва'),
    h('div', { class: 'card-desc' }, `Восстановить 30 % максимума HP: +${heal} (сейчас ${run.hero.hp}/${max}).`),
    h('div', { class: 'card-foot' }, button('Помолиться', () => app.altarPray(), { class: 'primary', disabled: !!prayErr, tip: prayErr ? whyTip(prayErr) : undefined })),
  );
  const pray = prayErr ? prayCard : pickable(prayCard, () => app.altarPray());
  const err = canAltarSacrifice(run);
  const cost = altarSacrificeCost(run);
  let loot: HTMLElement;
  if (ev.artifact) {
    const def = artifactDef(ev.artifact.id);
    loot = h(
      'div',
      { class: 'event-loot' },
      h('div', { class: 'slots' }, artifactChip(ev.artifact)),
      h('div', { class: 'card-sub' }, def.name),
      h('div', { class: 'note' }, ...markKeywords(artifactFullText(def, ev.artifact.tier))),
    );
  } else loot = h('div', { class: 'note' }, 'Алтарю нечего предложить: все артефакты уже на максимуме.');
  const sacrifice = h(
    'div',
    { class: 'card event-card' },
    h('div', { class: 'glyph big' }, '⚱'),
    h('div', { class: 'card-name' }, 'Жертва'),
    h('div', { class: 'card-desc' }, `Отдать ${cost} HP (сейчас ${run.hero.hp}/${max}) и забрать артефакт.`),
    loot,
    h('div', { class: 'card-foot' }, button('Принести жертву', () => app.altarSacrifice(), { class: 'primary', disabled: !!err, tip: err ? whyTip(err) : undefined })),
  );
  return [pray, err ? sacrifice : pickable(sacrifice, () => app.altarSacrifice())];
}

/** Кузнец: карточка на оружие и на броню — что станет с предметом и цена. */
function forgeCards(app: App): HTMLElement[] {
  const run = app.run!;
  return (['weapon', 'armor'] as GearKind[]).map((kind) => {
    const gear = kind === 'weapon' ? run.hero.weapon : run.hero.armor;
    const err = canForge(run, kind);
    const maxed = gear.tier >= 5;
    const next = Math.min(5, gear.tier + 1) as GearTier;
    const tierEl = (t: GearTier) => h('span', { style: `color:${GEAR_TIERS[t].color}`, tip: tierTip(t) }, GEAR_TIERS[t].name);
    return h(
      'div',
      { class: 'card event-card', style: `border-color:${GEAR_TIERS[gear.tier].color}` },
      h('div', { class: 'glyph big' }, kind === 'weapon' ? '⚔' : '⛨'),
      h('div', { class: 'card-name' }, gear.name),
      h('div', { class: 'card-sub' }, tierEl(gear.tier), maxed ? null : ' → ', maxed ? null : tierEl(next)),
      h('div', { class: 'note' }, maxed ? 'Предел: выше легендарного не куют.' : upgradePreview(gear)),
      h(
        'div',
        { class: 'card-foot' },
        button(h('span', null, `Улучшить ${forgePrice(gear)} `, coin()), () => app.forgeUpgrade(kind), { class: 'primary', disabled: !!err, tip: err ? whyTip(err) : undefined }),
      ),
    );
  });
}

/** Итог боя с вором: удрал с кошельком — сухая сводка потери; убит — золото и, если повезло, артефакт из мешка. */
function gnomeCards(app: App, ev: EventState & { kind: 'gnome' }): HTMLElement[] {
  const run = app.run!;
  if (ev.result === 'fled') {
    return [
      h(
        'div',
        { class: 'card event-card' },
        h('div', { class: 'glyph big' }, '➜'),
        h('div', { class: 'card-name' }, 'Только пятки сверкали'),
        h(
          'div',
          { class: 'card-desc' },
          ev.gold > 0 ? h('span', null, `Гном унёс ${ev.gold} `, coin(), `, осталось ${run.gold}.`) : 'Красть было нечего: кошель и так пуст.',
        ),
        h('div', { class: 'note' }, ...markKeywords('Бей раньше: каждый срезанный кошель тянет вора вниз и сбивает ему уворот, а раны бьют мимо уворота.')),
      ),
    ];
  }
  const art = ev.artifact;
  const def = art ? artifactDef(art.id) : null;
  const loot =
    art && def
      ? h(
          'div',
          { class: 'event-loot' },
          h('div', { class: 'slots' }, artifactChip(art)),
          h('div', { class: 'card-sub' }, def.name),
          h('div', { class: 'note' }, ...markKeywords(artifactFullText(def, art.tier))),
        )
      : h('div', { class: 'note' }, 'Кроме монет в мешке ничего не нашлось.');
  const card = h(
    'div',
    { class: 'card event-card' },
    h('div', { class: 'glyph big' }, '⛁'),
    h('div', { class: 'card-name' }, 'Мешок вора'),
    h('div', { class: 'card-desc' }, h('span', null, `Отбито и добыто: ${ev.gold} `, coin(), ` (всего ${run.gold}).`)),
    loot,
    art ? h('div', { class: 'card-foot' }, button('Забрать артефакт', () => app.gnomeTakeLoot(), { class: 'primary', disabled: !!run.pending })) : null,
  );
  return [art && !run.pending ? pickable(card, () => app.gnomeTakeLoot()) : card];
}

/** Итог боя с вещекрадом: удрал — вещь вырвана из сокета навсегда; убит — она осталась при герое. */
function snatcherCards(app: App, ev: EventState & { kind: 'gnome_art' }): HTMLElement[] {
  const run = app.run!;
  const art = ev.artifact;
  const def = art ? artifactDef(art.id) : null;
  const lost = ev.result === 'fled';
  const loot =
    art && def
      ? h(
          'div',
          { class: 'event-loot' },
          h('div', { class: 'slots' }, artifactChip(art)),
          h('div', { class: 'card-sub' }, def.name),
          h('div', { class: 'note' }, ...markKeywords(artifactFullText(def, art.tier))),
        )
      : h('div', { class: 'note' }, lost ? 'Красть было нечего: сокеты пусты.' : 'Вор ушёл ни с чем — брать у героя было нечего.');
  const found = ev.loot;
  const foundDef = found ? artifactDef(found.id) : null;
  const lootCard =
    found && foundDef
      ? h(
          'div',
          { class: 'card event-card' },
          h('div', { class: 'glyph big' }, '⛁'),
          h('div', { class: 'card-name' }, 'Чужое добро'),
          h('div', { class: 'card-desc' }, 'В мешке нашлась вещь с прошлых жертв.'),
          h(
            'div',
            { class: 'event-loot' },
            h('div', { class: 'slots' }, artifactChip(found)),
            h('div', { class: 'card-sub' }, foundDef.name),
            h('div', { class: 'note' }, ...markKeywords(artifactFullText(foundDef, found.tier))),
          ),
          h('div', { class: 'card-foot' }, button('Забрать артефакт', () => app.gnomeTakeLoot(), { class: 'primary', disabled: !!run.pending })),
        )
      : null;
  return [
    h(
      'div',
      { class: 'card event-card' },
      h('div', { class: 'glyph big' }, lost ? '➜' : '⛨'),
      h('div', { class: 'card-name' }, lost ? (art ? 'Вещь уплыла' : 'Только пятки сверкали') : art ? 'Вещь при герое' : 'Вор ушёл ни с чем'),
      h(
        'div',
        { class: 'card-desc' },
        lost && art
          ? 'Сокет опустел: артефакт ушёл с вором навсегда.'
          : art
            ? 'Мешок вспорот, артефакт вернулся в свой сокет.'
            : ev.gold > 0
              ? h('span', null, `За труды нашлось ${ev.gold} `, coin(), ` (всего ${run.gold}).`)
              : 'Ни вещей, ни монет.',
      ),
      loot,
      lost
        ? h('div', { class: 'note' }, ...markKeywords('Вещекрад тянет вещь первым же ходом и удирает на пятом: раны бьют мимо уворота, а после кражи он и сам становится медленнее.'))
        : null,
    ),
    lootCard,
  ].filter((el): el is HTMLElement => el !== null);
}

/** Кнопка «уйти ни с чем»: мимо закрытого сундука проходят, открытый оставляют, после вора идут дальше. */
function leaveLabel(ev: EventState | null): string {
  if (ev?.kind === 'chest') return ev.opened ? 'Дальше' : 'Пройти мимо';
  return ev?.kind === 'gnome' || ev?.kind === 'gnome_art' ? 'Дальше' : 'Уйти';
}

export function eventScreen(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const ev = run.event;
  let cards: HTMLElement[] = [];
  let head: [string, string] = ['Событие', ''];
  if (ev?.kind === 'chest') {
    cards = chestCards(app, ev);
    head = ev.opened ? HEADS.chest : HEADS.chestClosed;
  } else if (ev?.kind === 'altar') {
    cards = altarCards(app, ev);
    head = HEADS.altar;
  } else if (ev?.kind === 'forge') {
    cards = forgeCards(app);
    head = HEADS.forge;
  } else if (ev?.kind === 'gnome_art') {
    cards = snatcherCards(app, ev);
    head =
      ev.result === 'fled'
        ? ['Вор ушёл', 'Гном-вещекрад удрал вместе с добычей.']
        : ['Вор повержен', 'Гном-вещекрад больше ни у кого ничего не стянет.'];
  } else if (ev?.kind === 'gnome') {
    cards = gnomeCards(app, ev);
    head =
      ev.result === 'fled'
        ? ['Вор ушёл', 'Гном-деньгокрад удрал вместе с добычей.']
        : ['Вор повержен', 'Гном-деньгокрад больше никого не обчистит.'];
  }
  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h('div', { class: 'title-row' }, h('h2', null, head[0]), h('p', { class: 'dim' }, head[1])),
    h('div', { class: `cards ${cards.length === 1 ? 'single' : ''}` }, ...cards),
    h(
      'div',
      { class: 'row' },
      button(leaveLabel(ev), () => app.leaveEvent(), { disabled: !!run.pending }),
    ),
  );
  return runFrame(app, { cls: `event event-${ev?.kind ?? 'none'}${ev?.kind === 'chest' && ev.opened ? ' chest-open' : ''}`, center, mid: hubGear(app), overlays: [pendingModal(app)] });
}
