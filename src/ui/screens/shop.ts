import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { REROLL_COST, SHOP_HEAL_COST, SHOP_HEAL_PCT, SHOP_POTION_PRICE, artifactPrice, gearPrice } from '../../engine/loot';
import { canShopBuyArtifact, canShopBuyGear, canShopBuyPotion, canShopHeal, canShopReroll, currentLocation, heroStats, shopHealAmount } from '../../engine/run';
import { artifactCard, coin, gearCard, pendingModal, potionCard, potionReplaceNote } from '../components';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import type { App } from '../app';

/** Кнопка покупки: «Купить 5 ◉» без «за» — в четырёх узких колонках каждое слово на счету; причина недоступности — в подсказке. */
function buyButton(cost: number, err: string | null, onclick: () => void): HTMLElement {
  return button(h('span', null, `Купить ${cost} `, coin()), onclick, { class: 'primary', disabled: !!err, tip: err ?? undefined });
}

/** Карточка проданного товара: место остаётся, чтобы ряд не прыгал. */
function soldCard(what: string): HTMLElement {
  return h('div', { class: 'card shop-card sold' }, h('div', { class: 'glyph big' }, '✓'), h('div', { class: 'card-name' }, what), h('div', { class: 'card-desc' }, 'Куплено'));
}

/**
 * Торговец после элиты: лекарь, одна экипировка, один артефакт, одно зелье. Покупка — только кнопкой, клик по карточке
 * ничего не тратит. Переброс обновляет непроданные товары, один раз за визит.
 */
export function shopScreen(app: App): HTMLElement {
  const run = app.run!;
  const shop = run.shop!;
  const def = heroDef(run.hero.defId);
  const loc = currentLocation(run);
  const max = heroStats(run).maxHp;

  const healErr = canShopHeal(run);
  const heal = shopHealAmount(run);
  const healCard = h(
    'div',
    { class: 'card shop-card' },
    h('div', { class: 'glyph big' }, '⚗'),
    h('div', { class: 'card-name' }, 'Лекарь'),
    h('div', { class: 'card-desc' }, shop.healed ? 'Раны перевязаны, больше не поможет.' : `Восстановить ${Math.round(SHOP_HEAL_PCT * 100)} % максимума HP: +${heal} (сейчас ${run.hero.hp}/${max}).`),
    h('div', { class: 'card-foot' }, buyButton(SHOP_HEAL_COST, healErr, () => app.shopHeal())),
  );

  const gearErr = canShopBuyGear(run);
  const gearEl = shop.gear ? gearCard(shop.gear, { def, footer: buyButton(gearPrice(shop.gear), gearErr, () => app.shopBuyGear()) }) : soldCard('Экипировка');

  const artErr = canShopBuyArtifact(run);
  const artEl = shop.artifact
    ? artifactCard(shop.artifact, buyButton(artifactPrice(shop.artifact), artErr, () => app.shopBuyArtifact()))
    : soldCard('Артефакт');

  const potionErr = canShopBuyPotion(run);
  const potionEl = shop.potion ? potionCard(shop.potion, buyButton(SHOP_POTION_PRICE, potionErr, () => app.shopBuyPotion()), potionReplaceNote(run)) : soldCard('Зелье');

  const rerollErr = canShopReroll(run);
  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h('div', { class: 'title-row' }, h('h2', null, 'Торговец'), h('p', { class: 'dim' }, 'Купить можно всё, на что хватит золота.')),
    h('div', { class: 'cards' }, healCard, gearEl, artEl, potionEl),
    h(
      'div',
      { class: 'row' },
      button('Уйти', () => app.leaveShop(), { class: 'primary', disabled: !!run.pending }),
      button(h('span', null, `Перебросить за ${REROLL_COST} `, coin()), () => app.shopReroll(), {
        disabled: !!rerollErr,
        tip: rerollErr ?? 'Заменить непроданные товары на новые. Один раз за визит.',
      }),
    ),
  );
  return runFrame(app, { cls: 'shop', center, mid: hubGear(app), overlays: [pendingModal(app)] });
}
