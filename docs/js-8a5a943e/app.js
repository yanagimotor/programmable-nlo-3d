// Page logic: modes, side panel, language, kiosk/idle behaviour.
// Modes follow the paper (R. Yanagimoto et al., Nature 649, 330 (2026)) figure by figure; the measured
// data come from the paper's public data set (data.js), the rest from a model of the chip (physics.js).
import * as P from './physics.js';
import { Lab, NPAT } from './scene.js';
import { setLang, t, getLang } from './i18n.js';
import * as plots from './plots.js';
import * as D from './data.js';
import { shRGB, css, hex, PAL, shGradientCSS } from './colours.js';

const params = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// at most one call per `ms` while a slider is dragged, plus a trailing call for the final position
function throttle(fn, ms) {
  let last = -1e9, timer = null;
  return () => {
    const wait = ms - (performance.now() - last);
    if (wait <= 0) { last = performance.now(); fn(); }
    else if (!timer) timer = setTimeout(() => { timer = null; last = performance.now(); fn(); }, wait);
  };
}
const maxOf = a => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };
const sumOf = a => { let m = 0; for (const v of a) m += v; return m; };
const toUm = lamNm => Float64Array.from(lamNm, v => v / 1000);
// a measured setting with its unit, e.g. 1.05×10⁻⁵ rad/µm³
const UNITS = { um: 'µm', 'rad/um^2': 'rad/µm²', 'rad/um^3': 'rad/µm³' };
const SUP = e => String(e).replace('-', '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
function fmtVal(v, unit = '', e = null) {
  const u = UNITS[unit] ?? unit;
  let s;
  if (e !== null) s = `${(v / 10 ** e).toFixed(2)}×10${SUP(e)}`;
  else if (v !== 0 && Math.abs(v) < 1e-3) { const k = Math.floor(Math.log10(Math.abs(v))); s = `${(v / 10 ** k).toFixed(2)}×10${SUP(k)}`; }
  else s = String(+(+v).toPrecision(3));
  return u ? `${s} ${u}` : s;
}

// Display version of a pattern: stripes drawn ~26 per programmable length, period deviations from
// `ref` exaggerated by G so that small spacing changes are visible (labelled on screen).
export function displayPattern(pattern, { G = 1, stripes = 26, ref = P.LAMBDA_DEG } = {}) {
  const out = new Float32Array(NPAT);
  if (!pattern || !pattern.length) return out;
  const L = P.L_PROG, dz = L / NPAT, refDisp = L / stripes;
  const ph = pattern.map(c => c.phase || 0);
  const wsum = pattern.reduce((s, c) => s + c.w, 0) || 1;
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < NPAT; i++) {
    const z = (i + 0.5) * dz;
    let s = 0;
    pattern.forEach((c, j) => {
      const p = P.localPeriod(c, z);
      const pd = refDisp * Math.max(0.2, 1 + G * (p - ref) / ref);
      ph[j] += P.TAU * dz / pd;
      const cs = Math.cos(ph[j] - P.TAU * dz / (2 * pd));
      s += c.w * (pattern.length === 1 ? 0.5 + 0.5 * Math.tanh(5 * cs) : 0.5 * (1 + cs));
    });
    out[i] = s / wsum;
    mn = Math.min(mn, out[i]); mx = Math.max(mx, out[i]);
  }
  if (pattern.length > 1 && mx > mn) for (let i = 0; i < NPAT; i++) out[i] = (out[i] - mn) / (mx - mn);
  return out;
}

// The paper draws the 17-µm samples smoothed (its strips are antialiased); without that, floor() in the
// sampling shows sample-to-sample stripes that the paper does not show.  [1, 2, 1] / 4 along z.
function smooth3(a) {
  const n = a.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[Math.max(0, i - 1)] + 2 * a[i] + a[Math.min(n - 1, i + 1)]) / 4;
  return out;
}

// A measured 1D pattern (sampled every 17 µm, as the paper shows it) onto the 3D chip's samples.
function toNPAT(a) {
  const out = new Float32Array(NPAT);
  for (let i = 0; i < NPAT; i++) out[i] = clamp(a[Math.min(a.length - 1, Math.floor((i + 0.5) / NPAT * a.length))], 0, 1);
  return out;
}

const MODES = ['overview', 'how', 'adapt', 'colors', 'train', 'spatial', 'spatiospec', 'quantum'];
const PRESETS = {
  adapt: ['track', 'scan', 'try'],
  colors: ['one', 'tune', 'four', 'broad', 'cornell', 'ntt'],
  train: ['square', 'twin', 'circle'],
  spatial: ['ref', 'focus', 'nine', 'airy', 'steer'],
  spatiospec: ['peaks', 'airy2', 'grid'],
  quantum: ['twins', 'colours', 'off', 'tuneq'],
};
const DEFAULT = { adapt: 'track', colors: 'one', train: 'square', spatial: 'focus', spatiospec: 'peaks', quantum: 'twins' };
// Where each view is in the paper: main-text figure panel (fig) and/or Supplementary figure (si).
const REFS = {
  overview: { fig: '1' }, how: { fig: '1b' }, quantum: { sec: 'S2D' },
  adapt: { track: { fig: '2c' }, scan: { fig: '2b' }, try: { fig: '2c' } },
  colors: { one: { fig: '3a(i)' }, tune: { fig: '3a(i)' }, four: { fig: '3a(ii)' }, broad: { fig: '3a(iii)' }, cornell: { fig: '3c' }, ntt: { si: 'S30' } },
  train: { square: { fig: '3b(i)', si: 'S27' }, twin: { fig: '3b(ii)', si: 'S27' }, circle: { fig: '3b(iii)', si: 'S27' } },
  spatial: { ref: { fig: '4b(i)' }, focus: { fig: '4b(ii)' }, nine: { fig: '4b(iii)', si: 'S36' }, airy: { fig: '4b(iv)', si: 'S37' }, steer: { si: 'S34' } },
  spatiospec: { peaks: { fig: '5b', si: 'S39' }, airy2: { fig: '5c' }, grid: { si: 'S40' } },
};
function refText(r) {
  if (!r) return '';
  if (r.data) return t('ref.dataonly');
  if (r.model) return t('ref.model');
  if (r.sec) return t('ref.sec').replace('{n}', r.sec);
  const a = [];
  if (r.eq) a.push(t('ref.eq').replace('{n}', r.eq));
  if (r.fig) a.push(t('ref.fig').replace('{n}', r.fig));
  if (r.si) a.push(t('ref.si').replace('{n}', r.si));
  return a.join(t('ref.and'));
}
function figLabel(f, preset) {
  const base = f.file.split('/').pop();
  for (const k of [`figfile.${preset}.${base}`, `figfile.${base}`]) { const v = t(k); if (v !== k) return v; }
  return f.label;
}
// playback speeds on screen (s per stored step), and pauses at the end before starting again
const PLAY = { cornell: 0.25, ntt: 0.1, train: 0.12, track: 0.12, hold: 3.5 };
// "How it works": seconds per step when playing; step 7 sweeps the stripe spacing once (QPM_SWEEP s) and stops
const HOW_STEPS = 7, HOW_DUR = [0, 4.5, 4.5, 4.5, 6, 7, 7], QPM_SWEEP = 10;
const QPM_G = 20;                 // step 7 draws spacing changes 20x larger: one stripe fewer stays one stripe fewer
const QPM_RANGE = [16.55, 16.85];
const KIOSK = params.has('kiosk');
const KIOSK_LANG = params.get('lang') === 'en' ? 'en' : 'ja';

