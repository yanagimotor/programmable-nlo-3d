// Real-time models for a programmable slab waveguide (Yanagimoto et al., Nature 649, 330-337 (2026)).
// Units: lengths in µm, wavenumbers in rad/µm, time in fs, angular frequency in rad/fs.
// The TM0 slab dispersion is a fit anchored to the paper's measured values: QPM period 16.685 µm at a
// 1560 nm pump, GVM -92 fs/mm, n_eff(1580 nm) = 1.891 (planning notes, PHYSICS.md section 2.0).

export const TAU = 2 * Math.PI;
export const C = 0.299792458;     // speed of light, µm/fs
export const L_PROG = 7200;       // programmable length along the propagation direction, µm
export const W_PROG = 4500;       // programmable width, µm

// Effective index of the TM0 slab mode; valid 1.30-1.85 µm (pump band) and 0.65-0.925 µm (SH band).
export function neff(l) {
  if (l > 1.1) {
    const x = l - 1.56;
    return 1.89211233 + x * (-0.0555072581 + x * (-0.00529659467 + x * (-0.0048036141
      + x * (0.00509565631 + x * (-0.00379221215)))));
  }
  const x = l - 0.78;
  return 1.93886101 + x * (-0.0864394124 + x * (0.102927313 + x * (-0.21009757
    + x * (0.380299271 + x * (-0.584379193)))));
}

export const kOfLambda = l => TAU * neff(l) / l;                 // rad/µm
export const kOfOmega = w => (w / C) * neff(TAU * C / w);         // rad/µm, w in rad/fs
export const dkSHG = lsh => kOfLambda(lsh) - 2 * kOfLambda(2 * lsh);
export const periodForSH = lsh => TAU / dkSHG(lsh);               // QPM period for SH at lsh
export const periodForPump = lp => periodForSH(lp / 2);
export const LAMBDA_DEG = periodForPump(1.56);                   // 16.685 µm

// SH wavelength that a given period phase-matches (bisection; periodForSH increases with lsh here).
export function shForPeriod(period) {
  let a = 0.66, b = 0.92;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (a + b);
    if (periodForSH(m) < period) a = m; else b = m;
  }
  return 0.5 * (a + b);
}

// ---------------------------------------------------------------- gratings
// A pattern is a list of components spanning the whole programmable length:
//   {kind: 'uniform', w, period, phase?}   or   {kind: 'chirp', w, p0, p1}
// The device switches chi2 on and off (0/1 illumination), so the useful first Fourier component of a
// stripe pattern of weight w is w/pi.  g(z) = sum_j (w_j/pi) exp(-i phi_j(z)).

export function phaseOf(c, z, L = L_PROG) {
  if (c.kind === 'chirp') return TAU * ((z - z * z / (2 * L)) / c.p0 + z * z / (2 * L * c.p1));
  return TAU * z / c.period + (c.phase || 0);
}

// Local period of a component at z (for drawing the pattern).
export function localPeriod(c, z, L = L_PROG) {
  if (c.kind === 'chirp') return 1 / ((L - z) / (c.p0 * L) + z / (c.p1 * L));
  return c.period;
}

// D(dk) = integral_0^L g(z) exp(i dk z) dz  ->  [re, im]
export function gratingResponse(pattern, dk, L = L_PROG, dz = 5) {
  let re = 0, im = 0;
  for (const c of pattern) {
    if (!c.w) continue;
    if (c.kind === 'uniform') {
      const x = (dk - TAU / c.period) * L / 2;
      const s = Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x;
      const a = (c.w / Math.PI) * L * s, ph = x - (c.phase || 0);
      re += a * Math.cos(ph); im += a * Math.sin(ph);
    } else {
      const n = Math.round(L / dz), h = L / n, a = (c.w / Math.PI) * h;
      const tp = c.taper && c.taper.length === n ? c.taper : null;     // optional strength profile along z
      for (let i = 0; i < n; i++) {
        const z = (i + 0.5) * h, ph = dk * z - phaseOf(c, z, L), ai = tp ? a * tp[i] : a;
        re += ai * Math.cos(ph); im += ai * Math.sin(ph);
      }
    }
  }
  return [re, im];
}

