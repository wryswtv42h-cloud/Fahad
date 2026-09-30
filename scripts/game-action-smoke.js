"use strict";
(async()=>{
const fs=require("fs"), crypto=require("crypto"), vm=require("vm");
const source=fs.readFileSync("index.js","utf8");
const start=source.indexOf("const GAME_CATALOG = [");
const end=source.indexOf('app.post("/api/platform/lobbies/:id/leave"',start);
if(start<0||end<0) throw new Error("game/action block not found");
let actionHandler=null;
const app={get(){},delete(){},post(path,...args){if(path==="/api/platform/lobbies/:id/action")actionHandler=args[args.length-1];}};
const sandbox={crypto,console,app,auth:()=>{},adminOnly:()=>{},ownerOnly:()=>{},client:{isReady:()=>true},platform:{lobbies:[]},savePlatform:()=>{},logPlatform:()=>{},getGuild:async()=>null,getAllMembers:async()=>[]};
vm.createContext(sandbox);
const exported=vm.runInContext("(function(){"+source.slice(start,end)+"; return {GAME_CATALOG,initialGameState,publicGameState,maqsorValue,maqsorCanBurn};})()",sandbox);
if(typeof actionHandler!=="function")throw new Error("action handler not captured");
const {GAME_CATALOG,initialGameState,publicGameState,maqsorValue,maqsorCanBurn}=exported;
const assert=(v,m)=>{if(!v)throw new Error(m)};
function response(){const out={};return{out,statusCode:200,status(n){this.statusCode=n;return this},json(v){out.value=v;return this}}}
async function act(lobby,user,body){const res=response();await actionHandler({params:{id:lobby.id},account:{username:user},body},res);if(res.statusCode>=400)throw new Error((body.action||"action")+" failed for "+lobby.game+": "+JSON.stringify(res.out.value));return res.out.value}
function lobby(game,players){const l={id:crypto.randomUUID(),game,players,gameState:initialGameState(game,players),status:"playing",maxPlayers:players.length};sandbox.platform.lobbies=[l];return l}

assert(GAME_CATALOG.length===6,"catalog must contain 6 games");
for(const g of GAME_CATALOG){
  const count=g.id==="baloot"?4:Math.max(g.minPlayers,2),players=Array.from({length:count},(_,i)=>"p"+i),s=initialGameState(g.id,players);
  assert(s.startedAt&&s.turnIndex===0,"initial state "+g.id);
  if(g.id==="uno")assert(players.every(p=>s.hands[p].length===7),"UNO deal");
  if(g.id==="baloot")assert(players.every(p=>s.hands[p].length===8),"Baloot deal");
  if(g.id==="maqsor")assert(players.every(p=>s.hands[p].length===4),"Maqsor deal");
  if(g.id==="monopoly")assert(players.every(p=>s.money[p]===1500),"Monopoly money");
  if(["ludo","jackaroo"].includes(g.id))assert(players.every(p=>s.pieces[p].length===4),"pieces "+g.id);
  const pub=publicGameState({game:g.id,players,gameState:s},players[0]);
  if(s.hands)for(const p of players.slice(1))assert(pub.hands[p].every(c=>c.hidden===true||c.known===true),"private hand "+g.id);
}
for(const game of ["ludo","jackaroo"]){
  const l=lobby(game,["p0","p1"]);await act(l,"p0",{action:"roll"});const roll=l.gameState.lastRoll;assert(roll>=1&&roll<=6,game+" roll");await act(l,"p0",{action:"move",piece:0});assert(l.gameState.pieces.p0[0]===roll%40,game+" move");if(roll!==6)assert(l.gameState.turnIndex===1,game+" turn");
}
{
 const l=lobby("monopoly",["p0","p1"]);await act(l,"p0",{action:"roll"});assert(l.gameState.awaitingBuy===true,"Monopoly purchase prompt");const pos=l.gameState.positions.p0,before=l.gameState.money.p0;await act(l,"p0",{action:"buy"});assert(l.gameState.properties[pos]?.owner==="p0","Monopoly owner");assert(l.gameState.money.p0<before,"Monopoly deduction");assert(l.gameState.turnIndex===1,"Monopoly turn");
}
{
 const l=lobby("uno",["p0","p1"]),before=l.gameState.hands.p0.length;await act(l,"p0",{action:"draw"});assert(l.gameState.hands.p0.length===before+1,"UNO draw");assert(l.gameState.turnIndex===1,"UNO draw turn");l.gameState.turnIndex=0;const top=l.gameState.discard.at(-1),idx=l.gameState.hands.p0.findIndex(c=>c.color==="wild"||c.color===l.gameState.currentColor||c.value===top.value);assert(idx>=0,"UNO playable card");await act(l,"p0",{action:"play",cardIndex:idx,color:"أحمر"});assert(l.gameState.discard.length>=2,"UNO play");
}
{
 const l=lobby("baloot",["p0","p1","p2","p3"]);for(let i=0;i<4;i++){const actor=l.players[l.gameState.turnIndex];await act(l,actor,{action:"play-card",cardIndex:0});}assert(Object.values(l.gameState.scores).reduce((a,b)=>a+b,0)===1,"Baloot scoring");assert(l.gameState.trick.length===0,"Baloot reset");
}
{
 const l=lobby("maqsor",["p0","p1"]);await act(l,"p0",{action:"draw"});assert(l.gameState.drawn.p0,"Maqsor draw");await act(l,"p0",{action:"replace",index:2});assert(!l.gameState.drawn.p0,"Maqsor replace");l.gameState.turnIndex=0;const i=l.gameState.hands.p0.findIndex(c=>maqsorCanBurn(c,l.gameState.discard.at(-1)));if(i>=0){await act(l,"p0",{action:"burn",index:i});assert(l.gameState.hands.p0.length===4,"Maqsor burn size");}assert(maqsorValue({rank:"K"})===0&&maqsorValue({rank:"JOKER"})===20,"Maqsor values");
}
console.log("GAME_ACTION_SMOKE_OK");

})().catch(e=>{console.error(e.stack||e);process.exit(1);});
