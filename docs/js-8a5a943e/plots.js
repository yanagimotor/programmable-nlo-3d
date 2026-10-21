// 2D plots for the side panel (Canvas 2D, HiDPI-aware).  Colours and the booth font scale come from
// CSS variables (--text, --muted, --grid, --plot-bg, --plot-scale).
import { shRGB, css, PAL, hex } from './colours.js';

const FONT = '"Segoe UI", "Yu Gothic UI", Meiryo, system-ui, sans-serif';

function prep(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 360, h = canvas.clientHeight || 220;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const st = getComputedStyle(document.documentElement);
  const v = (k, d) => st.getPropertyValue(k).trim() || d;
  const col = { text: v('--text', '#e8edf2'), muted: v('--muted', '#9aa6b2'), grid: v('--grid', '#26303c'), bg: v('--plot-bg', '#0e141b') };
  const scale = parseFloat(v('--plot-scale', '1')) || 1;
  const f = (px, weight = '') => `${weight} ${Math.round(px * scale)}px ${FONT}`.trim();
  g.fillStyle = col.bg; g.fillRect(0, 0, w, h);
  return { g, w, h, col, f, s: scale };
}

function ticksX(g, box, col, f, { xmin, xmax, xticks }) {
  g.strokeStyle = col.grid; g.lineWidth = 1; g.font = f(11); g.fillStyle = col.muted;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const t of xticks) {
    const px = box.x + (t - xmin) / (xmax - xmin) * box.w;
    g.beginPath(); g.moveTo(px + 0.5, box.y); g.lineTo(px + 0.5, box.y + box.h); g.stroke();
    g.fillText(String(t), px, box.y + box.h + 4);
  }
}

function ticksY(g, box, col, f, { ymin, ymax, yticks, yfmt = v => v, flip = false, lines = true }) {
  g.strokeStyle = col.grid; g.lineWidth = 1; g.font = f(11); g.fillStyle = col.muted;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const t of yticks) {
    const u = (t - ymin) / (ymax - ymin), py = flip ? box.y + u * box.h : box.y + box.h - u * box.h;
    if (lines) { g.beginPath(); g.moveTo(box.x, py + 0.5); g.lineTo(box.x + box.w, py + 0.5); g.stroke(); }
    g.fillText(yfmt(t), box.x - 5, py);
  }
}

function label(g, col, f, text, x, y, align = 'center', base = 'bottom', color) {
  g.font = f(11); g.fillStyle = color || col.muted; g.textAlign = align; g.textBaseline = base;
  g.fillText(text, x, y);
}

function vlabel(g, col, f, text, x, y) {
  g.save(); g.translate(x, y); g.rotate(-Math.PI / 2);
  g.font = f(11); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 0, 0); g.restore();
}

// ---------------------------------------------------------------- spectrum (Colours)
// `ref`: if given, intensities are relative to it (fixed axis, used by "Tune"); otherwise to the
// spectrum's own maximum.  `E`: optional pump envelope (0..1) drawn dashed.
export function drawSpectrum(canvas, { lam, S, E = null, ref = null, peaks = [], t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const top = 24 * s;                      // header row above the axes: legend + "simulation" tag
  const box = { x: 44 * s, y: top, w: w - 56 * s, h: h - top - 40 * s };
  const xmin = 740, xmax = 820;
  let max = 0;
  for (const v of S) max = Math.max(max, v);
  const norm = ref || max || 1, ymax = ref ? 1.05 : 1.08;
  ticksX(g, box, col, f, { xmin, xmax, xticks: [740, 760, 780, 800, 820] });
  ticksY(g, box, col, f, { ymin: 0, ymax, yticks: [0, 0.5, 1], yfmt: v => v.toFixed(1) });
  label(g, col, f, t('plot.wl'), box.x + box.w / 2, h - 2);
  vlabel(g, col, f, t(ref ? 'plot.intrel' : 'plot.int'), 10 * s, box.y + box.h / 2);
  const X = nm => box.x + (nm - xmin) / (xmax - xmin) * box.w;
  const Y = v => box.y + box.h - Math.min(v, ymax) / ymax * box.h;
  for (let px = 0; px < box.w; px++) {
    g.fillStyle = css(shRGB(xmin + (xmax - xmin) * px / box.w), 0.9);
    g.fillRect(box.x + px, box.y + box.h + 1, 1.2, 3);
  }
  const n = lam.length;
  if (E) {
    g.strokeStyle = col.muted; g.setLineDash([3, 4]); g.lineWidth = 1.2; g.beginPath();
    let st = false;
    for (let i = 0; i < n; i++) {
      const nm = lam[i] * 1000;
      if (nm < xmin || nm > xmax) continue;
      const px = X(nm), py = Y(E[i]);
      if (!st) { g.moveTo(px, py); st = true; } else g.lineTo(px, py);
    }
    g.stroke(); g.setLineDash([]);
  }
  if (max > 0) {
    for (let i = 0; i < n - 1; i++) {
      const nm = lam[i] * 1000, nm2 = lam[i + 1] * 1000;
      if (nm < xmin || nm2 > xmax) continue;
      g.fillStyle = css(shRGB(nm), 0.6);
      g.beginPath();
      g.moveTo(X(nm), Y(0)); g.lineTo(X(nm), Y(S[i] / norm)); g.lineTo(X(nm2), Y(S[i + 1] / norm)); g.lineTo(X(nm2), Y(0));
      g.fill();
    }
    g.strokeStyle = col.text; g.lineWidth = 1.5; g.beginPath();
    let st = false;
    for (let i = 0; i < n; i++) {
      const nm = lam[i] * 1000;
      if (nm < xmin || nm > xmax) continue;
      const px = X(nm), py = Y(S[i] / norm);
      if (!st) { g.moveTo(px, py); st = true; } else g.lineTo(px, py);
    }
    g.stroke();
    g.font = f(11, 600); g.fillStyle = col.text; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const p of peaks) {
      const nm = p.lambda * 1000;
      if (nm < xmin + 3 || nm > xmax - 3) continue;
      g.fillText(nm.toFixed(0), X(nm), Math.max(box.y + 10 * s, Y(p.height * max / norm) - 3));
    }
  }
  label(g, col, f, t('plot.sim'), box.x + box.w, box.y - 6, 'right', 'bottom');
  if (E) {
    g.strokeStyle = col.muted; g.setLineDash([3, 4]); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(box.x, box.y - 11 * s); g.lineTo(box.x + 18 * s, box.y - 11 * s); g.stroke(); g.setLineDash([]);
    label(g, col, f, t('plot.pumpenv'), box.x + 24 * s, box.y - 6, 'left', 'bottom');
  }
}

