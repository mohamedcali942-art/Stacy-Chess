/* Stacy Chess R3: phased repertoire, no-help assessments, spaced mastery and daily safety. */
(function(){
  'use strict';
  var PHASES=['learn','guided','test','bridge','transfer'], LABELS={learn:'1 · Learn the ideas',guided:'2 · Guided practice',test:'3 · Independent check',bridge:'4 · Middlegame plan (guided)',transfer:'5 · Optional independent checkpoint'};
  var BRIDGE_DECISIONS=4;
  function find(id){for(var i=0;i<OPENINGS.length;i++){var c=OPENINGS[i],l=c.lines.concat(c.traps||[]).find(function(x){return x.id===id;});if(l)return {course:c,line:l};}return null;}
  function store(){var s=App.state;if(!s.openingMastery||s.openingMastery.version!==1)s.openingMastery={version:1,lines:{}};return s.openingMastery.lines;}
  function evidence(id){var rows=store(),f=find(id),length=f?f.line.moves.split(' ').length:8;if(!rows[id]){var legacy=!!App.state.learned[id],review=App.state.srs[id];rows[id]={learn:legacy,guided:false,test:false,bridge:false,transfer:false,learnDepth:legacy?length:0,guidedDepth:legacy&&review&&review.reps?length:0,testDepth:0,targetDepth:Math.min(8,length),attempts:{},events:[]};}var r=rows[id];if(r.learnDepth===undefined)r.learnDepth=r.learn?length:0;if(r.guidedDepth===undefined)r.guidedDepth=r.guided?length:0;if(r.testDepth===undefined)r.testDepth=r.test?length:0;if(!r.targetDepth)r.targetDepth=Math.min(8,length);if(!r.assist)r.assist={bridge:0,transferHelp:0,independent:0};return r;}
  function next(id){var r=evidence(id),f=find(id),length=f?f.line.moves.split(' ').length:8,target=r.targetDepth;return r.learnDepth<target?'learn':r.guidedDepth<target?'guided':r.testDepth<target?'test':r.testDepth<length?'learn':!r.bridge&&!r.transfer?'bridge':!r.transfer?'transfer':'test';}
  function allowed(id,phase){var r=evidence(id),f=find(id),length=f?f.line.moves.split(' ').length:8;return phase==='learn'||phase==='guided'&&r.learnDepth>=r.targetDepth||phase==='test'&&r.guidedDepth>=r.targetDepth||phase==='bridge'&&r.testDepth>=length||phase==='transfer'&&r.testDepth>=length&&!!(r.bridge||r.transfer);}
  // A branch counts as done for unlocking once the guided middlegame bridge (or a legacy transfer) is complete.
  function lineDone(id){var r=evidence(id);return !!(r.bridge||r.transfer);}
  function record(id,phase,event,passed,details){if(App.Weekly)App.Weekly.ensure();
    var r=evidence(id);if(r.events.indexOf(event)>=0)return false;r.events.push(event);r.events=r.events.slice(-80);
    r.attempts[phase]=(r.attempts[phase]||0)+1;r.last={phase:phase,passed:passed,at:Date.now(),details:details||{}};
    if(passed){var f=find(id),length=f?f.line.moves.split(' ').length:8,depth=details&&details.depth||length;if(phase==='transfer')r.transfer=true;else if(phase==='bridge')r.bridge=true;else{r[phase+'Depth']=Math.max(r[phase+'Depth']||0,depth);r[phase]=r[phase+'Depth']>=length;if(phase==='test'&&depth<length)r.targetDepth=Math.max(r.targetDepth,Math.min(length,depth+8));}}
    var assisted=!!(details&&details.assisted);
    if(phase==='bridge')r.assist.bridge++;if(phase==='transfer'){if(assisted)r.assist.transferHelp++;else if(passed)r.assist.independent++;}
    // Weekly: guided/assisted work is effort only; only an unaided transfer earns an opening score.
    if(App.weeklyEvent&&(phase==='bridge'||phase==='transfer'&&assisted))App.weeklyEvent(event,'effort',null,{group:'opening-plan-assisted:'+id});
    else if(App.weeklyEvent&&phase==='transfer')App.weeklyEvent(event,'opening',passed?100:0,{group:'transfer:'+id});
    if(phase==='learn'&&passed)App.state.learned[id]=true;
    if(phase==='test'){
      var intervals=[0,1,3,7,14,30,60,120],old=App.state.srs[id]||{box:0,reps:0};
      old.box=passed?Math.min(7,old.box+1):0;old.reps++;old.last=Date.now();old.due=Date.now()+(passed?intervals[old.box]*864e5:600000);old.misses=(old.misses||0)+(passed?0:1);App.state.srs[id]=old;
    }
    if(phase==='test'&&App.weeklyEvent)App.weeklyEvent(event,'opening',passed?100:0,{group:'opening:'+id+':'+(details&&details.depth||0)});
    App.save();return true;
  }
  function noHelp(phase){return phase==='test'||phase==='transfer';}
  function lock(on){App.trainingLock=on?{noHelp:true}:null;document.body.classList.toggle('independent-check',!!on);if(on&&window.Voice)Voice.stop();}
  function question(c){return c.checkpoint||{q:'Which plan fits this repertoire?',choices:[c.ideas[0],'Move the queen repeatedly to hunt pawns.','Ignore the opponent’s threats and always attack.'],answer:0,why:c.ideas.join(' ')};}
  App.Opening={transferBot:function(){var target=Math.max(600,(App.trainingRating?App.trainingRating():800)-100);return App.BOTS.filter(function(b){return b.elo<=target;}).slice(-1)[0]||App.BOTS[0];},allowed:allowed,find:find,evidence:evidence,next:next,record:record,noHelp:noHelp,phases:PHASES,labels:LABELS,lineDone:lineDone,bridgeDecisions:BRIDGE_DECISIONS};
  var active=null;
  App.openingSession=function(el,id,requested,onFinish,hooks){
    hooks=hooks||{};if(hooks.resume&&hooks.resume.line)id=hooks.resume.line;var f=find(id);if(!f)return App.go('openings');var index=f.course.lines.indexOf(f.line);if(index>0&&!lineDone(f.course.lines[index-1].id)){var first=f.course.lines.find(function(l){return !lineDone(l.id);})||f.course.lines[0];var copy=Object.assign({},hooks);delete copy.resume;return App.openingSession(el,first.id,null,onFinish,copy);}
    var aliases={drill:'guided',half:'guided',review:'test',trap:'learn'};
    var phase=hooks.noQuiz?next(id):(aliases[requested]||requested||next(id));if(PHASES.indexOf(phase)<0)phase=next(id);
    var c=f.course,l=f.line,moves=l.moves.split(/\s+/),rs=hooks.resume||(!hooks.onSave&&App.state.openingSessions&&App.state.openingSessions[id]);if(rs&&rs.done)rs=null;if(rs&&rs.phase&&requested&&rs.phase!==(aliases[requested]||requested)&&requested!=='auto')rs=null;
    // Legacy line snapshots can resume as guided practice; new sessions preserve their phase.
    if(rs&&rs.phase)phase=rs.phase;
    // v4 migration: an unfinished pre-bridge transfer snapshot is kept (not deleted) and the learner is routed to the guided bridge first.
    if(phase==='transfer'&&!allowed(id,'transfer')){if(rs){App.state.legacyTransferSnapshots=App.state.legacyTransferSnapshots||{};App.state.legacyTransferSnapshots[id]=rs;rs=null;}phase=allowed(id,'bridge')?'bridge':next(id);}
    if(rs&&!rs.phase)rs=Object.assign({},rs,{phase:phase,event:rs.ratingEvent||('legacy:'+id+':'+Date.now())});
    var reviewDepth=hooks.reviewDepth&&Math.min(+hooks.reviewDepth,evidence(id)[phase+'Depth']||0);if(!rs&&!reviewDepth&&!allowed(id,phase))phase=next(id);
    var limit=reviewDepth|| (phase==='transfer'||phase==='bridge'?moves.length:Math.min(moves.length,evidence(id).targetDepth));
    var st=App.stage(el,{orientation:c.color,compactCoach:false}),ply=0,misses=0,done=false,cancelled=false,reviewing=false,token=0,records=[],own=0,assisted=!!(rs&&rs.assisted),helps=rs&&rs.helps||0,retries=rs&&rs.retries||0,typicalSeen=rs?rs.typicalSeen:null,MG=App.Middlegame,mg=MG&&MG.plans[id];
    function quiet(){return noHelp(phase)&&!assisted;}
    var event=rs&&rs.event||'opening:'+id+':'+Date.now()+':'+Math.random().toString(36).slice(2);
    st.top.textContent=c.short+' · '+LABELS[phase]+' · '+limit+'/'+moves.length+' plies';st.bottom.textContent=c.color==='w'?'Your side: White':'Your side: Black';
    st.board.opts.showDests=!quiet();lock(quiet());
    var status=document.createElement('div');status.className='card phase-review small';st.side.appendChild(status);
    function snap(){return {line:id,event:event,phase:phase,ply:ply,misses:misses,done:done,fen:st.game.fen(),pgn:st.game.pgn(),records:records,own:own,assisted:assisted,helps:helps,retries:retries,typicalSeen:typicalSeen};}
    function checkpoint(){if(hooks.onSave)hooks.onSave(snap());else{App.state.openingSessions=App.state.openingSessions||{};App.state.openingSessions[id]=snap();App.save();}}
    function restart(){runner.cancel(true);if(App.state.openingSessions)delete App.state.openingSessions[id];if(hooks.onSave)hooks.onSave(null);App.save();if(hooks.onSave)App.route();else App.go('line/'+id+'/'+phase);}
    function context(){return quiet()&&!done?{mode:'Independent opening assessment',help:'Answers hidden until the attempt is complete'}:{mode:'opening '+phase,opening:c.name,fen:st.game.fen(),history:st.game.history().join(' ')};}
    App.setContext(context);
    function say(t,actions){return st.coach.say(t,{speak:!quiet(),explain:!quiet(),actions:actions||[]});}
    function finish(passed,text){
      if(done||cancelled)return;done=true;st.input=false;lock(false);token++;
      var fresh=record(id,phase,event,passed&&!(phase==='transfer'&&assisted),{misses:misses,ownMoves:own,depth:limit,assisted:phase==='bridge'||assisted,helps:helps,retries:retries});if(fresh)App.record('lesson',1,passed?12:3);checkpoint();
      status.textContent=(phase==='bridge'?'Guided plan practice recorded as ASSISTED evidence. ':phase==='transfer'&&assisted?'Assisted attempt: recorded as help-assisted practice, not an independent pass. ':passed?'Evidence earned. ':'Practice recorded; no rating penalty. ')+(phase==='test'?'Spaced review scheduled. ':'')+'Mastery tracks independent evidence, not Elo.';
      var actions=[{label:'Review this attempt',fn:reviewSheet},{label:'Repeat this phase',fn:restart}];
      if(onFinish)actions.push({label:'Continue session',cls:'primary',once:true,fn:function(){onFinish();}});
      else if(phase==='bridge'&&passed&&!onFinish)actions.push({label:'Optional independent checkpoint',fn:function(){App.go('line/'+id+'/transfer');}});
      actions.push({label:passed&&phase!=='transfer'&&phase!=='bridge'?'Next phase':'Course overview',cls:'primary',fn:function(){App.go(passed&&phase!=='transfer'&&phase!=='bridge'?'line/'+id+'/'+next(id):'course/'+c.id);}});
      st.coach.say(text,{speak:true,now:true,explain:false,cls:passed?'good':'warn',actions:actions});
    }
    function reviewSheet(){
      var body='<h3>Attempt review</h3><p>'+App.esc(c.ideas.join(' '))+'</p>';
      if(l.lesson)body+='<p>'+App.esc(l.lesson)+'</p>';
      body+=records.map(function(r){return '<div class="card"><b>'+App.esc(r.san||'Decision')+'</b><p class="small">'+App.esc(r.text||'Reviewed after the attempt.')+'</p></div>';}).join('');
      body+='<h4>Repertoire reference</h4><p class="small">'+App.esc(l.moves)+'</p><p class="small muted">Alternative legal moves are not automatically chess mistakes. This course checks a selected repertoire; engine comments are estimates.</p>';App.sheet(body);
    }
    function concept(){
      st.input=false;var q=question(c),order=q.choices.map(function(t,i){return {t:t,i:i};});App.shuffle(order);
      say('Final check — '+q.q,order.map(function(o){return {label:o.t,once:true,fn:function(){var ok=o.i===q.answer;records.push({text:(ok?'Correct. ':'Revisit the plan. ')+q.why});finish(ok&&misses===0,ok?'You recalled the line and its purpose. '+q.why:'The attempt is complete. '+q.why);}};}));
    }
    function step(){
      if(cancelled||done)return;st.input=false;status.textContent=phase==='learn'?'Learn without a quiz: move the highlighted piece on your turns; opponent replies play automatically.':phase==='guided'?'Try your move. A hint is available.':phase==='bridge'?'Guided middlegame: the opponent is thinking…':phase==='transfer'&&assisted?'Assisted attempt — help is on.':'No hints, move dots, evaluation or live coaching. Finish the attempt before feedback.';
      if(ply>=limit){if(phase==='test')return finish(misses===0,misses===0?'Clean independent recall at '+limit+' plies. The next learning cycle expands the line.':'You completed this chunk after corrections. Restart and make the whole chunk without mistakes to earn clean evidence.');if(phase==='transfer')return transferTurn();if(phase==='bridge')return bridgeTurn();return finish(true,phase==='learn'?'You played the explained moves with arrows. Next practise with less scaffolding.':'Guided practice complete. Next check the same plan without help.');}
      if(phase==='learn'){
        var g=new Chess(st.game.fen()),m=g.move(moves[ply]),note=(l.notes||{})[ply+1]||c.ideas[Math.floor(ply/2)%c.ideas.length];
        st.board.setArrows([{from:m.from,to:m.to,color:'blue'}]);
        if(st.game.turn()===c.color){st.input=true;var previous=ply>0?'Opponent played '+moves[ply-1]+' — '+((l.notes||{})[ply]||c.ideas[Math.floor((ply-1)/2)%c.ideas.length])+'. ':'';say(previous+'Your turn: '+m.san+' — '+note+' Tap or drag the highlighted move. This is learning, not a quiz.');checkpoint();return;}
        say('Opponent reply: '+m.san+' — '+note+' Watch this move; then you play your side.');checkpoint();
        var learnToken=token,learnPly=ply,learnFen=st.game.fen();function playLearnReply(){if(learnToken!==token||cancelled||done||ply!==learnPly||st.game.fen()!==learnFen||st.game.turn()===c.color)return;if(App.explanationOpen&&App.explanationOpen.stage===st){App.explanationOpen.continuations.push(playLearnReply);return;}st.play(moves[learnPly]);ply++;checkpoint();step();}setTimeout(playLearnReply,900);return;
      }
      if(st.game.turn()!==c.color){var t=token,replyPly=ply,replyFen=st.game.fen();function playGuidedReply(){if(t!==token||cancelled||done||replyPly!==ply||replyFen!==st.game.fen())return;if(App.explanationOpen&&App.explanationOpen.stage===st){App.explanationOpen.continuations.push(playGuidedReply);return;}st.play(moves[replyPly]);ply++;checkpoint();step();}setTimeout(playGuidedReply,360);return;}
      st.input=true;checkpoint();if(phase==='guided')say('Your move. '+c.ideas[Math.floor(ply/2)%c.ideas.length]);else if(!ply||st.coach.box.children.length===0)say('Play the repertoire from memory. Wrong moves are rejected without revealing the answer. Clean mastery needs an error-free run.');
    }
    function hint(){if(done||cancelled||noHelp(phase))return;var g=new Chess(st.game.fen()),m=g.move(moves[ply]);if(!m)return;st.board.setArrows([{from:m.from,to:m.to,color:'blue'}]);say(m.san+' — '+((l.notes||{})[ply+1]||c.ideas[0]));}
    st.onUserMove=function(from,to,promotion){
      if(done||cancelled||reviewing||!st.input||st.game.turn()!==c.color)return false;
      var before=st.game.fen(),m=st.game.move({from:from,to:to,promotion:promotion||'q'});if(!m){if(phase==='learn')say('That move is not legal here. No penalty: play the highlighted '+moves[ply]+' instead. '+((l.notes||{})[ply+1]||c.ideas[0]));return false;}
      if(phase==='bridge')return bridgeMove(m,before);
      if(phase==='transfer'){
        own++;records.push({fen:before,after:st.game.fen(),uci:m.from+m.to+(m.promotion||''),san:m.san,assisted:assisted});st.sync(true,m);st.input=false;checkpoint();transferTurn();return true;
      }
      if(m.san!==moves[ply]){
        if(phase==='learn'){st.game.undo();st.input=true;checkpoint();say('No penalty — this is learning, not a quiz. Play the highlighted '+moves[ply]+' — '+((l.notes||{})[ply+1]||c.ideas[Math.floor(ply/2)%c.ideas.length]));return false;}
        misses++;if(phase==='test'){if(misses===1&&App.weeklyEvent)App.weeklyEvent(event,'opening',0,{group:'opening:'+id+':'+limit});st.game.undo();st.input=true;checkpoint();say('That move was not committed. Retry without a hint. This run contains a mistake; restart for clean mastery.');return false;}
        st.game.undo();st.board.shake();say('Legal, but this practice follows a particular plan. '+((l.notes||{})[ply+1]||c.ideas[0])+' Try again, or reveal a hint.');checkpoint();return false;
      }
      st.sync(true,m);App.moveSound(m,st.game);ply++;own++;checkpoint();step();return true;
    };
    function transferTurn(){
      if(cancelled||done||reviewing)return;st.input=false;
      if(own>=8||st.game.game_over())return transferReview();
      if(st.game.turn()===c.color){st.input=true;if(assisted)bridgeStatus();checkpoint();return;}
      var t=token;Engine.botMove(st.game.fen(),App.Opening.transferBot().level,App.Opening.transferBot().id,st.game.history()).then(function(u){if(t!==token||done||cancelled)return;if(!u){finish(false,'The opponent could not respond. No mastery credit was invented. Try again when the engine is ready.');return;}st.play(u);checkpoint();transferTurn();});
    }
    function transferReview(){
      if(reviewing||done)return;reviewing=true;lock(false);say(assisted?'Attempt complete. Reviewing your decisions (help was used).':'Attempt complete. Now reviewing your decisions; no advice was shown during play.');var t=token,index=0,losses=[];
      function run(){if(t!==token||cancelled)return;if(index>=records.length){var avg=losses.length?losses.reduce(function(a,b){return a+b;},0)/losses.length:null;finish((own>=8||(st.game.in_checkmate()&&st.game.turn()!==c.color))&&avg!==null&&avg<10&&!assisted,(assisted?'Assisted checkpoint: '+own+' decisions with plan help. This is recorded as assisted practice, not an unaided pass. ':'Transfer checkpoint: '+own+' independent decisions. ')+(avg===null?'Engine feedback unavailable.':('Average estimated win-chance loss: '+avg.toFixed(1)+' percentage points.'))+' Review the centre, king safety and your next developing move. This was practice, not a rated win/loss.');return;}
        var r=records[index++];Engine.analyse(r.fen,{depth:13,movetime:650,multipv:2}).then(function(b){var terminal=App.Analysis&&App.Analysis.terminal(r.after);return (terminal?Promise.resolve(terminal):Engine.analyse(r.after,{depth:13,movetime:650,multipv:2})).then(function(a){if(t!==token||cancelled)return;if(b&&a&&b.lines.length&&a.lines.length){var j=Coach.judge(r.fen,r.uci,b,a);losses.push(j.loss);r.text=j.text;}else r.text='Engine review unavailable; do not infer a good or bad move.';run();});}).catch(function(){r.text='Engine review unavailable.';run();});
      }run();
    }

    // ---- v4 Opening → middlegame bridge: guided, interactive, assisted evidence ----
    function reliableEval(r){if(!r||!r.lines||!r.lines.length)return false;var q=App.Analysis?App.Analysis.quality(r):{fallback:true,depth:0};return q.terminal||!q.fallback&&q.depth>=10;}
    function checklistHtml(k){var p=k.plan||{},dev=typicalSeen===false&&p.deviation?'<p class="small"><b>They left the usual path.</b> '+App.esc(p.deviation)+'</p>':'';
      return '<div class="eyebrow">Your 5-step routine · decision '+Math.min(own+1,BRIDGE_DECISIONS)+'/'+BRIDGE_DECISIONS+'</div><ol class="small mg-steps">'+
        '<li><b>Opponent threats:</b> '+App.esc(k.threats.length?k.threats.join('; '):'no direct tactic found. Their usual idea: '+(p.threats||'check their last move.'))+'</li>'+
        '<li><b>Checks/captures for you:</b> '+App.esc(k.forcing.length?k.forcing.slice(0,5).join(', '):'none')+'</li>'+
        '<li><b>Worst piece:</b> '+App.esc(p.worst||'find the piece doing least and give it a job.')+'</li>'+
        '<li><b>Plan + candidate:</b> '+App.esc(p.plan||'improve a piece toward the weak side.')+'</li>'+
        '<li><b>Blunder check:</b> after your move, what is their best check or capture?</li></ol>'+dev;}
    function bridgeStatus(){if(phase!=='bridge'&&!assisted)return;var k=MG?MG.checklist(id,st.game.fen()):{threats:[],forcing:[],candidates:[],plan:{}};status.innerHTML=checklistHtml(k);return k;}
    function planSheet(){if(!MG||!mg){App.toast('No authored plan for this line.');return;}helps++;checkpoint();var k=MG.checklist(id,st.game.fen()),p=mg;
      var cands=k.candidates.length?k.candidates.map(function(x){return '<li><b>'+App.esc(x.san)+'</b> — '+App.esc(x.why)+'</li>';}).join(''):'<li>The authored candidates are not legal here (the game changed). Use the checklist: threats, forcing moves, worst piece.</li>';
      App.sheet('<h3>'+App.esc(l.name)+' · middlegame plan</h3><p class="small"><b>Structure:</b> '+App.esc(p.structure)+'</p><p class="small"><b>Their counterplay:</b> '+App.esc(p.threats)+'</p><p class="small"><b>Your plan:</b> '+App.esc(p.plan)+'</p><h4>Candidate ideas (still legal now)</h4><ul class="small">'+cands+'</ul><p class="small"><b>Pawn breaks:</b> '+App.esc(p.breaks)+'</p><p class="small"><b>Common mistakes:</b></p><ul class="small">'+p.mistakes.map(function(x){return '<li>'+App.esc(x)+'</li>';}).join('')+'</ul><p class="small"><b>If they deviate:</b> '+App.esc(p.deviation)+'</p><p class="tiny muted">Authored coaching ideas, checked for legality. Not an engine-proven “best move”; other good moves exist and are accepted.</p>');}
    function showCandidates(){if(!MG)return;helps++;var k=MG.checklist(id,st.game.fen());st.board.setArrows(k.candidates.map(function(x,i){return {from:x.from,to:x.to,color:i?'yellow':'blue'};}));checkpoint();say(k.candidates.length?'Candidate ideas: '+k.candidates.map(function(x){return x.san;}).join(', ')+'. Pick one only after the blunder check — or play your own idea.':'The usual candidates are not legal here. Work through the checklist and choose a safe improving move.');}
    function helpMePlan(){if(done||reviewing)return;if(!assisted){assisted=true;lock(false);st.board.opts.showDests=true;st.sync(false);st.top.textContent=c.short+' · '+LABELS.transfer+' · assisted';}bridgeStatus();checkpoint();planSheet();say('Help is on. This attempt now counts as ASSISTED practice, not an unaided pass. Use the checklist, then move.');}
    function bridgeTurn(){
      if(cancelled||done||reviewing)return;st.input=false;
      if(own>=BRIDGE_DECISIONS||st.game.game_over())return finish(true,'Bridge complete: '+own+' middlegame decisions with the plan. Recorded as guided (assisted) evidence. Next: the optional independent checkpoint, or continue the course.');
      if(st.game.turn()===c.color){var k=bridgeStatus();st.input=true;checkpoint();
        var th=k&&k.threats.length?'Watch: '+k.threats[0]+'. ':'';say((own===0?'Middlegame plan · '+(mg?mg.plan:'improve your worst piece.')+' ':'')+th+'Your move: 1 their threat · 2 checks/captures · 3 worst piece · 4 plan & candidate · 5 blunder check. Full checklist: More. Help: “Plan & candidates”.');return;}
      var t=token,fen0=st.game.fen();function reply(u){if(t!==token||done||cancelled||st.game.fen()!==fen0)return;if(App.explanationOpen&&App.explanationOpen.stage===st){App.explanationOpen.continuations.push(function(){reply(u);});return;}if(!u){finish(false,'The opponent engine did not respond. No evidence was invented; try again later.');return;}var m=st.play(u);if(own===0&&typicalSeen==null&&mg&&mg.typical){var h=st.game.history();typicalSeen=h[h.length-1]===mg.typical;}checkpoint();bridgeTurn();}
      var bot=App.Opening.transferBot();Engine.botMove(fen0,bot.level,bot.id,st.game.history()).then(reply,function(){reply(null);});
    }
    function bridgeMove(m,before){
      st.sync(true,m);if(App.moveSound)App.moveSound(m,st.game);st.input=false;st.board.setArrows([]);var t=token,uci=m.from+m.to+(m.promotion||''),after=st.game.fen(),cand=MG?MG.legalCandidates(id,before).some(function(x){return x.san===m.san;}):false;
      say('Checking '+m.san+'…');
      Engine.analyse(before,{depth:12,movetime:700,multipv:3}).then(function(b){var term=App.Analysis&&App.Analysis.terminal(after);return (term?Promise.resolve(term):Engine.analyse(after,{depth:12,movetime:700,multipv:2})).then(function(a){return [b,a];});}).catch(function(){return [null,null];}).then(function(r){
        if(t!==token||done||cancelled||st.game.fen()!==after)return;var b=r[0],a=r[1],j=null;
        if(reliableEval(b)&&reliableEval(a)){try{j=Coach.judge(before,uci,b,a);}catch(e){j=null;}}
        if(j&&j.loss>=15){st.game.undo();st.sync(true);retries++;st.input=true;checkpoint();if(j.arrows)st.board.setArrows(j.arrows);say('Not yet — '+j.text.split(' Line:')[0]+' No penalty here: try another move (use the checklist).',[{label:'Plan & candidates',fn:planSheet}]);return;}
        own++;records.push({fen:before,after:after,uci:uci,san:m.san,candidate:cand,graded:!!j,loss:j?j.loss:null,text:j?j.text:(cand?'Authored candidate. ':'Your own idea. ')+'Engine check unavailable or too shallow — not graded.'});
        var msg=j?(cand?m.san+' fits the plan. ':m.san+' is a reasonable alternative (engine estimate, loss '+j.loss.toFixed(1)+'%). ')+(j.bestSan&&j.bestSan!==m.san&&j.loss>=5?'Engine also liked '+j.bestSan+'. ':''):(cand?m.san+' matches an authored candidate. ':m.san+' is your own idea. ')+'No reliable engine check here, so it is not graded.';
        checkpoint();say(msg);setTimeout(function(){if(t===token)bridgeTurn();},450);
      });
      return true;
    }
    st.button('⇅ Flip',function(){st.board.flip();});
    if(phase==='guided')st.button('Reveal hint',hint);
    if(phase==='test')st.button('Restart clean run',restart);
    if(phase==='bridge'){st.button('Plan & candidates',planSheet);st.button('Show arrows',showCandidates);}
    if(phase==='transfer')st.button('Help me plan',function(){if(!assisted){helpMePlan();return;}planSheet();});
    st.button(quiet()?'End attempt':'Finish later',function(){if(noHelp(phase)&&!done)finish(false,'Attempt ended. Review the repertoire, then try again without help.');else App.go('course/'+c.id);});
    if(rs&&rs.phase===phase){misses=rs.misses||0;ply=Math.min(moves.length,rs.ply||0);records=rs.records||[];own=rs.own||0;if(rs.pgn)st.game.load_pgn(rs.pgn,{sloppy:true});else for(var i=0;i<ply;i++)st.game.move(moves[i]);st.sync(false);}
    if((phase==='transfer'||phase==='bridge')&&!rs){for(var k=0;k<moves.length;k++)st.game.move(moves[k]);ply=moves.length;st.sync(false);if(phase==='bridge'){say('The opening is done — now the middlegame. '+(mg?mg.structure+' ':'')+'You play '+BRIDGE_DECISIONS+' moves against a real bot reply. Good alternatives count; arrows and the plan are optional help.');bridgeTurn();}else{say('Optional checkpoint: eight independent decisions. Stuck? “Help me plan” switches this attempt to assisted practice.');transferTurn();}}else{step();if(assisted)bridgeStatus();}
    var runner={stage:st,snapshot:checkpoint,cancel:function(discard){if(cancelled)return;if(!discard)checkpoint();cancelled=true;token++;st.input=false;lock(false);st.coach.clear();}};active=runner;return runner;
  };
  App.runLine=App.openingSession;
  /* v6 Learn hub: white header with the Openings | Skills selector → one black panel listing the
     opening courses as a path. The course to continue next is the single white current card. */
  App.register('openings',{title:'Learn',back:'learn',nav:'learn',render:function(el){
    var U=App.ui,due=App.dueLines?App.dueLines():[],t=App.state.trainingProfile||{};
    var order=OPENINGS.slice().sort(function(a,b){function rank(c){return c.id===t.whiteCourse?0:c.id===t.blackCourse?1:2;}return rank(a)-rank(b);});
    var info=order.map(function(c){var completed=c.lines.reduce(function(n,l){return n+PHASES.filter(function(p){return evidence(l.id)[p];}).length;},0),total=c.lines.length*PHASES.length,lines=c.lines.filter(function(l){return App.Opening&&App.Opening.lineDone?App.Opening.lineDone(l.id):false;}).length,d=c.lines.filter(function(l){return App.state.srs[l.id]&&App.state.srs[l.id].due<=Date.now();}).length;return {c:c,completed:completed,total:total,lines:lines,due:d};});
    var cur=info.find(function(x){return x.completed>0&&x.completed<x.total;})||info.find(function(x){return x.completed<x.total;})||info[0];
    el.innerHTML=U.head({eyebrow:'Learn',title:'Opening paths',sub:'Ideas → practice → independence. Badges are evidence, not an Elo prediction.',selector:U.switcher(U.LEARN_TABS,'openings','Learn sections')});U.wireSwitcher(el);
    var panel=App.html(U.panel({id:'courses',title:'Your courses',aside:due.length?due.length+' reviews due':'Choose one White, one Black'}));
    if(due.length){var dueRow=App.html('<button type="button" class="link-row due-row" id="reviewDue"><span class="li-ic">~i:repeat~</span><span class="grow"><span>'+due.length+' lines ready to review</span><small>A quick refresh before something new</small></span><span class="chev" aria-hidden="true">›</span></button>');dueRow.onclick=function(){App.go('srs');};panel.appendChild(dueRow);}
    var list=App.html('<ol class="timeline" id="courseList" aria-label="Opening courses"></ol>');panel.appendChild(list);
    info.forEach(function(x){var c=x.c,st=x===cur?'current':x.completed>=x.total?'done':'next';
      var row=App.html(U.row({state:st,mark:c.color==='w'?'White':'Black',title:App.esc(c.name),sub:(st==='current'?App.esc(c.tagline)+' · ':'')+x.completed+'/'+x.total+' stage badges'+(x.due?' · '+x.due+' due':''),action:st==='current'?'<button class="btn primary" id="courseContinue">~i:play~ '+(x.completed?'Continue path':'Start path')+'</button>':''}));
      row.onclick=function(e){if(e&&e.target&&e.target.closest&&e.target.closest('button')&&!(e.target.closest('#courseContinue')))return;App.go('course/'+c.id);};row._course=c.id;list.appendChild(row);});
    el.appendChild(panel);
    var cont=el.querySelector('#courseContinue');if(cont)cont.onclick=function(e){if(e&&e.stopPropagation)e.stopPropagation();App.go('course/'+cur.c.id);};
  }});
  App.screens.learn.render=App.screens.openings.render;
  /* v12: study guide card for a course (plans for both sides, structures, mistakes, traps) + live Stockfish check. */
  App.openingGuideCard=function(c){var G=c.guide,lst=function(a){return '<ul>'+(a||[]).map(function(x){return '<li class="small">'+App.esc(x)+'</li>';}).join('')+'</ul>';};
      var gc=App.html('<div class="card" id="openingGuide"><h3>Study guide</h3><details open><summary><b>Your plans</b></summary>'+lst(G.plansUs)+'</details><details><summary><b>What the opponent wants</b></summary>'+lst(G.plansThem)+'</details><details><summary><b>Typical pawn structures</b></summary>'+lst(G.structures)+'</details><details><summary><b>Typical mistakes</b></summary>'+lst(G.mistakes)+'</details><details><summary><b>Traps</b></summary><p class="small"><b>For you:</b> '+App.esc(G.trapsFor||'')+'</p><p class="small"><b>Against you:</b> '+App.esc(G.trapsAgainst||'')+'</p></details>'+
        '<p class="tiny muted">'+c.lines.length+' lines below, each with Learn → Practice (from memory) → Test and spaced reviews. Lines that start like the main line and then change teach you how to answer deviations.</p><div class="btn-row"><button class="btn sm" id="sfCheck">Check the final positions with Stockfish</button></div><div id="sfOut" class="small"></div></div>');
      App.q(gc,'#sfCheck').onclick=function(e){var out=gc.querySelector('#sfOut'),btn=e.currentTarget;btn.disabled=true;out.textContent='Stockfish is checking '+c.lines.length+' lines…';var rows=[],i=0;
        (function next(){if(!gc.isConnected)return;if(i>=c.lines.length){out.innerHTML=rows.join('')+'<p class="tiny muted">'+App.esc(Engine.describe())+'. Score from '+(c.color==='w'?'White':'Black')+'’s side, in pawns; ±0.5 is about equal.</p>';btn.disabled=false;return;}
          var l=c.lines[i++],g=new Chess();l.moves.split(' ').forEach(function(m){g.move(m);});
          Engine.analyse(g.fen(),{depth:14,movetime:2500,priority:'interactive',owner:'opening-guide'}).then(function(r){var t='not checked (engine unavailable)';if(r&&r.lines&&r.lines[0]&&!(r.quality&&r.quality.fallback)){var L0=r.lines[0],v=L0.mate!=null?null:(c.color==='w'?1:-1)*L0.cp/100;t=L0.mate!=null?'forced mate found':(v>=0.5?'better for you':v<=-0.5?'better for the opponent – play carefully':'about equal')+' ('+(v>=0?'+':'')+v.toFixed(1)+', depth '+((r.quality&&r.quality.depth)||'?')+')';}rows.push('<div class="set-row"><div class="grow"><b>'+App.esc(l.name)+'</b></div><span>'+App.esc(t)+'</span></div>');next();}).catch(function(){rows.push('<div class="set-row"><div class="grow"><b>'+App.esc(l.name)+'</b></div><span>not checked</span></div>');next();});})();};
    
    return gc;};
  App.register('course',{title:function(p){var f=OPENINGS.find(function(c){return c.id===p[0];});return f?f.name:'Course';},back:'learn',nav:'learn',render:function(el,p){var c=OPENINGS.find(function(c){return c.id===p[0];});if(!c)return App.go('openings');
    el.appendChild(App.html('<div class="card"><h3>Why this opening?</h3><p>'+App.esc(c.why)+'</p><ol>'+c.ideas.map(function(x){return '<li class="small">'+App.esc(x)+'</li>';}).join('')+'</ol></div>'));
    if(c.guide&&App.openingGuideCard)el.appendChild(App.openingGuideCard(c));
    c.lines.forEach(function(l){var r=evidence(l.id),srs=App.state.srs[l.id],card=App.html('<div class="card"><h3>'+App.esc(l.name)+'</h3><div class="phase-status">'+(srs?'Review '+(srs.due<=Date.now()?'due now':new Date(srs.due).toLocaleDateString()):'No independent review yet')+'</div><div class="phase-buttons"></div></div>');
      PHASES.forEach(function(phase){var b=App.html('<button class="btn sm '+(next(l.id)===phase?'primary':'')+'">'+(r[phase]?'✓ ':'')+LABELS[phase]+'</button>');b.disabled=!allowed(l.id,phase);b.onclick=function(){App.go('line/'+l.id+'/'+phase);};card.querySelector('.phase-buttons').appendChild(b);});el.appendChild(card);});
    (c.traps||[]).forEach(function(l){var b=App.html('<div class="card"><h4>Common mistake: '+App.esc(l.name)+'</h4><p class="small">'+App.esc(l.lesson)+'</p><button class="btn sm">Walk through the example</button></div>');App.q(b,'button').onclick=function(){App.go('line/'+l.id+'/learn');};el.appendChild(b);});
  }});
  App.register('line',{title:'Opening academy',back:'openings',nav:'learn',render:function(el,p){App.openingSession(el,p[0],p[1],null,{reviewDepth:+p[2]||0});},leave:function(){if(active)active.cancel();active=null;}});
  App.register('review-due',{title:'Spaced opening check',back:'learn',nav:'learn',render:function(el){var due=App.dueLines();if(!due.length){el.innerHTML='<div class="card"><h3>No opening checks due.</h3><button class="btn" onclick="App.go(\'openings\')">Choose a course</button></div>';return;}App.openingSession(el,due[0].line.id,'test',function(){App.route();});},leave:function(){if(active)active.cancel();active=null;}});
  App.register('srs',App.screens['review-due']);
  // Short unassisted safety assessment for Today; feedback only after committing a decision.
  App.safetySession=function(el,task,onFinish,persist){
    var st=App.stage(el,{}),cancelled=false,r=task.state||{index:0,correct:0,done:false},answered=false;task.state=r;st.input=false;st.board.opts.showDests=false;
    function finish(){if(r.done)return;r.done=true;task.have=task.goal;task.complete=true;persist();lock(false);st.coach.say('Safety check: '+r.correct+'/'+task.goal+'. Scan opponent checks, captures and loose pieces before your own attack.',{speak:false,actions:[{label:'Continue session',once:true,fn:onFinish}]});}
    function show(){if(cancelled)return;if(r.index>=task.goal)return finish();answered=false;lock(true);var at=(task.seed+r.index)%(task.indices&&task.indices.length||BLUNDERS.length),row=BLUNDERS[task.indices?task.indices[at]:at];st.load(row[0]);var mv=Coach.uciToMove(row[0],row[1]);if(!mv){r.index++;return show();}st.coach.say('No-help safety check '+(r.index+1)+'/'+task.goal+': is '+mv.move.san+' safe, or a blunder?',{speak:false,explain:false,actions:[{label:'Safe',once:true,fn:function(){answer(false);}},{label:'Blunder',once:true,fn:function(){answer(true);}}]});
      function answer(blunder){if(answered||cancelled)return;answered=true;lock(false);var actual=!row[2],ok=blunder===actual;if(ok)r.correct++;if(App.weeklyEvent)App.weeklyEvent('safety:'+App.today()+':'+task.seed+':'+r.index,'safety',ok?100:0,{group:'safety'});App.state.stats.blunder[ok?0:1]++;App.record('blunder',1,ok?5:1);r.index++;persist();st.play(row[1]);var ref=row[3]?Coach.pvText(st.game.fen(),[row[3]],1):'';st.coach.say((ok?'Correct. ':'Revisit this. ')+(actual?'This move has a tactical refutation. '+(ref?'Reply: '+ref:''):'This is the dataset’s safe candidate, not a claim that every continuation wins.'),{speak:false,explain:false,actions:[{label:r.index>=task.goal?'Finish check':'Next decision',once:true,fn:show}]});}
    }
    show();return {stage:st,snapshot:persist,cancel:function(){cancelled=true;st.input=false;lock(false);}};
  };
  // Preserve started/resumable legacy plans; upgrade only new or not-yet-started outlines.
  var ensure=App.ensurePlan;
  App.ensurePlan=function(){var p=ensure();if(!p.started&&!p.completed&&p.curriculumVersion!==3){var t=p.tasks.find(function(t){return t.type==='opening';});if(t){t.mode='auto';t.name='Opening academy · '+LABELS[next(t.line)];t.reason='Build independent evidence, then apply the plan in a game.';}
      var safety={type:'safety',name:'Three no-help safety decisions',icon:'shield',goal:3,have:0,seed:Number(App.today().replace(/-/g,''))%BLUNDERS.length,reason:'Commit to safe or blunder before seeing a refutation.'};p.tasks.splice(Math.min(2,p.tasks.length),0,safety);p.curriculumVersion=3;App.save();}return p;};
})();