// ---------------------------------------------------------------- quasi-phase matching, step by step ("How it works")
// The light switches chi2 on (lit) and off (dark).  For an undepleted CW pump the SH field after a distance z is
// A(z) = integral_0^z m(z') exp(i dk z') dz', with m = 1 everywhere (the whole area lit, period 0) or stripes of
// period Lambda lit for the first half of each period.  Exact for these 0/1 patterns: a lit stretch [a, b] adds
// (e^{i dk b} - e^{i dk a}) / (i dk), and the stripes add up as a geometric series.
export const QPM_PUMP = 1.56;                                     // µm, the pump of LAMBDA_DEG
export const QPM_DK = dkSHG(QPM_PUMP / 2);                        // rad/µm; 2 pi / QPM_DK = LAMBDA_DEG
// one stripe fewer over the programmable length than the matched grating: no SH left at the end
export const QPM_SLIP = LAMBDA_DEG * L_PROG / (L_PROG - LAMBDA_DEG);

function seg(dk, a, b) {                                          // integral_a^b e^{i dk z} dz -> [re, im]
  return [(Math.sin(dk * b) - Math.sin(dk * a)) / dk, (Math.cos(dk * a) - Math.cos(dk * b)) / dk];
}

function geom(th, n) {                                            // sum_{k<n} e^{i k th} -> [re, im]
  const qr = Math.cos(th) - 1, qi = Math.sin(th), d = qr * qr + qi * qi;
  if (d < 1e-18) return [n, 0];
  const nr = Math.cos(n * th) - 1, ni = Math.sin(n * th);
  return [(nr * qr + ni * qi) / d, (ni * qr - nr * qi) / d];
}

export function qpmField(z, period, dk = QPM_DK) {
  if (!period) return seg(dk, 0, z);
  const n = Math.floor(z / period), th = dk * period;
  const [gr, gi] = geom(th, n), [or, oi] = seg(dk, 0, period / 2);
  const [pr, pi] = seg(dk, 0, Math.min(z - n * period, period / 2)), c = Math.cos(n * th), s = Math.sin(n * th);
  return [gr * or - gi * oi + c * pr - s * pi, gr * oi + gi * or + c * pi + s * pr];
}

export function qpmPower(z, period, dk = QPM_DK) {
  const [a, b] = qpmField(z, period, dk);
  return a * a + b * b;
}

// units: QPM_REF = the matched grating at the end of the pattern; QPM_UNIT = the most uniform light ever gives,
// (2 / dk)^2, reached after one coherence length pi / dk (8.3 µm)
export const QPM_REF = qpmPower(L_PROG, LAMBDA_DEG);
export const QPM_UNIT = (2 / QPM_DK) ** 2;

// SH power at n + 1 points from 0 to z1 (µm), divided by `unit`
export function qpmCurve(period, { z1 = L_PROG, n = 400, unit = QPM_REF } = {}) {
  const z = new Float64Array(n + 1), P = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) { z[i] = z1 * i / n; P[i] = qpmPower(z[i], period) / unit; }
  return { z, P };
}

// SH power at the end of the pattern against the stripe period (µm), relative to QPM_REF
export function qpmScan(p0, p1, n = 301) {
  const per = new Float64Array(n), P = new Float64Array(n);
  for (let i = 0; i < n; i++) { per[i] = p0 + (p1 - p0) * i / (n - 1); P[i] = qpmPower(L_PROG, per[i]) / QPM_REF; }
  return { per, P };
}

// ---------------------------------------------------------------- function 1: colours (SHG spectra)
// S(lsh) = E(lsh) |D(dk(lsh))|^2 for a broadband femtosecond pump: E is the SH envelope (Gaussian in
// frequency, centred at 2 nu_c, FWHM sqrt(2) dnu_p).  lc and dl are illustrative pump parameters.
export const PUMP = { lc: 1.565, dl: 0.080 };
export function shEnvelope(lsh, lc = PUMP.lc, dl = PUMP.dl) {
  const nuc = C / lc, dnu = C * dl / (lc * lc), fw = Math.SQRT2 * dnu, nu = C / lsh;
  return Math.exp(-4 * Math.LN2 * ((nu - 2 * nuc) / fw) ** 2);
}

