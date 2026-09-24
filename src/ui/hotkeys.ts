import type { App } from './app';
import { awaitsFocus, awaitsTrial } from '../engine/run';
import { cycleVariant } from './variants';

/**
 * Горячие клавиши забега: 1–9 приёмы по порядку плиток (выбрать; номер уже выбранного — применить к цели), в награде 1/2 — пул,
 * Enter применить выбранный приём к цели (Tab перебирает цели), Space конец хода, C персонаж, L лог,
 * Esc снять выбор приёма, закрыть верхний слой или открыть паузу. Русская раскладка тоже принимается (С, Д).
 * В полях ввода (сид на выборе героя) клавиши не перехватываются.
 */
export function installHotkeys(app: App): void {
  window.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    // Прототипы интерфейса (variants.ts): Shift+1/2/3 листают варианты выбора героя, карточек экипировки и артефактов на любом экране.
    // По коду клавиши, а не по символу: Shift+1 в русской и английской раскладке даёт разные знаки.
    const area = ev.shiftKey ? ({ Digit1: 'hs', Digit2: 'gc', Digit3: 'ac' } as const)[ev.code as 'Digit1' | 'Digit2' | 'Digit3'] : undefined;
    if (area) {
      ev.preventDefault();
      app.showToast(cycleVariant(area));
      app.render();
      return;
    }
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
    if (lower === 'l' || lower === 'д') {
      ev.preventDefault();
      app.toggleLog();
      return;
    }
    // Под оверлеем остальные клавиши не действуют: клики по полю тоже не проходят.
    if (app.sheetOpen || app.pauseOpen || app.logOpen) return;
    const inBattle = app.run.phase === 'battle' && !!app.run.battle;
    if (key === ' ') {
      if (inBattle) {
        ev.preventDefault();
        app.endTurn();
      }
      return;
    }
    // Награда за бой ждёт выбора пула: 1 — «Нападение», 2 — «Защита» (порядок карточек на экране).
    if (app.run.phase === 'reward' && awaitsFocus(app.run.rewards[0])) {
      if (key === '1' || key === '2') {
        ev.preventDefault();
        app.chooseRewardFocus(key === '1' ? 'attack' : 'defense');
      }
      return;
    }
    // Порог локации (v0.48): 1 и 2 — испытание из карточек слева направо.
    if (app.run.phase === 'map' && awaitsTrial(app.run)) {
      if (key === '1' || key === '2') {
        ev.preventDefault();
        const id = app.run.trialOffer[key === '1' ? 0 : 1];
        if (id) app.chooseTrial(id);
      }
      return;
    }
    if (!inBattle) return;
    if (key === 'Enter') {
      if (app.armed) {
        ev.preventDefault();
        app.applyAim();
      }
      return;
    }
    if (key === 'Tab') {
      if (app.armed) {
        ev.preventDefault();
        app.aimNext();
      }
      return;
    }
    if (key >= '1' && key <= '9') {
      const tiles = app.root.querySelectorAll<HTMLElement>('.tiles .tile');
      const tile = tiles[Number(key) - 1];
      if (!tile || tile.classList.contains('off')) return;
      ev.preventDefault();
      // Номер уже выбранного приёма — применить к цели, как Enter; иначе выбрать приём или применить его, если цели не нужно.
      if (tile.classList.contains('armed')) app.applyAim();
      else tile.click();
    }
  });
}
