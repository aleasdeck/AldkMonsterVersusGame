// Страница обсуждения «Обучение в Лесу»: сценарий обучения с мыслями героя и кадры игры с облачком мысли поверх.
//
//   npm run dev                                   (dev-сервер должен крутиться)
//   node tools/tutorial-proto/build.mjs           → tutorial-preview/obuchenie.html и tutorial-preview/img/*.webp
//
// Ключи: --url http://localhost:5173/ — адрес dev-сервера; --fonts <папка> — отдавать Google Fonts из папки (fonts.css и
// woff2 с именами пути gstatic через «_»): в облачной сессии headless Chromium без прокси шрифтов не достаёт.
// Кадры — настоящие экраны игры по отладочным адресам (&foes=, &offer=, &phase=), облачко и золотой контур рисуются поверх
// в DOM перед снимком. Тексты облачков — те же, что в сценарии (obuchenie.html). WebP делает Pillow (python3).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'tutorial-preview');
const SHOTS = join(OUT, 'shots');
const IMG = join(OUT, 'img');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('--url', 'http://localhost:5173/');
const FONTS = arg('--fonts', null);

const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
mkdirSync(SHOTS, { recursive: true });
mkdirSync(IMG, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
if (FONTS) {
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(join(FONTS, 'fonts.css'), 'utf8') }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => {
    const p = join(FONTS, r.request().url().replace('https://fonts.gstatic.com/', '').replace(/\//g, '_'));
    return existsSync(p) ? r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(p) }) : r.abort();
  });
}

/** Облачко мысли: пергамент шрифтом игры; в бою — хвостиком к герою, на хабах — с аватаркой героя. */
const CSS = `
.th-bubble { position: absolute; z-index: 9000; max-width: 300px; background: #f3ead6; color: #231c14; border: 2px solid #231c14;
  box-shadow: 3px 3px 0 #000a; padding: 6px 10px 7px; font: 21px/1.0 'Handjet', monospace; letter-spacing: 0.01em; pointer-events: none; }
.th-bubble b { color: #8b1e2d; font-weight: 600; }
.th-bubble::after { content: ''; position: absolute; left: 26px; bottom: -7px; width: 10px; height: 10px; background: #f3ead6;
  border-right: 2px solid #231c14; border-bottom: 2px solid #231c14; transform: rotate(45deg); }
.th-bubble.hub { display: flex; gap: 9px; align-items: center; }
.th-bubble.hub::after { display: none; }
.th-bubble .th-av { flex: none; outline: 2px solid #231c14; }
.th-point { outline: 2px solid #ffd166 !important; outline-offset: 2px; box-shadow: 0 0 0 4px #ffd16633, 0 0 14px #ffd16688 !important; }
`;

