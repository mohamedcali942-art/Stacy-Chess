/* Stacy Chess · v7 motion system (navigation continuity)
   One owner for every route transition so motion is consistent and always cleaned up.
   Kinds
   - menu   : choosing a destination in the Menu. A rounded shape grows from the chosen row, sweeps
              across the screen carrying the destination name, then lifts away to reveal the page.
   - push   : drilling deeper (Skills → Tactics → a theme). New page slides in from the right,
              the previous page eases left and dims underneath.
   - pop    : Back (button, gesture or browser). The exact reverse of push; scroll position restored.
   - tab    : Learn ↔ Skills segmented control. Short lateral cross-slide in the tab's direction.
   - lateral: same depth, different page. Short rise + fade.
   - refresh: the same route re-rendering itself (Today steps, settings toggles) — NO animation.
   Rules
   - Only transform/opacity/clip-path are animated (GPU friendly). Web Animations API with finished
     promises; a safety timer always runs the cleanup even if animation events never arrive.
   - Total time ≤ 480 ms; nothing waits on artificial delays: the next screen renders immediately
     underneath the transition.
   - The outgoing page is a detached, inert, aria-hidden snapshot with ids stripped; it never receives
     input and is removed in cleanup. Taps are blocked only while content is covered/moving, and never
     on board screens (no clock or move input is ever delayed by motion).
   - A new navigation finishes the previous transition instantly (rapid taps stay coherent).
   - prefers-reduced-motion: no movement; the page simply appears. */
