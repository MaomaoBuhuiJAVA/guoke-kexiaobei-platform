(() => {
  'use strict';
  const { pigments, CAPACITY, clamp, lerp, color, css, empty, fill, volume, describe, transfer } = ColorModel;
  const { backdrop, cup, stream, sparkle } = PaintLab;
  const $ = id => document.getElementById(id);
  const arena = $('arena'), canvas = $('scene'), layer = $('cups'), picker = $('picker'), toast = $('toast');
  const ctx = canvas.getContext('2d');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const idle = '点一个空杯，选一种颜色。';
  const spark = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 6 2 7 8 8-6 1-7 2-8 8-1-6-2-7-8-8 6-1 7-2 8-8Zm7 13v6m-3-3h6"/></svg>';
  const smooth = t => t * t * (3 - 2 * t);
  const phase = (time, start, end) => clamp((time - start) / (end - start), 0, 1);
  let w = 1, h = 1, size = { w: 76, h: 105 }, homes = [], dpr = 1;
  let state = newState(), history = [], grab = null, selected = null, open = null, pouring = null;
  let effect = null, toastTimer = 0, toastEnd = 0, raf = 0, last = 0;
  const waves = Array.from({ length: 7 }, () => ({ displacement: 0, speed: 0, tilt: 0 }));
  const buttons = state.cups.map((_, index) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cup';
    b.innerHTML = `<span class="cup-text"><span class="number">${index + 1}</span><i aria-hidden="true"></i><span class="cup-name">空杯</span></span>`;
    b.addEventListener('pointerdown', e => hold(e, index));
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', abort);
    b.addEventListener('lostpointercapture', abort);
    b.addEventListener('click', e => { if (e.detail === 0) choose(index); });
    layer.append(b);
    return b;
  });

  function newState() {
    return { cups: Array.from({ length: 7 }, () => ({ parts: empty(), pos: null })), records: [] };
  }
  function checkpoint() {
    history.push(structuredClone(state));
    if (history.length > 60) history.shift();
  }
  function status(text) { $('status').textContent = text; }
  function formula(a, b, result) {
    const token = value => `<span><i class="dot" style="--color:${css(value.rgb)}" aria-hidden="true"></i>${value.name}</span>`;
    return `<div class="formula">${token(a)}<b>+</b>${token(b)}<b>=</b>${token(result)}</div>`;
  }
  function syncLabels() {
    let used = 0;
    state.cups.forEach(({ parts }, i) => {
      const b = buttons[i], isEmpty = volume(parts) < .001, pigment = describe(parts);
      if (!isEmpty) used++;
      b.querySelector('.cup-name').textContent = pigment.name;
      b.style.setProperty('--pigment', css(pigment.rgb));
      b.setAttribute('aria-label', `${i + 1}号杯，${pigment.name}`);
      if (isEmpty && selected === null) {
        b.setAttribute('aria-haspopup','dialog'); b.setAttribute('aria-expanded', String(open === i));
        b.removeAttribute('aria-pressed');
      } else {
        b.removeAttribute('aria-haspopup'); b.removeAttribute('aria-expanded');
        b.setAttribute('aria-pressed',String(selected === i));
      }
    });
    $('used').textContent = used;
    $('undo').disabled = !history.length || !!pouring || !!grab;
    $('reset').disabled = (!used && !state.records.length && state.cups.every(c => !c.pos)) || !!pouring || !!grab;
  }
  function syncRecords() {
    const log = state.records;
    $('logCount').textContent = String(log.length).padStart(2, '0');
    $('records').innerHTML = log.length ? log.map((r, i) => `<div class="entry"><strong><i class="dot" style="--color:${css(r.result.rgb)}" aria-hidden="true"></i>${r.result.name}</strong>${formula(r.a,r.b,r.result)}<small>第 ${log.length - i} 次记录 · ${r.target + 1} 号杯</small></div>`).join('') : `<div class="blank"><svg viewBox="0 0 64 48" aria-hidden="true"><path d="M9 39h46M21 6v7l-7 15a4 4 0 0 0 4 6h14a4 4 0 0 0 4-6l-7-15V6m-10 0h12m-13 18h14m12-13v5m-2.5-2.5h5m2.5 9v8m-4-4h8"/></svg>还没有配色记录</div>`;
  }
  function hideToast() {
    clearTimeout(toastTimer); clearTimeout(toastEnd);
    toast.hidden = true; toast.classList.remove('leaving'); effect = null;
  }
  function discover(p, time) {
    hideToast();
    const { a, b, result, target } = p;
    const isNew = result.name !== a.name && result.name !== b.name;
    toast.innerHTML = `<strong>${spark}${isNew ? '发现新颜色：' + result.name : '配色完成'}</strong>${formula(a,b,result)}`;
    toast.style.setProperty('--result', css(result.rgb)); toast.hidden = false;
    if (!motion.matches) effect = { index: target, rgb: result.rgb, started: time };
    toastTimer = setTimeout(() => {
      toast.classList.add('leaving');
      toastEnd = setTimeout(() => { toast.hidden = true; toast.classList.remove('leaving'); }, motion.matches ? 0 : 290);
    }, 5200);
    status(`${isNew ? '发现新颜色！' : '混合完成。'}${a.name}加${b.name}，得到${result.name}。`);
  }

  function position(i) {
    const p = state.cups[i].pos;
    return p ? bounds(p.x * w, p.y * h) : homes[i];
  }
  function bounds(x, y) {
    return { x: clamp(x, size.w / 2 + 9, w - size.w / 2 - 9), y: clamp(y, size.h / 2 + 9, h - size.h / 2 - 28) };
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function local(e) {
    const r = arena.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function resize() {
    w = arena.clientWidth; h = arena.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    size = { w: clamp(w * .176, 53, 111), h: clamp(w * .231, 76, 132) };
    const spread = Math.min(w * .231, 166), compact = w < 540;
    homes = state.cups.map((_, i) => bounds(w / 2 + (i < 4 ? i - 1.5 : i - 5) * spread, h * (i < 4 ? (compact ? .44 : .47) : .78)));
    if (open !== null) positionPicker();
    schedule();
  }
  function positionPicker() {
    const p = position(open);
    const bw = picker.offsetWidth, bh = picker.offsetHeight;
    picker.style.left = `${clamp(p.x - bw / 2, 10, w - bw - 10)}px`;
    const above = p.y - size.h / 2 - bh - 7;
    picker.style.top = `${above > 10 ? above : clamp(p.y + size.h / 2 + 23, 10, h - bh - 10)}px`;
  }
  function showPicker(i) {
    open = i; picker.hidden = false; $('pickerTitle').textContent = `给 ${i + 1} 号杯选颜色`;
    positionPicker(); syncLabels(); $('swatches').firstElementChild.focus({ preventScroll: true });
    status(`给 ${i + 1} 号空杯选一种颜色。`);
  }
  function closePicker(restore = false) {
    if (open === null) return;
    const index = open; open = null; picker.hidden = true; syncLabels();
    if (restore) buttons[index].focus({ preventScroll: true });
  }
  function addPigment(index) {
    if (open === null) return;
    const i = open; checkpoint(); closePicker(true); hideToast();
    state.cups[i].parts = fill(index); waves[i].speed = 5;
    status(`${i + 1} 号杯装入${pigments[index].name}。`); syncLabels(); schedule();
  }
  function choose(i) {
    if (pouring || grab) return;
    if (open === i) { closePicker(true); status(idle); return; }
    closePicker();
    if (selected !== null && i !== selected) { beginPour(selected, i); return; }
    if (volume(state.cups[i].parts) < .001) { selected = null; showPicker(i); return; }
    selected = selected === i ? null : i;
    status(selected === null ? idle : `已拿起 ${i + 1} 号杯。`);
    syncLabels(); schedule();
  }

  function hold(e, i) {
    if (!e.isPrimary || e.button !== 0 || grab || pouring) return;
    if (open !== null && open !== i) closePicker();
    const p = local(e), initial = position(i);
    grab = { id: e.pointerId, index: i, initial, origin: p, previous: p, lastAt: e.timeStamp, point: initial, moving: false, target: null };
    buttons[i].setPointerCapture(e.pointerId);
    syncLabels(); schedule();
  }
  function targetAt(point, pointer, from) {
    if (volume(state.cups[from].parts) < .001) return null;
    let target = null, best = Infinity;
    state.cups.forEach((_, i) => {
      if (i === from) return;
      const p = position(i);
      const score = Math.min(...[pointer, point].map(q => Math.hypot((q.x - p.x) / size.w, (q.y - p.y) / size.h)));
      if (score < .58 && score <= best) { target = i; best = score; }
    });
    return target;
  }
  function move(e) {
    const g = grab;
    if (!g || e.pointerId !== g.id) return;
    const p = local(e);
    if (!g.moving) {
      if (dist(p, g.origin) < 6) return;
      g.moving = true; selected = null; closePicker(); hideToast(); syncLabels();
    }
    g.point = bounds(g.initial.x + p.x - g.origin.x, g.initial.y + p.y - g.origin.y);
    const dx = p.x - g.previous.x, dy = p.y - g.previous.y, elapsed = Math.max(12, e.timeStamp - g.lastAt);
    if (!motion.matches) {
      const wave = waves[g.index];
      wave.speed = clamp(wave.speed - dx / elapsed * 4.8 + dy / elapsed * 1.9, -12, 12);
      wave.tilt = lerp(wave.tilt, clamp(dx / elapsed * .14, -.25, .25), .74);
    }
    g.previous = p; g.lastAt = e.timeStamp;
    const target = targetAt(g.point, p, g.index);
    if (target !== g.target || !g.hinted) {
      g.hinted = true; g.target = target;
      const full = target !== null && volume(state.cups[target].parts) >= CAPACITY - .001;
      status(target === null ? '移动量杯中…' : full ? `${target + 1} 号杯已满。` : `准备倒入 ${target + 1} 号杯。`);
    }
    schedule();
  }
  function parkedAt(point, from) {
    const clear = p => state.cups.every((_, i) => {
      if (i === from) return true;
      const other = position(i);
      return Math.abs(p.x - other.x) >= size.w * .95 || Math.abs(p.y - other.y) >= size.h * .96 + 15;
    });
    if (clear(point)) return point;
    let best = null;
    for (let ring = 1; ring <= 9 && !best; ring++) {
      for (let j = 0; j < 16; j++) {
        const a = j * Math.PI / 8;
        const p = bounds(point.x + Math.cos(a) * ring * 9, point.y + Math.sin(a) * ring * 9);
        if (clear(p) && (!best || dist(point, p) < dist(point, best))) best = p;
      }
    }
    return best || position(from);
  }
  function release(e) {
    const g = grab;
    if (!g || e.pointerId !== g.id) return;
    if (g.moving || dist(local(e), g.origin) >= 6) move(e);
    grab = null;
    if (!g.moving) { syncLabels(); choose(g.index); return; }
    if (g.target !== null) { beginPour(g.index, g.target, g.point, g.initial); return; }
    const parked = parkedAt(g.point, g.index);
    if (dist(parked, g.initial) > 1) {
      checkpoint(); state.cups[g.index].pos = { x: parked.x / w, y: parked.y / h };
    }
    status(`${g.index + 1} 号杯已放下。`); syncLabels(); schedule();
  }
  function abort(e) {
    if (!grab || e.pointerId !== grab.id) return;
    grab = null; status(idle); syncLabels(); schedule();
  }

  function beginPour(from, target, initial = position(from), origin = position(from)) {
    selected = null;
    const source = state.cups[from].parts, destination = state.cups[target].parts;
    const changes = transfer(source, destination);
    if (!changes) { status(`${target + 1} 号杯装满了。`); syncLabels(); schedule(); return; }
    const a = describe(source), b = describe(destination), result = describe(changes.combined);
    checkpoint(); hideToast();
    const receiver = position(target);
    const side = receiver.x < size.w * 1.24 ? 1 : receiver.x > w - size.w * 1.24 ? -1 : origin.x > receiver.x ? 1 : -1;
    const mixing = volume(destination) > .001 && (a.name !== b.name || a.rgb.some((c,i) => Math.abs(c - b.rgb[i]) > 3));
    pouring = { from, target, initial, side, a, b, result, changes, mixing,
      originalFrom: volume(source), originalTarget: volume(destination), started: performance.now(),
      short: motion.matches, stage: '' };
    syncLabels(); schedule();
  }
  function finishPour(p, now) {
    state.cups[p.from].parts = p.changes.rest;
    state.cups[p.target].parts = p.changes.combined;
    pouring = null;
    if (!motion.matches) waves[p.target].speed = 1.5;
    if (p.mixing) {
      state.records.unshift({ a: p.a, b: p.b, result: p.result, target: p.target });
      syncRecords(); discover(p, now);
    } else status(`${p.target + 1} 号杯现在装有${p.result.name}。`);
    syncLabels();
  }
  function pourFrame(p, now, views) {
    const t = now - p.started;
    const timing = p.short ? [70, 330, 430, 560] : [410, 1230, 1500, p.mixing ? 2750 : 1990];
    if (t >= timing[3]) { finishPour(p, now); return null; }
    const [start, stop, settle, end] = timing;
    const stage = t < start ? '准备倾倒…' : t < stop ? '正在倒水…' : p.mixing ? '两种颜色正在慢慢融合…' : '水面正在平静下来…';
    if (stage !== p.stage) { p.stage = stage; status(stage); }
    const to = views[p.target], from = views[p.from];
    const travel = smooth(phase(t, 0, start)), back = smooth(phase(t, stop, p.short ? end : 1820));
    const tilt = -p.side * (p.short ? .46 : 1.05) * travel * (1 - smooth(phase(t, stop, settle)));
    const sn = Math.sin(tilt), cs = Math.cos(tilt), rimX = -p.side * size.w * .43, rimY = -size.h * .40;
    const ox = rimX * cs - rimY * sn, oy = rimX * sn + rimY * cs;
    const aimX = to.x + p.side * size.w * .13;
    const lipY = to.y - size.h * (.43 + (to.y > size.h ? .33 : .15));
    const approach = { x: aimX - ox + p.side * size.w * .29 * (1 - travel), y: Math.max(size.h * .17, lipY - oy) };
    from.x = lerp(lerp(p.initial.x, approach.x, travel), from.x, back);
    from.y = lerp(lerp(p.initial.y, approach.y, travel), from.y, back);
    from.tilt = tilt; from.raised = true;
    const delivered = smooth(phase(t, start, stop));
    from.level = p.originalFrom - p.changes.amount * delivered;
    to.level = p.originalTarget + p.changes.amount * delivered;
    const diffusion = smooth(phase(t, start + (p.short ? 20 : 150), end));
    to.rgb = p.mixing ? color(p.b.rgb, p.result.rgb, diffusion) : p.result.rgb;
    if (!p.short && delivered > 0) {
      to.wave = .57 * (1 - smooth(phase(t, stop, end)));
      if (p.mixing) to.mixing = { incoming:p.a.rgb, original:p.b.rgb, progress:diffusion, direction:p.side, hit:delivered };
    }
    if (t <= start || t >= stop || p.short) return null;
    const impact = to.y + size.h * Math.max(-.34, .44 - .78 * to.level / CAPACITY);
    return { start: { x: from.x + ox, y: from.y + oy }, end: { x: aimX, y: impact }, rgb: p.a.rgb, progress: phase(t, start, stop) };
  }

  function render(now) {
    raf = 0;
    if (!homes.length || document.hidden) return;
    const dt = clamp((now - (last || now - 16)) / 1000, .008, .033);
    last = now;
    const clock = motion.matches ? 0 : now / 1000;
    const views = state.cups.map(({ parts }, i) => {
      const wave = waves[i], held = grab?.moving && grab.index === i;
      wave.speed += (-wave.displacement * 99 - wave.speed * 5) * dt;
      wave.displacement = clamp(wave.displacement + wave.speed * dt, -1.15, 1.15);
      wave.tilt *= Math.exp(-dt * (held ? 5 : 11));
      return { ...(held ? grab.point : position(i)), ...size, index: i, level: volume(parts), rgb: describe(parts).rgb,
        tilt: motion.matches ? 0 : wave.tilt, wave: motion.matches ? 0 : wave.displacement, clock,
        highlight: selected === i || grab?.target === i || pouring?.target === i,
        raised: held, glow: 0 };
    });
    const transferFrame = pouring ? pourFrame(pouring, now, views) : null;
    const order = views.filter(v => !v.raised).concat(views.filter(v => v.raised));
    if (effect) {
      const t = phase(now, effect.started, effect.started + 950);
      if (t >= 1) effect = null;
      else views[effect.index].glow = (1 - t) * .7;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    backdrop(ctx, w, h, homes, size, clock);
    for (const v of order) cup(ctx, v);
    if (transferFrame) stream(ctx, transferFrame.start, transferFrame.end, transferFrame.rgb, transferFrame.progress, clock);
    if (effect) {
      const view = views[effect.index];
      sparkle(ctx, view.x, view.y - size.h * .34, effect.rgb, phase(now, effect.started, effect.started + 950));
    }
    order.forEach((v, z) => {
      const b = buttons[v.index];
      const hitW = Math.max(44, size.w * .94), hitH = Math.max(44, size.h * .96);
      b.style.width = `${hitW}px`; b.style.height = `${hitH}px`;
      b.style.transform = `translate(${v.x - hitW / 2}px,${v.y - hitH / 2}px)`;
      b.style.zIndex = z + 1;
      b.classList.toggle('is-held', grab?.moving && grab.index === v.index);
      b.classList.toggle('is-target', grab?.target === v.index);
      b.classList.toggle('moving', v.raised && !grab);
      b.dataset.level = String(Math.round(v.level * 100) / 100);
    });
    if (pouring || effect || !motion.matches && views.some(c => c.level > .05) || views.some((v,i) => Math.abs(v.level - volume(state.cups[i].parts)) > .001)) schedule();
  }
  function schedule() { if (!raf && !document.hidden) raf = requestAnimationFrame(render); }

  pigments.forEach(({ name, rgb }, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch';
    b.innerHTML = `<i style="--color:${css(rgb)}" aria-hidden="true"></i><span>${name}</span>`;
    b.addEventListener('click', () => addPigment(i)); $('swatches').append(b);
  });
  $('closePicker').addEventListener('click', () => { closePicker(true); status(idle); });
  document.addEventListener('pointerdown', e => {
    if (open !== null && !picker.contains(e.target) && !e.target.closest('.cup')) { closePicker(); status(idle); }
    if (!grab && !pouring && selected !== null && !e.target.closest('.cup')) { selected = null; syncLabels(); status(idle); schedule(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open !== null) { e.preventDefault(); closePicker(true); status(idle); }
    else if (e.key === 'Escape' && selected !== null) { selected = null; syncLabels(); status(idle); schedule(); }
  });
  function restore(next, message) {
    closePicker(); hideToast(); selected = null; state = next;
    waves.forEach(wave => Object.assign(wave, { displacement:0, speed:0, tilt:0 }));
    status(message); syncLabels(); syncRecords(); schedule();
  }
  $('undo').addEventListener('click', () => { if (!grab && !pouring && history.length) restore(history.pop(), '已撤销上一步。'); });
  $('reset').addEventListener('click', () => {
    if (grab || pouring) return;
    checkpoint(); restore(newState(), '七只杯子已清空。');
  });
  new ResizeObserver(resize).observe(arena);
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  syncLabels(); syncRecords(); resize();
})();
