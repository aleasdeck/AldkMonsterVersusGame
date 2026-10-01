/**
 * Воркер рендера звуков действий (docs/zvuki.md): по сигналу рендерит весь каталог в порядке важности (`renderOrder`) по
 * одному звуку, отдавая каждый, как только готов, — 32-битные каналы переносом, без копии. Все 75 звуков — около 8 с работы синтезатора:
 * в главном потоке это подвисание, а здесь частые звуки боя готовы через долю секунды, редкие — дозревают в фоне.
 */
import { GAME_FLOOR_DB, renderTake } from './render';
import { renderOrder, SFX, sfxTake } from './sounds';

export interface SfxReply {
  id: string;
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  /** Момент удара в звуке, с: к нему игра приурочивает звук. */
  hit: number;
}

/** Любое сообщение — начать: порядок рендера знает каталог, главному потоку он не нужен. */
self.onmessage = () => {
  for (const id of renderOrder()) {
    const def = SFX[id];
    if (!def) continue;
    // Надстройка (крит) в игре звучит поверх своего удара отдельным звуком — рендерится без основы.
    const { take, room, hit } = sfxTake(def, undefined, true);
    const r = renderTake(def.id, take, room, def.level ?? 0, undefined, GAME_FLOOR_DB);
    const reply: SfxReply = { id, sampleRate: r.sampleRate, left: r.left, right: r.right, hit };
    self.postMessage(reply, { transfer: [r.left.buffer, r.right.buffer] });
  }
};
