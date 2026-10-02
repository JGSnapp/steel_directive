// Two-tier autonomy:
//   TeamCommander — an LLM (or the offline planner) writes a plan per unit:
//     stance, target, where to move, engagement range, fire discipline and a
//     dedicated instruction for each JEV stream. It re-plans on a timer and on
//     battlefield events.
//   UnitStreams — three JEV streams (navigation / turret / weapon) answer a
//     constrained choice at ~1 Hz using those instructions; the offline policy
//     picks from the same vocabulary when JEV is unreachable.
import { snapshot, knownEnemies, r1 } from './perception.js';
import { localPolicy, resolveGoal, resolveTarget, ACTIONS } from './pilot.js';
import { lang, t } from '../i18n.js';

export const backend = { llm: false, jev: false, llmModel: null, jevModel: null, forceLocal: false };

export async function probeBackend() {
  try {
    const res = await fetch('/api/status');
    Object.assign(backend, await res.json());
  } catch { /* static hosting: offline mode */ }
  return backend;
}

const STANCES = ['assault', 'skirmish', 'hold', 'flank', 'retreat', 'hunt', 'bait'];
const MOVES = ['enemy', 'last_known', 'cover', 'flank_left', 'flank_right', 'center', 'hold', 'regroup'];

// ------------------------------------------------------------ offline planner
function parseStrategy(text, base) {
  const s = (text || '').toLowerCase();
  const o = { ...base };
  // Keyword hit unless negated right before it ("не преследуй", "don't push").
  const has = (re) => {
    const g = new RegExp(re.source, 'g');
    for (let m; (m = g.exec(s));) if (!/(?:^|\s)(?:не|don'?t|do not|never|нельзя)\s+(?:\S+\s+)?$/.test(s.slice(Math.max(0, m.index - 24), m.index))) return true;
    return false;
  };
  if (has(/агресс|атак|дави|напад|rush|push|aggress|вперёд|вперед|сближ|в упор|ближн|攻击|进攻|冲|压上|贴脸|近战/)) Object.assign(o, { stance: 'assault', move_to: 'enemy', engage_range: 12, fire_discipline: 'free' });
  if (has(/укрыт|cover|осторож|careful|снайп|sniper|издалек|дальн|掩体|掩护物|小心|狙击|远程|远距离/)) Object.assign(o, { stance: 'skirmish', move_to: 'cover', engage_range: 42, fire_discipline: 'confident' });
  if (has(/фланг|flank|обход|сбоку|обойд|侧翼|绕后|包抄/)) Object.assign(o, { stance: 'flank', move_to: has(/лев|left/) ? 'flank_left' : 'flank_right' });
  if (has(/прикры|защищ|охран|protect|escort|рядом с|保护|掩护|跟随/)) Object.assign(o, { stance: 'hold', move_to: 'regroup', target: 'focus' });
  if (has(/держи (линию|позиц|центр)|hold|оборон|defend|стой/)) Object.assign(o, { stance: 'hold', move_to: has(/центр|center/) ? 'center' : 'hold' });
  if (has(/охот|hunt|ищи|найди|преслед|追|搜索|寻找/)) Object.assign(o, { stance: 'hunt', move_to: 'last_known' });
  if (has(/сиди|жди|засад|ambush|у (своей )?базы|не выходи|camp|埋伏|等待|守在|蹲/)) Object.assign(o, { stance: 'hold', move_to: 'hold' });
  if (has(/добив|weak|слаб|раненых|повреждён|поврежден|finish|残血|补刀|最弱/)) o.target = 'weakest';
  if (has(/фокус|focus|одн(у|ой) цел|вместе|集火|一起/)) o.target = 'focus';
  if (has(/ракет|missile|миномёт|миномет|mortar/)) o.use_support = has(/добив|finish|когда .* открыт/) ? 'finisher' : 'on_contact';
  if (has(/экономь|береги|conserve|не трать/)) o.fire_discipline = 'conserve';
  // No \b here: JS word boundaries ignore Cyrillic, so "30–45 м" never matched.
  const range = s.match(/(\d{1,2})\s*(?:[-–]\s*(\d{1,2}))?\s*(?:м|m|米|метр\S*)(?=[\s.,;:!?)，。]|$|[^a-zа-я])/);
  if (range) o.engage_range = range[2] ? (Number(range[1]) + Number(range[2])) / 2 : Number(range[1]);
  return o;
}

const VOLT_PHASES = [
  { stance: 'hold', move_to: 'cover', engage_range: 34, fire_discipline: 'confident', callout: 'Сидим тихо… пока что!' },
  { stance: 'assault', move_to: 'enemy', engage_range: 9, fire_discipline: 'free', callout: 'ПОЛНЫЙ ВПЕРЁД! Жги!' },
  { stance: 'retreat', move_to: 'cover', engage_range: 30, fire_discipline: 'conserve', callout: 'Делаем вид, что сбегаем~' },
  { stance: 'flank', move_to: 'flank_left', engage_range: 16, fire_discipline: 'free', callout: 'Сюрприз с фланга!' },
];

function localOrders(cmd, unit, index, ctx) {
  const preset = cmd.coach.preset || { stance: 'skirmish', move_to: 'enemy', engage_range: 25, fire_discipline: 'confident', use_support: 'on_contact', target: 'nearest' };
  let o = { ...preset };
  let callout = '';
  if (preset.stance === 'phase') {
    const phase = VOLT_PHASES[(Math.floor(ctx.time / 8) + index * 2) % VOLT_PHASES.length];
    o = { ...o, ...phase };
    if (phase.move_to === 'flank_left' && index % 2) o.move_to = 'flank_right';
    callout = phase.callout;
  } else if (preset.stance === 'role') {
    const role = unit.role || (ctx.duel ? 'knight' : ['bait', 'knight', 'queen'][index] || 'knight');
    o = role === 'bait' ? { ...o, stance: 'bait', move_to: 'center', engage_range: 24, fire_discipline: 'free', target: 'nearest' }
      : role === 'knight' ? { ...o, stance: 'flank', move_to: index % 2 ? 'flank_left' : 'flank_right', engage_range: 16, target: 'focus' }
        : { ...o, stance: 'skirmish', move_to: 'cover', engage_range: 48, target: 'focus', use_support: 'finisher' };
    callout = { bait: 'Слон в центре. Пусть смотрят на меня.', knight: 'Конь идёт в обход.', queen: 'Ферзь держит линию.' }[role];
  } else if (cmd.coach.kind === 'player') {
    o = parseStrategy(`${cmd.coach.teamNote || ''} ${unit.strategy || ''} ${unit.liveDirective || ''}`, o);
  }
  if (o.move_to === 'enemy' && !knownEnemies(unit, ctx.enemies, ctx.time).length) o.move_to = 'last_known';
  if (unit.hp / unit.maxHp < .15 && o.stance !== 'assault' && !cmd.coach.locks?.noRetreat) Object.assign(o, { stance: 'retreat', move_to: 'cover' });
  return {
    ...o,
    intent: `${o.stance.toUpperCase()} → ${o.move_to} @ ${Math.round(o.engage_range)}м`,
    instructions: {
      navigation: `Stance ${o.stance}; move to ${o.move_to}; keep ${Math.round(o.engage_range)} m from the target.`,
      turret: 'Track the current target; when it is hidden watch its last known position.',
      weapon: `Fire discipline ${o.fire_discipline}; support weapon ${o.use_support}.`,
    },
    callout,
    source: 'local',
  };
}

// ------------------------------------------------------------ commander
export class TeamCommander {
  constructor({ side, units, coach, onPlan }) {
    this.side = side;
    this.units = units;
    this.coach = coach; // { kind:'trainer'|'player', id, name, team, doctrine, preset, teamNote }
    this.onPlan = onPlan;
    this.events = [];
    this.nextPlan = 0;
    this.lastPlan = -99;
    this.pending = false;
    this.trigger = null;
    this.llmFailures = 0;
    this.plansMade = 0;
    this.teamPlan = '';
  }

  event(text, time, urgent = false) {
    this.events.push({ t: r1(time), text });
    if (this.events.length > 16) this.events.shift();
    if (urgent) this.trigger = text;
  }

  directive(unitName, text, time) {
    for (const u of this.units) if (!unitName || u.name === unitName) u.liveDirective = text;
    this.event(`COACH LIVE ORDER${unitName ? ` for ${unitName}` : ''}: ${text}`, time, true);
  }

  update(ctx) {
    const { time } = ctx;
    const due = time >= this.nextPlan || (this.trigger && time - this.lastPlan > 4);
    if (!due || this.pending) return;
    this.trigger = null;
    this.lastPlan = time;
    // The offline planner always runs: instant orders while the LLM thinks.
    if (!this.plansMade || !backend.llm || backend.forceLocal || this.llmFailures > 2) {
      this.applyLocal(ctx);
      if (!backend.llm || backend.forceLocal || this.llmFailures > 2) { this.nextPlan = time + (this.coach.preset?.stance === 'phase' ? 2 : 4); return; }
    }
    this.requestLLM(ctx);
  }

  applyLocal(ctx) {
    this.units.forEach((u, i) => { if (u.alive) this.assign(u, localOrders(this, u, i, ctx), ctx); });
    this.plansMade++;
  }

  // Rival coaches play strictly to their doctrine: whatever the LLM or the
  // local planner says, orders are pulled back inside the coach's limits.
  applyLocks(unit, o, ctx) {
    const lk = this.coach.locks;
    if (!lk) return o;
    o = { ...o };
    if (!lk.stances.includes(o.stance)) o.stance = lk.stances[0];
    if (lk.noRetreat && o.stance === 'retreat') o.stance = lk.stances[0];
    if (lk.noRetreat && (o.move_to === 'cover' || o.move_to === 'hold')) o.move_to = 'enemy';
    o.engage_range = Math.min(lk.range[1], Math.max(lk.range[0], o.engage_range ?? lk.range[0]));
    if (lk.fire) o.fire_discipline = lk.fire;
    if (o.use_support === 'never') o.use_support = 'on_contact';
    if (lk.chargeOnSight && (unit.visible || []).length) Object.assign(o, { stance: 'assault', move_to: 'enemy' });
    unit.noRetreat = !!lk.noRetreat;
    return o;
  }

  assign(unit, orders, ctx) {
    orders = this.applyLocks(unit, orders, ctx);
    const changed = !unit.orders || unit.orders.intent !== orders.intent;
    unit.orders = { ...orders, at: ctx.time };
    unit.target = resolveTarget(unit, ctx);
    resolveGoal(unit, ctx);
    if (changed) this.onPlan?.(unit, unit.orders);
  }

  async requestLLM(ctx) {
    this.pending = true;
    const started = performance.now();
    const payload = {
      side: this.side, mode: ctx.duel ? 'duel' : 'squad', language: { ru: 'Russian', en: 'English', zh: 'Simplified Chinese' }[lang],
      coach: { kind: this.coach.kind, name: this.coach.name, team: this.coach.team, doctrine: (this.coach.doctrine || '') + (this.coach.locks ? ` HARD LIMITS: stances ${this.coach.locks.stances.join('/')}, engage_range ${this.coach.locks.range[0]}-${this.coach.locks.range[1]} m${this.coach.locks.noRetreat ? ', never retreat' : ''}, always shoot when a target is in range.` : ''), team_note: this.coach.teamNote || '' },
      map: `${ctx.arena.map.name}: ${ctx.arena.map.blurb}`,
      time_s: r1(ctx.time),
      units: this.units.map(u => (u.alive ? {
        name: u.name, role: u.role, chassis: u.chassis.name, hp: Math.round(u.hp / u.maxHp * 100),
        pos: [Math.round(u.position.x), Math.round(u.position.z)],
        weapons: u.weapons.filter(Boolean).map(w => `${w.def.short}/${w.def.range}m${Number.isFinite(w.ammo) ? `/ammo${w.ammo}` : ''}`).join(', '),
        strategy: u.strategy || null, live_order: u.liveDirective || null,
        sees: (u.visible || []).map(e => e.name), orders: u.orders ? `${u.orders.stance}/${u.orders.move_to}/${u.orders.target}` : null,
      } : { name: u.name, alive: false })),
      enemies: ctx.enemies.map(e => {
        if (!e.alive) return { name: e.name, alive: false };
        const k = this.units.map(u => u.known?.[e.id]).filter(Boolean).sort((a, b) => b.at - a.at)[0];
        return { name: e.name, chassis: e.chassis.name, seen: k ? { pos: [Math.round(k.x), Math.round(k.z)], age_s: Math.round(ctx.time - k.at), hp: Math.round(k.hp * 100) } : null };
      }),
      radio: this.events.slice(-8).map(e => `${e.t}s ${e.text}`),
      previous_plan: this.teamPlan,
    };
    try {
      const res = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!ctx.match.running && !ctx.match.priming) return;
      ctx.match.addSpend('llm', data.usage);
      this.teamPlan = data.team_plan || '';
      for (const u of this.units) {
        const o = data.units?.[u.name];
        if (!u.alive || !o) continue;
        this.assign(u, sanitizeOrders(o, u.orders), ctx);
      }
      // Free-form team talk written by the commander, voiced by the units.
      (data.chat || []).slice(0, 4).forEach((c, i) => {
        const u = this.units.find(x => x.name === c.from && x.alive);
        const open = c.to === 'all';
        if (u && c.text) setTimeout(() => ctx.match.running && ctx.match.radio(u, String(c.text).slice(0, 220), open ? 'taunt' : 'talk', false, true, open ? 'all' : 'team'), 600 + i * 1400);
      });
      this.plansMade++;
      this.llmFailures = 0;
      this.latency = performance.now() - started;
      this.model = data.model;
      this.nextPlan = ctx.time + Math.min(16, Math.max(8, data.replan_after_s || 10));
      ctx.match.onTeamPlan?.(this, data);
    } catch (err) {
      console.warn('LLM plan failed', err);
      this.llmFailures++;
      if (this.llmFailures === 3 && this.side === 'blue') ctx.match.app.hud?.message('blue', null, `<em>${t('hud.llmDown', { e: String(err.message).slice(0, 90) })}</em>`, 'talk');
      this.applyLocal(ctx);
      this.nextPlan = ctx.time + 4;
    } finally {
      this.pending = false;
    }
  }
}

