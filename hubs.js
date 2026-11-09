/* Stacy Chess · v7 hub information architecture
   Each hub now has its own structure instead of the same black list everywhere:
   - Learn (opening paths)   : unchanged path timeline (curriculum.js) — a sequence, so a timeline.
   - Skills                  : a skill board. Tactics is the large live tile (rating + quick modes),
                               "think before you move" trainers are a 2×2 square grid with real
                               accuracy, endgames a progress tile, board vision a compact tile.
   - Tactics (theme picker)  : rating header, one "Mixed" start, a "Needs work" strip computed from
                               your own theme results, then a dense theme grid with accuracy bars.
   - Play                    : a bot shelf (horizontal cards with approximate strength) and a tool
                               grid (analysis, review, mistakes) with live counts.
   All numbers come from saved progress; nothing is invented. */
(function () {
  'use strict';
  var U = App.ui, esc = function (t) { return App.esc ? App.esc(String(t == null ? '' : t)) : String(t); };
  function st() { return App.state || {}; }
  function stats() { return st().stats || {}; }
  function pct(pair) { pair = pair || [0, 0]; var n = (pair[0] || 0) + (pair[1] || 0); return n ? Math.round(pair[0] / n * 100) : null; }
  function tries(pair) { pair = pair || [0, 0]; return (pair[0] || 0) + (pair[1] || 0); }
  function wire(el) { [].forEach.call(el.querySelectorAll('[data-go]'), function (b) { if (b.closest && b.closest('.switcher')) return; b.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); App.go(b.dataset.go); }; }); }
  App.hubs = { pct: pct };

  /* ---------- Skills: skill board ---------- */
  App.skillBoardHTML = function () {
    var s = stats(), rating = st().tacticsRating || 800, eg = App.ENDGAMES || [], egDone = eg.filter(function (e) { return s.endgames && s.endgames[e.id]; }).length;
    function sq(go, ic, name, pair, hint) { var p = pct(pair), n = tries(pair); return '<button type="button" class="sk-tile sq" data-go="' + go + '"><span class="sk-ic">~i:' + ic + '~</span><b>' + name + '</b><span class="sk-stat">' + (p == null ? hint : p + '%<small> of ' + n + '</small>') + '</span></button>'; }
    return '<section class="sk-board" aria-label="Skill board">' +
      '<div class="sk-tile hero ink" role="group" aria-label="Tactics"><div class="sk-hero-top"><span class="sk-ic">~i:tactics~</span><span class="eyebrow">Tactics</span></div>' +
      '<div class="sk-big"><b>' + rating + '</b><span>tactics rating</span></div>' +
      '<div class="sk-pills"><span class="pill-stat"><b>' + (s.rushBest || 0) + '</b> Rush best</span><span class="pill-stat"><b>' + (s.stormBest || 0) + '</b> Streak best</span><span class="pill-stat"><b>' + (s.solved || 0) + '</b> solved</span></div>' +
      '<div class="sk-actions"><button type="button" class="btn primary" data-go="tactics">Train by theme</button><button type="button" class="btn sm" data-go="daily">~i:sun~ Daily</button><button type="button" class="btn sm" data-go="rush">~i:bolt~ Rush</button><button type="button" class="btn sm" data-go="streak">~i:streak~ Streak</button></div></div>' +
      '<h3 class="section-label sk-label">Think before you move</h3>' +
      '<div class="sk-grid">' + sq('calc', 'brain', 'Calculation', s.calc, 'See moves ahead') + sq('blunder', 'shield', 'Blunder Check', s.blunder, 'Catch danger') + sq('traps', 'trap', 'Spot the Trap', s.traps, 'Opening tricks') + '<button type="button" class="sk-tile sq" data-go="tactics/slow"><span class="sk-ic">~i:clock~</span><b>Rushed Moves</b><span class="sk-stat">Calmer rhythm</span></button></div>' +
      '<button type="button" class="link-row sk-routine" data-go="routine"><span class="li-ic">~i:bulb~</span><span class="grow"><span>Thinking routine</span><small>Four questions for every move</small></span><span class="chev" aria-hidden="true">›</span></button>' +
      '<h3 class="section-label sk-label">Endgames</h3>' +
      '<div class="sk-grid"><button type="button" class="sk-tile wide" data-go="endgames"><span class="sk-ic">~i:king~</span><b>Endgame lessons</b><span class="sk-stat">' + egDone + '<small> of ' + eg.length + ' done</small></span><span class="sk-bar" aria-hidden="true"><i style="width:' + (eg.length ? Math.round(egDone / eg.length * 100) : 0) + '%"></i></span></button>' +
      sq('finish', 'flag', 'Finish the Win', s.finish, 'Convert advantages') +
      '<button type="button" class="sk-tile sq" data-go="coords"><span class="sk-ic">~i:target~</span><b>Coordinates</b><span class="sk-stat">' + ((s.coordsBest || {}).w || 0) + ' · ' + ((s.coordsBest || {}).b || 0) + '<small> best W · B</small></span></button></div>' +
      '<p class="tiny muted sk-note">Rush and Streak stay optional challenges; the daily five-step plan never requires a timed streak.</p></section>';
  };
  App.screens.train.render = function (el) {
    el.innerHTML = U.head({ eyebrow: 'Learn', title: 'Skills', sub: 'Understand → practise → assess → revisit.', selector: U.switcher(U.LEARN_TABS, 'skills', 'Learn sections') });
    el.appendChild(App.html(App.skillBoardHTML())); wire(el); U.wireSwitcher(el);
  };

  /* ---------- Play: bot shelf + tools ---------- */
  App.screens.playhub.render = function (el) {
    var bots = App.BOTS || [], s = st(), games = (s.games || []).length, mistakes = (s.mistakes || []).length;
    el.innerHTML = U.head({ eyebrow: 'Play', title: 'Games & review', sub: 'Pick an opponent, or learn from games you already played.' });
    if (s.activeGame && App.continueCard) el.appendChild(App.continueCard());
    var shelf = '<section class="play-shelf" aria-label="Bots"><div class="shelf-head"><h2>Opponents</h2><button type="button" class="btn sm" data-go="play">All bots & clocks</button></div><div class="shelf-row" role="list">' +
      bots.map(function (b) { return '<button type="button" role="listitem" class="bot-card" data-go="play" aria-label="' + esc(b.name) + ', about ' + b.elo + '"><span class="bot-mono" aria-hidden="true">' + esc(b.name.charAt(0)) + '</span><b>' + esc(b.name) + '</b><span class="tiny">≈' + b.elo + '</span></button>'; }).join('') + '</div></section>';
    /* v8: full-width utility rows (icon · title + one-line description · live count) instead of two
       cramped tiles that wrapped word-by-word on phones. */
    function tool(go, ic, name, desc, n, unit) { return '<button type="button" class="tool-row" data-go="' + go + '"><span class="tool-ic" aria-hidden="true">~i:' + ic + '~</span><span class="tool-text"><b>' + name + '</b><small>' + desc + '</small></span>' + (n == null ? '<span class="chev" aria-hidden="true">›</span>' : '<span class="tool-count"><b>' + n + '</b><small>' + unit + '</small></span>') + '</button>'; }
    var mpOn = App.MP && App.MP.configured && App.MP.configured();
    var mp = '<section class="tool-list" aria-label="Multiplayer"><h3 class="section-label">Play people</h3>' + tool('multiplayer', 'users', 'Multiplayer', mpOn ? 'Play a friend with a private code' : 'Not set up yet', null) + '</section>';
    var tools = mp + '<section class="tool-list" aria-label="Tools"><h3 class="section-label">Study your games</h3>' +
      tool('analysis', 'analysis', 'Analysis board', 'Set up any position', null) +
      tool('games', 'search', 'Game Review', 'Lichess, Chess.com or PGN', games, games === 1 ? 'game' : 'games') +
      tool('mistakes', 'close', 'My mistakes', 'Positions from your games', mistakes, 'to fix') + '</section>';
    el.appendChild(App.html('<div class="play-hub">' + shelf + tools + '</div>')); wire(el);
  };

  /* ---------- Tactics theme picker ---------- */
  var tactics = App.screens.tactics, base = tactics.render;
  App.tacticsPickerHTML = function () {
    var s = stats(), themes = s.themes || {}, names = window.THEME_NAMES || {}, pz = window.PUZZLES || [];
    var list = Object.keys(names).map(function (k) { var r = themes[k], n = r ? r[0] + r[1] : 0; return { k: k, name: names[k], n: n, p: n ? Math.round(r[0] / n * 100) : null, count: pz.filter(function (p) { return p[4] && p[4].split(' ').indexOf(k) >= 0; }).length }; });
    var weak = list.filter(function (t) { return t.n >= 3; }).sort(function (a, b) { return a.p - b.p || b.n - a.n; }).slice(0, 3);
    return '<section class="tx-hero ink"><div><span class="eyebrow">Your tactics rating</span><b class="tx-rating">' + (st().tacticsRating || 800) + '</b></div><button type="button" class="btn primary" data-go="tactics/mixed">~i:shuffle~ Mixed training</button></section>' +
      (weak.length ? '<h3 class="section-label">Needs work · from your results</h3><div class="tx-weak">' + weak.map(function (t) { return '<button type="button" class="mode-card" data-go="tactics/' + t.k + '"><b>' + esc(t.name) + '</b><span class="tx-bar" aria-hidden="true"><i style="width:' + t.p + '%"></i></span><small>' + t.p + '% of ' + t.n + '</small></button>'; }).join('') + '</div>' : '<p class="small muted tx-empty">Solve a few puzzles and your weakest themes will appear here.</p>') +
      '<h3 class="section-label">All themes</h3><div class="tx-grid">' + list.map(function (t) { return '<button type="button" class="tx-theme" data-go="tactics/' + t.k + '"><span>' + esc(t.name) + '</span><small>' + (t.p == null ? t.count + ' puzzles' : t.p + '% · ' + t.n) + '</small>' + (t.p == null ? '' : '<span class="tx-bar" aria-hidden="true"><i style="width:' + t.p + '%"></i></span>') + '</button>'; }).join('') + '</div>';
  };
  tactics.render = function (el, prm) {
    if (prm && prm[0]) return base.call(this, el, prm);
    el.innerHTML = U.head({ eyebrow: 'Skills', title: 'Tactics', sub: 'Train your weakest patterns most.' });
    el.appendChild(App.html('<div class="tx-picker">' + App.tacticsPickerHTML() + '</div>')); wire(el);
  };
})();