// ---------------------------------------------------------------- spectrogram (words: SI Fig. S30, Nature Fig. 3c)
// columns: Array of Float64Array spectra (one per time step; may be sparse), lam in µm.  Each column is
// scaled to its own maximum v and painted one pixel row at a time with opacity 1 - (1 - v)^4.8: a
// deliberate boost so that the ripple along the broadband bars does not break them up.  v < 0.12 is
// not drawn: the side lobes of a single grating reach 0.10 and would show as faint echo strokes.
// flip: shorter wavelengths at the top, as in Nature Fig. 3c.
const SG_CUT = 0.12, SG_BOOST = 4.8;
const hexRGB = (str, d) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(str).trim());
  return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : d;
};
export function drawSpectrogram(canvas, { lam, columns, total, t, flip = false, xlabel = 'plot.timelapse' }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const top = 24 * s;                          // header row for the "simulation" tag
  const box = { x: 44 * s, y: top, w: w - 56 * s, h: h - top - 40 * s };
  const ymin = 750, ymax = 810, yticks = flip ? [760, 780, 800] : [750, 770, 790, 810];
  // the inside of the box as an image: background, grid rows, then every column blended on top
  const dpr = canvas.width / w;
  const X0 = Math.round(box.x * dpr), Y0 = Math.round(box.y * dpr);
  const W = Math.max(1, Math.round(box.w * dpr)), H = Math.max(1, Math.round(box.h * dpr));
  const img = g.createImageData(W, H), d = img.data;
  const bg = hexRGB(col.bg, [13, 19, 26]), gr = hexRGB(col.grid, [38, 48, 60]);
  const gridRows = new Set(yticks.map(v => {
    const u = (v - ymin) / (ymax - ymin);
    return Math.min(H - 1, Math.round((flip ? u : 1 - u) * H));
  }));
  const rowNm = new Float64Array(H), rowRGB = [];
  for (let y = 0; y < H; y++) {
    const u = (y + 0.5) / H, c = gridRows.has(y) ? gr : bg;
    rowNm[y] = flip ? ymin + u * (ymax - ymin) : ymax - u * (ymax - ymin);
    rowRGB.push(shRGB(rowNm[y]).map(v => v * 255));
    for (let x = 0; x < W; x++) { const k = 4 * (y * W + x); d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; }
  }
  const l0 = lam[0] * 1000, dl = (lam[1] - lam[0]) * 1000;
  columns.forEach((spec, c) => {
    if (!spec) return;
    let max = 0;
    for (const v of spec) if (v > max) max = v;
    if (max <= 0) return;
    const xa = Math.floor(c * W / total), xb = Math.min(W, Math.max(xa + 1, Math.floor((c + 1) * W / total)));
    for (let y = 0; y < H; y++) {
      const fi = (rowNm[y] - l0) / dl, i = Math.floor(fi);
      if (i < 0 || i + 1 >= spec.length) continue;
      const v = (spec[i] + (spec[i + 1] - spec[i]) * (fi - i)) / max;
      if (v < SG_CUT) continue;
      const a = 1 - Math.pow(1 - Math.min(1, v), SG_BOOST), rgb = rowRGB[y];
      for (let x = xa; x < xb; x++) {
        const k = 4 * (y * W + x);
        d[k] += (rgb[0] - d[k]) * a; d[k + 1] += (rgb[1] - d[k + 1]) * a; d[k + 2] += (rgb[2] - d[k + 2]) * a;
      }
    }
  });
  g.putImageData(img, X0, Y0);
  ticksY(g, box, col, f, { ymin, ymax, yticks, flip, lines: false });
  vlabel(g, col, f, t('plot.wlshort'), 10 * s, box.y + box.h / 2);
  label(g, col, f, t(xlabel), box.x + box.w / 2, h - 2);
  label(g, col, f, t('plot.sim'), box.x + box.w, box.y - 6, 'right', 'bottom');
  g.strokeStyle = col.grid; g.lineWidth = 1; g.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
}

// ---------------------------------------------------------------- adapt: three stacked traces
export function drawAdapt(canvas, { hist, feedback, t, window = 150 }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const H = hist.slice(-window);
  const n = H.length;
  const x0 = 50 * s, x1 = w - 10, panels = 3, gap = 6, top = 4, bottom = 18 * s, head = 15 * s;
  const ph = (h - top - bottom - (gap + head) * panels) / panels;
  const X = i => x0 + (x1 - x0) * (n > 1 ? i / (n - 1) : 0);
  const onCol = '#4ea3ff', offCol = '#9aa6b2';
  const series = [
    { f: r => r.lp * 1000, label: t('plot.pump'), color: hex(PAL.pump), digits: 1, pad: 1.5 },
    { f: r => r.periodOn, g2: r => r.periodOff, label: t('plot.period'), color: hex(PAL.green), digits: 3, pad: 0.004 },
    { f: r => r.Pon, g2: r => r.Poff, label: t('plot.eff'), color: onCol, digits: 1, fixed: [-0.05, 1.12] },
  ];
  series.forEach((sr, k) => {
    const y0 = top + k * (ph + gap + head) + head;
    let lo = Infinity, hi = -Infinity;
    for (const r of H) for (const fn of [sr.f, sr.g2]) { if (!fn) continue; const v = fn(r); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (sr.fixed) [lo, hi] = sr.fixed;
    else { const c = 0.5 * (lo + hi), half = Math.max((hi - lo) / 2 * 1.15, sr.pad); lo = c - half; hi = c + half; }
    const Y = v => y0 + ph - (v - lo) / (hi - lo) * ph;
    g.font = f(11, 600); g.fillStyle = col.text; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(sr.label, x0, y0 - 2);
    g.strokeStyle = col.grid; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, ph);
    g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    if (sr.fixed) { g.fillText('1', x0 - 4, Y(1)); g.fillText('0', x0 - 4, Y(0)); }
    else { g.fillText(hi.toFixed(sr.digits), x0 - 4, y0 + 6); g.fillText(lo.toFixed(sr.digits), x0 - 4, y0 + ph - 6); }
    const line = (fn, color, width, dash, alpha) => {
      if (n < 2) return;
      g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.beginPath();
      H.forEach((r, i) => { const px = X(i), py = Y(fn(r)); i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    };
    if (sr.g2) {
      line(sr.g2, offCol, feedback ? 1.2 : 2.2, [4, 3], feedback ? 0.55 : 1);
      line(sr.f, sr.color, feedback ? 2.4 : 1.4, null, feedback ? 1 : 0.45);
    } else line(sr.f, sr.color, 2, null, 1);
    if (k === 0) {
      g.fillStyle = col.text;
      H.forEach((r, i) => { if (r.jump) { const px = X(i); g.beginPath(); g.moveTo(px, y0 + 1); g.lineTo(px - 4, y0 - 5); g.lineTo(px + 4, y0 - 5); g.fill(); } });
    }
    if (k === 2) {
      const lx = x1 - 4;
      g.font = f(10); g.textBaseline = 'bottom'; g.textAlign = 'right';
      const t2 = t('plot.without'), t1 = t('plot.with');
      const w2 = g.measureText(t2).width;
      g.fillStyle = offCol; g.fillText(t2, lx, y0 - 2);
      g.strokeStyle = offCol; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(lx - w2 - 22, y0 - 7); g.lineTo(lx - w2 - 6, y0 - 7); g.stroke(); g.setLineDash([]);
      const xx = lx - w2 - 30;
      g.fillStyle = onCol; g.fillText(t1, xx, y0 - 2);
      const w1 = g.measureText(t1).width;
      g.strokeStyle = onCol; g.lineWidth = 2.2; g.beginPath(); g.moveTo(xx - w1 - 22, y0 - 7); g.lineTo(xx - w1 - 6, y0 - 7); g.stroke();
    }
  });
  label(g, col, f, t('plot.time'), (x0 + x1) / 2, h - 2);
  label(g, col, f, t('plot.sim'), x1, top + head - 2, 'right', 'bottom');
}

// ---------------------------------------------------------------- quantum: joint spectral intensity
function heat(v) {                      // black -> deep red -> orange -> pale yellow
  const s = [[0, 0, 0, 0], [0.25, 90, 10, 20], [0.5, 200, 40, 30], [0.75, 255, 150, 40], [1, 255, 240, 190]];
  for (let i = 1; i < s.length; i++) if (v <= s[i][0]) {
    const f = (v - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
    return [0, 1, 2].map(k => Math.round(s[i - 1][k + 1] + f * (s[i][k + 1] - s[i - 1][k + 1])));
  }
  return [255, 240, 190];
}

// everything is scaled to the reference preset (twin photons), so "switch off" really goes dark
export function drawJSI(canvas, { jsa, ref, t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const side = Math.min(h - 68 * s, w - 150 * s);
  const box = { x: 44 * s, y: 30 * s, w: side, h: side };
  const N = jsa.N;
  const I = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) I[i] = jsa.re[i] ** 2 + jsa.im[i] ** 2;
  const scale = ref.peakI;
  const T = new Float64Array(N * N);                     // 3x3 max filter: the band is ~1 px wide
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    let m = 0;
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const aa = a + da, bb = b + db;
      if (aa >= 0 && bb >= 0 && aa < N && bb < N) m = Math.max(m, I[aa * N + bb] * (da || db ? 0.8 : 1));
    }
    T[a * N + b] = m;
  }
  const img = g.createImageData(N, N);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const c = heat(Math.min(1, Math.pow(T[a * N + b] / scale, 0.7)));
    const k = 4 * (b * N + (N - 1 - a));
    img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
  }
  const off = document.createElement('canvas'); off.width = N; off.height = N;
  off.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(off, box.x, box.y, box.w, box.h);
  g.strokeStyle = col.grid; g.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
  const marg = new Float64Array(N);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) marg[a] += I[a * N + b];
  g.fillStyle = 'rgba(255,106,77,0.35)'; g.strokeStyle = '#ff6a4d'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(box.x, box.y - 2);
  for (let a = N - 1; a >= 0; a--) g.lineTo(box.x + (N - 1 - a) / (N - 1) * box.w, box.y - 2 - 20 * s * Math.min(1, marg[a] / ref.margMax));
  g.lineTo(box.x + box.w, box.y - 2); g.closePath(); g.fill(); g.stroke();
  const lmin = jsa.lam[N - 1] * 1000, lmax = jsa.lam[0] * 1000;
  const toPix = nm => (1 / nm - 1 / lmax) / (1 / lmin - 1 / lmax);
  g.font = f(10); g.fillStyle = col.muted;
  for (const nm of [1400, 1500, 1600, 1700]) {
    const fx = 1 - toPix(nm);
    g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(nm, box.x + fx * box.w, box.y + box.h + 3);
    g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(nm, box.x - 3, box.y + box.h - fx * box.h);
  }
  label(g, col, f, t('plot.sigA'), box.x + box.w / 2, h - 2);
  vlabel(g, col, f, t('plot.sigB'), 10 * s, box.y + box.h / 2);
  const bx = box.x + box.w + 16 * s, bw = w - bx - 8;
  const wrap = (text, x, y, maxw, lh) => {
    const parts = text.includes(' ') ? text.split(/(\s+)/) : [...text];
    let line = '', yy = y;
    for (const p of parts) {
      if (g.measureText(line + p).width > maxw && line.trim()) { g.fillText(line.trim(), x, yy); line = p.trimStart(); yy += lh; }
      else line += p;
    }
    if (line.trim()) g.fillText(line.trim(), x, yy);
    return yy + lh;
  };
  const rate = ref.norm > 0 ? jsa.norm / ref.norm : 0;
  g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = col.text; g.font = f(11, 600);
  let y = wrap(t('plot.rate'), bx, box.y, bw, 14 * s);
  g.fillStyle = col.grid; g.fillRect(bx, y + 2, bw, 10 * s);
  g.fillStyle = '#ff6a4d'; g.fillRect(bx, y + 2, bw * Math.min(1, rate), 10 * s);
  g.fillStyle = col.muted; g.font = f(10);
  g.fillText((rate * 100).toFixed(rate < 0.1 ? 1 : 0) + ' %', bx, y + 6 + 10 * s);
  y += 34 * s;
  g.fillStyle = col.text; g.font = f(11, 600);
  y = wrap(t('plot.K'), bx, y, bw, 14 * s);
  g.font = f(22, 600); g.fillStyle = '#ffb36b';
  g.fillText(rate < 0.05 ? '—' : jsa.schmidt.toFixed(0), bx, y + 2);
  g.fillStyle = col.muted; g.font = f(10);
  wrap(t('plot.Knote'), bx, y + 30 * s, bw, 12 * s);
  label(g, col, f, t('plot.sim'), bx, box.y + box.h, 'left', 'bottom');
}