function sanitizeOrders(o, prev = {}) {
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    intent: String(o.intent || '').slice(0, 140),
    stance: pick(o.stance, STANCES, prev.stance || 'skirmish'),
    move_to: pick(o.move_to, MOVES, prev.move_to || 'enemy'),
    target: typeof o.target === 'string' ? o.target : 'nearest',
    engage_range: Math.min(90, Math.max(6, Number(o.engage_range) || prev.engage_range || 25)),
    fire_discipline: pick(o.fire_discipline, ['free', 'confident', 'conserve'], 'confident'),
    use_support: pick(o.use_support, ['on_contact', 'finisher', 'indirect', 'never', 'now'], 'on_contact'),
    instructions: {
      navigation: String(o.instructions?.navigation || '').slice(0, 400),
      turret: String(o.instructions?.turret || '').slice(0, 400),
      weapon: String(o.instructions?.weapon || '').slice(0, 400),
    },
    callout: String(o.callout || '').slice(0, 160),
    source: 'llm',
  };
}

// ------------------------------------------------------------ JEV streams
export class UnitStreams {
  constructor(unit, match) {
    this.unit = unit;
    this.match = match;
    this.next = Math.random() * .6;
    this.pending = false;
    this.failures = 0;
    this.lastAnswerAt = -99;
    this.stats = { calls: 0, latency: 0 };
  }

