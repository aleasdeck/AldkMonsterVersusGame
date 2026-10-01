/**
 * Воркер рендера музыки: получает id локации, рендерит её трек (1–3 с работы синтезатора) и отдаёт 16-битные каналы
 * переносом, без копии. Главный поток в это время рисует бой: в нём рендер стоил бы заметного подвисания.
 */
import type { LocationId } from '../../engine/types';
import { SONGS } from './songs';
import { renderSong } from './synth';

export interface MusicReply {
  id: LocationId;
  sampleRate: number;
  left: Int16Array;
  right: Int16Array;
}

self.onmessage = (ev: MessageEvent<{ id: LocationId }>) => {
  const { id } = ev.data;
  const r = renderSong(SONGS[id]);
  const reply: MusicReply = { id, sampleRate: r.sampleRate, left: r.left, right: r.right };
  self.postMessage(reply, { transfer: [r.left.buffer, r.right.buffer] });
};
