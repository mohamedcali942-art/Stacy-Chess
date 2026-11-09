# Bundled chess engine: Stockfish 19 Lite (single-threaded WebAssembly, plus an asm.js fallback since v12)

| File | Bytes | SHA-256 |
|---|---|---|
| `stockfish-19-lite-single.js` | 28,230 | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `stockfish-19-lite-single.wasm` | 1,845,971 | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |
| `stockfish-19-asm.js` (v12) | 3,155,627 | `c07dad9a00a89f4b1dcba3971d58d8078715556eac0212368e4aab510e1e27c9` |
| `source/stockfish.js-19.0.1-source.tar.gz` | 426,054 | `a18aa8a871f5265014b110b3e07804ff3637899d2e189be6ded2b99e2c17a10e` |
| `source/nn-61e7af4bb97d.nnue` | 1,166,381 | `61e7af4bb97d51eeeb25d322916f86513b5cd3a827ce189c98c6e31946f99e5b` |

- **What it is:** the official stockfish.js 19.0.1 release by Nathan Rugg (a port of Stockfish 19), "lite single" build. UCI id: `Stockfish 19 Lite WASM`. The small NNUE net `nn-61e7af4bb97d` is embedded in the .wasm.
- **Where it came from:** the two engine files are byte-identical in the npm package `stockfish@19.0.1` (npm integrity checked) and the GitHub release v19.0.1 assets of https://github.com/nmrugg/stockfish.js . They are unmodified.
- **Corresponding source:** `source/stockfish.js-19.0.1-source.tar.gz` is the tagged source archive of that release (Stockfish C++ sources plus the Emscripten build scripts). The net file is the one embedded in the build, from https://tests.stockfishchess.org/nns . Upstream Stockfish: https://github.com/official-stockfish/Stockfish .
- **Licence:** GNU GPL v3, see `COPYING.txt`; authors in `AUTHORS.txt`. The engine runs as a separate program in a Web Worker and talks UCI text with the app. If you redistribute this folder, keep these files with it; if you modify and rebuild the engine, you must offer your modified source under the GPL.
- `stacy-engine-loader.js` is Stacy's own 20-line worker wrapper, not part of Stockfish. It lets the .wasm load when a static server does not send `Content-Type: application/wasm`, then imports the unmodified engine script.

- **v12 asm.js fallback:** `stockfish-19-asm.js` is the official asm.js build from the same npm package `stockfish@19.0.1` (`bin/stockfish-19-asm.js`, unmodified, same source archive and the same embedded `nn-61e7af4bb97d` net; UCI id `Stockfish 19 Lite ASM.JS`). It needs no WebAssembly and no SIMD. It is used only when the WebAssembly build cannot start; it is roughly 3× slower, so Stacy gives analysis searches 2.5× more time on it.
- v12 start-up (engine.js): the page first fetches the .wasm itself, checks size, the `\0asm` magic bytes and `WebAssembly.validate`, then starts the engine from a Blob worker that is handed those exact bytes, so a server's MIME types or folder path cannot break it. Next it tries the file-based loader, then the asm.js build (Blob, then file). Each step is shown in Settings → Engine check.

Builds considered and not bundled: the full single-thread build (~99 MB net, too large for a phone download); multi-thread builds (need COOP/COEP cross-origin isolation headers, which plain static hosting and the Koder preview do not provide). The Lite net is weaker than full Stockfish 19, but still far stronger than any human at the depths used here.
