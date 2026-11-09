/* Stacy Chess · Multiplayer FREE mode (v12, Firebase Spark plan: no Cloud Functions, no billing).
   The players' apps talk to Firestore directly; firestore.rules (in stacy-multiplayer-free-setup.zip)
   are the referee for who may write, turn order, the append-only move list, clocks (Firestore server
   time) and allowed result transitions. Chess legality is checked by BOTH apps with chess.js: the
   opponent's app re-plays every move and stops the game as "disputed" if a move or result is wrong.
   Accounts: username + password. Behind the scenes Firebase Email/Password sign-in is used with a
   hidden address <username>@users.stacy-chess.invalid that the player never sees or types (.invalid is
   a reserved domain: no mail can ever be delivered). There is no password reset without a server:
   lose the password = lose that Multiplayer account. Local training progress is never affected.
   This file implements the same backend interface as MP.firebaseBackend in multiplayer.js, so the
   screens are shared. Strict mode (Cloud Functions, Blaze plan) is still selected with mode: 'strict'. */
(function () {
  var MP = App.MP; if (!MP) return;
  var strictBackend = MP.firebaseBackend;
  var START_DELAY = 10000, HIDDEN = 30000, STALE = 35000, RULES_MS = 120000, WAITING_MS = 30 * 60000;
  var ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', TCB = [1, 3, 5, 10, 15, 30], TCI = [0, 1, 2, 3, 5, 10];
  var RESERVED = ['admin', 'administrator', 'stacy', 'stacychess', 'moderator', 'mod', 'system', 'support', 'root', 'staff', 'official', 'deleted', 'deletedplayer', 'null', 'undefined', 'anonymous', 'guest', 'multiplayer', 'firebase', 'google'];
  var WHY = { flag: 'on time', hidden: 'left the game screen for more than 30 seconds', stale: 'stopped responding for 35 seconds (left the app or lost connection)', resign: 'resignation', checkmate: 'checkmate', stalemate: 'stalemate', threefold: 'threefold repetition', fifty: '50-move rule', insufficient: 'insufficient material', agreement: 'draw by agreement', flagDraw: 'time out vs insufficient material', aborted: 'aborted before both players moved', left: 'a player left before the game started', expired: 'nobody joined in time', 'rules-timeout': 'the fair-play rules were not accepted in time', disputed: 'stopped: a move or result failed the chess-rules check in the other player’s app' };

  MP.mode = function () { var c = MP.config() || {}; return c.mode === 'strict' || (!c.mode && c.backendDeployed === true) ? 'strict' : 'free'; };
  MP.isFree = function () { return MP.mode() === 'free'; };
  MP.beatMs = function () { return MP.isFree() ? 10000 : 5000; }; // free: fewer writes (Spark quota); 3 missed beats still < 35 s
  MP.firebaseBackend = function (cfg) { return MP.mode() === 'strict' ? strictBackend(cfg) : MP.freeBackend(cfg); };
  if (MP.isFree()) MP.RULES[MP.RULES.length - 1] = 'Both apps check every move with the chess rules, and Firestore’s clock decides time-outs. If a move or result fails the check, the game stops as “disputed”. A game that ends before both players have moved is aborted and not recorded.';

  function err(code, message, details) { var e = new Error(message); e.code = code; e.mp = true; if (details) e.details = details; return e; }
  // a heartbeat landing between a transaction's read and commit makes Firestore reject the commit; the SDK retries 5 times, we add a few more
  function contention(e) { return e && !e.mp && (e.code === 'failed-precondition' || e.code === 'aborted'); }
  function retrying(job, n) { return job().catch(function (e) { if (!contention(e) || (n || 0) >= 6) throw e; return new Promise(function (r) { setTimeout(r, 60 + Math.random() * 240); }).then(function () { return retrying(job, (n || 0) + 1); }); }); }
  function other(c) { return c === 'w' ? 'b' : 'w'; }
  function lower(u) { return String(u || '').trim().toLowerCase(); }
  function nameProblem(u) {
    u = String(u || '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(u)) return '3–20 letters, digits or _, starting with a letter.';
    if (RESERVED.indexOf(u.toLowerCase()) >= 0) return 'That username is reserved.';
    return '';
  }
  function rnd(n) { var a = new Uint32Array(n); (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 4294967296); }); return a; }
  function newCode() { var r = rnd(6), s = ''; for (var i = 0; i < 6; i++) s += ALPHA[r[i] % ALPHA.length]; return s; }
  function ms(x) { return x == null ? null : typeof x === 'number' ? x : x.toMillis ? x.toMillis() : null; }

  MP.freeBackend = function (cfg) {
    var fb, app, auth, db, authCbs = [], b = { mode: 'free' }, cache = {}, lastBeat = {}, disputed = {}, recorded = {}, samples = [], pendingBeat = {};
    var DOMAIN = cfg.syntheticDomain || 'users.stacy-chess.invalid';
    function email(u) { return lower(u) + '@' + DOMAIN; }
    function ST() { return fb.firestore.FieldValue.serverTimestamp(); }
    function uid() { var u = auth && auth.currentUser; if (!u) throw err('unauthenticated', 'Please sign in to Multiplayer again.'); return u.uid; }
    function now() { return Date.now() + (MP.state.offset || 0); }
    function room(id) { return db.collection('rooms').doc(id); }
    b.syntheticEmail = email;

    b.init = function () {
      var chain = window.firebase && window.firebase.firestore && window.firebase.auth ? Promise.resolve() :
        ['app', 'auth', 'firestore'].reduce(function (p, m) { return p.then(function () { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'vendor/firebase/firebase-' + m + '-compat.js'; s.async = false; s.onload = res; s.onerror = function () { rej(new Error('Could not load vendor/firebase/firebase-' + m + '-compat.js')); }; document.head.appendChild(s); }); }); }, Promise.resolve());
      return chain.then(function () {
        fb = window.firebase;
        var conf = { apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId };
        app = (fb.apps || []).filter(function (a) { return a.name === 'stacy-mp-free'; })[0] || fb.initializeApp(conf, 'stacy-mp-free');
        auth = app.auth(); db = app.firestore();
        if (cfg.emulator) { var h = cfg.emulator.host || '127.0.0.1'; auth.useEmulator('http://' + h + ':' + (cfg.emulator.authPort || 9099), { disableWarnings: true }); if (cfg.emulator.longPolling) db.settings({ experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false }); db.useEmulator(h, cfg.emulator.firestorePort || 8080); }
        auth.onAuthStateChanged(function (u) { authCbs.forEach(function (f) { f(u ? { uid: u.uid } : null); }); });
        return new Promise(function (res) { var un = auth.onAuthStateChanged(function () { un(); res(); }); });
      });
    };
    b.signIn = function () { var u = auth.currentUser; return Promise.resolve(u ? { uid: u.uid } : null); };
    b.signOut = function () { return auth.signOut(); };
    b.current = function () { var u = auth && auth.currentUser; return u ? { uid: u.uid } : null; };
    b.onAuth = function (f) { authCbs.push(f); };

    /* ---------- reading ---------- */
    b.profile = function (u) { return db.collection('profiles').doc(u).get().then(function (s) { return s.exists ? Object.assign({ uid: u }, s.data()) : null; }).catch(function (e) { if (e && e.code === 'permission-denied') return null; throw e; }); };
    b.history = function (u, n) { return db.collection('profiles').doc(u).collection('games').orderBy('endedAt', 'desc').limit(n || 30).get().then(function (q) { return q.docs.map(function (d) { return d.data(); }); }).catch(function (e) { if (e && e.code === 'permission-denied') return []; throw e; }); };
    b.search = function (prefix) { var p = lower(prefix); return db.collection('profiles').where('visibility', '==', 'public').orderBy('usernameLower').startAt(p).endAt(p + '\uf8ff').limit(20).get().then(function (q) { return q.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); }); }); };
    b.openRooms = function (u) { return db.collection('rooms').where('uids', 'array-contains', u).where('status', 'in', ['waiting', 'rules', 'active']).limit(5).get().then(function (q) { return q.docs.map(function (d) { return view(d.data({ serverTimestamps: 'estimate' })); }).filter(function (r) { return ['waiting', 'rules', 'active'].indexOf(expiredStatus(r)) >= 0; }); }); };
    function expiredStatus(r) { var t = now(); if (r.status === 'waiting' && t > r.createdAt + WAITING_MS) return 'cancelled'; if (r.status === 'rules' && t > r.rulesSince + RULES_MS) return 'cancelled'; return r.status; }

    /* Firestore room → the shape the shared screens use (times in ms, clocks per side). */
    function view(d) {
      var r = JSON.parse(JSON.stringify(Object.assign({}, d, { createdAt: 0, rulesSince: 0, startAt: 0, endedAt: 0, turnStartedAt: 0, prevTurnStartedAt: 0, presence: {}, result: null })));
      r.createdAt = ms(d.createdAt); r.rulesSince = ms(d.rulesSince); r.endedAt = ms(d.endedAt);
      var g0 = d.startAt ? ms(d.startAt) + START_DELAY : null; r.startAt = g0;
      var ts = ms(d.turnStartedAt), ps = ms(d.prevTurnStartedAt);
      r.turnStartedAt = ts == null ? null : Math.max(ts, g0 || 0); r.prevTurnStartedAt = ps == null ? null : Math.max(ps, g0 || 0);
      r.presence = {}; Object.keys(d.presence || {}).forEach(function (k) { var p = d.presence[k]; r.presence[k] = { lastSeen: ms(p.lastSeen), hiddenSince: ms(p.hiddenSince), visible: p.visible, seq: p.seq }; });
      r.result = d.result ? Object.assign({}, d.result, { at: ms(d.result.at) }) : null;
      var bank = d.bank || { w: 0, b: 0 }, t = d.turn, m = other(t);
      r.clock = {}; r.clock[t] = bank[t]; r.clock[m] = d.ply > 0 && r.turnStartedAt != null ? bank[m] - (r.turnStartedAt - r.prevTurnStartedAt) + d.tc.incMs : bank[m];
      r.free = true; return r;
    }
    b.view = view;

    /* the receiving app re-checks the whole move list with chess.js */
    function audit(d) {
      var g = new Chess(), moves = d.moves || [], sans = d.sans || [];
      for (var i = 0; i < moves.length; i++) {
        var u = moves[i], mv = typeof u === 'string' ? g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) : null;
        if (!mv || (u.length === 5) !== !!mv.promotion) return { ply: i, note: 'illegal move ' + u + ' at ply ' + (i + 1) };
        if (sans[i] !== mv.san) return { ply: i, note: 'move ' + (i + 1) + ' is recorded as ' + sans[i] + ' but the move ' + u + ' is ' + mv.san };
      }
      if (moves.length && d.fen !== g.fen()) return { ply: moves.length - 1, note: 'the position after move ' + moves.length + ' does not match the moves' };
      var r = d.result;
      if (d.status === 'finished' && r && ['checkmate', 'stalemate', 'insufficient', 'threefold', 'fifty'].indexOf(r.reason) >= 0) {
        var ok = r.reason === 'checkmate' ? g.in_checkmate() : r.reason === 'stalemate' ? g.in_stalemate() : r.reason === 'insufficient' ? g.insufficient_material() : r.reason === 'threefold' ? g.in_threefold_repetition() : (g.in_draw() || moves.length >= 600);
        if (!ok) return { ply: moves.length - 1, note: 'the claimed ' + r.reason + ' is not on the board' };
      }
      return null;
    }
    b.audit = audit;

    b.watchRoom = function (id, onData, onErr) {
      return room(id).onSnapshot(function (s) {
        if (!s.exists) { onData(null); return; }
        var d = s.data({ serverTimestamps: 'estimate' }); cache[id] = s.data({ serverTimestamps: 'previous' }) || d;
        var me = auth.currentUser && auth.currentUser.uid, v = view(d);
        // clock offset: our own heartbeat's server time vs the local send/ack time
        var pb = pendingBeat[id], mine = me && d.presence && d.presence[me];
        if (pb && pb.t1 && mine && mine.seq === pb.seq && !s.metadata.hasPendingWrites && mine.lastSeen) { samples.push(ms(mine.lastSeen) - (pb.t0 + pb.t1) / 2); delete pendingBeat[id]; if (samples.length > 7) samples.shift(); var so = samples.slice().sort(function (a, b) { return a - b; }); MP.state.offset = so[Math.floor(so.length / 2)]; }
        if (!s.metadata.hasPendingWrites) {
          var bad = audit(d), lastBy = bad ? (bad.ply % 2 === 0 ? 'w' : 'b') : null, myC = v.players && v.players.w && v.players.w.uid === me ? 'w' : v.players && v.players.b && v.players.b.uid === me ? 'b' : null;
          if (bad && myC && !disputed[id] && (d.status === 'active' || (d.status === 'finished' && d.result && d.result.by !== me && d.result.reason !== 'disputed'))) {
            if (lastBy !== myC || d.status === 'finished') { disputed[id] = true; v.localDispute = bad; App.toast && App.toast('The other app sent something that breaks the chess rules. The game is stopped as disputed.', 'err'); ops.dispute(id, bad).catch(function () { }); }
          }
          if (d.status === 'finished' && myC && d.result && d.result.reason !== 'aborted' && !recorded[id]) { recorded[id] = true; recordHistory(id, d, myC).catch(function () { recorded[id] = false; }); }
        }
        onData(v);
      }, onErr);
    };

    /* own verified-by-rules history entry + stats (one batch, rules tie both to the finished room) */
    function recordHistory(id, d, c) {
      var u = uid(), pref = db.collection('profiles').doc(u), href = pref.collection('games').doc(id);
      return href.get().then(function (s) {
        if (s.exists) return;
        return pref.get().then(function (ps) {
          if (!ps.exists) return; var p = ps.data(), r = d.result, op = d.players[other(c)], me = d.players[c];
          var outcome = r.winner == null ? 'draw' : r.winner === c ? 'win' : 'loss', k = outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws';
          var h = { roomId: id, color: c, outcome: outcome, reason: r.reason, why: String(r.why || '').slice(0, 199), oppUid: op.uid, oppName: op.name, oppAvatar: op.avatar || null, myName: me.name, tc: d.tc, plies: d.ply, pgn: d.pgn || '', startedAt: d.startAt ? ms(d.startAt) + START_DELAY : null, endedAt: d.endedAt, verified: false, disputed: r.reason === 'disputed' };
          var st = Object.assign({ games: 0, wins: 0, losses: 0, draws: 0 }, p.stats); st.games += 1; st[k] += 1;
          var batch = db.batch(); batch.set(href, h); batch.update(pref, { stats: st, lastGame: id }); return batch.commit();
        });
      });
    }

    function pgnFor(d, result) {
      var g = new Chess(); (d.moves || []).forEach(function (u) { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); });
      var res = !result ? '*' : result.winner === 'w' ? '1-0' : result.winner === 'b' ? '0-1' : '1/2-1/2', dt = new Date(d.startAt ? ms(d.startAt) : Date.now());
      g.header('Event', 'Stacy Multiplayer', 'Site', 'Stacy Chess', 'Date', dt.getUTCFullYear() + '.' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '.' + String(dt.getUTCDate()).padStart(2, '0'),
        'White', d.players.w.name, 'Black', d.players.b.name, 'Result', res, 'TimeControl', (d.tc.baseMs / 1000) + '+' + (d.tc.incMs / 1000), 'Termination', result ? result.why : 'unterminated');
      return g.pgn();
    }
    function result(winner, reason) { return { winner: winner, reason: reason, why: WHY[reason] || reason, at: ST(), by: uid() }; }
    function finishFields(d, winner, reason, op) { var r = result(winner, reason); return { op: op, v: d.v + 1, status: 'finished', result: r, endedAt: ST(), drawOffer: null, pgn: pgnFor(d, r) }; }
    function colorOf(d, u) { return d.players && d.players.w && d.players.w.uid === u ? 'w' : d.players && d.players.b && d.players.b.uid === u ? 'b' : null; }
    function gameStart(d) { return ms(d.startAt) + START_DELAY; }
    function turnStart(d) { return Math.max(ms(d.turnStartedAt), gameStart(d)); }
    function prevStart(d) { return Math.max(ms(d.prevTurnStartedAt), gameStart(d)); }
    function inRoom(id, fn) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(id)) return Promise.reject(err('invalid-argument', 'Bad room id.'));
      var u = uid(), ref = room(id);
      return retrying(function () { return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (s) {
          if (!s.exists) throw err('not-found', 'Room not found.');
          var d = s.data(); if ((d.uids || []).indexOf(u) < 0) throw err('permission-denied', 'Not a player in this room.');
          var out = fn(d, colorOf(d, u), u, tx) || {}; if (out.update) tx.update(ref, out.update);
          return Object.assign({ ok: true, now: now(), roomId: id, status: out.update && out.update.status || d.status }, out.extra || {});
        });
      }); });
    }
    function liveDeadline(d) {
      // the earliest passed deadline by (estimated) Firestore time, same order as the rules check them
      var t = now(), g0 = gameStart(d), early = d.ply < 2, list = [];
      list.push({ at: turnStart(d) + d.bank[d.turn], kind: 'flag', loser: d.turn });
      ['w', 'b'].forEach(function (c) { var p = d.presence[d.players[c].uid] || {}; list.push({ at: Math.max(ms(p.lastSeen) || 0, g0) + STALE, kind: 'stale', loser: c }); if (p.hiddenSince) list.push({ at: Math.max(ms(p.hiddenSince), g0) + HIDDEN, kind: 'hidden', loser: c }); });
      list.sort(function (a, b) { return a.at - b.at; });
      var x = list[0]; if (!x || t < x.at + 400) return null;
      if (early) return { winner: null, reason: 'aborted' };
      if (x.kind === 'flag') return flagDraw(d.fen, x.loser) ? { winner: null, reason: 'flagDraw' } : { winner: other(x.loser), reason: 'flag' };
      return { winner: other(x.loser), reason: x.kind };
    }
    function flagDraw(fen, flagged) { var board = fen.split(' ')[0], opp = other(flagged), mine = [], theirs = []; for (var i = 0; i < board.length; i++) { var ch = board[i]; if (!/[a-zA-Z]/.test(ch)) continue; var col = ch === ch.toUpperCase() ? 'w' : 'b', ty = ch.toLowerCase(); if (ty !== 'k') (col === opp ? theirs : mine).push(ty); } return !theirs.length || (theirs.length === 1 && /[nb]/.test(theirs[0]) && !mine.length); }

    var ops = {
      accept: function (id, dd) { return inRoom(id, function (d, c, u) {
        if (d.status !== 'rules') throw err('failed-precondition', 'The rules step is over.');
        if (dd.rulesVersion !== d.rulesVersion) throw err('failed-precondition', 'Please read the current fair-play rules.');
        if (d.accepted[u]) return {};
        var acc = Object.assign({}, d.accepted); acc[u] = true; var up = { op: 'accept', v: d.v + 1, accepted: acc };
        if (d.uids.every(function (x) { return acc[x]; })) { up.status = 'active'; up.startAt = ST(); up.turnStartedAt = ST(); up.prevTurnStartedAt = ST(); }
        return { update: up };
      }); },
      move: function (id, dd) { return inRoom(id, function (d, c) {
        if (d.status === 'finished') return { extra: { applied: false } };
        if (d.status !== 'active') throw err('failed-precondition', 'The game is not running.');
        if (now() < gameStart(d)) throw err('failed-precondition', 'The game has not started yet.');
        if (typeof dd.uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(dd.uci)) throw err('invalid-argument', 'Bad move format.');
        if (dd.ply !== d.ply) throw err('aborted', 'Stale or repeated move (expected ply ' + d.ply + ').');
        if (d.turn !== c) throw err('failed-precondition', 'It is not your turn.');
        var g = new Chess(); d.moves.forEach(function (u) { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); });
        var legal = g.moves({ verbose: true }).filter(function (m) { return m.from === dd.uci.slice(0, 2) && m.to === dd.uci.slice(2, 4) && (m.promotion || '') === (dd.uci[4] || ''); })[0];
        if (!legal) throw err('invalid-argument', 'Illegal move.');
        var mv = g.move(legal), o = other(c), bank = { w: d.bank.w, b: d.bank.b };
        if (d.ply > 0) bank[o] = d.bank[o] - (turnStart(d) - prevStart(d)) + d.tc.incMs;
        var nd = Object.assign({}, d, { moves: d.moves.concat([dd.uci]) });
        var up = { op: 'move', v: d.v + 1, moves: nd.moves, sans: d.sans.concat([mv.san]), fen: g.fen(), ply: d.ply + 1, turn: o, bank: bank, turnStartedAt: ST(), prevTurnStartedAt: d.turnStartedAt, drawOffer: null };
        var end = g.in_checkmate() ? [c, 'checkmate'] : g.in_stalemate() ? [null, 'stalemate'] : g.insufficient_material() ? [null, 'insufficient'] : g.in_threefold_repetition() ? [null, 'threefold'] : (g.in_draw() || d.ply + 1 >= 600) ? [null, 'fifty'] : null;
        if (end) { var r = result(end[0], end[1]); up.status = 'finished'; up.result = r; up.endedAt = ST(); up.pgn = pgnFor(nd, r); }
        return { update: up, extra: { applied: true, san: mv.san } };
      }); },
      heartbeat: function (id, dd) {
        var u = uid(), d = cache[id], p = d && d.presence && d.presence[u];
        if (!d || !p || ['rules', 'active'].indexOf(d.status) < 0) return Promise.resolve({ ok: true, skipped: true });
        var vis = !!dd.visible; if (p.visible === vis && Date.now() - (lastBeat[id] || 0) < 1000) return Promise.resolve({ ok: true, throttled: true });
        var seq = Math.max((p.seq || 0) + 1, Number(dd.seq) || 0), up = { op: 'heartbeat' };
        up['presence.' + u] = { lastSeen: ST(), hiddenSince: vis ? null : (p.hiddenSince || ST()), visible: vis, seq: seq };
        var pb = pendingBeat[id] = { seq: seq, t0: Date.now() }; lastBeat[id] = Date.now(); p.seq = seq;
        return room(id).update(up).then(function () { pb.t1 = Date.now(); return { ok: true }; }).catch(function (e) { delete pendingBeat[id]; throw e; });
      },
      sync: function (id) { return inRoom(id, function (d) {
        var t = now();
        if (d.status === 'waiting' && t > ms(d.createdAt) + WAITING_MS + 1000) return { update: { op: 'cancel', v: d.v + 1, status: 'cancelled', code: null, result: result(null, 'expired') }, extra: { codeToDelete: d.code } };
        if (d.status === 'rules' && t > ms(d.rulesSince) + RULES_MS + 1000) return { update: { op: 'cancel', v: d.v + 1, status: 'cancelled', code: null, result: result(null, 'rules-timeout') } };
        if (d.status !== 'active') return {};
        var x = liveDeadline(d); if (!x) return {};
        return { update: finishFields(d, x.winner, x.reason, 'claim'), extra: { claimed: x.reason } };
      }).catch(function (e) { if (e && e.code === 'permission-denied') return { ok: false, early: true }; throw e; }); },
      resign: function (id) { return inRoom(id, function (d, c) {
        if (d.status === 'active') return { update: finishFields(d, d.ply < 2 ? null : other(c), d.ply < 2 ? 'aborted' : 'resign', 'resign') };
        if (d.status === 'waiting' || d.status === 'rules') return { update: { op: 'cancel', v: d.v + 1, status: 'cancelled', code: null, result: result(null, 'left') } };
        return {};
      }); },
      leave: function (id) {
        var u = uid();
        return room(id).get().then(function (s) {
          var d = s.exists ? s.data() : null; if (!d) throw err('not-found', 'Room not found.');
          if (d.status === 'waiting' && d.hostUid === u) {
            var batch = db.batch(); batch.update(room(id), { op: 'cancel', v: d.v + 1, status: 'cancelled', code: null, result: result(null, 'left') });
            if (d.code) batch.delete(db.collection('codes').doc(d.code)); return batch.commit().then(function () { return { ok: true, status: 'cancelled', roomId: id }; });
          }
          return ops.resign(id);
        });
      },
      draw: function (id, dd) { return inRoom(id, function (d, c) {
        if (d.status !== 'active') throw err('failed-precondition', 'The game is not running.');
        if (dd.action === 'offer') {
          if (d.drawOffer === c) return {};
          if (d.drawOffer === other(c)) throw err('failed-precondition', 'Your opponent already offered a draw; accept or decline it.');
          if (d.drawOffers[c] >= 3) throw err('resource-exhausted', 'No more draw offers in this game.');
          var offers = { w: d.drawOffers.w, b: d.drawOffers.b }; offers[c] += 1; return { update: { op: 'draw', v: d.v + 1, drawOffer: c, drawOffers: offers } };
        }
        if (dd.v != null && dd.v !== d.v) throw err('aborted', 'The game changed; look at the board again.');
        if (d.drawOffer !== other(c)) throw err('failed-precondition', 'There is no draw offer to answer.');
        if (dd.action === 'accept') return { update: finishFields(d, null, 'agreement', 'draw') };
        if (dd.action === 'decline') return { update: { op: 'draw', v: d.v + 1, drawOffer: null } };
        throw err('invalid-argument', 'Unknown draw action.');
      }); },
      dispute: function (id, bad) { return inRoom(id, function (d) {
        var canFinished = d.status === 'finished' && d.result && d.result.by !== uid() && ['checkmate', 'stalemate', 'insufficient', 'threefold', 'fifty'].indexOf(d.result.reason) >= 0;
        if (d.status !== 'active' && !canFinished) return {};
        var up = finishFields(d, null, 'disputed', 'dispute'); up.dispute = { by: uid(), ply: bad.ply | 0, note: String(bad.note || '').slice(0, 190) };
        var safe = { players: d.players, tc: d.tc, startAt: d.startAt, moves: [] }; // PGN of the legal prefix only
        var g = new Chess(); for (var i = 0; i < d.moves.length; i++) { var u = d.moves[i]; if (!g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) break; safe.moves.push(u); }
        up.pgn = pgnFor(safe, up.result); return { update: up };
      }); },
      rematch: function (id) {
        var u = uid(), ref = room(id);
        return retrying(function () { return db.runTransaction(function (tx) {
          return tx.get(ref).then(function (s) {
            if (!s.exists) throw err('not-found', 'Room not found.'); var d = s.data();
            if (d.uids.indexOf(u) < 0) throw err('permission-denied', 'Not a player in this room.');
            if (d.status !== 'finished') throw err('failed-precondition', 'The game is not finished.');
            if (d.rematchRoom) return { ok: true, roomId: d.rematchRoom, status: 'rules', rematch: true };
            var rm = Object.assign({}, d.rematch); rm[u] = true; var opp = d.uids.filter(function (x) { return x !== u; })[0];
            if (!rm[opp]) { tx.update(ref, { op: 'rematch', v: d.v + 1, rematch: rm }); return { ok: true, roomId: id, status: 'finished', waiting: true }; }
            var nref = db.collection('rooms').doc(), fresh = function () { return { lastSeen: ST(), hiddenSince: null, visible: true, seq: 0 }; };
            var n = baseRoom(nref.id, d.tc); n.status = 'rules'; n.code = null; n.hostUid = d.players.b.uid; n.hostInfo = d.players.b; n.colorPref = 'w';
            n.players = { w: d.players.b, b: d.players.w }; n.uids = [d.players.b.uid, d.players.w.uid]; n.rulesSince = ST(); n.rematchOf = id;
            n.presence = {}; n.presence[n.uids[0]] = fresh(); n.presence[n.uids[1]] = fresh();
            tx.set(nref, n); tx.update(ref, { op: 'rematch', v: d.v + 1, rematch: rm, rematchRoom: nref.id });
            return { ok: true, roomId: nref.id, status: 'rules', rematch: true };
          });
        }); });
      }
    };
    function baseRoom(id, tc) {
      return { roomId: id, v: 1, op: 'create', status: 'waiting', code: null, createdAt: ST(), hostUid: null, uids: [], hostInfo: null, colorPref: 'random', players: { w: null, b: null }, tc: tc, rulesVersion: 'mp-rules-1', accepted: {}, rulesSince: null, startAt: null, endedAt: null,
        moves: [], sans: [], fen: new Chess().fen(), ply: 0, turn: 'w', bank: { w: tc.baseMs, b: tc.baseMs }, turnStartedAt: null, prevTurnStartedAt: null, presence: {}, drawOffer: null, drawOffers: { w: 0, b: 0 }, result: null, pgn: '', rematch: {}, rematchRoom: null, rematchOf: null, dispute: null };
    }
    function myInfo() { var u = uid(); return db.collection('profiles').doc(u).get().then(function (s) { if (!s.exists) throw err('permission-denied', 'This Multiplayer account no longer exists.'); var p = s.data(); return { uid: u, name: p.username, avatar: p.avatar }; }); }
    function create(dd) {
      var tc = dd.tc || {}, base = Number(tc.baseMin), inc = Number(tc.incSec);
      if (TCB.indexOf(base) < 0 || TCI.indexOf(inc) < 0) return Promise.reject(err('invalid-argument', 'Choose a time control from the list.'));
      var u = uid();
      return b.openRooms(u).then(function (open) {
        if (open.length) throw err('already-exists', 'You already have an open Multiplayer room.', { roomId: open[0].roomId, status: open[0].status });
        return myInfo();
      }).then(function (host) {
        function attempt(n) {
          var code = newCode(), cref = db.collection('codes').doc(code);
          return cref.get().then(function (cs) {
            if (cs.exists) { if (n > 5) throw err('unavailable', 'Could not allocate a room code. Try again.'); return attempt(n + 1); }
            var ref = db.collection('rooms').doc(), d = baseRoom(ref.id, { baseMs: base * 60000, incMs: inc * 1000 });
            d.code = code; d.hostUid = u; d.uids = [u]; d.hostInfo = host; d.colorPref = ['w', 'b', 'random'].indexOf(dd.color) >= 0 ? dd.color : 'random';
            var batch = db.batch(); batch.set(ref, d); batch.set(cref, { roomId: ref.id, createdBy: u, createdAt: ST() });
            return batch.commit().then(function () { return { ok: true, now: now(), roomId: ref.id, code: code, v: 1, status: 'waiting' }; });
          });
        }
        return attempt(0);
      });
    }
    function join(dd) {
      var code = String(dd.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), u = uid();
      if (code.length !== 6) return Promise.reject(err('not-found', 'No open room with that code.'));
      var cref = db.collection('codes').doc(code);
      return Promise.all([cref.get(), myInfo(), b.openRooms(u)]).then(function (x) {
        var cs = x[0], guest = x[1], open = x[2];
        if (!cs.exists) throw err('not-found', 'No open room with that code.');
        var rid = cs.data().roomId, busyRoom = open.filter(function (r) { return r.roomId !== rid; })[0];
        if (busyRoom) throw err('already-exists', 'Finish or leave your other Multiplayer room first.', { roomId: busyRoom.roomId });
        var ref = room(rid);
        return retrying(function () { return db.runTransaction(function (tx) {
          return tx.get(ref).then(function (s) {
            if (!s.exists) throw err('not-found', 'No open room with that code.');
            var d = s.data();
            if (d.status !== 'waiting' || now() > ms(d.createdAt) + WAITING_MS) throw err('failed-precondition', 'This room is no longer open.');
            if (d.hostUid === u) throw err('failed-precondition', 'You cannot join your own room.');
            // colour: the host's choice, or random (picked by the joining app; see README "what can still be cheated")
            var hostColor = d.colorPref === 'w' || d.colorPref === 'b' ? d.colorPref : (rnd(1)[0] % 2 ? 'w' : 'b'), players = {};
            players[hostColor] = d.hostInfo; players[other(hostColor)] = guest;
            var pres = {}; [d.hostUid, u].forEach(function (x) { pres[x] = { lastSeen: ST(), hiddenSince: null, visible: true, seq: 0 }; });
            tx.update(ref, { op: 'join', v: d.v + 1, status: 'rules', uids: [d.hostUid, u], players: players, rulesSince: ST(), presence: pres, code: null });
            tx.delete(cref);
            return { ok: true, now: now(), roomId: rid, v: d.v + 1, status: 'rules' };
          });
        }); });
      });
    }

    /* ---------- accounts (Firebase Email/Password behind a username) ---------- */
    function authFriendly(e) {
      var c = (e && e.code) || '';
      if (/wrong-password|user-not-found|invalid-credential|invalid-login-credentials|invalid-email/.test(c)) return err('unauthenticated-login', 'Wrong username or password.');
      if (/too-many-requests/.test(c)) return err('resource-exhausted', 'Too many attempts. Wait a few minutes and try again.');
      if (/weak-password/.test(c)) return err('invalid-argument', 'Choose a longer password (at least 8 characters).');
      if (/network-request-failed/.test(c)) return err('unavailable', 'Can’t reach the Multiplayer server. Check your connection and try again.');
      if (/operation-not-allowed/.test(c)) return err('failed-precondition', 'Multiplayer sign-in is not switched on yet (Firebase console → Authentication → Email/Password).');
      if (/requires-recent-login/.test(c)) return err('unauthenticated', 'Please sign in again, then retry.');
      return e;
    }
    function suggestions(u) {
      var base = lower(u).replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'player'; if (!/^[a-z]/.test(base)) base = 'p' + base;
      var r = rnd(4), c = [base + '_' + (r[0] % 90 + 10), base + (r[1] % 900 + 100), base + '_chess', 'the_' + base, base + '_' + (r[2] % 9000 + 1000)];
      c = c.filter(function (x) { return !nameProblem(x); }).slice(0, 5);
      return Promise.all(c.map(function (x) { return db.collection('usernames').doc(x).get().then(function (s) { return s.exists ? null : x; }).catch(function () { return null; }); })).then(function (l) { return l.filter(Boolean).slice(0, 3); });
    }
    function checkUsername(dd) {
      var u = String(dd.username || '').trim(), p = nameProblem(u);
      if (p) return Promise.resolve({ ok: true, valid: false, reason: p, available: false, suggestions: [] });
      return db.collection('usernames').doc(lower(u)).get().then(function (s) {
        if (!s.exists) return { ok: true, valid: true, available: true, suggestions: [] };
        return suggestions(u).then(function (sg) { return { ok: true, valid: true, available: false, suggestions: sg }; });
      });
    }
    function makeProfile(u, username) {
      var id = auth.currentUser.uid, batch = db.batch();
      batch.set(db.collection('usernames').doc(lower(username)), { uid: id, createdAt: ST() });
      batch.set(db.collection('profiles').doc(id), { username: username, usernameLower: lower(username), avatar: 'wn', visibility: 'public', stats: { games: 0, wins: 0, losses: 0, draws: 0 }, createdAt: ST(), lastGame: null });
      return batch.commit();
    }
    function signup(dd) {
      var u = String(dd.username || '').trim(), pw = String(dd.password || ''), p = nameProblem(u);
      if (p) return Promise.reject(err('invalid-argument', p));
      if (pw.length < 8) return Promise.reject(err('invalid-argument', 'Use at least 8 characters for the password.'));
      var taken = function () { return suggestions(u).then(function (sg) { throw err('already-exists', 'That username is taken.', { suggestions: sg }); }); };
      return db.collection('usernames').doc(lower(u)).get().then(function (s) {
        if (s.exists) return taken();
        return auth.createUserWithEmailAndPassword(email(u), pw).catch(function (e) {
          if (e && e.code === 'auth/email-already-in-use') {
            // an earlier sign-up may have stopped half-way (account made, profile not): finish it with the same password
            return auth.signInWithEmailAndPassword(email(u), pw).catch(function () { return taken(); });
          }
          throw authFriendly(e);
        }).then(function () {
          return makeProfile(auth.currentUser.uid, u).catch(function (e) {
            var cu = auth.currentUser; return (cu ? cu.delete().catch(function () { }) : Promise.resolve()).then(function () { if (e && e.code === 'permission-denied') return taken(); throw e; });
          });
        }).then(function () { return { ok: true, now: now(), free: true, recoveryCodes: null }; });
      });
    }
    function login(dd) {
      var u = String(dd.username || '').trim(), pw = String(dd.password || '');
      if (nameProblem(u) || !pw) return Promise.reject(err('unauthenticated-login', 'Wrong username or password.'));
      return auth.signInWithEmailAndPassword(email(u), pw).catch(function (e) { throw authFriendly(e); }).then(function (c) {
        return db.collection('profiles').doc(c.user.uid).get().then(function (s) {
          if (s.exists) return { ok: true, now: now() };
          return makeProfile(c.user.uid, u).then(function () { return { ok: true, now: now() }; }); // finish a half-made sign-up
        });
      });
    }
    function reauth(pw) {
      var cu = auth.currentUser; if (!cu) return Promise.reject(err('unauthenticated', 'Please sign in to Multiplayer again.'));
      return cu.reauthenticateWithCredential(fb.auth.EmailAuthProvider.credential(cu.email, String(pw || ''))).catch(function (e) { throw authFriendly(e); });
    }
    function changePassword(dd) {
      var n = String(dd.newPassword || ''); if (n.length < 8) return Promise.reject(err('invalid-argument', 'Use at least 8 characters for the password.'));
      return reauth(dd.oldPassword).then(function () { return auth.currentUser.updatePassword(n); }).catch(function (e) { throw authFriendly(e); }).then(function () { return { ok: true, now: now() }; });
    }
    function deleteAccount(dd) {
      var u = uid();
      return reauth(dd.password).then(function () { return b.openRooms(u); }).then(function (open) {
        return open.reduce(function (p, r) { return p.then(function () { return ops.leave(r.roomId).catch(function () { }); }); }, Promise.resolve());
      }).then(function () { return db.collection('profiles').doc(u).get(); }).then(function (ps) {
        var p = ps.exists ? ps.data() : null;
        return db.collection('profiles').doc(u).collection('games').get().then(function (q) {
          var batch = db.batch(); q.docs.forEach(function (d) { batch.delete(d.ref); });
          if (p) { batch.delete(db.collection('usernames').doc(p.usernameLower)); batch.delete(db.collection('profiles').doc(u)); }
          return batch.commit();
        });
      }).then(function () { return auth.currentUser.delete(); }).catch(function (e) { throw authFriendly(e); }).then(function () { return { ok: true }; });
    }
    var noRecovery = function () { return Promise.reject(err('unimplemented', 'Free Multiplayer has no password reset: without a server nobody can prove it is you. If you lose your password, that Multiplayer account is lost; your lessons and local progress are not affected. You can make a new account.')); };

    b.call = function (name, dd) {
      dd = dd || {};
      try {
        if (name === 'mpAccount') return ({ checkUsername: checkUsername, signup: signup, login: login, changePassword: changePassword, deleteAccount: deleteAccount, recover: noRecovery, newRecoveryCodes: noRecovery }[dd.op] || function () { return Promise.reject(err('invalid-argument', 'Unknown operation.')); })(dd);
        if (name === 'mpProfile') {
          var u = uid(), up = {};
          if (dd.op === 'me') return b.profile(u).then(function (p) { return { ok: true, profile: p, now: now() }; });
          if (dd.avatar !== undefined) { if (MP.AVATARS.indexOf(dd.avatar) < 0) return Promise.reject(err('invalid-argument', 'Pick one of the avatars.')); up.avatar = dd.avatar; }
          if (dd.visibility !== undefined) { if (['public', 'private'].indexOf(dd.visibility) < 0) return Promise.reject(err('invalid-argument', 'Bad visibility.')); up.visibility = dd.visibility; }
          if (!Object.keys(up).length) return Promise.reject(err('invalid-argument', 'Nothing to change.'));
          return db.collection('profiles').doc(u).update(up).then(function () { return { ok: true }; });
        }
        if (name === 'mpGame') {
          if (dd.op === 'create') return create(dd);
          if (dd.op === 'join') return join(dd);
          if (dd.op === 'rematch') return ops.rematch(dd.roomId);
          if (ops[dd.op]) return ops[dd.op](dd.roomId, dd);
        }
        return Promise.reject(err('invalid-argument', 'Unknown operation.'));
      } catch (e) { return Promise.reject(e); }
    };
    return b;
  };
})();