(function () {
  'use strict';
  var M = App.motion = {};
  var pending = null, run = null, seq = 0, stack = [], scrollMemo = {};
  M.DUR = { push: 380, pop: 340, tab: 260, lateral: 240, cover: 240, reveal: 230 };
  M.reduced = function () { if (App.reduced) { try { return !!App.reduced(); } catch (e) { } } try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  M.supported = function () { return !!(document.body && document.body.animate) && !M.reduced(); };
  /* A control announces what kind of navigation it is about to cause (menu/tab/pop). */
  M.intent = function (kind, data) { pending = { kind: kind, data: data || null, t: Date.now() }; };
  M.stack = function () { return stack.slice(); };
  function depthOf(name) { var d = 0, seen = {}, def = App.screens[name]; while (def && def.back && !seen[name] && d < 8) { seen[name] = 1; name = typeof def.back === 'string' ? def.back.split('/')[0] : ''; def = App.screens[name]; d++; } return d; }
  M.depthOf = depthOf;
  /* Decide the kind of transition for a route change. prev/next are {hash,name}. */
  M.classify = function (prev, next) {
    var p = pending; pending = null;
    if (!prev) return 'initial';
    if (prev.hash === next.hash) return 'refresh';
    if (p && Date.now() - p.t < 1500) { if (p.kind === 'menu') return 'menu'; if (p.kind === 'tab') return 'tab'; if (p.kind === 'pop') return 'pop'; }
    if (stack.length > 1 && stack[stack.length - 2] === next.hash) return 'pop';
    var a = depthOf(prev.name), b = depthOf(next.name);
    if (b > a) return 'push'; if (b < a) return 'pop';
    return 'lateral';
  };
  function record(kind, prev, next) {
    if (prev) scrollMemo[prev.hash] = window.scrollY || window.pageYOffset || 0;
    if (kind === 'refresh') return;
    if (kind === 'pop') { var i = stack.lastIndexOf(next.hash); stack = i >= 0 ? stack.slice(0, i + 1) : [next.hash]; }
    else if (kind === 'menu' || kind === 'initial') stack = [next.hash];
    else if (kind === 'tab' || kind === 'lateral') { if (stack.length) stack[stack.length - 1] = next.hash; else stack = [next.hash]; }
    else { stack.push(next.hash); if (stack.length > 30) stack.shift(); }
  }
  /* Called by App.route BEFORE the old screen is cleared. Returns a context for M.after(). */
  M.before = function (prev, next, view) {
    M.finish();
    var p = pending, kind = M.classify(prev, next), data = p && (p.kind === kind) ? p.data : null;
    record(kind, prev, next);
    var ctx = { id: ++seq, kind: kind, data: data, prev: prev, next: next, ghost: null, anims: [], nodes: [], timer: 0 };
    if (!M.supported() || kind === 'refresh' || kind === 'initial') return ctx;
    var old = view && view.querySelector && view.querySelector(':scope > .screen');
    if (old && (kind === 'push' || kind === 'pop' || kind === 'tab' || kind === 'lateral')) ctx.ghost = snapshot(old);
    return ctx;
  };
  function snapshot(old) {
    var r = old.getBoundingClientRect(), top = Math.max(0, r.top), g = document.createElement('div');
    g.className = 'nav-ghost'; g.setAttribute('aria-hidden', 'true'); g.setAttribute('inert', '');
    g.style.cssText = 'top:' + top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + Math.max(0, (window.innerHeight || 800) - top) + 'px';
    old.parentNode.removeChild(old); old.style.marginTop = (r.top - top) + 'px'; old.style.animation = 'none';
    [].forEach.call(old.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); }); old.removeAttribute('id');
    [].forEach.call(old.querySelectorAll('input[name]'), function (n) { n.removeAttribute('name'); });
    g.appendChild(old); document.body.appendChild(g); return g;
  }
  function anim(ctx, el, frames, o) { if (!el || !el.animate) return null; try { var a = el.animate(frames, Object.assign({ fill: 'both' }, o)); ctx.anims.push(a); return a; } catch (e) { return null; } }
  function blocker(ctx, ms) {
    if (document.body.classList.contains('board-screen')) return; // never delay move input or clocks
    var b = document.createElement('div'); b.className = 'nav-blocker'; b.setAttribute('aria-hidden', 'true'); document.body.appendChild(b); ctx.nodes.push(b);
    ctx.blockTimer = setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, ms);
  }
  /* Called by App.route AFTER the new screen rendered. */
  M.after = function (ctx, scr) {
    if (!ctx) return;
    var k = ctx.kind;
    if (k === 'pop' && scrollMemo[ctx.next.hash] != null) { try { window.scrollTo(0, scrollMemo[ctx.next.hash]); } catch (e) { } }
    if (!M.supported() || k === 'refresh' || k === 'initial') { cleanup(ctx); return; }
    run = ctx; var total = 0, ease = 'cubic-bezier(.32,.72,0,1)', last = null;
    var W = Math.min(window.innerWidth || 390, 1180);
    if (k === 'push' || k === 'pop') {
      var dir = k === 'push' ? 1 : -1, d = k === 'push' ? M.DUR.push : M.DUR.pop; total = d;
      scr.classList.add('nav-in'); if (ctx.ghost) ctx.ghost.classList.add(k === 'push' ? 'under' : 'over');
      last = anim(ctx, scr, [{ transform: 'translate3d(' + (dir > 0 ? W * 0.9 : -W * 0.28) + 'px,0,0)', opacity: dir > 0 ? 1 : 0.6 }, { transform: 'none', opacity: 1 }], { duration: d, easing: ease });
      if (ctx.ghost) anim(ctx, ctx.ghost, [{ transform: 'none', opacity: 1 }, { transform: 'translate3d(' + (dir > 0 ? -W * 0.28 : W) + 'px,0,0)', opacity: dir > 0 ? 0.5 : 1 }], { duration: d, easing: ease });
      blocker(ctx, Math.round(d * 0.6));
    } else if (k === 'tab' || k === 'lateral') {
      var td = k === 'tab' ? M.DUR.tab : M.DUR.lateral, tdir = (ctx.data && ctx.data.dir) || 1; total = td;
      var dx = k === 'tab' ? 28 * tdir : 0, dy = k === 'tab' ? 0 : 10;
      last = anim(ctx, scr, [{ transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: td, easing: ease });
      if (ctx.ghost) { ctx.ghost.classList.add('under'); anim(ctx, ctx.ghost, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(' + (-dx) + 'px,0,0)' }], { duration: Math.round(td * 0.7), easing: 'linear' }); }
    } else if (k === 'menu') {
      last = sweep(ctx, scr); total = M.DUR.cover + M.DUR.reveal;
    }
    var id = ctx.id, done = function () { if (run && run.id === id) M.finish(); };
    if (last && last.finished) last.finished.then(done, function () { });
    ctx.timer = setTimeout(done, total + 180);
  };
  /* The requested "flowing" menu transition: grow → sweep → reveal. */
  function sweep(ctx, scr) {
    var vw = window.innerWidth || 390, vh = window.innerHeight || 800, o = ctx.data || {}, x = o.x != null ? o.x : vw - 48, y = o.y != null ? o.y : 30;
    var R = Math.ceil(Math.sqrt(Math.pow(Math.max(x, vw - x), 2) + Math.pow(Math.max(y, vh - y), 2))) + 8;
    var cover = document.createElement('div'); cover.className = 'nav-sweep'; cover.setAttribute('aria-hidden', 'true');
    cover.innerHTML = '<span class="nav-sweep-label"></span>'; cover.firstChild.textContent = o.label || '';
    document.body.appendChild(cover); ctx.nodes.push(cover);
    var CS = window.CSS, clip = !!(CS && CS.supports) && (CS.supports('clip-path', 'circle(1px at 1px 1px)') || CS.supports('-webkit-clip-path', 'circle(1px at 1px 1px)'));
    var c = M.DUR.cover, r = M.DUR.reveal, ease = 'cubic-bezier(.65,0,.35,1)';
    if (clip) anim(ctx, cover, [{ clipPath: 'circle(22px at ' + x + 'px ' + y + 'px)', webkitClipPath: 'circle(22px at ' + x + 'px ' + y + 'px)', opacity: 1 }, { clipPath: 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)', webkitClipPath: 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)', opacity: 1 }], { duration: c, easing: ease });
    else anim(ctx, cover, [{ opacity: 0 }, { opacity: 1 }], { duration: c, easing: 'linear' });
    anim(ctx, cover.firstChild, [{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: c, easing: 'ease-out' });
    // Reveal: the rounded sheet lifts away while the new page settles up into place.
    anim(ctx, cover, [{ transform: 'none', borderRadius: '0 0 0 0' }, { transform: 'translate3d(0,-100%,0)', borderRadius: '0 0 48% 48% / 0 0 72px 72px' }], { duration: r, delay: c, easing: 'cubic-bezier(.5,0,.2,1)' });
    var settle = anim(ctx, scr, [{ transform: 'translate3d(0,18px,0)', opacity: 0.001 }, { transform: 'translate3d(0,18px,0)', opacity: 0.001, offset: c / (c + r) }, { transform: 'none', opacity: 1 }], { duration: c + r, easing: 'cubic-bezier(.2,.8,.2,1)' });
    blocker(ctx, c); // taps blocked only while the page is fully covered
    return settle;
  }
  function cleanup(ctx) {
    if (!ctx) return;
    clearTimeout(ctx.timer); clearTimeout(ctx.blockTimer);
    ctx.anims.forEach(function (a) { try { a.cancel(); } catch (e) { } }); ctx.anims = [];
    if (ctx.ghost && ctx.ghost.parentNode) ctx.ghost.parentNode.removeChild(ctx.ghost); ctx.ghost = null;
    ctx.nodes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); ctx.nodes = [];
    var s = document.querySelector && document.querySelector('#view > .screen.nav-in'); if (s) s.classList.remove('nav-in');
  }
  /* Finish whatever is running right now (also used before every new navigation). */
  M.finish = function () { var r = run; run = null; if (r) cleanup(r); [].forEach.call(document.querySelectorAll ? document.querySelectorAll('.nav-ghost,.nav-sweep,.nav-blocker') : [], function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); };
  M.running = function () { return !!run; };
})();
