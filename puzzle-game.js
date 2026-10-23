(() => {
  // A jigsaw for small hands: pieces lie around the board at their real size, can be dropped
  // anywhere, click into place on their own spot and come back when tried in the wrong spot.
  class PuzzleGame {
    constructor(canvas, { onComplete = () => {}, onMiss = () => {}, onPlace = () => {} } = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.onComplete = onComplete; this.onMiss = onMiss; this.onPlace = onPlace;
      this.running = false; this.raf = 0; this.obstacles = []; this.pieces = []; this.dpr = 1; this.width = 0; this.height = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement);
      this.resize();
      canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
      canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
      canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
      canvas.addEventListener('pointercancel', (event) => this.pointerUp(event));
    }

    // Rectangles (canvas CSS pixels) covered by the page, e.g. the prompt card.
    setObstacles(rects) { this.obstacles = rects; }

    resize() {
      const box = this.canvas.parentElement.getBoundingClientRect(); this.width = box.width; this.height = box.height;
      if (this.width < 100 || this.height < 100) return; // hidden: wait until the game screen is shown
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
      this.onResize?.();
      if (this.pieces.length) this.arrange(false);
      this.render(performance.now() / 1000);
    }

    start(item, { columns = 3, rows = 2 } = {}) {
      this.item = item; this.cols = columns; this.rows = rows; this.hintId = null; this.complete = false; this.active = null;
      const flagsX = Array.from({ length: rows }, () => Array.from({ length: columns - 1 }, () => (Math.random() < .5 ? 1 : -1)));
      const flagsY = Array.from({ length: rows - 1 }, () => Array.from({ length: columns }, () => (Math.random() < .5 ? 1 : -1)));
      this.pieces = [];
      for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
        this.pieces.push({ id: `${row}-${col}`, row, col, placed: false, scale: 1,
          edges: [row === 0 ? 0 : -flagsY[row - 1][col], col === columns - 1 ? 0 : flagsX[row][col], row === rows - 1 ? 0 : flagsY[row][col], col === 0 ? 0 : -flagsX[row][col - 1]] });
      }
      this.pieces.sort(() => Math.random() - .5);
      this.resize();
      const image = item.image;
      const ready = () => { this.arrange(true); this.render(performance.now() / 1000); };
      if (image?.complete && image.naturalWidth) ready(); else image?.addEventListener('load', ready, { once: true });
      this.arrange(true);
      this.resume();
    }

    aspect() { const image = this.item?.image; return image?.naturalWidth ? image.naturalWidth / image.naturalHeight : 1; }

    // The board shrinks just enough for the loose pieces to stay big (close to their real size).
    arrange(reset) {
      for (const minScale of [.85, .75, .65, .55, .45, .3]) {
        for (const share of [.7, .64, .58, .52, .46, .4]) {
          this.layout(share);
          if (this.scatter(reset, minScale)) return;
        }
      }
    }

    // Board just right of the prompt card, model under the card, pieces in the space left.
    layout(share = .6) {
      if (this.width < 100 || this.height < 100) return;
      const W = this.width; const H = this.height; const card = this.obstacles[0] || { right: W * .3, bottom: H * .45 };
      const top = 64; const left = card.right + 22;
      const maxW = (W - left - 16) * share; const maxH = (H - top - 16) * .86;
      let bw = Math.min(maxW, maxH * this.aspect()); let bh = bw / this.aspect();
      if (bh > maxH) { bh = maxH; bw = bh * this.aspect(); }
      this.board = { x: left + 14, y: top + (H - top - 16 - bh) / 2, w: bw, h: bh };
      this.tileW = bw / this.cols; this.tileH = bh / this.rows; this.tab = Math.min(this.tileW, this.tileH) * .2;
      const modelW = Math.min(card.right - 16, 240); const modelH = modelW / this.aspect();
      this.model = { x: 16, y: card.bottom + 18, w: modelW, h: modelH };
    }

    // Spread the loose pieces over the free space, as big as the space allows (down to minScale).
    scatter(reset = false, minScale = .3) {
      const loose = this.pieces.filter((piece) => !piece.placed && (reset || !piece.moved));
      if (!loose.length) return true;
      if (!this.board || !(this.tileW > 10 && this.tileH > 10)) return false;
      const blocked = [...this.obstacles, { left: 0, top: 0, right: this.width, bottom: 58 },
        { left: this.board.x - this.tab - 14, top: this.board.y - this.tab - 14, right: this.board.x + this.board.w + this.tab + 14, bottom: this.board.y + this.board.h + this.tab + 14 },
        { left: this.model.x, top: this.model.y, right: this.model.x + this.model.w, bottom: this.model.y + this.model.h + 24 }];
      for (let scale = 1; scale >= minScale; scale *= .9) {
        const cw = (this.tileW + this.tab * 2) * scale + 10; const ch = (this.tileH + this.tab * 2) * scale + 10;
        const cells = [];
        for (let y = 60; y + ch <= this.height - 6; y += ch) for (let x = 8; x + cw <= this.width - 6; x += cw) {
          const cell = { left: x, top: y, right: x + cw, bottom: y + ch };
          if (blocked.every((b) => cell.right <= b.left || cell.left >= b.right || cell.bottom <= b.top || cell.top >= b.bottom)) cells.push(cell);
        }
        if (cells.length < loose.length) continue;
        const chosen = cells.sort(() => Math.random() - .5).slice(0, loose.length);
        loose.forEach((piece, i) => {
          const cell = chosen[i];
          piece.homeX = (cell.left + cell.right) / 2; piece.homeY = (cell.top + cell.bottom) / 2; piece.homeScale = scale;
          if (reset || !piece.dragging) { piece.x = piece.homeX; piece.y = piece.homeY; piece.scale = scale; }
        });
        return true;
      }
      return false;
    }

    pause() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    resume() { if (!this.running) { this.running = true; this.raf = requestAnimationFrame((t) => this.frame(t)); } }
    frame(time) { if (!this.running) return; this.raf = requestAnimationFrame((t) => this.frame(t)); this.update(); this.render(time / 1000); }

    // Pieces glide towards where they belong (their spot, or back to their place on the table).
    update() {
      for (const piece of this.pieces) {
        if (piece.dragging) continue;
        const goal = piece.placed ? this.slotCenter(piece) : { x: piece.homeX, y: piece.homeY };
        const scale = piece.placed ? 1 : piece.homeScale ?? 1;
        piece.x += (goal.x - piece.x) * .25; piece.y += (goal.y - piece.y) * .25; piece.scale += (scale - piece.scale) * .25;
      }
    }

    slotCenter(piece) { return { x: this.board.x + (piece.col + .5) * this.tileW, y: this.board.y + (piece.row + .5) * this.tileH }; }

    path(ctx, x, y, w, h, edges) {
      const tab = Math.min(w, h) * .18; const shoulder = Math.min(w, h) * .12; const inset = Math.min(w, h) * .31;
      const side = (x1, y1, x2, y2, direction, sign) => {
        const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1); const len = Math.hypot(x2 - x1, y2 - y1);
        if (!sign) { ctx.lineTo(x2, y2); return; }
        const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
        const nx = horizontal ? 0 : direction * sign; const ny = horizontal ? direction * sign : 0;
        const cx = x1 + ux * len * .5; const cy = y1 + uy * len * .5;
        ctx.lineTo(cx - ux * shoulder, cy - uy * shoulder);
        ctx.bezierCurveTo(cx - ux * tab, cy - uy * tab, cx - ux * tab + nx * inset, cy - uy * tab + ny * inset, cx + nx * inset, cy + ny * inset);
        ctx.bezierCurveTo(cx + ux * tab + nx * inset, cy + uy * tab + ny * inset, cx + ux * tab, cy + uy * tab, cx + ux * shoulder, cy + uy * shoulder);
        ctx.lineTo(x2, y2);
      };
      ctx.beginPath(); ctx.moveTo(x, y);
      side(x, y, x + w, y, -1, edges[0]);
      side(x + w, y, x + w, y + h, 1, edges[1]);
      side(x + w, y + h, x, y + h, 1, edges[2]);
      side(x, y + h, x, y, -1, edges[3]);
      ctx.closePath();
    }

    // Draws one piece of the picture at the given centre and scale.
    drawCut(ctx, piece, cx, cy, scale, alpha = 1) {
      const image = this.item?.image; const w = this.tileW * scale; const h = this.tileH * scale; const x = cx - w / 2; const y = cy - h / 2;
      ctx.save(); ctx.globalAlpha = alpha;
      this.path(ctx, x, y, w, h, piece.edges); ctx.clip();
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, x - piece.col * w, y - piece.row * h, this.board.w * scale, this.board.h * scale);
      else { ctx.fillStyle = '#e7ede1'; ctx.fillRect(x - this.tab, y - this.tab, w + this.tab * 2, h + this.tab * 2); }
      ctx.restore();
      this.path(ctx, x, y, w, h, piece.edges);
      return { x, y, w, h };
    }

    render(time) {
      const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
      if (!this.pieces.length || !this.board) return;
      const image = this.item?.image; const b = this.board; const m = this.model;
      // Model
      ctx.save(); ctx.shadowColor = 'rgba(45,63,44,.2)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.beginPath(); ctx.roundRect(m.x - 8, m.y - 8, m.w + 16, m.h + 34, 18); ctx.fillStyle = 'rgba(255,253,240,.92)'; ctx.fill(); ctx.restore();
      if (image?.complete && image.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.roundRect(m.x, m.y, m.w, m.h, 10); ctx.clip(); ctx.drawImage(image, m.x, m.y, m.w, m.h); ctx.restore(); }
      ctx.fillStyle = '#6f8a76'; ctx.font = '900 11px "Avenir Next", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LE MODÈLE', m.x + m.w / 2, m.y + m.h + 18);
      // Board: empty spots are plain outlines; the picture only shows once a piece is in place.
      ctx.save(); ctx.shadowColor = 'rgba(55,73,47,.22)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
      ctx.beginPath(); ctx.roundRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24, 20); ctx.fillStyle = 'rgba(250,246,230,.82)'; ctx.fill(); ctx.restore();
      for (const piece of this.pieces) {
        const slot = this.slotCenter(piece);
        if (piece.placed && !piece.dragging && Math.hypot(piece.x - slot.x, piece.y - slot.y) < 2) continue;
        const hinted = piece.id === this.hintId;
        if (hinted) this.drawCut(ctx, piece, slot.x, slot.y, 1, .35);
        this.path(ctx, slot.x - this.tileW / 2, slot.y - this.tileH / 2, this.tileW, this.tileH, piece.edges);
        ctx.save(); ctx.setLineDash([7, 7]); ctx.lineWidth = hinted ? 6 : 2;
        ctx.strokeStyle = hinted ? `rgba(245,182,68,${.75 + Math.sin(time * 5) * .2})` : 'rgba(80,110,88,.45)'; ctx.stroke(); ctx.restore();
      }
      const settled = this.pieces.filter((piece) => piece.placed && !piece.dragging);
      for (const piece of settled) { this.drawCut(ctx, piece, piece.x, piece.y, piece.scale); ctx.lineWidth = this.complete ? 0 : 1.5; ctx.strokeStyle = 'rgba(255,255,245,.8)'; if (!this.complete) ctx.stroke(); }
      if (this.complete) { ctx.save(); ctx.shadowColor = '#f4c247'; ctx.shadowBlur = 30; ctx.lineWidth = 6; ctx.strokeStyle = `rgba(255,214,110,${.6 + Math.sin(time * 4) * .3})`; ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6); ctx.restore(); }
      // Loose pieces, the one in hand on top.
      for (const piece of this.pieces.filter((item) => !item.placed || item.dragging)) {
        const scale = piece.scale * (piece.dragging ? 1.06 : 1); const w = this.tileW * scale; const h = this.tileH * scale;
        ctx.save(); ctx.shadowColor = 'rgba(40,55,40,.32)'; ctx.shadowBlur = piece.dragging ? 22 : 12; ctx.shadowOffsetY = piece.dragging ? 10 : 5;
        this.path(ctx, piece.x - w / 2, piece.y - h / 2, w, h, piece.edges); ctx.fillStyle = '#fffdf5'; ctx.fill(); ctx.restore();
        this.drawCut(ctx, piece, piece.x, piece.y, scale);
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,250,.95)'; ctx.stroke();
      }
    }

    coords(event) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    pieceAt(p) {
      for (let i = this.pieces.length - 1; i >= 0; i -= 1) {
        const piece = this.pieces[i]; if (piece.placed) continue;
        const hw = (this.tileW / 2 + this.tab) * piece.scale + 10; const hh = (this.tileH / 2 + this.tab) * piece.scale + 10;
        if (Math.abs(p.x - piece.x) <= hw && Math.abs(p.y - piece.y) <= hh) return piece;
      }
      return null;
    }
    pointerDown(event) {
      if (this.complete) return;
      const p = this.coords(event); const piece = this.pieceAt(p);
      if (!piece) return;
      this.canvas.setPointerCapture?.(event.pointerId); this.active = piece; this.offset = { x: p.x - piece.x, y: p.y - piece.y };
      piece.dragging = true; this.lastTouched = piece;
      this.pieces.splice(this.pieces.indexOf(piece), 1); this.pieces.push(piece);
      event.preventDefault();
    }
    pointerMove(event) {
      if (!this.active) return;
      const p = this.coords(event); const piece = this.active;
      piece.x = p.x - this.offset.x; piece.y = p.y - this.offset.y;
      // Over the board the piece takes its real size, so it can be compared with the spots.
      const overBoard = this.overBoard(piece); piece.scale += ((overBoard ? 1 : piece.homeScale ?? 1) - piece.scale) * .3;
    }
    overBoard(piece) { const b = this.board; return piece.x > b.x - this.tab && piece.x < b.x + b.w + this.tab && piece.y > b.y - this.tab && piece.y < b.y + b.h + this.tab; }
    pointerUp() {
      const piece = this.active; if (!piece) return;
      this.active = null; piece.dragging = false;
      const slot = this.slotCenter(piece);
      if (Math.hypot(piece.x - slot.x, piece.y - slot.y) < Math.min(this.tileW, this.tileH) * .45) {
        piece.placed = true; if (this.hintId === piece.id) this.hintId = null; this.onPlace(piece);
        if (this.pieces.every((item) => item.placed)) { this.complete = true; setTimeout(() => this.onComplete(this.item), 600); }
      } else if (this.overBoard(piece)) {
        // Tried on another spot: it slides back to its place on the table.
        this.onMiss(piece);
      } else {
        // Dropped next to the board: it stays exactly where the child put it.
        piece.homeX = Math.max(20, Math.min(this.width - 20, piece.x)); piece.homeY = Math.max(70, Math.min(this.height - 20, piece.y)); piece.moved = true;
      }
    }
    hint() {
      const piece = (this.lastTouched && !this.lastTouched.placed && this.lastTouched) || this.pieces.find((item) => !item.placed);
      if (!piece) return;
      this.hintId = piece.id; setTimeout(() => { if (this.hintId === piece.id) this.hintId = null; }, 3500);
    }
    destroy() { this.pause(); this.resizeObserver.disconnect(); }
  }

  window.PuzzleGame = PuzzleGame;
})();
