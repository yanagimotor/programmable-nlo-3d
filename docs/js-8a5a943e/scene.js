// The 3D lab: optical bench, programmable slab chip, beams, labels, cut-away and exploded views.
// Layout follows Nature 649, 330 (2026) Fig. 1 and the set-up cartoons (projector above the chip,
// pump in from the left, output to the right).  Scene units ~ mm in-plane, but the programmable area is
// drawn larger than the real 7.2 x 4.5 mm field and layer thicknesses are exaggerated (badge "not to scale").
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PAL, shRGB, rgbOf } from './colours.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABLE_Y = -8;
const CHIP = { lx: 15, lz: 10 };
const PROG = { lx: 10.4, lz: 6.5 };                // the lit (programmable) area: the real 7.2 x 4.5 mm field x 1.44
const HV_TIP = V(-6.2, 0, -4.0);                   // where the high-voltage probe touches the top electrode
const LAYERS = [                                  // top to bottom
  { id: 'ito', t: 0.035, color: PAL.ito },
  { id: 'pc', t: 0.85, color: PAL.pc },
  { id: 'sio2top', t: 0.22, color: PAL.sio2 },
  { id: 'core', t: 0.30, color: PAL.sin },
  { id: 'sio2bot', t: 0.22, color: PAL.sio2 },
  { id: 'si', t: 1.0, color: PAL.si },
];
let yTop = 0;
for (const L of LAYERS) { L.top = yTop; L.bot = yTop - L.t; L.y = yTop - L.t / 2; yTop = L.bot; }
const LY = Object.fromEntries(LAYERS.map(L => [L.id, L]));
// how far each layer is lifted when the chip is opened; the wide gap above the light guide shows its chi2
// pattern and the field lines reaching it
const EXPLODE = { ito: 7.0, pc: 5.8, sio2top: 4.6, core: 1.9, sio2bot: 0.95, si: 0 };
const YC = LY.core.y;                         // optical axis height (core centre)
const CHIP_BOTTOM = yTop;
const NPAT = 720;                              // samples of the 1D pattern across the programmable length
const CUT_NONE = 5.25, CUT_HALF = 0.0;
const SPEC = { gx: 24, gz: 0, sz: -5.7, x0: 17.5, x1: 30.5, h: 2.34 };   // spectrometer: grating, screen plane, x-span, height

// Camera per mode: viewing direction + the region that must be in frame (fitted to any aspect ratio).
const FITS = {
  overview: { from: V(-34, 33, 58), box: [V(-34, -8, -17), V(38.5, 16.5, 7)] },
  how: { from: V(-7.2, 6.2, 13.4), box: [V(-11.6, -2.7, -1.5), V(7.8, 0.4, 0.6)] },   // left margin: layer labels
  colors: { from: V(12, 20, 40), box: [V(-7.6, -2.7, -6.8), V(31.4, 1.6, 4)] },
  adapt: { from: V(-6, 30, 50), box: [V(-8, -8, -17), V(38.2, 16.5, 6)] },
  train: { from: V(-2, 30, 50), box: [V(-8, -8, -17), V(38.2, 16.5, 6)] },
  spatial: { from: V(2, 15, 22), box: [V(-7.6, -2.8, -3.4), V(27.4, 5.6, 3.4)] },
  spatiospec: { from: V(14, 11, 34), box: [V(-5.5, -2.8, -6.8), V(32, 5.3, 2.6)] },   // x from the lit area's start
  quantum: { from: V(10, 16, 32), box: [V(6.5, -2.8, -8.6), V(27.5, 1.5, 2)] },
  exploded: { from: V(-9, 8, 15), box: [V(-9, -2.8, -5), V(7.6, 8.4, 5)] },
};
const MODE_LABELS = {
  overview: ['chip', 'irLaser', 'green', 'slm', 'projLens', 'spec', 'pc', 'outLens', 'inLens', 'hv', 'pbs', 'filter'],   // priority order
  how: [],
  colors: ['chip', 'slm', 'outLens', 'spec'],
  adapt: ['chip', 'slm', 'spec', 'pc'],
  train: ['chip', 'slm', 'spec', 'pc'],
  spatial: ['chip', 'camera', 'slm', 'outLens'],
  spatiospec: ['chip', 'spec', 'slm', 'outLens'],
  quantum: ['chip', 'outLens', 'filter', 'dichroic', 'spdA', 'spdB'],    // the counter carries its own readout
};
// Spatial modes draw the transverse direction magnified: the window of +-450 um around the pump beam fills
// the width of the programmable area (PROG.lz / 0.9 = 7.2 units per mm), while along the beam the 7.2 mm
// grating fills PROG.lx (1.44 units per mm), so shapes are stretched 5x across the beam (badge "drawn 5x
// wider"; keep the texts in i18n.js in step).
const XMAG = PROG.lz / 0.9;
const CAM = { x: 19.6 };                       // camera of the spatial set-up (Fig. 4a), on the output axis
const PC = { x: 31, z: -15.5 };                // the control computer's monitor (back face at z - 0.2)
// breadboard carrying the illumination optics: top surface at y, thickness t, x and z extent, its four posts (the
// front right one stands behind the chip's corner, clear of the chip and the output beam)
const BOARD = { y: 9.2, t: 0.45, x0: -16.6, x1: 8.6, z0: 2.4, z1: -11.6, posts: [[-15.7, -10.8], [-15.7, 1.6], [7.8, -10.8], [7.8, -6.4]] };
const MIRROR_X = -5.5;                         // the periscope's two mirrors, close to the beam splitter (x = 0)
const LENS_TOP = 9.6;                          // top of the camera lens, just above the board
const IN_LENS = -10.2;                         // the coupling lens, close to the chip's input facet
const COLL_X = -22.5;                          // the fiber collimator (centre; 15 from the chip's input facet)
const TABLE = { x0: -36, x1: 41, z0: -20, z1: 14 };   // the optical table's top: x and z extent
const QUANTUM_ONLY = ['dichroic', 'spdA', 'spdB', 'coinc'];

// ----------------------------------------------------------------------------------- helpers
function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o });
}
const metal = () => std(PAL.metal, { metalness: 0.75, roughness: 0.32 });
const anod = () => std(PAL.black, { metalness: 0.35, roughness: 0.5 });
const glass = () => std(PAL.glass, { transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0, depthWrite: false });

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

// texture with soft stripes along v: shared by every beam so all beams flow at the same speed
function flowTexture(dashed) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(4, 128);
  for (let y = 0; y < 128; y++) {
    const s = 0.5 + 0.5 * Math.cos(2 * Math.PI * y / 128);
    const v = dashed ? (s > 0.45 ? 1 : 0.08) : 0.72 + 0.28 * s;
    for (let x = 0; x < 4; x++) {
      const i = 4 * (y * 4 + x);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v); img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function beamMaterial(rgb, gain, tex, opacity = 0.55) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(rgb[0] * gain, rgb[1] * gain, rgb[2] * gain), map: tex,
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

// cone/cylinder from p0 (radius r0) to p1 (radius r1); UVs rescaled so stripes have a fixed length
function beamMesh(p0, p1, r0, r1, mat, stripe = 1.6) {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 20, 1, true);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / stripe);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(p0).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  m.renderOrder = 5;
  m.userData.len0 = len;
  return m;
}

// move a beamMesh so that it runs from p0 to p1 (the stripes stretch with it)
function aimBeam(m, p0, p1) {
  const dir = new THREE.Vector3().subVectors(p1, p0), len = dir.length();
  m.position.copy(p0).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  m.scale.set(1, len / m.userData.len0, 1);
}

function lens(r, thick, mat) {                     // lens along x
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
  m.scale.set(thick, r, r);
  return m;
}

function post(x, z, yTop, r = 0.22) {
  const g = new THREE.Group();
  const h = yTop - TABLE_Y;
  g.add(mesh(new THREE.CylinderGeometry(r, r, h, 14), metal(), x, TABLE_Y + h / 2, z));
  g.add(mesh(new THREE.CylinderGeometry(r * 2.6, r * 2.6, 0.25, 18), anod(), x, TABLE_Y + 0.12, z));
  return g;
}

function cable(points, color = 0x30353c, r = 0.09) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = mesh(new THREE.TubeGeometry(curve, 64, r, 8, false), std(color, { roughness: 0.7 }), 0, 0, 0);
  m.userData.curve = curve;
  return m;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const toSRGB8 = v => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));

// the optical table / breadboard surface: dim silver with a grid of tapped holes, one per unit (texture repeat)
function holesTexture(base, holeCol, px = 64) {
  const c = makeCanvas(px, px), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, px, px);
  for (let i = 0; i < 160; i++) {                      // a faint brushed grain
    g.fillStyle = `rgba(255,255,255,${0.025 + 0.03 * ((i * 37) % 7) / 7})`;
    g.fillRect(0, (i * 13) % px, px, 1);
  }
  const r = px * 0.12, m = px / 2;
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(m, m, r * 1.45, 0, 7); g.fill();
  g.fillStyle = holeCol; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// a short post standing on the breadboard, from its top surface up to yTop
function boardPost(x, z, yTop, r = 0.22) {
  const g = new THREE.Group(), h = yTop - BOARD.y;
  g.add(mesh(new THREE.CylinderGeometry(r, r, h, 14), metal(), x, BOARD.y + h / 2, z));
  g.add(mesh(new THREE.CylinderGeometry(r * 2.4, r * 2.4, 0.18, 18), anod(), x, BOARD.y + 0.09, z));
  return g;
}

// the camera lens that images the SLM onto the chip (a 100 mm macro lens, pointing down through the board): front
// glass with a coated sheen, a wide ribbed focus ring, a distance scale, the barrel, a chrome bayonet and the mount
function cameraLens() {
  const g = new THREE.Group(), y0 = 5.06;
  const ribs = makeCanvas(256, 8), rg = ribs.getContext('2d');
  for (let x = 0; x < 256; x++) { rg.fillStyle = x % 8 < 4 ? '#1b1d21' : '#2c2f35'; rg.fillRect(x, 0, 1, 8); }
  const ribTex = canvasTex(ribs); ribTex.wrapS = THREE.RepeatWrapping; ribTex.repeat.set(4, 1);
  const scale = makeCanvas(512, 32), sg = scale.getContext('2d');
  sg.fillStyle = '#121416'; sg.fillRect(0, 0, 512, 32); sg.fillStyle = '#d8dde2';
  for (let i = 0; i < 20; i++) sg.fillRect(40 + i * 11, i % 5 ? 14 : 8, 2, i % 5 ? 8 : 16);
  sg.fillStyle = '#c94b3b'; sg.fillRect(300, 6, 3, 20);
  const black = std(0x141619, { metalness: 0.45, roughness: 0.38 });
  const cyl = (r0, r1, h, y, mat, seg = 48) => mesh(new THREE.CylinderGeometry(r1, r0, h, seg), mat, 0, y + h / 2, 0);
  g.add(mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.06, 48), std(0x24435f, { metalness: 0.3, roughness: 0.04, emissive: 0x1a3550, emissiveIntensity: 0.5 }), 0, y0, 0));
  g.add(cyl(1.82, 1.86, 0.5, y0 + 0.02, black));
  g.add(cyl(1.88, 1.88, 0.06, y0 + 0.02, metal()));
  g.add(cyl(1.98, 1.98, 2.1, y0 + 0.6, std(0xffffff, { map: ribTex, roughness: 0.85, metalness: 0.05 })));
  g.add(cyl(1.84, 1.84, 0.42, y0 + 2.75, std(0xffffff, { map: canvasTex(scale), roughness: 0.4, metalness: 0.3 })));
  g.add(cyl(1.76, 1.76, 0.95, y0 + 3.2, black));
  g.add(cyl(1.62, 1.62, 0.2, y0 + 4.15, std(0xd7dce1, { metalness: 0.95, roughness: 0.18 })));
  g.add(cyl(1.5, 1.5, LENS_TOP - (y0 + 4.35), y0 + 4.35, black));
  // the mount: a clamp ring resting on the board around the hole
  g.add(mesh(new THREE.TorusGeometry(2.25, 0.18, 10, 40), anod(), 0, BOARD.y + 0.12, 0).rotateX(Math.PI / 2));
  for (const a of [0.6, 2.7, 4.8]) g.add(box(0.5, 0.25, 0.9, anod(), 1.95 * Math.cos(a), BOARD.y + 0.1, 1.95 * Math.sin(a)));
  return g;
}

// side panel of a femtosecond laser module: white, an orange band along the top, two rules, the yellow safety labels
// and the laser-hazard triangle, screws at the corners (no lettering)
// panels laid on an instrument's face: pulled towards the camera in depth, so that they never flicker against the face
// seen from afar (the depth step there is ~0.006 units)
const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

function laserPanelTex() {
  const W = 512, H = 241, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f2f3ef'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ec7a1c'; g.fillRect(0, 0, W, Math.round(H * 0.11));
  g.fillStyle = '#5a5650'; g.fillRect(W * 0.17, H * 0.585, W * 0.75, 2);
  g.fillStyle = '#2a2a2a'; g.fillRect(W * 0.03, H * 0.79, W * 0.94, 2);
  for (const [a, b] of [[0.17, 0.33], [0.43, 0.6], [0.63, 0.83]]) {
    const x = W * a, w = W * (b - a), y = H * 0.835, h = H * 0.115;
    g.fillStyle = '#f4d40c'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#141414'; g.lineWidth = 2; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = 'rgba(20,20,20,0.55)';
    for (let k = 0; k < 3; k++) g.fillRect(x + 7, y + 7 + k * 6, w - 14, 2);
  }
  g.fillStyle = '#f4d40c'; g.strokeStyle = '#141414'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(W * 0.085, H * 0.84); g.lineTo(W * 0.115, H * 0.94); g.lineTo(W * 0.055, H * 0.94); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#4a4f57';
  for (const [x, y] of [[9, 9], [W - 9, 9], [9, H - 9], [W - 9, H - 9]]) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
  return canvasTex(c);
}

// a benchtop instrument case, w x h front and d deep (along z), its long edges rounded with radius r
function roundedCase(w, h, d, r, mat) {
  const b = 0.06, x0 = -w / 2 + b, x1 = w / 2 - b, y0 = -h / 2 + b, y1 = h / 2 - b, q = r - b, s = new THREE.Shape();
  s.moveTo(x0 + q, y0); s.lineTo(x1 - q, y0); s.quadraticCurveTo(x1, y0, x1, y0 + q);
  s.lineTo(x1, y1 - q); s.quadraticCurveTo(x1, y1, x1 - q, y1);
  s.lineTo(x0 + q, y1); s.quadraticCurveTo(x0, y1, x0, y1 - q);
  s.lineTo(x0, y0 + q); s.quadraticCurveTo(x0, y0, x0 + q, y0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 8 });
  geo.translate(0, 0, -(d - 2 * b) / 2);
  return mesh(geo, mat);
}

// ventilation slots on the sides of the CW laser's case (dark slots on the case colour)
function ventTex() {
  const W = 128, H = 180, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#e8e9e6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4a4d50';
  for (const [y0, rows] of [[10, 5], [112, 4]]) for (let r = 0; r < rows; r++) for (let k = 0; k < 4; k++) g.fillRect(12 + k * 28, y0 + r * 14, 20, 7);
  return canvasTex(c);
}

// cylinder from p0 (radius r0) to p1 (radius r1)
function rod(p0, p1, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(p1, p0), len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(r1, r0, len, 14), mat);
  m.position.copy(p0).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return m;
}

