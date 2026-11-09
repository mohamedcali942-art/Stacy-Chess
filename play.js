/* Stacy Chess - play vs Stacy (coached), analysis board, game review (Lichess / Chess.com / PGN import), my mistakes */
(function () {
  var C = window.Coach, S = function () { return App.state; };
  function lvlLabel(i) { var L = Engine.LEVELS[i]; return L.label || ('~' + L.elo); }

  /* ================= TIME CONTROLS (v6) =================
     One clock model for every timed bot game. Elapsed time comes from a monotonic source
     (performance.now when available), so a delayed or throttled timer tick never changes how much
     time is deducted. Increment is added exactly once, when a side completes a legal move.
     Ids '10' and '5' are the pre-v6 presets (saved/paused games keep working). */
  App.TIME_CONTROLS = [
    { id: 'none', cat: 'Untimed', label: 'No clock', base: 0, inc: 0 },
    { id: '1+0', cat: 'Bullet', label: '1+0', base: 60, inc: 0 },
    { id: '2+1', cat: 'Bullet', label: '2+1', base: 120, inc: 1 },
    { id: '3+0', cat: 'Blitz', label: '3+0', base: 180, inc: 0 },
    { id: '3+2', cat: 'Blitz', label: '3+2', base: 180, inc: 2 },
    { id: '5+0', cat: 'Blitz', label: '5+0', base: 300, inc: 0 },
    { id: '5', cat: 'Blitz', label: '5+3', base: 300, inc: 3 },
    { id: '10', cat: 'Rapid', label: '10+0', base: 600, inc: 0 }
  ];
  App.TIME_CATEGORIES = ['Untimed', 'Bullet', 'Blitz', 'Rapid'];
  App.timeControl = function (id) { return App.TIME_CONTROLS.find(function (t) { return t.id === String(id); }) || App.TIME_CONTROLS[0]; };
  App.timeControlName = function (id) { var t = App.timeControl(id); return t.base ? t.cat + ' · ' + t.label : 'Untimed'; };
  App.clockNow = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
  App.GameClock = function (tc, now) {
    now = now || App.clockNow; var left = { w: tc.base, b: tc.base }, running = null, since = 0;
    function settle() { if (running) { var t = now(); left[running] -= (t - since) / 1000; since = t; } }
    var c = {
      inc: tc.inc, base: tc.base,
      running: function () { return running; },
      start: function (color) { if (running === color) return; settle(); running = color; since = now(); },
      stop: function () { settle(); running = null; },
      remaining: function (color) { return left[color] - (running === color ? (now() - since) / 1000 : 0); },
      flagged: function (color) { return c.remaining(color) <= 0; },
      /* A side finished a legal move: settle its time, add its increment once, start the other side. */
      moveMade: function (color) { settle(); if (running === color || running === null) { if (left[color] <= 0) { left[color] = 0; running = null; return true; } left[color] += tc.inc; } running = color === 'w' ? 'b' : 'w'; since = now(); return false; },
      charge: function (color, sec) { settle(); left[color] -= sec; return c.remaining(color) <= 0; },
      set: function (w, b) { settle(); if (isFinite(w)) left.w = w; if (isFinite(b)) left.b = b; },
      snapshot: function () { return { w: Math.max(0, c.remaining('w')), b: Math.max(0, c.remaining('b')) }; }
    };
    return c;
  };
  /* Timeout result: a flag loses, unless the opponent has only a lone king, or only K+single minor
     against a lone king — then no checkmate is possible and the game is drawn. Nothing else is claimed. */
  App.flagResult = function (fen, flagged) {
    var board = fen.split(' ')[0], opp = flagged === 'w' ? 'b' : 'w', mine = [], theirs = [];
    board.replace(/[a-zA-Z]/g, function (ch) { var col = ch === ch.toUpperCase() ? 'w' : 'b', t = ch.toLowerCase(); if (t !== 'k') (col === opp ? theirs : mine).push(t); return ch; });
    var lone = !theirs.length, minorVsBare = theirs.length === 1 && /[nb]/.test(theirs[0]) && !mine.length;
    return lone || minorVsBare ? { draw: true, why: 'time out vs insufficient material' } : { draw: false, why: 'on time' };
  };
  App.fmtClock = function (t) { if (t < 10 && t > 0) { var d = Math.floor(t * 10) / 10; return '0:0' + d.toFixed(1); } t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  /* ================= PLAY vs STACY ================= */
  App.register('play', {
    title: 'Play vs Stacy', back: 'playhub', nav: 'playhub',
    render: function (el) {
      if (App.resumeActive && S().activeGame) { App.resumeActive = false; var ag = S().activeGame, rc = Object.assign({}, ag.cfg || {}, { resume: ag }); App.playGame(el, rc); return; }
      App.resumeActive = false;
      var s = S().settings, cfg = { color: s.playColor || 'w', level: Number.isInteger(+s.level) && +s.level >= 0 && +s.level < Engine.LEVELS.length ? +s.level : 4, coach: s.coachOn !== false, botId:s.botId||'generic', pace:s.botPace||'medium', start: 'normal', clock: App.timeControl(s.timeControl).id };
      /* v6 chooser: white header (title + colour selector) → black "Game setup" panel listing opponents.
         The selected opponent is a white card with its detail and the one primary "Let's play!" action. */
      el.innerHTML = App.ui.head({ eyebrow: 'Play', title: 'Choose your opponent', sub: 'Stacy coaches while you play. Leaving pauses and saves the game.' });
      var head = el.firstElementChild || el.children[0];
      var colorSeg = App.seg([{ id: 'w', label: '~i:king~ White' }, { id: 'b', label: '~i:king~ Black' }, { id: 'r', label: '~i:shuffle~ Random' }], cfg.color, function (v) { cfg.color = v; }, 'block');
      colorSeg.setAttribute('aria-label', 'Play as'); if (head && head.appendChild) head.appendChild(colorSeg);
      if (S().activeGame) { var cc = App.continueCard(); el.appendChild(cc); }
      var card = App.html('<section class="panel chooser-panel" aria-labelledby="setupT"><div class="panel-head"><h2 id="setupT">Game setup</h2><span class="panel-aside">Labels are approximate</span></div></section>');
      var list = App.html('<ol class="timeline chooser" role="radiogroup" aria-label="Opponent"></ol>');
      card.appendChild(list);
      var detail = App.html('<div class="chooser-detail"></div>');
      var bio = App.html('<div class="bot-description"></div>'); detail.appendChild(bio);
      var lv = App.html('<div class="lvl-row"><label class="small">Strength <input type="range" min="0" max="' + (Engine.LEVELS.length - 1) + '" step="1" aria-label="Generic Stacy strength"></label><b id="lvl"></b></div>');
      var rng = lv.querySelector('input'); rng.value = cfg.level; var lvb = lv.querySelector('#lvl');
      function upd() { cfg.level = +rng.value; lvb.textContent = 'Lv ' + (cfg.level + 1) + ' · ' + lvlLabel(cfg.level); }
      rng.oninput = upd; detail.appendChild(lv);
      var coachSeg = App.seg([{ id: 'on', label: ' Coach me' }, { id: 'off', label: ' Just play' }], cfg.coach ? 'on' : 'off', function (v) { cfg.coach = v === 'on'; }, 'block'); coachSeg.setAttribute('aria-label', 'Coaching'); detail.appendChild(coachSeg);
      /* Visible time-control picker: category, then preset. Both clocks show during the game. */
      var tcBox = App.html('<div class="time-control" role="group" aria-label="Time control"><div class="small opt-label">Time control</div></div>');
      var presetRow = App.html('<div class="preset-row" role="radiogroup" aria-label="Preset"></div>');
      var tcNote = App.html('<p class="tiny tc-note" aria-live="polite"></p>');
      function paintPresets() {
        var cat = App.timeControl(cfg.clock).cat; presetRow.innerHTML = '';
        App.TIME_CONTROLS.filter(function (t) { return t.cat === cat; }).forEach(function (t) {
          var on = t.id === cfg.clock, b = App.html('<button type="button" class="chip preset' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-tc="' + t.id + '">' + t.label + '</button>');
          b.onclick = function () { cfg.clock = t.id; paintPresets(); }; presetRow.appendChild(b);
        });
        var tc = App.timeControl(cfg.clock);
        tcNote.textContent = tc.base ? tc.cat + ' ' + tc.label + ': ' + (tc.base / 60) + ' min each' + (tc.inc ? ' + ' + tc.inc + ' s per move' : ', no increment') + '. Both clocks are visible; running out of time loses. Pause still stops both clocks.' + (tc.base <= 120 ? ' Bullet uses the bot’s fast thinking pace.' : '') : 'No clock. Take as long as you need.';
      }
      var catSeg = App.seg(App.TIME_CATEGORIES.map(function (c) { return { id: c, label: c }; }), App.timeControl(cfg.clock).cat, function (v) { if (App.timeControl(cfg.clock).cat === v) return; cfg.clock = (App.TIME_CONTROLS.find(function (t) { return t.cat === v; }) || App.TIME_CONTROLS[0]).id; paintPresets(); if (App.ui && App.ui.swap) App.ui.swap(presetRow, catSeg.lastDir); }, 'block');
      catSeg.setAttribute('aria-label', 'Time category');
      tcBox.appendChild(catSeg); tcBox.appendChild(presetRow); tcBox.appendChild(tcNote); paintPresets();
      tcBox.pick = function (id) { cfg.clock = App.timeControl(id).id; paintPresets(); }; detail.appendChild(tcBox);
      var go = App.html('<button class="btn primary lg block" id="letsPlay">Let\'s play! ~i:pawn~</button>');
      detail.appendChild(go);
      var opts = [{ id: 'generic', name: 'Stacy', elo: null }].concat(App.BOTS), rows = [];
      if (!App.bot(cfg.botId)) cfg.botId = 'generic';
      function select(id) {
        cfg.botId = id; var b = App.bot(id); rng.disabled = !!b; lv.classList.toggle('hide', !!b);
        if (b) { cfg.level = b.level; rng.value = b.level; lvb.textContent = b.name + ' · ~' + b.elo; bio.innerHTML = '<span>' + App.esc(b.bio) + '</span>'; }
        else { upd(); bio.textContent = 'Original generic difficulty, from 400 to MAX. Bot labels are approximate, not platform ratings; Lite fallback is much weaker.'; }
        rows.forEach(function (r) { var on = r._id === id; r.classList.toggle('current', on); r.classList.toggle('paper', on); r.classList.toggle('next', !on); var rb = r.querySelector('.pick'); if (rb) rb.setAttribute('aria-checked', String(on)); if (on) r.appendChild(detail); });
      }
      opts.forEach(function (o) {
        var on = o.id === cfg.botId;
        var r = App.html('<li class="tl-row pick-row ' + (on ? 'current paper' : 'next') + '" data-id="' + o.id + '"><span class="tl-mark">' + (o.elo ? '~' + o.elo : 'Any') + '</span><span class="tl-node" aria-hidden="true"></span><button type="button" class="pick" role="radio" aria-checked="' + on + '" data-id="' + o.id + '">' + (o.elo ? App.botAvatar(o.id) : App.avatar('happy', 'sm')) + '<span class="tl-body"><b class="tl-title">' + App.esc(o.name) + '</b><span class="tl-sub">' + (o.elo ? 'Approximate ' + o.elo : 'Any level · use the slider') + '</span></span></button></li>');
        r._id = o.id;
        r.onclick = function (e) { if (e && e.target && e.target.closest && e.target.closest('.chooser-detail')) return; if (cfg.botId !== o.id) select(o.id); };
        rows.push(r); list.appendChild(r);
      });
      select(cfg.botId);
      var more = App.html('<details class="options"><summary>Game options · pace, start position</summary></details>');
      function lab(t) { return App.html('<div class="small muted opt-label">' + t + '</div>'); }
      more.appendChild(lab('Thinking pace (visible, non-instant)'));
      var pace = App.html('<select class="input" aria-label="Thinking pace"><option value="fast">Fast · about half a second or more</option><option value="medium">Medium · about 1–2 seconds or more</option><option value="slow">Slow · about 2–3 seconds or more</option></select>'); pace.value = cfg.pace; pace.onchange = function () { cfg.pace = pace.value; }; more.appendChild(pace);
      more.appendChild(lab('Start from'));
      var startSel = App.html('<select class="input" aria-label="Start from"><option value="normal">Normal start</option></select>');
      OPENINGS.forEach(function (o) { o.lines.forEach(function (l) { startSel.insertAdjacentHTML('beforeend', '<option value="' + l.id + '">' + o.short + ': ' + l.name + ' (play as ' + (o.color === 'w' ? 'White' : 'Black') + ')</option>'); }); });
      if (App.playFromFen) { startSel.insertAdjacentHTML('afterbegin', '<option value="fen" selected>Position from analysis board</option>'); more.open = true; }
      more.appendChild(startSel);
      var clockSeg = App.seg([{ id: 'none', label: 'No clock' }, { id: '10', label: '10 min' }, { id: '5', label: '5+3' }], cfg.clock, function (v) { cfg.clock = v; }, 'block'); clockSeg.setAttribute('aria-label', 'Clock'); more.appendChild(clockSeg);
      go.onclick = function () {
        cfg.start = startSel.value; s.timeControl = cfg.clock; s.botPace=cfg.pace;s.botId=cfg.botId;s.level = cfg.level; s.playColor = cfg.color; s.coachOn = cfg.coach; App.save();
        App.confirmNewGame(function () { el.innerHTML = ''; App.playGame(el, cfg); });
      };
      var foot = App.html('<div class="panel-foot"><p class="tiny">Every game counts for your Stacy rating unless you use a hint or takeback.</p></div>');
      foot.appendChild(more); card.appendChild(foot);
      el.appendChild(card);
      if (App.rematch) { var rc = App.rematch; App.rematch = null; App.confirmNewGame(function () { el.innerHTML = ''; App.playGame(el, rc); }); return; }
      var recent = S().games.slice(-3).reverse();
      if (recent.length) { el.appendChild(App.html('<div class="section-title">Recent games</div>')); recent.forEach(function (g) { el.appendChild(gameItem(g)); }); }
    }
  });

  App.playGame = function (el, cfg) {
    var me = cfg.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : cfg.color, startFen = null, preMoves = [];
    if (cfg.start === 'fen' && App.playFromFen) { startFen = App.playFromFen; App.playFromFen = null; me = new Chess(startFen).turn(); }
    else if (cfg.start !== 'normal') {
      OPENINGS.forEach(function (o) { o.lines.forEach(function (l) { if (l.id === cfg.start) { me = o.color; preMoves = l.moves.split(' '); } }); });
    }
    if(cfg.resume&&cfg.resume.me)me=cfg.resume.me;
    var st = App.stage(el, { orientation: me, maxBubbles: 1,compactCoach:true }), over = false, token = 0, pre = null, takebacks = 0, moveGrades = [], assisted = false, paused = false,botTimer=null, gameId = (cfg.resume && cfg.resume.id) || ('g' + Date.now());
    var baseCfg = { color: cfg.color, level: cfg.level, coach: cfg.coach, start: cfg.start, clock: cfg.clock,botId:cfg.botId||'generic',practice:!!cfg.practice,pace:cfg.pace||'medium' };
    var bot=App.bot(cfg.botId),botElo=bot?bot.elo:Engine.LEVELS[cfg.level].elo;
    var chat=bot?new App.BotChat(bot.id,cfg.resume&&cfg.resume.botChat):null;if(chat)chat.post('start',true);
    var L = Engine.LEVELS[cfg.level], oppName = bot?bot.name+' (~'+bot.elo+')':'Stacy (' + lvlLabel(cfg.level) + ')';
    if (startFen) st.load(startFen);
    if(!cfg.resume)preMoves.forEach(function (m) { st.game.move(m); }); if(cfg.resume&&cfg.resume.pgn){if(!st.game.load_pgn(cfg.resume.pgn,{sloppy:true})&&cfg.resume.fen)st.load(cfg.resume.fen);}else if(cfg.resume&&cfg.resume.fen)st.load(cfg.resume.fen);st.sync(false);
    // Real board/history stay untouched. The separate planner projects ONLY queued own-piece movement.
    var premoveQueue=[],queueBaseFen=null,queueToken=null,queueRevision=0,projectionCache=null,queueButton=null,planner=null,ghostLayer=null,ghostPieces={};
    function preAllowed(){return !!S().settings.premoves&&!over&&!paused&&!st.input&&st.game.turn()!==me;}
    function projection(){var fen=st.game.fen();if(!projectionCache||projectionCache.base!==fen||projectionCache.revision!==queueRevision){projectionCache=App.Premove.project(fen,me,premoveQueue);projectionCache.base=fen;projectionCache.revision=queueRevision;}return projectionCache;}
    function paintPremove(){
      if(queueButton)queueButton.textContent='Premoves · '+premoveQueue.length;
      if(st.board.sqEls){var squares={};premoveQueue.forEach(function(p){squares[p.from]=true;squares[p.to]=true;});Object.keys(st.board.sqEls).forEach(function(sq){st.board.sqEls[sq].classList.toggle('premove-square',!!squares[sq]);});}
      if(ghostLayer){ghostLayer.remove();ghostLayer=null;}ghostPieces={};
      var active=premoveQueue.length&&S().settings.premoves&&!over&&!paused,projected=active?projection():null;
      Object.keys(st.board.pieces||{}).forEach(function(sq){var piece=st.board.pieces[sq];piece.classList.toggle('premove-original',!!active&&st.board.map[sq]&&st.board.map[sq][0]===me&&projected.own[sq]!==st.board.map[sq]);});
      if(active&&st.board.sqToPos){ghostLayer=document.createElement('div');ghostLayer.className='premove-ghost-layer';Object.keys(projected.own).forEach(function(sq){if(st.board.map[sq]===projected.own[sq])return;var e=document.createElement('div');e.className='piece premove-ghost';e.dataset.p=projected.own[sq];e.style.backgroundImage='url("'+pieceUrl(projected.own[sq])+'")';st.board.placeEl(e,sq,false);ghostPieces[sq]=e;ghostLayer.appendChild(e);});st.board.root.appendChild(ghostLayer);}
      if(planner&&!planner.closed)renderPlanner();
    }
    function changedQueue(){queueRevision++;projectionCache=null;paintPremove();}
    function cancelBotWait(){if(botTimer!==null){clearTimeout(botTimer);botTimer=null;}}
    function closePlanner(){if(!planner||planner.closed)return;var old=planner;planner=null;old.closed=true;old.sheet.close();}
    function clearPremove(){premoveQueue=[];queueBaseFen=null;queueToken=null;changedQueue();}
    function removeLastPremove(){if(!premoveQueue.length)return false;premoveQueue.pop();if(!premoveQueue.length){queueBaseFen=null;queueToken=null;}changedQueue();return true;}
    function queuePremove(from,to,promotion){
      if(!preAllowed())return false;
      if(premoveQueue.length>=App.Premove.MAX_QUEUE){App.toast('Queue safety limit: '+App.Premove.MAX_QUEUE+' moves. Remove moves or clear before adding more.');return false;}
      var projected=projection();if(projected.error!==null||App.Premove.targets(projected.fen,me,from).indexOf(to)<0||!projected.own[from])return false;
      if(promotion&&['q','r','b','n'].indexOf(promotion)<0)return false;
      if(!premoveQueue.length){queueBaseFen=st.game.fen();queueToken=token;}
      var item={from:from,to:to,promotion:promotion||'q'};premoveQueue.push(item);queueRevision++;projectionCache=App.Premove.advance(projected,me,item);projectionCache.base=st.game.fen();projectionCache.revision=queueRevision;paintPremove();
      if(premoveQueue.length===1&&!planner)App.toast('Premove queued. Translucent pieces show future own squares; solid opponents stay real. Continue from a ghost, or open Premoves. Promotions default to queen.');return true;
    }
    function renderPlanner(){
      var view=planner;if(!view||view.closed)return;var projected=projection();view.board.setPosition(projected.fen,false);view.board.setOrientation(st.board.orientation||me);
      view.sheet.el.querySelector('#queueCount').textContent=premoveQueue.length+' queued · '+(!S().settings.premoves?'OFF — enable in Settings':paused?'Game paused':over?'Game finished':preAllowed()?'plan your future moves':'your turn — return to the real board');
      var offset=Math.max(0,premoveQueue.length-40);view.sheet.el.querySelector('#queueList').innerHTML=(offset?'<p class="tiny muted">Showing last 40 of '+premoveQueue.length+' moves; execution always starts at #1.</p>':'')+'<ol start="'+(offset+1)+'">'+premoveQueue.slice(offset).map(function(p){return '<li>'+p.from+' → '+p.to+(p.to[1]==='1'||p.to[1]==='8'?' · promotion if pawn: '+p.promotion.toUpperCase():'')+'</li>';}).join('')+'</ol>'+(projected.error!==null?'<p class="tiny muted">Move #'+(projected.error+1)+' cannot currently be projected. No move is skipped: its real legality is checked after a reply. Clear or remove later moves to edit.</p>':'');
      var old=view.board.root.querySelector('.queue-enemies');if(old)old.remove();var layer=document.createElement('div');layer.className='queue-enemies';
      projected.overlaps.forEach(function(sq){var marker=document.createElement('span'),xy=view.board.sqToPos(sq);marker.className='queue-enemy';marker.style.left=(xy[0]*12.5)+'%';marker.style.top=(xy[1]*12.5)+'%';marker.style.backgroundImage='url("'+pieceUrl(projected.enemies[sq])+'")';marker.title='Actual opponent piece remains here; capture is only hypothetical.';layer.appendChild(marker);});view.board.root.appendChild(layer);
    }
    function openPlanner(){
      closePlanner();var view={closed:false},sh=App.sheet('<div class="queue-heading"><button class="btn primary block" id="queueBack">Back to game</button><h3>Hypothetical premove planner</h3><p class="tiny muted" id="queueCount"></p></div><div class="queue-scroll"><p class="small">This planning board moves only your queued pieces. The main board stays real. Opponent pieces stay at their last known squares; small marked enemy icons mean a capture has NOT happened. No opponent replies are invented. Only one queue head can play after each actual reply.</p><div class="queue-board"></div><div id="queueList" class="small"></div><p class="tiny muted">Tap/drag your future pieces to append moves. Every move is rechecked on the real board. An illegal head clears the entire remaining queue. Promotions default to queen. Browser safety limit: '+App.Premove.MAX_QUEUE+' moves.</p></div><div class="btn-row queue-footer"><button class="btn sm" id="queueUndo">Remove last</button><button class="btn sm danger" id="queueClear">Clear all</button></div>',{onClose:function(){if(planner===view){view.closed=true;planner=null;}}});
      view.sheet=sh;planner=view;sh.el.classList.add('premove-planner');view.board=new Board(sh.el.querySelector('.queue-board'),{orientation:st.board.orientation||me,coords:true,showDests:true,movable:function(){return preAllowed()&&projection().error===null?me:null;},legalDests:function(sq){return preAllowed()?App.Premove.targets(projection().fen,me,sq):[];},premove:preAllowed,onMove:function(from,to,promo){queuePremove(from,to,promo||'q');return false;}});
      App.q(sh.el,'#queueBack').onclick=closePlanner;App.q(sh.el,'#queueUndo').onclick=removeLastPremove;App.q(sh.el,'#queueClear').onclick=clearPremove;renderPlanner();return view;
    }
    var normalDests=st.board.opts.legalDests,normalMove=st.board.opts.onMove;
    st.board.opts.movable=function(){return st.input?me:preAllowed()?me:null;};
    st.board.opts.legalDests=function(sq){return preAllowed()&&projection().error===null?App.Premove.targets(projection().fen,me,sq):st.input?(normalDests?normalDests(sq):st.game.moves({square:sq,verbose:true}).map(function(m){return m.to;})):[];};
    st.board.opts.inputMap=function(){return preAllowed()&&premoveQueue.length?parseFenMap(projection().fen):st.board.map;};st.board.opts.inputPiece=function(sq){return preAllowed()&&ghostPieces[sq]||st.board.pieces[sq];};
    st.board.opts.premove=preAllowed;st.board.opts.onSelectSquare=function(sq){if(preAllowed()&&premoveQueue.length&&st.board.map&&st.board.map[sq]&&st.board.map[sq][0]===me&&!projection().own[sq]){App.toast('That piece has a future square. Open Premoves to continue its planned route.');return false;}};
    st.board.opts.onMove=function(from,to,promotion){if(preAllowed()){queuePremove(from,to,'q');return false;}return normalMove?normalMove(from,to,promotion):st.onUserMove(from,to,promotion);};
    if(st.board.root&&st.board.root.addEventListener)st.board.root.addEventListener('contextmenu',function(e){e.preventDefault();clearPremove();});
    function applyPremove(beforeFen,my){
      if(!premoveQueue.length)return false;
      var p=premoveQueue[0];if(!S().settings.premoves||over||paused||queueToken!==my||queueBaseFen!==beforeFen||!App.Premove.legal(st.game.fen(),me,p)){clearPremove();App.toast('Premove queue cleared: the first move is no longer legal. No later move was skipped or played.');return false;}
      // Consume before calling the normal move handler; synchronous callbacks cannot execute this head twice.
      premoveQueue.shift();changedQueue();
      if(clock&&clock.charge(me,.1)){clearPremove();flag(me);return true;}
      st.input=true;st.board.opts.showDests=true;var played=st.onUserMove(p.from,p.to,p.promotion);
      if(!played){clearPremove();App.toast('Premove queue cancelled. Play your move on the real board.');return false;}
      if(premoveQueue.length&&!over&&!paused){queueBaseFen=st.game.fen();queueToken=token;}else{queueBaseFen=null;queueToken=null;}changedQueue();return true;
    }
    st.queuePremove=queuePremove;st.clearPremove=clearPremove;st.removeLastPremove=removeLastPremove;st.openPremovePlanner=openPlanner;st.closePremovePlanner=closePlanner;
    // player bars + clocks
    var tc = App.timeControl(cfg.clock), clock = tc.base ? App.GameClock(tc) : null, clockT = null; cfg.clock = tc.id;
    var help={hints:0,takebacks:0};if(cfg.resume){moveGrades=cfg.resume.grades||[];takebacks=cfg.resume.takebacks||0;help={hints:+((cfg.resume.help||{}).hints)||0,takebacks:+((cfg.resume.help||{}).takebacks)||takebacks};assisted=!!cfg.resume.assisted||takebacks>0;if(clock&&cfg.resume.clocks){clock.set(+cfg.resume.clocks.w,+cfg.resume.clocks.b);}if(cfg.resume.startFen)startFen=cfg.resume.startFen;}
    function checkpoint(){var snap={pgn:st.game.pgn(),fen:st.game.fen(),me:me,grades:moveGrades,takebacks:takebacks,help:{hints:help.hints,takebacks:help.takebacks},assisted:assisted,clocks:clock?clock.snapshot():{w:0,b:0},over:over,botChat:chat?chat.log:[]};if(cfg.onSave)return cfg.onSave(snap);
      if(over){if(S().activeGame&&S().activeGame.id===gameId)delete S().activeGame;App.save();return;}if(!st.game.history().length&&!startFen&&!preMoves.length){return;}
      snap.id=gameId;snap.cfg=baseCfg;snap.startFen=startFen;snap.opp=oppName;snap.elo=botElo;snap.savedAt=Date.now();snap.myMoves=st.game.history({verbose:true}).filter(function(m){return m.color===me;}).length;S().activeGame=snap;App.save();}
    function pauseGame(show){if(over||paused)return;paused=true;if(clock){clock.stop();drawClocks();}cancelBotWait();closePlanner();clearPremove();token++;st.input=false;if(topBar){topBar.querySelector('#botThinking').textContent='Paused';topBar.querySelector('#botThinking').title='Paused — use Resume.';}checkpoint();App.saveNow&&App.saveNow();if(show){var v=App.html('<div class="pause-veil"><div><div class="eyebrow">Paused</div><h3 style="margin:6px 0 12px">Game saved</h3><div class="btn-row" style="justify-content:center"><button class="btn primary" id="pvResume">~i:play~ Resume</button><button class="btn" id="pvExit">~i:home~ Exit</button></div><p class="tiny muted" style="margin-top:10px">The clock is stopped. Continue any time from Home or Play.</p></div></div>');st.board.root.parentNode.appendChild(v);App.q(v,'#pvResume').onclick=function(){v.remove();resumeGame();};App.q(v,'#pvExit').onclick=function(){App.go('home');};}}
    function resumeGame(){if(over||!paused)return;paused=false;if(clock)clock.start(st.game.turn());if(st.game.turn()===me)userTurn();else stacyTurn();}
    function onHide(){if(document.visibilityState==='hidden')pauseGame(true);}
    function onPageHide(){if(!over){checkpoint();App.saveNow&&App.saveNow();}}
    if(!cfg.onSave){document.addEventListener('visibilitychange',onHide);window.addEventListener('pagehide',onPageHide);}
    var topBar = App.html('<div class="row grow"><div class="avatar sm">' + (bot?App.botAvatar(bot.id):window.stacyAvatar('happy')) + '</div><b class="small">' + oppName + '</b><span class="tiny muted bot-thinking" id="botThinking" aria-live="polite"></span><span class="grow"></span><span class="clock ' + (cfg.clock === 'none' ? 'hide' : '') + '" id="ck-opp"></span></div>');
    var botBar = App.html('<div class="row grow"><b class="small">' + App.esc(S().settings.name || 'You') + (App.realRating() ? ' ('+App.realRating()+')' : '') + '</b><span class="grow"></span><span class="badge" id="evalb" title="Evaluation">0.0</span><span class="clock ' + (cfg.clock === 'none' ? 'hide' : '') + '" id="ck-me"></span></div>');
    st.top.appendChild(topBar); st.bottom.appendChild(botBar);
    var evalBar = App.html('<div class="eval-bar"><i style="width:50%"></i></div>'); st.bottom.parentNode.insertBefore(evalBar, st.bottom.nextSibling);
    function drawClocks() { if (!clock) return; var o = me === 'w' ? 'b' : 'w', a = el.querySelector('#ck-me'), b = el.querySelector('#ck-opp'), run = clock.running(), mine = clock.remaining(me), theirs = clock.remaining(o);
      a.textContent = App.fmtClock(mine); b.textContent = App.fmtClock(theirs); a.classList.toggle('low', mine < Math.min(20, tc.base * .1 + 5)); b.classList.toggle('low', theirs < Math.min(20, tc.base * .1 + 5));
      a.classList.toggle('active', run === me); b.classList.toggle('active', run === o); a.setAttribute('aria-label', 'Your clock ' + a.textContent + (run === me ? ', running' : '')); b.setAttribute('aria-label', 'Opponent clock ' + b.textContent + (run === o ? ', running' : '')); }
    function flag(color) { if (over || !clock) return; clock.stop(); var r = App.flagResult(st.game.fen(), color); drawClocks(); endGame(r.draw ? 'draw' : color === me ? 'loss' : 'win', r.why); }
    function clockTick() { if (over || paused || !clock) return; var t = st.game.turn(); if (clock.running() !== t) clock.start(t); if (clock.flagged(t)) { flag(t); return; } drawClocks(); }
    if (clock) { clock.start(st.game.turn()); drawClocks(); clockT = setInterval(clockTick, tc.base <= 180 ? 100 : 250); st.clock = clock; st.clockTick = clockTick; }
    App.screenCleanup = function () {cancelBotWait();closePlanner();clearPremove(); if (!over && !cfg.onSave) { paused = true; checkpoint(); App.saveNow && App.saveNow(); } clearInterval(clockT); over = true; document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide); };
    var movelist = App.html('<div class="card e1" style="padding:8px"><div class="movelist"></div></div>'); st.side.appendChild(movelist);
    function drawMoves() {
      var h = st.game.history(), ml = movelist.firstChild, start = startFen ? +(startFen.split(' ')[5] || 1) : 1, html = '';
      var blackFirst = startFen && startFen.split(' ')[1] === 'b';
      h.forEach(function (m, i) { var j = i + (blackFirst ? 1 : 0); if (j % 2 === 0) html += '<span class="num">' + (start + j / 2) + '.</span>'; else if (i === 0) html += '<span class="num">' + start + '…</span>'; var gr = moveGrades[i]; html += '<span' + (i === h.length - 1 ? ' class="cur"' : '') + '>' + m + (gr ? ' <small style="color:' + C.GRADES[gr].color + '">' + C.GRADES[gr].sym + '</small>' : '') + '</span>'; });
      ml.innerHTML = html; ml.scrollTop = ml.scrollHeight;
    }
    function setEval(line) {
      if (!line) return; var w = C.lineWin(line);
      evalBar.firstChild.style.width = w + '%'; el.querySelector('#evalb').textContent = C.evalText(line);
    }
    App.setContext(function () {
      return { mode: 'game vs Stacy (' + lvlLabel(cfg.level) + ')' + (cfg.coach ? ' with coaching' : ''), playerColor: me === 'w' ? 'White' : 'Black', fen: st.game.fen(), history: st.game.history().join(' '),
        eval: pre && pre.lines[0] ? C.evalText(pre.lines[0]) : '', bestMove: cfg.coach && pre && pre.best ? C.pvSan(st.game.fen(), [pre.best], 1)[0] : '(coaching off)', threats: C.threats(st.game.fen()).map(function (t) { return t.text; }).join('; '),
        allowedSans: pre && pre.lines[0] ? C.pvSan(st.game.fen(), pre.lines[0].pv, 6) : [] };
    });
    // pre-analyse the position while the user thinks
    function preAnalyse() {
      var my = token, fen = st.game.fen();
      pre = null;
      var o = Engine.modern ? { depth: 15, movetime: 1600, multipv: 2 } : { depth: 13, multipv: 2 };
      return Engine.analyse(fen, o).then(function (r) { if (r && App.Analysis) App.Analysis.remember(r, o.depth); if (my === token && r && r.fen === fen) { pre = r; setEval(r.lines[0]); } return r; }).catch(function(){return null;});
    }
    function userTurn() {
      if (over || paused) return;if(st.game.turn()!==me){st.input=false;stacyTurn();return;}
      closePlanner();st.board.opts.showDests=true;st.input = true;topBar.querySelector('#botThinking').textContent='Your turn';topBar.querySelector('#botThinking').title='Your turn — tap or drag one of your pieces.';paintPremove();checkpoint(); preAnalyse();
      if (cfg.coach) {
        var th = C.threats(st.game.fen()), ply = st.game.history().length;
        userTurn.n = (userTurn.n || 0) + 1;
        function reveal(pre) {
          var marks = {}; th.forEach(function (t) { marks[t.to] = 'bad'; });
          st.board.setMarks(marks);
          st.coach.say((pre || '~i:alert~ Watch out: ') + C.join(th.map(function (t) { return t.text; })) + '.', { cls: 'warn', mood: 'think', speak: true });
        }
        // Stacy asks before she tells: train the "is anything in danger?" habit
        var ask = ply >= 6 && (th.length ? userTurn.n % 2 === 0 : userTurn.n % 6 === 0);
        if (ask) {
          var answered = false;
          st.coach.say(' Quick check before you move: is any of your pieces in danger, or is there a mate threat?', { mood: 'think', speak: true, actions: [
            { label: '~i:alert~ Yes, something is', fn: function (b) { if (answered) return; answered = true; if (th.length) { App.sound('ok'); b.classList.add('success'); reveal('Yes! Great eyes ~i:eye~ '); } else { b.classList.add('disabled'); st.coach.say('Actually everything is safe right now. Good to be careful though! Now find your best move.', { mood: 'happy', speak: false }); } } },
            { label: '~i:check~ No, all safe', fn: function (b) { if (answered) return; answered = true; if (!th.length) { App.sound('ok'); b.classList.add('success'); st.coach.say('Correct, nothing is hanging! That\'s the blunder check. Now look for checks, captures and threats for YOU. ', { cls: 'good', mood: 'happy', speak: false }); } else { App.sound('err'); b.classList.add('disabled'); reveal('Look again! '); } } }] });
        } else if (th.length) reveal();
      }
    }
    function stacyTurn() {
      if (over || paused) return;
      cancelBotWait();st.input = false;st.board.opts.showDests=false;var my = token, fen = st.game.fen(), t0 = Date.now();var thinking=topBar.querySelector('#botThinking');thinking.textContent='thinking · '+(cfg.pace||'medium');
      Engine.botMove(fen,cfg.level,cfg.botId,st.game.history()).then(function (uci) {
        if(my!==token||over||paused)return;if(!uci){thinking.textContent='Retry opponent';st.coach.say('The engine was interrupted. Your position is saved; retry the opponent move.',{now:true,speak:false,actions:[{label:'Retry opponent move',once:true,fn:stacyTurn}]});return;}
        var delays={fast:[450,400],medium:[1100,700],slow:[2300,1000]},delay=delays[tc.base&&tc.base<=120?'fast':cfg.pace]||delays.medium;var wait=Math.max(0,delay[0]+Math.random()*delay[1]-(Date.now()-t0));
        botTimer=setTimeout(function () {botTimer=null;
          if (my !== token || over || paused || st.game.fen()!==fen) return;
          var m = st.play(uci); if (!m){thinking.textContent='Retry opponent';st.coach.say('The engine returned a move that could not be played. The real position is unchanged; retry the opponent.',{now:true,speak:false,actions:[{label:'Retry opponent move',once:true,fn:stacyTurn}]});return;}thinking.textContent='Your turn';if(chat)chat.post(/[+#]/.test(m.san)?'check':m.captured?'capture':'move');
          if (clock && clock.moveMade(m.color)) { flag(m.color); return; } drawClocks();
          moveGrades.push(null); drawMoves();
          if (checkEnd()) return;
          if(applyPremove(fen,my))return;userTurn();
        }, wait);
      }).catch(function(){if(my!==token||over||paused||st.game.fen()!==fen)return;thinking.textContent='Retry opponent';st.coach.say('The opponent engine could not respond. Your game is saved; it is still the opponent’s turn.',{now:true,speak:false,actions:[{label:'Retry opponent move',once:true,fn:stacyTurn}]});});
    }
    st.onUserMove = function (from, to, promo) {
      if(over||paused||!st.input||st.game.turn()!==me)return false;
      var fenB = st.game.fen(), mv = st.game.move({ from: from, to: to, promotion: promo }); if (!mv) return false;
      st.input = false;topBar.querySelector('#botThinking').textContent=cfg.coach?'Reviewing move':'Opponent turn'; st.sync(true, mv); App.moveSound(mv, st.game); st.board.setMarks({});checkpoint();
      if (clock && clock.moveMade(me)) { flag(me); return true; } drawClocks();
      var uci = from + to + (mv.promotion || ''), my = ++token;
      if(chat)chat.post(/[+#]/.test(mv.san)?'check':mv.captured?'capture':'move');
      if (checkEnd()) { moveGrades.push(null); drawMoves(); return true; }
      if (!cfg.coach) { moveGrades.push(null); drawMoves(); stacyTurn(); return true; }
      var gO = Engine.modern ? { depth: 14, movetime: 1500 } : { depth: 13 };
      var beforeP = pre && pre.fen === fenB ? Promise.resolve(pre) : Engine.analyse(fenB, { depth: gO.depth, movetime: gO.movetime, multipv: 2 });
      beforeP.then(function (before) {
        return Engine.analyse(st.game.fen(), { depth: gO.depth, movetime: gO.movetime, multipv: 2 }).then(function (after) { if (after && App.Analysis) App.Analysis.remember(after, gO.depth);
          if (my !== token || over) return;
          if(!before||!after||!before.lines.length||!after.lines.length){moveGrades.push(null);drawMoves();st.coach.say('Move played. Engine feedback was unavailable, so no grade was assigned.',{now:true,speak:false});stacyTurn();return;}
          var bookNote = null, ply = st.game.history().length - 1;
          if (preMoves.length === 0 && cfg.start === 'normal') { /* book detection: our repertoire */ OPENINGS.forEach(function (o) { o.lines.forEach(function (l) { var sans = l.moves.split(' '); if (ply < sans.length && st.game.history().every(function (h, i) { return h === sans[i]; })) { var nt = o.color === me ? (l.notes || {})[ply + 1] : null; if (!bookNote || nt) bookNote = nt || 'A standard, strong opening move.'; } }); }); }
          var hv = st.game.history({ verbose: true }), pmv = hv.length > 1 ? hv[hv.length - 2] : null;
          var j = C.judge(fenB, uci, before, after, { book: !!bookNote, bookNote: bookNote || '', prevMove: pmv ? { to: pmv.to, captured: pmv.captured } : null, minDepth: 10 });
          setEval(after && after.lines[0]);
          // blunder guard: offer a takeback BEFORE Stacy replies
          var oppGain = j.reply ? C.pvGain(st.game.fen(), j.reply.pv, 4, me === 'w' ? 'b' : 'w') : 0, mateThreat = j.reply && j.reply.mate != null && (j.reply.mate > 0) !== (me === 'w');
          if (S().settings.safety && cfg.coach && (j.grade === 'blunder' || j.grade === 'miss' || (j.grade === 'limited' && j.estimateGrade === 'blunder')) && j.loss >= 22 && (oppGain >= 2 || mateThreat)) {
            topBar.querySelector('#botThinking').textContent='Choose action';topBar.querySelector('#botThinking').title='Choose Take it back or Play it anyway in the coach panel.';st.board.setArrows(j.arrows.filter(function (a) { return a.color === 'red'; }));
            st.coach.say(' Wait! Are you sure? ' + j.text.split('Better was')[0], { now:true, cls: 'bad', mood: 'wow', head: '<span class="grade-pill" style="background:' + j.info.color + '">' + j.info.sym + ' ' + j.info.label + '</span>',
              actions: [{ label: '~i:undo~ Take it back', cls: 'primary', once:true, fn: function () { clearPremove();takebacks++; help.takebacks++; assisted = true; st.game.undo(); st.sync(true); st.board.setArrows([]); st.board.setBadge(null); st.coach.say('Good call! Look again: what are their checks, captures and threats? ~i:search~', { mood: 'happy' }); userTurn(); } },
                { label: 'Play it anyway', once:true, fn: function () { commit(j, true); } }] });
            return;
          }
          commit(j);
        });
      }).catch(function(){if(my!==token||over||paused)return;moveGrades.push(null);drawMoves();st.coach.say('Move played. Coach analysis failed; no grade was invented. The opponent can continue.',{now:true,speak:false});stacyTurn();});
      return true;
    };
    function commit(j, forced) {
      var decisionPly=st.game.history().length;
      if(chat&&['blunder','mistake','miss'].indexOf(j.grade)>=0)chat.post('mistake');
      moveGrades.push(j.grade); drawMoves();
      if (cfg.coach) {
        st.board.setBadge(st.game.history({ verbose: true }).slice(-1)[0].to, j.info.sym, j.info.color);
        var bad = ['inaccuracy', 'mistake', 'blunder', 'miss'].indexOf(j.grade) >= 0;
        if (bad || ['best', 'great', 'book'].indexOf(j.grade) >= 0 || Math.random() < 0.35) {
          st.board.setArrows(bad ? j.arrows : []);
          var ctx = { fen: j.facts ? j.facts.after : st.game.fen(), fenBefore: st.game.history().length ? null : null, move: j.san, grade: j.info.label, winPctLost: j.loss.toFixed(1), bestMove: j.bestSan, engineLine: j.text.split('Line: ')[1] || '', evalAfter: C.evalText(j.evalAfter), opponentBestReply: j.reply ? C.pvSan(st.game.fen(), [j.reply.uci], 1)[0] : '', allowedSans: [j.san, j.bestSan].concat(j.reply ? C.pvSan(st.game.fen(), j.reply.pv, 4) : []) };
          var fenBefore = (function () { var mv = st.game.undo(); var f = st.game.fen(); if (mv) st.game.move(mv.san); return f; })();
          ctx.allowedSans = ctx.allowedSans.concat(C.pvSan(fenBefore, (j.bestUci ? [j.bestUci] : []), 1));
          st.coach.say(j.text.split(' Line: ')[0], { cls: bad ? (j.grade === 'inaccuracy' ? 'warn' : 'bad') : 'good', mood: bad ? (j.grade === 'blunder' ? 'sad' : 'think') : 'happy', line: j.text.indexOf('Line: ') > 0 ? 'Best line: ' + j.text.split('Line: ')[1] : '',
            head: '<span class="grade-pill" style="background:' + j.info.color + '">' + j.info.sym + ' ' + j.info.label + '</span>', ai: { kind: bad || j.grade === 'great' ? 'move' : 'moveLite', ctx: ctx },
            actions: bad && !forced ? [{ label: '~i:undo~ Retry move', fn: function () { if(over||paused||st.game.history().length<decisionPly||st.game.history().length>decisionPly+1){App.toast('That decision has changed. Use Takeback or Game Review.');return;}cancelBotWait();closePlanner();clearPremove();token++;while(st.game.history().length>=decisionPly){st.game.undo();moveGrades.pop();} st.sync(true); drawMoves(); st.board.setArrows([]); st.board.setBadge(null); takebacks++; help.takebacks++; assisted = true; userTurn(); } }] : [] });
        }
      }
      stacyTurn();
    }
    function checkEnd() {
      var g = st.game;
      if (g.in_checkmate()) { endGame(g.turn() === me ? 'loss' : 'win', 'checkmate'); return true; }
      if (g.in_stalemate()) { endGame('draw', 'stalemate'); return true; }
      if (g.in_threefold_repetition()) { endGame('draw', 'repetition'); return true; }
      if (g.insufficient_material()) { endGame('draw', 'insufficient material'); return true; }
      if (g.in_draw()) { endGame('draw', '50-move rule'); return true; }
      return false;
    }
    function endGame(result, why) {if(App.Weekly)App.Weekly.ensure();
      if (over) return;cancelBotWait();closePlanner();clearPremove();over = true; st.input = false; clearInterval(clockT); if (clock) { clock.stop(); drawClocks(); } token++;
      if(chat)chat.post(result==='win'?'loss':result==='loss'?'win':'draw',true);
      var s = S(); s.stats.games++; s.stats[result === 'win' ? 'wins' : result === 'draw' ? 'draws' : 'losses']++;
      var g = st.game; g.header('White', me === 'w' ? s.settings.name : oppName, 'Black', me === 'b' ? s.settings.name : oppName, 'Date', App.today().replace(/-/g, '.'), 'Result', result === 'draw' ? '1/2-1/2' : (result === 'win') === (me === 'w') ? '1-0' : '0-1');
      if (startFen) g.header('FEN', startFen, 'SetUp', '1');
      var rec = { id: gameId, date: Date.now(), pgn: g.pgn(), result: result, why: why, elo: botElo,botId:cfg.botId||'generic',botChat:chat?chat.log:[], color: me, opp: oppName, source: 'stacy', takebacks: takebacks, help: { hints: help.hints, takebacks: help.takebacks }, assisted: assisted, cfg: baseCfg, playerRating: App.stacyScore() };
      if (cfg.practice || cfg.start !== 'normal') rec.ratedNote = 'Unrated: a training or non-standard-start game.';
      else if (assisted) rec.ratedNote = App.Analysis.helpNote(help) || 'Unrated: help was used in this game.';
      else if (st.game.history({ verbose: true }).filter(function (m) { return m.color === me; }).length < 2 && why !== 'checkmate') rec.ratedNote = 'Unrated: the game ended before you made two moves.';
      else if (App.adjustStacyRating) { var r0 = App.stacyScore(); App.adjustStacyRating('game', rec.elo, result === 'win' ? 1 : result === 'draw' ? .5 : 0, 1, rec.id); rec.stacyPending = true; }
      if(App.weeklyEvent&&!cfg.coach&&!assisted&&cfg.start==='normal')App.weeklyEvent(rec.id,'independent game',result==='win'?100:result==='draw'?50:0,{group:'bot:'+(cfg.botId||cfg.level)});
      s.games.push(rec); if (s.games.length > 60) s.games.shift();
      App.record('game', 1, result === 'win' ? 40 : result === 'draw' ? 20 : 10);if(!cfg.onSave&&S().activeGame&&S().activeGame.id===gameId)delete S().activeGame;checkpoint();if(cfg.onEnd)cfg.onEnd(result,rec);
      if (result === 'win') { App.sound('win'); App.confetti(); } else App.sound(result === 'draw' ? 'ok' : 'err');
      var endB = st.coach.say((result === 'win' ? 'YOU WON!  ' : result === 'draw' ? 'A draw!  ' : oppName+' wins this time. ') + '(' + why + '). ' + (result === 'win' ? 'I\'m so proud of you! Let\'s review it so you can win even more.' : 'Every loss is a lesson. Let\'s review the game together and find the turning points.'),
        { mood: result === 'win' ? 'wow' : 'happy', cls: result === 'win' ? 'good' : '', actions: [{ label: '~i:chart~ See results', cls: 'primary', fn: function () { App.go('results/' + rec.id); } }, { label: cfg.onEnd?'Return to session':'~i:repeat~ Rematch', fn: function () { if(cfg.onEnd){App.route();return;}el.innerHTML = ''; App.playGame(el, baseCfg); } }, { label: cfg.onEnd?'Session overview':'New setup', fn: function () { App.route(); } }] });
      if (!cfg.onEnd) setTimeout(function () { if (location.hash === '#/play' && App.lastStage === st) App.go('results/' + rec.id); }, 2600);
      st.coach.box.scrollTop=0;
    }
    st.button('~i:bulb~ Hint', function (b) {
      if (!st.input) return;
      var fen = st.game.fen(); (pre && pre.fen === fen ? Promise.resolve(pre) : preAnalyse()).then(function (r) {
        if (!r || !r.best || over || st.game.fen() !== fen) return; st.hintN = (st.hintFen === fen ? (st.hintN || 0) + 1 : 0); st.hintFen = fen;
        // Only a hint that was actually shown makes the game assisted; it is counted once per position.
        assisted = true; if (st.hintN === 0) help.hints++; checkpoint();
        var h = C.hints(fen, r.best); st.coach.say('~i:bulb~ ' + h[Math.min(st.hintN, h.length - 1)], { mood: 'think', ai: st.hintN === 0 ? { kind: 'hint', ctx: { fen: fen, bestMove: C.pvSan(fen, [r.best], 1)[0], themes: '' } } : null });
        if (st.hintN >= 1) { var mk = {}; mk[r.best.slice(0, 2)] = 'hint'; st.board.setMarks(mk); }
        if (st.hintN >= 2) st.board.setArrows([{ from: r.best.slice(0, 2), to: r.best.slice(2, 4), color: 'blue' }]);
      });
    });
    st.button('~i:undo~ Takeback', function () {
      if (over || st.game.history().length < 2) return;cancelBotWait();closePlanner();clearPremove();token++;
      if (st.game.turn() !== me) { st.game.undo(); moveGrades.pop(); } else { st.game.undo(); st.game.undo(); moveGrades.pop(); moveGrades.pop(); }
      takebacks++; help.takebacks++; assisted = true; st.sync(true); st.board.setArrows([]); st.board.setBadge(null); drawMoves(); checkpoint(); userTurn();
    });
    queueButton=st.button('Premoves · 0',openPlanner);st.button('Clear queue',clearPremove);
    st.button('~i:pause~ Pause', function () { pauseGame(true); });
    st.button('~i:handshake~ Draw', function () {
      if (over || paused) return;
      var ply = st.game.history().length;
      if (ply < 20) { st.coach.say(oppName + ' declines: it is too early for a draw. Play on.', { speak: true, now: true }); return; }
      var fen = st.game.fen(), bot = me === 'w' ? 'b' : 'w', elo = botElo;
      Engine.analyse(fen, { depth: Engine.modern ? 14 : 12, movetime: 900 }).then(function (r) {
        if (over || paused || st.game.fen()!==fen || !r || !r.lines[0]) return;
        var l = r.lines[0], cpBot = l.mate != null ? (l.mate > 0 ? 9999 : -9999) * (bot === 'w' ? 1 : -1) : (l.cp || 0) * (bot === 'w' ? 1 : -1);
        var tol = elo >= 2000 ? 15 : elo >= 1400 ? 35 : 70, accept = cpBot <= tol;
        if (accept) { st.coach.say(oppName + ' accepts the draw.', { speak: true, now: true }); endGame('draw', 'agreed'); }
        else st.coach.say(oppName + ' declines. ' + (cpBot > 150 ? 'They think they are clearly better.' : 'They want to keep playing for a win.'), { speak: true, now: true });
      });
    });
    st.button('~i:flag~ Resign', function () {
      if (over) return;
      var sh = App.sheet('<h3>Resign this game?</h3><p class="small muted">' + (assisted ? 'This game is unrated because help was used.' : 'It counts as a loss for your Stacy rating.') + '</p><div class="btn-row"><button class="btn danger" id="rsYes">~i:flag~ Resign</button><button class="btn" id="rsNo">Keep playing</button></div>');
      sh.el.querySelector('#rsYes').onclick = function () { sh.close(); endGame('loss', 'resigned'); };
      sh.el.querySelector('#rsNo').onclick = function () { sh.close(); };
    });
    if(chat)st.button('Chat · '+bot.name,function(){chat.open();checkpoint();});
    st.button('Moves',function(){App.sheet('<h3>Move history</h3><p class="small">'+App.esc(st.game.pgn())+'</p>');});
    st.button('⇅', function () { st.board.flip();paintPremove(); });
    drawMoves();
    st.coach.say(cfg.coach ? 'I’m right here—check their threats, then trust your thinking.' : 'Good luck—enjoy the game!', { mood:'happy' });
    if (st.game.turn() === me) userTurn(); else setTimeout(stacyTurn, 600);
    if(chat)chat.onChange=checkpoint;
    st.snapshot=checkpoint;st.pause=pauseGame;st.resume=resumeGame;st.status=function(){return {over:over,paused:paused,assisted:assisted,id:gameId,turn:st.game.turn(),canMove:!!st.input&&!paused&&!over&&st.game.turn()===me,premove:premoveQueue[0]||null,premoves:premoveQueue.map(function(p){return Object.assign({},p);})};};st.cancel=function(){cancelBotWait();closePlanner();clearPremove();token++;over=true;clearInterval(clockT);document.removeEventListener('visibilitychange',onHide);window.removeEventListener('pagehide',onPageHide);};checkpoint();return st;
  };
  App.registerLeave = function () { };
  App.screens.play.leave = function () { App.screenCleanup && App.screenCleanup(); };


  /* ---------- paused games: continue card + anti-abandon rule ---------- */
  App.continueCard = function () {
    var a = S().activeGame; if (!a) return document.createElement('div');
    var c = App.html('<div class="card continue-card"><div class="row"><div class="mini-board"></div><div class="grow"><div class="eyebrow">Paused game</div><b>vs ' + App.esc(a.opp || 'Stacy') + '</b><div class="tiny muted">' + (a.myMoves || 0) + ' of your moves · ' + (a.assisted ? 'unrated' : 'rated') + (a.cfg && a.cfg.clock !== 'none' ? ' · clock stopped' : '') + '</div></div></div><div class="btn-row" style="margin-top:10px"><button class="btn primary" id="cgGo">~i:play~ Continue game</button><button class="btn sm" id="cgResign">~i:flag~ Resign</button></div></div>');
    try { var b = new Board(c.querySelector('.mini-board'), { orientation: a.me, coords: false }); b.setPosition(a.fen, false); } catch (e) { }
    c.querySelector('#cgGo').onclick = function () { if (c._busy) return; c._busy = true; App.resumeActive = true; App.go('play'); };
    c.querySelector('#cgResign').onclick = function () { App.resolvePaused('resigned'); App.toast('Game resigned', 'ok'); App.route(); };
    return c;
  };
  App.resolvePaused = function (why) {
    var a = S().activeGame; if (!a) return null; delete S().activeGame;
    if ((a.myMoves || 0) < 2) { App.save(); return null; } // abort rule: almost no moves played
    var g = new Chess(); if (!g.load_pgn(a.pgn || '', { sloppy: true })) { g = new Chess(a.fen); }
    var me = a.me, nm = S().settings.name || 'You';
    g.header('White', me === 'w' ? nm : a.opp, 'Black', me === 'b' ? nm : a.opp, 'Date', App.today().replace(/-/g, '.'), 'Result', me === 'w' ? '0-1' : '1-0');
    var rec = { id: a.id || 'g' + Date.now(), date: Date.now(), pgn: g.pgn(), result: 'loss', why: why || 'resigned', elo: a.elo, color: me, opp: a.opp, source: 'stacy', takebacks: a.takebacks || 0, assisted: !!a.assisted, cfg: a.cfg, playerRating: App.stacyScore(),botId:a.cfg&&a.cfg.botId||'generic' };
    if (!a.assisted && !(a.cfg&&a.cfg.practice) && (!a.cfg||a.cfg.start==='normal') && App.adjustStacyRating) { var r0 = App.stacyScore(); App.adjustStacyRating('game', a.elo, 0, 1, rec.id); rec.stacyPending = true; } else rec.ratedNote = 'Unrated: a hint or takeback was used in this game.';
    var s = S(); s.stats.games++; s.stats.losses++; s.games.push(rec); if (s.games.length > 60) s.games.shift(); App.save(); return rec;
  };
  App.confirmNewGame = function (start) {
    var a = S().activeGame; if (!a) return start();
    var counts = !a.assisted && (a.myMoves || 0) >= 2;
    var sh = App.sheet('<h3>You have a paused game</h3><p class="small muted">vs ' + App.esc(a.opp || 'Stacy') + '. ' + (counts ? 'Starting a new game counts the paused one as a <b>resignation</b> (a loss for your Stacy rating).' : 'It will be discarded (it is unrated or too short to count).') + '</p><div class="btn-row"><button class="btn primary" id="ngCont">~i:play~ Continue paused game</button><button class="btn ' + (counts ? 'danger' : '') + '" id="ngNew">' + (counts ? 'Resign it and start new' : 'Discard and start new') + '</button></div>', { modal: false });
    sh.el.querySelector('#ngCont').onclick = function () { sh.close(); App.resumeActive = true; App.route(); };
    sh.el.querySelector('#ngNew').onclick = function () { sh.close(); App.resolvePaused('resigned (new game started)'); start(); };
  };

  /* ================= ANALYSIS BOARD ================= */
  App.register('analysis', {
    title: '~i:analysis~ Analysis', back: 'playhub', nav: 'playhub',
    render: function (el) {
      var st = App.stage(el, { orientation: 'w', maxBubbles: 3 }), line = [], cur = -1, base, deep = false, token = 0, last = null;
      base = App.analysisFen || new Chess().fen(); App.analysisFen = null;
      var evalBar = App.html('<div class="eval-bar"><i style="width:50%"></i></div>'); st.bottom.parentNode.insertBefore(evalBar, st.bottom.nextSibling);
      var linesBox = App.html('<div class="card e1" style="padding:10px"><div class="row small"><span class="engine-dot ok"></span><b id="anEng">Stockfish</b><span class="grow"></span><span class="muted" id="anDepth"></span></div><div id="anLines" class="col small" style="margin-top:6px;font-family:ui-monospace,Menlo,monospace"></div></div>');
      st.side.insertBefore(linesBox, st.side.firstChild);
      var ml = App.html('<div class="card e1" style="padding:8px"><div class="movelist"></div></div>'); st.side.appendChild(ml);
      st.input = true;
      function fenAt(i) { var g = new Chess(base); for (var k = 0; k <= i; k++) g.move(line[k]); return g; }
      function show(i, anim) { cur = i; st.game = fenAt(i); st.sync(anim !== false); st.input = true; drawList(); analyse(); }
      function drawList() {
        var html = '', moveNo = +(base.split(' ')[5] || 1), t = base.split(' ')[1];
        line.forEach(function (m, i) { if (t === 'w') html += '<span class="num">' + moveNo + '.</span>'; else if (i === 0) html += '<span class="num">' + moveNo + '…</span>'; html += '<span data-i="' + i + '"' + (i === cur ? ' class="cur"' : '') + '>' + m + '</span>'; if (t === 'b') moveNo++; t = t === 'w' ? 'b' : 'w'; });
        ml.firstChild.innerHTML = html || '<span class="faint">Make moves on the board. Both sides move.</span>';
        [].forEach.call(ml.querySelectorAll('[data-i]'), function (s) { s.onclick = function () { show(+s.dataset.i); }; });
      }
      function analyse() {
        var my = ++token, fen = st.game.fen(); last = null;
        Engine.cancelAll();
        if (st.game.game_over()) { el.querySelector('#anLines').innerHTML = '<b>' + (st.game.in_checkmate() ? 'Checkmate' : 'Draw') + '</b>'; return; }
        Engine.analyse(fen, { multipv: 3, movetime: deep ? 9000 : 2500, depth: deep ? 30 : 22, onInfo: function (r) { if (my === token) render(r); } }).then(function (r) { if (my === token && r) { render(r); last = r; } });
      }
      function render(r) {
        var fen = st.game.fen();
        if (!r.lines.length) return;
        evalBar.firstChild.style.width = C.lineWin(r.lines[0]) + '%';
        el.querySelector('#anDepth').textContent = 'depth ' + r.lines[0].depth + (deep ? ' · MAX' : '');
        el.querySelector('#anEng').textContent = Engine.status === 'ready' ? Engine.name.replace(' Multi-Variant', '') : Engine.name;
        el.querySelector('#anLines').innerHTML = r.lines.map(function (l) { return '<div><span class="badge" style="min-width:52px;justify-content:center">' + C.evalText(l) + '</span> ' + App.esc(C.pvText(fen, l.pv, 8)) + '</div>'; }).join('');
        st.board.setArrows(r.lines.slice(0, 2).map(function (l, i) { return { from: l.uci.slice(0, 2), to: l.uci.slice(2, 4), color: i ? 'blue' : 'green', opacity: i ? 0.5 : 0.8, width: i ? 11 : 17 }; }));
        last = r;
      }
      App.setContext(function () { return { mode: 'analysis board', fen: st.game.fen(), history: line.slice(0, cur + 1).join(' '), eval: last && last.lines[0] ? C.evalText(last.lines[0]) : '', bestMove: last && last.best ? C.pvSan(st.game.fen(), [last.best], 1)[0] : '', topLines: last ? last.lines.map(function (l) { return C.evalText(l) + ' ' + C.pvText(st.game.fen(), l.pv, 6); }).join(' | ') : '', threats: C.threats(st.game.fen()).map(function (t) { return t.text; }).join('; '), allowedSans: last ? [].concat.apply([], last.lines.map(function (l) { return C.pvSan(st.game.fen(), l.pv, 8); })) : [] }; });
      st.onUserMove = function (from, to, promo) {
        var g = new Chess(st.game.fen()), m = g.move({ from: from, to: to, promotion: promo }); if (!m) return false;
        line = line.slice(0, cur + 1); line.push(m.san); App.moveSound(m, g); show(line.length - 1); return true;
      };
      st.button('~i:first~', function () { show(-1); }); st.button('~i:back~', function () { if (cur >= 0) show(cur - 1); }); st.button('~i:play~', function () { if (cur < line.length - 1) show(cur + 1); }); st.button('~i:next~', function () { show(line.length - 1); });
      st.button('⇅', function () { st.board.flip(); });
      var deepBtn = st.button('~i:streak~ MAX depth', function () { deep = !deep; deepBtn.classList.toggle('primary', deep); analyse(); });
      st.button(' Explain', function () {
        var fen = st.game.fen(), th = C.threats(fen), hang = C.hanging(fen, st.game.turn() === 'w' ? 'b' : 'w');
        var parts = [];
        if (last && last.lines[0]) { var bf = C.moveFacts(fen, last.lines[0].uci); parts.push('Evaluation ' + C.evalText(last.lines[0]) + '. Best move: **' + bf.san + '**' + (bf.facts.length ? ' (' + C.join(bf.facts.slice(0, 2)) + ')' : '') + '.'); }
        if (hang.length) parts.push('Loose enemy piece: the ' + C.NAME[hang[0].piece[1]] + ' on ' + hang[0].sq + '.');
        if (th.length) parts.push('Careful: ' + C.join(th.map(function (t) { return t.text; })) + '.');
        st.coach.say(parts.join(' ') || 'Let the engine think for a second, then tap Explain again.', { ai: { kind: 'lesson', ctx: App.context() } });
      });
      st.button('~i:pawn~ Play from here', function () { App.playFromFen = st.game.fen(); App.go('play'); });
      st.button('~i:clipboard~ FEN/PGN', function () {
        var sh = App.sheet('<h3>Load a position or game</h3><textarea class="input" id="tx" placeholder="Paste a FEN or a PGN"></textarea><div class="btn-row" style="margin-top:10px"><button class="btn primary" id="ld">Load</button><button class="btn" id="cp">Copy current FEN</button><button class="btn" id="cpg">Copy PGN</button></div>');
        sh.el.querySelector('#tx').value = st.game.fen();
        sh.el.querySelector('#ld').onclick = function () {
          var t = sh.el.querySelector('#tx').value.trim(), g = new Chess();
          if (g.validate_fen(t).valid) { base = t; line = []; st.load(t); show(-1, false); sh.close(); return; }
          if (g.load_pgn(t, { sloppy: true })) { var hd = g.header(); base = hd.FEN || new Chess().fen(); line = g.history(); show(line.length - 1, false); sh.close(); return; }
          App.toast('That is not a valid FEN or PGN', 'err');
        };
        sh.el.querySelector('#cp').onclick = function () { App.copy(st.game.fen(), 'FEN'); };
        sh.el.querySelector('#cpg').onclick = function () { var g = new Chess(base); if (base !== new Chess().fen()) g.header('FEN', base, 'SetUp', '1'); line.forEach(function (m) { g.move(m); }); App.copy(g.pgn(), 'PGN'); };
      });
      st.button('~i:reset~ Reset', function () { base = new Chess().fen(); line = []; st.load(base); show(-1, false); });
      st.load(base); show(-1, false);
      st.coach.say('Analysis board with full-strength Stockfish. Move pieces for both sides, tap ~i:streak~ for maximum depth, or  Explain to hear what\'s going on.', { speak: false });
    }
  });

  /* ================= GAMES: import & list ================= */
  function gameItem(g) {
    var ic = g.result === 'win' ? '~i:trophy~' : g.result === 'draw' ? '' : g.result === 'loss' ? '' : '~i:pawn~';
    var it = App.html('<div class="list-item"><div class="li-ic">' + ic + '</div><div class="grow"><b>vs ' + App.esc(g.opp || '?') + '</b><span class="small muted">' + new Date(g.date).toLocaleDateString() + ' · ' + (g.color === 'w' ? 'White' : 'Black') + ' · ' + (g.source || '') + (g.acc ? ' · ' + g.acc + '% acc' : '') + '</span></div>' + (g.reviewed ? '<span class="badge ok">Reviewed</span>' : '<span class="badge">Review</span>') + '</div>');
    it.onclick = function () { App.go('review/' + g.id); };
    return it;
  }
  App.register('games', {
    title: '~i:search~ Game Review', back: 'playhub', nav: 'playhub',
    render: function (el) {
      var s = S().settings;
      var card = App.html('<div class="card e3"><h3>Import your games</h3><p class="small muted">Stacy reviews your real games with Stockfish, grades every move and saves your mistakes as puzzles.</p></div>');
      var tabsHost = App.html('<div></div>'), body = App.html('<div></div>');
      card.appendChild(tabsHost); card.appendChild(body);
      var tab = 'lichess';
      tabsHost.appendChild(App.tabs([{ id: 'lichess', label: 'Lichess' }, { id: 'chesscom', label: 'Chess.com' }, { id: 'pgn', label: 'PGN' }], tab, function (t) { tab = t; draw(); if (App.ui && App.ui.swap) App.ui.swap(body, this && this.lastDir); }));
      function draw() {
        if (tab === 'pgn') { body.innerHTML = '<textarea class="input" id="pgn" placeholder="Paste a PGN here"></textarea><div class="btn-row" style="margin-top:10px"><button class="btn primary" id="imp">Import PGN</button></div>'; body.querySelector('#imp').onclick = function () { importPgn(body.querySelector('#pgn').value, 'pgn'); }; return; }
        var key = tab === 'lichess' ? 'lichessUser' : 'chesscomUser';
        body.innerHTML = '<div class="row"><input class="input grow" id="user" placeholder="' + (tab === 'lichess' ? 'Lichess' : 'Chess.com') + ' username" autocapitalize="off" spellcheck="false"><button class="btn primary" id="fetch">Fetch</button></div><div id="msg" style="margin-top:8px"></div>';
        var u = body.querySelector('#user'); u.value = s[key] || '';
        body.querySelector('#fetch').onclick = function (e) {
          var name = u.value.trim(); if (!name) return; s[key] = name; App.save();
          var btn = e.currentTarget, msg = body.querySelector('#msg');
          App.btnBusy(btn, tab === 'lichess' ? fetchLichess(name) : fetchChesscom(name)).then(function (n) { msg.innerHTML = '<div class="alert ok">~i:check~ Imported ' + n + ' game' + (n === 1 ? '' : 's') + '</div>'; drawList(); }, function (er) { msg.innerHTML = '<div class="alert err">~i:alert~ ' + App.esc(er.message || er) + '</div>'; });
        };
      }
      draw(); el.appendChild(card);
      var listHost = App.html('<div></div>'); el.appendChild(listHost);
      function drawList() {
        listHost.innerHTML = '<div class="section-title"><span>Your games</span>' + (S().games.length ? '<button class="btn sm" id="expAll">~i:download~ Export PGN</button>' : '') + '</div>';
        var gs = S().games.slice().reverse();
        var ex = listHost.querySelector('#expAll'); if (ex) ex.onclick = function () { App.download('stacy-games-' + App.today() + '.pgn', S().games.map(function (g) { return g.pgn; }).join('\n\n'), 'application/x-chess-pgn'); };
        if (!gs.length) listHost.insertAdjacentHTML('beforeend', '<p class="muted small">No games yet. Play Stacy or import from Lichess / Chess.com.</p>');
        gs.forEach(function (g) { listHost.appendChild(gameItem(g)); });
      }
      drawList();
    }
  });
  function addImported(pgn, source, url) {
    var g = new Chess(); if (!g.load_pgn(pgn, { sloppy: true })) return false;
    var h = g.header(), s = S(), names = [s.settings.lichessUser, s.settings.chesscomUser].filter(Boolean).map(function (x) { return x.toLowerCase(); });
    var color = names.indexOf((h.Black || '').toLowerCase()) >= 0 ? 'b' : 'w';
    var res = h.Result === '1/2-1/2' ? 'draw' : (h.Result === '1-0') === (color === 'w') ? 'win' : h.Result === '*' ? '?' : 'loss';
    var id = 'i' + ((h.Site || '') + (h.Date || '') + (h.White || '') + (h.Black || '') + (h.UTCTime || '') + g.history().length).split('').reduce(function (a, c) { return (a * 31 + c.charCodeAt(0)) >>> 0; }, 7);
    if (s.games.some(function (x) { return x.id === id; })) return false;
    s.games.push({ id: id, date: Date.parse((h.UTCDate || h.Date || '').replace(/\./g, '-')) || Date.now(), pgn: pgn, result: res, color: color, opp: color === 'w' ? h.Black : h.White, source: source, url: url || h.Site, elo: +(color === 'w' ? h.BlackElo : h.WhiteElo) || null, imported: true });
    if (s.games.length > 60) s.games.shift();
    App.save(); return true;
  }
  function importPgn(text, source) {
    var parts = text.split(/\n\s*\n(?=\[Event )/), n = 0;
    parts.forEach(function (p) { if (p.trim() && addImported(p.trim(), source)) n++; });
    App.toast(n ? 'Imported ' + n + ' game(s)' : 'No new valid games found', n ? 'ok' : 'err'); App.route();
  }
  function fetchLichess(user) {
    return fetch('https://lichess.org/api/games/user/' + encodeURIComponent(user) + '?max=15&pgnInJson=true&opening=true', { headers: { Accept: 'application/x-ndjson' } }).then(function (r) {
      if (r.status === 404) throw new Error('Lichess user not found');
      if (r.status === 429) throw new Error('Lichess says slow down. Try again in a minute.');
      if (!r.ok) throw new Error('Lichess error ' + r.status);
      return r.text();
    }).then(function (t) {
      var n = 0; t.split('\n').forEach(function (l) { if (!l.trim()) return; try { var j = JSON.parse(l); if (j.pgn && addImported(j.pgn, 'lichess', 'https://lichess.org/' + j.id)) n++; } catch (e) { } });
      return n;
    });
  }
  function fetchChesscom(user) {
    return fetch('https://api.chess.com/pub/player/' + encodeURIComponent(user.toLowerCase()) + '/games/archives').then(function (r) {
      if (r.status === 404) throw new Error('Chess.com user not found');
      if (r.status === 429) throw new Error('Chess.com says slow down. Try again in a minute.');
      if (!r.ok) throw new Error('Chess.com error ' + r.status); return r.json();
    }).then(function (j) {
      // A new monthly archive may be listed before it is ready. Check up to 3 months.
      var arcs = (j.archives || []).slice(-3).reverse(), scanned = 0, n = 0;
      function next() {
        if (!arcs.length || scanned >= 15) return n;
        var arc = arcs.shift();
        if (!/^https:\/\/api\.chess\.com\/pub\/player\//i.test(arc)) throw new Error('Unexpected Chess.com archive URL');
        return fetch(arc).then(function (r) {
          if (r.status === 404) return null;
          if (r.status === 429) throw new Error('Chess.com says slow down. Try again in a minute.');
          if (!r.ok) throw new Error('Chess.com archive error ' + r.status); return r.json();
        }).then(function (m) {
          var gs = ((m && m.games) || []).filter(function (g) { return g.pgn && (g.rules || 'chess') === 'chess'; }).slice(-(15 - scanned));
          scanned += gs.length;
          gs.forEach(function (g) { if (addImported(g.pgn, 'chess.com', g.url)) n++; });
          return next();
        });
      }
      return next();
    });
  }
  App._import = { addImported: addImported, fetchLichess: fetchLichess, fetchChesscom: fetchChesscom };


  /* ================= GAMES: import & list ================= */
  function gameItem(g) {
    var ic = g.result === 'win' ? '~i:trophy~' : g.result === 'draw' ? '' : g.result === 'loss' ? '' : '~i:pawn~';
    var it = App.html('<div class="list-item"><div class="li-ic">' + ic + '</div><div class="grow"><b>vs ' + App.esc(g.opp || '?') + '</b><span class="small muted">' + new Date(g.date).toLocaleDateString() + ' · ' + (g.color === 'w' ? 'White' : 'Black') + ' · ' + (g.source || '') + (g.acc ? ' · ' + g.acc + '% acc' : '') + '</span></div>' + (g.reviewed ? '<span class="badge ok">Reviewed</span>' : '<span class="badge">Review</span>') + '</div>');
    it.onclick = function () { App.go('review/' + g.id); };
    return it;
  }
  App.register('games', {
    title: '~i:search~ Game Review', back: 'playhub', nav: 'playhub',
    render: function (el) {
      var s = S().settings;
      var card = App.html('<div class="card e3"><h3>Import your games</h3><p class="small muted">Stacy reviews your real games with Stockfish, grades every move and saves your mistakes as puzzles.</p></div>');
      var tabsHost = App.html('<div></div>'), body = App.html('<div></div>');
      card.appendChild(tabsHost); card.appendChild(body);
      var tab = 'lichess';
      tabsHost.appendChild(App.tabs([{ id: 'lichess', label: 'Lichess' }, { id: 'chesscom', label: 'Chess.com' }, { id: 'pgn', label: 'PGN' }], tab, function (t) { tab = t; draw(); if (App.ui && App.ui.swap) App.ui.swap(body, this && this.lastDir); }));
      function draw() {
        if (tab === 'pgn') { body.innerHTML = '<textarea class="input" id="pgn" placeholder="Paste a PGN here"></textarea><div class="btn-row" style="margin-top:10px"><button class="btn primary" id="imp">Import PGN</button></div>'; body.querySelector('#imp').onclick = function () { importPgn(body.querySelector('#pgn').value, 'pgn'); }; return; }
        var key = tab === 'lichess' ? 'lichessUser' : 'chesscomUser';
        body.innerHTML = '<div class="row"><input class="input grow" id="user" placeholder="' + (tab === 'lichess' ? 'Lichess' : 'Chess.com') + ' username" autocapitalize="off" spellcheck="false"><button class="btn primary" id="fetch">Fetch</button></div><div id="msg" style="margin-top:8px"></div>';
        var u = body.querySelector('#user'); u.value = s[key] || '';
        body.querySelector('#fetch').onclick = function (e) {
          var name = u.value.trim(); if (!name) return; s[key] = name; App.save();
          var btn = e.currentTarget, msg = body.querySelector('#msg');
          App.btnBusy(btn, tab === 'lichess' ? fetchLichess(name) : fetchChesscom(name)).then(function (n) { msg.innerHTML = '<div class="alert ok">~i:check~ Imported ' + n + ' game' + (n === 1 ? '' : 's') + '</div>'; drawList(); }, function (er) { msg.innerHTML = '<div class="alert err">~i:alert~ ' + App.esc(er.message || er) + '</div>'; });
        };
      }
      draw(); el.appendChild(card);
      var listHost = App.html('<div></div>'); el.appendChild(listHost);
      function drawList() {
        listHost.innerHTML = '<div class="section-title"><span>Your games</span>' + (S().games.length ? '<button class="btn sm" id="expAll">~i:download~ Export PGN</button>' : '') + '</div>';
        var gs = S().games.slice().reverse();
        var ex = listHost.querySelector('#expAll'); if (ex) ex.onclick = function () { App.download('stacy-games-' + App.today() + '.pgn', S().games.map(function (g) { return g.pgn; }).join('\n\n'), 'application/x-chess-pgn'); };
        if (!gs.length) listHost.insertAdjacentHTML('beforeend', '<p class="muted small">No games yet. Play Stacy or import from Lichess / Chess.com.</p>');
        gs.forEach(function (g) { listHost.appendChild(gameItem(g)); });
      }
      drawList();
    }
  });
  function addImported(pgn, source, url) {
    var g = new Chess(); if (!g.load_pgn(pgn, { sloppy: true })) return false;
    var h = g.header(), s = S(), names = [s.settings.lichessUser, s.settings.chesscomUser].filter(Boolean).map(function (x) { return x.toLowerCase(); });
    var color = names.indexOf((h.Black || '').toLowerCase()) >= 0 ? 'b' : 'w';
    var res = h.Result === '1/2-1/2' ? 'draw' : (h.Result === '1-0') === (color === 'w') ? 'win' : h.Result === '*' ? '?' : 'loss';
    var id = 'i' + ((h.Site || '') + (h.Date || '') + (h.White || '') + (h.Black || '') + (h.UTCTime || '') + g.history().length).split('').reduce(function (a, c) { return (a * 31 + c.charCodeAt(0)) >>> 0; }, 7);
    if (s.games.some(function (x) { return x.id === id; })) return false;
    s.games.push({ id: id, date: Date.parse((h.UTCDate || h.Date || '').replace(/\./g, '-')) || Date.now(), pgn: pgn, result: res, color: color, opp: color === 'w' ? h.Black : h.White, source: source, url: url || h.Site, elo: +(color === 'w' ? h.BlackElo : h.WhiteElo) || null, imported: true });
    if (s.games.length > 60) s.games.shift();
    App.save(); return true;
  }
  function importPgn(text, source) {
    var parts = text.split(/\n\s*\n(?=\[Event )/), n = 0;
    parts.forEach(function (p) { if (p.trim() && addImported(p.trim(), source)) n++; });
    App.toast(n ? 'Imported ' + n + ' game(s)' : 'No new valid games found', n ? 'ok' : 'err'); App.route();
  }
  function fetchLichess(user) {
    return fetch('https://lichess.org/api/games/user/' + encodeURIComponent(user) + '?max=15&pgnInJson=true&opening=true', { headers: { Accept: 'application/x-ndjson' } }).then(function (r) {
      if (r.status === 404) throw new Error('Lichess user not found');
      if (r.status === 429) throw new Error('Lichess says slow down. Try again in a minute.');
      if (!r.ok) throw new Error('Lichess error ' + r.status);
      return r.text();
    }).then(function (t) {
      var n = 0; t.split('\n').forEach(function (l) { if (!l.trim()) return; try { var j = JSON.parse(l); if (j.pgn && addImported(j.pgn, 'lichess', 'https://lichess.org/' + j.id)) n++; } catch (e) { } });
      return n;
    });
  }
  function fetchChesscom(user) {
    return fetch('https://api.chess.com/pub/player/' + encodeURIComponent(user.toLowerCase()) + '/games/archives').then(function (r) {
      if (r.status === 404) throw new Error('Chess.com user not found');
      if (r.status === 429) throw new Error('Chess.com says slow down. Try again in a minute.');
      if (!r.ok) throw new Error('Chess.com error ' + r.status); return r.json();
    }).then(function (j) {
      // A new monthly archive may be listed before it is ready. Check up to 3 months.
      var arcs = (j.archives || []).slice(-3).reverse(), scanned = 0, n = 0;
      function next() {
        if (!arcs.length || scanned >= 15) return n;
        var arc = arcs.shift();
        if (!/^https:\/\/api\.chess\.com\/pub\/player\//i.test(arc)) throw new Error('Unexpected Chess.com archive URL');
        return fetch(arc).then(function (r) {
          if (r.status === 404) return null;
          if (r.status === 429) throw new Error('Chess.com says slow down. Try again in a minute.');
          if (!r.ok) throw new Error('Chess.com archive error ' + r.status); return r.json();
        }).then(function (m) {
          var gs = ((m && m.games) || []).filter(function (g) { return g.pgn && (g.rules || 'chess') === 'chess'; }).slice(-(15 - scanned));
          scanned += gs.length;
          gs.forEach(function (g) { if (addImported(g.pgn, 'chess.com', g.url)) n++; });
          return next();
        });
      }
      return next();
    });
  }
  App._import = { addImported: addImported, fetchLichess: fetchLichess, fetchChesscom: fetchChesscom };

  App.register('review', {
    title: '~i:search~ Game review', back: 'games', nav: 'playhub',
    render: function (el, p) {
      var rec = S().games.filter(function (g) { return g.id === p[0]; })[0];
      if (!rec) { return App.go(p[0] ? 'games' : 'review-due'); }
      var g = new Chess(); g.load_pgn(rec.pgn, { sloppy: true });
      var hd = g.header(), base = hd.FEN || new Chess().fen(), moves = g.history({ verbose: true }), me = rec.color;
      var st = App.stage(el, { orientation: me, maxBubbles: 2 }), cur = -1, data = [], token = 0;
      st.input = false;
      var evalBar = App.html('<div class="eval-bar"><i style="width:50%"></i></div>'); st.bottom.parentNode.insertBefore(evalBar, st.bottom.nextSibling);
      var sum = App.html('<div class="card e1"><div class="row small"><b class="grow">Analysing ' + moves.length + ' moves…</b><span id="pct">0%</span></div><div class="bar" style="margin-top:8px"><i style="width:0"></i></div></div>');
      st.side.insertBefore(sum, st.side.firstChild);
      var ml = App.html('<div class="card e1" style="padding:8px"><div class="movelist"></div></div>'); st.side.appendChild(ml);
      function fenAt(i) { var x = new Chess(base); for (var k = 0; k <= i; k++) x.move(moves[k].san); return x; }
      App.setContext(function () { var d = data[cur]; return { mode: 'game review', playerColor: me === 'w' ? 'White' : 'Black', fen: st.game.fen(), history: moves.slice(0, cur + 1).map(function (m) { return m.san; }).join(' '), moveGrade: d ? d.j.info.label : '', bestMove: d ? d.j.bestSan : '', explanation: d ? d.j.text : '', allowedSans: moves.map(function (m) { return m.san; }).concat(d ? [d.j.bestSan] : []) }; });
      function drawList() {
        var html = '', n = +(base.split(' ')[5] || 1), t = base.split(' ')[1];
        moves.forEach(function (m, i) { if (t === 'w') html += '<span class="num">' + n + '.</span>'; else if (i === 0) html += '<span class="num">' + n + '…</span>'; var d = data[i]; html += '<span data-i="' + i + '"' + (i === cur ? ' class="cur"' : '') + '>' + m.san + (d ? ' <small style="color:' + d.j.info.color + '">' + d.j.info.sym + '</small>' : '') + '</span>'; if (t === 'b') n++; t = t === 'w' ? 'b' : 'w'; });
        ml.firstChild.innerHTML = html; [].forEach.call(ml.querySelectorAll('[data-i]'), function (s) { s.onclick = function () { show(+s.dataset.i, true); }; });
        var c = ml.firstChild.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'nearest' });
      }
      function show(i, talk) {
        cur = i; st.game = fenAt(i); st.sync(true); st.board.setArrows([]); st.board.setBadge(null); drawList();
        var d = data[i];
        if (d) {
          if (d.after) evalBar.firstChild.style.width = C.lineWin(d.after.lines[0]) + '%';
          if (d.j.grade) st.board.setBadge(moves[i].to, d.j.info.sym, d.j.info.color);
          if (['inaccuracy', 'mistake', 'blunder', 'miss'].indexOf(d.j.grade) >= 0) st.board.setArrows(d.j.arrows);
          if (talk) st.coach.say((moves[i].color === me ? 'You played ' : 'They played ') + d.j.text.split(' Line: ')[0], { head: '<span class="grade-pill" style="background:' + d.j.info.color + '">' + d.j.info.sym + ' ' + d.j.info.label + (d.m && d.m.limited ? ' · not graded' : '') + '</span>', line: d.j.text.indexOf('Line: ') > 0 ? 'Best: ' + d.j.text.split('Line: ')[1] : '', cls: d.m && !d.m.analysed ? '' : d.j.loss > 10 ? 'bad' : d.j.loss > 4 ? 'warn' : 'good', speak: true,
            actions: moves[i].color === me && d.m && d.m.analysed && d.j.loss > 10 ? [{ label: '~i:target~ Retry this move', fn: function () { retry(i); } }, { label: '~i:pawn~ Play on from here', fn: function () { App.playFromFen = fenAt(i - 1).fen(); App.go('play'); } }] : [] });
        }
      }
      function retry(i) {
        token++;var d = data[i], fenB = fenAt(i - 1).fen();
        el.innerHTML = '';
        var run = App.puzzleRunner(el, { noRating: true, engineCheck: true, label: 'Retry your move', after: function () { return [{ label: '~i:back~ Back to review', cls: 'primary', fn: function () { App.route(); } }]; } });
        run.start({ id: 'retry', fen: fenB, moves: [d.j.bestUci], rating: 0, themes: [], setup: false, prompt: 'In the game you played ' + moves[i].san + '. Find something better!' });
      }
      // v9: Game Review shows the SAME stored dataset as Results (App.Analysis.run reuses the saved
      // evaluations/verifications and the shared classifier); nothing is re-graded here.
      var fens = [base]; (function () { var x = new Chess(base); moves.forEach(function (m) { x.move(m.san); fens.push(x.fen()); }); })();
      var evals = new Array(fens.length), my = ++token, lastRes = null;
      sum.querySelector('b').textContent = rec.analysis && rec.analysis.v === 5 ? 'Loading saved review…' : 'Analysing ' + moves.length + ' moves…';
      App.Analysis.run(rec, function (progress, info) { if (my !== token) return; sum.querySelector('#pct').textContent = info && info.phase === 'verify' ? 'verifying ' + info.done + '/' + info.total : Math.round(progress * 100) + '%' + (info ? ' · depth ' + info.depth : ''); sum.querySelector('.bar i').style.width = progress * 100 + '%'; }, function () { return my !== token; })
        .then(function (result) { if (my !== token) return; evals = fens.map(function (f, i) { return App.Analysis.unpack(rec.evals[i], f) || App.Analysis.terminal(f); }); finish(result); })
        .catch(function (e) { if (my !== token) return; sum.innerHTML = '<p class="small">' + App.esc(e.message) + '</p><button class="btn sm" id="revRetry">Retry analysis</button>'; sum.querySelector('#revRetry').onclick = function () { App.route(); }; });
      function finish(result) {
        lastRes = result;
        result.moves.forEach(function (m, i) { data[i] = m.j ? { j: m.j, m: m, after: evals[i + 1] } : null; });
        var a = function (c) { return result.acc[c] == null ? null : Math.round(result.acc[c]); };
        rec.reviewed = true;
        App.Analysis.awardReview(rec);
        // save my real (graded) mistakes as puzzles, once per position
        var saved = 0;
        result.moves.forEach(function (m, i) {
          if (m.color !== me || !m.analysed || m.loss < 12 || !m.bestUci || ['inaccuracy', 'mistake', 'blunder', 'miss'].indexOf(m.grade) < 0) return;
          var key = fens[i]; if (S().mistakes.some(function (x) { return x.fen === key; })) return;
          S().mistakes.push({ fen: key, best: m.bestUci, played: m.san, bestSan: m.bestSan, grade: m.grade, date: Date.now(), game: rec.id, text: m.text.split(' Line: ')[0] }); saved++;
        });
        if (S().mistakes.length > 150) S().mistakes = S().mistakes.slice(-150);
        App.save();
        var mine = result.counts[me], gr = App.Analysis.ORDER, aMe = a(me), aOp = a(me === 'w' ? 'b' : 'w');
        sum.innerHTML = '<div class="row"><div class="ring" style="--p:' + (aMe || 0) + '"><span>' + (aMe == null ? '—' : aMe) + '</span></div><div class="grow col small"><b>' + (aMe == null ? 'No accuracy (under 80% graded)' : 'Estimated accuracy') + '</b><span class="muted">Opponent: ' + (aOp == null ? '—' : aOp) + '</span><div class="chips">' +
          gr.filter(function (k) { return mine[k]; }).map(function (k) { return '<span class="chip" style="cursor:default"><span style="color:' + C.GRADES[k].color + '">' + C.GRADES[k].sym + '</span> ' + C.GRADES[k].label + ' ' + mine[k] + '</span>'; }).join('') + '</div></div></div>' +
          '<p class="tiny muted">' + App.esc(App.Analysis.qualityText(rec, result.quality)) + '</p>' +
          (saved ? '<div class="alert warn" style="margin-top:10px"> Saved ' + saved + ' mistake' + (saved > 1 ? 's' : '') + ' to My Mistakes for practice</div>' : '');
        drawList();
        var worst = result.moves.filter(function (m) { return m.color === me && m.analysed && m.loss > 8; }).sort(function (x, y) { return y.loss - x.loss; }).slice(0, 3);
        var summary = (aMe == null ? 'Not enough moves were graded for an accuracy. ' : 'Accuracy ' + aMe + '%. ') + (worst.length ? 'Key moments: ' + worst.map(function (m) { return 'move ' + m.label + ' ' + m.san + ' (' + C.GRADES[m.grade].label + ')'; }).join(', ') + '.' : 'No big mistakes found.');
        st.coach.say(summary + (worst.length ? ' Tap a key moment to see what went wrong. ~i:arrow-down~' : ''), { mood: aMe > 80 ? 'wow' : 'happy', ai: { kind: 'review', ctx: { result: rec.result, playerColor: me === 'w' ? 'White' : 'Black', accuracy: aMe, grades: JSON.stringify(mine), keyMoments: summary, opening: hd.Opening || hd.ECO || '', allowedSans: moves.map(function (m) { return m.san; }).concat(worst.map(function (m) { return m.bestSan; })) } },
          actions: worst.map(function (m) { return { label: C.GRADES[m.grade].sym + ' ' + m.san, fn: function () { show(m.i, true); } }; }) });
        App.checkAch();
        if (p[1] != null && !isNaN(+p[1]) && moves[+p[1]]) show(+p[1], true);
      }
      st.button('~i:first~', function () { show(-1); evalBar.firstChild.style.width = '50%'; }); st.button('~i:back~', function () { if (cur >= 0) show(cur - 1, true); }); st.button('~i:play~', function () { if (cur < moves.length - 1) show(cur + 1, true); }); st.button('~i:next~', function () { show(moves.length - 1, true); });
      st.button('⇅', function () { st.board.flip(); });
      st.button('~i:analysis~ Analyse here', function () { App.analysisFen = st.game.fen(); App.go('analysis'); });
      st.button('~i:clipboard~ PGN', function () { App.copy(rec.pgn, 'PGN'); });
      if (rec.url && /^https:\/\//i.test(rec.url)) st.button('~i:external~ Source', function () { window.open(rec.url, '_blank','noopener,noreferrer'); });
      st.button(rec.reviewMode==='deep'?'Standard search':'Deeper search',function(){rec.reviewMode=rec.reviewMode==='deep'?'standard':'deep';App.save();App.route();});
      st.button('Summary',function(){App.sheet('<h3>Review summary</h3>'+sum.innerHTML);});
      st.load(base); drawList();
      App.screens.review.leave = function () { token++; };
    }
  });

  /* ================= MY MISTAKES ================= */
  App.register('mistakes', {
    title: '~i:close~ My mistakes', back: 'train', nav: 'train',
    render: function (el) {
      var list = S().mistakes;
      if (!list.length) { var c = new App.Coach(el); c.say('No saved mistakes yet. Review a game (yours vs me, or imported from Lichess/Chess.com) and I\'ll save every big mistake here so you can fix it. ', { actions: [{ label: '~i:search~ Game Review', cls: 'primary', fn: function () { App.go('games'); } }, { label: '~i:pawn~ Play Stacy', fn: function () { App.go('play'); } }] }); return; }
      var order = App.shuffle(list.slice()), i = 0;
      var run = App.puzzleRunner(el, { noRating: true, engineCheck: true, label: 'Your mistake', next: go, onResult: function (p, ok) {
        if (ok) { var k = S().mistakes.findIndex(function (x) { return x.fen === p.fen; }); if (k >= 0) S().mistakes.splice(k, 1); App.record('mistakefix', 1, 10); S().stats.mistakesFixed = (S().stats.mistakesFixed || 0) + 1; App.toast('Fixed! Removed from your list ~i:check~', 'ok'); }
      } });
      function go() { var m = order[i++ % order.length]; run.start({ id: 'm', fen: m.fen, moves: [m.best], rating: 0, themes: [], setup: false, prompt: 'In your game you played ' + m.played + ' here (' + C.GRADES[m.grade].label + '). Find a better move!' }); }
      go();
    }
  });
})();

/* ================= PERSONAL ACCOUNTS & RESUMABLE BASELINE ================= */
(function(){
 var busy=false,timer=null,jobToken=0,positionCache={};
 function S(){return App.state;}
 function emit(){window.dispatchEvent(new Event('stacy-profile'));}
 function save(){App.save();emit();}
 function error(r,service){if(r.status===404)throw new Error(service+' account not found. Check the username.');if(r.status===429)throw new Error(service+' asked us to slow down. Your progress is saved; try later.');if(!r.ok)throw new Error(service+' could not be reached ('+r.status+'). Try later.');return r;}
 function json(url,service){var ctrl=new AbortController(),t=setTimeout(function(){ctrl.abort();},20000);return fetch(url,{signal:ctrl.signal}).then(function(r){clearTimeout(t);return error(r,service).json();}).catch(function(e){clearTimeout(t);if(e.name==='AbortError')throw new Error(service+' took too long. Please retry.');throw e;});}
 function avatar(url){try{var u=new URL(url);return u.protocol==='https:'&&/(^|\.)(chesscomfiles\.com|chess\.com|lichess\.org)$/.test(u.hostname)?url:'';}catch(e){return '';}}
 function lookup(service,user){
  user=String(user||'').trim();if(!/^[a-z0-9_-]{2,50}$/i.test(user))return Promise.reject(new Error('Use the public username, not a profile URL.'));
  var name=encodeURIComponent(user.toLowerCase());
  if(service==='chesscom')return json('https://api.chess.com/pub/player/'+name,'Chess.com').then(function(p){return json('https://api.chess.com/pub/player/'+name+'/stats','Chess.com').then(function(st){var ratings={};['rapid','blitz','bullet'].forEach(function(k){var x=st['chess_'+k];if(x&&x.last&&x.last.rating)ratings[k]={rating:x.last.rating,best:x.best&&x.best.rating,record:x.record||{},date:x.last.date*1000};});return {service:service,user:p.username||user,name:p.name||p.username||user,avatar:avatar(p.avatar),url:p.url||'https://www.chess.com/member/'+name,ratings:ratings,checked:Date.now()};});});
  return json('https://lichess.org/api/user/'+name,'Lichess').then(function(p){var ratings={};['rapid','blitz','bullet'].forEach(function(k){var x=(p.perfs||{})[k];if(x&&x.games>0)ratings[k]={rating:x.rating,provisional:!!x.prov,games:x.games,rd:x.rd};});return {service:'lichess',user:p.username||p.id||user,name:p.username||user,avatar:'',url:'https://lichess.org/@/'+name,ratings:ratings,counts:p.count||{},checked:Date.now()};});
 }
 /* v11: one chess.js parse per game per session (load_pgn costs ~25 ms on a desktop, more on a phone; v10 parsed
    each game up to four times) and imports yield to the page between games. */
 var parseMemo=new Map();function parsed(pgn){var hit=parseMemo.get(pgn);if(hit)return hit;var g=new Chess();var ok=g.load_pgn(pgn,{sloppy:true});var v=ok?{ok:true,header:g.header(),moves:g.history({verbose:true}),san:g.history()}:{ok:false,header:{},moves:[],san:[]};parseMemo.set(pgn,v);if(parseMemo.size>80)parseMemo.delete(parseMemo.keys().next().value);return v;}
 function chunked(list,fn,limit){var out=[],i=0;limit=limit||Infinity;return new Promise(function(res){(function step(){var t=Date.now();while(i<list.length&&out.length<limit&&Date.now()-t<30){var r=fn(list[i++]);if(r)out.push(r);}if(i<list.length&&out.length<limit)setTimeout(step,0);else res(out);})();});}
 function resultOf(result,color){if(result==='1/2-1/2')return 'draw';if(result!=='1-0'&&result!=='0-1')return '?';return (result==='1-0')===(color==='w')?'win':'loss';}
 function normalize(pgn,account,extra){var P=parsed(pgn);if(!P.ok)return null;var g={history:function(o){return o&&o.verbose?P.moves:P.san;}},h=P.header,user=account.user.toLowerCase(),color=(h.White||'').toLowerCase()===user?'w':(h.Black||'').toLowerCase()===user?'b':null;if(!color||g.history().length<4||!['1-0','0-1','1/2-1/2'].includes(h.Result))return null;var moves=g.history({verbose:true}),opening=h.Opening||h.ECOUrl&&decodeURIComponent(h.ECOUrl.split('/').pop()).replace(/-/g,' ')||h.ECO||moves.slice(0,6).map(function(m){return m.san;}).join(' ');return {id:'p'+account.service+':'+(extra.id||extra.url||pgn.length+':'+h.Date+':'+h.UTCTime+':'+h.White+':'+h.Black),pgn:pgn,source:account.service==='chesscom'?'chess.com':'lichess',account:account.user,color:color,opp:color==='w'?h.Black:h.White,result:resultOf(h.Result,color),date:extra.date||Date.parse((h.UTCDate||h.Date||'').replace(/\./g,'-'))||Date.now(),url:extra.url,opening:opening,eco:h.ECO||'',speed:extra.speed||'unknown',clocks:extra.clocks||null,timeControl:extra.timeControl||h.TimeControl||'',imported:true};}
 function games(account){
  var user=encodeURIComponent(account.user.toLowerCase());
  if(account.service==='lichess')return fetch('https://lichess.org/api/games/user/'+user+'?max=60&pgnInJson=true&opening=true&clocks=true&evals=false&perfType=rapid,blitz,bullet&ongoing=false',{headers:{Accept:'application/x-ndjson'}}).then(function(r){return error(r,'Lichess').text();}).then(function(text){return chunked(text.split('\n').filter(Boolean),function(l){try{var j=JSON.parse(l);return j.pgn&&normalize(j.pgn,account,{id:j.id,url:'https://lichess.org/'+j.id,date:j.lastMoveAt||j.createdAt,speed:j.speed,clocks:j.clocks,timeControl:j.clock&&j.clock.initial});}catch(e){return null;}});});
  return json('https://api.chess.com/pub/player/'+user+'/games/archives','Chess.com').then(function(j){var arcs=(j.archives||[]).slice(-24).reverse(),all=[];function next(){if(!arcs.length||all.length>=60)return all.slice(0,60);var url=arcs.shift();if(!/^https:\/\/api\.chess\.com\/pub\/player\/[a-z0-9_-]+\/games\/\d{4}\/\d{2}$/i.test(url))throw new Error('Unexpected archive address.');return fetch(url).then(function(r){if(r.status===404)return null;return error(r,'Chess.com').json();}).then(function(m){var need=60-all.length;return chunked(((m&&m.games)||[]).slice().reverse().filter(function(g){return g.pgn&&(g.rules||'chess')==='chess'&&['rapid','blitz','bullet','daily'].includes(g.time_class);}),function(g){return normalize(g.pgn,account,{id:g.uuid||g.url,url:g.url,date:g.end_time*1000,speed:g.time_class,timeControl:g.time_control});},need).then(function(recs){all=all.concat(recs);return next();});});}return next();});
 }
 function balanced(list){list.sort(function(a,b){return b.date-a.date;});var seen={};return list.filter(function(g){if(seen[g.id])return false;seen[g.id]=true;return true;}).slice(0,30);}
 function chooseBase(profile){var a=profile.accounts.find(function(x){return x.service===profile.primary;})||profile.accounts[0],speed=profile.speed||'rapid';if(!a)return;var r=a.ratings[speed];if(!r){speed=['rapid','blitz','bullet'].find(function(k){return a.ratings[k];});r=a.ratings[speed];}profile.primary=a.service;profile.speed=speed||'rapid';profile.baseRating=r?r.rating:null;var goalBase=a.service+':'+a.user+':'+profile.speed;if(!profile.baseRating){profile.goal=null;}else if(!profile.goal||profile.goalBase!==goalBase||profile.baseRating>=profile.goal){profile.goal=profile.baseRating+200;profile.goalBase=goalBase;}}
 function courseFor(rec){if(rec.course)return rec.course;var m=parsed(rec.pgn).san;if(rec.color==='w')return rec.course=(/indian attack|fianchetto/i.test(rec.opening)||m[0]==='Nf3'||m[2]==='g3'?'kia':'london');return rec.course=(m[0]==='d4'||/indian defense/i.test(rec.opening)?'kid':'caro');}
 function timeTrouble(rec){if(rec.clockSummary!==undefined)return rec.clockSummary;var ms=parsed(rec.pgn).moves,cl=[];if(rec.clocks)rec.clocks.forEach(function(c,i){if(ms[i]&&ms[i].color===rec.color)cl.push(c/100);});else{var matches=Array.from(rec.pgn.matchAll(/\[%clk\s+([\d:.]+)\]/g));matches.forEach(function(m,i){if(ms[i]&&ms[i].color===rec.color){var c=m[1].split(':').reduce(function(a,v){return a*60+Number(v);},0);cl.push(c);}});}var base=parseFloat(rec.timeControl)||0;if(!cl.length)return rec.clockSummary=null;return rec.clockSummary={min:Math.min.apply(null,cl),trouble:cl.some(function(x){return x<Math.max(5,Math.min(20,base*.03));})};}
 function positions(rec){var cacheKey=rec.id+':'+rec.pgn.length;if(positionCache[cacheKey])return positionCache[cacheKey];var P=parsed(rec.pgn);if(!P.ok)return positionCache[cacheKey]=[];var h=P.header,moves=P.moves,x=new Chess(h.FEN||undefined),all=[];moves.forEach(function(m,i){var before=x.fen();x.move(m.san);if(m.color===rec.color){var material=x.board().flat().filter(function(p){return p&&p.type!=='p'&&p.type!=='k';}).length,phase=i<20?'opening':material<=4?'endgame':'middlegame';all.push({before:before,after:x.fen(),played:m.san,uci:m.from+m.to+(m.promotion||''),phase:phase,ply:i});}});if(all.length<=12)return positionCache[cacheKey]=all;var picks=new Set([0,all.length-1]);for(var i=0;i<12;i++)picks.add(Math.round(i*(all.length-1)/11));return positionCache[cacheKey]=[...picks].sort(function(a,b){return a-b;}).map(function(i){return all[i];});}
 function summarize(){var p=S().profile;if(!p)return;var recs=(p.sample||[]).map(function(id){return S().games.find(function(g){return g.id===id;});}).filter(Boolean),st={games:recs.length,wins:0,draws:0,losses:0,analysed:0,positions:0,accuracy:0,blunders:0,mistakes:0,phases:{opening:{n:0,loss:0},middlegame:{n:0,loss:0},endgame:{n:0,loss:0}},openings:[],timeTrouble:0,clockGames:0,form:[],themes:{},speeds:{}};var ops={};
  recs.forEach(function(g){st.speeds[g.speed]=(st.speeds[g.speed]||0)+1;st[g.result==='win'?'wins':g.result==='draw'?'draws':'losses']++;st.form.push(g.result);var openingKey=g.color+':'+g.opening;var o=ops[openingKey]||(ops[openingKey]={name:g.opening,color:g.color,course:courseFor(g),n:0,score:0,wins:0,losses:0});o.n++;o.score+=g.result==='win'?1:g.result==='draw'?.5:0;o.wins+=g.result==='win'?1:0;o.losses+=g.result==='loss'?1:0;var clock=timeTrouble(g);if(clock){st.clockGames++;if(clock.trouble)st.timeTrouble++;}if(!g.profileMetrics)return;st.analysed++;var m=g.profileMetrics;st.positions+=m.n;st.accuracy+=m.acc;st.blunders+=m.blunders;st.mistakes+=m.mistakes;Object.keys(st.phases).forEach(function(k){st.phases[k].n+=m.phases[k].n;st.phases[k].loss+=m.phases[k].loss;});Object.keys(m.themes).forEach(function(k){st.themes[k]=(st.themes[k]||0)+m.themes[k];});});
  st.accuracy=st.positions?Math.round(st.accuracy/st.positions):null;st.blunderRate=st.positions?Math.round(st.blunders/st.positions*100):null;st.tacticalMissRate=st.positions?Math.round(Object.values(st.themes).reduce(function(a,b){return a+b;},0)/st.positions*100):null;st.openings=Object.values(ops).sort(function(a,b){return a.score/a.n-b.score/b.n;});st.weakPhase=Object.keys(st.phases).filter(function(k){return st.phases[k].n>=3;}).sort(function(a,b){return st.phases[b].loss/st.phases[b].n-st.phases[a].loss/st.phases[a].n;})[0]||null;st.weakTheme=Object.keys(st.themes).sort(function(a,b){return st.themes[b]-st.themes[a];})[0]||null;st.weakCourse=st.openings.find(function(o){return o.n>=2;})||st.openings[0];p.stats=st;save();
 }
 function metrics(){return {n:0,acc:0,blunders:0,mistakes:0,phases:{opening:{n:0,loss:0},middlegame:{n:0,loss:0},endgame:{n:0,loss:0}},themes:{}};}
 function schedule(ms){clearTimeout(timer);timer=setTimeout(run,ms||250);}
 /* v11 baseline runner. Fixes the iPhone stall: every position now has a watchdog and is skipped (never
    retried forever) if the engine gives nothing, times out or the page died while it was running; the
    engine's own watchdog restarts a hung worker; the built-in fallback is bounded (engine.js). Progress is
    saved per position and counts positions, not only finished games. */
 var INFLIGHT='stacy-baseline-inflight',POS_TIMEOUT=15000,waitReason='';
 function inflight(v){try{if(v)localStorage.setItem(INFLIGHT,JSON.stringify(v));else localStorage.removeItem(INFLIGHT);}catch(e){}}
 function readInflight(){try{return JSON.parse(localStorage.getItem(INFLIGHT)||'null');}catch(e){return null;}}
 function boardInUse(){var v=document.getElementById('view');return !!(v&&v.querySelector('.play-layout .board'))||document.body.classList.contains('board-screen');}
 function setWait(r){if(waitReason!==r){waitReason=r;var a=S().profile&&S().profile.analysis;if(a)a.wait=r;emit();}}
 function finishGame(a,rec,skippedGame){rec.profileMetrics=a.metrics||metrics();if(skippedGame)rec.profileMetrics.skipped=true;a.game++;a.position=0;a.posCount=0;a.metrics=metrics();a.pending=null;a.tries=0;if(a.game>=a.ids.length)a.done=true;summarize();}
 function skip(a,why){a.skipped=(a.skipped||0)+1;a.lastSkip=why;(a.metrics||(a.metrics=metrics())).skipped=((a.metrics.skipped)||0)+1;a.position++;a.pending=null;a.tries=0;}
 function run(){var p=S().profile,a=p&&p.analysis;if(!a||a.paused||a.done||busy)return;
  if(document.hidden){setWait('hidden');schedule(1500);return;}
  if(boardInUse()){setWait('board');schedule(1500);return;}
  if(window.App&&App.MP&&App.MP.live){setWait('live');schedule(3000);return;}
  setWait(Engine.status==='loading'?'engine':'');
  var rec=S().games.find(function(g){return g.id===a.ids[a.game];});
  if(!rec){a.game++;a.position=0;a.posCount=0;if(a.game>=a.ids.length){a.done=true;summarize();}else{save();schedule(30);}return;}
  if(rec.profileMetrics){a.game++;a.position=0;a.posCount=0;a.metrics=metrics();a.pending=null;if(a.game>=a.ids.length){a.done=true;summarize();}else{save();schedule(30);}return;}
  var pos;try{pos=positions(rec);}catch(e){pos=null;}
  if(!pos||!pos.length){finishGame(a,rec,true);if(!a.done)schedule(30);return;}
  a.posCount=pos.length;
  var q=pos[a.position];if(!q){finishGame(a,rec,false);if(!a.done)schedule(30);return;}
  // The page was reloaded or killed while this exact position was being analysed: skip it, do not repeat.
  var crash=readInflight();if(crash&&crash.id===rec.id&&crash.position===a.position){inflight(null);skip(a,'skipped after the page restarted during this position');save();schedule(30);return;}
  busy=true;var token=jobToken,ended=false,started=Date.now(),ep=Engine.epoch;inflight({id:rec.id,position:a.position,at:started});
  var closed=false;function end(delay){if(closed)return;closed=true;clearTimeout(dog);inflight(null);busy=false;if(!a.paused&&!a.done)schedule(delay!=null?delay:Engine.status==='fallback'?60:40);}
  var dog=setTimeout(function(){if(ended)return;ended=true;Engine.cancel('baseline');a.timeouts=(a.timeouts||0)+1;skip(a,'skipped: the engine did not answer in time');save();end(30);},POS_TIMEOUT);
  var o={depth:9,movetime:90,owner:'baseline',priority:'background'}; // user-facing engine work pre-empts the baseline
  var before=a.pending&&a.pending.fen===q.before?Promise.resolve(a.pending):Engine.analyse(q.before,o);
  before.then(function(b){if(ended)return;if(token!==jobToken||!S().profile||a!==S().profile.analysis){ended=true;return;}
    if(!b){if(Engine.epoch===ep){a.tries=(a.tries||0)+1;if(a.tries>=2)skip(a,'skipped: no engine result for this position');}ended=true;save();return;} // a navigation cancel (epoch change) is retried, not counted
    a.pending=b;var terminal=new Chess(q.after);var afterJob=terminal.game_over()?Promise.resolve({fen:q.after,best:null,lines:[{cp:terminal.in_checkmate()?(terminal.turn()==='w'?-10000:10000):0,pv:[]}],quality:{}}):Engine.analyse(q.after,o);
    return afterJob.then(function(after){if(ended)return;ended=true;if(token!==jobToken||!S().profile||a!==S().profile.analysis)return;
     if(!after){if(Engine.epoch===ep){a.tries=(a.tries||0)+1;if(a.tries>=2)skip(a,'skipped: no engine result for this position');}save();return;}
     var j=Coach.judge(q.before,q.uci,b,after),m=a.metrics||(a.metrics=metrics());m.n++;m.acc+=j.acc;m.phases[q.phase].n++;m.phases[q.phase].loss+=j.loss;if(b.quality&&b.quality.fallback)m.limited=(m.limited||0)+1;if(j.grade==='blunder'||j.grade==='miss')m.blunders++;else if(j.loss>=5)m.mistakes++;if(j.loss>8){var f=b.best&&Coach.moveFacts(q.before,b.best),theme=f&&f.facts.some(function(x){return /fork/.test(x);})?'fork':Coach.threats(q.before).length?'hanging':'defense';var tactical=f&&f.facts.some(function(x){return /fork|takes|check|mate|pin|attack/i.test(x);})||Coach.threats(q.before).length||b.lines[0]&&b.lines[0].mate!=null;if(tactical)m.themes[theme]=(m.themes[theme]||0)+1;if(b.best&&!(b.quality&&b.quality.fallback)&&!S().mistakes.some(function(x){return x.fen===q.before;}))S().mistakes.push({fen:q.before,best:b.best,played:q.played,bestSan:j.bestSan,grade:j.grade,date:Date.now(),game:rec.id,text:j.text,theme:theme,baseline:true});}
     a.position++;a.pending=null;a.tries=0;a.checked=(a.checked||0)+1;save();});
  }).catch(function(e){if(ended)return;ended=true;skip(a,'skipped: '+(e&&e.message||'analysis error'));save();}).finally(function(){if(!ended)ended=true;end();});
 }
 function sync(accounts){if(busy)return Promise.reject(new Error('Pause the current analysis before re-syncing.'));jobToken++;var syncToken=jobToken;var profile=S().profile||{accounts:[],primary:'chesscom',speed:'rapid'},all=[],fresh=[];profile.syncing=true;S().profile=profile;save();var chain=Promise.resolve();accounts.forEach(function(ac){chain=chain.then(function(){if(syncToken!==jobToken||S().profile!==profile)throw new Error('Sync cancelled');return lookup(ac.service,ac.user);}).then(function(found){fresh.push(found);return games(found);}).then(function(gs){all=all.concat(gs);});});return chain.then(function(){if(syncToken!==jobToken||S().profile!==profile)throw new Error('Sync cancelled');profile.accounts=fresh;if(App.seedStacyRating)App.seedStacyRating(fresh);fresh.forEach(function(a){S().settings[a.service==='chesscom'?'chesscomUser':'lichessUser']=a.user;});chooseBase(profile);var selected=balanced(all);selected.forEach(function(g){var old=S().games.find(function(x){return x.id===g.id;});if(!old)S().games.push(g);});if(S().games.length>100)S().games=S().games.slice(-100);profile.sample=selected.map(function(g){return g.id;});profile.lastSync=Date.now();profile.syncing=false;delete profile.syncError;profile.analysis={ids:profile.sample.slice(),game:0,position:0,metrics:metrics(),paused:false,done:!selected.length,started:Date.now()};summarize();schedule();return profile;}).catch(function(e){profile.syncing=false;profile.syncError=e.message||'Could not sync public games.';save();throw e;});}
 App.Profile={invalidate:function(){jobToken++;clearTimeout(timer);busy=false;var p=S().profile;if(p&&p.analysis)p.analysis.paused=true;},lookup:lookup,sync:sync,chooseBase:chooseBase,selectLatest:balanced,summarize:summarize,positions:positions,games:games,run:run,pause:function(){var a=S().profile&&S().profile.analysis;if(a){a.paused=true;save();}},resume:function(){var a=S().profile&&S().profile.analysis;if(a){a.paused=false;a.error='';delete a.safePaused;save();schedule();}},retryEngine:function(){return (Engine.status==='fallback'?Engine.retryFull():Promise.resolve(Engine)).then(function(){emit();schedule(200);});},_timeout:function(ms){if(ms)POS_TIMEOUT=ms;return POS_TIMEOUT;},_inflightKey:INFLIGHT,auto:function(){var p=S().profile;if(!p)return;if(p.analysis&&!p.analysis.done){if(!p.analysis.paused)schedule();return;}if(p.accounts&&p.accounts.length&&Date.now()-(p.lastSync||0)>86400000)sync(p.accounts).catch(function(){});}};
 document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule(400);});
 window.addEventListener('pageshow',function(){var a=S()&&S().profile&&S().profile.analysis;if(a&&!a.done&&!a.paused)schedule(800);});
})();
