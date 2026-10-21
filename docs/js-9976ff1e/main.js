// Boot: capability checks, error capture, then start the app.
const params = new URLSearchParams(location.search);
const errlog = document.getElementById('errlog');
window.__errors = [];
const report = (msg) => {
  window.__errors.push(String(msg));
  if (window.__errors.length > 50) window.__errors.splice(0, window.__errors.length - 50);
  errlog.textContent = window.__errors.join('\n');
  if (params.has('debug')) errlog.hidden = false;
};
window.addEventListener('error', e => report(e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
window.addEventListener('unhandledrejection', e => report('promise: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));

const FAIL = {
  en: 'The 3D view could not start. Please reload the page.',
  ja: '3D表示を開始できませんでした。ページを再読み込みしてください。',
};

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

async function boot() {
  const loading = document.getElementById('loading');
  if (!hasWebGL2()) {
    document.getElementById('fallback').hidden = false;
    loading.hidden = true;
    report('no WebGL2');
    return;
  }
  try {
    const { App } = await import('./app.js');
    window.__app = new App();
    loading.hidden = true;
    document.body.dataset.ready = '1';
  } catch (e) {
    report(e && (e.stack || e.message) || e);
    const ja = params.get('lang') === 'ja' || (params.has('kiosk') && params.get('lang') !== 'en');
    const span = loading.querySelector('span');
    span.className = 'loadmsg';
    span.textContent = ja ? `${FAIL.ja}\n${FAIL.en}` : `${FAIL.en}\n${FAIL.ja}`;
    loading.querySelector('.spinner').style.display = 'none';
    if (params.has('debug')) span.textContent += '\n\n' + (e && e.message || e);
    if (params.has('kiosk')) setTimeout(() => location.reload(), 30000);
  }
}
boot();
