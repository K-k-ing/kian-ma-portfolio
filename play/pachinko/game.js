import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { PachinkoSim } from './sim.js';

const $ = (id) => document.getElementById(id);
const setLoad = (f, msg) => { $('bar').firstElementChild.style.width = Math.round(f * 100) + '%'; if (msg) $('loadmsg').textContent = msg; };

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 60);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.24, 0.5, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// Blender (Z-up) -> three (Y-up): (x, y, z) -> (x, z, -y)
const C4 = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const C4i = C4.clone().invert();
const fromBlender = (m16) => new THREE.Matrix4().set(...m16);
const instMatrix = (m16) => C4.clone().multiply(fromBlender(m16)).multiply(C4i);

// ---------------------------------------------------------------- material fix-ups
function fixMaterial(m) {
  if (m.userData.fixed) return m;
  m.userData.fixed = true;
  const n = m.name || '';
  if (n === 'm_glass') {
    const g = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, roughness: 0.02, metalness: 0, envMapIntensity: 0.8, depthWrite: false, name: n });
    g.userData.fixed = true; return g;
  }
  if (n.startsWith('m_clear')) {
    const g = new THREE.MeshPhysicalMaterial({ color: m.color, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0, envMapIntensity: 1.5, name: n });
    g.userData.fixed = true; return g;
  }
  if (m.transmission) { m.transmission = 0; }
  if (n === 'carpet') { m.map = carpetTexture(); m.color.set(0xffffff); m.roughness = 0.95; }
  if (m.emissiveIntensity > 1) {
    if (m.emissiveMap) m.emissiveIntensity = 1.0;                       // screens / title plates / signs
    else if (n === 'm_led_lens') m.emissiveIntensity = 0.42;
    else if (n === 'downlight' || n === 'panel_light') m.emissiveIntensity = 2.2;
    else m.emissiveIntensity = 1.05;                                      // LEDs
  }
  if (n.startsWith('m_led') || n === 'downlight' || n === 'panel_light') m.toneMapped = true;
  m.envMapIntensity = n.startsWith('m_board') ? 0.25 : 1.0;
  if (n.startsWith('m_board')) { m.clearcoat = 0; m.roughness = 0.5; }
  return m;
}
function carpetTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#23231f'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 20 + Math.random() * 46 | 0; g.fillStyle = `rgb(${v + 4},${v + 3},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(90,86,70,.35)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.strokeRect(i * 32 + 8, j * 32 + 8, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1.6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Merge an asset's meshes per material -> [{geometry, material}], so instances cost one draw call per material.
function mergeAsset(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = fixMaterial(o.material);
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat).push(g.index ? g.toNonIndexed() : g);
  });
  const out = [];
  for (const [material, geos] of groups) out.push({ geometry: mergeGeometries(geos, false), material });
  return out;
}

// ---------------------------------------------------------------- load
const loader = new GLTFLoader();
const loadGLB = (name) => new Promise((res, rej) => loader.load(`./assets/${name}.glb`, (g) => res(g.scene), undefined, rej));
const ASSETS = ['Room', 'Machine_h', 'Machine_a', 'Machine_b', 'Machine_c', 'BallBox', 'Crate', 'Bucket', 'Stool'];
let hero, simRoot, sim, L, sceneInfo;
const heroParts = {};

