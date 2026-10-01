/**
 * Воркер рендера музыки: получает id трека («forest-b»), рендерит его (1–3 с работы синтезатора) и отдаёт 32-битные
 * каналы переносом, без копии. Главный поток в это время рисует бой: в нём рендер стоил бы заметного подвисания.
 */
import { SONG_BY_ID } from './songs';
import { renderSong } from './synth';

export interface MusicReply {
  id: string;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

self.onmessage = (ev: MessageEvent<{ id: string }>) => {
  const { id } = ev.data;
  const r = renderSong(SONG_BY_ID[id]);
  const reply: MusicReply = { id, sampleRate: r.sampleRate, left: r.left, right: r.right };
  self.postMessage(reply, { transfer: [r.left.buffer, r.right.buffer] });
};
