import * as THREE from 'three';
import { backend } from '../ai/brain.js';
import { TRAINERS, ECHO } from '../data/trainers.js';
import { t, L } from '../i18n.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const LABEL = {
  follow_route: { ru: 'МАРШРУТ', en: 'ROUTE', zh: '路线' }, advance: { ru: 'ВПЕРЁД', en: 'ADVANCE', zh: '前进' }, retreat: { ru: 'ОТХОД', en: 'RETREAT', zh: '后撤' },
  strafe_left: { ru: 'ШАГ ВЛЕВО', en: 'STRAFE L', zh: '左移' }, strafe_right: { ru: 'ШАГ ВПРАВО', en: 'STRAFE R', zh: '右移' }, turn_left: { ru: 'ПОВОРОТ L', en: 'TURN L', zh: '左转' },
  turn_right: { ru: 'ПОВОРОТ R', en: 'TURN R', zh: '右转' }, hold: { ru: 'СТОП', en: 'HOLD', zh: '停止' }, track_target: { ru: 'СОПРОВОЖД.', en: 'TRACK', zh: '追踪' },
  scan_left: { ru: 'ПОИСК L', en: 'SCAN L', zh: '左扫' }, scan_right: { ru: 'ПОИСК R', en: 'SCAN R', zh: '右扫' }, watch_last_known: { ru: 'ПОСЛ. ПОЗИЦИЯ', en: 'LAST SEEN', zh: '最后位置' },
  watch_route: { ru: 'ПО КУРСУ', en: 'ALONG ROUTE', zh: '沿路线' }, fire_arms: { ru: 'РУКИ', en: 'ARMS', zh: '手臂' }, fire_support: { ru: 'ПОДДЕРЖКА', en: 'SUPPORT', zh: '支援' },
  fire_all: { ru: 'ВСЁ', en: 'ALL', zh: '全部' }, hold_fire: { ru: 'НЕ СТРЕЛЯТЬ', en: 'HOLD FIRE', zh: '停火' },
};
const label = (k) => (LABEL[k] ? L(LABEL[k]) : '—');
// Radio kinds that are conversation; everything else is a technical report.
const TALK = new Set(['talk', 'taunt', 'help', 'helpReply', 'callout']);

