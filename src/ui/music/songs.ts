/**
 * Треки локаций (docs/muzyka.md): у каждой локации три варианта — A эмбиент, B оркестр или хор, C ритм, — все на одном
 * мотиве локации. Какой играет в игре — MUSIC_PICK; до выбора пользователя там рекомендации со страницы обсуждения
 * «Музыка локаций» (tools/music-proto/build.mjs). Ноты — в tracks/<локация>.ts.
 */
import type { LocationId } from '../../engine/types';
import type { Song } from './synth';
import { cavesTracks } from './tracks/caves';
import { cryptTracks } from './tracks/crypt';
import { forestTracks } from './tracks/forest';
import { hiveTracks } from './tracks/hive';
import { shipTracks } from './tracks/ship';
import { swampTracks } from './tracks/swamp';

/** Варианты каждой локации по порядку A, B, C. Собираются один раз: разбор нот дешёвый, звук рендерит воркер по запросу. */
export const VARIANTS: Record<LocationId, Song[]> = {
  forest: forestTracks(),
  swamp: swampTracks(),
  hive: hiveTracks(),
  ship: shipTracks(),
  caves: cavesTracks(),
  crypt: cryptTracks(),
};

/** Какой вариант играет в игре. */
export const MUSIC_PICK: Record<LocationId, string> = {
  forest: 'b',
  swamp: 'c',
  hive: 'b',
  ship: 'b',
  caves: 'b',
  crypt: 'c',
};

/** Все треки по id («forest-b»). */
export const SONG_BY_ID: Record<string, Song> = Object.fromEntries(
  Object.values(VARIANTS)
    .flat()
    .map((s) => [s.id, s]),
);

/** Трек, который играет в локации. */
export const SONGS = Object.fromEntries(
  (Object.keys(VARIANTS) as LocationId[]).map((loc) => [loc, VARIANTS[loc].find((s) => s.variant === MUSIC_PICK[loc]) ?? VARIANTS[loc][0]]),
) as Record<LocationId, Song>;