// Reference: one full-contrast grating, perfectly matched, at the centre of the pump envelope.
export const S_REF = (L_PROG / Math.PI) ** 2;

// The same sum as gratingResponse for chirped components, made cheap for whole spectra: a(z) e^{-i phi(z)}
// is tabulated once per call, and e^{i dk z} is advanced along z by rotation, so the inner loop has no
// trigonometry.  The tables stay local: framePattern hands out copies of cached chirps with new weights.
function chirpTable(c, L, dz = 5) {
  const n = Math.round(L / dz), h = L / n, a = (c.w / Math.PI) * h;
  const tp = c.taper && c.taper.length === n ? c.taper : null;
  const ar = new Float64Array(n), ai = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ph = phaseOf(c, (i + 0.5) * h, L), amp = tp ? a * tp[i] : a;
    ar[i] = amp * Math.cos(ph); ai[i] = -amp * Math.sin(ph);
  }
  return { n, h, ar, ai };
}

export function shSpectrum(pattern, { lmin = 0.72, lmax = 0.84, n = 481, L = L_PROG, dl = PUMP.dl } = {}) {
  const lam = new Float64Array(n), S = new Float64Array(n), E = new Float64Array(n);
  const ref = (L / Math.PI) ** 2;
  const uniform = pattern.filter(c => c.w && c.kind === 'uniform');
  const tables = pattern.filter(c => c.w && c.kind !== 'uniform').map(c => chirpTable(c, L));
  let max = 0;
  for (let i = 0; i < n; i++) {
    const l = lmin + (lmax - lmin) * i / (n - 1), dk = dkSHG(l);
    let [re, im] = uniform.length ? gratingResponse(uniform, dk, L) : [0, 0];
    for (const { n: m, h, ar, ai } of tables) {
      let cr = Math.cos(dk * h / 2), ci = Math.sin(dk * h / 2);
      const sr = Math.cos(dk * h), si = Math.sin(dk * h);
      for (let j = 0; j < m; j++) {
        re += ar[j] * cr - ai[j] * ci; im += ar[j] * ci + ai[j] * cr;
        const tmp = cr * sr - ci * si; ci = cr * si + ci * sr; cr = tmp;
      }
    }
    lam[i] = l;
    E[i] = shEnvelope(l, PUMP.lc, dl);
    S[i] = E[i] * (re * re + im * im) / ref;
    if (S[i] > max) max = S[i];
  }
  return { lam, S, E, max };
}

export function findPeaks(lam, S, frac = 0.2) {
  let max = 0;
  for (const v of S) if (v > max) max = v;
  const out = [];
  for (let i = 1; i < S.length - 1; i++) {
    if (S[i] >= frac * max && S[i] >= S[i - 1] && S[i] > S[i + 1]) {
      const d = (S[i - 1] - S[i + 1]) / (2 * (S[i - 1] - 2 * S[i] + S[i + 1]));   // parabolic refinement
      const dl = lam[1] - lam[0];
      out.push({ lambda: lam[i] + (Number.isFinite(d) ? d : 0) * dl, height: S[i] / max });
    }
  }
  return out;
}

// Presets used by the page (Nature Fig. 3a and SI S9A; four-period weights from the SI).
export const COLOR_PRESETS = {
  one: () => [{ kind: 'uniform', w: 1, period: 16.64 }],
  four: () => [16.36, 16.53, 16.72, 16.88].map((p, i) =>
    ({ kind: 'uniform', w: [0.40, 0.17, 0.12, 0.15][i], period: p })),
  broad: () => [{ kind: 'chirp', w: 1, p0: 16.3, p1: 16.9 }],
};
// The demonstrated broadband SH was >50 nm wide; a wider illustrative pump envelope is used for that
// preset so the simulated band is closer to it (the chirp range itself limits it to ~757-800 nm).
export const COLOR_ENVELOPE = { broad: 0.14 };
export const TUNE_RANGE = [16.30, 17.00];          // periods used in the experiments (Fig. 2b,c)

