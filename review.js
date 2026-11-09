/* Stacy Chess - move classification service (v9).
   One deterministic classifier for every graded move in the app: live coaching, trainers, Game Review,
   Results and the "My mistakes" list. Input is structured engine data (White-POV lines from engine.js);
   output is a grade plus the evidence behind it. Explanations are written from that evidence only, so the
   text can never contradict the label (no "brilliant … even stronger was X"). Nothing here is AI-generated.

   Perspective: every engine score is White's point of view; the classifier converts to the MOVER's
   win chance (Lichess logistic curve on centipawns, mate = 0 or 100) before comparing.
     winBefore = mover's win% with best play in the position before the move (engine line 1)
     winAfter  = mover's win% in the position after the move (searched separately; terminal = rules)
     loss      = max(0, winBefore − winAfter); exactly 0 when the played move is the engine's first line

   Grades (first match wins):
     limited     engine fallback, or a needed search shallower than minDepth → NOT graded (estimate kept)
     book        repertoire/book prefix and loss < 5
     brilliant   best-level move that is a real material sacrifice (static exchange analysis: ≥2 points newly
                 put en prise net of what the move captured; not a trade regained by the next move pair),
                 still ≥50% for the mover, not already totally winning (<97%) unless it forces mate, and
                 VERIFIED by a deeper search of the position after the move (and after the acceptance capture
                 when the engine line declines it). Unverified candidates stay Best.
     great       engine's exact first choice, a non-forced, non-recapture, non-mate-in-1 move where the
                 second engine line (same search, ≥12 ply) is ≥20 win-chance points worse, the second line is
                 not itself winning (<80%), the move keeps ≥30%, and the after-search agrees (within 10).
     best        engine's first choice, or an alternative within 1 win-chance point in the same MultiPV search
     miss        the opponent's previous move was an error (loss ≥10), the mover had ≥70%, lost ≥10 and is
                 not now losing (stays ≥35%): a missed punishment rather than a collapse
     excellent <2 · good <5 · inaccuracy <10 · mistake <20 · blunder ≥20 (win-chance points lost)
   Accuracy per move uses the same loss (Lichess-style curve, analysis.js). */
