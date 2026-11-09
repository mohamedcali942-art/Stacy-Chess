/* Stacy Chess - trainers: openings (learn/drill/spaced repetition), traps, tactics, daily, rush, streak,
   calculation, blunder check, finish the win, endgames, coordinates */
(function () {
  var C = window.Coach, S = function () { return App.state; };

  /* ---------- shared board stage ---------- */
  var stageSeq = 0;
  App.stage = function (el, o) {
    o = o || {};
    /* v6 board-first stage: opponent row → full-width square board → your row → black dock
       (coach + at most three primary actions + "More"). Secondary tools (moves, flip, PGN, chat,
       review, settings-like toggles) live in the "More" drawer, which on wide screens is a side column. */
    var sid = 'tools' + (++stageSeq);
    var lay = App.html('<div class="play-layout stage6"><div class="main-col"><div class="board-meta top"></div><div class="board-wrap"></div><div class="board-meta bottom"></div></div>' +
      '<section class="dock" aria-label="Coach and actions"><div class="action-bar"><div class="toolbar" role="toolbar" aria-label="Board actions"></div><button type="button" class="btn sm tools-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="' + sid + '">~i:layers~ More</button></div></section>' +
      '<div class="drawer-scrim" hidden></div><aside class="tools-drawer" id="' + sid + '" role="dialog" aria-modal="false" aria-label="More board tools"><div class="drawer-head"><b>More tools</b><button type="button" class="btn sm drawer-close" aria-label="Close more tools">Done</button></div><div class="tools-actions" role="group" aria-label="More actions"></div><div class="side"></div></aside></div>');
    el.appendChild(lay);
    var st = { el: lay, game: new Chess(o.fen || undefined), input: false, top: lay.querySelector('.board-meta.top'), bottom: lay.querySelector('.board-meta.bottom'),
      toolbar: lay.querySelector('.toolbar'), side: lay.querySelector('.side'), dock: lay.querySelector('.dock'), actionBar: lay.querySelector('.action-bar'), tools: lay.querySelector('.tools-actions'), drawer: lay.querySelector('.tools-drawer'), toolsBtn: lay.querySelector('.tools-btn'), scrim: lay.querySelector('.drawer-scrim'), onUserMove: null, primaryCount: 0 };
    st.board = new Board(lay.querySelector('.board-wrap'), {
      orientation: o.orientation || 'w', coords: S().settings.coords,
      movable: function () { return st.input ? (o.both ? 'both' : st.game.turn()) : null; },
      legalDests: function (sq) { return st.game.moves({ square: sq, verbose: true }).map(function (m) { return m.to; }); },
      onMove: function (from, to, promo) {
        if (!st.onUserMove) return false;
        return st.onUserMove(from, to, promo || 'q');
      }
    });
    st.coach = new App.Coach(st.side, { max: o.maxBubbles || 3,compact:o.compactCoach });
    if(o.compactCoach){lay.classList.add('coached-game');st.coach.el.classList.add('compact-coach');}else{lay.classList.add('coach-top','training-stage');st.coach.el.classList.add('top-coach');}
    st.dock.insertBefore(st.coach.el, st.actionBar);
    /* Drawer: opening/closing never touches the game. The scrim blocks the board only while open. */
    st.openTools = function () { if (st.drawer.classList.contains('open')) return; st.drawer.classList.add('open'); st.scrim.hidden = false; st.toolsBtn.setAttribute('aria-expanded', 'true'); lay.classList.add('tools-open'); try { var f = st.drawer.querySelector('.drawer-close'); if (f) f.focus(); } catch (e) { } };
    st.closeTools = function (restore) { if (!st.drawer.classList.contains('open')) return; st.drawer.classList.remove('open'); st.scrim.hidden = true; st.toolsBtn.setAttribute('aria-expanded', 'false'); lay.classList.remove('tools-open'); if (restore !== false) try { st.toolsBtn.focus(); } catch (e) { } };
    st.toolsOpen = function () { return st.drawer.classList.contains('open'); };
    st.toolsBtn.onclick = function () { st.toolsOpen() ? st.closeTools() : st.openTools(); };
    st.drawer.querySelector('.drawer-close').onclick = function () { st.closeTools(); };
    st.scrim.onpointerdown = function (e) { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); st.closeTools(); };
    if (st.drawer.addEventListener) st.drawer.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); st.closeTools(); } });
    st.sync = function (anim, lastMove) {
      st.board.setPosition(st.game.fen(), anim !== false);
      var h = st.game.history({ verbose: true }), lm = lastMove || h[h.length - 1];
      st.board.setLastMove(lm ? lm.from : null, lm ? lm.to : null);
      st.board.setCheck(st.game.in_check() ? kingSq(st.game, st.game.turn()) : null);
    };
    st.load = function (fen) { st.game = new Chess(fen); st.board.clearDecor(); st.sync(false); };
    st.play = function (mv, anim) { // mv: uci string or move object or SAN
      var m = typeof mv === 'string' ? (/^[a-h][1-8][a-h][1-8]/.test(mv) ? st.game.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] || 'q' }) : st.game.move(mv)) : st.game.move(mv);
      if (!m) return null;
      st.board.setArrows([]); st.board.setBadge(null); st.board.setMarks({});
      st.sync(anim, m); App.moveSound(m, st.game);
      return m;
    };
    /* Primary actions (Hint, Check, Next, Pause…) stay under the board, max three; the rest go to More. */
    st.button = function (label, fn, cls) { var kind = App.ui ? App.ui.actionKind(label, cls) : 'primary', primary = kind === 'primary' && st.primaryCount < (App.ui ? App.ui.MAX_VISIBLE : 3);
      var b = App.html('<button type="button" class="btn sm ' + (cls || '') + '">' + label + '</button>'); b._kind = primary ? 'primary' : 'secondary';
      b.onclick = function () { App.sound('click'); try { b.blur(); } catch (e) { } if (!primary) st.closeTools(false); fn(b); };
      if (primary) { st.primaryCount++; st.toolbar.appendChild(b); } else st.tools.appendChild(b); return b; };
    st.sync(false);
    App.lastStage = st;
    document.body.classList.add('board-screen'); App.fitBoard && App.fitBoard(); setTimeout(function () { App.fitBoard && App.fitBoard(); }, 60);
    if (window.ResizeObserver) { var ro = new ResizeObserver(function () { App.fitBoard && App.fitBoard(); }); ro.observe(document.getElementById('view')); /* Observe available viewport, never speech/content height. */ st._ro = ro; }
    return st;
  };
  function kingSq(g, color) { var b = g.board(); for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) { var p = b[r][f]; if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - r); } return null; }
  App.kingSq = kingSq;
  function uciOf(m) { return m.from + m.to + (m.promotion || ''); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  App.shuffle = shuffle;

  /* ---------- openings: data helpers & spaced repetition ---------- */
  var SRS_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
  function allLines() { var out = []; OPENINGS.forEach(function (c) { c.lines.forEach(function (l) { out.push({ course: c, line: l }); }); }); return out; }
  function findLine(id) {
    for (var i = 0; i < OPENINGS.length; i++) { var c = OPENINGS[i]; var l = c.lines.concat(c.traps).filter(function (x) { return x.id === id; })[0]; if (l) return { course: c, line: l, trap: c.traps.indexOf(l) >= 0 }; }
    return null;
  }
  App.dueLines = function () { var now = Date.now(), s = S().srs; return allLines().filter(function (x) { var r = s[x.line.id]; return r && r.due <= now; }); };
  function srsUpdate(id, misses) {
    var r = S().srs[id] || { box: 0, due: 0, reps: 0 };
    r.box = misses ? 0 : Math.min(SRS_DAYS.length - 1, r.box + 1);
    r.reps++; r.last = Date.now(); r.misses = (r.misses || 0) + misses;
    r.due = Date.now() + (misses ? 10 * 60 * 1000 : SRS_DAYS[r.box] * 864e5);
    S().srs[id] = r; App.save();
  }

  App.register('openings', {
    title: 'Opening courses', back: 'learn', nav: 'learn',
    render: function (el) {
      var coach = new App.Coach(el, { max: 2 });
      coach.say('Your repertoire: 2 openings with White, 2 with Black. They are **systems**, so the same ideas come up again and again. Pick one and I\'ll teach you the plans first, then we drill! ', { speak: false });
      OPENINGS.forEach(function (c, i) {
        var learned = c.lines.filter(function (l) { return S().learned[l.id]; }).length, due = c.lines.filter(function (l) { var r = S().srs[l.id]; return r && r.due <= Date.now(); }).length;
        var card = App.html('<div class="card tile" style="min-height:0;animation:bubbleIn .4s var(--spring) ' + i * 0.06 + 's both"><div class="row"><span class="t-ic">' + (c.color === 'w' ? '~i:king~' : '~i:king~') + '</span><div class="grow"><div class="t-name">' + c.name + '</div><div class="t-sub">' + (c.color === 'w' ? 'White' : 'Black') + ' · ' + App.esc(c.tagline) + '</div></div>' + (due ? '<span class="badge warn">' + due + ' due</span>' : '') + '</div><div class="row small" style="margin-top:8px"><div class="bar grow" style="height:7px"><i style="width:' + (learned / c.lines.length * 100) + '%"></i></div><span class="muted">' + learned + '/' + c.lines.length + ' lines</span></div></div>');
        card.onclick = function () { App.go('course/' + c.id); };
        el.appendChild(card);
      });
    }
  });

  App.register('course', {
    back: 'openings', nav: 'learn',
    title: function (p) { var c = OPENINGS.filter(function (x) { return x.id === p[0]; })[0]; return c ? c.name : 'Course'; },
    render: function (el, p) {
      var c = OPENINGS.filter(function (x) { return x.id === p[0]; })[0]; if (!c) return App.go('openings');
      var coach = new App.Coach(el, { max: 4 });
      coach.say('**Why this opening?** ' + c.why, { speak: true, ai: { kind: 'lesson', ctx: { opening: c.name, color: c.color === 'w' ? 'White' : 'Black', ideas: c.ideas.join(' | ') } } });
      var ideas = App.html('<div class="card"><h3>~i:target~ Key ideas</h3><div class="col small">' + c.ideas.map(function (t, i) { return '<div style="animation:bubbleIn .4s var(--spring) ' + i * 0.08 + 's both">' + (i + 1) + '. ' + App.esc(t) + '</div>'; }).join('') + '</div></div>');
      el.appendChild(ideas);
      el.appendChild(App.html('<div class="section-title">Lines</div>'));
      c.lines.forEach(function (l) {
        var r = S().srs[l.id], learned = S().learned[l.id];
        var status = !learned ? '<span class="badge">New</span>' : r && r.due <= Date.now() ? '<span class="badge warn">Due</span>' : '<span class="badge ok">Box ' + (r ? r.box : 0) + '</span>';
        var it = App.html('<div class="card"><div class="row"><b class="grow">' + App.esc(l.name) + '</b>' + status + '</div><div class="small muted" style="margin:6px 0 10px">' + l.moves.split(' ').length + ' moves · ' + Object.keys(l.quiz || {}).length + ' questions</div><div class="btn-row"><button class="btn sm primary" data-m="learn">~i:book~ Learn</button><button class="btn sm" data-m="drill">~i:target~ Drill</button><button class="btn sm" data-m="half">~i:forward~ From halfway</button></div></div>');
        [].forEach.call(it.querySelectorAll('button'), function (b) { b.onclick = function () { App.go('line/' + l.id + '/' + b.dataset.m); }; });
        el.appendChild(it);
      });
      el.appendChild(App.html('<div class="section-title">Traps ~i:trap~</div>'));
      c.traps.forEach(function (l) {
        var it = App.html('<div class="list-item"><div class="li-ic">~i:trap~</div><div class="grow"><b>' + App.esc(l.name) + '</b><span class="small muted">' + App.esc(l.lesson) + '</span></div><span class="faint">›</span></div>');
        it.onclick = function () { App.go('line/' + l.id + '/trap'); }; el.appendChild(it);
      });
    }
  });

  /* ---------- line trainer ---------- */
  App.register('line', {
    back: 'openings', nav: 'learn',
    title: function (p) { var f = findLine(p[0]); return f ? (p[1] === 'trap' ? '~i:trap~ ' : '') + f.course.short + ': ' + f.line.name : 'Line'; },
    render: function (el, p) { runLine(el, p[0], p[1]); }
  });
  function runLine(el, id, mode, onFinish, hooks) {
    if(App.openingSession)return App.openingSession(el,id,mode,onFinish,hooks);
    var f = findLine(id); if (!f) return App.go('openings');
    hooks=hooks||{};var resume=hooks.resume||null;var ratingEvent=resume&&resume.ratingEvent||'opening:'+id+':'+Date.now();
    var c = f.course, L = f.line, sans = L.moves.split(' '), me = c.color;
    if (f.trap) mode = 'trap';
    var st = App.stage(el, { orientation: me }), ply = 0, misses = 0, wrongHere = 0, token = 0, done = false;
    var startPly = mode === 'half' ? Math.floor(sans.length / 2 / 2) * 2 + (me === 'w' ? 0 : 1) : mode === 'trap' ? (L.start || 0) : 0;
    if (mode === 'half' && startPly >= sans.length) startPly = 0;
    var progress = App.html('<div class="bar" style="height:6px;flex:1"><i style="width:0"></i></div>');
    st.top.appendChild(App.html('<span class="badge">' + ({ learn: '~i:book~ Learn', drill: '~i:target~ Drill', half: '~i:forward~ Halfway', review: '~i:repeat~ Review', trap: '~i:trap~ Trap' }[mode] || mode) + '</span>'));
    st.top.appendChild(progress);
    function snapshot(){return {ratingEvent:ratingEvent,ply:ply,misses:misses,wrongHere:wrongHere,done:done,fen:st.game.fen()};}
    function setProg() { progress.firstChild.style.width = (ply / sans.length * 100) + '%'; if(hooks.onSave)hooks.onSave(snapshot()); }
    App.setContext(function () { return { mode: 'opening ' + mode, opening: c.name, line: L.name, fen: st.game.fen(), history: st.game.history().join(' '), nextBookMove: sans[ply], allowedSans: sans }; });
    function plyColor(i) { return i % 2 === 0 ? 'w' : 'b'; }
    function reset(toPly) {
      token++; done = false; st.load(new Chess().fen()); ply = 0; wrongHere = 0;
      while (ply < toPly) { st.game.move(sans[ply]); ply++; }
      st.sync(false); setProg(); st.coach.clear();
      if (toPly > 0) st.coach.say('We start from move ' + Math.ceil((toPly + 1) / 2) + '. Remember the plan!', { speak: false });
      next();
    }
    function note(i) { return (L.notes || {})[i + 1]; }
    function next() {
      if(!st.el.isConnected)return;var my = token;
      setProg();
      if (ply >= sans.length) return finish();
      if (mode === 'trap' || plyColor(ply) !== me) {
        st.input = false;
        var delay = mode === 'trap' ? 0 : 650;
        if (mode === 'trap') {
          var b = st.button(ply === startPly ? '~i:play~ Start' : 'Next move ~i:play~', function () { b.remove(); if (my !== token) return; doPly(); });
          b.classList.add('primary');
          // quiz before the punchline in traps
          if (ply === sans.length - 1 && plyColor(ply) === me) { b.remove(); askFind(true); }
          return;
        }
        setTimeout(function () { if (my !== token) return; doPly(); }, delay);
        function doPly() {
          var m = st.play(sans[ply]); var n = note(ply); ply++;
          if (n) st.coach.say(n, { speak: mode !== 'drill', mood: 'happy' });
          next();
        }
        return;
      }
      // user's turn
      var q = (L.quiz || {})[ply + 1];
      if (!q && mode === 'learn'&&!hooks.noQuiz) q = autoQuiz();
      if (q && !hooks.noQuiz && (mode === 'learn' || mode === 'half') ) {
        if (q.type === 'choice') return askChoice(q);
        return askFind(false, q);
      }
      st.input = true; wrongHere = 0;
      if (mode === 'learn') { showArrow(); st.coach.say('Your move: play the arrow move. (' + sans[ply] + ')', { speak: false }); }
    }
    // Stacy asks "what do you think we play?" before teaching some moves (every 3rd move of yours)
    function autoQuiz() {
      if (ply < 2 || ply - (autoQuiz.last == null ? -99 : autoQuiz.last) < 6 && ply > autoQuiz.last) return null;
      var right0 = sans[ply].replace(/[+#]/g, ''); if ([note(ply - 1), note(ply - 2)].some(function (n) { return n && n.indexOf(right0) >= 0; })) return null;
      var g = new Chess(st.game.fen()), right = sans[ply], all = g.moves().filter(function (m) { return m !== right; });
      if (all.length < 2) return null;
      var rm = g.move(right); g.undo();
      // plausible distractors: same piece type first, then quiet developing moves
      var same = all.filter(function (m) { return rm && m[0] === right[0]; }), quiet = all.filter(function (m) { return !/x|\+/.test(m); });
      var pool = App.shuffle(same).concat(App.shuffle(quiet)).filter(function (m, i, a) { return a.indexOf(m) === i; }).slice(0, 2);
      if (pool.length < 2) return null;
      var opts = App.shuffle([right].concat(pool));
      autoQuiz.last = ply;
      return { type: 'choice', auto: true, q: 'Before I tell you: which move fits our plan here?', options: opts, answer: opts.indexOf(right), explain: right + ' is our move. Play it and I\'ll tell you why!' };
    }
    function showArrow(col) { var g = new Chess(st.game.fen()), m = g.move(sans[ply]); if (m) st.board.setArrows([{ from: m.from, to: m.to, color: col || 'green' }]); }
    function askChoice(q) {
      st.input = false;
      var opts = q.options.map(function (t, i) { return { t: t, i: i }; });
      var tries = 0;
      st.coach.say(' ' + q.q, { mood: 'think', ai: { kind: 'question', ctx: { fen: st.game.fen(), question: q.q, opening: c.name } }, actions: opts.map(function (o) {
        return { label: o.t, fn: function (btn) {
          if (btn.classList.contains('success') || btn.disabled) return;
          tries++;
          if (o.i === q.answer) {
            btn.classList.add('success'); App.sound('ok'); [].forEach.call(btn.parentNode.querySelectorAll('button'), function (x) { if (x !== btn) { x.disabled = true; x.classList.add('disabled'); } });
            st.coach.say((tries === 1 ? 'Exactly! ' : 'Yes, that\'s it. ') + q.explain, { cls: 'good', mood: 'happy' });
            App.record('quiz', 1, tries === 1 ? 5 : 2);
            st.input = true; showArrow(); st.coach.say('Now play it on the board.', { speak: false });
          } else { btn.classList.add('disabled'); App.sound('err'); st.board.shake(); if (tries === 1) st.coach.say('Not ' + o.t + '. ' + (q.auto ? 'Think about our setup: which piece still needs to come out, and where does it belong?' : 'Have another look!'), { cls: 'warn', mood: 'think', speak: false }); }
        } };
      }) });
    }
    function askFind(trap, q) {
      st.input = true; wrongHere = 0;
      var text = trap ? 'Now YOU find the punishing move! ~i:search~' : ' ' + q.q;
      st.coach.say(text, { mood: 'think', ai: trap ? null : { kind: 'question', ctx: { fen: st.game.fen(), question: q.q, opening: c.name } } });
    }
    st.onUserMove = function (from, to, promo) {
      var g = new Chess(st.game.fen()), exp = g.move(sans[ply]);
      var mv = st.game.move({ from: from, to: to, promotion: promo }); if (!mv) return false;
      if (exp && mv.san === exp.san) {
        st.input = false; st.sync(true, mv); App.moveSound(mv, st.game);
        st.board.setArrows([]); st.board.setBadge(to, wrongHere ? 'OK' : '*', wrongHere ? '#52789e' : '#3b82a4');
        var q = (L.quiz || {})[ply + 1];
        var n = note(ply);
        if (q && q.type === 'move' && mode !== 'drill' && mode !== 'review') st.coach.say((wrongHere ? 'There it is! ' : 'Brilliant, you found it!  ') + q.explain, { cls: 'good', mood: 'happy' });
        else if (n) st.coach.say(n, { mood: 'happy', speak: mode !== 'drill' && mode !== 'review', ai: mode === 'learn' || mode === 'half' ? { kind: 'lesson', ctx: { fen: st.game.fen(), move: mv.san, opening: c.name, line: L.name, bookNote: n, allowedSans: sans } } : null });
        ply++; if (mode === 'trap') { ply = sans.length; }setProg();
        setTimeout(next, 450);
        return true;
      }
      // wrong move
      st.game.undo(); misses++; wrongHere++;setProg();
      App.sound('err'); st.board.shake(); st.board.flash(to, 'flash-bad');
      var fenB = st.game.fen(), my = token;
      var msg = wrongHere >= 2 ? 'Not this one. Look at the arrow ~i:arrow-down~' : mode === 'trap' ? 'Not quite. Look for a capture or a check!' : 'Hmm, that\'s not our move here. Try again!';
      var bubble = st.coach.say(msg, { cls: 'warn', mood: 'think', speak: false });
      if (wrongHere >= 2) showArrow('blue');
      // ask Stockfish how good the alternative was, so the feedback is honest
      Engine.analyse(fenB, { depth: 12, multipv: 1 }).then(function (before) {
        var g2 = new Chess(fenB); g2.move({ from: from, to: to, promotion: promo });
        return Engine.analyse(g2.fen(), { depth: 12 }).then(function (after) {
          if (my !== token || !before || !after) return;
          var j = C.judge(fenB, from + to + (promo || ''), before, after);
          var playable = j.loss < 5;
          var t = mv.san + ' is ' + (playable ? 'actually playable (' + j.info.label + '), but in our repertoire we play something else here. Stick to the plan!' : 'a ' + j.info.label.toLowerCase() + '. ' + j.text.replace(/^.*?\. /, ''));
          st.coach.say(t, { cls: playable ? 'warn' : 'bad', head: '<span class="grade-pill" style="background:' + j.info.color + '">' + j.info.sym + ' ' + j.info.label + '</span>', speak: true });
        });
      });
      return false;
    };
    function finish() {
      if (done) return; done = true; st.input = false;
      setProg();
      if (mode === 'trap') {
        S().stats.traps[0]++; App.record('opening', 1, 10);
        st.coach.say('~i:trap~ **Lesson:** ' + L.lesson, { cls: 'good', mood: 'wow', actions: [{ label: '↺ Again', fn: function () { reset(startPly); } }, { label: 'Back to course', fn: function () { App.go('course/' + c.id); } }] });
        return;
      }
      var perfect = misses === 0;if(App.ratePractice)App.ratePractice('opening drill',perfect,1000,ratingEvent);
      if (mode !== 'learn' || perfect) srsUpdate(L.id, misses ? 1 : 0); else srsUpdate(L.id, 1);
      if (mode === 'learn') { S().learned[L.id] = Date.now(); S().stats.lessons++; }
      App.record('opening', 1, perfect ? 20 : 8);
      if (perfect) { App.sound('win'); App.confetti(); }
      var txt = perfect ? 'PERFECT line!  You played every move right. I\'ll bring this one back in ' + (function(n){return n===0?'a few minutes':n===1?'1 day':n+' days';})(SRS_DAYS[S().srs[L.id].box]) + ' so it sticks.' : 'Line complete! You had ' + misses + ' slip' + (misses > 1 ? 's' : '') + '. I\'ll show it again soon, repetition is how it sticks. ';
      st.coach.say(txt, { cls: perfect ? 'good' : 'warn', mood: perfect ? 'wow' : 'happy', actions: onFinish ? [{ label: 'Next ~i:play~', cls: 'primary', fn: function () { onFinish(misses); } }] : [
        { label: '~i:target~ Drill it', cls: 'primary', fn: function () { App.go('line/' + L.id + '/drill'); } }, { label: '~i:forward~ From halfway', fn: function () { mode = 'half'; misses = 0; reset(Math.floor(sans.length / 4) * 2 + (me === 'w' ? 0 : 1)); } },
        { label: '↺ Restart', fn: function () { misses = 0; reset(0); } }, { label: 'Course', fn: function () { App.go('course/' + c.id); } }] });
    }
    st.button('↺ Restart', function () { misses = 0; reset(mode === 'trap' ? startPly : 0); });
    if (mode !== 'trap') st.button('~i:forward~ Halfway', function () { misses = 0; reset(Math.min(sans.length - 1, Math.floor(sans.length / 4) * 2 + (me === 'w' ? 0 : 1))); });
    st.button('~i:bulb~ Hint', function () { if (st.input && ply < sans.length) { showArrow('blue'); misses += mode === 'learn' ? 0 : 1; } });
    st.button('⇅ Flip', function () { st.board.flip(); });
    var intro = mode === 'learn' ? 'Let\'s learn **' + L.name + '**. I\'ll explain every move and ask you a few questions. Ready? ' : mode === 'trap' ? 'Trap time! Watch closely and tap Next. Ask yourself on every move: what is the threat?' : mode === 'drill' || mode === 'review' ? 'Drill time! No arrows now. I play the other side, you play your moves from memory.' : 'Starting from the middle of the line. Can you remember the rest?';
    st.coach.say(intro, { mood: 'happy' });
    if(resume){misses=resume.misses||0;reset(resume.ply||0);}else setTimeout(function () { if(st.el.isConnected)reset(startPly); }, 900);
    st.snapshot=function(){var r=snapshot();if(hooks.onSave)hooks.onSave(r);return r;};st.cancel=function(){token++;};
    return st;
  }

  App.runLine=runLine;
  App.register('srs', {
    title: 'Review due lines', back: 'learn', nav: 'learn',
    render: function (el) {
      var due = App.dueLines();
      if (!due.length) {
        var c = new App.Coach(el); c.say('Nothing is due right now!  Learn a new line, or drill one anyway. Spaced repetition brings each line back right before you would forget it.', { actions: [{ label: 'Opening courses', cls: 'primary', fn: function () { App.go('openings'); } }] });
        return;
      }
      var i = 0;
      (function nextLine() {
        el.innerHTML = '';
        if (i >= due.length) { var c = new App.Coach(el); App.confetti(); c.say('All due lines reviewed! Amazing work ', { mood: 'wow', actions: [{ label: 'Home', cls: 'primary', fn: function () { App.go('home'); } }] }); return; }
        el.appendChild(App.html('<div class="small muted" style="margin-bottom:8px">Line ' + (i + 1) + ' of ' + due.length + ' · ' + due[i].course.name + '</div>'));
        runLine(el, due[i].line.id, 'review', function () { i++; nextLine(); });
      })();
    }
  });
  App.runLine = runLine;

  /* ---------- traps hub ---------- */
  App.register('traps', {
    title: 'Spot the Trap', back: 'train', nav: 'train',
    render: function (el) {
      var c = new App.Coach(el, { max: 2 });
      c.say('Traps win games at your level! First learn the classic traps in your openings, then train with real positions where your opponent has just walked into one. ~i:trap~', { speak: false });
      el.appendChild(App.html('<div class="section-title">Opening traps</div>'));
      OPENINGS.forEach(function (o) { o.traps.forEach(function (t) {
        var it = App.html('<div class="list-item"><div class="li-ic">' + (o.color === 'w' ? '~i:king~' : '~i:king~') + '</div><div class="grow"><b>' + App.esc(t.name) + '</b><span class="small muted">' + o.name + '</span></div><span class="faint">›</span></div>');
        it.onclick = function () { App.go('line/' + t.id + '/trap'); }; el.appendChild(it);
      }); });
      el.appendChild(App.html('<div class="section-title">Trap puzzles</div>'));
      [['all', '~i:trap~', 'Mixed trap puzzles', 'Opening tricks from real games'], ['kia', '~i:king~', 'KIA traps', 'From King\'s Indian Attack games'], ['london', '~i:king~', 'London traps', 'From London System games'], ['kid', '~i:king~', 'KID traps', 'From King\'s Indian Defense games'], ['caro', '~i:king~', 'Caro-Kann traps', 'From Caro-Kann games']].forEach(function (x) {
        var it = App.html('<div class="list-item"><div class="li-ic">' + x[1] + '</div><div class="grow"><b>' + x[2] + '</b><span class="small muted">' + x[3] + '</span></div><span class="faint">›</span></div>');
        it.onclick = function () { App.go('tactics/trap-' + x[0]); }; el.appendChild(it);
      });
    }
  });
})();

/* ===================== puzzles & thinking trainers ===================== */
(function () {
  var C = window.Coach, S = function () { return App.state; };
  function P(arr) { return { id: arr[0], fen: arr[1], moves: arr[2].split(' '), rating: arr[3], themes: arr[4] ? arr[4].split(' ') : [], op: arr[5], setup: true }; }
  App.P = P;
  function pick(filter, target, avoidSeen) {
    var due=(S().puzzleQueue||[]).find(function(q){return q&&q.id&&q.due<=Date.now();});if(due){var row=PUZZLES.find(function(p){return p[0]===due.id;});if(row&&(!filter||filter(row))&&Math.abs(row[3]-target)<450)return P(row);}
    var seen = S().seenPuzzles, list = PUZZLES.filter(filter);
    if (!list.length) list = PUZZLES.slice();
    var fresh = list.filter(function (p) { return !seen[p[0]]; }); if (fresh.length > 3 && avoidSeen !== false) list = fresh;
    list = list.map(function (p) { return [Math.abs(p[3] - target) + Math.random() * 180, p]; }).sort(function (a, b) { return a[0] - b[0]; });
    return P(list[Math.floor(Math.random() * Math.min(4, list.length))][1]);
  }
  App.pickPuzzle = pick;

  /* Generic puzzle runner. opts: {onResult(p, ok, info), slow: seconds, engineCheck, noRating, label} */
  App.puzzleRunner = function (el, opts) {
    opts = opts || {};opts.noHelp=!!opts.noHelp||App.lessonMode==='assessment';
    var st = App.stage(el, {}), p, idx, failed, hintN, token = 0, solvedFlag, showing=false, resultRecorded=false, t0,ratingEvent;
    var info = App.html('<div class="row grow small"><span class="badge" id="pinfo"></span><span class="grow"></span><span id="ptimer" class="muted"></span></div>');
    st.top.appendChild(info);
    App.setContext(function () { return p ? { mode: 'puzzle', fen: st.game.fen(), puzzleRating: p.rating, themes: p.themes.join(','), solution: solvedFlag || failed ? C.pvSan(p.fen, p.moves, 8).join(' ') : '(hidden until solved)', allowedSans: solvedFlag || failed ? C.pvSan(p.fen, p.moves, 8) : [] } : {}; });
    function checkpoint(){if(opts.onSave&&p)opts.onSave({ratingEvent:ratingEvent,p:p,idx:idx,failed:failed,hintN:hintN,solved:solvedFlag,resultRecorded:resultRecorded,fen:st.game.fen(),elapsed:Math.max(0,Date.now()-(t0||Date.now()))});}
    function start(pz) {
      token++;showing=false;resultRecorded=false;t0=0;ratingEvent=opts.resume&&opts.resume.ratingEvent||'puzzle:'+pz.id+':'+Date.now(); p = pz; App.lastPuzzle = pz; idx = 0; failed = false; hintN = 0; solvedFlag = false;
      st.load(p.fen);st.board.opts.showDests=!opts.noHelp;if(opts.noHelp){App.trainingLock={noHelp:true};document.body.classList.add('independent-check');}
      var g = new Chess(p.fen), meColor = p.setup ? (g.turn() === 'w' ? 'b' : 'w') : g.turn();
      st.board.setOrientation(meColor); st.input = false;
      info.querySelector('#pinfo').textContent = (opts.label ? opts.label + ' · ' : '') + (p.rating ? '* ' + p.rating : '') + (p.themes.length && !opts.hideTheme ? ' · ' + p.themes.slice(0, 2).map(function (t) { return THEME_NAMES[t] || t; }).join(', ') : '');
      var my = token;
      st.coach.clear();
      var rs=opts.resume;opts.resume=null;if(rs&&rs.p&&rs.p.id===p.id){idx=rs.idx||0;failed=!!rs.failed;hintN=rs.hintN||0;solvedFlag=!!rs.solved;resultRecorded=!!rs.resultRecorded||failed||solvedFlag;st.load(rs.fen);t0=Date.now()-(rs.elapsed||0);if(solvedFlag){st.input=false;st.coach.say('Challenge complete. Ready for the next step?',{speak:false,actions:opts.after?opts.after(!failed):[]});return;}if(st.game.turn()!==meColor&&idx<p.moves.length){setTimeout(function(){if(my!==token)return;st.play(p.moves[idx]);idx++;ready(meColor);checkpoint();},420);}else ready(meColor);return;}
      if (p.setup) {
        setTimeout(function () { if (my !== token) return; st.play(p.moves[0]); idx = 1; ready(meColor);checkpoint(); }, 600);
      } else ready(meColor);
    }
    function ready(meColor) {
      var my = token;
      var intro = (meColor === 'w' ? 'White' : 'Black') + ' to move. ' + (p.prompt || (p.themes.indexOf('mate1') >= 0 ? 'Find checkmate in 1!' : p.themes.indexOf('mate2') >= 0 ? 'Find mate in 2!' : p.themes.indexOf('mate3') >= 0 ? 'Find mate in 3!' : p.themes.indexOf('defense') >= 0 ? 'Defend! Find the only move.' : 'Find the best move.'));
      if (opts.slow) {
        st.coach.say(intro + ' Rushed Moves mode: take ' + opts.slow + ' seconds to scan checks, captures and threats first. ', { speak: false });
        var left = opts.slow, tm = info.querySelector('#ptimer');
        (function tick() { if (my !== token) return; tm.textContent = left > 0 ? ' think ' + left + 's' : ''; if (left <= 0) { st.input = true; App.sound('tick'); return; } left--; setTimeout(tick, 1000); })();
      } else { st.input = true; st.coach.say(intro, { speak: false }); }
      t0 = t0||Date.now();checkpoint();
    }
    st.onUserMove = function (from, to, promo) {
      if(solvedFlag||!st.input)return false;
      var exp = p.moves[idx], uci = from + to + (promo || '');
      var mv = st.game.move({ from: from, to: to, promotion: promo }); if (!mv) return false;
      var mate = st.game.in_checkmate();
      var ok = exp && (exp.slice(0, 4) === uci.slice(0, 4) && (exp.length < 5 || exp[4] === (promo || 'q'))) || mate;
      if (ok) {
        st.input = false; st.sync(true, mv); App.moveSound(mv, st.game);
        idx++;checkpoint();
        if (idx >= p.moves.length || mate) return solved(), true;
        st.board.setBadge(to, 'OK', '#3b82a4');
        var my = token;
        setTimeout(function () { if (my !== token) return; st.play(p.moves[idx]); idx++; st.input = true;checkpoint(); }, 420);
        return true;
      }
      st.game.undo();
      if (opts.engineCheck) { // accept equally-good alternatives (for game mistakes)
        st.input = false; var fenB = st.game.fen(), my2 = token;
        Engine.analyse(fenB, { depth: 13, multipv: 1 }).then(function (before) {
          var g2 = new Chess(fenB); g2.move({ from: from, to: to, promotion: promo });
          return Engine.analyse(g2.fen(), { depth: 13 }).then(function (after) {
            if (my2 !== token) return;
            if(!before||!after||!before.lines.length||!after.lines.length){st.input=true;st.coach.say('Alternative analysis unavailable. No grade was assigned to that alternative; try again.',{speak:false,explain:false});return;}
            var j = C.judge(fenB, uci, before, after);
            if (j.loss < 3) { st.play(uci); solved(true); } else { wrong(fenB, uci, j); st.input = true; }
          });
        });
        return false;
      }
      wrong(st.game.fen(), uci);
      return false;
    };
    function wrong(fenB, uci, j) {
      if(opts.noHelp){if(solvedFlag)return;failed=true;result(false);solvedFlag=true;st.input=false;App.trainingLock=null;document.body.classList.remove('independent-check');checkpoint();st.coach.say('Attempt complete. The reference continuation is '+C.pvText(p.fen,p.moves,8)+'. '+themeLesson(p.themes),{speak:false,explain:false,cls:'warn',actions:opts.after?opts.after(false):[{label:'Next problem',once:true,fn:function(){opts.next&&opts.next();}}]});if(opts.onSolved)opts.onSolved(false);return;}
      if (opts.survival && !failed) {
        var sm0 = C.uciToMove(fenB, p.moves[idx]), mine = C.uciToMove(fenB, uci);
        App.sound('err'); st.board.shake(); st.input = false;
        st.coach.say((mine ? mine.move.san : uci) + ' is not it. The answer was **' + (sm0 ? sm0.move.san : p.moves[idx]) + '**. Next one! ~i:bolt~', { cls: 'bad', mood: 'think', speak: false });
        failed = true; result(false); return;
      }
      if (!failed) { failed = true; result(false); }
      checkpoint();App.sound('err'); st.board.shake(); st.board.flash(uci.slice(2, 4), 'flash-bad');
      var my = token, san = (C.uciToMove(fenB, uci) || {}).move; san = san ? san.san : uci;
      var b = st.coach.say(san + ' is not it. ' + (opts.onWrongText || 'Try again, or ask for a hint!'), { cls: 'bad', mood: 'think', speak: false,
        actions: [{ label: '~i:bulb~ Hint', fn: hint }, { label: '~i:eye~ Solution', fn: showSolution }] });
      // explain refutation with Stockfish
      var g = new Chess(fenB); g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      Engine.analyse(g.fen(), { depth: 11 }).then(function (after) {
        if (my !== token || !after || !after.lines[0]) return;
        var r = after.lines[0], rf = C.moveFacts(g.fen(), r.uci); if (!rf) return;
        var gain = C.pvGain(g.fen(), r.pv, 4, g.turn());
        var t = 'After ' + san + ', they can answer ' + rf.san + (gain >= 1 ? ' and that ' + C.gainWords(gain) : rf.facts.length ? ' (' + C.join(rf.facts.slice(0, 2)) + ')' : '') + '.';
        st.coach.say(t, { cls: 'warn', speak: true, ai: { kind: 'hint', ctx: { fen: fenB, wrongMove: san, opponentReply: rf.san, puzzleThemes: p.themes.join(','), allowedSans: [san, rf.san] } } });
      });
    }
    function hint() {
      if (solvedFlag) return;
      var fen = st.game.fen(), h = C.hints(fen, p.moves[idx]);
      if (!failed) { failed = true; result(false, true); }
      var t = h[Math.min(hintN, h.length - 1)];
      if (hintN === 1 || hintN === 2) st.board.setMarks((function () { var o = {}; o[p.moves[idx].slice(0, 2)] = 'hint'; return o; })());
      if (hintN >= 3) st.board.setArrows([{ from: p.moves[idx].slice(0, 2), to: p.moves[idx].slice(2, 4), color: 'blue' }]);
      hintN++;checkpoint();
      st.coach.say('~i:bulb~ ' + t, { cls: 'warn', mood: 'think' });
    }
    function showSolution() {
      if (solvedFlag || showing) return;showing=true;
      if (!failed) { failed = true; result(false); }
      st.input = false; var my = token;
      (function step() {
        if (my !== token) return; if (idx >= p.moves.length) { solved(true, true); return; }
        var u = p.moves[idx]; st.board.setArrows([{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'blue' }]);
        setTimeout(function () { if (my !== token) return; st.play(u); idx++; setTimeout(step, 650); }, 500);
      })();
    }
    function solved(alt, shown) {
      if(solvedFlag)return;
      solvedFlag = true; st.input = false;if(opts.noHelp){App.trainingLock=null;document.body.classList.remove('independent-check');}checkpoint();
      if (!failed) { App.sound('ok'); result(true); }
      var line = C.pvText(p.fen, p.moves.slice(p.setup ? 1 : 0).length ? p.moves : p.moves, 10);
      var secs = Math.round((Date.now() - t0) / 1000);
      var ctx = { fen: p.fen, solution: C.pvSan(p.fen, p.moves, 10).join(' '), themes: p.themes.join(','), solvedFirstTry: !failed, seconds: secs, allowedSans: C.pvSan(p.fen, p.moves, 10) };
      var text = shown ? 'Here\'s the solution. The key idea: ' + themeLesson(p.themes) : failed ? 'Solved with a little help. ' + themeLesson(p.themes) : pick1(['Yes!!  ', 'Boom! ~i:spark~ ', 'Brilliant! ~i:spark~ ', 'You got it!  ']) + (alt ? 'That works just as well. ' : '') + themeLesson(p.themes);
      st.coach.say(text, { cls: failed ? 'warn' : 'good', mood: failed ? 'happy' : 'wow', line: 'Line: ' + C.pvText(p.fen, p.moves, 10), ai: { kind: 'puzzle', ctx: ctx },
        actions: opts.after ? opts.after(!failed) : [{ label: 'Next puzzle ~i:play~', cls: 'primary', fn: function () { opts.next && opts.next(); } }, { label: '~i:analysis~ Analyse', fn: function () { App.analysisFen = st.game.fen(); App.go('analysis'); } }] });
      opts.onSolved && opts.onSolved(!failed);
    }
    function result(ok, hinted) {if(App.Weekly)App.Weekly.ensure();
      if(resultRecorded)return;resultRecorded=true;if(App.weeklyEvent&&!opts.noRating)App.weeklyEvent(ratingEvent,'tactics',ok?100:0,{group:'tactics:'+(p.themes[0]||'mixed')+':'+Math.floor((p.rating||800)/200)});
      if(App.ratePractice)App.ratePractice('puzzle drill',ok,p.rating||1000,ratingEvent);
      if (opts.noRating) { opts.onResult && opts.onResult(p, ok); return; }
      var s=S(),q=(s.puzzleQueue||[]).find(function(q){return q&&q.id===p.id;});if(!ok){if(!q){q={id:p.id,reps:0};s.puzzleQueue.push(q);}q.reps=0;q.due=Date.now()+864e5;}else if(q){q.reps++;q.due=Date.now()+[1,3,7,14][Math.min(3,q.reps)]*864e5;}s.puzzleQueue=s.puzzleQueue.slice(-100);s.stats.puzzles++; if (ok) s.stats.solved++;
      s.seenPuzzles[p.id] = ok ? 1 : -1;
      p.themes.forEach(function (t) { var a = s.stats.themes[t] || [0, 0]; a[ok ? 0 : 1]++; s.stats.themes[t] = a; });
      App.updateTacticsRating(p.rating || 1000, ok, ratingEvent);
      App.record('puzzle', 1, ok ? 10 : 2);
      var pt = info.querySelector('#ptimer'); if (pt) pt.innerHTML = '<span class="badge ' + (ok ? 'ok' : 'err') + '">' + (ok ? 'Solved' : 'Missed') + ' · counts toward today’s session</span>';
      opts.onResult && opts.onResult(p, ok);
    }
    if(!opts.noHelp){st.button('~i:bulb~ Hint', hint); st.button('~i:eye~ Solution', showSolution);} st.button('⇅ Flip', function () { st.board.flip(); });
    st.button('~i:next~ Skip', function () { opts.next && opts.next(); });
    return { start:start,stage:st,snapshot:checkpoint,cancel:function(discard){token++;st.input=false;if(opts.noHelp){App.trainingLock=null;document.body.classList.remove('independent-check');}if(!discard)checkpoint();opts.onSave=null;} };
  };
  function pick1(a) { return a[Math.floor(Math.random() * a.length)]; }
  function themeLesson(th) {
    var L = { fork: 'One piece attacked two things at once. Knights love forks!', pin: 'A pinned piece can\'t move without exposing something bigger behind it.', skewer: 'A skewer is a reverse pin: the big piece moves, the one behind falls.',
      discovered: 'Moving one piece uncovered an attack from another. Double threats win material!', mate1: 'Always check for checkmate first!', mate2: 'Forcing moves (checks!) make the opponent\'s replies predictable.', mate3: 'Long mates are just a chain of forcing moves. Calculate checks first.',
      hanging: 'Always look for undefended pieces, theirs AND yours.', trapped: 'A piece with no safe squares can be won.', backrank: 'A king stuck behind its own pawns is weak on the back rank. Give your king "luft"!',
      opening: 'Opening tricks punish loose pieces and early mistakes.', endgame: 'In endgames, activity and pawns matter most.', defense: 'Sometimes the best move is a defensive one. Check their threats first!',
      sacrifice: 'Giving material can pay off if it leads to mate or wins more back.', deflection: 'Lure a defender away from its job.', attraction: 'Drag a piece (often the king) onto a bad square.' };
    for (var i = 0; i < th.length; i++) if (L[th[i]]) return L[th[i]];
    return 'Checks, captures and threats: look at them first, every move.';
  }

  /* ---------- tactics ---------- */
  App.register('tactics', {
    back: 'train', nav: 'train',
    title: function (p) { return p[0] === 'slow' ? '~i:clock~ Rushed Moves' : p[0] && p[0].indexOf('trap-') === 0 ? '~i:trap~ Trap puzzles' : p[0] ? '~i:tactics~ ' + (THEME_NAMES[p[0]] || 'Mixed') : 'Tactics'; },
    render: function (el, prm) {
      var th = prm[0];
      if (!th) {
        var coach = new App.Coach(el, { max: 1 });
        coach.say('Tactics win most games under 1500. Train your weak themes most! Your tactics rating: **' + S().tacticsRating + '**', { speak: false });
        var list = App.html('<div class="tiles"></div>');
        var all = [['mixed', '~i:shuffle~', 'Mixed', 'Everything']].concat(Object.keys(THEME_NAMES).map(function (k) { return [k, { fork: '~i:fork~', pin: '', skewer: '~i:skewer~', discovered: '~i:spark~', mate1: '#', mate2: '~i:queen~', mate3: '~i:crown~', hanging: '~i:gift~', trapped: '~i:trap~', backrank: '~i:layers~', opening: '~i:book~', endgame: '~i:king~', defense: '~i:shield~', sacrifice: '~i:masks~', deflection: '~i:external~', attraction: '~i:magnet~' }[k] || '~i:tactics~', THEME_NAMES[k], '']; }));
        all.forEach(function (t) {
          var s = S().stats.themes[t[0]], sub = s ? Math.round(s[0] / (s[0] + s[1]) * 100) + '% of ' + (s[0] + s[1]) : PUZZLES.filter(function (p) { return t[0] === 'mixed' || p[4].split(' ').indexOf(t[0]) >= 0; }).length + ' puzzles';
          var x = App.html('<button class="tile"><span class="t-ic">' + t[1] + '</span><span class="t-name">' + t[2] + '</span><span class="t-sub">' + sub + '</span></button>');
          x.onclick = function () { App.go('tactics/' + t[0]); }; list.appendChild(x);
        });
        el.appendChild(list); return;
      }
      var filter = th === 'mixed' || th === 'slow' ? function () { return true; } : th.indexOf('trap-') === 0 ? (function (f) { return f === 'all' ? function (p) { return p[5] || p[4].indexOf('opening') >= 0; } : function (p) { return p[5] === f; }; })(th.slice(5)) : function (p) { return p[4].split(' ').indexOf(th) >= 0; };
      var run = App.puzzleRunner(el, { slow: th === 'slow' ? 8 : 0, next: go, hideTheme: th === 'slow' || th.indexOf('trap-') === 0, label: th.indexOf('trap-') === 0 ? 'Spot the trap' : '' });
      function go() { var p = pick(filter, S().tacticsRating); if (th.indexOf('trap-') === 0) p.prompt = 'Your opponent just made a move. Is there a trap or trick? Punish it!'; run.start(p); }
      go();
    }
  });

  App.register('daily', {
    title: '~i:sun~ Daily puzzle', back: 'train', nav: 'train',
    render: function (el) {
      var d = App.today(), h = 0; for (var i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0;
      var r = S().tacticsRating, pool = PUZZLES.filter(function (p) { return Math.abs(p[3] - r) < 250; }); if (pool.length < 5) pool = PUZZLES;
      var p = P(pool[h % pool.length]);
      var doneToday = (App.dailyCounts().daily || 0) > 0;
      var run = App.puzzleRunner(el, { label: 'Daily ' + d, noRating: doneToday, onResult: function (pz, ok) { if (!doneToday) App.record('daily', 1, ok ? 25 : 5); },
        after: function () { return [{ label: 'More tactics ~i:play~', cls: 'primary', fn: function () { App.go('tactics/mixed'); } }, { label: 'Home', fn: function () { App.go('home'); } }]; } });
      run.start(p);
      if (doneToday) run.stage.coach.say('You already did today\'s puzzle. Replays don\'t change your rating. Come back tomorrow for a new one! ~i:sun~', { speak: false });
    }
  });

  function survival(el, mode) {
    var timed = mode === 'rush', score = 0, strikes = 0, target = 600, timeLeft = 180, over = false, timer;
    var hud = App.html('<div class="card e1 row" style="justify-content:space-around;padding:10px"><div class="stat center"><b id="sc">0</b><span>Score</span></div>' + (timed ? '<div class="stat center"><b id="tm" class="timer-ring">3:00</b><span>Time</span></div>' : '') + '<div class="stat center"><b id="sk">' + (timed ? '~i:heart~~i:heart~~i:heart~' : '~i:heart~') + '</b><span>Lives</span></div><div class="stat center"><b>' + (mode === 'rush' ? S().stats.rushBest : S().stats.stormBest) + '</b><span>Best</span></div></div>');
    el.appendChild(hud);
    var run = App.puzzleRunner(el, { noRating: true, survival: true, label: mode === 'rush' ? 'Rush' : 'Streak', onResult: function (p, ok) {
      if (over) return;
      if (ok) { score++; target += timed ? 45 : 60; App.toast('+1 ~i:bolt~', 'xp', 900); }
      else { strikes++; }
      hud.querySelector('#sc').textContent = score;
      var lives = timed ? 3 : 1; hud.querySelector('#sk').textContent = '~i:heart~'.repeat(Math.max(0, lives - strikes)) + '~i:heart~'.repeat(Math.min(lives, strikes));
      if (strikes >= lives) end(); else setTimeout(next, ok ? 700 : 1400);
    }, after: function () { return []; }, onWrongText: '', next: function () { if (!over) { strikes++; if (strikes >= (timed ? 3 : 1)) end(); else next(); } } });
    function next() { if (over) return; var p = pick(function () { return true; }, target); run.start(p); }
    function end() {
      if (over) return; over = true; clearInterval(timer); run.stage.input = false;
      var s = S().stats, key = mode === 'rush' ? 'rushBest' : 'stormBest', best = score > s[key];
      if (best) { s[key] = score; App.confetti(); App.sound('win'); }
      App.record('puzzle', 0, score * 3); App.checkAch();
      run.stage.coach.say((best ? 'NEW PERSONAL BEST! ~i:trophy~ ' : 'Run over! ') + 'You scored **' + score + '**. ' + (score >= 15 ? 'That\'s seriously strong pattern recognition!' : 'Every run trains your eye. Speed comes from patterns you\'ve seen before.'), { mood: best ? 'wow' : 'happy', cls: best ? 'good' : '',
        actions: [{ label: '↺ Play again', cls: 'primary', fn: function () { App.route(); } }, { label: 'Home', fn: function () { App.go('home'); } }] });
    }
    if (timed) timer = setInterval(function () { timeLeft--; var t = hud.querySelector('#tm'); if (t) { t.textContent = Math.floor(timeLeft / 60) + ':' + String(timeLeft % 60).padStart(2, '0'); t.classList.toggle('clock', true); t.classList.toggle('low', timeLeft <= 20); } if (timeLeft <= 0) end(); }, 1000);
    App.screenCleanup = function () { over = true; clearInterval(timer); };
    next();
  }
  App.register('rush', { title: '~i:bolt~ Puzzle Rush', back: 'train', nav: 'train', render: function (el) { survival(el, 'rush'); }, leave: function () { App.screenCleanup && App.screenCleanup(); } });
  App.register('streak', { title: '~i:streak~ Puzzle Streak', back: 'train', nav: 'train', render: function (el) { survival(el, 'streak'); }, leave: function () { App.screenCleanup && App.screenCleanup(); } });

  /* ---------- calculation trainer ---------- */
  App.register('calc', {
    title: '~i:brain~ Calculation', back: 'train', nav: 'train',
    render: function (el) {
      var set = S().settings, depth = +set.calcDepth || 3, side = set.calcSide || 'both', st, cur, token = 0;
      var top = App.html('<div class="card e1 calc-controls"><div class="calc-ctl"><div class="tiny muted">Moves to calculate</div></div><div class="calc-ctl"><div class="tiny muted">Your side</div></div></div>');
      top.children[0].appendChild(App.seg([{ id: 2, label: '2' }, { id: 3, label: '3' }, { id: 4, label: '4' }, { id: 5, label: '5+' }], depth, function (v) { if (v === depth) return; depth = v; set.calcDepth = v; App.save(); next(); }, 'block'));
      top.children[1].appendChild(App.seg([{ id: 'w', label: 'White' }, { id: 'b', label: 'Black' }, { id: 'both', label: 'Both' }], side, function (v) { if (v === side) return; side = v; set.calcSide = v; App.save(); next(); }, 'block'));
      el.appendChild(top);
      st = App.stage(el, {}); st.input = false; st.board.root.classList.add('locked');
      var head = App.html('<div class="card e1 calc-head"><div class="tiny muted" id="calcLabel">Picture this line. Don’t move anything.</div><div class="calc-line" id="calcLine"></div></div>');
      st.coach.el.parentNode.insertBefore(head, st.coach.el);
      App.setContext(function () { return cur ? { mode: 'calculation', fen: cur.fen0, line: cur.lineSan.join(' '), allowedSans: cur.lineSan } : {}; });
      var nextBtn = st.button('~i:next~ New', function () { next(); }); st.button('⇅ Flip', function () { st.board.flip(); });
      function later(fn, ms) { var my = token; setTimeout(function () { if (my === token) fn(); }, ms); }
      function next() {
        token++; var my = token;
        var minPlies = depth, maxPlies = depth === 5 ? 99 : depth + 1;
        var pool = PUZZLES.filter(function (p) { var n = p[2].split(' ').length - 1; if (n < minPlies || n > maxPlies) return false; if (side === 'both') return true; var turnAfterSetup = p[1].split(' ')[1] === 'w' ? 'b' : 'w'; return turnAfterSetup === side; });
        if (!pool.length) pool = PUZZLES.filter(function (p) { return p[2].split(' ').length >= 4; });
        var p = P(pool[Math.floor(Math.random() * pool.length)]);
        var g = new Chess(p.fen); g.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
        var fen0 = g.fen(), line = p.moves.slice(1), lineSan = [];
        var g2 = new Chess(fen0); line.forEach(function (u) { var m = g2.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }); if (m) lineSan.push(m.san); });
        cur = { p: p, fen0: fen0, line: line, lineSan: lineSan, final: g2, qs: null, side: g.turn() };
        st.input = false; st.load(fen0); st.board.setOrientation(g.turn()); st.board.select(null);
        st.coach.clear();
        var lineText = C.pvText(fen0, line, 20), box = head.querySelector('#calcLine');
        head.querySelector('#calcLabel').textContent = (g.turn() === 'w' ? 'White' : 'Black') + ' to move. Picture this line in your head. Don’t move anything.';
        box.innerHTML = ''; lineText.split(' ').forEach(function (t, i) { var sp = document.createElement('span'); sp.textContent = t; sp.style.animationDelay = (i * 0.3) + 's'; box.appendChild(sp); });
        st.coach.say('Look at the board and follow the line above, move by move. **Don’t move anything!**', { speak: true, mood: 'think', explain: false });
        later(function () { ask(0); }, 600 + lineText.split(' ').length * 300);
      }
      function questions() {
        var g = cur.final, qs = [], hist = g.history({ verbose: true }), last = hist[hist.length - 1], map = parseFenMap(g.fen());
        var names = { P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen', K: 'King' };
        var pc = map[last.to];
        qs.push({ q: 'At the end of the line, what is standing on **' + last.to + '**?', options: shuffle1([(pc[0] === 'w' ? 'White ' : 'Black ') + names[pc[1]], (pc[0] === 'w' ? 'Black ' : 'White ') + names[pc[1]], (pc[0] === 'w' ? 'White ' : 'Black ') + names[pc[1] === 'Q' ? 'R' : 'Q'], 'Nothing, it\'s empty']), answer: (pc[0] === 'w' ? 'White ' : 'Black ') + names[pc[1]], explain: 'The last move was ' + last.san + ', so the ' + names[pc[1]].toLowerCase() + ' ends on ' + last.to + '.', squares: [last.from, last.to] });
        var status = g.in_checkmate() ? 'Checkmate' : g.in_check() ? 'Check' : 'No check';
        qs.push({ q: 'In the final position, is the king in check?', options: ['Checkmate', 'Check', 'No check'], answer: status, explain: status === 'No check' ? 'No piece attacks the king at the end of the line.' : 'The last move ' + last.san + ' attacks the king' + (status === 'Checkmate' ? ' and it has no escape.' : '.'), squares: [last.to] });
        var d = C.material(g.fen()), who = d > 0 ? 'White is ahead' : d < 0 ? 'Black is ahead' : 'Material is equal';
        qs.push({ q: 'Count the material after the line. Who is ahead?', options: ['White is ahead', 'Black is ahead', 'Material is equal'], answer: who, explain: 'Material count: ' + (d === 0 ? 'equal' : (d > 0 ? 'White' : 'Black') + ' +' + Math.abs(d)) + ' (pawn=1, knight/bishop=3, rook=5, queen=9).' });
        return [qs[0], qs[Math.random() < 0.5 ? 1 : 2]];
      }
      function shuffle1(a) { var u = a.filter(function (x, i) { return a.indexOf(x) === i; }); return App.shuffle(u); }
      function ask(i) {
        var qs = cur.qs || (cur.qs = questions()), q = qs[i]; if (!q) return reveal();
        var tries = 0, done = false, my = token;
        st.coach.say('~i:help~ ' + q.q, { mood: 'think', speak: true, explain: false, actions: q.options.map(function (o) { return { label: o, fn: function (b) {
          if (done || my !== token || b.classList.contains('disabled')) return;
          tries++;
          if (o === q.answer) { done = true; b.classList.add('success'); App.sound('ok'); if (tries === 1) S().stats.calc[0]++; else S().stats.calc[1]++; App.record('calcq', 1, tries === 1 ? 8 : 2); if (App.ratePractice) App.ratePractice('calculation', tries === 1, 1000, 'calc:' + cur.p.id + ':' + i + ':' + my); later(function () { st.coach.say((tries === 1 ? 'Correct. ' : 'Got it. ') + q.explain, { cls: 'good', speak: false, explain: true, actions: [{ label: 'Next question ~i:next~', cls: 'primary', once: true, fn: function () { ask(i + 1); } }] }); }, 350); }
          else { b.classList.add('disabled'); App.sound('err'); if (q.squares && tries === 2) { var mk = {}; q.squares.forEach(function (x) { mk[x] = 'hint'; }); st.board.setMarks(mk); } }
        } }; }) });
      }
      function reveal() {
        App.record('calc', 1, 5); var my = token;
        st.coach.say('Now check it on the board. Did your picture match?', { speak: false, explain: false, actions: [{ label: '~i:play~ Play the line', cls: 'primary', once: true, fn: function () {
          var i = 0; st.load(cur.fen0);
          (function step() { if (my !== token) return; if (i >= cur.line.length) { st.coach.say('That is how you calculate: one move at a time, forcing moves first.', { explain: false, actions: [{ label: 'Next position ~i:play~', cls: 'primary', once: true, fn: next }] }); return; } st.play(cur.line[i]); i++; later(step, 800); })();
        } }, { label: 'Next position ~i:next~', once: true, fn: next }] });
      }
      App.screens.calc.leave = function () { token++; };
      next();
    }
  });

  /* ---------- blunder check ---------- */
  App.register('blunder', {
    title: '~i:shield~ Blunder Check', back: 'train', nav: 'train',
    render: function (el) {
      var st = App.stage(el, {}), cur, order = App.shuffle(BLUNDERS.slice()), k = 0, streak = 0,answered=false;
      var hud = App.html('<span class="badge" id="bstreak">Streak 0</span>'); st.top.appendChild(hud);
      st.input = false;
      App.setContext(function () { return App.trainingLock&&App.trainingLock.noHelp?{mode:'unaided safety check',help:'hidden until committed'}:cur ? { mode: 'blunder check', fen: cur[0], candidate: (C.uciToMove(cur[0], cur[1]) || { move: {} }).move.san } : {}; });
      function next() {
        answered=false;if(App.lessonMode==='assessment'){App.trainingLock={noHelp:true};document.body.classList.add('independent-check');}cur = order[k++ % order.length]; st.load(cur[0]); st.board.setOrientation(new Chess(cur[0]).turn()); st.coach.clear();
        var m = C.uciToMove(cur[0], cur[1]).move;
        st.board.setArrows([{ from: m.from, to: m.to, color: 'blue' }]);
        var th = C.threats(cur[0]);
        st.coach.say('You are thinking about playing **' + m.san + '** (blue arrow). Before you let go of the piece: is it safe? ', { mood: 'think', actions: [
          { label: '~i:check~ Safe', cls: 'primary', fn: function () { answer(true); } }, { label: '~i:close~ Blunder', cls: 'danger', fn: function () { answer(false); } }] });
      }
      function answer(saidSafe) {
        if(answered)return;answered=true;App.trainingLock=null;document.body.classList.remove('independent-check');
        var right = saidSafe === !!cur[2], m = C.uciToMove(cur[0], cur[1]).move;
        S().stats.blunder[right ? 0 : 1]++;if(App.ratePractice)App.ratePractice('blunder check',right,1000,'blunder:'+Date.now()); App.record('blunder', 1, right ? 8 : 1);
        streak = right ? streak + 1 : 0; hud.textContent = 'Streak ' + streak;
        App.sound(right ? 'ok' : 'err'); if (!right) st.board.shake();
        st.play(cur[1]);
        if (!cur[2]) {
          var rf = C.moveFacts(st.game.fen(), cur[3]);
          setTimeout(function () {
            st.board.setArrows([{ from: cur[3].slice(0, 2), to: cur[3].slice(2, 4), color: 'red' }]);
            var t = (right ? 'Great eye! ~i:eye~ ' : 'Careful! ') + m.san + ' is a blunder: they answer **' + rf.san + '**' + (rf.facts.length ? ' and ' + C.join(rf.facts.slice(0, 2)) : '') + '.';
            st.coach.say(t, { cls: right ? 'good' : 'bad', mood: right ? 'wow' : 'sad', ai: { kind: 'move', ctx: { fen: cur[0], move: m.san, verdict: 'blunder', refutation: rf.san, allowedSans: [m.san, rf.san] } },
              actions: [{ label: '~i:play~ Show what happens', fn: function () { st.play(cur[3]); } }, { label: 'Next ~i:play~', cls: 'primary', fn: next }] });
          }, 500);
        } else {
          st.coach.say((right ? 'Correct! ~i:check~ ' : 'Actually it was safe. ') + m.san + ' is a good, safe move. No checks or captures hurt you after it. Stockfish agrees!', { cls: right ? 'good' : 'warn', mood: 'happy', actions: [{ label: 'Next ~i:play~', cls: 'primary', fn: next }] });
        }
      }
      st.button('~i:next~ Next', next); st.button('⇅ Flip', function () { st.board.flip(); });
      st.coach.say('The #1 habit for reaching 1500: **blunder check every move**. Ask: after my move, what are their checks, captures and threats?', { speak: true });
      setTimeout(next, 1200);
    }
  });

  /* ---------- play-out trainer: finish the win & endgames ---------- */
  function playout(el, o) {
    // o: {fen, goal:'mate'|'promote'|'draw'|'win', title, intro, tips, onDone(ok)}
    var unaided=!!o.unaided||App.lessonMode==='assessment',st = App.stage(el, {}), me, over = false, myMoves = 0, token = 0, startEval = null;
    function checkpoint(){if(o.onSave)o.onSave({fen:st.game.fen(),me:me,myMoves:myMoves,over:over});}
    function reply(){var my=token;Engine.analyse(st.game.fen(),{depth:14,movetime:700}).then(function(r){if(my!==token||over||!r)return;st.play(r.best);if(!check())st.input=true;checkpoint();});}
    function start() {
      token++; over = false; myMoves = 0; st.load(o.fen); me = st.game.turn(); st.board.setOrientation(me); st.input = true; st.coach.clear();
      st.board.opts.showDests=!unaided;if(unaided){App.trainingLock={noHelp:true};document.body.classList.add('independent-check');}st.coach.say(unaided?'Goal: '+o.title+'. Unaided attempt: no hints or live plans until the result.':o.intro, { mood: 'happy',speak:!unaided,explain:!unaided });
      if (o.tips&&!unaided) st.coach.say('~i:bulb~ ' + o.tips, { speak: false });
      if(o.resume){var r=o.resume;o.resume=null;st.load(r.fen);me=r.me;myMoves=r.myMoves||0;st.board.setOrientation(me);st.input=st.game.turn()===me;if(!st.input)reply();}checkpoint();
    }
    App.setContext(function () { return { mode: 'endgame/conversion: ' + o.title, fen: st.game.fen(), goal: o.goal }; });
    st.onUserMove = function (from, to, promo) {
      var mv = st.game.move({ from: from, to: to, promotion: promo }); if (!mv) return false;
      st.input = false; st.sync(true, mv); App.moveSound(mv, st.game); myMoves++;checkpoint();
      if (o.goal === 'promote' && mv.promotion) return end(true, 'You promoted! ~i:crown~'), true;
      if (check()) return true;
      var my = token;
      Engine.analyse(st.game.fen(), { depth: 14, movetime: 700 }).then(function (r) {
        if (my !== token || over || !r) return;
        var ln = r.lines[0], w = C.lineWin(ln), mine = me === 'w' ? w : 100 - w;
        if (o.goal !== 'draw' && mine < 70 && myMoves > 1) return end(false, 'The win slipped away. The engine now says this is no longer winning (' + C.evalText(ln) + '). Let\'s try again!');
        if (o.goal === 'draw' && mine < 25) return end(false, 'Ouch, this is now lost. Let\'s look at the key idea and try again.');
        if (o.goal === 'win' && myMoves >= 10 && ln && (ln.mate != null ? (ln.mate > 0) === (me === 'w') : Math.abs(ln.cp) > 900)) return end(true, 'Conversion checkpoint: the available engine estimates a decisive advantage after 10 moves, not a proof of a forced win.');
        if (o.goal === 'draw' && myMoves >= 15) return end(true, 'You held the draw for 15 moves! ~i:shield~ That\'s exactly how it\'s done.');
        st.play(r.best); if (check()) return; st.input = true;checkpoint();
      });
      return true;
    };
    function check() {
      var g = st.game;
      if (g.in_checkmate()) { end(g.turn() !== me, g.turn() !== me ? 'Checkmate! ' : 'You got checkmated.'); return true; }
      if (g.in_draw() || g.in_stalemate() || g.in_threefold_repetition() || g.insufficient_material()) { end(o.goal === 'draw', g.in_stalemate() ? 'Stalemate! ' + (o.goal === 'draw' ? 'Draw saved! ' : 'Careful: always leave the king a square!') : 'It\'s a draw.'); return true; }
      return false;
    }
    function end(ok, msg) {
      if(over)return;over = true; st.input = false;if(unaided){App.trainingLock=null;document.body.classList.remove('independent-check');}checkpoint();
      App.sound(ok ? 'win' : 'err'); if (ok) App.confetti();
      st.coach.say(msg + (ok && o.success ? ' ' + o.success : ''), { cls: ok ? 'good' : 'bad', mood: ok ? 'wow' : 'sad', ai: { kind: 'puzzle', ctx: { fen: st.game.fen(), result: ok ? 'success' : 'failed', task: o.title } },
        actions: [{ label: '↺ Try again', fn: start }].concat(o.next ? [{ label: 'Next ~i:play~', cls: 'primary', fn: o.next }] : []) });
      o.onDone && o.onDone(ok);
    }
    st.button('↺ Restart', start); if(!unaided)st.button('~i:bulb~ Hint', function () {
      if (over) return; Engine.analyse(st.game.fen(), { depth: 16, purpose: 'help' }).then(function (r) { if (r && r.best) { st.board.setArrows([{ from: r.best.slice(0, 2), to: r.best.slice(2, 4), color: 'blue' }]); st.coach.say('Try this move. ' + (C.moveFacts(st.game.fen(), r.best) || { facts: [] }).facts.slice(0, 1).join(''), { speak: false }); } });
    });
    st.button('⇅ Flip', function () { st.board.flip(); });
    start();st.snapshot=checkpoint;st.cancel=function(){token++;st.input=false;App.trainingLock=null;document.body.classList.remove('independent-check');checkpoint();};
    return st;
  }
  App.playout=playout;
  App.register('finish', {
    title: '~i:flag~ Finish the Win', back: 'train', nav: 'train',
    render: function (el) {
      var order = App.shuffle(FINISH.slice()), i = 0;
      (function go() {
        el.innerHTML = '';
        var f = order[i++ % order.length];
        playout(el, { fen: f[0], goal: 'win', title: 'Finish the win', intro: 'You are winning (about ' + (f[1] / 100).toFixed(1) + ' pawns up). Stockfish will defend like a monster. Convert it: trade pieces, push passed pawns, watch for checks. Win the game! ', tips: 'Ahead in material? Trade pieces, not pawns. Keep your king safe from checks.',
          onDone: function (ok) { S().stats.finish[ok ? 0 : 1]++; App.record('finish', 1, ok ? 20 : 3); }, next: go });
      })();
    }
  });

  var ENDGAMES = [
    { id: 'kq', name: 'Queen checkmate', ic: '~i:queen~', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', goal: 'mate', tips: 'Use the queen like a box: a knight\'s move away from the king shrinks its space. Bring your king to help. NEVER leave the king with no moves when it\'s not in check (stalemate!).' },
    { id: 'kr', name: 'Rook checkmate', ic: '~i:rook~', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: 'mate', tips: 'Cut the king off with the rook, walk your king up, use opposition, then check on the edge. Keep the rook far from the enemy king.' },
    { id: 'rr', name: 'Two-rook ladder', ic: '~i:layers~', fen: '8/8/3k4/8/8/8/8/R1K4R w - - 0 1', goal: 'mate', tips: 'Rooks take turns: one guards a rank, the other checks on the next one. Climb the ladder to the edge!' },
    { id: 'kp6', name: 'King & pawn: king in front', ic: '~i:pawn~', fen: '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', goal: 'promote', tips: 'Your king on the 6th rank in front of the pawn always wins. Use your king to push the enemy king aside, then push.' },
    { id: 'square', name: 'Rule of the square', ic: '~i:square~', fen: '8/8/8/P7/8/8/6k1/K7 w - - 0 1', goal: 'promote', tips: 'Draw a square from the pawn to the promotion rank. If the enemy king can\'t step into it, just run!' },
    { id: 'kpd', name: 'Defend king & pawn (draw)', ic: '~i:shield~', fen: '8/8/8/4k3/8/8/4P3/4K3 b - - 0 1', goal: 'draw', tips: 'Stay in front of the pawn and take the opposition (kings face each other with one square between, and THEY must move).' },
    { id: 'bpawn', name: 'Opposition to win', ic: '~i:swords~', fen: '8/8/1k6/8/8/1K6/1P6/8 w - - 0 1', goal: 'promote', tips: 'Lead with your king, not your pawn. Win the opposition, then the pawn walks in.' },
    { id: 'lucena', name: 'Lucena: build a bridge', ic: '~i:bridge~', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', goal: 'promote', tips: 'Check the king away, bring your rook to the 4th rank (the "bridge"), then walk your king out and block checks with the rook.' },
    { id: 'philidor', name: 'Philidor: hold the draw', ic: '', fen: '3k4/7R/8/3PK3/8/8/8/r7 b - - 0 1', goal: 'draw', tips: 'Put your rook on your 3rd rank (…Ra6) to keep the enemy king out. When the pawn advances, go behind it and check from far away.' },
    { id: 'bb', name: 'Two bishops mate', ic: '~i:bishop~', fen: '8/8/8/8/4k3/8/8/2B1KB2 w - - 0 1', goal: 'mate', tips: 'Bishops side by side make a wall. Push the king to a corner, with your king helping. Advanced!' },
    { id: 'backrank', name: 'Back-rank mate', ic: '~i:layers~', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', goal: 'mate', tips: 'A king trapped behind its own pawns can be mated on the back rank. Give your own king "luft" (h3) to avoid this!' }
  ];
  App.ENDGAMES=ENDGAMES;
  App.register('endgames', {
    title: '~i:king~ Endgames', back: 'train', nav: 'train',
    render: function (el) {
      var c = new App.Coach(el, { max: 1 }); c.say('These endgames come up all the time. Win them (or hold the draw) against the strongest available engine to earn the badge! ~i:king~', { speak: false });
      ENDGAMES.forEach(function (e) {
        var done = S().stats.endgames[e.id];
        var it = App.html('<div class="list-item"><div class="li-ic">' + e.ic + '</div><div class="grow"><b>' + e.name + '</b><span class="small muted">Goal: ' + { mate: 'checkmate', promote: 'promote the pawn', draw: 'hold the draw', win: 'win' }[e.goal] + '</span></div>' + (done ? '<span class="badge ok">OK Done</span>' : '<span class="faint">›</span>') + '</div>');
        it.onclick = function () { App.go('endgame/' + e.id); }; el.appendChild(it);
      });
    }
  });
  App.register('endgame', {
    back: 'endgames', nav: 'train', title: function (p) { var e = ENDGAMES.filter(function (x) { return x.id === p[0]; })[0]; return e ? e.ic + ' ' + e.name : 'Endgame'; },
    render: function (el, p) {
      var idx = ENDGAMES.findIndex(function (x) { return x.id === p[0]; }), e = ENDGAMES[idx]; if (!e) return App.go('endgames');
      playout(el, { fen: e.fen, goal: e.goal, title: e.name, intro: e.name + '! Goal: ' + { mate: 'checkmate the king', promote: 'make a new queen', draw: 'hold the draw for 15 moves', win: 'win' }[e.goal] + '. The strongest available engine plays the other side; fallback strength can be much lower.', tips: e.tips,
        onDone: function (ok) { if (ok) { S().stats.endgames[e.id] = Date.now(); } App.record('endgame', 1, ok ? 25 : 3); }, next: ENDGAMES[idx + 1] ? function () { App.go('endgame/' + ENDGAMES[idx + 1].id); } : null });
    }
  });

  /* ---------- coordinates ---------- */
  App.register('coords', {
    title: '~i:target~ Coordinates', back: 'train', nav: 'train',
    render: function (el) {
      var mode = 'find', color = 'w', running = false, score = 0, target, timer, left = 30;
      var ctl = App.html('<div class="card e1 col"></div>');
      ctl.appendChild(App.seg([{ id: 'find', label: 'Find square' }, { id: 'name', label: 'Name square' }], mode, function (v) { mode = v; stop(); }, 'block'));
      ctl.appendChild(App.seg([{ id: 'w', label: 'White' }, { id: 'b', label: 'Black' }, { id: 'r', label: 'Random' }], color, function (v) { color = v; stop(); st.board.setOrientation(v === 'b' ? 'b' : 'w'); }, 'block'));
      el.appendChild(ctl);
      var big = App.html('<div class="row" style="justify-content:space-between;margin:8px 0"><div class="stat"><b id="cs">0</b><span>Score</span></div><div class="coord-target" id="ct">—</div><div class="stat" style="text-align:right"><b id="ctm">30</b><span>Seconds</span></div></div>');
      el.appendChild(big);
      var st = App.stage(el, { orientation: 'w' }); st.load('8/8/8/8/8/8/8/8 w - - 0 1');
      st.board.setCoords(false);
      var opts = App.html('<div class="btn-row hide" id="nameOpts" style="margin:8px 0"></div>'); var ab=st.actionBar||st.toolbar; if(ab.parentNode&&ab.parentNode.insertBefore)ab.parentNode.insertBefore(opts, ab); else st.el.appendChild(opts);
      var startBtn = st.button('~i:play~ Start (30s)', start, 'primary');
      st.coach.say('Knowing coordinates helps you read notation, follow lessons and calculate faster. Best: White ' + S().stats.coordsBest.w + ', Black ' + S().stats.coordsBest.b + '. Ready? ~i:target~', { speak: false });
      function rnd() { return 'abcdefgh'[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); }
      function nextT() {
        target = rnd();
        if (mode === 'find') { big.querySelector('#ct').textContent = target; big.querySelector('#ct').style.animation = 'none'; void big.offsetWidth; big.querySelector('#ct').style.animation = ''; st.board.setMarks({}); }
        else {
          big.querySelector('#ct').textContent = '?'; var mk = {}; mk[target] = 'blue'; st.board.setMarks(mk);
          var choices = [target]; while (choices.length < 4) { var r = rnd(); if (choices.indexOf(r) < 0) choices.push(r); }
          opts.innerHTML = ''; App.shuffle(choices).forEach(function (c) { var b = App.html('<button class="btn">' + c + '</button>'); b.onclick = function () { hit(c, b); }; opts.appendChild(b); });
        }
      }
      function hit(sq, btn) {
        if (!running) return;
        if (sq === target) { score++; App.sound('ok'); big.querySelector('#cs').textContent = score; if (btn) btn.classList.add('success'); else st.board.flash(sq, 'flash-ok'); nextT(); }
        else { App.sound('err'); if (btn) btn.classList.add('disabled'); else st.board.flash(sq, 'flash-bad'); }
      }
      st.board.opts.onSquare = function (sq) { if (mode === 'find') hit(sq); };
      function start() {
        stop(); running = true; score = 0; left = 30; big.querySelector('#cs').textContent = 0;
        var o = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color; st.board.setOrientation(o); st.curColor = o;
        opts.classList.toggle('hide', mode !== 'name'); startBtn.textContent = '↺ Restart';
        nextT();
        var tb = document.querySelector('.topbar'), y = big.getBoundingClientRect().top + scrollY - (tb ? tb.offsetHeight : 0) - 6; window.scrollTo({ top: Math.max(0, y), behavior: App.reduced() ? 'auto' : 'smooth' });
        timer = setInterval(function () { left--; big.querySelector('#ctm').textContent = left; if (left <= 5 && left > 0) App.sound('tick'); if (left <= 0) finish(); }, 1000);
      }
      function stop() { clearInterval(timer); running = false; big.querySelector('#ctm').textContent = 30; opts.classList.add('hide'); st.board.setMarks({}); big.querySelector('#ct').textContent = '—'; }
      function finish() {
        stop(); var b = S().stats.coordsBest, k = st.curColor, best = score > b[k];
        if (best) { b[k] = score; App.confetti(); App.sound('win'); }
        App.record('coords', 1, score);
        st.coach.say((best ? 'New best as ' + (k === 'w' ? 'White' : 'Black') + '! ~i:trophy~ ' : '') + 'You got **' + score + '** in 30 seconds. ' + (score >= 25 ? 'Coordinate master!' : score >= 15 ? 'Really good, keep going for 25+!' : 'Every round makes it easier. Try again!'), { mood: best ? 'wow' : 'happy', cls: best ? 'good' : '' });
      }
      App.screenCleanup = stop;
    },
    leave: function () { App.screenCleanup && App.screenCleanup(); }
  });
})();