// ---------------------------------------------------------------- how it works: cross-section (Fig. 1b)
export function drawCrossSection(canvas, { step, t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const x0 = 46 * s, x1 = w - 118 * s, ytop = 40 * s;
  const avail = h - ytop - 10;
  const rel = [0.03, 0.30, 0.10, 0.13, 0.10, 0.24];
  // as in the 3D chip (colours.js), the photoconductor a little lighter so that it reads on the dark panel
  const cols = ['#a9b0a8', '#8a7444', '#e6eaee', '#aebccb', '#e6eaee', '#4b5159'];
  const keys = ['ito', 'pc', 'sio2', 'sin', 'sio2', 'si'];
  const layers = [];
  let y = ytop;
  rel.forEach((r, i) => { const hh = Math.max(3, r * avail); layers.push({ y, hh, c: cols[i], k: keys[i] }); y += hh; });
  const n = 6, sw = (x1 - x0) / (2 * n);
  const lit = [];
  for (let i = 0; i < n; i++) lit.push(x0 + sw * (2 * i + 0.5));
  for (const L of layers) { g.fillStyle = L.c; g.fillRect(x0, L.y, x1 - x0, L.hh); }
  const pc = layers[1], core = layers[3];
  if (step >= 2) for (const x of lit) { g.fillStyle = hex(PAL.pcOn); g.fillRect(x, pc.y, sw, pc.hh); }
  if (step >= 4) for (const x of lit) { g.fillStyle = hex(PAL.chi2); g.fillRect(x, core.y + 2, sw, core.hh - 4); }
  if (step >= 1) for (const x of lit) {
    const grd = g.createLinearGradient(0, 4, 0, ytop);
    grd.addColorStop(0, 'rgba(30,255,70,0)'); grd.addColorStop(1, 'rgba(30,255,70,0.85)');
    g.fillStyle = grd; g.beginPath();
    g.moveTo(x + sw / 2 - 4, 4); g.lineTo(x + sw / 2 + 4, 4); g.lineTo(x + sw, ytop); g.lineTo(x, ytop); g.fill();
  }
  if (step >= 3) {
    g.strokeStyle = '#e6ecff'; g.fillStyle = '#e6ecff'; g.lineWidth = 2;
    g.globalAlpha = step >= 4 ? 0.5 : 1;
    for (const x of lit) {
      const cx = x + sw / 2, ya = layers[2].y + 1, yb = layers[5].y - 2;
      g.beginPath(); g.moveTo(cx, ya); g.lineTo(cx, yb - 6); g.stroke();
      g.beginPath(); g.moveTo(cx - 5, yb - 7); g.lineTo(cx + 5, yb - 7); g.lineTo(cx, yb); g.fill();
    }
    g.globalAlpha = 1;
  }
  const sx = 20 * s, sy = (ytop + y) / 2;
  g.strokeStyle = step >= 3 ? '#ffb36b' : col.muted; g.lineWidth = 1.5;
  g.beginPath(); g.arc(sx, sy, 9, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(sx - 5, sy); g.bezierCurveTo(sx - 2, sy - 6, sx + 2, sy + 6, sx + 5, sy); g.stroke();
  g.beginPath(); g.moveTo(sx, sy - 9); g.lineTo(sx, ytop + 2); g.lineTo(x0, ytop + 2); g.stroke();
  g.beginPath(); g.moveTo(sx, sy + 9); g.lineTo(sx, layers[5].y + layers[5].hh / 2); g.lineTo(x0, layers[5].y + layers[5].hh / 2); g.stroke();
  if (step >= 4) {
    const yc = core.y + core.hh / 2;
    g.fillStyle = hex(PAL.pump); g.beginPath(); g.moveTo(x0 - 2, yc - 4); g.lineTo(x0 + 10, yc); g.lineTo(x0 - 2, yc + 4); g.fill();
    g.fillStyle = css(shRGB(780)); g.beginPath(); g.moveTo(x1 + 2, yc - 5); g.lineTo(x1 + 16, yc); g.lineTo(x1 + 2, yc + 5); g.fill();
  }
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
  for (const L of layers) g.fillText(t('cs.' + L.k), x1 + 22 * s, L.y + L.hh / 2);
  label(g, col, f, t('plot.cs.title'), x0, 2, 'left', 'top', col.text);
}

// ================================================================ measured data (site/data, from the paper's data set)
// Nice axis ticks between lo and hi (about n of them).
// ---------------------------------------------------------------- quasi-phase matching ("How it works" steps 5-7, model)
// Top: the first three stripe periods, in units of the most that light over the whole area ever gives (steps 5, 6;
// the orange marks show where chi2 is on), or the output against the stripe spacing (step 7).  Bottom: the whole
// 7.2 mm grating, relative to the matched spacing at its end.  Curves from physics.js qpmCurve / qpmScan.
export function drawQPM(canvas, { step, period, lam0, gain, near, uni, match, cur, scan, t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const sh = css(shRGB(780)), fill = css(shRGB(780), 0.2), grey = '#aab4be', shText = '#b9adff';
  const left = 44 * s, ph = Math.max(40, (h - 104 * s) / 2);
  const A = { x: left, y: 18 * s, w: w - left - 12 * s, h: ph };
  const B = { x: left, y: A.y + ph + 52 * s, w: A.w, h: ph };
  const line = (b, xs, ys, X, Y, color, width, dash = [], area = false) => {
    g.save(); g.beginPath(); g.rect(b.x, b.y - 2, b.w, b.h + 2); g.clip();
    if (area) {
      g.fillStyle = fill; g.beginPath(); g.moveTo(X(xs[0]), Y(0));
      for (let i = 0; i < xs.length; i++) g.lineTo(X(xs[i]), Y(ys[i]));
      g.lineTo(X(xs[xs.length - 1]), Y(0)); g.fill();
    }
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); polyline(g, xs, ys, xs.length, X, Y);
    g.restore();
  };
  const note = (text, x, y, color, align = 'left', base = 'bottom') => {
    g.font = f(10.5, 600); g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(text, x, y);
  };
  label(g, col, f, t('plot.model'), A.x + A.w, 2, 'right', 'top');

  // ---- top
  if (step < 7) {
    const z1 = near.z1, ymax = 10.5, X = z => A.x + z / z1 * A.w, Y = v => A.y + A.h - Math.min(v, ymax) / ymax * A.h;
    ticksX(g, A, col, f, { xmin: 0, xmax: z1, xticks: [0, 10, 20, 30, 40, 50].filter(v => v <= z1) });
    ticksY(g, A, col, f, { ymin: 0, ymax, yticks: [1, 4, 9] });            // 1, 4, 9: the light after 1, 2, 3 stripes
    // where chi2 is switched on: everywhere (step 5) or in the first half of each period (step 6)
    g.fillStyle = hex(PAL.chi2);
    if (step === 5) g.fillRect(A.x, A.y + A.h - 4 * s, A.w, 4 * s);
    else for (let z = 0; z < z1; z += lam0) g.fillRect(X(z), A.y + A.h - 4 * s, X(Math.min(z1, z + lam0 / 2)) - X(z), 4 * s);
    if (step === 6) line(A, near.uni.z, near.uni.P, X, Y, grey, 1.4);
    const main = step === 5 ? near.uni : near.qpm;
    line(A, main.z, main.P, X, Y, sh, 2.2, [], true);
    if (step === 6) {
      note(t('plot.qpm.stripes'), X(z1) - 4 * s, Y(9) + 2 * s, shText, 'right', 'top');
      note(t('plot.qpm.uni'), X(z1 * 0.3), Y(1) - 3 * s, grey, 'center', 'bottom');
    } else note(t('plot.qpm.uni'), X(z1 * 0.5), Y(1) - 3 * s, shText, 'center', 'bottom');
    note(t('plot.qpm.chi'), A.x + 3 * s, A.y + A.h - 6 * s, hex(PAL.chi2), 'left', 'bottom');
    label(g, col, f, t('plot.qpm.near'), A.x, A.y - 4, 'left', 'bottom', col.text);
    label(g, col, f, t('plot.qpm.zum'), A.x + A.w / 2, A.y + A.h + 32 * s);
  } else {
    const p0 = scan.per[0], p1 = scan.per[scan.per.length - 1], ymax = 1.1;
    const X = p => A.x + (p - p0) / (p1 - p0) * A.w, Y = v => A.y + A.h - Math.min(v, ymax) / ymax * A.h;
    ticksX(g, A, col, f, { xmin: p0, xmax: p1, xticks: [16.6, 16.7, 16.8] });
    ticksY(g, A, col, f, { ymin: 0, ymax, yticks: [0, 0.5, 1] });
    g.save(); g.strokeStyle = grey; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(X(lam0) + 0.5, A.y); g.lineTo(X(lam0) + 0.5, A.y + A.h); g.stroke(); g.restore();
    line(A, scan.per, scan.P, X, Y, sh, 2, [], true);
    const pe = cur.P[cur.P.length - 1], px = X(Math.min(p1, Math.max(p0, period)));
    g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px + 0.5, A.y); g.lineTo(px + 0.5, A.y + A.h); g.stroke();
    g.fillStyle = sh; g.beginPath(); g.arc(px, Y(pe), 4.5 * s, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.stroke();
    note(`${Math.round(100 * pe)} %`, px + (px > A.x + A.w * 0.7 ? -7 : 7) * s, Math.max(A.y + 12 * s, Y(pe) - 4 * s), col.text, px > A.x + A.w * 0.7 ? 'right' : 'left');
    label(g, col, f, t('plot.qpm.scan'), A.x, A.y - 4, 'left', 'bottom', col.text);
    label(g, col, f, t('plot.qpm.per'), A.x + A.w / 2, A.y + A.h + 32 * s);
  }

  // ---- bottom: the whole grating (mm)
  const L = uni.z[uni.z.length - 1] / 1000, ymax = 1.1;
  const X = z => B.x + z / 1000 / L * B.w, Y = v => B.y + B.h - Math.min(v, ymax) / ymax * B.h;
  ticksX(g, { ...B }, col, f, { xmin: 0, xmax: L, xticks: [0, 2, 4, 6] });
  ticksY(g, B, col, f, { ymin: 0, ymax, yticks: [0, 0.5, 1] });
  const end = (c, text, color) => note(text, X(c.z[c.z.length - 1]) - 4 * s, Math.max(B.y + 12 * s, Y(c.P[c.P.length - 1]) - 3 * s), color, 'right');
  if (step === 5) {
    line(B, match.z, match.P, X, Y, grey, 1.3, [5, 4]);
    line(B, uni.z, uni.P, X, Y, sh, 2.4);
    note(t('plot.qpm.none'), B.x + B.w - 6 * s, Y(0) - 4 * s, shText, 'right');
    end(match, t('plot.qpm.next'), grey);
  } else if (step === 6) {
    line(B, uni.z, uni.P, X, Y, grey, 1.4);
    line(B, match.z, match.P, X, Y, sh, 2.4, [], true);
    end(match, t('plot.qpm.gain').replace('{n}', Math.round(gain).toLocaleString('en-US')), shText);
  } else {
    line(B, match.z, match.P, X, Y, grey, 1.3, [5, 4]);
    line(B, cur.z, cur.P, X, Y, sh, 2.4, [], true);
    end(match, `Λ = ${lam0.toFixed(3)} µm`, grey);
    note(`Λ = ${period.toFixed(3)} µm`, B.x + 6 * s, B.y + 12 * s, shText);
  }
  label(g, col, f, t('plot.qpm.whole'), B.x, B.y - 4, 'left', 'bottom', col.text);
  label(g, col, f, t('plot.qpm.zmm'), B.x + B.w / 2, h - 2);
  vlabel(g, col, f, t('plot.qpm.power'), 10 * s, (A.y + B.y + B.h) / 2);
}

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const mag = Math.pow(10, Math.floor(Math.log10(span / n)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(q => span / q <= n + 0.5) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(12));
  return out;
}
// extend nice ticks by whole steps until they reach `need` (the axis must never cut the data off)
function coverTicks(yt, need) {
  const st = yt.length > 1 ? yt[1] - yt[0] : (need || 1);
  while (yt[yt.length - 1] < need) yt.push(+(yt[yt.length - 1] + st).toFixed(12));
  return yt;
}
// tick labels with just enough decimals for the tick step
function tickFmt(ticks) {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  let d = 0;
  while (d < 4 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++;
  return v => (Math.abs(v) < step * 1e-6 ? 0 : v).toFixed(d);
}
// values such as 3e-5 are shown as mantissa x 10^e on the axis
function sci(max) {
  const e = max > 0 ? Math.floor(Math.log10(max)) : 0;
  const sup = String(e).replace('-', '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
  return Math.abs(e) >= 3 ? { k: Math.pow(10, -e), sup: `×10${sup}` } : { k: 1, sup: '' };
}
const greenRGB = [(PAL.green >> 16) & 255, (PAL.green >> 8) & 255, PAL.green & 255];

// header row: optional legend on the left, data tag ("measured", "simulation") on the right
function header(g, col, f, s, box, t, tag, legend = []) {
  if (tag) label(g, col, f, t(tag), box.x + box.w, box.y - 6, 'right', 'bottom');
  let x = box.x;
  for (const L of legend) {
    g.strokeStyle = L.color; g.lineWidth = L.width || 2; g.setLineDash(L.dash || []);
    g.beginPath(); g.moveTo(x, box.y - 11 * s); g.lineTo(x + 18 * s, box.y - 11 * s); g.stroke(); g.setLineDash([]);
    label(g, col, f, L.text, x + 23 * s, box.y - 6, 'left', 'bottom');
    g.font = f(11);
    x += 23 * s + g.measureText(L.text).width + 14 * s;
  }
}

function polyline(g, xs, ys, n, X, Y, from = 0, to = n - 1) {
  g.beginPath();
  let st = false;
  for (let i = from; i <= to; i++) {
    const y = ys[i];
    if (!Number.isFinite(y)) { st = false; continue; }
    const px = X(xs[i]), py = Y(y);
    if (!st) { g.moveTo(px, py); st = true; } else g.lineTo(px, py);
  }
  g.stroke();
}

// ---------------------------------------------------------------- measured SH spectrum (Fig. 3a, Fig. 3b)
// lam: nm; S, target: same units (nW/nm).  The fill uses the output false colours of the 3D view.
export function drawSpectrumM(canvas, { lam, S, target = null, ymax = null, xr = [735, 825], peaks = [], t, tag = 'plot.meas',
  ylabel = 'plot.int.nwnm', box: boxIn = null, ctx = null, legend = true }) {
  const P = ctx || prep(canvas);
  const { g, w, h, col, f, s } = P;
  const top = 24 * s;
  const box = boxIn || { x: 48 * s, y: top, w: w - 60 * s, h: h - top - 40 * s };
  const [xmin, xmax] = xr, n = lam.length;
  let max = 0;
  for (let i = 0; i < n; i++) if (lam[i] >= xmin && lam[i] <= xmax) { max = Math.max(max, S[i]); if (target) max = Math.max(max, target[i]); }
  const yt = coverTicks(niceTicks(0, ymax || (max > 0 ? max * 1.1 : 1), 4), ymax ? 0 : max * 1.04), top_ = ymax || yt[yt.length - 1];
  ticksX(g, box, col, f, { xmin, xmax, xticks: niceTicks(xmin, xmax, 4).filter(v => v > xmin && v < xmax) });
  ticksY(g, box, col, f, { ymin: 0, ymax: top_, yticks: yt.filter(v => v <= top_), yfmt: tickFmt(yt) });
  if (!boxIn) {
    label(g, col, f, t('plot.wl'), box.x + box.w / 2, h - 2);
    vlabel(g, col, f, t(ylabel), 10 * s, box.y + box.h / 2);
  }
  const X = nm => box.x + (nm - xmin) / (xmax - xmin) * box.w;
  const Y = v => box.y + box.h - Math.max(0, Math.min(v, top_)) / top_ * box.h;
  for (let px = 0; px < box.w; px++) {
    g.fillStyle = css(shRGB(xmin + (xmax - xmin) * px / box.w), 0.9);
    g.fillRect(box.x + px, box.y + box.h + 1, 1.2, 3);
  }
  g.save();
  g.beginPath(); g.rect(box.x, box.y - 1, box.w, box.h + 1); g.clip();
  for (let i = 0; i < n - 1; i++) {
    const a = lam[i], b = lam[i + 1];
    if (b < xmin || a > xmax) continue;
    g.fillStyle = css(shRGB(a), 0.55);
    g.beginPath(); g.moveTo(X(a), Y(0)); g.lineTo(X(a), Y(S[i])); g.lineTo(X(b), Y(S[i + 1])); g.lineTo(X(b), Y(0)); g.fill();
  }
  g.strokeStyle = col.text; g.lineWidth = 1.5;
  polyline(g, lam, S, n, X, Y);
  if (target) { g.strokeStyle = '#c3ccd5'; g.lineWidth = 1.6; g.setLineDash([5, 4]); polyline(g, lam, target, n, X, Y); g.setLineDash([]); }
  g.restore();
  g.font = f(11, 600); g.fillStyle = col.text; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const p of peaks) if (p.nm > xmin + 3 && p.nm < xmax - 3) g.fillText(p.nm.toFixed(0), X(p.nm), Math.max(box.y + 11 * s, Y(p.v) - 3));
  header(g, col, f, s, box, t, tag, target && legend ? [{ color: '#c3ccd5', dash: [5, 4], text: t('plot.target'), width: 1.6 }] : []);
}

// ---------------------------------------------------------------- measured spectrogram (Fig. 3c, Fig. S30)
// frames: rows (Float32Array over lam, nm); times: start time (s) of each frame; frames after `upto` are
// not drawn yet (the word is written as the playback goes on).  One colour scale for the whole picture,
// as in the paper.  invert: shorter wavelengths at the top (Fig. 3c).
export function drawSpectrogramM(canvas, { lam, frames, times, upto, vmax, invert = false, t, yr = [750, 810], xlabel = 'plot.time.s', tag = 'plot.meas' }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const top = 24 * s;
  const box = { x: 44 * s, y: top, w: w - 56 * s, h: h - top - 40 * s };
  const [ymin, ymax] = yr, yticks = niceTicks(ymin, ymax, 3);
  const n = frames.length, dtEnd = n > 1 ? times[n - 1] - times[n - 2] : 1, tEnd = times[n - 1] + dtEnd;
  const dpr = canvas.width / w;
  const X0 = Math.round(box.x * dpr), Y0 = Math.round(box.y * dpr);
  const W = Math.max(1, Math.round(box.w * dpr)), H = Math.max(1, Math.round(box.h * dpr));
  const img = g.createImageData(W, H), d = img.data;
  const bg = hexRGB(col.bg, [13, 19, 26]);
  const rowNm = new Float64Array(H), rowRGB = [];
  for (let y = 0; y < H; y++) {
    const u = (y + 0.5) / H;
    rowNm[y] = invert ? ymin + u * (ymax - ymin) : ymax - u * (ymax - ymin);
    rowRGB.push(shRGB(rowNm[y]).map(v => v * 255));
    for (let x = 0; x < W; x++) { const k = 4 * (y * W + x); d[k] = bg[0]; d[k + 1] = bg[1]; d[k + 2] = bg[2]; d[k + 3] = 255; }
  }
  const l0 = lam[0], dl = (lam[lam.length - 1] - lam[0]) / (lam.length - 1);
  const last = Math.min(n - 1, upto === undefined ? n - 1 : upto);
  for (let c = 0; c <= last; c++) {
    const spec = frames[c];
    const ta = times[c], tb = c + 1 < n ? times[c + 1] : tEnd;
    const xa = Math.floor(ta / tEnd * W), xb = Math.min(W, Math.max(xa + 1, Math.floor(tb / tEnd * W)));
    for (let y = 0; y < H; y++) {
      const fi = (rowNm[y] - l0) / dl, i = Math.floor(fi);
      if (i < 0 || i + 1 >= spec.length) continue;
      const v = (spec[i] + (spec[i + 1] - spec[i]) * (fi - i)) / vmax;
      if (v < 0.04) continue;
      const a = Math.pow(Math.min(1, v * 1.1), 0.8), rgb = rowRGB[y];
      for (let x = xa; x < xb; x++) {
        const k = 4 * (y * W + x);
        d[k] = bg[0] + (rgb[0] - bg[0]) * a; d[k + 1] = bg[1] + (rgb[1] - bg[1]) * a; d[k + 2] = bg[2] + (rgb[2] - bg[2]) * a;
      }
    }
  }
  g.putImageData(img, X0, Y0);
  ticksY(g, box, col, f, { ymin, ymax, yticks, flip: invert, lines: false });
  g.font = f(11); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of niceTicks(0, tEnd, 5)) if (v <= tEnd) g.fillText(String(v), box.x + v / tEnd * box.w, box.y + box.h + 4);
  if (last < n - 1 && last >= 0) {                      // playback position
    const px = box.x + (last + 1 < n ? times[last + 1] : tEnd) / tEnd * box.w;
    g.strokeStyle = 'rgba(232,237,242,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + 0.5, box.y); g.lineTo(px + 0.5, box.y + box.h); g.stroke();
  }
  vlabel(g, col, f, t('plot.wlshort'), 10 * s, box.y + box.h / 2);
  label(g, col, f, t(xlabel), box.x + box.w / 2, h - 2);
  header(g, col, f, s, box, t, tag);
  g.strokeStyle = col.grid; g.lineWidth = 1; g.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
  // intensity scale (the paper's colour bar runs 0 to vmax): brightness as drawn above, at 780 nm
  g.font = f(10);
  const z0 = '0', z1 = `${vmax.toFixed(1)} nW/nm`, bw = 46 * s, by = box.y - 15 * s, bh = 7 * s;
  let bx = box.x;
  g.fillStyle = col.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(z0, bx, by + bh / 2); bx += g.measureText(z0).width + 4 * s;
  const c780 = shRGB(780).map(v => v * 255);
  for (let i = 0; i < bw; i++) {
    const v = i / (bw - 1), a = v < 0.04 ? 0 : Math.pow(Math.min(1, v * 1.1), 0.8);
    g.fillStyle = `rgb(${[0, 1, 2].map(k => Math.round(bg[k] + (c780[k] - bg[k]) * a)).join(',')})`;
    g.fillRect(bx + i, by, 1.2, bh);
  }
  g.strokeStyle = col.grid; g.strokeRect(bx + 0.5, by + 0.5, bw, bh);
  g.fillStyle = col.muted; g.fillText(z1, bx + bw + 4 * s, by + bh / 2);
}

// ---------------------------------------------------------------- training (Fig. 3b, Fig. S27)
// Top: the measured spectrum at this optimisation step and the target (scaled to the same area, as in
// Fig. S27).  Bottom: the optimiser's error for every step, with the current one marked.
export function drawTraining(canvas, { lam, S, target, step, nStates, dist, ymax, t, marks = [] }) {
  const P = prep(canvas);
  const { g, w, h, col, f, s } = P;
  const top = 24 * s, lossH = Math.max(38 * s, (h - top - 40 * s) * 0.27), gap = 56 * s;
  const box = { x: 48 * s, y: top, w: w - 60 * s, h: h - top - gap - lossH - 22 * s };
  // ymax: rounded up to a tick so that the axis steps rather than creeps
  const st = niceTicks(0, ymax, 4), ystep = st.length > 1 ? st[1] - st[0] : ymax;
  drawSpectrumM(canvas, { lam, S, target, ymax: Math.ceil(ymax / ystep - 1e-9) * ystep, t, box, ctx: P, xr: [735, 825] });
  label(g, col, f, t('plot.wl'), box.x + box.w / 2, box.y + box.h + 31 * s);
  vlabel(g, col, f, t('plot.int.nwnm'), 10 * s, box.y + box.h / 2);
  const lb = { x: box.x, y: box.y + box.h + gap, w: box.w, h: lossH };
  // log axis: the error falls by more than ten times, and the late improvements matter too.  Every step
  // is a new measurement (rejected changes are measured again), so the raw curve is noisy; the
  // orange line is the best so far.
  let lo = Infinity, hi = 0;
  for (const v of dist) if (v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const e0 = Math.floor(2 * Math.log10(lo)) / 2, e1 = Math.ceil(2 * Math.log10(hi)) / 2, L = v => Math.log10(Math.max(v, 10 ** e0));
  const X = i => lb.x + i / Math.max(1, nStates - 1) * lb.w, Y = v => lb.y + lb.h - (L(v) - e0) / Math.max(1e-9, e1 - e0) * lb.h;
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.strokeStyle = col.grid; g.lineWidth = 1;
  for (let e = Math.ceil(e0); e <= e1; e++) {
    const py = Y(10 ** e);
    g.beginPath(); g.moveTo(lb.x, py + 0.5); g.lineTo(lb.x + lb.w, py + 0.5); g.stroke();
    g.fillText(String(+(10 ** e).toPrecision(1)), lb.x - 5, py);
  }
  g.strokeRect(lb.x + 0.5, lb.y + 0.5, lb.w, lb.h);
  g.strokeStyle = '#5d6a77'; g.lineWidth = 1; g.beginPath();
  dist.forEach((v, i) => { const px = X(i), py = Y(v); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.stroke();
  const last = Math.min(step, dist.length - 1);
  g.strokeStyle = '#ffb36b'; g.lineWidth = 2; g.beginPath();
  for (let i = 0, m = Infinity; i <= last; i++) { m = Math.min(m, dist[i]); const px = X(i), py = Y(m); i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.stroke();
  g.fillStyle = '#ffb36b'; g.beginPath(); g.arc(X(last), Y(dist[last]), 3.2 * s, 0, 7); g.fill();
  // the steps that Supplementary Fig. S27 shows
  g.strokeStyle = '#8fb6db'; g.lineWidth = 1.5;
  for (const m of marks) { const px = X(m) + 0.5; g.beginPath(); g.moveTo(px, lb.y + lb.h - 6 * s); g.lineTo(px, lb.y + lb.h); g.stroke(); }
  label(g, col, f, t('plot.err'), lb.x, lb.y - 4, 'left', 'bottom', col.text);
  label(g, col, f, `${t('plot.step')} ${step} / ${nStates - 1}`, lb.x + lb.w, lb.y - 4, 'right', 'bottom', '#ffd3a8');
}

// ---------------------------------------------------------------- Fig. 2b: efficiency vs pump wavelength for each period
const PERIOD_COLS = ['#5b4ea1', '#4a63b0', '#3a7fbf', '#2f98bf', '#2bb0b3', '#38c19b', '#5fcf7d', '#8ad964', '#b6df54', '#dcde4c', '#f2c94c', '#f6a945', '#f3863f', '#ea6439'];
export const periodColour = (i, n) => PERIOD_COLS[Math.round(i / Math.max(1, n - 1) * (PERIOD_COLS.length - 1))];
export function drawTuning(canvas, { periods, pump, eff, best, fit, sel, t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const top = 24 * s, inW = Math.min(150 * s, w * 0.34);
  const box = { x: 46 * s, y: top, w: w - 46 * s - inW - 40 * s, h: h - top - 40 * s };
  let max = 0;
  eff.forEach(r => { for (const v of r) max = Math.max(max, v); });
  const sc = sci(max), yt = coverTicks(niceTicks(0, max * sc.k * 1.08, 3), max * sc.k), ytop = yt[yt.length - 1];
  const xmin = 1500, xmax = 1630;
  ticksX(g, box, col, f, { xmin, xmax, xticks: [1500, 1550, 1600] });
  ticksY(g, box, col, f, { ymin: 0, ymax: ytop, yticks: yt, yfmt: tickFmt(yt) });
  const X = nm => box.x + (nm - xmin) / (xmax - xmin) * box.w, Y = v => box.y + box.h - Math.max(0, v * sc.k) / ytop * box.h;
  g.save(); g.beginPath(); g.rect(box.x, box.y, box.w, box.h); g.clip();
  const order = periods.map((_, i) => i).filter(i => i !== sel).concat([sel]);
  for (const i of order) {
    const on = i === sel;
    g.globalAlpha = on ? 1 : 0.35; g.strokeStyle = periodColour(i, periods.length); g.lineWidth = on ? 2.6 : 1.2;
    polyline(g, pump[i], eff[i], pump[i].length, X, Y);
  }
  g.globalAlpha = 1; g.restore();
  label(g, col, f, t('plot.pumpnm'), box.x + box.w / 2, h - 2);
  vlabel(g, col, f, `${t('plot.effn')} (${sc.sup ? sc.sup + ' ' : ''}%/W)`, 10 * s, box.y + box.h / 2);
  label(g, col, f, `Λ = ${periods[sel].toFixed(2)} µm`, box.x + 4 * s, box.y + 4 * s, 'left', 'top', periodColour(sel, periods.length));
  label(g, col, f, t('plot.meas'), box.x + box.w, box.y - 6, 'right', 'bottom');
  // inset: Fig. 2b(ii) as published: the best pump wavelength (across) for each period (up), with the fit
  const ib = { x: box.x + box.w + 40 * s, y: top + 4 * s, w: inW - 10 * s, h: h - top - 48 * s };
  const lmin = 1490, lmax = 1640, pmin = 16.3, pmax = 17.05;
  const PX = l => ib.x + (l - lmin) / (lmax - lmin) * ib.w, PY = p => ib.y + ib.h - (p - pmin) / (pmax - pmin) * ib.h;
  g.strokeStyle = col.grid; g.strokeRect(ib.x + 0.5, ib.y + 0.5, ib.w, ib.h);
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const p of [16.4, 16.7, 17.0]) g.fillText(p.toFixed(1), ib.x - 3, PY(p));
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const l of [1500, 1600]) g.fillText(l, PX(l), ib.y + ib.h + 3);
  if (fit && fit.period && fit.pump) {
    g.strokeStyle = '#8e99a5'; g.lineWidth = 1.2; g.setLineDash([4, 3]);
    polyline(g, fit.pump, fit.period, fit.period.length, PX, PY); g.setLineDash([]);
  }
  periods.forEach((p, i) => {
    if (!Number.isFinite(best[i])) return;
    g.fillStyle = periodColour(i, periods.length); g.beginPath(); g.arc(PX(best[i]), PY(p), (i === sel ? 4.2 : 2.6) * s, 0, 7); g.fill();
    if (i === sel) { g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); }
  });
  label(g, col, f, t('plot.best'), ib.x + ib.w / 2, ib.y - 4, 'center', 'bottom', col.text);
  label(g, col, f, t('plot.pumpshort'), ib.x + ib.w / 2, h - 2);
  vlabel(g, col, f, 'Λ (µm)', ib.x - 30 * s, ib.y + ib.h / 2);
}

// ---------------------------------------------------------------- Fig. 2c: feedback against a random walk of the pump wavelength
export function drawTrack(canvas, { tt, pump, period, effOn, effOff, periodOff = null, upto, t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const n = tt.length, last = Math.max(0, Math.min(n - 1, upto === undefined ? n - 1 : upto));
  const x0 = 50 * s, x1 = w - 10, top = 4, bottom = 30 * s, gap = 6, head = 15 * s, panels = 3;
  const ph = (h - top - bottom - (gap + head) * panels) / panels;
  const tEnd = tt[n - 1], X = v => x0 + (x1 - x0) * v / tEnd;
  let emax = 0;
  for (let i = 0; i < n; i++) emax = Math.max(emax, effOn[i], effOff[i]);
  const sc = sci(emax);
  const rng = (arrs, pad) => { let lo = Infinity, hi = -Infinity; for (const a of arrs) if (a) for (const v of a) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } return [lo - pad, hi + pad]; };
  const series = [
    { lines: [[pump, hex(PAL.pump), 2, null]], label: t('plot.pump'), r: rng([pump], 1.5), fmt: v => v.toFixed(0) },
    { lines: [[period, hex(PAL.green), 2.2, null]], flat: periodOff, label: t('plot.period'), r: rng([period, periodOff !== null ? [periodOff] : null], 0.008), fmt: v => v.toFixed(2) },
    { lines: [[effOff, '#9aa6b2', 1.6, [4, 3]], [effOn, '#4ea3ff', 2.2, null]], label: `${t('plot.effn')} (${sc.sup ? sc.sup + ' ' : ''}%/W)`, r: [0, emax * 1.12], scaled: true, legend: true },
  ];
  series.forEach((sr, k) => {
    const y0 = top + k * (ph + gap + head) + head, [lo, hi] = sr.r;
    const Y = v => y0 + ph - (v - lo) / (hi - lo) * ph;
    g.font = f(11, 600); g.fillStyle = col.text; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(sr.label, x0, y0 - 2);
    g.strokeStyle = col.grid; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, ph);
    g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    if (sr.scaled) {
      const ys = niceTicks(lo * sc.k, hi * sc.k, 3), fs = tickFmt(ys);
      for (const v of ys) if (v >= lo * sc.k && v <= hi * sc.k) g.fillText(fs(v), x0 - 4, Y(v / sc.k));
    } else {
      const yt = niceTicks(lo, hi, 2), fy = k === 1 ? tickFmt(yt) : sr.fmt;
      for (const v of yt) if (v >= lo && v <= hi) g.fillText(fy(v), x0 - 4, Y(v));
    }
    if (k === 0) label(g, col, f, t('plot.meas'), x1, y0 - 2, 'right', 'bottom');
    if (sr.flat !== null && sr.flat !== undefined) {
      g.strokeStyle = '#9aa6b2'; g.setLineDash([4, 3]); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, Y(sr.flat)); g.lineTo(x1, Y(sr.flat)); g.stroke(); g.setLineDash([]);
    }
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, ph); g.clip();
    for (const [arr, c, lw, dash] of sr.lines) {
      g.strokeStyle = c; g.lineWidth = lw; g.setLineDash(dash || []);
      polyline(g, tt, arr, n, X, Y, 0, last);
    }
    g.setLineDash([]); g.restore();
    if (sr.legend) {
      // beside the panel title when there is room, otherwise inside the panel (top right, on a backing)
      g.font = f(11, 600);
      const titleEnd = x0 + g.measureText(sr.label).width + 8 * s;
      g.font = f(10); g.textBaseline = 'bottom'; g.textAlign = 'right';
      const t2 = t('plot.without'), t1 = t('plot.with'), lx = x1 - 4;
      const w2 = g.measureText(t2).width, w1 = g.measureText(t1).width, need = w1 + w2 + 74;
      const inside = lx - need < titleEnd, ly = inside ? y0 + 14 * s : y0 - 2;
      if (inside) { g.fillStyle = 'rgba(13,19,26,0.85)'; g.fillRect(lx - need + 2, y0 + 2, need, 15 * s); }
      g.fillStyle = '#9aa6b2'; g.fillText(t2, lx, ly);
      g.strokeStyle = '#9aa6b2'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(lx - w2 - 22, ly - 5); g.lineTo(lx - w2 - 6, ly - 5); g.stroke(); g.setLineDash([]);
      const xx = lx - w2 - 30;
      g.fillStyle = '#4ea3ff'; g.fillText(t1, xx, ly);
      g.strokeStyle = '#4ea3ff'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(xx - w1 - 22, ly - 5); g.lineTo(xx - w1 - 6, ly - 5); g.stroke();
    }
  });
  const px = X(tt[last]);
  g.strokeStyle = 'rgba(232,237,242,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + 0.5, top + head); g.lineTo(px + 0.5, h - bottom); g.stroke();
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of niceTicks(0, tEnd, 5)) if (v <= tEnd) g.fillText(String(v), X(v), h - bottom + 3);
  label(g, col, f, t('plot.time.s'), (x0 + x1) / 2, h - 2);
}

