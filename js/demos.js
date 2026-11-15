// Interactive companions to the MATE paper. They illustrate the method on synthetic
// geometry in the browser; they do not reproduce or extend the paper's measurements.
(() => {
  const INK = '237,234,227', SIG = '#ff4f1a';
  const fit = (cv) => {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, r.width, r.height];
  };
  const mono = (c, s = 10) => { c.font = `${s}px "IBM Plex Mono", monospace`; };

  /* =========================================================
     1. Intratriangle clipping on the paper's reference prism
        (width 2, depth 3, height 10 — lateral perimeter 10)
     ========================================================= */
  const clipEl = document.querySelector('[data-demo="clip"]');
  if (clipEl) {
    const cv = clipEl.querySelector('canvas');
    const out = (k) => clipEl.querySelector(`[data-out="${k}"]`);
    const faces = [['A', 2], ['B', 3], ['C', 2], ['D', 3]];
    const HEIGHT = 10, PERIM = 10;
    let y0 = 4, y1 = 6, rows = 1, flip = false, grab = null, hover = null;

    const tris = () => {
      const list = []; let x = 0;
      faces.forEach(([, fw], fi) => {
        for (let r = 0; r < rows; r++) {
          const a = (r * HEIGHT) / rows, b = ((r + 1) * HEIGHT) / rows;
          const q = [[x, a], [x + fw, a], [x + fw, b], [x, b]];
          const alt = flip ? (fi + r) % 2 === 0 : false;
          if (alt) list.push([q[0], q[1], q[3]], [q[1], q[2], q[3]]);
          else list.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
        }
        x += fw;
      });
      return list;
    };
    // Sutherland–Hodgman against one horizontal half-plane
    const clipY = (poly, yc, keepAbove) => {
      const res = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const pin = keepAbove ? p[1] >= yc : p[1] <= yc, qin = keepAbove ? q[1] >= yc : q[1] <= yc;
        if (pin) res.push(p);
        if (pin !== qin) { const t = (yc - p[1]) / (q[1] - p[1]); res.push([p[0] + (q[0] - p[0]) * t, yc]); }
      }
      return res;
    };
    const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; };

    const draw = () => {
      const [c, w, h] = fit(cv);
      const padX = 34, padT = 30, padB = 26;
      const sx = (w - padX * 2) / PERIM, sy = (h - padT - padB) / HEIGHT;
      const X = (x) => padX + x * sx, Y = (y) => h - padB - y * sy;
      c.clearRect(0, 0, w, h);
      const T = tris();
      let touched = 0, inside = 0, edit = 0, wholeIn = 0, wholeAny = 0;
      // triangles
      c.lineWidth = 1;
      T.forEach((t) => {
        const poly = clipY(clipY(t, y0, true), y1, false);
        const a = poly.length >= 3 ? area(poly) : 0, ta = area(t);
        const full = t.every((v) => v[1] >= y0 - 1e-9 && v[1] <= y1 + 1e-9);
        if (a > 1e-9) { touched++; wholeAny += ta; edit += a; }
        if (full) { inside++; wholeIn += ta; }
        if (a > 1e-9 && !full) { // parent triangle that would be over-selected
          c.fillStyle = `rgba(${INK},.045)`; c.beginPath(); t.forEach((v, i) => (i ? c.lineTo(X(v[0]), Y(v[1])) : c.moveTo(X(v[0]), Y(v[1])))); c.closePath(); c.fill();
        }
        c.strokeStyle = `rgba(${INK},.34)`; c.beginPath(); t.forEach((v, i) => (i ? c.lineTo(X(v[0]), Y(v[1])) : c.moveTo(X(v[0]), Y(v[1])))); c.closePath(); c.stroke();
        if (a > 1e-9) {
          c.fillStyle = 'rgba(255,79,26,.3)'; c.strokeStyle = SIG;
          c.beginPath(); poly.forEach((v, i) => (i ? c.lineTo(X(v[0]), Y(v[1])) : c.moveTo(X(v[0]), Y(v[1])))); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = SIG; poly.forEach((v) => c.fillRect(X(v[0]) - 1.5, Y(v[1]) - 1.5, 3, 3));
        }
      });
      // folds + face labels
      mono(c); c.textBaseline = 'alphabetic';
      let x = 0;
      faces.forEach(([n, fw]) => {
        c.fillStyle = `rgba(${INK},.6)`; c.textAlign = 'center';
        c.fillText(`SIDE ${n} · ${fw}`, X(x + fw / 2), padT - 12);
        x += fw;
        if (x < PERIM) { c.setLineDash([2, 4]); c.strokeStyle = `rgba(${INK},.5)`; c.beginPath(); c.moveTo(X(x), Y(0) + 6); c.lineTo(X(x), Y(HEIGHT) - 6); c.stroke(); c.setLineDash([]); }
      });
      // band handles
      [['lo', y0], ['hi', y1]].forEach(([k, v]) => {
        const on = grab === k || hover === k;
        c.strokeStyle = on ? '#fff' : `rgba(${INK},.85)`; c.lineWidth = on ? 1.5 : 1;
        c.beginPath(); c.moveTo(X(0) - 22, Y(v)); c.lineTo(X(PERIM) + 22, Y(v)); c.stroke();
        c.fillStyle = on ? SIG : '#000'; c.strokeStyle = SIG;
        c.beginPath(); c.arc(X(0) - 22, Y(v), 5, 0, 6.2832); c.fill(); c.stroke();
        c.beginPath(); c.arc(X(PERIM) + 22, Y(v), 5, 0, 6.2832); c.fill(); c.stroke();
        c.fillStyle = `rgba(${INK},.8)`; c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillText(v.toFixed(2), X(PERIM) + 14, Y(v) + (k === 'lo' ? 11 : -10));
      });
      c.lineWidth = 1; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = `rgba(${INK},.38)`;
      c.fillText('unfolded lateral surface · height 10', X(0), h - 8);

      const ref = PERIM * (y1 - y0);
      out('touched').textContent = `${touched} / ${T.length}`;
      out('inside').textContent = `${inside}`;
      out('edit').textContent = edit.toFixed(6);
      out('ref').textContent = ref.toFixed(6);
      out('err').textContent = Math.abs(edit - ref).toExponential(2);
      out('wholeIn').textContent = wholeIn.toFixed(2);
      out('wholeAny').textContent = wholeAny.toFixed(2);
      out('wholeIn').classList.toggle('hot', Math.abs(wholeIn - ref) > 1e-6);
      out('wholeAny').classList.toggle('hot', Math.abs(wholeAny - ref) > 1e-6);
      cv._map = { Y, padT, padB, h, sy };
    };
    const toY = (e) => { const r = cv.getBoundingClientRect(), m = cv._map; return (m.h - m.padB - (e.clientY - r.top)) / m.sy; };
    const near = (e) => { const y = toY(e); const dl = Math.abs(y - y0), dh = Math.abs(y - y1); if (Math.min(dl, dh) > 0.6) return null; return dl < dh ? 'lo' : 'hi'; };
    cv.addEventListener('pointerdown', (e) => { const y = toY(e); grab = near(e) || (Math.abs(y - y0) < Math.abs(y - y1) ? 'lo' : 'hi'); cv.setPointerCapture(e.pointerId); move(e); });
    const move = (e) => {
      if (!grab) { const n = near(e); if (n !== hover) { hover = n; draw(); } cv.style.cursor = n ? 'ns-resize' : ''; return; }
      const y = Math.round(Math.max(0, Math.min(HEIGHT, toY(e))) * 20) / 20;
      if (grab === 'lo') y0 = Math.min(y, y1 - 0.25); else y1 = Math.max(y, y0 + 0.25);
      draw();
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', () => { grab = null; draw(); });
    clipEl.querySelectorAll('[data-rows]').forEach((b) => b.addEventListener('click', () => {
      rows = +b.dataset.rows;
      clipEl.querySelectorAll('[data-rows]').forEach((x) => x.classList.toggle('is-on', x === b));
      draw();
    }));
    clipEl.querySelector('[data-flip]').addEventListener('click', (e) => { flip = !flip; e.currentTarget.classList.toggle('is-on', flip); draw(); });
    clipEl.querySelector('[data-reset]').addEventListener('click', () => { y0 = 4; y1 = 6; draw(); });
    addEventListener('resize', draw);
    document.fonts?.ready.then(draw);
    draw();
  }

  /* =========================================================
     2. Texel-centre mask vs. bilinear sampling
     ========================================================= */
  const sampEl = document.querySelector('[data-demo="sample"]');
  if (sampEl) {
    const cv = sampEl.querySelector('canvas');
    const out = (k) => sampEl.querySelector(`[data-out="${k}"]`);
    const NX = 16, NY = 10, SUB = 6;
    let erode = false, probe = null;
    const bound = (v) => 7.37 + 0.21 * (v - NY / 2);          // continuous edit boundary: edit where u < bound(v)
    const isEdit = (u, v) => u < bound(v);
    let mask = [];
    const build = () => {
      const m = [];
      for (let j = 0; j < NY; j++) { m.push([]); for (let i = 0; i < NX; i++) m[j].push(isEdit(i + 0.5, j + 0.5) ? 1 : 0); }
      if (erode) {
        const e = m.map((r) => r.slice());
        for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
          if (!m[j][i]) continue;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const a = i + di, b = j + dj;
            if (a >= 0 && b >= 0 && a < NX && b < NY && !m[b][a]) e[j][i] = 0;
          }
        }
        mask = e;
      } else mask = m;
    };
    const tex = (i, j) => mask[Math.max(0, Math.min(NY - 1, j))][Math.max(0, Math.min(NX - 1, i))];
    const nearest = (u, v) => tex(Math.floor(u), Math.floor(v));
    const bilinear = (u, v) => {
      const x = u - 0.5, y = v - 0.5, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      return tex(i, j) * (1 - fx) * (1 - fy) + tex(i + 1, j) * fx * (1 - fy) + tex(i, j + 1) * (1 - fx) * fy + tex(i + 1, j + 1) * fx * fy;
    };
    const draw = () => {
      const [c, w, h] = fit(cv);
      const pad = 18, s = Math.min((w - pad * 2) / NX, (h - pad * 2) / NY);
      const ox = (w - s * NX) / 2, oy = (h - s * NY) / 2;
      const X = (u) => ox + u * s, Y = (v) => oy + v * s;
      c.clearRect(0, 0, w, h);
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        c.fillStyle = mask[j][i] ? 'rgba(255,79,26,.5)' : `rgba(${INK},.05)`;
        c.fillRect(X(i) + 0.5, Y(j) + 0.5, s - 1, s - 1);
        c.fillStyle = mask[j][i] ? '#000' : `rgba(${INK},.35)`;
        c.fillRect(X(i + 0.5) - 1, Y(j + 0.5) - 1, 2, 2);
      }
      // fixed protected probes: where does each sampler return a non-zero edit weight?
      let nN = 0, nB = 0, nP = 0, cov = 0, nE = 0;
      for (let j = 0; j < NY * SUB; j++) for (let i = 0; i < NX * SUB; i++) {
        const u = (i + 0.5) / SUB, v = (j + 0.5) / SUB, b = bilinear(u, v);
        if (isEdit(u, v)) { nE++; cov += b; continue; }
        nP++;
        const n = nearest(u, v);
        if (n > 0) nN++;
        if (b > 1e-12) { nB++; c.fillStyle = n > 0 ? '#fff' : `rgba(255,79,26,${(0.35 + b * 0.65).toFixed(2)})`; c.fillRect(X(u) - 1.2, Y(v) - 1.2, 2.4, 2.4); }
      }
      // true boundary
      c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(X(bound(0)), Y(0)); c.lineTo(X(bound(NY)), Y(NY)); c.stroke();
      mono(c); c.fillStyle = `rgba(${INK},.8)`; c.textBaseline = 'alphabetic';
      c.textAlign = 'left'; c.fillText('EDIT', X(0) + 4, Y(0) - 5);
      c.textAlign = 'right'; c.fillText('PROTECTED', X(NX) - 4, Y(0) - 5);
      // probe
      let pr = probe;
      if (!pr) { // start on a point that shows the effect: protected, nearest = 0, bilinear > 0
        pr = { u: bound(4.3) + 0.32, v: 4.3 };
        search: for (let v = 1.2; v < NY - 1; v += 0.25) for (let u = bound(v) + 0.06; u < bound(v) + 1; u += 0.06) {
          if (!isEdit(u, v) && nearest(u, v) === 0 && bilinear(u, v) > 0.15) { pr = { u, v }; break search; }
        }
      }
      const pu = Math.max(0.01, Math.min(NX - 0.01, pr.u)), pv = Math.max(0.01, Math.min(NY - 0.01, pr.v));
      const pb = bilinear(pu, pv), pn = nearest(pu, pv), pe = isEdit(pu, pv);
      const i0 = Math.floor(pu - 0.5), j0 = Math.floor(pv - 0.5);
      c.strokeStyle = `rgba(${INK},.9)`; c.setLineDash([3, 3]); c.strokeRect(X(i0 + 0.5), Y(j0 + 0.5), s, s); c.setLineDash([]);
      c.strokeStyle = '#fff'; c.beginPath(); c.arc(X(pu), Y(pv), 6, 0, 6.2832); c.stroke();
      c.beginPath(); c.moveTo(X(pu) - 11, Y(pv)); c.lineTo(X(pu) + 11, Y(pv)); c.moveTo(X(pu), Y(pv) - 11); c.lineTo(X(pu), Y(pv) + 11); c.stroke();
      out('where').textContent = pe ? 'EDIT' : 'PROTECTED';
      out('nearest').textContent = pn.toFixed(0);
      out('bilinear').textContent = pb.toFixed(4);
      const leak = !pe && pb > 1e-12;
      out('verdict').textContent = leak ? (pn > 0 ? 'mislabelled texel' : 'filter leak') : pe && pb < 1 ? 'partial coverage' : 'clean';
      out('verdict').classList.toggle('hot', leak);
      out('bilinear').classList.toggle('hot', leak);
      out('pn').textContent = `${nN} / ${nP}`;
      out('pb').textContent = `${nB} / ${nP}`;
      out('pb').classList.toggle('hot', nB > 0);
      out('cov').textContent = (cov / nE).toFixed(5);
      cv._map = { ox, oy, s };
    };
    const at = (e) => { const r = cv.getBoundingClientRect(), m = cv._map; probe = { u: (e.clientX - r.left - m.ox) / m.s, v: (e.clientY - r.top - m.oy) / m.s }; draw(); };
    cv.addEventListener('pointermove', at);
    cv.addEventListener('pointerdown', at);
    sampEl.querySelectorAll('[data-erode]').forEach((b) => b.addEventListener('click', () => {
      erode = b.dataset.erode === '1';
      sampEl.querySelectorAll('[data-erode]').forEach((x) => x.classList.toggle('is-on', x === b));
      build(); draw();
    }));
    addEventListener('resize', draw);
    document.fonts?.ready.then(draw);
    build(); draw();
  }
})();
