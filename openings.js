/* Stacy Chess - Openings course data (4 openings: 2 White, 2 Black)
   Each line: moves (SAN, space separated), notes keyed by ply (1 = White's 1st move),
   quiz keyed by ply = Stacy asks BEFORE that move is played. */
window.OPENINGS = [
{
  id:'kia', name:"King's Indian Attack", color:'w', short:'KIA',
  tagline:'One setup vs almost everything: Nf3, g3, Bg2, O-O, d3, Nbd2, e4.',
  why:"The KIA is a 'system'. You play the same first 6-7 moves against nearly anything, so you spend less time memorising and more time understanding plans. Your king gets safe fast, and later you often attack on the kingside with e5, h4 and a knight jump to g4 or g5.",
  ideas:[
    "Setup: Nf3, g3, Bg2, O-O, d3, Nbd2, e4. Same moves almost every game.",
    "Push e4. If Black keeps a pawn on d5, push e5 to gain space and kick the f6-knight.",
    "With a pawn on e5, attack the king: Nf1-h2-g4, h4, Bf4, Qd2 or Qe2, sometimes h5.",
    "Black usually attacks on the queenside (b5-b4, a5-a4). Be faster on the kingside!",
    "Never leave the e4/e5 pawn under-defended: the rook on e1 is its best friend."
  ],
  lines:[
    { id:'kia-french', name:'vs ...d5 & ...e6 (French setup)', 
      moves:'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6 Re1 b5 e5 Nd7 Nf1 a5 h4',
      notes:{1:"Nf3 develops a knight, controls e5 and d4, and keeps your options open.",
        3:"g3 makes a home for the bishop on g2.",5:"The bishop on g2 looks down the long diagonal toward b7 and a8. It also guards your king later.",
        7:"Castle early. Safe king first, fight later.",9:"d3 supports the e4 push that is coming.",
        11:"Nbd2 also supports e4. This is the full KIA setup.",13:"e4! Now you fight for the centre.",
        15:"Re1 puts the rook behind the e-pawn so e4-e5 is well supported.",
        17:"e5! Gains space and kicks the f6-knight away from your king's side.",
        19:"Nf1 starts the famous trip Nf1-h2-g4 (or Nf1-e3) toward Black's king.",
        21:"h4 grabs more space. Ideas: h5, Nh2-g4, Bf4. You are attacking, Black is busy on the queenside."},
      quiz:{13:{type:'choice',q:"Your setup is ready. Which pawn move fights for the centre now?",options:['e4','c4','h3'],answer:0,explain:"e4 is the key KIA pawn move. d3 and Nbd2 were played to support it."},
        17:{type:'move',q:"Black's knight on f6 defends the kingside. Can you find a pawn move that kicks it and gains space?",explain:"e5! The pawn kicks the knight and cramps Black."},
        19:{type:'choice',q:"Where is your d2-knight heading in this plan?",options:['To the kingside via f1-h2-g4','To b3 to attack c5','It stays on d2 all game'],answer:0,explain:"In the KIA the d2-knight goes f1, then h2 or e3, then g4. It joins the attack on Black's king."}}
    },
    { id:'kia-bf5', name:'vs ...d5 & ...Bf5 (London-style)',
      moves:'Nf3 d5 g3 Nf6 Bg2 Bf5 O-O e6 d3 Be7 Nbd2 O-O Re1 h6 e4 Bh7 Qe2 c6 b3 a5 a3',
      notes:{6:"Black puts the bishop on f5 before playing ...e6. Our plan is the same: d3, Nbd2, e4 to hit that bishop.",
        13:"Re1 gets ready to support e4.",15:"e4 attacks the bishop on f5 and grabs the centre.",
        16:"The bishop runs to h7, where it still looks at e4.",
        17:"Qe2! The queen guards e4 a second time and lines up on the e-file. Later e4-e5 at the right moment.",
        19:"b3 and Bb2: the second bishop joins in, aiming at the long diagonal.",21:"a3 stops ...a4 and ...Bb4 ideas. Next Bb2, then Ne5 or e5 when ready."},
      quiz:{15:{type:'move',q:"Black's bishop is on f5. Which pawn move attacks it and takes the centre?",explain:"e4 hits the bishop and claims the centre."},
        17:{type:'choice',q:"Your e4 pawn is attacked by the d5 pawn and the bishop on h7. How do you keep it strong?",options:['Qe2, add another defender','e5 right away','exd5, trade it off'],answer:0,explain:"Qe2 defends e4 again (with the knight on d2 and rook on e1). exd5 is OK too, but Qe2 keeps more tension and keeps Black guessing."}}
    },
    { id:'kia-kid', name:'vs ...g6 (Black copies you)',
      moves:'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3 Nc6 a4 h6 Nd5 Nxd5 exd5',
      notes:{2:"Black copies you with a King's Indian setup. That's fine, we keep our plan.",
        11:"e4 claims the centre.",13:"Nc3 develops and eyes the d5 square.",
        15:"a4 stops ...b5 and gives your knight time to reach d5.",17:"Nd5! A knight in the centre is strong. If Black takes, you recapture with a pawn and gain space.",
        19:"exd5 opens the e-file for your rook and hits the c6-knight. Next Re1."},
      quiz:{17:{type:'move',q:"Find a strong central square for your c3-knight.",explain:"Nd5. The knight can't easily be kicked by a pawn there, and a trade gives you a big pawn on d5."}}
    }
  ],
  traps:[
    { id:'kia-trap-nh5', name:"The knight on the rim",
      moves:'Nf3 d5 g3 Nf6 Bg2 Bf5 O-O e6 d3 Be7 Nbd2 O-O Re1 h6 e4 Bh7 e5 Nh5 Nf1 g5 Nxg5 hxg5 Qxh5',
      start:15,
      notes:{17:"e5 is a sharp try. Black's best answer is ...Nfd7.",18:"...Nh5? The knight runs to the edge of the board.",19:"Nf1! Now g4 is coming to trap the knight on h5.",20:"Black tries ...g5 to make room...",21:"Nxg5! A knight sacrifice that breaks open the king.",22:"If Black takes the knight...",23:"...Qxh5 grabs the knight back. Black's king is wide open and White is winning."},
      lesson:"A knight on the rim is dim. Look for ways to trap pieces that run to the edge."
    }
  ]
},
{
  id:'london', name:'London System', color:'w', short:'London',
  tagline:'d4, Bf4, e3, Nf3, c3, Nbd2, Bd3: rock solid and easy to learn.',
  why:"The London is the most popular system for club players, and for good reason. Like the KIA it is a setup more than a memory test. Your bishop gets outside the pawn chain before e3, your position is very hard to break, and there are clear attacking plans (Ne5, f4, Qf3/Qh5). It goes nicely with the KIA: if they play 1...d5 or 1...Nf6 you always know what to do.",
  ideas:[
    "Order: d4, Bf4 (bishop out BEFORE e3), e3, Nf3, c3, Nbd2, Bd3, O-O.",
    "The pawn triangle c3-d4-e3 is very solid. It's hard for Black to attack it.",
    "If Black plays ...Bd6 to trade bishops, keep yours with Bg3 and take back toward the centre.",
    "Plans: Ne5 then f4 for a kingside attack, or Qf3/Qh5 with Bd3 aiming at h7.",
    "Watch b2! When your bishop leaves c1, ...Qb6 can attack b2. Answer with Qb3 or Qc1, or Nc3/Nd2."
  ],
  lines:[
    { id:'london-main', name:'Main line vs ...d5, ...e6, ...c5',
      moves:'d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 b6 Ne5 Bb7 f4',
      notes:{1:"d4 takes the centre and frees the c1-bishop.",3:"Bf4! The bishop comes out BEFORE you play e3, so it isn't locked in.",
        5:"e3 makes the solid pawn triangle.",7:"Nf3 develops and controls e5.",9:"c3 supports d4, so the centre can't be broken easily.",
        11:"Nbd2 (not Nc3, because the c-pawn is on c3).",13:"Bg3 keeps your good bishop. If Black takes on g3, recapture with the h-pawn and open the h-file!",
        15:"Bd3 aims at h7, Black's weak spot after castling.",17:"Ne5! The knight jumps into a strong outpost.",19:"f4 supports the knight on e5. Now ideas like Qf3, Rf3-h3, g4-g5 to attack the king."},
      quiz:{3:{type:'move',q:"In the London, which piece comes out BEFORE you play e3?",explain:"The dark-squared bishop: Bf4. If you play e3 first, that bishop gets locked behind your pawns."},
        13:{type:'choice',q:"Black wants to trade with ...Bxf4. What's the best reply?",options:['Bg3, keep the bishop','Bxd6, trade it first','Ne5, ignore it'],answer:0,explain:"Bg3 keeps your bishop. If Black takes, hxg3 opens the h-file for your rook."},
        17:{type:'move',q:"Find the strong knight jump to a central outpost.",explain:"Ne5. Later f4 supports it and you get a kingside attack."}}
    },
    { id:'london-kid', name:"vs ...g6 (King's Indian setup)",
      moves:'d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 Nbd7 O-O c5 c3 b6 a4',
      notes:{2:"Black goes for a King's Indian. The London still works great.",9:"Be2 is calmer than Bd3 here, because Black's bishop is on g7, not d6.",
        11:"h3 gives your bishop a retreat square on h2 if Black plays ...Nh5.",13:"Castle. Your king is safe.",15:"c3 supports d4 against ...c5 and ...e5.",17:"a4 gains space on the queenside. Ideas: a5 to open the a-file."},
      quiz:{11:{type:'choice',q:"Why play h3 here?",options:['So the bishop can retreat to h2 if ...Nh5 attacks it','To attack Black\'s king with g4','No reason'],answer:0,explain:"After ...Nh5, the bishop can go to h2 and stay on the h2-b8 diagonal."}}
    },
    { id:'london-qb6', name:'vs early ...c5 & ...Qb6 (watch b2!)',
      moves:'d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qxb6 axb6 Nd2 b5 e4',
      notes:{8:"...Qb6 attacks b2. Remember: when your bishop leaves c1, b2 can become weak!",
        9:"Qb3 offers a queen trade and defends b2. If ...Qxb3, axb3 opens the a-file for your rook.",
        10:"...c4 avoids the trade for now and grabs queenside space.",11:"Qxb6! Trade queens. No queen = no more pressure on b2.",
        13:"Nd2 develops and prepares e4.",15:"e4! Hit the centre while Black's pawns are on the queenside. Black's c4 pawn is cut off from d5."},
      quiz:{9:{type:'choice',q:"Black's queen attacks your b2 pawn. What's a good answer?",options:['Qb3, offer a trade and defend b2','b3, push the pawn','Ignore it and play Nf3'],answer:0,explain:"Qb3 defends b2 and offers a trade. Nf3 would lose the b2 pawn to ...Qxb2."},
        11:{type:'move',q:"Black pushed ...c4 to attack your queen. Simplest answer?",explain:"Qxb6. Trading queens kills all of Black's pressure on b2."}}
    }
  ],
  traps:[
    { id:'london-trap-bb5', name:"Punish the early ...Qb6 grab",
      moves:'d4 d5 Bf4 c5 e3 Qb6 Nc3 Qxb2 Nxd5 Nc6 Rb1 Qxa2 Nc7+ Kd8 Nxa8',
      start:5,
      notes:{6:"Black's queen goes for b2 early.",7:"Nc3! Offer the pawn. It's bait.",8:"Black grabs the pawn...",9:"Nxd5! Now Nc7+ is a fork of king and rook.",10:"Black develops, but there's no good defence.",11:"Rb1 chases the queen first.",12:"The queen grabs another pawn...",13:"Nc7+! Fork!",14:"The king has to move.",15:"Nxa8. You won a whole rook. White is winning."},
      lesson:"Grabbing the b2 pawn with the queen early is risky. Develop fast and chase the queen."
    }
  ]
},
{
  id:'kid', name:"King's Indian Defense", color:'b', short:'KID',
  tagline:'vs 1.d4: ...Nf6, ...g6, ...Bg7, ...O-O, ...d6, ...e5 and attack!',
  why:"The KID is the mirror of your KIA, so the same ideas carry over: fianchetto bishop, safe king, then a pawn storm on the kingside. Against 1.d4 it gives you a fighting game where you attack instead of just defending, and club opponents often don't know how to meet it.",
  ideas:[
    "Setup: ...Nf6, ...g6, ...Bg7, ...O-O, ...d6, then ...e5 to hit the centre.",
    "If White pushes d5 (closing the centre), attack on the kingside: ...Ne8/...Nd7, ...f5, ...f4, ...g5-g4.",
    "White usually attacks on the queenside with c5. Be faster!",
    "The bishop on g7 is your best piece. Don't trade it cheaply.",
    "Don't panic about space. Your pieces are coiled behind the pawns, ready to spring."
  ],
  lines:[
    { id:'kid-classical', name:'Classical: Mar del Plata attack',
      moves:'d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Nd3 f5 Bd2 Nf6 f3 f4',
      notes:{2:"...Nf6 controls e4 and keeps options open.",4:"...g6 prepares the fianchetto.",6:"...Bg7: the king's bishop on the long diagonal. This is the heart of the KID.",
        8:"...d6 supports a later ...e5.",10:"Castle early, same as in your KIA.",12:"...e5! Black strikes at the centre.",
        14:"...Nc6 adds pressure on d4.",16:"White closes the centre with d5. That tells you the plan: kingside attack!",
        18:"...Nd7 frees the f-pawn so it can move to f5.",20:"...f5! The key pawn break.",
        22:"The knight comes back to f6 to support ...f4 and later ...g5-g4.",24:"...f4! Locks the kingside. Next ...g5, ...g4, ...Rf6-h6 or ...Ng6. Classic KID attack."},
      quiz:{12:{type:'move',q:"Your pieces are developed. Which pawn move strikes at White's centre?",explain:"...e5! The typical KID central strike."},
        18:{type:'choice',q:"White closed the centre with d5. Where should Black attack?",options:['On the kingside with ...f5','On the queenside with ...b5','In the centre with ...c6'],answer:0,explain:"Pawns point to the kingside, so Black attacks there with ...f5, ...f4, ...g5."},
        20:{type:'move',q:"Find the key pawn break that starts your attack.",explain:"...f5! Your knight moved off f6 just to allow this."}}
    },
    { id:'kid-london', name:'vs the London (d4, Nf3, Bf4)',
      moves:'d4 Nf6 Nf3 g6 Bf4 Bg7 e3 d6 h3 O-O Be2 Nbd7 O-O Qe8 c4 e5 Bh2 Ne4 a4 f5',
      notes:{2:"Against non-c4 lines, the KID setup still works.",8:"...d6 prepares ...e5.",12:"...Nbd7 also supports ...e5.",
        14:"...Qe8! Adds a third defender of e5 so you can push it.",16:"...e5 gains the centre.",18:"...Ne4! The knight jumps into the centre.",20:"...f5 supports the knight on e4. Next ...Kh8 and ...g5 or ...Ndf6 for kingside play."},
      quiz:{14:{type:'choice',q:"Black wants to play ...e5. Why ...Qe8 first?",options:['To add one more defender of e5','To trap the bishop','To castle long'],answer:0,explain:"e5 is attacked by the bishop on f4 and the knight on f3, so Black adds defenders: ...d6, ...Nbd7 and ...Qe8."},
        18:{type:'move',q:"Find a strong central square for your f6-knight.",explain:"...Ne4! Then ...f5 supports it, just like a Stonewall."}}
    },
    { id:'kid-fianchetto', name:'vs the Fianchetto (g3)',
      moves:'d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 O-O Nbd7 Nc3 e5 e4 c6 h3 Qb6',
      notes:{14:"...e5: the usual central strike.",16:"...c6 supports ...d5 later and opens b6 for the queen.",18:"...Qb6 pressures d4 and b2. Black's pieces are active."},
      quiz:{16:{type:'choice',q:"Why play ...c6 here?",options:['Opens b6 for the queen and prepares ...d5','To trap the bishop on g2','To defend the king'],answer:0,explain:"...c6 is a flexible move: it gives the queen b6 and supports a ...d5 break."}}
    }
  ],
  traps:[
    { id:'kid-trap-e4', name:"Don't let White grab e5 for free",
      moves:'d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 dxe5 dxe5 Qxd8 Rxd8 Nxe5 Nxe4 Nxe4 Bxe5',
      start:11,
      notes:{13:"White trades in the centre, hoping you'll lose e5.",17:"White grabs e5. Looks like it wins a pawn...",18:"...Nxe4! Hit back right away.",19:"White takes the knight...",20:"...Bxe5. You win the pawn back and your bishop is great. Count the attackers on both pawns!"},
      lesson:"When one pawn is grabbed, look for the counter-grab. The g7-bishop x-rays e5 once the knight moves."
    }
  ]
},
{
  id:'caro', name:'Caro-Kann Defense', color:'b', short:'Caro',
  tagline:'vs 1.e4: ...c6 and ...d5. Solid, sound, and easy to understand.',
  why:"You need an answer to 1.e4 too, since the KID is for 1.d4. The Caro-Kann is solid and sound, it avoids memorising tons of sharp Sicilian theory, and it has clear plans: get the light-squared bishop out (to f5 or g4), then ...e6, ...Nd7, ...Ngf6. It's a lot like a 'London System for Black', so it fits your style.",
  ideas:[
    "...c6 then ...d5: challenge e4 right away.",
    "Get the light-squared bishop OUT (...Bf5/...Bg4) before ...e6 locks it in.",
    "Advance (3.e5): hit the centre with ...c5 and ...Nc6/...Qb6.",
    "Classical (3.Nc3 dxe4): ...Bf5, ...Bg6, ...Nd7, ...Ngf6, ...e6 and solid development.",
    "Beware: after ...Nd7 never play ...Ngf6 if Qe2 is on the e-file (Nd6 mate!)."
  ],
  lines:[
    { id:'caro-advance', name:'Advance Variation (3.e5)',
      moves:'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 O-O Nc6 c3 cxd4 cxd4 Nge7 Nc3 Nc8 Be3 Nb6',
      notes:{2:"...c6 prepares ...d5.",4:"...d5 hits e4. Now White chooses a system.",6:"...Bf5! The bishop gets out before ...e6.",
        8:"...e6 builds the pawn chain.",10:"...c5! Attack the base of White's chain (d4).",12:"...Nc6 piles up on d4.",
        16:"...Nge7 heads for c8 and b6 or for c6/g6.",18:"...Nc8! An odd-looking but standard trip to b6.",20:"...Nb6 controls c4 and d5. Black is solid with a good bishop."},
      quiz:{6:{type:'move',q:"Before playing ...e6, get your 'problem' bishop out. Where?",explain:"...Bf5! Outside the pawn chain, so ...e6 won't lock it in."},
        10:{type:'choice',q:"White's pawn chain is d4-e5. Where should Black attack it?",options:['At the base, with ...c5','At the head, with ...f6','With ...g5'],answer:0,explain:"Attack the base of the chain (d4) with ...c5. Always aim at the base."}}
    },
    { id:'caro-classical', name:'Classical (3.Nc3 dxe4 4.Nxe4 Bf5)',
      moves:'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bd2 Ngf6 O-O-O Be7',
      notes:{6:"...dxe4: give up the centre for easy development.",8:"...Bf5 attacks the knight and develops.",10:"...Bg6 keeps the bishop safe from Nxf5.",
        12:"...h6 gives the bishop an escape square on h7.",14:"...Nd7 stops Ne5 and prepares ...Ngf6.",16:"...Bh7: tucked away and still useful.",
        18:"Trade the bishops. Fewer pieces = less attack against you.",20:"...e6 opens the f8-bishop.",22:"...Ngf6 develops.",24:"...Be7 and next ...O-O or ...Qc7 and ...O-O-O. Solid and safe."},
      quiz:{8:{type:'move',q:"Develop with a threat: attack the e4-knight.",explain:"...Bf5 develops and hits the knight."},
        12:{type:'choice',q:"White's h-pawn is coming to trap your bishop with h5. What do you do?",options:['...h6, give the bishop the h7 square','Ignore it','...e5'],answer:0,explain:"...h6 lets the bishop retreat to h7 after h5."}}
    },
    { id:'caro-exchange', name:'Exchange Variation (3.exd5)',
      moves:'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7 Nd2 e6 Ngf3 Bd6 Bxd6 Qxd6 O-O O-O',
      notes:{6:"...cxd5: the pawns are symmetrical. Black is comfortable.",8:"...Nc6 pressures d4.",12:"...Bg4! Gets the bishop out before ...e6.",
        14:"...Qd7 defends b7. Don't play ...Qb6?? Qxb6 axb6 ruins nothing, but ...Qd7 keeps things simple.",16:"...e6 and the f8-bishop is free.",
        18:"...Bd6 offers a trade of dark bishops.",22:"Both kings castled. Plan: ...Rab8 and ...b5-b4 (the minority attack) or ...Ne4."},
      quiz:{14:{type:'choice',q:"White's queen attacks b7. Best defence?",options:['...Qd7','...b6','...Rb8'],answer:0,explain:"...Qd7 defends b7 and connects with ...e6 and ...Bd6. ...b6 weakens c6."}}
    }
  ],
  traps:[
    { id:'caro-trap-nd6', name:"The Nd6 checkmate trap (DON'T fall for it)",
      moves:'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#',
      start:7,
      notes:{8:"...Nd7 is a fine move...",9:"...but now White's queen is on the e-file.",10:"...Ngf6?? A natural move, but a blunder!",11:"Nd6#! The e7-pawn is pinned by the queen, so it can't take. Checkmate! Instead play ...Ndf6 or ...e6 first."},
      lesson:"Before moving, ask: what checks does my opponent have? A pinned pawn can't take!"
    }
  ]
}
];

