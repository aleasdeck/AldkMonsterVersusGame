/**
 * Треки локаций (docs/muzyka.md): по одному на локацию, выбраны пользователем из трёх вариантов на странице обсуждения
 * «Тёмная музыка локаций». Невыбранные варианты остались в истории git. Ноты — в tracks/<локация>.ts.
 */
import type { LocationId } from '../../engine/types';
import type { Song } from './synth';
import { cavesTrack } from './tracks/caves';
import { cryptTrack } from './tracks/crypt';
import { forestTrack } from './tracks/forest';
import { hiveTrack } from './tracks/hive';
import { shipTrack } from './tracks/ship';
import { swampTrack } from './tracks/swamp';

/** Трек каждой локации. Собираются один раз: разбор нот дешёвый, звук рендерит воркер по запросу. */
export const SONGS: Record<LocationId, Song> = {
  forest: forestTrack(),
  swamp: swampTrack(),
  hive: hiveTrack(),
  ship: shipTrack(),
  caves: cavesTrack(),
  crypt: cryptTrack(),
};
