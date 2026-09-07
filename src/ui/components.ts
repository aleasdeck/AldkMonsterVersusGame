import { button, h, type Child } from './dom';
import type { ArtTier, ArtifactInstance, Combatant, DerivedStats, GearInstance, GearTier, RunState, StatusId } from '../engine/types';
import { statusIcon } from './icons';
import { artifactCostText, artifactDef } from '../data/artifacts';
import { ART_TIER_COLORS, GEAR_TIERS, gearStatText } from '../data/gear';
import { heroDef } from '../data/heroes';
import { heroStats } from '../engine/run';
import { findSameArtifact, gearOf, socketRefs } from '../engine/equipment';
import { STATUS_HINTS, STATUS_NAMES } from '../engine/combat';
import { spriteImg } from './sprites';
import type { App } from './app';

export function bar(cls: string, cur: number, max: number, label = ''): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return h(
    'div',
    { class: `bar bar-${cls}` },
    h('div', { class: 'bar-fill', style: `width:${pct}%` }),
    h('span', { class: 'bar-text' }, `${label ? label + ' ' : ''}${cur}/${max}`),
  );
}

export function staPips(cur: number, max: number): HTMLElement {
  const pips: HTMLElement[] = [];
  const total = Math.max(cur, max);
  for (let i = 0; i < total; i++) pips.push(h('span', { class: `pip ${i < cur ? 'on' : ''}` }));
  return h('div', { class: 'sta', title: `Стамина ${cur}/${max}` }, h('span', { class: 'sta-label' }, 'STA'), ...pips);
}

export function tierBadge(tier: GearTier): HTMLElement {
  const info = GEAR_TIERS[tier];
  return h('span', { class: 'tier', style: `color:${info.color};border-color:${info.color}` }, `${info.name} · ${tier}`);
}

export function artifactTitle(inst: ArtifactInstance): string {
  const def = artifactDef(inst.id);
  const lines = [`${def.name} (тир ${inst.tier})`, def.describe(inst.tier)];
  if (def.kind === 'active') lines.push(`Цена: ${artifactCostText(def)}`);
  else lines.push('Пассивный');
  if (inst.tier < 3) lines.push(`Следующий тир: ${def.describe((inst.tier + 1) as ArtTier)}`);
  return lines.join('\n');
}

export function artifactChip(inst: ArtifactInstance | null, opts: { onclick?: () => void; selected?: boolean } = {}): HTMLElement {
  if (!inst) return h('div', { class: 'chip chip-empty', title: 'Пустой слот' }, '·');
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    {
      class: `chip ${def.kind} ${opts.selected ? 'selected' : ''} ${opts.onclick ? 'clickable' : ''}`,
      style: `border-color:${color}`,
      title: artifactTitle(inst),
      onclick: opts.onclick,
    },
    h('span', { class: 'chip-glyph' }, def.glyph),
    h('span', { class: 'chip-tier', style: `color:${color}` }, '●'.repeat(inst.tier)),
  );
}