// ---------------------------------------------------------------- colour maps for the image plots
const greens = bg => v => [bg[0] + (greenRGB[0] - bg[0]) * v, bg[1] + (greenRGB[1] - bg[1]) * v, bg[2] + (greenRGB[2] - bg[2]) * v];
const shMap = (bg, nm, gamma = 0.8) => {
  const c = shRGB(nm).map(v => v * 255);
  return v => { const a = Math.pow(v, gamma); return [bg[0] + (c[0] - bg[0]) * a, bg[1] + (c[1] - bg[1]) * a, bg[2] + (c[2] - bg[2]) * a]; };
};
// offscreen canvas of `rows` x `cols` values (v[r * cols + c]); pixel (px, py) shows value at(px, py)
function imageOf(width, height, value, colour) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d'), img = g.createImageData(width, height), d = img.data;
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const rgb = colour(value(px, py), px, py), k = 4 * (py * width + px);
    d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
const maxOf = a => { let m = 0; for (const v of a) if (v > m) m = v; return m; };

// ---------------------------------------------------------------- Fig. 4b: pattern close-up | simulated SHG inside | output profile
// All three share the vertical axis: transverse position x (µm), +x up.
// zoom: {v, rows, cols}: rows = x from zoomAxes.x_um[0] (row 0) to [1], columns = z across zoomAxes.z_cm.
// prop: {v, rows, cols}: rows = z from propAxes.z_cm[0] to [1], columns = x from propAxes.x_um[0] to [1].
// x, prof, sim: output profile (prof measured, sim simulated, same units).
// prof null: a setting that was only simulated (no measured curve); patternTag: title of a pattern that is a model
export function drawSpatial(canvas, { zoom, zoomAxes, prop, propAxes, x, prof, sim = null, unit = 'nW/µm', t, xr = [-300, 300], fixedMax = null, patternTag = null }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const bg = hexRGB(col.bg, [13, 19, 26]);
  const top = 32 * s, bottom = 34 * s, left = 46 * s, gap = 10 * s;
  const H = h - top - bottom, W = w - left - 8 * s - 2 * gap;
  const only = !zoom && !prop;                          // e.g. Fig. S34: only the measured profiles are stored
  const bz = { x: left, y: top, w: W * 0.26, h: H }, bp = { x: bz.x + bz.w + gap, y: top, w: W * 0.42, h: H };
  const bo = only ? { x: left, y: top, w: w - left - 10 * s, h: H } : { x: bp.x + bp.w + gap, y: top, w: W * 0.32, h: H };
  const [xlo, xhi] = xr, Yx = xu => top + H - (xu - xlo) / (xhi - xlo) * H;
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of [-200, 0, 200]) g.fillText(String(v), left - 4, Yx(v));
  vlabel(g, col, f, t('plot.xpos'), 9 * s, top + H / 2);
  const title = (b, key) => label(g, col, f, t(key), b.x + b.w / 2, top - 5, 'center', 'bottom', col.text);
  g.imageSmoothingEnabled = true;
  // left: pattern close-up (Fig. 4b left column); image row 0 = top = largest x
  if (!only && zoom) {
    const [xa, xb] = zoomAxes.x_um, zmax = maxOf(zoom.v);
    const c = imageOf(zoom.cols, zoom.rows, (px, py) => zoom.v[(zoom.rows - 1 - py) * zoom.cols + px] / (zmax || 1), greens(bg));
    g.save(); g.beginPath(); g.rect(bz.x, bz.y, bz.w, bz.h); g.clip();
    g.imageSmoothingEnabled = false;
    g.drawImage(c, bz.x, Yx(xb), bz.w, Yx(xa) - Yx(xb));
    g.restore();
    g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    const [za, zb] = zoomAxes.z_cm;
    g.fillText(za.toFixed(3).replace(/0$/, ''), bz.x + 12 * s, top + H + 3); g.fillText(zb.toFixed(3).replace(/0$/, ''), bz.x + bz.w - 12 * s, top + H + 3);
  }
  if (!only) { g.strokeStyle = col.grid; g.lineWidth = 1; g.strokeRect(bz.x + 0.5, bz.y + 0.5, bz.w, bz.h); title(bz, patternTag || 'plot.pattern'); }
  // middle: simulated SH light inside the waveguide: z across, x up
  if (!only && prop) {
    const [xa, xb] = propAxes.x_um, pmax = maxOf(prop.v), cm = shMap(bg, 790, 0.7);
    const c = imageOf(prop.rows, prop.cols, (px, py) => prop.v[px * prop.cols + (prop.cols - 1 - py)] / (pmax || 1), cm);
    g.save(); g.beginPath(); g.rect(bp.x, bp.y, bp.w, bp.h); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(c, bp.x, Yx(xb), bp.w, Yx(xa) - Yx(xb));
    g.restore();
    g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    const [za, zb] = propAxes.z_cm, span = zb - za;
    for (const v of niceTicks(0, span, 3)) if (v <= span + 1e-9) g.fillText(String(v), bp.x + v / span * bp.w, top + H + 3);
  }
  if (!only) {
    g.strokeStyle = col.grid; g.strokeRect(bp.x + 0.5, bp.y + 0.5, bp.w, bp.h);
    title(bp, 'plot.inside');
    label(g, col, f, t('plot.zcm'), (bz.x + bp.x + bp.w) / 2, h - 2);
  }
  // right: output profile, intensity across, position up (as in the paper)
  let max = 0;
  const n = (prof || sim).length;
  for (let i = 0; i < n; i++) if (x[i] >= xlo && x[i] <= xhi) max = Math.max(max, prof ? prof[i] : 0, sim ? sim[i] : 0);
  if (fixedMax) max = Math.max(max, fixedMax);
  // ticks as the paper draws them; the range always reaches past the highest point
  const xt = niceTicks(0, max * 1.05, 2), xtop = Math.max(xt[xt.length - 1] || 0, max * 1.06) || 1, fmt = tickFmt(xt);
  const IX = v => bo.x + Math.max(0, v) / xtop * bo.w;
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of xt) g.fillText(fmt(v), Math.min(bo.x + bo.w - 8 * s, Math.max(bo.x + 6 * s, IX(v))), top + H + 3);
  g.save(); g.beginPath(); g.rect(bo.x, bo.y, bo.w, bo.h); g.clip();
  if (prof) {
    g.fillStyle = css(shRGB(790), 0.28); g.beginPath(); g.moveTo(IX(0), Yx(x[0]));
    for (let i = 0; i < prof.length; i++) g.lineTo(IX(prof[i]), Yx(x[i]));
    g.lineTo(IX(0), Yx(x[prof.length - 1])); g.fill();
    g.strokeStyle = '#4ea3ff'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < prof.length; i++) { const px = IX(prof[i]), py = Yx(x[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  }
  if (sim) {
    g.strokeStyle = '#e8edf2'; g.lineWidth = 1.8; g.setLineDash([2, 3]); g.beginPath();
    for (let i = 0; i < sim.length; i++) { const px = IX(sim[i]), py = Yx(x[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke(); g.setLineDash([]);
  }
  g.restore();
  g.strokeStyle = col.grid; g.strokeRect(bo.x + 0.5, bo.y + 0.5, bo.w, bo.h);
  title(bo, 'plot.output');
  label(g, col, f, unit, bo.x + bo.w / 2, h - 2);
  g.font = f(10); g.textAlign = 'right'; g.textBaseline = 'top';
  const l1 = prof ? t('plot.meas') : '', l2 = '··· ' + t('plot.sim'), lw = Math.max(g.measureText(l1).width, sim ? g.measureText(l2).width : 0) + 6;
  const rows = (prof ? 1 : 0) + (sim ? 1 : 0);
  g.fillStyle = 'rgba(13,19,26,0.82)'; g.fillRect(bo.x + bo.w - 4 - lw + 2, top + 2, lw, (rows * 13 + 2) * s);
  if (prof) { g.fillStyle = '#4ea3ff'; g.fillText(l1, bo.x + bo.w - 4, top + 4); }
  if (sim) { g.fillStyle = '#e8edf2'; g.fillText(l2, bo.x + bo.w - 4, top + 4 + (prof ? 2 + 13 * s : 0)); }
}

// ---------------------------------------------------------------- Fig. 5: hyperspectral image + profiles at chosen wavelengths
// map: {v, nx, nl}: rows = x (increasing), columns = wavelength (increasing)
export function drawHyper(canvas, { lam, x, map, slicesNm = [], slices = [], sliceX = null, unit = 'nW/µm/nm', t }) {
  const { g, w, h, col, f, s } = prep(canvas);
  const bg = hexRGB(col.bg, [13, 19, 26]);
  const top = 26 * s, bottom = 42 * s, left = 46 * s, gap = 16 * s;
  const H = h - top - bottom, Wt = w - left - 10 * s - gap;
  const bm = { x: left, y: top, w: Wt * 0.62, h: H }, bs = { x: left + Wt * 0.62 + gap, y: top, w: Wt * 0.38, h: H };
  const l0 = lam[0], l1 = lam[lam.length - 1], xa = x[0], xb = x[x.length - 1];
  const max = maxOf(map.v);
  const cms = Array.from({ length: map.nl }, (_, q) => shMap(bg, l0 + (l1 - l0) * q / Math.max(1, map.nl - 1), 0.75));
  const c = imageOf(map.nl, map.nx, (px, py) => map.v[(map.nx - 1 - py) * map.nl + px] / (max || 1), (v, px) => cms[px](Math.max(0, v)));
  g.imageSmoothingEnabled = true;
  g.drawImage(c, bm.x, bm.y, bm.w, bm.h);
  const LX = nm => bm.x + (nm - l0) / (l1 - l0) * bm.w, XY = xu => top + H - (xu - xa) / (xb - xa) * H;
  slicesNm.forEach(nm => {
    g.strokeStyle = 'rgba(232,237,242,0.55)'; g.setLineDash([3, 3]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(LX(nm), bm.y); g.lineTo(LX(nm), bm.y + bm.h); g.stroke(); g.setLineDash([]);
  });
  g.strokeStyle = col.grid; g.lineWidth = 1; g.strokeRect(bm.x + 0.5, bm.y + 0.5, bm.w, bm.h);
  g.font = f(10); g.fillStyle = col.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of [-200, -100, 0, 100, 200]) if (v >= xa && v <= xb) g.fillText(String(v), left - 4, XY(v));
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of niceTicks(l0, l1, 3)) if (v > l0 && v < l1) g.fillText(String(v), LX(v), top + H + 3);
  vlabel(g, col, f, t('plot.xpos'), 9 * s, top + H / 2);
  label(g, col, f, t('plot.wlshort'), bm.x + bm.w / 2, h - 2);
  // profiles at the marked wavelengths, side by side (as the bottom-right inset of Fig. 5b, c)
  const smax = Math.max(...slices.map(maxOf), 1e-12);
  const k = slices.length, sw = bs.w / Math.max(1, k);
  const sx = sliceX || x;
  slices.forEach((a, j) => {
    const nm = slicesNm[j], x0 = bs.x + j * sw + 3;
    g.save(); g.beginPath(); g.rect(bs.x + j * sw, bs.y, sw, bs.h); g.clip();
    g.strokeStyle = css(shRGB(nm)); g.lineWidth = 1.6; g.beginPath();
    for (let i = 0; i < a.length; i++) { const px = x0 + Math.max(0, a[i]) / smax * (sw - 6), py = XY(sx[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke(); g.restore();
    g.font = f(9); g.fillStyle = css(shRGB(nm)); g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(String(+nm.toFixed(1)), bs.x + (j + 0.5) * sw, top + H + 3 + (k > 3 && j % 2 ? 10 * s : 0));   // staggered when crowded
  });
  g.strokeStyle = col.grid; g.strokeRect(bs.x + 0.5, bs.y + 0.5, bs.w, bs.h);
  label(g, col, f, t('plot.atnm'), bs.x + bs.w / 2, h - 2);
  label(g, col, f, t('plot.meas'), bs.x + bs.w, top - 5, 'right', 'bottom');
  label(g, col, f, `${t('plot.colourscale')} 0–${max.toPrecision(2)} ${unit}`, bm.x, top - 5, 'left', 'bottom');
}

// a short message in an empty plot (data still loading, or failed)
export function drawMessage(canvas, text) {
  const { g, w, h, col, f } = prep(canvas);
  g.font = f(13); g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
}
