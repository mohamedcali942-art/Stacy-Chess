/* Stacy Chess - shared engine service (v9).
   One bundled engine for everything: Stockfish 19 Lite, single-threaded WASM (stockfish.js 19.0.1,
   GPLv3, files in engine/). Single-threaded means no SharedArrayBuffer, so no COOP/COEP headers are
   needed: any plain static HTTP server works (Koder's preview server, GitHub Pages, python -m http.server).
   Nothing is fetched from a CDN. If the worker cannot start (file://, no WebAssembly, very old browser)
   the app falls back to "Stacy Lite", a tiny built-in search. Its results are marked fallback/limited,
   and Game Review never grades moves from them.

   Service features shared by play, coaching, trainers, review and analysis:
   - priority queue: play (bot moves) > interactive (coach/hints/trainers) > background (post-game review).
     A play/interactive request pre-empts a running background search, which is re-queued and restarted.
   - owners: Engine.cancel(owner) cancels only that caller's jobs; Engine.cancelAll() cancels everything.
   - shared cache: full-strength results keyed by position (FEN without move counters) with engine id,
     achieved depth and MultiPV. A request is served from cache only if the same engine reached at least
     the requested depth with at least the requested number of lines. Reduced-skill (bot) searches are
     never cached and never served from cache, so bot personalities keep their intended strength.
   - quality on every result: engine, fallback flag, achieved depth (min over lines), seldepth, nodes, time. */
