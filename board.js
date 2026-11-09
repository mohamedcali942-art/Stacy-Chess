/* Stacy Chess - interactive board: tap or drag, animations, arrows, highlights, badges */
(function () {
  var FILES = 'abcdefgh';
  function parseFen(fen) {
    var map = {}, rows = fen.split(' ')[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (/\d/.test(ch)) f += +ch;
        else { map[FILES[f] + (8 - r)] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(); f++; }
      }
    }
    return map;
  }
  window.parseFenMap = parseFen;
  function sqXY(sq) { return [FILES.indexOf(sq[0]), +sq[1] - 1]; }
  function dist(a, b) { var A = sqXY(a), B = sqXY(b); return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]); }
  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

  /* v8: every set is embedded (piecesets.js); unknown or legacy remote set names fall back to Classic.
     A board may override the set (Customize previews) via opts.pieceSet without touching settings. */
  var urlCache = {};
  function pieceUrl(p, setId) {
    var sets = window.PIECE_SETS || {}, set = setId || (window.APP_SETTINGS && window.APP_SETTINGS.pieceSet) || 'cburnett';
    if (!sets[set]) set = 'cburnett';
    var key = set + ':' + p; if (urlCache[key]) return urlCache[key];
    var src = (sets[set] && sets[set].svg && sets[set].svg[p]) || window.PIECE_SVG[p];
    return (urlCache[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(src).replace(/[()']/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }));
  }
  window.pieceUrl = pieceUrl;

  function Board(container, opts) {
    this.opts = opts || {};
    this.orientation = this.opts.orientation || 'w';
    this.map = {};
    this.pieces = {}; // sq -> element
    this.selected = null;
    this.root = el('div', 'board', container);
    this.sqLayer = el('div', 'sq-layer', this.root);
    this.squares = {};
    for (var i = 0; i < 64; i++) {
      var s = el('div', 'sq', this.sqLayer);
      this.squares[i] = s;
    }
    this.pieceLayer = el('div', 'piece-layer', this.root);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.setAttribute('class', 'arrows');
    this.root.appendChild(this.svg);
    this.badgeLayer = el('div', 'badge-layer', this.root);
    this.coordLayer = el('div', 'coord-layer', this.root);
    this.promoEl = null;
    this.layoutSquares();
    this.bindInput();
  }
  var P = Board.prototype;

  P.sqToPos = function (sq) {
    var xy = sqXY(sq), c = xy[0], r = 7 - xy[1];
    if (this.orientation === 'b') { c = 7 - c; r = 7 - r; }
    return [c, r];
  };
  P.posToSq = function (c, r) {
    if (this.orientation === 'b') { c = 7 - c; r = 7 - r; }
    return FILES[c] + (8 - r);
  };
  P.layoutSquares = function () {
    this.sqEls = {};
    for (var i = 0; i < 64; i++) {
      var c = i % 8, r = Math.floor(i / 8), sq = this.posToSq(c, r), s = this.squares[i];
      var xy = sqXY(sq);
      s.className = 'sq ' + ((xy[0] + xy[1]) % 2 === 0 ? 'dark' : 'light');
      s.style.left = (c * 12.5) + '%'; s.style.top = (r * 12.5) + '%';
      s.dataset.sq = sq;
      this.sqEls[sq] = s;
    }
    this.coordLayer.innerHTML = '';
    if (this.opts.coords !== false) {
      for (var k = 0; k < 8; k++) {
        var fsq = this.posToSq(k, 7), rsq = this.posToSq(0, k);
        var f = el('span', 'coord file ' + (((sqXY(fsq)[0] + sqXY(fsq)[1]) % 2 === 0) ? 'on-dark' : 'on-light'), this.coordLayer);
        f.textContent = fsq[0]; f.style.left = (k * 12.5 + 12.5) + '%';
        var rr = el('span', 'coord rank ' + (((sqXY(rsq)[0] + sqXY(rsq)[1]) % 2 === 0) ? 'on-dark' : 'on-light'), this.coordLayer);
        rr.textContent = rsq[1]; rr.style.top = (k * 12.5) + '%';
      }
    }
  };
  P.setCoords = function (on) { this.opts.coords = on; this.layoutSquares(); };
  P.setOrientation = function (o) {
    if (o === this.orientation) return;
    this.orientation = o; this.layoutSquares();
    for (var sq in this.pieces) this.placeEl(this.pieces[sq], sq, false);
    this.redrawDecor();
  };
  P.flip = function () { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); };

  P.placeEl = function (e, sq, animate) {
    var p = this.sqToPos(sq);
    e.style.transition = animate ? '' : 'none';
    e.style.transform = 'translate(' + (p[0] * 100) + '%,' + (p[1] * 100) + '%)';
    if (!animate) { void e.offsetWidth; e.style.transition = ''; }
  };
  P.makePiece = function (p, sq) {
    var e = el('div', 'piece', this.pieceLayer);
    e.style.backgroundImage = 'url("' + pieceUrl(p, this.opts.pieceSet) + '")';
    e.dataset.p = p;
    this.placeEl(e, sq, false);
    return e;
  };
  P.refreshPieceImages = function () {
    for (var sq in this.pieces) this.pieces[sq].style.backgroundImage = 'url("' + pieceUrl(this.pieces[sq].dataset.p, this.opts.pieceSet) + '")';
  };

  // Set position with smooth animation (matches moved pieces like Lichess does)
  P.setPosition = function (fen, animate) {
    if (animate === undefined) animate = true;
    var self = this, next = parseFen(fen), old = this.pieces, nextEls = {};
    var unmatchedOld = {}, need = [];
    for (var sq in old) {
      if (next[sq] === old[sq].dataset.p) {nextEls[sq] = old[sq];this.placeEl(old[sq],sq,animate);}
      else unmatchedOld[sq] = old[sq];
    }
    for (sq in next) if (!nextEls[sq]) need.push(sq);
    need.forEach(function (sq) {
      var best = null, bd = 99;
      for (var o in unmatchedOld) {
        if (unmatchedOld[o].dataset.p === next[sq]) { var d = dist(o, sq); if (d < bd) { bd = d; best = o; } }
      }
      if (best && animate) {
        var e = unmatchedOld[best]; delete unmatchedOld[best];
        e.classList.add('moving');
        self.placeEl(e, sq, true);
        setTimeout(function () { e.classList.remove('moving'); }, 260);
        nextEls[sq] = e;
      } else if (best) {
        var e2 = unmatchedOld[best]; delete unmatchedOld[best];
        self.placeEl(e2, sq, false); nextEls[sq] = e2;
      } else {
        var n = self.makePiece(next[sq], sq);
        if (animate) { n.classList.add('fade-in'); }
        nextEls[sq] = n;
      }
    });
    for (var o in unmatchedOld) {
      (function (e) {
        if (animate) { e.classList.add('fade-out'); setTimeout(function () { e.remove(); }, 250); }
        else e.remove();
      })(unmatchedOld[o]);
    }
    this.pieces = nextEls; this.map = next; this.fen = fen;
    this.select(null);
  };

  // ---------- decorations ----------
  P.clearSqClasses = function (cls) {
    for (var sq in this.sqEls) this.sqEls[sq].classList.remove(cls);
  };
  P.setLastMove = function (from, to) { this.lastMove = from ? [from, to] : null; this.redrawDecor(); };
  P.setCheck = function (sq) { this.checkSq = sq; this.redrawDecor(); };
  P.setMarks = function (marks) { this.marks = marks || {}; this.redrawDecor(); };
  P.setArrows = function (arrows) { this.arrows = arrows || []; this.drawArrows(); };
  P.setBadge = function (sq, text, color) { this.badge = sq ? { sq: sq, text: text, color: color } : null; this.drawBadge(); };
  P.clearDecor = function () { this.lastMove = null; this.checkSq = null; this.marks = {}; this.arrows = []; this.badge = null; this.redrawDecor(); };
  P.redrawDecor = function () {
    var self = this;
    ['last', 'check', 'mark-good', 'mark-bad', 'mark-hint', 'mark-blue', 'selected'].forEach(function (c) { self.clearSqClasses(c); });
    if (this.lastMove) { this.sqEls[this.lastMove[0]].classList.add('last'); this.sqEls[this.lastMove[1]].classList.add('last'); }
    if (this.checkSq) this.sqEls[this.checkSq].classList.add('check');
    for (var sq in (this.marks || {})) this.sqEls[sq] && this.sqEls[sq].classList.add('mark-' + this.marks[sq]);
    if (this.selected) this.sqEls[this.selected].classList.add('selected');
    this.drawArrows(); this.drawBadge();
  };
  P.drawBadge = function () {
    this.badgeLayer.innerHTML = '';
    if (!this.badge) return;
    var p = this.sqToPos(this.badge.sq);
    var b = el('div', 'sq-badge pop', this.badgeLayer);
    b.textContent = UI.strip(this.badge.text); if (/^~[ig]:[a-z-]+~$/.test(this.badge.text)) b.innerHTML = UI.markup(this.badge.text); if (/^~g:/.test(this.badge.text)) b.classList.add('svg-badge'); else b.style.background = this.badge.color;
    b.style.left = ((p[0] + 1) * 12.5) + '%'; b.style.top = (p[1] * 12.5) + '%';
  };
  var COLORS = { green: '#387b9c', red: '#dc2626', blue: '#2563eb', yellow: '#eab308', orange: '#ea580c', purple: '#9333ea' };
  P.drawArrows = function () {
    var svg = this.svg, self = this;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var defs = document.createElementNS(svg.namespaceURI, 'defs');
    Object.keys(COLORS).forEach(function (k) {
      defs.innerHTML += "<marker id='ah-" + k + "' markerWidth='4' markerHeight='4' refX='2.05' refY='2' orient='auto'><path d='M0,0 V4 L3,2 Z' fill='" + COLORS[k] + "'/></marker>";
    });
    svg.appendChild(defs);
    function L(a) { var A = self.sqToPos(a.from), B = self.sqToPos(a.to); return Math.hypot(A[0] - B[0], A[1] - B[1]); }
    (this.arrows || []).slice().sort(function (p, q) { return L(q) - L(p); }).forEach(function (a) {
      var A = self.sqToPos(a.from), B = self.sqToPos(a.to), col = a.color || 'green';
      var x1 = A[0] * 100 + 50, y1 = A[1] * 100 + 50, x2 = B[0] * 100 + 50, y2 = B[1] * 100 + 50;
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      if (!len) return;
      var ex = x2 - dx / len * 34, ey = y2 - dy / len * 34;
      var line = document.createElementNS(svg.namespaceURI, 'line');
      line.setAttribute('x1', x1 + dx / len * 18); line.setAttribute('y1', y1 + dy / len * 18);
      line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      line.setAttribute('stroke', COLORS[col] || col); line.setAttribute('stroke-width', a.width || 17);
      line.setAttribute('stroke-linecap', 'round'); line.setAttribute('opacity', a.opacity || 0.78);
      line.setAttribute('marker-end', 'url(#ah-' + col + ')');
      svg.appendChild(line);
    });
  };

  // ---------- input ----------
  P.canMove = function (sq) {
    var inputMap=this.opts.inputMap?this.opts.inputMap():this.map,p = inputMap[sq]; if (!p) return false;
    var mc = typeof this.opts.movable === 'function' ? this.opts.movable() : this.opts.movable;
    if (!mc) return false;
    return mc === 'both' || p[0] === mc;
  };
  P.dests = function (sq) { return this.opts.legalDests ? this.opts.legalDests(sq) : []; };
  P.select = function (sq) {
    var self = this;
    this.selected = sq;
    this.clearSqClasses('dest'); this.clearSqClasses('dest-cap');
    if (sq && this.opts.showDests !== false && (!window.APP_SETTINGS || APP_SETTINGS.legal !== false)) {
      this.dests(sq).forEach(function (d) { self.sqEls[d].classList.add(self.map[d] ? 'dest-cap' : 'dest'); });
    }
    this.redrawDecor();
  };
  P.eventSq = function (ev) {
    var r = this.root.getBoundingClientRect();
    var c = Math.floor((ev.clientX - r.left) / r.width * 8), rr = Math.floor((ev.clientY - r.top) / r.height * 8);
    if (c < 0 || c > 7 || rr < 0 || rr > 7) return null;
    return this.posToSq(c, rr);
  };
  P.bindInput = function () {
    var self = this, drag = null;
    this.root.addEventListener('pointerdown', function (ev) {
      if (self.promoEl) return;
      var sq = self.eventSq(ev); if (!sq) return;
      ev.preventDefault();
      if(self.opts.onSelectSquare&&self.opts.onSelectSquare(sq)===false)return;
      if (self.opts.onSquare) { self.opts.onSquare(sq, self.sqEls[sq]); return; }
      if (self.selected && self.selected !== sq && self.dests(self.selected).indexOf(sq) >= 0) {
        self.tryMove(self.selected, sq); return;
      }
      if (self.canMove(sq)) {
        var wasSel = self.selected === sq;
        self.select(sq);
        var pe = self.opts.inputPiece?self.opts.inputPiece(sq):self.pieces[sq];if(!pe){self.select(null);return;}
        var r = self.root.getBoundingClientRect();
        drag = { from: sq, el: pe, sx: ev.clientX, sy: ev.clientY, moved: false, wasSel: wasSel, size: r.width / 8 };
        try { self.root.setPointerCapture(ev.pointerId); } catch (e) { }
      } else {
        self.select(null);
      }
    });
    this.root.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      if (!self.canMove(drag.from)) { var d0 = drag; drag = null; d0.el.classList.remove('dragging'); self.placeEl(d0.el, d0.from, true); self.select(null); self.clearSqClasses('hover'); return; }
      var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      drag.moved = true;
      var p = self.sqToPos(drag.from);
      drag.el.classList.add('dragging');
      drag.el.style.transition = 'none';
      drag.el.style.transform = 'translate(' + (p[0] * drag.size + dx) + 'px,' + (p[1] * drag.size + dy - drag.size * 0.25) + 'px) scale(1.15)';
      var over = self.eventSq(ev);
      self.clearSqClasses('hover'); if (over) self.sqEls[over].classList.add('hover');
    });
    function end(ev) {
      if (!drag) return;
      var d = drag; drag = null;
      self.clearSqClasses('hover');
      d.el.classList.remove('dragging');
      if (d.moved) {
        var to = self.eventSq(ev);
        if (to && to !== d.from && self.dests(d.from).indexOf(to) >= 0) {
          self.placeEl(d.el, to, false);
          self.tryMove(d.from, to, true);
        } else {
          self.placeEl(d.el, d.from, true);
        }
      } else if (d.wasSel) { self.select(null); }
    }
    this.root.addEventListener('pointerup', end);
    function cancelDrag(){if(!drag)return;var d=drag;drag=null;d.el.classList.remove('dragging');self.placeEl(d.el,d.from,true);self.select(null);self.clearSqClasses('hover');}
    this.root.addEventListener('pointercancel', cancelDrag);this.root.addEventListener('lostpointercapture',cancelDrag);
  };
  P.tryMove = function (from, to, dragged) {
    var self = this, p = this.map[from];
    if (!this.canMove(from) || this.promoEl) { this.select(null); if (this.fen) this.setPosition(this.fen, true); return; } // input locked or not your piece (re-checked at drop time)
    var nowT = Date.now(); if (nowT - (this._lastMoveT || 0) < 120) {var inputEl=this.opts.inputPiece?this.opts.inputPiece(from):this.pieces[from];if(inputEl)this.placeEl(inputEl,from,true);if(this.fen)this.setPosition(this.fen,true);return;} this._lastMoveT = nowT;
    this.select(null);
    var isPromo = p && p[1] === 'P' && (to[1] === '8' || to[1] === '1');
    var go = function (promo) {
      var ok = self.opts.onMove ? self.opts.onMove(from, to, promo) : true;
      if (ok === false) { if (self.fen) self.setPosition(self.fen, true); }
    };
    if(self.opts.premove&&self.opts.premove()){go('q');return;}
    if (isPromo) this.askPromotion(p[0], to, go); else go();
  };
  P.askPromotion = function (color, to, cb) {
    var self = this, box = el('div', 'promo', this.root);
    this.promoEl = box;
    ['Q', 'N', 'R', 'B'].forEach(function (t) {
      var b = el('button', 'promo-btn', box);
      b.style.backgroundImage = 'url("' + pieceUrl(color + t, self.opts.pieceSet) + '")';
      b.setAttribute('aria-label', t);
      b.onclick = function (e) { e.stopPropagation(); box.remove(); self.promoEl = null; cb(t.toLowerCase()); };
    });
    var x = el('button', 'promo-cancel', box); x.textContent = '~i:close~';
    x.onclick = function (e) { e.stopPropagation(); box.remove(); self.promoEl = null; self.setPosition(self.fen, true); };
  };
  P.flash = function (sq, cls) {
    var s = this.sqEls[sq]; if (!s) return;
    s.classList.add(cls); setTimeout(function () { s.classList.remove(cls); }, 700);
  };
  P.shake = function () { var r = this.root; r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); };

  window.Board = Board;
})();
