/* Stacy Chess - full-game analysis + post-game results screen.
   Accuracy: Lichess-style (win%-based per-move accuracy, game = mean of volatility-weighted mean and harmonic mean).
   Classification: Stockfish eval + win% loss (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder).
   v6: no per-game "rating" is shown. One game cannot establish a rating, so Results show transparent
   non-rating metrics (average centipawn loss, error counts, analysis coverage) and keep the bot's
   approximate label separate. Every move is graded from ONE canonical pass (A.run) that Results,
   Review and the graph all share. Evaluations are always White-POV; mover-POV values are derived. */
(function () {
  var C = window.Coach, S = function () { return App.state; };
  var ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  var A = App.Analysis = { ORDER: ORDER, cache: {} };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  // remember any deep-enough eval computed during play so the post-game pass is faster
  A.quality = function(r){var q=r&&r.quality||{},lines=r&&r.lines||[];return {engine:q.engine||'unknown',fallback:q.fallback!==false,depth:lines.length?Math.min.apply(null,lines.map(function(l){return l.depth||0;})):0,terminal:!!q.terminal};};
  A.canReuse=function(r,min,pvs){var q=A.quality(r),rq=r&&r.quality||{},n=(r.lines||[]).length;return q.terminal||(!q.fallback&&q.engine===Engine.name&&(q.depth>=(min||12)||A.mateProven(r))&&n>0&&(n>=(pvs||1)||(rq.requestedMultipv||1)>=(pvs||1)));};
  A.mateProven=function(r){var l=r&&r.lines&&r.lines[0],q=r&&r.quality||{};return !!(l&&l.mate!=null&&Math.abs(l.mate)>=1&&(q.depth||0)>=2*Math.abs(l.mate)-1);};
  A.remember = function(r){if(Engine.store)Engine.store(r);if(!r||!r.fen||!r.lines||!r.lines.length)return;var key=r.fen,old=A.cache[key];if(!old||A.quality(old).depth<=A.quality(r).depth)A.cache[key]=r;var keys=Object.keys(A.cache);if(keys.length>400)delete A.cache[keys[0]];};
  A.signature=function(text){var h=2166136261;for(var i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
  A.depth = function () { var b = Engine.budget('review'); return { depth: b.depth, movetime: b.movetime }; };
  // opening-book prefixes from the course lines (FEN without move counters)
  var book = null;
  function bookSet() {
    if (book) return book; book = {};
    try { (window.OPENINGS || []).forEach(function (o) { o.lines.concat(o.traps || []).forEach(function (l) { var g = new Chess(); l.moves.split(' ').forEach(function (m, i) { if (i > 18 || !g.move(m, { sloppy: true })) return; book[g.fen().split(' ').slice(0, 4).join(' ')] = 1; }); }); }); } catch (e) { }
    return book;
  }
  function pack(r){return r?{b:r.best||null,q:r.quality||A.quality(r),l:(r.lines||[]).slice(0,2).map(function(x){return [x.uci||'',x.cp==null?null:x.cp,x.mate==null?null:x.mate,(x.pv||[]).slice(0,6).join(' '),x.depth||0];})}:null;}
  function unpack(p,fen){if(!p)return null;return {fen:fen,best:p.b,quality:p.q||{engine:'legacy cache',fallback:true,depth:0},lines:p.l.map(function(x){var o={uci:x[0],pv:x[3]?x[3].split(' '):[],depth:x[4]||0};if(x[1]!=null)o.cp=x[1];if(x[2]!=null)o.mate=x[2];return o;})};}
  A.unpack = unpack;
  function terminal(fen) {
    var g = new Chess(fen); if (!g.game_over()) return null;
    if (g.in_checkmate()) return { fen: fen, best: null, quality:{terminal:true,engine:'rules',fallback:false},lines: [{ mate: g.turn() === 'w' ? -0.0001 : 0.0001, cp: g.turn() === 'w' ? -10000 : 10000, pv: [] }] };
    return { fen: fen, best: null, quality:{terminal:true,engine:'rules',fallback:false},lines: [{ cp: 0, pv: [] }] };
  }
  A.terminal=terminal;
  // white-POV win% for an eval result
  function wwin(r) { var l = r && r.lines && r.lines[0]; if (!l) return 50; if (l.mate != null) return l.mate > 0 ? 100 : 0; return C.winPct(l.cp || 0); }
  function cpOf(r) { var l = r && r.lines && r.lines[0]; if (!l) return 0; if (l.mate != null) return l.mate > 0 ? 1500 : -1500; return clamp(l.cp || 0, -1500, 1500); }
  function stdev(a) { var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length; return Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / a.length); }
  /* Per-move accuracy from the mover's win% drop (Lichess-style curve, not Chess.com's proprietary
     formula). A floor of 1 keeps the harmonic mean meaningful: one terrible move lowers the game
     score sharply, but cannot by itself force it to half the weighted mean. */
  A.moveAccuracy = function (loss) { return clamp(103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669, 0, 100); };
  A.gameAccuracy = function (wins, moves, color) {
    // wins: White-POV win% for positions 0..n ; moves[i] = {color, acc, analysed?}
    var n = moves.length; if (!n) return null;
    var ws = clamp(Math.round(n / 10), 2, 8), weights = [];
    for (var i = 0; i < n; i++) { var lo = Math.max(0, i + 1 - ws + 1), win = wins.slice(lo, i + 2); weights.push(clamp(win.length > 1 ? stdev(win) : .5, .5, 12)); }
    var xs = [], wt = [];
    moves.forEach(function (m, i) { if (m.color === color && m.analysed !== false && m.acc != null) { xs.push(m.acc); wt.push(weights[i]); } });
    if (!xs.length) return null;
    var wsum = wt.reduce(function (a, b) { return a + b; }, 0), wmean = xs.reduce(function (a, x, i) { return a + x * wt[i]; }, 0) / wsum;
    var hmean = xs.length / xs.reduce(function (a, x) { return a + 1 / Math.max(1, x); }, 0);
    return clamp((wmean + hmean) / 2, 0, 100);
  };
  /* Move numbers respect a custom start position (e.g. a game started from an analysis FEN). */
  A.moveNo = function (base, i) { var p = String(base || '').split(' '), blackFirst = p[1] === 'b', full = +(p[5] || 1), k = i + (blackFirst ? 1 : 0); return (full + Math.floor(k / 2)) + (k % 2 ? '…' : '.'); };
  /* Graph x → move index: position k = round(f·n); the move that produced it is k−1 (start → first move). */
  A.graphMove = function (fraction, nMoves) { if (!nMoves) return 0; var k = Math.round(clamp(fraction, 0, 1) * nMoves); return clamp(k - 1, 0, nMoves - 1); };
  /* Turning point: the move after which the eventual loser's position went from playable (≥40% for the
     mover) to lost (<40%) and never recovered to 50%. Falls back to the largest real error (loss ≥10).
     Returns null when nothing qualifies (e.g. a clean game) instead of naming a random move. */
  A.turningPoint = function (res, me, result) {
    var loser = result === 'win' ? (me === 'w' ? 'b' : 'w') : result === 'loss' ? me : null, cand = [];
    res.moves.forEach(function (m) { if (!m.analysed || (loser && m.color !== loser)) return; var w0 = m.color === 'w' ? res.wins[m.i] : 100 - res.wins[m.i], w1 = m.color === 'w' ? res.wins[m.i + 1] : 100 - res.wins[m.i + 1];
      var later = res.wins.slice(m.i + 1).map(function (w) { return m.color === 'w' ? w : 100 - w; });
      if (w0 >= 40 && w1 < 40 && m.loss >= 10 && later.every(function (w) { return w < 50; })) cand.push(m); });
    var pick = cand[0] || res.moves.filter(function (m) { return m.analysed && m.loss >= 10 && (!loser || m.color === loser); }).sort(function (a, b) { return b.loss - a.loss || a.i - b.i; })[0];
    if (!pick) return null;
    return { i: pick.i, color: pick.color, san: pick.san, label: A.moveNo(res.base, pick.i) + ' ' + pick.san, grade: pick.grade, loss: pick.loss, mine: pick.color === me, kind: cand[0] === pick ? 'decisive' : 'largest error' };
  };
  /* Help used in a game, recorded precisely so the "unrated" note names exactly what happened. */
  A.helpNote = function (help) { help = help || {}; var parts = []; if (help.hints) parts.push(help.hints + ' hint' + (help.hints > 1 ? 's' : '')); if (help.takebacks) parts.push(help.takebacks + ' takeback' + (help.takebacks > 1 ? 's' : '')); return parts.length ? 'Unrated: you used ' + parts.join(' and ') + ' in this game.' : null; };
  var COVERAGE = .8;
  var R = window.StacyReview;
  A.seq = 0; A.running = {};
  /* v9 analyse a game record with the shared engine service and the shared classifier (review.js).
     Phase 1 searches every position (MultiPV 2, background priority, owner-scoped so Stop/leave cancels only
     this review). Phase 2 runs the extra verification searches that Brilliant candidates need. Classification
     is then a pure function of (evals, verifications), so Results, the summary popup and Game Review all
     show the same grades from the same stored dataset; nothing is graded twice with different data.
     Partial progress is saved after every few searches; Stop/leave resumes later. With runOpts.partialOnCancel
     a cancelled run resolves with an explicitly partial result (never saved as a finished review). */
  A.run = function (rec, onProgress, isCancelled, runOpts) {
    runOpts = runOpts || {};
    var g = new Chess(); if (!g.load_pgn(rec.pgn, { sloppy: true })) return Promise.reject(new Error('Could not read this game.'));
    var hd = g.header(), base = hd.FEN || new Chess().fen(), moves = g.history({ verbose: true });
    var fens = [base], x = new Chess(base), terminals = [R.terminal(base)];
    moves.forEach(function (m) { x.move(m.san); fens.push(x.fen()); terminals.push(x.game_over() ? R.terminal(x.fen(), x.in_threefold_repetition() ? 'threefold repetition' : null) || R.terminal(x.fen(), 'draw') : null); });
    var sig = A.signature(rec.pgn), mode = rec.reviewMode === 'deep' ? 'deep' : 'standard', B = Engine.budget(mode === 'deep' ? 'deep' : 'review'), VB = Engine.budget('verify'), minimum = B.minDepth;
    var owner = 'review:' + rec.id + ':' + (++A.seq); A.running[rec.id] = owner;
    function cancelled() { return (isCancelled && isCancelled()) || A.running[rec.id] !== owner; }
    var same = rec.analysis && rec.analysis.v === 5 && rec.analysis.signature === sig;
    var evals = new Array(fens.length), cached = same && rec.evals && rec.evals.length === fens.length ? rec.evals : null;
    var prog = rec.evalProgress && rec.evalProgress.v === 5 && rec.evalProgress.signature === sig && rec.evalProgress.evals && rec.evalProgress.evals.length === fens.length ? rec.evalProgress : null;
    var vstore = {}, vsrc = (same && rec.verify) || (prog && prog.verify) || {};
    Object.keys(vsrc).forEach(function (i) { var v = vsrc[i]; if (!v || !v.after) return; var u = { after: unpack(v.after, v.afterFen), accept: v.accept ? unpack(v.accept, v.acceptFen) : null }; if (A.canReuse(u.after, VB.minDepth, 1) && (!u.accept || A.canReuse(u.accept, VB.minDepth, 1))) vstore[i] = { data: u, packed: v }; });
    var failed = 0, searchedN = 0, sinceSave = 0;
    function packVerify() { var o = {}; Object.keys(vstore).forEach(function (i) { o[i] = vstore[i].packed; }); return o; }
    function saveProgress() { rec.evalProgress = { v: 5, signature: sig, mode: mode, evals: evals.map(function (r) { return r && !A.quality(r).terminal ? pack(r) : null; }), verify: packVerify(), at: Date.now() }; App.save(); }
    function valid(r, fen) { return r && r.lines && r.lines.length && (!r.fen || r.fen === fen); }
    function report(info) { if (onProgress) try { onProgress(info.phase === 'positions' ? info.done / info.total : 1, info); } catch (e) { } }
    return new Promise(function (resolve, reject) {
      function stop() { if (searchedN) saveProgress(); if (runOpts.partialOnCancel) { var r = finish(true); r.cancelled = true; return resolve(r); } reject(new Error('cancelled')); }
      (function step(k) {
        if (cancelled()) return stop();
        if (k >= fens.length) { if (failed && failed >= fens.filter(function (f, i) { return !terminals[i]; }).length) return reject(new Error('The engine did not return any evaluation. Retry the analysis; no accuracy was invented.')); return verifyPhase(); }
        report({ phase: 'positions', done: k, total: fens.length, depth: B.depth, mode: mode, engine: Engine.name });
        var t = terminals[k]; if (t) { evals[k] = t; return step(k + 1); }
        var pvs = k < fens.length - 1 ? 2 : 1;
        var pools = [cached && cached[k], prog && prog.evals[k]];
        for (var pi = 0; pi < pools.length; pi++) { if (pools[pi]) { var saved = unpack(pools[pi], fens[k]); if (A.canReuse(saved, minimum, pvs)) { evals[k] = saved; return step(k + 1); } } }
        function attempt(n) {
          Engine.analyse(fens[k], { depth: B.depth, movetime: B.movetime, minDepth: minimum, multipv: pvs, priority: 'background', owner: owner }).then(function (r) {
            if (cancelled()) return stop();
            if (!valid(r, fens[k])) { if (n < 1) return attempt(n + 1); evals[k] = null; failed++; return step(k + 1); } // unanalysed: never a fake 50%
            evals[k] = r; searchedN++; if (++sinceSave >= 4) { sinceSave = 0; saveProgress(); } setTimeout(function () { step(k + 1); }, 0);
          }).catch(function () { if (cancelled()) return stop(); if (n < 1) return attempt(n + 1); evals[k] = null; failed++; step(k + 1); });
        }
        attempt(0);
      })(0);
      function verifyPhase() {
        var prelim = classifyAll(), todo = [];
        prelim.forEach(function (c, i) { if (c && c.needsVerify && !vstore[i]) todo.push(i); });
        (function vstep(j) {
          if (cancelled()) return stop();
          if (j >= todo.length) { var res = finish(false); return resolve(res); }
          report({ phase: 'verify', done: j, total: todo.length, depth: VB.depth, mode: mode, engine: Engine.name });
          var i = todo[j], c = prelim[i];
          R.verify(c, Engine.analyse, { depth: VB.depth, movetime: VB.movetime, priority: 'background', owner: owner }).then(function (v) {
            if (cancelled()) return stop();
            if (v && v.after && v.after.lines && v.after.lines.length) { vstore[i] = { data: v, packed: { after: pack(v.after), afterFen: c.needsVerify.after, accept: v.accept ? pack(v.accept) : null, acceptFen: v.accept ? v.accept.fen : null } }; saveProgress(); }
            vstep(j + 1);
          }, function () { vstep(j + 1); });
        })(0);
      }
    });
    /* Classify from the stored (packed) form so a fresh run and a later reopen see identical inputs. */
    function norm(r, fen) { return r && !A.quality(r).terminal ? unpack(pack(r), fen) : r; }
    function classifyAll() {
      var bs = bookSet(), inBook = true, prevLoss = 0, out = [], ev = evals.map(function (r, k) { return norm(r, fens[k]); });
      moves.forEach(function (m, i) {
        var key = fens[i + 1].split(' ').slice(0, 4).join(' '), isBook = inBook && !!bs[key] && i < 24, uci = m.from + m.to + (m.promotion || '');
        if (!isBook) inBook = false;
        if (!ev[i] || !ev[i + 1]) { out.push(null); prevLoss = 0; return; }
        var pm = i ? moves[i - 1] : null, v0 = vstore[i] && vstore[i].packed, v = v0 ? { after: unpack(v0.after, v0.afterFen), accept: v0.accept ? unpack(v0.accept, v0.acceptFen) : null } : null;
        var c = R.classify({ fen: fens[i], uci: uci, before: ev[i], after: ev[i + 1], minDepth: minimum, book: isBook, bookNote: '', prevOppLoss: prevLoss, prevMove: pm ? { to: pm.to, captured: pm.captured } : null, verify: v || null, terminalKind: terminals[i + 1] && terminals[i + 1].quality.kind });
        out.push(c); prevLoss = c.limited ? 0 : c.loss;
      });
      return out;
    }
    function finish(isPartial) {
      var cls = classifyAll(), out = [];
      // White-POV win% per position; an unanalysed position carries the previous value for the graph only.
      var wins = [], last = 50; evals.forEach(function (r) { if (r) last = wwin(r); wins.push(last); });
      moves.forEach(function (m, i) {
        var c = cls[i];
        if (!c) { out.push({ i: i, san: m.san, color: m.color, grade: null, analysed: false, loss: null, acc: null, cpl: null, label: A.moveNo(base, i), text: m.san + (isPartial ? ' has not been analysed yet.' : ' could not be analysed (engine unavailable); it is not graded and not counted in accuracy.') }); return; }
        if (c.limited) { out.push({ i: i, san: m.san, color: m.color, grade: 'limited', analysed: false, limited: true, loss: c.loss, acc: null, cpl: null, label: A.moveNo(base, i), text: c.text, j: c }); return; }
        var sgn = m.color === 'w' ? 1 : -1, cpl = c.reasons.indexOf('engine-first-choice') >= 0 ? 0 : clamp(sgn * (cpOf(evals[i]) - cpOf(evals[i + 1])), 0, 1000);
        out.push({ i: i, san: m.san, color: m.color, grade: c.grade, analysed: true, loss: c.loss, acc: A.moveAccuracy(c.loss), cpl: cpl, winBefore: c.winBefore, winAfter: c.winAfter, bestSan: c.bestSan, bestUci: c.bestUci, label: A.moveNo(base, i), text: c.text, j: c });
      });
      var res = { moves: out, wins: wins, base: base, sans: moves.map(function (m) { return m.san; }), counts: { w: {}, b: {} }, acc: {}, acpl: {}, errors: {}, coverage: {}, partial: !!isPartial };
      out.forEach(function (m) { if (m.grade && m.grade !== 'limited') res.counts[m.color][m.grade] = (res.counts[m.color][m.grade] || 0) + 1; });
      ['w', 'b'].forEach(function (c) {
        var all = out.filter(function (m) { return m.color === c; }), mine = all.filter(function (m) { return m.analysed; });
        res.coverage[c] = { graded: mine.length, total: all.length, limited: all.filter(function (m) { return m.limited; }).length, pending: all.filter(function (m) { return !m.analysed && !m.limited; }).length };
        res.acc[c] = all.length && mine.length / all.length >= COVERAGE ? A.gameAccuracy(wins, out, c) : null;
        res.acpl[c] = mine.length ? Math.round(mine.reduce(function (a, m) { return a + m.cpl; }, 0) / mine.length) : null;
        res.errors[c] = { inaccuracy: res.counts[c].inaccuracy || 0, mistake: res.counts[c].mistake || 0, blunder: (res.counts[c].blunder || 0) + (res.counts[c].miss || 0) };
      });
      res.turning = A.turningPoint(res, rec.color, rec.result);
      var searched = evals.filter(function (r) { return r && !A.quality(r).terminal; }), depths = searched.map(function (r) { return A.quality(r).depth; });
      var quality = { positions: searched.length, total: fens.length, unanalysed: evals.filter(function (r) { return !r; }).length, unanalysedMoves: out.filter(function (m) { return !m.analysed; }).length, limitedMoves: out.filter(function (m) { return m.limited; }).length, mode: mode,
        minDepth: depths.length ? Math.min.apply(null, depths) : 0, avgDepth: depths.length ? Math.round(depths.reduce(function (a, b) { return a + b; }, 0) / depths.length) : 0, requiredDepth: minimum,
        limited: searched.some(function (r) { var q = A.quality(r); return q.fallback || q.depth < minimum; }) || !searched.length, engines: Array.from(new Set(searched.map(function (r) { return A.quality(r).engine; }))), verified: Object.keys(vstore).length, partial: !!isPartial };
      res.quality = quality;
      if (isPartial) return res;
      rec.evals = evals.map(pack); rec.verify = packVerify();
      rec.analysis = { v: 5, signature: sig, quality: quality, grades: out.map(function (m) { return m.grade; }), losses: out.map(function (m) { return m.loss; }), acc: res.acc, counts: res.counts, acpl: res.acpl, errors: res.errors, coverage: res.coverage, turning: res.turning, depth: quality.minDepth, requestedDepth: B.depth, engine: Engine.name };
      delete rec.evalProgress;
      if (!rec.analysisDoneAt) rec.analysisDoneAt = Date.now();
      if (res.acc[rec.color] != null) rec.acc = Math.round(res.acc[rec.color]); else delete rec.acc; rec.reviewed = true;
      // keep stored evals small: only the newest 12 games keep full eval caches
      var withEvals = S().games.filter(function (x) { return x.evals; }); if (withEvals.length > 12) withEvals.slice(0, withEvals.length - 12).forEach(function (x) { delete x.evals; delete x.verify; });
      if (A.running[rec.id] === owner) delete A.running[rec.id];
      App.save();
      return res;
    }
  };
  A.stop = function (rec) { var o = A.running[rec.id]; if (o) { delete A.running[rec.id]; Engine.cancel(o); } };
  A.qualityText=function(rec,q){q=q||rec.analysis&&rec.analysis.quality;if(!q)return 'Analysis quality unknown; run the updated analysis.';var parts=[];
    parts.push(q.partial?'Partial analysis ('+q.positions+'/'+q.total+' positions)':q.limited?'Limited analysis':'Engine review');
    if(q.mode==='deep')parts.push('deeper search');
    parts.push((q.engines.length?q.engines.join(', '):'no engine')+' · depth '+q.minDepth+' minimum / '+q.avgDepth+' average (graded moves need '+(q.requiredDepth||12)+')');
    if(q.verified)parts.push(q.verified+' sacrifice check'+(q.verified>1?'s':'')+' verified deeper');
    if(q.limitedMoves)parts.push(q.limitedMoves+' move'+(q.limitedMoves>1?'s':'')+' not graded (search too limited)');
    if(q.unanalysed&&!q.partial)parts.push(q.unanalysedMoves+' move'+(q.unanalysedMoves>1?'s':'')+' not analysed (engine unavailable)');
    return parts.join(' · ')+'. Accuracy is a Lichess-style estimate, not Chess.com’s formula, and is only shown when at least 80% of a side’s moves are graded.';};
  A.awardReview=function(rec){if(rec.reviewAwarded)return false;rec.reviewAwarded=true;if(rec.acc!=null){S().stats.accuracy.push(rec.acc);if(S().stats.accuracy.length>50)S().stats.accuracy.shift();}App.record('review',1,15);App.save();return true;};
  A.badge = function (k) { return '~g:' + k + '~'; };
  /* Evaluation graph: White-POV win% (top = White better). x of position k = k/n; move i sits at
     position i+1, so markers and taps map to the same move index as Review. */
  A.graphPoint = function (i, nMoves) { return nMoves ? (i + 1) / nMoves * 300 : 0; };
  function graph(wins, me, marks) {
    var n = wins.length - 1; if (n < 1) return '';
    var pts = wins.map(function (w, i) { return [(i / n * 300).toFixed(1), (80 - w / 100 * 80).toFixed(1)]; });
    var area = 'M0 80 ' + pts.map(function (p) { return 'L' + p[0] + ' ' + p[1]; }).join(' ') + ' L300 80Z';
    var dots = (marks || []).map(function (m) { var x = A.graphPoint(m.i, n).toFixed(1), y = (80 - wins[m.i + 1] / 100 * 80).toFixed(1); return '<circle class="gmark" data-i="' + m.i + '" cx="' + x + '" cy="' + y + '" r="3.2" fill="' + (C.GRADES[m.grade] ? C.GRADES[m.grade].color : '#fff') + '" stroke="#0d0d0f" stroke-width="1"/>'; }).join('');
    return '<svg class="eval-graph" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="Evaluation graph: top is better for White, bottom better for Black; you are ' + (me === 'w' ? 'White' : 'Black') + '"><rect width="300" height="80" fill="#262a33"/><path d="' + area + '" fill="#eef1f4"/><line x1="0" y1="40" x2="300" y2="40" stroke="rgba(127,127,127,.6)" stroke-width=".6" stroke-dasharray="3 3"/>' + dots + '</svg><div class="row tiny muted graph-key"><span>▲ White better</span><span class="grow"></span><span>You: ' + (me === 'w' ? 'White' : 'Black') + '</span><span class="grow"></span><span>▼ Black better</span></div>';
  }
  A.graph = graph;
  function ring(v) { return '<div class="ring" style="--p:' + (v == null ? 0 : Math.round(v)) + '"><span>' + (v == null ? '—' : v.toFixed(1)) + '</span></div>'; }

  App.register('results', {
    title: 'Game results', back: 'playhub', nav: 'playhub',
    render: function (el, p) {
      var rec = S().games.filter(function (g) { return g.id === p[0]; })[0];
      if (!rec) return App.go('games');
      var me = rec.color, op = me === 'w' ? 'b' : 'w', dead = false;
      var head = rec.result === 'win' ? 'You won' : rec.result === 'draw' ? 'Draw' : (rec.opp || 'Opponent') + ' won';
      el.innerHTML = '<div class="card e3 results-hero ' + rec.result + '"><div class="row">' + App.avatar(rec.result === 'win' ? 'wow' : 'happy') + '<div class="grow"><div class="eyebrow">' + App.esc(rec.why || '') + '</div><h2 style="margin:2px 0 0">' + App.esc(head) + '</h2><div class="small muted" id="resLine">Stockfish is checking every move…</div></div></div>' +
        '<div class="bar" id="resBar" style="margin-top:12px"><i style="width:0"></i></div></div><div id="resBody"></div>';
      var sr = rec.stacyDelta, body = el.querySelector('#resBody');
      function side(c, name, extra) {
        var cov = res0.coverage[c], acc = res0.acc[c], err = res0.errors[c];
        return '<div class="rp">' + (extra || '') + '<div class="rp-name">' + name + '</div>' + ring(acc) + '<div class="tiny muted">' + (acc == null ? 'Accuracy · not enough analysed moves' : 'Accuracy estimate') + '</div>' +
          '<div class="rp-rating"><b>' + (res0.acpl[c] == null ? '—' : res0.acpl[c]) + '</b><span class="tiny muted">Avg. centipawn loss</span></div>' +
          '<div class="tiny muted">' + err.mistake + ' mistake' + (err.mistake === 1 ? '' : 's') + ' · ' + err.blunder + ' blunder' + (err.blunder === 1 ? '' : 's') + '</div>' +
          '<div class="tiny muted">' + cov.graded + '/' + cov.total + ' moves graded' + (cov.limited ? ' · ' + cov.limited + ' not graded (limited search)' : '') + (cov.pending ? ' · ' + cov.pending + ' not analysed yet' : '') + '</div></div>';
      }
      var res0 = null;
      function draw(res) {
        res0 = res;
        var you = App.esc(S().settings.name || 'You'), opp = App.esc(rec.opp || 'Opponent'), bot = rec.botId && App.bot(rec.botId);
        var rows = ORDER.map(function (k) { var a = res.counts[me][k] || 0, b = res.counts[op][k] || 0; return '<div class="cls-row' + (a || b ? '' : ' zero') + '"><b class="n">' + a + '</b><span class="cls-name">' + A.badge(k) + ' ' + C.GRADES[k].label + '</span><b class="n">' + b + '</b></div>'; }).join('');
        var keyM = res.moves.filter(function (m) { return m.analysed && m.color === me && ['blunder', 'mistake', 'miss'].indexOf(m.grade) >= 0; }).sort(function (a, b) { return b.loss - a.loss || a.i - b.i; }).slice(0, 3);
        var good = res.moves.filter(function (m) { return m.analysed && m.color === me && ['brilliant', 'great'].indexOf(m.grade) >= 0; }).slice(0, 2);
        var tp = res.turning, level = bot ? 'Opponent: ' + App.esc(bot.name) + ' · approximate bot level ~' + bot.elo + ' (a label, not a measured rating)' : rec.elo ? 'Opponent level ~' + rec.elo + ' (approximate label)' : '';
        var helpNote = rec.ratedNote || A.helpNote(rec.help);
        body.innerHTML = '<div class="card results-players">' + side(me, you) + '<div class="rp-vs">vs</div>' + side(op, opp, bot ? App.botAvatar(rec.botId) : '') + '</div>' +
          (level ? '<p class="tiny muted" style="margin:-4px 4px 10px">' + level + '. One game cannot measure a rating, so no per-game rating is shown.</p>' : '') +
          (rec.stacyPending ? '<div class="card row"><span class="li-ic">~i:chart~</span><div class="grow"><b>Rated game · counts toward today’s session</b><div class="tiny muted">Your Stacy rating updates once, when you finish today’s session (max ±' + App.RATING_CAP + ').</div></div><b style="font-size:22px">' + App.stacyScore() + '</b></div>' : '') + (sr != null ? '<div class="card row"><span class="li-ic">~i:chart~</span><div class="grow"><b>Stacy rating ' + (sr >= 0 ? '+' : '') + sr + '</b><div class="tiny muted">' + App.esc(rec.ratedNote || 'Rated against ' + (rec.opp || 'the bot') + ' (' + rec.elo + ')') + '</div></div><b style="font-size:22px">' + App.stacyScore() + '</b></div>' : (helpNote ? '<div class="card small muted" id="ratedNote">' + App.esc(helpNote) + '</div>' : '')) +
          (tp ? '<button class="list-item turning" id="turningPoint"><span class="li-ic">' + (tp.grade ? A.badge(tp.grade) : '') + '</span><div class="grow" style="text-align:left"><b class="small">' + (tp.mine ? 'Turning point' : 'Where ' + App.esc(rec.result === 'win' ? 'you took over' : 'it turned')) + ': ' + App.esc(tp.label) + '</b><div class="tiny muted">' + (tp.kind === 'decisive' ? 'After this move the position stayed lost for ' + (tp.color === 'w' ? 'White' : 'Black') + '.' : 'The largest error in the game.') + ' Tap to see the position.</div></div><span class="ic">~i:next~</span></button>' : '') +
          '<div class="card"><div class="row small" style="margin-bottom:6px"><b class="grow">Evaluation</b><span class="muted tiny">tap to review a moment</span></div><div id="graphHost">' + graph(res.wins, me, keyM.concat(good, tp ? [tp] : [])) + '</div></div>' +
          '<div class="card cls-table"><div class="cls-row head"><span class="n tiny muted">You</span><span class="cls-name tiny muted">Move quality</span><span class="n tiny muted">Them</span></div>' + rows + '</div>' +
          (keyM.length || good.length ? '<div class="section-title">Key moments</div><div class="col" id="keyMoments"></div>' : '') +
          '<div class="btn-row" style="margin-top:12px"><button class="btn primary" id="resReview">~i:search~ Review game</button><button class="btn" id="resRematch">~i:repeat~ Rematch</button><button class="btn" id="resNew">~i:pawn~ New game</button></div>' +
          (res.quality.mode !== 'deep' ? '<button class="btn sm ghost" id="resDeep">Run a deeper review (slower; you can leave and resume)</button>' : '') +
          '<p class="tiny muted" style="margin-top:12px">' + App.esc(A.qualityText(rec, res.quality)) + '</p>';
        var km = body.querySelector('#keyMoments');
        good.concat(keyM).forEach(function (m) {
          var b = App.html('<button class="list-item"><span class="li-ic">' + A.badge(m.grade) + '</span><div class="grow" style="text-align:left"><b class="small">Move ' + App.esc(m.label) + ' ' + App.esc(m.san) + ' · ' + C.GRADES[m.grade].label + (m.tentative ? ' (limited depth)' : '') + '</b><div class="tiny muted">' + (m.bestSan && m.bestSan !== m.san && ['blunder', 'mistake', 'miss'].indexOf(m.grade) >= 0 ? 'Better was ' + App.esc(m.bestSan) : 'Great find, see why') + '</div></div><span class="ic">~i:next~</span></button>');
          b.onclick = function () { App.go('review/' + rec.id + '/' + m.i); }; if (km) km.appendChild(b);
        });
        var tpb = body.querySelector('#turningPoint'); if (tpb && tp) tpb.onclick = function () { App.go('review/' + rec.id + '/' + tp.i); };
        var gh = body.querySelector('#graphHost');
        gh.onclick = function (e) { var r = gh.getBoundingClientRect(); App.go('review/' + rec.id + '/' + A.graphMove((e.clientX - r.left) / (r.width || 1), res.moves.length)); };
        body.querySelector('#resReview').onclick = function () { App.go('review/' + rec.id); };
        body.querySelector('#resRematch').onclick = function () { if (rec.mp && rec.mp.roomId) { App.go('mp-room/' + rec.mp.roomId); return; } App.rematch = rec.cfg || null; App.go('play'); };
        body.querySelector('#resNew').onclick = function () { App.go('play'); };
        var deep = body.querySelector('#resDeep'); if (deep && res.quality.mode !== 'deep') deep.onclick = function () { rec.reviewMode = 'deep'; App.save(); App.route(); };
        var accMe = res.acc[me], line = el.querySelector('#resLine');
        var msg = accMe == null ? 'Not enough moves could be analysed to give an accuracy.' : tp ? (tp.mine ? 'The turning point: ' : 'Where it turned: ') + 'move ' + tp.label + '.' : keyM.length ? 'Biggest error: move ' + keyM[0].label + ' ' + keyM[0].san + '.' : accMe >= 85 ? 'Clean game. Very few real errors.' : 'No big blunders. Now let’s sharpen the small stuff.';
        line.textContent = (accMe == null ? '' : 'Accuracy ' + accMe.toFixed(1) + '. ') + msg;
        if (res.partial) line.textContent = 'Limited summary from the moves analysed so far. ' + (accMe == null ? 'No accuracy: under 80% of your moves are graded.' : 'Accuracy ' + accMe.toFixed(1) + ' (partial).');
        else if (window.Voice && accMe != null) Voice.speak(head + '. ' + msg, { priority: 1 });
      }
      /* v9 post-game flow: (1) the outcome is already saved when this screen opens; (2) the analysis runs
         with real progress (positions searched / total, then sacrifice checks) and can be stopped; (3) only a
         complete review opens the summary popup, once per game; (4) "Open Game Review" shows the same stored
         dataset. Stop offers an explicit limited summary instead of a fake 100%. */
      var bar = el.querySelector('#resBar i'), line0 = el.querySelector('#resLine'), hero = el.firstElementChild || el.children[0], sheet = null, partialShown = false;
      line0.textContent = 'Game saved · ' + (rec.why || 'finished') + '. Analysing every move…';
      var ctl = App.html('<div class="res-ctl" id="resCtl"><p class="tiny muted" id="resProg" aria-live="polite">Starting the engine…</p><div class="btn-row"><button class="btn sm" id="resStop">Stop analysis</button></div></div>');
      if (hero && hero.appendChild) hero.appendChild(ctl);
      function progText(info) {
        if (!info) return '';
        if (info.phase === 'verify') return 'Verifying ' + info.total + ' possible sacrifice' + (info.total > 1 ? 's' : '') + ' with a deeper search · ' + info.done + '/' + info.total + ' · ' + info.engine;
        return 'Position ' + Math.min(info.done + 1, info.total) + ' of ' + info.total + ' · depth ' + info.depth + (info.mode === 'deep' ? ' (deeper review)' : '') + ' · ' + info.engine;
      }
      function choices(res) {
        var cov = res.coverage[me], pct = cov.total ? Math.round(cov.graded / cov.total * 100) : 0;
        ctl.innerHTML = '<p class="small" id="resProg"><b>Analysis stopped.</b> ' + cov.graded + ' of your ' + cov.total + ' moves are graded (' + pct + '%). Progress is saved.</p><div class="btn-row"><button class="btn sm primary" id="resResume">Resume analysis</button><button class="btn sm" id="resPartial">Show limited summary</button><button class="btn sm ghost" id="resLater">Leave · resume later</button></div>';
        ctl.querySelector('#resResume').onclick = function () { App.route(); };
        ctl.querySelector('#resPartial').onclick = function () { partialShown = true; ctl.querySelector('#resProg').innerHTML = '<b>Limited summary.</b> Based on the ' + cov.graded + ' graded moves only; not a finished review.'; draw(res); };
        ctl.querySelector('#resLater').onclick = function () { App.go('playhub'); };
      }
      function popup(res) {
        if (rec.summaryShown || !document.body) return;
        rec.summaryShown = Date.now(); App.save();
        var accMe = res.acc[me], counts = res.counts[me], tp = res.turning;
        var gr = ORDER.filter(function (k) { return counts[k]; }).map(function (k) { return '<span class="chip" style="cursor:default">' + A.badge(k) + ' ' + C.GRADES[k].label + ' ' + counts[k] + '</span>'; }).join('');
        var errs = res.moves.filter(function (m) { return m.analysed && m.color === me && ['blunder', 'mistake', 'miss'].indexOf(m.grade) >= 0; }).sort(function (a, b) { return b.loss - a.loss; }).slice(0, 2);
        var stars = res.moves.filter(function (m) { return m.analysed && m.color === me && (m.grade === 'brilliant' || m.grade === 'great'); }).slice(0, 2);
        var finds = [];
        if (tp) finds.push((tp.mine ? 'Turning point: ' : 'Where it turned: ') + tp.label + (tp.grade ? ' (' + C.GRADES[tp.grade].label + ')' : ''));
        errs.forEach(function (m) { if (!tp || m.i !== tp.i) finds.push(m.label + ' ' + m.san + ' · ' + C.GRADES[m.grade].label + (m.bestSan ? ' · better ' + m.bestSan : '')); });
        stars.forEach(function (m) { finds.push(m.label + ' ' + m.san + ' · ' + C.GRADES[m.grade].label); });
        var lim = res.quality.limited || res.quality.limitedMoves;
        sheet = App.sheet('<div class="res-pop" role="document"><h3 id="resPopTitle">' + App.esc(head) + '</h3><p class="small muted">' + App.esc(rec.why || '') + ' · ' + res.sans.length + ' moves · analysis complete</p>' +
          '<div class="row" style="gap:12px;align-items:center">' + ring(accMe) + '<div class="grow small">' + (accMe == null ? '<b>No accuracy shown</b><div class="tiny muted">Fewer than 80% of your moves could be graded.</div>' : '<b>Accuracy ' + accMe.toFixed(1) + '</b><div class="tiny muted">Estimate from ' + res.coverage[me].graded + '/' + res.coverage[me].total + ' graded moves</div>') + '</div></div>' +
          '<div class="chips" style="margin-top:8px">' + (gr || '<span class="tiny muted">No graded moves.</span>') + '</div>' +
          (finds.length ? '<h4>Key findings</h4><ul class="small">' + finds.map(function (f) { return '<li>' + App.esc(f) + '</li>'; }).join('') + '</ul>' : '<p class="small">No big errors found.</p>') +
          (lim ? '<p class="alert warn small">' + App.esc(res.quality.limited && !res.coverage[me].graded ? 'The full engine was not available, so moves were not graded. Retry when it loads.' : res.quality.limitedMoves + ' move(s) were not graded because the search was too limited.') + ' <a href="#/engine-check">Engine check</a></p>' : '') +
          '<p class="tiny muted">' + App.esc(A.qualityText(rec, res.quality)) + '</p>' +
          '<div class="btn-row"><button class="btn primary" id="popReview">~i:search~ Open Game Review</button><button class="btn" id="popClose">Close</button></div></div>', {});
        var sel = sheet.el; sel.setAttribute('aria-labelledby', 'resPopTitle'); sel.setAttribute('aria-modal', 'true');
        sel.querySelector('#popReview').onclick = function () { var s0 = sheet; sheet = null; s0.close(); App.go('review/' + rec.id); };
        sel.querySelector('#popClose').onclick = function () { var s0 = sheet; sheet = null; s0.close(); };
        sel._esc = function (e) { if (e.key === 'Escape' && sheet) { var s0 = sheet; sheet = null; s0.close(); } };
        document.addEventListener('keydown', sel._esc);
        var pr = sel.querySelector('#popReview'); if (pr && pr.focus) try { pr.focus(); } catch (e) { }
      }
      ctl.querySelector('#resStop').onclick = function () { dead = true; A.stop(rec); };
      A.run(rec, function (f, info) { if (bar) bar.style.width = Math.round(f * 100) + '%'; var pg = el.querySelector('#resProg'); if (pg && info) pg.textContent = progText(info); }, function () { return dead; }, { partialOnCancel: true })
        .then(function (res) {
          if (res.cancelled) { if (!el.isConnected) return; var rb = el.querySelector('#resBar'); if (rb) rb.remove(); choices(res); return; }
          if (!el.isConnected) return;
          var rb = el.querySelector('#resBar'); if (rb) rb.remove(); ctl.remove(); draw(res); popup(res); App.checkAch && App.checkAch();
        }, function (e) { var pg = el.querySelector('#resProg'); if (pg) pg.innerHTML = App.esc(e.message) + ' <button class="btn sm" id="resRetry">Retry analysis</button>'; var rr = el.querySelector('#resRetry'); if (rr) rr.onclick = function () { App.route(); }; var st0 = el.querySelector('#resStop'); if (st0) st0.remove(); });
      App.screens.results.leave = function () { dead = true; A.stop(rec); if (sheet) { var s0 = sheet; sheet = null; s0.close(); } };
    }
  });
})();
