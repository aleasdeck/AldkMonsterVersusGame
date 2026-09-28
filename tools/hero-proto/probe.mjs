// Точки каждого кадра клипов героя числами — проверить путь кисти и острия, не глядя в картинку.
//
//   node tools/hero-proto/probe.mjs                    → все клипы
//   node tools/hero-proto/probe.mjs --clips attack,heavy
//
// Координаты — единицы поля модели (земля — `ground`, x растёт к врагам). По кадру: таз, кисть, острие (угол клинка
// в мире — на глаз, куда смотрит меч), стопы. Помечает острие под землёй и кадр контакта (*).
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const ONLY = opt('clips', '');
const LOOK = opt('look', 'B');

const bundle = await build({
  stdin: {
    contents: [
      "export { warriorModel, warriorProbe } from './src/ui/heroes/warrior';",
      "export { HERO_CLIPS, renderHeroClip } from './src/ui/heroes/clips';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { warriorModel, warriorProbe, HERO_CLIPS, renderHeroClip, MOB_STYLE } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const model = warriorModel();
const r = (v) => String(Math.round(v)).padStart(4);
for (const clip of Object.keys(HERO_CLIPS).filter((c) => c !== 'idle' && (!ONLY || ONLY.split(',').includes(c)))) {
  const rows = [];
  warriorProbe.on = (info) => rows.push(info);
  renderHeroClip(model, clip, { ...MOB_STYLE, d: 1.5 });
  warriorProbe.on = undefined;
  const spec = HERO_CLIPS[clip];
  console.log(`\n${clip} — ${spec.name} (${spec.frames} × ${spec.fps}, контакт ${spec.contact ?? '—'})`);
  console.log('  кадр   таз x,y    кисть x,y   острие x,y  клинок°  стопы F,N');
  rows.forEach((o, f) => {
    const ang = (Math.atan2(o.tipY - o.handY, o.tipX - o.handX) * 180) / Math.PI;
    const warn = o.tipY > o.ground + 1 ? '  ← острие в земле' : '';
    console.log(`  ${String(f).padStart(2)}${f === spec.contact ? '*' : ' '} ${r(o.hipX)}${r(o.hipY)}  ${r(o.handX)}${r(o.handY)}  ${r(o.tipX)}${r(o.tipY)}   ${r(ang)}    ${r(o.footF)}${r(o.footN)}${warn}`);
  });
}
