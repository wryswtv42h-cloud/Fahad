"use strict";
const assert=require("node:assert/strict");
const E=require("../game-engines");
const games=["CODENAMES","SPYFALL","PICTIONARY","CHARADES","WHOAMI","TABOO","WORD_BOMB","TRUTH_LIE","EMOJI_GUESS","TRIVIA","CATEGORIES","LIAR","HOT_SEAT","WOULD_YOU_RATHER","DRAW_GUESS","FASTEST","RIDDLE_RUSH","SECRET_WORD","MIMIC","GUESS_PLAYER","UNO","LUDO","BALOOT","DAQSH","QAWSAR","JAKAROO"];
const players=n=>Array.from({length:n},(_,i)=>({username:"P"+i,guestId:"sim"+i,bot:true,seat:i}));
const sizes={CODENAMES:4,SPYFALL:3,PICTIONARY:2,CHARADES:2,WHOAMI:2,TABOO:2,WORD_BOMB:2,TRUTH_LIE:2,EMOJI_GUESS:2,TRIVIA:2,CATEGORIES:2,LIAR:3,HOT_SEAT:2,WOULD_YOU_RATHER:2,DRAW_GUESS:2,FASTEST:2,RIDDLE_RUSH:2,SECRET_WORD:2,MIMIC:2,GUESS_PLAYER:3,UNO:4,LUDO:4,BALOOT:4,DAQSH:2,QAWSAR:4,JAKAROO:4};
let total=0;
function check(game){
 const p=players(sizes[game]); const s=E.create(game,p); assert.equal(s.game,game); assert.equal(s.version,4);
 const pub=E.pub(s,p,p[0]); assert.ok(pub&&pub.private!==undefined); if(["UNO","BALOOT","JAKAROO"].includes(game)){const expected=game==="UNO"?7:game==="BALOOT"?5:4; assert.equal(pub.hand.length,expected);}
 for(let i=0;i<3;i++){E.bot(game,s,p); E.pub(s,p,p[0]);}
 total++;
}

function checkQawsarRules(){
 const p=players(4),s=E.create("QAWSAR",p);
 assert.equal(s.hands.length,4); assert.ok(s.hands.every(h=>h.length===4));
 assert.ok(s.revealed.every(v=>v.length===4&&v[0]&&v[1]&&!v[2]&&!v[3]));
 assert.ok(s.deck.length>0);
 const before=s.qawsarTurn; E.apply("QAWSAR",s,p,p[before],"draw",{});
 assert.equal(s.qawsarPhase,"choice");
 const old=s.hands[before][0]; E.apply("QAWSAR",s,p,p[before],"playCard",{index:0,mode:"swap"});
 assert.notDeepEqual(s.hands[before][0],old);
 assert.equal(s.qawsarPhase,"draw");
}
checkQawsarRules();
function checkJackarooRules(){
 const p=players(4),s=E.create("JAKAROO",p);
 assert.equal(s.hands.length,4);assert.ok(s.hands.every(h=>h.length===4));
 const pub=E.pub(s,p,p[0]);assert.ok(pub.private.hand.length===4);
 s.hands[0][0]={suit:"♠",rank:"A"};
 let chosen=-1;
 for(let i=0;i<s.hands[0].length;i++){try{E.apply("JAKAROO",s,p,p[0],"playCard",{index:i});chosen=i;break}catch{}}
 assert.ok(chosen>=0);
 assert.ok(Number.isInteger(s.pendingCard));
 const token=s.moveOptions[0];
 assert.ok(Number.isInteger(token));
 E.apply("JAKAROO",s,p,p[0],"moveToken",{token});
 assert.equal(s.pendingCard,null);
}
checkJackarooRules();

for(let round=0;round<40000;round++)for(const g of games)check(g);
console.log("GAME_SIMULATION_OK",JSON.stringify({games:games.length,rounds:40000,total,failures:0}));
