import { World } from './engine/world.js';
import { FX } from './engine/fx.js';
import { Audio } from './engine/audio.js';
import { Music } from './engine/music.js';
import { loadAssets } from './engine/assets.js';
import { Match } from './game/match.js';
import { Hud } from './ui/hud.js';
import { Preview } from './ui/preview.js';
import { RingCutscene } from './ui/cutscene.js';
import { backend, probeBackend } from './ai/brain.js';
import { TRAINERS, PLAYER_TEAM, ECHO, ANNOUNCER } from './data/trainers.js';
import { CHAPTERS, PROLOGUE, START_UNLOCKS, PLAYER_ROSTER, DEFAULT_STRATEGIES, allBattles } from './data/campaign.js';
import { MAPS } from './data/maps.js';
import { WEAPONS, ARM_WEAPONS, SUPPORT_WEAPONS, DAMAGE_TYPES } from './data/weapons.js';
import { CHASSIS } from './data/chassis.js';
import { t, L, LANGS, lang, setLang, applyStatic } from './i18n.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const STORE = 'steel-directive.progress.v2';
// Damage taken per type, shown as intel: "KIN 60% · EXP 135% · …".
const armorLine = (c) => Object.entries(DAMAGE_TYPES).map(([k, d]) => {
  const v = Math.round((c.armor?.[k] ?? 1) * 100);
  return `<b class="${v < 90 ? 'res' : v > 110 ? 'weak' : ''}">${L(d.short)} ${v}%</b>`;
}).join(' · ');

