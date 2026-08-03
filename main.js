/* ============================================================
   MAJIA STUDIO — app
   boids wordmark — Reynolds steering: elegant flow → arrive into the mark
   (ported from the portfolio's vehicle swarm) · shoji router · theme · robit
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
  const TAU = Math.PI * 2;
  const FLOW_MS = 1600;               // elegant flow before the mark forms

  let W = 0, H = 0, cx = 0, cy = 0, fontPx = 0;
  let particles = [];
  let phase = 'idle';                 // 'flow' → 'form' → (logo fades in)
  let t0 = 0, introDone = false, logoFade = 0;
  const mouse = { x: -1e4, y: -1e4, active: false };
  let inkRGB = '28,26,22', sealRGB = '194,69,47';
  let bloom = 0, bloomTarget = 0;

  function readColors(){
    const probe = document.createElement('canvas').getContext('2d');
    const toRGB = (hex) => { probe.fillStyle = hex; const m = probe.fillStyle;
      if (m[0] === '#'){ const n = parseInt(m.slice(1),16); return `${(n>>16)&255},${(n>>8)&255},${n&255}`; }
      const p = m.match(/\d+/g); return p ? p.slice(0,3).join(',') : '0,0,0'; };
    inkRGB = toRGB(cssColor('--ink')); sealRGB = toRGB(cssColor('--seal'));
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

  // elegant ambient position: particles ride slowly-morphing lissajous / rose curves
  function flowTarget(p, fc){
    const sc = Math.min(W,H)/700 * dpr;
    const si = p.si, t = p.t; p.t += p.spd;
    const pulse = Math.sin(fc*0.0008*si + si) * si * 5 * sc;
    if (p.fam === 0){
      const A = p.A*sc + pulse, B = p.B*sc + pulse;
      const xt = A*Math.sin(p.la*t), yt = B*Math.sin(p.lb*t + 0.9);
      const rot = fc*0.0002*si;
      return [cx + xt*Math.cos(rot) - yt*Math.sin(rot), cy + xt*Math.sin(rot) + yt*Math.cos(rot)];
    } else {
      const R = p.A*sc + pulse, r = R*Math.cos(p.k*t + fc*0.0001*si), rot = fc*0.00015*si;
      return [cx + Math.cos(t+rot)*r, cy + Math.sin(t+rot)*r];
    }
  }

  const SLOW = () => 55 * dpr;

  function build(){
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    W = Math.round(rect.width * dpr); H = Math.round(rect.height * dpr);
    canvas.width = W; canvas.height = H; cx = W/2; cy = H/2;
    fontPx = Math.min(W * 0.26, H * 0.72);
    const targets = sampleTargets(W, H);
    const prev = particles;
    particles = targets.map((tp, i) => {
      const p = prev[i] || newParticle();
      p.hx = tp.x; p.hy = tp.y;                         // home = letterform point
      return p;
    });
    if (!introDone){
      const spawnR = Math.min(W,H) * 0.42;
      for (const p of particles){
        const a = Math.random()*TAU, d = Math.random()*spawnR;
        p.x = cx + Math.cos(a)*d; p.y = cy + Math.sin(a)*d; p.vx = p.vy = 0;
      }
      phase = 'flow'; t0 = performance.now(); logoFade = 0;
    }
  }

  function newParticle(){
    const strand = Math.floor(Math.random()*6);
    const liss = [[2,3],[3,2],[4,3],[5,4]][strand % 4];
    return {
      x:0, y:0, vx:0, vy:0,
      r: (0.8 + Math.random()*0.9) * dpr,
      ms: (7 + Math.random()*7) * dpr,          // maxSpeed
      mf: (0.45 + Math.random()*0.6) * dpr,     // maxForce
      fr: (26 + Math.random()*46) * dpr,        // flee radius
      si: strand + 1,
      fam: strand < 3 ? 0 : 1,
      la: liss[0], lb: liss[1], k: [3,4,5][strand % 3],
      A: 70 + strand*13, B: 62 + strand*11,
      t: Math.random()*TAU*6, spd: 0.0004*(0.7 + Math.random()*0.6),
      bph: Math.random()*TAU,                   // breathing phase
    };
  }

  addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * dpr; mouse.y = (e.clientY - rect.top) * dpr; mouse.active = true;
  });
  addEventListener('pointerleave', () => mouse.active = false);
  const cta = document.querySelector('[data-morph]');
  if (cta){ cta.addEventListener('pointerenter', () => bloomTarget = 1); cta.addEventListener('pointerleave', () => bloomTarget = 0); }

  function tick(now){
    const fc = now * 0.06;                       // frame-count analogue (~ matches 60fps math)
    bloom += (bloomTarget - bloom) * 0.08;
    ctx.clearRect(0,0,W,H);
    const homeVis = document.getElementById('screen-home').classList.contains('is-active');
    if (homeVis && particles.length){
      // phase progression
      if (phase === 'flow' && now - t0 > FLOW_MS) phase = 'form';
      if (phase === 'form'){
        let acc=0,k=0; for (let i=0;i<particles.length;i+=17){ const p=particles[i]; acc+=Math.abs(p.hx-p.x)+Math.abs(p.hy-p.y); k++; }
        if ((k && acc/k < 4*dpr) || now - t0 > FLOW_MS + 2600){ introDone = true; }
      }
      if (introDone) logoFade += (1 - logoFade) * 0.05;

      const slow = SLOW();
      const cr = bloom>0.02 ? Math.round(28+(194-28)*bloom) : parseInt(inkRGB), useSeal = bloom>0.02;
      const dotRGB = useSeal
        ? `${Math.round(28+(194-28)*bloom)},${Math.round(26+(69-26)*bloom)},${Math.round(22+(47-22)*bloom)}`
        : inkRGB;

      for (const p of particles){
        let gx, gy;
        if (phase === 'flow'){ const f = flowTarget(p, fc); gx=f[0]; gy=f[1]; }
        else { const b = 1.3*dpr; gx = p.hx + Math.sin(fc*0.02 + p.bph)*b; gy = p.hy + Math.cos(fc*0.02 + p.bph)*b; }

        // arrive steering
        let dx=gx-p.x, dy=gy-p.y, d=Math.hypot(dx,dy)||1;
        let spd = d < slow ? (d/slow)*p.ms : p.ms;
        let ddx=dx/d*spd, ddy=dy/d*spd, sx=ddx-p.vx, sy=ddy-p.vy, sm=Math.hypot(sx,sy);
        if (sm>p.mf){ sx=sx/sm*p.mf; sy=sy/sm*p.mf; }
        p.vx+=sx; p.vy+=sy;
        // mouse flee (force, never teleport)
        if (mouse.active){ const fx=p.x-mouse.x, fy=p.y-mouse.y, fd=Math.hypot(fx,fy);
          if (fd<p.fr && fd>0){ const fp=(1-fd/p.fr)*p.mf*6; p.vx+=fx/fd*fp; p.vy+=fy/fd*fp; } }
        p.vx*=0.9; p.vy*=0.9; p.x+=p.vx; p.y+=p.vy;

        const vel = Math.hypot(p.vx,p.vy);
        let a = Math.max(60, 200 - vel/(11*dpr)*140) * (1 - 0.4*logoFade);
        ctx.fillStyle = `rgba(${dotRGB},${(a/255).toFixed(3)})`;
        const sz = p.r*(1 + vel*0.05);
        ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, TAU); ctx.fill();
      }

      if (logoFade > 0.01){
        ctx.globalAlpha = logoFade; ctx.fillStyle = `rgb(${inkRGB})`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font = `500 ${fontPx}px "Playfair Display", Georgia, serif`;
        ctx.fillText('MAJIA', cx, cy + fontPx*0.04); ctx.globalAlpha = 1;
      }
    }
    requestAnimationFrame(tick);
  }

  function drawStatic(){ if(!W) return; ctx.clearRect(0,0,W,H);
    ctx.fillStyle=`rgb(${inkRGB})`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font=`500 ${fontPx}px "Playfair Display", Georgia, serif`;
    ctx.fillText('MAJIA', cx, cy + fontPx*0.04);
    introDone = true; phase = 'form'; logoFade = 1; }

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
