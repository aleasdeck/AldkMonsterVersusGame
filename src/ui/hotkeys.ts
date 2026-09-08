import type { App } from './app';

/**
 * Горячие клавиши забега: 1–9 приёмы по порядку плиток, Space конец хода, C персонаж, L лог,
 * Esc закрыть верхний слой или открыть паузу. Русская раскладка тоже принимается (С, Д).
 * В полях ввода (сид на выборе героя) клавиши не перехватываются.
 */
export function installHotkeys(app: App): void {
  window.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (app.screen !== 'run' || !app.run) return;
    const key = ev.key;
    const lower = key.toLowerCase();
    if (key === 'Escape') {
      ev.preventDefault();
      app.escape();
      return;
    }
    if (lower === 'c' || lower === 'с') {
      ev.preventDefault();
      app.toggleSheet();
      return;
    }
    // Под оверлеем остальные клавиши не действуют: клики по полю тоже не проходят.
    if (app.sheetOpen || app.pauseOpen) return;
    const inBattle = app.run.phase === 'battle' && !!app.run.battle;
    if (lower === 'l' || lower === 'д') {
      if (inBattle) {
        ev.preventDefault();
        app.toggleLog();
      }
      return;
    }
    if (key === ' ') {
      if (inBattle) {
        ev.preventDefault();
        app.endTurn();
      }
      return;
    }
    if (inBattle && key >= '1' && key <= '9') {
      const tiles = app.root.querySelectorAll<HTMLElement>('.tiles .tile');
      const tile = tiles[Number(key) - 1];
      if (tile && !tile.classList.contains('off')) {
        ev.preventDefault();
        tile.click();
      }
    }
  });
}
