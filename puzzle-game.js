(() => {
  class PuzzleGame {
    constructor(canvas, { onComplete = () => {}, onMiss = () => {} } = {}) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.onComplete = onComplete; this.onMiss = onMiss; this.running = false; this.raf = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(canvas.parentElement);
      this.resize();
      canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
      canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
      canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
      canvas.addEventListener('pointercancel', (event) => this.pointerUp(event));
    }

    resize() {
      const box = this.canvas.parentElement.getBoundingClientRect(); this.width = box.width; this.height = box.height;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
      this.layout(); this.render(performance.now() / 1000);
    }

    layout() {
      const h = this.height; const w = this.width;
      this.boardSize = Math.min(h * .59, w * .37);
      this.boardX = w * .36; this.boardY = h * .25; this.tile = this.boardSize / this.cols;
      this.model = { x: w * .055, y: h * .51, w: w * .235, h: h * .38 };
      this.trayX = w * .745; this.trayTile = Math.min(h * .19, w * .097);
      if (this.pieces?.length) this.pieces.forEach((piece) => {
        if (piece.placed) { piece.x = this.boardX + piece.col * this.tile; piece.y = this.boardY + piece.row * this.tile; }
        else if (!piece.dragging) {
          piece.homeX = this.trayX + (piece.trayIndex % 2) * (this.trayTile * 1.12);
          piece.homeY = this.height * .35 + Math.floor(piece.trayIndex / 2) * (this.trayTile * 1.28);
          piece.x = piece.homeX; piece.y = piece.homeY;
        }
      });
    }

    start(animal, { columns = 2, rows = 2 } = {}) {
      this.animal = animal; this.cols = columns; this.rows = rows; this.hintId = null; this.complete = false;
      const flagsX = Array.from({ length: rows }, () => Array.from({ length: columns - 1 }, () => Math.random() < .5 ? 1 : -1));
      const flagsY = Array.from({ length: rows - 1 }, () => Array.from({ length: columns }, () => Math.random() < .5 ? 1 : -1));
      this.pieces = [];
      for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
        this.pieces.push({ id: `${row}-${col}`, row, col, placed: false,
          edges: [row === 0 ? 0 : -flagsY[row - 1][col], col === columns - 1 ? 0 : flagsX[row][col], row === rows - 1 ? 0 : flagsY[row][col], col === 0 ? 0 : -flagsX[row][col - 1]],
        });
      }
      for (let i = this.pieces.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [this.pieces[i], this.pieces[j]] = [this.pieces[j], this.pieces[i]]; }
      this.layout();
      this.pieces.forEach((piece, i) => {
        piece.trayIndex = i;
        piece.homeX = this.trayX + (i % 2) * (this.trayTile * 1.12);
        piece.homeY = this.height * .35 + Math.floor(i / 2) * (this.trayTile * 1.28);
        piece.x = piece.homeX; piece.y = piece.homeY;
      });
      this.resume();
    }

    pause() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
    resume() { if (!this.running) { this.running = true; this.raf = requestAnimationFrame((t) => this.frame(t)); } }
    frame(time) { if (!this.running) return; this.raf = requestAnimationFrame((t) => this.frame(t)); this.render(time / 1000); }

    // The animal photo is square: the whole picture is the puzzle.
    animalImage() { const image = this.animal?.image; return { frame: image?.naturalWidth ? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight } : null, image }; }
    rounded(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }

    // The landscape is painted by the page behind this transparent canvas.
    backgroundDraw() { this.ctx.clearRect(0, 0, this.width, this.height); }

    path(ctx, x, y, w, h, edges) {
      const tab = Math.min(w, h) * .18; const shoulder = Math.min(w, h) * .12; const inset = Math.min(w, h) * .31;
      const side = (x1, y1, x2, y2, direction, sign) => {
        const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1); const len = Math.hypot(x2 - x1, y2 - y1);
        if (!sign) { ctx.lineTo(x2, y2); return; }
        const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
        const nx = horizontal ? 0 : direction; const ny = horizontal ? direction : 0;
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

    drawAnimalCrop(ctx, piece, x, y, size) {
      const { frame, image } = this.animalImage();
      if (!frame || !image.complete || !image.naturalWidth) return;
      const tile = size / this.cols;
      this.path(ctx, x, y, tile, tile, piece.edges); ctx.save(); ctx.clip();
      ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x - piece.col * tile, y - piece.row * tile, size, size); ctx.restore();
    }

    drawPiece(ctx, piece, now) {
      const size = this.trayTile; const artSize = size * this.cols; const tab = size * .18;
      ctx.save(); ctx.shadowColor = 'rgba(52,65,45,.24)'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 5;
      this.rounded(ctx, piece.x - tab - 6, piece.y - tab - 6, size + tab * 2 + 12, size + tab * 2 + 12, 17, '#fffdf0ee');
      ctx.shadowColor = 'transparent';
      if (piece.dragging) ctx.translate(Math.sin(now * 8) * 2, -5);
      this.drawAnimalCrop(ctx, piece, piece.x, piece.y, artSize);
      this.path(ctx, piece.x, piece.y, size, size, piece.edges);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.97)'; ctx.stroke(); ctx.restore();
    }

    drawBoard() {
      const ctx = this.ctx; const size = this.boardSize; const tile = this.tile;
      ctx.save(); ctx.shadowColor = 'rgba(55,73,47,.2)'; ctx.shadowBlur = 25; ctx.shadowOffsetY = 10;
      this.rounded(ctx, this.boardX - 13, this.boardY - 13, size + 26, size + 26, 24, 'rgba(250,245,226,.72)'); ctx.restore();
      for (const piece of this.pieces) {
        const x = this.boardX + piece.col * tile; const y = this.boardY + piece.row * tile;
        if (piece.placed) { this.drawAnimalCrop(ctx, piece, x, y, size); this.path(ctx, x, y, tile, tile, piece.edges); ctx.lineWidth = 3; ctx.strokeStyle = '#fffef3'; ctx.stroke(); }
        else {
          // Keep a very soft crop inside each silhouette: it makes the destination
          // legible to a young child without hiding the physical jigsaw shape.
          ctx.save(); ctx.globalAlpha = .17; this.drawAnimalCrop(ctx, piece, x, y, size); ctx.restore();
          this.path(ctx, x, y, tile, tile, piece.edges); ctx.fillStyle = 'rgba(255,251,230,.40)'; ctx.fill();
          ctx.save(); ctx.setLineDash([8, 7]); ctx.lineWidth = piece.id === this.hintId ? 6 : 3;
          ctx.strokeStyle = piece.id === this.hintId ? `rgba(245,182,68,${.75 + Math.sin(performance.now() / 230) * .2})` : 'rgba(56,100,68,.62)'; ctx.stroke(); ctx.restore();
          if (piece.id === this.hintId) { ctx.font = '900 25px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#d59b36'; ctx.fillText('✦', x + tile / 2, y + tile / 2 + 9); }
        }
      }
      return { tile };
    }

    render(time) {
      if (!this.pieces) return;
      const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.backgroundDraw();
      const m = this.model; ctx.save(); ctx.shadowColor = 'rgba(45,63,44,.19)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
      this.rounded(ctx, m.x, m.y, m.w, m.h, 26, '#fffdf0e6'); ctx.restore();
      ctx.fillStyle = '#78927d'; ctx.font = '900 12px "Avenir Next", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LE MODÈLE', m.x + m.w / 2, m.y + 26);
      const { frame, image } = this.animalImage();
      if (frame && image.complete && image.naturalWidth) {
        const pad = 17; const side = Math.min(m.w - pad * 2, m.h - 60);
        ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, m.x + (m.w - side) / 2, m.y + 38 + (m.h - 50 - side) / 2, side, side);
      }
      const board = this.drawBoard();
      ctx.fillStyle = '#fffdf0e8'; ctx.font = '800 12px "Avenir Next", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LES PIÈCES', this.trayX + this.trayTile, this.height * .25);
      const active = this.pieces.find((piece) => piece.dragging);
      for (const piece of this.pieces) if (!piece.placed && piece !== active) this.drawPiece(ctx, piece, time);
      if (active) this.drawPiece(ctx, active, time);
      if (active) {
        const target = { x: this.boardX + active.col * board.tile, y: this.boardY + active.row * board.tile };
        this.path(ctx, target.x, target.y, board.tile, board.tile, active.edges);
        ctx.save(); ctx.shadowColor = '#f4c247'; ctx.shadowBlur = 18; ctx.strokeStyle = `rgba(255,205,91,${.58 + Math.sin(time * 7) * .24})`; ctx.lineWidth = 8; ctx.stroke(); ctx.restore();
      }
    }

    coords(event) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    pointerDown(event) {
      const p = this.coords(event);
      const piece = [...(this.pieces || [])].reverse().find((item) => !item.placed && p.x >= item.x - 28 && p.x <= item.x + this.trayTile + 28 && p.y >= item.y - 28 && p.y <= item.y + this.trayTile + 28);
      if (!piece) return;
      this.canvas.setPointerCapture(event.pointerId); this.active = piece; this.offset = { x: p.x - piece.x, y: p.y - piece.y };
      piece.dragging = true; this.hintId = piece.id; event.preventDefault();
    }
    pointerMove(event) { if (!this.active) return; const p = this.coords(event); this.active.x = p.x - this.offset.x; this.active.y = p.y - this.offset.y; }
    pointerUp(event) {
      if (!this.active) return;
      const piece = this.active; const p = this.coords(event); piece.dragging = false;
      const targetX = this.boardX + piece.col * this.tile; const targetY = this.boardY + piece.row * this.tile;
      const centerX = piece.x + this.trayTile / 2; const centerY = piece.y + this.trayTile / 2;
      const goalX = targetX + this.tile / 2; const goalY = targetY + this.tile / 2;
      if (Math.hypot(centerX - goalX, centerY - goalY) < this.tile * .48) {
        piece.placed = true; piece.x = targetX; piece.y = targetY; this.hintId = null;
        if (this.pieces.every((item) => item.placed) && !this.complete) { this.complete = true; setTimeout(() => this.onComplete(this.animal), 350); }
      } else { piece.x = piece.homeX; piece.y = piece.homeY; this.onMiss(); }
      this.active = null; this.render(performance.now() / 1000);
    }
    hint() { const piece = this.pieces?.find((item) => !item.placed); if (piece) { this.hintId = piece.id; setTimeout(() => { if (!this.active && this.hintId === piece.id) this.hintId = null; }, 3200); } }
    destroy() { this.pause(); this.resizeObserver.disconnect(); }
  }

  window.PuzzleGame = PuzzleGame;
})();
