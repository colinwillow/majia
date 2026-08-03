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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
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
  const DROP_FROM = 3.1;
  const clips = {};

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

  function fitCamera(){
    const box = boneBox(); if (!box) return;
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    // bones under-cover the surface; pad, but tighter now so he reads bigger
    const r = Math.max(size.x, size.y * 0.9, size.z) * 0.5 * 1.3 + 0.12;
    const fov = cam.fov*Math.PI/180, hfov = 2*Math.atan(Math.tan(fov/2)*cam.aspect);
    const dist = (r/Math.sin(Math.min(fov,hfov)/2)) * 1.06;
    // nudge the look-point up slightly so head + feet sit centred in the frame
    const cy = center.y + size.y * 0.06;
    cam.position.set(center.x, cy, center.z + dist); cam.lookAt(center.x, cy, center.z); cam.updateProjectionMatrix();
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
  }

  // theme: outline follows ink colour
  function syncTheme(){ const c = hexToColor(cvar('--ink')); for (const m of outlineMats) m.color.copy(c); }
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
    if (!framed && resize() && warm++ > 3){ normalizeOnce(); fitCamera(); framed = true; startDrop(); }
    // assemble: he falls in from above, lands, then settles into idle
    if (dropState === 'drop'){
      dropV += 14 * dt;
      pivot.position.y -= dropV * dt * 4.2;
      if (pivot.position.y <= 0){
        pivot.position.y = 0;
        const land = clips['landing'];
        if (land && mixer){
          dropState = 'land';
          const a = mixer.clipAction(land);
          a.reset(); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = false;
          idleAction.crossFadeTo(a, 0.08, false); a.play();
          const done = (ev) => { if (ev.action !== a) return;
            mixer.removeEventListener('finished', done);
            a.crossFadeTo(idleAction.reset().play(), 0.25, false);
            dropState = 'idle'; };
          mixer.addEventListener('finished', done);
        } else dropState = 'idle';
      }
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