class App {
  constructor() {
    this.world = new World($('#viewport'));
    this.fx = new FX(this.world);
    this.fx.resize(this.world);
    this.audio = new Audio();
    this.hud = new Hud(this);
    this.match = null;
    this.paused = false;
    this.progress = this.loadProgress();
    addEventListener('resize', () => this.fx.resize(this.world));
    this.music = new Music(this.audio);
    // Browsers only start audio after a user gesture.
    addEventListener('pointerdown', () => { this.audio.resume(); this.updateMusic(); }, { once: true });
    addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) this.toggleMusic(); });
    const _explosion = this.fx.explosion.bind(this.fx);
    this.fx.explosion = (pos, scale = 1, hex) => { _explosion(pos, scale, hex); this.audio.boom(scale); };
    this.last = performance.now();
    requestAnimationFrame(ts => this.loop(ts));
  }

  // ------------------------------------------------------------ progress
  loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(STORE));
      if (p?.done) return p;
    } catch { /* first run or storage blocked */ }
    return { done: {}, weapons: [...START_UNLOCKS.weapons], chassis: [...START_UNLOCKS.chassis], seenPrologue: false, loadouts: {} };
  }
  saveProgress() { try { localStorage.setItem(STORE, JSON.stringify(this.progress)); } catch { /* ignore */ } }

  unlocked(battleId) {
    const list = allBattles();
    const i = list.findIndex(b => b.id === battleId);
    return i === 0 || !!this.progress.done[list[i - 1].id];
  }

  // ------------------------------------------------------------ screens
  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
    this.screen = id;
    if (id !== 'briefing') this.preview?.stop();
    this.updateMusic();
  }

  // Menu theme in menus, the arena's theme from the briefing on.
  updateMusic() {
    if (!this.audio.ctx) return;
    if (this.screen === 'cutscene') return this.music.play('ring');
    const arena = ['dialogue', 'briefing', 'hud'].includes(this.screen) && this.battle ? this.battle.chapter.map : null;
    this.music.play(arena || 'menu');
    if (this.screen !== 'hud') this.music.setIntensity(0);
  }

  // M toggles music between mute and the last volume.
  toggleMusic() {
    this.audio.resume();
    if (this.volumes.music > 0) { this.lastMusicVol = this.volumes.music; this.volumes.music = 0; }
    else this.volumes.music = this.lastMusicVol || 70;
    this.applyVolume();
    this.updateMusic();
  }

  async boot() {
    setLang(lang);
    $('#load-text').textContent = t('load.chassis');
    await Promise.all([
      loadAssets(p => { $('#load-bar').style.width = `${p * 100}%`; }),
      probeBackend(),
      Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 2500))]),
    ]);
    $('#load-text').textContent = t('load.done');
    this.preview = new Preview($('#br-preview'));
    $('#lang-switch').innerHTML = Object.entries(LANGS).map(([code, name]) => `<button data-lang="${code}">${name}</button>`).join('');
    $('#lang-switch').addEventListener('click', (e) => { const code = e.target.dataset.lang; if (code) this.changeLang(code); });
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { this.audio.ui(); this.go(b.dataset.go); }));
    this.bindSkirmish();
    $('#hud-exit').addEventListener('click', () => this.exitMatch());
    // Volume sliders (music and effects), mirrored in the menu and the battle HUD.
    const vols = (() => { try { return JSON.parse(localStorage.getItem('sd.volume')) || {}; } catch { return {}; } })();
    this.volumes = { music: vols.music ?? (this.music.enabled ? 70 : 0), sfx: vols.sfx ?? 80 };
    const applyVol = () => {
      this.music.setVolume(this.volumes.music / 100);
      this.audio.setVolume(this.volumes.sfx / 100);
      document.querySelectorAll('[data-vol]').forEach(el => { el.value = this.volumes[el.dataset.vol]; });
      try { localStorage.setItem('sd.volume', JSON.stringify(this.volumes)); localStorage.setItem('sd.music', this.volumes.music > 0 ? 'on' : 'off'); } catch { /* ignore */ }
    };
    document.querySelectorAll('[data-vol]').forEach(el => {
      el.addEventListener('input', () => { this.audio.resume(); this.volumes[el.dataset.vol] = Number(el.value); applyVol(); this.updateMusic(); });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    this.applyVolume = applyVol;
    applyVol();
    $('#reset-progress').addEventListener('click', () => { if (confirm(t('campaign.resetConfirm'))) { localStorage.removeItem(STORE); this.progress = this.loadProgress(); this.renderCampaign(); } });
    this.renderStatic();
    this.showcase('citadel');
    if (params.get('auto')) return this.auto(params.get('auto'));
    // The prologue plays on every new visit; browsers need one click before audio.
    let seen = false;
    try { seen = sessionStorage.getItem('sd.prologue') === '1'; } catch { /* ignore */ }
    if (!seen && !params.get('noprologue')) {
      try { sessionStorage.setItem('sd.prologue', '1'); } catch { /* ignore */ }
      $('#load-text').textContent = t('load.click');
      $('#loading').classList.add('gate');
      $('#loading').addEventListener('click', () => { $('#loading').classList.remove('gate'); this.prologue('title'); }, { once: true });
      return;
    }
    this.show('title');
  }

  changeLang(code) {
    setLang(code);
    this.renderStatic();
    if (this.screen === 'campaign') this.renderCampaign();
    if (this.screen === 'briefing') this.briefing();
  }

  // Everything language-dependent that is not a data-i18n attribute.
  renderStatic() {
    applyStatic();
    document.querySelectorAll('#lang-switch button').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    $('#title-coaches').innerHTML = ['ram', 'ghost', 'volt', 'chess'].map(id => { const tr = TRAINERS[id]; return `<div class="coach-card" style="--c:${tr.color}"><img src="${tr.icon}" alt=""><div><b>${tr.short}</b><small>${tr.team}</small><em>${esc(L(tr.motto))}</em></div></div>`; }).join('');
    this.renderBackend();
    this.renderSkirmishLabels();
  }

  renderBackend() {
    const chips = [
      backend.llm ? `<span class="chip on">${t('brief.commander')} <b>${esc(backend.llmModel || 'LLM')}</b></span>` : `<span class="chip off">${t('brief.commander')} <b>LOCAL PLANNER</b></span>`,
      backend.jev ? `<span class="chip on">${t('brief.streams')} <b>${esc(backend.jevModel || 'JEV')}</b></span>` : `<span class="chip off">${t('brief.streams')} <b>LOCAL POLICY</b></span>`,
    ];
    $('#backend-status').innerHTML = chips.join('');
    $('#br-ai').innerHTML = chips.join('') + `<label class="chip"><input type="checkbox" id="force-local" ${backend.forceLocal ? 'checked' : ''} style="width:auto;margin-right:6px">${t('brief.localOnly')}</label>`;
    $('#force-local')?.addEventListener('change', e => { backend.forceLocal = e.target.checked; });
  }

  go(id) {
    if (id === 'prologue') return this.prologue(this.screen === 'campaign' ? 'campaign' : 'title');
    if (id === 'campaign') {
      if (!this.progress.seenPrologue) {
        this.progress.seenPrologue = true;
        this.saveProgress();
        return this.prologue('campaign');
      }
      this.renderCampaign();
    }
    if (id === 'title') this.showcase('citadel');
    this.show(id);
  }

  // The Ring Incident cutscene, then ECHO's prologue; replayable from the menu.
  prologue(back = 'title') {
    this.audio.resume();
    this.show('cutscene');
    new RingCutscene(this).play(() => {
      this.showcase('citadel');
      this.dialogue(PROLOGUE, null, () => this.go(back));
    });
  }

  // A non-running match used as an animated backdrop for menus and dialogue.
  showcase(mapId, redCoach = null, enemies = null) {
    this.endMatch();
    const coach = redCoach ? TRAINERS[redCoach] : null;
    const red = enemies ? enemies : coach ? [{ name: coach.team, chassis: coach.chassis, weapons: ['autocannon', 'autocannon', 'missile'] }] : [
      { name: 'RAM', chassis: 'hound', weapons: ['scatter', 'rotary', 'missile'], palette: 'hounds' },
      { name: 'GHOST', chassis: 'vector', weapons: ['railgun', 'autocannon', 'mortar'], palette: 'vector' },
      { name: 'VOLT', chassis: 'spark', weapons: ['arc', 'plasma', 'missile'], palette: 'spark' },
    ];
    const pal = coach?.palette;
    this.match = new Match(this, {
      map: mapId, mode: 'squad',
      blue: { coach: { kind: 'player' }, units: enemies || coach ? [] : [{ name: 'CHESS', chassis: 'castle', weapons: ['railgun', 'autocannon', 'missile'], palette: 'castle' }] },
      red: { coach: { kind: 'trainer' }, units: red.map(u => ({ ...u, palette: u.palette || pal || 'hounds' })) },
    });
    const units = this.match.units;
    units.forEach((u, i) => { const k = i - (units.length - 1) / 2; u.place(k * 6.5, -46 - Math.abs(k) * 1.5, -k * .12); u.torsoYaw = k * .18; });
    this.match.camera.mode = 'showcase';
    this.match.showcase = true;
  }

  endMatch() {
    if (this.match) { this.match.dispose(); this.match = null; }
    this.hud.detach();
  }

  // ------------------------------------------------------------ campaign map
  renderCampaign() {
    $('#chapters').innerHTML = CHAPTERS.map((ch, ci) => {
      const tr = TRAINERS[ch.trainer];
      const open = this.unlocked(ch.battles[0].id);
      return `<div class="chapter ${open ? '' : 'locked'}" style="--c:${tr.color}">
        <div class="portrait"><img src="${tr.poses[0]}" alt=""></div>
        <div class="info"><small>${esc(L(ch.title))}</small><h3>${esc(L(tr.name))}</h3><p>${esc(L(tr.motto))}</p>
          ${ch.battles.map((b, bi) => `<button class="battle-btn" data-b="${b.id}" ${this.unlocked(b.id) ? '' : 'disabled'}><i>${b.mode === 'duel' ? '1V1' : '3V3'}</i><b>${ci * 2 + bi + 1}. ${esc(L(b.title))}</b>${this.progress.done[b.id] ? `<em>${t('campaign.won')}</em>` : ''}</button>`).join('')}
        </div></div>`;
    }).join('');
    document.querySelectorAll('.battle-btn').forEach(b => b.addEventListener('click', () => this.startBattle(b.dataset.b)));
    const w = this.progress.weapons.map(id => WEAPONS[id].short).join(' · ');
    const c = this.progress.chassis.map(id => CHASSIS[id].name).join(' · ');
    $('#unlocks').innerHTML = `${t('campaign.arsenal')}: <b>${w}</b> &nbsp;&nbsp; ${t('campaign.chassis')}: <b>${c}</b>`;
  }

  startBattle(id) {
    const battle = allBattles().find(b => b.id === id);
    this.battle = { ...battle, campaign: true };
    this.showcase(battle.chapter.map, battle.chapter.trainer, battle.enemies.map(e => ({ ...e })));
    this.dialogue(battle.intro, battle.chapter.trainer, () => this.briefing());
  }

  // ------------------------------------------------------------ skirmish
  bindSkirmish() {
    this.sk = { trainer: 'ram', mode: 'duel', map: 'foundry' };
    $('#sk-trainers').innerHTML = Object.values(TRAINERS).map(tr => `<button data-v="${tr.id}" class="${tr.id === 'ram' ? 'active' : ''}"><img src="${tr.card}" alt=""><span style="color:${tr.color}">${tr.short} · ${tr.team}</span></button>`).join('');
    $('#sk-map').innerHTML = Object.values(MAPS).map(m => `<button data-v="${m.id}" class="${m.id === 'foundry' ? 'active' : ''}">${m.name}</button>`).join('');
    const bind = (sel, key, after) => document.querySelectorAll(`${sel} button`).forEach(b => b.addEventListener('click', () => {
      this.sk[key] = b.dataset.v;
      document.querySelectorAll(`${sel} button`).forEach(x => x.classList.toggle('active', x === b));
      after?.(b.dataset.v);
    }));
    bind('#sk-trainers', 'trainer', (id) => { this.sk.map = TRAINERS[id].map; document.querySelectorAll('#sk-map button').forEach(x => x.classList.toggle('active', x.dataset.v === this.sk.map)); });
    bind('#sk-mode', 'mode');
    bind('#sk-map', 'map');
    $('#sk-go').addEventListener('click', () => {
      const ch = CHAPTERS.find(c => c.trainer === this.sk.trainer);
      const base = ch.battles.find(b => b.mode === this.sk.mode);
      this.battle = { ...base, id: `skirmish-${base.id}`, chapter: { ...ch, map: this.sk.map }, campaign: false };
      this.showcase(this.sk.map, this.sk.trainer, base.enemies);
      this.briefing();
    });
  }

  renderSkirmishLabels() {
    document.querySelectorAll('#sk-map button').forEach(b => { b.title = L(MAPS[b.dataset.v].blurb); });
  }

  // ------------------------------------------------------------ dialogue
  dialogue(lines, trainerId, done) {
    this.show('dialogue');
    let i = 0;
    const sprite = $('#vn-sprite'), box = $('#vn-box');
    const next = () => {
      if (i >= lines.length) { cleanup(); done(); return; }
      const line = lines[i++];
      const tr = TRAINERS[line.s];
      const speaker = tr ? { name: L(tr.name), sub: tr.team, color: tr.color } : line.s === 'echo' ? { name: L(ECHO.name), sub: L(ECHO.title), color: ECHO.color } : { name: L(ANNOUNCER.name), sub: '', color: ANNOUNCER.color };
      box.style.setProperty('--accent', speaker.color);
      $('#vn-name').style.background = speaker.color;
      $('#vn-name').innerHTML = `${esc(speaker.name)}<small>${esc(speaker.sub)}</small>`;
      if (tr) {
        const src = tr.poses[line.p || 0];
        if (!sprite.src.endsWith(src)) { sprite.classList.add('swap'); setTimeout(() => { sprite.src = src; sprite.classList.remove('swap', 'none'); }, 160); }
        else sprite.classList.remove('none');
      } else sprite.classList.add('none');
      this.type(L(line.t));
    };
    const advance = (e) => {
      if (e?.target?.id === 'vn-skip') return;
      if (this.typing) { this.typing.finish(); return; }
      next();
    };
    const key = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); advance(); } };
    const skip = () => { cleanup(); done(); };
    const cleanup = () => {
      $('#dialogue').removeEventListener('click', advance);
      removeEventListener('keydown', key);
      $('#vn-skip').removeEventListener('click', skip);
      this.typing?.finish();
      this.typing = null;
    };
    $('#dialogue').addEventListener('click', advance);
    addEventListener('keydown', key);
    $('#vn-skip').addEventListener('click', skip);
    sprite.classList.add('none');
    next();
  }

  type(text) {
    const el = $('#vn-text');
    let n = 0;
    const step = lang === 'zh' ? 1 : 2;
    const timer = setInterval(() => {
      n += step;
      el.textContent = text.slice(0, n);
      if (n >= text.length) finish();
    }, 16);
    const finish = () => { clearInterval(timer); el.textContent = text; this.typing = null; };
    this.typing = { finish };
  }

  // ------------------------------------------------------------ briefing & loadout
  // One compact block under each select: what this part does in numbers.
  chassisHint(id) {
    const c = CHASSIS[id];
    return `${t('stat.hp')} <b>${c.hp}</b> · ${c.speed} m/s · ${t('stat.sensor')} ${c.sensor} m<br>${armorLine(c)}<br><em>${esc(L(c.armorNote))}</em>`;
  }

  weaponHint(id) {
    const w = WEAPONS[id];
    const dps = w.kind === 'pellets' ? w.damage * w.pellets / w.rate : w.kind === 'missile' ? w.damage * w.salvo / w.rate : w.damage / w.rate;
    const first = L(w.blurb).split(/(?<=[.。])\s*/)[0];
    return `<i class="dt-${w.dtype}">${L(DAMAGE_TYPES[w.dtype].short)}</i> DPS <b>${dps.toFixed(0)}</b> · ${w.range} m${Number.isFinite(w.ammo) ? ` · ×${w.ammo}` : ''}<br><em>${esc(first)}</em>`;
  }

  // Tabs per mech; the active one shows its 3D preview, parts and strategy side by side.
  renderEditor(i) {
    const u = this.roster[i];
    if (!u) return;
    this.previewIndex = i;
    const { weapons, chassis } = this.available;
    const opts = (list, sel) => list.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${WEAPONS[id] ? WEAPONS[id].name : CHASSIS[id].name}</option>`).join('');
    $('#br-tabs').innerHTML = this.roster.map((r, j) => `<button class="unit-tab ${j === i ? 'active' : ''}" data-tab="${j}"><b>${r.name}</b><small>${CHASSIS[r.chassis].name}</small></button>`).join('');
    document.querySelectorAll('.unit-tab').forEach(tab => tab.addEventListener('click', () => this.renderEditor(Number(tab.dataset.tab))));
    const field = (k, label, list, sel, hint) => `<div class="field"><label>${label}</label><select data-i="${i}" data-k="${k}">${opts(list, sel)}</select><div class="hint" id="hint-${k}">${hint}</div></div>`;
    const arms = weapons.filter(w => ARM_WEAPONS.includes(w)), support = weapons.filter(w => SUPPORT_WEAPONS.includes(w));
    $('#br-roster').innerHTML = `
      ${field('chassis', t('brief.chassis'), chassis, u.chassis, this.chassisHint(u.chassis))}
      <div class="field-row">
        ${field('w0', t('brief.armL'), arms, u.weapons[0], this.weaponHint(u.weapons[0]))}
        ${field('w1', t('brief.armR'), arms, u.weapons[1], this.weaponHint(u.weapons[1]))}
        ${field('w2', t('brief.shoulder'), support, u.weapons[2], this.weaponHint(u.weapons[2]))}
      </div>
      <label class="strategy-label">${t('brief.strategy', { n: u.name })}</label>
      <textarea data-i="${i}" data-k="strategy" rows="4" placeholder="${esc(t('brief.strategyPh', { n: u.name }))}">${esc(u.strategy)}</textarea>`;
    document.querySelectorAll('#br-roster [data-k]').forEach(el => el.addEventListener('input', () => {
      const k = el.dataset.k;
      if (k === 'strategy') { u.strategy = el.value; return; }
      if (k === 'chassis') {
        u.chassis = el.value;
        $('#hint-chassis').innerHTML = this.chassisHint(u.chassis);
        document.querySelector(`.unit-tab[data-tab="${i}"] small`).textContent = CHASSIS[u.chassis].name;
      } else {
        u.weapons[Number(k[1])] = el.value;
        $(`#hint-${k}`).innerHTML = this.weaponHint(el.value);
      }
      this.preview.show(u, i ? 'signalAlt' : 'signal');
    }));
    this.preview.show(u, i ? 'signalAlt' : 'signal');
  }

  briefing() {
    const b = this.battle;
    const tr = TRAINERS[b.chapter.trainer];
    const map = MAPS[b.chapter.map];
    document.documentElement.style.setProperty('--accent', tr.color);
    $('#br-card').src = tr.card;
    $('#br-chapter').textContent = `${b.campaign ? L(b.chapter.title) : t('quick')} · ${b.mode === 'duel' ? '1 VS 1' : '3 VS 3'}`;
    $('#br-title').textContent = L(b.title);
    $('#br-map').innerHTML = `<b>${map.name}</b> · ${esc(L(map.blurb))}`;
    $('#br-doctrine').textContent = `${L(tr.motto)} ${L(tr.bio)}`;
    const ec = CHASSIS[b.enemies[0].chassis];
    $('#br-enemies').innerHTML = b.enemies.map(e => `<div><span><b>${esc(e.name)}</b> ${CHASSIS[e.chassis].name}${e.elite ? ' ★ ELITE' : ''}</span><span>${e.weapons.map(w => WEAPONS[w].short).join(' · ')}</span></div>`).join('')
      + `<div class="armor-intel"><span>${t('brief.armor')} ${ec.name}: ${armorLine(ec)}</span><em>${esc(L(ec.armorNote))}</em></div>`;
    const free = !b.campaign;
    this.available = { weapons: free ? Object.keys(WEAPONS) : this.progress.weapons, chassis: free ? Object.keys(CHASSIS).filter(id => !CHASSIS[id].hidden) : this.progress.chassis };
    const { weapons, chassis } = this.available;
    const n = b.mode === 'duel' ? 1 : 3;
    const saved = this.progress.loadouts[b.mode] || {};
    const keep = this.roster && this.roster.length === n && this.rosterFor === b.id;
    if (!keep) {
      this.roster = PLAYER_ROSTER.slice(0, n).map((name, i) => {
        const s = saved.units?.[i] || {};
        const ok = (v, list, d) => (list.includes(v) ? v : d);
        return {
          name,
          chassis: ok(s.chassis, chassis, 'pathfinder'),
          weapons: [ok(s.weapons?.[0], weapons.filter(w => ARM_WEAPONS.includes(w)), 'autocannon'), ok(s.weapons?.[1], weapons.filter(w => ARM_WEAPONS.includes(w)), i === 1 ? 'rotary' : 'autocannon'), ok(s.weapons?.[2], weapons.filter(w => SUPPORT_WEAPONS.includes(w)), 'missile')],
          strategy: s.strategy || DEFAULT_STRATEGIES[i],
        };
      });
      this.rosterFor = b.id;
      this.previewIndex = 0;
      $('#br-team-note').value = saved.teamNote || '';
    }
    $('#br-tabs').hidden = n === 1;
    $('#br-back').onclick = () => this.go(b.campaign ? 'campaign' : 'skirmish');
    $('#br-start').onclick = () => this.launch();
    this.renderBackend();
    applyStatic($('#briefing'));
    this.show('briefing');
    this.preview.start();
    this.renderEditor(Math.min(this.previewIndex || 0, this.roster.length - 1));
  }

  exitMatch() {
    if (!this.match || this.match.showcase) return;
    const b = this.battle;
    this.paused = false;
    this.hud.banner('', '', '#fff');
    this.match.onEnd = null;
    this.showcase(b.chapter.map, b.chapter.trainer, b.enemies);
    this.go(b.campaign ? 'campaign' : 'skirmish');
  }

  // Dev-only reference loadout used by the balance simulator (?advice=1).
  applyAdvice() {
    const a = this.battle.advice;
    if (!a) return;
    this.progress.loadouts[this.battle.mode] = { units: a.units.map(u => ({ chassis: u.chassis, weapons: [...u.weapons], strategy: u.strategy })), teamNote: a.teamNote };
    this.saveProgress();
  }

  launch() {
    const b = this.battle;
    const tr = TRAINERS[b.chapter.trainer];
    const teamNote = $('#br-team-note').value.trim();
    this.progress.loadouts[b.mode] = { units: this.roster, teamNote };
    this.saveProgress();
    this.endMatch();
    // Each match the rival coach picks one of their game plans at random.
    const variant = tr.variants[Math.floor(Math.random() * tr.variants.length)];
    this.match = new Match(this, {
      map: b.chapter.map, mode: b.mode, enemyHp: b.enemyHp ?? 1.5,
      blue: { coach: { kind: 'player', id: 'player', name: 'NULL SIGNAL coach', team: PLAYER_TEAM.team, teamNote }, units: this.roster.map((u, i) => ({ ...u, palette: i ? 'signalAlt' : 'signal' })) },
      red: { coach: { kind: 'trainer', id: tr.id, name: tr.name.en, team: tr.team, doctrine: `${tr.doctrine}\n${variant.doctrine}`, preset: { ...tr.preset, ...variant.preset }, variant: variant.name, locks: tr.locks }, units: b.enemies.map(e => ({ ...e, palette: tr.palette })) },
    });
    this.match.onEnd = (r) => this.finish(r);
    this.hud.attach(this.match);
    this.show('hud');
    document.documentElement.style.setProperty('--accent', '#3fe0f5');
    this.hud.banner(t(b.mode === 'duel' ? 'hud.duel' : 'hud.squad'), `${MAPS[b.chapter.map].name} · NULL SIGNAL VS ${tr.team}`, '#3fe0f5', 2.6);
    // Commanders plan during the countdown so the first moves already follow the strategy.
    this.match.prime();
    setTimeout(() => { this.match?.start(); this.hud.banner(t('hud.fight'), '', '#ffffff', 1.2); }, 3600);
  }

  finish(result) {
    const m = this.match, b = this.battle;
    const win = result === 'victory';
    this.hud.banner(t(win ? 'hud.win' : 'hud.lose'), '', win ? '#3fe0f5' : '#ff4a3a', 2);
    this.music.sting(win);
    let unlockText = '';
    if (win && b.campaign && !this.progress.done[b.id]) {
      this.progress.done[b.id] = true;
      const u = b.unlock || {};
      for (const w of u.weapons || []) if (!this.progress.weapons.includes(w)) this.progress.weapons.push(w);
      for (const c of u.chassis || []) if (!this.progress.chassis.includes(c)) this.progress.chassis.push(c);
      const names = [...(u.weapons || []).map(w => WEAPONS[w].name), ...(u.chassis || []).map(c => CHASSIS[c].name)];
      if (names.length) unlockText = `${t('res.unlocked')}: ${names.join(', ')}`;
      this.saveProgress();
    }
    const blue = m.blue;
    const dealt = blue.reduce((s, u) => s + (u.damageDealt || 0), 0), taken = blue.reduce((s, u) => s + u.damageTaken, 0);
    const jevCalls = m.streams.reduce((s, st) => s + st.stats.calls, 0);
    const plans = m.commanders.blue.plansMade + m.commanders.red.plansMade;
    setTimeout(() => {
      $('.result').className = `result ${win ? 'win' : 'lose'}`;
      $('#res-sub').textContent = `${L(b.title)} · ${MAPS[b.chapter.map].name} · ${Math.floor(m.time)} s`;
      $('#res-title').textContent = t(win ? 'hud.win' : 'hud.lose');
      $('#res-stats').innerHTML = [
        [t('res.dealt'), Math.round(dealt)], [t('res.taken'), Math.round(taken)], [t('res.kills'), blue.reduce((s, u) => s + u.kills, 0)],
        [t('res.plans'), plans], [t('res.jev'), jevCalls || '—'], [t('res.rivalPlan'), L(m.config.red.coach.variant) || '—'],
      ].map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join('');
      $('#res-unlock').textContent = unlockText;
      this.showSpend(m.spend);
      $('#res-retry').onclick = () => { this.showcase(b.chapter.map, b.chapter.trainer, b.enemies); this.briefing(); };
      $('#res-next').onclick = () => {
        const after = () => { if (b.campaign) { this.showcase('citadel'); this.go('campaign'); } else this.go('skirmish'); };
        if (b.campaign) { this.showcase(b.chapter.map, b.chapter.trainer, b.enemies); this.dialogue(win ? b.win : b.lose, b.chapter.trainer, after); }
        else after();
      };
      this.endMatch();
      this.showcase(b.chapter.map, b.chapter.trainer, b.enemies);
      this.show('result');
    }, 2200);
  }

  // Token spend and money for this battle (summed from backend responses).
  async showSpend(spend) {
    const el = $('#res-spend');
    el.innerHTML = '';
    if (!spend) return;
    let info = { prices: {}, currency: '$', balance: null, llmModel: backend.llmModel };
    try { info = await (await fetch('/api/usage')).json(); } catch { /* static hosting */ }
    const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
    const cost = (k) => { const [pin, pout] = info.prices?.[k] || []; return pin && pout ? spend[k].input / 1e6 * pin + spend[k].output / 1e6 * pout : null; };
    const part = (k, label, unit) => {
      const d = spend[k];
      if (!d.calls) return '';
      const c = cost(k);
      return `<div><small>${label}</small><b>${d.calls} ${unit}</b><span>${fmtK(d.input)} ${t('res.in')} / ${fmtK(d.output)} ${t('res.out')}${c != null ? ` · ≈${info.currency}${c.toFixed(4)}` : ''}</span></div>`;
    };
    const total = ['llm', 'jev'].map(cost).filter(c => c != null);
    el.innerHTML = `<div class="spend-title">${t('res.spend')}${total.length ? ` · ≈${info.currency}${total.reduce((a, b) => a + b, 0).toFixed(4)}${total.length < 2 ? ` ${t('res.noJevPrice')}` : ''}` : ''}${info.balance != null ? ` · ${t('res.balance')} ${info.balance}` : ''}</div>`
      + part('llm', `${t('brief.commander')} · ${esc(info.llmModel || 'LLM')}`, t('res.plansUnit')) + part('jev', 'JEV', t('res.decUnit'));
  }

  // ?auto=<battleId>[&local=1] — straight into a battle (used for tests and recordings).
  auto(id) {
    if (params.get('local')) backend.forceLocal = true;
    if (params.get('lang')) this.changeLang(params.get('lang'));
    const battle = allBattles().find(b => b.id === id) || allBattles()[0];
    this.battle = { ...battle, campaign: false };
    this.showcase(battle.chapter.map, battle.chapter.trainer, battle.enemies);
    if (params.get('advice')) this.applyAdvice();
    this.briefing();
    if (params.get('loadout')) {
      const presets = JSON.parse(decodeURIComponent(params.get('loadout')));
      presets.forEach((p, i) => Object.assign(this.roster[i], p));
      if (params.get('note')) $('#br-team-note').value = params.get('note');
    }
    this.launch();
    if (params.get('cam')) setTimeout(() => this.hud.setCam(params.get('cam')), 100);
    if (params.get('cinema')) document.body.classList.add('cinema');
  }

  // ------------------------------------------------------------ frame loop
  loop(now) {
    requestAnimationFrame(ts => this.loop(ts));
    const dt = Math.min((now - this.last) / 1000, .05);
    this.last = now;
    if (!this.manualClock) this.frame(dt);
  }

  // Offline capture: the recorder advances the game by exact steps (see tools/record).
  step(dt = 1 / 30) {
    if (!this.manualClock) this.world.grade.uniforms.grain.value = 0; // grain does not survive video compression
    this.manualClock = true;
    this.frame(dt);
  }

  frame(dt) {
    if (this.cutscene) { this.cutscene.update(dt); this.world.render(dt); return; }
    if (this.match) {
      if (this.match.showcase) this.updateShowcase(dt);
      else {
        if (this.world.camera.view?.enabled) this.world.camera.clearViewOffset();
        if (!this.paused) this.match.update(dt);
        const alive = this.match.units.filter(u => u.alive);
        const firing = alive.filter(u => u.lastAction === 'FIRING').length / Math.max(1, alive.length);
        const contact = alive.some(u => u.visible?.length) ? .35 : .1;
        this.music.setIntensity(this.match.running ? contact + firing * 1.4 + (this.match.slowmo > 0 ? .4 : 0) : .2);
      }
      this.hud.update();
    }
    this.world.render(dt);
  }

  updateShowcase(dt) {
    const m = this.match;
    for (const u of m.units) u.animate(dt, this.fx, this.world.clock);
    m.arena.update(this.world.clock);
    this.fx.update(dt);
    // Slow orbit in front of the line-up. On the title screen the projection is
    // shifted right so the mechs stand clear of the menu column.
    const k = this.world.clock * .05;
    const cam = this.world.camera;
    const a = Math.sin(k) * .35;
    cam.position.set(Math.sin(a) * 26, 6 + Math.sin(k * 1.3), -46 + Math.cos(a) * 26);
    cam.lookAt(0, 4.4, -46);
    if (this.screen === 'title') cam.setViewOffset(innerWidth, innerHeight, -innerWidth * .2, -innerHeight * .04, innerWidth, innerHeight);
    else if (cam.view?.enabled) cam.clearViewOffset();
  }
}

const app = new App();
window.SD = app;
app.boot().catch(err => { console.error(err); $('#load-text').textContent = `ERROR: ${err.message}`; });