// ---------------------------------------------------------------- words written in the spectrum
// In the experiment each frame's illumination pattern was optimised beforehand for its target
// spectrum (SI S9C), so every stroke comes out about equally bright.  Here a frame is built from two
// kinds of target: a line (one grating period, ~2.7 nm wide) and a bar (a chirped grating whose
// strength is tapered along z so that the pump envelope does not tilt it).  A 40 nm bar spans only
// ~3.6 Fresnel zones on 7.2 mm, so it still rings (the 'beads' also seen in Fig. 3c) and its ends
// are soft; long bars are therefore chirped 4 nm past each end.  Weights give each target the same
// peak brightness and sum to 1 per frame.
const CHIRP_N = Math.round(L_PROG / 5);          // the z grid gratingResponse uses (dz = 5 µm)
const flatCache = new Map();
export function flatChirp(a, b) {
  const key = a.toFixed(5) + ':' + b.toFixed(5);
  if (flatCache.has(key)) return flatCache.get(key);
  const c = { kind: 'chirp', w: 1, p0: periodForSH(a), p1: periodForSH(b) };
  const h = L_PROG / CHIRP_N, E = new Float64Array(CHIRP_N);
  let emin = Infinity;
  for (let i = 0; i < CHIRP_N; i++) {
    E[i] = shEnvelope(shForPeriod(localPeriod(c, (i + 0.5) * h)));
    emin = Math.min(emin, E[i]);
  }
  c.taper = E.map(e => Math.sqrt(emin / e));    // <= 1: the strength can only be lowered
  c.emin = emin;
  flatCache.set(key, c);
  return c;
}

// Stationary phase: a chirp sweeping dK over L, of local strength w*taper, gives
// S = E w^2 taper^2 (2 pi / (dK L)) = w^2 emin 2 pi / (dK L); a line gives S = E w^2 at its peak.
export function framePattern(targets) {
  const comps = targets.map(t => {
    if (t.kind === 'line') return { kind: 'uniform', w: 1 / Math.sqrt(shEnvelope(t.l)), period: periodForSH(t.l) };
    const pad = t.b - t.a > 0.020 ? 0.004 : 0;
    const c = flatChirp(t.a - pad, t.b + pad), dK = TAU * Math.abs(1 / c.p1 - 1 / c.p0);
    return { ...c, w: Math.sqrt(dK * L_PROG / (TAU * c.emin)) };
  });
  const wsum = comps.reduce((s, c) => s + c.w, 0) || 1;
  return comps.map(c => ({ ...c, w: c.w / wsum }));
}

// "NTT" written in the spectrum over time, as in SI Fig. S30 (time horizontal, wavelength vertical):
// vertical strokes are broadband bars (760-800 nm), the N's diagonal is a single line sweeping from
// 800 to 762 nm, and each T is a single line held at 797 nm with a bar for the stem.  The measured
// run took ~1000 s; the page plays it as a time-lapse.
export function nttSteps() {
  const band = { kind: 'bar', a: 0.760, b: 0.800 };
  const line = l => ({ kind: 'line', l });
  const seq = [];
  const push = (n, f) => { for (let i = 0; i < n; i++) seq.push(f(i, n)); };
  push(4, () => []);
  push(2, () => [band]);
  push(24, (i, n) => [line(0.800 - (0.800 - 0.762) * i / (n - 1))]);
  push(2, () => [band]);
  push(6, () => []);
  for (let k = 0; k < 2; k++) {
    push(12, () => [line(0.797)]);
    push(2, () => [band]);
    push(12, () => [line(0.797)]);
    if (k === 0) push(6, () => []);
  }
  push(4, () => []);
  return seq.map(targets => ({ targets, pattern: framePattern(targets) }));
}
export const NTT_REAL_SECONDS = 1000;

