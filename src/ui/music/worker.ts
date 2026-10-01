/**
 * Воркер рендера музыки: получает id трека (он же id локации), рендерит его (1–3 с работы синтезатора) и отдаёт 32-битные
 * каналы переносом, без копии. Главный поток в это время рисует бой: в нём рендер стоил бы заметного подвисания.
 */
import type { LocationId } from '../../engine/types';
import { SONGS } from './songs';
import { renderSong } from './synth';

export interface MusicReply {
  id: string;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

self.onmessage = (ev: MessageEvent<{ id: string }>) => {
  const { id } = ev.data;
  const r = renderSong(SONGS[id as LocationId]);
  const reply: MusicReply = { id, sampleRate: r.sampleRate, left: r.left, right: r.right };
  self.postMessage(reply, { transfer: [r.left.buffer, r.right.buffer] });
};