(function () {
  var C = window.Coach, VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var R = window.StacyReview = { VERSION: 5 };
  R.T = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20, equal: 1, bookMax: 5, greatGap: 20, greatSecondMax: 80, greatBestMin: 30, greatAgree: 10,
    greatMinDepth: 12, brilliantMin: 50, alreadyWon: 97, sacMin: 2, missChance: 70, missFloor: 35, missLoss: 10, oppError: 10 };
  C.GRADES.limited = { label: 'Not graded', sym: '–', color: '#8a8a8a' };
  function mv(u) { return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }; }
  function moverWin(line, color) { var w = C.lineWin(line); return color === 'w' ? w : 100 - w; }
  function isTerm(r) { return !!(r && r.quality && r.quality.terminal); }
  function round1(x) { return Math.round(x * 10) / 10; }
  R.adequate = function (r, minDepth, pvs) {
    if (!r || !r.lines || !r.lines.length) return { ok: false, why: 'no engine evaluation' };
    var q = r.quality || {}; if (q.terminal) return { ok: true };
    if (q.fallback || q.limited) return { ok: false, why: 'only the built-in fallback search was available' };
    var l0 = r.lines[0], mateProven = l0.mate != null && Math.abs(l0.mate) >= 1 && (q.depth || 0) >= 2 * Math.abs(l0.mate) - 1; // a forced mate in N is proven at depth 2N−1
    if ((q.depth || 0) < minDepth && !mateProven) return { ok: false, why: 'the search reached depth ' + (q.depth || 0) + ', below the required ' + minDepth };
    if (pvs && r.lines.length < pvs) return { ok: false, why: 'fewer than ' + pvs + ' engine lines' };
    return { ok: true };
  };

  // ---------- static exchange analysis on real legal moves (handles pins, checks, en passant) ----------
  function swapOff(g, sq, n) {
    if (n > 14) return 0;
    var caps = g.moves({ verbose: true }).filter(function (m) { return m.to === sq && m.captured; });
    if (!caps.length) return 0;
    caps.sort(function (a, b) { return VAL[a.piece] - VAL[b.piece]; });
    var m = caps[0], gain = VAL[m.captured] + (m.promotion ? VAL[m.promotion] - 1 : 0);
    g.move(m); var back = swapOff(g, sq, n + 1); g.undo();
    return Math.max(0, gain - back);
  }
  /* Best material the side to move can win by one capture followed by optimal swap-off. */
  R.bestCapture = function (g) {
    var best = { gain: 0, san: null, uci: null };
    g.moves({ verbose: true }).forEach(function (m) {
      if (!m.captured) return;
      var gain = VAL[m.captured] + (m.promotion ? VAL[m.promotion] - 1 : 0);
      g.move(m); gain -= swapOff(g, m.to, 0); g.undo();
      if (gain > best.gain) best = { gain: gain, san: m.san, uci: m.from + m.to + (m.promotion || ''), captured: m.captured };
    });
    return best;
  };
  function nullMove(fen) {
    var p = fen.split(' '); p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-'; var f = p.join(' ');
    try { var g = new Chess(); if (g.validate_fen && !g.validate_fen(f).valid) return null; if (!g.load(f)) return null; return g; } catch (e) { return null; }
  }
  /* Material newly offered by a move: what the opponent can win right after it, minus what the move itself
     captured, minus what they could already win before it (null-move threat). ≥2 = a real sacrifice. */
  R.sacrifice = function (fenBefore, uci) {
    var g = new Chess(fenBefore), inCheck = g.in_check(), m = g.move(mv(uci)); if (!m) return null;
    var gain0 = (m.captured ? VAL[m.captured] : 0) + (m.promotion ? VAL[m.promotion] - 1 : 0);
    if (g.in_checkmate()) return { value: 0, offered: false, gain0: gain0, s1: 0, s0: 0 };
    var s1 = R.bestCapture(g), s0 = 0;
    if (!inCheck) { var g0 = nullMove(fenBefore); if (g0 && !g0.in_check()) s0 = R.bestCapture(g0).gain; }
    var value = s1.gain - gain0 - s0;
    return { value: value, offered: value >= R.T.sacMin, gain0: gain0, s1: s1.gain, s0: s0, acceptSan: s1.san, acceptUci: s1.uci, acceptPiece: s1.captured ? C.NAME[s1.captured.toUpperCase()] : null };
  };
  /* Along the engine line after the move: does the mover simply get the material back with its next
     move pair (a trade / desperado), rather than staying down material? */
  R.regainsAtOnce = function (fenBefore, uci, afterLine) {
    try {
      var g = new Chess(fenBefore), color = g.turn(), sg = color === 'w' ? 1 : -1, m0 = C.material(fenBefore) * sg;
      if (!g.move(mv(uci))) return false; var pv = (afterLine && afterLine.pv) || [], d1 = null, d3 = null;
      for (var i = 0; i < Math.min(3, pv.length); i++) { if (!g.move(mv(pv[i]))) break; var d = m0 - C.material(g.fen()) * sg; if (i === 0) d1 = d; if (i === 2) d3 = d; }
      return d1 != null && d1 >= R.T.sacMin && d3 != null && d3 < 1;
    } catch (e) { return false; }
  };
  function terminalKind(fen) { try { var g = new Chess(fen); if (g.in_checkmate()) return 'checkmate'; if (g.in_stalemate()) return 'stalemate'; if (g.insufficient_material()) return 'insufficient material'; if (g.in_draw()) return '50-move rule'; } catch (e) { } return 'draw'; }
  function matWords(n) { return n >= 8 ? 'the queen' : n >= 5 ? 'a rook' : n >= 3 ? 'a piece' : 'the exchange'; }
  function sanOf(fen, u) { try { return C.pvSan(fen, [u], 1)[0] || u; } catch (e) { return u; } }

  /* classify(input) — input: {fen, uci, before, after, minDepth, book, bookNote, prevOppLoss, prevMove:{to,captured},
     live, verify:{after, accept, before}} */
  R.classify = function (x) {
    var T = R.T, fen = x.fen, uci = x.uci, minDepth = x.minDepth == null ? 12 : x.minDepth;
    var g = new Chess(fen), color = g.turn(), legal = g.moves({ verbose: true }), played = g.move(mv(uci));
    if (!played) throw new Error('illegal move ' + uci + ' in ' + fen);
    var uciN = played.from + played.to + (played.promotion || ''), afterFen = g.fen(), mate1 = g.in_checkmate(), gameOver = g.game_over() || isTerm(x.after);
    var before = x.before, after = x.after, best = before && before.lines && before.lines[0];
    var facts = C.moveFacts(fen, uciN);
    var res = { v: R.VERSION, grade: null, limited: false, reasons: [], san: played.san, uci: uciN, color: color, facts: facts, arrows: [], text: '',
      bestUci: best ? best.uci : null, bestSan: best ? sanOf(fen, best.uci) : '', evalAfter: after && after.lines && after.lines[0], reply: after && after.lines && after.lines[0] && after.lines[0].pv && after.lines[0].pv.length ? after.lines[0] : null,
      alternatives: [], evidence: {} };
    // after-position value: rules decide terminal positions
    var wb = best ? moverWin(best, color) : 50, wa;
    if (mate1) wa = 100;
    else if (gameOver) { wa = (after && after.lines && after.lines[0] && after.lines[0].mate != null) ? moverWin(after.lines[0], color) : 50; res.terminal = x.terminalKind || terminalKind(afterFen); }
    else wa = after && after.lines && after.lines[0] ? moverWin(after.lines[0], color) : wb;
    var strict = !!(best && best.uci === uciN), lines = (before && before.lines) || [], rank = lines.findIndex(function (l) { return l.uci === uciN; });
    var equal = !strict && rank > 0 && Math.abs(moverWin(lines[rank], color) - wb) <= T.equal && ((lines[rank].mate != null) === (best.mate != null));
    if (!strict && !equal && best && res.evalAfter && best.cp != null && res.evalAfter.cp != null && Math.abs(best.cp - res.evalAfter.cp) <= 10 && wb - wa < .5) { equal = true; res.reasons.push('equal-by-after-search'); }
    var loss = strict || mate1 ? 0 : Math.max(0, wb - wa);
    res.loss = loss; res.winBefore = wb; res.winAfter = wa; res.acc = C.accuracy(loss); res.rank = rank;
    lines.forEach(function (l, i) { if (i < 3) res.alternatives.push({ uci: l.uci, san: sanOf(fen, l.uci), win: round1(moverWin(l, color)), eval: C.evalText(l), depth: l.depth || 0 }); });
    // ---- quality gate ----
    var qb = R.adequate(before, minDepth), qa = gameOver ? { ok: true } : R.adequate(after, minDepth);
    if (!qb.ok || !qa.ok) {
      res.limited = true; res.grade = 'limited'; res.reasons.push('limited');
      res.estimateGrade = loss >= T.mistake ? 'blunder' : loss >= T.inaccuracy ? 'mistake' : loss >= T.good ? 'inaccuracy' : null;
      res.limitWhy = !qb.ok ? qb.why : qa.why;
      return finish(res, x);
    }
    var forced = legal.length === 1;
    if (x.book && loss < T.bookMax) { res.grade = 'book'; res.reasons.push('book'); return finish(res, x); }
    if (x.book) res.reasons.push('book-but-dubious');
    if (forced) { res.grade = 'best'; res.reasons.push('only-legal-move'); return finish(res, x); }
    if (strict || equal || mate1) {
      res.grade = 'best'; res.reasons.push(mate1 ? 'mate-in-one' : strict ? 'engine-first-choice' : 'equal-alternative');
      // Brilliant candidate
      if (!mate1) {
        var sac = R.sacrifice(fen, uciN); res.evidence.sacrifice = sac;
        // the trade test applies when the engine line accepts the offer; a declined offer is tested by
        // searching the acceptance position instead (poisoned material, e.g. Legal's mate)
        var accepted = sac && res.reply && sac.acceptUci && res.reply.uci === sac.acceptUci;
        if (sac && sac.offered && !(accepted && R.regainsAtOnce(fen, uciN, res.reply))) {
          var forcedMate = res.evalAfter && res.evalAfter.mate != null && moverWin(res.evalAfter, color) === 100;
          if (wa >= T.brilliantMin && (wb < T.alreadyWon || forcedMate)) {
            var v = x.verify || {};
            if (!v.after) { res.reasons.push('brilliant-candidate-unverified'); res.needsVerify = { after: afterFen, accept: sac.acceptUci && (!res.reply || res.reply.uci !== sac.acceptUci) ? sac.acceptUci : null }; }
            else {
              var va = R.adequate(v.after, minDepth), vw = va.ok ? moverWin(v.after.lines[0], color) : -1, accOk = true, aw = null;
              if (v.accept) { var vq = R.adequate(v.accept, minDepth); aw = vq.ok ? moverWin(v.accept.lines[0], color) : -1; accOk = aw >= T.brilliantMin; }
              res.evidence.verify = { afterWin: round1(vw), afterDepth: v.after.quality && v.after.quality.depth, acceptWin: aw == null ? null : round1(aw) };
              if (va.ok && vw >= T.brilliantMin && accOk) { res.grade = 'brilliant'; res.reasons.push('verified-sacrifice'); return finish(res, x); }
              res.reasons.push('sacrifice-not-confirmed');
            }
          } else res.reasons.push(wa < T.brilliantMin ? 'sacrifice-unsound' : 'already-winning');
        } else if (sac && sac.offered) res.reasons.push('material-regained-at-once');
      }
      // Great candidate
      if (strict && !mate1) {
        var second = lines[1], recapture = x.prevMove && x.prevMove.captured && x.prevMove.to === played.to;
        if (!second) res.reasons.push('no-second-line');
        else if ((second.depth || 0) < Math.max(minDepth, T.greatMinDepth) || (before.quality && before.quality.depth < T.greatMinDepth)) res.reasons.push('second-line-too-shallow');
        else {
          var ws = moverWin(second, color), gap = wb - ws; res.evidence.gap = round1(gap); res.evidence.secondWin = round1(ws); res.evidence.secondSan = sanOf(fen, second.uci);
          if (recapture) res.reasons.push('routine-recapture');
          else if (gap >= T.greatGap && ws < T.greatSecondMax && wb >= T.greatBestMin && wa >= wb - T.greatAgree) { res.grade = 'great'; res.reasons.push('only-good-move'); }
          else if (gap >= T.greatGap && wa < wb - T.greatAgree) res.reasons.push('great-not-confirmed');
        }
      }
      return finish(res, x);
    }
    var oppErr = (x.prevOppLoss || 0) >= T.oppError;
    if (oppErr && wb >= T.missChance && loss >= T.missLoss && wa >= T.missFloor) { res.grade = 'miss'; res.reasons.push('missed-punishment'); return finish(res, x); }
    res.grade = loss < T.excellent ? 'excellent' : loss < T.good ? 'good' : loss < T.inaccuracy ? 'inaccuracy' : loss < T.mistake ? 'mistake' : 'blunder';
    if (wb >= 99.5 && wa >= 99.5) res.reasons.push('still-mating');
    return finish(res, x);
  };

  // ---------- explanation: built only from the classification evidence ----------
  function finish(res, x) {
    res.info = C.GRADES[res.grade] || C.GRADES.limited;
    var t = [], s = res.san, best = res.bestSan, ev = res.evalAfter ? C.evalText(res.evalAfter) : '';
    var alt = res.alternatives[0], second = res.alternatives[1];
    switch (res.grade) {
      case 'limited': t.push(s + ' is not graded: ' + (res.limitWhy || 'the engine check was limited') + '. ' + (res.estimateGrade ? 'A rough estimate suggests it may be ' + (res.estimateGrade === 'inaccuracy' ? 'an inaccuracy' : 'a ' + res.estimateGrade) + '; verify with Game Review when the full engine is available.' : 'No grade was invented.')); break;
      case 'book': t.push(s + ' is a book move from your repertoire. ' + (x.bookNote || '')); break;
      case 'brilliant': {
        var sc = res.evidence.sacrifice, vr = res.evidence.verify || {};
        t.push(s + ' is a sound sacrifice: it leaves ' + (sc.acceptPiece ? 'your ' + sc.acceptPiece : matWords(sc.value)) + ' to be taken' + (sc.acceptSan ? ' (' + sc.acceptSan + ')' : '') + ', a net offer of about ' + sc.value + ' points of material' + ', and a deeper check' + (vr.afterDepth ? ' at depth ' + vr.afterDepth : '') + ' confirms the position is still good for you (' + ev + ').');
        if (vr.acceptWin != null) t.push('Taking the material does not refute it.');
        break; }
      case 'great': t.push(s + ' is the only good move here. The next best, ' + res.evidence.secondSan + ', is about ' + Math.round(res.evidence.gap) + ' win-chance points worse.'); break;
      case 'best':
        if (res.reasons.indexOf('only-legal-move') >= 0) t.push(s + ' was the only legal move.');
        else if (res.reasons.indexOf('mate-in-one') >= 0) t.push(s + ' is checkmate.');
        else if (res.reasons.indexOf('equal-alternative') >= 0 || res.reasons.indexOf('equal-by-after-search') >= 0) t.push(s + ' is as strong as the engine’s first choice ' + best + ' (' + (alt ? alt.eval : ev) + ').');
        else { var f = res.facts && res.facts.facts.length ? ': ' + C.join(res.facts.facts.slice(0, 2)) : ''; t.push(s + ' is the engine’s top move' + f + '.'); }
        break;
      case 'excellent': case 'good':
        t.push(s + ' is ' + (res.grade === 'excellent' ? 'an excellent' : 'a good') + ' move (' + ev + '). The engine’s first choice was ' + best + (alt ? ' (' + alt.eval + ')' : '') + ', a small difference of ' + round1(res.loss).toFixed(1) + ' win-chance points.');
        break;
      default: {
        t.push(s + ' is ' + (res.grade === 'inaccuracy' ? 'an inaccuracy' : res.grade === 'miss' ? 'a miss: the opponent’s last move gave you a chance and this lets it go' : 'a ' + res.grade) + '.');
        if (res.terminal && res.terminal !== 'checkmate') t.push('It ends the game in a draw (' + res.terminal + ') from a position where you were better.');
        var r = C.uciToMove(x.fen, res.uci);
        if (res.reply && r) {
          var rf = C.moveFacts(r.after, res.reply.uci), gain = C.pvGain(r.after, res.reply.pv, 4, res.color === 'w' ? 'b' : 'w'), why = [];
          var mateFor = res.reply.mate != null ? (res.reply.mate > 0 ? 'w' : 'b') : null;
          if (rf) {
            if (mateFor && mateFor !== res.color) why.push('they have a forced checkmate starting with ' + rf.san);
            else if (gain >= 1) why.push('they can play ' + rf.san + ' and that ' + C.gainWords(gain));
            else if (rf.facts.length) why.push('they can answer ' + rf.san + ' (' + C.join(rf.facts.slice(0, 2)) + ')');
            else why.push('after ' + rf.san + ' your position is worse (' + (alt ? alt.eval : '') + ' → ' + ev + ')');
          }
          if (res.facts && res.facts.hangsSelf) why.unshift('your ' + C.NAME[res.facts.piece] + ' on ' + res.facts.move.to + ' is left undefended');
          if (why.length) t.push('Why? ' + C.cap(C.join(why)) + '.');
          res.arrows.push({ from: res.reply.uci.slice(0, 2), to: res.reply.uci.slice(2, 4), color: 'red' });
        }
        if (res.bestUci) {
          var bl = (x.before.lines || [])[0], bf = C.moveFacts(x.fen, res.bestUci), bg = C.pvGain(x.fen, bl.pv, 5, res.color), bwhy = bf ? bf.facts.slice(0, 2) : [];
          if (bl.mate != null && (bl.mate > 0) === (res.color === 'w')) bwhy.unshift('it leads to checkmate in ' + Math.abs(Math.round(bl.mate)));
          else if (bg >= 1) bwhy.unshift('it ' + C.gainWords(bg));
          if (!bwhy.length) bwhy.push('it keeps the evaluation at ' + C.evalText(bl));
          t.push('Better was ' + best + ' because ' + C.join(bwhy) + '.');
          t.push('Line: ' + C.pvText(x.fen, bl.pv, 5));
          res.arrows.push({ from: res.bestUci.slice(0, 2), to: res.bestUci.slice(2, 4), color: 'green' });
        }
      }
    }
    res.text = t.join(' ').replace(/\s+/g, ' ').trim();
    return res;
  }

  /* Drop-in for the v8 Coach.judge(fenBefore, uci, before, after, opts) used by play, trainers and the
     opening bridge. Interactive callers get minDepth 8 by default; Brilliant needs the post-game verifier,
     so live feedback never shows an unverified Brilliant. */
  C.judgeV8 = C.judge;
  C.judge = function (fenBefore, uci, before, after, opts) {
    opts = opts || {};
    return R.classify({ fen: fenBefore, uci: uci, before: before, after: after, book: !!opts.book, bookNote: opts.bookNote, prevOppLoss: opts.prevOppLoss || 0,
      prevMove: opts.prevMove || null, minDepth: opts.minDepth != null ? opts.minDepth : 8, verify: opts.verify || null, terminalKind: opts.terminalKind });
  };

  /* Rules-terminal result (same shape as an engine result). */
  R.terminal = function (fen, kind) {
    var g = new Chess(fen); if (!g.game_over() && !kind) return null;
    if (g.in_checkmate()) return { fen: fen, best: null, quality: { terminal: true, engine: 'rules', fallback: false, kind: 'checkmate' }, lines: [{ mate: g.turn() === 'w' ? -0.0001 : 0.0001, cp: g.turn() === 'w' ? -10000 : 10000, pv: [] }] };
    return { fen: fen, best: null, quality: { terminal: true, engine: 'rules', fallback: false, kind: kind || terminalKind(fen) }, lines: [{ cp: 0, pv: [] }] };
  };
  /* Extra searches that a Brilliant candidate needs before it may be awarded. */
  R.verify = function (cls, analyse, budget) {
    var nv = cls && cls.needsVerify; if (!nv) return Promise.resolve(null);
    var o = { depth: budget.depth, movetime: budget.movetime, multipv: 1, priority: budget.priority || 'background', owner: budget.owner };
    return analyse(nv.after, o).then(function (a) {
      if (!a || !nv.accept) return { after: a };
      var g = new Chess(nv.after), m = g.move(mv(nv.accept)); if (!m) return { after: a };
      var t = R.terminal(g.fen());
      return (t ? Promise.resolve(t) : analyse(g.fen(), o)).then(function (b) { return { after: a, accept: b }; });
    });
  };
  /* One move end-to-end with any analyse(fen, opts) function (the app's Engine.analyse or a test adapter). */
  R.analyseMove = function (o) {
    var b = o.budget || { depth: 14, movetime: 3000, minDepth: 12 }, vb = o.verifyBudget || { depth: b.depth + 4, movetime: b.movetime * 2 };
    var g = new Chess(o.fen), m = g.move(mv(o.uci)); if (!m) return Promise.reject(new Error('illegal move'));
    var afterFen = g.fen(), term = R.terminal(afterFen, o.terminalKind);
    var opts = { depth: b.depth, movetime: b.movetime, multipv: 2, priority: b.priority, owner: b.owner };
    return o.analyse(o.fen, opts).then(function (before) {
      return (term ? Promise.resolve(term) : o.analyse(afterFen, Object.assign({}, opts, { multipv: 1 }))).then(function (after) {
        var input = { fen: o.fen, uci: o.uci, before: before, after: after, minDepth: b.minDepth, book: o.book, prevOppLoss: o.prevOppLoss, prevMove: o.prevMove, terminalKind: o.terminalKind };
        var c = R.classify(input); if (!c.needsVerify || o.noVerify) return c;
        return R.verify(c, o.analyse, vb).then(function (v) { if (!v || !v.after) return c; input.verify = v; var c2 = R.classify(input); c2.verifyData = v; return c2; });
      });
    });
  };
  R.counted = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
})();