// Strokes drawn in (frame, wavelength in nm) -> one list of targets per frame.  Within each frame
// the wavelength ranges a stroke covers (widened by the pen) are merged; a short run becomes a line
// at its centre, a long run a bar.  {bar: [f0, f1, a, b]} fills frames f0..f1-1 from a to b nm.
export function rasterFrames(strokes, nframes, { pen = 1.0, minBar = 4.5 } = {}) {
  const cols = Array.from({ length: nframes }, () => []);
  const add = (c, lo, hi) => { if (c >= 0 && c < nframes) cols[c].push([lo, hi]); };
  for (const s of strokes) {
    if (s.bar) {
      const [f0, f1, a, b] = s.bar;
      for (let c = f0; c < f1; c++) add(c, a - pen, b + pen);
      continue;
    }
    const p = s.pts;
    for (let k = 0; k < p.length - 1; k++) {
      const [t0, l0] = p[k], [t1, l1] = p[k + 1];
      if (t0 === t1) { add(Math.floor(t0), Math.min(l0, l1) - pen, Math.max(l0, l1) + pen); continue; }
      const ta = Math.min(t0, t1), tb = Math.max(t0, t1);
      for (let c = Math.floor(ta); c < Math.ceil(tb); c++) {
        const u0 = Math.max(ta, c), u1 = Math.min(tb, c + 1);
        if (u1 <= u0) continue;
        const la = l0 + (l1 - l0) * (u0 - t0) / (t1 - t0), lb = l0 + (l1 - l0) * (u1 - t0) / (t1 - t0);
        add(c, Math.min(la, lb) - pen, Math.max(la, lb) + pen);
      }
    }
  }
  return cols.map(iv => {
    iv.sort((x, y) => x[0] - y[0]);
    const runs = [];
    for (const [lo, hi] of iv) {
      const r = runs[runs.length - 1];
      if (r && lo <= r[1]) r[1] = Math.max(r[1], hi); else runs.push([lo, hi]);
    }
    return runs.map(([lo, hi]) => hi - lo - 2 * pen < minBar
      ? { kind: 'line', l: (lo + hi) / 2000 }
      : { kind: 'bar', a: (lo + pen) / 1000, b: (hi - pen) / 1000 });
  });
}

// "CORNELL" as in Nature Fig. 3c: capitals between ~763 and ~797 nm, stems as bars from 760 to
// 800 nm, about 320 s in all with a new pattern every ~2.5 s (10 h of the same sequence took 15,400
// updates, SI Fig. S29), so 128 frames.  In the figure shorter wavelengths are at the top, so "up"
// in a letter is towards 760 nm.  Letters start where they do in the figure (frame = time / 2.5 s).
export const CORNELL_FRAMES = 128, CORNELL_REAL_SECONDS = 320;
const TOP = 763.5, MID = 780.5, BOT = 797.5, BAR = [760, 800];
function ellipse(t0, l0, rt, rl, deg0, deg1, n = 72) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = (deg0 + (deg1 - deg0) * i / n) * Math.PI / 180;
    pts.push([t0 + rt * Math.cos(f), l0 - rl * Math.sin(f)]);     // 90 degrees = top = short wavelength
  }
  return { pts };
}
const stem = f => ({ bar: [f, f + 2, BAR[0], BAR[1]] });
export const CORNELL_STROKES = [
  // C (8-45 s): an open ellipse
  ellipse(12.2, MID, 9.0, (BOT - TOP) / 2, 50, 310),
  // O (55-97 s)
  ellipse(30.5, MID, 8.4, (BOT - TOP) / 2, 0, 360),
  // R (107-142 s): stem, bowl, leg
  stem(43),
  { pts: [[45, TOP], [51.5, TOP], [53.6, 767], [54.1, 772.5], [53.6, 778], [51.5, 781.5], [45, 781.5]] },
  { pts: [[51, 781.5], [57, 799]] },
  // N (153-187 s): stems and a diagonal from 760 to 800 nm
  stem(61), { pts: [[63, 761], [73, 799]] }, stem(73),
  // E (198-230 s)
  stem(79), { pts: [[81, TOP], [92, TOP]] }, { pts: [[81, MID - 0.5], [91.5, MID - 0.5]] }, { pts: [[81, BOT], [92, BOT]] },
  // L L (240-271 s, 280-312 s)
  stem(96), { pts: [[98, BOT], [108.5, BOT]] },
  stem(112), { pts: [[114, BOT], [124.5, BOT]] },
];
export function cornellSteps() {
  return rasterFrames(CORNELL_STROKES, CORNELL_FRAMES).map(targets => ({ targets, pattern: framePattern(targets) }));
}