async function load() {
  await RAPIER.init();
  setLoad(0.05, 'Physics engine ready');
  [L, sceneInfo] = await Promise.all([fetch('./layout.json').then(r => r.json()), fetch('./assets/scene.json').then(r => r.json())]);
  const glb = {};
  let done = 0;
  await Promise.all(ASSETS.map(async (n) => { glb[n] = await loadGLB(n); done++; setLoad(0.05 + 0.8 * done / ASSETS.length, `Loading models ${done}/${ASSETS.length}`); }));
  // room (static)
  glb.Room.traverse((o) => { if (o.isMesh) o.material = fixMaterial(o.material); });
  scene.add(glb.Room);
  // instances
  const byCol = new Map();
  for (const it of sceneInfo.instances) { if (!byCol.has(it.col)) byCol.set(it.col, []); byCol.get(it.col).push(it); }
  for (const [colName, list] of byCol) {
    if (colName === 'Machine_h') {
      hero = glb.Machine_h; hero.matrixAutoUpdate = false; hero.matrix.copy(instMatrix(list[0].m)); scene.add(hero);
      simRoot = new THREE.Group(); simRoot.matrixAutoUpdate = false;
      simRoot.matrix.copy(C4.clone().multiply(fromBlender(list[0].m))); scene.add(simRoot);
      continue;
    }
    if (!glb[colName]) continue;
    for (const part of mergeAsset(glb[colName])) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((it, i) => im.setMatrixAt(i, instMatrix(it.m)));
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      if (part.material.transparent) im.renderOrder = 2;
      scene.add(im);
    }
  }
  hero.traverse((o) => {
    if (o.isMesh) { o.material = fixMaterial(o.material); if (o.material.transparent) o.renderOrder = 3; }
    for (const key of ['Windmill_L', 'Windmill_R', 'AttackerDoor', 'Handle', 'LCD', 'Glass', 'LedDots', 'LedLens', 'YakuLeds', 'CornerLeds', 'TopLedBar', 'Btn'])
      if (o.name === key + '_h') heroParts[key] = o;
  });
  // unique LED materials on the hero so jackpot flashing does not affect the whole hall
  for (const k of ['LedDots', 'LedLens', 'YakuLeds', 'CornerLeds', 'TopLedBar', 'Btn']) {
    const o = heroParts[k]; if (!o) continue;
    const mesh = o.isMesh ? o : o.children.find(c => c.isMesh);
    if (mesh) { mesh.material = mesh.material.clone(); mesh.userData.base = mesh.material.emissiveIntensity; heroParts[k] = mesh; }
  }
  setLoad(0.9, 'Setting up lighting');
  setupLights();
  setupLCD();
  setupBalls();
  sim = new PachinkoSim(RAPIER, L, {});
  buildEnv();
  setLoad(1, 'Ready');
  $('startbtn').style.display = 'block';
}

function setupLights() {
  scene.add(new THREE.HemisphereLight(0xfff1dd, 0x2a1a14, 0.3));
  for (const l of sceneInfo.lights) {
    const p = new THREE.Vector3(l.p[0], l.p[1], l.p[2]).applyMatrix4(C4);
    const pl = new THREE.PointLight(0xffe2c0, l.name === 'BackLight' ? 6 : 5.5, 9, 1.6); pl.position.copy(p); pl.position.y -= 0.25; scene.add(pl);
  }
  // machine glow onto the aisle
  for (let i = 0; i < 6; i++) {
    const a = new THREE.PointLight([0xff66cc, 0x66aaff, 0xffaa55][i % 3], 1.6, 3.2, 1.8);
    a.position.copy(new THREE.Vector3(0.45, 0.6 + i * 1.6, 1.25).applyMatrix4(C4)); scene.add(a);
    const b = a.clone(); b.position.copy(new THREE.Vector3(2.05, 0.9 + i * 1.6, 1.25).applyMatrix4(C4)); scene.add(b);
  }
}

function buildEnv() {
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cc = new THREE.CubeCamera(0.05, 40, rt);
  cc.position.copy(new THREE.Vector3(0.9, 0.3, 1.3).applyMatrix4(C4));
  if (ballMesh) ballMesh.visible = false;
  cc.update(renderer, scene);
  if (ballMesh) ballMesh.visible = true;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromCubemap(rt.texture).texture;
  scene.environmentIntensity = 0.55;
}