/* R3: four authored, rules-tested beginner/intermediate courses. */
window.OPENINGS.push.apply(window.OPENINGS, [
  {
    "id": "italian",
    "name": "Italian Game",
    "short": "Italian",
    "color": "w",
    "tagline": "Develop, castle, then prepare the centre.",
    "why": "The bishop on c4 and knight on f3 teach fast development without early queen adventures. The quiet d3 plan keeps the centre manageable.",
    "ideas": [
      "Develop Nf3 and Bc4; castle before starting an attack.",
      "Use c3 and d4 only when the centre and king are ready.",
      "If Black attacks e4 with ...Nf6, d3 is a simple reliable defence."
    ],
    "checkpoint": {
      "q": "What should support a central d4 break?",
      "choices": [
        "Development and king safety first",
        "An early queen raid",
        "Moving the same knight repeatedly"
      ],
      "answer": 0,
      "why": "Opening activity is useful when the king is safe and the pieces can support the pawn break."
    },
    "lines": [
      {
        "id": "italian-quiet",
        "name": "Quiet Italian: prepare d4",
        "moves": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 Nbd2",
        "notes": {
          "1": "Take central space and open the bishop.",
          "3": "Develop while attacking e5.",
          "5": "Bc4 eyes f7, but a quick mate is not the plan.",
          "7": "c3 prepares a supported d4; Black can attack e4 now.",
          "9": "d3 protects e4 before more ambitious play.",
          "11": "Castle: do not attack with the king still in the centre.",
          "13": "Re1 supports e4 and a future d4.",
          "15": "Save the bishop before ...b5 gains time.",
          "17": "Nbd2 develops the last knight. Next: Nf1-g3 or a prepared d4."
        },
        "quiz": {}
      },
      {
        "id": "italian-two-knights",
        "name": "Against the Two Knights",
        "moves": "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 O-O d6 c3 O-O Re1 a6 Bb3",
        "notes": {
          "6": "...Nf6 attacks e4. Check the threat before continuing.",
          "7": "d3 defends e4 without a risky forcing line.",
          "9": "Castle before expanding the centre.",
          "11": "c3 supports d4; the e4 pawn is already defended.",
          "13": "Re1 adds support. Finish development rather than chase pawns.",
          "15": "Bb3 keeps the active bishop and avoids ...b5 with tempo."
        },
        "quiz": {}
      }
    ],
    "traps": [
      {
        "id": "italian-shilling",
        "name": "Do not grab the poisoned pawn",
        "moves": "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#",
        "lesson": "After ...Nd4, Nxe5 and Nxf7 ignore queen threats. Prefer calm development or exchange the knight; scan checks first.",
        "notes": {
          "6": "...Nd4 attacks c2 and invites a pawn grab. Nxd4 is a calmer option.",
          "7": "Nxe5 enters the trap; do not confuse a free-looking pawn with a safe pawn.",
          "8": "...Qg5 attacks g2 and e5. White must notice the threat.",
          "9": "Nxf7 forks queen and rook but ignores the king.",
          "14": "The knight mates on f3. King safety outweighed the rook fork."
        },
        "quiz": {}
      }
    ]
  },
  {
    "id": "scotch",
    "name": "Scotch Game",
    "short": "Scotch",
    "color": "w",
    "tagline": "Open the centre and develop with purpose.",
    "why": "The early d4 exchange gives clear development tasks. Learn to use an open centre without spending every tempo on the queen.",
    "ideas": [
      "Play d4 to challenge the e5 pawn.",
      "After Nxd4, develop bishops and castle.",
      "If ...Nf6 attacks e4, choose a concrete central response rather than defend everything passively."
    ],
    "checkpoint": {
      "q": "After opening the centre, what becomes more urgent?",
      "choices": [
        "Push flank pawns",
        "Develop and castle",
        "Hunt a rook with the queen"
      ],
      "answer": 1,
      "why": "Open files and diagonals make an uncastled king vulnerable."
    },
    "lines": [
      {
        "id": "scotch-classical",
        "name": "Classical Scotch",
        "moves": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4 O-O O-O d6",
        "notes": {
          "5": "d4 challenges the centre now, not after a long pawn build-up.",
          "7": "Recapture with the knight to gain activity.",
          "9": "Be3 develops and protects the knight attacked by Bc5.",
          "10": "...Qf6 adds pressure. Look at threats before grabbing a pawn.",
          "11": "c3 supports the knight and prepares development.",
          "13": "Bc4 develops with pressure on f7.",
          "15": "Castle. Next develop the queenside knight; do not leave it idle."
        },
        "quiz": {}
      },
      {
        "id": "scotch-nf6",
        "name": "Against ...Nf6",
        "moves": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Nb6",
        "notes": {
          "8": "...Nf6 attacks e4; this line answers in the centre.",
          "9": "Exchange on c6 before pushing the e-pawn.",
          "11": "e5 gains space and attacks the knight.",
          "12": "...Qe7 pins the e-pawn against the king.",
          "13": "Qe2 protects e5 and prepares to unpin by moving the king.",
          "15": "c4 gains space with tempo, but development must follow."
        },
        "quiz": {}
      }
    ],
    "traps": [
      {
        "id": "scotch-retreat",
        "name": "Early knight retreat: finish development",
        "moves": "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nb3 Bb6 Nc3 Nf6 Bg5 h6 Bh4 g5 Bg3 d6",
        "lesson": "Nb3 is legal, not a tactical blunder. The lesson is the cost of repeated moves: Black develops and gains space; avoid claiming a forced win.",
        "notes": {
          "9": "Nb3 saves the knight but spends another developing tempo.",
          "11": "Nc3 returns to the main task: bring pieces out.",
          "14": "...h6 asks the bishop a question.",
          "16": "...g5 gains space but weakens Black too; do not call every pawn push safe.",
          "18": "Both sides still need king safety. Develop before launching an attack."
        },
        "quiz": {}
      }
    ]
  },
  {
    "id": "qg",
    "name": "Queen’s Gambit",
    "short": "QG",
    "color": "w",
    "tagline": "Challenge d5; build an active, safe centre.",
    "why": "The c-pawn challenges Black’s centre without giving up the d-pawn. Learn different plans when the gambit is accepted or declined.",
    "ideas": [
      "Challenge d5 with c4.",
      "Against ...e6, develop and pressure the centre; do not rush a pawn attack.",
      "Against ...dxc4, e3 and Bxc4 recover the pawn while developing."
    ],
    "checkpoint": {
      "q": "After ...dxc4, why is e3 useful?",
      "choices": [
        "It opens Bf1 to recover c4 while developing",
        "It guarantees mate",
        "It traps the queen"
      ],
      "answer": 0,
      "why": "The c4 pawn is often recovered naturally; development matters more than a premature queen raid."
    },
    "lines": [
      {
        "id": "qg-declined",
        "name": "Queen’s Gambit Declined",
        "moves": "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 Bd3 Bb7 O-O",
        "notes": {
          "3": "c4 challenges the d5 support of Black’s centre.",
          "5": "Nc3 increases central pressure.",
          "7": "Bg5 develops and pins the knight while the king remains on e8.",
          "9": "e3 opens the other bishop.",
          "11": "Nf3 develops and helps control e5.",
          "13": "Bh4 keeps the bishop; later ...Ne4 or ...g5 may ask new questions.",
          "15": "Bd3 points at the kingside, but do not sacrifice without calculation.",
          "17": "Castle. Next: finish development, use Rc1, and choose central exchanges carefully."
        },
        "quiz": {}
      },
      {
        "id": "qg-accepted",
        "name": "Queen’s Gambit Accepted",
        "moves": "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3 Bb7",
        "notes": {
          "4": "Black accepts the c-pawn. Do not panic about the temporary pawn count.",
          "5": "Nf3 develops and restrains ...e5.",
          "7": "e3 opens the bishop to c4.",
          "9": "Bxc4 recovers the pawn with development.",
          "10": "...c5 challenges d4. Watch the centre instead of only f7.",
          "11": "Castle before preparing an attack.",
          "13": "Qe2 connects the rooks after the queenside pieces develop.",
          "15": "Bb3 saves the bishop. Next develop Nb1 and contest central files."
        },
        "quiz": {}
      }
    ],
    "traps": [
      {
        "id": "qg-pawn-hold",
        "name": "The cost of trying to keep c4",
        "moves": "d4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 Qf3",
        "lesson": "Black’s pawn chain is vulnerable. Qf3 attacks Ra8 along the opened diagonal; Black must respond, for example ...Nc6. It is pressure, not a guaranteed rook win.",
        "notes": {
          "6": "...b5 tries to hold c4 at the cost of development.",
          "7": "a4 attacks the base of the pawn chain.",
          "9": "axb5 opens lines; calculate the recapture.",
          "11": "Qf3 attacks a8. Black has defensive resources, so do not assume a free rook."
        },
        "quiz": {}
      }
    ]
  },
  {
    "id": "scandi",
    "name": "Scandinavian Defence",
    "short": "Scandi",
    "color": "b",
    "tagline": "Challenge e4 immediately; develop after the queen retreat.",
    "why": "The pawn exchange gives a clear structure. The early queen costs a tempo, so choose a safe retreat, develop the minor pieces, and castle.",
    "ideas": [
      "Meet e4 with ...d5.",
      "After Nc3, retreat the queen once and stop moving it unnecessarily.",
      "Develop ...Nf6, ...Bf5 or ...Bg4, ...e6 and castle; keep the queen safe."
    ],
    "checkpoint": {
      "q": "After White attacks the queen with Nc3, what is the priority?",
      "choices": [
        "Keep checking with the queen",
        "Retreat safely and develop the minor pieces",
        "Push every kingside pawn"
      ],
      "answer": 1,
      "why": "The early queen move has already cost time. Safe development compensates better than another queen adventure."
    },
    "lines": [
      {
        "id": "scandi-qa5",
        "name": "Classical ...Qa5",
        "moves": "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 O-O e6 Re1 Nbd7",
        "notes": {
          "2": "...d5 challenges White’s centre immediately.",
          "4": "...Qxd5 recovers the pawn. Expect White to develop with tempo.",
          "6": "...Qa5 sidesteps Nc3. Watch discovered attacks along the diagonal.",
          "8": "...Nf6 develops and attacks central squares.",
          "10": "...c6 gives the queen a retreat square on c7.",
          "12": "...Bf5 develops before ...e6 closes the diagonal.",
          "14": "...e6 opens the dark bishop. Next ...Be7 and castle.",
          "16": "...Nbd7 finishes another developing task. Check tactics before castling."
        },
        "quiz": {}
      },
      {
        "id": "scandi-qd6",
        "name": "Solid ...Qd6",
        "moves": "e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 Bd3 Nc6 O-O Bg4 Be3 e6",
        "notes": {
          "6": "...Qd6 is another established retreat. Do not let the queen block every developing move.",
          "8": "...Nf6 contests e4 and d5.",
          "10": "...a6 prevents a Nb5 attack on the queen; it has a concrete purpose.",
          "12": "...Nc6 develops with pressure on d4.",
          "14": "...Bg4 develops and pins Nf3 to the queen.",
          "16": "...e6 prepares the bishop and castling. Avoid opening the centre while uncastled."
        },
        "quiz": {}
      }
    ],
    "traps": [
      {
        "id": "scandi-king-weakness",
        "name": "Punish an undefended king",
        "moves": "e4 d5 f3 e5 g4 Qh4#",
        "lesson": "White’s f3 and g4 open the diagonal to the king. Look for checks before routine development. This is a warning against weakening the king, not a plan to force against sensible play.",
        "notes": {
          "3": "f3 weakens the king’s diagonal and does not develop a piece.",
          "4": "...e5 opens the queen’s diagonal.",
          "5": "g4 leaves h4-e1 completely open.",
          "6": "...Qh4 is checkmate. Always scan forcing checks first."
        },
        "quiz": {}
      }
    ]
  }
]);

