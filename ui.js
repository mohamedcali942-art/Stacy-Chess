/* Stacy Chess · v6 layout components and global navigation
   - Screen anatomy: white header (.scr-head) → one large black rounded panel (.panel) → sparse rows.
   - Timeline rows (.timeline > .tl-row); the current row is a white inset card (.tl-row.current.paper).
   - Global navigation: a labelled "Menu" button in the top-right corner opens a rounded panel.
     There is no persistent bottom tab bar. Opening/closing the menu never changes the route,
     so a live game or lesson is untouched until a destination is chosen.
   - Board screens: secondary actions go to a "More" drawer (see App.stage in trainers.js). */
(function(){
  var U=App.ui={};
  function esc(t){return App.esc?App.esc(String(t==null?'':t)):String(t);}
  U.esc=esc;
  U.dateLabel=function(d){d=d||new Date();try{return d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});}catch(e){return d.toDateString();}};
  /* White header: eyebrow, big heading, one short line, optional compact selector */
  U.head=function(o){o=o||{};return '<header class="scr-head">'+(o.eyebrow?'<div class="eyebrow">'+o.eyebrow+'</div>':'')+'<h1 class="scr-title">'+o.title+'</h1>'+(o.sub?'<p class="scr-sub">'+o.sub+'</p>':'')+(o.selector||'')+'</header>';};
  /* One large black panel; body is HTML (rows are often appended later) */
  U.panel=function(o){o=o||{};var id=o.id||('p'+Math.random().toString(36).slice(2,7));return '<section class="panel'+(o.cls?' '+o.cls:'')+'" aria-labelledby="'+id+'-t"><div class="panel-head"><h2 id="'+id+'-t">'+o.title+'</h2>'+(o.aside?'<span class="panel-aside">'+o.aside+'</span>':'')+'</div>'+(o.body||'')+'</section>';};
  /* Timeline row. state: done | current | next | locked. Only the current row carries a primary action. */
  U.row=function(o){var cur=o.state==='current';return '<li class="tl-row '+o.state+(cur?' paper':'')+'"'+(cur?' aria-current="step"':'')+(o.attrs||'')+'><span class="tl-mark">'+(o.mark==null?'':o.mark)+'</span><span class="tl-node" aria-hidden="true">'+(o.state==='done'?'✓':o.state==='locked'?'–':'')+'</span><div class="tl-body"><b class="tl-title">'+o.title+'</b>'+(o.sub?'<span class="tl-sub">'+o.sub+'</span>':'')+(o.body||'')+(o.action||'')+'</div></li>';};
  /* Compact horizontal selector: this week's days with practice marks (read-only, real data). */
  U.weekStrip=function(){var s=App.state||{},days=s.activeDays||{},now=new Date(),dow=(now.getDay()+6)%7,out=[];for(var i=0;i<7;i++){var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow+i),k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),today=i===dow;out.push('<li class="day'+(today?' today':'')+(days[k]?' practised':'')+'"'+(today?' aria-current="date"':'')+'><span>'+'MTWTFSS'[i]+'</span><b>'+d.getDate()+'</b></li>');}return '<ol class="week-strip" aria-label="This week · dots mark days you practised">'+out.join('')+'</ol>';};
  /* Compact segmented selector that navigates (used by Learn ↔ Skills) */

  /* Black panel with sparse stacked sections of link rows (Skills, Play). Returns an element. */
  U.listPanel=function(o){var p=App.html(U.panel({id:o.id,title:o.title,aside:o.aside})),list=null;
    function section(title){var sec=App.html('<div class="panel-section"></div>');if(title)sec.appendChild(App.html('<h3 class="section-label">'+title+'</h3>'));list=App.html('<div class="link-list"></div>');sec.appendChild(list);p.appendChild(sec);}
    (o.items||[]).forEach(function(t){if(t.section){section(t.section);return;}if(!list)section('');
      var x=App.html('<button type="button" class="link-row" data-go="'+t.go+'"><span class="li-ic">'+t.ic+'</span><span class="grow"><span>'+t.name+'</span><small>'+t.sub+'</small></span><span class="chev" aria-hidden="true">›</span></button>');
      x.onclick=function(){App.go(t.go);};list.appendChild(x);});
    if(o.note)p.appendChild(App.html('<div class="panel-foot"><p class="tiny">'+o.note+'</p></div>'));return p;};
  U.LEARN_TABS=[{id:'openings',label:'Openings',go:'learn'},{id:'skills',label:'Skills',go:'train'}];

  /* ---------- board actions: which buttons stay visible under the board ---------- */
  var SECONDARY=/^~i:first~$|Flip|⇅|Resign|Draw|PGN|FEN|Source|Analyse here|Moves|Chat|Summary|Finish later|Deeper search|Standard search|Premoves|Clear queue|Reset scratch|Undo model|MAX depth|Play from here|Halfway|Restart clean run|↺ Restart|~i:reset~ Reset/i;
  U.MAX_VISIBLE=3;
  U.actionKind=function(label,cls){if(/\bprimary\b/.test(cls||''))return 'primary';if(/\bsecondary\b/.test(cls||''))return 'secondary';return SECONDARY.test(String(label||''))?'secondary':'primary';};

  /* ---------- global navigation menu ---------- */
  U.NAV=[
    {go:'home',label:'Today',sub:'Your five daily steps',ic:'calendar',nav:'home'},
    {go:'learn',label:'Learn',sub:'Opening paths',ic:'book',nav:'learn'},
    {go:'train',label:'Skills',sub:'Tactics, calculation, endgames',ic:'tactics',nav:'train'},
    {go:'playhub',label:'Play',sub:'Bots, analysis, game review',ic:'pawn',nav:'playhub'},
    {go:'me',label:'Me',sub:'Progress and ratings',ic:'chart',nav:'me'},
    {go:'weekly',label:'Weekly report',sub:'Evidence, not Elo',ic:'award',route:'weekly',group:'more'},
    {go:'settings',label:'Settings',sub:'Coach, board, backup',ic:'settings',route:'settings',group:'more'}
  ];
  /* v7 menu: explicit state machine closed → opening → open → closing → closed.
     - The scrim covers the whole viewport (above the top bar) from the first frame of opening until the
       LAST frame of closing, and dismisses on click (not pointerdown). A dismiss tap is therefore
       always consumed by the scrim and can never fall through to the Menu button, a row or the board.
     - #app is made inert while the menu is open so keyboard/AT focus cannot reach the page behind.
     - Every transition is interruptible: re-opening during "closing" reverses it; a safety timer
       finishes any transition even if animation events never fire (Safari tab switches, reduced motion). */
  var current={nav:'home',route:'home'},panel=null,scrim=null,lastFocus=null,state='closed',anims=[],safety=0,backPending=false,backTimer=0;
  U.currentNav=function(){return current;};
  U.menuState=function(){return state;};
  U.isCurrent=function(item){return item.route?current.route===item.route:(current.nav===item.nav&&['weekly','settings'].indexOf(current.route)<0);};
  U.setNav=function(nav,route){current={nav:nav||route||'home',route:route||nav||'home'};if(!scrim&&document.body)build();var b=document.getElementById('menuBtn');if(b){var due=App.dueLines?App.dueLines().length:0;b.classList.toggle('has-due',!!due);b.setAttribute('aria-label','Menu'+(due?' · '+due+' reviews due':''));}if(panel&&state==='closed')paint();};
  function itemHTML(it){var on=U.isCurrent(it),due=it.go==='learn'&&App.dueLines?App.dueLines().length:0;return '<li><a href="#/'+it.go+'" class="nav-item'+(on?' on':'')+'" data-go="'+it.go+'"'+(on?' aria-current="page"':'')+'><span class="nav-ic">~i:'+it.ic+'~</span><span class="nav-text"><b>'+it.label+'</b><small>'+it.sub+'</small></span>'+(due?'<span class="nav-count" aria-label="'+due+' reviews due">'+due+'</span>':'')+(on?'<span class="nav-here">Here</span>':'')+'</a></li>';}
  function paint(){var main=U.NAV.filter(function(x){return !x.group;}),more=U.NAV.filter(function(x){return x.group;});
    panel.querySelector('.nav-list.main').innerHTML=main.map(itemHTML).join('');panel.querySelector('.nav-list.more').innerHTML=more.map(itemHTML).join('');
    // icon tokens are expanded by the app-wide MutationObserver (UI.hydrate)
    [].forEach.call(panel.querySelectorAll('.nav-item'),function(a){a.onclick=function(e){if(e&&e.preventDefault)e.preventDefault();if(state!=='open'&&state!=='opening')return;U.choose(a.dataset.go,a);};});}
  function swallow(e){if(e.target===scrim){e.preventDefault();e.stopPropagation();}}
  function build(){
    scrim=document.createElement('div');scrim.className='nav-scrim';scrim.hidden=true;
    scrim.innerHTML='<nav class="nav-panel" id="navPanel" role="dialog" aria-modal="true" aria-labelledby="navTitle"><div class="nav-head"><div><div class="eyebrow">Stacy Chess</div><b id="navTitle">Go to</b></div><button type="button" class="btn sm nav-close" aria-label="Close menu">Close</button></div><ul class="nav-list main"></ul><div class="nav-sep" role="separator"></div><ul class="nav-list more"></ul><div class="nav-foot"><button type="button" class="btn sm ghost nav-ask">~i:chat~ Ask Stacy</button></div></nav>';
    document.body.appendChild(scrim);panel=scrim.querySelector('.nav-panel');
    // Swallow the whole tap sequence on the backdrop; close on click so nothing underneath receives it.
    scrim.addEventListener('pointerdown',swallow);scrim.addEventListener('mousedown',swallow);scrim.addEventListener('touchstart',function(e){if(e.target===scrim)e.stopPropagation();},{passive:true});
    scrim.addEventListener('touchmove',function(e){if(e.target===scrim&&e.cancelable)e.preventDefault();},{passive:false});
    scrim.addEventListener('click',function(e){if(e.target===scrim){e.preventDefault();e.stopPropagation();U.closeMenu(true);}});
    App.q(panel,'.nav-close').onclick=function(){U.closeMenu(true);};
    App.q(panel,'.nav-ask').onclick=function(){U.closeMenu(false);if(App.openChat)App.openChat();};
    panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();U.closeMenu(true);return;}
      if(e.key==='Tab'){var f=[].slice.call(panel.querySelectorAll('a,button'));if(!f.length)return;var first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  }
  function reduced(){if(App.motion&&App.motion.reduced)return App.motion.reduced();try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){return false;}}
  function stopAnims(){anims.forEach(function(a){try{a.cancel();}catch(e){}});anims=[];clearTimeout(safety);safety=0;}
  function play(el,frames,o){if(!el||!el.animate||reduced())return null;try{var a=el.animate(frames,o);anims.push(a);return a;}catch(e){return null;}}
  function setInert(on){var app=document.getElementById('app');if(!app)return;if(on){app.setAttribute('inert','');app.setAttribute('aria-hidden','true');}else{app.removeAttribute('inert');app.removeAttribute('aria-hidden');}}
  function settle(to){stopAnims();state=to;if(to==='closed'){scrim.hidden=true;scrim.classList.remove('is-open','is-closing');}else{scrim.classList.add('is-open');scrim.classList.remove('is-closing');}}
  /* Only choosing a destination navigates; the normal route change then pauses/saves a live game. */
  U.choose=function(go,el){var origin=null;try{if(el&&el.getBoundingClientRect){var r=el.getBoundingClientRect();origin={x:r.left+Math.min(44,r.width/2),y:r.top+r.height/2,label:(U.NAV.find(function(n){return n.go===go;})||{}).label||''};}}catch(e){}
    if(App.motion&&App.motion.intent)App.motion.intent('menu',origin);U.closeMenu(false,'route');App.go(go);};
  U.menuHTML=function(){return '<ul class="nav-list main">'+U.NAV.filter(function(x){return !x.group;}).map(itemHTML).join('')+'</ul><ul class="nav-list more">'+U.NAV.filter(function(x){return x.group;}).map(itemHTML).join('')+'</ul>';};
  U.menuOpen=function(){return !!(scrim&&!scrim.hidden&&(state==='open'||state==='opening'));};
  U.openMenu=function(){if(!scrim)build();if(state==='open'||state==='opening')return;var reopening=state==='closing';stopAnims();
    if(!reopening){paint();lastFocus=document.activeElement;
      // A history marker lets the phone/browser Back gesture close the menu without leaving the screen.
      if(!backPending)mark();}
    state='opening';scrim.hidden=false;scrim.classList.add('is-open');scrim.classList.remove('is-closing');setInert(true);
    document.body.classList.add('nav-open');var b=document.getElementById('menuBtn');if(b)b.setAttribute('aria-expanded','true');
    var dur=reopening?180:300,ease='cubic-bezier(.32,.72,0,1)';
    play(scrim,[{opacity:0},{opacity:1}],{duration:dur*0.8,easing:'linear',fill:'both'});
    var pa=play(panel,[{opacity:0,transform:'translate(10px,-14px) scale(.86)',borderRadius:'44px'},{opacity:1,transform:'none',borderRadius:'32px 12px 32px 32px'}],{duration:dur,easing:ease,fill:'both'});
    if(!reopening)[].forEach.call(panel.querySelectorAll('.nav-item'),function(it,i){play(it,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:240,delay:40+i*22,easing:ease,fill:'both'});});
    function done(){if(state==='opening'){stopAnims();state='open';}}
    if(pa&&pa.finished)pa.finished.then(done,function(){});safety=setTimeout(done,dur+260);
    var on=panel.querySelector('.nav-item.on')||panel.querySelector('.nav-item');try{if(on)on.focus({preventScroll:true});}catch(e){}};
  U.closeMenu=function(restore,how){if(!scrim||scrim.hidden||state==='closing'||state==='closed')return;stopAnims();
    try{if(history.state&&history.state.stacyMenu){if(how==='route'&&history.replaceState)history.replaceState(null,'',location.href);else if(how!=='popstate'&&history.back&&!backPending){backPending=true;clearTimeout(backTimer);backTimer=setTimeout(function(){backPending=false;},1500);history.back();}}}catch(e){}
    state='closing';scrim.classList.add('is-closing');setInert(false);document.body.classList.remove('nav-open');var b=document.getElementById('menuBtn');if(b)b.setAttribute('aria-expanded','false');
    if(restore!==false){try{(b||lastFocus).focus({preventScroll:true});}catch(e){}}
    // Choosing a destination hands off to the route sweep, so the panel simply dissolves fast.
    var dur=how==='route'?140:200;
    play(scrim,[{opacity:1},{opacity:0}],{duration:dur,easing:'linear',fill:'both'});
    var pa=play(panel,[{opacity:1,transform:'none'},{opacity:0,transform:how==='route'?'scale(1.02)':'translate(6px,-8px) scale(.94)'}],{duration:dur,easing:'cubic-bezier(.4,0,1,1)',fill:'both'});
    function done(){if(state==='closing')settle('closed');}
    if(pa&&pa.finished)pa.finished.then(done,function(){});else done();
    safety=setTimeout(done,dur+200);};
  U.toggleMenu=function(){if(state==='open'||state==='opening')U.closeMenu(true);else U.openMenu();};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&U.menuOpen()){U.closeMenu(true);}});
  /* Our own close calls history.back() once; when that popstate lands we only re-mark history if the
     menu was re-opened meanwhile. Any other popstate (phone/browser Back) closes the open menu. */
  function mark(){try{if(history.pushState&&!(history.state&&history.state.stacyMenu))history.pushState({stacyMenu:1},'',location.href);}catch(e){}}
  window.addEventListener('popstate',function(){if(backPending){backPending=false;clearTimeout(backTimer);if(U.menuOpen())mark();return;}if(U.menuOpen())U.closeMenu(true,'popstate');});
  window.addEventListener('hashchange',function(){if(U.menuOpen())U.closeMenu(false,'popstate');});

  /* ---------- segmented tab indicator (Learn ↔ Skills) ----------
     The indicator pill glides from the previous tab to the new one on the freshly rendered screen. */
  var lastTab=null;
  U.switcher=function(items,current,label){var idx=Math.max(0,items.findIndex(function(it){return it.id===current;}));return '<div class="seg switcher" role="tablist" aria-label="'+esc(label||'Section')+'" data-group="'+esc(label||'Section')+'" data-index="'+idx+'"><span class="seg-ind" aria-hidden="true"></span>'+items.map(function(it){var on=it.id===current;return '<button type="button" role="tab" class="'+(on?'on':'')+'" aria-selected="'+on+'" data-go="'+it.go+'">'+it.label+'</button>';}).join('')+'</div>';};
  U.wireSwitcher=function(el){var seg=el.querySelector('.switcher');var btns=[].slice.call(el.querySelectorAll('.switcher button'));
    btns.forEach(function(b,i){b.onclick=function(){if(b.classList.contains('on'))return;var from=seg&&seg.dataset?+seg.dataset.index:0;lastTab={group:seg&&seg.dataset?seg.dataset.group:'',from:from,to:i};if(App.motion&&App.motion.intent)App.motion.intent('tab',{dir:i>from?1:-1});App.go(b.dataset.go);};});
    if(!seg||!seg.dataset)return;var ind=seg.querySelector('.seg-ind'),to=+seg.dataset.index;
    var prev=lastTab&&lastTab.group===seg.dataset.group&&lastTab.to===to?lastTab.from:to;lastTab=null;
    if(seg.classList&&seg.classList.add)seg.classList.add('has-ind');
    if(btns[prev])U.movePill(ind,btns[prev]);if(prev!==to&&btns[to]){var raf=window.requestAnimationFrame||function(f){return setTimeout(f,16);};raf(function(){U.movePill(ind,btns[to]);});}
  };

  /* ---------- v8 tab motion (distinct from page motion) ----------
     movePill: the selection pill stretches across to the new tab, then settles (≈360 ms). Width/translate
     of one small absolutely positioned pill; first placement is never animated; a new tap cancels the
     running stretch. swap: the tab's own content slides 16px in the tab direction with a fade (220 ms).
     Neither runs with reduced motion, and neither is ever used for board moves or coach messages. */
  function rm(){return (App.motion&&App.motion.reduced)?App.motion.reduced():false;}
  U.movePill=function(ind,btn){if(!ind||!btn||!ind.style)return;var x=btn.offsetLeft||0,w=btn.offsetWidth||0,px=ind._x,pw=ind._w;
    if(!w&&(btn._pillRetry||0)<2){btn._pillRetry=(btn._pillRetry||0)+1;(window.requestAnimationFrame||function(f){return setTimeout(f,16);})(function(){if(btn.getAttribute('aria-selected')==='true'||btn.classList.contains('on')){ind._x=null;U.movePill(ind,btn);}});}
    ind._x=x;ind._w=w;
    if(ind._anim){try{ind._anim.cancel();}catch(e){}ind._anim=null;}
    ind.style.transition='none';ind.style.width=w+'px';ind.style.transform='translateX('+x+'px)';
    if(px==null||px===x||!ind.animate||rm())return null;var left=Math.min(px,x),span=Math.max(px+pw,x+w)-left;
    try{ind._anim=ind.animate([{transform:'translateX('+px+'px)',width:pw+'px'},{transform:'translateX('+left+'px)',width:span+'px',offset:0.42},{transform:'translateX('+x+'px)',width:w+'px'}],{duration:360,easing:'cubic-bezier(.32,.72,0,1)'});var a=ind._anim;if(a.finished)a.finished.then(function(){if(ind._anim===a)ind._anim=null;},function(){});return a;}catch(e){return null;}};
  U.swap=function(host,dir){if(!host||!host.animate||rm())return null;if(host._swap){try{host._swap.cancel();}catch(e){}}var d=(dir||0)*16;
    try{var a=host._swap=host.animate([{opacity:0,transform:'translate3d('+d+'px,0,0)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});if(a.finished)a.finished.then(function(){if(host._swap===a)host._swap=null;},function(){});return a;}catch(e){return null;}};
})();
