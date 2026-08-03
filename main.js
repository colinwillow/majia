/* ============================================================
   MAJIA STUDIO — app
   Splash-style wordmark: the game's boot-splash particle system
   (halo spawn → underdamped springs → timed lock → solid logo)
   retargeted onto the real MAJIA svg, in paper & ink.
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

/* ---------- splash wordmark ------------------------------------------ */
(() => {
  const canvas = document.getElementById('logo');
  const ctx = canvas.getContext('2d');
  const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0;
  let targets = [], particles = [], edges = [];
  let fit = null, tint = null, tintSeal = null, mask = null;   // real logo, theme-tinted
  let logoReady = false;
  const logoImg = new Image();
  let spawned = false, t0 = 0, locked = false;
  const mouse = { x: -1e4, y: -1e4, active: false };
  let bloom = 0, bloomTarget = 0;

  // theme colours as [r,g,b]
  let inkC = [28,26,22], sealC = [194,69,47], jadeC = [93,125,107];
  function toRGB(hex){ const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = hex; const m = probe.fillStyle;
    if (m[0] === '#'){ const n = parseInt(m.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
    const p = m.match(/\d+/g); return p ? p.slice(0,3).map(Number) : [0,0,0]; }
  function readColors(){ inkC = toRGB(cssColor('--ink')); sealC = toRGB(cssColor('--seal')); jadeC = toRGB(cssColor('--jade')); }
  readColors();
  themeListeners.add(() => { readColors(); if (fit) makeTint(); if (reduced) drawStatic(); });

  /* ── the real logo: fit its ink bbox to the canvas ── */
  function detectBBox(){
    const iw = logoImg.naturalWidth || 1004, ih = logoImg.naturalHeight || 1010;
    const det = document.createElement('canvas'); det.width = iw; det.height = ih;
    const dc = det.getContext('2d'); dc.drawImage(logoImg, 0, 0, iw, ih);
    const dd = dc.getImageData(0, 0, iw, ih).data;
    let minX=iw, minY=ih, maxX=0, maxY=0, found=false;
    for (let y=0;y<ih;y+=2) for (let x=0;x<iw;x+=2){ if (dd[(y*iw+x)*4+3] > 60){
      if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; found=true; } }
    return found ? { bx:minX, by:minY, bw:maxX-minX, bh:maxY-minY } : null;
  }

  function makeTint(){
    if (!fit) return;
    const mk = (colorVar) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(fit.dw*DPR)); c.height = Math.max(1, Math.round(fit.dh*DPR));
      const t = c.getContext('2d');
      t.drawImage(logoImg, fit.bx, fit.by, fit.bw, fit.bh, 0, 0, c.width, c.height);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = cssColor(colorVar); t.fillRect(0, 0, c.width, c.height);
      return c;
    };
    tint = mk('--ink');
    tintSeal = mk('--seal');
  }

  /* ── targets: slice the logo into a grid of TILES, one per particle.
     Settled tiles butt together into the pixel-perfect logo; disturbed
     tiles carry their patch of the letterforms away with them. ── */
  let TILE = 6;   // cell size, css px (recomputed per layout)
  function buildTargets(){
    const bb = detectBBox(); if (!bb) return false;
    const S1 = Math.min(W*0.72/bb.bw, H*0.80/bb.bh);
    const dw = Math.round(bb.bw*S1), dh = Math.round(bb.bh*S1);
    fit = { dx: Math.round(cx-dw/2), dy: Math.round(cy-dh/2), dw, dh, ...bb };
    makeTint();
    // css-px mask for cell coverage
    mask = document.createElement('canvas'); mask.width = dw; mask.height = dh;
    const mc = mask.getContext('2d');
    mc.drawImage(logoImg, bb.bx, bb.by, bb.bw, bb.bh, 0, 0, dw, dh);
    const img = mc.getImageData(0, 0, dw, dh).data;
    const S = Math.max(4, Math.round(dh/30));
    TILE = S;
    // one pass: does each cell contain any ink?
    const gw = Math.ceil(dw/S), gh = Math.ceil(dh/S);
    const has = new Uint8Array(gw*gh);
    for (let y=0; y<dh; y++){ const gy = (y/S)|0;
      for (let x=0; x<dw; x++){ if (img[(y*dw+x)*4+3] > 40) has[gy*gw + ((x/S)|0)] = 1; } }
    targets = [];
    const gmap = new Map();
    for (let gy=0; gy<gh; gy++) for (let gx=0; gx<gw; gx++){
      if (!has[gy*gw+gx]) continue;
      const x0 = gx*S, y0 = gy*S;
      gmap.set(gx+','+gy, targets.length);
      targets.push({ x: fit.dx + x0 + S/2, y: fit.dy + y0 + S/2, sx: x0, sy: y0, gx, gy });
    }
    edges = [];
    for (let i=0;i<targets.length;i++){
      const t=targets[i]; let n;
      n=gmap.get((t.gx+1)+','+t.gy);     if(n!==undefined) edges.push([i,n]);
      n=gmap.get(t.gx+','+(t.gy+1));     if(n!==undefined) edges.push([i,n]);
      n=gmap.get((t.gx+1)+','+(t.gy+1)); if(n!==undefined&&Math.random()<0.5) edges.push([i,n]);
      n=gmap.get((t.gx+1)+','+(t.gy-1)); if(n!==undefined&&Math.random()<0.5) edges.push([i,n]);
    }
    return true;
  }

  /* ── particles: spawn in a halo around the word; underdamped springs ── */
  function initParticles(atTarget){
    const F = fit ? fit.dh : 130;
    const sc = F/130;
    particles = targets.map(t => {
      const a = Math.random()*Math.PI*2, d = F*(0.40 + Math.random()*1.0);
      // fast-flight accent: mostly ink, the odd seal / jade fleck (streaks only)
      const roll = Math.random();
      const accent = roll > 0.92 ? sealC : roll > 0.86 ? jadeC : inkC;
      return {
        tx:t.x, ty:t.y, sx:t.sx, sy:t.sy,          // sx/sy = this tile's patch of the logo
        x: atTarget ? t.x : t.x + Math.cos(a)*d,
        y: atTarget ? t.y : t.y + Math.sin(a)*d,
        vx:0, vy:0,
        maxSpeed:(9.0 + Math.random()*10.0)*sc,
        k:0.018 + Math.random()*0.045,             // spring stiffness — varied arrival timing
        damp:0.86 + Math.random()*0.075,           // underdamped → rubbery overshoot + wobble
        accent,
        rot:(Math.random()-0.5)*4.0, rotV:(Math.random()-0.5)*0.6, trot:0,
      };
    });
  }

  function step(p, lock){
    if (lock >= 1 && !p.loose){ p.x=p.tx; p.y=p.ty; p.vx=0; p.vy=0; p.rot=p.trot; p.rotV=0; return; }
    const dx=p.tx-p.x, dy=p.ty-p.y;
    p.vx=(p.vx+dx*p.k)*p.damp; p.vy=(p.vy+dy*p.k)*p.damp;
    const sp=Math.hypot(p.vx,p.vy);
    if (sp>p.maxSpeed){ p.vx=p.vx/sp*p.maxSpeed; p.vy=p.vy/sp*p.maxSpeed; }
    p.x+=p.vx; p.y+=p.vy;
    p.rotV+=(p.trot-p.rot)*0.03; p.rotV*=0.93; p.rot+=p.rotV;
    if (lock>0 && !p.loose){ const sm=lock*lock*(3-2*lock);
      p.x+=(p.tx-p.x)*sm*0.4; p.y+=(p.ty-p.y)*sm*0.4; p.vx*=(1-sm); p.vy*=(1-sm);
      p.rot+=(p.trot-p.rot)*sm*0.4; p.rotV*=(1-sm); }
    // a disturbed particle goes back to sleep once it's home again
    if (p.loose && Math.abs(dx)<0.4 && Math.abs(dy)<0.4 && sp<0.15){ p.loose=false; p.x=p.tx; p.y=p.ty; p.vx=p.vy=0; }
  }

  /* ── layout / boot ── */
  function build(){
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    W = rect.width; H = rect.height;
    DPR = Math.min(2, devicePixelRatio||1);
    canvas.width = Math.round(W*DPR); canvas.height = Math.round(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    cx = W/2; cy = H/2;
    if (!logoReady) return;
    if (!buildTargets()) return;
    if (!spawned){ initParticles(false); spawned = true; t0 = performance.now(); }
    else initParticles(true);                    // resize after intro → sit on targets
    if (reduced) drawStatic();
  }

  addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; mouse.active = true;
  });
  addEventListener('pointerleave', () => mouse.active = false);

  const cta = document.querySelector('[data-morph]');
  if (cta){ cta.addEventListener('pointerenter', () => bloomTarget = 1); cta.addEventListener('pointerleave', () => bloomTarget = 0); }

  /* ── the splash timeline (same beats as the game) ── */
  const LOCK_START = 1050, FREEZE_AT = 1600, SOLID_AT = 1750, SOLID_IN = 400;

  function draw(now){
    requestAnimationFrame(draw);
    if (!spawned || reduced) return;
    const homeVis = document.getElementById('screen-home').classList.contains('is-active');
    if (!homeVis) return;
    bloom += (bloomTarget - bloom) * 0.08;

    const e = now - t0;
    const lock = clamp01((e-LOCK_START)/(FREEZE_AT-LOCK_START));
    if (lock >= 1) locked = true;

    // pointer disturbs settled particles; springs pull them home with a wobble
    if (locked && mouse.active){
      const R = 46, R2 = R*R;
      for (const p of particles){
        const mx = p.x-mouse.x, my = p.y-mouse.y, d2 = mx*mx+my*my;
        if (d2 < R2){ const d = Math.sqrt(d2)||1, f = (1-d/R)*3.2;
          p.vx += mx/d*f; p.vy += my/d*f; p.rotV += (Math.random()-0.5)*0.4; p.loose = true; }
      }
    }

    for (const p of particles) step(p, lock);

    ctx.clearRect(0,0,W,H);
    const intro = clamp01(e/450);
    const partA = 0.92*intro + 0.08*clamp01((e-SOLID_AT)/SOLID_IN);
    const [IR,IG,IB] = inkC;

    // connective tissue while forming
    const tissueA = intro*(1-lock)*0.28;
    if (tissueA > 0.02 && edges.length){
      const TH = TILE*3.4, TH2 = TH*TH;
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${IR},${IG},${IB},${tissueA})`;
      ctx.beginPath();
      for (let k=0;k<edges.length;k++){ const a=particles[edges[k][0]], b=particles[edges[k][1]];
        const dx=a.x-b.x, dy=a.y-b.y; if (dx*dx+dy*dy<TH2){ ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); } }
      ctx.stroke();
    }

    /* each particle carries its own tile of the actual logo — settled tiles
       reassemble the crisp mark exactly; disturbed tiles tear it apart */
    if (tint){
      const DPRt = tint.width / fit.dw;                 // css px → tint px
      const Sw = TILE * DPRt, half = TILE/2;
      ctx.globalAlpha = partA;
      ctx.lineCap = 'round'; ctx.lineWidth = 2.0;
      for (const p of particles){
        const sp = Math.hypot(p.vx,p.vy), sf = clamp01(sp/(p.maxSpeed*0.85));
        const still = sf<0.02 && p.rot>-0.012 && p.rot<0.012 && !p.loose;
        if (still){
          ctx.drawImage(tint, p.sx*DPRt, p.sy*DPRt, Sw, Sw, p.tx-half, p.ty-half, TILE, TILE);
          if (bloom > 0.02){ ctx.globalAlpha = partA*bloom;
            ctx.drawImage(tintSeal, p.sx*DPRt, p.sy*DPRt, Sw, Sw, p.tx-half, p.ty-half, TILE, TILE);
            ctx.globalAlpha = partA; }
        } else {
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
          ctx.drawImage(tint, p.sx*DPRt, p.sy*DPRt, Sw, Sw, -half, -half, TILE, TILE);
          ctx.restore();
          // velocity streak, accent-tinted — the spot colour lives in the motion
          if (sp>0.7){
            const A = p.accent;
            const r=(IR+(A[0]-IR)*sf)|0, g=(IG+(A[1]-IG)*sf)|0, b=(IB+(A[2]-IB)*sf)|0;
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.55*partA})`;
            ctx.beginPath(); ctx.moveTo(p.x-p.vx*1.4,p.y-p.vy*1.4); ctx.lineTo(p.x,p.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawStatic(){
    if (!tint || !fit) return;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(tint, fit.dx, fit.dy, fit.dw, fit.dh);
  }

  new ResizeObserver(build).observe(canvas);
  requestAnimationFrame(draw);
  logoImg.onload = () => { logoReady = true; build(); };
  logoImg.src = 'icons/majia_icon.svg';
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