// ---------------------------------------------------------------- balls
let ballMesh; const MAXB = 256; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function setupBalls() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f6, metalness: 1, roughness: 0.08, envMapIntensity: 1.6 });
  ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(L.BALL_R, 20, 14), mat, MAXB);
  ballMesh.count = 0; ballMesh.frustumCulled = false; ballMesh.renderOrder = 1;
  simRoot.add(ballMesh);
}
function syncBalls() {
  let i = 0;
  for (const b of sim.balls.values()) {
    if (i >= MAXB) break;
    const t = b.body.translation(), r = b.body.rotation();
    _p.set(t.x, t.y, t.z); _q.set(r.x, r.y, r.z, r.w);
    ballMesh.setMatrixAt(i++, _m.compose(_p, _q, _s));
  }
  ballMesh.count = i; ballMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- LCD (canvas)
let lcdCtx, lcdTex; const LW = 592, LH = 400;
const fx = Array.from({ length: 7 }, () => newFirework());
function newFirework() { return { x: Math.random() * LW, y: 40 + Math.random() * 180, r: 0, max: 50 + Math.random() * 70, hue: Math.random() * 360, n: 22 + (Math.random() * 14 | 0) }; }
function setupLCD() {
  const c = document.createElement('canvas'); c.width = LW; c.height = LH; lcdCtx = c.getContext('2d');
  lcdTex = new THREE.CanvasTexture(c); lcdTex.colorSpace = THREE.SRGBColorSpace; lcdTex.flipY = false;
  const lcd = heroParts.LCD; const mesh = lcd.isMesh ? lcd : lcd.children.find(o => o.isMesh);
  mesh.material = new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false });
  mesh.material.color.setScalar(1.0);
}
const DIG_COL = ['#e6142a', '#1e5ae6', '#16a03c', '#f07800', '#b414d2', '#e6142a', '#00a0b4', '#ff2a6a', '#1e5ae6', '#f0a000'];
function drawLCD(t) {
  const g = lcdCtx, G = game;
  const jack = G.mode === 'jackpot';
  const grad = g.createLinearGradient(0, 0, 0, LH);
  if (jack) { const h = (t * 120) % 360; grad.addColorStop(0, `hsl(${h},90%,35%)`); grad.addColorStop(1, `hsl(${(h + 90) % 360},90%,55%)`); }
  else { grad.addColorStop(0, '#081046'); grad.addColorStop(0.55, '#1b5bd0'); grad.addColorStop(1, '#63d0ff'); }
  g.fillStyle = grad; g.fillRect(0, 0, LW, LH);
  // fireworks
  g.lineWidth = 2;
  for (let i = 0; i < fx.length; i++) {
    const f = fx[i]; f.r += (jack ? 2.4 : 1.1); if (f.r > f.max) fx[i] = newFirework();
    const a = 1 - f.r / f.max;
    for (let k = 0; k < f.n; k++) {
      const ang = k / f.n * 6.283; g.strokeStyle = `hsla(${f.hue + k * 3},95%,70%,${a})`;
      g.beginPath(); g.moveTo(f.x + Math.cos(ang) * f.r * 0.45, f.y + Math.sin(ang) * f.r * 0.45); g.lineTo(f.x + Math.cos(ang) * f.r, f.y + Math.sin(ang) * f.r + f.r * 0.08); g.stroke();
    }
  }
  // lanterns
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 67, y = 34 + Math.sin(t * 2 + i) * 3;
    g.fillStyle = i % 2 ? '#ff9a14' : '#e61e1e'; g.beginPath(); g.ellipse(x, y, 17, 20, 0, 0, 6.283); g.fill();
    g.fillStyle = '#ffe68c'; g.beginPath(); g.ellipse(x, y, 7, 9, 0, 0, 6.283); g.fill();
  }
  // koi
  for (let i = 0; i < 4; i++) {
    const x = ((t * (30 + i * 9) + i * 170) % (LW + 120)) - 60, y = 318 + i * 16 + Math.sin(t * 2 + i) * 5;
    g.fillStyle = ['#ff7814', '#ff4628', '#ffc828', '#ffffff'][i];
    g.beginPath(); g.ellipse(x, y, 30, 11, 0, 0, 6.283); g.fill();
    g.beginPath(); g.moveTo(x - 26, y); g.lineTo(x - 48, y - 12); g.lineTo(x - 48, y + 12); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(x + 20, y - 3, 2.5, 0, 6.283); g.fill();
  }
  if (jack) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 96px "Yu Gothic","Microsoft YaHei",sans-serif'; g.lineWidth = 10; g.strokeStyle = '#7a0010'; g.fillStyle = '#fff2a0';
    const s = 1 + 0.06 * Math.sin(t * 10);
    g.save(); g.translate(LW / 2, 165); g.scale(s, s); g.strokeText('JACKPOT', 0, 0); g.fillText('JACKPOT', 0, 0); g.restore();
    g.font = '900 40px Impact,sans-serif'; g.lineWidth = 6; g.strokeStyle = '#000'; g.fillStyle = '#fff';
    const tx = `ROUND ${Math.min(G.round, G.rounds)} / ${G.rounds}    +${G.jackGain}`;
    g.strokeText(tx, LW / 2, 262); g.fillText(tx, LW / 2, 262);
  } else {
    // reels
    const rw = 126, rh = 168;
    for (let i = 0; i < 3; i++) {
      const x = LW / 2 + (i - 1) * (rw + 16), y = 190;
      g.fillStyle = 'rgba(255,255,255,.86)'; g.strokeStyle = '#ffd23c'; g.lineWidth = 6;
      g.beginPath(); g.roundRect(x - rw / 2, y - rh / 2, rw, rh, 18); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.roundRect(x - rw / 2, y - rh / 2, rw, rh, 18); g.clip();
      const reel = G.reels[i];
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '150px Impact,sans-serif'; g.lineWidth = 6; g.strokeStyle = '#ffeb78';
      if (reel.spinning) {
        const off = (t * 900 + i * 40) % rh;
        for (let k = -1; k < 2; k++) { const d = (Math.floor(t * 900 / rh) + k + i * 3) % 10; const dd = (d + 10) % 10; g.fillStyle = DIG_COL[dd]; g.globalAlpha = 0.75; g.fillText(dd, x, y + off - k * rh - rh / 2 + 4); }
        g.globalAlpha = 1;
      } else { g.fillStyle = DIG_COL[reel.digit]; g.strokeText(reel.digit, x, y + 6); g.fillText(reel.digit, x, y + 6); }
      g.restore();
    }
    let banner = G.mode === 'spin' ? (G.reach ? 'REACH!'  : 'Spinning…') : (G.lastWin ? 'FEVER Jackpot' : 'Aim for the start pocket!');
    g.fillStyle = G.reach && (t * 6 | 0) % 2 ? '#e6142a' : '#78003c'; g.strokeStyle = '#ffdc5a'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(LW * 0.2, LH - 62, LW * 0.6, 46, 12); g.fill(); g.stroke();
    g.fillStyle = '#fff096'; g.font = 'bold 28px "Yu Gothic","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(banner, LW / 2, LH - 38);
  }
  lcdTex.needsUpdate = true;
}