(function () {
  var FILE = 'engine/stockfish-19-lite-single.js', LOADER = 'engine/stacy-engine-loader.js', WASM = 'engine/stockfish-19-lite-single.wasm';
  var PRI = { play: 0, interactive: 1, background: 2 };
  var Engine = { status: 'loading', name: 'loading…', worker: null, queue: [], job: null, listeners: [], epoch: 0, modern: false,
    file: FILE, cache: {}, cacheOrder: [], CACHE_MAX: 800, stats: { searches: 0, cacheHits: 0, preempted: 0, restarts: 0 }, seq: 0 };
  Engine.BUNDLE = { name: 'Stockfish 19 Lite', build: 'stockfish.js 19.0.1 · lite single-threaded WASM', files: ['engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm'],
    bytes: 28230 + 1845971, net: 'nn-61e7af4bb97d (lite NNUE, embedded in the .wasm)', licence: 'GPL-3.0 (engine/COPYING.txt; source in engine/source/)' };
  /* Search budgets. Interactive = quick feedback during play; review = post-game standard; deep = optional
     slower review; verify = extra check before awarding Brilliant/Great. movetime is a safety cap only. */
  Engine.BUDGETS = {
    interactive: { depth: 14, movetime: 1500, minDepth: 10 },
    review: { depth: 14, movetime: 3000, minDepth: 12 },
    deep: { depth: 18, movetime: 8000, minDepth: 16 },
    verify: { depth: 18, movetime: 5000, minDepth: 15 }
  };
  Engine.budget = function (kind) { var b = Engine.BUDGETS[kind] || Engine.BUDGETS.interactive; return { depth: b.depth, movetime: b.movetime, minDepth: b.minDepth }; };

  /* ---------- v12 engine start-up: several ways to start a REAL Stockfish, with diagnostics ----------
     v11 only tried one way: new Worker('engine/stacy-engine-loader.js'), which importScripts() the engine
     and lets it fetch its .wasm. That depends on the local server sending JavaScript files with a script
     MIME type (WebKit refuses worker scripts otherwise), on WebAssembly SIMD (Safari/iOS 16.4+), and on
     worker start-up working under the app's folder URL. When it failed, the app fell back to Stacy Lite and
     graded nothing. v12 tries, in order, stopping at the first that answers "uciok"/"readyok":
       1. wasm-blob: the page fetches the .js and .wasm itself (any MIME type), checks the .wasm bytes
          (size, magic, WebAssembly.validate = this browser supports its features), and starts the worker
          from a Blob of that code; inside, every fetch returns the checked bytes.
       2. wasm-file: the v9–v11 loader worker (always ArrayBuffer instantiation now).
       3. asm-blob / 4. asm-file: the official stockfish.js 19 asm.js build (same engine and net compiled to
          plain JavaScript: no WebAssembly, no SIMD; slower). Grading still runs; budgets get more time.
       5. Stacy Lite (labelled, never grades).
     Every step is recorded in Engine.diag for Settings → Engine check. */
  Engine.BUILDS = {
    wasm: { js: 'engine/stockfish-19-lite-single.js', wasm: WASM, bytes: 1845971, label: 'Stockfish 19 Lite · WebAssembly' },
    asm: { js: 'engine/stockfish-19-asm.js', bytes: 3155627, label: 'Stockfish 19 · asm.js (no WebAssembly needed, slower)' }
  };
  // 1-function module using one v128 instruction: valid only where WebAssembly SIMD is supported.
  var SIMD_PROBE = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
  Engine.env = function () { return { fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null, Worker: window.Worker, Blob: window.Blob, URL: window.URL, WebAssembly: typeof WebAssembly === 'object' ? WebAssembly : null, now: function () { return Date.now(); } }; };
  Engine.diag = null;
  function newDiag() {
    var n = (typeof navigator !== 'undefined' && navigator) || window.navigator || {}, d = { at: new Date().toISOString(), ua: n.userAgent || '', page: typeof location !== 'undefined' ? String(location.href).split('#')[0] : '', wasm: false, simd: null, isolated: !!window.crossOriginIsolated, cores: n.hardwareConcurrency || null, memoryGB: n.deviceMemory || null, worker: typeof Engine.env().Worker === 'function', fetches: [], attempts: [], notes: [], result: null };
    return d;
  }
  function absUrl(rel) { try { return new URL(rel, location.href).href; } catch (e) { return rel; } }
  function getFile(env, rel, kind) {
    var rec = { file: rel, url: absUrl(rel), status: null, type: '', bytes: 0, ms: 0, error: '' }, t0 = env.now();
    Engine.diag.fetches.push(rec);
    if (!env.fetch) { rec.error = 'fetch() not available'; return Promise.reject(new Error(rec.error)); }
    return env.fetch(rec.url, { cache: 'no-cache' }).then(function (r) {
      rec.status = r.status; rec.type = (r.headers && r.headers.get && r.headers.get('Content-Type')) || '';
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + rel);
      return kind === 'text' ? r.text() : r.arrayBuffer();
    }).then(function (x) { rec.bytes = kind === 'text' ? x.length : x.byteLength; rec.ms = env.now() - t0; return x; },
      function (e) { rec.ms = env.now() - t0; rec.error = rec.error || String(e && e.message || e); throw e; });
  }
  // Prelude for blob workers: report errors as text; serve the checked .wasm to the engine's own fetch.
  function prelude(wasmUrl) {
    return '(function(){var U=' + JSON.stringify(wasmUrl || '') + ';' +
      'self.addEventListener("error",function(e){try{postMessage("info string stacy-error "+(e&&e.message||"worker error"));}catch(x){}});' +
      'self.addEventListener("unhandledrejection",function(e){try{postMessage("info string stacy-error "+String(e&&e.reason&&(e.reason.message||e.reason)||"rejection"));}catch(x){}});' +
      'if(U){var F=self.fetch;self.fetch=function(u,o){return F.call(self,U);};' +
      'var W=self.WebAssembly;if(W){W.instantiateStreaming=function(src,imp){return Promise.resolve(src).then(function(r){return r.arrayBuffer();}).then(function(b){return W.instantiate(b,imp);});};}}' +
      '})();\n';
  }
  /* The original single-path worker (v9–v11), still used for "wasm-file" and overridable by tests. */
  var defaultCreate = Engine.createWorker = function () { var W = Engine.env().Worker, wasm = new URL(WASM, location.href).href; return new W(LOADER + '#' + encodeURIComponent(wasm)); };
  // v12: 8 MB hash on phones (16 MB elsewhere); the WebAssembly build itself reserves 128 MB at start.
  Engine.HASH_MB = /iPhone|iPad|iPod|Android/.test((typeof navigator !== 'undefined' && navigator.userAgent) || '') ? 8 : 16;
  Engine.ASM_TIME = 2.5;
  // Start one worker and wait for uciok + readyok; resolve {w, id, uciMs}.
  function handshake(make, timeoutMs, att) {
    return new Promise(function (resolve, reject) {
      var w, done = false, gotId = '', t0 = Date.now(), lastErr = '';
      try { w = make(); } catch (e) { return reject(e); }
      var t = setTimeout(function () { fail(new Error((lastErr ? lastErr + ' · ' : '') + 'engine start timeout')); }, timeoutMs);
      function fail(e) { if (done) return; done = true; clearTimeout(t); try { w.terminate(); } catch (x) { } reject(e); }
      w.onmessage = function (e) {
        var line = typeof e.data === 'string' ? e.data : '';
        if (line.indexOf('info string stacy-error ') === 0) { lastErr = line.slice(24); if (att) att.error = lastErr; if (!done) fail(new Error(lastErr)); return; } // an uncaught error before readyok is fatal: fail now, not after the timeout
        if (line.indexOf('id name ') === 0) gotId = line.slice(8).trim();
        if (line === 'uciok' && !done) { if (att) att.uciMs = Date.now() - t0; w.postMessage('setoption name Hash value ' + Engine.HASH_MB); w.postMessage('isready'); }
        if (line === 'readyok' && !done) { done = true; clearTimeout(t); resolve({ w: w, id: gotId || 'Stockfish', uciMs: Date.now() - t0 }); }
      };
      w.onerror = function (e) { var m = e && e.message ? e.message : 'worker error'; if (e && e.preventDefault) try { e.preventDefault(); } catch (x) { } fail(new Error(lastErr ? lastErr : m)); };
      w.postMessage('uci');
    });
  }
  function attempt(method, build, make, timeoutMs) {
    var att = { method: method, build: build, ok: false, ms: 0, uciMs: null, error: '' }, t0 = Date.now(); Engine.diag.attempts.push(att); Engine.emit();
    return handshake(make, timeoutMs, att).then(function (r) { att.ok = true; att.ms = Date.now() - t0; r.build = build; r.method = method; r.make = make; return r; },
      function (e) { att.ms = Date.now() - t0; att.error = att.error || String(e && e.message || e); throw e; });
  }
  function blobWorker(env, code) {
    var url = env.URL.createObjectURL(new env.Blob([code], { type: 'text/javascript' }));
    return function () { return new env.Worker(url); };
  }
  /* Runs the whole ladder; resolves {w,id,build,method,make} or rejects with the last reason. */
  Engine.START_MS = 25000;  // per WebAssembly attempt
  Engine.ASM_START_MS = 45000; // the 3 MB asm.js file takes longer to parse on a phone
  function startLadder() {
    var env = Engine.env(), d = Engine.diag = newDiag(), WA = env.WebAssembly, B = Engine.BUILDS, lastErr = 'engine unavailable';
    if (Engine.createWorker !== defaultCreate) { // tests / embedders supply their own WebAssembly worker
      if (!WA) { d.result = 'no WebAssembly support'; return Promise.reject(new Error('no WebAssembly support')); }
      return attempt('custom', 'wasm', Engine.createWorker, Engine.START_MS);
    }
    if (!env.Worker) { d.result = 'no Web Worker support'; return Promise.reject(new Error('no Web Worker support')); }
    d.wasm = !!WA;
    try { d.simd = WA ? WA.validate(new Uint8Array(SIMD_PROBE)) : false; } catch (e) { d.simd = false; }
    var chain = Promise.reject(new Error('start'));
    if (WA) {
      chain = chain.catch(function () {
        return getFile(env, B.wasm.wasm, 'bin').then(function (buf) {
          var u = new Uint8Array(buf), magic = u[0] === 0 && u[1] === 97 && u[2] === 115 && u[3] === 109;
          d.wasmMagic = magic; d.wasmBytesOk = buf.byteLength === B.wasm.bytes;
          if (!magic) throw new Error('the .wasm file is not WebAssembly (server returned something else, ' + buf.byteLength + ' bytes)');
          var valid = false; try { valid = WA.validate(buf); } catch (e) { valid = false; }
          d.wasmValid = valid;
          if (!valid) throw new Error(d.simd === false ? 'this browser lacks WebAssembly SIMD, which the WebAssembly build needs (iOS/Safari 16.4+)' : 'this browser cannot compile the .wasm (WebAssembly.validate failed)');
          return getFile(env, B.wasm.js, 'text').then(function (js) {
            var wasmUrl = env.URL.createObjectURL(new env.Blob([buf], { type: 'application/wasm' }));
            return attempt('wasm-blob', 'wasm', blobWorker(env, prelude(wasmUrl) + js), Engine.START_MS);
          });
        }).catch(function (e) {
          lastErr = String(e && e.message || e); d.notes.push('WebAssembly build via page fetch: ' + lastErr);
          var f0 = d.fetches[0]; if (d.wasmValid === false || d.wasmMagic === false || (f0 && f0.status && f0.status !== 200)) throw e; // the file-based loader cannot do better
          return attempt('wasm-file', 'wasm', defaultCreate, Engine.START_MS);
        });
      });
    }
    chain = chain.catch(function (e) {
      if (e && e.message !== 'start') { lastErr = String(e.message || e); d.notes.push('WebAssembly build: ' + lastErr); }
      if (!WA) d.notes.push('WebAssembly is not available in this browser (Lockdown Mode or an in-app browser can disable it)');
      return getFile(env, B.asm.js, 'text').then(function (js) { return attempt('asm-blob', 'asm', blobWorker(env, prelude('') + js), Engine.ASM_START_MS); })
        .catch(function (e2) { lastErr = String(e2 && e2.message || e2); d.notes.push('asm.js build from page fetch: ' + lastErr); return attempt('asm-file', 'asm', function () { return new env.Worker(B.asm.js); }, Engine.ASM_START_MS); });
    });
    return chain.then(function (r) { d.result = 'ok: ' + r.method + ' (' + r.id + ')'; Engine.emit(); return r; }, function (e) { d.result = 'failed: ' + (lastErr || (e && e.message)); Engine.emit(); throw new Error(lastErr || (e && e.message) || 'engine unavailable'); });
  }
  function useFallback(reason) {
    Engine.worker = null; Engine.modern = false; Engine.status = 'fallback'; Engine.name = 'Stacy Lite (built-in, limited)'; Engine.reason = reason || 'engine unavailable'; Engine.build = 'lite';
    Engine.emit(); Engine.pump();
  }
  function attach(r) {
    var w = r.w; Engine.worker = w; Engine.status = 'ready'; Engine.modern = true; Engine.name = r.id; Engine.reason = null;
    Engine.build = r.build || 'wasm'; Engine.method = r.method || 'custom'; if (r.make) Engine._spawn = r.make;
    w.onmessage = function (e) { if (Engine.worker === w) { var l = String(e.data); if (l.indexOf('info string stacy-error ') === 0) return; Engine.onLine(l); } };
    w.onerror = function () { if (Engine.worker === w) Engine.failWorker('worker error'); };
    Engine.emit(); Engine.pump();
  }
  // Restart with the method that worked (no new ladder, no re-download).
  function restart() { var make = Engine._spawn || Engine.createWorker; return handshake(make, Engine.build === 'asm' ? Engine.ASM_START_MS : Engine.START_MS, null).then(function (r) { r.build = Engine.build; r.method = Engine.method; r.make = make; return r; }); }
  Engine.init = function () {
    if (Engine._init) return Engine._init;
    Engine._init = new Promise(function (resolve) {
      startLadder().then(function (r) { attach(r); resolve(Engine); }, function (e) { useFallback((e && e.message) || 'engine failed to start'); resolve(Engine); });
    });
    return Engine._init;
  };
  /* After a crash/timeout: up to two restarts of the same engine; otherwise fallback. */
  Engine.failWorker = function (reason) {
    var job = Engine.job; Engine.job = null; Engine.okStreak = 0; Engine.lastFailure = { reason: reason, at: Date.now() };
    if (job) { clearTimeout(job.timer); if (!job.cancelled) { job.lines = {}; job.best = null; Engine.queue.unshift(job); } }
    if (Engine.worker) try { Engine.worker.terminate(); } catch (e) { }
    Engine.worker = null; Engine.status = 'loading'; Engine.emit();
    if (Engine.stats.restarts >= 2) { useFallback(reason); return; }
    Engine.stats.restarts++;
    restart().then(attach, function () { useFallback(reason); }); // the old worker was terminated above (one engine at a time)
  };
  /* User-triggered: run the whole start-up ladder again (Engine check screen, baseline "Try again"). */
  Engine.retryFull = function () {
    if (Engine.status === 'loading') return Engine._init || Promise.resolve(Engine);
    var job = Engine.job; Engine.job = null;
    if (job) { clearTimeout(job.timer); if (!job.cancelled) { job.lines = {}; job.best = null; Engine.queue.unshift(job); } }
    if (Engine.worker) try { Engine.worker.terminate(); } catch (e) { }
    Engine.worker = null; Engine.status = 'loading'; Engine.stats.restarts = 0; Engine.emit();
    return startLadder().then(function (r) { attach(r); return Engine; }, function (e) { useFallback((e && e.message) || 'engine failed to start'); return Engine; });
  };
  Engine.report = function () {
    var d = Engine.diag || {}, L = [];
    L.push('Stacy Chess engine check · ' + (d.at || new Date().toISOString()));
    L.push('Status: ' + Engine.status + ' · ' + Engine.name + (Engine.method ? ' · via ' + Engine.method : '') + (Engine.reason ? ' · reason: ' + Engine.reason : ''));
    L.push('Device: ' + (d.ua || (window.navigator && navigator.userAgent) || '?'));
    L.push('Page: ' + (d.page || ''));
    L.push('WebAssembly: ' + (d.wasm ? 'yes' : 'no') + ' · SIMD: ' + (d.simd == null ? '?' : d.simd ? 'yes' : 'no') + ' · Web Worker: ' + (d.worker ? 'yes' : 'no') + ' · cross-origin isolated: ' + (d.isolated ? 'yes' : 'no') + (d.cores ? ' · cores ' + d.cores : '') + (d.memoryGB ? ' · memory ' + d.memoryGB + ' GB' : ''));
    if (d.wasmMagic != null) L.push('.wasm check: ' + (d.wasmMagic ? 'is WebAssembly' : 'NOT WebAssembly') + ', size ' + (d.wasmBytesOk ? 'correct' : 'WRONG') + ', browser can compile it: ' + (d.wasmValid ? 'yes' : 'no'));
    (d.fetches || []).forEach(function (f) { L.push('Fetch ' + f.file + ': ' + (f.status == null ? '-' : 'HTTP ' + f.status) + ' · type ' + (f.type || '(none)') + ' · ' + f.bytes + ' bytes · ' + f.ms + ' ms' + (f.error ? ' · ERROR ' + f.error : '')); });
    (d.attempts || []).forEach(function (a) { L.push('Start ' + a.method + ' (' + a.build + '): ' + (a.ok ? 'OK' : 'failed') + ' · ' + a.ms + ' ms' + (a.uciMs != null ? ' · uciok after ' + a.uciMs + ' ms' : '') + (a.error ? ' · ' + a.error : '')); });
    (d.notes || []).forEach(function (n) { L.push('Note: ' + n); });
    L.push('Result: ' + (d.result || (Engine.status === 'loading' ? 'still starting…' : '-')));
    L.push('Searches ' + Engine.stats.searches + ' · restarts ' + Engine.stats.restarts + (Engine.lastFailure ? ' · last failure: ' + Engine.lastFailure.reason : ''));
    return L.join('\n');
  };
  Engine.onStatus = function (fn) { Engine.listeners.push(fn); fn(Engine); return function () { var i = Engine.listeners.indexOf(fn); if (i >= 0) Engine.listeners.splice(i, 1); }; };
  Engine.emit = function () { Engine.listeners.slice().forEach(function (f) { try { f(Engine); } catch (e) { } }); };
  Engine.describe = function () { return Engine.status === 'ready' ? Engine.name + (Engine.build === 'asm' ? ' · bundled asm.js build (slower)' : ' · bundled, single-threaded WASM') : Engine.status === 'fallback' ? Engine.name + ' · ' + (Engine.reason || 'bundled engine unavailable') + ' · reviews are not graded' : 'Loading the chess engine… (first start can take up to 30 s on a phone)'; };

  // ---------- shared position cache ----------
  Engine.key = function (fen) { var p = String(fen).split(' '), hm = +p[4] || 0; return p.slice(0, 4).join(' ') + (hm >= 80 ? ' h' + hm : ''); };
  function clone(r) { return { fen: r.fen, best: r.best, lines: r.lines.map(function (l) { var o = {}; for (var k in l) o[k] = k === 'pv' ? l.pv.slice() : l[k]; return o; }), quality: Object.assign({}, r.quality, { cached: true }) }; }
  Engine.store = function (r) {
    if (!r || !r.lines || !r.lines.length || !r.quality || r.quality.fallback || r.quality.reduced) return;
    var k = Engine.key(r.fen), old = Engine.cache[k];
    if (old && old.quality.engine === r.quality.engine && (old.quality.depth > r.quality.depth || (old.quality.depth === r.quality.depth && old.lines.length >= r.lines.length))) return;
    if (!old) Engine.cacheOrder.push(k); Engine.cache[k] = r;
    while (Engine.cacheOrder.length > Engine.CACHE_MAX) delete Engine.cache[Engine.cacheOrder.shift()];
  };
  Engine.peek = function (fen, o) {
    o = o || {}; var r = Engine.cache[Engine.key(fen)]; if (!r || Engine.status !== 'ready' || r.quality.engine !== Engine.name) return null;
    var need = o.minDepth || o.depth, k = o.multipv || 1; if (!need || r.quality.depth < need || (r.lines.length < k && (r.quality.requestedMultipv || 1) < k)) return null; // fewer lines than asked = fewer legal moves
    var c = clone(r); c.fen = fen; c.lines = c.lines.slice(0, Math.max(o.multipv || 1, 1)); return c;
  };

  /* Stockfish aborts (the worker dies) on an illegal position, e.g. the side NOT to move in check.
     Every FEN is checked with chess.js first; an illegal one gets null, never a search. */
  Engine.legalFen = function (fen) {
    if (typeof Chess !== 'function') return true;
    try { var g = new Chess(); if (g.validate_fen && !g.validate_fen(fen).valid) return false; if (!g.load(fen)) return false;
      var p = fen.split(' '); p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-'; var h = new Chess(); if (!h.load(p.join(' '))) return true; return !h.in_check();
    } catch (e) { return false; }
  };
  // ---------- job queue ----------
  // opts: {depth, movetime, nodes, multipv, skill, minDepth, priority, owner, onInfo, cache:false}
  function full(o) { return o.skill == null || o.skill >= 20; }
  Engine.analyse = function (fen, opts) {
    opts = opts || {}; var epoch = Engine.epoch;
    // Engine help is blocked while an unaided attempt is running (App.trainingLock.noHelp).
    if (opts.purpose === 'help' && window.App && App.trainingLock && App.trainingLock.noHelp) return Promise.resolve(null);
    if (!Engine.legalFen(fen)) return Promise.resolve(null);
    if (full(opts) && opts.cache !== false && !opts.onInfo) { var hit = Engine.peek(fen, opts); if (hit) { Engine.stats.cacheHits++; return Promise.resolve(hit); } }
    return Engine.init().then(function () {
      if (epoch !== Engine.epoch) return null;
      if (full(opts) && opts.cache !== false && !opts.onInfo) { var hit2 = Engine.peek(fen, opts); if (hit2) { Engine.stats.cacheHits++; return hit2; } }
      return new Promise(function (resolve) {
        var pr = opts.priority && PRI[opts.priority] != null ? opts.priority : full(opts) ? 'interactive' : 'play';
        var job = { id: ++Engine.seq, fen: fen, opts: opts, resolve: resolve, lines: {}, best: null, pri: PRI[pr], owner: opts.owner || null };
        var i = 0; while (i < Engine.queue.length && Engine.queue[i].pri <= job.pri) i++;
        Engine.queue.splice(i, 0, job);
        var run = Engine.job;
        if (run && !run.cancelled && !run.preempted && run.pri > job.pri && run.pri === PRI.background && Engine.worker) { run.preempted = true; Engine.stats.preempted++; try { Engine.worker.postMessage('stop'); } catch (e) { } }
        Engine.pump();
      });
    });
  };
  function settle(job, value) { if (job.settled) return; job.settled = true; try { job.resolve(value); } catch (e) { } }
  Engine.cancel = function (owner) {
    if (!owner) return;
    Engine.queue = Engine.queue.filter(function (j) { if (j.owner === owner) { settle(j, null); return false; } return true; });
    var run = Engine.job; if (run && run.owner === owner && !run.cancelled) { run.cancelled = true; settle(run, null); if (Engine.worker) try { Engine.worker.postMessage('stop'); } catch (e) { Engine.failWorker('stop failed'); } }
  };
  Engine.cancelAll = function () {
    Engine.epoch++;
    Engine.queue.forEach(function (j) { settle(j, null); }); Engine.queue = [];
    var run = Engine.job; if (run && !run.cancelled) { run.cancelled = true; settle(run, null); if (Engine.worker) try { Engine.worker.postMessage('stop'); } catch (e) { Engine.failWorker('stop failed'); } }
  };
  Engine.pending = function () { return Engine.queue.length + (Engine.job ? 1 : 0); };
  Engine.watchdogMs = function (o) { return o.movetime ? Math.min(o.movetime + 12000, o.movetime * 2 + 4000) : 18000; };
  Engine.pump = function () {
    if (Engine.job || !Engine.queue.length || Engine.status === 'loading') return;
    var job = Engine.job = Engine.queue.shift(); job.lines = {}; job.best = null; job.started = Date.now();
    if (Engine.status === 'fallback') {
      setTimeout(function () { var r = null; try { if (!job.cancelled) r = Lite.analyse(job.fen, job.opts); } catch (e) { } Engine.job = null; settle(job, r); Engine.pump(); }, 10);
      return;
    }
    var w = Engine.worker, o = job.opts;
    job.turn = job.fen.split(' ')[1];
    Engine.stats.searches++;
    w.postMessage('setoption name Skill Level value ' + (o.skill == null ? 20 : o.skill));
    w.postMessage('setoption name MultiPV value ' + (o.multipv || 1));
    w.postMessage('position fen ' + job.fen);
    var go = 'go';
    if (o.nodes) go += ' nodes ' + o.nodes;
    if (o.depth) go += ' depth ' + o.depth;
    // v12: the asm.js build is ~3x slower; give analysis (not bot moves) more time so depth gates still pass.
    var mt = o.movetime && Engine.build === 'asm' && job.pri !== PRI.play ? Math.round(o.movetime * Engine.ASM_TIME) : o.movetime;
    if (mt) go += ' movetime ' + mt;
    if (!o.depth && !o.movetime && !o.nodes) go += ' depth 14';
    // v11: tighter watchdog for short searches (a 90 ms baseline search that has not answered in ~4 s is hung).
    job.timer = setTimeout(function () { if (Engine.job === job) Engine.failWorker('search timeout'); }, Engine.watchdogMs(mt ? { movetime: mt } : o));
    w.postMessage(go);
  };
  Engine.parseInfo = function (line) {
    var t = line.split(' '), d = {}, i;
    for (i = 0; i < t.length; i++) {
      var k = t[i];
      if (k === 'depth') d.depth = +t[i + 1]; else if (k === 'seldepth') d.seldepth = +t[i + 1]; else if (k === 'multipv') d.k = +t[i + 1];
      else if (k === 'nodes') d.nodes = +t[i + 1]; else if (k === 'time') d.time = +t[i + 1];
      else if (k === 'score') { d.type = t[i + 1]; d.val = +t[i + 2]; if (t[i + 3] === 'lowerbound' || t[i + 3] === 'upperbound') d.bound = true; }
      else if (k === 'pv') { d.pv = t.slice(i + 1).filter(Boolean); break; }
    }
    return d;
  };
  Engine.onLine = function (line) {
    var job = Engine.job; if (!job) return;
    if (line.indexOf('info') === 0 && line.indexOf(' pv ') > 0 && line.indexOf('score') > 0) {
      var d = Engine.parseInfo(line); if (d.bound || !d.pv || !d.pv.length) return;
      var sgn = job.turn === 'w' ? 1 : -1, ln = { uci: d.pv[0], pv: d.pv, depth: d.depth, seldepth: d.seldepth };
      // Scores are converted to White's point of view here, once. mate 0 = side to move is already mated.
      if (d.type === 'mate') ln.mate = d.val === 0 ? -sgn * .0001 : d.val * sgn; else ln.cp = d.val * sgn;
      job.lines[d.k || 1] = ln; job.nodes = d.nodes; job.time = d.time;
      if (job.opts.onInfo && !job.cancelled && !job.preempted) try { job.opts.onInfo(Engine.result(job)); } catch (e) { }
    } else if (line.indexOf('bestmove') === 0) {
      clearTimeout(job.timer); Engine.job = null;
      if (job.preempted && !job.cancelled) { job.preempted = false; var i = 0; while (i < Engine.queue.length && Engine.queue[i].pri < job.pri) i++; Engine.queue.splice(i, 0, job); Engine.pump(); return; }
      job.best = line.split(' ')[1];
      Engine.okStreak = (Engine.okStreak || 0) + 1; if (Engine.okStreak >= 30 && Engine.stats.restarts) Engine.stats.restarts = 0; // a one-off hang does not doom the session
      if (!job.cancelled) { var r = Engine.result(job); if (full(job.opts)) Engine.store(r); settle(job, r); }
      Engine.pump();
    }
  };
  Engine.result = function (job) {
    var lines = Object.keys(job.lines).sort(function (a, b) { return a - b; }).map(function (k) { return job.lines[k]; });
    var best = job.best && job.best !== '(none)' ? job.best : (lines[0] && lines[0].uci);
    // MultiPV lines arrive per iteration; the line that matches bestmove goes first.
    if (best && lines.length > 1 && lines[0].uci !== best) { var bi = lines.findIndex(function (l) { return l.uci === best; }); if (bi > 0) lines.unshift(lines.splice(bi, 1)[0]); }
    return { lines: lines, best: best, fen: job.fen, quality: { engine: Engine.name, fallback: Engine.status === 'fallback', reduced: !full(job.opts), depth: lines.length ? Math.min.apply(null, lines.map(function (l) { return l.depth || 0; })) : 0,
      seldepth: lines[0] && lines[0].seldepth || 0, nodes: job.nodes || 0, timeMs: job.time || 0, multipv: lines.length, requestedMultipv: job.opts.multipv || 1, requestedDepth: job.opts.depth || 0, requestedMovetime: job.opts.movetime || 0 } };
  };

  // Play levels for "Play vs Stacy" (approximate ratings)
  Engine.LEVELS = [
    { elo: 400, skill: 0, depth: 1, random: 0.35 }, { elo: 600, skill: 0, depth: 1, random: 0.18 },
    { elo: 800, skill: 1, depth: 2, random: 0.08 }, { elo: 1000, skill: 3, depth: 3, random: 0.03 },
    { elo: 1200, skill: 5, depth: 5 }, { elo: 1400, skill: 8, depth: 7 },
    { elo: 1600, skill: 11, depth: 9 }, { elo: 1800, skill: 14, depth: 11 },
    { elo: 2100, skill: 17, movetime: 700 }, { elo: 2500, skill: 20, movetime: 1200 },
    { elo: 3000, skill: 20, movetime: 3000, label: 'MAX' }
  ];
  Engine.playMove = function (fen, levelIdx) {
    var L = Engine.LEVELS[Math.max(0, Math.min(Engine.LEVELS.length - 1, levelIdx))];
    if (L.random && Math.random() < L.random) {
      var g = new Chess(fen), ms = g.moves({ verbose: true });
      // prefer captures/checks a bit, like a beginner
      var m = ms[Math.floor(Math.random() * ms.length)];
      return Promise.resolve(m.from + m.to + (m.promotion || ''));
    }
    return Engine.analyse(fen, { skill: L.skill, depth: L.depth, movetime: L.movetime, priority: 'play', cache: false }).then(function (r) { return r && r.best; });
  };

  // ---------- tiny built-in fallback engine (used only if Stockfish can't load) ----------
  /* v11: Stacy Lite runs on the page's main thread, so every call is strictly bounded: a node budget
     (deterministic) plus a hard time cap, iterative deepening that keeps the last completed depth, and a
     real quiescence search with stand-pat and a capture-depth limit. v9's version extended every capture
     at the horizon without limit; in sharp middlegames one call could take 30 s+ on a desktop and minutes on
     a phone, freezing the whole page (and getting the tab killed on iOS). */
  var VAL = { p: 100, n: 310, b: 330, r: 500, q: 900, k: 0 }, ABORT = {};
  var Lite = {
    NODES: 1500, MAX_MS: 60, QDEPTH: 3,
    evalBoard: function (g) {
      var b = g.board(), s = 0;
      for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
        var p = b[r][f]; if (!p) continue;
        var v = VAL[p.type], cen = 3.5 - Math.max(Math.abs(3.5 - f), Math.abs(3.5 - r));
        if (p.type === 'n' || p.type === 'b') v += cen * 8;
        if (p.type === 'p') v += (p.color === 'w' ? (6 - r) : (r - 1)) * 6 + (cen > 2 ? 10 : 0);
        s += p.color === 'w' ? v : -v;
      }
      return s;
    },
    tick: function (st) { st.nodes++; if (st.nodes > st.budget || ((st.nodes & 7) === 0 && Date.now() > st.deadline)) { st.aborted = true; throw ABORT; } },
    order: function (ms) { return ms.sort(function (x, y) { return ((y.captured ? VAL[y.captured] * 10 - VAL[y.piece] / 10 : 0) + (y.promotion ? 800 : 0)) - ((x.captured ? VAL[x.captured] * 10 - VAL[x.piece] / 10 : 0) + (x.promotion ? 800 : 0)); }); },
    quiesce: function (g, a, b, ply, qd, st) {
      Lite.tick(st);
      var ms = g.moves({ verbose: true });
      if (!ms.length) return g.in_check() ? -100000 + ply : 0;
      if (g.in_draw()) return 0;
      var stand = (g.turn() === 'w' ? 1 : -1) * Lite.evalBoard(g);
      if (stand >= b || qd >= Lite.QDEPTH) return stand;
      if (stand > a) a = stand;
      var caps = Lite.order(ms.filter(function (m) { return m.captured || m.promotion; })), best = stand;
      for (var i = 0; i < caps.length; i++) {
        g.move(caps[i]); var sc = -Lite.quiesce(g, -b, -a, ply + 1, qd + 1, st); g.undo();
        if (sc > best) best = sc; if (sc > a) a = sc; if (a >= b) break;
      }
      return best;
    },
    search: function (g, depth, a, b, ply, st) {
      if (depth <= 0) return Lite.quiesce(g, a, b, ply, 0, st);
      Lite.tick(st);
      var ms = g.moves({ verbose: true });
      if (!ms.length) return g.in_check() ? -100000 + ply : 0;
      if (g.in_draw()) return 0;
      Lite.order(ms); var best = -Infinity;
      for (var i = 0; i < ms.length; i++) {
        g.move(ms[i]); var sc = -Lite.search(g, depth - 1, -b, -a, ply + 1, st); g.undo();
        if (sc > best) best = sc; if (sc > a) a = sc; if (a >= b) break;
      }
      return best;
    },
    analyse: function (fen, opts) {
      opts = opts || {};
      var g = new Chess(fen), ms = g.moves({ verbose: true }), sgn = g.turn() === 'w' ? 1 : -1, t0 = Date.now();
      if (!ms.length) return { lines: [], best: null, fen: fen, quality: { engine: 'Stacy Lite', fallback: true, limited: true, depth: 0, multipv: 0 } };
      var maxD = Math.max(1, Math.min(opts.depth || 2, 3)), st = { nodes: 0, budget: opts.liteNodes || Lite.NODES, deadline: t0 + (opts.liteMs || Lite.MAX_MS), aborted: false };
      Lite.order(ms);
      var done = null, reached = 0;
      for (var d = 1; d <= maxD; d++) {
        var res = [];
        try {
          for (var i = 0; i < ms.length; i++) { g.move(ms[i]); var sc; try { sc = -Lite.search(g, d - 1, -Infinity, Infinity, 1, st); } finally { g.undo(); } res.push({ m: ms[i], sc: sc }); }
        } catch (e) { if (e !== ABORT) throw e; if (d === 1) done = res; break; }
        done = res; reached = d;
      }
      // Depth 1 cut short: the remaining moves get a cheap static score, so a result is always returned.
      if (done.length < ms.length) for (var k = done.length; k < ms.length; k++) { g.move(ms[k]); var v = -(g.turn() === 'w' ? 1 : -1) * Lite.evalBoard(g); if (g.in_check() && !g.moves().length) v = 100000 - 1; g.undo(); done.push({ m: ms[k], sc: v }); }
      var res2 = done.slice().sort(function (a, b) { return b.sc - a.sc; });
      var lines = res2.slice(0, opts.multipv || 1).map(function (r) {
        var u = r.m.from + r.m.to + (r.m.promotion || ''), ln = { uci: u, pv: [u], depth: reached };
        if (Math.abs(r.sc) > 90000) ln.mate = sgn * (r.sc > 0 ? 1 : -1) * Math.ceil((100000 - Math.abs(r.sc)) / 2); else ln.cp = Math.round(r.sc * sgn);
        return ln;
      });
      Lite.last = { nodes: st.nodes, ms: Date.now() - t0, depth: reached, aborted: st.aborted };
      return { lines: lines, best: lines[0].uci, fen: fen, quality: { engine: 'Stacy Lite', fallback: true, limited: true, depth: reached, nodes: st.nodes, requestedDepth: opts.depth || 0, multipv: lines.length } };
    }
  };
  Engine.Lite = Lite;
  window.Engine = Engine;
})();