export class App {
  constructor() {
    this.cache = {};
    this.loaded = {};
    this.loadToken = 0;
    this.kiosk = KIOSK;
    if (KIOSK) document.documentElement.classList.add('kiosk');
    const scale = clamp(+params.get('scale') || 0, 0, 3);
    if (scale >= 0.6) {                            // booth tuning, e.g. ?kiosk=1&scale=1.6
      document.documentElement.style.setProperty('--s', String(scale));
      document.documentElement.style.setProperty('--plot-scale', String(scale));
    }
    const coarse = matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 600;
    this.lab = new Lab($('#stage'), {
      labelText: id => (id === '__coinc' ? t('coincidences') : id === '__fb' ? t('fb.label') : t(`comp.${id}.name`)),
      layerText: id => t(`layer.${id}`),
      onSelect: id => this.showInfo(id),
      quality: params.get('quality') || (coarse ? 'low' : 'high'),
    });
    // The booth PC's animation setting is not the visitor's preference, so the kiosk runs with motion.
    const forced = params.get('motion') === 'full' ? false : params.get('motion') === 'reduce' ? true : KIOSK ? false : null;
    if (forced !== null) this.lab.setReducedMotion(forced);
    this.lab.motionQuery.addEventListener('change', e => { if (forced === null) this.setMotion(!e.matches); });
    this.buildChrome();
    setLang(KIOSK ? KIOSK_LANG : (params.get('lang') === 'ja' ? 'ja' : 'en'));
    this.lab.refreshLabels();
    this.refreshTexts();
    const m0 = MODES.includes(params.get('mode')) ? params.get('mode') : 'overview';
    this.firstMode = m0;
    this.setMode(m0, { instant: true });
    if (params.has('explode')) { this.toggleExplode(true); this.lab.flyTo('exploded', 0); }
    if (params.get('select')) this.lab.select(params.get('select'));
    // test hook: ?debug&cam=px,py,pz,tx,ty,tz places the 3D camera (close-up screenshots)
    const cam = params.has('debug') && (params.get('cam') || '').split(',').map(Number);
    if (cam && cam.length === 6 && cam.every(Number.isFinite)) {
      this.lab.flyTo({ pos: { x: cam[0], y: cam[1], z: cam[2] }, target: { x: cam[3], y: cam[4], z: cam[5] } }, 0);
    }
    this.lastInput = performance.now();
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => this.onInput(), { passive: true });
    window.addEventListener('keydown', e => this.onKey(e));
    if (KIOSK) this.setupKiosk();
    this.setupNarrowLayout();
    // test hook: ?simulate=N advances the page N simulated seconds before the first frame (synchronous
    // parts only: measured data arrive asynchronously)
    const sim = clamp(+(params.get('simulate') || 0), 0, 60);
    for (let i = 0; i < sim * 30; i++) {
      const f = this['tick_' + this.mode];
      if (f) f.call(this, 1 / 30);
      this.lab.update(1 / 30);
    }
    // the measured data of the other modes, fetched quietly in the background
    setTimeout(() => D.prefetch(['fig3a', 'fig3c', 'fig3b', 'fig2', 'fig4', 'fig5']).then(() => {}), 2500);
    this.loop();
  }

  // ------------------------------------------------------------------ chrome (panel + overlays)
  buildChrome() {
    const nav = $('#modes');
    this.modeButtons = {};
    for (const m of MODES) {
      const b = el('button', { type: 'button', class: 'mode', 'aria-pressed': 'false', onclick: () => this.setMode(m) });
      b.append(el('span', { class: 'mname', 'data-i18n': `mode.${m}` }), el('span', { class: 'mtag', 'data-i18n': `tag.${m}` }));
      nav.append(b);
      this.modeButtons[m] = b;
    }
    $('#btn-labels').addEventListener('click', () => {
      this.lab.setLabelsVisible(!this.lab.labelsOn);
      $('#btn-labels').setAttribute('aria-pressed', String(this.lab.labelsOn));
    });
    $('#btn-labels').setAttribute('aria-pressed', 'true');
    $('#btn-explode').addEventListener('click', () => this.toggleExplode());
    $('#btn-reset').addEventListener('click', () => this.lab.flyTo(this.lab.explode.target > 0 ? 'exploded' : this.mode));
    $('#btn-motion').addEventListener('click', () => this.setMotion(this.lab.reduced));
    $('#btn-lang').addEventListener('click', () => {
      setLang(getLang() === 'en' ? 'ja' : 'en');
      this.lab.refreshLabels();
      this.refreshTexts();
    });
    $('#info-close').addEventListener('click', () => this.lab.select(null));
    $('#paper-show').addEventListener('click', () => this.showFigure());
    $('#figview-close').addEventListener('click', () => $('#figview').close());
    $('#figview').addEventListener('click', e => {
      const dlg = $('#figview'), r = dlg.getBoundingClientRect();
      if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dlg.close();
    });
  }

  setMotion(on) {
    this.lab.setReducedMotion(!on);
    this.updateMotionBtn();
  }

  updateMotionBtn() {
    const b = $('#btn-motion');
    b.textContent = t(this.lab.reduced ? 'btn.motionOff' : 'btn.motionOn');
    b.setAttribute('aria-pressed', String(!this.lab.reduced));
  }

  toggleExplode(force) {
    const on = force !== undefined ? force : !(this.lab.explode.target > 0);
    if (this.mode === 'how') this.lab.setCut(!on);
    this.lab.setExploded(on);
    const b = $('#btn-explode');
    b.setAttribute('aria-pressed', String(on));
    b.textContent = t(on ? 'btn.closechip' : 'btn.explode');
    if (force === undefined) this.lab.flyTo(on ? 'exploded' : this.mode);
    this.renderBadge();
    this.renderLegend();
    if (this.lab.selected === 'chip') this.showInfo('chip');
  }

  refreshTexts() {
    $('#btn-lang').textContent = t('langToggle');
    document.title = t('title');
    const b = $('#btn-explode');
    b.textContent = t(this.lab.explode.target > 0 ? 'btn.closechip' : 'btn.explode');
    this.updateMotionBtn();
    if (this.mode) this.renderModeTexts();
    if (this.lab.selected) this.showInfo(this.lab.selected);
    this.renderLegend();
    this.redrawPlot();
    if (this.mode === 'adapt') ({ try: () => this.tryApply(), track: () => this.trackApply(), scan: () => this.scanApply() })[this.state.preset]?.();
    if (this.mode === 'how') this.updatePlayBtn();
    this.updatePlayers();
  }

  // the paper reference of what is on screen
  ref() {
    if (this.mode === 'how' && (this.state || {}).step >= 5) return { eq: '2', fig: '2b' };
    const r = REFS[this.mode];
    if (!r) return null;
    if (r.fig || r.si || r.sec) return r;
    const p = (this.state || {}).preset;
    // a slider over a measured series: name the panel(s) that show this setting, or say it is not plotted
    // settings of a scan that were only simulated (the focus scan between its two measured values)
    if (this.mode === 'spatial' && this.sp && this.sp.q.measured && !this.sp.q.measured[this.state.i]) return { model: true };
    const ip = this.mode === 'spatial' && this.sp && this.sp.q.in_paper;
    if (ip) {
      const hits = Object.entries(ip).filter(([, idx]) => idx.includes(this.state.i)).map(([k]) => k), out = {};
      if (!hits.length) return { data: true };
      for (const k of hits) { const m = /S(\d+)/.exec(k); if (m) out.si = 'S' + m[1]; else out.fig = k.replace(/^Fig\.\s*/, ''); }
      return out;
    }
    return r[p] || null;
  }

  renderBadge() {
    const m = this.mode, p = (this.state || {}).preset;
    let text, cls = 'demo';
    if (this.lab.explode.target > 0) text = t('badge.exploded');
    else if (m === 'overview') text = t('badge.overview');
    else if (m === 'how' && (this.state || {}).step >= 5) { text = t('badge.qpm'); cls = 'sim'; }
    else if (m === 'how') text = t('badge.how');
    else if (m === 'quantum') { text = t('badge.quantum'); cls = 'proposed'; }
    else if (m === 'adapt' && p === 'try') { text = t('badge.try'); cls = 'sim'; }
    else {
      const r = this.ref();
      if (r && r.model) { text = t('badge.model'); cls = 'sim'; }
      else text = r && r.data ? `${t('badge.meas')}${t('sep')}${t('ref.dataonly')}` : `${t('badge.meas')}${t('sep')}${t('ref.paper')}, ${refText(r)}`;
      if (m === 'colors' && p === 'tune') text += `${t('sep')}${t('badge.scan')}`;
    }
    const b = $('#badge');
    b.textContent = text;
    // "drawn 5x wider" stays in one piece on narrow screens; it also holds for the opened chip
    if (m === 'spatial' || m === 'spatiospec') b.append(t('sep'), el('span', { class: 'nw' }, t('badge.xmag')));
    b.className = 'badge ' + cls;
    this.updateBlockers();
  }

  // 3D labels are hidden where the page's overlays cover the canvas
  updateBlockers() {
    const st = $('#stage').getBoundingClientRect(), r = [];
    for (const sel of ['#badge', '#hud', '#viewbtns', '#hint', '#stage > #legend']) {
      const e = document.querySelector(sel);
      if (!e || e.hidden || !e.offsetParent) continue;
      const q = e.getBoundingClientRect();
      if (q.width && q.height) r.push({ x0: q.left - st.left - 4, y0: q.top - st.top - 4, x1: q.right - st.left + 4, y1: q.bottom - st.top + 4 });
    }
    this.lab.blockers = r;
  }

  renderLegend() {
    const m = this.mode, step = (this.state && this.state.step) || 4;
    const sw = (style, key) => [style, key];
    const pumpSw = { background: `repeating-linear-gradient(90deg, ${hex(PAL.pump)} 0 5px, transparent 5px 8px)` };
    let items;
    // the opened chip shows the light, the field lines and the chi2 of every mode (the conducting coating only on
    // the cut face of "How it works")
    const ex = this.lab.explode.target > 0, field = sw({ background: hex(PAL.field) }, 'leg.field'), chi = sw({ background: hex(PAL.chi2) }, 'leg.chi2');
    if (m === 'quantum') {
      items = [sw({ background: hex(PAL.green) }, 'leg.green'), sw({ background: css(shRGB(780)) }, 'leg.pump780'), sw(pumpSw, 'leg.pairs'), chi];
      if (ex) items.splice(1, 0, field);
    } else if (m === 'how' || ex) {
      const st = m === 'how' ? step : 4;
      items = [sw({ background: hex(PAL.green) }, 'leg.green')];
      if (st >= 2 && !ex) items.push(sw({ background: hex(PAL.pcOn) }, 'leg.cond'));
      if (st >= 3) items.push(field);
      if (st >= 4) items.push(chi, sw(pumpSw, m === 'adapt' || m === 'how' ? 'leg.pumpcw' : 'leg.pump'), sw({ background: shGradientCSS() }, 'leg.out'));
      if (ex && m === 'spatial') items.push(sw({ background: css(shRGB(790)), boxShadow: `0 0 6px ${css(shRGB(790))}` }, 'leg.inside'));
    } else {
      items = [sw({ background: hex(PAL.green) }, 'leg.green'), sw(pumpSw, m === 'adapt' || m === 'how' ? 'leg.pumpcw' : 'leg.pump'), sw({ background: shGradientCSS() }, 'leg.out')];
      if (m === 'spatial') items.push(sw({ background: css(shRGB(790)), boxShadow: `0 0 6px ${css(shRGB(790))}` }, 'leg.inside'));
      if (m === 'spatiospec') items.push(sw({ background: `linear-gradient(0deg, #0d151d, ${css(shRGB(770))})` }, 'leg.surface'));
    }
    const lg = $('#legend');
    lg.replaceChildren(...items.map(([style, key]) => {
      const i = el('i', { class: 'sw' });
      Object.assign(i.style, style);
      return el('span', { class: 'leg' }, i, t(key));
    }));
    this.updateBlockers();
  }

  showInfo(id) {
    const card = $('#info');
    if (!id) { card.hidden = true; return; }
    const cid = id === 'irLaser' && this.mode === 'quantum' ? 'qPump' : id === 'filter' && this.mode === 'quantum' ? 'qFilter'
      : id === 'spec' && this.mode === 'adapt' ? 'pmt' : id;
    $('#info-name').textContent = t(`comp.${cid}.name`);
    $('#info-role').textContent = t(`comp.${cid}.role`);
    const d = t(`comp.${cid}.detail`);
    $('#info-detail').textContent = d;
    $('#info-detail').hidden = !d;
    const extra = $('#info-extra');
    extra.replaceChildren();
    if (id === 'chip') {
      const b = el('button', { type: 'button', class: 'chip-btn', onclick: () => this.toggleExplode() });
      b.textContent = t(this.lab.explode.target > 0 ? 'btn.closechip' : 'btn.explode');
      extra.append(b);
    }
    card.hidden = false;
    card.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ "In the paper" box and figure viewer
  paperFiles() {
    const g = this.cur, p0 = (this.state || {}).preset, p = this.mode === 'adapt' && p0 === 'try' ? 'track' : p0;
    return (g && p && g.paper && g.paper[p] && this.curMode === this.mode) ? g.paper[p] : [];
  }

  renderPaper() {
    const r = this.ref();
    $('#paper').hidden = !r;
    if (!r) return;
    $('#paper-ref').textContent = r.data || r.model ? refText(r) : `${t('ref.paper')}, ${refText(r)}`;
    const p = (this.state || {}).preset, k = `paper.${this.mode}.${p}`;
    $('#paper-what').textContent = p && PRESETS[this.mode] && t(k) !== k ? t(k)
      : t(this.mode === 'how' && this.state.step >= 5 ? 'paper.how.qpm' : `paper.${this.mode}`);
    $('#paper-show').hidden = !this.paperFiles().length;
  }

  showFigure() {
    const files = this.paperFiles(), pr = (this.state || {}).preset;
    if (!files.length) return;
    $('#figview-title').textContent = `${t('ref.paper')}, ${refText(this.ref())}`;
    $('#figview .fv-note').textContent = t('fig.note');
    const body = $('#figview-body');
    body.replaceChildren(...files.map(f => el('figure', {},
      el('img', { src: D.href(f.file), alt: figLabel(f, pr), loading: 'lazy', decoding: 'async' }),
      el('figcaption', {}, figLabel(f, pr)))));
    $('#figview').showModal();
    body.scrollTop = 0;
  }

  // ------------------------------------------------------------------ modes
  setMode(m, { instant = false } = {}) {
    if (this.mode === m) { this.lab.flyTo(m); return; }
    this.exitMode();
    this.mode = m;
    for (const [k, b] of Object.entries(this.modeButtons)) b.setAttribute('aria-pressed', String(k === m));
    this.lab.select(null);
    this.toggleExplode(false);
    this.lab.setMode(m);
    this.lab.flyTo(m, instant ? 0 : 1.3);
    this.state = {};
    this.presetEls = {};
    this.players = [];
    this.loadToken++;
    $('#controls').replaceChildren();
    $('#presets').replaceChildren();
    $('#plotwrap').hidden = m === 'overview';
    $('#plotwrap').classList.toggle('tall', m === 'spatial' || m === 'spatiospec' || m === 'train');
    $('#complist').hidden = m !== 'overview';
    $('#stripwrap').hidden = m === 'overview';
    $('#stripwrap').classList.toggle('two', m === 'spatial' || m === 'spatiospec');
    $('#hud').hidden = m !== 'adapt';
    this.hudPlaced = false;
    this['enter_' + m]();
    this.renderLegend();
    this.renderModeTexts();
  }

  exitMode() {
    if (!this.mode) return;
    const f = this['exit_' + this.mode];
    if (f) f.call(this);
  }

  urlPreset(mode, fallback) {
    const p = params.get('preset');
    return this.firstMode === mode && !this.usedUrlPreset && PRESETS[mode].includes(p) ? (this.usedUrlPreset = true, p) : fallback;
  }

  presetButtons(list, current, onPick) {
    const wrap = $('#presets');
    wrap.replaceChildren();
    this.presetEls = {};
    for (const p of list) {
      const b = el('button', { type: 'button', class: 'preset', 'aria-pressed': String(p === current), onclick: () => onPick(p) });
      b.dataset.i18n = `preset.${p}`;
      b.textContent = t(`preset.${p}`);
      wrap.append(b);
      this.presetEls[p] = b;
    }
  }

  markPreset(p) {
    for (const [k, b] of Object.entries(this.presetEls || {})) b.setAttribute('aria-pressed', String(k === p));
  }

  renderModeTexts() {
    const m = this.mode, s = this.state || {}, p = s.preset;
    let cap = '', note = '';
    if (m === 'overview') cap = t('cap.overview');
    if (m === 'how') { cap = t(`how.${s.step || 1}`); if (s.step >= 5) note = t('note.qpm'); }
    if (m === 'adapt') {
      cap = p === 'try' ? t(s.feedback ? 'adapt.on' : 'adapt.off') : p === 'track' ? t(s.feedback === false ? 'cap.adapt.trackoff' : 'cap.adapt.track') : t('cap.adapt.scan');
      note = t(p === 'try' ? 'adapt.note' : `note.adapt.${p}`);
    }
    if (m === 'colors') { cap = t(`cap.colors.${p}`); note = [t('note.colors'), t(`note.colors.${p}`)].filter(Boolean).join(getLang() === 'ja' ? '' : ' '); }
    if (m === 'train') { cap = t(`cap.train.${p}`); note = t('note.train'); }
    if (m === 'spatial') { cap = t(`cap.spatial.${p}`); note = t(p === 'steer' || p === 'focus' ? `note.spatial.${p}` : 'note.spatial'); }
    if (m === 'spatiospec') { cap = t(`cap.spatiospec.${p}`); note = t('note.spatiospec'); }
    if (m === 'quantum') { cap = t(`quantum.${p || 'twins'}`); note = t('quantum.note'); }
    $('#caption').textContent = cap;
    $('#note').textContent = note;
    $('#note').hidden = !note;
    const sc = { overview: 'strip.cap', how: 'strip.cap', adapt: 'strip.cap', quantum: 'strip.cap', spatial: 'strip.cap2d', spatiospec: 'strip.cap2d' }[m] || 'strip.capds';
    $('#stripwrap .stripcap').dataset.i18n = m === 'colors' && (p === 'cornell' || p === 'ntt') ? 'strip.capword'
      : m === 'colors' && p === 'four' ? 'strip.capfour' : m === 'spatial' && p === 'steer' ? 'strip.capsteer' : sc;
    for (const e of document.querySelectorAll('#panel [data-i18n]')) e.textContent = t(e.dataset.i18n);
    for (const e of document.querySelectorAll('[data-i18n-aria]')) e.setAttribute('aria-label', t(e.dataset.i18nAria));
    this.renderBadge();
    this.renderPaper();
    if (m === 'overview') this.renderComponentList();
  }

  renderComponentList() {
    const ids = ['irLaser', 'inLens', 'chip', 'hv', 'green', 'slm', 'projLens', 'outLens', 'spec', 'pc'];
    $('#complist').replaceChildren(...ids.map(id => {
      const b = el('button', { type: 'button', class: 'comp', onclick: () => this.lab.select(id) });
      b.textContent = t(`comp.${id}.name`);
      return b;
    }));
  }

  redrawPlot() {
    const f = this['plot_' + this.mode];
    if (f && this.state) f.call(this);
  }

  // ------------------------------------------------------------------ patterns on the chip and in the strip
  showPattern(arr, opts) {
    this.lab.setPattern(arr, opts);
    this.lastStrip = { kind: '1d', arr };
    $('#stripwrap').classList.remove('rows');
    this.drawStrip();
  }

  // a measured 1D pattern (0..1 at the paper's 17 µm samples); rows: extra patterns stacked in the strip
  showMeasuredPattern(a0, rows = null) {
    const m = maxOf(a0), a = smooth3(m > 0 && m < 1 ? a0.map(v => v / m) : a0);   // drawn at full brightness
    this.lab.setPattern(toNPAT(a), { fade: 0 });
    this.lastStrip = rows ? { kind: 'rows', rows: rows.map(smooth3) } : { kind: '1d', arr: a };
    $('#stripwrap').classList.toggle('rows', !!rows);
    this.drawStrip();
  }

  // a measured 2D pattern: grid of stacked cells (decoded PNG) and the cell to show
  showPattern2D(grid, cell, cells) {
    this.lab.setPattern2D(grid.img, { cell, cells });
    this.lastStrip = { kind: '2d', grid, cell, cells };
    $('#stripwrap').classList.remove('rows');
    this.drawStrip();
  }

  drawStrip() {
    const c = $('#patstrip'), S = this.lastStrip;
    if (!c || !c.clientWidth || !S) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
    const [r, gg, b] = [(PAL.green >> 16) & 255, (PAL.green >> 8) & 255, PAL.green & 255];
    let value;
    if (S.kind === '2d') {
      const { grid, cell, cells } = S, ch = grid.rows / cells, cols = grid.cols;
      value = (x, y) => grid.v[(cell * ch + Math.min(ch - 1, Math.floor((1 - (y + 0.5) / c.height) * ch))) * cols + Math.min(cols - 1, Math.floor(x / c.width * cols))];
    } else if (S.kind === 'rows') {
      const n = S.rows.length;
      value = (x, y) => { const row = S.rows[Math.min(n - 1, Math.floor(y / c.height * n))]; return Math.floor(y / c.height * n * 4) % 4 === 3 && n > 1 ? -1 : row[Math.min(row.length - 1, Math.floor(x / c.width * row.length))]; };
    } else value = x => S.arr[Math.min(S.arr.length - 1, Math.floor(x / c.width * S.arr.length))];
    for (let x = 0; x < c.width; x++) for (let y = 0; y < c.height; y++) {
      const v = value(x, y), k = 4 * (y * c.width + x);
      if (v < 0) { d[k] = 7; d[k + 1] = 12; d[k + 2] = 10; d[k + 3] = 255; continue; }
      const q = clamp(v, 0, 1);
      d[k] = 7 + (r - 7) * q; d[k + 1] = 18 + (gg - 18) * q; d[k + 2] = 12 + (b - 12) * q; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------------ measured data: loading and players
  // Load a figure group's JSON and the 2D arrays picked from it; null if the visitor moved on meanwhile.
  async fetchView(name, pick) {
    const token = ++this.loadToken, mode = this.mode;
    try {
      let d = this.loaded[name];
      if (!d) {
        plots.drawMessage($('#plot'), t('data.loading'));
        d = this.loaded[name] = await D.group(name);
      }
      const want = (pick ? pick(d) : []);
      if (want.some(x => x && x.png)) plots.drawMessage($('#plot'), t('data.loading'));
      const gs = await Promise.all(want.map(x => (x && x.png ? D.grid(x) : Promise.resolve(null))));
      if (this.mode !== mode || this.loadToken !== token) return null;
      this.cur = d; this.curMode = mode;
      this.renderPaper();
      return { d, gs };
    } catch (e) {
      if (this.mode === mode && this.loadToken === token) {
        plots.drawMessage($('#plot'), t('data.fail'));
        window.dispatchEvent(new ErrorEvent('error', { message: 'data: ' + (e && e.message || e) }));
      }
      return null;
    }
  }

  // play/pause button + scrub slider for a stored sequence; onSeek(i) shows step i
  player(n, i0, onSeek, { label = null } = {}) {
    const btn = el('button', { type: 'button', class: 'ctl', onclick: () => { this.state.playing = !this.state.playing; if (this.state.playing && this.state.i >= n - 1) { this.state.i = 0; this.state.hold = 0; onSeek(0); } this.updatePlayers(); } });
    const out = el('output', { class: 'val' });
    const lab = el('label', { class: 'slider' }, el('span', { 'data-i18n': label || 'ctl.step' }, t(label || 'ctl.step')), out);
    const r = el('input', { type: 'range', min: '0', max: String(n - 1), step: '1', value: String(i0), 'data-i18n-aria': label || 'ctl.step', 'aria-label': t(label || 'ctl.step') });
    const st = this.state, update = throttle(() => { if (this.state === st) onSeek(+r.value); }, 40);
    r.addEventListener('input', () => { this.state.playing = false; this.state.i = +r.value; this.state.hold = 0; this.updatePlayers(); update(); });
    $('#controls').append(btn, lab, r);
    const pl = { btn, out, r, n };
    this.players.push(pl);
    this.updatePlayers();
    return pl;
  }

  updatePlayers() {
    for (const pl of this.players || []) {
      pl.btn.textContent = t(this.state.playing ? 'btn.pause' : 'btn.play');
      pl.r.value = String(this.state.i || 0);
      if (pl.text) pl.out.textContent = pl.text(this.state.i || 0);
    }
  }

  // test hook: ?at=N opens a stored sequence paused at step N (first view of the first mode only)
  seekFromUrl(n) {
    if (this.usedUrlAt || this.firstMode !== this.mode || !params.has('at')) return;
    this.usedUrlAt = true;
    this.state.i = clamp(Math.round(+params.get('at')) || 0, 0, n - 1);
    this.state.playing = false;
    this.updatePlayers();
  }

  // advance a stored sequence: every `every` seconds one step; at the end wait, then start again
  advance(dt, n, every, show) {
    const s = this.state;
    if (!s.playing || !n) return;
    s.acc = (s.acc || 0) + dt;
    const ev = every * (this.lab.reduced ? 2 : 1);
    if (s.acc < ev) return;
    s.acc = Math.min(s.acc - ev, ev);
    if (s.i < n - 1) s.i++;
    else if ((s.hold = (s.hold || 0) + ev) > PLAY.hold) { s.hold = 0; s.i = 0; }
    else return;
    show(s.i);
    this.updatePlayers();
  }

  // slider over a list of measured settings (periods, curvatures, ...): text(i) is the readout
  stepper(n, i0, labelKey, text, onPick) {
    const out = el('output', { class: 'val' });
    const lab = el('label', { class: 'slider' }, el('span', { 'data-i18n': labelKey }, t(labelKey)), out);
    const r = el('input', { type: 'range', min: '0', max: String(n - 1), step: '1', value: String(i0), 'data-i18n-aria': labelKey, 'aria-label': t(labelKey) });
    const mode = this.mode, preset = this.state.preset;
    const update = throttle(() => { if (this.mode === mode && this.state.preset === preset) onPick(+r.value); }, 30);
    r.addEventListener('input', () => { out.textContent = text(+r.value); update(); });
    out.textContent = text(i0);
    $('#controls').append(lab, r);
    return { r, out, set: i => { r.value = String(i); out.textContent = text(i); } };
  }

  // ---------------- overview
  enter_overview() {
    this.lab.setCut(false);
    this.lab.setStep(4);
    this.showPattern(displayPattern([{ kind: 'uniform', w: 1, period: P.LAMBDA_DEG }]));
    this.lab.setPump({});
    this.lab.setOutputVisible(true);
    this.lab.setOutputLine(780, 0.9);
  }

  // ---------------- how it works
  // Steps 1-4: how light writes the grating (Fig. 1b).  Steps 5-7: why stripes, and why their spacing matters
  // (quasi-phase matching, Eq. 2; model): no stripes, the right spacing, a wrong spacing with a slider.
  enter_how() {
    const s0 = this.firstMode === 'how' && params.has('step') && !this.usedUrlStep ? clamp(Math.round(+params.get('step')) || 1, 1, HOW_STEPS) : null;
    if (s0) this.usedUrlStep = true;
    this.state = { step: s0 || 1, t: 0, playing: s0 === null, period: P.QPM_SLIP };
    this.lab.setCut(true);
    const ctr = $('#controls');
    const dots = el('div', { class: 'dots', role: 'group' });
    this.stepDots = Array.from({ length: HOW_STEPS }, (_, k) => {
      const n = k + 1;
      const b = el('button', { type: 'button', class: n === 5 ? 'dot qpm' : 'dot', onclick: () => { this.state.playing = false; this.setHowStep(n); this.updatePlayBtn(); } });
      b.textContent = n;
      b.setAttribute('aria-label', `${t('aria.step')} ${n}`);
      dots.append(b);
      return b;
    });
    this.playBtn = el('button', { type: 'button', class: 'ctl', onclick: () => {
      if (this.state.step >= HOW_STEPS && !this.state.playing) this.setHowStep(1);
      this.state.playing = !this.state.playing; this.state.t = 0; this.updatePlayBtn();
    } });
    // step 7: the stripe spacing
    const out = el('output', { class: 'val' });
    const r = el('input', { type: 'range', min: String(QPM_RANGE[0]), max: String(QPM_RANGE[1]), step: '0.001', value: String(this.state.period),
      'data-i18n-aria': 'colors.period', 'aria-label': t('colors.period') });
    const st = this.state, update = throttle(() => { if (this.state === st && st.step === 7) { this.howApply(); this.plot_how(); } }, 40);
    r.addEventListener('input', () => { st.playing = false; st.period = +r.value; this.howReadout(); this.updatePlayBtn(); update(); });
    this.qpmCtl = { wrap: el('div', { class: 'qpmctl' }, el('label', { class: 'slider' }, el('span', { 'data-i18n': 'colors.period' }, t('colors.period')), out), r), out, r };
    ctr.append(dots, this.playBtn, this.qpmCtl.wrap);
    this.setHowStep(this.state.step);
    this.updatePlayBtn();
  }

  updatePlayBtn() {
    if (this.playBtn && this.mode === 'how') this.playBtn.textContent = t(this.state.playing ? 'btn.pause' : (this.state.step >= HOW_STEPS ? 'btn.replay' : 'btn.play'));
  }

  howReadout() {
    const c = this.qpmCtl, p = this.state.period, d = p - P.LAMBDA_DEG;
    if (!c) return;
    c.r.value = String(p);
    c.out.textContent = `${p.toFixed(3)} µm (${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(3)} µm)`;
  }

  setHowStep(n) {
    const s = this.state;
    s.step = n; s.t = 0; s.drawn = 0;            // drawn: time of the last redraw of the step-7 sweep
    if (n === 7) s.period = P.QPM_SLIP;                      // the case the caption describes; the sweep starts here
    this.lab.setStep(Math.min(n, 4));
    this.lab.setPump({ visible: n >= 4 });
    this.lab.setOutputVisible(n >= 4);
    this.howApply();
    (this.stepDots || []).forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n)));
    if (this.qpmCtl) { this.qpmCtl.wrap.hidden = n !== 7; this.howReadout(); }
    $('#plotwrap').classList.toggle('tall', n >= 5);
    this.renderModeTexts();
    this.renderLegend();
    this.plot_how();
  }

  // the pattern on the chip, the SH along the light guide and the output of the current step: stripes at the
  // matched spacing (steps 1-4, 6), the whole area lit (5), or the chosen spacing drawn with changes x QPM_G (7)
  howApply() {
    const s = this.state, n = s.step;
    const pat = n === 5 ? new Float32Array(NPAT).fill(1)
      : displayPattern([{ kind: 'uniform', w: 1, period: n === 7 ? s.period : P.LAMBDA_DEG }], { stripes: 22, G: n === 7 ? QPM_G : 1 });
    this.showPattern(pat, { fade: 0 });
    const c = n >= 5 ? P.qpmCurve(n === 5 ? 0 : n === 7 ? s.period : P.LAMBDA_DEG, { n: 200 }) : null;
    // weak light (step 7) is drawn up to 10x brighter so that its rise and fall show; the plot gives the power
    const top = c ? Math.max(0.1, ...c.P) : 1;
    this.lab.setSHProfile(c ? c.P.map(v => Math.min(1, v / top)) : null);
    this.lab.setOutputLine(780, n < 4 ? 0 : c ? clamp(c.P[c.P.length - 1], 0, 1) : 1);
  }

  tick_how(dt) {
    const s = this.state;
    if (!s.playing) return;
    s.t += dt;
    if (s.step < HOW_STEPS) {
      if (s.t > HOW_DUR[s.step]) this.setHowStep(s.step + 1);
      return;
    }
    // step 7: the spacing swings once through the matched value and back to where it started (one stripe too
    // few, then one too many); without motion it stays put
    const f = this.lab.reduced ? 1 : Math.min(1, s.t / QPM_SWEEP);
    s.period = P.LAMBDA_DEG + (P.QPM_SLIP - P.LAMBDA_DEG) * Math.cos(2 * Math.PI * f);
    if (f >= 1 || s.t - (s.drawn || 0) > 0.05) {
      s.drawn = s.t;
      this.howApply(); this.howReadout(); this.plot_how();
    }
    if (f >= 1) { s.playing = false; s.drawn = 0; this.updatePlayBtn(); }
  }

  // the curves of steps 5-7 (physics.js, exact for 0/1 patterns); the fixed ones are computed once
  qpmData() {
    const s = this.state, near = 3 * P.LAMBDA_DEG;
    const c = this.cache.qpm || (this.cache.qpm = {
      near: { z1: near, uni: P.qpmCurve(0, { z1: near, n: 300, unit: P.QPM_UNIT }), qpm: P.qpmCurve(P.LAMBDA_DEG, { z1: near, n: 300, unit: P.QPM_UNIT }) },
      uni: P.qpmCurve(0, { n: 300 }), match: P.qpmCurve(P.LAMBDA_DEG, { n: 300 }), scan: P.qpmScan(QPM_RANGE[0], QPM_RANGE[1], 301),
    });
    return { ...c, cur: s.step === 7 ? P.qpmCurve(s.period, { n: 300 }) : null, period: s.period, lam0: P.LAMBDA_DEG, gain: P.QPM_REF / P.QPM_UNIT };
  }

  plot_how() {
    const s = this.state;
    if (s.step >= 5) plots.drawQPM($('#plot'), { step: s.step, ...this.qpmData(), t });
    else plots.drawCrossSection($('#plot'), { step: s.step, t });
  }

  exit_how() {
    this.lab.setCut(false);
    this.lab.setStep(4);
    this.lab.setSHProfile(null);
    this.lab.setPump({ visible: true });
    this.lab.setOutputVisible(true);
    this.qpmCtl = null;
  }

  // ---------------- real-time tuning and feedback (Fig. 2): measured, plus the interactive model
  enter_adapt() {
    const p0 = this.urlPreset('adapt', DEFAULT.adapt);
    this.lab.setPump({});
    this.lab.setOutputVisible(true);
    this.presetButtons(PRESETS.adapt, p0, p => this.adaptPreset(p));
    this.adaptPreset(p0);
  }

  async adaptPreset(p) {
    this.loadToken++;
    this.state = { preset: p, i: 0, acc: 0, hold: 0, playing: true, feedback: true };
    this.markPreset(p);
    $('#controls').replaceChildren();
    this.players = [];
    this.fbBtn = this.adaptPlay = null;
    this.f2 = this.f2t = null;                    // nothing from the previous preset is drawn while this one loads
    this.lab.setFeedback(p !== 'scan');
    this.renderModeTexts();
    if (p === 'try') { this.tryStart(); return; }
    const v = await this.fetchView('fig2', d => [d.scan.eff && d.scan.eff.png ? d.scan.eff : null]);
    if (!v) return;
    const d = v.d;
    if (p === 'scan') {
      const sc = d.scan, eff = v.gs[0] ? Array.from({ length: v.gs[0].rows }, (_, k) => v.gs[0].row(k)) : D.rows(sc.eff);
      const pump = sc.pump_nm.length && Array.isArray(sc.pump_nm[0]) ? sc.pump_nm.map(r => Float64Array.from(r)) : sc.periods_um.map(() => Float64Array.from(sc.pump_nm));
      this.f2 = { periods: sc.periods_um, pump, eff, best: sc.best_pump_nm, emax: Math.max(...eff.map(maxOf)),
        fit: sc.fit && sc.fit.period_fit_um ? { period: sc.fit.period_fit_um, pump: sc.best_pump_nm } : null };
      const i0 = Math.max(0, sc.periods_um.findIndex(x => Math.abs(x - 16.7) < 0.01));
      this.state.i = i0;
      this.stepper(sc.periods_um.length, i0, 'colors.period', i => `${sc.periods_um[i].toFixed(2)} µm`, i => { this.state.i = i; this.scanApply(); });
      this.scanApply();
    } else {
      const tr = d.track;
      this.f2t = { tt: tr.t_s, pump: tr.pump_nm, period: tr.period_um, effOn: tr.eff_on, effOff: tr.eff_off, periodOff: tr.period_off_um ?? null };
      this.f2t.emax = Math.max(maxOf(tr.eff_on), maxOf(tr.eff_off));
      this.fbBtn = el('button', { type: 'button', class: 'ctl toggle', onclick: () => { this.state.feedback = !this.state.feedback; this.trackApply(); this.renderModeTexts(); } });
      $('#controls').append(this.fbBtn);
      const pl = this.player(tr.t_s.length, 0, i => { this.state.i = i; this.trackApply(); }, { label: 'ctl.time' });
      pl.text = i => `${Math.round(tr.t_s[i])} s`;
      this.seekFromUrl(tr.t_s.length);
      this.updatePlayers();
      this.trackApply();
    }
  }

  scanApply() {
    if (this.mode !== 'adapt' || this.state.preset !== 'scan' || !this.f2) return;
    const f = this.f2, i = this.state.i, per = f.periods[i];
    this.showPattern(displayPattern([{ kind: 'uniform', w: 1, period: per }], { G: 12, ref: 16.675 }));
    const best = f.best[i];
    this.lab.setOutputLine(best / 2, clamp(maxOf(f.eff[i]) / f.emax, 0.15, 1));
    this.renderHud([[t('hud.period'), `${per.toFixed(2)} µm`], [t('hud.best'), `${best.toFixed(0)} nm`], [t('hud.out'), `${(best / 2).toFixed(1)} nm`]]);
    this.lab.setActiveLaser('cw', best);
    this.lab.drawPCScreen([]);
    this.plot_adapt();
  }

  trackApply() {
    if (this.mode !== 'adapt' || this.state.preset !== 'track' || !this.f2t) return;
    const f = this.f2t, i = this.state.i, on = this.state.feedback;
    const per = on ? f.period[i] : (f.periodOff ?? f.period[0]), eff = on ? f.effOn[i] : f.effOff[i];
    this.showPattern(displayPattern([{ kind: 'uniform', w: 1, period: per }], { G: 40, ref: 16.95 }), { fade: 0 });
    this.lab.setFeedback(on);
    this.lab.setOutputLine(f.pump[i] / 2, clamp(eff / f.emax, 0, 1));
    const series = (on ? f.effOn : f.effOff).slice(Math.max(0, i - 59), i + 1).map(v => clamp(v / f.emax, 0, 1));
    this.lab.drawPCScreen(series);
    if (this.fbBtn) { this.fbBtn.textContent = t(on ? 'adapt.fbOnM' : 'adapt.fbOffM'); this.fbBtn.setAttribute('aria-pressed', String(on)); }
    this.renderHud([[t('hud.pump'), `${f.pump[i].toFixed(1)} nm`], [t('hud.period'), `${per.toFixed(3)} µm`]]);
    this.lab.setActiveLaser('cw', f.pump[i]);
    this.plot_adapt();
  }

  renderHud(pairs) {
    const hud = $('#hud');
    hud.replaceChildren(...pairs.flatMap(([k, v]) => [el('span', { class: 'k' }, k), el('b', {}, v)]));
    hud.hidden = false;
    if (!this.hudPlaced) { this.hudPlaced = true; this.updateBlockers(); }
  }

  // "Try it": the old interactive model of Fig. 2c (simulated drift and feedback, with a kick button)
  tryStart() {
    const seed = +(params.get('seed') || 11);
    const tr = new P.DriftTracker({ seed, lp0: 1.600 });
    const pre = this.firstMode === 'adapt' && params.has('steps') ? clamp(+params.get('steps') || 0, 0, 300) : 40;
    for (let i = 0; i < pre; i++) tr.step();
    // open with feedback OFF for a few seconds (what goes wrong), then switch it on (what the chip does)
    const userSet = this.firstMode === 'adapt' && params.has('steps');
    Object.assign(this.state, { tracker: tr, feedback: userSet, autoOnAt: userSet ? null : 8, elapsed: 0, playing: true, t: 0 });
    const ctr = $('#controls');
    this.fbBtn = el('button', { type: 'button', class: 'ctl toggle', onclick: () => { this.state.autoOnAt = null; this.setFeedback(!this.state.feedback); } });
    const kick = el('button', { type: 'button', class: 'ctl', onclick: () => {
      const tr2 = this.state.tracker;
      const amp = Math.min(0.0025, 0.75 * tr2.captureRange());
      tr2.step(amp * (Math.random() < 0.5 ? -1 : 1));
      this.tryApply(true);
    } });
    kick.dataset.i18n = 'adapt.kick';
    kick.textContent = t('adapt.kick');
    this.adaptPlay = el('button', { type: 'button', class: 'ctl', onclick: () => { this.state.playing = !this.state.playing; this.updateTryButtons(); } });
    ctr.append(this.fbBtn, kick, this.adaptPlay);
    this.setFeedback(this.state.feedback);
  }

  setFeedback(on) {
    this.state.feedback = on;
    this.lab.setFeedback(on);
    this.updateTryButtons();
    this.tryApply();
    this.renderModeTexts();
  }

  updateTryButtons() {
    if (this.fbBtn) { this.fbBtn.textContent = t(this.state.feedback ? 'adapt.fbOn' : 'adapt.fbOff'); this.fbBtn.setAttribute('aria-pressed', String(this.state.feedback)); }
    if (this.adaptPlay) this.adaptPlay.textContent = t(this.state.playing ? 'btn.pause' : 'btn.play');
  }

  tryApply(jumped) {
    if (this.mode !== 'adapt' || this.state.preset !== 'try' || !this.state.tracker) return;
    const tr = this.state.tracker, h = tr.history[tr.history.length - 1];
    const on = this.state.feedback;
    const period = on ? h.periodOn : h.periodOff, Pn = on ? h.Pon : h.Poff;
    this.showPattern(displayPattern([{ kind: 'uniform', w: 1, period }], { G: 40, ref: P.periodForPump(1.600) }));
    this.lab.setOutputLine(h.lp * 500, Pn);
    this.renderHud([[t('hud.pump'), `${(h.lp * 1000).toFixed(1)} nm`], [t('hud.drift'), '']]);
    this.lab.setActiveLaser('cw', h.lp * 1000);
    this.lab.drawPCScreen(tr.history.slice(-60).map(r => (on ? r.Pon : r.Poff)));
    if (jumped && on) this.lab.flash(this.lab.pcScreen, 0.6, 0.6);
    this.updateTryButtons();
    this.plot_adapt();
  }

  tick_adapt(dt) {
    const s = this.state;
    if (s.preset === 'track') { this.advance(dt, this.f2t ? this.f2t.tt.length : 0, PLAY.track, () => this.trackApply()); return; }
    if (s.preset !== 'try' || !s.tracker) return;
    s.elapsed += dt;
    if (s.autoOnAt !== null && s.elapsed > s.autoOnAt) { s.autoOnAt = null; this.setFeedback(true); }
    if (!s.playing) return;
    s.t += dt;
    if (s.t > 0.5) {
      s.t = 0;
      s.tracker.step();
      this.tryApply();
    }
  }

  plot_adapt() {
    const s = this.state, c = $('#plot');
    if (s.preset === 'try' && s.tracker) plots.drawAdapt(c, { hist: s.tracker.history, feedback: s.feedback, t });
    else if (s.preset === 'scan' && this.f2) plots.drawTuning(c, { periods: this.f2.periods, pump: this.f2.pump, eff: this.f2.eff, best: this.f2.best, fit: this.f2.fit, sel: s.i, t });
    else if (s.preset === 'track' && this.f2t) {
      const f = this.f2t;
      plots.drawTrack(c, { tt: f.tt, pump: f.pump, period: f.period, effOn: f.effOn, effOff: f.effOff, periodOff: f.periodOff, upto: s.i, t });
    }
  }

  exit_adapt() { this.lab.setFeedback(false); this.lab.drawPCScreen([]); this.fbBtn = this.adaptPlay = null; }

  // ---------------- spectral engineering (Fig. 3a, Fig. 3c, Fig. S30): measured spectra
  enter_colors() {
    const p0 = this.urlPreset('colors', DEFAULT.colors);
    this.lab.setPump({});
    this.lab.setOutputVisible(true);
    this.presetButtons(PRESETS.colors, p0, p => this.colorsPreset(p));
    this.colorsPreset(p0);
  }

  async colorsPreset(p) {
    this.state = { preset: p, i: 0, acc: 0, hold: 0, playing: true };
    this.word = null;
    this.markPreset(p);
    $('#controls').replaceChildren();
    this.players = [];
    this.renderModeTexts();
    if (p === 'cornell' || p === 'ntt') {
      const v = await this.fetchView('fig3c', d => [d[p].spec, d[p].patterns]);
      if (!v) return;
      const w = v.d[p], [spec, pats] = v.gs;
      const frames = Array.from({ length: spec.rows }, (_, k) => spec.row(k));
      this.word = { lam: Float64Array.from(w.lam_nm), lamUm: toUm(w.lam_nm), times: w.t_s, frames, pats, invert: !!w.invert_y,
        vmax: (w.view && w.view.clim && w.view.clim[1]) || Math.max(...frames.map(maxOf)) };
      const pl = this.player(frames.length, 0, i => { this.state.i = i; this.colorsApply(); }, { label: 'ctl.time' });
      pl.text = i => `${Math.round(w.t_s[i])} s`;
      this.seekFromUrl(frames.length);
      this.updatePlayers();
      this.colorsApply();
      return;
    }
    const v = await this.fetchView('fig3a', d => (p === 'tune' ? [d.tune.spectra, d.tune.patterns] : []));
    if (!v) return;
    const d = v.d;
    this.f3a = { lam: Float64Array.from(d.lam_nm), lamUm: toUm(d.lam_nm) };
    if (p === 'tune') {
      const tu = d.tune, [spec, pats] = v.gs;
      Object.assign(this.f3a, { tune: tu, spec, pats, ymax: Math.max(...Array.from({ length: spec.rows }, (_, k) => maxOf(spec.row(k)))) });
      this.state.i = tu.fig3a_index ?? 11;
      this.stepper(tu.periods_um.length, this.state.i, 'colors.period',
        i => `${tu.periods_um[i].toFixed(2)} µm → ${tu.peak_nm[i].toFixed(1)} nm`, i => { this.state.i = i; this.colorsApply(); });
    }
    this.colorsApply();
  }

  colorsApply() {
    const s = this.state, p = s.preset;
    if (this.mode !== 'colors') return;
    if (p === 'cornell' || p === 'ntt') {
      const w = this.word;
      if (!w) return;
      const S = w.frames[s.i], pat = w.pats.row(s.i), pm = maxOf(pat);
      // most stored patterns are dim (their amplitudes balance the strokes); each is drawn at full brightness
      this.showMeasuredPattern(pm > 0 ? pat.map(v => v / pm) : pat);
      this.lab.setOutputSpectrum(w.lamUm, S, clamp(maxOf(S) / (0.6 * w.vmax), 0, 1));
    } else if (p === 'tune') {
      const f = this.f3a;
      if (!f || !f.spec) return;
      this.showMeasuredPattern(f.pats.row(s.i));
      this.lab.setOutputSpectrum(f.lamUm, f.spec.row(s.i), clamp(0.15 + 0.85 * f.tune.rel_power[s.i], 0, 1));
    } else {
      const d = this.cur;
      if (!d || d.group !== 'fig3a') return;
      const parts = p === 'four' && d.four_parts ? D.rows(d.four_parts) : null;
      this.showMeasuredPattern(D.arr(d.patterns[p]), parts);
      this.lab.setOutputSpectrum(this.f3a.lamUm, D.arr(d.spectra[p]), 1);
    }
    this.plot_colors();
  }

  tick_colors(dt) {
    const p = this.state.preset;
    if ((p === 'cornell' || p === 'ntt') && this.word) this.advance(dt, this.word.frames.length, PLAY[p], () => this.colorsApply());
  }

  plot_colors() {
    const s = this.state, p = s.preset, c = $('#plot');
    if (p === 'cornell' || p === 'ntt') {
      const w = this.word;
      if (w) plots.drawSpectrogramM(c, { lam: w.lam, frames: w.frames, times: w.times, upto: s.i, vmax: w.vmax, invert: w.invert, t });
    } else if (p === 'tune') {
      const f = this.f3a;
      if (f && f.spec) plots.drawSpectrumM(c, { lam: f.lam, S: f.spec.row(s.i), ymax: f.ymax * 1.05, peaks: [{ nm: f.tune.peak_nm[s.i], v: maxOf(f.spec.row(s.i)) }], t });
    } else {
      const d = this.cur;
      if (!d || d.group !== 'fig3a' || !this.f3a) return;
      const S = D.arr(d.spectra[p]);
      plots.drawSpectrumM(c, { lam: this.f3a.lam, S, peaks: p === 'broad' ? [] : this.peaksOf(this.f3a.lam, S, 0.3), t });
    }
  }

  // local maxima above `frac` of the highest, at least 4 nm apart
  peaksOf(lam, S, frac) {
    const m = maxOf(S), out = [];
    for (let i = 2; i < S.length - 2; i++) {
      if (S[i] < frac * m || S[i] < S[i - 1] || S[i] < S[i + 1] || S[i] < S[i - 2] || S[i] < S[i + 2]) continue;
      if (out.length && lam[i] - out[out.length - 1].nm < 4) { if (S[i] > out[out.length - 1].v) out[out.length - 1] = { nm: lam[i], v: S[i] }; continue; }
      out.push({ nm: lam[i], v: S[i] });
    }
    return out.length <= 5 ? out : [];
  }

  exit_colors() { this.word = null; }

  // ---------------- training: in situ optimisation of the pattern (Fig. 3b, Fig. S27)
  enter_train() {
    const p0 = this.urlPreset('train', DEFAULT.train);
    this.lab.setPump({});
    this.lab.setOutputVisible(true);
    this.lab.setFeedback(true);
    this.presetButtons(PRESETS.train, p0, p => this.trainPreset(p));
    this.trainPreset(p0);
  }

  async trainPreset(p) {
    this.state = { preset: p, i: 0, acc: 0, hold: 0, playing: true };
    this.run = null;
    this.markPreset(p);
    $('#controls').replaceChildren();
    this.players = [];
    this.renderModeTexts();
    const v = await this.fetchView('fig3b', d => [d.runs[p].spectra, d.runs[p].patterns]);
    if (!v) return;
    const r = v.d.runs[p], [spec, pats] = v.gs;
    const target = D.arr(r.target), tsum = sumOf(target) || 1;
    // the axis follows the highest spectrum still to come, so it shrinks as the light spreads out
    // over the target band, and never cuts a spectrum off
    const ymax = new Float32Array(spec.rows);
    for (let k = spec.rows - 1, m = 0; k >= 0; k--) {
      const S = spec.row(k);
      m = Math.max(m, maxOf(S), maxOf(target) * sumOf(S) / tsum);
      ymax[k] = m;
    }
    this.run = { lam: Float64Array.from(v.d.lam_nm), lamUm: toUm(v.d.lam_nm), steps: r.steps, spec, pats, target, tsum,
      dist: D.arr(r.distance), n: r.n_states, ymax, marks: r.s27_steps || [] };
    const pl = this.player(r.steps.length, 0, i => { this.state.i = i; this.trainApply(); }, { label: 'ctl.step' });
    pl.text = i => `${r.steps[i]} / ${r.n_states - 1}`;
    this.seekFromUrl(r.steps.length);
    this.updatePlayers();
    this.trainApply();
  }

  trainApply() {
    const R = this.run;
    if (this.mode !== 'train' || !R) return;
    const k = this.state.i, S = R.spec.row(k);
    this.showMeasuredPattern(R.pats.row(k));
    this.lab.setOutputSpectrum(R.lamUm, S, 1);
    const step = R.steps[k], dmax = maxOf(R.dist);
    this.lab.drawPCScreen(Array.from(R.dist.subarray(0, step + 1)).filter((_, j, a) => a.length < 120 || j % Math.ceil(a.length / 120) === 0).map(v => clamp(v / dmax, 0, 1)));
    this.plot_train();
  }

  tick_train(dt) { if (this.run) this.advance(dt, this.run.steps.length, PLAY.train, () => this.trainApply()); }

  plot_train() {
    const R = this.run;
    if (!R) return;
    const k = this.state.i, S = R.spec.row(k), a = sumOf(S) / R.tsum;
    plots.drawTraining($('#plot'), { lam: R.lam, S, target: R.target.map(v => v * a), step: R.steps[k], nStates: R.n, dist: R.dist, ymax: R.ymax[k] * 1.08, marks: R.marks, t });
  }

  exit_train() { this.run = null; this.lab.setFeedback(false); this.lab.drawPCScreen([]); }

  // ---------------- spatial engineering (Fig. 4, Figs S34-S37)
  enter_spatial() {
    const p0 = this.urlPreset('spatial', DEFAULT.spatial);
    this.lab.setPump({});
    this.lab.setOutputVisible(true);
    this.presetButtons(PRESETS.spatial, p0, p => this.spatialPreset(p));
    this.spatialPreset(p0);
  }

  async spatialPreset(p) {
    this.state = { preset: p, i: 0 };
    this.sp = null;
    this.lab.setSheet(null); this.lab.drawCamera(null);
    this.markPreset(p);
    $('#controls').replaceChildren();
    this.renderModeTexts();
    this.renderLegend();
    const v = await this.fetchView('fig4', d => { const q = d.presets[p]; return [q.profile, q.sim, q.prop, q.zoom, q.chip]; });
    if (!v) return;
    const q = v.d.presets[p], [prof, sim, prop, zoom, chip] = v.gs;
    const n = (q.param && q.param.values && q.param.values.length) || prof.rows;
    this.sp = { q, n, x: Float64Array.from(q.x_um || v.d.x_um), prof, sim, prop, zoom, chip };
    this.state.i = clamp(q.main ?? 0, 0, n - 1);
    // test hook: ?at=N opens the first view's slider at setting N
    if (this.firstMode === 'spatial' && params.has('at') && !this.usedUrlAt) { this.usedUrlAt = true; this.state.i = clamp(Math.round(+params.get('at')) || 0, 0, n - 1); }
    if (n > 1) {
      const vals = q.param.values, unit = q.param.unit || '', vmax = Math.max(...vals.map(Math.abs));
      const e = vmax > 0 && vmax < 1e-3 ? Math.floor(Math.log10(vmax)) : null;
      const fmt = q.param.labels ? i => q.param.labels[i] : i => fmtVal(vals[i], unit, e);
      this.stepper(n, this.state.i, `param.${p}`, fmt, i => { this.state.i = i; this.spatialApply(); });
    }
    this.spatialApply();
  }

  // a sprite holds one cell per setting, stacked vertically (or a single cell shared by all settings)
  cells(gr, n) { return gr && n > 1 && gr.rows % n === 0 ? n : 1; }

  // the simulated light inside the chip as an opacity map: sqrt of the intensity (as Fig. 4b draws it),
  // so that the weaker parts of the beam stay visible on the chip
  glowOf(gr) {
    if (gr.glow) return gr.glow;
    const c = document.createElement('canvas');
    c.width = gr.cols; c.height = gr.rows;
    const g = c.getContext('2d'), img = g.createImageData(gr.cols, gr.rows), d = img.data;
    for (let i = 0; i < gr.v.length; i++) {
      const a = Math.round(255 * Math.sqrt(clamp(gr.v[i], 0, 1)));
      d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = a; d[4 * i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (gr.glow = c);
  }

  cellOf(gr, i, n) {
    if (!gr) return null;
    const k = this.cells(gr, n), rows = gr.rows / k, j = k > 1 ? i : 0;
    return { v: gr.v.subarray(j * rows * gr.cols, (j + 1) * rows * gr.cols), rows, cols: gr.cols };
  }

  spatialApply() {
    const S = this.sp;
    if (this.mode !== 'spatial' || !S) return;
    const i = this.state.i, q = S.q;
    $('#stripwrap').hidden = !S.chip;
    if (S.chip) { const k = this.cells(S.chip, S.n); this.showPattern2D(S.chip, k > 1 ? i : 0, k); }
    else { this.lab.setPattern(new Float32Array(NPAT), { fade: 0 }); this.lastStrip = null; }   // no pattern stored (Fig. S34)
    if (S.prop) {
      const pa = q.prop_axes || {}, k = this.cells(S.prop, S.n);
      const uA = pa.pattern_end_cm != null && pa.z_cm ? (pa.pattern_end_cm - pa.z_cm[0]) / (pa.z_cm[1] - pa.z_cm[0]) : 0.459;
      // the simulation is in the frame of Fig. 4b, mirrored with respect to the pattern's rows
      // the Fig. 4b model frame is mirrored with respect to the pattern's rows; the steering model is not (flip false)
      this.lab.setSheet(this.glowOf(S.prop), { cell: k > 1 ? i : 0, cells: k, uA, x_um: pa.x_um || [-300, 300], flip: pa.flip ?? true });
    } else this.lab.setSheet(null);
    // a setting that was only simulated: the camera shows the simulated output
    this.lab.drawCamera({ x: S.x, I: (this.measuredAt(i) ? S.prof : S.sim).row(i), nm: 790 });
    this.lab.setOutputLine(790, 1);
    if (q.in_paper || q.measured) { this.renderBadge(); this.renderPaper(); }
    this.plot_spatial();
  }

  plot_spatial() {
    const S = this.sp;
    if (!S) return;
    const i = this.state.i, q = S.q;
    plots.drawSpatial($('#plot'), {
      zoom: this.cellOf(S.zoom, i, S.n), zoomAxes: q.zoom_axes, prop: this.cellOf(S.prop, i, S.n), propAxes: q.prop_axes,
      x: S.x, prof: this.measuredAt(i) ? S.prof.row(i) : null, sim: S.sim ? S.sim.row(i) : null, patternTag: q.model || !this.measuredAt(i) ? 'plot.pattern.model' : null, unit: /^nW/.test(q.profile_unit || 'nW') ? 'nW/µm' : t('plot.norm'), t,
      fixedMax: /^nW/.test(q.profile_unit || 'nW') ? null : 1,      // normalised series (Fig. S34): one 0-1 axis for all angles
    });
  }

  measuredAt(i) { const m = this.sp && this.sp.q.measured; return !m || !!m[i]; }

  exit_spatial() { this.sp = null; this.lab.setSheet(null); $('#stripwrap').hidden = false; }

  // ---------------- spatio-spectral engineering (Fig. 5, Fig. S40)
  enter_spatiospec() {
    const p0 = this.urlPreset('spatiospec', DEFAULT.spatiospec);
    this.lab.setPump({});
    this.lab.setOutputVisible(true);
    this.presetButtons(PRESETS.spatiospec, p0, p => this.spatiospecPreset(p));
    this.spatiospecPreset(p0);
  }

  async spatiospecPreset(p) {
    this.state = { preset: p };
    this.ss = null;
    this.lab.setSurface(null);
    this.markPreset(p);
    $('#controls').replaceChildren();
    this.renderModeTexts();
    const v = await this.fetchView('fig5', d => { const q = d.presets[p]; return [q.map, q.chip]; });
    if (!v) return;
    const q = v.d.presets[p], [map, chip] = v.gs;
    const M = { v: map.v, nx: map.rows, nl: map.cols };
    const lam = Float64Array.from(q.lam_nm), x = Float64Array.from(q.x_um);
    const hi = q.slices_hires;
    const sliceX = hi ? Float64Array.from({ length: hi.n }, (_, k) => hi.x_um[0] + (hi.x_um[1] - hi.x_um[0]) * k / (hi.n - 1)) : null;
    this.ss = { q, M, lam, x, slices: hi ? D.rows(hi.data) : D.rows(q.slices), sliceX, chip };
    // the spectrometer fan shows the spectrum summed over position; its screen shows the full picture
    const spec = new Float64Array(M.nl);
    for (let r = 0; r < M.nx; r++) for (let c = 0; c < M.nl; c++) spec[c] += Math.max(0, M.v[r * M.nl + c]);
    this.lab.setOutputSpectrum(toUm(lam), spec, 1);
    this.lab.drawSpecMap(M, lam);
    this.lab.setSurface(M, lam, x);
    if (chip) this.showPattern2D(chip, 0, 1);
    this.plot_spatiospec();
  }

  plot_spatiospec() {
    const S = this.ss;
    if (!S) return;
    plots.drawHyper($('#plot'), { lam: S.lam, x: S.x, map: S.M, slicesNm: S.q.slices_nm, slices: S.slices, sliceX: S.sliceX, unit: 'nW/µm/nm', t });
  }

  exit_spatiospec() { this.ss = null; }

  // ---------------- quantum (proposed; model)
  enter_quantum() {
    const p0 = this.urlPreset('quantum', DEFAULT.quantum);
    this.state = { preset: p0, acc: 0, qperiod: +(P.LAMBDA_DEG - 0.03).toFixed(3) };
    this.lab.setPump({ quantum: true, rgb: shRGB(780) });
    this.lab.coincidences = 0; this.lab.updateCounter();
    if (!this.cache.qref) {
      const q = P.jsa(P.QUANTUM_PRESETS.twins());
      let peakI = 0, margMax = 0;
      for (let a = 0; a < q.N; a++) {
        let m = 0;
        for (let b = 0; b < q.N; b++) { const v = q.re[a * q.N + b] ** 2 + q.im[a * q.N + b] ** 2; m += v; if (v > peakI) peakI = v; }
        margMax = Math.max(margMax, m);
      }
      this.cache.qref = { jsa: q, norm: q.norm, peakI, margMax };
      this.cache.q_twins = q;
    }
    this.presetButtons(PRESETS.quantum, p0, p => this.quantumPreset(p));
    this.quantumPreset(p0);
  }

  quantumPreset(p) {
    this.state.preset = p;
    this.markPreset(p);
    const ctr = $('#controls');
    ctr.replaceChildren();
    this.qOut = null;
    if (p === 'tuneq') {
      const out = el('output', { class: 'val' });
      const lab = el('label', { class: 'slider' }, el('span', { 'data-i18n': 'colors.period' }), out);
      const [lo, hi] = P.QTUNE_RANGE;
      const r = el('input', { type: 'range', min: lo.toFixed(3), max: hi.toFixed(3), step: '0.002', value: String(this.state.qperiod), 'data-i18n-aria': 'colors.period', 'aria-label': t('colors.period') });
      const update = throttle(() => { if (this.mode === 'quantum' && this.state.preset === 'tuneq') this.quantumCompute(); }, 60);
      r.addEventListener('input', () => { this.state.qperiod = +r.value; update(); });
      ctr.append(lab, r);
      this.qOut = out;
    }
    this.quantumCompute();
  }

  quantumPattern() {
    const p = this.state.preset;
    return p === 'tuneq' ? [{ kind: 'uniform', w: 1, period: this.state.qperiod }] : P.QUANTUM_PRESETS[p]();
  }

  quantumCompute() {
    const p = this.state.preset;
    const key = p === 'tuneq' ? 'qt' + this.state.qperiod.toFixed(3) : 'q_' + p;
    let q = this.cache[key];
    if (!q) {
      q = this.cache[key] = P.jsa(this.quantumPattern());
      if (p === 'tuneq') {                       // keep only the last few slider positions
        this.qKeys = (this.qKeys || []).concat(key);
        while (this.qKeys.length > 12) delete this.cache[this.qKeys.shift()];
      }
    }
    this.state.jsa = q;
    this.state.rate = q.norm / this.cache.qref.norm;
    this.lab.setPairRate(this.state.rate);
    if (this.qOut) {
      const d = this.state.qperiod - P.LAMBDA_DEG;
      this.qOut.textContent = `${this.state.qperiod.toFixed(3)} µm (${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(3)} µm)`;
    }
    this.showPattern(displayPattern(this.quantumPattern(), { G: 25, ref: P.LAMBDA_DEG }));
    this.lab.coincidences = 0; this.lab.updateCounter();
    this.renderModeTexts();
    this.plot_quantum();
  }

  tick_quantum(dt) {
    if (this.lab.reduced) return;
    this.state.acc += dt * 1.8 * Math.min(1.5, this.state.rate || 0);
    while (this.state.acc > 1) { this.state.acc -= 1 + Math.random() * 0.6; this.lab.emitPair(); }
  }

  plot_quantum() { plots.drawJSI($('#plot'), { jsa: this.state.jsa, ref: this.cache.qref, t }); }

  exit_quantum() {
    this.lab.setPump({});
    this.lab.setPairRate(1);
  }

  // ------------------------------------------------------------------ kiosk, layout, input, loop
  setupKiosk() {
    document.documentElement.classList.add('kiosk');
    for (const a of document.querySelectorAll('.foot a')) { a.removeAttribute('href'); a.removeAttribute('target'); }
    window.addEventListener('contextmenu', e => e.preventDefault());
    const lock = async () => { try { if (navigator.wakeLock && document.visibilityState === 'visible') this.wake = await navigator.wakeLock.request('screen'); } catch { /* not available */ } };
    lock();
    document.addEventListener('visibilitychange', lock);
  }

  resetForNextVisitor() {
    this.lab.select(null);
    if ($('#figview').open) $('#figview').close();
    if (getLang() !== KIOSK_LANG) { setLang(KIOSK_LANG); this.lab.refreshLabels(); }
    this.lab.setLabelsVisible(true);
    $('#btn-labels').setAttribute('aria-pressed', 'true');
    const m = this.mode;
    this.mode = null;
    if (m) { const f = this['exit_' + m]; if (f) f.call(this); }
    this.setMode('overview');
    if (params.get('motion') !== 'reduce') this.setMotion(true);
    this.refreshTexts();
    $('#panel').scrollTop = 0;
    this.lab.controls.autoRotate = !this.lab.reduced;
    this.lab.controls.autoRotateSpeed = 0.5;
    this.idleReset = true;
  }

  setupNarrowLayout() {
    // the portrait block in app.css, plus short landscape screens where the legend would cover the view
    const mq = matchMedia('(max-width: 900px) and (orientation: portrait), (max-width: 600px), (max-height: 500px)');
    const place = () => {
      const lg = $('#legend');
      if (mq.matches) $('#legend-slot').append(lg); else $('#stage').append(lg);
      this.updateBlockers();
    };
    mq.addEventListener('change', place);
    place();
  }

  onInput() {
    this.lastInput = performance.now();
    if (this.idleReset) { this.idleReset = false; this.lab.controls.autoRotate = false; }
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if ($('#figview').open) return;
    const k = (e.key || '').toLowerCase();
    if (k >= '1' && k <= String(MODES.length)) this.setMode(MODES[+k - 1]);
    else if (k === 'r') this.lab.flyTo(this.mode);
    else if (k === 'l') $('#btn-labels').click();
    else if (k === 'e') this.toggleExplode();
    else if (k === 'escape') this.lab.select(null);
  }

  loop() {
    let last = performance.now(), errors = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      try {
        const f = this['tick_' + this.mode];
        if (f) f.call(this, dt);
        if (KIOSK && !this.idleReset && now - this.lastInput > 90000) this.resetForNextVisitor();
        this.lab.update(dt);
        this.lab.render();
        if (params.has('debug')) {
          this.frames = (this.frames || 0) + 1;
          document.body.dataset.frames = this.frames;
          document.body.dataset.simtime = this.lab.time.toFixed(2);
        }
      } catch (err) {
        errors++;
        window.dispatchEvent(new ErrorEvent('error', { message: String(err && err.stack || err) }));
        if (KIOSK && errors > 5) location.reload();
      }
    };
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { this.redrawPlot(); this.drawStrip(); this.updateBlockers(); });
  }
}