// ---------------------------------------------------------------- audio (synth)
let actx, master, muted = false;
function audioInit() { if (actx) return; actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination); }
function blip(freq, dur = 0.05, type = 'sine', vol = 0.2, slide = 0) {
  if (!actx || muted) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
let lastTick = 0;
function tick(strength) { const now = performance.now(); if (now - lastTick < 28) return; lastTick = now; blip(2600 + Math.random() * 1800, 0.018, 'triangle', Math.min(0.12, 0.03 + strength * 0.05)); }
function jingle(notes, step = 0.09, type = 'square', vol = 0.12) { notes.forEach((n, i) => setTimeout(() => blip(n, step * 1.6, type, vol), i * step * 1000)); }

// ---------------------------------------------------------------- game state
const game = {
  stock: 250, shot: 0, starts: 0, jackpots: 0, paid: 0, spent: 0, reserves: 0,
  power: 0.45, firing: false, fireTimer: 0,
  mode: 'idle', reels: [{ digit: 3, spinning: false }, { digit: 7, spinning: false }, { digit: 5, spinning: false }],
  spinT: 0, result: null, reach: false, lastWin: false,
  round: 0, rounds: 5, roundBalls: 0, roundT: 0, gap: 0, jackGain: 0,
};
const JACKPOT_P = 1 / 18, ROUND_MAX = 8, ATT_PAY = 15;
let forceWin = false;
function toast(msg, ms = 1600) { const el = $('toast'); el.textContent = msg; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, ms); }
function pay(n) { game.stock += n; game.paid += n; for (let i = 0; i < Math.min(n, 8); i++) setTimeout(() => blip(1800 + Math.random() * 600, 0.03, 'square', 0.05), i * 45); }
function startSpin() {
  const G = game; G.reserves--; G.mode = 'spin'; G.spinT = 0; G.lastWin = false;
  const win = forceWin || Math.random() < JACKPOT_P; forceWin = false;
  let d;
  if (win) { const k = [7, 3, 5, 1, 9, 7, 7][Math.random() * 7 | 0]; d = [k, k, k]; }
  else {
    const a = Math.random() * 10 | 0; let c = Math.random() * 10 | 0;
    if (Math.random() < 0.22) { while (c === a) c = Math.random() * 10 | 0; d = [a, c, a]; }      // reach then miss: [left, centre, right]
    else { let b = Math.random() * 10 | 0; while (b === a) b = Math.random() * 10 | 0; d = [a, c, b]; }
  }
  G.result = { win, d }; G.reach = d[0] === d[2];
  G.reels.forEach(r => r.spinning = true);
  blip(700, 0.12, 'sawtooth', 0.08, 500);
}
function updateGame(dt) {
  const G = game;
  if (G.mode === 'idle' && G.reserves > 0) startSpin();
  if (G.mode === 'spin') {
    G.spinT += dt;
    const tC = G.reach ? 5.0 : 2.7;
    if (G.spinT > 1.1 && G.reels[0].spinning) { G.reels[0].spinning = false; G.reels[0].digit = G.result.d[0]; blip(520, 0.08, 'square', 0.1); }
    if (G.spinT > 1.8 && G.reels[2].spinning) { G.reels[2].spinning = false; G.reels[2].digit = G.result.d[2]; blip(620, 0.08, 'square', 0.1); if (G.reach) { toast('リーチ！', 1200); jingle([880, 1175, 880, 1175, 880, 1175], 0.12, 'sawtooth', 0.08); } }
    if (G.spinT > tC && G.reels[1].spinning) {
      G.reels[1].spinning = false; G.reels[1].digit = G.result.d[1];
      if (G.result.win) {
        G.mode = 'jackpot'; G.jackpots++; G.round = 1; G.roundBalls = 0; G.roundT = 0; G.gap = 1.2; G.jackGain = 0; G.lastWin = true;
        toast('大当り (Jackpot!)', 3000); jingle([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.11, 'square', 0.14);
      } else { G.mode = 'wait'; G.spinT = 0; blip(220, 0.18, 'sawtooth', 0.06, -100); }
    }
  } else if (G.mode === 'wait') { G.spinT += dt; if (G.spinT > 0.5) G.mode = 'idle'; }
  else if (G.mode === 'jackpot') {
    if (G.gap > 0) { G.gap -= dt; sim.attackerOpen = false; if (G.gap <= 0) { sim.attackerOpen = true; G.roundT = 0; G.roundBalls = 0; blip(990, 0.1, 'square', 0.1); } }
    else {
      G.roundT += dt;
      if (G.roundBalls >= ROUND_MAX || G.roundT > 11) {
        sim.attackerOpen = false; G.round++;
        if (G.round > G.rounds) { G.mode = 'idle'; toast(`FEVER ended　+${G.jackGain}`, 2600); jingle([1047, 784, 659, 523], 0.14, 'triangle', 0.12); }
        else G.gap = 1.0;
      }
    }
  }
  // firing
  G.fireTimer -= dt;
  if (G.firing && G.fireTimer <= 0 && G.stock > 0 && sim.balls.size < MAXB - 4) {
    sim.launch(G.power); G.stock--; G.shot++; G.spent++; G.fireTimer = 0.6;
    blip(140, 0.05, 'square', 0.12, -60);
  }
}
function handleEvents() {
  const G = game;
  for (const e of sim.drainEvents()) {
    if (e.type === 'start') { G.starts++; pay(3); if (G.reserves < 4) G.reserves++; jingle([1319, 1760], 0.07, 'sine', 0.16); flash = 0.5; }
    else if (e.type === 'pocket') { pay(e.pay); jingle([988, 1319], 0.06, 'sine', 0.12); }
    else if (e.type === 'attacker') { pay(ATT_PAY); G.roundBalls++; G.jackGain += ATT_PAY; blip(1568, 0.06, 'square', 0.1); }
    else if (e.type === 'foul') { G.stock++; G.shot--; G.spent--; }
  }
}
function updateHUD() {
  const G = game;
  $('s_stock').textContent = G.stock; $('s_shot').textContent = G.shot; $('s_start').textContent = G.starts; $('s_jack').textContent = G.jackpots;
  const d = G.paid - G.spent; $('s_diff').textContent = (d > 0 ? '+' : '') + d; $('s_diff').style.color = d >= 0 ? '#7dff6a' : '#ff7a7a';
  document.querySelectorAll('#reserve i').forEach((el, i) => el.classList.toggle('on', i < G.reserves));
  $('power').firstElementChild.style.width = Math.round(G.power * 100) + '%';
  $('plabel').textContent = `Power ${Math.round(G.power * 100)}%`;
  $('fire').classList.toggle('on', G.firing);
}

// ---------------------------------------------------------------- camera
let viewMode = 'play', yaw = 0, pitch = 0, dist = 0.74, camBlend = 1;
const camFrom = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, camTo = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
const tmpCam = new THREE.PerspectiveCamera();
function targetPose(out) {
  if (viewMode === 'hall') {
    const m = C4.clone().multiply(fromBlender(sceneInfo.camera.m));
    m.decompose(out.p, out.q, _s.set(1, 1, 1));
    const e = new THREE.Euler(pitch * 0.4, yaw * 0.4, 0, 'YXZ'); out.q.multiply(new THREE.Quaternion().setFromEuler(e));
    out.fov = 2 * Math.atan(Math.tan(Math.atan(18 / sceneInfo.camera.lens)) / camera.aspect) * 180 / Math.PI;
  } else {
    const tgt = new THREE.Vector3(0, 0.03, 0.44).applyMatrix4(simRoot.matrix);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch));       // blender-local, toward the player
    const pos = new THREE.Vector3(dir.x * dist, 0.03 + dir.y * dist, 0.44 + dir.z * dist + 0.03).applyMatrix4(simRoot.matrix);
    tmpCam.position.copy(pos); tmpCam.up.set(0, 1, 0); tmpCam.lookAt(tgt);
    out.p.copy(pos); out.q.copy(tmpCam.quaternion); out.fov = 48;
  }
}
function updateCamera(dt) {
  targetPose(camTo);
  if (camBlend < 1) {
    camBlend = Math.min(1, camBlend + dt / 1.1); const k = camBlend * camBlend * (3 - 2 * camBlend);
    camera.position.lerpVectors(camFrom.p, camTo.p, k); camera.quaternion.slerpQuaternions(camFrom.q, camTo.q, k);
    camera.fov = camFrom.fov + (camTo.fov - camFrom.fov) * k;
  } else { camera.position.copy(camTo.p); camera.quaternion.copy(camTo.q); camera.fov = camTo.fov; }
  camera.updateProjectionMatrix();
}
function toggleView() {
  camFrom.p.copy(camera.position); camFrom.q.copy(camera.quaternion); camFrom.fov = camera.fov; camBlend = 0;
  viewMode = viewMode === 'play' ? 'hall' : 'play'; yaw = 0; pitch = 0;
}

