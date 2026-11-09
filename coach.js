/* Stacy Chess - coaching brain: move grades, threats, hanging pieces, plain-language explanations.
   Everything here is grounded in chess.js + Stockfish numbers (no guessing). */
(function () {
  var FILES = 'abcdefgh', VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };
  var NAME = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
  function xy(sq) { return [FILES.indexOf(sq[0]), +sq[1] - 1]; }
  function sq(x, y) { return (x >= 0 && x < 8 && y >= 0 && y < 8) ? FILES[x] + (y + 1) : null; }

  // squares of `color` pieces attacking `target` on board map {sq:'wN'}
  function attackers(map, target, color) {
    var res = [], t = xy(target), x = t[0], y = t[1], s, p, i, d;
    var pd = color === 'w' ? -1 : 1; // pawn attacks from one rank behind
    [[-1, pd], [1, pd]].forEach(function (o) { s = sq(x + o[0], y + o[1]); if (s && map[s] === color + 'P') res.push(s); });
    [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(function (o) { s = sq(x + o[0], y + o[1]); if (s && map[s] === color + 'N') res.push(s); });
    [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { s = sq(x + o[0], y + o[1]); if (s && map[s] === color + 'K') res.push(s); });
    var dirs = [[1, 1, 'B'], [1, -1, 'B'], [-1, 1, 'B'], [-1, -1, 'B'], [1, 0, 'R'], [-1, 0, 'R'], [0, 1, 'R'], [0, -1, 'R']];
    for (i = 0; i < dirs.length; i++) {
      d = dirs[i];
      for (var k = 1; k < 8; k++) {
        s = sq(x + d[0] * k, y + d[1] * k); if (!s) break;
        p = map[s]; if (!p) continue;
        if (p[0] === color && (p[1] === 'Q' || p[1] === d[2])) res.push(s);
        break;
      }
    }
    return res;
  }
  function mapOf(fen) { return window.parseFenMap(fen); }
  function opp(c) { return c === 'w' ? 'b' : 'w'; }

  // Pieces of `color` that are en prise: attacked and (undefended or attacked by something cheaper)
  function hanging(fen, color) {
    var map = mapOf(fen), out = [];
    for (var s in map) {
      var p = map[s]; if (p[0] !== color || p[1] === 'K') continue;
      var att = attackers(map, s, opp(color)); if (!att.length) continue;
      var def = attackers(map, s, color);
      var cheapest = Math.min.apply(null, att.map(function (a) { return VAL[map[a][1]]; }));
      if (!def.length || cheapest < VAL[p[1]]) out.push({ sq: s, piece: p, attackers: att, defended: def.length > 0 });
    }
    out.sort(function (a, b) { return VAL[b.piece[1]] - VAL[a.piece[1]]; });
    return out;
  }

  function winPct(cp, mate) {
    if (mate != null) return mate > 0 ? 100 : 0;
    cp = Math.max(-1500, Math.min(1500, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }
  function lineWin(line) { return line ? winPct(line.cp || 0, line.mate) : 50; }
  function evalText(line) {
    if (!line) return '0.0';
    if(line.mate!=null&&Math.abs(line.mate)<.001)return line.mate>0?'White mates':'Black mates';
    if (line.mate != null) return (line.mate > 0 ? '+' : '-') + 'M' + Math.abs(line.mate);
    var v = (line.cp || 0) / 100; return (v > 0 ? '+' : '') + v.toFixed(1);
  }
  var GRADES = {
    brilliant: { label: 'Brilliant', sym: '~g:brilliant~', color: '#1fb5a8' },
    great: { label: 'Great', sym: '~g:great~', color: '#4f86d6' },
    best: { label: 'Best', sym: '~g:best~', color: '#6fae3e' },
    excellent: { label: 'Excellent', sym: '~g:excellent~', color: '#93bf47' },
    good: { label: 'Good', sym: '~g:good~', color: '#8fae8a' },
    book: { label: 'Book', sym: '~g:book~', color: '#767676' },
    inaccuracy: { label: 'Inaccuracy', sym: '~g:inaccuracy~', color: '#f0bf3c' },
    mistake: { label: 'Mistake', sym: '~g:mistake~', color: '#e8892b' },
    miss: { label: 'Miss', sym: '~g:miss~', color: '#ee6a6a' },
    blunder: { label: 'Blunder', sym: '~g:blunder~', color: '#d23a36' }
  };
  // loss = win% lost by the mover (0-100)
  function grade(loss, isBest, opts) {
    opts = opts || {};
    if (isBest) return opts.onlyMove ? 'great' : 'best';
    if (loss < 2) return 'excellent';
    if (loss < 5) return 'good';
    if (loss < 10) return 'inaccuracy';
    if (loss < 20) return opts.hadWin ? 'miss' : 'mistake';
    return opts.hadWin ? 'miss' : 'blunder';
  }
  function accuracy(loss) { return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669)); }

  function uciToMove(fen, uci) {
    var g = new Chess(fen);
    var m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    return m ? { move: m, after: g.fen(), game: g } : null;
  }
  function pvSan(fen, pv, n) {
    var g = new Chess(fen), out = [];
    for (var i = 0; i < Math.min(n || 6, (pv || []).length); i++) {
      var u = pv[i], m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
      if (!m) break;
      var num = fen.split(' ')[5] ? 0 : 0;
      out.push(m.san);
    }
    return out;
  }
  function pvText(fen, pv, n) {
    var g = new Chess(fen), out = '', moveNo = +(fen.split(' ')[5] || 1), turn = fen.split(' ')[1];
    for (var i = 0; i < Math.min(n || 6, (pv || []).length); i++) {
      var u = pv[i], m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
      if (!m) break;
      if (turn === 'w') out += moveNo + '.' + m.san + ' ';
      else out += (i === 0 ? moveNo + '...' : '') + m.san + ' ';
      if (turn === 'b') moveNo++;
      turn = opp(turn);
    }
    return out.trim();
  }
  // net material given up by `color` after playing uci and the engine PV (up to 5 plies). >=2 means a real sacrifice, not a trade.
  function sacrifice(fenBefore, uci, afterLine, color) {
    try {
      var g = new Chess(fenBefore), sg = color === 'w' ? 1 : -1, m0 = material(fenBefore) * sg;
      var mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); if (!mv || mv.promotion) return 0;
      var pv = (afterLine && afterLine.pv) || [], worst = 0;
      for (var i = 0; i < Math.min(5, pv.length); i++) { var u = pv[i]; if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })) break; if (i % 2 === 0) worst = Math.max(worst, m0 - material(g.fen()) * sg); }
      var net = m0 - material(g.fen()) * sg;
      return Math.min(worst, net);
    } catch (e) { return 0; }
  }
  function material(fen) {
    var map = mapOf(fen), s = 0;
    for (var k in map) { var p = map[k]; if (p[1] !== 'K') s += (p[0] === 'w' ? 1 : -1) * VAL[p[1]]; }
    return s;
  }
  // material swing for `color` along a PV (n plies)
  function pvGain(fen, pv, n, color) {
    var g = new Chess(fen), m0 = material(fen);
    for (var i = 0; i < Math.min(n, (pv || []).length); i++) {
      var u = pv[i]; if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' })) break;
    }
    var d = material(g.fen()) - m0; return color === 'w' ? d : -d;
  }
  function gainWords(n) {
    if (n >= 9) return 'wins the queen'; if (n >= 5) return 'wins a rook'; if (n >= 3) return 'wins a piece';
    if (n >= 2) return 'wins two pawns'; if (n >= 1) return 'wins a pawn'; return '';
  }

  // What does a single move do? (facts for explanations)
  function moveFacts(fen, uci) {
    var r = uciToMove(fen, uci); if (!r) return null;
    var m = r.move, after = r.after, map = mapOf(after), me = m.color, f = [];
    var P = m.piece.toUpperCase();
    if (r.game.in_checkmate()) f.push('it is checkmate');
    else if (m.san.indexOf('+') > 0) f.push('it gives check');
    if (m.captured) f.push('it takes a ' + NAME[m.captured.toUpperCase()]);
    if (m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0) f.push('it castles your king to safety');
    if (m.promotion) f.push('it makes a new ' + NAME[m.promotion.toUpperCase()]);
    // attacks (forks / threats) by the moved piece
    var targets = [];
    for (var s in map) {
      var p = map[s]; if (p[0] === me) continue;
      if (attackers(map, s, me).indexOf(m.to) >= 0) {
        var def = attackers(map, s, opp(me)).length;
        if (p[1] === 'K' || VAL[p[1]] > VAL[P] || !def) targets.push({ sq: s, piece: p });
      }
    }
    if (targets.length >= 2) f.push('it forks the ' + targets.map(function (t) { return NAME[t.piece[1]] + ' on ' + t.sq; }).join(' and the '));
    else if (targets.length === 1 && targets[0].piece[1] !== 'K') f.push('it attacks the ' + NAME[targets[0].piece[1]] + ' on ' + targets[0].sq);
    var fy = xy(m.from)[1], backRank = me === 'w' ? 0 : 7;
    if ((P === 'N' || P === 'B') && fy === backRank) f.push('it develops a piece');
    if (['d4', 'e4', 'd5', 'e5'].indexOf(m.to) >= 0 && P === 'P') f.push('it grabs the centre');
    // is the moved piece now hanging?
    var hang = hanging(after, me).filter(function (h) { return h.sq === m.to; });
    return { san: m.san, piece: P, move: m, after: after, facts: f, hangsSelf: hang.length > 0, targets: targets };
  }

  // Threats: what could the side NOT to move do if it were their turn? (null move)
  function threats(fen) {
    var parts = fen.split(' '), me = parts[1], them = opp(me);
    parts[1] = them; parts[3] = '-';
    var g; try { g = new Chess(parts.join(' ')); } catch (e) { return []; }
    if (!g.fen || g.in_check && false) return [];
    var out = [], map = mapOf(fen);
    // if my king in check, null move is illegal; skip
    var tmp = new Chess(fen); if (tmp.in_check()) return [];
    g.moves({ verbose: true }).forEach(function (m) {
      g.move(m);
      if (g.in_checkmate()) out.push({ type: 'mate', from: m.from, to: m.to, san: m.san, text: 'they threaten checkmate with ' + m.san });
      g.undo();
    });
    hanging(fen, me).forEach(function (h) {
      out.push({ type: 'hang', from: h.attackers[0], to: h.sq, text: 'your ' + NAME[h.piece[1]] + ' on ' + h.sq + ' can be taken' + (h.defended ? ' (it is defended, but by less than it is worth)' : ' for free') });
    });
    return out.slice(0, 3);
  }

  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function join(list) { return list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }

  /* Main analysis of a played move.
     before: engine result on position before move (multipv>=1, from mover's view stored white POV)
     after: engine result on position after the move */
  function judge(fenBefore, uci, before, after, opts) {
    opts = opts || {};
    var color = fenBefore.split(' ')[1], sgn = color === 'w' ? 1 : -1;
    var best = before && before.lines[0];
    var bw = lineWin(best), aw = after && after.lines[0] ? lineWin(after.lines[0]) : bw;
    var r = uciToMove(fenBefore, uci);
    if (r && r.game.in_checkmate()) aw = color === 'w' ? 100 : 0;
    if (r && (r.game.in_stalemate() || r.game.in_draw())) aw = 50;
    var myBefore = color === 'w' ? bw : 100 - bw, myAfter = color === 'w' ? aw : 100 - aw;
    var loss = Math.max(0, myBefore - myAfter);
    var isBest = best && best.uci === uci;
    var second = before && before.lines[1];
    var onlyMove = isBest && second && (Math.abs(lineWin(best) - lineWin(second)) > 15);
    if (!isBest && best && after && after.lines[0] && best.cp != null && after.lines[0].cp != null && Math.abs(best.cp - after.lines[0].cp) <= 6 && loss < 0.6) isBest = true;
    var g = opts.book ? 'book' : grade(loss, isBest, { onlyMove: onlyMove, hadWin: (myBefore > 80 && myAfter < 60) || (opts.prevOppLoss >= 10 && loss >= 10) });
    // Brilliant: a best/near-best move that gives up material (net, along the engine's main line) and still keeps a good position.
    if (!opts.book && (g === 'best' || g === 'great' || (g === 'excellent' && loss < 1.5)) && myAfter >= 50 && myBefore < 97 && sacrifice(fenBefore, uci, after && after.lines[0], color) >= 2) g = 'brilliant';
    var facts = moveFacts(fenBefore, uci);
    var res = { grade: g, info: GRADES[g], loss: loss, acc: accuracy(loss), san: facts ? facts.san : uci, facts: facts,
      bestUci: best && best.uci, bestSan: best ? (pvSan(fenBefore, [best.uci], 1)[0] || '') : '', evalAfter: after && after.lines[0],
      reply: after && after.lines[0] ? after.lines[0] : null, arrows: [], text: '' };
    // build explanation
    var t = [];
    var good = facts ? facts.facts.filter(function (x) { return x.indexOf('takes') < 0 || true; }) : [];
    if (g === 'book') t.push(res.san + ' is a book move. ' + (opts.bookNote || ''));
    else if (g === 'best' || g === 'great') {
      t.push((g === 'great' ? 'Great find! ' : 'Yes! ') + res.san + ' is the best move' + (good.length ? ': ' + join(good) + '.' : '.'));
      if (g === 'great') t.push('It was the only good move here.');
    } else if (g === 'brilliant' || g === 'excellent' || g === 'good') {
      t.push(res.san + ' is ' + (g === 'brilliant' ? 'a brilliant sacrifice that keeps the position sound' : g === 'excellent' ? 'an excellent move' : 'a good move') + (good.length ? ': ' + join(good) + '.' : '.'));
      if (res.bestSan && res.bestSan !== res.san) t.push('Even stronger was ' + res.bestSan + '.');
    } else {
      t.push(res.san + ' is ' + (g === 'inaccuracy' ? 'an inaccuracy' : g === 'miss' ? 'a missed win' : 'a ' + g) + '.');
      // why bad: opponent's best reply after the move
      if (res.reply && res.reply.pv && r) {
        var rf = moveFacts(r.after, res.reply.uci), gain = pvGain(r.after, res.reply.pv, 4, opp(color));
        var why = [];
        if (res.reply.mate != null && ((res.reply.mate < 0 && color === 'w') || (res.reply.mate > 0 && color === 'b'))) why.push('they have a forced checkmate starting with ' + rf.san);
        else if (gain >= 1) why.push('they can play ' + rf.san + ' and that ' + gainWords(gain));
        else if (rf && rf.facts.length) why.push('they can answer ' + rf.san + ' (' + join(rf.facts.slice(0, 2)) + ')');
        else why.push('it gives them the better position (' + evalText(best) + ' → ' + evalText(res.reply) + '), for example after ' + rf.san);
        if (facts && facts.hangsSelf) why.unshift('your ' + NAME[facts.piece] + ' on ' + facts.move.to + ' is left undefended');
        t.push('Why? ' + cap(join(why)) + '.');
        res.arrows.push({ from: res.reply.uci.slice(0, 2), to: res.reply.uci.slice(2, 4), color: 'red' });
      }
      if (best) {
        var bf = moveFacts(fenBefore, best.uci), bg = pvGain(fenBefore, best.pv, 5, color);
        var bwhy = bf ? bf.facts.slice(0, 2) : [];
        if (best.mate != null && best.mate * sgn > 0) bwhy.unshift('it leads to checkmate in ' + Math.abs(best.mate));
        else if (bg >= 1) bwhy.unshift('it ' + gainWords(bg));
        if (!bwhy.length) bwhy.push('it keeps your position ' + (lineWin(best) * sgn > 50 * sgn ? 'stronger' : 'safer') + ' (' + evalText(best) + ')');
        t.push('Better was ' + res.bestSan + ' because ' + join(bwhy) + '.');
        t.push('Line: ' + pvText(fenBefore, best.pv, 5));
        res.arrows.push({ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), color: 'green' });
      }
    }
    res.text = t.join(' ');
    return res;
  }

  // Graded hints for "find the move" situations
  function hints(fen, bestUci) {
    var g = new Chess(fen), m = g.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] || 'q' });
    if (!m) return ['Look for checks, captures and threats.'];
    var f = moveFacts(fen, bestUci), h1;
    if (g.in_checkmate()) h1 = 'There is a checkmate here! Look at the enemy king.';
    else if (f.facts.some(function (x) { return x.indexOf('fork') === 0; })) h1 = 'Look for a move that attacks two things at once.';
    else if (m.captured) h1 = 'Something can be captured. Count attackers and defenders.';
    else if (m.san.indexOf('+') > 0) h1 = 'Start with a check.';
    else h1 = 'Checks, captures, threats. Which of your pieces can do more?';
    return [h1, 'Try moving your ' + NAME[m.piece.toUpperCase()] + '.', 'Move it from ' + m.from + '.', 'The answer is ' + m.san + '.'];
  }

  window.Coach = { attackers: attackers, hanging: hanging, threats: threats, winPct: winPct, lineWin: lineWin, evalText: evalText,
    GRADES: GRADES, grade: grade, sacrifice: sacrifice, accuracy: accuracy, judge: judge, moveFacts: moveFacts, pvSan: pvSan, pvText: pvText,
    pvGain: pvGain, gainWords: gainWords, material: material, uciToMove: uciToMove, hints: hints, NAME: NAME, VAL: VAL, join: join, cap: cap };
})();
