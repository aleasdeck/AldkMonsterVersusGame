/**
 * Один AudioContext на страницу — для музыки локаций (music/) и звуков действий (sfx/). Браузер не даёт звуку начаться
 * без жеста игрока, поэтому контекст создаётся на первом нажатии мыши или клавиши тем, кто первым его попросит. Два
 * контекста тоже работают, но второй — это второй поток звука и вдвое больше работы аудиодвижка браузера.
 */
let shared: AudioContext | null = null;

/** Общий контекст; null — в браузере нет Web Audio. Создаёт его при первом вызове — звать из обработчика жеста. */
export function sharedAudio(): AudioContext | null {
  if (shared) return shared;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  shared = new Ctx();
  return shared;
}