/* Concept checks for the original four courses; the answer is shown only after commitment. */
(function(){var checks={
 kia:{q:'Why prepare e4 with d3 and Nbd2?',choices:['Support the centre before choosing a pawn break','Guarantee a mating attack','Avoid developing the queenside forever'],answer:0,why:'d3 and Nbd2 support e4. Finish development and choose e5 only when the position justifies it.'},
 london:{q:'Why develop Bf4 before playing e3?',choices:['To win a pawn by force','To get the bishop outside the pawn chain','To move the queen out earlier'],answer:1,why:'Bf4 activates the bishop before e3 closes its diagonal. Still watch b2 against ...Qb6.'},
 kid:{q:'When White closes the centre with d5, which plan often fits Black?',choices:['An automatic queen sacrifice','Waiting without developing','Prepare ...f5, while checking the centre and king safety'],answer:2,why:'The closed pawn chain often points Black toward ...f5. It is a plan to prepare, not a move to play blindly in every position.'},
 caro:{q:'Why play ...Bf5 before ...e6 in many Caro-Kann lines?',choices:['To get the light bishop outside its pawn chain','To abandon the d5 centre','Because ...e6 is always a mistake'],answer:0,why:'Developing the light bishop first avoids locking it behind ...e6. In Advance structures, ...c5 challenges the base on d4.'}
};OPENINGS.forEach(function(c){if(checks[c.id])c.checkpoint=checks[c.id];});})();