export class Hud {
  constructor(app) {
    this.app = app;
    this.tagLayer = $('#tags');
    this.tags = new Map();
    this.selected = null;
    this.tick = 0;
    this.showTech = false;
    document.querySelectorAll('.cams button').forEach(b => b.addEventListener('click', () => this.setCam(b.dataset.cam)));
    $('#directive-form').addEventListener('submit', (e) => { e.preventDefault(); this.sendDirective(); });
    document.querySelectorAll('#feed-filter button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.f === 'tech') {
        this.showTech = !this.showTech;
        b.classList.toggle('active', this.showTech);
        $('#feed').classList.toggle('hide-tech', !this.showTech);
        return;
      }
      document.querySelectorAll('#feed-filter button:not(.toggle)').forEach(x => x.classList.toggle('active', x === b));
      $('#feed').classList.toggle('only-blue', b.dataset.f === 'blue');
      $('#feed').classList.toggle('only-red', b.dataset.f === 'red');
    }));
    $('#feed').classList.add('hide-tech');
    addEventListener('keydown', (e) => {
      if (!this.match || document.activeElement === $('#directive-input')) {
        if (e.key === 'Escape') $('#directive-input').blur();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= this.match.units.length) this.select(this.match.units[n - 1], true);
      const modes = ['director', 'follow', 'tactical'];
      if (e.code === 'KeyC') this.setCam(modes[(modes.indexOf(this.match.camera.mode) + 1) % 3]);
      if (e.code === 'KeyT') this.setCam(this.match.camera.mode === 'tactical' ? 'director' : 'tactical');
      if (e.key === 'Enter') { e.preventDefault(); $('#directive-input').focus(); }
      if (e.code === 'Space') { e.preventDefault(); this.app.paused = !this.app.paused; this.banner(this.app.paused ? t('hud.pause') : '', '', '#fff', this.app.paused ? 1e9 : 1); }
    });
  }

  attach(match) {
    this.match = match;
    this.selected = match.blue[0];
    this.lastText = new Map();
    $('#feed').innerHTML = '';
    $('#streams').innerHTML = '';
    $('#killfeed').innerHTML = '';
    $('#hud-map').textContent = match.map.name;
    $('#hud-ai').textContent = backend.forceLocal ? 'LOCAL AI' : `${backend.llm ? 'LLM' : 'LOCAL PLAN'} · ${backend.jev ? 'JEV' : 'LOCAL STREAMS'}`;
    this.renderBars();
    $('#directive-target').innerHTML = `<option value="">${t('hud.toAll')}</option>` + match.blue.map(u => `<option>${esc(u.name)}</option>`).join('');
    this.tagLayer.innerHTML = '';
    this.tags.clear();
    for (const u of match.units) {
      const el = document.createElement('div');
      el.className = `tag ${u.team}`;
      el.innerHTML = `<span class="bubble" hidden></span>${esc(u.name)}<i><u></u></i><small></small>`;
      this.tagLayer.appendChild(el);
      this.tags.set(u, el);
    }
    match.onPlan = (u, o) => this.plan(u, o);
    match.onTeamPlan = (cmd, data) => {
      $('#feed-model').textContent = `${data.model || 'LLM'} · ${Math.round(cmd.latency)} ms`;
    };
    match.onDecision = (u, a) => this.decision(u, a);
    match.onRadio = (msg, u) => this.radio(msg, u);
    this.setCam('director');
    this.message('blue', null, esc(t('hud.planned')), 'talk');
    this.jevCount = 0;
    this.jevWindowStart = performance.now();
  }

  detach() {
    this.match = null;
    this.tagLayer.innerHTML = '';
    this.tags.clear();
  }

  setCam(mode) {
    if (!this.match) return;
    this.match.camera.mode = mode;
    if (mode === 'follow') { this.match.camera.unit = this.selected; this.match.camera.cut = true; }
    document.querySelectorAll('.cams button').forEach(b => b.classList.toggle('active', b.dataset.cam === mode));
  }

  select(u, follow) {
    this.selected = u;
    if (follow) { this.setCam('follow'); this.match.camera.unit = u; this.match.camera.cut = true; }
    $('#directive-target').value = u.team === 'blue' ? u.name : '';
    this.renderBars();
  }

  sendDirective() {
    const input = $('#directive-input');
    const text = input.value.trim();
    if (!text || !this.match) return;
    const target = $('#directive-target').value || null;
    this.match.commanders.blue.directive(target, text, this.match.time);
    this.message('player', null, `<em>${esc(target || t('hud.toAll'))}:</em> ${esc(text)}`, 'talk');
    input.value = '';
    input.blur();
    this.app.audio.ui();
  }

  renderBars() {
    const m = this.match;
    if (!m) return;
    for (const side of ['blue', 'red']) {
      const el = $(`#hud-${side}`);
      if (el.children.length !== m[side].length) {
        el.innerHTML = m[side].map(u => `<div class="hp-unit" data-i="${m.units.indexOf(u)}"><small><b>${esc(u.name)}</b><span>${u.chassis.name}${u.elite ? ' ★' : ''}</span></small><div class="track"><u></u><i></i></div></div>`).join('');
        el.querySelectorAll('.hp-unit').forEach(div => div.addEventListener('click', () => this.select(m.units[div.dataset.i], true)));
      }
      [...el.children].forEach((div, i) => {
        const u = m[side][i];
        const pct = `${Math.max(0, u.hp / u.maxHp * 100)}%`;
        div.querySelector('i').style.width = pct;
        div.querySelector('u').style.width = pct;
        div.classList.toggle('dead', !u.alive);
        div.classList.toggle('selected', u === this.selected);
      });
    }
  }

  coachOf(side) { return side === 'red' ? TRAINERS[this.match.config.red.coach.id] : null; }

  // cat: 'talk' (conversation, always shown) or 'tech' (reports, hidden unless toggled)
  message(side, unit, html, cat = 'tech', channel = 'team') {
    const feed = $('#feed');
    const row = document.createElement('div');
    row.className = `msg ${cat}${channel === 'all' ? ' open' : ''}`;
    row.dataset.team = side === 'red' ? 'red' : 'blue';
    row.dataset.cat = cat;
    const tr = side === 'red' ? this.coachOf('red') : null;
    const color = side === 'player' ? '#ffffff' : side === 'blue' ? ECHO.color : tr?.color || '#ff4a3a';
    row.style.setProperty('--c', color);
    const who = unit ? esc(unit.name) : side === 'player' ? t('hud.coach') : side === 'blue' ? L(ECHO.name) : tr?.short || 'RED';
    const avatar = unit ? `<div class="avatar">${esc(unit.name.slice(0, 3))}</div>` : tr ? `<img src="${tr.icon}" alt="">` : `<div class="avatar">${side === 'player' ? t('hud.you') : 'ECHO'}</div>`;
    const chan = channel === 'all' ? ` · <b class="chan">${t('hud.allChan')}</b>` : '';
    row.innerHTML = `${avatar}<div><small>${who}${chan} · ${fmt(this.match.time)}</small><p>${html}</p></div>`;
    const atTop = feed.scrollTop < 30;
    feed.prepend(row);
    if (!atTop) feed.scrollTop += row.offsetHeight + 8;
    while (feed.children.length > 160) feed.lastChild.remove();
  }

  radio(msg, u) {
    // Drop exact repeats from the same unit within a few seconds.
    const key = `${u.name}|${msg.text}`;
    if (this.match.time - (this.lastText.get(key) ?? -99) < 6) return;
    this.lastText.set(key, this.match.time);
    const talk = TALK.has(msg.kind);
    this.message(u.team, u, esc(msg.text), talk ? 'talk' : 'tech', msg.channel);
    if (talk) this.bubble(u, msg.text, 3.6, msg.channel);
  }

  plan(u, o) {
    if (!o.callout) return;
    this.radio({ text: o.callout, kind: 'callout', channel: 'team' }, u);
  }

  bubble(u, text, seconds, channel = 'team') {
    const el = this.tags.get(u)?.querySelector('.bubble');
    if (!el) return;
    el.innerHTML = `<b class="chan ${channel}">${channel === 'all' ? t('hud.allChan') : t('hud.ours')}</b>${esc(text)}`;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, seconds * 1000);
  }

  decision(u, a) {
    this.jevCount++;
    const box = $('#streams');
    const row = document.createElement('div');
    row.className = 'srow';
    row.style.setProperty('--c', u.team === 'blue' ? 'var(--cyan)' : 'var(--red)');
    row.innerHTML = `<time>${this.match.time.toFixed(1)}s</time><b>${esc(u.name)}</b><span>${label(a.navigation)} · ${label(a.turret)} · ${label(a.weapon)}</span>`;
    box.prepend(row);
    while (box.children.length > 16) box.lastChild.remove();
  }

  damage() {}

  kill(u, attacker) {
    const div = document.createElement('div');
    div.innerHTML = `<span class="${attacker.team[0]}">${esc(attacker.name)}</span> ▸ <span class="${u.team[0]}">${esc(u.name)}</span>`;
    $('#killfeed').prepend(div);
    setTimeout(() => div.remove(), 6000);
    this.renderBars();
  }

  banner(text, sub, color, seconds = 2.5) {
    const b = $('#banner');
    b.innerHTML = text ? `${esc(text)}<small>${esc(sub)}</small>` : '';
    b.style.color = color;
    b.classList.toggle('show', !!text);
    clearTimeout(this.bannerT);
    if (text && seconds < 1e8) this.bannerT = setTimeout(() => b.classList.remove('show'), seconds * 1000);
  }

  update() {
    const m = this.match;
    if (!m) return;
    this.tick++;
    $('#hud-time').textContent = fmt(Math.max(0, m.duration - m.time));
    if (this.tick % 6 === 0) { this.renderBars(); this.renderUnit(); }
    if (this.tick % 30 === 0) {
      const secs = (performance.now() - this.jevWindowStart) / 1000;
      $('#jev-rate').textContent = backend.jev && !backend.forceLocal ? `${(this.jevCount / Math.max(1, secs)).toFixed(1)}/s` : 'LOCAL';
      if (secs > 10) { this.jevCount = 0; this.jevWindowStart = performance.now(); }
    }
    // Project name tags above each mech.
    const cam = this.app.world.camera;
    const v = new THREE.Vector3();
    for (const [u, el] of this.tags) {
      v.copy(u.position).setY(u.chassis.height * u.scale + 1.2).project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = on ? 'block' : 'none';
      if (!on) continue;
      el.style.left = `${(v.x * .5 + .5) * innerWidth}px`;
      el.style.top = `${(-v.y * .5 + .5) * innerHeight}px`;
      el.style.opacity = u.alive ? 1 : .35;
      el.querySelector('u').style.width = `${u.hp / u.maxHp * 100}%`;
      if (this.tick % 10 === 0) el.querySelector('small').textContent = u.alive ? `${u.lastAction}${u.actionSource === 'jev' ? ' · JEV' : ''}` : 'OFFLINE';
    }
  }

  renderUnit() {
    const u = this.selected;
    if (!u) return;
    const o = u.orders || {};
    const a = u.actions || {};
    const src = u.actionSource === 'jev' ? '' : 'local';
    const instr = o.instructions || {};
    $('#unit-panel').innerHTML = `
      <div class="sub">${u.team === 'blue' ? 'NULL SIGNAL' : esc(this.match.config.red.coach.team)} · ${u.chassis.name}${u.elite ? ' · ELITE' : ''}</div>
      <h4 style="color:${u.team === 'blue' ? 'var(--cyan)' : 'var(--red)'}">${esc(u.name)}</h4>
      <div class="bars">
        <div class="bar-row"><span>HP</span><div><i style="width:${u.hp / u.maxHp * 100}%"></i></div><b>${Math.ceil(u.hp)}</b></div>
        <div class="bar-row heat"><span>HEAT</span><div><i style="width:${u.heat}%"></i></div><b>${u.overheated ? 'OVR' : Math.round(u.heat)}</b></div>
      </div>
      <div class="weapons-list">${u.weapons.filter(Boolean).map(w => `<div class="${w.cooldown > 0 ? 'cool' : ''}"><span>${w.def.short}</span><span>${w.charging > 0 ? t('hud.charge') : Number.isFinite(w.ammo) ? `${w.ammo}` : '∞'}</span></div>`).join('')}</div>
      <div class="orders">
        <div class="k">${t('hud.plan')} ${o.source === 'llm' ? '· LLM' : '· LOCAL'}</div>
        <div class="intent">${esc(o.intent || '—')}</div>
        <div class="tags"><span>${esc(o.stance || '—')}</span><span>→ ${esc(o.move_to || '—')}</span><span>${Math.round(o.engage_range || 0)} m</span><span>${t('hud.target')}: ${esc(u.target?.name || '—')}</span><span>${esc(o.fire_discipline || '')}</span></div>
        <div class="streams3">
          <div class="${src}">${t('hud.legs')}<b>${label(a.navigation)}</b></div>
          <div class="${src}">${t('hud.torso')}<b>${label(a.turret)}</b></div>
          <div class="${src}">${t('hud.weapon')}<b>${label(a.weapon)}</b></div>
        </div>
        <div class="instr">${instr.navigation ? `<b>NAV</b> ${esc(instr.navigation)}<br>` : ''}${instr.turret ? `<b>TUR</b> ${esc(instr.turret)}<br>` : ''}${instr.weapon ? `<b>WPN</b> ${esc(instr.weapon)}` : ''}</div>
      </div>`;
  }
}
