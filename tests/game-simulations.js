"use strict";
const assert=require("node:assert/strict");
const E=require("../game-engines");
const games=["CODENAMES","SPYFALL","PICTIONARY","CHARADES","WHOAMI","TABOO","WORD_BOMB","TRUTH_LIE","EMOJI_GUESS","TRIVIA","CATEGORIES","LIAR","HOT_SEAT","WOULD_YOU_RATHER","DRAW_GUESS","FASTEST","RIDDLE_RUSH","SECRET_WORD","MIMIC","GUESS_PLAYER","UNO","LUDO","BALOOT","DAQSH","QAWSAR"];
const players=n=>Array.from({length:n},(_,i)=>({username:"P"+i,guestId:"sim"+i,bot:true,seat:i}));
const sizes={CODENAMES:4,SPYFALL:3,PICTIONARY:2,CHARADES:2,WHOAMI:2,TABOO:2,WORD_BOMB:2,TRUTH_LIE:2,EMOJI_GUESS:2,TRIVIA:2,CATEGORIES:2,LIAR:3,HOT_SEAT:2,WOULD_YOU_RATHER:2,DRAW_GUESS:2,FASTEST:2,RIDDLE_RUSH:2,SECRET_WORD:2,MIMIC:2,GUESS_PLAYER:3,UNO:4,LUDO:4,BALOOT:4,DAQSH:2,QAWSAR:4};
let total=0;
function check(game){
 const p=players(sizes[game]); const s=E.create(game,p); assert.equal(s.game,game); assert.equal(s.version,4);
 const pub=E.pub(s,p,p[0]); assert.ok(pub&&pub.private!==undefined);
 for(let i=0;i<3;i++){E.bot(game,s,p); E.pub(s,p,p[0]);}
 total++;
}
for(let round=0;round<40000;round++)for(const g of games)check(g);
console.log("GAME_SIMULATION_OK",JSON.stringify({games:games.length,rounds:40000,total,failures:0}));
