"use strict";
const fs=require("fs"), crypto=require("crypto"), vm=require("vm");
const source=fs.readFileSync("index.js","utf8");
const start=source.indexOf("const GAME_CATALOG = [");
const end=source.indexOf('app.get("/api/platform/games"',start);
if(start<0||end<0) throw new Error("game engine block not found");
const block=source.slice(start,end);
const sandbox={crypto,console};
vm.createContext(sandbox);
vm.runInContext(block+"\nthis.__engine={GAME_CATALOG,initialGameState,publicGameState,maqsorValue,maqsorCanBurn};",sandbox);
const {GAME_CATALOG,initialGameState,publicGameState,maqsorValue,maqsorCanBurn}=sandbox.__engine;
const fail=(m)=>{throw new Error(m)};
const assert=(v,m)=>{if(!v)fail(m)};
assert(GAME_CATALOG.length===6,"catalog must contain 6 games");
for(const g of GAME_CATALOG){
  const count=g.id==="baloot"?4:Math.max(g.minPlayers,2);
  const players=Array.from({length:count},(_,i)=>"p"+i);
  const s=initialGameState(g.id,players);
  assert(s.startedAt,"startedAt missing: "+g.id);
  assert(s.turnIndex===0,"turn index missing: "+g.id);
  if(g.id==="uno") assert(players.every(p=>s.hands[p].length===7),"UNO hands");
  if(g.id==="baloot") assert(players.every(p=>s.hands[p].length===8),"Baloot hands");
  if(g.id==="maqsor") assert(players.every(p=>s.hands[p].length===4),"Maqsor hands");
  if(g.id==="monopoly") assert(players.every(p=>s.money[p]===1500),"Monopoly money");
  if(["ludo","jackaroo"].includes(g.id)) assert(players.every(p=>s.pieces[p].length===4),"piece setup "+g.id);
  const lobby={game:g.id,players,gameState:s};
  const pub=publicGameState(lobby,players[0]);
  if(s.hands){ for(const p of players.slice(1)){ if(g.id==="maqsor") assert(pub.hands[p].every(c=>c.hidden===true||c.known===true),"Maqsor hidden state"); else assert(pub.hands[p].every(c=>c.hidden===true||c.known===true),"hidden hand "+g.id); } }
}
assert(maqsorValue({rank:"K"})===0,"K value");
assert(maqsorValue({rank:"JOKER"})===20,"Joker value");
assert(maqsorCanBurn({rank:"8"},{rank:"8"}),"same rank burn");
assert(!maqsorCanBurn({rank:"8"},{rank:"9"}),"different rank burn");
console.log("GAME_ENGINE_SMOKE_OK");