// ---------------------------------------------------------------- function 2: adapting (Nature Fig. 2c)
// In the experiment the pump wavelength was deliberately random-walked (sigma = 1 nm per 9.3 s step);
// a computer dithered the period by +-pi/L, measured the SH imbalance and corrected the period
// (SI S8C).  The efficiency recorded for each step is the one measured after the laser moved and
// before the correction, so drift and jumps show as dips.  Normalised P = sinc^2((dk - K) L / 2).
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sinc2 = x => (Math.abs(x) < 1e-12 ? 1 : (Math.sin(x) / x) ** 2);

export class DriftTracker {
  constructor({ L = 6500, lp0 = 1.600, sigma = 0.001, seed = 7, lmin = 1.52, lmax = 1.63 } = {}) {
    Object.assign(this, { L, sigma, lmin, lmax });
    this.rand = mulberry32(seed);
    this.lp = lp0;
    this.K = dkSHG(lp0 / 2);           // with feedback
    this.K0 = this.K;                  // fixed grating (no feedback)
    this.history = [];
    // eps(u) = ln sinc^2(u - pi/2) - ln sinc^2(u + pi/2), monotonic for |u| < pi/2
    const n = 4001, u = new Float64Array(n), e = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      u[i] = -Math.PI / 2 + 1e-3 + (Math.PI - 2e-3) * i / (n - 1);
      e[i] = Math.log(sinc2(u[i] - Math.PI / 2)) - Math.log(sinc2(u[i] + Math.PI / 2));
    }
    this.uTab = u; this.eTab = e;
    this.history.push({ lp: this.lp, periodOn: TAU / this.K, periodOff: TAU / this.K0, Pon: 1, Poff: 1, rescanned: 0, jump: 0 });
  }
  efficiency(K) { return sinc2((dkSHG(this.lp / 2) - K) * this.L / 2); }
  // largest pump jump (µm) the dither can still follow at the current wavelength: |dK| L / pi < 1
  captureRange() {
    const d = 1e-4, dkdl = Math.abs(dkSHG((this.lp + d) / 2) - dkSHG(this.lp / 2)) / d;
    return Math.PI / (this.L * dkdl);
  }
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this.rand();
    while (v === 0) v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  invert(eps) {
    const e = this.eTab, u = this.uTab;
    if (eps <= e[0]) return u[0];
    if (eps >= e[e.length - 1]) return u[u.length - 1];
    let a = 0, b = e.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (e[m] < eps) a = m; else b = m; }
    return u[a] + (u[b] - u[a]) * (eps - e[a]) / (e[b] - e[a]);
  }
  // One experimental step: the laser moves (random step, or a deliberate jump), the SH is measured,
  // then the controller re-centres the grating.  A jump replaces the random step.
  step(jump = 0) {
    const move = jump ? jump : this.sigma * this.gauss();
    this.lp = Math.min(this.lmax, Math.max(this.lmin, this.lp + move));
    const Pon = this.efficiency(this.K), Poff = this.efficiency(this.K0);
    let rescanned = 0;
    if (Pon < 0.1) {
      // outside the dither capture range (not used in the experiment; shown as "re-scan")
      const p0 = TAU / this.K;
      let best = this.K, bestP = -1;
      for (let i = -60; i <= 60; i++) {
        const K = TAU / (p0 + 0.0025 * i), Pk = this.efficiency(K);
        if (Pk > bestP) { bestP = Pk; best = K; }
      }
      this.K = best; rescanned = 1;
    }
    const Pp = this.efficiency(this.K + Math.PI / this.L), Pm = this.efficiency(this.K - Math.PI / this.L);
    const u = this.invert(Math.log(Math.max(Pp, 1e-300)) - Math.log(Math.max(Pm, 1e-300)));
    this.K += 2 * u / this.L;
    this.history.push({ lp: this.lp, periodOn: TAU / this.K, periodOff: TAU / this.K0, Pon, Poff, rescanned, jump: jump ? 1 : 0 });
    if (this.history.length > 400) this.history.shift();
  }
}

