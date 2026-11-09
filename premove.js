/* Multi-premove geometry/projection only. Real legality is ALWAYS checked on the actual game. */
(function(){
 'use strict';
 function targets(fen,color,from){var map=parseFenMap(fen),piece=map[from];if(!piece||piece[0]!==color)return [];var f=from.charCodeAt(0)-97,r=+from[1]-1,type=piece[1],out=[];
  function square(x,y){return x<0||x>7||y<0||y>7?null:String.fromCharCode(97+x)+(y+1);}
  function push(x,y){var sq=square(x,y);if(!sq)return false;var p=map[sq];if(!p||p[0]!==color)out.push(sq);return !p;}
  if(type==='P'){var dir=color==='w'?1:-1;if(!map[square(f,r+dir)]){push(f,r+dir);if(r===(color==='w'?1:6)&&!map[square(f,r+2*dir)])push(f,r+2*dir);}push(f-1,r+dir);push(f+1,r+dir);}
  else if(type==='N')[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(function(d){push(f+d[0],r+d[1]);});
  else {var dirs=type==='B'?[[1,1],[-1,1],[1,-1],[-1,-1]]:type==='R'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];dirs.forEach(function(d){for(var n=1;n<=(type==='K'?1:7);n++)if(!push(f+n*d[0],r+n*d[1]))break;});
   if(type==='K'&&f===4&&r===(color==='w'?0:7)){var rights=fen.split(' ')[2]||'';if(rights.indexOf(color==='w'?'K':'k')>=0&&!map[square(5,r)]&&!map[square(6,r)])push(6,r);if(rights.indexOf(color==='w'?'Q':'q')>=0&&!map[square(1,r)]&&!map[square(2,r)]&&!map[square(3,r)])push(2,r);}}
  return out;
 }
 function fenFor(map,original,rights){var rows=[];for(var r=8;r>=1;r--){var row='',empty=0;for(var f=0;f<8;f++){var p=map[String.fromCharCode(97+f)+r];if(!p){empty++;continue;}if(empty){row+=empty;empty=0;}row+=p[0]==='w'?p[1]:p[1].toLowerCase();}if(empty)row+=empty;rows.push(row);}var fields=original.split(' ');fields[0]=rows.join('/');fields[2]=rights||'-';return fields.join(' ');}
 // Own moves only; enemies remain a separate immutable snapshot. No invented replies/captures.
 function advance(previous,color,m){
  if(previous.error!==null)return previous;
  var own=Object.assign({},previous.own),enemies=previous.enemies,rights=previous.rights,piece=own[m.from],index=previous.count;
  if(!piece||targets(previous.fen,color,m.from).indexOf(m.to)<0)return Object.assign({},previous,{error:index});
  delete own[m.from];own[m.to]=piece;
  if(piece[1]==='P'&&(m.to[1]==='1'||m.to[1]==='8'))own[m.to]=color+(m.promotion||'q').toUpperCase();
  if(piece[1]==='K'){
   rights=rights.replace(color==='w'?/[KQ]/g:/[kq]/g,'');
   if(Math.abs(m.from.charCodeAt(0)-m.to.charCodeAt(0))===2){var rank=m.from[1],rookFrom=(m.to[0]==='g'?'h':'a')+rank,rookTo=(m.to[0]==='g'?'f':'d')+rank;if(own[rookFrom]===color+'R'){delete own[rookFrom];own[rookTo]=color+'R';}}
  }
  if(piece[1]==='R'){var flag={'h1':'K','a1':'Q','h8':'k','a8':'q'}[m.from];if(flag)rights=rights.replace(flag,'');}
  return {source:previous.source,rights:rights,count:index+1,fen:fenFor(Object.assign({},enemies,own),previous.source,rights),own:own,enemies:enemies,overlaps:Object.keys(own).filter(function(sq){return !!enemies[sq];}),error:null};
 }
 function project(fen,color,queue){var original=parseFenMap(fen),own={},enemies={};Object.keys(original).forEach(function(sq){(original[sq][0]===color?own:enemies)[sq]=original[sq];});var p={source:fen,rights:fen.split(' ')[2]||'-',count:0,fen:fen,own:own,enemies:enemies,overlaps:[],error:null};for(var i=0;i<queue.length&&p.error===null;i++)p=advance(p,color,queue[i]);return p;}
 App.Premove={MAX_QUEUE:10000,project:project,advance:advance,targets:targets,legal:function(fen,color,p){var g=new Chess(fen);if(g.turn()!==color||g.game_over())return false;return g.moves({square:p.from,verbose:true}).some(function(m){return m.to===p.to&&(!m.promotion||m.promotion===(p.promotion||'q'));});}};
})();
