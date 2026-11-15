// Home hero: a procedural point cloud of a room. The cursor is a lens that "compiles"
// the uncertain points into labelled structure. Illustrative sketch — not project data.
(() => {
  const cv = document.getElementById('field');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const INK = [237, 234, 227], SIG = '#ff4f1a';

  // deterministic random so the room is the same on every visit
  let seed = 20270;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const jit = (a) => (rnd() - 0.5) * a;

  /* ---------- geometry ---------- */
  const pts = []; // x, y, z, weight, group (0 always · 1 x=-W · 2 x=+W · 3 z=-D · 4 z=+D)
  let grp = 0;
  const holes = [ // unknown regions: [cx, cy, cz, radius]
    [-1.6, 0, 1.4, 1.15], [3.2, 0, -2.6, 0.9], [-4, 1.7, -1.2, 0.8], [1.4, 1.5, -5, 0.7], [4, 1.2, 2.6, 0.75],
  ];
  const inHole = (x, y, z) => holes.some(([a, b, c, r]) => (x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2 < r * r);
  const put = (x, y, z, w = 1, n = 0.07) => { if (!inHole(x, y, z)) pts.push(x + jit(n), y + jit(n), z + jit(n), w, grp); };
  const plane = (o, u, v, nu, nv, w, skip) => {
    for (let i = 0; i <= nu; i++) for (let k = 0; k <= nv; k++) {
      const a = i / nu, b = k / nv;
      if (skip && skip(a, b)) continue;
      if (rnd() < 0.12) continue;
      put(o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b, w);
    }
  };
  const box = (x0, y0, z0, x1, y1, z1, d, w) => {
    const sx = Math.max(1, Math.round((x1 - x0) * d)), sy = Math.max(1, Math.round((y1 - y0) * d)), sz = Math.max(1, Math.round((z1 - z0) * d));
    plane([x0, y0, z0], [x1 - x0, 0, 0], [0, y1 - y0, 0], sx, sy, w);
    plane([x0, y0, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0], sx, sy, w);
    plane([x0, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], sz, sy, w);
    plane([x1, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], sz, sy, w);
    plane([x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], sx, sz, w);
  };
  const W = 4, H = 3, D = 5;
  plane([-W, 0, -D], [2 * W, 0, 0], [0, 0, 2 * D], 66, 82, 0.62);                                   // floor
  grp = 1; plane([-W, 0, -D], [0, 0, 2 * D], [0, H, 0], 78, 28, 0.55);                              // wall x = -W
  grp = 2; plane([W, 0, -D], [0, 0, 2 * D], [0, H, 0], 78, 28, 0.55, (a, b) => a > 0.3 && a < 0.62 && b > 0.33 && b < 0.8); // wall x = +W, window
  grp = 3; plane([-W, 0, -D], [2 * W, 0, 0], [0, H, 0], 62, 28, 0.55, (a, b) => a > 0.4 && a < 0.6 && b < 0.72); // wall z = -D, door
  grp = 4; plane([-W, 0, D], [2 * W, 0, 0], [0, H, 0], 62, 28, 0.55);                               // wall z = +D
  grp = 0;
  box(-3.6, 0.72, -3.4, -1.2, 0.8, -2.2, 16, 0.9);                                                  // desk top
  box(-3.5, 0, -3.3, -3.4, 0.72, -2.3, 14, 0.8); box(-1.4, 0, -3.3, -1.3, 0.72, -2.3, 14, 0.8);     // desk legs
  box(-0.4, 0.42, -1.1, 0.5, 0.52, -0.2, 20, 1); box(-0.4, 0.52, -1.1, 0.5, 1.35, -1.0, 20, 1);     // chair seat + back
  box(0, 0, -0.7, 0.1, 0.42, -0.6, 16, 0.9);                                                        // chair stem
  box(2.4, 0, 1.4, 2.62, 2.5, 1.62, 22, 1);                                                         // lantern post
  box(2.4, 2.3, 0.7, 2.62, 2.44, 1.4, 20, 1);                                                       // post arm
  for (let i = 0; i < 150; i++) { const t = rnd() * 6.283, p = Math.acos(2 * rnd() - 1), r = 0.2; put(2.51 + r * Math.sin(p) * Math.cos(t), 1.95 + r * Math.cos(p), 0.82 + r * Math.sin(p) * Math.sin(t), 1, 0); } // lamp
  for (let i = 0; i < 900; i++) put(jit(2 * W), rnd() * H, jit(2 * D), 0.22, 0);                    // stray noise
  const STR = 5, N = pts.length / STR;

  // "compiled" structure: clean edges + labels
  const E = [];
  const edgeBox = (x0, y0, z0, x1, y1, z1, g) => {
    const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => E.push([c[a], c[b], g]));
  };
  edgeBox(-W, 0, -D, W, H, D, 0);
  edgeBox(-3.6, 0, -3.4, -1.2, 0.8, -2.2, 1);
  edgeBox(-0.4, 0, -1.1, 0.5, 1.35, -0.2, 1);
  edgeBox(2.4, 0, 1.4, 2.62, 2.5, 1.62, 1);
  edgeBox(2.4, 2.3, 0.7, 2.62, 2.44, 1.4, 1);
  [[[W, 1, -2], [W, 2.4, -2]], [[W, 2.4, -2], [W, 2.4, 1.2]], [[W, 2.4, 1.2], [W, 1, 1.2]], [[W, 1, 1.2], [W, 1, -2]],
   [[-0.8, 0, -D], [-0.8, 2.16, -D]], [[-0.8, 2.16, -D], [0.8, 2.16, -D]], [[0.8, 2.16, -D], [0.8, 0, -D]]].forEach(([a, b]) => E.push([a, b, 1]));
  for (let i = 1; i < 3; i++) { const z = -D + (i * 2 * D) / 3; E.push([[-W, 0, z], [W, 0, z], 2]); }
  for (let i = 1; i < 3; i++) { const x = -W + (i * 2 * W) / 3; E.push([[x, 0, -D], [x, 0, D], 2]); }
  const LABELS = [
    [[0.05, 1.35, -1.05], 'CHAIR', 'candidate → accepted by hand'],
    [[2.51, 2.5, 1.5], 'POST', 'edit band kept inside its faces'],
    [[-2.4, 0.8, -2.8], 'DESK', 'observed'],
    [[W, 2.4, -0.4], 'OPENING', 'dashed, not a measured wall'],
    [[-1.3, 0, 3.3], 'FLOOR ×9', '6 observed · 3 design-inferred'],
    [[-W, H, D], 'SHELL', 'generated, source-constrained'],
  ];
  const HOLE_LABEL = 'UNKNOWN — kept visible';

  /* ---------- view ---------- */
  let running = true;
  let w = 0, h = 0, dpr = 1, yaw = -0.62, pitch = 0.5, tyaw = yaw, tpitch = pitch;
  let mx = -9999, my = -9999, lx = 0, ly = 0, hasPointer = false, lens = 0, lensTarget = 0, compiled = false, t0 = performance.now();
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    w = r.width; h = r.height;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  };
  let cy = 0, sy = 0, cp = 0, sp = 0, f = 0, camD = 15, cxs = 0, cys = 0;
  const vis = [1, 1, 1, 1, 1];
  const sm = (v) => Math.max(0, Math.min(1, v / 2.5));
  const setCam = () => {
    cy = Math.cos(yaw); sy = Math.sin(yaw); cp = Math.cos(pitch); sp = Math.sin(pitch);
    f = Math.min(w, h * 1.5) * (w < 700 ? 1.1 : 0.86);
    cxs = w * (w < 900 ? 0.5 : 0.61); cys = h * (w < 900 ? 0.33 : 0.44);
    const camX = -camD * cp * sy, camZ = -camD * cp * cy;
    vis[1] = sm(camX + W); vis[2] = sm(W - camX); vis[3] = sm(camZ + D); vis[4] = sm(D - camZ);
  };
  const out = [0, 0, 0];
  const proj = (x, y, z) => {
    y -= 1.4;
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp + camD;
    if (z2 < 0.4) { out[2] = -1; return out; }
    const k = f / z2;
    out[0] = cxs + x1 * k; out[1] = cys - y2 * k; out[2] = z2;
    return out;
  };

  const draw = (now) => {
    const time = (now - t0) / 1000;
    if (!still) {
      const drift = Math.sin(time * 0.11) * 0.2;
      yaw += (tyaw + drift - yaw) * 0.045; pitch += (tpitch - pitch) * 0.045;
    }
    if (!hasPointer) { // idle or touch: the lens wanders by itself
      if (w < 900) { mx = w * (0.5 + 0.3 * Math.sin(time * 0.33)); my = h * (0.33 + 0.09 * Math.sin(time * 0.47 + 1)); }
      else { mx = w * (0.6 + 0.24 * Math.sin(time * 0.33)); my = h * (0.44 + 0.17 * Math.sin(time * 0.47 + 1)); }
    }
    lx += (mx - lx) * (still ? 1 : 0.16); ly += (my - ly) * (still ? 1 : 0.16);
    const baseR = Math.min(w, h) * (w < 700 ? 0.24 : 0.19);
    lensTarget = compiled || still ? Math.hypot(w, h) : baseR;
    lens += (lensTarget - lens) * (still ? 1 : 0.075);
    setCam();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r2 = lens * lens;

    // points
    for (let i = 0; i < N; i++) {
      const v = vis[pts[i * STR + 4]];
      if (v < 0.02) continue;
      const o = proj(pts[i * STR], pts[i * STR + 1], pts[i * STR + 2]);
      if (o[2] < 0) continue;
      const px = o[0], py = o[1];
      if (px < -4 || py < -4 || px > w + 4 || py > h + 4) continue;
      const depth = Math.max(0.25, Math.min(1, 1.5 - o[2] / 19)) * v;
      const wt = pts[i * STR + 3];
      const dx = px - lx, dy = py - ly, inside = dx * dx + dy * dy < r2;
      const a = (inside ? 0.4 + 0.6 * wt : 0.3 + 0.6 * wt) * depth;
      const s = inside ? (wt > 0.8 ? 2.2 : 1.6) : wt > 0.8 ? 1.7 : 1.35;
      ctx.fillStyle = `rgba(${INK[0]},${INK[1]},${INK[2]},${a.toFixed(3)})`;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }

    // structure, only inside the lens
    ctx.save();
    ctx.beginPath(); ctx.arc(lx, ly, lens, 0, 6.2832); ctx.clip();
    ctx.lineWidth = 1;
    for (const [a, b, g] of E) {
      const A = proj(a[0], a[1], a[2]); const ax = A[0], ay = A[1], az = A[2];
      const B = proj(b[0], b[1], b[2]);
      if (az < 0 || B[2] < 0) continue;
      ctx.strokeStyle = g === 1 ? SIG : g === 0 ? 'rgba(255,79,26,.55)' : 'rgba(255,79,26,.26)';
      ctx.setLineDash(g === 2 ? [3, 5] : []);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(B[0], B[1]); ctx.stroke();
    }
    placed.length = 0;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(237,234,227,.55)';
    holes.forEach(([a, b, c, r], k) => {
      const o = proj(a, b, c); if (o[2] < 0) return;
      const rr = (r * f) / o[2];
      ctx.beginPath(); ctx.ellipse(o[0], o[1], rr, rr * (b === 0 ? Math.max(0.25, sp) : 0.85), 0, 0, 6.2832); ctx.stroke();
      if (k === 0) { ctx.setLineDash([]); label(o[0] + rr * 0.72, o[1] - rr * 0.3, HOLE_LABEL, '', 'rgba(237,234,227,.9)'); ctx.setLineDash([4, 4]); }
    });
    ctx.setLineDash([]);
    for (const [pnt, a, b] of LABELS) { const o = proj(pnt[0], pnt[1], pnt[2]); if (o[2] > 0) label(o[0], o[1], a, b, SIG); }
    ctx.restore();

    // lens ring + ticks + readout
    if (lens < Math.hypot(w, h) * 0.9) {
      ctx.strokeStyle = 'rgba(237,234,227,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(lx, ly, lens, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = SIG;
      for (let k = 0; k < 4; k++) {
        const an = (k * Math.PI) / 2 + time * (still ? 0 : 0.15);
        ctx.beginPath(); ctx.moveTo(lx + Math.cos(an) * (lens - 7), ly + Math.sin(an) * (lens - 7)); ctx.lineTo(lx + Math.cos(an) * (lens + 7), ly + Math.sin(an) * (lens + 7)); ctx.stroke();
      }
      if (w < 700) { requestNext(); return; }
      ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(237,234,227,.75)'; ctx.textBaseline = 'middle';
      ctx.fillText('COMPILE', lx + lens + 14, ly - 7);
      ctx.fillStyle = 'rgba(237,234,227,.4)';
      ctx.fillText(`r ${Math.round(lens)}px · yaw ${(yaw * 57.3).toFixed(1)}°`, lx + lens + 14, ly + 7);
    }
    requestNext();
  };
  function requestNext() { if (running && (!still || lens < lensTarget - 1)) requestAnimationFrame(draw); }
  const placed = [];
  function label(x, y, a, b, col) {
    const ex = x + 26, ey = y - 22;
    const box = [ex, ey - 10, ex + 20 + Math.max(a.length, b.length) * 6.2, ey + (b ? 22 : 8)];
    if (placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) return;
    placed.push(box);
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 2, y - 2); ctx.lineTo(ex, ey); ctx.lineTo(ex + 8, ey); ctx.stroke();
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.fillText(a, ex + 13, ey);
    if (b) { ctx.fillStyle = 'rgba(237,234,227,.62)'; ctx.fillText(b, ex + 13, ey + 13); }
  }

  /* ---------- input ---------- */
  const hero = cv.parentElement;
  let drag = null, moved = 0;
  hero.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (e.pointerType === 'mouse') { hasPointer = true; mx = e.clientX - r.left; my = e.clientY - r.top; }
    if (drag) {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      tyaw = drag.yaw + (e.clientX - drag.x) * 0.006;
      tpitch = Math.max(0.12, Math.min(1.15, drag.pitch + (e.clientY - drag.y) * 0.004));
    } else if (e.pointerType === 'mouse') {
      tyaw = -0.62 + (mx / w - 0.5) * 0.6; tpitch = 0.5 + (my / h - 0.5) * 0.2;
    }
  });
  hero.addEventListener('pointerdown', (e) => { if (e.target.closest('a')) return; if (e.pointerType === 'mouse') drag = { x: e.clientX, y: e.clientY, yaw: tyaw, pitch: tpitch }; moved = 0; });
  addEventListener('pointerup', () => { drag = null; });
  hero.addEventListener('pointerleave', () => { hasPointer = false; });
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a') || moved > 6) return;
    compiled = !compiled;
    hero.dataset.compiled = compiled;
    const st = document.getElementById('field-state');
    if (st) st.textContent = compiled ? 'Compiled — click to return to evidence' : 'Evidence — click to compile the scene';
    if (still) requestAnimationFrame(draw);
  });
  if (coarse) { const k = document.querySelector('.hero-foot .keys'); if (k) k.innerHTML = '<span><b>Tap</b> — <span id="field-state">compile the scene</span></span>'; }

  resize(); lx = mx = w * 0.62; ly = my = h * 0.42; hasPointer = false;
  addEventListener('resize', () => { resize(); if (still) requestAnimationFrame(draw); });
  new IntersectionObserver(([e]) => { const was = running; running = e.isIntersecting; if (running && !was) requestAnimationFrame(draw); }).observe(cv);
  requestAnimationFrame(draw);
})();