// ----------------------------------------------------------------------------------- shaders
// Both work in world coordinates; the chip group sits at the origin, unrotated.
const WORLD_VS = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Projected light between the lens and the chip.  The frustum runs from the lit area on the chip (half-sizes
// box.x, box.y at height y0) to the lens (half-size box.z at height box.w).  Each pixel marches along its view
// ray through the frustum; a point is as bright as the pattern where its ray from the lens lands on the chip.
// Seen at an angle, many thin sheets of light blur into a glow, so the faces of the frustum also carry the
// rays that land on the edges of the lit area, as sharp converging lines (the sheets of light in the paper's
// Fig. 1).  For the measured 2D patterns the texture is a copy smoothed along the beam (lowpass()).
const RAYS_FS = /* glsl */ `
uniform sampler2D map;
uniform float cellRep, cellOff, vHalf, gain, face, flow, y0, cutZ, topFade;
uniform vec3 color;
uniform vec4 box;
varying vec3 vPos;

float wave(float y) { return 0.8 + 0.2 * cos(6.2831853 * (y * 0.625 + flow)); }   // gentle flow down to the chip
// fading towards the lens, as in Fig. 1; to nothing where no lens is drawn (topFade 1)
float fade(float f) { return mix(1.0, 0.45, f) * (1.0 - topFade * smoothstep(0.55, 1.0, f)); }

// pattern value where the ray through p lands on the chip; rows kept half a texel inside the cell, so that
// neighbouring cells stacked in the same image never bleed in
float landing(vec3 p, float f) {
  float hx = mix(box.x, box.z, f), hz = mix(box.y, box.z, f);
  float u = 0.5 + 0.5 * p.x / hx, v = clamp(0.5 - 0.5 * p.z / hz, vHalf, 1.0 - vHalf);
  return texture2D(map, vec2(u, v * cellRep + cellOff)).g;
}

float bright(vec3 p) {
  float f = clamp((p.y - y0) / (box.w - y0), 0.0, 1.0);
  return p.z < cutZ ? landing(p, f) * fade(f) * wave(p.y) : 0.0;
}

// the ray lying in a face of the frustum, seen where the view ray crosses that face
float edge(vec3 p) {
  float f = (p.y - y0) / (box.w - y0);
  if (f < 0.01 || f > 0.99 || p.z > cutZ) return 0.0;                     // not the chip's surface or the lens
  return landing(p, f) * (1.0 - 0.6 * f) * fade(f) * wave(p.y);
}

// clip the ray parameter range [t0, t1] to the half-space n.p <= d
void bound(vec3 n, float d, vec3 ro, vec3 rd, inout float t0, inout float t1) {
  float dn = dot(n, rd), num = d - dot(n, ro);
  if (abs(dn) < 1e-7) { if (num < 0.0) t1 = -1.0; }
  else if (dn > 0.0) t1 = min(t1, num / dn);
  else t0 = max(t0, num / dn);
}

void main() {
  vec3 ro = cameraPosition, rd = normalize(vPos - cameraPosition);
  float kx = (box.z - box.x) / (box.w - y0), kz = (box.z - box.y) / (box.w - y0);
  float t0 = 0.0, t1 = 1e5;
  bound(vec3(1.0, -kx, 0.0), box.x - kx * y0, ro, rd, t0, t1);
  bound(vec3(-1.0, -kx, 0.0), box.x - kx * y0, ro, rd, t0, t1);
  bound(vec3(0.0, -kz, 1.0), box.y - kz * y0, ro, rd, t0, t1);
  bound(vec3(0.0, -kz, -1.0), box.y - kz * y0, ro, rd, t0, t1);
  bound(vec3(0.0, -1.0, 0.0), -y0, ro, rd, t0, t1);
  bound(vec3(0.0, 1.0, 0.0), box.w, ro, rd, t0, t1);
  if (t1 <= t0) discard;
  float dt = (t1 - t0) / float(STEPS);
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));   // dither
  float acc = 0.0;
  for (int i = 0; i < STEPS; i++) acc += bright(ro + rd * (t0 + (float(i) + j) * dt));
  float rim = 0.45 * edge(ro + rd * t1);                                    // far face, through the light
  if (t0 > 0.0) rim += edge(ro + rd * t0);                                 // near face (camera outside)
  gl_FragColor = vec4(color * (gain * acc * dt + face * rim), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// High voltage on the top electrode: a glow at the probe's contact and rings running out from it.
const RIPPLE_FS = /* glsl */ `
uniform float time, rings, gain, cutZ;
uniform vec2 c;
uniform vec3 color;
varying vec3 vPos;
void main() {
  if (vPos.z > cutZ) discard;
  float d = distance(vPos.xz, c), I = 1.3 * exp(-d * d / 0.12);
  for (int k = 0; k < 3; k++) {
    float ph = fract(time * 0.45 + float(k) / 3.0);
    float q = (d - 0.25 - 8.0 * ph) / (0.07 + 0.2 * ph);
    I += rings * exp(-q * q) * (1.0 - ph) * (1.0 - ph);
  }
  gl_FragColor = vec4(color * (gain * I), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ----------------------------------------------------------------------------------- the lab
export class Lab {
  constructor(container, { labelText, layerText, onSelect, onHover, quality = 'high' }) {
    this.container = container;
    this.labelText = labelText;
    this.layerText = layerText;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.components = {};       // id -> {group, label, div}
    this.pickables = [];
    this.beams = {};
    this.time = 0;
    this.quality = quality;
    this.mode = 'overview';
    this.labelsOn = true;
    this.blockers = [];                 // canvas-px rectangles covered by the page's overlays (set by app.js)
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = this.motionQuery.matches;
    const qs = new URLSearchParams(location.search);
    this.debugHide = qs.has('debug') && qs.get('hide') ? qs.get('hide').split(',') : null;

    const w = container.clientWidth || 800, h = container.clientHeight || 600;
    this.vw = w; this.vh = h;
    const low = quality === 'low';
    this.maxPR = low ? 1 : 2;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: low, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.maxPR));
    r.setSize(w, h);
    r.setClearColor(PAL.bg);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = !low;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);
    r.domElement.setAttribute('aria-hidden', 'true');
    r.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); setTimeout(() => location.reload(), 1500); });

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(PAL.bg, 110, 210);
    const cam = this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 500);
    cam.position.set(-34, 33, 58);

    const ctl = this.controls = new OrbitControls(cam, r.domElement);
    ctl.target.set(-1, -1, -3);
    ctl.enableDamping = true;
    ctl.dampingFactor = 0.08;
    ctl.minDistance = 3;
    ctl.maxDistance = 160;
    ctl.maxPolarAngle = Math.PI * 0.49;
    ctl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    ctl.update();
    this.tween = null;
    this.atView = null;

    this.composer = null;
    if (!low) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(scene, cam));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.3, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.flow = flowTexture(false);
    this.dash = flowTexture(true);
    this.clip = new THREE.Plane(V(0, 0, -1), CUT_NONE);
    this.cut = { cur: CUT_NONE, target: CUT_NONE };
    this.explode = { cur: 0, target: 0 };
    this.step = 4;                      // how-it-works step shown on the chip (4 = everything)
    this.pattern = new Float32Array(NPAT);
    this.patFrom = new Float32Array(NPAT);
    this.patTo = new Float32Array(NPAT);
    this.fade = null;
    this.flashes = [];
    this.pairRate = 1;

    this.buildLights();
    this.buildTable();
    this.buildChip();
    this.buildPumpArm();
    this.buildIllumination();
    this.buildOutputArm();
    this.buildCamera();
    this.buildSheet();
    this.buildSurface();
    this.buildElectronics();
    this.buildQuantum();
    this.buildFeedback();
    this.setupPicking();

    new ResizeObserver(() => this.resize()).observe(container);
  }

  // ------------------------------------------------------------------ registration and labels
  register(id, group, labelPos) {
    group.userData.compId = id;
    group.traverse(o => { if (o.isMesh) { o.userData.compId = id; this.pickables.push(o); } });
    const div = document.createElement('button');
    div.className = 'lbl';
    div.type = 'button';
    div.tabIndex = -1;               // the panel's component list is the keyboard route
    div.dataset.id = id;
    div.textContent = this.labelText(id);
    div.addEventListener('click', e => { e.stopPropagation(); this.select(id); });
    div.addEventListener('pointerenter', () => this.hover(id));
    div.addEventListener('pointerleave', () => this.hover(null));
    const label = new CSS2DObject(div);
    label.position.copy(labelPos);
    this.scene.add(label);
    this.scene.add(group);
    this.components[id] = { group, label, div };
    return group;
  }

  nameOf(id) {
    if (id === 'irLaser' && this.pumpIsQuantum) return this.labelText('qPump');
    if (id === 'filter' && this.mode === 'quantum') return this.labelText('qFilter');
    if (id === 'spec' && this.mode === 'adapt') return this.labelText('pmt');
    return this.labelText(id);
  }

  refreshLabels() {
    for (const [id, c] of Object.entries(this.components)) { c.div.textContent = this.nameOf(id); c.w = 0; }
    for (const L of this.layerLabels) { L.div.textContent = this.layerText(L.id); L.w = 0; }
    if (this.fbDiv) this.fbDiv.textContent = this.labelText('__fb');
    this.updateCounter();
  }

  setLabelsVisible(on) { this.labelsOn = on; }

  // decided every frame: mode whitelist + hover/selection, hidden when the anchor is off-screen
  updateLabels() {
    const list = MODE_LABELS[this.mode] || [];
    const tmp = this._tmpV || (this._tmpV = new THREE.Vector3());
    // priority: the selected part, the hovered part, then the mode's list in order. A label that would
    // overlap one already placed, or the page's own overlays (badge, buttons, legend), is left out.
    const order = [];
    if (this.selected) order.push(this.selected);
    if (this.hovered && this.hovered !== this.selected) order.push(this.hovered);
    // with the chip opened up, its layer labels are the ones to read
    if (this.labelsOn && this.explode.cur < 0.5) for (const id of list) if (id !== this.selected && id !== this.hovered) order.push(id);
    const placed = [];
    const hits = (r, rects) => { for (const b of rects) if (r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0) return true; return false; };
    for (const c of Object.values(this.components)) c.show = false;
    for (const id of order) {
      const c = this.components[id];
      if (!c || !this.isShown(c.group)) continue;
      tmp.copy(c.label.position).project(this.camera);
      if (tmp.z > 1 || Math.abs(tmp.x) > 0.98 || Math.abs(tmp.y) > 0.95) continue;
      if (!c.w) { c.w = c.div.offsetWidth; c.h = c.div.offsetHeight; }
      if (!c.w) { c.show = true; continue; }          // not laid out yet: show it once so it can be measured
      // slide the pill along so that it stays inside the canvas
      const px = (tmp.x + 1) / 2 * this.vw, py = (1 - tmp.y) / 2 * this.vh, half = c.w / 2 + 6;
      let cx = 0.5;
      if (px + half > this.vw) cx = 0.5 + (px + half - this.vw) / c.w;
      else if (px - half < 0) cx = 0.5 - (half - px) / c.w;
      cx = Math.min(1, Math.max(0, cx));
      const x0 = px - cx * c.w;
      const r = { x0: x0 - 3, x1: x0 + c.w + 3, y0: py - c.h / 2 - 2, y1: py + c.h / 2 + 2 };
      const pinned = id === this.selected || id === this.hovered;
      if (!pinned && (hits(r, this.blockers) || hits(r, placed))) continue;
      placed.push(r);
      c.label.center.x = cx;
      c.show = true;
    }
    for (const [id, c] of Object.entries(this.components)) {
      c.label.visible = c.show;
      c.div.classList.toggle('sel', id === this.selected);
    }
  }

  // ------------------------------------------------------------------ lights / table
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdde7f2, 0x1a1d22, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-22, 42, 26);
    key.castShadow = true;
    key.shadow.mapSize.set(this.quality === 'low' ? 1024 : 2048, this.quality === 'low' ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -48, right: 48, top: 30, bottom: -30, near: 1, far: 130 });
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.45);
    fill.position.set(30, 12, -24);
    this.scene.add(fill);
  }

  buildTable() {
    // an optical table: dim silver, tapped holes on a regular grid (one per unit)
    const tw = TABLE.x1 - TABLE.x0, td = TABLE.z1 - TABLE.z0, tx = (TABLE.x0 + TABLE.x1) / 2, tz = (TABLE.z0 + TABLE.z1) / 2;
    const tex = holesTexture('#6f767e', '#1d2024');
    tex.repeat.set(tw, td);
    const top = box(tw, 1, td, std(0xffffff, { map: tex, roughness: 0.6, metalness: 0.45 }), tx, TABLE_Y - 0.5, tz);
    top.castShadow = false;
    this.scene.add(top);
    const edge = box(tw + 0.4, 2.2, td + 0.4, std(0x3a3f46, { roughness: 0.5, metalness: 0.4 }), tx, TABLE_Y - 2.1, tz);
    edge.castShadow = false;
    this.scene.add(edge);
  }

  // ------------------------------------------------------------------ the chip
  buildChip() {
    const chip = new THREE.Group();
    this.layerMeshes = {};
    this.caps = {};
    this.layerLabels = [];
    // 1D pattern texture (stretched across the programmable width), SLM face uses the same texture
    this.patCanvas = makeCanvas(1024, 1);
    this.patCtx = this.patCanvas.getContext('2d');
    this.patImg = this.patCtx.createImageData(1024, 1);
    this.patTex = canvasTex(this.patCanvas);
    this.capPC = makeCanvas(1500, 2);
    this.capPCTex = canvasTex(this.capPC);
    this.capCore = makeCanvas(1500, 2);
    this.capCoreTex = canvasTex(this.capCore);

    for (const L of LAYERS) {
      const clip = L.id !== 'si' ? [this.clip] : [];
      const mat = std(L.color, {
        roughness: L.id === 'si' ? 0.4 : 0.6, metalness: L.id === 'si' ? 0.35 : 0.05,
        clippingPlanes: clip, clipShadows: true,
        // a thin see-through sheet: it must not hide the light on the photoconductor when the chip is opened
        ...(L.id === 'ito' ? { transparent: true, opacity: 0.2, depthWrite: false } : {}),
      });
      const m = mesh(new THREE.BoxGeometry(CHIP.lx, L.t, CHIP.lz), mat, 0, L.y, 0);
      chip.add(m);
      this.layerMeshes[L.id] = m;
      if (L.id !== 'si') {
        const map = L.id === 'pc' ? this.capPCTex : L.id === 'core' ? this.capCoreTex : null;
        const capMat = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : L.color, map, roughness: 0.7,
          emissive: map ? 0xffffff : 0x000000, emissiveMap: map, emissiveIntensity: map ? 0.35 : 0 });
        const cap = mesh(new THREE.PlaneGeometry(CHIP.lx, L.t), capMat, 0, 0, 0, false);
        cap.visible = false;
        m.add(cap);
        this.caps[L.id] = cap;
      }
      const div = document.createElement('div');
      div.className = 'lbl layer';
      div.textContent = this.layerText(L.id);
      const lab = new CSS2DObject(div);
      lab.position.set(-CHIP.lx / 2 - 0.35, 0, CHIP.lz / 2);
      lab.center.set(1, 0.5);
      lab.visible = false;
      m.add(lab);
      this.layerLabels.push({ id: L.id, div, obj: lab });
    }

    // programming light on the chip (brightness from the pattern), as in Fig. 1a; added on top of the dark
    // surface so that it glows like projected light
    this.lightColor = new THREE.Color(PAL.light).multiplyScalar(1.5);
    const lightMat = new THREE.MeshBasicMaterial({
      alphaMap: this.patTex, color: this.lightColor.clone(), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [this.clip],
    });
    this.lightPlane = mesh(new THREE.PlaneGeometry(PROG.lx, PROG.lz), lightMat, 0, LY.ito.t / 2 + 0.004, 0, false);
    this.lightPlane.rotation.x = -Math.PI / 2;
    this.lightPlane.renderOrder = 6;
    this.layerMeshes.ito.add(this.lightPlane);
    // With the chip opened up, the same light lands on the photoconductor, which absorbs it (the electrode
    // above it is transparent); the light guide shows the chi2 written there.  Both share the pattern texture.
    const onTop = (L, m) => { m.rotation.x = -Math.PI / 2; m.position.y = L.t / 2 + 0.004; m.renderOrder = 6; m.visible = false; this.layerMeshes[L.id].add(m); return m; };
    this.lightPC = onTop(LY.pc, new THREE.Mesh(this.lightPlane.geometry, lightMat));
    this.chiMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.chi2).multiplyScalar(1.15), alphaMap: this.patTex,
      transparent: true, depthWrite: false });
    this.chiPlane = onTop(LY.core, new THREE.Mesh(this.lightPlane.geometry, this.chiMat));

    // the high voltage spreading over the top electrode from the probe's contact (see buildElectronics)
    this.rippleMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, rings: { value: 1 }, gain: { value: 0.5 }, cutZ: { value: CUT_NONE },
        c: { value: new THREE.Vector2(HV_TIP.x, HV_TIP.z) }, color: { value: new THREE.Color(PAL.spark) },
      },
      vertexShader: WORLD_VS, fragmentShader: RIPPLE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.ripple = mesh(new THREE.PlaneGeometry(CHIP.lx, CHIP.lz), this.rippleMat, 0, LY.ito.t / 2 + 0.008, 0, false);
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.renderOrder = 7;
    this.layerMeshes.ito.add(this.ripple);

    // bias-field arrows (instanced) and the in-core pump / SH strips, shown on the cut face
    const top = LY.sio2top.top - 0.02, bot = LY.si.top + 0.02, len = top - bot;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.field).multiplyScalar(1.1), transparent: true, opacity: 0.95 });
    const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, len - 0.13, 8).translate(0, bot + 0.13 + (len - 0.13) / 2, 0);
    const tipGeo = new THREE.ConeGeometry(0.055, 0.13, 12).rotateX(Math.PI).translate(0, bot + 0.065, 0);
    this.arrowShafts = new THREE.InstancedMesh(shaftGeo, this.arrowMat, 64);
    this.arrowTips = new THREE.InstancedMesh(tipGeo, this.arrowMat, 64);
    this.arrowShafts.count = this.arrowTips.count = 0;
    this.arrows = new THREE.Group();
    this.arrows.add(this.arrowShafts, this.arrowTips);
    chip.add(this.arrows);
    // the same field with the chip opened up: lines from the lit parts of the photoconductor down to the substrate
    // (the bottom electrode), through the claddings and the light guide; unit shaft from y = 0 down to y = -1
    const fieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.field) });
    this.fieldShafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6).translate(0, -0.5, 0), fieldMat, 200);
    this.fieldTips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.16, 10).rotateX(Math.PI).translate(0, 0.08, 0), fieldMat, 200);
    this.fieldShafts.count = this.fieldTips.count = 0;
    this.fieldLines = new THREE.Group();
    this.fieldLines.add(this.fieldShafts, this.fieldTips);
    this.fieldLines.visible = false;
    this.fieldPts = [];
    chip.add(this.fieldLines);
    const stripMat = (rgb, gain, tex) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(rgb[0] * gain, rgb[1] * gain, rgb[2] * gain), map: tex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    this.corePump = mesh(new THREE.PlaneGeometry(CHIP.lx, 0.06), stripMat(rgbOf(PAL.pump), 0.8, this.dash), 0, YC, 0, false);
    // SH from the start of the grating to the output facet; its brightness along the way: setSHProfile
    const g0 = -PROG.lx / 2, sLen = CHIP.lx / 2 - g0;
    this.shCanvas = makeCanvas(256, 4);
    this.shTex = canvasTex(this.shCanvas, false);
    // a deep blue-violet whose opacity is the power (not an additive glow, which washed out to white on the light core)
    this.coreSH = mesh(new THREE.PlaneGeometry(sLen, 0.24), new THREE.MeshBasicMaterial({ alphaMap: this.shTex, transparent: true, depthWrite: false,
      color: new THREE.Color().setRGB(...shRGB(780), THREE.SRGBColorSpace).multiplyScalar(0.85) }), g0 + sLen / 2, YC, 0, false);
    this.setSHProfile(null);
    this.coreSH.renderOrder = 7; this.corePump.renderOrder = 7.5;     // the thin pump line stays visible on the new light
    chip.add(this.corePump, this.coreSH);

    // the projected light between the projection lens and the chip: a volume (frustum) in which every ray is
    // as bright as the point of the pattern it lands on, so the rays carry the projected image
    const R = this.rayR = { y0: 0.01, h: 5.0, a: 1.1 };   // bottom height, top height (lens), top half-size
    const hull = new THREE.BoxGeometry(2, 1, 2), hp = hull.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const f = hp.getY(i) + 0.5;
      hp.setXYZ(i, hp.getX(i) * (PROG.lx / 2 + (R.a - PROG.lx / 2) * f), R.y0 + (R.h - R.y0) * f,
        hp.getZ(i) * (PROG.lz / 2 + (R.a - PROG.lz / 2) * f));
    }
    this.rayBase = { gain: 0.06, face: 0.32 };       // volume glow, and the sharp rays on the frustum's faces
    this.rayMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.patTex }, cellRep: { value: 1 }, cellOff: { value: 0 }, vHalf: { value: 0 }, topFade: { value: 0 },
        color: { value: new THREE.Color(PAL.light) }, gain: { value: this.rayBase.gain }, face: { value: this.rayBase.face }, flow: { value: 0 },
        box: { value: new THREE.Vector4(PROG.lx / 2, PROG.lz / 2, R.a, R.h) }, y0: { value: R.y0 }, cutZ: { value: CUT_NONE },
      },
      defines: { STEPS: this.quality === 'low' ? 16 : 40 },
      vertexShader: WORLD_VS, fragmentShader: RAYS_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    });
    this.cone = new THREE.Mesh(hull, this.rayMat);    // drawn from its far side: each pixel marches through once
    this.cone.renderOrder = 4;
    chip.add(this.cone);

    // mount and stage
    const mount = new THREE.Group();
    mount.add(box(13, CHIP_BOTTOM - (TABLE_Y + 2.2), 8.5, metal(), 0, (CHIP_BOTTOM + TABLE_Y + 2.2) / 2, 0));
    mount.add(box(16, 1.1, 11, anod(), 0, TABLE_Y + 0.55, 0));
    mount.add(box(14, 1.1, 10, metal(), 0, TABLE_Y + 1.65, 0));
    const knob = mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 20), anod(), 0, TABLE_Y + 1.65, 5.6);
    knob.rotation.x = Math.PI / 2;
    mount.add(knob);
    chip.add(mount);
    // label on the front edge, away from the probe's corner (its glowing needle would read as the leader line)
    this.chipGroup = this.register('chip', chip, V(-3.5, 0.8, 5.4));
    this.pickables = this.pickables.filter(m => m !== this.cone);      // the light in the air is not a click target
    this.applyPattern(this.pattern);
  }

  // pattern = Float32Array(NPAT) of illumination intensity 0..1 across the programmable length.
  // Changes cross-fade over `fade` seconds (instant with reduced motion).
  setPattern(p, { fade = 0.3 } = {}) {
    if (this.pat2DOn) { this.setPattern2D(null); fade = 0; }
    if (this.reduced || fade <= 0) {
      this.fade = null;
      this.applyPattern(p);
      return;
    }
    this.patFrom.set(this.pattern);
    this.patTo.set(p);
    this.fade = { t: 0, dur: fade };
  }

  applyPattern(p, final = true) {
    if (p !== this.pattern) this.pattern.set(p);
    const d = this.patImg.data;
    for (let x = 0; x < 1024; x++) {
      const v = this.pattern[Math.min(NPAT - 1, Math.floor(x / 1024 * NPAT))];
      const e = Math.min(1, Math.min(x, 1023 - x) / 6);
      d[4 * x] = d[4 * x + 1] = d[4 * x + 2] = Math.round(255 * v * e); d[4 * x + 3] = 255;
    }
    this.patCtx.putImageData(this.patImg, 0, 0);
    this.patTex.needsUpdate = true;
    if (final) { this.drawCaps(); this.updateArrows(); if (!this.pat2DOn) this.setFieldPts1D(); }
    let mean = 0;
    for (let i = 0; i < NPAT; i++) mean += this.pattern[i];
    this.lightGain = 0.7 / (0.4 + 0.6 * mean / NPAT);   // 1 for half the area lit, 0.7 for all of it
  }

  // A measured 2D pattern (Figs 4, 5): grey image whose columns are z sampled every 17 µm and whose rows
  // are the transverse window around the pump beam; `cells` patterns may be stacked vertically in one
  // image.  Drawn over the programmable area and on the SLM face.  null returns to the 1D pattern.
  setPattern2D(img, { cell = 0, cells = 1 } = {}) {
    const lm = this.lightPlane.material, sm = this.slmFace.material, cm = this.chiMat, ru = this.rayMat.uniforms;
    if (!img) {
      if (!this.pat2DOn) return;
      this.pat2DOn = false;
      lm.alphaMap = this.patTex; sm.map = this.patTex; cm.alphaMap = this.patTex;
      lm.needsUpdate = sm.needsUpdate = cm.needsUpdate = true;
      ru.map.value = this.patTex; ru.cellRep.value = 1; ru.cellOff.value = 0; ru.vHalf.value = 0;
      this.setFieldPts1D();
      return;
    }
    let tex = this.pat2DTex;
    if (!tex || tex.image !== img) {
      if (tex) tex.dispose();
      if (this.rayTex) this.rayTex.dispose();
      tex = this.pat2DTex = new THREE.Texture(img);
      tex.generateMipmaps = false;                    // cells are stacked: mipmaps would bleed between them
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      this.rayTex = this.lowpass(img);
    }
    tex.repeat.set(1, 1 / cells);
    tex.offset.set(0, 1 - (cell + 1) / cells);
    ru.map.value = this.rayTex; ru.cellRep.value = 1 / cells; ru.cellOff.value = 1 - (cell + 1) / cells;
    ru.vHalf.value = 0.5 * cells / (img.naturalHeight || img.height);
    if (!this.pat2DOn || lm.alphaMap !== tex) {
      lm.alphaMap = tex; sm.map = tex; cm.alphaMap = tex;
      lm.needsUpdate = sm.needsUpdate = cm.needsUpdate = true;
    }
    this.pat2DOn = true;
    this.setFieldPts2D(cell, cells);
  }

  // Where the field lines of the opened chip stand: lit parts of the pattern, at most `max` x positions per row.
  // The middle of each lit stretch; a long stretch (e.g. the whole area lit) gets one every PROG.lx / max.
  litXs(max) {
    const p = this.pattern, xs = [], step = PROG.lx / max;
    let start = -1;
    for (let i = 0; i <= NPAT; i++) {
      const lit = i < NPAT && p[i] > 0.5;
      if (lit && start < 0) start = i;
      if (!lit && start >= 0) {
        const a = PROG.lx * (start / NPAT - 0.5), b = PROG.lx * (i / NPAT - 0.5), k = Math.max(1, Math.floor((b - a) / step));
        for (let j = 0; j < k; j++) xs.push(a + (b - a) * (j + 0.5) / k);
        start = -1;
      }
    }
    const keep = Math.max(1, Math.ceil(xs.length / max));
    return xs.filter((_, i) => i % keep === 0);
  }

  setFieldPts1D() {
    const xs = this.litXs(26), pts = [];
    for (const z of [-2.6, -1.3, 0, 1.3, 2.6]) for (const x of xs) pts.push(x, z);
    this.fieldPts = pts;
    this.fieldDirty = true;
  }

  // 2D patterns: a grid over the lit area, kept where the beam-smoothed copy of the pattern (lowpass) is bright
  setFieldPts2D(cell, cells) {
    const L = this.rayLP, pts = [];
    if (L) {
      const nx = 26, nz = 7;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const u = (i + 0.5) / nx, v = (j + 0.5) / nz;                       // v = 0.5 - z / PROG.lz, as on the light plane
        const row = Math.min(L.h - 1, Math.floor((cell + 1 - v) / cells * L.h)), col = Math.min(L.w - 1, Math.floor(u * L.w));
        if (L.g[row * L.w + col] > 0.42 * 255) pts.push(PROG.lx * (u - 0.5), PROG.lz * (0.5 - v));
      }
    }
    this.fieldPts = pts;
    this.fieldDirty = true;
  }

  // field lines from the photoconductor's underside (lifted by `e`) to the top of the substrate
  updateFieldLines() {
    const e = this.explode.cur, yTop = LY.pc.bot + EXPLODE.pc * e, yBot = LY.si.top, len = Math.max(0.01, yTop - yBot - 0.16);
    if (!this.fieldDirty && this._fieldE === e) return;
    this.fieldDirty = false; this._fieldE = e;
    const m = this._m4 || (this._m4 = new THREE.Matrix4()), pts = this.fieldPts;
    const n = Math.min(200, pts.length / 2);
    for (let k = 0; k < n; k++) {
      const x = pts[2 * k], z = pts[2 * k + 1];
      this.fieldShafts.setMatrixAt(k, m.makeScale(1, len, 1).setPosition(x, yTop, z));
      this.fieldTips.setMatrixAt(k, m.identity().setPosition(x, yBot, z));
    }
    this.fieldShafts.count = this.fieldTips.count = n;
    this.fieldShafts.instanceMatrix.needsUpdate = this.fieldTips.instanceMatrix.needsUpdate = true;
    this.fieldShafts.computeBoundingSphere(); this.fieldTips.computeBoundingSphere();
  }

  // SH brightness along the light guide in "How it works" (the strip on the cut face): P = SH power at evenly
  // spaced points from the start to the end of the grating, relative to the phase-matched grating at its end;
  // null = that matched grating.  The strip's opacity is sqrt(P), as the paper draws the light inside the chip
  // (Fig. 4b), so that weak light (step 7) still shows; after the grating the light runs on unchanged to the output.
  setSHProfile(P) {
    const c = this.shCanvas, g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d = img.data;
    const g0 = -PROG.lx / 2, sLen = CHIP.lx / 2 - g0, n = P ? P.length - 1 : 0;
    for (let x = 0; x < c.width; x++) {
      const X = g0 + sLen * (x + 0.5) / c.width, f = Math.min(1, (X - g0) / PROG.lx);
      let p = f * f;                                            // matched grating: P grows as the length squared
      if (P) { const q = f * n, i = Math.min(n - 1, Math.floor(q)); p = P[i] + (P[i + 1] - P[i]) * (q - i); }
      const a = Math.round(255 * Math.sqrt(Math.min(1, Math.max(0, p))));
      for (let y = 0; y < c.height; y++) { const k = 4 * (y * c.width + x); d[k] = d[k + 1] = d[k + 2] = a; d[k + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    this.shTex.needsUpdate = true;
  }

  // The measured patterns are fine gratings sampled every 17 µm, so neighbouring columns alternate; in the air
  // that only averages to a flat glow.  The rays use a copy averaged over 9 columns (~150 µm) along the beam,
  // which keeps the slow structure (beat bands, curved fringes, the Airy band) that the rays can carry.
  lowpass(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, R = 4;
    const c = makeCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data, out = g.createImageData(w, h), o = out.data;
    for (let y = 0; y < h; y++) {
      const row = 4 * y * w;
      let s = 0;
      for (let x = 0; x <= R && x < w; x++) s += d[row + 4 * x + 1];
      for (let x = 0; x < w; x++) {
        const lo = Math.max(0, x - R), hi = Math.min(w - 1, x + R), i = row + 4 * x;
        o[i] = o[i + 1] = o[i + 2] = Math.round(s / (hi - lo + 1)); o[i + 3] = 255;
        if (x + R + 1 < w) s += d[row + 4 * (x + R + 1) + 1];
        if (x - R >= 0) s -= d[row + 4 * (x - R) + 1];
      }
    }
    g.putImageData(out, 0, 0);
    const gr = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gr[i] = o[4 * i + 1];
    this.rayLP = { w, h, g: gr };                     // kept for the field lines of the opened chip
    const t = new THREE.CanvasTexture(c);
    t.generateMipmaps = false;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  }

  drawCaps() {
    const p = this.pattern, conductive = this.step >= 2, chi = this.step >= 4;
    const pc = rgbOf(PAL.pc), on = rgbOf(PAL.pcOn), core = rgbOf(PAL.sin), orange = rgbOf(PAL.chi2);
    // the hex colours are sRGB; convert to linear for blending, back for the canvas
    const lin = c => c.map(v => Math.pow(v, 2.2));
    const [pcL, onL, coreL, orL] = [pc, on, core, orange].map(lin);
    for (const [cv, tex, kind] of [[this.capPC, this.capPCTex, 'pc'], [this.capCore, this.capCoreTex, 'core']]) {
      const g = cv.getContext('2d'), img = g.createImageData(cv.width, cv.height), d = img.data;
      const A = kind === 'pc' ? pcL : coreL, B = kind === 'pc' ? onL : orL;
      for (let x = 0; x < cv.width; x++) {
        const X = -CHIP.lx / 2 + CHIP.lx * (x + 0.5) / cv.width;
        let v = 0;
        if (Math.abs(X) < PROG.lx / 2) v = p[Math.min(NPAT - 1, Math.max(0, Math.floor((X + PROG.lx / 2) / PROG.lx * NPAT)))];
        const f = kind === 'pc' ? (conductive ? v : 0) : (chi ? Math.min(1, v * 1.2) : 0);
        const r = toSRGB8(A[0] + (B[0] - A[0]) * f), gch = toSRGB8(A[1] + (B[1] - A[1]) * f), b = toSRGB8(A[2] + (B[2] - A[2]) * f);
        for (let y = 0; y < cv.height; y++) { const k = 4 * (y * cv.width + x); d[k] = r; d[k + 1] = gch; d[k + 2] = b; d[k + 3] = 255; }
      }
      g.putImageData(img, 0, 0);
      tex.needsUpdate = true;
    }
    this.caps.core.material.emissiveIntensity = chi ? 0.75 : 0.35;
  }

  updateArrows() {
    const xs = this.litXs(30);
    const m = this._m4 || (this._m4 = new THREE.Matrix4());
    let n = 0;
    for (; n < xs.length && n < 64; n++) {
      m.makeTranslation(xs[n], 0, 0);
      this.arrowShafts.setMatrixAt(n, m);
      this.arrowTips.setMatrixAt(n, m);
    }
    this.arrowShafts.count = this.arrowTips.count = n;
    this.arrowShafts.instanceMatrix.needsUpdate = this.arrowTips.instanceMatrix.needsUpdate = true;
  }

  setStep(n) {
    this.step = n;
    this.drawCaps();
    this.arrowMat.opacity = n >= 4 ? 0.4 : 0.95;
  }

  setCut(on) { this.cut.target = on ? CUT_HALF : CUT_NONE; }
  setExploded(on) { this.explode.target = on ? 1 : 0; }

  // ------------------------------------------------------------------ pump side
  // Two pump lasers, as in the experiments, drawn after the instruments used (no lettering): a tunable CW laser, an
  // off-white benchtop instrument with a touch screen (How it works and Fig. 2), and a high-power femtosecond erbium
  // fiber laser (Figs 3-5): slim modules standing on their long edges side by side on a base plate, dark frames with
  // white side panels and an orange band, joined by short yellow fibers.  One blue fiber runs from the collimator to
  // the laser in use (setActiveLaser); one lens close to the chip focuses the beam into the light guide.
  buildPumpArm() {
    const laser = new THREE.Group();
    // CW laser: 220 x 130 mm front, 385 mm deep, rounded long edges, on feet.  Front: the touch screen (it shows the
    // pump wavelength), a USB socket, the round power key, the green ACTIVE key (lit while it pumps), and the fiber
    // output under a white cover; vents on both sides.
    const cw = { x: -28.5, w: 5.4, h: 3.2, d: 9.4 }, fz = -7.0, cz = fz - cw.d / 2, cy = TABLE_Y + 0.15 + cw.h / 2;
    const top = cy + cw.h / 2, xl = cw.x - cw.w / 2;
    const caseM = std(0xe8e9e6, { roughness: 0.45, metalness: 0.08 });
    const cwCase = roundedCase(cw.w, cw.h, cw.d, 0.38, caseM);
    cwCase.position.set(cw.x, cy, cz);
    laser.add(cwCase);
    for (const dz of [0.5, cw.d - 0.6]) for (const s of [-1, 1])
      laser.add(box(0.55, 0.15, 0.45, std(0xc9cccf, { roughness: 0.6 }), cw.x + s * (cw.w / 2 - 0.6), TABLE_Y + 0.075, fz - dz));
    this.cwCanvas = makeCanvas(256, 192);
    this.cwTex = canvasTex(this.cwCanvas);
    laser.add(box(2.95, 2.25, 0.03, std(0x15171a, { roughness: 0.35 }), cw.x - 0.42, cy + 0.05, fz + 0.015));
    this.cwScreen = box(2.75, 2.05, 0.04, std(0x05080c, { emissive: 0xffffff, emissiveMap: this.cwTex, emissiveIntensity: 0.9 }),
      cw.x - 0.42, cy + 0.05, fz + 0.03);
    this.cwScreen.material.userData.noHighlight = true;
    laser.add(this.cwScreen, box(0.14, 0.32, 0.03, std(0x2a2d31), xl + 0.34, top - 0.86, fz + 0.015));
    const pwr = mesh(new THREE.TorusGeometry(0.19, 0.04, 8, 28), std(0x2a8a4a, { emissive: 0x40ff70, emissiveIntensity: 0.7 }), xl + 0.34, top - 2.62, fz + 0.03);
    pwr.material.userData.noHighlight = true;
    const pkey = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 24), std(0xdfe2e4, { roughness: 0.5 }), xl + 0.34, top - 2.62, fz + 0.03);
    pkey.rotation.x = Math.PI / 2;
    laser.add(pwr, pkey);
    this.cwLed = box(0.5, 0.36, 0.06, std(0x2a6a40, { emissive: 0x40ff70, emissiveIntensity: 0 }), cw.x + 1.51, top - 0.83, fz + 0.03);
    this.cwLed.material.userData.noHighlight = true;
    laser.add(this.cwLed);
    const px = cw.x + 1.51, py = top - 2.02;
    laser.add(box(0.84, 1.33, 0.2, std(0xf1f2ef, { roughness: 0.4 }), px, py, fz + 0.1));
    for (let k = 0; k < 4; k++) laser.add(box(0.07, 0.16, 0.02, std(0x3a3d40), px - 0.21 + 0.14 * k, py - 0.48, fz + 0.205));
    const port = mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 16), metal(), px, py - 0.18, fz + 0.35);
    port.rotation.x = Math.PI / 2;
    laser.add(port);
    const vt = ventTex();
    for (const s of [-1, 1]) {
      const v = mesh(new THREE.PlaneGeometry(1.7, 2.4), std(0xffffff, { map: vt, roughness: 0.45, metalness: 0.08, ...DECAL }), cw.x + s * (cw.w / 2 + 0.012), cy + 0.1, fz - 1.3, false);
      v.rotation.y = s * Math.PI / 2;
      laser.add(v);
    }
    // the case's outline, for the check that no fiber runs through a laser (not drawn)
    const cwHull = new THREE.Mesh(new THREE.BoxGeometry(cw.w, cw.h, cw.d));
    cwHull.position.set(cw.x, cy, cz);
    // femtosecond laser, on the near side of the beam: an oscillator and two amplifier modules standing side by side
    // on a brushed base plate (the high-power head is 195 x 95 x 75 mm; drawn x 1.3 like the other instruments).  On
    // the end facing the collimator: a D-sub socket above, two fiber ports below; module to module, a short fiber loops
    // over the plate; the output is the lower port of the module nearest the beam; the emission lamp sits on top.
    const S = 1.3, fs = { x: -30.0, z: 4.8, l: 4.6 * S, h: 2.25 * S, t: 0.6 * S, gap: 0.07 * S }, n = 3, pt = 0.16 * S, base = TABLE_Y + pt;
    const xe = fs.x + fs.l / 2, yLo = base + 0.34 * S, yHi = base + 0.68 * S;
    const zs = Array.from({ length: n }, (_, i) => fs.z + (i - (n - 1) / 2) * (fs.t + fs.gap));
    const plate = box(fs.l + 1.9 * S, pt, 3.0 * S, std(0xc3c9cf, { metalness: 0.6, roughness: 0.36 }), fs.x + 0.65 * S, TABLE_Y + pt / 2, fs.z);
    laser.add(plate);
    this.laserBodies = [cwHull, plate];
    // brushed tops, matt enough not to flare in the bloom (a flare would read as a lit lamp)
    const frame = std(0x1c2738, { metalness: 0.45, roughness: 0.42 }), alu = std(0xb9bec4, { metalness: 0.35, roughness: 0.6 });
    const dsub = std(0x2b5fc4, { roughness: 0.45 }), fcPort = std(0x38b04a, { roughness: 0.5 });
    for (const z of zs) {
      const m = box(fs.l, fs.h, fs.t, frame, fs.x, base + fs.h / 2, z);
      laser.add(m, box(fs.l - 0.3 * S, 0.05 * S, fs.t - 0.22 * S, alu, fs.x, base + fs.h + 0.025 * S, z),
        box(0.14 * S, 0.62 * S, 0.26 * S, dsub, xe + 0.07 * S, base + 1.45 * S, z));
      for (const y of [yLo, yHi]) laser.add(box(0.2 * S, 0.24 * S, 0.24 * S, fcPort, xe + 0.1 * S, y, z));
      this.laserBodies.push(m);
    }
    const panel = new THREE.MeshStandardMaterial({ map: laserPanelTex(), roughness: 0.55, metalness: 0.02, ...DECAL });
    const pw = fs.l - 0.16 * S, ph = fs.h - 0.16 * S;
    const front = mesh(new THREE.PlaneGeometry(pw, ph), panel, fs.x, base + fs.h / 2, zs[n - 1] + fs.t / 2 + 0.012, false);
    const back = mesh(new THREE.PlaneGeometry(pw, ph), panel, fs.x, base + fs.h / 2, zs[0] - fs.t / 2 - 0.012, false);
    back.rotation.y = Math.PI;
    laser.add(front, back);
    this.fsLoops = [];
    const yl = base + 0.12 * S;                                  // fibers lying on the plate
    for (let i = 0; i < n - 1; i++) {
      const a = zs[i], b = zs[i + 1], r = (0.7 + 0.3 * i) * S;
      const loop = cable([V(xe + 0.2 * S, yHi, a), V(xe + 0.55 * S, yHi - 0.2 * S, a), V(xe + r, yl, a + 0.08 * S), V(xe + r + 0.3 * S, yl, (a + b) / 2),
        V(xe + r, yl, b - 0.08 * S), V(xe + 0.55 * S, yLo - 0.1 * S, b), V(xe + 0.2 * S, yLo, b)], 0xf2c230, 0.05 * S);
      laser.add(loop, box(0.2 * S, 0.12 * S, 0.42 * S, anod(), xe + r + 0.28 * S, base + 0.06 * S, (a + b) / 2));
      this.fsLoops.push(loop);
    }
    this.fsLed = box(0.3 * S, 0.06 * S, 0.18 * S, std(0x101010, { emissive: 0xff9a2e, emissiveIntensity: 0 }), xe - 0.45 * S, base + fs.h + 0.06 * S, zs[n - 1]);
    this.fsLed.material.userData.noHighlight = true;
    laser.add(this.fsLed);
    this.register('irLaser', laser, V(-29.5, TABLE_Y + 5.2, -1.5));
    // the blue fiber from the collimator, plugged into the laser in use: from behind the beam (CW laser) or from the
    // near side (femtosecond laser), each in plain view
    const ce = COLL_X - 1.3;                                     // the collimator's fiber end
    const tail = sz => [V(ce - 0.8, YC - 1.0, 0.8 * sz), V(ce - 0.5, YC, 0.05 * sz), V(ce, YC, 0)];
    this.fibers = {
      cw: cable([V(px, py - 0.18, fz + 0.55), V(px + 0.25, TABLE_Y + 0.35, fz + 1.4), V(-25.5, TABLE_Y + 0.25, -3.6),
        V(-24.8, TABLE_Y + 0.7, -1.9), ...tail(-1)], 0x3a78c8, 0.07),
      fs: cable([V(xe + 0.22 * S, yLo, zs[0]), V(xe + 0.8, base + 0.24, zs[0] - 0.55), V(-25.0, TABLE_Y + 0.32, 1.9),
        V(-24.7, TABLE_Y + 0.7, 1.1), ...tail(1)], 0x3a78c8, 0.07),
    };
    this.scene.add(this.fibers.cw, this.fibers.fs);
    this.setActiveLaser('fs');
    const col = new THREE.Group();
    const cb = mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 22), anod(), COLL_X, YC, 0);
    cb.rotation.z = Math.PI / 2;
    col.add(cb, post(COLL_X, 0, YC - 0.55));
    this.register('collimator', col, V(COLL_X, YC + 1.6, 0));
    // one coupling lens close to the chip's input facet
    const lg = new THREE.Group();
    const l = lens(1.15, 0.42, glass()); l.position.set(IN_LENS, YC, 0);
    const ring = mesh(new THREE.TorusGeometry(1.22, 0.13, 10, 32), anod(), IN_LENS, YC, 0); ring.rotation.y = Math.PI / 2;
    lg.add(l, ring, post(IN_LENS, 0, YC - 1.25));
    this.register('inLens', lg, V(IN_LENS, YC + 2.4, 0));
    // kept below the tone mapping's shoulder, which would bleach a bright red towards pink
    this.pumpMat = beamMaterial(rgbOf(PAL.pump), 0.6, this.dash, 0.85);
    this.beams.pump = [
      beamMesh(V(COLL_X + 1.3, YC, 0), V(IN_LENS - 0.25, YC, 0), 0.32, 0.32, this.pumpMat),
      beamMesh(V(IN_LENS + 0.2, YC, 0), V(-CHIP.lx / 2, YC, 0), 0.32, 0.05, this.pumpMat),
    ];
    for (const b of this.beams.pump) this.scene.add(b);
  }

  // which pump laser is on: the CW laser (How it works and Fig. 2, 'cw') or the femtosecond laser (everything else,
  // 'fs'); the collimator's fiber is plugged into that one
  setActiveLaser(kind, nm = this.cwNm || 1560) {
    this.cwNm = nm;
    this.cwLed.material.emissiveIntensity = kind === 'cw' ? 1.6 : 0.05;
    this.fsLed.material.emissiveIntensity = kind === 'fs' ? 1.6 : 0.05;
    this.fibers.cw.visible = kind === 'cw';
    this.fibers.fs.visible = kind === 'fs';
    const g = this.cwCanvas.getContext('2d'), W = this.cwCanvas.width, H = this.cwCanvas.height, on = kind === 'cw';
    g.fillStyle = on ? '#0b1a2a' : '#06090d'; g.fillRect(0, 0, W, H);
    if (on) {
      g.fillStyle = '#9fd8ff'; g.font = '600 34px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${nm.toFixed(3)} nm`, W / 2, H * 0.38);
      // the tuning range, 1500-1630 nm, with the setting marked
      g.fillStyle = '#3b6f99'; g.fillRect(W * 0.1, H * 0.66, W * 0.8, 6); g.fillStyle = '#9fd8ff';
      g.fillRect(W * 0.1, H * 0.66, W * 0.8 * Math.min(1, Math.max(0, (nm - 1500) / 130)), 6);
    }
    this.cwTex.needsUpdate = true;
  }

  setPump({ visible = true, rgb = null, quantum = false } = {}) {
    const c = rgb || rgbOf(PAL.pump);
    this.pumpMat.color.setRGB(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
    this.pumpMat.map = quantum ? this.flow : this.dash;
    this.pumpMat.needsUpdate = true;
    for (const b of this.beams.pump) b.visible = visible;
    // the (proposed) 780 nm pump of the quantum set-up: the lamp shows its colour
    if (quantum) this.fsLed.material.emissive.setRGB(...shRGB(780)); else this.fsLed.material.emissive.setHex(0xff9a2e);
    this.pumpIsQuantum = quantum;
    this.components.irLaser.div.textContent = this.nameOf('irLaser');
    this.components.irLaser.w = 0;
  }

  // ------------------------------------------------------------------ programming light
  // The illumination optics stand on a breadboard (drawn half-transparent, so the chip stays in view) held by four
  // posts above the table; the camera lens hangs through a hole in it, pointing down at the chip.
  buildIllumination() {
    const yA = 12.3, bb = BOARD;
    const gm = this.greenMat = beamMaterial(rgbOf(PAL.light), 1.1, this.flow, 0.42);
    // the breadboard, its holes (a texture repeated once per unit) and the hole for the lens
    const shape = new THREE.Shape();
    shape.moveTo(bb.x0, -bb.z0); shape.lineTo(bb.x1, -bb.z0); shape.lineTo(bb.x1, -bb.z1); shape.lineTo(bb.x0, -bb.z1); shape.lineTo(bb.x0, -bb.z0);
    const hole = new THREE.Path(); hole.absarc(0, 0, 2.05, 0, Math.PI * 2, true); shape.holes.push(hole);
    const bgeo = new THREE.ExtrudeGeometry(shape, { depth: bb.t, bevelEnabled: false, curveSegments: 40 });
    bgeo.rotateX(-Math.PI / 2);                              // shape y -> -z, extrusion -> +y
    const ht = holesTexture('#8d949c', '#2c3035');
    const board = mesh(bgeo, std(0xffffff, { map: ht, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.42, depthWrite: false }), 0, bb.y - bb.t, 0, false);
    board.renderOrder = 2;
    const brd = new THREE.Group();
    brd.add(board);
    for (const [x, z] of bb.posts) brd.add(post(x, z, bb.y - bb.t, 0.42));
    this.register('board', brd, V(bb.x0 + 2.5, bb.y + 0.9, bb.z1 - 0.6));
    // the green laser (its output face at x = -9) close to the first mirror
    const gl = new THREE.Group();
    gl.add(box(6, 2.2, 2.6, std(0x2b3036, { metalness: 0.3, roughness: 0.45 }), -12, yA, -9));
    gl.add(box(6.05, 0.35, 2.65, std(PAL.green), -12, yA + 0.95, -9));
    gl.add(boardPost(-12, -9, yA - 1.1, 0.3));
    this.register('green', gl, V(-12, yA + 3.6, -9));            // label high enough to clear the beam splitter's
    // rotY turns the mirror's normal, (cos rotY, 0, -sin rotY), onto the side facing the beams; the holder
    // sits on the other side
    const mirror = (x, z, rotY, postDz = 0) => {
      const g = new THREE.Group();
      const m = box(0.25, 1.9, 1.9, std(0xdfe6ee, { metalness: 0.95, roughness: 0.08 }), x, yA, z);
      m.rotation.y = rotY;
      const holder = box(0.4, 2.2, 2.2, anod(), x, yA, z);
      holder.rotation.y = rotY;
      holder.position.x -= Math.cos(rotY) * 0.25; holder.position.z += Math.sin(rotY) * 0.25;
      // posts stand clear of the beams; an arm carries the optic when the post is offset
      if (postDz) g.add(box(0.3, 0.25, Math.abs(postDz) + 0.3, anod(), x, yA - 1.22, z + postDz / 2));
      g.add(m, holder, boardPost(x, z + postDz, yA - 1.1, 0.2));
      return g;
    };
    // a periscope of two parallel mirrors: +x -> +z (towards the beam expander), then +z -> +x (to the PBS)
    const MX = MIRROR_X;
    this.register('mirror', mirror(MX, -9, -3 * Math.PI / 4), V(MX, yA + 1.8, -9));
    this.scene.add(mirror(MX, 0, Math.PI / 4, -1.7));
    const be = new THREE.Group();
    const tube = mesh(new THREE.CylinderGeometry(1.0, 0.45, 3.4, 24, 1, true), std(0xb7bec7, { metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }), MX, yA, -5.3);
    tube.rotation.x = Math.PI / 2;
    be.add(tube, boardPost(MX, -5.3, yA - 0.9, 0.22));
    this.register('be', be, V(MX, yA + 1.8, -5.3));
    const pbs = new THREE.Group();
    const cube = mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), glass(), 0, yA, 0);
    const diag = mesh(new THREE.PlaneGeometry(3.3, 2.4), std(0x6fb3ff, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 0, yA, 0, false);
    // the coating runs along z and the (1, 1, 0) diagonal: light coming back from the SLM (-x) turns down (-y)
    diag.rotation.set(Math.PI / 2, 0, Math.PI / 4, 'ZYX');
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.4, 2.4)), new THREE.LineBasicMaterial({ color: 0x1b2128 }));
    frame.position.set(0, yA, 0);
    const hwp = mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 32), std(0x9fd3ff, { transparent: true, opacity: 0.5, depthWrite: false }), 2.5, yA, 0);
    hwp.rotation.z = Math.PI / 2;
    const hwpRing = mesh(new THREE.TorusGeometry(1.2, 0.1, 8, 32), anod(), 2.5, yA, 0); hwpRing.rotation.y = Math.PI / 2;
    // held from its back face, clear of the light it sends down through the board to the lens
    pbs.add(cube, diag, frame, hwp, hwpRing, box(1.6, 2.0, 0.2, anod(), 0, yA - 0.4, -1.32),
      box(0.4, 0.25, 3.3, anod(), 0, yA - 1.32, -3.05), boardPost(0, -4.6, yA - 1.45, 0.22));
    this.register('pbs', pbs, V(-2.4, yA + 2.0, 0));
    // Upright: the PBS folds the SLM's height onto the chip's length (x) and keeps its width (z); the projection
    // lens then inverts the image.  So the pattern runs down the face (texture u along -y, v along +z).
    const slm = new THREE.Group();
    slm.add(box(0.9, 5.6, 3.8, std(0x23272d, { metalness: 0.4, roughness: 0.4 }), 5.4, yA, 0));
    const face = mesh(new THREE.PlaneGeometry(4.8, 3.0), new THREE.MeshBasicMaterial({ map: this.patTex, color: new THREE.Color(PAL.light).multiplyScalar(1.1) }), 4.93, yA, 0, false);
    face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, -1, 0), V(0, 0, 1), V(-1, 0, 0)));
    this.slmFace = face;
    slm.add(face, box(0.5, 0.3, 5.6, anod(), 5.6, yA - 2.05, -4.6), boardPost(5.6, -7.2, yA - 2.2, 0.25));
    this.register('slm', slm, V(6.4, yA + 3.6, 0));
    const lensG = cameraLens();
    this.register('projLens', lensG, V(-2.9, 7.4, 1.6));
    // How it works draws the lens see-through (setLensGhost): each material keeps its own look to return to
    this.lensMats = [];
    lensG.traverse(o => { if (o.isMesh && !this.lensMats.includes(o.material)) this.lensMats.push(o.material); });
    for (const m of this.lensMats) m.userData.base = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
    const yb = yA;
    this.beams.green = [
      beamMesh(V(-9, yb, -9), V(MX, yb, -9), 0.2, 0.2, gm),
      beamMesh(V(MX, yb, -9), V(MX, yb, -7.0), 0.2, 0.2, gm),
      beamMesh(V(MX, yb, -7.0), V(MX, yb, -3.6), 0.3, 0.6, gm),
      beamMesh(V(MX, yb, -3.6), V(MX, yb, 0), 0.6, 0.6, gm),
      beamMesh(V(MX, yb, 0), V(4.9, yb, 0), 0.6, 0.6, gm),
      beamMesh(V(0, yb - 0.1, 0), V(0, LENS_TOP, 0), 0.6, 0.6, gm),
    ];
    for (const b of this.beams.green) this.scene.add(b);
  }

  // the camera lens see-through (How it works: the chip below stays in view, and clicks go through to it) or as built
  setLensGhost(on) {
    if (this.lensGhost === on) return;
    this.lensGhost = on;
    // a see-through lens casts no solid shadow on the chip
    this.components.projLens.group.traverse(o => { if (o.isMesh) o.castShadow = !on; });
    for (const m of this.lensMats) {
      const b = m.userData.base;
      m.transparent = on || b.transparent;
      m.opacity = on ? 0.3 * b.opacity : b.opacity;
      m.depthWrite = on ? false : b.depthWrite;
      m.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ output side
  buildOutputArm() {
    const og = new THREE.Group();
    const l = lens(1.15, 0.42, glass()); l.position.set(11.8, YC, 0);
    const ring = mesh(new THREE.TorusGeometry(1.22, 0.13, 10, 32), anod(), 11.8, YC, 0); ring.rotation.y = Math.PI / 2;
    og.add(l, ring, post(11.8, 0, YC - 1.25));
    this.register('outLens', og, V(11.8, YC + 2.3, 0));
    const fg = new THREE.Group();
    fg.add(box(0.14, 2.2, 2.2, std(0x6a3fb0, { transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false }), 16.4, YC, 0));
    fg.add(box(0.4, 2.5, 0.3, anod(), 16.4, YC, 1.2), post(16.4, 0, YC - 1.2, 0.2));
    this.register('filter', fg, V(16.4, YC - 1.9, 1.4));

    // spectrometer: a reflective grating sends a fan of colours back onto a screen that faces the viewer
    const sp = new THREE.Group();
    const x0 = 16.9, x1 = 31.6, z0 = -6.7, z1 = 1.6;
    sp.add(box(x1 - x0, 0.5, z1 - z0, std(0x2a2f36, { roughness: 0.6 }), (x0 + x1) / 2, TABLE_Y + 0.25, (z0 + z1) / 2));
    const wallM = std(0x31373f, { roughness: 0.55 });
    sp.add(box(x1 - x0, 3.0, 0.3, wallM, (x0 + x1) / 2, TABLE_Y + 1.75, z1));
    sp.add(box(0.3, 3.0, z1 - z0, wallM, x1, TABLE_Y + 1.75, (z0 + z1) / 2));
    // a ruled grating: fine grooves (vertical: it spreads the colours sideways) with a faint rainbow sheen
    const gc = makeCanvas(128, 128), gg = gc.getContext('2d');
    for (let x = 0; x < 128; x++) {
      const h = 200 + 140 * x / 128;
      gg.fillStyle = x % 3 === 0 ? '#3a3f48' : `hsl(${h}, 45%, ${x % 3 === 1 ? 74 : 64}%)`;
      gg.fillRect(x, 0, 1, 128);
    }
    const gTex = canvasTex(gc);
    const grating = box(0.16, 1.8, 1.8, std(0xffffff, { map: gTex, metalness: 0.85, roughness: 0.22, emissive: 0xffffff, emissiveMap: gTex, emissiveIntensity: 0.18 }), SPEC.gx, YC, SPEC.gz);
    grating.material.userData.noHighlight = true;
    grating.rotation.y = -Math.PI / 4;              // faces the incoming beam (-x side) and the screen (-z side)
    sp.add(grating, post(SPEC.gx, 0.9, YC - 0.9, 0.2));
    this.specCanvas = makeCanvas(512, 64);
    this.specTex = canvasTex(this.specCanvas);
    const scr = mesh(new THREE.PlaneGeometry(SPEC.x1 - SPEC.x0 + 0.6, SPEC.h), new THREE.MeshBasicMaterial({ map: this.specTex, color: new THREE.Color(1.5, 1.5, 1.5) }), (SPEC.x0 + SPEC.x1) / 2, YC, SPEC.sz + 0.01, false);
    const scrBack = box(SPEC.x1 - SPEC.x0 + 1.2, SPEC.h + 0.6, 0.3, std(0x15181c), (SPEC.x0 + SPEC.x1) / 2, YC, SPEC.sz - 0.17);
    this.specScreen = scr; this.specBack = scrBack;
    sp.add(scr, scrBack, post(SPEC.x0, SPEC.sz - 0.2, YC - SPEC.h / 2 - 0.3, 0.22), post(SPEC.x1, SPEC.sz - 0.2, YC - SPEC.h / 2 - 0.3, 0.22));
    this.register('spec', sp, V(24, TABLE_Y + 3.7, 1.9));
    this.specTicks = [];
    for (const nm of [750, 780, 810]) {
      const div = document.createElement('div');
      div.className = 'tick';
      div.textContent = nm + ' nm';
      const o = new CSS2DObject(div);
      o.position.set(this.specX(nm), YC - SPEC.h / 2 - 0.45, SPEC.sz + 0.2);
      this.scene.add(o);
      this.specTicks.push(o);
    }
    const M = 160;
    const pos = new Float32Array(M * 9), col = new Float32Array(M * 9);
    for (let i = 0; i < M; i++) {
      const xa = this.specX(740 + 80 * i / M), xb = this.specX(740 + 80 * (i + 1) / M);
      pos.set([SPEC.gx, YC, SPEC.gz, xa, YC, SPEC.sz + 0.05, xb, YC, SPEC.sz + 0.05], i * 9);
    }
    const fg2 = new THREE.BufferGeometry();
    fg2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.fan = new THREE.Mesh(fg2, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.fan.renderOrder = 6;
    this.scene.add(this.fan);
    this.fanM = M;
    this.outMat = beamMaterial(shRGB(780), 1.6, this.flow, 0.6);
    this.beams.out = [
      beamMesh(V(CHIP.lx / 2, YC, 0), V(11.6, YC, 0), 0.05, 0.34, this.outMat),
      beamMesh(V(12.0, YC, 0), V(SPEC.gx - 0.4, YC, 0), 0.34, 0.34, this.outMat),     // ends at the grating's face
    ];
    for (const b of this.beams.out) this.scene.add(b);
    this.beams.outCam = [beamMesh(V(12.0, YC, 0), V(CAM.x - 1.25, YC, 0), 0.34, 0.12, this.outMat)];
    this.beams.outCam[0].visible = false;
    this.scene.add(this.beams.outCam[0]);
    this.setOutputLine(780, 1);
  }

  // ------------------------------------------------------------------ spatial set-up (Fig. 4a): camera + its picture
  buildCamera() {
    const g = new THREE.Group(), x = CAM.x;
    g.add(box(2.4, 2.0, 2.2, std(0x2c3138, { metalness: 0.35, roughness: 0.45 }), x + 1.2, YC, 0));
    const tube = mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.3, 24), anod(), x - 0.6, YC, 0);
    tube.rotation.z = Math.PI / 2;
    const glassFront = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 24), std(0x203040, { metalness: 0.2, roughness: 0.05, emissive: 0x0a1a2a, emissiveIntensity: 0.6 }), x - 1.27, YC, 0);
    glassFront.rotation.z = Math.PI / 2;
    g.add(tube, glassFront, post(x + 1.2, 0, YC - 1.0, 0.22));
    // the camera's picture, on a display above it (false colours, like the spectrometer)
    this.camCanvas = makeCanvas(768, 168);
    this.camTex = canvasTex(this.camCanvas);
    const sy = YC + 4.0, dw = 12, dh = 2.62;
    const scr = mesh(new THREE.PlaneGeometry(dw, dh), new THREE.MeshBasicMaterial({ map: this.camTex, color: new THREE.Color(1.35, 1.35, 1.35) }), x + 1.2, sy, 0.02, false);
    const stand = sy - dh / 2 - (YC + 1.0);
    g.add(scr, box(dw + 0.4, dh + 0.4, 0.22, std(0x15181c), x + 1.2, sy, -0.12), box(0.22, stand, 0.22, metal(), x + 1.2, YC + 1.0 + stand / 2, -0.12));
    this.camGroup = g;
    g.visible = false;
    this.register('camera', g, V(x + 1.2, YC + 1.35, 1.4));
    this.drawCamera(null);
  }

  // measured output profile: x_um (transverse position), I (any units), drawn as the bright line the camera sees
  drawCamera(prof) {
    const c = this.camCanvas, g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
    const lineY = H * 0.42, x0 = -300, x1 = 300;
    if (prof && prof.I && prof.I.length > 1) {
      let max = 0;
      for (const v of prof.I) max = Math.max(max, v);
      const img = g.getImageData(0, 0, W, H), d = img.data, rgb = shRGB(prof.nm || 790);
      const n = prof.x.length, xa = prof.x[0], xb = prof.x[n - 1];
      for (let px = 0; px < W; px++) {
        const xu = x0 + (x1 - x0) * (px + 0.5) / W;
        const f = (xu - xa) / (xb - xa) * (n - 1), i = Math.floor(f);
        const v = i < 0 || i >= n - 1 || max <= 0 ? 0 : Math.max(0, (prof.I[i] + (prof.I[i + 1] - prof.I[i]) * (f - i)) / max);
        for (let py = 0; py < H * 0.78; py++) {
          const e = Math.exp(-0.5 * ((py - lineY) / (H * 0.075)) ** 2) * v;
          const k = 4 * (py * W + px);
          d[k] = Math.min(255, d[k] + 255 * rgb[0] * e * 1.2); d[k + 1] = Math.min(255, d[k + 1] + 255 * rgb[1] * e * 1.2); d[k + 2] = Math.min(255, d[k + 2] + 255 * rgb[2] * e * 1.2);
        }
      }
      g.putImageData(img, 0, 0);
    }
    // scale bar: transverse position on the output facet
    g.strokeStyle = '#5b6b7a'; g.fillStyle = '#9aa6b2'; g.lineWidth = 3;
    g.font = '600 26px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const xu of [-200, 0, 200]) {
      const px = (xu - x0) / (x1 - x0) * W;
      g.beginPath(); g.moveTo(px, H * 0.8); g.lineTo(px, H * 0.86); g.stroke();
      g.fillText(`${xu > 0 ? '+' : xu < 0 ? '−' : ''}${Math.abs(xu)} µm`, px, H - 3);
    }
    this.camTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ SH light inside the slab (simulated, Fig. 4b middle column)
  // Two flat sheets in the core plane: the grating region over the lit area (1.44x its real length, like the
  // pattern), and the rest of the way to the output facet compressed (the real chip continues ~8.5 mm past the
  // grating).  Transverse x magnified by XMAG; the simulation spans the chip's whole width (+-692 µm drawn as
  // +-5 units).  Before the grating there is no SH yet.
  buildSheet() {
    // drawn over the chip's top (an "X-ray" view), in the output's false colour, opacity = simulated intensity
    const rgb = shRGB(790);
    this.sheetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0] * 1.6, rgb[1] * 1.6, rgb[2] * 1.6), transparent: true,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
    this.sheets = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sheetMat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 9;
      m.visible = false;
      this.scene.add(m);
      return m;
    });
    // a dark backing on the chip's top wherever no green pattern is drawn, so the light stands out over the whole
    // chip; depth-tested on the surface, so that the probe in front of it is not darkened
    const c = makeCanvas(150, 100), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 150, 100);
    g.clearRect(75 - 75 * PROG.lx / CHIP.lx, 50 - 50 * PROG.lz / CHIP.lz, 150 * PROG.lx / CHIP.lx, 100 * PROG.lz / CHIP.lz);
    this.sheetBack = new THREE.Mesh(new THREE.PlaneGeometry(CHIP.lx, CHIP.lz), new THREE.MeshBasicMaterial({ color: 0x0b0f14,
      alphaMap: canvasTex(c, false), transparent: true, opacity: 0.55, depthWrite: false }));
    this.sheetBack.rotation.x = -Math.PI / 2;
    this.sheetBack.position.y = 0.006;
    this.sheetBack.renderOrder = 3;                // under the projector's rays and the green light
    this.sheetBack.visible = false;
    this.scene.add(this.sheetBack);
    // the pump beam inside the chip, from the input facet to the output facet, as the paper's model has it
    // (SI S10B): 1/e^2 radius 132 µm at z_ref, diverging with wavefront radius k / u_ref = 61 mm; drawn on the same
    // z and x scales as the simulated light; strong only before the grating, where it comes in, and faint under the
    // green pattern and after it, so that the pattern keeps its colour and the output is not drawn in the pump's red
    const pc = makeCanvas(300, 128), pg = pc.getContext('2d'), img = pg.createImageData(300, 128), k = 2 * Math.PI * 1.89 / 1.58, u = 1.228e-4;
    const W0 = 132, iq0 = [u / k, -2 / (k * W0 * W0)], q0d = iq0[0] ** 2 + iq0[1] ** 2, q0 = [iq0[0] / q0d, -iq0[1] / q0d];
    const zOf = X => X < -PROG.lx / 2 ? (X + PROG.lx / 2) / (PROG.lx / 7.242) : X < PROG.lx / 2 ? (X + PROG.lx / 2) / (PROG.lx / 7.242)
      : 7.242 + (X - PROG.lx / 2) / (CHIP.lx / 2 - PROG.lx / 2) * (15.772 - 7.242);               // mm from the pattern start
    for (let i = 0; i < 300; i++) {
      const X = CHIP.lx * ((i + 0.5) / 300 - 0.5), z = 1000 * (zOf(X) - 3.772);                  // µm from z_ref
      const qr = q0[0] + z, qi = q0[1], d = qr * qr + qi * qi, W = Math.sqrt(-2 / (k * (-qi / d)));   // 1/q = (qr - i qi) / d
      const after = Math.min(1, Math.max(0, (X + PROG.lx / 2 - 0.25) / 0.5)), dim = 1 - 0.7 * after;
      for (let j = 0; j < 128; j++) {
        const x = 692 * (2 * (j + 0.5) / 128 - 1), a = dim * Math.sqrt(W0 / W) * Math.exp(-x * x / (W * W)), o = 4 * (j * 300 + i);
        img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(255 * a); img.data[o + 3] = 255;
      }
    }
    pg.putImageData(img, 0, 0);
    this.pumpSheet = new THREE.Mesh(new THREE.PlaneGeometry(CHIP.lx, CHIP.lz), new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAL.pump), alphaMap: canvasTex(pc, false), transparent: true, opacity: 0.3,
      depthWrite: false, depthTest: false, toneMapped: false }));
    this.pumpSheet.rotation.x = -Math.PI / 2;
    this.pumpSheet.position.y = YC;
    this.pumpSheet.renderOrder = 3.5;              // seen through the top (like the simulated light), under the green
    this.pumpSheet.visible = false;
    this.scene.add(this.pumpSheet);
  }

  // img: sprite of simulated |E_SH|^2 maps, rows = z (pattern start .. output facet), columns = x (x_um[0] .. x_um[1],
  // the chip's whole drawn width).  uA: fraction of the z range covered by the grating.
  // flip: the map's x runs opposite to the pattern's rows (the paper's Fig. 4b model frame vs SLM rows)
  setSheet(img, { cell = 0, cells = 1, uA = 0.459, x_um = [-692, 692], flip = false } = {}) {
    if (!img) { for (const m of this.sheets) m.visible = false; this.sheetBack.visible = this.pumpSheet.visible = false; this.sheetOn = false; return; }
    let tex = this.sheetTex;
    if (!tex || tex.image !== img) {
      if (tex) tex.dispose();
      tex = this.sheetTex = new THREE.Texture(img);
      tex.generateMipmaps = false;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.sheetMat.alphaMap = tex; this.sheetMat.needsUpdate = true;
    }
    const half = (x_um[1] - x_um[0]) / 2 / 1000 * XMAG, zc = (x_um[1] + x_um[0]) / 2 / 1000 * XMAG;
    const segs = [[-PROG.lx / 2, PROG.lx / 2, 0, uA], [PROG.lx / 2, CHIP.lx / 2, uA, 1]];
    segs.forEach(([xa, xb, ua, ub], k) => {
      const m = this.sheets[k];
      m.scale.set(xb - xa, 2 * half, 1);
      m.position.set((xa + xb) / 2, YC, zc);
      // PlaneGeometry vertices: top-left, top-right, bottom-left, bottom-right; local +y is world -z (= most negative x_um)
      const uv = m.geometry.attributes.uv;
      const tv = zf => 1 - (cell + zf) / cells, sA = flip ? 1 : 0, sB = 1 - sA;
      uv.setXY(0, sA, tv(ua)); uv.setXY(1, sA, tv(ub)); uv.setXY(2, sB, tv(ua)); uv.setXY(3, sB, tv(ub));
      uv.needsUpdate = true;
      m.visible = true;
    });
    this.sheetBack.visible = this.pumpSheet.visible = true;
    this.sheetOn = true;
  }

  // ------------------------------------------------------------------ spatio-spectral (Fig. 5): measured intensity as a surface
  // over wavelength (aligned with the spectrometer screen below it) and transverse position.
  buildSurface() {
    const NL = 150, NX = 70;
    this.surfN = { NL, NX };
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(NL * NX * 3), col = new Float32Array(NL * NX * 3), idx = [];
    for (let j = 0; j < NX - 1; j++) for (let i = 0; i < NL - 1; i++) {
      const a = j * NL + i, b = a + 1, c = a + NL, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.surface = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }));
    this.surface.renderOrder = 3;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0d151d, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.surfBase = base;
    this.surfFrame = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x46566a }));
    this.surfGroup = new THREE.Group();
    this.surfGroup.add(base, this.surface, this.surfFrame);
    this.surfGroup.visible = false;
    this.scene.add(this.surfGroup);
    this.surfTicks = [];
  }

  // map: {v: Float32Array(nx*nl), nx, nl} with rows = x_um (increasing), columns = lam_nm (increasing).
  // Drawn as a relief above the spectrometer screen: wavelength across (as on the screen), position up,
  // intensity towards the viewer.
  setSurface(map, lam, xs, { depth = 2.4, y0 = YC + SPEC.h / 2 + 1.0, span = 4.0, z0 = SPEC.sz + 0.5 } = {}) {
    if (!map) { this.surfGroup.visible = false; return; }
    const { NL, NX } = this.surfN, pos = this.surface.geometry.attributes.position.array, col = this.surface.geometry.attributes.color.array;
    let max = 0;
    for (const v of map.v) max = Math.max(max, v);
    const l0 = lam[0], l1 = lam[lam.length - 1], x0 = xs[0], x1 = xs[xs.length - 1];
    const sample = (fr, fc) => {                    // bilinear, fr/fc in index units
      const r = Math.min(map.nx - 1.001, Math.max(0, fr)), c = Math.min(map.nl - 1.001, Math.max(0, fc));
      const r0 = Math.floor(r), c0 = Math.floor(c), dr = r - r0, dc = c - c0, v = map.v, n = map.nl;
      return (v[r0 * n + c0] * (1 - dc) + v[r0 * n + c0 + 1] * dc) * (1 - dr) + (v[(r0 + 1) * n + c0] * (1 - dc) + v[(r0 + 1) * n + c0 + 1] * dc) * dr;
    };
    for (let j = 0; j < NX; j++) for (let i = 0; i < NL; i++) {
      const nm = l0 + (l1 - l0) * i / (NL - 1), xu = x0 + (x1 - x0) * j / (NX - 1);
      const v = max > 0 ? Math.max(0, sample(j / (NX - 1) * (map.nx - 1), i / (NL - 1) * (map.nl - 1)) / max) : 0;
      const k = 3 * (j * NL + i), rgb = shRGB(nm), b = 0.16 + 0.95 * Math.pow(v, 0.8);
      pos[k] = this.specX(nm); pos[k + 1] = y0 + span * (xu - x0) / (x1 - x0); pos[k + 2] = z0 + 0.02 + depth * v;
      col[k] = rgb[0] * b; col[k + 1] = rgb[1] * b; col[k + 2] = rgb[2] * b;
    }
    this.surface.geometry.attributes.position.needsUpdate = true;
    this.surface.geometry.attributes.color.needsUpdate = true;
    this.surface.geometry.computeBoundingSphere();
    const xa = this.specX(l0), xb = this.specX(l1);
    this.surfBase.scale.set(xb - xa, span, 1);
    this.surfBase.position.set((xa + xb) / 2, y0 + span / 2, z0);
    const fr = [xa, y0, z0, xb, y0, z0, xb, y0, z0, xb, y0 + span, z0, xb, y0 + span, z0, xa, y0 + span, z0, xa, y0 + span, z0, xa, y0, z0,
      xa, y0, z0, xa, y0, z0 + depth];
    this.surfFrame.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fr, 3));
    this.surfGroup.visible = true;
  }

  // the spectrometer camera's 2D picture (spatio-spectral set-up, Fig. 5a): wavelength across, position up
  drawSpecMap(map, lam) {
    const c = this.specCanvas, g = c.getContext('2d'), W = c.width, H = c.height;
    const img = g.createImageData(W, H), d = img.data;
    let max = 0;
    for (const v of map.v) max = Math.max(max, v);
    for (let px = 0; px < W; px++) {
      const nm = 740 + 80 * (px + 0.5) / W, rgb = shRGB(nm);
      const fc = (nm - lam[0]) / (lam[lam.length - 1] - lam[0]) * (map.nl - 1);
      for (let py = 0; py < H; py++) {
        const fr = (1 - (py + 0.5) / H) * (map.nx - 1);
        let v = 0;
        if (fc >= 0 && fc <= map.nl - 1 && max > 0) v = Math.max(0, map.v[Math.round(fr) * map.nl + Math.round(fc)] / max);
        const k = 4 * (py * W + px), e = Math.pow(v, 0.75);
        d[k] = 255 * Math.min(1, rgb[0] * e + 0.04); d[k + 1] = 255 * Math.min(1, rgb[1] * e + 0.04); d[k + 2] = 255 * Math.min(1, rgb[2] * e + 0.05); d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.specTex.needsUpdate = true;
  }

  specX(nm) { return SPEC.x0 + (SPEC.x1 - SPEC.x0) * (Math.min(820, Math.max(740, nm)) - 740) / 80; }

  // spectrum: {lam (µm), S}; drawn relative to its own max, times `brightness` (0..1)
  setOutputSpectrum(lam, S, brightness = 1) {
    let max = 0;
    for (const v of S) max = Math.max(max, v);
    const M = this.fanM, col = this.fan.geometry.attributes.color.array;
    const sample = (nm) => {
      const x = (nm / 1000 - lam[0]) / (lam[lam.length - 1] - lam[0]) * (lam.length - 1);
      if (x < 0 || x > lam.length - 1) return 0;
      const i = Math.max(0, Math.min(lam.length - 2, Math.floor(x))), f = x - i;
      return max > 0 ? Math.max(0, (S[i] * (1 - f) + S[i + 1] * f) / max) : 0;
    };
    let rs = 0, gs = 0, bs = 0, ws = 0;
    for (let i = 0; i < M; i++) {
      const nm = 740 + 80 * (i + 0.5) / M, v = sample(nm) * brightness, c = shRGB(nm), k = 1.5 * v;
      col.set([c[0] * k * 0.3, c[1] * k * 0.3, c[2] * k * 0.3, c[0] * k, c[1] * k, c[2] * k, c[0] * k, c[1] * k, c[2] * k], i * 9);
      rs += c[0] * v; gs += c[1] * v; bs += c[2] * v; ws += v;
    }
    this.fan.geometry.attributes.color.needsUpdate = true;
    const g = this.specCanvas.getContext('2d'), W = this.specCanvas.width, H = this.specCanvas.height;
    const img = g.createImageData(W, H), d = img.data;
    for (let x = 0; x < W; x++) {
      const nm = 740 + 80 * (x + 0.5) / W, v = Math.min(1, sample(nm) * brightness), c = shRGB(nm);
      for (let y = 0; y < H; y++) {
        const k = 4 * (y * W + x), e = 1 - Math.abs(y - (H - 1) / 2) / (H * 0.6);
        d[k] = 255 * Math.min(1, c[0] * v * e + 0.05); d[k + 1] = 255 * Math.min(1, c[1] * v * e + 0.05);
        d[k + 2] = 255 * Math.min(1, c[2] * v * e + 0.06); d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.specTex.needsUpdate = true;
    const n = ws > 1e-9 ? ws : 1, mx = Math.max(rs, gs, bs) / n || 1;
    const avg = [rs / n / mx, gs / n / mx, bs / n / mx].map(v => (Number.isFinite(v) ? v : 0));
    const b = Math.min(1, Math.max(0, brightness));
    this.outMat.color.setRGB(avg[0] * 1.6 * b, avg[1] * 1.6 * b, avg[2] * 1.6 * b);
  }

  setOutputLine(nm, brightness = 1) {
    const n = 321, lam = new Float64Array(n), S = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      lam[i] = 0.74 + 0.08 * i / (n - 1);
      S[i] = Math.exp(-0.5 * ((lam[i] * 1000 - nm) / 0.7) ** 2);
    }
    this.setOutputSpectrum(lam, S, brightness);
  }

  setOutputVisible(on) {
    const sp = this.mode === 'spatial';
    this.beams.out[0].visible = on;
    this.beams.out[1].visible = on && !sp;
    this.beams.outCam[0].visible = on && sp;
    this.fan.visible = on && this.mode !== 'quantum' && !sp;
  }

  // ------------------------------------------------------------------ HV source, probes, computer
  buildElectronics() {
    const hv = new THREE.Group();
    hv.add(box(6.8, 3.2, 4.2, std(0x3a4049, { metalness: 0.35, roughness: 0.45 }), -15, TABLE_Y + 1.6, -15));
    this.hvScreen = box(0.1, 1.1, 2.2, std(0x0b0e12, { emissive: 0xff9a2e, emissiveIntensity: 0.15 }), -11.55, TABLE_Y + 2.1, -15);
    this.hvScreen.material.userData.noHighlight = true;     // its glow is animated (update); hovering must not replace it
    hv.add(this.hvScreen);
    for (const z of [-16.2, -13.8]) hv.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 16), std(0xc0392b), -11.5, TABLE_Y + 0.9, z).rotateZ(Math.PI / 2));
    // probe station: post, micropositioner, arm and a needle whose sharp tip rests on the top electrode
    const ps = new THREE.Group(), top = V(-10.5, 2.4, -7.5), hold = V(-7.1, 1.65, -4.9), ph = top.y - (TABLE_Y + 0.6);
    ps.add(box(2.2, 0.6, 2.2, anod(), top.x, TABLE_Y + 0.3, top.z));
    ps.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, ph, 12), metal(), top.x, TABLE_Y + 0.6 + ph / 2, top.z));
    const gold = () => std(0xc9a24a, { metalness: 0.85, roughness: 0.28 });
    ps.add(box(0.9, 0.7, 0.9, anod(), top.x, top.y, top.z), rod(top, hold, 0.13, 0.13, gold()), box(0.38, 0.38, 0.38, gold(), hold.x, hold.y, hold.z));
    this.needleMat = std(0xd0b070, { metalness: 0.9, roughness: 0.2, emissive: PAL.spark, emissiveIntensity: 0 });
    this.needleMat.userData.noHighlight = true;
    ps.add(rod(HV_TIP, hold, 0.006, 0.055, this.needleMat));
    hv.add(ps);
    const hot = cable([V(-11.5, TABLE_Y + 0.9, -13.8), V(-10.5, TABLE_Y + 0.15, -11.2), V(-10.1, TABLE_Y + 1.6, -8.4), V(-10.12, 0.8, -7.85),
      V(-10.25, 2.85, -7.55), V(-8.8, 2.4, -6.25), V(-7.2, 1.95, -5.0)], 0xb8923e, 0.08);
    Object.assign(hot.material, { metalness: 0.75, roughness: 0.32 });      // a gold-coloured high-voltage lead
    hv.add(hot);
    this.probe = [ps, hot];                    // hidden while the chip is opened up: the layers move, the probe does not
    hv.add(cable([V(-11.5, TABLE_Y + 0.9, -16.2), V(-9, TABLE_Y + 0.4, -12), V(-7.2, TABLE_Y + 0.6, -6), V(-6.6, -4.2, -4.25)], 0x1d1f22, 0.08));
    this.register('hv', hv, V(-15, TABLE_Y + 4.6, -15));
    this.buildVoltage(hot.userData.curve);

    // the control computer: a large monitor (what it measures and decides is shown on it), on a stand
    const pc = new THREE.Group();
    const mx = PC.x, mz = PC.z, my = TABLE_Y + 6.95;
    pc.add(box(13.5, 8.1, 0.4, std(0x1b1f25, { metalness: 0.4 }), mx, my, mz));
    this.pcScreen = box(12.6, 7.2, 0.05, std(0x0c1016, { emissive: 0xffffff, emissiveIntensity: 0.9 }), mx, my, mz + 0.22);
    pc.add(this.pcScreen);
    pc.add(box(0.6, 2.8, 0.6, metal(), mx, TABLE_Y + 1.6, mz - 0.2), box(3.6, 0.25, 2.4, metal(), mx, TABLE_Y + 0.15, mz - 0.2));
    pc.add(box(6.5, 0.3, 2.2, std(0x2c3138), mx, TABLE_Y + 0.15, mz + 3.6));
    this.register('pc', pc, V(mx, TABLE_Y + 11.9, mz));
    this.pcCanvas = makeCanvas(384, 222);
    this.pcTex = canvasTex(this.pcCanvas);
    this.pcScreen.material.emissiveMap = this.pcTex;
    this.pcScreen.material.needsUpdate = true;
    this.drawPCScreen([]);
  }

  // the high voltage reaching the chip: current pulses running along the cable to the probe, sparks where the
  // needle touches the top electrode, and rings spreading over the electrode (the ripple plane, buildChip)
  buildVoltage(curve) {
    const fx = this.hvFx = new THREE.Group(), spark = new THREE.Color(PAL.spark);
    // a comet-shaped dash, bright head first, repeated every 3.4 units along the cable
    const c = makeCanvas(128, 4), g = c.getContext('2d'), img = g.createImageData(128, 4);
    for (let x = 0; x < 128; x++) {
      const s = x / 128, v = s <= 0.85 ? Math.pow(Math.max(0, (s - 0.6) / 0.25), 2.2) : Math.exp(-(((s - 0.85) / 0.025) ** 2));
      for (let y = 0; y < 4; y++) {
        const i = 4 * (y * 128 + x);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v); img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = this.hvPulseTex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.TubeGeometry(curve, 160, 0.13, 8, false), uv = geo.attributes.uv, n = curve.getLength() / 3.4;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * n);
    const pulses = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: spark.clone().multiplyScalar(1.6), map: tex,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pulses.renderOrder = 8;
    fx.add(pulses);
    // glow at the contact
    const gc = makeCanvas(64, 64), gx = gc.getContext('2d'), rg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.2, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = rg; gx.fillRect(0, 0, 64, 64);
    // not depth-tested: the camera-facing disc would otherwise be cut flat where it meets the chip
    this.hvGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(gc), color: spark.clone().multiplyScalar(2.2),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.hvGlow.position.copy(HV_TIP).add(V(0, 0.06, 0));
    this.hvGlow.scale.set(0.8, 0.8, 1);
    this.hvGlow.renderOrder = 9;
    fx.add(this.hvGlow);
    // sparks: a stock of jagged discharges from the tip across the electrode; a few flicker at a time
    let seed = 7;
    this.rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rnd = this.rnd;
    const boltMat = new THREE.MeshBasicMaterial({ color: spark.clone().multiplyScalar(3.0), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    this.bolts = [];
    for (let k = 0; k < 12; k++) {
      let pts = [V(0, 0.05, 0), V(0.45 + 0.75 * rnd(), 0.012, 0)];
      for (let it = 0; it < 4; it++) {                 // midpoint displacement
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], s = a.distanceTo(b), m = a.clone().lerp(b, 0.5);
          m.z += (rnd() - 0.5) * s * 0.8;
          m.y = Math.max(0.012, m.y + (rnd() - 0.35) * s * 0.4);
          next.push(m, b);
        }
        pts = next;
      }
      const path = new THREE.CurvePath();
      for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
      const b = new THREE.Mesh(new THREE.TubeGeometry(path, 48, 0.014, 4, false), boltMat);
      b.position.copy(HV_TIP);
      b.visible = false;
      b.renderOrder = 9;
      fx.add(b);
      this.bolts.push(b);
    }
    this.boltT = 0;
    this.scene.add(fx);
  }

  updateVoltage(dt, on, speed) {
    this.hvFx.visible = on;
    // over the measured 2D patterns and the simulated light (Figs 4, 5) the rings would only get in the way
    this.ripple.visible = on && !['spatial', 'spatiospec'].includes(this.mode);
    this.needleMat.emissiveIntensity = 0;
    if (!on) return;
    this.hvPulseTex.offset.x = (this.hvPulseTex.offset.x - dt * 1.1 * speed) % 1;
    const ru = this.rippleMat.uniforms;
    ru.time.value += dt * speed; ru.rings.value = speed; ru.cutZ.value = this.cut.cur;
    // sparks stay on the chip: directions between -x+z and +x-z from the tip near the chip's corner
    if (!speed) {
      this.bolts.forEach((b, i) => { b.visible = i === 0 || i === 5; });
      this.bolts[0].rotation.y = -0.6; this.bolts[5].rotation.y = -1.5;
      this.boltT = 0;
    } else if ((this.boltT -= dt) <= 0) {
      for (const b of this.bolts) b.visible = false;
      const n = 1 + Math.floor(this.rnd() * 3);
      for (let i = 0; i < n; i++) {
        const b = this.bolts[Math.floor(this.rnd() * this.bolts.length)];
        b.visible = true;
        b.rotation.y = -2.17 + 2.77 * this.rnd();
      }
      this.boltT = 0.05 + 0.07 * this.rnd();
    }
    const flick = speed ? 0.7 + 0.3 * Math.abs(Math.sin(this.time * 37) * Math.sin(this.time * 23)) : 0.85;
    this.hvGlow.material.opacity = flick;
    this.needleMat.emissiveIntensity = 0.5 * flick;
  }

  drawPCScreen(series) {
    const g = this.pcCanvas.getContext('2d'), W = this.pcCanvas.width, H = this.pcCanvas.height, k = W / 256;
    g.fillStyle = '#0d1520'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#26384a'; g.lineWidth = k;
    for (let y = 20 * k; y < H; y += 32 * k) { g.beginPath(); g.moveTo(8 * k, y); g.lineTo(W - 8 * k, y); g.stroke(); }
    if (series.length > 1) {
      g.strokeStyle = '#5fb3ff'; g.lineWidth = 3 * k; g.beginPath();
      series.forEach((v, i) => { const x = 8 * k + (W - 16 * k) * i / (series.length - 1), y = H - 8 * k - (H - 28 * k) * v; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    } else {
      // idle screen: a stylised stripe pattern, so the monitor never looks switched off
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#123a22' : '#1e6b3a'; g.fillRect((28 + i * 14) * k, 40 * k, 14 * k, 60 * k); }
    }
    this.pcTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ quantum add-ons (proposed)
  buildQuantum() {
    const dich = new THREE.Group();
    const d = box(0.14, 2.0, 2.4, std(0xffd08a, { transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false }), 19.4, YC, 0);
    d.rotation.y = -Math.PI / 4;
    dich.add(d, post(19.4, 0.6, YC - 1.0, 0.2));
    this.register('dichroic', dich, V(19.4, YC + 2.2, 0.8));
    const det = (id, x, z, rotY, lab) => {
      const g = new THREE.Group();
      const b = box(2.2, 1.9, 2.2, std(0x2f3540, { metalness: 0.35 }), x, YC, z);
      const win = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), std(0x111111, { emissive: 0xff5040, emissiveIntensity: 0 }), x, YC, z);
      win.rotation.z = Math.PI / 2; win.rotation.y = rotY;
      win.position.x += Math.cos(rotY) * -1.12; win.position.z += Math.sin(rotY) * 1.12;
      g.add(b, win, post(x, z, YC - 0.95, 0.22));
      g.userData.win = win;
      this.register(id, g, lab);
      return g;
    };
    this.spdA = det('spdA', 19.4, -6.4, Math.PI / 2, V(17.2, YC + 1.9, -6.4));
    this.spdB = det('spdB', 26.2, 0, 0, V(26.2, YC + 2.0, 0));
    const co = new THREE.Group();
    co.add(box(4.4, 2.0, 3.0, std(0x343a44, { metalness: 0.3 }), 25.5, TABLE_Y + 1.0, -8.5));
    co.add(box(0.06, 0.9, 2.0, std(0x0b0e12, { emissive: 0x40ff9a, emissiveIntensity: 0.4 }), 27.72, TABLE_Y + 1.2, -8.5));
    co.add(cable([V(19.4, YC - 0.9, -6.4), V(20.5, TABLE_Y + 0.4, -7.4), V(23.3, TABLE_Y + 0.5, -8.5)]));
    co.add(cable([V(26.2, YC - 0.9, 0), V(26.6, TABLE_Y + 0.4, -3), V(25.8, TABLE_Y + 1.2, -7.0)]));
    this.register('coinc', co, V(25.5, TABLE_Y + 3.4, -9.6));
    const cdiv = document.createElement('div');
    cdiv.className = 'counter';
    this.qCounterDiv = cdiv;
    this.qCounter = new CSS2DObject(cdiv);
    this.qCounter.position.set(25.5, TABLE_Y + 1.1, -6.9);
    this.scene.add(this.qCounter);
    this.coincidences = 0;
    this.updateCounter();
    this.pairMat = beamMaterial(rgbOf(PAL.pump), 0.7, this.dash, 0.16);
    this.beams.qout = [
      beamMesh(V(CHIP.lx / 2, YC, 0), V(11.6, YC, 0), 0.04, 0.2, this.pairMat),
      beamMesh(V(12.0, YC, 0), V(19.4, YC, 0), 0.2, 0.2, this.pairMat),
      beamMesh(V(19.4, YC, 0), V(19.4, YC, -5.3), 0.18, 0.18, this.pairMat),
      beamMesh(V(19.4, YC, 0), V(25.1, YC, 0), 0.18, 0.18, this.pairMat),
    ];
    for (const b of this.beams.qout) this.scene.add(b);
    this.sparks = [];
    const sg = new THREE.SphereGeometry(0.16, 10, 8);
    const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.7, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Mesh(sg, sm);
      s.visible = false;
      s.renderOrder = 9;
      this.scene.add(s);
      this.sparks.push({ mesh: s, active: false });
    }
    this.pairsInFlight = new Map();
    this.pairId = 0;
  }

  updateCounter() {
    if (this.qCounterDiv) this.qCounterDiv.textContent = `${this.labelText('__coinc')}: ${this.coincidences}`;
  }

  setPairRate(rate) {
    this.pairRate = rate;
    this.pairMat.opacity = 0.03 + 0.13 * Math.min(1, rate);
  }

  emitPair() {
    const path = (end) => [V(CHIP.lx / 2, YC + EXPLODE.core * this.explode.cur, 0), V(12, YC, 0), V(19.4, YC, 0), end];
    const ends = [V(19.4, YC, -5.3), V(25.1, YC, 0)];
    const id = ++this.pairId;
    let n = 0;
    for (const s of this.sparks) {
      if (s.active) continue;
      Object.assign(s, { active: true, path: path(ends[n]), seg: 0, t: 0, pair: id, det: n });
      s.mesh.visible = true;
      s.mesh.position.copy(s.path[0]);
      if (++n === 2) break;
    }
    if (n === 2) this.pairsInFlight.set(id, 0);
  }

  // ------------------------------------------------------------------ the computer's links (and the feedback loop)
  // The control computer always sends the pattern to the SLM: data pulses run along that cable in every mode.  The
  // spectrometer's measurement runs to the computer only while it feeds back (adapt, train), with the loop's label.
  buildFeedback() {
    const c = makeCanvas(128, 4), gx = c.getContext('2d'), img = gx.createImageData(128, 4);
    for (let x = 0; x < 128; x++) {
      const s = x / 128, v = s <= 0.8 ? Math.pow(Math.max(0, (s - 0.45) / 0.35), 2) : Math.exp(-(((s - 0.8) / 0.035) ** 2));
      for (let y = 0; y < 4; y++) { const i = 4 * (y * 128 + x); img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * v); img.data[i + 3] = 255; }
    }
    gx.putImageData(img, 0, 0);
    this.fbTex = new THREE.CanvasTexture(c);
    this.fbTex.wrapS = this.fbTex.wrapT = THREE.RepeatWrapping;
    this.fbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.3, 1.1), map: this.fbTex, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    this.feedback = new THREE.Group();                // the measurement's pulses: only while the computer feeds back
    this.fbToPC = new THREE.Group();                  // the spectrometer's cable (hidden where there is no spectrometer)
    // a cable from p[0] to p[last] (its texture u runs that way, and the texture moves towards larger u, see update)
    const link = (pts, plug, holder, pulsesTo) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 200, 0.15, 8, false), uv = geo.attributes.uv, n = curve.getLength() / 2.6;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * n);
      const pulses = new THREE.Mesh(geo, this.fbMat);
      pulses.renderOrder = 8;
      holder.add(cable(pts, 0x2a2f36, 0.09), plug);
      pulsesTo.add(pulses);
      return curve;
    };
    const always = new THREE.Group();
    this.fbToPC.add(this.feedback);
    this.scene.add(always, this.fbToPC);
    const toPC = link([V(28.4, YC + 0.2, SPEC.sz - 0.42), V(27.4, TABLE_Y + 0.5, -8.6), V(26.9, TABLE_Y + 0.25, -12.0),
      V(28.6, TABLE_Y + 0.4, PC.z - 0.1), V(30.2, TABLE_Y + 3.4, PC.z - 0.35)], box(0.5, 0.4, 0.2, anod(), 30.2, TABLE_Y + 3.4, PC.z - 0.3),
      this.fbToPC, this.feedback);
    const toSLM = link([V(26.2, TABLE_Y + 10.0, PC.z - 0.35), V(22.5, 8.5, -14.0), V(15.0, 16.0, -9.5), V(9.0, 17.2, -4.0),
      V(6.15, 14.2, -0.9)], box(0.3, 0.5, 0.6, anod(), 6.0, 14.2, -0.9), always, always);
    this.feedback.visible = false;
    this.fbDiv = document.createElement('div');
    this.fbDiv.className = 'fblabel';
    this.fbDiv.textContent = this.labelText('__fb');
    this.fbLabel = new CSS2DObject(this.fbDiv);
    this.fbLabel.position.copy(toSLM.getPoint(0.45));
    this.fbLabel.visible = false;
    this.scene.add(this.fbLabel);
    this.fbCurves = [toPC, toSLM];
  }

  setFeedback(on) { this.feedback.visible = on; this.fbOn = on; }

  // ------------------------------------------------------------------ modes
  setMode(mode) {
    this.mode = mode;
    const q = mode === 'quantum', sp = mode === 'spatial', ss = mode === 'spatiospec';
    for (const id of QUANTUM_ONLY) this.components[id].group.visible = q;
    this.qCounter.visible = q;
    this.components.spec.group.visible = !q && !sp;
    this.camGroup.visible = sp;
    this.setLensGhost(mode === 'how');
    this.fan.visible = !q && !sp;
    for (const t of this.specTicks) t.visible = ['colors', 'train', 'spatiospec'].includes(mode);
    this.fbToPC.visible = !q && !sp;                  // the spectrometer's cable goes with the spectrometer
    this.setActiveLaser(mode === 'adapt' || mode === 'how' ? 'cw' : 'fs', 1560);
    this.beams.out[0].visible = !q;
    this.beams.out[1].visible = !q && !sp;
    this.beams.outCam[0].visible = sp;
    for (const b of this.beams.qout) b.visible = q;
    for (const s of this.sparks) { s.active = false; s.mesh.visible = false; }
    this.pairsInFlight.clear();
    this.setFeedback(mode === 'adapt' || mode === 'train');
    if (!sp) { this.setSheet(null); this.drawCamera(null); }
    if (!ss) this.setSurface(null);
    if (!sp && !ss) this.setPattern2D(null);
    this.refreshLabels();
  }

  // camera pose that frames FITS[name] for the current aspect ratio
  fitView(name) {
    const f = FITS[name] || FITS.overview;
    const [a, b] = f.box;
    const center = a.clone().add(b).multiplyScalar(0.5);
    const dir = f.from.clone().sub(center).normalize();
    const corners = [];
    for (const x of [a.x, b.x]) for (const y of [a.y, b.y]) for (const z of [a.z, b.z]) corners.push(V(x, y, z));
    const cam = this.camera.clone();
    cam.aspect = this.camera.aspect;
    cam.updateProjectionMatrix();
    const p = new THREE.Vector3();
    let lo = 2, hi = 400;
    for (let it = 0; it < 32; it++) {
      const d = 0.5 * (lo + hi);
      cam.position.copy(center).addScaledVector(dir, d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      let ok = true;
      for (const c of corners) {
        p.copy(c).project(cam);
        if (p.z > 1 || Math.abs(p.x) > 0.93 || p.y > 0.8 || p.y < -0.8) { ok = false; break; }
      }
      if (ok) hi = d; else lo = d;
    }
    return { pos: center.clone().addScaledVector(dir, hi), target: center };
  }

  flyTo(name, dur = 1.3) {
    const v = typeof name === 'string' ? this.fitView(name) : name;
    this.atView = typeof name === 'string' ? name : null;
    if (this.reduced || dur <= 0) {
      this.tween = null;
      this.camera.position.copy(v.pos); this.controls.target.copy(v.target); this.controls.update();
      return;
    }
    this.tween = { t: 0, dur, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: v.pos.clone(), t1: v.target.clone() };
  }

  // ------------------------------------------------------------------ picking
  setupPicking() {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const el = this.renderer.domElement;
    const pointers = new Map();
    let gesture = null;
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this.pickables.filter(m => this.isShown(m) && !(this.lensGhost && m.userData.compId === 'projLens')), false);
      return hits.length ? hits[0].object.userData.compId : null;
    };
    el.addEventListener('pointerdown', e => {
      pointers.set(e.pointerId, true);
      if (pointers.size === 1) gesture = { x: e.clientX, y: e.clientY, multi: false, button: e.button };
      else if (gesture) gesture.multi = true;
      this.cancelTween();
      this.atView = null;
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (gesture && pointers.size === 0) {
        if (!gesture.multi && gesture.button === 0 && e.type === 'pointerup' &&
            Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 6) this.select(pick(e));
        gesture = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      this.hover(pick(e));
    });
    el.addEventListener('pointerleave', () => this.hover(null));
    el.addEventListener('wheel', () => { this.cancelTween(); this.atView = null; }, { passive: true });
  }

  isShown(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  cancelTween() { this.tween = null; }

  hover(id) {
    if (id === this.hovered) return;
    if (this.hovered) this.highlight(this.hovered, this.hovered === this.selected ? 2 : 0);
    this.hovered = id;
    if (id) this.highlight(id, 1);
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
    this.onHover(id);
  }

  select(id) {
    if (this.selected && this.selected !== id) this.highlight(this.selected, 0);
    this.selected = id;
    if (id) this.highlight(id, 2);
    this.onSelect(id);
  }

  highlight(id, level) {
    const c = this.components[id];
    if (!c) return;
    const col = [0x000000, 0x25303c, 0x34485a][level];
    c.group.traverse(o => {
      const m = o.material;
      if (o.isMesh && m && m.isMeshStandardMaterial && !m.emissiveMap && !m.userData.noHighlight) {
        if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissive.getHex();
        m.emissive.setHex(level ? col : m.userData.baseEmissive);
      }
    });
    c.div.classList.toggle('hot', level === 1);
  }

  // ------------------------------------------------------------------ frame
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.vw = w; this.vh = h;
    for (const c of Object.values(this.components)) c.w = 0;
    for (const L of this.layerLabels) L.w = 0;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.maxPR));
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    if (this.composer) { this.composer.setPixelRatio(Math.min(devicePixelRatio, this.maxPR)); this.composer.setSize(w, h); }
    if (this.atView && !this.tween) this.flyTo(this.atView, 0);
  }

  flash(obj, dur = 0.35, boost = 1.0) {
    const m = obj && obj.material;
    if (!m || m.emissiveIntensity === undefined || this.reduced) return;
    const old = this.flashes.find(f => f.obj === obj);
    if (old) { old.t = 0; return; }
    this.flashes.push({ obj, t: 0, dur, base: m.emissiveIntensity, boost });
  }

  setReducedMotion(on) { this.reduced = on; }

  update(dt) {
    this.time += dt;
    const speed = this.reduced ? 0 : 1;
    this.flow.offset.y = (this.flow.offset.y - dt * 0.9 * speed) % 1;
    this.dash.offset.y = (this.dash.offset.y - dt * 1.4 * speed) % 1;
    if (this.fbTex) this.fbTex.offset.x = (this.fbTex.offset.x - dt * 1.1 * speed) % 1;   // data towards the cables' ends
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const f = Math.min(1, tw.t / tw.dur), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      this.camera.position.lerpVectors(tw.p0, tw.p1, e);
      this.controls.target.lerpVectors(tw.t0, tw.t1, e);
      if (f >= 1) this.tween = null;
    }
    this.controls.update(dt);
    // pattern cross-fade
    if (this.fade) {
      this.fade.t += dt;
      const f = Math.min(1, this.fade.t / this.fade.dur);
      for (let i = 0; i < NPAT; i++) this.pattern[i] = this.patFrom[i] + (this.patTo[i] - this.patFrom[i]) * f;
      this.applyPattern(this.pattern, f >= 1);
      if (f >= 1) this.fade = null;
    }
    // cut-away
    const k = 1 - Math.exp(-dt * (this.reduced ? 60 : 3.2));
    this.cut.cur += (this.cut.target - this.cut.cur) * k;
    if (Math.abs(this.cut.target - this.cut.cur) < 1e-3) this.cut.cur = this.cut.target;
    this.clip.constant = this.cut.cur;
    const cutting = this.cut.cur < CUT_NONE - 0.02;
    const ex = this.explode.cur > 0.02;
    for (const id in this.caps) {
      const cap = this.caps[id];
      cap.visible = cutting && !ex;
      cap.position.z = this.cut.cur + 0.002;
    }
    this.arrows.position.z = this.cut.cur + 0.03;
    this.arrows.visible = cutting && this.step >= 3 && !ex;
    // the pump and the new light along the light guide: on the cut face, or (chip opened) on the lifted guide's front face
    this.corePump.visible = (cutting || ex) && this.step >= 4 && this.mode === 'how';
    this.coreSH.visible = this.corePump.visible;
    this.corePump.position.z = this.coreSH.position.z = ex ? CHIP.lz / 2 + 0.012 : this.cut.cur + 0.012;
    this.corePump.position.y = this.coreSH.position.y = YC + (ex ? EXPLODE.core * this.explode.cur : 0);
    // exploded view
    this.explode.cur += (this.explode.target - this.explode.cur) * k;
    if (Math.abs(this.explode.target - this.explode.cur) < 1e-3) this.explode.cur = this.explode.target;
    const e = this.explode.cur;
    for (const L of LAYERS) this.layerMeshes[L.id].position.y = L.y + EXPLODE[L.id] * e;
    // the simulated light (Fig. 4): seen through the top of the closed chip; on the lifted light guide when opened
    if (this.sheets) {
      const open = e > 0.02, y = open ? LY.core.top + EXPLODE.core * e + 0.012 : YC;
      for (const m of [...this.sheets, this.pumpSheet]) { m.visible = this.sheetOn; m.position.y = y; m.material.depthTest = open; }
      this.sheetBack.visible = this.sheetOn && !open;
    }
    // the beams into and out of the chip follow the light guide
    if (this._beamE !== e) {
      this._beamE = e;
      const yc = YC + EXPLODE.core * e;
      aimBeam(this.beams.pump[1], V(IN_LENS + 0.2, YC, 0), V(-CHIP.lx / 2, yc, 0));
      aimBeam(this.beams.out[0], V(CHIP.lx / 2, yc, 0), V(11.6, YC, 0));
      aimBeam(this.beams.qout[0], V(CHIP.lx / 2, yc, 0), V(11.6, YC, 0));
    }
    const cutLabels = cutting && !ex && this.mode === 'how';
    for (const L of this.layerLabels) {
      L.obj.visible = this.explode.cur > 0.6 || (cutLabels && ['pc', 'core', 'si'].includes(L.id));
      L.obj.position.z = this.explode.cur > 0.6 ? CHIP.lz / 2 : this.cut.cur;
      if (L.obj.visible) {
        // right-aligned at the chip's end; slid onto the chip rather than cut off by the canvas edge
        if (!L.w) L.w = L.div.offsetWidth;
        if (L.w) {
          const q = L.obj.getWorldPosition(this._tmpL || (this._tmpL = new THREE.Vector3())).project(this.camera);
          L.obj.center.x = Math.min(1, Math.max(0, ((q.x + 1) / 2 * this.vw - 8) / L.w));
        }
      }
    }
    // the programming light: on the top electrode, or (chip opened) on the photoconductor that absorbs it, with
    // the chi2 it writes in the light guide and the field lines between them
    this.lightPlane.visible = !ex && this.step >= 1;
    this.lightPC.visible = ex && this.step >= 1;
    this.chiPlane.visible = ex && this.step >= 4;
    this.fieldLines.visible = ex && this.step >= 3;
    if (this.fieldLines.visible) this.updateFieldLines();
    this.cone.visible = this.step >= 1;
    this.components.projLens.group.visible = !ex;                 // the lifted layers would run into it
    for (const b of this.beams.green) b.visible = this.step >= 1;
    const ru = this.rayMat.uniforms, R = this.rayR, dy = (LY.pc.top + EXPLODE.pc) * e;
    this.cone.position.y = dy;                                    // the rays land on the lifted photoconductor
    ru.y0.value = R.y0 + dy; ru.box.value.w = R.h + dy;
    ru.cutZ.value = this.cut.cur;
    ru.flow.value = (ru.flow.value + dt * 0.9 * speed) % 1;      // same speed as the beams' stripes
    ru.topFade.value = ex ? 1 : 0;                                // no projection lens drawn while the chip is opened
    // under the simulated light inside the chip (Fig. 4) the full green would wash its colour out
    const sheet = this.sheetOn && !ex, dim = sheet ? 0.45 : 1;
    this.lightPlane.material.color.copy(this.lightColor).multiplyScalar(dim * (this.pat2DOn ? 1 : this.lightGain || 1));
    this.fbLabel.visible = !!this.fbOn && !ex;
    ru.gain.value = this.rayBase.gain * (sheet ? 0.6 : 1); ru.face.value = this.rayBase.face * (sheet ? 0.6 : 1);
    const hvOn = this.mode === 'how' ? this.step >= 3 : true;
    this.hvScreen.material.emissiveIntensity = hvOn ? 0.55 + 0.25 * Math.sin(this.time * 2 * speed) : 0.1;
    for (const o of this.probe) o.visible = !ex;
    this.updateVoltage(dt, hvOn && !ex, speed);
    // flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const a = Math.max(0, 1 - f.t / f.dur);
      f.obj.material.emissiveIntensity = f.base + f.boost * a;
      if (f.t >= f.dur) { f.obj.material.emissiveIntensity = f.base; this.flashes.splice(i, 1); }
    }
    // photon sparks
    for (const s of this.sparks) {
      if (!s.active) continue;
      s.t += dt * 14;
      let a = s.path[s.seg], b = s.path[s.seg + 1], L = a.distanceTo(b);
      while (s.t > L && s.seg < s.path.length - 2) { s.t -= L; s.seg++; a = s.path[s.seg]; b = s.path[s.seg + 1]; L = a.distanceTo(b); }
      if (s.t >= L) {
        s.active = false; s.mesh.visible = false;
        this.flash((s.det === 0 ? this.spdA : this.spdB).userData.win, 0.35, 2.5);
        const n = (this.pairsInFlight.get(s.pair) || 0) + 1;
        if (n === 2) { this.pairsInFlight.delete(s.pair); this.coincidences++; this.updateCounter(); }
        else this.pairsInFlight.set(s.pair, n);
        continue;
      }
      s.mesh.position.lerpVectors(a, b, s.t / L);
    }
  }

  render() {
    if (this.debugHide) for (const k of this.debugHide) { if (this[k] && this[k].isObject3D) this[k].visible = false; }
    this.updateLabels();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

export { NPAT, PROG, CHIP };
