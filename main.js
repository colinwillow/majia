/* ============================================================
   MAJIA STUDIO — app
   boids wordmark · shoji router · theme · lazy ink robot
   ============================================================ */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- theme ---------------------------------------------------- */
const THEME_KEY = 'majia-theme';
const themeListeners = new Set();
function theme(){ return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function applyTheme(t){
  if (t === 'light') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch(_){}
  themeListeners.forEach(fn => fn(t));
}
let stored = 'light';
try { stored = localStorage.getItem(THEME_KEY) || 'light'; } catch(_){}
applyTheme(stored === 'dark' ? 'dark' : 'light');
document.getElementById('themeFlip').addEventListener('click', () => applyTheme(theme() === 'dark' ? 'light' : 'dark'));

function cssColor(varName){
  const c = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return c || '#000';
}

/* ---------- boids wordmark ------------------------------------------- */
(() => {
  const canvas = document.getElementById('logo');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let particles = [];
  const mouse = { x: -1e4, y: -1e4, active: false };
  let inkRGB = '28,26,22', sealRGB = '194,69,47';
  let bloom = 0, bloomTarget = 0;   // 0 = ink, 1 = seal colour

  function readColors(){
    // pull theme colours as rgb for canvas
    const probe = document.createElement('canvas').getContext('2d');
    const toRGB = (hex) => { probe.fillStyle = hex; const m = probe.fillStyle;
      if (m[0] === '#'){ const n = parseInt(m.slice(1),16); return `${(n>>16)&255},${(n>>8)&255},${n&255}`; }
      const p = m.match(/\d+/g); return p ? p.slice(0,3).join(',') : '0,0,0';
    };
    inkRGB = toRGB(cssColor('--ink'));
    sealRGB = toRGB(cssColor('--seal'));
  }
  readColors();
  themeListeners.add(readColors);

  // sample the wordmark into target points
  function sampleTargets(w, h){
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const o = off.getContext('2d');
    o.clearRect(0,0,w,h);
    o.fillStyle = '#000';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    const fs = Math.min(w * 0.26, h * 0.72);
    o.font = `500 ${fs}px "Playfair Display", Georgia, serif`;
    o.setTransform(1,0,0,1,0,0);
    o.fillText('MAJIA', w/2, h/2 + fs*0.04);
    const img = o.getImageData(0,0,w,h).data;
    const pts = [];
    const step = Math.max(3, Math.round(w/300)) * dpr;
    for (let y=0; y<h; y+=step)
      for (let x=0; x<w; x+=step)
        if (img[(y*w+x)*4+3] > 128) pts.push({ x, y });
    return pts;
  }

  function build(){
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;   // hidden (e.g. deep-linked to another screen)
    W = Math.round(rect.width * dpr); H = Math.round(rect.height * dpr);
    canvas.width = W; canvas.height = H;
    const targets = sampleTargets(W, H);
    // reuse existing particle positions where possible for a smooth remorph
    const prev = particles;
    particles = targets.map((t, i) => {
      const p = prev[i] || {
        x: Math.random()*W, y: Math.random()*H,
        vx: 0, vy: 0, r: (0.8 + Math.random()*0.9) * dpr,
      };
      p.tx = t.x; p.ty = t.y;
      return p;
    });
  }

  // map window pointer to canvas space
  addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * dpr;
    mouse.y = (e.clientY - rect.top) * dpr;
    mouse.active = true;
  });
  addEventListener('pointerleave', () => mouse.active = false);

  // colour bloom when hovering the primary CTA
  const cta = document.querySelector('[data-morph]');
  if (cta){
    cta.addEventListener('pointerenter', () => bloomTarget = 1);
    cta.addEventListener('pointerleave', () => bloomTarget = 0);
  }

  function tick(){
    bloom += (bloomTarget - bloom) * 0.08;
    ctx.clearRect(0,0,W,H);
    const R = 46 * dpr, R2 = R*R;
    const homeVisible = document.getElementById('screen-home').classList.contains('is-active');
    if (homeVisible){
      for (const p of particles){
        // ease toward the target slot — monotonic, crisp, frame-rate independent
        p.x += (p.tx - p.x) * 0.14;
        p.y += (p.ty - p.y) * 0.14;
        // pointer shock-wave: a decaying impulse that scatters, then the ease reforms
        if (mouse.active){
          const mx = p.x - mouse.x, my = p.y - mouse.y, d2 = mx*mx + my*my;
          if (d2 < R2){ const d = Math.sqrt(d2)||1, f = (1 - d/R) * 5; p.vx += (mx/d)*f; p.vy += (my/d)*f; }
        }
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.84; p.vy *= 0.84;
        const c = bloom > 0.02
          ? `${Math.round(28+(194-28)*bloom)},${Math.round(26+(69-26)*bloom)},${Math.round(22+(47-22)*bloom)}`
          : inkRGB;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = `rgb(${c})`; ctx.fill();
      }
    }
    requestAnimationFrame(tick);
  }

  function drawStatic(){ if(!W) return; for(const p of particles){p.x=p.tx;p.y=p.ty;} ctx.clearRect(0,0,W,H); ctx.fillStyle=`rgb(${inkRGB})`; for(const p of particles){ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.283);ctx.fill();} }
  const rebuild = () => { build(); if (reduced) drawStatic(); };
  // (re)build whenever the canvas gains size — handles deep-links to other screens,
  // returning to Home, resizes, and orientation changes, all in one hook
  new ResizeObserver(rebuild).observe(canvas);
  if (!reduced) requestAnimationFrame(tick);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
})();

