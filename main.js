/* ============================================================
   MAJIA STUDIO — app
   boids wordmark (bloom → flock → crisp mark + shimmer)
   shoji router · theme · lazy ink robot
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

function cssColor(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#000'; }

/* ---------- boids wordmark ------------------------------------------- */
(() => {
  const canvas = document.getElementById('logo');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const GOLDEN = 2.399963229728653;   // golden angle (radians)
  const ARRIVE_MS = 1700;             // bloom → formed

  let W = 0, H = 0, cx = 0, cy = 0, fontPx = 0;
  let particles = [];
  let phase = 'idle';                 // 'intro' → 'settled'
  let t0 = 0, introDone = false, logoFade = 0;
  const mouse = { x: -1e4, y: -1e4, active: false };
  let inkRGB = '28,26,22';
  let bloom = 0, bloomTarget = 0;

  function readColors(){
    const probe = document.createElement('canvas').getContext('2d');
    const toRGB = (hex) => { probe.fillStyle = hex; const m = probe.fillStyle;
      if (m[0] === '#'){ const n = parseInt(m.slice(1),16); return `${(n>>16)&255},${(n>>8)&255},${n&255}`; }
      const p = m.match(/\d+/g); return p ? p.slice(0,3).join(',') : '0,0,0'; };
    inkRGB = toRGB(cssColor('--ink'));
  }
  readColors(); themeListeners.add(readColors);

  function sampleTargets(w, h){
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const o = off.getContext('2d');
    o.clearRect(0,0,w,h); o.fillStyle = '#000'; o.textAlign = 'center'; o.textBaseline = 'middle';
    const fs = Math.min(w * 0.26, h * 0.72);
    o.font = `500 ${fs}px "Playfair Display", Georgia, serif`;
    o.fillText('MAJIA', w/2, h/2 + fs*0.04);
    const img = o.getImageData(0,0,w,h).data, pts = [];
    const step = Math.max(3, Math.round(w/300)) * dpr;
    for (let y=0; y<h; y+=step) for (let x=0; x<w; x+=step)
      if (img[(y*w+x)*4+3] > 128) pts.push({ x, y });
    return pts;
  }

  function build(){
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    W = Math.round(rect.width * dpr); H = Math.round(rect.height * dpr);
    canvas.width = W; canvas.height = H; cx = W/2; cy = H/2;
    fontPx = Math.min(W * 0.26, H * 0.72);   // must match sampleTargets()
    const targets = sampleTargets(W, H);
    const Rmax = Math.max(W, H) * 0.62;
    const prev = particles;
    particles = targets.map((t, i) => {
      const p = prev[i] || {
        x: 0, y: 0, vx: 0, vy: 0,
        r: (0.8 + Math.random()*0.9) * dpr,
        arr: 0.10 + Math.random()*0.06,          // per-particle arrive personality
        sp: 0.6 + Math.random()*1.4,             // shimmer speed
        ph: Math.random()*6.283,                 // shimmer phase
        am: (0.6 + Math.random()*1.6) * dpr,     // shimmer amplitude
      };
      p.tx = t.x; p.ty = t.y;
      // outward direction from the wordmark centre — for the "emanate around the outline" halo
      const dx = t.x - cx, dy = t.y - cy, d = Math.hypot(dx, dy) || 1;
      p.ox = dx/d; p.oy = dy/d;
      return p;
    });
    // first time it has real size → play the intro; later rebuilds (resize) keep state
    if (!introDone){
      for (let i=0;i<particles.length;i++){
        const p = particles[i];
        const rr = Math.sqrt(i/particles.length) * Rmax, a = i * GOLDEN;
        p.x = cx + Math.cos(a)*rr; p.y = cy + Math.sin(a)*rr;      // phyllotaxis bloom
        p.vx = p.vy = 0;
      }
      phase = 'intro'; t0 = performance.now(); logoFade = 0;
    }
  }

  addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * dpr; mouse.y = (e.clientY - rect.top) * dpr; mouse.active = true;
  });
  addEventListener('pointerleave', () => mouse.active = false);

  const cta = document.querySelector('[data-morph]');
  if (cta){ cta.addEventListener('pointerenter', () => bloomTarget = 1); cta.addEventListener('pointerleave', () => bloomTarget = 0); }

  function tick(now){
    bloom += (bloomTarget - bloom) * 0.08;
    ctx.clearRect(0,0,W,H);
    const home = document.getElementById('screen-home').classList.contains('is-active');
    if (home && particles.length){
      const R = 46 * dpr, R2 = R*R;
      const intro = phase === 'intro';
      if (intro){
        // switch when the swarm has actually arrived (frame-rate independent), or as a time fallback
        let acc = 0, k = 0;
        for (let i=0; i<particles.length; i+=17){ const p = particles[i]; acc += Math.abs(p.tx-p.x)+Math.abs(p.ty-p.y); k++; }
        const meanErr = k ? acc/k : 0;
        if (meanErr < 3*dpr || now - t0 > 4000){ phase = 'settled'; introDone = true; }
      }
      const settled = phase === 'settled';
      if (settled) logoFade += (1 - logoFade) * 0.05;
      const t = now * 0.001;
      const col = bloom > 0.02
        ? `${Math.round(28+(194-28)*bloom)},${Math.round(26+(69-26)*bloom)},${Math.round(22+(47-22)*bloom)}`
        : inkRGB;
      ctx.fillStyle = `rgb(${col})`;
      const alpha = settled ? 0.7 : 1;
      ctx.globalAlpha = alpha;

      for (const p of particles){
        // destination = target, plus a settled shimmer that haloes the outline
        let dx, dy;
        if (settled){
          const s = Math.sin(p.ph + t*p.sp), c = Math.cos(p.ph + t*p.sp);
          const halo = 1.4*dpr + 0.6*dpr*Math.sin(t*0.6 + p.ph);   // gentle outward breathing
          dx = (p.tx + p.ox*halo + c*p.am) - p.x;
          dy = (p.ty + p.oy*halo + s*p.am) - p.y;
        } else {
          dx = p.tx - p.x; dy = p.ty - p.y;
        }
        p.x += dx * p.arr * (intro ? 1.25 : 1); p.y += dy * p.arr * (intro ? 1.25 : 1);
        // pointer shock-wave (flee), then it eases back
        if (mouse.active){
          const mx = p.x - mouse.x, my = p.y - mouse.y, d2 = mx*mx + my*my;
          if (d2 < R2){ const d = Math.sqrt(d2)||1, f = (1 - d/R) * 5; p.vx += (mx/d)*f; p.vy += (my/d)*f; }
        }
        p.x += p.vx; p.y += p.vy; p.vx *= 0.84; p.vy *= 0.84;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // crisp wordmark fades in over the settled swarm — same fillText that made the targets,
      // so it registers exactly; particles halo just outside its strokes
      if (logoFade > 0.01){
        ctx.globalAlpha = logoFade;
        ctx.fillStyle = `rgb(${inkRGB})`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `500 ${fontPx}px "Playfair Display", Georgia, serif`;
        ctx.fillText('MAJIA', cx, cy + fontPx*0.04);
        ctx.globalAlpha = 1;
      }
    }
    requestAnimationFrame(tick);
  }

  function drawStatic(){ if(!W) return; ctx.clearRect(0,0,W,H);
    ctx.fillStyle=`rgb(${inkRGB})`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font = `500 ${fontPx}px "Playfair Display", Georgia, serif`;
    ctx.fillText('MAJIA', cx, cy + fontPx*0.04);
    introDone = true; phase = 'settled'; logoFade = 1; }

  const rebuild = () => { build(); if (reduced) drawStatic(); };
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
