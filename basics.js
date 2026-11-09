/* Stacy Chess · v12 "Chess from zero" + experience levels.
   - #/experience : Stacy asks how much chess you know (first run, and any time from Settings; never resets progress).
   - #/basics     : interactive zero-knowledge course: board & squares, how every piece moves (tap/drag to move),
                    captures, check, checkmate, stalemate, castling, en passant, promotion, piece values, the
                    K+Q and K+R mates, opening principles. Short explanations in plain words, then practice.
   - #/basic/<id> : one lesson.  #/placement : 5 puzzles that set a starting level for "I know the rules".
   Chess.com/Lichess linking stays optional everywhere. */
(function () {
  'use strict';
  function S() { return App.state; }
  function esc(x) { return App.esc(x); }
  var EXP = [
    { id: 'new', label: 'I’m brand new — I don’t know anything', sub: 'Start from zero: the board, how each piece moves, check and checkmate. About 18 short lessons.' },
    { id: 'rules', label: 'I know the rules', sub: 'A 5-puzzle check sets your level, then basic tactics and opening principles.' },
    { id: 'play', label: 'I already play', sub: 'Your normal plan. Linking Chess.com or Lichess is optional.' }
  ];
  App.EXPERIENCE = EXP;
  App.experience = function () { return S().experience || null; };
  /* ---------- lesson data ----------
     step kinds: tap (find a square) · stars (move the piece onto every star) · move (one move that meets a goal)
     · choice (question) · mate (checkmate a lone king; Stacy defends with the engine). */
  var L = [
    { id: 'board', title: 'The board and its squares', icon: 'target', text: 'A chessboard has 64 squares in 8 columns (files a–h) and 8 rows (ranks 1–8). Every square has a name, like e4: first the letter, then the number. White always starts on ranks 1 and 2. Tip: the bottom-right corner square is always light (“light on the right”).',
      steps: [{ k: 'tap', fen: '8/8/8/8/8/8/8/8 w - - 0 1', q: 'Tap the square e4.', a: 'e4', why: 'Column e, row 4. The centre squares (d4, e4, d5, e5) are the most important in chess.' },
        { k: 'tap', fen: '8/8/8/8/8/8/8/8 w - - 0 1', q: 'Tap the square a8 (top-left corner from White’s side).', a: 'a8', why: 'File a is on the left for White, rank 8 is Black’s back row.' },
        { k: 'choice', q: 'Which corner is light from White’s side?', o: ['h1 (bottom right)', 'a1 (bottom left)'], a: 0, why: '“Light on the right.” If your board is set up the other way, turn it.' }] },
    { id: 'rook', title: 'The rook', icon: 'layers', text: 'The rook moves in straight lines: up, down, left or right, as many empty squares as it likes. It cannot jump over pieces. Value: 5 points.',
      steps: [{ k: 'stars', fen: '7k/8/8/8/8/8/8/R6K w - - 0 1', stars: ['a6', 'f6', 'f2'], q: 'Move the rook onto every star.', why: 'Straight lines only. The rook is strongest on open files and rows.' }] },
    { id: 'bishop', title: 'The bishop', icon: 'layers', text: 'The bishop moves diagonally, any number of empty squares. A bishop stays on its own colour for the whole game. Value: 3 points.',
      steps: [{ k: 'stars', fen: 'k7/8/8/8/8/8/8/2B4K w - - 0 1', stars: ['a3', 'f8', 'h6'], q: 'Move the bishop onto every star.', why: 'Diagonals only – this bishop lives on dark squares for ever.' }] },
    { id: 'queen', title: 'The queen', icon: 'layers', text: 'The queen moves like a rook and a bishop together: straight or diagonal, any distance. She is your strongest piece. Value: 9 points.',
      steps: [{ k: 'stars', fen: 'k7/8/8/8/8/8/8/3Q3K w - - 0 1', stars: ['d7', 'a4', 'h4'], q: 'Move the queen onto every star.', why: 'Straight or diagonal – any distance, as long as the path is empty.' }] },
    { id: 'king', title: 'The king', icon: 'king', text: 'The king moves one square in any direction. He is the most important piece: if your king is trapped (checkmate), you lose. He can never move into danger.',
      steps: [{ k: 'stars', fen: 'k7/8/8/8/8/8/8/4K3 w - - 0 1', stars: ['e2', 'f3', 'g4'], q: 'Walk the king onto every star, one step at a time.', why: 'One square per move, any direction.' }] },
    { id: 'knight', title: 'The knight', icon: 'layers', text: 'The knight moves in an “L”: two squares in one direction, then one to the side. It is the only piece that jumps over others. Value: 3 points.',
      steps: [{ k: 'stars', fen: '7k/8/8/8/8/8/8/6NK w - - 0 1', stars: ['f3', 'e5', 'd7'], q: 'Jump the knight onto every star.', why: 'Two then one, like an L. A knight always lands on the opposite colour.' },
        { k: 'choice', q: 'Can a knight jump over other pieces?', o: ['Yes', 'No'], a: 0, why: 'Yes – that is what makes the knight special.' }] },
    { id: 'pawn', title: 'The pawn', icon: 'pawn', text: 'Pawns move straight forward one square. From their starting row they may move two squares. They capture differently: one square diagonally forward. Pawns never move backwards. Value: 1 point.',
      steps: [{ k: 'move', fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', q: 'Move the pawn two squares forward.', goal: 'double', why: 'Only from the starting row can a pawn jump two squares.' },
        { k: 'move', fen: '4k3/8/8/3pn3/4P3/8/8/4K3 w - - 0 1', q: 'The pawn is blocked. Capture with it!', goal: 'capture', why: 'Pawns capture diagonally forward: e4 takes d5.' }] },
    { id: 'capture', title: 'Capturing and piece values', icon: 'search', text: 'You capture by moving onto an enemy piece; it leaves the board. Count before you capture: pawn 1, knight 3, bishop 3, rook 5, queen 9. The king cannot be captured.',
      steps: [{ k: 'move', fen: '7k/b7/8/8/8/8/8/R6K w - - 0 1', q: 'Capture the bishop that nobody defends.', goal: 'capture', why: 'A free piece! Always look for undefended enemy pieces.' },
        { k: 'move', fen: '7k/8/8/3q4/2p5/4N3/8/K7 w - - 0 1', q: 'Your knight can take a pawn or the queen. Take the bigger prize.', goal: 'captureQ', why: 'The queen is worth 9, the pawn 1.' },
        { k: 'choice', q: 'Which is worth more?', o: ['A rook (5)', 'A bishop (3)', 'They are equal'], a: 0, why: 'Rook 5, bishop 3. Giving a rook for a bishop is called “losing the exchange”.' }] },
    { id: 'check', title: 'Check', icon: 'alert', text: 'When a piece attacks the king it is “check”. You must get out of check at once: move the king, block the attack, or capture the attacker.',
      steps: [{ k: 'move', fen: 'k3r3/8/8/8/8/8/8/4K3 w - - 0 1', q: 'Your king is in check from the rook. Get out of check.', goal: 'any', why: 'Step aside: the king may not stay on the rook’s line.' },
        { k: 'move', fen: 'k7/8/8/8/8/8/8/1R2K3 w - - 0 1', q: 'Now give check to the black king.', goal: 'check', why: 'Rb8+ or Ra1+ attack the king. Check is not always good, but it forces a reply.' }] },
    { id: 'mate', title: 'Checkmate', icon: 'king', text: 'Checkmate means the king is in check and has no way out. That ends the game – the side that gives checkmate wins.',
      steps: [{ k: 'move', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', q: 'Checkmate in one move!', goal: 'mate', why: 'Ra8#: the black pawns block their own king. This is the “back-rank mate”.' },
        { k: 'move', fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', q: 'Checkmate in one with the queen.', goal: 'mate', why: 'Qh8#: the queen checks along the 8th row and your king guards a7 and b7.' }] },
    { id: 'stalemate', title: 'Stalemate (a draw!)', icon: 'alert', text: 'If the player to move is NOT in check but has no legal move, it is stalemate – a draw. When you are winning, always leave the enemy king a square or give check.',
      steps: [{ k: 'choice', fen: 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1', q: 'Black to move. What is this?', o: ['Stalemate – a draw', 'Checkmate', 'Check'], a: 0, why: 'Black is not in check and has no legal move. White threw the win away.' }] },
    { id: 'castle', title: 'Castling', icon: 'king', text: 'Castling moves your king two squares toward a rook, and the rook jumps over to the other side. It puts the king in safety. Allowed only if neither piece has moved, the squares between are empty, and the king is not in check and does not pass through an attacked square.',
      steps: [{ k: 'move', fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', q: 'Castle on the king’s side: move the king two squares to the right.', goal: 'castleK', why: 'King to g1, rook to f1. Castle early in real games.' },
        { k: 'choice', q: 'Can you castle while in check?', o: ['No', 'Yes'], a: 0, why: 'Never out of, through or into check.' }] },
    { id: 'enpassant', title: 'En passant', icon: 'pawn', text: 'A special pawn capture: if an enemy pawn jumps two squares and lands right beside your pawn, you may capture it as if it had moved only one square – but only on the very next move.',
      steps: [{ k: 'move', fen: 'k7/8/8/3pP3/8/8/8/K7 w - d6 0 1', q: 'Black just played …d7–d5. Capture it en passant!', goal: 'ep', why: 'exd6: your pawn moves diagonally behind the black pawn and removes it.' }] },
    { id: 'promotion', title: 'Promotion', icon: 'pawn', text: 'A pawn that reaches the last row becomes a new piece – almost always a queen.',
      steps: [{ k: 'move', fen: 'k7/4P3/8/8/8/8/8/K7 w - - 0 1', q: 'Promote the pawn.', goal: 'promote', why: 'e8=Q: a new queen. Pawns that run to the end are very dangerous.' }] },
    { id: 'kq', title: 'Checkmate with king and queen', icon: 'king', text: 'With king + queen you can always force mate. Make a box with the queen (a knight’s jump away from the enemy king), shrink it, bring your own king close, then mate on the edge. Careful: do not take away the last square without check (stalemate!).',
      steps: [{ k: 'mate', fen: '8/8/8/4k3/8/8/8/KQ6 w - - 0 1', q: 'Checkmate the black king. Stacy defends as well as she can.', why: 'Box, shrink, king up, mate. Well done!' }] },
    { id: 'kr', title: 'Checkmate with king and rook', icon: 'king', text: 'The rook mate takes longer: use the rook to cut the king off on a row or file, bring your king opposite the enemy king, then check from far away to push it back one row at a time.',
      steps: [{ k: 'mate', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', q: 'Checkmate with king and rook.', why: 'Cut off, opposition, check, repeat – it works every time.' }] },
    { id: 'opening', title: 'How to start a game', icon: 'book', text: 'Three opening rules: 1) Put a pawn in the centre (e4 or d4). 2) Bring out knights and bishops – one move each. 3) Castle early. Do not move the queen out early and do not move the same piece twice without a reason.',
      steps: [{ k: 'move', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', q: 'Play a good first move.', goal: 'opening', why: 'e4, d4, Nf3 or c4 all fight for the centre.' },
        { k: 'choice', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', q: 'After 1.e4 e5, which move follows the rules?', o: ['Nf3 – develop and attack e5', 'Qh5 – queen out early', 'h4 – edge pawn'], a: 0, why: 'Nf3 develops a piece toward the centre and attacks a pawn.' },
        { k: 'choice', q: 'When should you castle?', o: ['Early, usually in the first 10 moves', 'Never', 'Only in the endgame'], a: 0, why: 'A castled king is safe, and your rook joins the game.' }] }
  ];
  App.BASICS = L;
  function prog() { var s = S(); s.basics = s.basics || { done: {}, started: Date.now() }; return s.basics; }
  App.basicsProgress = function () { var p = prog(), n = L.filter(function (x) { return p.done[x.id]; }).length; return { done: n, total: L.length, next: L.find(function (x) { return !p.done[x.id]; }) || null }; };
  /* ---------- starting level (only when there is no rated history: never resets progress) ---------- */
  function setStart(r, why, force) {
    var s = S(); if (!force && !s.trainingSetupPending && !s._settingUp) return; // existing users: ratings are never touched
    s.startLevel = { rating: r, why: why, at: Date.now() };
    if (!(s.stats && s.stats.puzzles) && !(s.ratingHist && s.ratingHist.length)) s.tacticsRating = r;
    var sr = s.stacyRating; if (!sr || !sr.seeded || (!(sr.games) && !(sr.history || []).some(function (h) { return h.kind === 'game'; }) && !App.realRating())) { s.stacyRating = { seeded: true, value: r, games: 0, source: why, seededAt: Date.now(), history: [{ at: Date.now(), value: r, delta: 0, kind: 'seed', detail: why }], events: {}, v2only: true }; }
    App.save();
  }
  App.setStartLevel = setStart;
  function finishSetup(level, current) {
    var s = S(); if (!s.trainingSetupPending && s.onboarding && s.onboarding.complete) return; // existing users: nothing to set up
    var t = { name: (s.settings.name || 'Player'), experience: level, current: current, target: Math.min(3500, current + 400), minutes: 20, tone: 'calm', help: 'guided', priorities: [], uncertain: true, whiteCourse: 'italian', blackCourse: 'scandi' };
    if (App.saveTraining && App.saveTraining(t, true)) { delete s.setupStep; s.baselineSkipped = true; App.saveNow(); }
  }
  /* ---------- #/experience ---------- */
  App.register('experience', { title: 'How much chess do you know?', nav: 'home', back: 'settings', render: function (el) {
    var cur = App.experience(), setup = !!S().trainingSetupPending;
    el.innerHTML = '<div class="card e3"><div class="row">' + App.avatar('happy') + '<div><h2>How much chess do you know?</h2><p class="small muted">Pick the one that fits. ' + (setup ? 'You can change it later in Settings.' : 'Changing it never deletes your progress or ratings.') + '</p></div></div><div class="col" id="expList" role="list"></div></div>';
    var list = el.querySelector('#expList');
    EXP.forEach(function (o) { var b = App.html('<button type="button" class="link-row' + (cur === o.id ? ' on' : '') + '" data-exp="' + o.id + '"><span>' + esc(o.label) + '</span><small>' + esc(o.sub) + '</small></button>'); b.onclick = function () { choose(o.id); }; list.appendChild(b); });
    function choose(id) {
      var s = S(); s.experience = id; s.experienceAt = Date.now(); App.save();
      if (id === 'new') { if (setup) { setStart(400, 'Starting level for a brand-new player'); finishSetup('new', 400); } App.go('basics'); return; }
      if (id === 'rules') { App.go('placement'); return; }
      if (setup) { s.setupStep = 'profile'; App.saveNow(); App.go('public-profile'); return; }
      App.go('home');
    }
  } });
  /* ---------- #/placement: five puzzles, about 600 → 1400 ---------- */
  function P(a) { return { id: a[0], fen: a[1], moves: a[2].split(' '), rating: a[3], themes: a[4] ? a[4].split(' ') : [], op: a[5], setup: true }; }
  App.placementSet = function () { var want = [600, 800, 1000, 1200, 1400], used = {}; return want.map(function (r) { var best = null; (window.PUZZLES || []).forEach(function (p) { if (used[p[0]]) return; if (!best || Math.abs(p[3] - r) < Math.abs(best[3] - r)) best = p; }); if (best) used[best[0]] = 1; return best; }).filter(Boolean); };
  App.placementRating = function (solved) { return Math.max(400, Math.min(1300, 500 + 160 * solved)); };
  App.register('placement', { title: 'Quick level check', nav: 'home', back: 'experience', render: function (el) {
    var set = App.placementSet(), i = 0, solved = 0, done = false;
    var head = App.html('<div class="card e1 row"><b class="grow" id="plHead"></b><span class="small muted">No rating changes – this only picks your starting level.</span></div>'); el.appendChild(head);
    var box = App.html('<div></div>'); el.appendChild(box);
    function next() {
      if (i >= set.length) return finish();
      box.innerHTML = ''; head.querySelector('#plHead').textContent = 'Puzzle ' + (i + 1) + ' of ' + set.length;
      var run = App.puzzleRunner(box, { noRating: true, noHelp: true, label: 'Level check', onResult: function (p, ok) { if (ok) solved++; },
        after: function () { return [{ label: i + 1 < set.length ? 'Next puzzle' : 'See my level', cls: 'primary', fn: function () { i++; next(); } }]; } });
      run.start(P(set[i]));
    }
    function finish() {
      if (done) return; done = true; var r = App.placementRating(solved);
      setStart(r, 'Level check: ' + solved + ' of ' + set.length + ' puzzles'); finishSetup('beginner', r);
      S().trainingTrack = 'basics-tactics'; App.save();
      box.innerHTML = '<div class="card e3"><h2>Your starting level: ' + r + '</h2><p>You solved ' + solved + ' of ' + set.length + '. Stacy will start you on basic tactics (hanging pieces, forks, mate in one) and opening principles. Ratings then change only once per daily session.</p><div class="btn-row"><button class="btn primary" id="plGo">Start today’s plan</button><button class="btn" id="plBasics">Refresh the rules first</button></div></div>';
      App.q(box, '#plGo').onclick = function () { App.go('home'); }; App.q(box, '#plBasics').onclick = function () { App.go('basics'); };
    }
    next();
  } });
  /* ---------- #/basics ---------- */
  App.register('basics', { title: 'Chess from zero', nav: 'learn', back: 'learn', render: function (el) {
    var p = prog(), pr = App.basicsProgress();
    el.innerHTML = '<div class="card e3"><div class="row">' + App.avatar('happy') + '<div><h2>Chess from zero</h2><p class="small muted">' + pr.done + ' of ' + pr.total + ' lessons done. Each one is a short explanation, then you try it on the board.</p></div></div><div class="progress"><i style="width:' + Math.round(pr.done / pr.total * 100) + '%"></i></div>' + (pr.next ? '<div class="btn-row"><button class="btn primary" id="bxNext">' + (pr.done ? 'Continue: ' : 'Start: ') + esc(pr.next.title) + '</button></div>' : '<p><b>All lessons done!</b> Time for your first real games.</p><div class="btn-row"><button class="btn primary" id="bxBot">Play Sprout (the easiest bot)</button><button class="btn" id="bxHome">Go to my daily plan</button></div>') + '</div><ol class="timeline" id="bxList"></ol>';
    var list = el.querySelector('#bxList');
    L.forEach(function (x, i) { var st = p.done[x.id] ? 'done' : pr.next && pr.next.id === x.id ? 'current' : 'next'; var li = App.html('<li class="tl-row ' + st + '"><span class="tl-mark">' + (i + 1) + '</span><span class="tl-node" aria-hidden="true">' + (st === 'done' ? '✓' : '') + '</span><div class="tl-body"><button type="button" class="link-row" data-basic="' + x.id + '"><span>' + esc(x.title) + '</span><small>' + (st === 'done' ? 'Done · tap to repeat' : esc(x.text.split('. ')[0]) + '.') + '</small></button></div></li>'); App.q(li, 'button').onclick = function () { App.go('basic/' + x.id); }; list.appendChild(li); });
    if (pr.next) App.q(el, '#bxNext').onclick = function () { App.go('basic/' + pr.next.id); };
    else { App.q(el, '#bxBot').onclick = App.basicsHandOff; App.q(el, '#bxHome').onclick = function () { App.go('home'); }; }
  } });
  App.basicsHandOff = function () { var s = S().settings; s.botId = 'sprout'; s.level = 0; s.coachOn = true; App.save(); App.go('play'); };
  /* ---------- one lesson ---------- */
  var active = null;
  App.register('basic', { title: function (p) { var x = L.find(function (l) { return l.id === p[0]; }); return x ? x.title : 'Lesson'; }, nav: 'learn', back: 'basics', render: function (el, params) {
    var lesson = L.find(function (l) { return l.id === params[0]; }); if (!lesson) return App.go('basics');
    var idx = L.indexOf(lesson), si = 0, token = 0;
    el.innerHTML = '<div class="card e3"><div class="eyebrow">Lesson ' + (idx + 1) + ' of ' + L.length + '</div><h2>' + esc(lesson.title) + '</h2><p>' + esc(lesson.text) + '</p><div class="small muted" id="bxStep"></div></div><div id="bxStage"></div><div id="bxMsg" role="status" aria-live="polite"></div><div class="btn-row" id="bxBtns"></div>';
    var stageEl = el.querySelector('#bxStage'), msg = el.querySelector('#bxMsg'), btns = el.querySelector('#bxBtns'), stepEl = el.querySelector('#bxStep');
    function say(t, cls) { msg.innerHTML = '<div class="alert ' + (cls || 'info') + '">' + esc(t) + '</div>'; }
    function button(label, fn, primary) { var b = App.html('<button class="btn ' + (primary ? 'primary' : '') + '">' + esc(label) + '</button>'); b.onclick = fn; btns.appendChild(b); return b; }
    function stage(fen) { stageEl.innerHTML = ''; var st = App.stage(stageEl, { orientation: 'w' }); st.load(fen); return st; }
    function passed(why) { App.sound && App.sound('ok'); say('Yes! ' + why, 'ok'); btns.innerHTML = ''; button(si + 1 < lesson.steps.length ? 'Next' : 'Finish lesson', function () { si++; run(); }, true); }
    function run() {
      var my = ++token; btns.innerHTML = ''; msg.innerHTML = '';
      if (si >= lesson.steps.length) return done();
      var step = lesson.steps[si]; stepEl.textContent = 'Step ' + (si + 1) + ' of ' + lesson.steps.length + ': ' + step.q;
      if (step.k === 'choice') {
        stageEl.innerHTML = ''; if (step.fen) { var stc = stage(step.fen); stc.input = false; }
        var box = App.html('<div class="card col"><b>' + esc(step.q) + '</b></div>'); stageEl.appendChild(box);
        step.o.forEach(function (o, i) { var b = App.html('<button type="button" class="btn block" style="margin-top:8px">' + esc(o) + '</button>'); b.onclick = function () { if (my !== token) return; if (i === step.a) { b.classList.add('success'); passed(step.why); } else { b.classList.add('disabled'); App.sound && App.sound('err'); say('Not quite – try again.', 'warn'); } }; box.appendChild(b); });
        return;
      }
      var st = stage(step.fen);
      if (step.k === 'tap') { st.input = false; st.board.opts.onSquare = function (sq) { if (my !== token) return; if (sq === step.a) { st.board.flash(sq, 'flash-ok'); passed(step.why); } else { st.board.flash(sq, 'flash-bad'); say('That is ' + sq + '. Find ' + step.a + '.', 'warn'); } }; say(step.q); return; }
      if (step.k === 'stars') {
        var left = step.stars.slice(); var mark = function () { var m = {}; left.forEach(function (q) { m[q] = 'blue'; }); st.board.setMarks(m); }; mark(); st.input = true; say(step.q + ' (' + left.length + ' left)');
        st.onUserMove = function (from, to, promo) { if (my !== token) return false; var m = st.game.move({ from: from, to: to, promotion: promo || 'q' }); if (!m) { say('That piece cannot move there. ' + lesson.text.split('. ')[0] + '.', 'warn'); return false; }
          var parts = st.game.fen().split(' '); parts[1] = 'w'; parts[3] = '-'; st.game.load(parts.join(' ')); st.sync(true, m);
          var k = left.indexOf(to); if (k >= 0) left.splice(k, 1); mark();
          if (!left.length) { st.input = false; passed(step.why); } else say((k >= 0 ? 'Star collected! ' : '') + left.length + ' left.'); return true; };
        return;
      }
      if (step.k === 'move') {
        st.input = true; say(step.q);
        st.onUserMove = function (from, to, promo) { if (my !== token) return false; var before = st.game.fen(), g0 = new Chess(before), wasCheck = g0.in_check(); var m = st.game.move({ from: from, to: to, promotion: promo || 'q' }); if (!m) { say('That move is not legal here. Try again.', 'warn'); return false; } st.sync(true, m);
          var g = st.game, ok = { any: true, double: m.flags.indexOf('b') >= 0, capture: !!m.captured, captureQ: m.captured === 'q', check: g.in_check(), mate: g.in_checkmate(), castleK: m.flags.indexOf('k') >= 0, ep: m.flags.indexOf('e') >= 0, promote: !!m.promotion, opening: ['e4', 'd4', 'Nf3', 'c4'].indexOf(m.san) >= 0 }[step.goal];
          if (ok) { st.input = false; passed(step.why + (wasCheck && step.goal === 'any' ? '' : '')); }
          else { say(m.san + ' is legal, but not what we are looking for. ' + (g.in_stalemate() ? 'And it is stalemate – a draw! ' : '') + 'Try again.', 'warn'); setTimeout(function () { if (my === token) { st.load(before); st.input = true; } }, 900); }
          return true; };
        return;
      }
      if (step.k === 'mate') {
        st.input = true; var moves = 0; say(step.q);
        st.onUserMove = function (from, to, promo) { if (my !== token) return false; var m = st.game.move({ from: from, to: to, promotion: promo || 'q' }); if (!m) { say('Not a legal move.', 'warn'); return false; } st.sync(true, m); moves++;
          var g = st.game; if (g.in_checkmate()) { st.input = false; passed(step.why + ' Mate in ' + moves + ' moves.'); return true; }
          if (g.in_stalemate()) { st.input = false; say('Stalemate – the black king has no move but is not in check. That is a draw. Leave it a square next time!', 'err'); btns.innerHTML = ''; button('Try again', run, true); return true; }
          if (moves >= 40) { st.input = false; say('40 moves without mate. Box, shrink, bring the king – try again.', 'warn'); btns.innerHTML = ''; button('Try again', run, true); return true; }
          st.input = false; defend(st, my); return true; };
        return;
      }
    }
    function defend(st, my) {
      var g = st.game, legal = g.moves({ verbose: true });
      function apply(u) { if (my !== token) return; var mv = u ? st.play(u) : null; if (!mv) st.play(legal[0]); st.input = true; }
      // best defence from the engine when it is available; otherwise the king move that keeps the most room
      Engine.analyse(g.fen(), { depth: 8, movetime: 250, priority: 'play', cache: false }).then(function (r) { if (r && r.best && !(r.quality && r.quality.fallback && !r.best)) return apply(r.best); throw 0; }).catch(function () {
        var best = null, bestN = -1; legal.forEach(function (mv) { var g2 = new Chess(g.fen()); g2.move(mv); var p = g2.fen().split(' '); p[1] = 'b'; p[3] = '-'; var g3 = new Chess(p.join(' ')); var n = g3.moves().length; if (n > bestN) { bestN = n; best = mv; } }); apply(best && best.from + best.to);
      });
    }
    function done() {
      var p = prog(); p.done[lesson.id] = Date.now(); App.save(); App.record && App.record('lesson', 1, 15);
      var nx = L[idx + 1]; stepEl.textContent = 'Lesson complete';
      stageEl.innerHTML = '<div class="card e3 center">' + App.avatar('wow', 'lg') + '<h2>Lesson complete!</h2><p>' + esc(lesson.title) + ' – done. ' + (nx ? 'Next: ' + esc(nx.title) + '.' : 'You finished Chess from zero. Let’s play your first game against Sprout, the gentlest bot.') + '</p></div>';
      btns.innerHTML = ''; if (nx) button('Next lesson', function () { App.go('basic/' + nx.id); }, true); else button('Play Sprout', App.basicsHandOff, true);
      button('All lessons', function () { App.go('basics'); });
    }
    active = { cancel: function () { token++; } };
    run();
  }, leave: function () { if (active) active.cancel(); active = null; } });
})();