/* ---------- shoji router --------------------------------------------- */
const screens = [...document.querySelectorAll('.screen')];
const names = new Set(screens.map(s => s.dataset.screen));
const shoji = document.getElementById('shoji');
let current = 'home', transitioning = false;
let robitApi = null, robitLoading = false;

const screenEl = n => document.querySelector(`[data-screen="${n}"]`);
function setNav(n){ document.querySelectorAll('.chrome__link').forEach(l => l.classList.toggle('is-active', l.dataset.nav === n)); }

async function ensureRobit(){
  if (robitApi || robitLoading) return;
  robitLoading = true;
  try {
    const mod = await import('./robit.js');
    robitApi = await mod.initRobit({ canvas: document.getElementById('robit'), theme, themeListeners, reduced });
    robitApi.setActive(current === 'robits');
  } catch (e){ console.warn('robit load failed', e); }
}

function goTo(name, { instant = false } = {}){
  if (!names.has(name)) name = 'home';
  if (name === current && !instant) return;
  if (transitioning) return;
  const from = screenEl(current), to = screenEl(name);
  current = name; setNav(name);
  if (name === 'robits') ensureRobit();

  if (instant || reduced){
    screens.forEach(s => s.classList.remove('is-active','is-hidden-fx'));
    to.classList.add('is-active'); robitApi && robitApi.setActive(name === 'robits'); return;
  }
  transitioning = true;
  shoji.classList.add('is-closed');
  from.classList.add('is-hidden-fx');
  setTimeout(() => {
    from.classList.remove('is-active','is-hidden-fx');
    to.classList.add('is-hidden-fx','is-active');
    robitApi && robitApi.setActive(name === 'robits');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      shoji.classList.remove('is-closed');
      setTimeout(() => to.classList.remove('is-hidden-fx'), 180);
    }));
    setTimeout(() => transitioning = false, 700);
  }, 580);
}

document.querySelectorAll('[data-nav]').forEach(link => {
  link.addEventListener('click', (e) => {
    const name = link.dataset.nav; e.preventDefault();
    if (transitioning || name === current) return;
    if (history.state?.screen !== name) history.pushState({ screen: name }, '', `#${name}`);
    goTo(name);
  });
});
addEventListener('popstate', (e) => goTo(e.state?.screen || location.hash.replace('#','') || 'home'));

/* ---------- boot ----------------------------------------------------- */
const boot = names.has(location.hash.replace('#','')) ? location.hash.replace('#','') : 'home';
history.replaceState({ screen: boot }, '', `#${boot}`);
screens.forEach(s => s.classList.remove('is-active'));
screenEl(boot).classList.add('is-active');
current = boot; setNav(boot);
if (boot === 'robits') ensureRobit();
if (!reduced){
  const f = screenEl(boot); f.classList.add('is-hidden-fx');
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => f.classList.remove('is-hidden-fx'), 150)));
}
document.getElementById('year').textContent = new Date().getFullYear();