  update(ctx) {
    const u = this.unit;
    if (!u.alive) return;
    // Retarget/replan the route as the picture changes.
    if (!u.retargetAt || ctx.time > u.retargetAt) {
      u.retargetAt = ctx.time + 1.2;
      u.target = resolveTarget(u, ctx);
      resolveGoal(u, ctx);
    }
    const useJev = backend.jev && !backend.forceLocal && this.failures < 4;
    // The offline policy keeps the unit alive between (or without) JEV answers.
    if (!useJev || ctx.time - this.lastAnswerAt > 3) {
      u.actions = localPolicy(u, ctx);
      u.actionSource = 'local';
    }
    if (useJev && !this.pending && ctx.time >= this.next) this.request(ctx);
  }

  async request(ctx) {
    const u = this.unit;
    this.pending = true;
    const started = performance.now();
    const snap = snapshot(u, ctx);
    try {
      const res = await fetch('/api/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: u.name, side: u.team, snapshot: snap, orders: u.orders ? { stance: u.orders.stance, move_to: u.orders.move_to, engage_range: u.orders.engage_range, fire_discipline: u.orders.fire_discipline, use_support: u.orders.use_support, intent: u.orders.intent, instructions: u.orders.instructions } : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!this.match.running) return;
      const a = {};
      for (const k of Object.keys(ACTIONS)) a[k] = ACTIONS[k].includes(data[k]) ? data[k] : (u.actions?.[k] || ACTIONS[k][0]);
      u.actions = a;
      u.actionSource = 'jev';
      this.match.addSpend('jev', data.usage);
      u.confidence = data.confidence;
      this.lastAnswerAt = this.match.time;
      this.failures = 0;
      this.stats.calls++;
      this.stats.latency = performance.now() - started;
      this.match.onDecision?.(u, a, data);
    } catch (err) {
      this.failures++;
      if (this.failures === 4) console.warn(`JEV unreachable for ${u.name}, using local policy`, err);
    } finally {
      this.pending = false;
      this.next = this.match.time + (this.failures >= 4 ? 8 : 1.1);
      if (this.failures >= 4) setTimeout(() => { this.failures = 2; }, 8000);
    }
  }
}
