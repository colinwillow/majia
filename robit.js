/* ============================================================
   MAJIA STUDIO — the ink robit
   game's rigged robot, cel-shaded + inked, blooms to colour
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BANDS = 2;      // starkest, most graphic
const OUT_T = 0.05;   // outline thickness (normalised units) — finer pen line
const TARGET = 2.4;
const FACE   = -0.12; // fixed 3/4-ish facing (no auto-orbit — reads as a flat character)

function cvar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function hexToColor(hex){ return new THREE.Color(hex || '#000'); }

// Trim baked dead frames: find the window where any track actually moves and
// rebuild every track to that window (times rebased to 0), so clips are their
// true length and loop cleanly. No-op for clips that move across the whole span.
function trimClip(clip, eps = 2e-3){   // high enough to skip phantom end-keyframes (idle had one at 18.5s)
  let start = Infinity, end = 0;
  for (const tr of clip.tracks){
    const t = tr.times, v = tr.values, stride = v.length / t.length;
    for (let i = 1; i < t.length; i++){
      let d = 0; for (let k = 0; k < stride; k++) d = Math.max(d, Math.abs(v[i*stride+k] - v[(i-1)*stride+k]));
      if (d > eps){ if (t[i-1] < start) start = t[i-1]; if (t[i] > end) end = t[i]; }
    }
  }
  if (!isFinite(start) || end <= start) return;         // static or already tight
  const pad = 1/60;
  start = Math.max(0, start - pad); end = end + pad;
  for (const tr of clip.tracks){
    const t = tr.times, v = tr.values, stride = v.length / t.length;
    const nt = [], nv = [];
    for (let i = 0; i < t.length; i++){
      if (t[i] < start - 1e-6 || t[i] > end + 1e-6) continue;
      nt.push(t[i] - start);
      for (let k = 0; k < stride; k++) nv.push(v[i*stride+k]);
    }
    if (nt.length >= 2){ tr.times = new Float32Array(nt); tr.values = new Float32Array(nv); }
  }
  clip.duration = end - start;
  clip.resetDuration();
}

export async function initRobit({ canvas, theme, themeListeners, reduced }){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2.5, 4, 4); scene.add(key);

  function gradientMap(steps){
    const d = new Uint8Array(steps);
    for (let i=0;i<steps;i++) d[i] = Math.round((i/(steps-1))*255);
    const t = new THREE.DataTexture(d, steps, 1, THREE.RedFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }
  const GRAD = gradientMap(BANDS);

  const toonMats = [], outlineU = [], outlineMats = [];
  function applyLook(root){
    root.traverse(o => {
      if (!o.isMesh) return;
      const toon = new THREE.MeshToonMaterial({ color:0xffffff, gradientMap:GRAD });
      o.material = toon; toonMats.push(toon);
      const omat = new THREE.MeshBasicMaterial({ color: hexToColor(cvar('--ink')), side:THREE.BackSide });
      omat.onBeforeCompile = (sh) => {
        sh.uniforms.oth = { value: OUT_T }; outlineU.push(sh.uniforms.oth);
        sh.vertexShader = 'uniform float oth;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize(objectNormal)*oth;');
      };
      outlineMats.push(omat);
      let ol;
      if (o.isSkinnedMesh){ ol = new THREE.SkinnedMesh(o.geometry, omat); ol.bind(o.skeleton, o.bindMatrix); }
      else ol = new THREE.Mesh(o.geometry, omat);
      ol.frustumCulled = false;
      ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
      o.parent.add(ol);
    });
  }

  // bone-based bounds (robust for skinned meshes)
  const bones = [], _v = new THREE.Vector3();
  function boneBox(){ const b = new THREE.Box3(); for (const bn of bones) b.expandByPoint(bn.getWorldPosition(_v)); return b.isEmpty()?null:b; }

  let mixer=null, model=null, pivot=null, framed=false, warm=0;
  let idleAction=null;
  let dropState = 'pending', dropV = 0;      // 'pending' → 'drop' → 'land' → 'idle'
  let landT = 0, landDur = 1, landAction = null;
  const DROP_FROM = 3.1;
  const clips = {};

  /* ── the floating landing pad from the game's title screen, in ink ── */
  const PAD_R = 1.14, PAD_TH = 0.19;
  let pad = null, padSpin = null, shadow = null, bobT = 0;
  const edgeMats = [], sealMats = [];
  function buildPad(){
    const g = new THREE.Group();
    const ink = () => { const m = new THREE.LineBasicMaterial({ color: hexToColor(cvar('--ink')), transparent:true, opacity:0.85 }); edgeMats.push(m); return m; };
    const toon = () => { const m = new THREE.MeshToonMaterial({ color:0xffffff, gradientMap:GRAD }); toonMats.push(m); return m; };
    const seal = () => { const m = new THREE.MeshBasicMaterial({ color: hexToColor(cvar('--seal')) }); sealMats.push(m); return m; };
    const edge = (geo) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), ink());
    // static deck the robit stands on
    const baseGeo = new THREE.CylinderGeometry(PAD_R, PAD_R*0.9, PAD_TH, 48);
    const base = new THREE.Mesh(baseGeo, toon()); base.position.y = -PAD_TH/2; g.add(base);
    const lip = edge(baseGeo); lip.position.y = -PAD_TH/2; g.add(lip);
    // inner accent ring — the one spot of colour
    const inring = new THREE.Mesh(new THREE.TorusGeometry(PAD_R*0.55, 0.02, 8, 44), seal());
    inring.rotation.x = Math.PI/2; inring.position.y = 0.015; g.add(inring);
    // spinning outer assembly: rim ring + four bays with struts and jet pods
    padSpin = new THREE.Group(); g.add(padSpin);
    const rimGeo = new THREE.TorusGeometry(PAD_R*0.99, 0.028, 8, 56);
    const rim = new THREE.Mesh(rimGeo, toon()); rim.rotation.x = Math.PI/2; rim.position.y = 0.01; padSpin.add(rim);
    const rimE = edge(rimGeo); rimE.rotation.x = Math.PI/2; rimE.position.y = 0.01; padSpin.add(rimE);
    const bw = PAD_R*0.46, bd = PAD_R*0.26, bh = PAD_TH*1.5;
    for (let i=0;i<4;i++){
      const a = i*Math.PI/2, cx = Math.cos(a)*PAD_R*0.97, cz = Math.sin(a)*PAD_R*0.97, dx = Math.cos(a), dz = Math.sin(a);
      const bg = new THREE.BoxGeometry(bd, bh, bw);
      const blk = new THREE.Mesh(bg, toon()); blk.position.set(cx, -PAD_TH/2 + bh*0.12, cz); blk.rotation.y = -a; padSpin.add(blk);
      const be = edge(bg); be.position.copy(blk.position); be.rotation.y = -a; padSpin.add(be);
      const armLen = PAD_R*0.3, ex = cx + dx*armLen, ez = cz + dz*armLen, ay = -PAD_TH/2 - bh*0.05;
      const ag = new THREE.BoxGeometry(armLen, 0.06, bw*0.45);
      const arm = new THREE.Mesh(ag, toon()); arm.position.set((cx+ex)/2, ay, (cz+ez)/2); arm.rotation.y = -a; padSpin.add(arm);
      const ae = edge(ag); ae.position.copy(arm.position); ae.rotation.y = -a; padSpin.add(ae);
      const podGeo = new THREE.CylinderGeometry(bw*0.16, bw*0.24, 0.13, 14);
      const pod = new THREE.Mesh(podGeo, toon()); pod.position.set(ex, ay-0.05, ez); padSpin.add(pod);
      const pe = edge(podGeo); pe.position.copy(pod.position); padSpin.add(pe);
      const jring = new THREE.Mesh(new THREE.TorusGeometry(bw*0.2, 0.016, 8, 20), seal());
      jring.rotation.x = Math.PI/2; jring.position.set(ex, ay-0.11, ez); padSpin.add(jring);
    }
    return g;
  }

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('./models/robot.glb');
  model = gltf.scene;
  applyLook(model);
  model.traverse(o => { if (o.isSkinnedMesh && o.skeleton) for (const b of o.skeleton.bones) if (!bones.includes(b)) bones.push(b); });
  pivot = new THREE.Group(); pivot.add(model); scene.add(pivot);
  pivot.rotation.y = FACE;
  pivot.visible = false;                     // hidden until framed, then he drops in
  mixer = new THREE.AnimationMixer(model);
  // the game GLB bakes every clip onto one long timeline; trim each to its real motion
  for (const c of gltf.animations){ trimClip(c); clips[c.name] = c; }
  idleAction = mixer.clipAction(clips['idle'] || gltf.animations[0]);
  idleAction.setLoop(THREE.LoopRepeat, Infinity); idleAction.play();

  const fitState = { cx:0, cy:0, cz:0, dist:5 };
  function fitCamera(){
    const box = boneBox(); if (!box) return;
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    // bones under-cover the surface; pad the margin, and include the landing pad
    const r = Math.max(Math.max(size.x, size.y * 0.9, size.z) * 0.5 * 1.3 + 0.12, PAD_R * 1.18);
    const fov = cam.fov*Math.PI/180, hfov = 2*Math.atan(Math.tan(fov/2)*cam.aspect);
    const dist = (r/Math.sin(Math.min(fov,hfov)/2)) * 1.06;
    fitState.cx = center.x; fitState.cy = center.y - size.y * 0.02; fitState.cz = center.z; fitState.dist = dist;
    applyFit();
  }
  function applyFit(){
    cam.position.set(fitState.cx, fitState.cy, fitState.cz + fitState.dist);
    cam.lookAt(fitState.cx, fitState.cy, fitState.cz); cam.updateProjectionMatrix();
  }

  /* one-time optical alignment, BEFORE he drops: render the robot alone
     (pad hidden) for a single unseen frame, measure his silhouette, and
     shift the MODEL so his visual mass sits dead over the pad centre.
     Runs inside one rAF, so only the corrected frame is ever presented. */
  function opticAlign(){
    try {
      const padWasVisible = pad && pad.visible, shWasVisible = shadow && shadow.visible;
      if (pad) pad.visible = false;
      if (shadow) shadow.visible = false;
      pivot.visible = true; pivot.position.y = 0;
      renderer.render(scene, cam);
      const src = renderer.domElement;
      const w = 160, h = Math.max(2, Math.round(160 * src.height / src.width));
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const cc = c2.getContext('2d');
      cc.drawImage(src, 0, 0, w, h);
      const dd = cc.getImageData(0, 0, w, h).data;
      let minX=w, maxX=0, found=false;
      for (let y=0; y<h; y+=2) for (let x=0; x<w; x++)
        if (dd[(y*w+x)*4+3] > 30){ if (x<minX) minX=x; if (x>maxX) maxX=x; found=true; }
      if (found){
        const offN = ((minX+maxX)/2)/w - 0.5;             // his silhouette vs frame centre
        const viewW = 2*Math.tan(cam.fov*Math.PI/360)*fitState.dist*cam.aspect;
        model.position.x -= offN * viewW;                 // move HIM, not the camera → lands on the pad
        model.updateWorldMatrix(true, true);
      }
      if (pad) pad.visible = padWasVisible;
      if (shadow) shadow.visible = shWasVisible;
    } catch(_){}
  }

  function normalizeOnce(){
    const box = boneBox(); if (!box) return;
    const size = new THREE.Vector3(); box.getSize(size);
    const s = TARGET / Math.max(size.y, 0.001);
    model.scale.multiplyScalar(s);
    for (const u of outlineU) u.value = OUT_T / s;
    model.updateWorldMatrix(true, true);
    // the GLB root is offset — recentre so the pivot spins/frames about the body
    const bb = boneBox();
    if (bb){ const c = new THREE.Vector3(); bb.getCenter(c);
      model.position.x -= c.x; model.position.z -= c.z;
      model.updateWorldMatrix(true, true); }
    // the floating landing pad appears under his feet (title-screen style)
    if (!pad){
      const bb2 = boneBox();
      const feetY = bb2 ? bb2.min.y - 0.05 : -TARGET/2;
      pad = buildPad(); pad.position.y = feetY; pad.userData.baseY = feetY;
      scene.add(pad);                              // the pad waits; he drops onto it
      shadow = new THREE.Mesh(new THREE.CircleGeometry(PAD_R*0.95, 40),
        new THREE.MeshBasicMaterial({ color: hexToColor(cvar('--ink')), transparent:true, opacity:0.09 }));
      shadow.rotation.x = -Math.PI/2; shadow.position.y = feetY - 0.5; scene.add(shadow);
    }
  }

  // theme: outlines + pad linework follow ink; accents follow seal
  function syncTheme(){
    const c = hexToColor(cvar('--ink'));
    for (const m of outlineMats) m.color.copy(c);
    for (const m of edgeMats) m.color.copy(c);
    const s = hexToColor(cvar('--seal'));
    for (const m of sealMats) m.color.copy(s);
    if (shadow) shadow.material.color.copy(c);
  }
  themeListeners.add(syncTheme); syncTheme();

  // colour bloom (0 = ink, 1 = full seal) — the 2D→3D "warp into colour"
  let bloom = 0, bloomTarget = 0;
  const white = new THREE.Color(0xffffff), tmp = new THREE.Color();
  function setBloom(){ const seal = hexToColor(cvar('--seal')); tmp.copy(white).lerp(seal, bloom); for (const m of toonMats) m.color.copy(tmp); }

  // for now he just holds a looping idle; hover/press only warps the colour in
  canvas.addEventListener('pointerenter', () => bloomTarget = 0.55);
  canvas.addEventListener('pointerleave', () => bloomTarget = 0);
  canvas.addEventListener('pointerdown', () => { bloomTarget = 1; });
  canvas.addEventListener('pointerup', () => { bloomTarget = 0.55; });

  function resize(){
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    renderer.setSize(r.width, r.height, false);
    cam.aspect = r.width / r.height; cam.updateProjectionMatrix();
    return true;
  }
  addEventListener('resize', () => { framed = false; resize(); });

  const clock = new THREE.Clock();
  let active = false, running = false;
  function startDrop(){
    dropState = 'drop'; dropV = 0;
    pivot.position.y = DROP_FROM; pivot.visible = true;
    idleAction.reset().play();
  }

  function loop(){
    if (!active){ running = false; return; }
    running = true;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(dt);
    if (!framed && resize() && warm++ > 3){ normalizeOnce(); fitCamera(); opticAlign(); framed = true; startDrop(); }
    // assemble: he falls in from above, lands, then settles into idle
    if (dropState === 'drop'){
      dropV += 14 * dt;
      pivot.position.y -= dropV * dt * 4.2;
      if (pivot.position.y <= 0){
        pivot.position.y = 0;
        const land = clips['landing'];
        if (land && mixer){
          dropState = 'land'; landT = 0;
          landDur = Math.min(Math.max(land.duration, 0.3), 1.2);  // cap — never trust a baked-out timeline
          landAction = mixer.clipAction(land);
          landAction.reset(); landAction.setLoop(THREE.LoopOnce); landAction.clampWhenFinished = false;
          idleAction.crossFadeTo(landAction, 0.16, false); landAction.play();
        } else dropState = 'idle';
      }
    }
    else if (dropState === 'land'){
      landT += dt;
      if (landT >= landDur - 0.15){
        landAction.crossFadeTo(idleAction.reset().play(), 0.25, false);
        dropState = 'idle';
      }
    }
    // pad life: outer assembly spins; once he's landed, the whole rig hovers
    if (padSpin) padSpin.rotation.y += dt * 0.5;
    if (dropState === 'idle'){
      bobT += dt;
      const bob = Math.sin(bobT * 1.15) * 0.045;
      pivot.position.y = bob;                          // he and the pad hover together
      if (pad) pad.position.y = pad.userData.baseY + bob;
      if (shadow) shadow.material.opacity = 0.09 - bob * 0.4;
    }
    bloom += (bloomTarget - bloom) * 0.1; setBloom();
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  }

  return {
    setActive(on){
      active = on;
      if (on){
        clock.getDelta(); if (!resize()) framed = false;
        if (framed && !reduced) startDrop();           // re-assemble on every visit
        if (!running && !reduced) requestAnimationFrame(loop);
        if (reduced){ resize(); if(!framed && boneBox()){ normalizeOnce(); fitCamera(); framed = true; }
          pivot.visible = true; pivot.position.y = 0; setBloom(); renderer.render(scene, cam); }
      }
    }
  };
}
