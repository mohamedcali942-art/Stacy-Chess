/* Stacy Chess · Multiplayer (v10).
   Username + password accounts (no email) and private rooms joined by code. The server (Cloud
   Functions) decides legality, turns, clocks, fair-play forfeits and results; this file only shows the
   game and sends requests. Local training progress is never uploaded or reset; signing in is needed
   only for Multiplayer. Finished games are saved locally and open in the v9 results → Game Review flow. */
(function () {
  var MP = App.MP = {};
  var RULES_VERSION = 'mp-rules-1';
  MP.RULES = [
    'No engines, analysis, coaching, hints, takebacks or Game Review during the game. Stacy switches them off until it ends.',
    'Stay on the game screen. If Stacy is hidden for more than 30 seconds (other app, other tab, locked phone), you lose.',
    'If your device stops responding for 35 seconds (app closed, connection lost), you lose. A lost connection looks the same as leaving.',
    'Thinking on the game screen is always fine: only your clock runs.',
    'No help from other people, devices or programs. Stacy cannot detect a second device or a helper, so this is on your honour.',
    'The server checks every move and runs the clocks. A game that ends before both players have moved is aborted and not recorded.'
  ];
  MP.TCS = [[1, 0], [3, 0], [3, 2], [5, 0], [5, 3], [10, 0], [10, 5], [15, 10], [30, 0]];
  MP.AVATARS = ['wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'bp', 'bn', 'bb', 'br', 'bq', 'bk'];
  var PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  var esc = function (s) { return App.esc(s); };
  function S() { return App.state; }
  function other(c) { return c === 'w' ? 'b' : 'w'; }
  MP.avatar = function (id, size) { id = MP.AVATARS.indexOf(id) >= 0 ? id : 'wn'; return '<span class="mp-av ' + (id[0] === 'b' ? 'dark' : 'light') + (size ? ' ' + size : '') + '" aria-hidden="true">~i:' + PIECE[id[1]] + '~</span>'; };

  /* ---------- configuration state ---------- */
  MP.config = function () { return window.STACY_FIREBASE || null; };
  MP.configured = function () {
    var c = MP.config(); if (!c || !c.projectId) return false;
    if (c.emulator) return true;
    var free = c.mode === 'free' || (!c.mode && c.backendDeployed !== true); // v12: free (Spark) mode needs only the Web API key
    return (free || c.backendDeployed === true) && typeof c.apiKey === 'string' && c.apiKey.length > 20 && !/PASTE|YOUR_|PLACEHOLDER/i.test(c.apiKey);
  };
  MP.state = { phase: 'idle', error: '', user: null, me: null, offset: 0 };
  MP.live = null; // {roomId} while a game is running: engine/coach off, navigation guarded

  /* ---------- backend: the real Firebase one (lazy-loaded, bundled SDK) or a test double ---------- */
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }); }
  MP.firebaseBackend = function (cfg) {
    var fb, app, auth, db, fns, authCbs = [], b = {};
    b.init = function () {
      var chain = window.firebase && window.firebase.functions ? Promise.resolve() :
        ['app', 'auth', 'firestore', 'functions'].reduce(function (p, m) { return p.then(function () { return loadScript('vendor/firebase/firebase-' + m + '-compat.js'); }); }, Promise.resolve());
      return chain.then(function () {
        fb = window.firebase;
        var conf = { apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId };
        app = (fb.apps || []).filter(function (a) { return a.name === 'stacy-mp'; })[0] || fb.initializeApp(conf, 'stacy-mp');
        auth = app.auth(); db = app.firestore(); fns = app.functions(cfg.functionsRegion || 'europe-west1');
        if (cfg.emulator) { var h = cfg.emulator.host || '127.0.0.1'; auth.useEmulator('http://' + h + ':' + (cfg.emulator.authPort || 9099), { disableWarnings: true }); if (cfg.emulator.longPolling) db.settings({ experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false }); db.useEmulator(h, cfg.emulator.firestorePort || 8080); fns.useEmulator(h, cfg.emulator.functionsPort || 5001); }
        auth.onAuthStateChanged(function (u) { authCbs.forEach(function (f) { f(u ? { uid: u.uid } : null); }); });
        return new Promise(function (res) { var un = auth.onAuthStateChanged(function () { un(); res(); }); });
      });
    };
    b.call = function (name, data) { return fns.httpsCallable(name, { timeout: 30000 })(data).then(function (r) { return r.data; }); };
    b.signIn = function (token) { return auth.signInWithCustomToken(token).then(function (c) { return { uid: c.user.uid }; }); };
    b.signOut = function () { return auth.signOut(); };
    b.current = function () { var u = auth && auth.currentUser; return u ? { uid: u.uid } : null; };
    b.onAuth = function (f) { authCbs.push(f); };
    b.watchRoom = function (id, onData, onErr) { return db.collection('rooms').doc(id).onSnapshot(function (s) { onData(s.exists ? s.data() : null); }, onErr); };
    b.profile = function (uid) { return db.collection('profiles').doc(uid).get().then(function (s) { return s.exists ? Object.assign({ uid: uid }, s.data()) : null; }); };
    b.history = function (uid, n) { return db.collection('profiles').doc(uid).collection('games').orderBy('endedAt', 'desc').limit(n || 30).get().then(function (q) { return q.docs.map(function (d) { return d.data(); }); }); };
    b.search = function (prefix) { var p = String(prefix || '').toLowerCase(); return db.collection('profiles').where('visibility', '==', 'public').orderBy('usernameLower').startAt(p).endAt(p + '\uf8ff').limit(20).get().then(function (q) { return q.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); }); }); };
    b.openRooms = function (uid) { return db.collection('rooms').where('uids', 'array-contains', uid).where('status', 'in', ['waiting', 'rules', 'active']).limit(3).get().then(function (q) { return q.docs.map(function (d) { return d.data(); }); }); };
    return b;
  };
  MP.backend = null;
  MP.useBackend = function (b) { MP.backend = b; MP.state.phase = 'idle'; MP._ready = null; };
  MP.ensure = function () {
    if (!MP.configured() && !MP._testBackend) return Promise.reject(Object.assign(new Error('not-set-up'), { notSetUp: true }));
    if (MP._ready) return MP._ready;
    if (!MP.backend) MP.backend = MP.firebaseBackend(MP.config());
    MP.state.phase = 'loading';
    MP._ready = MP.backend.init().then(function () {
      MP.state.phase = 'ready';
      MP.backend.onAuth(function (u) { MP.state.user = u; if (!u) MP.state.me = null; });
      MP.state.user = MP.backend.current();
      return MP.state.user ? MP.refreshMe() : null;
    }).catch(function (e) { MP.state.phase = 'error'; MP.state.error = friendly(e); MP._ready = null; throw e; });
    return MP._ready;
  };
  MP.refreshMe = function () {
    var u = MP.state.user; if (!u) return Promise.resolve(null);
    return MP.backend.profile(u.uid).then(function (p) { if (!p) { MP.state.me = null; return MP.backend.signOut().then(function () { MP.state.user = null; return null; }); } MP.state.me = p; return p; });
  };
  function friendly(e) {
    var code = String((e && e.code) || '').replace(/^functions\//, ''), msg = (e && e.message) || '';
    if (code === 'unavailable' || /Failed to fetch|network|NetworkError|Could not load/i.test(msg)) return 'Can’t reach the Multiplayer server. Check your connection and try again.';
    if (code === 'not-found' && /^not[- ]found$/i.test(msg)) return 'The Multiplayer server is not responding yet.';
    if (code === 'internal' && /^internal$/i.test(msg)) return 'The Multiplayer server had a problem. Try again in a moment.';
    if (code === 'unauthenticated') return 'Please sign in to Multiplayer again.';
    return msg || 'Something went wrong. Try again.';
  }
  MP.friendly = friendly;
  /* v12: wording that depends on the backend mode (free = Spark, rules-checked; strict = Cloud Functions) */
  MP.free = function () { return typeof MP.isFree === 'function' ? MP.isFree() : false; };
  MP.txt = function (k) {
    var f = MP.free();
    return ({
      hubSub: f ? 'Play a friend with a private code. Both apps check every move.' : 'Play a friend with a private code. The server keeps it fair.',
      verified: f ? 'Result checked by both players’ apps and the Firestore rules.' : 'Result verified by the server.',
      ratedNote: f ? 'Multiplayer game: result checked by both players’ apps (free mode). Not counted in your Stacy rating.' : 'Multiplayer game: result verified by the server. Not counted in your Stacy rating.',
      history: f ? 'History shows finished games as both apps recorded them (free mode: checked by the Firestore rules, not by a server).' : 'History shows only finished games verified by the server.',
      signupNote: f ? 'No email is needed. There is no password reset in free Multiplayer: if you lose your password, you lose this Multiplayer account. Your lessons and local progress are never affected.' : 'No email is needed. You will get 8 one-time recovery codes instead.',
      privacy: f ? 'Your local lessons, games and stats stay on this device and are not uploaded. Multiplayer stores your username, avatar and your Multiplayer games; your password is handled by Firebase Authentication (Google), never stored by Stacy.' : 'Your local lessons, games and stats stay on this device and are not uploaded. Multiplayer stores your username, avatar, a password hash and your Multiplayer games.',
      visibility: f ? 'Public: other signed-in players can find you and see your games. Private: hidden from search and from other players’ profile views; opponents still see your username in games you play together.' : 'Public: other signed-in players can find you and see your verified games. Private: hidden from search and from other players’ profile views; opponents still see your username in games you play together.'
    })[k];
  };
  MP.noResetSheet = function (done) {
    var sh = App.sheet('<h3>Keep your password safe</h3><p class="small">Free Multiplayer has <b>no password reset</b>. Without a server nobody can check that a reset request is really you, so Stacy does not offer a fake one.</p><ul class="small"><li>Lose your password = lose this Multiplayer account (its username stays taken).</li><li>Your lessons, ratings, games and everything else in the app stay on this device and are not affected.</li><li>Save the password in your phone’s password manager (iOS offers this when you create the account).</li></ul><label class="row small mp-check"><input type="checkbox" id="mpSaved"> I saved my password somewhere safe</label><div class="btn-row"><button class="btn primary" id="mpCodesDone" disabled>Continue</button></div>', { modal: true });
    var ck = sh.el.querySelector('#mpSaved'), go = sh.el.querySelector('#mpCodesDone');
    ck.onchange = function () { go.disabled = !ck.checked; };
    go.onclick = function () { sh.close(); done && done(); };
    return sh;
  };
  MP.call = function (name, data) {
    var t0 = Date.now();
    return MP.backend.call(name, data).then(function (r) { if (r && typeof r.now === 'number') { var t1 = Date.now(); MP.state.offset = r.now - Math.round((t0 + t1) / 2); } return r; });
  };
  MP.serverNow = function () { return Date.now() + MP.state.offset; };

  /* ---------- accounts ---------- */
  function signedIn(r) { return MP.backend.signIn(r.token).then(function (u) { MP.state.user = u; return MP.refreshMe(); }).then(function () { return r; }); }
  MP.signup = function (u, p) { return MP.call('mpAccount', { op: 'signup', username: u, password: p }).then(signedIn); };
  MP.login = function (u, p) { return MP.call('mpAccount', { op: 'login', username: u, password: p }).then(signedIn); };
  MP.recover = function (u, code, p) { return MP.call('mpAccount', { op: 'recover', username: u, code: code, newPassword: p }).then(signedIn); };
  MP.logout = function () { return MP.backend.signOut().then(function () { MP.state.user = null; MP.state.me = null; }); };
  MP.checkName = function (u) { return MP.call('mpAccount', { op: 'checkUsername', username: u }); };

  /* ---------- live-game lock: engine, coach, hints and other screens are off during a game ---------- */
  if (window.Engine) {
    ['analyse', 'playMove'].forEach(function (k) { var f = Engine[k]; if (typeof f !== 'function') return; Engine[k] = function () { if (MP.live) return Promise.resolve(null); return f.apply(Engine, arguments); }; });
  }
  var baseRoute = App.route;
  App.route = function () {
    if (MP.live) {
      var want = '#/mp-room/' + MP.live.roomId;
      if (location.hash !== want) { try { history.replaceState(null, '', want); } catch (e) { } MP.confirmLeave(); return; }
    }
    return baseRoute.apply(this, arguments);
  };
  MP.setLive = function (roomId) {
    MP.live = roomId ? { roomId: roomId } : null;
    if (MP.live) { App.trainingLock = { noHelp: true, live: true }; window.Engine && Engine.cancelAll && Engine.cancelAll(); window.Voice && Voice.stop && Voice.stop(); document.body.classList.add('mp-live'); }
    else { if (App.trainingLock && App.trainingLock.live) App.trainingLock = null; document.body.classList.remove('mp-live'); }
  };
  MP.confirmLeave = function () {
    if (MP._leaveSheet || !MP.live) return;
    var id = MP.live.roomId;
    var sh = MP._leaveSheet = App.sheet('<h3>Leave the live game?</h3><p class="small">You are in a Multiplayer game. Other screens, the engine and the coach are off until it ends. Leaving now counts as resigning.</p><div class="btn-row"><button class="btn primary" id="mpStay">Stay in the game</button><button class="btn" id="mpResignLeave">Resign and leave</button></div>', { modal: true, onClose: function () { MP._leaveSheet = null; } });
    sh.el.querySelector('#mpStay').onclick = function () { sh.close(); };
    sh.el.querySelector('#mpResignLeave').onclick = function () { sh.close(); MP.call('mpGame', { op: 'resign', roomId: id }).catch(function () { }).then(function () { MP.setLive(null); App.go('multiplayer'); }); };
  };

  /* ---------- finished games → local record → v9 results / Game Review ---------- */
  MP.recordFromRoom = function (room, me) {
    var r = room.result, opp = room.players[other(me)];
    return { id: 'mp_' + room.roomId, date: r.at || Date.now(), pgn: room.pgn, result: r.winner == null ? 'draw' : r.winner === me ? 'win' : 'loss', why: r.why, color: me, opp: opp.name, source: 'multiplayer',
      mp: { roomId: room.roomId, oppUid: opp.uid, tc: room.tc, verified: !MP.free(), free: MP.free() }, ratedNote: MP.txt('ratedNote') };
  };
  MP.saveGame = function (rec) {
    var s = S(); s.games = s.games || [];
    if (s.games.some(function (g) { return g.id === rec.id; })) return false;
    s.stats.games++; s.stats[rec.result === 'win' ? 'wins' : rec.result === 'draw' ? 'draws' : 'losses']++;
    s.games.push(rec); if (s.games.length > 60) s.games.shift();
    App.record && App.record('game', 1, rec.result === 'win' ? 40 : rec.result === 'draw' ? 20 : 10);
    App.save(); return true;
  };
  MP.importHistory = function (h) {
    return { id: 'mp_' + h.roomId, date: h.endedAt, pgn: h.pgn, result: h.outcome, why: h.why, color: h.color, opp: h.oppName, source: 'multiplayer', mp: { roomId: h.roomId, oppUid: h.oppUid, tc: h.tc, verified: h.verified === true, free: h.verified !== true }, ratedNote: h.verified === true ? 'Multiplayer game: result verified by the server. Not counted in your Stacy rating.' : MP.txt('ratedNote') };
  };

  /* ---------- small UI helpers ---------- */
  function card(inner, cls) { return '<section class="card mp-card ' + (cls || '') + '">' + inner + '</section>'; }
  function head(title, sub) { return App.ui && App.ui.head ? App.ui.head({ eyebrow: 'Play', title: title, sub: sub }) : '<h1>' + title + '</h1>'; }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn._l = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Working…'; } else { btn.disabled = false; if (btn._l != null) btn.innerHTML = btn._l; } }
  function setErr(el, msg) { if (el) { el.textContent = msg || ''; el.hidden = !msg; } }
  function tcLabel(tc) { return tc ? (tc.baseMs / 60000) + '+' + (tc.incMs / 1000) : ''; }
  MP.fmt = function (ms) { var t = Math.max(0, ms) / 1000; if (t < 10) return '0:0' + (Math.floor(t * 10) / 10).toFixed(1); t = Math.ceil(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  MP.rulesHTML = function () { return '<ol class="mp-rules">' + MP.RULES.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>'; };
  MP.showCodes = function (codes, title, done) {
    var txt = 'Stacy Chess Multiplayer recovery codes for ' + ((MP.state.me && MP.state.me.username) || '') + '\nEach code works once. Keep them private.\n\n' + codes.join('\n') + '\n';
    var sh = App.sheet('<h3>' + esc(title || 'Save your recovery codes') + '</h3><p class="small">There is no email reset. If you forget your password, one of these codes is the only way back in. Each works once. They are shown only now.</p>' +
      '<div class="mp-codes" id="mpCodes">' + codes.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join('') + '</div>' +
      '<div class="btn-row"><button class="btn sm" id="mpCopyCodes">~i:clipboard~ Copy</button><button class="btn sm" id="mpDlCodes">~i:download~ Save as file</button></div>' +
      '<label class="row small mp-check"><input type="checkbox" id="mpSaved"> I saved these codes somewhere safe</label><div class="btn-row"><button class="btn primary" id="mpCodesDone" disabled>Continue</button></div>', { modal: true });
    sh.el.querySelector('#mpCopyCodes').onclick = function () { App.copy(txt, 'Recovery codes'); };
    sh.el.querySelector('#mpDlCodes').onclick = function () { try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'stacy-recovery-codes.txt'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { App.toast('Could not save a file here; use Copy.', 'err'); } };
    var ck = sh.el.querySelector('#mpSaved'), go = sh.el.querySelector('#mpCodesDone');
    ck.onchange = function () { go.disabled = !ck.checked; };
    go.onclick = function () { sh.close(); done && done(); };
    return sh;
  };

  /* ---------- hub ---------- */
  App.register('multiplayer', {
    title: 'Multiplayer', back: 'playhub', nav: 'playhub',
    render: function (el) {
      el.innerHTML = head('Multiplayer', MP.txt('hubSub'));
      var body = App.html('<div class="mp-hub" id="mpHub"></div>'); el.appendChild(body);
      if (!MP.configured() && !MP._testBackend) {
        body.innerHTML = card('<div class="mp-off"><span class="tool-ic" aria-hidden="true">~i:users~</span><div><h2>Multiplayer not set up yet</h2><p class="small">Multiplayer needs Stacy’s online server, and it hasn’t been switched on yet. Everything else works as usual, and your progress stays on this device.</p></div></div>', 'mp-notsetup');
        return;
      }
      body.innerHTML = '<p class="small muted" id="mpLoading">Connecting to Multiplayer…</p>';
      var my = MP._hubSeq = (MP._hubSeq || 0) + 1;
      MP.ensure().then(function () { if (my !== MP._hubSeq) return; MP.state.me ? hubIn(body) : hubOut(body, 'signin'); })
        .catch(function (e) { if (my !== MP._hubSeq) return; body.innerHTML = card('<h2>Multiplayer unavailable</h2><p class="small" id="mpErr">' + esc(friendly(e)) + '</p><div class="btn-row"><button class="btn" id="mpRetry">Try again</button></div>', 'mp-error'); body.querySelector('#mpRetry').onclick = function () { App.route(); }; });
    }
  });
  function hubOut(body, mode) {
    var tabs = '<div class="seg block mp-tabs" role="tablist"><button type="button" role="tab" data-m="signin" class="' + (mode === 'signin' ? 'on' : '') + '">Sign in</button><button type="button" role="tab" data-m="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>';
    var f;
    if (mode === 'signin') f = '<form id="mpForm" class="col mp-form" autocomplete="on"><label>Username<input class="input" id="mpUser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required></label><label>Password<input class="input" id="mpPass" type="password" name="password" autocomplete="current-password" maxlength="128" required></label><p class="alert err small" id="mpFormErr" hidden></p><button class="btn primary" id="mpSubmit" type="submit">Sign in</button><button class="btn ghost sm" type="button" id="mpForgot">Forgot password? Use a recovery code</button></form>';
    else if (mode === 'signup') f = '<form id="mpForm" class="col mp-form" autocomplete="on"><label>Username<input class="input" id="mpUser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required></label><p class="tiny muted" id="mpNameInfo">3–20 letters, digits or _, starting with a letter. Shown publicly.</p><div class="chips" id="mpSuggest"></div><label>Password<input class="input" id="mpPass" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Repeat password<input class="input" id="mpPass2" type="password" autocomplete="new-password" maxlength="128" required></label><p class="tiny muted" id="mpSignupNote">' + esc(MP.txt('signupNote')) + '</p><p class="alert err small" id="mpFormErr" hidden></p><button class="btn primary" id="mpSubmit" type="submit">Create account</button></form>';
    else f = '<form id="mpForm" class="col mp-form"><p class="small">Enter your username, one unused recovery code and a new password.</p><label>Username<input class="input" id="mpUser" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required></label><label>Recovery code<input class="input mono" id="mpCode" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="14" placeholder="XXXXX-XXXXX" required></label><label>New password<input class="input" id="mpPass" type="password" autocomplete="new-password" maxlength="128" required></label><label>Repeat new password<input class="input" id="mpPass2" type="password" autocomplete="new-password" maxlength="128" required></label><p class="alert err small" id="mpFormErr" hidden></p><button class="btn primary" id="mpSubmit" type="submit">Reset password and sign in</button><button class="btn ghost sm" type="button" id="mpBack">Back to sign in</button></form>';
    body.innerHTML = card((mode === 'recover' ? '<h2>Recover your account</h2>' : tabs) + f) + card('<h3>Fair play</h3>' + MP.rulesHTML(), 'mp-rules-card') +
      '<p class="tiny muted mp-privacy">' + esc(MP.txt('privacy')) + '</p>';
    [].forEach.call(body.querySelectorAll('.mp-tabs button'), function (b) { b.onclick = function () { hubOut(body, b.dataset.m); }; });
    var form = body.querySelector('#mpForm'), err = body.querySelector('#mpFormErr'), btn = body.querySelector('#mpSubmit'), user = body.querySelector('#mpUser');
    var fg = body.querySelector('#mpForgot'); if (fg && MP.free()) fg.textContent = 'Forgot password?';
    if (fg) fg.onclick = function () { if (MP.free()) { App.sheet('<h3>Forgot your password?</h3><p class="small" id="mpNoReset">Free Multiplayer has no password reset: without a server nobody can prove a reset request is really you. If the password is lost, that Multiplayer account is lost.</p><p class="small">Your lessons, ratings and local games are <b>not</b> affected. You can create a new Multiplayer account with a different username. Tip: check your phone’s saved passwords first.</p>'); return; } hubOut(body, 'recover'); };
    var bk = body.querySelector('#mpBack'); if (bk) bk.onclick = function () { hubOut(body, 'signin'); };
    if (mode === 'signup') {
      var info = body.querySelector('#mpNameInfo'), sug = body.querySelector('#mpSuggest'), timer = null, seq = 0;
      user.oninput = function () {
        clearTimeout(timer); sug.innerHTML = ''; var v = user.value.trim(); if (!v) return;
        timer = setTimeout(function () { var my = ++seq; MP.checkName(v).then(function (r) { if (my !== seq) return;
          info.textContent = !r.valid ? r.reason : r.available ? v + ' is available.' : v + ' is taken.';
          sug.innerHTML = (r.suggestions || []).map(function (s) { return '<button type="button" class="chip" data-s="' + esc(s) + '">' + esc(s) + '</button>'; }).join('');
          [].forEach.call(sug.querySelectorAll('[data-s]'), function (c) { c.onclick = function () { user.value = c.dataset.s; user.oninput(); }; });
        }).catch(function (e) { if (my === seq) info.textContent = friendly(e); }); }, 450);
      };
    }
    form.onsubmit = function (e) {
      e.preventDefault(); setErr(err, '');
      var u = user.value.trim(), p = body.querySelector('#mpPass').value, p2 = body.querySelector('#mpPass2');
      if (p2 && p2.value !== p) { setErr(err, 'The passwords do not match.'); return; }
      busy(btn, true);
      var job = mode === 'signin' ? MP.login(u, p) : mode === 'signup' ? MP.signup(u, p) : MP.recover(u, body.querySelector('#mpCode').value, p);
      job.then(function (r) {
        busy(btn, false);
        if (mode === 'signup') { if (r.recoveryCodes && r.recoveryCodes.length) MP.showCodes(r.recoveryCodes, 'Save your recovery codes', function () { App.route(); }); else MP.noResetSheet(function () { App.route(); }); }
        else { if (mode === 'recover') App.toast('Password reset. ' + r.remainingCodes + ' recovery code' + (r.remainingCodes === 1 ? '' : 's') + ' left.', 'ok'); App.route(); }
      }).catch(function (x) {
        busy(btn, false); var m = friendly(x), d = x && x.details;
        if (d && d.suggestions && d.suggestions.length) m += ' Try: ' + d.suggestions.join(', ') + '.';
        setErr(err, m);
      });
    };
  }
  function hubIn(body) {
    var me = MP.state.me;
    body.innerHTML = '<div class="mp-me row">' + MP.avatar(me.avatar) + '<div class="grow"><b>' + esc(me.username) + '</b><div class="tiny muted">' + me.stats.games + ' games · ' + me.stats.wins + ' W · ' + me.stats.draws + ' D · ' + me.stats.losses + ' L</div></div><button class="btn sm" data-go="mp-player/' + esc(me.uid) + '">Profile</button></div>' +
      '<div id="mpResume"></div>' +
      card('<h2>Play a friend</h2><p class="small muted">Create a private room and send your friend the code.</p><div class="chips mp-tc" role="radiogroup" aria-label="Time control">' + MP.TCS.map(function (t, i) { return '<button type="button" class="chip' + (i === 3 ? ' on' : '') + '" role="radio" aria-checked="' + (i === 3) + '" data-tc="' + i + '">' + t[0] + '+' + t[1] + '</button>'; }).join('') + '</div>' +
        '<div class="seg block mp-color" role="radiogroup" aria-label="Your colour"><button type="button" class="on" data-c="random">Random</button><button type="button" data-c="w">White</button><button type="button" data-c="b">Black</button></div><p class="alert err small" id="mpCreateErr" hidden></p><button class="btn primary" id="mpCreate">~i:users~ Create room</button>') +
      card('<h2>Join a friend</h2><form class="row mp-join" id="mpJoinForm"><input class="input mono" id="mpJoinCode" maxlength="7" placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Room code"><button class="btn" id="mpJoin" type="submit">Join</button></form><p class="alert err small" id="mpJoinErr" hidden></p>') +
      card('<h2>Find players</h2><form class="row" id="mpSearchForm"><input class="input" id="mpSearch" placeholder="Username" autocapitalize="none" spellcheck="false" maxlength="20" aria-label="Search players"><button class="btn" type="submit">Search</button></form><div class="col" id="mpResults"></div>') +
      '<div class="btn-row mp-foot"><button class="btn sm ghost" id="mpRules">Fair-play rules</button><button class="btn sm ghost" id="mpOut">Sign out</button></div>';
    var tc = 3, color = 'random';
    [].forEach.call(body.querySelectorAll('[data-tc]'), function (b) { b.onclick = function () { tc = +b.dataset.tc; [].forEach.call(body.querySelectorAll('[data-tc]'), function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); }; });
    [].forEach.call(body.querySelectorAll('[data-c]'), function (b) { b.onclick = function () { color = b.dataset.c; [].forEach.call(body.querySelectorAll('[data-c]'), function (x) { x.classList.toggle('on', x === b); }); }; });
    [].forEach.call(body.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { App.go(b.dataset.go); }; });
    body.querySelector('#mpCreate').onclick = function () {
      var b = this, e = body.querySelector('#mpCreateErr'); setErr(e, ''); busy(b, true, 'Creating…');
      MP.call('mpGame', { op: 'create', tc: { baseMin: MP.TCS[tc][0], incSec: MP.TCS[tc][1] }, color: color }).then(function (r) { App.go('mp-room/' + r.roomId); })
        .catch(function (x) { busy(b, false); if (x && x.details && x.details.roomId) { App.go('mp-room/' + x.details.roomId); return; } setErr(e, friendly(x)); });
    };
    body.querySelector('#mpJoinForm').onsubmit = function (ev) {
      ev.preventDefault(); var b = body.querySelector('#mpJoin'), e = body.querySelector('#mpJoinErr'), code = body.querySelector('#mpJoinCode').value; setErr(e, '');
      if (!code.replace(/[^a-z0-9]/gi, '')) { setErr(e, 'Type the code your friend sent.'); return; }
      busy(b, true, 'Joining…');
      MP.call('mpGame', { op: 'join', code: code }).then(function (r) { App.go('mp-room/' + r.roomId); }).catch(function (x) { busy(b, false); if (x && x.details && x.details.roomId) { App.go('mp-room/' + x.details.roomId); return; } setErr(e, friendly(x)); });
    };
    body.querySelector('#mpSearchForm').onsubmit = function (ev) {
      ev.preventDefault(); var q = body.querySelector('#mpSearch').value.trim(), out = body.querySelector('#mpResults');
      if (!q) return; out.innerHTML = '<p class="tiny muted">Searching…</p>';
      MP.backend.search(q).then(function (list) {
        out.innerHTML = list.length ? '' : '<p class="tiny muted">No public player starts with “' + esc(q) + '”.</p>';
        list.forEach(function (p) { var b = App.html('<button type="button" class="list-item mp-person">' + MP.avatar(p.avatar) + '<div class="grow" style="text-align:left"><b class="small">' + esc(p.username) + '</b><div class="tiny muted">' + ((p.stats && p.stats.games) || 0) + ' games</div></div><span class="ic">~i:next~</span></button>'); b.onclick = function () { App.go('mp-player/' + p.uid); }; out.appendChild(b); });
      }).catch(function (x) { out.innerHTML = '<p class="alert err small">' + esc(friendly(x)) + '</p>'; });
    };
    body.querySelector('#mpRules').onclick = function () { App.sheet('<h3>Fair-play rules</h3>' + MP.rulesHTML()); };
    body.querySelector('#mpOut').onclick = function () { MP.logout().then(function () { App.route(); }); };
    MP.backend.openRooms(me.uid).then(function (rs) {
      var r = rs.filter(function (x) { return x.status !== 'waiting' || x.hostUid === me.uid; })[0], host = body.querySelector('#mpResume'); if (!r || !host) return;
      host.innerHTML = '<button type="button" class="tool-row mp-resume" id="mpResumeBtn"><span class="tool-ic" aria-hidden="true">~i:play~</span><span class="tool-text"><b>' + (r.status === 'active' ? 'Return to your game' : r.status === 'rules' ? 'Your game is waiting for the rules' : 'Your room is open') + '</b><small>' + tcLabel(r.tc) + (r.status === 'waiting' ? ' · code ' + esc(r.code) : '') + '</small></span><span class="chev" aria-hidden="true">›</span></button>';
      host.querySelector('#mpResumeBtn').onclick = function () { App.go('mp-room/' + r.roomId); };
    }).catch(function () { });
  }

  /* ---------- room / live game ---------- */
  App.register('mp-room', {
    title: 'Multiplayer', back: 'multiplayer', nav: 'playhub',
    render: function (el, p) {
      var roomId = p[0], dead = false, unsub = null, room = null, me = null, st = null, pending = null, premove = null, beatT = null, tickT = null, seqBase = Date.now(), lastSync = 0, saved = false, autoT = null, rematchAsked = false, statusShown = '';
      el.innerHTML = '<div class="mp-room" id="mpRoom"><p class="small muted">Opening the room…</p></div>';
      var host = el.querySelector('#mpRoom');
      function call(op, d) { return MP.call('mpGame', Object.assign({ op: op, roomId: roomId }, d || {})); }
      function beat() { if (dead || !room || ['rules', 'active'].indexOf(room.status) < 0) return; var vis = document.visibilityState !== 'hidden'; seqBase = Math.max(seqBase + 1, Date.now()); call('heartbeat', { visible: vis, seq: seqBase }).catch(function () { }); }
      function onVis() { beat(); }
      function onHide() { if (!room || room.status !== 'active') return; seqBase = Math.max(seqBase + 1, Date.now()); try { call('heartbeat', { visible: false, seq: seqBase }); } catch (e) { } }
      document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', onHide);
      function cleanup() { dead = true; if (unsub) unsub(); clearInterval(beatT); clearInterval(tickT); clearTimeout(autoT); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); }
      App.screens['mp-room'].leave = function () { cleanup(); if (!room || room.status !== 'active') MP.setLive(null); };
      MP.ensure().then(function () {
        if (!MP.state.me) { App.go('multiplayer'); return; }
        unsub = MP.backend.watchRoom(roomId, function (r) { if (dead) return; if (!r) { host.innerHTML = card('<h2>Room not found</h2><button class="btn" data-go="multiplayer">Back</button>'); wireGo(); return; } room = r; me = r.players && r.players.w && r.players.w.uid === MP.state.me.uid ? 'w' : r.players && r.players.b && r.players.b.uid === MP.state.me.uid ? 'b' : null; draw(); },
          function (e) { if (!dead) host.innerHTML = card('<h2>Can’t open this room</h2><p class="small">' + esc(friendly(e)) + '</p><button class="btn" data-go="multiplayer">Back</button>'); wireGo(); });
        beatT = setInterval(beat, MP.beatMs ? MP.beatMs() : 5000);
        tickT = setInterval(tick, 200);
      }).catch(function (e) { host.innerHTML = card('<h2>Multiplayer unavailable</h2><p class="small">' + esc(e.notSetUp ? 'Multiplayer is not set up yet.' : friendly(e)) + '</p>'); });
      function wireGo() { [].forEach.call(host.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { App.go(b.dataset.go); }; }); }
      function draw() {
        var s = room.status;
        if (s !== 'active') { st = null; }
        if (s === 'active') { MP.setLive(roomId); return drawGame(); }
        if (s === 'finished') return drawFinished();
        MP.setLive(null);
        if (statusShown === s + room.v) return; statusShown = s + room.v;
        if (s === 'waiting') {
          host.innerHTML = card('<h2>Room open</h2><p class="small">Send this code to your friend. It works once and expires in 30 minutes.</p><div class="mp-code" id="mpCode" aria-label="Room code">' + esc(room.code) + '</div><p class="tiny muted">' + tcLabel(room.tc) + ' · you play ' + (room.colorPref === 'random' ? 'a random colour' : room.colorPref === 'w' ? 'White' : 'Black') + '</p><div class="btn-row"><button class="btn primary" id="mpCopy">~i:clipboard~ Copy code</button><button class="btn" id="mpCancel">Cancel room</button></div><p class="tiny muted" aria-live="polite">Waiting for your friend to join…</p>');
          host.querySelector('#mpCopy').onclick = function () { App.copy(room.code, 'Room code'); };
          host.querySelector('#mpCancel').onclick = function () { call('leave').then(function () { App.go('multiplayer'); }).catch(function (e) { App.toast(friendly(e), 'err'); }); };
        } else if (s === 'rules') {
          var mine = room.accepted && room.accepted[MP.state.me.uid], opp = room.players[other(me)];
          host.innerHTML = card('<h2>Fair-play rules</h2><p class="small">You play <b>' + (me === 'w' ? 'White' : 'Black') + '</b> against <b>' + esc(opp.name) + '</b> · ' + tcLabel(room.tc) + '. Both players must accept before the game starts.</p>' + MP.rulesHTML() +
            '<p class="alert err small" id="mpRulesErr" hidden></p><div class="btn-row">' + (mine ? '<p class="small" id="mpAccepted" aria-live="polite"><b>Accepted.</b> Waiting for ' + esc(opp.name) + '…</p>' : '<button class="btn primary" id="mpAccept">I accept the rules</button>') + '<button class="btn" id="mpLeave">Leave</button></div><p class="tiny muted">The rules must be accepted within 2 minutes.</p>');
          var a = host.querySelector('#mpAccept'); if (a) a.onclick = function () { busy(a, true); call('accept', { rulesVersion: RULES_VERSION }).catch(function (e) { busy(a, false); setErr(host.querySelector('#mpRulesErr'), friendly(e)); }); };
          host.querySelector('#mpLeave').onclick = function () { call('leave').then(function () { App.go('multiplayer'); }).catch(function (e) { App.toast(friendly(e), 'err'); }); };
        } else if (s === 'cancelled') {
          host.innerHTML = card('<h2>Room closed</h2><p class="small">' + esc((room.result && room.result.why) || 'This room is closed.') + '. Nothing was recorded.</p><button class="btn primary" data-go="multiplayer">Back to Multiplayer</button>'); wireGo();
        }
      }
      function localGame() { var g = new Chess(); (room.moves || []).forEach(function (u) { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }); return g; }
      function drawGame() {
        if (!st) {
          statusShown = '';
          host.innerHTML = '';
          st = App.stage(host, { orientation: me, maxBubbles: 1, compactCoach: true });
          st.coach.el.hidden = true; st.coach.say = function () { }; // no coach during a live game
          st.el.classList.add('mp-stage');
          var opp = room.players[other(me)], mine = room.players[me];
          st.top.appendChild(App.html('<div class="row grow mp-player">' + MP.avatar(opp.avatar, 'sm') + '<b class="small">' + esc(opp.name) + '</b><span class="tiny muted" id="mpOppState" aria-live="polite"></span><span class="grow"></span><span class="clock" id="ck-opp"></span></div>'));
          st.bottom.appendChild(App.html('<div class="row grow mp-player">' + MP.avatar(mine.avatar, 'sm') + '<b class="small">' + esc(mine.name) + '</b><span class="tiny muted" id="mpMyState"></span><span class="grow"></span><span class="clock" id="ck-me"></span></div>'));
          st.banner = App.html('<div class="mp-banner" id="mpBanner" aria-live="assertive" hidden></div>'); st.dock.insertBefore(st.banner, st.dock.firstChild);
          st.button('~i:flag~ Resign', function () { var sh = App.sheet('<h3>Resign this game?</h3><div class="btn-row"><button class="btn primary" id="mpYes">Resign</button><button class="btn" id="mpNo">Keep playing</button></div>'); sh.el.querySelector('#mpYes').onclick = function () { sh.close(); call('resign').catch(function (e) { App.toast(friendly(e), 'err'); }); }; sh.el.querySelector('#mpNo').onclick = function () { sh.close(); }; });
          st.drawBtn = st.button('~i:handshake~ Offer draw', function () { call('draw', { action: 'offer' }).then(function () { App.toast('Draw offered', 'ok'); }).catch(function (e) { App.toast(friendly(e), 'err'); }); });
          st.button('⇅ Flip', function () { st.board.flip(); });
          st.onUserMove = function (from, to, promo) {
            if (!room || room.status !== 'active' || MP.serverNow() < room.startAt) return false;
            if (st.game.turn() !== me || pending) { premove = { from: from, to: to, promo: promo }; st.board.setMarks && st.board.setMarks((function () { var m = {}; m[from] = 'pre'; m[to] = 'pre'; return m; })()); return false; }
            var mv = st.game.move({ from: from, to: to, promotion: promo }); if (!mv) return false;
            var uci = from + to + (mv.promotion || ''); pending = { ply: room.ply, uci: uci };
            st.sync(true, mv); App.moveSound && App.moveSound(mv, st.game);
            call('move', { ply: pending.ply, uci: uci }).then(function (r) { if (r && r.applied === false) resync(); }).catch(function (e) { App.toast(friendly(e), 'err'); pending = null; resync(); });
            return true;
          };
        }
        // board follows the server's move list; an unconfirmed own move stays shown until the server answers
        if (pending && room.ply > pending.ply) pending = null;
        if (!pending && st.game.history().length !== room.moves.length) { var prev = st.game.history().length; st.game = localGame(); st.sync(room.moves.length === prev + 1); if (room.moves.length === prev + 1 && App.moveSound) { var h = st.game.history({ verbose: true }); App.moveSound(h[h.length - 1], st.game); } }
        st.input = true;
        if (premove && !pending && st.game.turn() === me) { var pm = premove; premove = null; st.board.setMarks && st.board.setMarks({}); if (!st.onUserMove(pm.from, pm.to, pm.promo)) App.toast('Premove was not legal', 'err'); }
        var offer = room.drawOffer, b = st.banner;
        if (offer && offer !== me) {
          b.hidden = false; b.innerHTML = '<b>' + esc(room.players[offer].name) + ' offers a draw.</b> <button class="btn sm primary" id="mpDrawYes">Accept</button><button class="btn sm" id="mpDrawNo">Decline</button>';
          var v = room.v; b.querySelector('#mpDrawYes').onclick = function () { call('draw', { action: 'accept', v: v }).catch(function (e) { App.toast(friendly(e), 'err'); }); };
          b.querySelector('#mpDrawNo').onclick = function () { call('draw', { action: 'decline', v: v }).catch(function (e) { App.toast(friendly(e), 'err'); }); };
        } else if (offer === me) { b.hidden = false; b.innerHTML = 'Draw offered. Waiting for an answer…'; }
        else if (!b.dataset.keep) { b.hidden = true; b.innerHTML = ''; }
        tick();
      }
      function resync() { if (!st || !room) return; st.game = localGame(); st.sync(false); }
      function tick() {
        if (!room || room.status !== 'active' || !st) return;
        var now = MP.serverNow(), started = now >= room.startAt, t = room.turn, start = Math.max(room.turnStartedAt, room.startAt);
        var left = function (c) { return c === t && started ? room.clock[c] - (now - start) : room.clock[c]; };
        var cm = el.querySelector('#ck-me'), co = el.querySelector('#ck-opp');
        if (cm) { cm.textContent = MP.fmt(left(me)); cm.classList.toggle('active', started && t === me); cm.classList.toggle('low', left(me) < 20000); }
        if (co) { co.textContent = MP.fmt(left(other(me))); co.classList.toggle('active', started && t !== me); }
        var b = st.banner;
        if (!started) { b.hidden = false; b.dataset.keep = '1'; b.innerHTML = '<b>Game starts in ' + Math.ceil((room.startAt - now) / 1000) + '</b> · stay on this screen. The engine and coach are off.'; }
        else if (b.dataset.keep) { delete b.dataset.keep; b.hidden = true; b.innerHTML = ''; }
        var oppUid = room.players[other(me)].uid, pr = (room.presence || {})[oppUid] || {}, os = el.querySelector('#mpOppState'), msg = '', due = Infinity;
        if (pr.hiddenSince != null) { due = Math.max(pr.hiddenSince, room.startAt) + 30000; msg = 'left the game screen · forfeits in ' + Math.max(0, Math.ceil((due - now) / 1000)) + ' s'; }
        else if (pr.lastSeen && now - pr.lastSeen > 12000) { due = Math.max(pr.lastSeen, room.startAt) + 35000; msg = 'not responding · forfeits in ' + Math.max(0, Math.ceil((due - now) / 1000)) + ' s'; }
        if (os) os.textContent = msg;
        var flagDue = started ? start + room.clock[t] : Infinity;
        // ask the server to decide as soon as a deadline has passed (the server re-checks everything)
        if ((now > due + 300 || now > flagDue + 300) && Date.now() - lastSync > 2000) { lastSync = Date.now(); call('sync').catch(function () { }); }
      }
      function drawFinished() {
        MP.setLive(null);
        var r = room.result, aborted = r.reason === 'aborted', head = r.winner == null ? (aborted ? 'Game aborted' : 'Draw') : r.winner === me ? 'You won' : room.players[r.winner].name + ' won';
        if (!aborted && me && !saved) { saved = true; MP.saveGame(MP.recordFromRoom(room, me)); }
        if (room.rematchRoom && rematchAsked) { App.go('mp-room/' + room.rematchRoom); return; }
        var key = 'fin' + room.v; if (statusShown === key) return; statusShown = key;
        if (st) { st.input = false; }
        var box = App.html(card('<h2 id="mpResult">' + esc(head) + '</h2><p class="small">' + esc(r.why) + (aborted ? '. Nothing was recorded.' : '. ' + MP.txt('verified')) + '</p><div class="btn-row">' + (aborted ? '' : '<button class="btn primary" id="mpToResults">~i:chart~ Results &amp; Game Review</button>') +
          '<button class="btn" id="mpRematch">~i:repeat~ Rematch</button><button class="btn ghost" data-go="multiplayer">Multiplayer</button></div><p class="tiny muted" id="mpRematchInfo" aria-live="polite">' + (room.rematchRoom ? 'Rematch room ready.' : room.rematch && room.rematch[room.players[me].uid] ? 'Rematch requested. Waiting for your opponent…' : room.rematch && room.rematch[room.players[other(me)].uid] ? room.players[other(me)].name + ' wants a rematch.' : '') + '</p>', 'mp-final'));
        if (st && st.dock) { var old = st.dock.querySelector('.mp-final'); if (old) old.remove(); st.dock.insertBefore(box, st.dock.firstChild); } else { host.innerHTML = ''; host.appendChild(box); }
        var tr = box.querySelector('#mpToResults'); if (tr) tr.onclick = function () { App.go('results/mp_' + roomId); };
        if (room.rematch && room.rematch[room.players[me].uid] && !room.rematchRoom) { rematchAsked = true; box.querySelector('#mpRematch').disabled = true; }
        box.querySelector('#mpRematch').onclick = function () { var b = this; rematchAsked = true; busy(b, true, 'Asking…'); MP.call('mpGame', { op: 'rematch', roomId: roomId }).then(function (x) { if (x.rematch) App.go('mp-room/' + x.roomId); else { busy(b, false); b.disabled = true; box.querySelector('#mpRematchInfo').textContent = 'Rematch requested. Waiting for your opponent…'; } }).catch(function (e) { busy(b, false); App.toast(friendly(e), 'err'); }); };
        [].forEach.call(box.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { App.go(b.dataset.go); }; });
        clearTimeout(autoT);
        if (!aborted && !MP._noAutoResults) autoT = setTimeout(function () { if (!dead && location.hash === '#/mp-room/' + roomId && !rematchAsked) App.go('results/mp_' + roomId); }, 4000);
      }
    }
  });

  /* ---------- profiles ---------- */
  App.register('mp-player', {
    title: 'Player', back: 'multiplayer', nav: 'playhub',
    render: function (el, p) {
      var uid = p[0]; el.innerHTML = '<div id="mpProf"><p class="small muted">Loading…</p></div>'; var box = el.querySelector('#mpProf');
      MP.ensure().then(function () {
        if (!MP.state.me) { App.go('multiplayer'); return; }
        var mine = uid === MP.state.me.uid;
        return Promise.all([MP.backend.profile(uid), MP.backend.history(uid, 30)]).then(function (x) {
          var pr = x[0], hist = x[1]; if (!pr) { box.innerHTML = card('<h2>Player not found</h2><p class="small">This profile is private or no longer exists.</p>'); return; }
          box.innerHTML = '<div class="mp-prof-head row">' + MP.avatar(pr.avatar, 'lg') + '<div class="grow"><h1 class="scr-title">' + esc(pr.username) + '</h1><div class="small muted">' + pr.stats.games + ' games · ' + pr.stats.wins + ' W · ' + pr.stats.draws + ' D · ' + pr.stats.losses + ' L' + (pr.visibility === 'private' ? ' · private profile' : '') + '</div></div></div>' +
            '<p class="tiny muted">' + esc(MP.txt('history')) + '</p><div class="col" id="mpHist">' + (hist.length ? '' : '<p class="small muted">No Multiplayer games yet.</p>') + '</div>' + (mine ? '<div id="mpSettings"></div>' : '');
          var hl = box.querySelector('#mpHist');
          hist.forEach(function (h) {
            var it = App.html('<div class="list-item mp-game"><span class="mp-res ' + h.outcome + '">' + (h.outcome === 'win' ? 'W' : h.outcome === 'loss' ? 'L' : 'D') + '</span><div class="grow"><b class="small">vs ' + esc(h.oppName) + '</b><div class="tiny muted">' + esc(h.why) + ' · ' + tcLabel(h.tc) + ' · ' + new Date(h.endedAt).toLocaleDateString() + '</div></div>' + (mine ? '<button class="btn sm" data-r="1">Review</button>' : '') + '</div>');
            var rb = it.querySelector('[data-r]'); if (rb) rb.onclick = function () { var rec = MP.importHistory(h); MP.saveGame(rec); App.go('results/' + rec.id); };
            hl.appendChild(it);
          });
          if (mine) settings(box.querySelector('#mpSettings'), pr);
        });
      }).catch(function (e) { box.innerHTML = card('<h2>Can’t load this profile</h2><p class="small">' + esc(e.notSetUp ? 'Multiplayer is not set up yet.' : friendly(e)) + '</p>'); });
    }
  });
  function settings(host, pr) {
    host.innerHTML = card('<h2>Avatar</h2><div class="mp-avatars" role="radiogroup" aria-label="Avatar">' + MP.AVATARS.map(function (a) { return '<button type="button" class="mp-av-btn' + (a === pr.avatar ? ' on' : '') + '" role="radio" aria-checked="' + (a === pr.avatar) + '" data-a="' + a + '">' + MP.avatar(a) + '</button>'; }).join('') + '</div>') +
      card('<h2>Profile visibility</h2><div class="seg block" role="radiogroup"><button type="button" data-v="public" class="' + (pr.visibility === 'public' ? 'on' : '') + '">Public</button><button type="button" data-v="private" class="' + (pr.visibility === 'private' ? 'on' : '') + '">Private</button></div><p class="tiny muted">' + esc(MP.txt('visibility')) + '</p>') +
      card('<h2>Account</h2><div class="col"><button class="btn" id="mpPw">Change password</button>' + (MP.free() ? '' : '<button class="btn" id="mpCodesNew">New recovery codes</button>') + '<button class="btn" id="mpSignOut">Sign out</button><button class="btn danger" id="mpDelete">~i:trash~ Delete Multiplayer account</button></div><p class="tiny muted">Deleting removes your profile and history, frees your username and ends any open game. Your local progress in this app is not affected.' + (MP.free() ? ' There is no password reset in free Multiplayer.' : '') + '</p>');
    function upd(d, done) { MP.call('mpProfile', Object.assign({ op: 'update' }, d)).then(function () { return MP.refreshMe(); }).then(function () { done && done(); App.toast('Saved', 'ok'); }).catch(function (e) { App.toast(friendly(e), 'err'); }); }
    [].forEach.call(host.querySelectorAll('[data-a]'), function (b) { b.onclick = function () { upd({ avatar: b.dataset.a }, function () { App.route(); }); }; });
    [].forEach.call(host.querySelectorAll('[data-v]'), function (b) { b.onclick = function () { upd({ visibility: b.dataset.v }, function () { App.route(); }); }; });
    host.querySelector('#mpSignOut').onclick = function () { MP.logout().then(function () { App.go('multiplayer'); }); };
    host.querySelector('#mpPw').onclick = function () {
      var sh = App.sheet('<h3>Change password</h3><form class="col" id="f"><input type="text" name="username" autocomplete="username" value="' + esc(pr.username) + '" hidden><label>Current password<input class="input" type="password" id="o" autocomplete="current-password" required></label><label>New password<input class="input" type="password" id="n" autocomplete="new-password" minlength="8" required></label><label>Repeat new password<input class="input" type="password" id="n2" autocomplete="new-password" required></label><p class="alert err small" id="e" hidden></p><button class="btn primary" type="submit">Change password</button></form>');
      sh.el.querySelector('#f').onsubmit = function (ev) { ev.preventDefault(); var n = sh.el.querySelector('#n').value; if (n !== sh.el.querySelector('#n2').value) { setErr(sh.el.querySelector('#e'), 'The passwords do not match.'); return; }
        MP.call('mpAccount', { op: 'changePassword', oldPassword: sh.el.querySelector('#o').value, newPassword: n }).then(function (r) { return MP.backend.signIn(r.token); }).then(function () { sh.close(); App.toast(MP.free() ? 'Password changed. Other devices may need to sign in again.' : 'Password changed. Other devices are signed out.', 'ok'); }).catch(function (e) { setErr(sh.el.querySelector('#e'), friendly(e)); }); };
    };
    if (host.querySelector('#mpCodesNew')) host.querySelector('#mpCodesNew').onclick = function () {
      var sh = App.sheet('<h3>New recovery codes</h3><p class="small">Your old codes stop working.</p><form class="col" id="f"><label>Password<input class="input" type="password" id="o" autocomplete="current-password" required></label><p class="alert err small" id="e" hidden></p><button class="btn primary" type="submit">Make new codes</button></form>');
      sh.el.querySelector('#f').onsubmit = function (ev) { ev.preventDefault(); MP.call('mpAccount', { op: 'newRecoveryCodes', password: sh.el.querySelector('#o').value }).then(function (r) { sh.close(); MP.showCodes(r.recoveryCodes, 'Your new recovery codes'); }).catch(function (e) { setErr(sh.el.querySelector('#e'), friendly(e)); }); };
    };
    host.querySelector('#mpDelete').onclick = function () {
      var sh = App.sheet('<h3>Delete your Multiplayer account?</h3><p class="small">This cannot be undone. Your username becomes free for someone else, who would be a different account.</p><form class="col" id="f"><label>Type your username to confirm<input class="input" id="u" autocapitalize="none" autocomplete="off" required></label><label>Password<input class="input" type="password" id="o" autocomplete="current-password" required></label><p class="alert err small" id="e" hidden></p><button class="btn danger" type="submit">Delete account</button></form>');
      sh.el.querySelector('#f').onsubmit = function (ev) { ev.preventDefault(); if (sh.el.querySelector('#u').value.trim().toLowerCase() !== pr.username.toLowerCase()) { setErr(sh.el.querySelector('#e'), 'The username does not match.'); return; }
        MP.call('mpAccount', { op: 'deleteAccount', password: sh.el.querySelector('#o').value }).then(function () { return MP.logout(); }).then(function () { sh.close(); App.toast('Multiplayer account deleted', 'ok'); App.go('multiplayer'); }).catch(function (e) { setErr(sh.el.querySelector('#e'), friendly(e)); }); };
    };
  }
})();
