import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { TrackedArray } from 'tracked-built-ins';

export default class SpriteForgeService extends Service {
  @tracked img = null;
  @tracked frames = new TrackedArray();
  @tracked sel = -1;
  @tracked mode = 'sel';
  @tracked zoom = 1;
  @tracked fc = 0;
  @tracked fmt = 'phaser';
  @tracked imgName = 'spritesheet';
  @tracked imgW = '—';
  @tracked imgH = '—';

  drawing = false;
  ds = null;
  dc = null;
  panning = false;
  panA = null;
  panS = null;
  moving = false;
  movA = null;
  scaleMode = 'fit';
  scaleAlign = 'mc';
  scCache = null;
  pvZ = 1;
  _canvas = null;
  alignMap = { tl: 0, tc: 1, tr: 2, ml: 3, mc: 4, mr: 5, bl: 6, bc: 7, br: 8 };

  constructor() {
    super(...arguments);
    this._boundMouseMove = (e) => this.handleMouseMove(e);
    this._boundMouseUp = (e) => this.handleMouseUp(e);
    this._boundKeyDown = (e) => this.handleKeyDown(e);
    window.addEventListener('mousemove', this._boundMouseMove);
    window.addEventListener('mouseup', this._boundMouseUp);
    window.addEventListener('keydown', this._boundKeyDown);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    window.removeEventListener('mousemove', this._boundMouseMove);
    window.removeEventListener('mouseup', this._boundMouseUp);
    window.removeEventListener('keydown', this._boundKeyDown);
  }

  clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  setCanvas(canvas) {
    this._canvas = canvas;
  }

