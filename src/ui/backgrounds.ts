import type { LocationId } from '../engine/types';
import cavesTall from '../assets/backgrounds/caves-tall.png';
import cavesWide from '../assets/backgrounds/caves-wide.png';
import cryptTall from '../assets/backgrounds/crypt-tall.png';
import cryptWide from '../assets/backgrounds/crypt-wide.png';
import forestTall from '../assets/backgrounds/forest-tall.png';
import forestWide from '../assets/backgrounds/forest-wide.png';
import hiveTall from '../assets/backgrounds/hive-tall.png';
import hiveWide from '../assets/backgrounds/hive-wide.png';
import shipTall from '../assets/backgrounds/ship-tall.png';
import shipWide from '../assets/backgrounds/ship-wide.png';
import swampTall from '../assets/backgrounds/swamp-tall.png';
import swampWide from '../assets/backgrounds/swamp-wide.png';

/**
 * Два кадра фона на локацию: wide — поле боя, tall — карта и хабы. Пропорция у них одна
 * (960×320, ровно центр кадра забега), разница в приближении: wide — вся сцена, tall — кусок крупнее.
 */
export type BgVariant = 'wide' | 'tall';

/**
 * Рисованные фоны (v0.41.1 лес, v0.41.2 остальные пять): мастер генератора лежит в `art/<локация>-bg.png`,
 * кадры режет `tools/location-bg.py`. 960×320 — в логическом кадре 1:1, на FullHD ровно ×2, поэтому
 * `image-rendering: pixelated` нигде не пересчитывает пиксели и фон такой же чёткий, как спрайты героев.
 * Процедурные фоны, жившие здесь до v0.41.2, удалены (есть в истории): арт теперь у всех шести локаций,
 * а запись в `Record` обязательная — локация без своего фона не соберётся.
 */
const BACKGROUNDS: Record<LocationId, Record<BgVariant, string>> = {
  forest: { wide: forestWide, tall: forestTall },
  swamp: { wide: swampWide, tall: swampTall },
  crypt: { wide: cryptWide, tall: cryptTall },
  hive: { wide: hiveWide, tall: hiveTall },
  caves: { wide: cavesWide, tall: cavesTall },
  ship: { wide: shipWide, tall: shipTall },
};

export function locationBackground(id: LocationId, variant: BgVariant = 'tall'): string {
  return BACKGROUNDS[id][variant];
}

/** Инлайн-стиль с фоном локации и затемнением поверх. */
export function backgroundStyle(id: LocationId, darken: number, variant: BgVariant = 'tall'): string {
  return `background-image:linear-gradient(rgba(11,11,18,${darken}),rgba(11,11,18,${darken})),url(${locationBackground(id, variant)});background-size:cover;background-position:center;image-rendering:pixelated;`;
}
