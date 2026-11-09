/* Stacy Chess - app core: state, sounds, UI kit, Stacy coach panel, router, home, hubs, progress, settings, chat */
(function () {
  var App = window.App = { screens: {}, state: null };
  /* v12: safe element lookup for event bindings. A missing element (e.g. a button that one layout or plan
     state does not render) used to throw "null is not an object" and replace the whole screen with the error
     card. Now the handler goes to a detached placeholder and the miss is logged once. */
  App.q = function (root, sel) { var el = root && root.querySelector ? root.querySelector(sel) : null; if (el) return el; App.q.missing.push(sel); if (window.console && console.warn) console.warn('[Stacy] element not rendered: ' + sel); return {}; };
  App.q.missing = [];
  var KEY = 'stacy-chess-v1';
  var DEFAULTS = {
    created: Date.now(), xp: 0, tacticsRating: 800, ratingHist: [],
    streak: { days: 0, last: null, best: 0 }, activeDays: {},
    daily: { date: null, c: {} },
    stats: { puzzles: 0, solved: 0, themes: {}, rushBest: 0, stormBest: 0, coordsBest: { w: 0, b: 0 }, calc: [0, 0], blunder: [0, 0], traps: [0, 0], finish: [0, 0], endgames: {}, games: 0, wins: 0, draws: 0, losses: 0, accuracy: [], lessons: 0 },
    srs: {}, learned: {}, games: [], mistakes: [], seenPuzzles: {}, puzzleQueue: [], ach: {}, chat: [],
    settings: { theme: 'ice', board: 'theme', pieceSet: 'cburnett', coords: true, sound: true, voiceOn: true, autoSpeak: true, voiceRate: 1, ttsEngine: 'gemini', ttsVoice: 'Laomedeia', aiOn: true, apiKey: '', aiModel: 'auto', safety: true, legal: true, premoves:false,level: 4, playColor: 'w', name: '', muted: false }
  };
  function merge(d, s) { if (!s || typeof s !== 'object' || Array.isArray(d)) return s === undefined ? d : s; var o = {}; for (var k in d) o[k] = merge(d[k], s[k]); for (k in s) if (!(k in o)) o[k] = s[k]; return o; }
  try { App.state = merge(JSON.parse(JSON.stringify(DEFAULTS)), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { App.state = JSON.parse(JSON.stringify(DEFAULTS)); }
  // v12: a true first run (nothing saved yet) goes straight to the friendly setup (name → experience),
  // not to the "upgrade / start fresh" consent screen meant for people with old progress.
  try { if (localStorage.getItem(KEY) == null) { App.state.upgradeVersion = 3; App.state.trainingSetupPending = true; App.state.firstRun = Date.now(); } } catch (e) { }
  if (App.state.version !== 2) { App.state.version = 2; App.state.settings.name = ''; App.state.chat = []; delete App.state.dailyMsg; }
  if (App.state.settings.theme === 'crimson' || !['ice','midnight'].includes(App.state.settings.theme)) App.state.settings.theme = 'ice'; // v7: Light/Dark only; legacy Graphite → Light
  App.state.settings.board = 'theme'; App.state.settings.ttsEngine = 'gemini'; delete App.state.settings.browserVoice;
  App.freshState=function(){var s=JSON.parse(JSON.stringify(DEFAULTS));s.created=Date.now();return s;};
  window.APP_SETTINGS = App.state.settings;
  var saveT; App.save = function () { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(App.state)); } catch (e) { App.toast('Storage full: some progress may not save', 'err'); } }, 150); };
  App.saveNow = function () { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(App.state)); } catch (e) { } };
  App.today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ---------- sounds (synthesised, no files) ----------
  var actx;
  App.sound = function (type) {
    if (!App.state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      var tone = function (f, d, start, vol, wave) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = wave || 'sine'; o.frequency.setValueAtTime(f, t + start);
        g.gain.setValueAtTime(0.0001, t + start); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + d);
        o.connect(g); g.connect(actx.destination); o.start(t + start); o.stop(t + start + d + 0.02);
      };
      var knock = function (start, vol, f) { // wooden "clack"
        var len = 0.06, buf = actx.createBuffer(1, actx.sampleRate * len, actx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
        var s = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = f || 1800; bp.Q.value = 1.2; g.gain.value = vol || 0.9;
        s.buffer = buf; s.connect(bp); bp.connect(g); g.connect(actx.destination); s.start(t + start);
      };
      ({
        move: function () { knock(0, 1, 1500); },
        capture: function () { knock(0, 1.1, 1100); knock(0.05, 0.7, 2300); },
        check: function () { knock(0, 1, 1500); tone(880, 0.15, 0.02, 0.08, 'triangle'); },
        castle: function () { knock(0, 0.9, 1500); knock(0.09, 0.9, 1300); },
        ok: function () { tone(660, 0.12, 0, 0.12); tone(990, 0.18, 0.09, 0.12); },
        err: function () { tone(220, 0.18, 0, 0.12, 'triangle'); tone(180, 0.22, 0.1, 0.1, 'triangle'); },
        win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.25, i * 0.1, 0.12); }); },
        click: function () { tone(1200, 0.03, 0, 0.04); },
        tick: function () { tone(1600, 0.02, 0, 0.03, 'square'); }
      }[type] || function () { })();
    } catch (e) { }
  };
  App.moveSound = function (m, game) {
    if (!m) return;
    if (game && game.in_check()) App.sound('check');
    else if (m.flags && (m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0)) App.sound('castle');
    else if (m.captured) App.sound('capture'); else App.sound('move');
  };

  // ---------- UI kit ----------
  App.esc = function (s) { return String(s == null ? '' : s).replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u20E3]/gu,'').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  App.html = function (str) { var t = document.createElement('template'); t.innerHTML = UI.markup(str.trim()); return t.content.firstElementChild; };
  App.md = function (s) { return UI.markup(App.esc(UI.strip(s).replace(/^#{1,6}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '• ')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>')); };
  var toastWrap;
  App.copy = function (text, label) {
    function manual() { var sh = App.sheet('<h3>' + App.esc(label || 'Copy') + '</h3><p class="small muted">Tap and hold to copy.</p><textarea class="input" readonly style="min-height:160px">' + App.esc(text) + '</textarea>'); var t = sh.el.querySelector('textarea'); setTimeout(function () { t.focus(); t.select(); }, 50); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { App.toast((label || 'Text') + ' copied OK', 'ok'); }, manual); else manual();
  };
  App.download = function (name, text, type) {
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) { App.copy(text, name); }
  };
  App.reduced = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || (App.state && App.state.settings && App.state.settings.anim === false); };
  App.toast = function (msg, type, ms) {
    if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-wrap'; document.body.appendChild(toastWrap); }
    var t = App.html('<div class="toast ' + (type || '') + '">' + App.esc(msg) + '</div>');
    toastWrap.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 320); }, ms || 2600);
  };
  App.sheet = function (inner, opts) {
    opts = opts || {};
    var s = App.html('<div class="scrim"><div class="sheet" role="dialog"><div class="grab"></div></div></div>');
    var body = s.firstChild;
    if (typeof inner === 'string') body.insertAdjacentHTML('beforeend', inner); else body.appendChild(inner);
    var close = function () { s.classList.add('out'); setTimeout(function () { s.remove(); }, 260); if (opts.onClose) opts.onClose(); };
    s.addEventListener('click', function (e) { if (e.target === s && !opts.modal) close(); });
    document.body.appendChild(s);
    return { el: body, close: close };
  };
  App.confetti = function () {
    var c = document.createElement('div'); c.className = 'confetti';
    var cols = ['#7fd8f0', '#bfefff', '#f396aa', '#a4b7ef', '#f3d38e', '#eefaff'];
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
      p.style.animationDelay = Math.random() * 0.5 + 's'; p.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
      c.appendChild(p);
    }
    document.body.appendChild(c); setTimeout(function () { c.remove(); }, 3000);
  };
  // segmented control with sliding pill: items [{id,label}]
  App.seg = function (items, value, onChange, cls) {
    var el = App.html('<div class="seg ' + (cls || '') + '"><span class="seg-ind"></span></div>'), ind = el.firstChild;
    items.forEach(function (it) {
      var b = document.createElement('button'); b.textContent = it.label; b.dataset.id = it.id; b.type = 'button';
      b.onclick = function () { set(it.id); App.sound('click'); onChange && onChange(it.id); };
      el.appendChild(b);
    });
    function set(id) {
      var btns = [].slice.call(el.querySelectorAll('button')), from = btns.findIndex(function (b) { return b.classList.contains('on'); }), to = btns.findIndex(function (b) { return b.dataset.id === String(id); });
      el.lastDir = from >= 0 && to >= 0 && to !== from ? (to > from ? 1 : -1) : 0;
      value = id;
      btns.forEach(function (b) { b.classList.toggle('on', b.dataset.id === String(id)); b.setAttribute('aria-pressed', b.dataset.id === String(id)); });
      requestAnimationFrame(function () { var on = el.querySelector('button.on'); if (on) { if (App.ui && App.ui.movePill) App.ui.movePill(ind, on); else { ind.style.width = on.offsetWidth + 'px'; ind.style.transform = 'translateX(' + on.offsetLeft + 'px)'; } } });
    }
    set(value); el.set = set;
    setTimeout(function () { set(value); }, 60);
    return el;
  };
  App.tabs = function (items, value, onChange) {
    var el = App.html('<div class="tabs"><span class="tab-ind"></span></div>'), ind = el.firstChild;
    items.forEach(function (it) { var b = document.createElement('button'); b.textContent = it.label; b.dataset.id = it.id; b.onclick = function () { set(it.id); onChange.call(el, it.id); }; el.appendChild(b); });
    function set(id) {
      var btns = [].slice.call(el.querySelectorAll('button')), from = btns.findIndex(function (b) { return b.classList.contains('on'); }), to = btns.findIndex(function (b) { return b.dataset.id === id; });
      el.lastDir = from >= 0 && to >= 0 && to !== from ? (to > from ? 1 : -1) : 0;
      btns.forEach(function (b) { b.classList.toggle('on', b.dataset.id === id); b.setAttribute('aria-pressed', b.dataset.id === id); });
      requestAnimationFrame(function () { var on = el.querySelector('button.on'); if (on) { if (App.ui && App.ui.movePill) App.ui.movePill(ind, on); else { ind.style.width = on.offsetWidth + 'px'; ind.style.transform = 'translateX(' + on.offsetLeft + 'px)'; } } });
    }
    set(value); setTimeout(function () { set(value); }, 60); el.set = set; return el;
  };
  App.btnBusy = function (btn, p) {
    btn.classList.add('loading');
    return Promise.resolve(p).then(function (v) { btn.classList.remove('loading'); btn.classList.add('success'); setTimeout(function () { btn.classList.remove('success'); }, 1200); return v; },
      function (e) { btn.classList.remove('loading'); throw e; });
  };
  App.avatar = function (mood, size) { return '<div class="avatar ' + (size || '') + '">' + window.stacyAvatar(mood) + '</div>'; };

  // ---------- Stacy coach panel ----------
  function Coach(container, opts) {
    opts = opts || {};
    this.compact=!!opts.compact; this.max = 1; this.hist = []; // one message at a time; older ones go to a small history list
    this.el = App.html('<div class="card coach-card"><div class="coach">' + App.avatar('happy') + '<div class="bubbles"></div></div></div>');
    this.av = this.el.querySelector('.avatar'); this.box = this.el.querySelector('.bubbles');
    var self0 = this; this.histBtn = App.html('<button class="icon-btn coach-hist hide" title="Earlier messages" aria-label="Earlier messages">~i:layers~</button>'); this.el.querySelector('.coach').appendChild(this.histBtn);
    this.histBtn.onclick = function () { App.sheet('<h3>Earlier messages</h3><div class="col small">' + self0.hist.slice().reverse().map(function (t) { return '<div class="bubble old-msg">' + App.md(t) + '</div>'; }).join('') + '</div>'); };
    container.appendChild(this.el);
  }
  Coach.prototype.mood = function (m) {
    this.av.innerHTML = window.stacyAvatar(m);
    // Portrait stays still; only the speaking mouth is animated.
  };
  Coach.prototype.clear = function () {this._messageSerial=(this._messageSerial||0)+1;if(App.explanationOpen&&App.explanationOpen.coach===this)App.closeExplanation('replace');clearTimeout(this._queueTimer);this._pendingComment=null;this._currentComment=null;this.box.innerHTML = '';window.Voice&&Voice.stop();};
  /* say(text, {mood, cls:'good'|'bad'|'warn', head:html, actions:[{label,cls,fn}], line, ai:{kind,ctx}, speak, keep}) */
  Coach.prototype._sayNow = function (text, o) {
    o = o || {};
    if(App.explanationOpen&&App.explanationOpen.coach===this)App.closeExplanation('replace');var messageSerial=this._messageSerial=(this._messageSerial||0)+1,stageAt=App.lastStage,fenAt=stageAt&&stageAt.game&&stageAt.game.fen();
    var self = this, fullText = text;
    function short(t,isAi){
      t=UI.strip(t);var grade=o.ai&&o.ai.ctx&&o.ai.ctx.grade||'',critical=o.cls==='bad'||/blunder|missed|forced (mate|checkmate)|key plan|key idea|decisive|mate in/i.test(grade+' '+t),routine=o.cls==='good'&&/^(Book|Best|Excellent|Good)$/i.test(grade)&&!/key plan|pawn break|mate in/i.test(t),limit=critical?4:2,maxWords=critical?90:routine?12:42;
      if(critical&&!isAi){var starts=['is a blunder we can learn from.','is the critical mistake here.','leaves a serious problem to solve.'];t=t.replace(/is a blunder\./,starts[Math.floor(Math.random()*starts.length)]).replace('Why? ',['Here’s why: ','The important point: ','Look at the reply: '][Math.floor(Math.random()*3)]);}
      if(routine&&!isAi){var pool=/Book/i.test(grade)?['That fits our setup.','A familiar plan, nicely done.','Good—stay with the setup.']:/Best/i.test(grade)?['Sharp choice.','That’s the engine’s top move.','Excellent focus.']:['Solid move.','Good judgement.','That keeps us on track.'];var choices=pool.filter(function(x){return x!==self._lastPhrase;});t=choices[Math.floor(Math.random()*choices.length)];self._lastPhrase=t;}
      var parts=t.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)||[t];t=parts.slice(0,limit).join(' ').trim();var words=t.split(/\s+/);return words.length>maxWords?words.slice(0,maxWords).join(' ').replace(/[.,;:!?]+$/,'')+'…':t;
    }
    if(this.compact){text=short(text);o.line='';o.keep=false;}
    if (!o.keep) while (this.box.children.length >= this.max) { var gone = this.box.firstChild; if (gone.text) { this.hist.push(gone.text); if (this.hist.length > 12) this.hist.shift(); this.histBtn.classList.remove('hide'); } this.box.removeChild(gone); }
    if (o.mood) this.mood(o.mood);
    var b = App.html('<div class="bubble ' + (o.cls || '') + '"></div>');
    var render = function (t, isAi) {
      b.fullText = isAi ? t : fullText;
      if(self.compact){t=short(t,isAi);self._readUntil=Date.now()+Math.max(3000,Math.min(24000,t.split(/\s+/).length/3.5*1000));}
      b.classList.toggle('ai', !!isAi);
      b.innerHTML = (o.head ? '<div class="b-head">' + o.head + '<span class="grow"></span><button class="icon-btn spk" title="Hear it">~i:volume~</button></div>' : '') +
        '<div class="b-text">' + App.md(t) + '</div>' + (o.line ? '<div class="line">' + App.esc(o.line) + '</div>' : '');
      if (!o.head) b.insertAdjacentHTML('afterbegin', '<button class="icon-btn spk" style="float:right;margin-left:6px" title="Hear it">~i:volume~</button>');
      b.querySelector('.spk').onclick = function () { window.Voice && Voice.speak(t, { force: true }); };
      if (o.actions && o.actions.length) {
        var a = document.createElement('div'); a.className = 'actions';
        o.actions.forEach(function (ac) {
          var x = document.createElement('button'); x.className = 'btn sm ' + (ac.cls || ''); x.textContent = ac.label;
          x.onclick = function () { var now = Date.now(); if (x.disabled || now - (b._lastTap || 0) < 400) return; b._lastTap = now; if (ac.once) [].forEach.call(a.querySelectorAll('button'), function (y) { y.disabled = true; }); App.sound('click'); try { x.blur(); } catch (e) { } ac.fn(x); }; a.appendChild(x);
        });
        b.appendChild(a);
      }
      b.text = t;
      var explanatory = o.explain === true || (o.explain !== false && !o.actions_noexplain && (o.head || o.line || o.cls === 'bad' || o.cls === 'warn' || o.cls === 'good' || /because|idea|why|plan|so that|which means|threat|attack|defend|the point/i.test(UI.strip(t))) && UI.strip(t).split(/\s+/).length >= 9 && !/\?\s*$/.test(UI.strip(t)));
      if (explanatory && App.simplify) { var ab = b.querySelector('.actions'); if (!ab) { ab = document.createElement('div'); ab.className = 'actions'; b.appendChild(ab); } var u = document.createElement('button'); u.className = 'btn sm ghost dunno'; u.textContent = 'I still don’t understand'; u.onclick = function () { if (u.disabled) return; App.simplify(self, o._origText || UI.strip(b.fullText || t), (o._simpleLevel || 0) + 1, o); }; ab.appendChild(u); }
      App.addMore(b);
    };
    render(text, false);
    this.box.appendChild(b);
    App.addMore(b);
    var speakIt = o.speak !== false;
    if (o.ai && window.AI && AI.enabled()) {
      var dots = App.html('<div class="typing" title="Stacy is thinking"><i></i><i></i><i></i></div>');
      b.appendChild(dots);b._aiPending=true;
      AI.explain(o.ai.kind, o.ai.ctx, text).then(function (t) {
        dots.remove();b._aiPending=false;
        if(!b.isConnected||self._messageSerial!==messageSerial||App.explanationOpen&&App.explanationOpen.coach===self||App.lastStage!==stageAt||stageAt&&stageAt.game&&stageAt.game.fen()!==fenAt)return;
        if (t && b.isConnected) { render(t, true); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; if (speakIt) Voice.speak(b.text,{priority:o._priority||(o.cls==='bad'?3:o.cls==='warn'?2:1)}); }
        else if (speakIt) Voice.speak(b.text,{priority:o._priority||(o.cls==='bad'?3:o.cls==='warn'?2:1)});
      });
    } else if (speakIt && window.Voice) Voice.speak(b.text,{priority:o._priority||(o.cls==='bad'?3:o.cls==='warn'?2:1)});
    return b;
  };
  Coach.prototype.say=function(text,opts){
    if(!this.compact)return this._sayNow(text,opts);opts=Object.assign({},opts||{});if(opts.now){clearTimeout(this._queueTimer);this._pendingComment=null;this._currentComment={text:text,opts:opts,priority:3};window.Voice&&Voice.stop&&Voice.stop();var bn=this._sayNow(text,opts);var me=this;this._queueTimer=setTimeout(function(){me._currentComment=null;},Math.max(2500,(me._readUntil||0)-Date.now()));return bn;}var self=this,context=App.context(),ply=App.lastStage&&App.lastStage.game?App.lastStage.game.history().length:0;
    var priority=/YOU WON|Stacy wins|A draw!/i.test(text)?4:opts.cls==='bad'||/key plan|key idea|decisive|mate in/i.test(text)||opts.ai&&/blunder|mistake|miss/i.test(opts.ai.ctx&&opts.ai.ctx.grade||'')?3:opts.cls==='warn'||opts.actions&&opts.actions.length?2:1;
    opts._priority=priority;var entry={text:text,opts:opts,priority:priority,fen:context.fen,ply:ply};
    if(opts.actions)opts.actions=opts.actions.map(function(a){var copy=Object.assign({},a);copy.fn=function(btn){if(entry.fen&&App.context().fen!==entry.fen&&priority!==4){App.toast('That position has changed. Use Takeback or Game Review for this lesson.');if(btn)btn.disabled=true;return;}a.fn(btn);};return copy;});
    function stale(e){var now=App.lastStage&&App.lastStage.game?App.lastStage.game.history().length:e.ply;return e.priority<4&&(Math.abs(now-e.ply)>3||e.priority<3&&e.fen&&App.context().fen!==e.fen);}
    function pump(){clearTimeout(self._queueTimer);if(!self.el.isConnected){self._pendingComment=null;return;}var b=self.box.lastElementChild,busy=window.Voice&&Voice.isBusy&&Voice.isBusy();if(self._currentComment&&(busy||b&&b._aiPending||Date.now()<(self._readUntil||0))){self._queueTimer=setTimeout(pump,160);return;}var pending=self._pendingComment;self._pendingComment=null;if(!pending||stale(pending))return;self._currentComment=pending;self._sayNow(pending.text,pending.opts);self._queueTimer=setTimeout(pump,160);}
    if(this._currentComment){if(this._pendingComment&&stale(this._pendingComment))this._pendingComment=null;if(!this._pendingComment||priority>=this._pendingComment.priority)this._pendingComment=entry;clearTimeout(this._queueTimer);this._queueTimer=setTimeout(pump,160);return null;}
    this._currentComment=entry;var b=this._sayNow(text,opts);this._queueTimer=setTimeout(pump,160);return b;
  };
  App.addMore = function (b) { setTimeout(function () { var t = b.querySelector('.b-text'); if (!t || !b.isConnected || b.querySelector('.more-btn')) return; if (t.scrollHeight > t.clientHeight + 2 || (b.fullText && b.fullText !== b.text)) { var m = document.createElement('button'); m.className = 'more-btn'; m.textContent = 'more'; m.onclick = function () { App.sheet('<div class="row" style="margin-bottom:8px">' + App.avatar('happy') + '<h3 class="grow">Coach</h3></div><div class="small">' + App.md(b.fullText || b.text || t.textContent) + '</div>'); }; t.after(m); } }, 30); };
  App.Coach = Coach;

  // ---------- progress / XP / streak / achievements ----------
  var ACH = [
    ['first-puzzle', '~i:tactics~', 'First puzzle', function (s) { return s.stats.solved >= 1; }],
    ['puzzles-50', '~i:streak~', '50 puzzles', function (s) { return s.stats.solved >= 50; }],
    ['puzzles-250', '~i:trophy~', '250 puzzles', function (s) { return s.stats.solved >= 250; }],
    ['streak-3', '~i:calendar~', '3-day streak', function (s) { return s.streak.best >= 3; }],
    ['streak-7', '~i:calendar~', '7-day streak', function (s) { return s.streak.best >= 7; }],
    ['streak-30', '~i:diamond~', '30-day streak', function (s) { return s.streak.best >= 30; }],
    ['rush-10', '~i:bolt~', 'Rush 10+', function (s) { return s.stats.rushBest >= 10; }],
    ['rush-20', '', 'Rush 20+', function (s) { return s.stats.rushBest >= 20; }],
    ['coords-20', '~i:target~', 'Coords 20+', function (s) { return Math.max(s.stats.coordsBest.w, s.stats.coordsBest.b) >= 20; }],
    ['first-line', '~i:book~', 'First line learned', function (s) { return Object.keys(s.learned).length >= 1; }],
    ['all-openings', '~i:crown~', 'All 4 openings', function (s) { return ['kia', 'london', 'kid', 'caro'].every(function (o) { return Object.keys(s.learned).some(function (k) { return k.indexOf(o) === 0; }); }); }],
    ['first-win', '~i:trophy~', 'Beat Stacy', function (s) { return s.stats.wins >= 1; }],
    ['win-1400', '', 'Beat Stacy 1400', function (s) { return s.games.some(function (g) { return g.result === 'win' && g.elo >= 1400; }); }],
    ['acc-80', '~i:award~', '80% accuracy game', function (s) { return s.stats.accuracy.some(function (a) { return a >= 80; }); }],
    ['rating-1200', '~i:chart~', 'Tactics 1200', function (s) { return s.tacticsRating >= 1200; }],
    ['rating-1500', '~i:arrow-up~', 'Tactics 1500', function (s) { return s.tacticsRating >= 1500; }],
    ['calc-10', '~i:brain~', '10 calculations', function (s) { return s.stats.calc[0] >= 10; }],
    ['blunder-20', '~i:shield~', 'Blunder checker', function (s) { return s.stats.blunder[0] >= 20; }],
    ['endgame-5', '~i:king~', 'Endgame student', function (s) { return Object.keys(s.stats.endgames).filter(function (k) { return s.stats.endgames[k]; }).length >= 5; }],
    ['reviewer', '~i:search~', 'Reviewed a game', function (s) { return s.games.some(function (g) { return g.reviewed; }); }]
  ];
  App.ACH = ACH;
  App.dailyCounts = function () { var d = App.state.daily; if (d.date !== App.today()) { d.date = App.today(); d.c = {}; } return d.c; };
  App.record = function (kind, n, xp) {
    var s = App.state, c = App.dailyCounts();
    c[kind] = (c[kind] || 0) + (n || 1);
    var t = App.today();
    if (!s.activeDays[t]) {
      s.activeDays[t] = 1;
      var y = new Date(Date.now() - 864e5), ys = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      s.streak.days = (s.streak.last === ys) ? s.streak.days + 1 : 1;
      s.streak.last = t; s.streak.best = Math.max(s.streak.best, s.streak.days);
      if (s.streak.days > 1) App.toast('~i:streak~ ' + s.streak.days + '-day streak! Keep it going!', 'xp');
    }
    if (xp) { s.xp += xp; }
    App.checkAch(); App.save(); App.refreshTop();
  };
  App.checkAch = function () {
    ACH.forEach(function (a) {
      if (!App.state.ach[a[0]] && a[3](App.state)) {
        App.state.ach[a[0]] = Date.now();
        setTimeout(function () { App.toast(a[1] + ' Achievement: ' + a[2] + '!', 'xp', 3500); App.sound('win'); App.confetti(); }, 400);
      }
    });
  };
  /* ---------- v12: session ratings ----------
     Before v12 the tactics rating moved after every puzzle (K up to 48, e.g. "+38 → 825") and the Stacy
     rating after every bot game. Now results only collect as "pending" during the day. Ratings change ONCE:
     when the day's plan is finished, or at the first app open of a later day if the session was left
     unfinished. The change is an Elo performance update with a small K and a hard cap of ±25 per session
     (per rating), so one puzzle can never swing it. Existing ratings are kept as they are. */
  App.RATING_CAP = 25;
  App.ratingSession = function () {
    var s = App.state, today = App.today();
    if (s.ratingSession && s.ratingSession.date !== today && (s.ratingSession.tactics.length || s.ratingSession.games.length)) App.settleRatings('rollover');
    if (!s.ratingSession || s.ratingSession.date !== today) s.ratingSession = { date: today, tactics: [], games: [], keys: {} };
    return s.ratingSession;
  };
  function sessionDelta(r, events, k) {
    if (!events.length) return 0;
    var sum = 0; events.forEach(function (e) { var exp = 1 / (1 + Math.pow(10, ((e.opp || r) - r) / 400)); sum += Math.max(-1, Math.min(1, (e.score - exp) * (e.weight == null ? 1 : e.weight))); });
    var d = Math.round(k * sum); return Math.max(-App.RATING_CAP, Math.min(App.RATING_CAP, d));
  }
  App.pendingRatings = function () { var rs = App.ratingSession(); return { tactics: rs.tactics.length, games: rs.games.length, date: rs.date }; };
  App.settleRatings = function (why) {
    var s = App.state, rs = s.ratingSession; if (!rs || (!rs.tactics.length && !rs.games.length)) return null;
    var out = { at: Date.now(), date: rs.date, reason: why === 'rollover' ? 'Your ' + rs.date + ' session was not finished, so its results were counted when the new day started.' : 'You finished today’s session.', seen: false };
    if (rs.tactics.length) {
      var t0 = s.tacticsRating || 800, n = (s.stats && s.stats.puzzles) || 0, kT = n < 40 ? 8 : 5, dT = sessionDelta(t0, rs.tactics, kT);
      s.tacticsRating = Math.max(300, t0 + dT); s.ratingHist = s.ratingHist || []; s.ratingHist.push([Date.now(), s.tacticsRating]); if (s.ratingHist.length > 300) s.ratingHist.shift();
      var solved = rs.tactics.filter(function (e) { return e.score === 1; }).length;
      out.tactics = { old: t0, now: s.tacticsRating, delta: s.tacticsRating - t0, n: rs.tactics.length, solved: solved, avgOpp: Math.round(rs.tactics.reduce(function (a, e) { return a + e.opp; }, 0) / rs.tactics.length) };
    }
    var r = s.stacyRating;
    if (rs.games.length && r && r.seeded) {
      var g0 = r.value, kG = (r.games || 0) < 30 ? 16 : 10, dG = sessionDelta(g0, rs.games, kG);
      r.value = Math.max(100, g0 + dG); r.games = (r.games || 0) + rs.games.length;
      var w = rs.games.filter(function (e) { return e.score === 1; }).length, l = rs.games.filter(function (e) { return e.score === 0; }).length, dr = rs.games.length - w - l;
      r.history = r.history || []; r.history.push({ at: Date.now(), value: r.value, delta: r.value - g0, kind: 'game', detail: 'Session ' + rs.date + ' · ' + rs.games.length + ' rated game' + (rs.games.length > 1 ? 's' : '') + ' (' + w + 'W ' + dr + 'D ' + l + 'L)' }); r.history = r.history.slice(-60);
      out.stacy = { old: g0, now: r.value, delta: r.value - g0, n: rs.games.length, w: w, d: dr, l: l };
    }
    s.ratingSession = { date: App.today(), tactics: [], games: [], keys: {} };
    s.ratingSummaries = (s.ratingSummaries || []).concat([out]).slice(-30); s.ratingSummary = out; App.save();
    return out;
  };
  // Puzzles: record the result; the rating does not move now. Returns 0 (kept for old callers).
  App.updateTacticsRating = function (puzzleRating, win, key) {
    var rs = App.ratingSession(); if (key && rs.keys['t:' + key]) return 0; if (key) rs.keys['t:' + key] = 1;
    rs.tactics.push({ opp: puzzleRating || 1000, score: win ? 1 : 0, at: Date.now() }); App.save(); return 0;
  };
  App.ratingSummaryHTML = function (o) {
    function line(label, x, extra) { return '<div class="set-row"><div class="grow"><b>' + label + '</b><span class="small muted">' + extra + '</span></div><b style="font-size:20px">' + x.old + ' → ' + x.now + ' <span class="small">(' + (x.delta >= 0 ? '+' : '') + x.delta + ')</span></b></div>'; }
    return '<p class="small muted">' + App.esc(o.reason) + ' Ratings change once per session, by at most ' + App.RATING_CAP + ' points each.</p>' +
      (o.tactics ? line('Tactics rating', o.tactics, o.tactics.solved + ' of ' + o.tactics.n + ' puzzles solved · average puzzle ' + o.tactics.avgOpp) : '') +
      (o.stacy ? line('Stacy rating', o.stacy, o.stacy.n + ' rated bot game' + (o.stacy.n > 1 ? 's' : '') + ' · ' + o.stacy.w + ' won, ' + o.stacy.d + ' drawn, ' + o.stacy.l + ' lost') : '');
  };
  App.showRatingSummary = function () {
    var o = App.state.ratingSummary; if (!o || o.seen || !App.sheet) return false;
    o.seen = true; App.save();
    try { var sh = App.sheet('<div class="rating-summary" role="document"><h3>Session rating update</h3>' + App.ratingSummaryHTML(o) + '<div class="btn-row"><button class="btn primary" data-close>OK</button></div></div>'); var b = sh.el.querySelector('[data-close]'); if (b) b.onclick = sh.close; } catch (e) { }
    return true;
  };
  App.estimate = function () {
    var s = App.state, t = s.tacticsRating;
    var g = s.games.slice(-12).filter(function (x) { return x.elo; });
    if (!g.length) return Math.round(t * 0.9);
    var perf = g.reduce(function (a, x) { return a + x.elo + (x.result === 'win' ? 300 : x.result === 'draw' ? 0 : -300); }, 0) / g.length;
    return Math.round(0.55 * t + 0.45 * perf);
  };
  App.themeStats = function () {
    var th = App.state.stats.themes, out = [];
    for (var k in th) { var v = th[k]; if (v[0] + v[1] >= 3) out.push({ theme: k, pct: v[0] / (v[0] + v[1]), n: v[0] + v[1] }); }
    return out.sort(function (a, b) { return a.pct - b.pct; });
  };
  App.weakAreas = function () {
    var s = App.state, w = [];
    App.themeStats().slice(0, 2).forEach(function (t) { if (t.pct < 0.7) w.push({ id: 'tactics', theme: t.theme, text: 'Tactics: ' + (window.THEME_NAMES && THEME_NAMES[t.theme] || t.theme) + ' (' + Math.round(t.pct * 100) + '% solved)' }); });
    var due = App.dueLines ? App.dueLines().length : 0;
    if (due) w.push({ id: 'openings', text: due + ' opening line' + (due > 1 ? 's' : '') + ' due for review' });
    if (s.stats.blunder[0] + s.stats.blunder[1] >= 5 && s.stats.blunder[0] / (s.stats.blunder[0] + s.stats.blunder[1]) < 0.75) w.push({ id: 'blunder', text: 'Blunder checks: you miss some dangers' });
    if (s.stats.calc[0] + s.stats.calc[1] >= 5 && s.stats.calc[0] / (s.stats.calc[0] + s.stats.calc[1]) < 0.6) w.push({ id: 'calc', text: 'Calculation: practise seeing 3+ moves ahead' });
    var m = s.mistakes.length; if (m >= 3) w.push({ id: 'mistakes', text: m + ' mistakes from your games to fix' });
    if (!w.length) w.push({ id: 'none', text: 'No clear weak spots yet. Play and train more so I can find them!' });
    return w;
  };
  App.progressSummary = function () {
    var s = App.state, c = App.dailyCounts();
    return 'est. rating ' + App.estimate() + ', tactics rating ' + s.tacticsRating + ', streak ' + s.streak.days + ' days, puzzles solved ' + s.stats.solved + '/' + s.stats.puzzles +
      ', games vs Stacy W' + s.stats.wins + ' D' + s.stats.draws + ' L' + s.stats.losses + ', today: ' + JSON.stringify(c) + ', weak areas: ' + App.weakAreas().map(function (w) { return w.text; }).join('; ') +
      (App.pathStatus ? (function () { var c = App.pathStatus().current; return ', Road-to-1500 path: level ' + (c.i + 1) + ' "' + c.L.name + '", open tasks: ' + c.tasks.filter(function (t) { return !t.done; }).map(function (t) { return t.name + ' (' + t.have + '/' + t.goal + ')'; }).join(', '); })() : '');
  };
  // Daily plan toward 1500
  App.plan = function () {
    var c = App.dailyCounts(), due = App.dueLines ? App.dueLines().length : 0, weak = App.themeStats()[0];
    var p = [
      { id: 'daily', ic: '~i:sun~', name: 'Daily puzzle', goal: 1, have: c.daily || 0, go: 'daily' },
      { id: 'puzzle', ic: '~i:tactics~', name: 'Solve 10 puzzles' + (weak && weak.pct < 0.7 ? ' (' + (window.THEME_NAMES && THEME_NAMES[weak.theme] || weak.theme) + ')' : ''), goal: 10, have: c.puzzle || 0, go: weak && weak.pct < 0.7 ? 'tactics/' + weak.theme : 'tactics' },
      { id: 'opening', ic: '~i:book~', name: due ? 'Review ' + Math.min(due, 5) + ' opening lines' : 'Learn/drill an opening line', goal: due ? Math.min(due, 5) : 1, have: c.opening || 0, go: due ? 'srs' : 'openings' },
      { id: 'calc', ic: '~i:brain~', name: '3 calculation exercises', goal: 3, have: c.calc || 0, go: 'calc' },
      { id: 'blunder', ic: '~i:shield~', name: '5 blunder checks', goal: 5, have: c.blunder || 0, go: 'blunder' },
      { id: 'game', ic: '~i:pawn~', name: 'Play 1 coached game', goal: 1, have: c.game || 0, go: 'play' }
    ];
    if (new Date().getDay() % 2) p.splice(4, 0, { id: 'coords', ic: '~i:target~', name: 'Coordinates round', goal: 1, have: c.coords || 0, go: 'coords' });
    else p.splice(4, 0, { id: 'endgame', ic: '~i:king~', name: 'One endgame lesson', goal: 1, have: c.endgame || 0, go: 'endgames' });
    return p;
  };

  // ---------- router ----------
  App.register = function (name, def) { App.screens[name] = def; };
  var current = null, ctxFn = null;
  App.setContext = function (fn) { ctxFn = fn; };
  App.context = function () { try { return ctxFn ? ctxFn() : { mode: current && current.name }; } catch (e) { return {}; } };
  App.go = function (path) { if (location.hash === '#/' + path) App.route(); else location.hash = '#/' + path; };
  App.route = function () {
    var h = (location.hash || '#/home').slice(2), parts = h.split('/'), name = parts[0] || 'home', def = App.screens[name] || App.screens.home;
    if(App.needsUpgrade&&App.needsUpgrade()&&name!=='upgrade'){App.go('upgrade');return;}
    if(App.state.trainingSetupPending&&['preferences','upgrade','welcome-name','experience','placement','public-profile','baseline30'].indexOf(name)<0){App.go(App.setupRoute?App.setupRoute():'preferences');return;}
    if(App.closeExplanation)App.closeExplanation('leave');
    if (current && current.def.leave) try { current.def.leave(); } catch (e) { console.error(e); }
    window.Engine && Engine.cancelAll && Engine.cancelAll();
    window.Voice && Voice.stop();
    ctxFn = null;
    App.trainingLock=null;App.lessonMode=null;document.body.classList.remove('independent-check');document.body.classList.remove('board-screen'); if (App.lastStage && App.lastStage._ro) { App.lastStage._ro.disconnect(); App.lastStage._ro = null; }
    var view = document.getElementById('view');
    // v7 motion: classify push/pop/menu/tab/refresh and detach the outgoing page as an inert snapshot.
    var mctx = null; try { if (App.motion) mctx = App.motion.before(current ? { hash: current.hash, name: current.name } : null, { hash: h, name: name }, view); } catch (e) { mctx = null; }
    view.innerHTML = '';
    var scr = document.createElement('div'); scr.className = 'screen'; view.appendChild(scr);
    current = { name: name, def: def, hash: h };
    document.body.toggleAttribute('data-hub', ['home', 'learn', 'train', 'playhub', 'me'].indexOf(name) >= 0);
    document.getElementById('title').textContent = def.title ? (typeof def.title === 'function' ? def.title(parts.slice(1)) : def.title) : 'Stacy';
    document.getElementById('backBtn').classList.toggle('hide', !def.back);
    setNav(def.nav || name, name);
    window.scrollTo(0, 0);
    try { def.render(scr, parts.slice(1)); } catch (e) { console.error(e); scr.innerHTML = '<div class="card"><b>Oops, something broke.</b><p class="muted small">' + App.esc(e.message) + '</p></div>'; }
    // Screens that draw their own white header hide the duplicate top-bar title.
    try { document.body.classList.toggle('has-scr-head', !!(scr.firstElementChild && scr.firstElementChild.classList && scr.firstElementChild.classList.contains('scr-head'))); } catch (e) { }
    try { if (App.motion) App.motion.after(mctx, scr); } catch (e) { if (App.motion) App.motion.finish(); }
  };
  /* Geometry is a function of viewport/available stage only, never coach content.
     Fixed CSS slots contain scrolling speech/actions. ResizeObserver watches #view. */
  var fitRaf = 0;
  // Budgets mirror the CSS slots below: lessons do not reserve game clocks or an empty side panel.
  App.boardGeometry = function (width, available, viewportHeight, extras, context) {
    var c=context||{},game=!!c.game,coach=game?Math.max(84,Math.min(112,Math.floor(viewportHeight*.14))):Math.max(56,Math.min(76,Math.floor(viewportHeight*.10)));
    var top=c.top===false?0:game?30:24,bottom=c.bottom===false?0:game?30:24,side=c.side?(game?28:44):0,evalSlot=c.eval?6:0,toolbar=game?48:46;
    var reserved=coach+top+bottom+side+evalSlot+toolbar+8+(extras||0);
    return {coach:coach,top:top,bottom:bottom,side:side,toolbar:toolbar,eval:evalSlot,reserved:reserved,size:Math.max(96,Math.floor(Math.min(width,available-reserved)))};
  };
  App.fitBoard = function () {
    cancelAnimationFrame(fitRaf);fitRaf=requestAnimationFrame(function(){
      var st=App.lastStage,view=document.getElementById('view');
      if(!st||!st.el.isConnected||!document.body.classList.contains('board-screen'))return;
      var wrap=st.el.querySelector('.board-wrap');
      if(window.innerWidth>=900){wrap.style.width='';wrap.style.height='';return;}
      var vv=window.visualViewport,vh=vv?vv.height:window.innerHeight;document.documentElement.style.setProperty('--board-viewport',vh+'px');
      var rect=st.el.getBoundingClientRect(),cs=getComputedStyle(view);
      var available=Math.min(rect.height||Infinity,vh-Math.max(0,rect.top)-parseFloat(cs.paddingBottom||0));
      if(window.innerWidth>vh&&vh<=500&&st.el.classList.contains('coached-game')){var wideSize=Math.max(96,Math.floor(Math.min(rect.width*.48,available-8)));st.el.style.setProperty('--coach-slot',Math.max(60,available-110)+'px');wrap.style.width=wideSize+'px';wrap.style.height=wideSize+'px';return;}
      // Non-coach training headers (e.g. calculation) also have bounded slots.
      var extras=st.el.querySelector('.calc-head')?64:0;
      var geo=App.boardGeometry(rect.width,available,vh,extras,{game:st.el.classList.contains('coached-game'),top:!!(st.top.childNodes.length||st.top.textContent),bottom:!!(st.bottom.childNodes.length||st.bottom.textContent),side:!st.el.classList.contains('stage6')&&!!st.side.children.length,eval:!!st.el.querySelector('.eval-bar')});
      st.el.style.setProperty('--coach-slot',geo.coach+'px');['top','bottom','side','toolbar'].forEach(function(k){st.el.style.setProperty('--'+k+'-slot',geo[k]+'px');});
      var size=geo.size+'px';if(wrap.style.width!==size){wrap.style.width=size;wrap.style.height=size;}
    });
  };
  window.addEventListener('resize', function () { App.fitBoard(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { App.fitBoard(); });
  window.addEventListener('orientationchange', function () { setTimeout(App.fitBoard, 200); });
  App.back = function () { var d = current && current.def; if (App.motion) App.motion.intent('pop'); App.go(d && d.back ? d.back : 'home'); };
  // v6: no bottom tab bar. The current location is shown inside the top-corner menu panel (ui.js).
  function setNav(id, route) { if (App.ui && App.ui.setNav) App.ui.setNav(id, route || id); }
  App.refreshTop = function () { var s = document.getElementById('streak'); if (s) s.innerHTML = '~i:streak~ ' + App.state.streak.days; };
  App.realRating = function () { var p = App.state.profile || {}; return p.baseRating || null; };
  App.goal = function () { var p = App.state.profile || {}; return p.goal || (App.realRating() ? App.realRating() + 200 : null); };
  App.applySettings = function () {
    var s = App.state.settings, th = ['ice','midnight'].includes(s.theme) ? s.theme : 'ice';
    document.documentElement.dataset.theme = th; delete document.documentElement.dataset.board;
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = {ice:'#ffffff',midnight:'#0a0a0a'}[th];
  };

  /* Independent in-app rating: seed once from a real account, never sync back. */
  App.seedStacyRating=function(accounts){
    var current=App.state.stacyRating;if(current&&current.seeded)return current;
    accounts=accounts||[];var cc=accounts.find(function(a){return a.service==='chesscom';}),li=accounts.find(function(a){return a.service==='lichess';}),seed=cc&&(cc.ratings.rapid||cc.ratings.blitz),source=seed?'Chess.com '+(cc.ratings.rapid?'rapid':'blitz'):'';
    if(!seed&&li){var key=['rapid','blitz','bullet'].find(function(k){return li.ratings[k];});if(key){seed=li.ratings[key];source='Lichess '+key;}}
    var value=seed?seed.rating:800;App.state.stacyRating={seeded:true,value:value,games:0,source:source||'starter baseline',seededAt:Date.now(),history:[{at:Date.now(),value:value,delta:0,kind:'seed',detail:source||'No linked rating: starter800'}],events:{}};App.save();return App.state.stacyRating;
  };
  App.stacyScore=function(){if(App.state.stacyRating&&!App.state.stacyRating.v2only&&App.migrateStacyRating)App.migrateStacyRating();return App.state.stacyRating&&App.state.stacyRating.value||800;};
  // v12: a rated bot game is recorded for today's session; the Stacy rating changes when the session ends.
  App.adjustStacyRating=function(kind,opponent,score,weight,event){
    var r=App.state.stacyRating;if(!r||!r.seeded||kind!=='game')return 0;r.events=r.events||{};if(event&&r.events[event])return 0;
    if(event){r.events[event]=Date.now();var keys=Object.keys(r.events);if(keys.length>500)keys.slice(0,keys.length-500).forEach(function(x){delete r.events[x];});}
    App.ratingSession().games.push({opp:opponent||r.value,score:score,weight:weight==null?1:weight,at:Date.now(),event:event||null});App.save();return 0;
  };
  App.ratePractice=function(){return 0;}; // Stacy rating changes ONLY from rated bot games (nash, Round 2).
  App.migrateStacyRating=function(){var r=App.state.stacyRating;if(!r||r.v2only)return;if(!r.seeded&&(r.history||[]).length)r.seeded=true;var h=r.history||[],seed=h.find(function(x){return x.kind==='seed';}),games=h.filter(function(x){return x.kind==='game';});if(h.some(function(x){return x.kind!=='seed'&&x.kind!=='game';})){var v=seed?seed.value:r.value;var nh=seed?[seed]:[];games.forEach(function(g){v=Math.max(100,v+(g.delta||0));nh.push(Object.assign({},g,{value:v}));});r.value=v;r.history=nh;}r.v2only=true;App.save();};
  App.stacyRatingHTML=function(compact){
    var r=App.state.stacyRating||{value:800,games:0,history:[]},hist=r.history||[],spark='';
    if(hist.length>1){var vals=hist.map(function(x){return x.value;}),min=Math.min.apply(null,vals)-5,max=Math.max.apply(null,vals)+5;spark='<svg viewBox="0 0 300 48" style="width:100%;height:42px" role="img" aria-label="Stacy rating history"><path d="'+vals.map(function(v,i){return (i?'L':'M')+(i/(vals.length-1)*300).toFixed(1)+' '+(46-(v-min)/(max-min)*42).toFixed(1);}).join(' ')+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';}
    return '<div class="card"><div class="row"><span class="li-ic">~i:chart~</span><div class="grow"><h3>Stacy rating</h3><span class="tiny muted">Independent in-app progress</span></div><div style="text-align:right"><b style="font-size:28px">'+r.value+'</b>'+(compact?'':'<div class="tiny muted">Stacy</div>')+'</div>'+(compact?'':'<div style="text-align:right;border-left:1px solid var(--border);padding-left:12px"><b style="font-size:22px">'+(App.realRating()||'—')+'</b><div class="tiny muted">'+App.esc(App.realRating()?((App.state.profile||{}).primary==='chesscom'?'Chess.com':'Lichess')+' '+((App.state.profile||{}).speed||'rapid'):'Account')+'</div></div>')+'</div>'+spark+(compact?'':'<p class="tiny muted">Seed: '+App.esc(r.source||'starter baseline')+' · '+r.games+' rated bot games · updates once per session, max ±'+App.RATING_CAP+'.</p>'+(function(){var pr=App.pendingRatings();return pr.tactics||pr.games?'<p class="tiny"><b>Today so far:</b> '+pr.games+' rated game'+(pr.games===1?'':'s')+', '+pr.tactics+' puzzle'+(pr.tactics===1?'':'s')+' waiting. Ratings update once when today’s session is finished.</p>':'';})()+'<details><summary class="small muted">How this rating works</summary><p class="small muted">It comes only from rated games against Stacy’s bots: win, draw or loss against the bot’s rating (resign counts as a loss, an agreed draw as a draw). During the day results are collected; the rating changes once, when you finish the day’s session (or when the next day starts if you stopped early), by at most '+App.RATING_CAP+' points. Puzzles, drills and plan steps never change it. Games where you used a hint or takeback are unrated. It never changes your Chess.com/Lichess account. '+r.games+' rated bot games. Bot ratings are approximate, so this is an in-app progress rating, not an official Elo.</p></details><div class="col tiny muted" style="margin-top:12px">'+hist.slice(-5).reverse().map(function(h){return '<div class="row"><span class="grow">'+App.esc(h.kind)+' · '+App.esc(h.detail||'')+'</span><b>'+h.value+' ('+(h.delta>=0?'+':'')+h.delta+')</b></div>';}).join('')+'</div>')+'</div>';
  };

  // ---------- screens: home ----------
  function greet() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  /* v6 Home: white header (date, greeting, week strip) → one black "Today" panel whose timeline
     is the real five-step plan. Exactly one white current card holds the single Continue action. */
  App.planTimeline=function(plan,o){o=o||{};var U=App.ui,idx=plan.completed?plan.tasks.length:(plan.index||0);
    return '<ol class="timeline" id="'+(o.id||'todayTimeline')+'" aria-label="Today’s steps">'+plan.tasks.map(function(t,i){var st=(t.complete||i<idx)?'done':i===idx?'current':'next';
      return U.row({state:st,mark:String(i+1),title:App.esc(t.name),sub:st==='current'?App.esc(t.reason||''):st==='done'?'Done':'',action:st==='current'?(o.action||''):''});}).join('')+'</ol>';};
  /* v12: a plan whose current step was already marked complete (or whose step list changed length after a
     curriculum update) had no "current" row, so the home Path layout rendered no #goPlan button and the
     handler binding crashed. Normalise: point at the first unfinished step, or mark the plan complete. */
  App.normalizePlan = function (plan) {
    if (!plan || !plan.tasks) return plan;
    if (!plan.completed) {
      var i = Math.max(0, Math.min(plan.index || 0, plan.tasks.length));
      while (i < plan.tasks.length && plan.tasks[i].complete) i++;
      if (i >= plan.tasks.length) { plan.completed = true; plan.finished = plan.finished || Date.now(); plan.index = plan.tasks.length; if (App.settleRatings) App.settleRatings('session'); App.save(); }
      else if (i !== (plan.index || 0)) { plan.index = i; App.save(); }
    }
    return plan;
  };
  App.register('home', {
    title: 'Stacy Chess', nav: 'home',
    render: function (el) {
      var U=App.ui,s=App.state,rating=App.realRating(),plan=App.normalizePlan(App.ensurePlan()),total=plan.tasks.length,idx=plan.completed?total:(plan.index||0),done=plan.tasks.filter(function(t,i){return t.complete||i<idx;}).length;
      var name=s.settings.name ? ', '+App.esc(s.settings.name) : '';
      var label=plan.completed?'Play for fun':!plan.started?'Start today':'Continue step '+(idx+1);
      var action='<button class="btn primary" id="goPlan">~i:play~ '+label+'</button>';
      var facts='<ul class="head-facts" aria-label="Your numbers"><li><b>'+App.stacyScore()+'</b> Stacy rating</li><li><b>'+(rating||'—')+'</b> '+App.esc(rating?((s.profile||{}).primary==='chesscom'?'Chess.com':'Lichess'):'account not linked')+'</li><li><b>'+s.streak.days+'</b> day streak</li></ul>';
      var body=App.planTimeline(plan,{action:action});
      if(plan.completed)body+='<div class="tl-end paper"><b>Session complete.</b><span class="small">Bring one idea into your next real game. Tomorrow’s plan uses your latest results.</span>'+action+'</div>';
      el.innerHTML=U.head({eyebrow:U.dateLabel(),title:greet()+name,sub:'Your plan: '+App.esc(App.homePlanLine?App.homePlanLine():'five short steps'),selector:U.weekStrip()+facts})+
        U.panel({id:'today',title:'Today',aside:done+' / '+total+' done',body:body+'<div class="panel-foot" id="homeFoot"></div>'});
      var foot=el.querySelector('#homeFoot');
      if(s.activeGame&&App.continueCard){var cc=App.continueCard();cc.classList.add('inset-row');foot.appendChild(cc);}
      foot.appendChild(App.html('<nav class="link-list" aria-label="More from today"><button type="button" class="link-row" id="homeWeekly"><span>Weekly report</span><small>'+App.esc(App.weeklyHeadline?App.weeklyHeadline():'Evidence builds through the week')+'</small></button><button type="button" class="link-row" id="homeRoadmap"><span>My roadmap & goal</span><small>'+App.esc(App.goal()?App.goal()+' goal · no guaranteed timeline':'Set a goal when you are ready')+'</small></button><button type="button" class="link-row" id="askStacy"><span>Ask Stacy</span><small>Text coach · your questions</small></button></nav>'));
      foot.appendChild(App.html('<p class="engine-line tiny"><span class="engine-dot" id="engDot"></span><span id="engName">Loading chess engine…</span></p>'));
      App.q(el,'#askStacy').onclick=App.openChat;
      App.q(el,'#homeWeekly').onclick=function(){App.go('weekly');};
      App.q(el,'#homeRoadmap').onclick=function(){App.go('path');};
      if(!el.querySelector('#goPlan'))foot.insertBefore(App.html('<div class="btn-row">'+action+'</div>'),foot.firstChild); // never leave the day without its main button
      App.q(el,'#goPlan').onclick=function(){ if(plan.completed){App.go('playhub');return;} if(!plan.started){plan.started=true;var t=plan.tasks[plan.index||0];if(t)t.started=true;App.save();} App.go('today'); };
      Engine.onStatus(function(e){var n=el.querySelector('#engName'),d=el.querySelector('#engDot');if(n){n.textContent=e.status==='ready'?e.name+' ready':e.status==='fallback'?'Offline: '+e.name:'Loading chess engine…';d.classList.toggle('ok',e.status==='ready');}});
    }
  });

  // ---------- me / progress ----------
  App.register('me', {
    title: 'Me', nav: 'me',
    render: function (el) {
      var s = App.state, st = s.stats, est = App.realRating()||0;
      var days = []; for (var i = 6; i >= 0; i--) { var d = new Date(Date.now() - i * 864e5), k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); days.push('<i class="' + (s.activeDays[k] ? 'on' : '') + '"><span>' + 'SMTWTFS'[d.getDay()] + '</span></i>'); }
      var hist = s.ratingHist.slice(-60), spark = '';
      if (hist.length > 1) {
        var mn = Math.min.apply(null, hist.map(function (h) { return h[1]; })) - 20, mx = Math.max.apply(null, hist.map(function (h) { return h[1]; })) + 20;
        spark = '<svg viewBox="0 0 300 80" style="width:100%;height:80px"><polyline fill="none" stroke="var(--primary-2)" stroke-width="3" stroke-linejoin="round" points="' +
          hist.map(function (h, i) { return (i / (hist.length - 1) * 300).toFixed(1) + ',' + (80 - (h[1] - mn) / (mx - mn) * 76 - 2).toFixed(1); }).join(' ') + '"/></svg>';
      }
      var acc = st.accuracy.length ? Math.round(st.accuracy.slice(-10).reduce(function (a, b) { return a + b; }, 0) / Math.min(10, st.accuracy.length)) : '-';
      el.innerHTML = '<div class="card e3"><div class="row" style="justify-content:space-around;text-align:center">' +
        '<div><div class="ring" style="--p:' + Math.min(100, (est - 400) / 11) + '"><span>' + (App.realRating() || '—') + '</span></div><div class="small muted" style="margin-top:6px">Account rating</div></div>' +
        '<div><div class="ring" style="--p:' + Math.min(100, (s.tacticsRating - 400) / 11) + '"><span>' + s.tacticsRating + '</span></div><div class="small muted" style="margin-top:6px">Tactics</div></div>' +
        '<div><div class="ring" style="--p:' + (acc === '-' ? 0 : acc) + '"><span>' + acc + (acc === '-' ? '' : '%') + '</span></div><div class="small muted" style="margin-top:6px">Accuracy</div></div></div></div>' +
        '<div class="card"><h3>Tactics rating</h3>' + (spark || '<p class="muted small">Solve some puzzles to see your graph.</p>') + '</div>' +
        '<div class="card"><h3>This week</h3><div class="daybar">' + days.join('') + '</div><div class="spacer"></div><div class="row small muted"><span>Streak ~i:streak~ ' + s.streak.days + '</span><span class="grow"></span><span>Best ' + s.streak.best + '</span></div></div>' +
        '<div class="card"><h3>Numbers</h3><div class="grid2 small">' +
        '<div>~i:tactics~ Puzzles: <b>' + st.solved + '/' + st.puzzles + '</b></div><div>~i:bolt~ Rush best: <b>' + st.rushBest + '</b></div>' +
        '<div>~i:pawn~ Games: <b>' + st.wins + 'W ' + st.draws + 'D ' + st.losses + 'L</b></div><div>~i:target~ Coords best: <b>' + Math.max(st.coordsBest.w, st.coordsBest.b) + '</b></div>' +
        '<div>~i:brain~ Calculation: <b>' + st.calc[0] + '/' + (st.calc[0] + st.calc[1]) + '</b></div><div>~i:shield~ Blunder checks: <b>' + st.blunder[0] + '/' + (st.blunder[0] + st.blunder[1]) + '</b></div>' +
        '<div>~i:book~ Lines learned: <b>' + Object.keys(s.learned).length + '</b></div><div>~i:king~ Endgames: <b>' + Object.keys(st.endgames).length + '</b></div></div></div>' +
        '<div class="card"><h3>Tactic themes</h3><div id="themes" class="col"></div></div>' +
        '<div class="card"><h3>Weak areas</h3><div class="col small">' + App.weakAreas().map(function (w) { return '<div>• ' + App.esc(w.text) + '</div>'; }).join('') + '</div></div>' +
        '<div class="card"><h3>Achievements</h3><div class="ach-grid">' + ACH.map(function (a) { return '<div class="ach ' + (s.ach[a[0]] ? 'got' : '') + '"><span class="a-ic">' + a[1] + '</span>' + a[2] + '</div>'; }).join('') + '</div></div>' +
        '<div class="btn-row"><button class="btn" id="exp">~i:download~ Backup progress</button><button class="btn" id="imp">~i:upload~ Restore</button></div>';
      el.insertAdjacentHTML('afterbegin','<div class="row" style="margin-bottom:14px"><div class="grow"><h2>'+App.esc(s.settings.name || 'Your profile')+'</h2><span class="small muted">Your games. Your growth.</span></div><button class="btn sm" id="meSettings">~i:settings~ Settings</button></div>'); App.q(el,'#meSettings').onclick=function(){App.go('settings');};
      if(App.profileCard)el.insertBefore(App.profileCard(),el.children[1]);
      el.children[0].insertAdjacentHTML('afterend',App.stacyRatingHTML(false));
      if(App.usageCard)el.appendChild(App.usageCard());
      var th = el.querySelector('#themes'), ts = App.themeStats();
      if (!ts.length) th.innerHTML = '<p class="muted small">Solve puzzles to see your strong and weak themes.</p>';
      ts.slice().reverse().forEach(function (t) { th.insertAdjacentHTML('beforeend', '<div class="small row"><span style="width:120px">' + App.esc(window.THEME_NAMES && THEME_NAMES[t.theme] || t.theme) + '</span><div class="bar grow" style="height:8px"><i style="width:' + Math.round(t.pct * 100) + '%"></i></div><span style="width:40px;text-align:right">' + Math.round(t.pct * 100) + '%</span></div>'); });
      el.querySelector('#exp').onclick = function () {
        var copy = JSON.parse(JSON.stringify(App.state)); copy.settings.apiKey = '';
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(copy)], { type: 'application/json' })); a.download = 'stacy-progress-' + App.today() + '.json'; a.click();
      };
      el.querySelector('#imp').onclick = function () {
        var i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
        i.onchange = function () { var r = new FileReader(); r.onload = function () { try { var key = App.state.settings.apiKey; App.state = merge(JSON.parse(JSON.stringify(DEFAULTS)), JSON.parse(r.result)); App.state.settings.apiKey = key; window.APP_SETTINGS = App.state.settings; App.save(); App.toast('Progress restored!', 'ok'); App.route(); } catch (e) { App.toast('That file did not work', 'err'); } }; r.readAsText(i.files[0]); };
        i.click();
      };
    }
  });

  // ---------- hubs ----------
  // v6: hubs are one white header plus one black panel of sparse sections (App.ui.listPanel).
  function hub(el, items, o) { el.appendChild(App.ui.listPanel(Object.assign({ id: 'hub', title: 'Choose', items: items }, o || {}))); }
  App.register('learn', { title: 'Learn', nav: 'learn', render: function (el) {
    var due=App.dueLines?App.dueLines():[];
    if(due.length){var dueCard=App.html('<button class="list-item" style="width:100%"><span class="li-ic">~i:repeat~</span><span class="grow" style="text-align:left"><b>'+due.length+' lines ready to review</b><span class="small muted" style="display:block">A quick refresh before something new</span></span><span>›</span></button>');dueCard.onclick=function(){App.go('srs');};el.appendChild(dueCard);}
    el.appendChild(App.html('<div class="section-title">Your four opening courses</div>'));
    OPENINGS.forEach(function(c){var n=c.lines.filter(function(l){return App.state.learned[l.id];}).length;
      var card=App.html('<div class="card"><div class="row"><span class="li-ic">~i:book~</span><div class="grow"><h3>'+App.esc(c.name)+'</h3><div class="small muted">'+(c.color==='w'?'White':'Black')+' · '+App.esc(c.tagline)+'</div></div></div><div class="row small muted" style="margin-top:14px"><div class="bar grow"><i style="width:'+n/c.lines.length*100+'%"></i></div><span>'+n+'/'+c.lines.length+'</span></div><div class="course-actions"><button class="btn sm primary" data-mode="learn">Lesson</button><button class="btn sm" data-mode="drill">Drill</button><button class="btn sm" data-mode="review">Review</button></div></div>');
      card.querySelectorAll('button').forEach(function(btn){btn.onclick=function(){var mode=btn.dataset.mode;if(mode==='learn')App.go('course/'+c.id);else if(mode==='review'){var dl=due.find(function(x){return x.course.id===c.id;});App.go('line/'+(dl?dl.line.id:c.lines[0].id)+'/drill');}else App.go('line/'+c.lines[0].id+'/drill');};});el.appendChild(card);
    });
  } });
  App.register('train', { title: 'Skills', nav: 'train', render: function (el) {
    el.innerHTML = App.ui.head({ eyebrow: 'Learn', title: 'Skills', sub: 'Understand → practise → assess → revisit.', selector: App.ui.switcher(App.ui.LEARN_TABS, 'skills', 'Learn sections') }); App.ui.wireSwitcher(el);
    hub(el,[{section:'Tactics'},{ic:'~i:tactics~',name:'Tactics by theme',sub:'Build patterns you can use in games',go:'tactics'},{ic:'~i:sun~',name:'Daily puzzle',sub:'One fresh challenge each day',go:'daily'},{ic:'~i:bolt~',name:'Puzzle Rush',sub:'Three strikes, keep your focus',go:'rush'},{ic:'~i:streak~',name:'Puzzle Streak',sub:'How far can you go?',go:'streak'},
    {section:'Thinking'},{ic:'~i:brain~',name:'Calculation',sub:'See the next moves before you play',go:'calc'},{ic:'~i:shield~',name:'Blunder Check',sub:'Catch danger before it happens',go:'blunder'},{ic:'~i:trap~',name:'Spot the Trap',sub:'Recognise opening tricks',go:'traps'},{ic:'~i:clock~',name:'Rushed Moves',sub:'Build a calmer thinking rhythm',go:'tactics/slow'},{ic:'~i:bulb~',name:'Thinking routine',sub:'Four questions for every move',go:'routine'},
    {section:'Endgames'},{ic:'~i:king~',name:'Endgame lessons',sub:'Simple mates, pawns and rook endings',go:'endgames'},{ic:'~i:flag~',name:'Finish the Win',sub:'Turn an advantage into a result',go:'finish'},
    {section:'Board vision'},{ic:'~i:target~',name:'Coordinates',sub:'Know every square, from either side',go:'coords'}],{id:'skills',title:'Skills',aside:'Optional practice',note:'Open a lesson for its purpose and a guided/unaided choice. Rush and Streak stay optional challenges; the daily five-step plan never requires a timed streak.'});
  } });
  App.register('playhub', { title: 'Play', nav: 'playhub', render: function (el) {
    el.innerHTML = App.ui.head({ eyebrow: 'Play', title: 'Games & review', sub: 'Play a bot, analyse a position, or learn from your own games.' });
    if (App.state.activeGame && App.continueCard) el.appendChild(App.continueCard());
    hub(el, [{ ic: '~i:pawn~', name: 'Play the bots', sub: 'Seven named bots plus adjustable generic difficulty; optional coaching', go: 'play' }, { ic: '~i:analysis~', name: 'Analysis board', sub: 'Full-strength Stockfish, set up any position', go: 'analysis' },
      { ic: '~i:search~', name: 'Game Review', sub: 'Import from Lichess, Chess.com or PGN', go: 'games' }, { ic: '~i:close~', name: 'My mistakes', sub: 'Positions from your games to fix', go: 'mistakes' }], { id: 'playlist', title: 'Play', aside: 'Bots · analysis · review' });
  } });
  App.register('routine', { title: 'Thinking routine', back: 'train', nav: 'train', render: function (el) {
    App.state.stats.routineSeen = 1; App.save();
    var c = new Coach(el, { max: 6 });
    var steps = ['Before every move, ask these 4 questions. Strong players do this automatically, and you will too!',
      '1 **What does their last move want?** Every move has a reason. Is something attacked? Is a check or capture coming?',
      '2 **Checks, captures, threats.** Look at every check and capture for BOTH sides. Forcing moves come first.',
      '3 **Blunder check.** Before you let go of the piece: after my move, can they take something for free? Can they check me? Is my king safe?',
      '4 **No tactics? Improve your worst piece.** Develop, castle, put a rook on an open file, or make a plan.',
      'Count to look 2-4 moves ahead: "I go here, they go there, then I…". Try the Calculation trainer and Blunder Check to practise!'];
    steps.forEach(function (t, i) { setTimeout(function () { c.say(t, { speak: i === 0, keep: true }); }, i * 450); });
    setTimeout(function () { el.appendChild(App.html('<div class="btn-row"><button class="btn primary" onclick="App.go(\'blunder\')">Practise Blunder Check</button><button class="btn" onclick="App.go(\'calc\')">Calculation</button></div>')); }, 2800);
  } });

  // ---------- Road to 1500: a step-by-step path ----------
  function th(s, k) { return (s.stats.themes[k] || [0])[0]; }
  function beat(s, elo) { return s.games.filter(function (g) { return g.source === 'stacy' && g.result === 'win' && (g.elo || 0) >= elo; }).length; }
  function linesAt(s, box) { return Object.keys(s.srs).filter(function (k) { return (s.srs[k].box || 0) >= box; }).length; }
  function coursesStarted(s) { return OPENINGS.filter(function (o) { return o.lines.some(function (l) { return s.srs[l.id] || s.learned[l.id]; }); }).length; }
  function egDone(s) { return Object.keys(s.stats.endgames || {}).length; }
  App.PATH = [
    { lvl: 800, name: 'Board basics', ic: '~i:leaf~', why: 'Know the board, finish simple mates and start your first opening.', tasks: [
      ['Coordinates score 15+', function (s) { return [Math.max(s.stats.coordsBest.w, s.stats.coordsBest.b), 15]; }, 'coords'],
      ['Solve 10 puzzles', function (s) { return [s.stats.solved, 10]; }, 'tactics/mixed'],
      ['Checkmate with king + queen', function (s) { return [s.stats.endgames.kq ? 1 : 0, 1]; }, 'endgame/kq'],
      ['Learn your first opening line', function (s) { return [Object.keys(s.learned).length, 1]; }, 'openings']] },
    { lvl: 900, name: 'Stop hanging pieces', ic: '~i:shield~', why: 'Most games under 1000 are lost by leaving pieces undefended. Fix that first!', tasks: [
      ['Solve 10 hanging-piece puzzles', function (s) { return [th(s, 'hanging'), 10]; }, 'tactics/hanging'],
      ['Blunder Check: 15 right answers', function (s) { return [s.stats.blunder[0], 15]; }, 'blunder'],
      ['Read the thinking routine', function (s) { return [s.stats.routineSeen ? 1 : 0, 1]; }, 'routine'],
      ['Beat Stacy at ~600', function (s) { return [beat(s, 600), 1]; }, 'play']] },
    { lvl: 1000, name: 'Tactics eye', ic: '~i:eye~', why: 'Forks, pins and mate in 1 win most games at this level.', tasks: [
      ['10 forks', function (s) { return [th(s, 'fork'), 10]; }, 'tactics/fork'],
      ['8 pins', function (s) { return [th(s, 'pin'), 8]; }, 'tactics/pin'],
      ['10 mate-in-1', function (s) { return [th(s, 'mate1'), 10]; }, 'tactics/mate1'],
      ['Learn 3 opening lines', function (s) { return [Object.keys(s.learned).length, 3]; }, 'openings'],
      ['Beat Stacy at ~800', function (s) { return [beat(s, 800), 1]; }, 'play']] },
    { lvl: 1100, name: 'Opening confidence', ic: '~i:book~', why: 'Have a plan in all four openings and know the traps.', tasks: [
      ['Start all 4 courses', function (s) { return [coursesStarted(s), 4]; }, 'openings'],
      ['Watch 4 opening traps', function (s) { return [s.stats.traps[0], 4]; }, 'traps'],
      ['Puzzle Rush score 8+', function (s) { return [s.stats.rushBest, 8]; }, 'rush'],
      ['Beat Stacy at ~1000', function (s) { return [beat(s, 1000), 1]; }, 'play']] },
    { lvl: 1200, name: 'Calculate', ic: '~i:brain~', why: 'See 2-3 moves ahead: checks, captures, threats.', tasks: [
      ['20 calculation answers', function (s) { return [s.stats.calc[0], 20]; }, 'calc'],
      ['8 mate-in-2', function (s) { return [th(s, 'mate2'), 8]; }, 'tactics/mate2'],
      ['Review 3 of your games', function (s) { return [s.games.filter(function (g) { return g.reviewed; }).length, 3]; }, 'games'],
      ['Rook checkmate', function (s) { return [s.stats.endgames.kr ? 1 : 0, 1]; }, 'endgame/kr']] },
    { lvl: 1300, name: 'Convert the win', ic: '~i:flag~', why: 'Being up material is not enough. Learn to finish!', tasks: [
      ['Finish the Win x3', function (s) { return [s.stats.finish[0], 3]; }, 'finish'],
      ['Win 5 endgame lessons', function (s) { return [egDone(s), 5]; }, 'endgames'],
      ['Tactics rating 1200', function (s) { return [s.tacticsRating, 1200]; }, 'tactics/mixed'],
      ['Beat Stacy at ~1200', function (s) { return [beat(s, 1200), 1]; }, 'play']] },
    { lvl: 1400, name: 'Solid player', ic: '~i:layers~', why: 'Know your openings by heart and stay sharp under pressure.', tasks: [
      ['8 lines in long-term memory', function (s) { return [linesAt(s, 3), 8]; }, 'srs'],
      ['Puzzle Rush score 15+', function (s) { return [s.stats.rushBest, 15]; }, 'rush'],
      ['Fix 10 of your own mistakes', function (s) { return [s.stats.mistakesFixed || 0, 10]; }, 'mistakes'],
      ['Beat Stacy at ~1400', function (s) { return [beat(s, 1400), 1]; }, 'play']] },
    { lvl: 1500, name: '1500 club!', ic: '~i:crown~', why: 'The goal! You play like a real 1500 now.', tasks: [
      ['Tactics rating 1500', function (s) { return [s.tacticsRating, 1500]; }, 'tactics/mixed'],
      ['Beat Stacy at ~1600', function (s) { return [beat(s, 1600), 1]; }, 'play'],
      ['A game with 80%+ accuracy', function (s) { return [s.stats.accuracy.some(function (x) { return x >= 80; }) ? 1 : 0, 1]; }, 'games'],
      ['7-day streak', function (s) { return [s.streak.best, 7]; }, 'home']] }
  ];
  App.pathStatus = function () {
    var s = App.state, cur = null;
    var lv = App.PATH.map(function (L, i) {
      var t = L.tasks.map(function (x) { var r = x[1](s); return { name: x[0], have: Math.min(r[0], r[1]), goal: r[1], done: r[0] >= r[1], go: x[2] }; });
      var d = t.filter(function (x) { return x.done; }).length;
      return { i: i, L: L, tasks: t, done: d, all: d === t.length };
    });
    for (var i = 0; i < lv.length; i++) if (!lv[i].all) { cur = lv[i]; break; }
    return { levels: lv, current: cur || lv[lv.length - 1] };
  };
  App.register('path', {
    title: '~i:map~ Road to 1500', back: 'home', nav: 'home',
    render: function (el) {
      var ps = App.pathStatus(), c = new App.Coach(el);
      c.say('This is your practice path! Each level is a skill that players at that rating really have. You\'re on **Level ' + (ps.current.i + 1) + ': ' + ps.current.L.name + '**. Finish the tasks and the next level unlocks. You\'ve got this! ', { speak: false });
      ps.levels.forEach(function (lv) {
        var locked = lv.i > ps.current.i, curr = lv === ps.current;
        var card = App.html('<div class="card ' + (curr ? 'e3 glow' : '') + '" style="' + (locked ? 'opacity:.55' : '') + ';animation:bubbleIn .45s var(--spring) ' + (lv.i * 0.05) + 's both"><div class="row"><div class="li-ic" style="font-size:22px">' + (lv.all ? '~i:check~' : locked ? '~i:lock~' : lv.L.ic) + '</div><div class="grow"><b>Level ' + (lv.i + 1) + ' · ' + lv.L.name + '</b><span class="small muted" style="display:block">~' + lv.L.lvl + ' · ' + lv.done + '/' + lv.tasks.length + ' done</span></div></div></div>');
        if (!locked) {
          card.appendChild(App.html('<p class="small muted" style="margin:8px 0">' + lv.L.why + '</p>'));
          lv.tasks.forEach(function (t) {
            var it = App.html('<div class="list-item" style="margin-top:6px"><div class="li-ic">' + (t.done ? '~i:check~' : '') + '</div><div class="grow"><b style="font-size:14px">' + App.esc(t.name) + '</b><div class="bar" style="height:6px;margin-top:6px"><i style="width:' + (t.have / t.goal * 100) + '%"></i></div></div><span class="small muted">' + t.have + '/' + t.goal + '</span></div>');
            it.onclick = function () { App.go(t.go); }; card.appendChild(it);
          });
        }
        el.appendChild(card);
      });
    }
  });

  App.usageCard = function () {
    var x=AI.ledger(),d=x.days[AI.pacificDay()]||{},a=x.all;
    function n(v){return Number(v||0).toLocaleString();}
    function totals(label,t){return '<h3 style="margin-top:13px">'+label+'</h3><div class="usage-grid"><div><b>'+n(t.prompt)+'</b><span>Input tokens</span></div><div><b>'+n(t.output)+'</b><span>Output tokens</span></div><div><b>'+n(t.total)+'</b><span>Total tokens</span></div></div><p class="tiny muted">'+n(t.requests)+' API requests · '+n(t.tts)+' voice requests · '+Math.round(t.seconds||0)+'s generated audio · '+n(t.audio)+' audio tokens'+(t.thoughts?' · '+n(t.thoughts)+' thinking tokens':'')+'</p>';}
    return App.html('<section class="card" id="usageCard"><div class="row"><span class="li-ic">~i:chart~</span><div><h3>Gemini usage</h3><span class="tiny muted">Only this browser, not your whole Google project</span></div></div>'+totals('Today · Pacific quota day',d)+totals('All time · this device',a)+'<p class="tiny muted">Tokens come directly from usageMetadata, never estimates. Totals may include thinking tokens. '+n(a.unknown)+' requests did not return token metadata. Recent history keeps 200 requests; daily totals keep 90 days.</p><details><summary class="small">Recent requests · Nairobi (EAT)</summary><div class="usage-history">'+x.requests.slice(-30).reverse().map(function(r){return '<div class="row"><span class="grow">'+App.esc(new Date(r.at).toLocaleTimeString('en-GB',{timeZone:'Africa/Nairobi',hour:'2-digit',minute:'2-digit'}))+' EAT · '+App.esc(r.model)+' · '+r.kind+'</span><span>'+ (r.known?n(r.prompt)+' / '+n(r.output)+' / '+n(r.total):'not reported')+' · '+r.status+'</span></div>';}).join('')+'</div></details><hr style="border:0;border-top:1px solid var(--border);margin:15px 0"><b class="small">Free-tier limits are project/model-specific</b><p class="tiny muted">Google applies RPM (requests/min), TPM (input tokens/min) and RPD (requests/day). Reference examples reported in AI Studio: Flash-Lite 15 RPM / 500 RPD; Flash 5 RPM / 20 RPD; Flash TTS 3 RPM / 10K TPM / 10 RPD. These are not guaranteed allowances: your active project limits may differ or change.</p><p class="small"><a href="https://aistudio.google.com/rate-limit?timeRange=last-28-days" target="_blank" rel="noopener">Your active limits & usage in AI Studio ~i:external~</a><br><a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener">Google’s published rate-limit guidance</a></p><p class="tiny muted">Google exposes no remaining-free-quota API. This app cannot know your remaining allowance, other-app usage, or billing status. A paid project key may incur charges. Daily request limits reset at midnight Pacific (10:00 or 11:00 EAT depending on daylight saving).</p></section>');
  };

  // ---------- settings ----------
  App.register('engine-check', {
    title: 'Engine check', back: 'settings', nav: 'me',
    render: function (el) {
      el.innerHTML = '<div class="card e3"><h3 style="margin:0 0 6px">Engine check</h3><p class="small muted">What happened when Stacy started the chess engine on this device. If moves are not graded, take one screenshot of this page (or tap Copy report) and send it.</p>' +
        '<div id="ecSummary" class="alert" role="status"></div><pre id="ecReport" class="small" style="white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;margin:10px 0"></pre>' +
        '<div class="btn-row"><button class="btn primary" id="ecCopy">Copy report</button><button class="btn" id="ecRetry">Run check again</button></div><div id="ecMsg" class="small muted" style="margin-top:8px"></div></div>';
      var sum = el.querySelector('#ecSummary'), pre = el.querySelector('#ecReport'), msg = el.querySelector('#ecMsg');
      function draw() {
        if (!sum || !pre) return;
        var st = Engine.status;
        sum.className = 'alert ' + (st === 'ready' ? 'ok' : st === 'fallback' ? 'err' : 'warn');
        sum.textContent = st === 'ready' ? 'Working: ' + Engine.describe() + '. Reviews and puzzles are graded.' : st === 'fallback' ? 'Not working: ' + (Engine.reason || 'engine unavailable') + '. Moves are not graded until this is fixed.' : 'Starting the engine… the first start can take up to 30 seconds on a phone.';
        pre.textContent = Engine.report();
      }
      var off = Engine.onStatus(draw); App.screenCleanup = off;
      Engine.init();
      var copy = el.querySelector('#ecCopy'); if (copy) copy.onclick = function () {
        var text = Engine.report();
        function done(ok) { if (msg) msg.textContent = ok ? 'Report copied. Paste it into a message.' : 'Could not copy automatically: press and hold the report text above to select and copy it.'; }
        try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); }); } catch (e) { }
        done(fallbackCopy(text));
      };
      function fallbackCopy(text) { try { var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand && document.execCommand('copy'); ta.remove(); return !!ok; } catch (e) { return false; } }
      var retry = el.querySelector('#ecRetry'); if (retry) retry.onclick = function () { if (msg) msg.textContent = 'Running the check again…'; Engine.retryFull().then(function () { if (msg) msg.textContent = 'Check finished.'; draw(); }); };
    },
    leave: function () { if (App.screenCleanup) { try { App.screenCleanup(); } catch (e) { } App.screenCleanup = null; } }
  });
  App.register('settings', {
    title: 'Settings', back: 'me', nav: 'me',
    render: function (el) {
      var s = App.state.settings;
      function row(label, sub, ctrl) { var r = App.html('<div class="set-row"><div class="grow"><b>' + label + '</b>' + (sub ? '<span class="small muted">' + sub + '</span>' : '') + '</div></div>'); if (ctrl.getAttribute('role') === 'switch') ctrl.setAttribute('aria-label', label); r.appendChild(ctrl); return r; }
      function sw(key, after) { var x = App.html('<div class="switch ' + (s[key] ? 'on' : '') + '" role="switch" tabindex="0" aria-checked="' + !!s[key] + '"></div>'); x.onclick = function () { s[key] = !s[key]; x.classList.toggle('on', s[key]); x.setAttribute('aria-checked', !!s[key]); App.save(); App.sound('click'); after && after(); }; if (x.getAttribute('role') === 'switch') x.onkeydown = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); x.click(); } }; return x; }
      function sel(key, opts, after) { var x = App.html('<select class="input" style="width:auto;min-width:130px"></select>'); opts.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; if (String(s[key]) === String(o[0])) op.selected = true; x.appendChild(op); }); x.onchange = function () { s[key] = x.value; App.save(); after && after(); }; if (x.getAttribute('role') === 'switch') x.onkeydown = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); x.click(); } }; return x; }
      // AI card
      var ai = App.html('<div class="card e3 glow"><div class="row">' + App.avatar('wow', 'sm') + '<h3 style="margin:0">Stacy AI (Google Gemini, free)</h3></div>' +
        '<p class="small muted">Paste your own free Gemini API key to make Stacy chat, explain moves in her own words and talk with a natural voice. Your key is stored <b>only on this device</b> (localStorage). It is never put in the code or progress backups. Local storage is not encrypted: use your own trusted device, keep this key private, and remove it on shared devices.</p>' +
        '<label class="field">Gemini API key<input class="input" id="key" type="password" autocomplete="off" placeholder="AIza…" spellcheck="false"></label>' +
        '<div class="btn-row"><button class="btn primary" id="saveKey">Save key</button><button class="btn" id="testKey">Test key</button><button class="btn ghost" id="delKey">Remove</button></div>' +
        '<div id="keyMsg" style="margin-top:10px"></div>' +
        '<p class="small" style="margin-top:10px">~i:arrow-right~ Get a free key: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → sign in with Google → <b>Create API key</b> → copy it here.</p></div>');
      el.appendChild(ai);
      var keyIn = ai.querySelector('#key'), msg = ai.querySelector('#keyMsg');
      keyIn.value = s.apiKey ? s.apiKey : '';
      function showMsg(t, type) { msg.innerHTML = '<div class="alert ' + type + '">' + (type === 'ok' ? '~i:check~ ' : type === 'warn' ? '~i:alert~ ' : '~i:alert~ ') + App.esc(t) + '</div>'; }
      ai.querySelector('#saveKey').onclick = function (e) { s.apiKey = keyIn.value.trim(); App.save(); showMsg(s.apiKey ? 'Saved on this device.' : 'Key cleared.', 'ok'); };
      ai.querySelector('#delKey').onclick = function () { s.apiKey = ''; keyIn.value = ''; App.save(); showMsg('Key removed. Stacy uses her built-in coaching.', 'warn'); };
      ai.querySelector('#testKey').onclick = function (e) {
        s.apiKey = keyIn.value.trim(); App.save();
        if (!s.apiKey) return showMsg('Paste a key first.', 'warn');
        App.btnBusy(e.currentTarget, AI.test()).then(function (t) { showMsg('Key works! Stacy says: ' + t, 'ok'); Voice.speak(t, { force: true }); }, function (er) { showMsg(er.message || 'Test failed', 'err'); });
      };
      var aiCard = App.html('<div class="card"></div>');
      aiCard.appendChild(row('Use Stacy AI', 'Off = built-in explanations only', sw('aiOn')));
      aiCard.appendChild(row('AI model', 'Auto uses Flash-Lite for quick feedback and 3.8 Flash for chat', sel('aiModel', AI.MODELS.map(function (m) { return [m.id, m.label]; }))));
      aiCard.appendChild(App.usageCard());
      el.appendChild(aiCard);
      // Voice
      var v = App.html('<div class="card"><h3>Stacy\'s voice</h3></div>');
      v.appendChild(row('Voice', 'Stacy speaks her feedback', sw('voiceOn', function () { if (!s.voiceOn) Voice.stop(); })));
      v.appendChild(row('Auto-speak after moves', 'Off = tap ~i:volume~ on a bubble to hear it', sw('autoSpeak')));
      v.appendChild(App.html('<p class="small muted">Natural Gemini voice only. A key and internet connection are required. If voice quota runs out, Stacy stays silent and shows why.</p><div id="voiceStatus" class="voice-status" role="status">'+App.esc(Voice.status || 'Ready when you are.')+'</div>'));
      v.appendChild(row('Gemini voice', 'Cheerful prebuilt voices', sel('ttsVoice', Voice.VOICES.map(function (x) { return [x, x]; }))));
      var rate = App.html('<input type="range" min="0.7" max="1.4" step="0.05" style="width:130px">'); rate.value = s.voiceRate || 1; rate.oninput = function () { s.voiceRate = +rate.value; App.save(); };
      v.appendChild(row('Speed', '', rate));
      var test = App.html('<button class="btn sm">~i:play~ Test voice</button>'); test.onclick = function () { Voice.speak("Hi " + s.name + "! I'm Stacy. Let's crush some puzzles today!", { force: true }); };
      v.appendChild(row('Try it', '', test));
      el.appendChild(v);
      // Look
      var look = App.html('<div class="card"><h3>Look & feel</h3></div>');
      // v8: layout, theme, board colours and pieces live in Customize (preview before apply).
      var cz=App.html('<button type="button" class="tool-row" id="openCustomize"><span class="tool-ic" aria-hidden="true">~i:layers~</span><span class="tool-text"><b>Customize</b><small>Layout, Light/Dark, board colours, pieces</small></span><span class="chev" aria-hidden="true">›</span></button>');cz.onclick=function(){App.go('customize');};look.appendChild(cz);
      var ex=App.html('<button type="button" class="tool-row" id="openExperience"><span class="tool-ic" aria-hidden="true">~i:book~</span><span class="tool-text"><b>My chess experience</b><small>'+App.esc(((App.EXPERIENCE||[]).find(function(x){return x.id===App.state.experience;})||{label:'Not set'}).label)+' · change any time, progress is kept</small></span><span class="chev" aria-hidden="true">›</span></button>');ex.onclick=function(){App.go('experience');};look.appendChild(ex);
      var bz=App.html('<button type="button" class="tool-row" id="openBasics"><span class="tool-ic" aria-hidden="true">~i:pawn~</span><span class="tool-text"><b>Chess from zero</b><small>The rules, step by step</small></span><span class="chev" aria-hidden="true">›</span></button>');bz.onclick=function(){App.go('basics');};look.appendChild(bz);
      look.appendChild(row('Coordinates on board', '', sw('coords')));
      look.appendChild(row('Show legal moves', '', sw('legal')));
      look.appendChild(row('Sound effects', '', sw('sound')));
      el.appendChild(look);
      // v9: the bundled engine and what it is used for (honest capability note)
      var eng = App.html('<div class="card" id="engineCard"><h3>Chess engine</h3><p class="small" id="engDesc"></p><p class="tiny muted">Bundled '+App.esc(Engine.BUNDLE.build)+' · about '+Math.round(Engine.BUNDLE.bytes/1024/1024*10)/10+' MB, loaded once from engine/ (no CDN). Runs on one thread in a Web Worker; no special server headers. Game Review grades at depth '+Engine.BUDGETS.review.depth+' (minimum '+Engine.BUDGETS.review.minDepth+'), Brilliant needs an extra depth-'+Engine.BUDGETS.verify.depth+' check, deeper review uses depth '+Engine.BUDGETS.deep.depth+'. The lite network is weaker than full Stockfish 19 but far stronger than human play. GPL-3.0: see engine/COPYING.txt and engine/source/.</p><div class="btn-row"><button class="btn sm" id="engineCheck">Engine check</button></div></div>');
      App.q(eng,'#engineCheck').onclick = function () { App.go('engine-check'); };
      var offEng = Engine.onStatus(function (e) { var d = eng.querySelector('#engDesc'); if (!d || !d.isConnected && d.dataset.seen) { if (offEng) offEng(); return; } d.dataset.seen = 1; d.textContent = Engine.describe(); });
      if (el.firstChild) el.insertBefore(eng, el.firstChild); else el.appendChild(eng); // v12: first card, easy to find when grading fails
      var coach = App.html('<div class="card"><h3>Coaching</h3></div>');
      coach.appendChild(row('Premoves · multiple moves', 'Off by default. Open Premoves in a bot game for the hypothetical future-piece planner. One queued move per actual reply. Illegal first move clears all. Promotions default to queen.',sw('premoves',function(){if(!s.premoves&&App.lastStage){if(App.lastStage.closePremovePlanner)App.lastStage.closePremovePlanner();if(App.lastStage.clearPremove)App.lastStage.clearPremove();}})));
      coach.appendChild(row('Blunder warning', 'Stacy stops you before a big blunder in coached games', sw('safety')));
      var nm = App.html('<input class="input" style="width:140px">'); nm.value = s.name; nm.onchange = function () { s.name = UI.strip(nm.value).slice(0,40); App.save(); };
      coach.appendChild(row('Your name', '', nm));
      el.appendChild(coach);
      var danger = App.html('<div class="card"><h3>Data</h3><p class="small muted">Progress is saved in this browser. Use Progress → Backup to move it to another device.</p><button class="btn danger sm" id="reset">Reset all progress</button></div>');
      danger.querySelector('#reset').onclick = function () { if (confirm('Really reset ALL progress? This cannot be undone.')) { var k = s.apiKey; App.state = JSON.parse(JSON.stringify(DEFAULTS)); App.state.settings.apiKey = k; window.APP_SETTINGS = App.state.settings; App.save(); App.toast('Progress reset'); App.go('home'); } };
      el.appendChild(danger);
      el.appendChild(App.html('<p class="tiny faint center">Stacy Chess · Stockfish 17.1 / 10 (GPLv3) · cburnett pieces (CC BY-SA) · puzzles from the Lichess database (CC0)</p>'));
    }
  });

  App.pickPosition=function(onPick){
    var s=App.state,sh=App.sheet('<h3>Choose a position for Stacy</h3><p class="small muted">Pick one of your games, then move the slider to the moment you want to discuss.</p><select class="input" id="positionGame"></select><div id="positionBoard" style="margin-top:12px"></div><div class="row" style="margin-top:10px"><input type="range" min="0" value="0" id="positionPly" class="grow"><span class="small" id="positionLabel"></span></div><div class="btn-row"><button class="btn primary" id="attachPosition">Use this position</button><button class="btn" id="cancelPosition">Cancel</button></div>');
    var sel=sh.el.querySelector('#positionGame'),slider=sh.el.querySelector('#positionPly'),board=new Board(sh.el.querySelector('#positionBoard'),{orientation:'w',coords:true,movable:function(){return null;},legalDests:function(){return [];},onMove:function(){return false;}}),rec=null,moves=[],base=new Chess().fen(),current=new Chess();
    sel.appendChild(App.html('<option value="start">Analysis board · starting position</option>'));s.games.slice().reverse().forEach(function(g){var op=document.createElement('option');op.value=g.id;op.textContent=(g.source||'Game')+' · vs '+(g.opp||'?')+' · '+new Date(g.date).toLocaleDateString();sel.appendChild(op);});
    function draw(){current=new Chess(base);for(var i=0;i<+slider.value;i++)current.move(moves[i]);board.setPosition(current.fen(),false);sh.el.querySelector('#positionLabel').textContent=slider.value+'/'+moves.length+' ply';}
    sel.onchange=function(){rec=s.games.find(function(g){return g.id===sel.value;});var g=new Chess();if(rec&&g.load_pgn(rec.pgn,{sloppy:true})){moves=g.history();base=g.header().FEN||new Chess().fen();slider.max=moves.length;slider.value=Math.min(moves.length,20);}else{moves=[];base=new Chess().fen();slider.max=0;slider.value=0;}draw();};slider.oninput=draw;sel.onchange();
    App.q(sh.el,'#cancelPosition').onclick=sh.close;App.q(sh.el,'#attachPosition').onclick=function(){var ctx={mode:'selected '+(rec?'game vs '+rec.opp:'analysis position'),fen:current.fen(),history:current.history().join(' '),legalMoves:current.moves().join(' '),allowedSans:current.moves(),game:rec&&rec.id};sh.close();onPick(ctx);};
  };

  // ---------- chat with Stacy ----------
  App.openChat = function () {
    var s = App.state, sh = App.sheet('<div class="row" style="margin-bottom:8px">' + App.avatar('happy', 'sm') + '<div class="grow"><b>Ask Stacy</b><div class="tiny muted" id="chatMode"></div></div><button class="icon-btn" id="mute" title="Mute">' + (s.settings.muted ? '~i:mute~' : '~i:volume~') + '</button><button class="icon-btn" id="clr" title="Clear">~i:trash~</button></div><div class="chat-log" id="log"></div><div class="chips" id="sugg" style="margin-top:6px"></div><div class="chat-input"><input class="input" id="q" placeholder="Ask anything about chess…" enterkeyhint="send"><button class="btn primary icon" id="send">~i:send~</button></div>');
    var log = sh.el.querySelector('#log'), q = sh.el.querySelector('#q'), ctx = App.context();
    sh.el.querySelector('#chatMode').textContent = AI.enabled() ? (ctx.fen ? 'Gemini AI · current board attached' : 'Gemini AI · no position selected') : 'Built-in mode · add a Gemini key in Settings for full chat';
    function add(role, text) { var m = App.html('<div class="msg ' + (role === 'user' ? 'me' : 'stacy') + '"></div>'); m.innerHTML = App.md(text); log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
    s.chat.slice(-12).forEach(function (m) { add(m.role, m.text); });
    if (!s.chat.length) add('model', 'Hi'+(s.settings.name?' '+s.settings.name:'')+'! Ask me an opening idea or what to train next.'+(ctx.fen?' I can see this board.':' Choose a game or the analysis board to discuss a position.'));
    ['Start today’s plan'].concat(ctx.fen?['Explain this position']:['Choose a position']).concat(['Learn the KIA','Practise blunder checks']).forEach(function (t) {
      var c = App.html('<span class="chip">' + t + '</span>'); c.onclick = function () { if(t==='Start today’s plan'){sh.close();App.go(App.screens.today?'today':'train');}else if(t==='Choose a position'){choosePosition();}else if(t==='Learn the KIA'){sh.close();App.go('course/kia');}else if(t==='Practise blunder checks'){sh.close();App.go('blunder');}else {q.value=t;send();} }; sh.el.querySelector('#sugg').appendChild(c);
    });
    function choosePosition(question){App.pickPosition(function(selected){ctx=selected;sh.el.querySelector('#chatMode').textContent='Position selected · '+ctx.mode;var host=sh.el.querySelector('#chatPosition');if(host)host.remove();host=document.createElement('div');host.id='chatPosition';host.style.cssText='max-width:210px;margin:8px auto';sh.el.querySelector('#sugg').before(host);var board=new Board(host,{coords:false,movable:function(){return null;},legalDests:function(){return [];},onMove:function(){return false;}});board.setPosition(ctx.fen,false);q.value=question||'Explain this position';if(question)send();else{var c=App.html('<button class="chip">Explain selected position</button>');c.onclick=function(){q.value='Explain this position';send();};sh.el.querySelector('#sugg').appendChild(c);}});}
    sh.el.querySelector('#clr').onclick = function () { s.chat = []; log.innerHTML = ''; App.save(); };
    sh.el.querySelector('#mute').onclick = function (e) { s.settings.muted = !s.settings.muted; e.currentTarget.textContent = s.settings.muted ? '~i:mute~' : '~i:volume~'; if (s.settings.muted) Voice.stop(); App.save(); };
    function send() {
      var t = q.value.trim(); if (!t) return; q.value = '';
      if(!ctx.fen && /explain.*(position|board)|this position/i.test(t)){choosePosition(t);return;}
      add('user', t); s.chat.push({ role: 'user', text: t });
      var typing = App.html('<div class="msg stacy"><span class="typing"><i></i><i></i><i></i></span></div>'); log.appendChild(typing); log.scrollTop = log.scrollHeight;
      var p = AI.enabled() ? AI.chat(s.chat, ctx) : Promise.reject({ code: 'nokey' });
      p.then(function (ans) { typing.remove(); add('model', ans); s.chat.push({ role: 'model', text: ans }); if (s.chat.length > 40) s.chat = s.chat.slice(-40); App.save(); Voice.speak(ans); },
        function (e) {
          typing.remove();
          var ans = builtinAnswer(t, ctx) + (e.code === 'nokey' ? '' : '\n\n(' + (e.message || 'AI unavailable') + ')');
          add('model', ans); s.chat.push({ role: 'model', text: ans }); App.save(); Voice.speak(ans);
        });
    }
    sh.el.querySelector('#send').onclick = send;
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  };
  function builtinAnswer(t, ctx) {
    t = t.toLowerCase();
    if (/train|today|plan/.test(t)) { var p = App.plan().filter(function (x) { return x.have < x.goal; }); return p.length ? 'Here is what I would do next: ' + p.slice(0, 3).map(function (x) { return x.name; }).join(', ') + '. Your weak spots: ' + App.weakAreas().map(function (w) { return w.text; }).join('; ') + '.' : 'You finished today\'s plan!  Play a coached game or try Puzzle Rush for fun.'; }
    if (/hang|lose (my )?piece|losing piece|free piece|undefended/.test(t)) return 'Hanging pieces lose most games at our level, so this is a GREAT thing to fix!  Before every move: 1) What did their last move attack? 2) After my move, can they capture anything for free? 3) Count attackers and defenders. Train it with Blunder Check and the Hanging pieces puzzles, and play coached games so I can warn you.';
    if (/endgame|end game/.test(t)) return 'Endgames: first learn queen mate and rook mate, then king + pawn (key squares, opposition, rule of the square). Use your king! It is a strong piece in the endgame. Open Endgames in the Train tab and beat Stockfish in each one.';
    if (/calculat|see ahead|moves ahead|visuali/.test(t)) return 'Calculation: look at forcing moves first (checks, captures, threats), for BOTH sides. Go one move at a time: "I go here, then they go there". The Calculation trainer starts at 2 moves; once you get 80% right, step up to 3, then 4.';
    if (/rating|1500|improve|better|elo/.test(t)) return App.realRating() ? 'Your baseline is your real '+App.realRating()+' '+App.state.profile.primary+' '+App.state.profile.speed+' rating, not an estimate. Our current goal is '+App.goal()+'. Your daily plan targets the openings, tactical patterns and phases your own games show need attention.' : 'Link your public Chess.com or Lichess account in Me so I can use your actual rating. Until then, your daily plan adapts from in-app practice; the tactics score is not an account rating.';
    if (/time|clock|fast|rush/.test(t)) return 'Don\'t rush! Use the time to do the blunder check on every move. Play 10-minute games or longer while you are learning, and try Rushed Moves in Tactics to train patience.';
    if (/blunder/.test(t)) return 'Before every move, do a blunder check: after my move, what checks and captures does my opponent have? Is any of my pieces undefended? Practise it in Blunder Check every day. It is the fastest way to gain rating!';
    if (/kia|king'?s indian attack/.test(t)) return 'KIA plan: Nf3, g3, Bg2, O-O, d3, Nbd2, e4. If Black keeps a pawn on d5, push e5, then attack with Nf1-h2-g4, h4 and Bf4. Black attacks on the queenside, so be faster!';
    if (/london/.test(t)) return 'London: d4, Bf4 BEFORE e3, then e3, Nf3, c3, Nbd2, Bd3. Keep your bishop with Bg3 if they offer a trade, then play Ne5 and f4 to attack. Watch out for ...Qb6 hitting b2!';
    if (/kid|king'?s indian def/.test(t)) return 'KID: ...Nf6, ...g6, ...Bg7, ...O-O, ...d6, ...e5. If White plays d5, move your knight (...Ne8 or ...Nd7), push ...f5 and ...f4 and storm the kingside!';
    if (/caro/.test(t)) return 'Caro-Kann: ...c6 and ...d5. Get the light-squared bishop out to f5 or g4 BEFORE ...e6. Against the Advance (e5), hit d4 with ...c5. Watch the Nd6# trap after ...Nd7 if White has Qe2!';
    if (ctx && ctx.fen && /position|explain|move|best|why/.test(t)) return 'Here is what the engine sees: ' + (ctx.eval ? 'evaluation ' + ctx.eval + '. ' : '') + (ctx.bestMove ? 'Best move: ' + ctx.bestMove + '. ' : '') + (ctx.threats ? 'Watch out: ' + ctx.threats + '. ' : '') + 'For a full explanation in my own words, add a free Gemini key in Settings.';
    return 'Great question! For full answers I need a free Gemini key (Settings → Stacy AI). Until then, try the thinking routine: what does their last move want, checks/captures/threats, blunder check, then improve your worst piece.';
  }

  /* A finite daily lesson, personalised from real games plus in-app practice. */
  App.ensurePlan=function(){
    var s=App.state,p=s.profile||{},st=p.stats||{},old=s.todayPlan,today=App.today(),stamp=(p.lastSync||0)+':'+(st.analysed||0);
    if(old&&((old.date===today&&(old.started||old.profileStamp===stamp))||(old.started&&!old.completed)))return old;
    var day=Number(today.replace(/-/g,'')),due=App.dueLines?App.dueLines():[],courseId=st.weakCourse&&st.weakCourse.course||((s.trainingProfile?[s.trainingProfile.whiteCourse||'kia',s.trainingProfile.blackCourse||'caro'][day%2]:OPENINGS[day%OPENINGS.length].id)),course=OPENINGS.find(function(c){return c.id===courseId;})||OPENINGS[0];
    var dl=due.find(function(d){return d.course.id===course.id;})||due[0],line=dl?dl.line:course.lines[day%course.lines.length];if(dl)course=dl.course;
    var ts=App.themeStats()[0],weak=st.weakTheme||ts&&ts.theme||'hanging',rating=App.trainingRating?App.trainingRating():(App.realRating()||s.tacticsRating),theme=(window.THEME_NAMES&&THEME_NAMES[weak])||weak;
    var tasks=[{type:'opening',name:course.short+' opening refresh',icon:'book',line:line.id,mode:s.learned[line.id]?'review':'learn',goal:1,have:0,reason:dl?'This line is due for spaced review.':st.weakCourse?'Your recent '+st.weakCourse.name+' games scored poorly; this '+course.short+' setup gives us a focused repertoire response.':'We are building a reliable repertoire while your baseline develops.'},{type:'tactics',name:(rating<900?'6':'8')+' '+theme+' puzzles',icon:'tactics',theme:weak,rating:Math.max(400,rating),goal:rating<900?6:8,have:0,reason:st.weakTheme?'Your sampled games most often missed this tactical idea.':ts?'Your in-app theme results make this a useful focus.':'Hanging pieces are a useful first diagnostic; we will adapt from your results.'}];
    var own=s.mistakes.filter(function(m){return !m.fixed;});if(own.length){var mistake=own[day%own.length];tasks.push({type:'mistake',name:'One lesson from your own game',icon:'search',mistake:JSON.parse(JSON.stringify(mistake)),goal:1,have:0,reason:'You played '+mistake.played+' here. Let’s find the better idea before seeing the answer.'});}
    var egids=rating<1000?['kq','kr','backrank']:rating<1500?['kp6','bpawn','square']:['lucena','philidor','kpd'],egid=egids.find(function(id){return !s.stats.endgames[id];})||egids[day%egids.length];tasks.push({type:'endgame',name:(App.ENDGAMES.find(function(e){return e.id===egid;})||{}).name||'Endgame practice',icon:'king',endgame:egid,goal:1,have:0,reason:st.weakPhase==='endgame'?'The endgame is your weakest sampled phase. Let’s make this ending feel familiar.':'Convert an advantage calmly; this ending is matched to your current baseline and lesson history.'});
    var level=0,target=Math.max(400,rating-200);Engine.LEVELS.forEach(function(l,i){if(l.elo<=target&&l.elo<=2500)level=i;});tasks.push({type:'game',name:'A coached game with Stacy',icon:'pawn',level:level,goal:1,have:0,reason:'Practise today’s ideas against the existing '+Engine.LEVELS[level].elo+'-level opponent, chosen from your '+(App.realRating()?'real rating.':'training baseline until an account is linked.')});
    if(day%2&&tasks.length>1){var first=tasks[0];tasks[0]=tasks[1];tasks[1]=first;}
    s.todayPlan={date:today,profileStamp:stamp,index:0,started:false,completed:false,tasks:tasks,created:Date.now()};App.save();return s.todayPlan;
  };
  App.plan=function(){return App.ensurePlan().tasks.map(function(t){return {id:t.type,ic:'~i:'+t.icon+'~',name:t.name,goal:t.goal,have:t.have||0,go:'today'};});};
  App.progressSummary=function(){var s=App.state,p=s.profile||{};return 'Player '+(s.settings.name||'(name not given)')+'; real account baseline '+(App.realRating()?App.realRating()+' '+p.primary+' '+p.speed:'unknown, no rating may be invented')+'; goal '+(App.goal()||'build a baseline')+'; in-app tactics score (not a platform rating) '+s.tacticsRating+'; recent-game sample '+JSON.stringify(p.stats||{})+'; weak training areas '+JSON.stringify(App.weakAreas())+'; daily plan '+JSON.stringify(App.plan().map(function(t){return {task:t.name,done:t.have,goal:t.goal};}));};
  var todayActive=null;
  App.register('today',{title:'Today with Stacy',back:'home',nav:'home',render:function(el){
    var plan=App.normalizePlan(App.ensurePlan());todayActive=null;
    function persist(){App.save();}
    function advance(){if(advance.busy)return;advance.busy=true;if(App.weeklyEvent)App.weeklyEvent('effort:'+plan.date+':'+plan.index,'effort',null);if(todayActive&&todayActive.cancel)todayActive.cancel();todayActive=null;plan.tasks[plan.index].complete=true;plan.tasks[plan.index].have=plan.tasks[plan.index].goal;App.ratePractice('plan step',true,App.stacyScore(),'plan:'+plan.date+':'+plan.index);plan.index++;if(plan.index>=plan.tasks.length){plan.completed=true;plan.finished=Date.now();App.record('plan',1,25);if(App.settleRatings)App.settleRatings('session');}persist();App.route();}
    function nextButton(text){var b=App.html('<button class="btn primary block" style="margin-top:14px">'+(text||'Continue to the next step')+' ~i:arrow-right~</button>');b.onclick=advance;return b;}
    if(plan.completed){setTimeout(function(){if(App.showRatingSummary)App.showRatingSummary();},250);el.innerHTML=App.ui.head({eyebrow:'Session complete',title:'That was time well spent.',sub:plan.tasks.length+' focused steps. Every one adds to your chess.'})+App.ui.panel({id:'todayDone',title:'Today',aside:plan.tasks.length+' / '+plan.tasks.length+' done',body:App.planTimeline(plan,{id:'sessionOutline'})+'<div class="tl-end paper"><b>Next up</b><span class="small">Rest, then bring one idea into your next real game. Tomorrow’s plan will use your latest games and practice.</span><div class="btn-row"><button class="btn primary" onclick="App.go(\'playhub\')">Play for fun</button><button class="btn" onclick="App.go(\'me\')">See my progress</button></div></div>'});return;}
    var task=plan.tasks[plan.index];if(!task){plan.index=0;task=plan.tasks[0];}
    if(!plan.started){
      el.innerHTML=App.ui.head({eyebrow:App.ui.dateLabel(),title:'Your personal plan',sub:(App.realRating()?'Based on your '+App.realRating()+' '+App.esc((App.state.profile||{}).primary)+' '+App.esc((App.state.profile||{}).speed)+' rating, recent games and in-app practice.':'No account baseline yet: this starter plan uses your in-app results and adapts as you play.')})+
        App.ui.panel({id:'todayPlan',title:'Today',aside:'0 / '+plan.tasks.length+' done',body:App.planTimeline(plan,{id:'sessionOutline',action:'<button class="btn primary" id="startSession">Start our session ~i:play~</button>'})});
      App.q(el,'#startSession').onclick=function(){plan.started=true;task.started=true;persist();App.route();};return;
    }
    // In progress: one compact heading (step, title, Why, Pause, step dots), then the exercise.
    el.innerHTML='<div class="card session-heading ink" style="padding:13px"><div class="row"><span class="li-ic">~i:'+task.icon+'~</span><div class="grow"><span class="eyebrow">Step '+(plan.index+1)+' of '+plan.tasks.length+'</span><h3>'+App.esc(task.name)+'</h3></div><button class="btn sm" id="sessionWhy">Why</button><button class="btn sm" id="pauseSession">Pause</button></div><div class="step-dots" role="progressbar" aria-label="Today’s steps" aria-valuemin="0" aria-valuemax="'+plan.tasks.length+'" aria-valuenow="'+plan.index+'">'+plan.tasks.map(function(t,i){return '<i class="'+(i<=plan.index?'on':'')+'"></i>';}).join('')+'</div><p class="tiny muted" style="margin-bottom:0">'+App.esc(task.reason)+'</p></div><div id="sessionExercise"></div>';
    App.q(el,'#pauseSession').onclick=function(){App.go('home');};var host=el.querySelector('#sessionExercise');App.q(el,'#sessionWhy').onclick=function(){App.sheet('<h3>'+App.esc(task.name)+'</h3><p class="small">'+App.esc(task.reason||'')+'</p>'+(task.concept?'<p>'+App.esc(task.concept)+'</p>':'')+(task.example?'<p class="small">'+App.esc(task.example)+'</p>':''));};
    if(task.complete||task.type==='opening'&&task.state&&task.state.done){task.complete=true;task.have=task.goal;persist();host.innerHTML='<div class="card center"><h2>Step complete.</h2><p class="small muted">Take the key idea with you.</p></div>';host.appendChild(nextButton());return;}
    if(task.concept&&!task.conceptSeen){host.innerHTML='<div class="card"><h3>One idea before practice</h3><p>'+App.esc(task.concept)+'</p>'+(task.example?'<p class="small">'+App.esc(task.example)+'</p>':'')+'<p class="tiny muted">This example is instruction, not an assessment result. The following exercise records your own attempt.</p><button class="btn primary" id="startFocusPractice">Understand → practise</button></div>';App.q(host,'#startFocusPractice').onclick=function(){task.conceptSeen=true;persist();App.route();};return;}
    if(task.type==='opening'){
      todayActive=App.runLine(host,task.line,task.mode||'review',advance,{noQuiz:true,resume:task.state,onSave:function(x){task.state=x;persist();}});return;
    }
    if(task.type==='tactics'||task.type==='mistake'){
      function nextPuzzle(){if(nextPuzzle.busy)return;nextPuzzle.busy=true;if(task.have>=task.goal){advance();return;}if(todayActive&&todayActive.cancel)todayActive.cancel(true);todayActive=null;task.state=null;persist();App.route();}
      var puzzle=task.state&&task.state.p;
      if(!puzzle){if(task.type==='mistake'){var m=task.mistake;puzzle={id:'personal-'+m.game+'-'+m.fen,fen:m.fen,moves:[m.best],rating:0,themes:[m.theme||'defense'],setup:false,prompt:'In your game you played '+m.played+'. Find the better move.'};}else puzzle=App.pickPuzzle(function(p){return p[4]&&p[4].split(' ').includes(task.theme);},task.rating);task.state={p:puzzle,idx:0,failed:false,hintN:0,solved:false,fen:puzzle.fen,elapsed:0};persist();}
      var count=App.html('<div class="row small muted" style="margin:10px 3px"><b>'+Math.min(task.have+1,task.goal)+' / '+task.goal+'</b><span class="grow"></span><span>Think before moving</span></div>');host.appendChild(count);
      var resume=task.state,restore=resume.idx||resume.failed||resume.solved?resume:null;
      var runner=App.puzzleRunner(host,{noHelp:task.type==='mistake'||!!task.noHelp,slow:task.slow||0,label:task.type==='mistake'?'Own game':task.focus?'Focused practice':'Tactics',engineCheck:task.type==='mistake',noRating:task.type==='mistake',resume:restore,onSave:function(x){task.state=x;persist();},onSolved:function(ok){task.have=(task.have||0)+1;if(task.have>=task.goal)task.complete=true;if(task.type==='mistake'&&ok){var m=App.state.mistakes.find(function(x){return x.fen===task.mistake.fen;});if(m)m.fixed=Date.now();App.record('mistake',1,10);}persist();},after:function(){return [{label:task.have+1>=task.goal?'Next step':'Next puzzle',cls:'primary',fn:nextPuzzle}];},next:nextPuzzle});todayActive=runner;runner.start(puzzle);return;
    }
    if(task.type==='calculation'){todayActive=App.calculationSession(host,{resume:task.state,onSave:function(x){task.state=x;persist();},onDone:function(result){task.complete=true;task.have=1;persist();},onNext:advance});return;}
    if(task.type==='safety'){todayActive=App.safetySession(host,task,advance,persist);return;}
    if(task.type==='endgame'){
      var eg=App.ENDGAMES.find(function(e){return e.id===task.endgame;});if(task.state&&task.state.over){host.innerHTML='<div class="card"><h3>Let’s try that ending again.</h3><p class="small muted">Your last attempt is saved; a restart gives you a clean board.</p><button class="btn primary" id="retryEnding">Restart ending</button></div>';App.q(host,'#retryEnding').onclick=function(){task.state=null;persist();App.route();};return;}
      todayActive=App.playout(host,{fen:eg.fen,goal:eg.goal,title:eg.name,intro:eg.name+': '+eg.tips,tips:'Take your time. Activity and safe king moves matter.',resume:task.state,onSave:function(x){task.state=x;persist();},onDone:function(ok){if(ok){task.complete=true;task.have=1;App.state.stats.endgames[eg.id]=Date.now();App.ratePractice('endgame',true,App.stacyScore(),'ending:'+plan.date+':'+plan.index);App.record('endgame',1,25);}persist();},next:function(){if(task.complete)advance();}});return;
    }
    if(task.type==='game'){
      todayActive=App.playGame(host,{color:'w',level:task.level,coach:App.state.settings.coachOn!==false,botId:task.botId||'generic',start:'normal',clock:'none',resume:task.state,onSave:function(x){task.state=x;persist();},onEnd:function(result,rec){if(App.ladderResult)App.ladderResult(result,rec);task.complete=true;task.have=1;task.gameId=rec.id;persist();var b=nextButton('Finish this step');host.appendChild(b);}});return;
    }
  },leave:function(){if(todayActive){if(todayActive.snapshot)todayActive.snapshot();if(todayActive.cancel)todayActive.cancel();}todayActive=null;}});

  /* Account setup and a genuinely personal, resumable baseline. */
  App.profileProgressHTML=function(){
    var p=App.state.profile||{},a=p.analysis||{},n=(a.ids||[]).length,done=Math.min(n,a.game||0),k=a.posCount||0,
      frac=a.done?1:n?Math.min(1,(done+(k?Math.min(a.position||0,k)/k:0))/n):0,pct=Math.round(frac*100),E=window.Engine||{};
    var wait={hidden:'Waiting: the app is in the background.',board:'Waiting while you use a board. It continues when you leave that screen.',live:'Waiting until your Multiplayer game ends.',engine:'Starting the chess engine…'}[a.wait]||'';
    var eng=E.status==='ready'?'Engine: '+App.esc(E.name||'Stockfish')+' (bundled, runs in the background).':E.status==='fallback'?'Engine: Stacy’s simple built-in engine, because the full engine could not run here ('+App.esc(E.reason||'unavailable')+'). Figures from it are rough estimates.':'Engine: starting…';
    return '<div class="row"><span class="li-ic">~i:analysis~</span><div class="grow"><h3>'+(a.done?'Your baseline is ready':a.paused?'Baseline paused':'Stacy is getting to know your chess')+'</h3><span class="small muted">'+done+'/'+n+' games · '+(a.done?'complete':'game '+Math.min(n,done+1)+': position '+Math.min((a.position||0)+1,k||1)+' of '+(k||'…'))+'</span></div><b>'+pct+'%</b></div><div class="bar" style="margin:16px 0"><i style="width:'+pct+'%"></i></div>'
      +(wait&&!a.done&&!a.paused?'<p class="small" role="status">'+wait+'</p>':'')
      +'<p class="tiny muted">'+eng+'</p>'+(E.status==='fallback'&&!a.done?'<button class="btn sm" data-retry-engine>Try the full engine again</button>':'')
      +(a.skipped?'<p class="tiny muted">'+a.skipped+' position'+(a.skipped===1?'':'s')+' skipped ('+App.esc(a.lastSkip||'')+'). The rest of the sample is unaffected.</p>':'')
      +'<p class="small muted">Stockfish samples up to 12 of your moves per game, across opening, middlegame and endgame. Modest depth 9 / 90ms budgets keep this phone-friendly. Accuracy and weakness figures are estimates from this sample, not Chess.com’s proprietary accuracy.</p>'+(a.error?'<div class="alert err">'+App.esc(a.error)+'</div>':'')+(n<30?'<p class="tiny muted">Only '+n+' eligible recent games were available. The profile will improve as you play more.</p>':'')+'<p class="tiny muted">You can continue in the background. Progress is saved after each position. Browsers may suspend background tabs; it resumes when you return.</p>';
  };
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('[data-retry-engine]');if(!b||!App.Profile||!App.Profile.retryEngine)return;b.disabled=true;b.textContent='Starting the full engine…';App.Profile.retryEngine();});
  App.profileCard=function(){
    var p=App.state.profile||{},st=p.stats||{},card=App.html('<section class="card"><div class="row"><h3 class="grow">Your real chess accounts</h3><button class="btn sm" id="connectAccount">'+((p.accounts||[]).length?'Manage':'Connect')+'</button></div><div id="accounts"></div><div id="baseline"></div></section>');
    App.q(card,'#connectAccount').onclick=function(){App.state.onboarding=App.state.onboarding||{};App.state.onboarding.step='form';App.save();App.go('onboard');};
    var host=card.querySelector('#accounts');
    if(p.lastSync)host.insertAdjacentHTML('beforeend','<p class="tiny muted">Last sync: '+new Date(p.lastSync).toLocaleString('en-GB',{timeZone:'Africa/Nairobi',dateStyle:'medium',timeStyle:'short'})+' EAT</p>');if(p.syncError)host.insertAdjacentHTML('beforeend','<p class="alert warn small">'+App.esc(p.syncError)+' Last saved data is retained.</p>');
    if(!(p.accounts||[]).length)host.innerHTML='<p class="small muted">Connect Chess.com or Lichess to use your actual rapid/blitz/bullet ratings and analyse your games. In-app tactics scores are separate, not invented account ratings.</p>';
    (p.accounts||[]).forEach(function(a){host.insertAdjacentHTML('beforeend','<div style="margin-top:14px"><div class="row">'+(a.avatar?'<img src="'+App.esc(a.avatar)+'" alt="Account avatar" width="38" height="38" style="border-radius:12px" referrerpolicy="no-referrer">':'<span class="li-ic">~i:pawn~</span>')+'<div><b>'+App.esc(a.user)+'</b><div class="tiny muted">'+(a.service==='chesscom'?'Chess.com':'Lichess')+' · '+(p.primary===a.service?'plan baseline':'linked')+'</div></div></div><div class="usage-grid" style="margin-top:12px">'+['rapid','blitz','bullet'].map(function(k){var r=a.ratings[k];return '<div><b>'+(r?r.rating:'—')+'</b><span>'+k+(r&&r.provisional?' · provisional':'')+'</span></div>';}).join('')+'</div></div>');});
    if((p.accounts||[]).length){var control=App.html('<div><label class="field small" style="margin-top:16px">Plan rating baseline<select class="input" id="ratingBase"></select></label><div class="btn-row"><button class="btn sm" id="resync">~i:repeat~ Re-sync recent games</button></div><div id="syncMessage" class="small muted" style="margin-top:8px"></div></div>');var sel=control.querySelector('#ratingBase');p.accounts.forEach(function(a){Object.keys(a.ratings).forEach(function(k){var o=document.createElement('option');o.value=a.service+':'+k;o.textContent=(a.service==='chesscom'?'Chess.com':'Lichess')+' '+k+' · '+a.ratings[k].rating;o.selected=p.primary===a.service&&p.speed===k;sel.appendChild(o);});});sel.onchange=function(){var v=sel.value.split(':');p.primary=v[0];p.speed=v[1];App.Profile.chooseBase(p);App.save();App.refreshTop();};App.q(control,'#resync').onclick=function(e){var b=e.currentTarget;b.disabled=true;App.Profile.pause();App.Profile.sync(p.accounts).then(function(){App.route();},function(er){control.querySelector('#syncMessage').textContent=er.message;b.disabled=false;});};host.appendChild(control);}
    function draw(){var q=App.state.profile;if(q&&q.analysis){var b=card.querySelector('#baseline');b.innerHTML='<div class="spacer"></div>'+App.profileProgressHTML();if(!q.analysis.done){var btn=App.html('<button class="btn sm">'+(q.analysis.paused?'Resume analysis':'Pause analysis')+'</button>');btn.onclick=function(){q.analysis.paused?App.Profile.resume():App.Profile.pause();};b.appendChild(btn);}if(q.stats&&q.stats.analysed)b.insertAdjacentHTML('beforeend',App.profileStatsHTML(q.stats));}}
    draw();var listener=function(){if(card.isConnected)draw();else window.removeEventListener('stacy-profile',listener);};window.addEventListener('stacy-profile',listener);return card;
  };
  App.profileStatsHTML=function(st){
    var phase=st.weakPhase||'still learning',op=st.openings||[];
    return '<div class="spacer"></div><h3>Your recent games</h3><div class="usage-grid"><div><b>'+st.wins+' / '+st.draws+' / '+st.losses+'</b><span>Wins / draws / losses · '+st.games+' games</span></div><div><b>'+(st.accuracy==null?'—':st.accuracy+'%')+'</b><span>Sample accuracy</span></div><div><b>'+(st.blunderRate==null?'—':st.blunderRate+'%')+'</b><span>Sample blunder rate</span></div></div><p class="small muted">'+st.positions+' sampled moves · '+st.analysed+' games analysed. Tactical misses: '+(st.tacticalMissRate==null?'not yet known':st.tacticalMissRate+'% of sampled moves')+'.</p><div class="small"><b>Focus phase:</b> '+App.esc(phase)+'<br><b>Time trouble:</b> '+(st.clockGames?st.timeTrouble+'/'+st.clockGames+' games with clock data':'clock data unavailable')+'<br><b>Recent form:</b> '+(st.form||[]).slice(0,10).map(function(x){return x==='win'?'W':x==='draw'?'D':'L';}).join(' · ')+' (newest first)</div><h3 style="margin-top:16px">Opening performance</h3><div class="col small">'+op.slice(0,5).map(function(o){return '<div class="row"><span class="grow">'+App.esc(o.name)+(o.color?' · '+(o.color==='w'?'White':'Black'):'')+'</span><b>'+o.wins+'W '+o.losses+'L / '+o.n+'</b></div>';}).join('')+'</div><p class="tiny muted">Real ratings are pulled directly from your selected platform and time control. Your desired goal is set in your training profile; account ratings remain read-only. Engine-derived accuracy/phase labels are sample estimates, not platform ratings.</p>';
  };
  App.register('onboard',{title:'Meet Stacy',back:'home',nav:'me',render:function(el){
    var s=App.state,o=s.onboarding=s.onboarding||{},step=o.step||'welcome';
    function finish(){App.seedStacyRating(s.profile&&s.profile.accounts||[]);o.complete=true;o.step='done';App.save();App.go('home');}
    if(step==='welcome'){
      el.innerHTML='<div class="card home-hero e3 glow">'+App.avatar('happy','lg')+'<div class="eyebrow">A coach who gets to know you</div><h1>Hi, I’m Stacy.</h1><p class="muted">Let’s build your chess around your games, your goals and how you think.</p><button class="btn primary block" id="meet">Let’s meet ~i:arrow-right~</button></div><div class="card"><h3>A quick tour</h3><div class="col small"><div>~i:home~ Home — our plan and your current goal.</div><div>~i:book~ Learn — four opening courses, no clutter.</div><div>~i:brain~ Train — thinking, tactics, endgames, board vision.</div><div>~i:pawn~ Play — bots, analysis and your real-game mistakes.</div><div>~i:chart~ Me — real ratings, progress, achievements and Settings.</div></div></div>';
      App.q(el,'#meet').onclick=function(){o.step='form';App.save();App.route();};return;
    }
    if(step==='progress'&&s.profile&&s.profile.analysis){
      el.innerHTML='<div class="card e3">'+App.avatar('think')+'<div id="baselineProgress"></div><div class="btn-row"><button class="btn" id="pauseBaseline"></button><button class="btn primary" id="continueBackground">Continue in background</button></div></div><div id="profileSummary"></div>';
      function draw(){if(!el.isConnected)return;var a=s.profile.analysis;el.querySelector('#baselineProgress').innerHTML=App.profileProgressHTML();el.querySelector('#pauseBaseline').textContent=a.paused?'Resume':'Pause';el.querySelector('#pauseBaseline').classList.toggle('hide',a.done);el.querySelector('#continueBackground').textContent=a.done?'Build my daily plan':'Continue in background';if(a.done)el.querySelector('#profileSummary').innerHTML='<div class="card">'+App.profileStatsHTML(s.profile.stats||{})+'</div>';}
      App.q(el,'#pauseBaseline').onclick=function(){s.profile.analysis.paused?App.Profile.resume():App.Profile.pause();};App.q(el,'#continueBackground').onclick=finish;draw();var listen=function(){if(el.isConnected)draw();else window.removeEventListener('stacy-profile',listen);};window.addEventListener('stacy-profile',listen);App.Profile.auto();return;
    }
    if(step==='confirm'&&(o.candidates||[]).length){
      el.innerHTML='<div class="card e3"><h2>Is this you?</h2><p class="small muted">Confirm the public accounts before Stacy uses these ratings and games.</p><div id="identities"></div><div id="confirmError"></div><div class="btn-row"><button class="btn primary" id="confirmAccounts">Yes, analyse my games</button><button class="btn" id="changeAccounts">Different account</button></div></div>';
      o.candidates.forEach(function(a,i){var c=App.html('<label class="card row" style="margin-top:12px"><input type="checkbox" data-account="'+i+'" style="width:22px;height:22px">'+(a.avatar?'<img src="'+App.esc(a.avatar)+'" width="56" height="56" alt="Public account avatar" style="border-radius:15px" referrerpolicy="no-referrer">':'<span class="li-ic">~i:pawn~</span>')+'<span class="grow"><b>'+App.esc(a.user)+'</b><span class="small muted" style="display:block">'+(a.service==='chesscom'?'Chess.com':'Lichess')+'</span><span class="small">'+Object.keys(a.ratings).map(function(k){return k+': '+a.ratings[k].rating+(a.ratings[k].provisional?' provisional':'');}).join(' · ')+'</span><span class="tiny muted" style="display:block">This is my account</span></span></label>');el.querySelector('#identities').appendChild(c);});
      App.q(el,'#changeAccounts').onclick=function(){o.step='form';App.save();App.route();};App.q(el,'#confirmAccounts').onclick=function(e){var selected=Array.from(el.querySelectorAll('[data-account]:checked')).map(function(x){return o.candidates[+x.dataset.account];});if(!selected.length){el.querySelector('#confirmError').textContent='Select the account(s) that are yours first.';return;}var b=e.currentTarget;b.disabled=true;b.textContent='Fetching your games…';App.Profile.sync(selected).then(function(){o.step='progress';App.save();App.route();},function(er){el.querySelector('#confirmError').textContent=er.message;b.disabled=false;b.textContent='Try again';});};return;
    }
    el.innerHTML='<div class="card e3"><div class="row">'+App.avatar('happy')+'<div><h2>What should I call you?</h2><p class="small muted">Saved on this device. Optional Gemini coaching uses your chosen name.</p></div></div><label class="field">Your name<input class="input" id="playerName" autocomplete="given-name" maxlength="40" placeholder="Your name"></label><h3 style="margin-top:20px">Connect your public chess profile</h3><p class="small muted">Optional. No password or account token needed. Stacy uses your actual platform ratings as the baseline, never an invented rating.</p><label class="field">Chess.com username<input class="input" id="chessUser" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Public username"></label><label class="field">Lichess username<input class="input" id="lichessUser" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Public username"></label><div id="lookupError" class="small" role="status"></div><div class="btn-row"><button class="btn primary" id="findAccounts">Look up accounts</button><button class="btn" id="skipAccounts">Skip accounts for now</button></div><p class="tiny muted">Only public profiles and games are fetched. Stockfish analysis runs in this browser. Optional Gemini coaching receives the chess context and profile facts needed for its answer. After confirmation, up to 25 recent games are sampled; accounts re-sync on open after 24 hours.</p></div>';
    el.querySelector('#playerName').value=s.settings.name||'';el.querySelector('#chessUser').value=s.settings.chesscomUser||'';el.querySelector('#lichessUser').value=s.settings.lichessUser||'';
    function readName(){s.settings.name=UI.strip(el.querySelector('#playerName').value).slice(0,40);App.save();}
    App.q(el,'#skipAccounts').onclick=function(){readName();finish();};
    App.q(el,'#findAccounts').onclick=function(e){readName();var choices=[['chesscom',el.querySelector('#chessUser').value.trim()],['lichess',el.querySelector('#lichessUser').value.trim()]].filter(function(x){return x[1];}),b=e.currentTarget,msg=el.querySelector('#lookupError');if(!choices.length){msg.textContent='Enter at least one username, or choose Skip.';return;}b.disabled=true;msg.textContent='Finding your public profile…';var found=[],chain=Promise.resolve();choices.forEach(function(x){chain=chain.then(function(){return App.Profile.lookup(x[0],x[1]);}).then(function(a){found.push(a);});});chain.then(function(){o.candidates=found;o.step='confirm';App.save();App.route();},function(er){msg.textContent=er.message||'Could not connect. Try again later or skip for now.';b.disabled=false;});};
  }});

  // ---------- boot ----------
  App.aiStatus = function (e) { if (e && e.code && e.code !== 'nokey' && !App._aiWarned) { App._aiWarned = true; App.toast('Stacy AI: ' + e.message, 'err', 4200); setTimeout(function () { App._aiWarned = false; }, 60000); } };
  App.boot = function () {
    try { bootInner(); window.__stacyBooted = true; } catch (e) { console.error(e); var v = document.getElementById('view'); if (v) v.innerHTML = '<div class="card" style="margin-top:40px"><h3>Stacy could not start</h3><p class="small">' + App.esc(e && e.message || String(e)) + '</p><p class="tiny muted">Your saved progress is still on this device.</p><div class="btn-row"><button class="btn primary" onclick="location.reload()">Reload</button><button class="btn" onclick="try{localStorage.setItem(&quot;stacy-safe-start&quot;,&quot;1&quot;)}catch(x){};location.reload()">Start without analysis</button></div></div>'; window.__stacyBooted = true; }
  };
  function bootInner() {
    if (localStorage.getItem('stacy-safe-start')) { try { localStorage.removeItem('stacy-safe-start'); } catch (e) { } var pa = App.state.profile && App.state.profile.analysis; if (pa && !pa.done) { pa.paused = true; pa.safePaused = true; pa.error = 'Analysis was paused for a safe start. Tap Pause / resume to continue.'; App.saveNow(); } }
    UI.hydrate(document.body);
    new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='characterData'){if(m.target.parentElement)UI.hydrate(m.target.parentElement);}else m.addedNodes.forEach(function(n){if(n.nodeType===1)UI.hydrate(n);else if(n.nodeType===3&&n.parentElement)UI.hydrate(n.parentElement);});});}).observe(document.body,{subtree:true,childList:true,characterData:true});
    App.applySettings();
    window.addEventListener('resize', function () { requestAnimationFrame(function () { document.querySelectorAll('.seg,.tabs').forEach(function (el) { var on = el.querySelector('button.on'); if (on && el.set) el.set(on.dataset.id); }); }); });
    if (!window.Chess) { document.getElementById('view').innerHTML = '<div class="card center" style="margin-top:40px">' + App.avatar('sad', 'lg') + '<h3>I need the internet for a moment</h3><p class="muted">Stacy loads the chess rules from a free CDN the first time. Check your connection and try again.</p><button class="btn primary" onclick="location.reload()">↻ Try again</button></div>'; return; }
    document.getElementById('backBtn').onclick = App.back;
    var menuBtn = document.getElementById('menuBtn'); if (menuBtn) menuBtn.onclick = function () { App.sound('click'); App.ui.toggleMenu(); };
    document.getElementById('topAvatar').innerHTML = window.stacyAvatar('happy');
    document.getElementById('topAvatar').onclick = App.openChat;
    window.addEventListener('hashchange', App.route);
    App.refreshTop();
    if (typeof Chess === 'undefined') { document.getElementById('view').innerHTML = '<div class="card"><h3>Could not load chess rules</h3><p class="muted">Check your internet connection and reload. (chess.js loads from a CDN.)</p></div>'; return; }
    if(App.state.onboarding&&App.state.onboarding.complete)App.seedStacyRating(App.state.profile&&App.state.profile.accounts||[]);
    try { App.ratingSession(); } catch (e) { } // v12: settles an unfinished earlier day once (never resets ratings)
    Engine.init();
    if(App.needsUpgrade&&App.needsUpgrade()){App.go('upgrade');}else if(App.state.trainingSetupPending){App.go(App.setupRoute?App.setupRoute():'preferences');}else if(!App.state.onboarding||!App.state.onboarding.complete){if(!location.hash.startsWith('#/onboard'))location.hash='#/onboard';else App.route();}else App.route();
    if(App.Profile&&!(App.needsUpgrade&&App.needsUpgrade())&&!App.state.trainingSetupPending)App.Profile.auto();
  }
})();