// ---------------------------------------------------------------- input
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; audioInit(); });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw = THREE.MathUtils.clamp(yaw - (e.clientX - drag.x) * 0.004, -0.9, 0.9);
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.004, -0.35, 0.7);
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('wheel', (e) => {
  if (e.shiftKey || viewMode === 'hall') dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.0006, 0.28, 1.4);
  else game.power = THREE.MathUtils.clamp(game.power - e.deltaY * 0.00025, 0, 1);
}, { passive: true });
const keys = {};
addEventListener('keydown', (e) => {
  audioInit(); keys[e.code] = true;
  if (e.code === 'Space') { game.firing = true; e.preventDefault(); }
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyB') loan();
  if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Muted' : 'Sound on', 700); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') game.firing = false; });
function loan() { game.stock += 125; game.spent += 0; toast('Added 125 balls', 800); blip(880, 0.08, 'sine', 0.1); }
$('loan').onclick = loan; $('view').onclick = toggleView;
const fb = $('fire');
fb.addEventListener('pointerdown', () => { audioInit(); game.firing = true; fb.dataset.hold = '1'; });
addEventListener('pointerup', () => { if (fb.dataset.hold) { game.firing = keys.Space || false; fb.dataset.hold = ''; } });
const pw = $('power');
const setPow = (e) => { const r = pw.getBoundingClientRect(); game.power = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1); };
pw.addEventListener('pointerdown', (e) => { setPow(e); pw.dataset.d = '1'; });
addEventListener('pointermove', (e) => { if (pw.dataset.d) setPow(e); });
addEventListener('pointerup', () => pw.dataset.d = '');

