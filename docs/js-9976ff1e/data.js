// Measured data from the paper's public data set (R. Yanagimoto et al., Zenodo, doi:10.5281/zenodo.17074707),
// exported to site/data/ by realdata/extract_*.py.  Formats (realdata/webdata.py):
//   1D: {enc: 'u8'|'u16', shape, lo, hi, b64}        value = lo + (hi - lo) * q / (2^bits - 1)
//   2D: {png, shape: [rows, cols], lo, hi}  or  {png, shape, row_lo: [], row_hi: []}   (8-bit grey PNG, row 0 on top)
export const DATA_VERSION = '1b6df661';        // deploy.py writes the data folder's content hash here
// deployed copies live in data-<version>/ (tools/deploy.py), so a cached old script never reads new data
const url = p => (DATA_VERSION === 'dev' ? `./data/${p}` : `./data-${DATA_VERSION}/${p}`);
export const href = url;

const groups = new Map(), images = new Map(), grids = new Map();

// one JSON per paper figure group: fig2, fig3a, fig3b, fig3c, fig4, fig5
export function group(name) {
  if (!groups.has(name)) {
    groups.set(name, fetch(url(name + '.json')).then(r => {
      if (!r.ok) throw new Error(`data/${name}.json: HTTP ${r.status}`);
      return r.json();
    }).catch(e => { groups.delete(name); throw e; }));
  }
  return groups.get(name);
}

const decoded = new WeakMap();
export function arr(e) {
  if (!e) return null;
  if (typeof e === 'number') return Float32Array.of(e);
  if (decoded.has(e)) return decoded.get(e);
  let out;
  if (Array.isArray(e)) out = Float32Array.from(e.flat(Infinity));
  else {
    const bin = atob(e.b64), n = e.enc === 'u16' ? bin.length / 2 : bin.length;
    const top = e.enc === 'u16' ? 65535 : 255, k = (e.hi - e.lo) / top;
    out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const q = e.enc === 'u16' ? bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8) : bin.charCodeAt(i);
      out[i] = e.lo + k * q;
    }
  }
  decoded.set(e, out);
  return out;
}

// rows of a 1D-encoded 2D array (shape [rows, cols])
export function rows(e) {
  const a = arr(e), [r, c] = e.shape;
  return Array.from({ length: r }, (_, i) => a.subarray(i * c, (i + 1) * c));
}

export function image(path) {
  if (!images.has(path)) {
    images.set(path, new Promise((res, rej) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => { images.delete(path); rej(new Error('image ' + path)); };
      im.src = url(path);
    }));
  }
  return images.get(path);
}

// decoded 2D array: {rows, cols, v: Float32Array, row(r), img}
export function grid(desc) {
  if (!desc) return Promise.resolve(null);
  const key = desc.png;
  if (!grids.has(key)) {
    grids.set(key, image(desc.png).then(im => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      const [rows, cols] = desc.shape;
      const v = new Float32Array(rows * cols);
      for (let r = 0; r < rows; r++) {
        const lo = desc.row_lo ? desc.row_lo[r] : desc.lo, hi = desc.row_hi ? desc.row_hi[r] : desc.hi, k = (hi - lo) / 255;
        for (let q = 0; q < cols; q++) v[r * cols + q] = lo + k * px[4 * (r * c.width + q)];
      }
      return { rows, cols, v, img: im, row: r => v.subarray(r * cols, (r + 1) * cols) };
    }).catch(e => { grids.delete(key); throw e; }));
  }
  return grids.get(key);
}

// fetch every group in the background, one after another, so that switching modes is instant
export function prefetch(names) {
  let p = Promise.resolve();
  for (const n of names) p = p.then(() => group(n)).catch(() => {});
  return p;
}