  @action
  loadImg(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const tempImg = new Image();
      tempImg.onload = () => {
        this.img = tempImg;
        this.imgW = this.img.width;
        this.imgH = this.img.height;
        this.imgName = file.name.replace(/\.[^.]+$/, '');
        const gW = document.getElementById('gW');
        const gH = document.getElementById('gH');
        if (gW) gW.value = Math.max(16, Math.floor(this.img.width / 4));
        if (gH) gH.value = Math.max(16, Math.floor(this.img.height / 4));
        this.fc = 0;
        this.frames = new TrackedArray();
        this.sel = -1;
        this.fitZoom();
      };
      tempImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  fitZoom() {
    const carea = document.getElementById('carea');
    const aw = carea.clientWidth - 40,
      ah = carea.clientHeight - 40;
    const z = this.clamp(
      Math.min(aw / this.img.width, ah / this.img.height),
      0.1,
      1,
    );
    this.applyZoom(Math.round(z * 100));
  }

  @action
  loadJSON(event) {
    const input = event.target;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this.frames = new TrackedArray();
        this.fc = 0;
        this.sel = -1;
        if (data.frames && !Array.isArray(data.frames)) {
          Object.entries(data.frames).forEach(([name, v]) => {
            const f = v.frame || v;
            this.frames.push({
              id: this.fc++,
              name,
              x: f.x || 0,
              y: f.y || 0,
              w: f.w || f.width || 64,
              h: f.h || f.height || 64,
            });
          });
        } else if (Array.isArray(data.frames)) {
          data.frames.forEach((f, i) => {
            const r = f.frame || f;
            this.frames.push({
              id: this.fc++,
              name: f.filename || f.name || 'frame_' + i,
              x: r.x || 0,
              y: r.y || 0,
              w: r.w || r.width || 64,
              h: r.h || r.height || 64,
            });
          });
        } else if (data.sprites) {
          data.sprites.forEach((f, i) =>
            this.frames.push({
              id: this.fc++,
              name: f.name || 'frame_' + i,
              x: f.x || 0,
              y: f.y || 0,
              w: f.w || f.width || 64,
              h: f.h || f.height || 64,
            }),
          );
        }
        this.redraw();
        alert(`✓ ${this.frames.length} frames importados`);
      } catch (err) {
        alert('Error JSON:\n' + err.message);
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  @action
  setMode(m) {
    this.mode = m;
    const cursors = {
      sel: 'default',
      drw: 'crosshair',
      mov: 'grab',
      pan: 'grab',
    };
    document.querySelectorAll('.mbn').forEach((b) => b.classList.remove('on'));
    const btn = document.getElementById('m-' + m);
    if (btn) btn.classList.add('on');
    if (this._canvas) this._canvas.style.cursor = cursors[m];
  }

  @action
  applyZoom(val) {
    this.zoom = val / 100;
    this.redraw();
  }

  cPos(e) {
    const r = this._canvas.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) / this.zoom),
      y: Math.round((e.clientY - r.top) / this.zoom),
    };
  }

  frameAt(x, y) {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return i;
    }
    return -1;
  }

  handleMouseDown(e) {
    if (!this.img) return;
    const p = this.cPos(e);
    if (this.mode === 'pan') {
      this.panning = true;
      this.panA = { x: e.clientX, y: e.clientY };
      const carea = document.getElementById('carea');
      this.panS = { x: carea.scrollLeft, y: carea.scrollTop };
      if (this._canvas) this._canvas.style.cursor = 'grabbing';
      return;
    }
    if (this.mode === 'drw') {
      this.drawing = true;
      this.ds = { ...p };
      this.dc = { ...p };
      return;
    }
    if (this.mode === 'mov') {
      const i = this.frameAt(p.x, p.y);
      if (i >= 0) {
        this.sel = i;
        this.moving = true;
        this.movA = { x: p.x - this.frames[i].x, y: p.y - this.frames[i].y };
        if (this._canvas) this._canvas.style.cursor = 'grabbing';
        this.redraw();
      }
      return;
    }
    if (this.mode === 'sel') {
      this.sel = this.frameAt(p.x, p.y);
      this.redraw();
    }
  }

  handleMouseMove(e) {
    if (!this.img || !this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    const cx = Math.round((e.clientX - r.left) / this.zoom),
      cy = Math.round((e.clientY - r.top) / this.zoom);
    const sb4 = document.getElementById('sb4');
    if (sb4) sb4.innerHTML = `Cursor: <b>${cx}, ${cy}</b>`;
    if (this.panning && this.panA) {
      const carea = document.getElementById('carea');
      carea.scrollLeft = this.panS.x - (e.clientX - this.panA.x);
      carea.scrollTop = this.panS.y - (e.clientY - this.panA.y);
      return;
    }
    if (this.drawing && this.ds) {
      this.dc = { x: cx, y: cy };
      this.redraw();
      return;
    }
    if (this.moving && this.sel >= 0) {
      const p = this.cPos(e),
        f = this.frames[this.sel];
      f.x = this.clamp(p.x - this.movA.x, 0, this.img.width - f.w);
      f.y = this.clamp(p.y - this.movA.y, 0, this.img.height - f.h);
      if (document.getElementById('sb5')) {
        document.getElementById('sb5').innerHTML =
          `Sel: <b>${f.name}</b> ${f.w}×${f.h}`;
      }
      this.redraw();
    }
  }

  handleMouseUp() {
    if (this.panning) {
      this.panning = false;
      this.panA = null;
      if (this._canvas) this._canvas.style.cursor = 'grab';
      return;
    }
    if (this.moving) {
      this.moving = false;
      if (this._canvas) this._canvas.style.cursor = 'grab';
      return;
    }
    if (this.drawing && this.ds && this.dc) {
      this.drawing = false;
      const x = Math.min(this.ds.x, this.dc.x),
        y = Math.min(this.ds.y, this.dc.y);
      const w = Math.abs(this.dc.x - this.ds.x),
        h = Math.abs(this.dc.y - this.ds.y);
      if (w > 3 && h > 3) {
        const name =
          document.getElementById('nfname')?.value || 'frame_' + this.fc;
        this.frames.push({ id: this.fc, name, x, y, w, h });
        document.getElementById('nfname').value = 'frame_' + (this.fc + 1);
        this.fc++;
        this.sel = this.frames.length - 1;
        this.redraw();
      }
      this.ds = null;
      this.dc = null;
      this.redraw();
    }
  }

  handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.applyZoom(
        this.clamp(
          Math.round(this.zoom * 100) + (e.deltaY > 0 ? -10 : 10),
          10,
          800,
        ),
      );
    }
  }

  handleKeyDown(e) {
    if (document.activeElement?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 's') this.setMode('sel');
    if (k === 'd') this.setMode('drw');
    if (k === 'm') this.setMode('mov');
    if (k === 'p') this.setMode('pan');
    if (k === '+' || k === '=')
      this.applyZoom(this.clamp(Math.round(this.zoom * 100) + 25, 10, 800));
    if (k === '-')
      this.applyZoom(this.clamp(Math.round(this.zoom * 100) - 25, 10, 800));
    if ((k === 'delete' || k === 'backspace') && this.sel >= 0)
      this.delFrame(this.sel);
    if (k === 'escape') {
      this.sel = -1;
      this.redraw();
    }
    if (this.sel >= 0 && !e.shiftKey) {
      const f = this.frames[this.sel];
      if (k === 'arrowleft') {
        f.x = Math.max(0, f.x - 1);
        this.redraw();
      }
      if (k === 'arrowright') {
        f.x++;
        this.redraw();
      }
      if (k === 'arrowup') {
        f.y = Math.max(0, f.y - 1);
        this.redraw();
      }
      if (k === 'arrowdown') {
        f.y++;
        this.redraw();
      }
    }
    if (this.sel >= 0 && e.shiftKey) {
      const f = this.frames[this.sel];
      if (k === 'arrowright') {
        f.w++;
        this.redraw();
      }
      if (k === 'arrowleft') {
        f.w = Math.max(1, f.w - 1);
        this.redraw();
      }
      if (k === 'arrowdown') {
        f.h++;
        this.redraw();
      }
      if (k === 'arrowup') {
        f.h = Math.max(1, f.h - 1);
        this.redraw();
      }
    }
  }

  handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const rd = new FileReader();
      rd.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          this.img = img;
          this.imgW = img.width;
          this.imgH = img.height;
          this.imgName = file.name.replace(/\.[^.]+$/, '');
          const gW = document.getElementById('gW');
          const gH = document.getElementById('gH');
          if (gW) gW.value = Math.max(16, Math.floor(this.img.width / 4));
          if (gH) gH.value = Math.max(16, Math.floor(this.img.height / 4));
          this.fc = 0;
          this.frames = new TrackedArray();
          this.sel = -1;
          this.fitZoom();
        };
        img.src = ev.target.result;
      };
      rd.readAsDataURL(file);
    }
  }

  redraw() {
    if (!this.img || !this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    const zoom = this.zoom;
    this._canvas.width = Math.round(this.img.width * zoom);
    this._canvas.height = Math.round(this.img.height * zoom);
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < this.img.height; y += 8) {
      for (let x = 0; x < this.img.width; x += 8) {
        ctx.fillStyle = (((x + y) / 8) % 2) | 0 ? '#1a1a1a' : '#2a2a2a';
        ctx.fillRect(x, y, 8, 8);
      }
    }
    ctx.drawImage(this.img, 0, 0);
    this.frames.forEach((f, i) => {
      const s = i === this.sel;
      ctx.fillStyle = s ? 'rgba(57,232,176,.15)' : 'rgba(57,232,176,.05)';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = s ? '#39e8b0' : 'rgba(57,232,176,.5)';
      ctx.lineWidth = (s ? 2 : 1) / zoom;
      ctx.strokeRect(
        f.x + 0.5 / zoom,
        f.y + 0.5 / zoom,
        f.w - 1 / zoom,
        f.h - 1 / zoom,
      );
      const fs = Math.max(8, 10 / zoom);
      ctx.font = `700 ${fs}px monospace`;
      ctx.fillStyle = s ? '#39e8b0' : 'rgba(57,232,176,.7)';
      ctx.fillText(i, f.x + 2 / zoom, f.y + fs + 1 / zoom);
      if (s) {
        const hs = 5 / zoom;
        ctx.fillStyle = '#39e8b0';
        [
          [f.x, f.y],
          [f.x + f.w, f.y],
          [f.x, f.y + f.h],
          [f.x + f.w, f.y + f.h],
        ].forEach(([hx, hy]) => ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs));
      }
    });
    if (this.drawing && this.ds && this.dc) {
      const x = Math.min(this.ds.x, this.dc.x),
        y = Math.min(this.ds.y, this.dc.y);
      const w = Math.abs(this.dc.x - this.ds.x),
        h = Math.abs(this.dc.y - this.ds.y);
      ctx.strokeStyle = '#ffc94d';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 3 / zoom]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,201,77,.1)';
      ctx.fillRect(x, y, w, h);
      ctx.font = `${Math.max(9, 11 / zoom)}px monospace`;
      ctx.fillStyle = '#ffc94d';
      ctx.fillText(`${w}×${h}`, x + 2 / zoom, y + 13 / zoom);
    }
    ctx.restore();
  }

  @action
  addManual() {
    const x = +document.getElementById('nfx').value,
      y = +document.getElementById('nfy').value;
    const w = +document.getElementById('nfw').value,
      h = +document.getElementById('nfh').value;
    const name = document.getElementById('nfname').value || 'frame_' + this.fc;
    this.frames.push({ id: this.fc, name, x, y, w, h });
    document.getElementById('nfname').value = 'frame_' + (this.fc + 1);
    this.fc++;
    this.sel = this.frames.length - 1;
    this.redraw();
  }

  @action
  applyGrid() {
    const cols = +document.getElementById('gCols').value || 4;
    const rows = +document.getElementById('gRows').value || 4;
    const fw = +document.getElementById('gW').value || 64,
      fh = +document.getElementById('gH').value || 64;
    const ox = +document.getElementById('gOX').value || 0,
      oy = +document.getElementById('gOY').value || 0;
    const pfx = document.getElementById('gPfx').value || 'frame_';
    this.frames = new TrackedArray();
    this.fc = 0;
    this.sel = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.frames.push({
          id: this.fc,
          name: pfx + this.fc++,
          x: ox + c * fw,
          y: oy + r * fh,
          w: fw,
          h: fh,
        });
      }
    }
    this.redraw();
  }

  @action
  delFrame(i) {
    this.frames = new TrackedArray(this.frames.filter((_, idx) => idx !== i));
    if (this.sel >= this.frames.length) this.sel = this.frames.length - 1;
    this.redraw();
  }

  @action
  clearAll() {
    if (!this.frames.length) return;
    if (!confirm(`¿Eliminar ${this.frames.length} frames?`)) return;
    this.frames = new TrackedArray();
    this.fc = 0;
    this.sel = -1;
    this.redraw();
  }

  @action
  sortFrames() {
    this.frames.sort((a, b) => {
      if (a.y < b.y + b.h && a.y + a.h > b.y) return a.x - b.x;
      return a.y - b.y;
    });
    this.frames.forEach((f, i) => {
      if (/^frame_\d+$/.test(f.name)) f.name = 'frame_' + i;
    });
    this.sel = -1;
    this.redraw();
  }

  @action
  runAutoDetect() {
    if (!this.img) {
      alert('Carga una imagen primero');
      return;
    }
    const bgHex = document.getElementById('bgCol').value;
    const tol = +document.getElementById('bgTol').value || 30;
    const pad = +document.getElementById('autoPad').value || 1;
    const bgR = parseInt(bgHex.slice(1, 3), 16),
      bgG = parseInt(bgHex.slice(3, 5), 16),
      bgB = parseInt(bgHex.slice(5, 7), 16);
    const off = document.createElement('canvas');
    off.width = this.img.width;
    off.height = this.img.height;
    off.getContext('2d').drawImage(this.img, 0, 0);
    const px = off
      .getContext('2d')
      .getImageData(0, 0, this.img.width, this.img.height).data;
    const isBg = (x, y) => {
      const i = (y * this.img.width + x) * 4;
      if (px[i + 3] < 10) return true;
      return (
        Math.abs(px[i] - bgR) <= tol &&
        Math.abs(px[i + 1] - bgG) <= tol &&
        Math.abs(px[i + 2] - bgB) <= tol
      );
    };
    const vis = new Uint8Array(this.img.width * this.img.height),
      blobs = [];
    for (let y = 0; y < this.img.height; y++) {
      for (let x = 0; x < this.img.width; x++) {
        const idx = y * this.img.width + x;
        if (vis[idx] || isBg(x, y)) continue;
        let mnX = x,
          mxX = x,
          mnY = y,
          mxY = y;
        const q = [idx];
        vis[idx] = 1;
        let h = 0;
        while (h < q.length) {
          const ci = q[h++],
            cx = ci % this.img.width,
            cy = (ci / this.img.width) | 0;
          if (cx < mnX) mnX = cx;
          if (cx > mxX) mxX = cx;
          if (cy < mnY) mnY = cy;
          if (cy > mxY) mxY = cy;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = cx + dx,
              ny = cy + dy;
            if (
              nx < 0 ||
              nx >= this.img.width ||
              ny < 0 ||
              ny >= this.img.height
            )
              continue;
            const ni = ny * this.img.width + nx;
            if (!vis[ni] && !isBg(nx, ny)) {
              vis[ni] = 1;
              q.push(ni);
            }
          }
        }
        if (mxX - mnX > 3 && mxY - mnY > 3 && q.length >= 12)
          blobs.push({ x: mnX, y: mnY, w: mxX - mnX + 1, h: mxY - mnY + 1 });
      }
    }
    const used = new Uint8Array(blobs.length);
    let merged = [];
    for (let i = 0; i < blobs.length; i++) {
      if (used[i]) continue;
      let r = { ...blobs[i] };
      for (let j = i + 1; j < blobs.length; j++) {
        if (used[j]) continue;
        const b = blobs[j];
        if (
          r.x < b.x + b.w &&
          r.x + r.w > b.x &&
          r.y < b.y + b.h &&
          r.y + r.h > b.y
        ) {
          const nx = Math.min(r.x, b.x),
            ny = Math.min(r.y, b.y);
          r.w = Math.max(r.x + r.w, b.x + b.w) - nx;
          r.h = Math.max(r.y + r.h, b.y + b.h) - ny;
          r.x = nx;
          r.y = ny;
          used[j] = 1;
        }
      }
      merged.push(r);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < merged.length; i++) {
        for (let j = i + 1; j < merged.length; j++) {
          const a = merged[i],
            b = merged[j];
          if (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
          ) {
            const nx = Math.min(a.x, b.x),
              ny = Math.min(a.y, b.y);
            a.w = Math.max(a.x + a.w, b.x + b.w) - nx;
            a.h = Math.max(a.y + a.h, b.y + b.h) - ny;
            a.x = nx;
            a.y = ny;
            merged.splice(j, 1);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    merged.sort((a, b) => {
      if (a.y < b.y + b.h && a.y + a.h > b.y) return a.x - b.x;
      return a.y - b.y;
    });
    this.frames = new TrackedArray(
      merged.map((f, i) => ({
        id: i,
        name: 'frame_' + i,
        x: Math.max(0, f.x - pad),
        y: Math.max(0, f.y - pad),
        w: Math.min(this.img.width, f.w + pad * 2),
        h: Math.min(this.img.height, f.h + pad * 2),
      })),
    );
    this.fc = this.frames.length;
    this.sel = -1;
    this.redraw();
    alert(`⚡ Detectados ${this.frames.length} sprites`);
  }

  @action
  autoScaleFrames() {
    if (!this.frames.length) {
      alert('Detecta frames primero');
      return;
    }
    this.scaleMode = 'none';
    const mxW = Math.max(...this.frames.map((f) => f.w));
    const mxH = Math.max(...this.frames.map((f) => f.h));
    if (mxW < 1 || mxH < 1) return;
    const cols = Math.max(1, Math.ceil(Math.sqrt(this.frames.length)));
    const rows = Math.ceil(this.frames.length / cols);
    ['sCW', 'mCW'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = mxW;
    });
    ['sCH', 'mCH'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = mxH;
    });
    ['sCols', 'mCols'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = cols;
    });
    ['sGap', 'mGap'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = 0;
    });
    const off = document.createElement('canvas');
    off.width = cols * mxW;
    off.height = rows * mxH;
    const oc = off.getContext('2d');
    this.frames.forEach((f, i) => {
      const dx = (i % cols) * mxW + Math.round((mxW - f.w) / 2);
      const dy = Math.floor(i / cols) * mxH + Math.round((mxH - f.h) / 2);
      oc.drawImage(this.img, f.x, f.y, f.w, f.h, dx, dy, f.w, f.h);
    });
    const ni = new Image();
    ni.onload = () => {
      this.img = ni;
      this.imgW = ni.width;
      this.imgH = ni.height;
      this.frames = new TrackedArray(
        this.frames.map((f, i) => ({
          id: i,
          name: f.name,
          x: (i % cols) * mxW + Math.round((mxW - f.w) / 2),
          y: Math.floor(i / cols) * mxH + Math.round((mxH - f.h) / 2),
          w: f.w,
          h: f.h,
        })),
      );
      this.sel = -1;
      this.setSM('none');
      this.fitZoom();
    };
    ni.src = off.toDataURL();
  }

  @action
  setSM(m) {
    this.scaleMode = m;
    ['fit', 'stretch', 'crop', 'none'].forEach((s) => {
      ['sb-', 'm-'].forEach((p) => {
        const el = document.getElementById(`${p}${s}`);
        if (el) el.classList.toggle('on', s === m);
      });
    });
    const d = {
      fit: 'Fit: escala manteniendo proporción, espacio sobrante relleno con fondo.',
      stretch: 'Stretch: estira para llenar exactamente la celda.',
      crop: 'Crop: recorta el excedente al llenar.',
      none: '1:1: sin escala, sólo posiciona el sprite.',
    };
    const mDesc = document.getElementById('mDesc');
    if (mDesc) mDesc.textContent = d[m];
    if (this.scCache) this.buildSheet();
    this.redraw();
  }

  @action
  setAlign(code) {
    this.scaleAlign = code;
    const idx = this.alignMap[code] ?? 4;
    ['sbAG', 'mAG'].forEach((id) => {
      const g = document.getElementById(id);
      if (!g) return;
      g.querySelectorAll('.ab').forEach((b, i) =>
        b.classList.toggle('on', i === idx),
      );
    });
    if (this.scCache) this.buildSheet();
  }

  getP() {
    return {
      cw: Math.max(4, +document.getElementById('mCW')?.value || 64),
      ch: Math.max(4, +document.getElementById('mCH')?.value || 64),
      cols: Math.max(1, +document.getElementById('mCols')?.value || 8),
      gap: Math.max(0, +document.getElementById('mGap')?.value || 0),
      bg: document.getElementById('mBg')?.value || '#000000',
      transparent: document.getElementById('mTransparent')?.checked || false,
    };
  }

  @action
  syncSb2M() {
    document.getElementById('mCW').value = document.getElementById('sCW').value;
    document.getElementById('mCH').value = document.getElementById('sCH').value;
    document.getElementById('mCols').value =
      document.getElementById('sCols').value;
    document.getElementById('mGap').value =
      document.getElementById('sGap').value;
    document.getElementById('mBg').value = document.getElementById('sBg').value;
    const st = document.getElementById('sTransparent');
    const mt = document.getElementById('mTransparent');
    if (st && mt) mt.checked = st.checked;
    if (this.scCache) this.buildSheet();
  }

  @action
  syncM2Sb() {
    document.getElementById('sCW').value = document.getElementById('mCW').value;
    document.getElementById('sCH').value = document.getElementById('mCH').value;
    document.getElementById('sCols').value =
      document.getElementById('mCols').value;
    document.getElementById('sGap').value =
      document.getElementById('mGap').value;
    document.getElementById('sBg').value = document.getElementById('mBg').value;
    const mt = document.getElementById('mTransparent');
    const st = document.getElementById('sTransparent');
    if (mt && st) st.checked = mt.checked;
    this.buildSheet();
  }

  alignOff(cell, sprite, code) {
    if (code === 'l' || code === 't') return 0;
    if (code === 'r' || code === 'b') return cell - sprite;
    return Math.round((cell - sprite) / 2);
  }

  @action
  autoSuggest() {
    if (!this.frames.length) return;
    const mxW = Math.max(...this.frames.map((f) => f.w)),
      mxH = Math.max(...this.frames.map((f) => f.h));
    document.getElementById('mCW').value = mxW;
    document.getElementById('mCH').value = mxH;
    document.getElementById('sCW').value = mxW;
    document.getElementById('sCH').value = mxH;
    const cols = Math.max(
      1,
      Math.min(16, Math.ceil(Math.sqrt(this.frames.length))),
    );
    document.getElementById('mCols').value = cols;
    document.getElementById('sCols').value = cols;
    this.buildSheet();
  }

  buildSheet() {
    if (!this.img || !this.frames.length) return;
    const { cw, ch, cols, gap, bg, transparent } = this.getP();
    const rows = Math.ceil(this.frames.length / cols);
    const shW = cols * cw + (cols - 1) * gap,
      shH = rows * ch + (rows - 1) * gap;
    const vCode = this.scaleAlign[0],
      hCode = this.scaleAlign[1];
    const off = document.createElement('canvas');
    off.width = shW;
    off.height = shH;
    const oc = off.getContext('2d');
    if (!transparent) {
      oc.fillStyle = bg;
      oc.fillRect(0, 0, shW, shH);
    }
    oc.imageSmoothingEnabled = true;
    oc.imageSmoothingQuality = 'high';
    this.frames.forEach((f, i) => {
      const col = i % cols,
        row = Math.floor(i / cols);
      const cx = col * (cw + gap),
        cy = row * (ch + gap);
      if (!transparent) {
        oc.fillStyle = bg;
        oc.fillRect(cx, cy, cw, ch);
      }
      if (this.scaleMode === 'stretch') {
        oc.drawImage(this.img, f.x, f.y, f.w, f.h, cx, cy, cw, ch);
      } else if (this.scaleMode === 'crop') {
        const sc = Math.max(cw / f.w, ch / f.h),
          dw = f.w * sc,
          dh = f.h * sc;
        const ox = this.alignOff(cw, dw, hCode),
          oy = this.alignOff(ch, dh, vCode);
        oc.save();
        oc.beginPath();
        oc.rect(cx, cy, cw, ch);
        oc.clip();
        oc.drawImage(this.img, f.x, f.y, f.w, f.h, cx + ox, cy + oy, dw, dh);
        oc.restore();
      } else if (this.scaleMode === 'none') {
        const ox = this.alignOff(cw, f.w, hCode),
          oy = this.alignOff(ch, f.h, vCode);
        oc.save();
        oc.beginPath();
        oc.rect(cx, cy, cw, ch);
        oc.clip();
        oc.imageSmoothingEnabled = false;
        oc.drawImage(this.img, f.x, f.y, f.w, f.h, cx + ox, cy + oy, f.w, f.h);
        oc.restore();
      } else {
        const sc = Math.min(cw / f.w, ch / f.h),
          dw = Math.round(f.w * sc),
          dh = Math.round(f.h * sc);
        const ox = this.alignOff(cw, dw, hCode),
          oy = this.alignOff(ch, dh, vCode);
        oc.drawImage(this.img, f.x, f.y, f.w, f.h, cx + ox, cy + oy, dw, dh);
      }
    });
    this.scCache = off;
    this.renderPv(off, shW, shH, cols, rows, cw, ch, gap);
  }

  renderPv(off, shW, shH, cols, rows, cw, ch, gap) {
    const wrap = document.getElementById('pvWrap');
    if (!wrap) return;
    const maxW = (wrap.clientWidth || 600) - 20,
      maxH = (wrap.clientHeight || 380) - 20;
    this.pvZ = this.clamp(Math.min(maxW / shW, maxH / shH, 2), 0.05, 4);
    const pc = document.getElementById('pvCanvas');
    if (!pc) return;
    pc.width = Math.round(shW * this.pvZ);
    pc.height = Math.round(shH * this.pvZ);
    const pctx = pc.getContext('2d');
    pctx.save();
    pctx.scale(this.pvZ, this.pvZ);
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(off, 0, 0);
    pctx.strokeStyle = 'rgba(201,123,255,.4)';
    pctx.lineWidth = 0.5 / this.pvZ;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + r * cols >= this.frames.length) break;
        const cx = c * (cw + gap),
          cy = r * (ch + gap);
        pctx.strokeRect(
          cx + 0.25 / this.pvZ,
          cy + 0.25 / this.pvZ,
          cw - 0.5 / this.pvZ,
          ch - 0.5 / this.pvZ,
        );
        pctx.font = `${Math.max(7, 8 / this.pvZ)}px monospace`;
        pctx.fillStyle = 'rgba(201,123,255,.6)';
        pctx.fillText(c + r * cols, cx + 2 / this.pvZ, cy + 9 / this.pvZ);
      }
    }
    pctx.restore();
    this.updateStats(shW, shH, cols, rows, cw, ch);
  }

  updateStats(shW, shH, cols, rows, cw, ch) {
    const el = (id) => document.getElementById(id);
    if (el('st-n')) el('st-n').textContent = this.frames.length;
    if (el('st-mx'))
      el('st-mx').textContent =
        Math.max(...this.frames.map((f) => f.w)) +
        '×' +
        Math.max(...this.frames.map((f) => f.h));
    if (el('st-mn'))
      el('st-mn').textContent =
        Math.min(...this.frames.map((f) => f.w)) +
        '×' +
        Math.min(...this.frames.map((f) => f.h));
    if (el('st-c')) el('st-c').textContent = cw + '×' + ch;
    if (el('st-s')) el('st-s').textContent = shW + '×' + shH;
    if (el('st-g')) el('st-g').textContent = cols + '×' + rows;
    if (el('pv-sz')) el('pv-sz').textContent = shW + '×' + shH + 'px';
    if (el('pv-fr')) el('pv-fr').textContent = this.frames.length;
    if (el('pv-cl')) el('pv-cl').textContent = cw + '×' + ch;
    if (el('pvZLbl'))
      el('pvZLbl').textContent = 'zoom: ' + Math.round(this.pvZ * 100) + '%';
    const tot = cols * rows,
      pct = Math.round((this.frames.length / tot) * 100);
    if (el('pfill')) el('pfill').style.width = pct + '%';
    if (el('plbl'))
      el('plbl').textContent = `${this.frames.length}/${tot} celdas (${pct}%)`;
  }

  @action
  changePvZ(dir) {
    if (!this.scCache) return;
    this.pvZ = this.clamp(this.pvZ + dir * 0.25, 0.05, 4);
    const { cw, ch, cols, gap } = this.getP();
    const rows = Math.ceil(this.frames.length / cols);
    this.renderPv(
      this.scCache,
      this.scCache.width,
      this.scCache.height,
      cols,
      rows,
      cw,
      ch,
      gap,
    );
  }

  @action
  openScale() {
    if (!this.frames.length) {
      alert('Define frames primero');
      return;
    }
    document.getElementById('mCW').value = document.getElementById('sCW').value;
    document.getElementById('mCH').value = document.getElementById('sCH').value;
    document.getElementById('mCols').value =
      document.getElementById('sCols').value;
    document.getElementById('mGap').value =
      document.getElementById('sGap').value;
    document.getElementById('mBg').value = document.getElementById('sBg').value;
    const st = document.getElementById('sTransparent');
    const mt = document.getElementById('mTransparent');
    if (st && mt) mt.checked = st.checked;
    document.getElementById('scModal').classList.add('open');
    this.buildSheet();
  }

  @action
  closeScale() {
    document.getElementById('scModal')?.classList.remove('open');
  }

  @action
  genSheet(loadInEditor) {
    if (!this.scCache) this.buildSheet();
    const off = this.scCache;
    const { cw, ch, cols, gap } = this.getP();
    const name = (this.imgName || 'spritesheet') + '_scaled';
    const rows = Math.ceil(this.frames.length / cols);
    const json = {
      meta: {
        app: 'SpriteForge',
        image: name + '.png',
        format: 'RGBA8888',
        size: { w: off.width, h: off.height },
        scale: 1,
        frameSize: { w: cw, h: ch },
      },
      frames: {},
    };
    this.frames.forEach((f, i) => {
      const col = i % cols,
        row = Math.floor(i / cols);
      json.frames[f.name] = {
        frame: { x: col * (cw + gap), y: row * (ch + gap), w: cw, h: ch },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: cw, h: ch },
        sourceSize: { w: cw, h: ch },
        anchor: { x: 0.5, y: 0.5 },
      };
    });
    if (loadInEditor) {
      off.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const ni = new Image();
        ni.onload = () => {
          this.img = ni;
          this.imgW = ni.width;
          this.imgH = ni.height;
          this.imgName = name;
          this.frames.forEach((f, i) => {
            const col = i % cols,
              row = Math.floor(i / cols);
            f.x = col * (cw + gap);
            f.y = row * (ch + gap);
            f.w = cw;
            f.h = ch;
          });
          this.closeScale();
          this.fitZoom();
          URL.revokeObjectURL(url);
        };
        ni.src = url;
      }, 'image/png');
    } else {
      off.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }, 'image/png');
      setTimeout(
        () =>
          this.dlText(
            name + '.json',
            JSON.stringify(json, null, 2),
            'application/json',
          ),
        300,
      );
      this.closeScale();
    }
  }

  buildPayload(f) {
    const name = this.imgName || 'spritesheet';
    const iw = this.img ? this.img.width : 0,
      ih = this.img ? this.img.height : 0;
    if (f === 'phaser') {
      const obj = {
        meta: {
          app: 'SpriteForge',
          image: name + '.png',
          format: 'RGBA8888',
          size: { w: iw, h: ih },
          scale: 1,
        },
        frames: {},
      };
      this.frames.forEach((fr) => {
        obj.frames[fr.name] = {
          frame: { x: fr.x, y: fr.y, w: fr.w, h: fr.h },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: fr.w, h: fr.h },
          sourceSize: { w: fr.w, h: fr.h },
          anchor: { x: 0.5, y: 0.5 },
        };
      });
      return {
        ext: '.json',
        mime: 'application/json',
        text: JSON.stringify(obj, null, 2),
      };
    }
    if (f === 'array') {
      return {
        ext: '.json',
        mime: 'application/json',
        text: JSON.stringify(
          {
            meta: { image: name + '.png', size: { w: iw, h: ih } },
            frames: this.frames.map((fr) => ({
              name: fr.name,
              x: fr.x,
              y: fr.y,
              w: fr.w,
              h: fr.h,
            })),
          },
          null,
          2,
        ),
      };
    }
    if (f === 'pixi') {
      const obj = {
        frames: {},
        meta: { image: name + '.png', size: { w: iw, h: ih }, scale: '1' },
      };
      this.frames.forEach((fr) => {
        obj.frames[fr.name] = {
          frame: { x: fr.x, y: fr.y, w: fr.w, h: fr.h },
          spriteSourceSize: { x: 0, y: 0, w: fr.w, h: fr.h },
          sourceSize: { w: fr.w, h: fr.h },
          rotated: false,
          trimmed: false,
        };
      });
      return {
        ext: '.json',
        mime: 'application/json',
        text: JSON.stringify(obj, null, 2),
      };
    }
    if (f === 'css') {
      return {
        ext: '.css',
        mime: 'text/css',
        text:
          `/* SpriteForge · ${name}.png */\n\n` +
          this.frames
            .map(
              (fr) =>
                `.sp-${fr.name.replace(/[^a-zA-Z0-9_-]/g, '_')}{background:url('${name}.png') -${fr.x}px -${fr.y}px;width:${fr.w}px;height:${fr.h}px;display:inline-block}`,
            )
            .join('\n'),
      };
    }
  }

  @action
  pickFmt(f) {
    this.fmt = f;
    document.querySelectorAll('.fc').forEach((c) => c.classList.remove('on'));
    const el = document.getElementById('fmt-' + f);
    if (el) el.classList.add('on');
    this.updateExpCode();
  }

  updateExpCode() {
    const expCode = document.getElementById('expCode');
    if (!expCode) return;
    if (!this.frames.length) {
      expCode.textContent = '// sin frames';
      return;
    }
    const p = this.buildPayload(this.fmt);
    expCode.textContent =
      p.text.slice(0, 700) + (p.text.length > 700 ? '\n...' : '');
  }

  @action
  openExport() {
    if (!this.frames.length) {
      alert('Define al menos un frame');
      return;
    }
    this.updateExpCode();
    document.getElementById('expModal').classList.add('open');
  }

  @action
  closeExport() {
    document.getElementById('expModal')?.classList.remove('open');
  }

  @action
  doExport() {
    const p = this.buildPayload(this.fmt);
    this.dlText((this.imgName || 'spritesheet') + p.ext, p.text, p.mime);
    this.closeExport();
  }

  @action
  exportSheet() {
    if (!this.img) {
      alert('Carga una imagen primero');
      return;
    }
    const off = document.createElement('canvas');
    off.width = this.img.width;
    off.height = this.img.height;
    const oc = off.getContext('2d');
    oc.drawImage(this.img, 0, 0);
    this.frames.forEach((f) => {
      oc.strokeStyle = 'rgba(57,232,176,.9)';
      oc.lineWidth = 1;
      oc.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
      oc.font = '9px monospace';
      oc.fillStyle = 'rgba(57,232,176,.95)';
      oc.fillText(f.name, f.x + 2, f.y + 10);
    });
    off.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (this.imgName || 'spritesheet') + '_annotated.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }, 'image/png');
  }

  dlText(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}