// ---------------------------------------------------------------- loop
let flash = 0, last = performance.now(), acc = 0, tsec = 0;
const prevV = new Map();
let handleQ0, doorOpen = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(); let dt = Math.min(0.05, (now - last) / 1000); last = now; tsec += dt;
  if (keys.ArrowRight || keys.KeyD) game.power = Math.min(1, game.power + dt * 0.25);
  if (keys.ArrowLeft || keys.KeyA) game.power = Math.max(0, game.power - dt * 0.25);
  updateGame(dt);
  acc += dt; let steps = 0;
  while (acc >= sim.dt && steps < 64) { sim.step(); acc -= sim.dt; steps++; }
  if (steps === 64) acc = 0;
  handleEvents();
  // impact ticks from velocity changes
  for (const b of sim.balls.values()) {
    const v = b.body.linvel(), pv = prevV.get(b.id);
    if (pv) { const dv = Math.hypot(v.x - pv.x, v.z - pv.z); if (dv > 0.35) tick(dv); pv.x = v.x; pv.z = v.z; } else prevV.set(b.id, { x: v.x, z: v.z });
  }
  if (prevV.size > 400) for (const k of prevV.keys()) if (!sim.balls.has(k)) prevV.delete(k);
  syncBalls();
  // moving parts
  if (heroParts.Windmill_L) heroParts.Windmill_L.rotation.z = -sim.windmillAngle(0);
  if (heroParts.Windmill_R) heroParts.Windmill_R.rotation.z = -sim.windmillAngle(1);
  if (heroParts.Handle) { handleQ0 ??= heroParts.Handle.quaternion.clone(); heroParts.Handle.quaternion.copy(handleQ0).multiply(_q.setFromAxisAngle(_p.set(0, 1, 0), -game.power * 2.2)); }
  doorOpen += ((sim.attackerOpen ? 1 : 0) - doorOpen) * Math.min(1, dt * 14);
  if (heroParts.AttackerDoor) heroParts.AttackerDoor.rotation.x = doorOpen * 1.35;
  // LED show
  flash = Math.max(0, flash - dt);
  const jack = game.mode === 'jackpot', reach = game.mode === 'spin' && game.reach && game.spinT > 1.8;
  for (const k of ['LedDots', 'LedLens', 'YakuLeds', 'CornerLeds', 'TopLedBar', 'Btn']) {
    const m = heroParts[k]; if (!m || !m.material) continue;
    let f = 1;
    if (jack) f = 0.5 + 1.3 * (0.5 + 0.5 * Math.sin(tsec * 18 + k.length));
    else if (reach) f = 0.6 + 0.9 * ((tsec * 8 | 0) % 2);
    else f = 0.85 + 0.15 * Math.sin(tsec * 3 + k.length) + flash * 1.5;
    m.material.emissiveIntensity = m.userData.base * f;
    if (jack && m.material.emissive) m.material.emissive.setHSL((tsec * 0.6 + k.length * 0.13) % 1, 0.8, 0.6);
    else if (m.userData.baseCol) m.material.emissive.copy(m.userData.baseCol);
    else m.userData.baseCol = m.material.emissive.clone();
  }
  drawLCD(tsec);
  updateCamera(dt);
  updateHUD();
  composer.render();
}

load().then(() => {
  targetPose(camTo); camera.position.copy(camTo.p); camera.quaternion.copy(camTo.q); camera.fov = camTo.fov; camera.updateProjectionMatrix();
  frame();
  $('startbtn').onclick = () => { audioInit(); $('loading').style.opacity = 0; setTimeout(() => $('loading').remove(), 650); };
  window.__game = { game, sim, heroParts, scene, camera, renderer, toggleView, debugJackpot: () => { forceWin = true; if (game.reserves < 1) game.reserves = 1; } };
}).catch((e) => { console.error(e); $('loadmsg').textContent = 'Loading failed: ' + e.message; });