async function thought(page, t) {
  await page.evaluate(({ t, css }) => {
    if (!document.getElementById('th-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'th-css', textContent: css }));
    const host = document.querySelector('.screen') ?? document.body;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const b = document.createElement('div');
    b.className = 'th-bubble';
    b.style.left = `${t.x}px`;
    if (t.b !== undefined) b.style.bottom = `${540 - t.b}px`;
    else b.style.top = `${t.y}px`;
    b.style.maxWidth = `${t.w}px`;
    b.innerHTML = `<span>${t.text}</span>`;
    const av = t.avatar ? document.querySelector('.c-hero .hero-avatar') : null;
    if (av) {
      const c = av.cloneNode(true);
      c.classList.add('th-av');
      b.prepend(c);
      b.classList.add('hub');
    }
    host.appendChild(b);
    for (const sel of t.point ?? []) document.querySelectorAll(sel).forEach((el) => el.classList.add('th-point'));
  }, { t, css: CSS });
}

const mv = (page, fn, a) => page.evaluate(fn, a);
async function attack(page) {
  const uid = await mv(page, () => window.mv.run.battle.enemies[0].uid);
  await mv(page, (uid) => window.mv.battleAction({ type: 'attack', target: uid }), uid);
  await wait(1400);
}
async function endTurn(page) {
  await mv(page, () => window.mv.endTurn());
  for (let i = 0; i < 40; i++) {
    await wait(300);
    if (!(await mv(page, () => !!(window.mv.busy || window.mv.run?.battle?.phase !== 'player')))) break;
  }
  await wait(700);
}

async function shot(name, url, steps, bubble) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}${url}&music=off&sfx=off&diff=normal`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await wait(1800);
  if (steps) await steps(page);
  if (bubble) await thought(page, bubble);
  await wait(300);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  console.log('кадр', name);
  await page.close();
}

const HERO = '?hero=warrior&seed=5&locs=forest,crypt,ship';
const ARTS = '&art=mana_shield,wanderer_cloak';
const DEF = '&phase=reward&focus=defense&offer=a:plate:2:s=ax:none,art:mana_shield:1,a:robe:2:s=ax:none';
const ATK = '&phase=reward&focus=attack&offer=w:spear:2:s=wx:none,art:grapple_hook:1,w:bow:2:s=xw:none';
const fight = (b, text, point, w = 290) => ({ x: 74, b, w, text, point });
const hub = (x, pos, w, text, point) => ({ x, ...pos, w, avatar: true, text, point });

// Меню нового игрока: «Обучение» первой и главной кнопкой (вставляется в DOM — в игре её пока нет).
await shot('menu', '?x=1', async (page) => {
  await page.evaluate(() => {
    const box = document.querySelector('.menu-buttons');
    const btns = [...box.querySelectorAll('button')];
    btns.forEach((b) => b.classList.remove('primary'));
    const t = btns[0].cloneNode(true);
    t.textContent = 'Обучение';
    t.classList.add('primary');
    box.insertBefore(t, btns[0]);
  });
});
await shot('sheet', HERO + '&enter=1&foes=wolf' + ARTS + '&sheet=1');
await shot('m-map', HERO, null, hub(330, { y: 150 }, 420, 'Лес. Десять шагов по тропе: бои, три развилки <b>«?»</b>, засада <b>☠</b> — и логово <b>♛</b> в конце.', ['.room-strip']));
await shot('m-f1', HERO + '&enter=1&foes=wolf,wolf', null, fight(176, 'Два волка. Над каждым видно, что он задумал: <b>«⚔ 4»</b> — укусит на четыре.', ['.enemy .pill'], 280));
await shot('m-f1b', HERO + '&enter=1&foes=wolf,wolf', async (p) => { await attack(p); await attack(p); }, fight(160, 'Второй удар слабее первого — рука устаёт. Третий будет ещё слабее.', ['.fatigue-badge', '.tiles .tile:nth-child(1)'], 280));
await shot('m-f2', HERO + '&enter=1&foes=goblin,bandit_archer', async (p) => { await mv(p, () => window.mv.arm('attack')); await wait(400); }, fight(176, 'Лучник в тени — мечом не дотянусь. Сперва гоблин: он и так прикрывает лучника собой.', ['.role-mark.role-guard', '.role-mark.covered']));
await shot('m-f4', HERO + '&enter=1&foes=boar', async (p) => { await endTurn(p); await endTurn(p); }, fight(176, 'Роет копытом — следом <b>«Разгон»</b>. Самое время закрыться.', ['.enemy .pill', '.tiles .tile:nth-child(2)'], 280));
await shot('m-pool', HERO + '&phase=reward', null, hub(160, { b: 356 }, 600, 'Что именно дадут — не видно, видно из чего: «Нападение» — оружие и его вещи, «Защита» — броня и её вещи.', ['.focus-card .card-head']));
await shot('m-rdef', HERO + DEF, null, hub(352, { b: 357 }, 586, 'Знак <b>«■ Щит»</b> — тот же, что на моём Щитовом ударе. Две вещи одного знака — уже набор.', ['.art-card .arch-label', '.art-card .art-tbl-row:last-child']));
await shot('m-ratk', HERO + ATK, null, hub(352, { b: 357 }, 586, 'Лук достанет любого, но тетиву я не тяну: урон вдвое ниже, а Прицел мне не дастся.', ['.cards .card:nth-child(3) .item-type', '.cards .card:nth-child(3) .prop-row']));
await shot('m-place', HERO + DEF, async (p) => { await wait(500); await mv(p, () => window.mv.takeReward(1)); await wait(900); }, hub(400, { y: 160 }, 420, 'Магический щит — бронный: в меч не встанет. А в кольчуге гнездо как раз пустое.', ['.pl-sock']));
await shot('m-shop', HERO + '&phase=shop', null, hub(300, { b: 357 }, 636, 'Лекарь, вещь, артефакт, склянка — всё за золото. Не нравится прилавок — за 5 монет завезут другой.', ['.gold']));
await shot('m-f5', HERO + '&enter=1&foes=spider,bat', null, fight(176, 'Клыки на значке мыши — что откусит, то себе в здоровье. Паук сзади: ✧ заклинатель, кусает ядом.', ['.enemy .pill']));
await shot('m-chest', HERO + '&phase=event&event=chest', null, hub(18, { y: 96 }, 290, 'Сундук на замке. Сколько штифтов — столько вещей. Сорвусь — уколюсь, и замок заклинит.', ['.lock-row']));
await shot('m-f7', HERO + '&enter=1&foes=cutthroat,goblin_shaman' + ARTS, null, fight(160, '<b>✚</b> Шаман — поддержка: лечит соседей. Пока он жив, головорез будет подниматься.', ['.role-mark.role-support'], 300));
await shot('m-elite', HERO + '&enter=1&foes=bear' + ARTS, null, fight(160, 'Медведь. Засада покрепче: здоровья как у троих волков. Зато и награда — тиром выше.', ['.enemy .bar-hp'], 300));
await shot('m-camp', HERO + '&phase=camp&art=mana_shield', null, hub(486, { y: 232 }, 450, 'Привал. Отдохнуть — вернуть половину здоровья. Или подточить артефакт на тир. Впереди логово — решать мне.'));
await shot('m-boss', HERO + '&room=9&enter=1&boss2=1' + ARTS, null, fight(160, 'Ранен — красная аура, вторая повадка. И злится: каждая ярость — укус сильнее. Тянуть нельзя.', ['.enemy .pill'], 300));
await browser.close();

// PNG 1920×1080 → WebP 1440×810: страница с кадрами весит около 2 МБ вместо 15.
const py = [
  'import glob, os, sys',
  'from PIL import Image',
  'src, dst = sys.argv[1], sys.argv[2]',
  'for p in sorted(glob.glob(os.path.join(src, "*.png"))):',
  '    Image.open(p).convert("RGB").resize((1440, 810), Image.LANCZOS).save(os.path.join(dst, os.path.basename(p)[:-4] + ".webp"), "WEBP", quality=82, method=6)',
].join('\n');
const res = spawnSync('python3', ['-c', py, SHOTS, IMG], { stdio: 'inherit' });
if (res.status !== 0) throw new Error('WebP не собрался: нужен python3 с Pillow');
rmSync(SHOTS, { recursive: true, force: true });
copyFileSync(join(HERE, 'obuchenie.html'), join(OUT, 'obuchenie.html'));
console.log('→', join(OUT, 'obuchenie.html'));
