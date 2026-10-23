(() => {
  const TAU = Math.PI * 2;

  class BubbleEntity {
    constructor(options) {
      Object.assign(this, options);
      this.phase = Math.random() * TAU;
      this.alpha = 1;
      this.scale = 0;
      this.born = performance.now() / 1000 + Math.random() * .25;
    }
  }

  class GameEngine {
    constructor(canvas, { onTap = () => {} } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onTap = onTap;
      this.entities = [];
      this.items = [];
      this.obstacles = [];
      this.running = false;
      this.raf = null;
      this.lastFrame = 0;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.ambience = 'motes';
      this.droplets = [];
      this.particles = Array.from({ length: 34 }, (_, i) => ({
        x: (i * 0.61803398875) % 1, y: (i * 0.37139067635) % 1,
        size: .6 + (i % 5) * .25, phase: i * 1.71, speed: .5 + (i % 7) / 7,
      }));
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.resize();
      canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
      canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
      canvas.addEventListener('pointercancel', () => { this.activeItem = null; });
      canvas.addEventListener('keydown', (event) => this.keyDown(event));
      this.start();
    }

    // Scene setup ------------------------------------------------------------

    setAmbience(kind) { this.ambience = kind || 'motes'; }

    // Rectangles (canvas CSS pixels) that bubbles must stay clear of, e.g. the prompt card.
    setObstacles(rects) { this.obstacles = rects; }

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const changed = Math.abs(rect.width - this.width) > 2 || Math.abs(rect.height - this.height) > 2;
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      if (changed && this.items.length) { this.onResize?.(); this.layout(); }
      if (!this.running) this.render(performance.now() / 1000);
    }

    bounds() {
      return { left: 14, top: Math.min(78, this.height * .17), right: this.width - 14, bottom: this.height - 14 };
    }

    // Free area once the obstacles are removed, used to size the bubbles.
    freeArea() {
      const b = this.bounds(); const area = (b.right - b.left) * (b.bottom - b.top);
      return area - this.obstacles.reduce((sum, o) => sum + Math.max(0, Math.min(o.right, b.right) - Math.max(o.left, b.left)) * Math.max(0, Math.min(o.bottom, b.bottom) - Math.max(o.top, b.top)), 0);
    }

    clearOf(x, y, r) {
      const b = this.bounds();
      if (x - r < b.left || x + r > b.right || y - r < b.top || y + r > b.bottom) return false;
      return this.obstacles.every((o) => {
        const dx = Math.max(o.left - x, 0, x - o.right); const dy = Math.max(o.top - y, 0, y - o.bottom);
        return Math.hypot(dx, dy) > r + 10;
      });
    }

    setScene(items) {
      // Fresh bubbles every round: an animal seen in the previous round must not keep its faded state.
      this.items = items; this.entities = [];
      this.layout();
      this.canvas.setAttribute('aria-label', `Bulles. ${items.map((item, i) => `bulle ${i + 1}`).join(', ')}`);
    }

    // Spread the bubbles over the free space: each one takes the candidate spot farthest
    // from the others, then floats gently around that home without ever touching a neighbour.
    layout() {
      const count = Math.max(1, this.items.length); const b = this.bounds();
      let radius = Math.max(40, Math.min(128, Math.sqrt(this.freeArea() / count) * .33, (b.bottom - b.top) * .3));
      let homes = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        homes = [];
        for (let i = 0; i < count; i += 1) {
          let best = null; let bestScore = -Infinity;
          for (let c = 0; c < 140; c += 1) {
            const x = b.left + radius + Math.random() * Math.max(1, b.right - b.left - radius * 2);
            const y = b.top + radius + Math.random() * Math.max(1, b.bottom - b.top - radius * 2 - 30);
            if (!this.clearOf(x, y + 15, radius + 15)) continue;
            const nearest = homes.reduce((min, h) => Math.min(min, Math.hypot(h.x - x, h.y - y)), Infinity);
            const edge = Math.min(x - b.left, b.right - x, y - b.top, b.bottom - y) * .35;
            const score = Math.min(nearest, 1e6) + edge;
            if (score > bestScore) { bestScore = score; best = { x, y }; }
          }
          if (!best) break;
          homes.push(best);
        }
        const tight = homes.length === count && homes.every((h, i) => homes.every((o, j) => i === j || Math.hypot(h.x - o.x, h.y - o.y) > radius * 2.25));
        if (tight) break;
        radius *= .9;
      }
      const previous = new Map(this.entities.map((entity) => [entity.id, entity]));
      this.entities = this.items.map((item, i) => {
        const home = homes[i] || { x: b.left + radius + i * radius * 2.2, y: (b.top + b.bottom) / 2 };
        const entity = previous.get(item.id) || new BubbleEntity({ id: item.id, item });
        const gap = homes.reduce((min, h) => (h === home ? min : Math.min(min, Math.hypot(h.x - home.x, h.y - home.y))), Infinity);
        Object.assign(entity, { hx: home.x, hy: home.y, radius, drift: Math.max(3, Math.min(radius * .2, (gap - radius * 2) / 2 - 4)) });
        entity.x ??= home.x; entity.y ??= home.y;
        return entity;
      });
    }

    // Feedback ---------------------------------------------------------------

    find(id) { return this.entities.find((entity) => entity.id === id); }
    shake(id) { const e = this.find(id); if (e) e.shakeAt = performance.now() / 1000; }
    reveal(id) { const e = this.find(id); if (e) e.showLabel = true; }
    hint(id) { const e = this.find(id); if (e) e.hinted = true; }

    // Burst the bubble; returns where the photo was so the page can carry it on.
    pop(id) {
      const e = this.find(id); if (!e) return null;
      const now = performance.now() / 1000; e.poppedAt = now; e.disabled = true;
      for (const other of this.entities) if (other !== e) { other.dimmed = true; other.disabled = true; }
      for (let i = 0; i < 26; i += 1) {
        const angle = (i / 26) * TAU + Math.random() * .2; const speed = e.radius * (1.6 + Math.random() * 1.8);
        this.droplets.push({ x: e.x + Math.cos(angle) * e.radius, y: e.y + Math.sin(angle) * e.radius, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: now, life: .55 + Math.random() * .35, size: 2 + Math.random() * 4 });
      }
      const rect = this.canvas.getBoundingClientRect();
      return { x: rect.left + e.x, y: rect.top + e.y, radius: e.radius * .9 };
    }

    // Loop -------------------------------------------------------------------

    pause() { this.running = false; if (this.raf !== null) cancelAnimationFrame(this.raf); this.raf = null; }
    resume() { if (!this.running) { this.running = true; this.lastFrame = 0; this.raf = requestAnimationFrame((time) => this.frame(time)); } }
    start() { this.resume(); }

    coords(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    hitTest(x, y) {
      for (let index = this.entities.length - 1; index >= 0; index -= 1) {
        const item = this.entities[index];
        if (!item.disabled && Math.hypot(x - item.x, y - item.y) <= item.radius * 1.1) return item;
      }
      return null;
    }

    pointerDown(event) {
      const point = this.coords(event); const item = this.hitTest(point.x, point.y);
      if (!item) return;
      this.activeItem = item; this.downPoint = point; item.pressed = true; event.preventDefault();
    }

    pointerUp(event) {
      const item = this.activeItem; if (!item) return;
      item.pressed = false; this.activeItem = null;
      const point = this.coords(event);
      if (Math.hypot(point.x - this.downPoint.x, point.y - this.downPoint.y) < 40 && !item.disabled) this.onTap(item.item);
    }

    keyDown(event) {
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < this.entities.length && !this.entities[index].disabled) {
        this.onTap(this.entities[index].item); event.preventDefault();
      }
    }

    frame(time) {
      if (!this.running) return;
      const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, .05) : 0;
      this.lastFrame = time;
      // Schedule the next frame first, so a drawing error can never freeze the game.
      this.raf = requestAnimationFrame((next) => this.frame(next));
      this.update(dt, time / 1000);
      this.render(time / 1000);
    }

    update(dt, now) {
      for (const e of this.entities) {
        const t = now + e.phase * 3;
        const tx = e.hx + Math.sin(t * .42 + e.phase) * e.drift + Math.sin(t * .17) * e.drift * .35;
        const ty = e.hy + Math.cos(t * .37 + e.phase * 1.3) * e.drift;
        e.x += (tx - e.x) * Math.min(1, dt * 3); e.y += (ty - e.y) * Math.min(1, dt * 3);
        const age = now - e.born; e.scale = age <= 0 ? 0 : Math.min(1, 1 - Math.pow(1 - Math.min(1, age / .55), 3) * 1) * (1 + Math.sin(Math.min(1, age / .55) * Math.PI) * .08);
        const target = e.poppedAt ? 0 : e.dimmed ? .28 : 1;
        e.alpha += (target - e.alpha) * Math.min(1, dt * (e.poppedAt ? 14 : 4));
      }
      this.droplets = this.droplets.filter((d) => now - d.born < d.life);
      for (const d of this.droplets) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= .9; d.vy = d.vy * .9 + 60 * dt; }
    }

    // Drawing ------------------------------------------------------------------

    // The world's landscape is painted (softly blurred) by the page behind this transparent canvas.
    drawBackground() { this.ctx.clearRect(0, 0, this.width, this.height); }

    drawAmbience(time) {
      const ctx = this.ctx; const W = this.width; const H = this.height;
      ctx.save();
      for (const p of this.particles) {
        const wrap = (v) => ((v % 1) + 1) % 1;
        if (this.ambience === 'snow') {
          const y = wrap(p.y + time * .035 * p.speed) * (H + 20) - 10; const x = wrap(p.x + Math.sin(time * .5 + p.phase) * .015) * W;
          ctx.beginPath(); ctx.arc(x, y, 1.6 + p.size * 2.2, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fill();
        } else if (this.ambience === 'bubbles') {
          const y = (1 - wrap(p.y + time * .04 * p.speed)) * (H + 30) - 15; const x = wrap(p.x) * W + Math.sin(time * 1.4 + p.phase) * 6;
          ctx.beginPath(); ctx.arc(x, y, 2 + p.size * 3, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.3; ctx.stroke();
          ctx.beginPath(); ctx.arc(x - p.size, y - p.size, .8 + p.size * .6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
        } else if (this.ambience === 'leaves') {
          if (p.speed < .55) continue;
          const y = wrap(p.y + time * .025 * p.speed) * (H + 30) - 15; const x = wrap(p.x + Math.sin(time * .4 + p.phase) * .03) * W;
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * .9 + p.phase) * 1.2); ctx.scale(1 + p.size, 1 + p.size);
          ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, TAU); ctx.fillStyle = p.phase % 2 > 1 ? 'rgba(214,150,62,.75)' : 'rgba(126,163,76,.75)'; ctx.fill(); ctx.restore();
        } else if (this.ambience === 'fireflies') {
          const x = wrap(p.x + Math.sin(time * .2 + p.phase) * .03) * W; const y = wrap(p.y + Math.cos(time * .17 + p.phase) * .03) * H;
          const glow = (Math.sin(time * 1.6 + p.phase * 2) + 1) / 2;
          ctx.beginPath(); ctx.arc(x, y, 1.5 + p.size * 2, 0, TAU); ctx.fillStyle = `rgba(236,255,150,${.15 + glow * .65})`;
          ctx.shadowColor = 'rgba(236,255,150,.9)'; ctx.shadowBlur = 10 * glow; ctx.fill(); ctx.shadowBlur = 0;
        } else {
          const x = (p.x * W + Math.sin(time * .12 + p.phase) * 9) % W; const y = p.y * H + Math.cos(time * .17 + p.phase) * 8;
          ctx.beginPath(); ctx.arc(x, y, 1 + p.size * 1.6, 0, TAU); ctx.fillStyle = `rgba(255,255,239,${.2 + (Math.sin(time + p.phase) + 1) * .2})`; ctx.fill();
        }
      }
      ctx.restore();
    }

    drawBubble(e, time) {
      const ctx = this.ctx; const item = e.item;
      const r = e.radius * (e.pressed ? .95 : 1) * e.scale;
      // Skip bubbles still too small to draw (start of their entrance): arc() rejects negative radii.
      if (e.alpha < .02 || r < 6) return;
      let x = e.x; const y = e.y;
      if (e.shakeAt) { const s = time - e.shakeAt; if (s < .6) x += Math.sin(s * 42) * 9 * (1 - s / .6); }
      ctx.save(); ctx.globalAlpha = e.alpha; ctx.translate(x, y);
      if (e.hinted) {
        ctx.beginPath(); ctx.arc(0, 0, r + 12 + Math.sin(time * 3.2) * 5, 0, TAU);
        ctx.strokeStyle = `rgba(251,194,74,${.7 + Math.sin(time * 4) * .2})`; ctx.lineWidth = 9; ctx.stroke();
      }
      ctx.shadowColor = 'rgba(40,60,45,.28)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
      ctx.shadowColor = 'transparent';
      const inner = r * .9;
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, inner, 0, TAU); ctx.clip();
      if (item.kind === 'animal') this.drawPhoto(item.image, inner);
      else if (item.kind === 'color') { ctx.fillStyle = '#fffdf6'; ctx.fillRect(-inner, -inner, inner * 2, inner * 2); this.drawColor(item, inner, time, e.phase); }
      else if (item.kind === 'number') { ctx.fillStyle = '#fffdf6'; ctx.fillRect(-inner, -inner, inner * 2, inner * 2); this.drawNumber(item, inner, e.phase); }
      // Soap-film sheen on top of the picture.
      const sheen = ctx.createRadialGradient(-inner * .35, -inner * .45, inner * .05, 0, 0, inner * 1.05);
      sheen.addColorStop(0, 'rgba(255,255,255,.34)'); sheen.addColorStop(.45, 'rgba(255,255,255,0)'); sheen.addColorStop(.85, 'rgba(190,230,255,.08)'); sheen.addColorStop(1, 'rgba(255,255,255,.35)');
      ctx.fillStyle = sheen; ctx.fillRect(-inner, -inner, inner * 2, inner * 2);
      ctx.restore();
      const rim = ctx.createLinearGradient(-r, -r, r, r);
      rim.addColorStop(0, 'rgba(255,255,255,.98)'); rim.addColorStop(.5, 'rgba(214,240,255,.9)'); rim.addColorStop(1, 'rgba(255,236,214,.95)');
      ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, TAU); ctx.strokeStyle = rim; ctx.lineWidth = r * .1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-r * .5, -r * .56, r * .16, r * .055, -.7, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
      ctx.beginPath(); ctx.arc(r * .55, -r * .36, r * .05, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
      ctx.restore();
      if (e.showLabel) this.drawLabel(item.short, x, y + r + 16, time, e);
    }

    drawPhoto(image, r) {
      const ctx = this.ctx;
      if (!image?.complete || !image.naturalWidth) { ctx.fillStyle = '#e9efe2'; ctx.fillRect(-r, -r, r * 2, r * 2); return; }
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, -r, -r, r * 2, r * 2);
    }

    drawColor(item, r, time, phase) {
      const ctx = this.ctx; const size = r * 1.25; const bob = Math.sin(time * 1.4 + phase) * .025;
      ctx.save(); ctx.rotate(Math.sin(time * .7 + phase) * .06); ctx.scale(1 + bob, 1 - bob);
      ctx.shadowColor = 'rgba(56,68,46,.22)'; ctx.shadowBlur = 21; ctx.shadowOffsetY = 7;
      const ball = ctx.createRadialGradient(-size * .31, -size * .38, size * .04, size * .1, size * .13, size * .86);
      ball.addColorStop(0, '#ffffff'); ball.addColorStop(.19, item.value); ball.addColorStop(.72, item.value); ball.addColorStop(1, '#5c6154');
      ctx.beginPath(); ctx.arc(0, 0, size * .5, 0, TAU); ctx.fillStyle = ball; ctx.fill(); ctx.shadowColor = 'transparent';
      if (item.id === 'white') { ctx.lineWidth = Math.max(2, size * .026); ctx.strokeStyle = 'rgba(143,116,65,.58)'; ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(-size * .15, -size * .28, size * .19, size * .065, -.55, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.77)'; ctx.fill();
      ctx.restore();
    }

    drawNumber(item, r, phase) {
      const ctx = this.ctx; const color = item.tint || '#548c72';
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `1000 ${r * (item.value > 9 ? 1.08 : 1.38)}px "Avenir Next", "Trebuchet MS", sans-serif`;
      ctx.lineJoin = 'round'; ctx.lineWidth = r * .11; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.strokeText(String(item.value), 0, -r * .08);
      ctx.fillText(String(item.value), 0, -r * .08);
      const dots = Math.min(10, Number(item.value)); const dotR = Math.max(2.2, r * .05); const cols = 5;
      for (let i = 0; i < dots; i += 1) {
        const row = Math.floor(i / cols); const col = i % cols; const count = Math.min(cols, dots - row * cols);
        ctx.beginPath(); ctx.arc((col - (count - 1) / 2) * r * .17, r * .55 + row * r * .14, dotR, 0, TAU); ctx.fillStyle = color; ctx.fill();
      }
    }

    drawLabel(text, x, y, time, e) {
      if (!text) return;
      const ctx = this.ctx; const fontSize = Math.max(14, Math.min(20, this.height * .04));
      ctx.save(); ctx.globalAlpha = e.alpha; ctx.font = `800 ${fontSize}px "Avenir Next", "Trebuchet MS", sans-serif`;
      const w = ctx.measureText(text).width + 34; const h = fontSize + 18; const by = Math.min(y + Math.sin(time * .9 + e.phase) * 1.8, this.height - h / 2 - 4);
      ctx.shadowColor = 'rgba(59,74,50,.2)'; ctx.shadowBlur = 11; ctx.shadowOffsetY = 4;
      ctx.fillStyle = 'rgba(255,254,246,.96)'; ctx.beginPath(); ctx.roundRect(x - w / 2, by - h / 2, w, h, h / 2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.fillStyle = '#3f5d4b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, by + 1);
      ctx.restore();
    }

    drawDroplets(time) {
      const ctx = this.ctx;
      for (const d of this.droplets) {
        const p = (time - d.born) / d.life;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size * (1 - p * .6), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${.9 * (1 - p)})`; ctx.fill();
      }
      for (const e of this.entities) {
        if (!e.poppedAt) continue;
        const p = (time - e.poppedAt) / .45; if (p > 1) continue;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * (1 + p * .5), 0, TAU);
        ctx.strokeStyle = `rgba(255,255,255,${.9 * (1 - p)})`; ctx.lineWidth = 6 * (1 - p) + 1; ctx.stroke();
      }
    }

    render(time = 0) {
      const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawBackground();
      this.drawAmbience(time);
      for (const entity of this.entities) this.drawBubble(entity, time);
      this.drawDroplets(time);
    }

    tap(id) { const entity = this.find(id); if (entity && !entity.disabled) this.onTap(entity.item); }
    destroy() { this.pause(); this.resizeObserver.disconnect(); }
  }

  window.GameEngine = GameEngine;
})();
