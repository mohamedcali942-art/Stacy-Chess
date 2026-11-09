/* Stacy Chess · v8 Customize
   Four independent choices, all saved in settings and all previewed before they apply:
   - layout     : 'path' (v7 timeline, default) · 'focus' (dashboard) · 'gallery' (featured shelf)
                  — three different screen templates for Home and Learn, not one DOM restyled.
   - theme      : Light (ice) · Dark (midnight) — independent of layout.
   - boardColors: neutral (follows theme) · slate · stone · wood · green · contrast
   - pieceSet   : cburnett (Classic) + six open-licensed lichess sets (piecesets.js, all embedded; v12)
   Customize keeps a private draft; Cancel/Back/leaving discards it; only Apply writes settings.
   Progress is never touched. The preview renders your real plan in an inert frame and says so. */
(function () {
  'use strict';
  var U = App.ui, esc = function (t) { return App.esc ? App.esc(String(t == null ? '' : t)) : String(t); };
  App.LAYOUTS = [
    { id: 'path', name: 'Path', sub: 'One timeline: today’s steps in order, then everything else.' },
    { id: 'focus', name: 'Focus', sub: 'Dashboard: a summary card, quick category pills and a two-column grid of activities.' },
    { id: 'gallery', name: 'Gallery', sub: 'Featured shelf: a curved header, swipeable featured cards, category tabs and larger cards.' }
  ];
  App.BOARD_COLORS = [
    { id: 'neutral', name: 'Neutral', sub: 'Follows Light/Dark' },
    { id: 'slate', name: 'Slate', light: '#dde3ea', dark: '#7a8b9d' },
    { id: 'stone', name: 'Stone', light: '#e7e3dc', dark: '#9b9283' },
    { id: 'wood', name: 'Wood', light: '#ead2ab', dark: '#b0784a' },
    { id: 'green', name: 'Green', light: '#ebecd0', dark: '#739552' },
    { id: 'contrast', name: 'High contrast', light: '#ffffff', dark: '#737373' }
  ];
  var LAYOUT_IDS = App.LAYOUTS.map(function (l) { return l.id; }), BOARD_IDS = App.BOARD_COLORS.map(function (b) { return b.id; });
  /* Normalise saved settings once (old remote Lichess piece names → Classic; unknown values → defaults). */
  App.normaliseLook = function (s) {
    s = s || App.state.settings;
    if (LAYOUT_IDS.indexOf(s.layout) < 0) s.layout = 'path';
    if (BOARD_IDS.indexOf(s.boardColors) < 0) s.boardColors = 'neutral';
    if ((window.REMOVED_PIECE_SETS || []).indexOf(s.pieceSet) >= 0) { s.pieceSetMovedFrom = s.pieceSet; s.pieceSet = 'cburnett'; } // v12: Stacy Geo/Block removed → Classic
    if (!(window.PIECE_SETS && window.PIECE_SETS[s.pieceSet])) s.pieceSet = 'cburnett';
    if (['ice', 'midnight'].indexOf(s.theme) < 0) s.theme = 'ice';
    return s;
  };
  App.normaliseLook();
  var baseApply = App.applySettings;
  App.applySettings = function () {
    baseApply.apply(this, arguments); var s = App.normaliseLook(), d = document.documentElement.dataset;
    if (s.boardColors === 'neutral') delete d.boardc; else d.boardc = s.boardColors;
    d.layout = s.layout;
  };
  App.layout = function () { return App.normaliseLook().layout; };

  /* ---------- shared data for layout templates (all real, from saved state) ---------- */
  function greet() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function homeData() {
    var s = App.state, plan = App.ensurePlan(), total = plan.tasks.length, idx = plan.completed ? total : (plan.index || 0);
    return { s: s, plan: plan, total: total, idx: idx, done: plan.tasks.filter(function (t, i) { return t.complete || i < idx; }).length, cur: plan.completed ? null : plan.tasks[idx],
      label: plan.completed ? 'Play for fun' : !plan.started ? 'Start today' : 'Continue step ' + (idx + 1), name: s.settings.name || '', score: App.stacyScore(), streak: (s.streak || {}).days || 0, rating: App.realRating() };
  }
  function startPlan() { var plan = App.ensurePlan(); if (plan.completed) { App.go('playhub'); return; } if (!plan.started) { plan.started = true; var t = plan.tasks[plan.index || 0]; if (t) t.started = true; App.save(); } App.go('today'); }
  App.startPlan = startPlan;
  function courseInfo() { return OPENINGS.map(function (c) { var n = c.lines.filter(function (l) { return App.state.learned[l.id]; }).length, due = c.lines.filter(function (l) { return App.state.srs[l.id] && App.state.srs[l.id].due <= Date.now(); }).length; return { c: c, n: n, total: c.lines.length, due: due }; }); }
  /* Static mini board (SVG) for thumbnails. Squares use the live CSS board variables and pieces use
     the chosen set, so it follows board colours/pieces (and the Customize draft inside the preview). */
  var fenCache = {};
  App.lineFen = function (line, plies) { var k = line.id + ':' + plies; if (fenCache[k]) return fenCache[k]; var g = new Chess(); (line.moves || '').split(/\s+/).slice(0, plies).forEach(function (m) { if (m) g.move(m); }); return (fenCache[k] = g.fen()); };
  App.miniBoard = function (fen, o) {
    o = o || {}; var map = window.parseFenMap ? parseFenMap(fen) : {}, flip = o.orientation === 'b', out = '<svg class="mini-svg" viewBox="0 0 8 8" role="img" aria-label="' + esc(o.label || 'Board thumbnail') + '" preserveAspectRatio="xMidYMid meet">';
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { var file = flip ? 7 - f : f, rank = flip ? r + 1 : 8 - r, sq = 'abcdefgh'[file] + rank, light = (file + rank) % 2 === 0; // a1 (0+1) is dark, h1 (7+1) is light
      out += '<rect x="' + f + '" y="' + r + '" width="1" height="1" style="fill:var(' + (light ? '--sq-light' : '--sq-dark') + ')"/>';
      if (map[sq]) out += '<image href="' + pieceUrl(map[sq], o.pieceSet) + '" x="' + f + '" y="' + r + '" width="1" height="1"/>'; }
    return out + '</svg>';
  };
  function pv(o) { return o && o.preview; }
  function go(o, route) { return pv(o) ? ' tabindex="-1"' : ' data-go="' + route + '"'; }
  function wire(el) { [].forEach.call(el.querySelectorAll('[data-go]'), function (b) { b.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); App.go(b.dataset.go); }; }); var p = el.querySelector('[data-plan]'); if (p) p.onclick = startPlan; }
  var STEP_IC = { opening: 'book', tactics: 'tactics', calc: 'brain', endgame: 'king', game: 'pawn', blunder: 'shield', review: 'repeat' };

  /* ---------- Home · Focus dashboard ---------- */
  App.homeFocusHTML = function (o) {
    var d = homeData(), cur = d.cur, s = d.s;
    var pills = [['Openings', 'learn', 'book'], ['Tactics', 'tactics', 'tactics'], ['Endgames', 'endgames', 'king'], ['Calculation', 'calc', 'brain'], ['Play', 'playhub', 'pawn'], ['Review', 'games', 'search']];
    var steps = d.plan.tasks.map(function (t, i) { var st = (t.complete || i < d.idx) ? 'done' : i === d.idx ? 'now' : 'next'; return '<div class="fx-card step ' + st + '"><span class="fx-ic">~i:' + (t.icon || STEP_IC[t.type] || 'spark') + '~</span><span class="fx-state">' + (st === 'done' ? '✓ Done' : st === 'now' ? 'Now' : 'Step ' + (i + 1)) + '</span><b>' + esc(t.name) + '</b></div>'; }).join('');
    return '<div class="lay-focus' + (pv(o) ? ' is-preview' : '') + '">' +
      '<header class="fx-head"><div><span class="eyebrow">' + esc(U.dateLabel()) + '</span><h1 class="fx-hello">' + greet() + (d.name ? ', ' + esc(d.name) : '') + '</h1></div><span class="fx-avatar" aria-hidden="true">' + esc((d.name || 'S').charAt(0).toUpperCase()) + '</span></header>' +
      '<section class="fx-summary ink" aria-label="Today"><div class="fx-sum-top"><span class="eyebrow">Today</span><span class="fx-count">' + d.done + ' / ' + d.total + ' done</span></div>' +
      '<b class="fx-sum-title">' + (cur ? esc(cur.name) : 'Session complete') + '</b><p class="small fx-sum-why">' + (cur ? esc(cur.reason || '') : 'Bring one idea into your next real game.') + '</p>' +
      '<div class="fx-dots" aria-hidden="true">' + d.plan.tasks.map(function (t, i) { return '<i class="' + ((t.complete || i < d.idx) ? 'done' : i === d.idx ? 'now' : '') + '"></i>'; }).join('') + '</div>' +
      '<button type="button" class="btn primary fx-go"' + (pv(o) ? ' tabindex="-1"' : ' data-plan="1"') + '>~i:play~ ' + d.label + '</button></section>' +
      '<div class="fx-pills" role="list" aria-label="Go to">' + pills.map(function (p) { return '<button type="button" role="listitem" class="fx-pill"' + go(o, p[1]) + '>~i:' + p[2] + '~ ' + p[0] + '</button>'; }).join('') + '</div>' +
      '<h3 class="section-label fx-label">Today’s steps</h3><div class="fx-grid">' + steps + '</div>' +
      '<h3 class="section-label fx-label">You</h3><div class="fx-grid">' +
      '<button type="button" class="fx-card stat"' + go(o, 'me') + '><span class="fx-ic">~i:chart~</span><span class="fx-big">' + d.score + '</span><b>Stacy rating</b></button>' +
      '<button type="button" class="fx-card stat"' + go(o, 'me') + '><span class="fx-ic">~i:streak~</span><span class="fx-big">' + d.streak + '</span><b>Day streak</b></button>' +
      '<button type="button" class="fx-card"' + go(o, 'weekly') + '><span class="fx-ic">~i:award~</span><b>Weekly report</b><small>' + esc(App.weeklyHeadline ? App.weeklyHeadline() : 'Evidence builds through the week') + '</small></button>' +
      '<button type="button" class="fx-card"' + go(o, 'path') + '><span class="fx-ic">~i:map~</span><b>Roadmap & goal</b><small>' + esc(App.goal() ? App.goal() + ' goal · no guaranteed timeline' : 'Set a goal when you are ready') + '</small></button>' +
      (s.activeGame ? '<button type="button" class="fx-card wide"' + go(o, 'play') + '><span class="fx-ic">~i:pawn~</span><b>Unfinished game</b><small>Continue where you left off</small></button>' : '') +
      '</div></div>';
  };
  /* ---------- Home · Gallery ---------- */
  var galleryCat = 'openings';
  App.homeGalleryHTML = function (o) {
    var d = homeData(), cur = d.cur, info = courseInfo(), set = o && o.pieceSet;
    var feat = '<article class="gx-feature now"><span class="eyebrow">' + (cur ? 'Today · step ' + (d.idx + 1) + ' of ' + d.total : 'Today · complete') + '</span><b>' + (cur ? esc(cur.name) : 'Play for fun') + '</b><small>' + (cur ? esc(cur.reason || '') : 'Your plan is done for today.') + '</small><button type="button" class="btn primary sm"' + (pv(o) ? ' tabindex="-1"' : ' data-plan="1"') + '>~i:play~ ' + d.label + '</button></article>' +
      info.map(function (x) { var l = x.c.lines[0]; return '<button type="button" class="gx-feature course"' + go(o, 'course/' + x.c.id) + '><span class="gx-thumb">' + App.miniBoard(App.lineFen(l, 8), { orientation: x.c.color, pieceSet: set, label: x.c.name + ' after four moves' }) + '</span><b>' + esc(x.c.name) + '</b><small>' + (x.c.color === 'w' ? 'White' : 'Black') + ' · ' + x.n + '/' + x.total + ' lines</small></button>'; }).join('');
    return '<div class="lay-gallery' + (pv(o) ? ' is-preview' : '') + '">' +
      '<header class="gx-head ink"><span class="eyebrow">' + esc(U.dateLabel()) + '</span><h1 class="gx-hello">' + greet() + (d.name ? ', ' + esc(d.name) : '') + '</h1>' +
      '<div class="gx-stats"><span class="pill-stat"><b>' + d.score + '</b> Stacy rating</span><span class="pill-stat"><b>' + d.streak + '</b> day streak</span><span class="pill-stat"><b>' + d.done + '/' + d.total + '</b> today</span></div></header>' +
      '<h3 class="section-label gx-label">Featured</h3><div class="gx-shelf" role="list">' + feat + '</div>' +
      '<div class="seg block gx-cats" role="tablist" aria-label="Categories"><span class="seg-ind" aria-hidden="true"></span>' + [['openings', 'Openings'], ['skills', 'Skills'], ['play', 'Play']].map(function (c) { var on = c[0] === galleryCat; return '<button type="button" role="tab" data-cat="' + c[0] + '" class="' + (on ? 'on' : '') + '" aria-selected="' + on + '"' + (pv(o) ? ' tabindex="-1"' : '') + '>' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="gx-grid" id="' + (pv(o) ? '' : 'gxGrid') + '">' + galleryCards(galleryCat, o) + '</div></div>';
  };
  function galleryCards(cat, o) {
    var s = App.state.stats || {}, pct = App.hubs && App.hubs.pct;
    function card(route, ic, name, sub) { return '<button type="button" class="gx-card"' + go(o, route) + '><span class="fx-ic">~i:' + ic + '~</span><b>' + name + '</b><small>' + sub + '</small></button>'; }
    if (cat === 'skills') return card('tactics', 'tactics', 'Tactics', (App.state.tacticsRating || 800) + ' rating') + card('calc', 'brain', 'Calculation', pct && pct(s.calc) != null ? pct(s.calc) + '% correct' : 'See moves ahead') + card('blunder', 'shield', 'Blunder Check', pct && pct(s.blunder) != null ? pct(s.blunder) + '% correct' : 'Catch danger') + card('endgames', 'king', 'Endgames', Object.keys(s.endgames || {}).length + ' done') + card('daily', 'sun', 'Daily puzzle', 'One a day') + card('coords', 'target', 'Coordinates', 'Board vision');
    if (cat === 'play') return card('play', 'pawn', 'Play a bot', (App.BOTS || []).length + ' opponents') + card('analysis', 'analysis', 'Analysis board', 'Any position') + card('games', 'search', 'Game Review', (App.state.games || []).length + ' saved games') + card('mistakes', 'close', 'My mistakes', (App.state.mistakes || []).length + ' to fix');
    return courseInfo().map(function (x) { return '<button type="button" class="gx-card"' + go(o, 'course/' + x.c.id) + '><span class="fx-ic">~i:book~</span><b>' + esc(x.c.name) + '</b><small>' + x.n + '/' + x.total + ' lines' + (x.due ? ' · ' + x.due + ' due' : '') + '</small><span class="sk-bar" aria-hidden="true"><i style="width:' + Math.round(x.n / Math.max(1, x.total) * 100) + '%"></i></span></button>'; }).join('');
  }
  function wireGallery(el) {
    var seg = el.querySelector('.gx-cats'), grid = el.querySelector('#gxGrid'); if (!seg || !grid) return; var btns = [].slice.call(seg.querySelectorAll('button')), ind = seg.querySelector('.seg-ind');
    function mark() { btns.forEach(function (b) { var on = b.dataset.cat === galleryCat; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }); var on = btns.find(function (b) { return b.classList.contains('on'); }); if (on && U.movePill) U.movePill(ind, on); }
    seg.classList.add('has-ind'); mark();
    btns.forEach(function (b, i) { b.onclick = function () { if (b.dataset.cat === galleryCat) return; var from = btns.findIndex(function (x) { return x.dataset.cat === galleryCat; }); galleryCat = b.dataset.cat; mark(); grid.innerHTML = galleryCards(galleryCat); wire(grid); if (U.swap) U.swap(grid, i > from ? 1 : -1); }; });
  }
  /* ---------- Home render dispatch ---------- */
  var homePath = App.screens.home.render;
  App.renderHome = function (el, layout) {
    layout = layout || App.layout(); if (App.normalizePlan) App.normalizePlan(App.ensurePlan());
    if (App.showRatingSummary && el && el.isConnected !== false) setTimeout(function () { if (App.current === 'home' || /#\/home|^#?$/.test(location.hash)) App.showRatingSummary(); }, 300);
    if (layout === 'focus') { el.innerHTML = App.homeFocusHTML(); wire(el); }
    else if (layout === 'gallery') { el.innerHTML = App.homeGalleryHTML(); wire(el); wireGallery(el); }
    else homePath.call(App.screens.home, el);
    // v12: brand-new players see their next "Chess from zero" lesson first (every layout)
    if (App.experience && App.experience() === 'new' && App.basicsProgress) { var bp = App.basicsProgress(); if (bp.next) { var bc = App.html('<div class="card e3" id="basicsCard"><b>Chess from zero · ' + bp.done + ' of ' + bp.total + ' lessons</b><p class="small muted">Next: ' + App.esc(bp.next.title) + '. Learn it in a few minutes, then practise on the board.</p><div class="btn-row"><button class="btn primary" id="basicsGo">' + (bp.done ? 'Continue' : 'Start') + ' lesson</button></div></div>'); el.insertBefore(bc, el.firstChild); App.q(bc, '#basicsGo').onclick = function () { App.go('basic/' + bp.next.id); }; } }
  };
  App.screens.home.render = function (el) { App.renderHome(el); };

  /* ---------- Learn layouts ---------- */
  var learnPath = App.screens.learn.render;
  App.learnHTML = function (layout, o) {
    var info = courseInfo(), due = App.dueLines ? App.dueLines().length : 0, set = o && o.pieceSet;
    var dueRow = due ? '<button type="button" class="tool-row"' + go(o, 'srs') + '><span class="tool-ic" aria-hidden="true">~i:repeat~</span><span class="tool-text"><b>' + due + ' lines ready to review</b><small>A quick refresh before something new</small></span><span class="chev" aria-hidden="true">›</span></button>' : '';
    if (layout === 'focus') return dueRow + '<div class="fx-grid learn">' + info.map(function (x) { return '<button type="button" class="fx-card course"' + go(o, 'course/' + x.c.id) + '><span class="fx-ic">~i:book~</span><span class="fx-state">' + (x.c.color === 'w' ? 'White' : 'Black') + '</span><b>' + esc(x.c.name) + '</b><small>' + x.n + '/' + x.total + ' lines' + (x.due ? ' · ' + x.due + ' due' : '') + '</small><span class="sk-bar" aria-hidden="true"><i style="width:' + Math.round(x.n / Math.max(1, x.total) * 100) + '%"></i></span></button>'; }).join('') + '</div>';
    return dueRow + '<div class="gx-shelf learn" role="list">' + info.map(function (x) { var l = x.c.lines[0]; return '<button type="button" class="gx-feature course"' + go(o, 'course/' + x.c.id) + '><span class="gx-thumb">' + App.miniBoard(App.lineFen(l, 8), { orientation: x.c.color, pieceSet: set, label: x.c.name + ' after four moves' }) + '</span><b>' + esc(x.c.name) + '</b><small>' + esc(x.c.tagline) + '</small><small>' + x.n + '/' + x.total + ' lines</small></button>'; }).join('') + '</div>';
  };
  App.screens.learn.render = function (el, p) {
    var layout = App.layout(); if (layout === 'path') learnPath.call(App.screens.learn, el, p);
    else {
    el.innerHTML = U.head({ eyebrow: 'Learn', title: 'Opening paths', sub: layout === 'focus' ? 'Your courses at a glance.' : 'Swipe through your courses.', selector: U.switcher(U.LEARN_TABS, 'openings', 'Learn sections') });
    el.appendChild(App.html('<div class="lay-' + layout + ' learn-body">' + App.learnHTML(layout) + '</div>')); wire(el.querySelector('.learn-body')); U.wireSwitcher(el);
    }
    // v12: "Chess from zero" is always one tap away in Learn (first for brand-new players)
    if (App.basicsProgress && !el.querySelector('#learnBasics')) { var bp = App.basicsProgress(), nb = App.html('<button type="button" class="link-row" id="learnBasics"><span>Chess from zero</span><small>' + (bp.done >= bp.total ? 'All ' + bp.total + ' rules lessons done · repeat any' : bp.done + ' of ' + bp.total + ' rules lessons · board, pieces, check, checkmate') + '</small></button>'); nb.onclick = function () { App.go('basics'); }; var newbie = App.experience && App.experience() === 'new'; var anchor = el.querySelector('.learn-body') || el.lastChild; if (newbie && el.children[1]) el.insertBefore(nb, el.children[1]); else el.appendChild(nb); }
  };
  App.screens.openings.render = App.screens.learn.render;

  /* ---------- Customize screen ---------- */
  var draft = null;
  function current() { var s = App.normaliseLook(); return { layout: s.layout, theme: s.theme, boardColors: s.boardColors, pieceSet: s.pieceSet }; }
  App.customizeDraft = function () { return draft; };
  function changed() { var c = current(); return Object.keys(c).some(function (k) { return c[k] !== draft[k]; }); }
  function opt(group, id, on, inner, label) { return '<button type="button" role="radio" class="cz-opt" data-group="' + group + '" data-id="' + id + '" aria-checked="' + on + '"' + (on ? ' data-on="1"' : '') + ' aria-label="' + esc(label) + '">' + inner + '</button>'; }
  function swatch(b) { var l = b.light || null, d = b.dark || null; return '<span class="cz-swatch"' + (b.id === 'neutral' ? ' data-theme="' + (draft ? draft.theme : App.state.settings.theme) + '"' : ' data-boardc="' + b.id + '"') + '><i style="background:var(--sq-light)"></i><i style="background:var(--sq-dark)"></i><i style="background:var(--sq-dark)"></i><i style="background:var(--sq-light)"></i></span>'; }
  function piecesRow(id) { return '<span class="cz-pieces">' + ['wK', 'wN', 'bQ', 'bP'].map(function (p) { return '<img alt="" src="' + pieceUrl(p, id) + '">'; }).join('') + '</span>'; }
  App.customizeOptionsHTML = function (d) {
    var sets = window.PIECE_SET_IDS || ['cburnett'];
    return '<section class="cz-group" aria-labelledby="czL"><h3 class="section-label" id="czL">Layout</h3><div class="cz-opts layouts" role="radiogroup" aria-labelledby="czL">' + App.LAYOUTS.map(function (l) { return opt('layout', l.id, d.layout === l.id, '<span class="cz-lay ' + l.id + '" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>' + l.name + '</b><small>' + l.sub + '</small>', l.name + ' layout'); }).join('') + '</div></section>' +
      '<section class="cz-group" aria-labelledby="czT"><h3 class="section-label" id="czT">Theme</h3><div class="cz-opts two" role="radiogroup" aria-labelledby="czT">' + [['ice', 'Light'], ['midnight', 'Dark']].map(function (t) { return opt('theme', t[0], d.theme === t[0], '<span class="cz-theme" data-theme="' + t[0] + '" aria-hidden="true"><i></i><i></i></span><b>' + t[1] + '</b>', t[1] + ' theme'); }).join('') + '</div></section>' +
      '<section class="cz-group" aria-labelledby="czB"><h3 class="section-label" id="czB">Board colours</h3><div class="cz-opts three" role="radiogroup" aria-labelledby="czB" data-theme="' + d.theme + '">' + App.BOARD_COLORS.map(function (b) { return opt('boardColors', b.id, d.boardColors === b.id, swatch(b) + '<b>' + b.name + '</b>' + (b.sub ? '<small>' + b.sub + '</small>' : ''), b.name + ' board'); }).join('') + '</div></section>' +
      '<section class="cz-group" aria-labelledby="czP"><h3 class="section-label" id="czP">Pieces</h3><div class="cz-opts three" role="radiogroup" aria-labelledby="czP">' + sets.map(function (id) { var st = window.PIECE_SETS[id]; return opt('pieceSet', id, d.pieceSet === id, piecesRow(id) + '<b>' + esc(st.name) + '</b><small>' + esc(st.credit) + '</small>', st.name + ' pieces'); }).join('') + '</div><p class="tiny muted" style="margin-top:8px">Piece artwork: Classic by Colin M. L. Burnett; Merida by Armando Hernandez Marroquin; Chessnut by Alexis Luengas; Pirouetti by pirouetti; Fantasy, Celtic and Spatial by Maurizio Monge. All as published by the lichess.org project, under GPLv2+, Apache 2.0, AGPLv3+ and MIT licences (see THIRD_PARTY.md). Stacy Geo and Stacy Block were removed in v12.</p></section>';
  };
  var PREVIEW_FEN = 'r1bqk2r/pppp1Bpp/2n2n2/2b1p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4';
  App.register('customize', { title: 'Customize', back: 'settings', nav: 'settings', render: function (el) {
    draft = current(); var board = null;
    el.innerHTML = U.head({ eyebrow: 'Settings', title: 'Customize', sub: 'Preview first. Nothing changes until you press Apply.' }) +
      '<section class="cz-preview" id="czPreview" aria-label="Preview"><div class="cz-badge">Preview · your real plan, no new scores</div><div class="cz-frame" inert aria-hidden="true"><div class="cz-screen"></div></div><div class="cz-board-wrap"><div class="cz-board"></div><p class="tiny cz-board-note">Last move, check and a hint arrow, so you can judge contrast.</p></div></section>' +
      '<div id="czOptions"></div><div class="cz-bar"><button type="button" class="btn" id="czCancel">Cancel</button><button type="button" class="btn primary" id="czApply" disabled>Apply</button></div>';
    var prev = el.querySelector('#czPreview'), screen = el.querySelector('.cz-screen'), opts = el.querySelector('#czOptions'), apply = el.querySelector('#czApply');
    function paintPreview() {
      prev.setAttribute('data-theme', draft.theme); if (draft.boardColors === 'neutral') prev.removeAttribute('data-boardc'); else prev.setAttribute('data-boardc', draft.boardColors);
      var o = { preview: true, pieceSet: draft.pieceSet };
      screen.innerHTML = draft.layout === 'focus' ? App.homeFocusHTML(o) : draft.layout === 'gallery' ? App.homeGalleryHTML(o) : '<div class="lay-path is-preview">' + pathPreview() + '</div>';
      if (!board) { try { board = new Board(prev.querySelector('.cz-board'), { orientation: 'w', coords: true, pieceSet: draft.pieceSet, movable: function () { return null; }, legalDests: function () { return []; }, onMove: function () { return false; } }); } catch (e) { board = null; } }
      if (board) { board.opts.pieceSet = draft.pieceSet; board.setPosition(PREVIEW_FEN, false); if (board.refreshPieceImages) board.refreshPieceImages(); if (board.setLastMove) board.setLastMove('c4', 'f7'); if (board.setCheck) board.setCheck('e8'); if (board.setArrows) board.setArrows([{ from: 'e8', to: 'f7', color: 'green' }]); }
      apply.disabled = !changed();
    }
    function pathPreview() { var d = homeData(); return U.head({ eyebrow: U.dateLabel(), title: greet() + (d.name ? ', ' + esc(d.name) : ''), sub: 'Your plan: ' + esc(App.homePlanLine ? App.homePlanLine() : 'five short steps') }) + U.panel({ id: 'pvToday', title: 'Today', aside: d.done + ' / ' + d.total + ' done', body: App.planTimeline(d.plan, { id: 'pvTimeline', action: '<span class="btn primary">~i:play~ ' + d.label + '</span>' }) }); }
    function paintOptions() { opts.innerHTML = App.customizeOptionsHTML(draft);
      [].forEach.call(opts.querySelectorAll('.cz-opt'), function (b) { b.onclick = function () { draft[b.dataset.group] = b.dataset.id; var focusKey = b.dataset.group + ':' + b.dataset.id; paintOptions(); paintPreview(); var nb = opts.querySelector('.cz-opt[data-group="' + b.dataset.group + '"][data-id="' + b.dataset.id + '"]'); if (nb) try { nb.focus({ preventScroll: true }); } catch (e) { } if (prev.animate && !(App.motion && App.motion.reduced())) try { screen.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180, easing: 'linear' }); } catch (e) { } }; }); }
    paintOptions(); paintPreview();
    el.querySelector('#czCancel').onclick = function () { draft = null; App.back(); };
    apply.onclick = function () { if (!changed()) return; var s = App.state.settings; s.layout = draft.layout; s.theme = draft.theme; s.boardColors = draft.boardColors; s.pieceSet = draft.pieceSet; App.normaliseLook(s); window.APP_SETTINGS = s; App.applySettings(); App.saveNow(); App.toast && App.toast('Applied: ' + (App.LAYOUTS.find(function (l) { return l.id === s.layout; }) || {}).name + ' layout', 'ok'); App.route(); };
  }, leave: function () { draft = null; } });

  /* Entry points: Menu ("Customize") and Settings (replaces the old theme/pieces controls). */
  if (U.NAV && !U.NAV.some(function (n) { return n.go === 'customize'; })) { var si = U.NAV.findIndex(function (n) { return n.go === 'settings'; }); U.NAV.splice(si < 0 ? U.NAV.length : si, 0, { go: 'customize', label: 'Customize', sub: 'Layout, theme, board, pieces', ic: 'layers', route: 'customize', group: 'more' }); }
  if (U.NAV && !U.NAV.some(function (n) { return n.go === 'engine-check'; })) { var ci = U.NAV.findIndex(function (n) { return n.go === 'settings'; }); U.NAV.splice(ci < 0 ? U.NAV.length : ci + 1, 0, { go: 'engine-check', label: 'Engine check', sub: 'Is the chess engine working on this device?', ic: 'search', route: 'engine-check', group: 'more' }); } // v12
})();
