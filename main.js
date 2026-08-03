/* ============================================================
   MAJIA STUDIO — app
   One swarm writes every screen's title in a single-weight line.
   The particles ARE the text — evenly spaced along monoline
   strokes — and the swarm itself is the page transition:
   dissolve → flow → rewrite the next word.
   ============================================================ */

import { sampleWord, wordWidth, wordLength } from './monofont.js';

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

/* ---------- the swarm ------------------------------------------------- */
const WORDS = { home:'MAJIA', robits:'ROBITS', studio:'STUDIO', signal:'SIGNAL' };

const swarm = (() => {
  const canvas = document.getElementById('word');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const TAU = Math.PI * 2;
  const SPACING = 3.1;                 // px between settled particles (device px × dpr below)

  let W = 0, H = 0, cx = 0, cy = 0;
  let particles = [];
  let mode = 'flow';                   // 'flow' (ambient swirl) | 'form' (writing a word)
  let flowUntil = 0;                   // while now < flowUntil, stay in flow
  let curWord = null;                  // last formed word (for hover restore)
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

  function resize(){
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H; cx = W/2; cy = H/2;
  }
  resize();

  function newParticle(){
    const strand = Math.floor(Math.random()*6);
    const liss = [[2,3],[3,2],[4,3],[5,4]][strand % 4];
    const a = Math.random()*TAU, d = Math.random()*Math.min(W,H)*0.4;
    return {
      x: cx + Math.cos(a)*d, y: cy + Math.sin(a)*d, vx: 0, vy: 0,
      tx: cx, ty: cy,
      r: (1.25 + Math.random()*0.5) * dpr,
      ms: (7 + Math.random()*7) * dpr,          // maxSpeed
      mf: (0.5 + Math.random()*0.6) * dpr,      // maxForce
      fr: (26 + Math.random()*46) * dpr,        // flee radius
      si: strand + 1, fam: strand < 3 ? 0 : 1,
      la: liss[0], lb: liss[1], k: [3,4,5][strand % 3],
      A: 70 + strand*13, B: 62 + strand*11,
      t: Math.random()*TAU*6, spd: 0.0004*(0.7 + Math.random()*0.6),
      bph: Math.random()*TAU,
    };
  }

  // measure a screen's word slot in device px
  function slotRect(screenName){
    const el = document.querySelector(`[data-screen="${screenName}"] .word-slot`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { x: r.left*dpr, y: r.top*dpr, w: r.width*dpr, h: r.height*dpr,
             align: el.dataset.align || 'center', word: el.dataset.word };
  }

  // point the swarm at a word laid out in a slot rect
  function target(word, rect){
    const wUnits = wordWidth(word);
    const size = Math.min(rect.w / Math.max(wUnits, 0.01), rect.h * 0.86);
    const tw = wUnits * size;
    const ox = rect.align === 'left' ? rect.x : rect.x + (rect.w - tw)/2;
    const oy = rect.y + (rect.h - size)/2;

    // keep line density constant: particle count follows stroke length
    const need = Math.round(wordLength(word, size) / (SPACING * dpr));
    while (particles.length < need) particles.push(newParticle());
    if (particles.length > need) particles.length = need;

    const pts = sampleWord(word, size, ox, oy, particles.length);
    for (let i=0; i<particles.length; i++){ particles[i].tx = pts[i].x; particles[i].ty = pts[i].y; }
    curWord = word;
    // arrive slow-radius scales with the word so small titles settle crisply
    slow = Math.min(Math.max(size * 0.45, 16*dpr), 55*dpr);
    mode = 'form';
  }

  // ambient position along slowly-morphing curves
  function flowTarget(p, fc){
    const sc = Math.min(W,H)/700;
    const si = p.si, t = p.t; p.t += p.spd;
    const pulse = Math.sin(fc*0.0008*si + si) * si * 5 * sc;
    if (p.fam === 0){
      const A = p.A*sc + pulse, B = p.B*sc + pulse;
      const xt = A*Math.sin(p.la*t), yt = B*Math.sin(p.lb*t + 0.9);
      const rot = fc*0.0002*si;
      return [cx + xt*Math.cos(rot) - yt*Math.sin(rot), cy + xt*Math.sin(rot) + yt*Math.cos(rot)];
    }
    const R = p.A*sc + pulse, r = R*Math.cos(p.k*t + fc*0.0001*si), rot = fc*0.00015*si;
    return [cx + Math.cos(t+rot)*r, cy + Math.sin(t+rot)*r];
  }

  addEventListener('pointermove', (e) => { mouse.x = e.clientX*dpr; mouse.y = e.clientY*dpr; mouse.active = true; });
  addEventListener('pointerleave', () => mouse.active = false);

  let slow = 55 * dpr;
  function tick(now){
    const fc = now * 0.06;
    bloom += (bloomTarget - bloom) * 0.08;
    ctx.clearRect(0,0,W,H);
    const flowing = mode === 'flow' || now < flowUntil;
    const dotRGB = bloom > 0.02
      ? `${Math.round(28+(194-28)*bloom)},${Math.round(26+(69-26)*bloom)},${Math.round(22+(47-22)*bloom)}`
      : inkRGB;

    for (const p of particles){
      let gx, gy;
      if (flowing){ const f = flowTarget(p, fc); gx = f[0]; gy = f[1]; }
      else {
        // settled: sit ON the line — only a whisper of life so the stroke stays clean
        const b = 0.35*dpr;
        gx = p.tx + Math.sin(fc*0.015 + p.bph)*b;
        gy = p.ty + Math.cos(fc*0.013 + p.bph)*b;
      }
      // arrive steering
      let dx = gx-p.x, dy = gy-p.y, d = Math.hypot(dx,dy)||1;
      const spd = d < slow ? (d/slow)*p.ms : p.ms;
      let sx = dx/d*spd - p.vx, sy = dy/d*spd - p.vy;
      const sm = Math.hypot(sx,sy);
      if (sm > p.mf){ sx = sx/sm*p.mf; sy = sy/sm*p.mf; }
      p.vx += sx; p.vy += sy;
      // pointer flee — a force, never a teleport
      if (mouse.active){
        const fx = p.x-mouse.x, fy = p.y-mouse.y, fd = Math.hypot(fx,fy);
        if (fd < p.fr && fd > 0){ const fp = (1-fd/p.fr)*p.mf*6; p.vx += fx/fd*fp; p.vy += fy/fd*fp; }
      }
      p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx; p.y += p.vy;

      const vel = Math.hypot(p.vx, p.vy);
      const a = flowing ? Math.max(0.25, 0.8 - vel/(11*dpr)*0.5) : Math.max(0.35, 0.95 - vel/(11*dpr)*0.6);
      ctx.fillStyle = `rgba(${dotRGB},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r*(1+vel*0.03), 0, TAU); ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  function drawStatic(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = `rgb(${inkRGB})`;
    for (const p of particles){ p.x = p.tx; p.y = p.ty; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,TAU); ctx.fill(); }
  }
  themeListeners.add(() => { if (reduced) drawStatic(); });

  addEventListener('resize', () => { resize(); api.settle(); });
  if (!reduced) requestAnimationFrame(tick);

  const api = {
    // write a screen's word (measured from its slot); retries until layout is ready
    settle(screenName, tries = 20){
      const name = screenName || api.current || 'home';
      api.current = name;
      const rect = slotRect(name);
      if (!rect){ if (tries > 0) setTimeout(() => api.settle(name, tries-1), 60); return; }
      target(rect.word, rect);
      if (reduced) drawStatic();
    },
    // scatter into ambient flow for `ms`, then whoever calls settle() re-forms
    scatter(ms = 500){
      if (reduced) return;
      mode = 'flow'; flowUntil = performance.now() + ms;
      for (const p of particles){ p.vx += (Math.random()-0.5)*4*dpr; p.vy += (Math.random()-0.5)*4*dpr; }
    },
    // hover preview: write any word into the CURRENT slot without changing screens
    preview(word){
      const rect = slotRect(api.current || 'home');
      if (rect) target(word, { ...rect });
    },
    restore(){ api.settle(api.current); },
    setBloom(v){ bloomTarget = v; },
    current: null,
  };

  // seed the pool so the first flow phase has bodies
  for (let i=0; i<420; i++) particles.push(newParticle());
  return api;
})();

/* ---------- router — the swarm IS the transition ---------------------- */
const screens = [...document.querySelectorAll('.screen')];
const names = new Set(screens.map(s => s.dataset.screen));
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
    to.classList.add('is-active');
    robitApi && robitApi.setActive(name === 'robits');
    swarm.settle(name);
    return;
  }

  transitioning = true;
  // 1. old content dissolves while the word bursts into ambient flow
  from.classList.add('is-hidden-fx');
  swarm.scatter(620);
  setTimeout(() => {
    // 2. swap rooms; the swarm writes the next title as content fades up
    from.classList.remove('is-active','is-hidden-fx');
    to.classList.add('is-hidden-fx','is-active');
    robitApi && robitApi.setActive(name === 'robits');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      swarm.settle(name);
      setTimeout(() => to.classList.remove('is-hidden-fx'), 140);
    }));
    setTimeout(() => transitioning = false, 800);
  }, 430);
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

/* nav hover: the swarm preview-writes the link's word, then restores */
document.querySelectorAll('.chrome__link').forEach(link => {
  const word = WORDS[link.dataset.nav];
  if (!word) return;
  link.addEventListener('pointerenter', () => {
    if (transitioning || reduced || link.dataset.nav === current) return;
    swarm.preview(word);
  });
  link.addEventListener('pointerleave', () => {
    if (transitioning || reduced) return;
    swarm.restore();
  });
});

/* CTA hover: colour blooms through the swarm */
const cta = document.querySelector('[data-morph]');
if (cta){
  cta.addEventListener('pointerenter', () => swarm.setBloom(1));
  cta.addEventListener('pointerleave', () => swarm.setBloom(0));
}

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
  swarm.scatter(1300);                       // intro: flow first, then write the title
  setTimeout(() => swarm.settle(boot), 60);  // sets the target now; forms when flow ends
} else {
  swarm.settle(boot);
}
document.getElementById('year').textContent = new Date().getFullYear();
