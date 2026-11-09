/* R3 original fictional opponents. Labels are approximate, not calibrated platform ratings. */
(function(){
  'use strict';
  var bots=App.BOTS=[
    {id:'sprout',name:'Sprout',elo:100,level:0,skill:0,depth:1,time:80,loose:.85,tolerance:600,random:.75,style:'curious',books:['italian','scandi'],bookChance:.15,bio:'A first-game friend. Short sight, varied legal moves and frequent missed threats.'},
    {id:'twig',name:'Twig',elo:250,level:0,skill:0,depth:1,time:100,loose:.7,tolerance:450,random:.5,style:'curious',books:['london','scandi'],bookChance:.25,bio:'Learning central space and captures, but often overlooks what the opponent threatens.'},
    {id:'dot',name:'Dot',elo:400,level:0,skill:0,depth:1,time:130,loose:.6,tolerance:330,random:.28,style:'develop',books:['italian','caro'],bookChance:.35,bio:'Tries to develop pieces; inconsistent calculation leaves opportunities.'},
    {id:'pip',name:'Pip',elo:600,level:1,skill:0,depth:2,time:160,loose:.48,tolerance:260,style:'curious',books:['italian','scandi'],bookChance:.35,bio:'A curious learner: uneven central play, short calculation and frequent second choices.'},
    {id:'moss',name:'Moss',elo:800,level:2,skill:1,depth:3,time:220,loose:.38,tolerance:210,style:'solid',books:['london','caro'],bookChance:.55,bio:'Likes a solid setup and safe king; still misses tactics when several choices look similar.'},
    {id:'june',name:'June',elo:1000,level:3,skill:3,depth:5,time:300,loose:.28,tolerance:150,style:'active',books:['scotch','scandi'],bookChance:.65,bio:'An active central player who prefers captures and forcing moves; can overestimate an attack.'},
    {id:'rook',name:'Rook',elo:1200,level:4,skill:5,depth:7,time:420,loose:.19,tolerance:100,style:'develop',books:['italian','caro'],bookChance:.75,bio:'Develops purposefully and notices simple threats. A useful partner for transferring opening plans.'},
    {id:'sage',name:'Sage',elo:1350,level:5,skill:7,depth:9,time:550,loose:.12,tolerance:80,style:'solid',books:['qg','caro'],bookChance:.85,bio:'Patient and positional: values king safety and sensible development over speculative attacks.'},
    {id:'nova',name:'Nova',elo:1500,level:5,skill:9,depth:11,time:750,loose:.07,tolerance:65,style:'active',books:['scotch','kid'],bookChance:.9,bio:'Tactical and energetic; calculates longer and favours forcing moves among close engine choices.'},
    {id:'atlas',name:'Atlas',elo:1750,level:7,skill:13,depth:13,time:1000,loose:.025,tolerance:45,style:'develop',books:['qg','kid'],bookChance:.95,bio:'A demanding, balanced sparring partner: longer searches, reliable development, few deliberate inaccuracies.'},
    {id:'quill',name:'Quill',elo:2100,level:8,skill:17,depth:16,time:1100,loose:0,tolerance:30,style:'solid',books:['qg','caro'],bookChance:.95,bio:'An expert-strength label: deeper, restrained and positionally demanding, not a certified title.'},
    {id:'vega',name:'Vega',elo:2500,level:9,skill:20,depth:20,time:1400,loose:0,tolerance:20,style:'active',books:['scotch','kid'],bookChance:.98,bio:'Grandmaster-strength target label with the full engine available, not a certified title or calibrated Elo. No deliberate random errors.'}
  ];
  App.bot=function(id){return bots.find(function(b){return b.id===id;})||null;};
  App.botPreference=function(bot,move){
    if(!move)return 0;var center=/[c-f][3-6]/.test(move.to),minor=move.piece==='n'||move.piece==='b';
    if(bot.style==='active')return (move.captured?12:0)+(/[+#]/.test(move.san)?12:0)+(center?5:0);
    if(bot.style==='solid')return /O-O/.test(move.san)?24:(minor&&center?9:0)-(move.piece==='q'?8:0);
    if(bot.style==='develop')return (minor&&center?16:0)+(/O-O/.test(move.san)?16:0)-(move.piece==='q'?10:0);
    return center?10:0;
  };
  App.botBook=function(bot,fen,history){
    if(!history||history.length>16)return null;var side=fen.split(' ')[1],candidates=[];
    OPENINGS.filter(function(c){return c.color===side&&bot.books.indexOf(c.id)>=0;}).forEach(function(c){c.lines.forEach(function(l){var ms=l.moves.split(' ');if(ms.length>history.length&&history.every(function(m,i){return m===ms[i];}))candidates.push(ms[history.length]);});});
    if(!candidates.length)return null;var g=new Chess(fen),m=g.move(candidates[Math.floor(Math.random()*candidates.length)]);return m?m.from+m.to+(m.promotion||''):null;
  };
  Engine.botMove=function(fen,level,id,history){
    var bot=App.bot(id);if(!bot)return Engine.playMove(fen,level);
    if(bot.random&&Math.random()<bot.random){var legal=new Chess(fen).moves({verbose:true}),pool=legal.filter(function(m){return m.piece!=='k';});if(!pool.length)pool=legal;var pick=pool[Math.floor(Math.random()*pool.length)];return Promise.resolve(pick?pick.from+pick.to+(pick.promotion||''):null);}
    if(Math.random()<bot.bookChance){var book=App.botBook(bot,fen,history);if(book)return Promise.resolve(book);}
    return Engine.analyse(fen,{skill:bot.skill,depth:bot.depth,movetime:bot.time,multipv:bot.elo<600?5:3,priority:'play',cache:false}).then(function(r){
      if(!r||!r.best)return null;var lines=r.lines||[],sgn=fen.split(' ')[1]==='w'?1:-1;
      function score(l){return l.mate!=null?(l.mate>0?100000:-100000)*sgn:(l.cp||0)*sgn;}
      if(lines.length<2)return r.best;var best=score(lines[0]),loose=Math.random()<bot.loose;
      var options=lines.filter(function(l){return best-score(l)<=(loose?bot.tolerance:28);});
      if(loose&&options.length>1)return options[1+Math.floor(Math.random()*(options.length-1))].uci;
      options.sort(function(a,b){var ga=new Chess(fen),gb=new Chess(fen),ma=ga.move({from:a.uci.slice(0,2),to:a.uci.slice(2,4),promotion:a.uci[4]||'q'}),mb=gb.move({from:b.uci.slice(0,2),to:b.uci.slice(2,4),promotion:b.uci[4]||'q'});return score(b)+App.botPreference(bot,mb)-score(a)-App.botPreference(bot,ma);});return options.length?options[0].uci:r.best;
    });
  };

  var colors=['#8acb88','#cfb47a','#9aa7ff','#f4b076','#6fc3b2','#ef9bb9','#86b8eb','#d0a9ff','#ffe085','#d5e9b5','#eab2d8','#9bdde5'];
  App.botAvatar=function(id){var i=Math.max(0,bots.findIndex(function(b){return b.id===id;})),color=colors[i%colors.length],round=i%3===0?24:i%3===1?9:16;return '<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="'+(App.bot(id)||bots[0]).name+' avatar"><rect x="3" y="3" width="58" height="58" rx="'+round+'" fill="'+color+'"/><path d="M18 '+(17+i%5)+' L24 8 L30 17 M37 17 L43 8 L49 20" fill="none" stroke="#17212c" stroke-width="3"/><circle cx="23" cy="30" r="'+(3+i%2)+'" fill="#17212c"/><circle cx="42" cy="30" r="'+(3+i%2)+'" fill="#17212c"/><path d="M23 44 Q32 '+(44+i%4*3)+' 42 43" fill="none" stroke="#17212c" stroke-width="3" stroke-linecap="round"/><path d="M'+(11+i)+' 53h'+(12+i%3*6)+'" stroke="#fff" stroke-width="3" opacity=".7"/></svg>';};
  // Built-in TEXT ONLY banter. This subsystem never invokes AI or Voice.
  App.BotChat=function(id,history){this.bot=App.bot(id)||bots[0];this.log=(history||[]).slice(-30);this.lastAt=0;this.serial=0;};
  App.BotChat.prototype.post=function(event,force){var now=Date.now();if(!force&&now-this.lastAt<6500)return null;this.lastAt=now;var style=this.bot.style;
    var lines={start:style==='active'?['Let’s make the centre interesting.','Ready for an energetic game?']:style==='solid'?['A calm game and a clear plan. Good luck.','One sensible decision at a time.']:['Let’s discover a good game.','Ready when you are.'],check:['Check — I’m paying attention.','That king has an eventful day.'],capture:['A piece trade changes the story.','The board is getting clearer.'],mistake:['We both get another chance to learn.','Chess is a game of decisions, not perfection.'],win:['Good game. Shall we review the turning point?','Thanks for the game — rematch whenever you like.'],loss:['Well played. You earned that one.','Good game. I enjoyed the challenge.'],draw:['A balanced finish. Good game.','Honours shared. Ready for another?']};var pool=lines[event]||['I’m here for the game.'];var text=pool[(this.serial+++this.bot.name.length)%pool.length];this.log.push({who:this.bot.name,text:text});this.log=this.log.slice(-30);return text;};
  App.BotChat.prototype.reply=function(text){text=String(text||'').trim().slice(0,120);if(!text)return;this.log.push({who:'You',text:text});var answer=/hello|hi|hey/i.test(text)?'Hello! Enjoy the game.':/thanks|gg|good game/i.test(text)?'Good game. Thanks for playing.':/why|hint|move|help/i.test(text)?'I am built-in opponent chat, not a chess analyst. Use the separate coach outside independent checks.':'I use built-in replies, not open-ended AI. I’m happy to keep you company while we play.';this.log.push({who:this.bot.name,text:answer});this.log=this.log.slice(-30);return answer;};
  App.BotChat.prototype.open=function(){var self=this,sh=App.sheet('<h3>'+this.bot.name+' · built-in chat</h3><p class="tiny muted">Text only. No microphone, speech or API key. Banter does not reveal moves.</p><div id="botLog" class="col small" style="max-height:45vh;overflow:auto"></div><form id="botReply"><input class="input" maxlength="120" aria-label="Reply to bot" placeholder="Say hello…"><button class="btn sm" type="submit">Reply</button></form>');function draw(){sh.el.querySelector('#botLog').innerHTML=self.log.map(function(m){return '<p><b>'+App.esc(m.who)+':</b> '+App.esc(m.text)+'</p>';}).join('');}draw();App.q(sh.el,'form').onsubmit=function(e){e.preventDefault();var input=sh.el.querySelector('input');self.reply(input.value);input.value='';if(self.onChange)self.onChange();draw();};};
})();
