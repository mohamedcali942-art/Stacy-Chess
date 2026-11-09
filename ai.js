/* Stacy Chess - optional AI brain (Google Gemini, free tier).
   The API key is pasted by the user in Settings and stored ONLY in this browser's localStorage.
   Never put a key in this file: the repo is public. Without a key, Stacy uses built-in explanations. */
(function () {
  var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var MODELS = [
    { id: 'auto', label: 'Auto (recommended, saves free quota)' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (fast)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (smart)' },
    { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (backup)' },
    { id: 'gemini-flash-latest', label: 'Gemini Flash (latest alias)' }
  ];
  var LITE = 'gemini-3.5-flash-lite', LITE2 = 'gemini-3.1-flash-lite', SMART = 'gemini-3.8-flash';
  /* Free-tier bookkeeping: requests per model per Pacific-time day (that's when Google resets quotas). */
  function pacificDay() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function usage() {
    var u; try { u = JSON.parse(localStorage.getItem('stacy-ai-usage') || '{}'); } catch (e) { u = {}; }
    if (u.day !== pacificDay()) u = { day: pacificDay(), n: {}, ex: {} };
    return u;
  }
  function bump(model, exhausted) {
    var u = usage(); if (exhausted) u.ex[model] = 1; else u.n[model] = (u.n[model] || 0) + 1;
    try { localStorage.setItem('stacy-ai-usage', JSON.stringify(u)); } catch (e) { }
  }
  function zero() { return {prompt:0,output:0,total:0,thoughts:0,cached:0,audio:0,requests:0,tts:0,unknown:0,seconds:0}; }
  function ledger() {
    var x;try{x=JSON.parse(localStorage.getItem('stacy-ai-ledger')||'{}');}catch(e){x={};}
    x.all=x.all||zero();x.days=x.days||{};x.requests=x.requests||[];return x;
  }
  function saveLedger(x) {try{localStorage.setItem('stacy-ai-ledger',JSON.stringify(x));}catch(e){};window.dispatchEvent(new Event('stacy-usage'));}
  function track(model,kind,meta,status) {
    var x=ledger(),day=pacificDay(),m=meta||{},known=!!meta;
    var row={at:Date.now(),day:day,model:model,kind:kind,status:status||200,known:known,prompt:+m.promptTokenCount||0,output:+m.candidatesTokenCount||0,total:+m.totalTokenCount||0,thoughts:+m.thoughtsTokenCount||0,cached:+m.cachedContentTokenCount||0,audio:0};
    (m.candidatesTokensDetails||[]).forEach(function(d){if(d.modality==='AUDIO')row.audio+=+d.tokenCount||0;});
    x.days[day]=x.days[day]||zero();[x.all,x.days[day]].forEach(function(t){['prompt','output','total','thoughts','cached','audio'].forEach(function(k){t[k]=(t[k]||0)+row[k];});t.requests=(t.requests||0)+1;if(kind==='tts')t.tts=(t.tts||0)+1;if(!known)t.unknown=(t.unknown||0)+1;});
    x.requests.push(row);x.requests=x.requests.slice(-200);Object.keys(x.days).sort().slice(0,-90).forEach(function(k){delete x.days[k];});saveLedger(x);return row;
  }
  function audioSeconds(n) {var x=ledger(),d=pacificDay();x.days[d]=x.days[d]||zero();x.days[d].seconds=(x.days[d].seconds||0)+n;x.all.seconds=(x.all.seconds||0)+n;saveLedger(x);}
  function pickModel(purpose) {
    var m = settings().aiModel || 'auto', u = usage();
    if (m === 'auto') m = purpose === 'chat' && (u.n[SMART] || 0) < 18 && !u.ex[SMART] ? SMART : LITE;
    var chain = [m, LITE, LITE2].filter(function (x, i, arr) { return arr.indexOf(x) === i && !u.ex[x]; });
    return chain.length ? chain : [LITE];
  }
  var noThink = {}, cache = {}, lastCall = 0, lastAuto = 0, inflight = null, cooldownUntil = 0, cooldownKey = '';

  function settings() { return (window.App && App.state && App.state.settings) || {}; }
  function key() { return (settings().apiKey || '').trim(); }
  function enabled() { return !!key() && settings().aiOn !== false; }

  var SYSTEM = [
    "You are Stacy, a personal chess coach inside the Stacy Chess app. Use the PLAYER PROFILE facts for the player name, real account rating and goal. Never assume a name or invent a rating. Never promise a rating gain, title or timeline; distinguish self-reported starting level from linked account rating. If no account is connected, say the baseline is unknown.",
    "PERSONALITY: Follow coachingPreferences.tone: calm = warm and steady; direct = concise, no exaggerated praise; questioning = one reflective prompt before explaining. Default to warm and invested in the player’s improvement. Celebrate wins with real excitement (never use emojis, pictograms or decorative Unicode), be honest about mistakes without being harsh, and always give one clear, practical lesson. Talk like a real coach sitting next to the player. Plain, simple English. Short sentences.",
    "LENGTH: ADAPT LENGTH BY IMPORTANCE: a few words for routine/good moves; 1-2 short sentences for notable moves; 2-4 sentences only for a serious blunder, missed mate/tactic or key plan idea. Choose the length yourself and vary phrasing naturally; never pad routine praise. Chat answers max ~120 words unless the player asks for more. No markdown headings, no tables. You may use **bold** for one key idea.",
    "GROUND TRUTH RULES (very important): The app gives you Stockfish and chess.js facts in a FACTS block. Use these supplied facts only. Engine grades and accuracy are estimates, especially at limited search depth; do not claim certainty beyond the supplied evidence. NEVER invent moves, evaluations or tactics. Only mention a move in SAN if it appears in FACTS (best move, PV lines, legal moves list, history) . If you are not sure, talk about ideas (king safety, development, centre, loose pieces) instead of naming moves. Never contradict the engine grade.",
    "TEACHING STYLE: Ask the player a question now and then to make him think ('What is your knight doing on a5?'). Use the thinking routine: 1) What did my opponent's last move threaten? 2) Checks, captures, threats for both sides. 3) Is my move safe (blunder check)? 4) Improve the worst piece. Teach principles: develop knights before bishops, castle early, control the centre, don't move the same piece twice in the opening, don't bring the queen out early, count attackers and defenders, look 2-4 moves ahead with forcing moves first.",
    "REPERTOIRE: Additional courses are Italian (quiet c3/d3 or Two Knights with d3), Scotch (central d4), Queen’s Gambit (c4, accepted or declined), and Scandinavian (...d5 then ...Qa5/...Qd6). Use authored facts for exact moves. Original courses: White: King's Indian Attack (Nf3, g3, Bg2, O-O, d3, Nbd2, e4, then e5 and a kingside attack with Nf1-h2-g4, h4) and London System (d4, Bf4 before e3, e3, Nf3, c3, Nbd2, Bd3, Bg3 vs ...Bd6, Ne5 + f4 attack, watch b2 vs ...Qb6). Black: King's Indian Defense vs 1.d4 (...Nf6, ...g6, ...Bg7, ...O-O, ...d6, ...e5; if d5 then ...Nd7/...Ne8, ...f5, ...f4, ...g5-g4 kingside storm) and Caro-Kann vs 1.e4 (...c6, ...d5, bishop out to f5/g4 before ...e6; vs Advance hit the base with ...c5; Classical ...Bf5-g6, ...Nd7, ...Ngf6; beware Nd6# trap after ...Nd7 with Qe2).",
    "APP MODES you can recommend: Opening academy (Learn, Guided, Independent, Transfer with spaced checks), Tactics (themes, Puzzle Rush, daily puzzle), Calculation trainer, Blunder Check, Spot the Trap, Finish the Win, Endgames, Coordinates, Seven fictional named bots or generic Stacy difficulty (optional coaching), Analysis board, Game Review (import from Lichess/Chess.com or PGN), Progress page, Today’s plan (personal tasks; use their personal daily plan)."
  ].join('\n');

  function buildFacts(ctx) {
    if (!ctx) return '';
    var lines = ['FACTS (from Stockfish + chess.js, trust these):'];
    Object.keys(ctx).forEach(function (k) {
      var v = ctx[k]; if (v == null || v === '') return;
      if (typeof v === 'object') v = JSON.stringify(v);
      lines.push('- ' + k + ': ' + String(v).slice(0, 600));
    });
    return lines.join('\n');
  }
  function progressFacts() {
    try { return App.progressSummary ? App.progressSummary() : ''; } catch (e) { return ''; }
  }

  function call(contents, opts) {
    opts = opts || {};
    var k = key();
    if (!k) return Promise.reject({ code: 'nokey', message: 'No API key yet. Add your free Gemini key in Settings.' });
    if (Date.now() < cooldownUntil && cooldownKey === k) return Promise.reject({ code: 'rate', message: 'Taking a short breather (free-tier rate limit). Try again in a few seconds.' });
    if (!opts.chain) opts.chain = pickModel(opts.purpose);
    var model = opts.chain[0];
    var body = {
      system_instruction: { parts: [{ text: SYSTEM + '\nPLAYER PROFILE: '+JSON.stringify({name:settings().name||null,profile:window.App&&App.state.profile||null,coachingPreferences:window.App&&App.state.trainingProfile||null})+'\n' + (opts.extraSystem || '') }] },
      contents: contents,
      generationConfig: { temperature: opts.temperature == null ? 0.8 : opts.temperature, maxOutputTokens: opts.maxTokens || 1200 }
    };
    if (!opts.noThinking && !noThink[model]) body.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
    lastCall = Date.now();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opts.timeout || 25000);
    return fetch(ENDPOINT + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        track(model,opts.purpose||'coach',j.usageMetadata,r.status);
        if (r.ok) {
          bump(model);
          var c = j.candidates && j.candidates[0], parts = c && c.content && c.content.parts || [];
          var text = parts.filter(function (p) { return p.text && !p.thought; }).map(function (p) { return p.text; }).join('').trim();
          if (!text) throw { code: 'empty', message: (c && c.finishReason === 'SAFETY') ? 'Gemini refused that one.' : 'Gemini sent an empty answer.' };
          return window.UI ? UI.strip(text) : text;
        }
        var msg = (j.error && j.error.message) || ('HTTP ' + r.status);
        // retry once without thinking config if the model doesn't support it
        if (r.status === 400 && /thinking|Unknown name|Invalid JSON payload|not supported/i.test(msg) && !opts.noThinking) { opts.noThinking = true; noThink[model] = 1; return call(contents, opts); }
        if (r.status === 400 && /API key/i.test(msg)) throw { code: 'badkey', message: 'That API key was rejected. Copy it again from Google AI Studio (it starts with "AIza").' };
        if (r.status === 403) throw { code: 'badkey', message: 'This key is not allowed to use the Gemini API (403). Make a new key in Google AI Studio.' };
        if (r.status === 404 || r.status === 429) {
          var daily = r.status === 404 || /per ?day|PerDay|daily/i.test(msg);
          if (daily) bump(model, true);
          if (opts.chain.length > 1) { opts.chain = opts.chain.slice(1); return call(contents, opts); }
          if (r.status === 404) throw { code: 'model', message: 'Model "' + model + '" was not found. Pick another model in Settings.' };
          cooldownUntil = Date.now() + (daily ? 600000 : 20000); cooldownKey = k;
          throw { code: 'rate', message: daily ? 'Today\'s free Gemini quota is used up (it resets at midnight Pacific time). Stacy will use her built-in coaching until then.' : 'Free-tier limit reached for now (429). Stacy will use her built-in coaching for a bit.' };
        }
        if (r.status >= 500) throw { code: 'server', message: 'Gemini is having trouble right now (' + r.status + '). Try again soon.' };
        throw { code: 'other', message: msg };
      });
    }, function (e) {
      clearTimeout(timer);
      throw { code: 'network', message: e && e.name === 'AbortError' ? 'Gemini took too long to answer.' : 'No connection to Gemini. Are you online?' };
    });
  }

  // Validate SAN moves mentioned in AI text against allowed set; returns {ok, bad:[]}
  var SAN_RE = /\b(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x[a-h][1-8](?:=[QRBN])?[+#]?|[a-h][1-8](?:=[QRBN])?[+#]?)/g;
  function validate(text, allowed) {
    var bad = [], seen = {}, m;
    var set = {}; (allowed || []).forEach(function (s) { set[s.replace(/[+#!?]/g, '')] = 1; });
    SAN_RE.lastIndex = 0;
    while ((m = SAN_RE.exec(text))) {
      var s = m[1].replace(/[+#]/g, '');
      if (/^[a-h][1-8]$/.test(s) && /(?:\b(?:on|at|from|to|square)\s+|\b(?:king|queen|rook|bishop|knight|pawn)\s+(?:on\s+)?)$/i.test(text.slice(Math.max(0, m.index - 28), m.index))) continue; // board-square descriptions, not move recommendations
      if (!set[s] && !seen[s]) { bad.push(m[1]); seen[s] = 1; }
    }
    return { ok: bad.length === 0, bad: bad };
  }
  function allowedFrom(fen, extraSans) {
    var out = (extraSans || []).slice();
    try { var g = new Chess(fen); out = out.concat(g.moves()); } catch (e) { }
    return out;
  }

  /* Rewrite built-in feedback in Stacy's voice. Returns Promise<string|null>. null = keep template. */
  function explain(kind, ctx, template) {
    if (!enabled()) return Promise.resolve(null);
    var ck = kind + '|' + (ctx && ctx.fen) + '|' + (ctx && ctx.move) + '|' + (ctx && ctx.question);
    if (cache[ck]) return Promise.resolve(cache[ck]);
    // stay inside free-tier limits: automatic explanations at most every 3.5 s (questions & reviews always go)
    var important = kind === 'question' || kind === 'review' || kind === 'move' || kind === 'hint' || kind === 'simplify';
    if (!important && Date.now() - lastAuto < 6000) return Promise.resolve(null);
    lastAuto = Date.now();
    var prompt = buildFacts(ctx) + '\nPLAYER PROGRESS: ' + progressFacts() +
      '\nBUILT-IN COACH NOTE (accurate, rewrite it in your own voice, keep every chess fact): ' + template +
      '\nTASK: ' + ({
        move: 'Give the player feedback on the move they just played.',
        daily: 'Write the player a short (2 sentences), energetic good-morning message for today: celebrate his progress and push him to the open task.',
        moveLite: 'Give the player adaptive feedback: a few words if routine, 1-2 sentences if notable, 2-4 only if truly critical on the move they just played.',
        question: 'Ask the player this question in your own words before revealing anything. Do NOT give away the answer.',
        lesson: 'Explain this opening move/idea to the player in an exciting, clear way.',
        puzzle: 'React to the player solving or missing this puzzle and give the key lesson.',
        review: 'Summarise this game for the player: 1-2 strengths, the biggest lesson, and what to train next.',
        hint: 'Give the player a hint that nudges him without giving the move away.',
        simplify: 'The player said: I still do not understand. Explain the SAME chess point again, much more simply, in different words. Use literal factual language, not metaphors or new quiz questions. Level 1 = tiny numbered steps; level 2 = plain meaning and concrete consequences; level 3 = one rule plus what to inspect. The level is in FACTS (question). Max 60 words, no new moves.'
      }[kind] || 'Coach the player.');
    var allowed = allowedFrom(ctx && ctx.fen, (ctx && ctx.allowedSans) || []);
    return call([{ role: 'user', parts: [{ text: prompt }] }], { maxTokens: 900 }).then(function (t) {
      var v = validate(t, allowed.concat(sansIn(template)));
      if (!v.ok) { console.warn('Stacy AI mentioned unverified moves', v.bad); return null; }
      cache[ck] = t; return t;
    }).catch(function (e) { App && App.aiStatus && App.aiStatus(e); return null; });
  }
  function sansIn(text) { var out = [], m; SAN_RE.lastIndex = 0; while ((m = SAN_RE.exec(text || ''))) out.push(m[1]); return out; }

  /* Free chat with Stacy. history: [{role:'user'|'model', text}] */
  function chat(history, ctx) {
    var facts = buildFacts(ctx) + '\nPLAYER PROGRESS: ' + progressFacts();
    var contents = history.slice(-10).map(function (h, i, arr) {
      var t = h.text;
      if (i === arr.length - 1 && h.role === 'user') t = facts + '\n\nThe player says: ' + t;
      return { role: h.role, parts: [{ text: t }] };
    });
    return call(contents, { maxTokens: 1500, purpose: 'chat' }).then(function (t) {
      var allowed = allowedFrom(ctx && ctx.fen, (ctx && ctx.allowedSans) || []);
      // Only grounded engine/board facts authorize moves; user chat text is not a legal-move source.
      var v = validate(t, allowed);
      if (!v.ok && ctx && ctx.fen) t += '\n\n(Stacy double-check: I couldn\'t verify ' + v.bad.slice(0, 3).join(', ') + ' on the current board, so treat those as ideas, not exact moves.)';
      return t;
    });
  }
  function test() { return call([{ role: 'user', parts: [{ text: 'Say hi to the player in one short excited sentence as his chess coach Stacy.' }] }], { maxTokens: 400 }); }

  window.AI = { ledger:ledger, track:track, audioSeconds:audioSeconds, usage: usage, _bump: bump, pacificDay: pacificDay, MODELS: MODELS, enabled: enabled, explain: explain, chat: chat, test: test, validate: validate, call: call, _endpoint: ENDPOINT };
})();

/* Stacy’s natural Gemini voice. No browser-generated voice. Text remains available on every failure. */
(function () {
  var TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
  var VOICES = ['Laomedeia', 'Leda', 'Zephyr', 'Aoede', 'Autonoe', 'Sulafat', 'Kore', 'Achernar'];
  var cache = {}, cacheOrder = [], ctx = null, current = null, ttsCooldown = 0, seq = 0, requestController = null,busy=false,pendingSpeech=null;
  function S() { return (window.App && App.state && App.state.settings) || {}; }

  function audioCtx() {
    if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    return ctx;
  }
  // Audio must be unlocked from a user gesture on iOS.
  function unlock() {var c=audioCtx();if(c&&c.state==='suspended')c.resume().catch(function(){});}
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
  function status(message,err,manual) {
    Voice.status=message;Voice.lastError=err||null;window.dispatchEvent(new Event('stacy-voice'));
    document.querySelectorAll('#voiceStatus').forEach(function(x){x.textContent=message;});
    if(err&&window.App){if(manual||Voice._lastNotice!==message){App.toast(message,'warn',4800);Voice._lastNotice=message;}}
  }
  // Make chess text speakable
  var PIECE = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  function speakable(t,opts) {
    t = (window.UI ? UI.strip(t) : String(t || '')).replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '').replace(/\(Stacy double-check[^)]*\)/g, '');
    t = t.replace(/Line: .*$/m, '');
    t = t.replace(/\b(\d+)\.(\.\.)?\s?/g, '');
    t = t.replace(/\bO-O-O\b/g, 'castles long').replace(/\bO-O\b/g, 'castles');
    t = t.replace(/\b([KQRBN])([a-h]?[1-8]?)(x?)([a-h][1-8])(=([QRBN]))?([+#]?)/g, function (m, p, dis, x, sq, _, pr, ck) {
      return PIECE[p] + (x ? ' takes ' : ' ') + sq + (pr ? ' promotes to ' + PIECE[pr] : '') + (ck === '#' ? ', checkmate' : ck ? ', check' : '');
    });
    t = t.replace(/\b([a-h])x([a-h][1-8])(=([QRBN]))?([+#]?)/g, function (m, f, sq, _, pr, ck) { return f + ' takes ' + sq + (pr ? ' promotes to ' + PIECE[pr] : '') + (ck === '#' ? ', checkmate' : ck ? ', check' : ''); });
    t = t.replace(/\b([a-h][1-8])\+/g, '$1, check').replace(/\b([a-h][1-8])#/g, '$1, checkmate');
    t = t.replace(/\?\?/g, '').replace(/[\u2605\u2713\u2717\u21a9↺\u25b6\u23e9\u23ed•→←]/g, ''); try { t = t.replace(new RegExp('[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}\\u{20E3}]', 'gu'), ''); } catch (e) { } t = t.replace(/\s+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
    // keep it short to save quota: first 2-3 sentences, ~260 chars
    var parts = t.match(/[^.!?]+[.!?]*/g) || [t], out = '';
    for (var i = 0; i < parts.length; i++) { if ((out + parts[i]).length > (opts&&opts.priority>=3?650:opts&&opts.priority===2?420:260) && out) break; out += parts[i]; }
    return out.trim();
  }

  function setTalking(on) {
    document.querySelectorAll('.avatar').forEach(function (a) { a.classList.toggle('talking', !!on); });
  }
  function stop(clearQueue) {
    seq++;busy=false;if(clearQueue!==false&&pendingSpeech){pendingSpeech.resolve(false);pendingSpeech=null;}
    if (current && current.stop) { try { current.stop(); } catch (e) { } }
    current = null;
    if(requestController){requestController.abort();requestController=null;}
    setTalking(false);
  }

  function b64ToBytes(b64) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function pcmToWav(pcm, rate) {
    var len = pcm.length, buf = new ArrayBuffer(44 + len), v = new DataView(buf);
    function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + len, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len, true);
    new Uint8Array(buf, 44).set(pcm); return buf;
  }
  function findAudio(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.inlineData && o.inlineData.data) return { data: o.inlineData.data, mime: o.inlineData.mimeType || '' };
    if (o.inline_data && o.inline_data.data) return { data: o.inline_data.data, mime: o.inline_data.mime_type || '' };
    if (o.type === 'audio' && o.data) return { data: o.data, mime: o.mime_type || o.mimeType || 'audio/wav' };
    for (var k in o) { var r = findAudio(o[k]); if (r) return r; }
    return null;
  }
  function toWavBuffer(a) {
    var bytes = b64ToBytes(a.data);
    if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) return bytes.buffer; // "RIFF"
    var m = /rate=(\d+)/.exec(a.mime); return pcmToWav(bytes, m ? +m[1] : 24000);
  }

  function geminiTTS(text) {
    var key = (S().apiKey || '').trim();
    if (!key) return Promise.reject({ code: 'nokey', message:'Voice needs your Gemini key. Add it in Settings.' });
    if (Date.now() < ttsCooldown) return Promise.reject({ code:'rate',message:'Gemini voice is rate-limited. Please wait a minute and tap the speaker again.' });
    if (window.AI && AI.usage().ex.tts) return Promise.reject({ code: 'rate', message:'Gemini voice daily quota is used up. Text coaching still works; check AI Studio for your reset.' });
    var voice = S().ttsVoice || VOICES[0];
    var ck = voice + '|' + text;
    if (cache[ck]) return Promise.resolve(cache[ck]);
    function attempt(i, legacy) {
      var model = TTS_MODELS[i];
      var vc = legacy ? { prebuiltVoiceConfig: { voiceName: voice } } : { voice: voice };
      var part = { text: text }; if (!legacy) part.speech_metadata = { style: 'cheerful, warm and energetic, like an excited coach' };
      requestController=new AbortController();var controller=requestController;var timer=setTimeout(function(){controller.abort();},20000);
      return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        signal:controller.signal,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [part] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: vc } } })
      }).then(function (r) {
        clearTimeout(timer);if(requestController===controller)requestController=null;
        return r.json().catch(function () { return {}; }).then(function (j) {
          AI.track(model,'tts',j.usageMetadata,r.status);
          var msg = (j.error && j.error.message) || '';
          if (r.ok) { var a = findAudio(j); if (!a) throw { code:'empty',message:'Gemini returned no voice audio. Try again later.' }; if (window.AI) AI._bump('tts'); return a; }
          if (r.status === 400 && !legacy && /voice|speech_metadata|Unknown name/i.test(msg)) return attempt(i, true);
          if ((r.status === 404 || r.status === 400) && i + 1 < TTS_MODELS.length) return attempt(i + 1, legacy);
          if (r.status === 429) { if (/per ?day|PerDay|daily/i.test(msg) && window.AI) AI._bump('tts', true); else if (i + 1 < TTS_MODELS.length) return attempt(i + 1, legacy); ttsCooldown = Date.now() + 60000; }
          throw { code: r.status === 429 ? 'rate' : 'http'+r.status,message:r.status===429?'Gemini voice quota/rate limit reached. Text coaching is still available.':r.status===403||r.status===401?'Gemini voice key was rejected. Check your key and project access in Settings.':r.status===404?'Gemini voice model is unavailable for this key. Try again later.':'Gemini voice failed ('+r.status+'). '+msg.slice(0,160) };
        });
      }).catch(function(e){clearTimeout(timer);if(requestController===controller)requestController=null;throw e;});
    }
    return attempt(0).then(function (a) {
      var c = audioCtx(); if (!c) throw { code: 'noaudio' };
      var wav = toWavBuffer(a);
      return new Promise(function (res, rej) { c.decodeAudioData(wav, res, rej); });
    }).then(function (buf) {
      AI.audioSeconds(buf.duration||0);cache[ck] = buf; cacheOrder.push(ck);
      if (cacheOrder.length > 40) delete cache[cacheOrder.shift()];
      return buf;
    });
  }

  function playBuffer(buf, my) {
    var c = audioCtx(); if (!c || my !== seq) return;
    var src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = S().voiceRate || 1;
    var gain = c.createGain(); gain.gain.value = 1; src.connect(gain); gain.connect(c.destination);
    src.onended = function () { if (my === seq) {setTalking(false);busy=false;status('Gemini voice ready.');drain();} };
    current = src; setTalking(true); src.start();
    Voice.lastEngine = 'gemini';status('Speaking with Gemini.');
  }
  // Non-blocking: never substitute a robotic voice if the API is slow or unavailable.
  function speakNow(text,opts) {
    opts=opts||{};var s=S();if(s.voiceOn===false||s.muted||(!opts.force&&s.autoSpeak===false))return Promise.resolve(false);
    var t=speakable(text,opts);if(!t)return Promise.resolve(false);stop(false);busy=true;var my=seq;status('Preparing Gemini voice…');
    return geminiTTS(t).then(function(buf){if(my!==seq)return false;var c=audioCtx();if(!c||c.state==='suspended'){var e={code:'gesture',message:'Tap a speaker button to enable audio on this device.'};busy=false;status(e.message,e,opts.force);drain();return false;}playBuffer(buf,my);return true;}).catch(function(e){if(my!==seq)return false;setTalking(false);Voice.lastEngine=null;var message=e.message||'Gemini voice could not connect. Check your connection and try again.';if(e.name==='AbortError')message='Gemini voice took too long. Text coaching is still available; tap the speaker to retry.';busy=false;status(message,e,opts.force);drain();return false;});
  }
  function drain(){if(busy||!pendingSpeech)return;var next=pendingSpeech;pendingSpeech=null;speakNow(next.text,next.opts).then(next.resolve);}
  function speak(text,opts){opts=opts||{};if(busy){return new Promise(function(resolve){var priority=opts.priority||1;if(pendingSpeech&&priority<(pendingSpeech.opts.priority||1)){resolve(false);return;}if(pendingSpeech)pendingSpeech.resolve(false);pendingSpeech={text:text,opts:opts,resolve:resolve};});}return speakNow(text,opts);}
  window.Voice={speak:speak,stop:stop,speakable:speakable,VOICES:VOICES,status:'Gemini voice only. Add your key in Settings to listen.',_geminiTTS:geminiTTS,_pcmToWav:pcmToWav,unlock:unlock,isBusy:function(){return busy;},queued:function(){return !!pendingSpeech;},isSpeaking:function(){return document.querySelector('.avatar.talking')!=null;}};
})();
