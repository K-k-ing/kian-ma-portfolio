// Shared interactions. Everything is progressive: the pages read fine without JavaScript.
(() => {
  const doc = document.documentElement;
  doc.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- measuring cursor + coordinate readout ---- */
  const xy = $('.hd-xy');
  if (fine) {
    const cur = document.createElement('div');
    cur.className = 'cur';
    cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<i></i><i></i><span class="cur-ring"></span><span class="cur-label"></span>';
    document.body.appendChild(cur);
    doc.classList.add('has-cur');
    const label = $('.cur-label', cur);
    addEventListener('pointermove', (e) => {
      cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      cur.classList.add('is-on');
      if (xy) xy.innerHTML = `X <b>${String(e.clientX).padStart(4, '0')}</b> · Y <b>${String(Math.round(e.clientY + scrollY)).padStart(5, '0')}</b>`;
      const t = e.target.closest?.('[data-cursor], [data-zoom] .fig-frame, .plate-grid .cell, a, button, summary, input, [data-compare]');
      let text = '';
      if (t) {
        if (t.dataset.cursor) text = t.dataset.cursor;
        else if (t.matches('.fig-frame, .cell')) text = 'Enlarge';
        else if (t.matches('[data-compare], [data-compare] input')) text = 'Drag';
      }
      label.textContent = text;
      cur.classList.toggle('is-label', !!text);
      cur.classList.toggle('is-link', !!t && !text);
    }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('is-on'));
  }

  /* ---- header: solid after scroll, hide on scroll down, progress line ---- */
  const hd = $('.hd');
  const prog = $('.prog');
  let lastY = 0;
  const onScroll = () => {
    const y = scrollY;
    if (hd) {
      hd.classList.toggle('is-solid', y > 40);
      hd.classList.toggle('is-hidden', y > 500 && y > lastY && !$('.toc'));
    }
    if (prog) prog.style.transform = `scaleX(${clamp(y / Math.max(1, doc.scrollHeight - innerHeight), 0, 1)})`;
    lastY = y;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- reveal on scroll ---- */
  const reveals = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !still) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    reveals.forEach((el) => io.observe(el));
  } else reveals.forEach((el) => el.classList.add('is-in'));

  /* ---- statement: words light up as they pass the reading line ---- */
  const pos = $('.pos-text');
  if (pos && !still) {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((t) => {
            if (!t.trim()) frag.append(t);
            else { const s = document.createElement('span'); s.className = 'w'; s.textContent = t; frag.append(s); }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(pos);
    const words = $$('.w', pos);
    const light = () => {
      const r = pos.getBoundingClientRect();
      const t = clamp((innerHeight * 0.86 - r.top) / (r.height + innerHeight * 0.36), 0, 1);
      const n = Math.round(t * words.length);
      words.forEach((w, i) => w.classList.toggle('is-lit', i < n));
    };
    addEventListener('scroll', light, { passive: true });
    light();
  }

  /* ---- works index: image follows the cursor ---- */
  const idx = $('.idx');
  if (idx && fine) {
    const peek = document.createElement('div');
    peek.className = 'peek';
    peek.setAttribute('aria-hidden', 'true');
    const rows = $$('.idx-row', idx);
    rows.forEach((row) => {
      const src = row.dataset.peek;
      if (!src) return;
      const im = new Image();
      im.src = src; im.alt = '';
      peek.appendChild(im);
      row._peek = im;
    });
    document.body.appendChild(peek);
    let tx = 0, ty = 0, x = 0, y = 0, on = false;
    const tick = () => {
      x += (tx - x) * 0.14; y += (ty - y) * 0.14;
      const rot = clamp((tx - x) * 0.04, -7, 7);
      peek.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`;
      if (on) requestAnimationFrame(tick);
    };
    idx.addEventListener('pointermove', (e) => {
      const w = peek.offsetWidth, h = peek.offsetHeight;
      tx = clamp(e.clientX + 28, 8, innerWidth - w - 8);
      ty = clamp(e.clientY - h / 2, 8, innerHeight - h - 8);
    });
    rows.forEach((row) => {
      row.addEventListener('pointerenter', () => {
        if (!row._peek) return;
        $$('img', peek).forEach((i) => i.classList.toggle('is-on', i === row._peek));
        peek.dataset.label = row.dataset.label || '';
        peek.classList.add('is-on');
        if (!on) { on = true; x = tx; y = ty; requestAnimationFrame(tick); }
      });
    });
    idx.addEventListener('pointerleave', () => { peek.classList.remove('is-on'); on = false; });
  }

  /* ---- before / after comparison ---- */
  $$('[data-compare]').forEach((c) => {
    const input = $('input', c);
    const set = (v) => c.style.setProperty('--pos', `${clamp(v, 0, 100)}%`);
    input.addEventListener('input', () => set(+input.value));
    const fromPointer = (e) => {
      const r = c.getBoundingClientRect();
      const v = ((e.clientX - r.left) / r.width) * 100;
      input.value = v; set(v);
    };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); fromPointer(e); });
    c.addEventListener('pointermove', (e) => { if (c.hasPointerCapture(e.pointerId)) fromPointer(e); });
  });

  /* ---- click-to-play video ---- */
  $$('[data-video]').forEach((v) => {
    const video = $('video', v), b = $('.vid-play', v);
    video.controls = false;
    b.addEventListener('click', () => { video.controls = true; v.classList.add('is-playing'); video.play().catch(() => {}); });
    video.addEventListener('play', () => { video.controls = true; v.classList.add('is-playing'); });
  });

  /* ---- tabbed picker ---- */
  $$('[data-picker]').forEach((pk) => {
    const tabs = $$('.picker-tabs button', pk), panes = $$('.picker-pane', pk);
    const show = (i) => {
      tabs.forEach((t, k) => { t.classList.toggle('is-on', k === i); t.setAttribute('aria-selected', k === i); });
      panes.forEach((p, k) => p.classList.toggle('is-on', k === i));
    };
    tabs.forEach((t, i) => { t.addEventListener('click', () => show(i)); if (fine) t.addEventListener('pointerenter', () => show(i)); });
  });

  /* ---- drag-to-scroll ribbon ---- */
  $$('.ribbon').forEach((r) => {
    let down = false, sx = 0, sl = 0, moved = 0;
    r.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; sl = r.scrollLeft; moved = 0; });
    addEventListener('pointermove', (e) => {
      if (!down) return;
      moved = Math.abs(e.clientX - sx);
      if (moved > 4) r.classList.add('is-drag');
      r.scrollLeft = sl - (e.clientX - sx);
    });
    addEventListener('pointerup', () => { down = false; setTimeout(() => r.classList.remove('is-drag'), 0); });
    r.addEventListener('click', (e) => { if (moved > 4) { e.preventDefault(); e.stopPropagation(); } }, true);
  });

  /* ---- section nav highlight (work pages + paper) ---- */
  const navLinks = $$('.toc a, .paper-toc a');
  if (navLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const targets = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      navLinks.forEach((a) => a.classList.remove('is-on'));
      const a = map.get(e.target.id);
      a.classList.add('is-on');
      const bar = a.closest('.toc');
      if (bar) bar.scrollTo({ left: a.offsetLeft - bar.clientWidth / 2 + a.offsetWidth / 2, behavior: still ? 'auto' : 'smooth' });
    }), { rootMargin: '-25% 0px -65% 0px' });
    targets.forEach((t) => io.observe(t));
  }

  /* ---- lightbox with wheel zoom + drag pan ---- */
  const zoomables = $$('[data-zoom] .fig-frame img, .plate-grid .cell img');
  if (zoomables.length) {
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML = '<div class="lb-bar"><span class="lb-count"></span><span><button type="button" data-lb="prev">← Prev</button><button type="button" data-lb="next">Next →</button><button type="button" data-lb="fit">Fit</button><button type="button" data-lb="close">Close ✕</button></span></div><div class="lb-stage" data-cursor="Scroll · Drag"><img alt=""></div><div class="lb-cap"></div>';
    document.body.appendChild(lb);
    const stage = $('.lb-stage', lb), im = $('img', lb), cap = $('.lb-cap', lb), count = $('.lb-count', lb);
    let i = 0, s = 1, ox = 0, oy = 0, base = 1, opener = null;
    const apply = () => { im.style.transform = `translate(${ox - (im.naturalWidth * s) / 2}px,${oy - (im.naturalHeight * s) / 2}px) scale(${s})`; };
    const fit = () => {
      const r = stage.getBoundingClientRect();
      base = Math.min((r.width - 32) / im.naturalWidth, (r.height - 16) / im.naturalHeight, 1.5);
      s = base; ox = 0; oy = 0; apply();
    };
    const show = (k) => {
      i = (k + zoomables.length) % zoomables.length;
      const src = zoomables[i];
      im.style.opacity = 0;
      im.onload = () => { fit(); im.style.opacity = 1; };
      im.src = src.currentSrc || src.src;
      im.alt = src.alt;
      const fc = src.closest('figure')?.querySelector('figcaption');
      const cellLabel = src.closest('.cell')?.querySelector('span')?.textContent;
      cap.textContent = [cellLabel, fc ? fc.textContent : src.alt].filter(Boolean).join(' — ');
      count.textContent = `${String(i + 1).padStart(2, '0')} / ${String(zoomables.length).padStart(2, '0')}`;
    };
    const open = (k) => { opener = document.activeElement; lb.classList.add('is-on'); document.body.classList.add('is-locked'); show(k); $('[data-lb="close"]', lb).focus(); };
    const close = () => { lb.classList.remove('is-on'); document.body.classList.remove('is-locked'); opener?.focus?.(); };
    zoomables.forEach((z, k) => {
      const frame = z.closest('.fig-frame, .cell');
      frame.tabIndex = 0;
      frame.setAttribute('role', 'button');
      frame.setAttribute('aria-label', `Enlarge image: ${z.alt}`);
      frame.addEventListener('click', () => open(k));
      frame.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(k); } });
    });
    lb.addEventListener('click', (e) => {
      const a = e.target.closest('[data-lb]')?.dataset.lb;
      if (a === 'close') close(); else if (a === 'prev') show(i - 1); else if (a === 'next') show(i + 1); else if (a === 'fit') fit();
    });
    addEventListener('keydown', (e) => {
      if (!lb.classList.contains('is-on')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1);
    });
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const px = e.clientX - r.left - r.width / 2, py = e.clientY - r.top - r.height / 2;
      const ns = clamp(s * Math.exp(-e.deltaY * 0.0016), base * 0.6, Math.max(4, base * 6));
      ox = px - ((px - ox) * ns) / s; oy = py - ((py - oy) * ns) / s; s = ns; apply();
    }, { passive: false });
    let drag = null, travelled = 0;
    stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; travelled = 0; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      travelled = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
      ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; apply();
    });
    stage.addEventListener('pointerup', (e) => {
      if (travelled < 5 && e.target === stage) close();
      else if (travelled < 5) { if (s > base * 1.05) fit(); else { s = Math.min(base * 2.4, 4); apply(); } }
      drag = null;
    });
    addEventListener('resize', () => { if (lb.classList.contains('is-on')) fit(); });
  }

  /* ---- mono links decode on hover ---- */
  if (fine && !still) {
    const glyphs = '+×/\\—·01<>[]';
    $$('[data-scramble]').forEach((el) => {
      const orig = el.textContent;
      let raf = 0;
      el.addEventListener('pointerenter', () => {
        let f = 0;
        cancelAnimationFrame(raf);
        const run = () => {
          f++;
          el.textContent = [...orig].map((ch, k) => (ch === ' ' || k < f / 2 ? ch : glyphs[(Math.random() * glyphs.length) | 0])).join('');
          if (f / 2 < orig.length) raf = requestAnimationFrame(run); else el.textContent = orig;
        };
        run();
      });
    });
  }

  /* ---- local time in the footer ---- */
  const clock = $('[data-clock]');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const t = () => { clock.textContent = `${fmt.format(new Date())} CST`; };
    t(); setInterval(t, 1000);
  }
})();
