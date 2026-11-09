/* R3 calculation lab: unspoiled candidate + user-modelled legal line, then engine assessment. */
(function(){
 'use strict';
 function win(r,color){var l=r&&r.lines&&r.lines[0];if(!l)return null;var w=Coach.lineWin(l);return color==='w'?w:100-w;}
 function reliable(r){var q=App.Analysis.quality(r);return q.terminal||!q.fallback&&q.depth>=10;}
 function classify(before,after,color,objective,tolerance){
  if(!reliable(before)||!reliable(after))return {graded:false,text:'Search quality is insufficient for a confident grade. This attempt is ungraded.'};
  var b=win(before,color),a=win(after,color),loss=Math.max(0,b-a),mate=after.lines[0].mate,rootMate=before.lines[0].mate;
  if(objective==='mate'&&(rootMate==null||(rootMate>0)!==(color==='w')))return {graded:false,text:'The engine did not verify the forced-mate objective at this search depth. No grade was invented.'};
  var cpLoss=before.lines[0].cp!=null&&after.lines[0].cp!=null?Math.max(0,(before.lines[0].cp-after.lines[0].cp)*(color==='w'?1:-1)):0;
  var mating=mate!=null&&(mate>0)===(color==='w'),accepted=loss<=(tolerance||4)&&((b>95&&a>95)||cpLoss<=Math.max(80,(tolerance||4)*25))&&(objective!=='mate'||mating);
  return {graded:true,accepted:accepted,loss:loss,text:accepted?'A sound/equivalent candidate within the stated engine tolerance.':'Legal, but the continuation gives up too much of the position or misses the verified mate objective.'};
 }
 App.Calculation={classify:classify,reliable:reliable};
 App.calculationSession=function(el,options){
  options=options||{};var saved=options.resume||(!options.onSave&&App.state.calcSession),rating=App.trainingRating?App.trainingRating():App.state.tacticsRating,side=saved&&saved.side||'random',plies=saved&&saved.plies||(rating<900?2:rating<1300?4:6),base,puzzle,objective,event,done=false,busy=false,token=0,dead=false;
  var st=App.stage(el,{both:true,orientation:'w'}),controls=App.html('<div class="row small"><select class="input" id="calcSide"><option value="random">Either side</option><option value="w">White</option><option value="b">Black</option></select><select class="input" id="calcDepth"><option value="1">1 ply · candidate only</option><option value="2">2 plies · one full move</option><option value="4">4 plies · two full moves</option><option value="6">6 plies · three full moves</option></select></div>');st.side.appendChild(controls);
  var cs=controls.querySelector('#calcSide'),cd=controls.querySelector('#calcDepth');cs.value=side;cd.value=plies;st.board.opts.showDests=false;
  function lock(on){App.trainingLock=on?{noHelp:true}:null;document.body.classList.toggle('independent-check',on);if(on&&window.Voice)Voice.stop();}
  function snapshot(){var state={base:base,puzzle:puzzle,objective:objective,event:event,side:side,plies:plies,pgn:st.game.pgn(),done:done,result:snapshot.result||null};if(options.onSave)options.onSave(state);else App.state.calcSession=state;App.save();return state;}
  function sync(){st.sync(true);st.top.textContent='Calculation · '+objective+' · no live help';st.bottom.textContent=st.game.history().length+'/'+plies+' plies modelled · both sides are YOUR prediction';snapshot();}
  function start(rs){token++;busy=false;done=false;snapshot.result=null;
   if(rs&&rs.base){base=rs.base;puzzle=rs.puzzle;objective=rs.objective;event=rs.event;st.load(base);if(rs.pgn)st.game.load_pgn(rs.pgn,{sloppy:true});done=!!rs.done;snapshot.result=rs.result||null;}
   else {var p=App.pickPuzzle(function(row){return side==='random'||row[1].split(' ')[1]!==side;},Math.max(500,Math.min(1876,rating)));puzzle={id:p.id,rating:p.rating,themes:p.themes};var g=new Chess(p.fen);if(p.setup)g.move({from:p.moves[0].slice(0,2),to:p.moves[0].slice(2,4),promotion:p.moves[0][4]||'q'});base=g.fen();objective=p.themes.some(function(t){return /^mate[123]$/.test(t);})?'mate':'best continuation';event='calc:'+p.id+':'+Date.now()+':'+Math.random().toString(36).slice(2);st.load(base);}
   st.board.setOrientation(base.split(' ')[1]);st.input=!done;lock(!done);sync();
   if(done&&snapshot.result)feedback(snapshot.result);else st.coach.say((objective==='mate'?'Find the mating continuation.':'Find a strong continuation; win if the position allows it.')+' Model '+plies+' plies on the board, including the opponent’s best defence. These are your predictions, not engine replies. Submit before any evaluation, arrows or answer is shown.',{speak:false,explain:false});
  }
  App.setContext(function(){return done?{mode:'calculation review',fen:st.game.fen(),history:st.game.history().join(' ')}:{mode:'independent calculation',help:'Answer and position context hidden until submission'};});
  st.onUserMove=function(from,to,promotion){if(done||busy||dead||!st.input||st.game.history().length>=plies)return false;var m=st.game.move({from:from,to:to,promotion:promotion||'q'});if(!m)return false;sync();if(st.game.history().length>=plies||st.game.game_over())st.input=false;return true;};
  function retry(){start({base:base,puzzle:puzzle,objective:objective,event:'calc:'+puzzle.id+':'+Date.now()+':'+Math.random().toString(36).slice(2),pgn:'',done:false});}
  function feedback(result){lock(false);st.input=false;st.coach.say(result.text,{speak:false,explain:false,cls:result.graded?(result.accepted?'good':'warn'):'',actions:[{label:'Retry without help',fn:retry},{label:options.onNext?'Next daily activity':'Next position',once:true,fn:function(){if(options.onNext)options.onNext();else start(null);}}]});if(result.arrows)st.board.setArrows(result.arrows);}
  function submit(){
   if(done||busy||dead)return;var hist=st.game.history({verbose:true});if(!hist.length)return App.toast('Make a legal candidate first.');if(hist.length<plies&&!st.game.game_over())return App.toast('Model '+(plies-hist.length)+' more plies, or choose candidate-only mode.');
   busy=true;st.input=false;var t=++token,color=base.split(' ')[1],fens=[base],g=new Chess(base);hist.forEach(function(m){g.move(m.san);fens.push(g.fen());});var evals=[],k=0;
   st.coach.say('Attempt submitted. Checking your candidate and the replies you modelled. No earlier move was auto-supplied.',{speak:false,explain:false});
   function finish(result){if(App.Weekly)App.Weekly.ensure();if(t!==token||dead)return;done=true;busy=false;snapshot.result=result;if(result.graded){App.state.stats.calc[result.accepted?0:1]++;App.record('calc',1,result.accepted?12:3);if(App.weeklyEvent)App.weeklyEvent(event,'calculation',result.accepted?100:0,{group:'calculation:'+Math.floor(rating/200)+':'+plies+':'+objective});}snapshot();feedback(result);if(options.onDone)options.onDone(result);}
   function step(){if(t!==token||dead)return;if(k>=fens.length){var first=classify(evals[0],evals[1],color,objective,rating<900?6:rating<1400?4:2.5);if(!first.graded)return finish(first);var sound=first.accepted,issues=[];for(var i=1;i<hist.length;i++){var mover=hist[i].color,j=classify(evals[i],evals[i+1],mover,'best continuation',rating<900?6:4);if(!j.graded)return finish(j);if(!j.accepted){sound=false;issues.push(hist[i].san+' is not a sound best-response model for '+(mover==='w'?'White':'Black')+'.');}}
      var best=evals[0].best,bestSan=best?Coach.pvSan(base,[best],1).join(' '):'',reply=evals[1].best?Coach.pvSan(fens[1],[evals[1].best],1).join(' '):'';return finish({graded:true,accepted:sound,candidateAccepted:first.accepted,text:first.text+' Estimated first-move win-chance loss: '+first.loss.toFixed(1)+'pp. '+issues.join(' ')+(bestSan?' Engine reference: '+bestSan+'.':'')+(reply?' Best defence after your candidate: '+reply+'.':'')+' Multiple sound moves can pass; this checks your submitted line, not every possible forced branch.',arrows:best?[{from:best.slice(0,2),to:best.slice(2,4),color:'blue'}]:[]});}
    var fen=fens[k++],terminal=App.Analysis.terminal(fen);(terminal?Promise.resolve(terminal):Engine.analyse(fen,{depth:Engine.modern?16:13,movetime:1100,multipv:3})).then(function(r){if(t!==token||dead)return;if(!r||!r.lines||!r.lines.length)return finish({graded:false,text:'Engine analysis failed. This attempt is ungraded; retry or continue without an invented score.'});evals.push(r);step();}).catch(function(){finish({graded:false,text:'Engine analysis was interrupted. No accuracy or mastery was awarded.'});});
   }step();
  }
  cs.onchange=function(){side=cs.value;start(null);};cd.onchange=function(){plies=+cd.value;start(null);};
  st.button('Undo model move',function(){if(busy||done)return;st.game.undo();st.input=true;sync();});st.button('Reset scratch line',function(){if(busy)return;if(done)return retry();st.load(base);done=false;st.input=true;lock(true);sync();});st.button('Submit calculation',submit,'primary');st.button('⇅',function(){st.board.flip();});
  start(saved);return {stage:st,snapshot:snapshot,cancel:function(){snapshot();dead=true;token++;st.input=false;lock(false);st.coach.clear();}};
 };
 var active=null;App.register('calc',{title:'Calculate, then commit',back:'train',nav:'train',render:function(el){active=App.calculationSession(el,{});},leave:function(){if(active)active.cancel();active=null;}});
})();
