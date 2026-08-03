/* ============================================================
   MAJIA STUDIO — app
   One tile-swarm writes every screen's mark: the SVG logo on
   home, the serif titles elsewhere. Settled tiles ARE the crisp
   mark; navigation deconstructs it and reassembles the next.
   Mobile-first: swipe left/right moves between screens.
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

const ORDER = ['home','robits','studio','signal'];
// robits wears the game's own title face (Orbitron 900, like the start screen)
const WORDS = {
  robits: { text:'ROBITS', font:'900', family:'Orbitron, sans-serif', ls:0.06, base:0.52 },
  studio: { text:'STUDIO', font:'500', family:'"Playfair Display", Georgia, serif', ls:0.08, base:0.54 },
  signal: { text:'SIGNAL', font:'500', family:'"Playfair Display", Georgia, serif', ls:0.08, base:0.54 },
};

/* ---------- the tile swarm ------------------------------------------- */
const swarm = (() => {
  const canvas = document.getElementById('logo');
  const ctx = canvas.getContext('2d');
  const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

  let W = 0, H = 0, DPR = 1;
  let particles = [], fading = [];
  let mark = null;                       // { dx,dy,dw,dh,tile,art,tint,tintSeal,targets,edges }
  let markName = null;
  let logoReady = false;
  const logoImg = new Image();
  let spawned = false, t0 = 0, introDone = false;
  const mouse = { x: -1e4, y: -1e4, active: false, str: 0 };
  let bloom = 0, bloomTarget = 0;
  let retryTimer = 0;

  let inkC = [28,26,22], sealC = [194,69,47], jadeC = [93,125,107];
  function toRGB(hex){ const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = hex; const m = probe.fillStyle;
    if (m[0] === '#'){ const n = parseInt(m.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
    const p = m.match(/\d+/g); return p ? p.slice(0,3).map(Number) : [0,0,0]; }
  function readColors(){ inkC = toRGB(cssColor('--ink')); sealC = toRGB(cssColor('--seal')); jadeC = toRGB(cssColor('--jade')); }
  readColors();
  themeListeners.add(() => { readColors(); if (mark) tintMark(mark); if (reduced) drawStatic(); });

  function resize(){
    W = innerWidth; H = innerHeight;
    DPR = Math.min(2, devicePixelRatio||1);
    canvas.width = Math.round(W*DPR); canvas.height = Math.round(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  resize();

  /* ── build the "art" (black shapes) for a screen's mark ──
     The SVG has a viewBox but no width/height (naturalWidth ≈ 149px), and
     source-rect drawImage straight from an SVG image is unreliable. So:
     rasterize the vector ONCE onto a big master canvas (SVGs scale crisply
     to any destination), then crop canvas→canvas, which is dependable. */
  let master = null, masterBox = null;
  function ensureMaster(){
    if (master) return true;
    const iw = logoImg.naturalWidth || 300, ih = logoImg.naturalHeight || 150;
    const MW = 2048, MH = Math.max(2, Math.round(MW*ih/iw));
    const c = document.createElement('canvas'); c.width = MW; c.height = MH;
    c.getContext('2d').drawImage(logoImg, 0, 0, MW, MH);
    const dd = c.getContext('2d').getImageData(0, 0, MW, MH).data;
    let minX=MW, minY=MH, maxX=0, maxY=0, found=false;
    for (let y=0;y<MH;y+=2) for (let x=0;x<MW;x+=2){ if (dd[(y*MW+x)*4+3] > 60){
      if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; found=true; } }
    if (!found) return false;
    master = c; masterBox = { minX, minY, bw: maxX-minX, bh: maxY-minY };
    return true;
  }
  function svgArt(maxW, maxH){
    if (!ensureMaster()) return null;
    const { minX, minY, bw, bh } = masterBox;
    const S = Math.min(maxW/bw, maxH/bh);
    const dw = Math.max(2, Math.round(bw*S)), dh = Math.max(2, Math.round(bh*S));
    const art = document.createElement('canvas'); art.width = Math.round(dw*DPR); art.height = Math.round(dh*DPR);
    art.getContext('2d').drawImage(master, minX, minY, bw, bh, 0, 0, art.width, art.height);
    return { art, dw, dh };
  }

  function textArt(spec, maxW, maxH){
    const probe = document.createElement('canvas').getContext('2d');
    const setFont = (c, px) => { c.font = `${spec.font} ${px}px ${spec.family}`;
      if ('letterSpacing' in c) c.letterSpacing = (px*spec.ls)+'px'; };
    setFont(probe, 100);
    const w100 = Math.max(1, probe.measureText(spec.text).width);
    const px = Math.min(maxH*0.94, maxW/w100*100);
    const dw = Math.max(2, Math.ceil(w100*px/100) + 4), dh = Math.max(2, Math.ceil(px*1.06));
    const art = document.createElement('canvas'); art.width = Math.round(dw*DPR); art.height = Math.round(dh*DPR);
    const a = art.getContext('2d');
    a.scale(DPR, DPR); setFont(a, px);
    a.fillStyle = '#000'; a.textAlign = 'center'; a.textBaseline = 'middle';
    a.fillText(spec.text, dw/2, dh*spec.base);
    return { art, dw, dh };
  }

  function tintMark(m){
    const mk = (colorVar) => {
      const c = document.createElement('canvas'); c.width = m.art.width; c.height = m.art.height;
      const t = c.getContext('2d');
      t.drawImage(m.art, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = cssColor(colorVar); t.fillRect(0,0,c.width,c.height);
      return c;
    };
    m.tint = mk('--ink'); m.tintSeal = mk('--seal');
  }

  /* ── slice a mark into tile targets ── */
  function buildMark(name){
    const slot = document.querySelector(`[data-screen="${name}"] .word-slot`);
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    const src = (name === 'home' && logoReady) ? svgArt(r.width, r.height)
              : WORDS[name] ? textArt(WORDS[name], r.width, r.height) : null;
    if (!src) return null;
    const { art, dw, dh } = src;
    // alignment follows the slot's computed text-align (left on desktop robits, centred elsewhere)
    const ta = getComputedStyle(slot).textAlign;
    const dx = Math.round(ta === 'left' || ta === 'start' ? r.left : r.left + (r.width - dw)/2);
    const dy = Math.round(r.top + (r.height - dh)/2);
    const m = { dx, dy, dw, dh, art, tile: Math.max(4, Math.round(dh/30)), targets: [], edges: [] };
    tintMark(m);
    // cell coverage from a css-res mask
    const mask = document.createElement('canvas'); mask.width = dw; mask.height = dh;
    const mc = mask.getContext('2d'); mc.drawImage(art, 0, 0, dw, dh);
    const img = mc.getImageData(0,0,dw,dh).data;
    const S = m.tile, gw = Math.ceil(dw/S), gh = Math.ceil(dh/S);
    const has = new Uint8Array(gw*gh);
    for (let y=0; y<dh; y++){ const gy=(y/S)|0;
      for (let x=0; x<dw; x++){ if (img[(y*dw+x)*4+3] > 40) has[gy*gw+((x/S)|0)] = 1; } }
    const gmap = new Map();
    for (let gy=0; gy<gh; gy++) for (let gx=0; gx<gw; gx++){
      if (!has[gy*gw+gx]) continue;
      gmap.set(gx+','+gy, m.targets.length);
      m.targets.push({ x: dx + gx*S + S/2, y: dy + gy*S + S/2, sx: gx*S, sy: gy*S, gx, gy });
    }
    for (let i=0;i<m.targets.length;i++){
      const t=m.targets[i]; let n;
      n=gmap.get((t.gx+1)+','+t.gy);     if(n!==undefined) m.edges.push([i,n]);
      n=gmap.get(t.gx+','+(t.gy+1));     if(n!==undefined) m.edges.push([i,n]);
      n=gmap.get((t.gx+1)+','+(t.gy+1)); if(n!==undefined&&Math.random()<0.5) m.edges.push([i,n]);
      n=gmap.get((t.gx+1)+','+(t.gy-1)); if(n!==undefined&&Math.random()<0.5) m.edges.push([i,n]);
    }
    return m;
  }

  function newParticle(t, F, atTarget){
    const a = Math.random()*Math.PI*2, d = F*(0.40 + Math.random()*1.0);
    const roll = Math.random();
    return {
      tx:t.x, ty:t.y, sx:t.sx, sy:t.sy,
      x: atTarget ? t.x : t.x + Math.cos(a)*d,
      y: atTarget ? t.y : t.y + Math.sin(a)*d,
      vx:0, vy:0,
      maxSpeed:(9.0 + Math.random()*10.0)*(F/130),
      k:0.018 + Math.random()*0.045,
      damp:0.86 + Math.random()*0.075,
      accent: roll > 0.92 ? sealC : roll > 0.86 ? jadeC : inkC,
      rot:(Math.random()-0.5)*4.0, rotV:(Math.random()-0.5)*0.6, trot:0,
      loose:false,
    };
  }

  /* retarget the swarm onto a (new) mark — reuse bodies, spawn/retire the rest */
  function applyMark(m, name, { instant = false, explode = false } = {}){
    const prevCx = mark ? mark.dx + mark.dw/2 : W/2;
    const prevCy = mark ? mark.dy + mark.dh/2 : H/2;
    mark = m; markName = name;
    const F = m.dh;
    const n = m.targets.length;
    // surplus chips fly off and dissolve
    for (let i=n; i<particles.length; i++){
      const p = particles[i];
      const a = Math.random()*Math.PI*2;
      p.vx += Math.cos(a)*9; p.vy += Math.sin(a)*9; p.life = 1;
      fading.push(p);
    }
    particles.length = Math.min(particles.length, n);
    for (let i=0; i<n; i++){
      const t = m.targets[i];
      if (particles[i]){
        const p = particles[i];
        p.tx=t.x; p.ty=t.y; p.sx=t.sx; p.sy=t.sy;
        if (instant){ p.x=t.x; p.y=t.y; p.vx=p.vy=0; p.rot=0; p.rotV=0; p.loose=false;
          p.maxSpeed = (9.0 + Math.random()*10.0)*(F/130); continue; }
        p.loose = true;
        // travel speed scales with distance so long flights stay quick,
        // and the underdamped springs overshoot + correct on arrival
        const dist = Math.hypot(t.x-p.x, t.y-p.y);
        p.maxSpeed = (15 + Math.random()*12) * (F/130) * Math.min(Math.max(dist/260, 1), 2.6);
        p.k = 0.026 + Math.random()*0.05;
        if (explode){
          // organized burst: radial from the old mark's centre with a swirl,
          // flowing straight into the new formation — no stall between
          const ex = p.x - prevCx, ey = p.y - prevCy;
          const el = Math.hypot(ex, ey) || 1;
          const swirl = (i % 2 ? 1 : -1) * (0.35 + (i % 7)/7 * 0.5);
          const ux = ex/el, uy = ey/el;
          const mag = 9 + (i % 5)/5 * 8;
          p.vx += (ux - uy*swirl) * mag;
          p.vy += (uy + ux*swirl) * mag;
          p.rotV += (Math.random()-0.5)*0.9;
        } else {
          p.rotV += (Math.random()-0.5)*0.5;
        }
      } else {
        particles.push(newParticle(t, F, instant));
        if (!instant) particles[i].loose = true;
      }
    }
  }

  /* point the swarm at a screen; retries until its slot has layout */
  function settle(name, opts = {}){
    clearTimeout(retryTimer);
    const m = buildMark(name);
    if (!m){ retryTimer = setTimeout(() => settle(name, opts), 60); return; }
    const first = !spawned;
    applyMark(m, name, { instant: reduced || opts.instant, explode: opts.explode && !reduced });
    if (first){ spawned = true; t0 = performance.now(); }
    if (reduced) drawStatic();
  }

  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; });
  addEventListener('pointerdown', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; });
  // lift your finger and the circle of influence eases away (mouse.str fades in tick)
  addEventListener('pointerup', () => mouse.active = false);
  addEventListener('pointercancel', () => mouse.active = false);
  addEventListener('pointerleave', () => mouse.active = false);
  // rasterize titles with the real fonts once they land
  if (document.fonts){
    try { document.fonts.load('900 100px Orbitron'); } catch(_){}
    document.fonts.ready.then(() => { if (markName) settle(markName, { instant: introDone }); });
  }

  const cta = document.querySelector('[data-morph]');
  if (cta){ cta.addEventListener('pointerenter', () => bloomTarget = 1); cta.addEventListener('pointerleave', () => bloomTarget = 0); }

  /* ── physics (the game splash springs) ── */
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
    if (p.loose && Math.abs(dx)<0.4 && Math.abs(dy)<0.4 && sp<0.15){ p.loose=false; p.x=p.tx; p.y=p.ty; p.vx=p.vy=0; p.rot=0; p.rotV=0; }
  }

  const LOCK_START = 1050, FREEZE_AT = 1600;

  function draw(now){
    requestAnimationFrame(draw);
    if (!spawned || reduced || !mark) return;
    bloom += (bloomTarget - bloom) * 0.08;
    const e = now - t0;
    const lock = introDone ? 1 : clamp01((e-LOCK_START)/(FREEZE_AT-LOCK_START));
    if (lock >= 1) introDone = true;

    // influence strength eases in while touching, eases away on release
    mouse.str += ((mouse.active ? 1 : 0) - mouse.str) * (mouse.active ? 0.35 : 0.12);
    if (introDone && mouse.str > 0.03){
      const R = 46, R2 = R*R;
      for (const p of particles){
        const mx = p.x-mouse.x, my = p.y-mouse.y, d2 = mx*mx+my*my;
        if (d2 < R2){ const d = Math.sqrt(d2)||1, f = (1-d/R)*3.2*mouse.str;
          p.vx += mx/d*f; p.vy += my/d*f; p.rotV += (Math.random()-0.5)*0.4*mouse.str; p.loose = true; }
      }
    }

    for (const p of particles) step(p, lock);

    ctx.clearRect(0,0,W,H);
    const intro = clamp01(e/450);
    const partA = introDone ? 1 : 0.92*intro;
    const [IR,IG,IB] = inkC;
    const TILE = mark.tile;

    // connective tissue during the boot splash only
    const tissueA = introDone ? 0 : intro*(1-lock)*0.28;
    if (tissueA > 0.02 && mark.edges.length){
      const TH = TILE*3.4, TH2 = TH*TH;
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${IR},${IG},${IB},${tissueA})`;
      ctx.beginPath();
      for (let k=0;k<mark.edges.length;k++){
        const a=particles[mark.edges[k][0]], b=particles[mark.edges[k][1]];
        if (!a||!b) continue;
        const dx=a.x-b.x, dy=a.y-b.y; if (dx*dx+dy*dy<TH2){ ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); } }
      ctx.stroke();
    }

    // retiring chips dissolve
    for (let i=fading.length-1; i>=0; i--){
      const p = fading[i];
      p.life -= 0.04; if (p.life <= 0){ fading.splice(i,1); continue; }
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.rot += p.rotV;
      ctx.fillStyle = `rgba(${IR},${IG},${IB},${(0.7*p.life).toFixed(3)})`;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillRect(-2,-2,4,4); ctx.restore();
    }

    // tiles: settled = the crisp mark; loose = chips of it in flight
    const DPRt = mark.tint.width / mark.dw;
    const Sw = TILE * DPRt, half = TILE/2;
    ctx.globalAlpha = partA;
    ctx.lineCap = 'round'; ctx.lineWidth = 2.0;
    for (const p of particles){
      const sp = Math.hypot(p.vx,p.vy), sf = clamp01(sp/(p.maxSpeed*0.85));
      const still = sf<0.02 && p.rot>-0.012 && p.rot<0.012 && !p.loose;
      if (still){
        ctx.drawImage(mark.tint, p.sx*DPRt, p.sy*DPRt, Sw, Sw, p.tx-half, p.ty-half, TILE, TILE);
        if (bloom > 0.02){ ctx.globalAlpha = partA*bloom;
          ctx.drawImage(mark.tintSeal, p.sx*DPRt, p.sy*DPRt, Sw, Sw, p.tx-half, p.ty-half, TILE, TILE);
          ctx.globalAlpha = partA; }
      } else {
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.drawImage(mark.tint, p.sx*DPRt, p.sy*DPRt, Sw, Sw, -half, -half, TILE, TILE);
        ctx.restore();
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

  function drawStatic(){
    if (!mark) return;
    ctx.clearRect(0,0,W,H);
    ctx.drawImage(mark.tint, mark.dx, mark.dy, mark.dw, mark.dh);
  }

  addEventListener('resize', () => { resize(); if (markName) settle(markName, { instant: introDone }); });
  // keep the mark glued to its slot when a screen scrolls (mobile)
  let scrollRaf = 0;
  addEventListener('scroll', () => {
    if (scrollRaf || !markName || !introDone) return;
    scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; settle(markName, { instant: true }); });
  }, { capture: true, passive: true });
  requestAnimationFrame(draw);
  logoImg.onload = () => { logoReady = true; if (markName === 'home' || !markName) settle(markName || 'home'); };
  logoImg.src = 'icons/majia_icon.svg';

  return { settle };
})();

/* ---------- router — construct / deconstruct -------------------------- */
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
    swarm.settle(name, { instant: true });
    return;
  }

  transitioning = true;
  // deconstruct/construct crossfade: the next screen is laid out (invisible)
  // immediately, so the mark explodes and flies STRAIGHT to its new home
  from.classList.add('is-hidden-fx');
  to.classList.add('is-hidden-fx','is-active');
  robitApi && robitApi.setActive(name === 'robits');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    swarm.settle(name, { explode: true });
    setTimeout(() => to.classList.remove('is-hidden-fx'), 240);
    setTimeout(() => from.classList.remove('is-active','is-hidden-fx'), 460);
    setTimeout(() => transitioning = false, 800);
  }));
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

/* swipe left / right between screens (mobile-first) */
function navStep(dir){
  const i = ORDER.indexOf(current);
  const next = ORDER[i + dir];
  if (!next || transitioning) return;
  history.pushState({ screen: next }, '', `#${next}`);
  goTo(next);
}
(() => {
  let sx = 0, sy = 0, st = 0, tracking = false;
  addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; st = performance.now(); tracking = true; }, { passive: true });
  addEventListener('pointerup', (e) => {
    if (!tracking) return; tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy, dt = performance.now() - st;
    if (dt > 1000) return;
    if (Math.abs(dx) > 64 && Math.abs(dx) > 2.2*Math.abs(dy)) navStep(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') navStep(1);
  else if (e.key === 'ArrowLeft') navStep(-1);
});

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
swarm.settle(boot);
document.getElementById('year').textContent = new Date().getFullYear();
