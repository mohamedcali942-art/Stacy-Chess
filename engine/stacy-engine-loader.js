/* Stacy Chess engine loader (MIT-style, part of Stacy; not part of Stockfish).
   Runs inside the Web Worker. stockfish.js streams its .wasm with WebAssembly.instantiateStreaming, which
   browsers reject unless the server sends Content-Type: application/wasm. Many simple static servers
   (and some app preview servers) send a generic type. v12: we keep a copy of the response and, whenever
   streaming is unavailable, the type is wrong, or streaming fails for any reason, instantiate from an
   ArrayBuffer instead. Errors are reported back as "info string stacy-error ..." for Settings → Engine check.
   Then the unmodified official engine script is imported; it reads the .wasm URL from this worker's hash. */
(function () {
  function report(m) { try { postMessage('info string stacy-error ' + m); } catch (e) { } }
  self.addEventListener('error', function (e) { report((e && e.message) || 'worker error'); });
  self.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; report(String((r && (r.message || r)) || 'rejection')); });
  var W = self.WebAssembly; if (!W) { report('WebAssembly is not available inside the worker'); return; }
  var streaming = W.instantiateStreaming;
  W.instantiateStreaming = function (source, imports) {
    return Promise.resolve(source).then(function (resp) {
      var type = (resp && resp.headers && resp.headers.get && resp.headers.get('Content-Type')) || '';
      var copy = null; try { copy = resp.clone(); } catch (e) { }
      function viaBuffer(r) { return r.arrayBuffer().then(function (bytes) { return W.instantiate(bytes, imports); }); }
      if (streaming && copy && /application\/wasm/i.test(type)) return streaming.call(W, resp, imports).catch(function () { return viaBuffer(copy); });
      return viaBuffer(copy || resp);
    });
  };
})();
importScripts('stockfish-19-lite-single.js');