// ---------------------------------------------------------------- function 3: quantum light (PROPOSED)
// SPDC is SHG run backwards: a pump photon near 780 nm splits into a pair near 1560 nm.
// JSA(Ws, Wi) = alpha(Ws + Wi) * D(dk(Ws, Wi)), with the same grating response D as for SHG.
// Entanglement: Schmidt number K = 1/P, purity P = ||F F^+||_F^2 / ||F||_F^4 (no SVD needed), computed
// on the half Ws > Wi -- the pair as the two detectors see it after the wavelength splitter.
export const QUANTUM_PRESETS = {
  twins: () => [{ kind: 'uniform', w: 1, period: LAMBDA_DEG }],
  colours: () => [{ kind: 'uniform', w: 1, period: LAMBDA_DEG - 0.05 }],
  // 'off' needs a period well outside the 7.2 mm phase-matching window: +0.02 µm still gives
  // sinc^2 ~ 0.38 at degeneracy; +0.10 µm leaves only the sinc side lobes (~1%).
  off: () => [{ kind: 'uniform', w: 1, period: LAMBDA_DEG + 0.10 }],
  // (A two-period 'frequency-bin' preset was dropped: on this 7.2 mm slab the phase-matching lobes
  //  are broad because the dispersion is weak, so the two colour pairs overlap instead of separating.)
};
export const QTUNE_RANGE = [LAMBDA_DEG - 0.08, LAMBDA_DEG + 0.10];

// Grid: +-25 THz around 192.2 THz (1380-1795 nm), N = 140 (converged to ~2 %).  1 ps pump pulses: the
// phase-matching curves cross the pump band at a shallow angle, so shorter pulses smear each colour
// pair into a long streak.
export const QUANTUM_TAU = 1000;
export function jsa(pattern, { N = 140, spanTHz = 25, tau = QUANTUM_TAU, lc = 1.56, L = L_PROG } = {}) {
  const w0 = TAU * C / lc, wp0 = 2 * w0;
  const Wmax = TAU * spanTHz * 1e-3;                      // rad/fs
  const dW = 2 * Wmax / (N - 1);
  const sig = 2 * Math.sqrt(Math.LN2) / tau;               // pump amplitude bandwidth, rad/fs
  const ks = new Float64Array(N), lam = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const W = -Wmax + j * dW;
    ks[j] = kOfOmega(w0 + W);
    lam[j] = TAU * C / (w0 + W);
  }
  const kp = new Float64Array(2 * N - 1), alpha = new Float64Array(2 * N - 1);
  for (let s = 0; s < 2 * N - 1; s++) {
    const W = -2 * Wmax + s * dW;
    kp[s] = kOfOmega(wp0 + W);
    alpha[s] = Math.exp(-(W * W) / (2 * sig * sig));
  }
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  let norm = 0, peak = 0;
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      const s = a + b, al = alpha[s];
      if (al < 1e-8) continue;
      const [r, i] = gratingResponse(pattern, kp[s] - ks[a] - ks[b], L);
      re[a * N + b] = al * r; im[a * N + b] = al * i;
      const v = al * al * (r * r + i * i);
      norm += v;
      if (v > peak) peak = v;
    }
  }
  // purity on the half a > b (photon A = the higher-frequency photon)
  let n2 = 0, m2 = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < a; b++) n2 += re[a * N + b] ** 2 + im[a * N + b] ** 2;
  for (let a = 1; a < N; a++) {
    for (let a2 = a; a2 < N; a2++) {
      let mr = 0, mi = 0;
      const oa = a * N, ob = a2 * N, cmax = Math.min(a, a2);
      for (let c = 0; c < cmax; c++) {
        const ar = re[oa + c], ai = im[oa + c], br = re[ob + c], bi = im[ob + c];
        mr += ar * br + ai * bi; mi += ai * br - ar * bi;
      }
      m2 += (a === a2 ? 1 : 2) * (mr * mr + mi * mi);
    }
  }
  const purity = n2 > 0 ? m2 / (n2 * n2) : 0;
  const ref = (L / Math.PI) ** 2;
  // norm: pair rate as an integral over (Ws, Wi), independent of the grid size
  return { N, lam, re, im, norm: norm * dW * dW / ref, peak: peak / ref, purity, schmidt: purity > 0 ? 1 / purity : 0, tau };
}
