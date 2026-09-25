// Страница обсуждения «Лепка приёмов» (v0.52.6 → план v0.52.7): сравнение fx.ts с черновиками лепки эффектов.
//
//   node tools/fx-proto/build.mjs            → fx-preview/lepka-priyomov.html (один файл, ~1.2 МБ)
//
// Черновики лежат в fxlepka.ts и не входят в игру: по ним переносятся семейства эффектов в src/ui/fx/.
// Сцена — page.ts: два поля Леса, сверху настоящий fx.ts, снизу черновики; варианты клича и блока.
// «Сейчас» — игра, какая она есть на момент сборки: с v0.52.7 блок там уже латами (src/ui/fx/plates.ts).
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'fx-preview');
const uri = (p) => 'data:image/png;base64,' + readFileSync(join(ROOT, p)).toString('base64');

// Листы героев игры странице не нужны (героя она рисует сама, из data URI ниже): картинки из src — пустышки.
const bundle = await build({ entryPoints: [join(HERE, 'page.ts')], bundle: true, format: 'iife', minify: true, write: false, logLevel: 'warning', target: 'es2020', loader: { '.png': 'empty' } });
const js = bundle.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const heroes = Object.fromEntries(['warrior', 'mage', 'archer', 'assassin'].map((id) => [id, uri(`src/assets/heroes/${id}.png`)]));
const html = readFileSync(join(HERE, 'template.html'), 'utf8')
  .replace('{{BG}}', uri('src/assets/backgrounds/forest-wide.png'))
  .replace('{{HEROES}}', JSON.stringify(heroes))
  .replace('{{BUNDLE}}', () => js);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'lepka-priyomov.html'), html);
console.log(`${join(OUT, 'lepka-priyomov.html')} — ${Math.round(html.length / 1024)} КБ`);