export function artifactCard(inst: ArtifactInstance, footer?: Child): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    { class: 'card art-card', style: `border-color:${color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph' }, def.glyph), h('span', { class: 'card-name' }, def.name)),
    h('div', { class: 'card-sub', style: `color:${color}` }, `Артефакт · тир ${inst.tier} · ${def.kind === 'active' ? (def.school === 'magic' ? 'магия' : 'приём') : 'пассивный'}`),
    h('div', { class: 'card-desc' }, def.describe(inst.tier)),
    def.kind === 'active' ? h('div', { class: 'card-cost' }, `Цена: ${artifactCostText(def)}`) : null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

export function slotsRow(gear: GearInstance): HTMLElement {
  return h('div', { class: 'slots' }, ...gear.slots.map((s) => artifactChip(s)));
}

export function gearCard(gear: GearInstance, current?: GearInstance, footer?: Child): HTMLElement {
  const info = GEAR_TIERS[gear.tier];
  return h(
    'div',
    { class: 'card gear-card', style: `border-color:${info.color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph' }, gear.kind === 'weapon' ? '⚔' : '⛨'), h('span', { class: 'card-name' }, gear.name)),
    h('div', { class: 'card-sub' }, tierBadge(gear.tier)),
    h('div', { class: 'card-desc' }, `${gearStatText(gear)} · слотов: ${gear.slots.length}`),
    slotsRow(gear),
    current
      ? h('div', { class: 'card-compare' }, `Сейчас: ${current.name} — ${gearStatText(current)}, слотов: ${current.slots.length}`)
      : null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

/** Статусы, у которых число — сила эффекта, а не служебная единица. */
const VALUE_STATUSES: StatusId[] = ['strength', 'bleed', 'burn', 'thorns', 'regen', 'dodge'];

export function statusIcons(c: Combatant): HTMLElement {
  return h(
    'div',
    { class: 'statuses' },
    ...c.statuses.map((s) => {
      const showValue = VALUE_STATUSES.includes(s.id) && (s.id !== 'dodge' || s.value > 1);
      const title = `${STATUS_NAMES[s.id]}${showValue ? ` ${s.value}` : ''}${s.turns > 0 ? `, ходов: ${s.turns}` : ''}\n${STATUS_HINTS[s.id]}`;
      return h(
        'span',
        { class: `status status-${s.id}`, title },
        statusIcon(s.id, 18),
        showValue ? h('span', { class: 'status-val' }, `${s.value}`) : null,
        s.turns > 0 ? h('span', { class: 'status-turns' }, `${s.turns}`) : null,
      );
    }),
  );
}

export function statsGrid(s: DerivedStats): HTMLElement {
  const row = (k: string, v: string, title: string) => h('div', { class: 'stat', title }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  return h(
    'div',
    { class: 'stats-grid' },
    row('Урон', `${s.dmgMin + s.str}–${s.dmgMax + s.str}`, 'Урон базовой атаки: разброс оружия + Сила'),
    row('DEF', `${s.def}`, 'Блок за «Защититься»'),
    row('STA', `${s.sta}${s.firstTurnSta ? ` (+${s.firstTurnSta})` : ''}`, 'Очки действий за ход'),
    row('MP', `${s.maxMp}${s.mpRegen ? ` (+${s.mpRegen})` : ''}`, 'Мана и реген за ход'),
    s.crit ? row('Крит', `${Math.round(s.crit * 100)} %`, 'Шанс двойного урона атак') : null,
    s.spellPower ? row('Закл.', `+${s.spellPower}`, 'Бонус к урону заклинаний') : null,
    s.thorns ? row('Шипы', `${s.thorns}`, 'Урон атакующему') : null,
    s.lifesteal ? row('Вамп.', `${s.lifesteal}`, 'Лечение при базовой атаке') : null,
    s.regen ? row('Реген', `${s.regen}`, 'HP в начале хода') : null,
  );
}

export function heroPanel(run: RunState): HTMLElement {
  const def = heroDef(run.hero.defId);
  const s = heroStats(run);
  return h(
    'div',
    { class: 'hero-panel' },
    h('div', { class: 'hero-head' }, spriteImg(def.sprite, def.id, 64), h('div', null, h('div', { class: 'name' }, def.name), bar('hp', run.hero.hp, s.maxHp, 'HP'))),
    statsGrid(s),
    gearCard(run.hero.weapon),
    gearCard(run.hero.armor),
  );
}

/** Модалка выбора слота для артефакта: пустой — вставить, занятый — заменить. */
export function pendingModal(app: App): HTMLElement | null {
  const run = app.run;
  const p = run?.pending;
  const art = p?.artifacts[0];
  if (!run || !p || !art) return null;
  const sockets = socketRefs(run.hero);
  const same = findSameArtifact(run.hero, art.id);
  const hasFree = sockets.some((s) => !s.art);
  return h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel modal' },
      h('h2', null, 'Куда вставить артефакт?'),
      h(
        'p',
        { class: 'dim' },
        hasFree ? 'Выберите слот. Занятый слот — замена, старый артефакт пропадёт.' : 'Свободных слотов нет: выберите, какой артефакт заменить.',
      ),
      artifactCard(art),
      h(
        'div',
        { class: 'socket-list' },
        ...sockets.map((s) => {
          const gear = gearOf(run.hero, s.kind);
          const isSame = !!same && same.kind === s.kind && same.index === s.index;
          return h(
            'div',
            { class: `socket-row ${s.art ? '' : 'free'}` },
            h('span', { class: 'socket-gear' }, h('span', { class: 'dim' }, s.kind === 'weapon' ? 'Оружие' : 'Броня'), h('span', null, ` · ${gear.name} · слот ${s.index + 1}`)),
            artifactChip(s.art),
            h('span', { class: 'socket-name' }, s.art ? `${artifactDef(s.art.id).name} (тир ${s.art.tier})` : 'пусто'),
            button(s.art ? 'Заменить' : 'Вставить', () => app.pendingPlace(s.kind, s.index), {
              class: s.art ? '' : 'primary',
              disabled: isSame,
            }),
          );
        }),
      ),
      h(
        'div',
        { class: 'row' },
        p.cancellable ? button('Отмена', () => app.pendingCancel()) : button('Выбросить', () => app.pendingDiscard(), { class: 'danger' }),
      ),
    ),
  );
}
