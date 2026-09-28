"use strict";
const C=["🔴","🟡","🟢","🔵"],S=["♠","♥","♦","♣"],R=["7","8","9","10","J","Q","K","A"];
const WORDS=["قمر","مفتاح","نهر","صحراء","روبوت","مدرسة","سيف","مطر","نجم","حديقة","مسرح","ذهب","بحر","كتاب","طائرة","قلعة","تفاحة","قهوة","نظارة","صاروخ","بوصلة","جزيرة","ثلج","طريق","برق","نار","ملك","بنك","كرة","طبيب","موسيقى","سفينة","سر","جسر","شمس","ظل","وردة","ساعة","مدينة","غابة","قلب","فيلم","قلم","حصان","صقر","حجر","خبز","كوكب","نسر","مرآة","نفق","رعد","قناع","خاتم","برج","صندوق","قطار","ملعب","رمل","عسل","ورق","جبل","تاج","كنز","ليل","نهار","مجرة","نخلة","بركان"];
const TRIVIA=[["ما أكبر كوكب؟",["الأرض","المشتري","المريخ","زحل"],1],["عاصمة السعودية؟",["جدة","الرياض","الدمام","مكة"],1],["كم ضلعًا للمثلث؟",["2","3","4","5"],1],["ما الكوكب الأحمر؟",["المريخ","الزهرة","عطارد","نبتون"],0]];
const SPY=[["المطار",["طيار","مسافر","أمن","مراقب"]],["المستشفى",["طبيب","ممرض","زائر","جراح"]],["الشاطئ",["منقذ","سائح","سباح","بائع"]],["المطعم",["شيف","زبون","نادل","ناقد"]],["المدرسة",["معلم","طالب","مدير","حارس"]],["الكازينو",["لاعب","موزع","حارس","مدير"]]];
const TAB=[["تفاحة",["فاكهة","أحمر","أكل","شجرة","عصير"]],["سيارة",["مركبة","قيادة","طريق","عجلة","بنزين"]],["بحر",["ماء","موج","شاطئ","سباحة","أزرق"]]];
const RIDDLE=[["له أسنان ولا يعض؟","مشط"],["كلما أخذت منه كبر؟","حفرة"],["له عين ولا يرى؟","إبرة"]];
const EMO=[["🦁👑","الأسد الملك"],["🚢🧊💔","تايتانيك"],["🧙‍♂️💍🌋","سيد الخواتم"],["🧞‍♂️🕌","علاء الدين"]];
const CAT=["فواكه","دول","حيوانات","أكلات","ألعاب","مهن"],LET="ابتثجحخدذرزسشصضطظعغفقكلمنهوي";
const sh=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const k=p=>p?.guestId?"g:"+p.guestId:"u:"+String(p?.username||"").toLowerCase(), ni=(s,n)=>(s.turnIndex+1)%n;
function base(game,p){return{version:4,game,phase:"playing",round:1,turnIndex:0,scores:p.map(()=>0),winner:null,lastResult:null}}
function uno(p){let d=[];for(const c of C){d.push({id:"uno-"+c+"-0",color:c,value:"0"});for(const v of["1","2","3","4","5","6","7","8","9","Skip","Reverse","+2"])d.push({id:"uno-"+c+"-"+v+"-a",color:c,value:v},{id:"uno-"+c+"-"+v+"-b",color:c,value:v})}for(let i=0;i<4;i++)d.push({id:"uno-wild-"+i,color:"wild",value:"Wild"},{id:"uno-wild4-"+i,color:"wild",value:"+4"});d=sh(d);let h=p.map(()=>[]);for(let n=0;n<7;n++)for(let i=0;i<p.length;i++)h[i].push(d.pop());let top=d.pop();return Object.assign(base("UNO",p),{hands:h,drawPile:d,discardPile:[top],top,color:top.color,direction:1,pending:0})}
function ludo(p){let s=base("LUDO",p);return Object.assign(s,{tokens:p.map(()=>[-1,-1,-1,-1]),dice:null,awaitingMove:false,legalTokens:[],sixStreak:0})}
function jackaroo(p){
  const suits=["♠","♥","♦","♣"], ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck=sh(suits.flatMap(su=>ranks.map(r=>({id:"jackaroo-"+su+"-"+r,suit:su,rank:r}))));
  const hands=p.map(()=>deck.splice(0,4));
  return Object.assign(base("JAKAROO",p),{
    kind:"jackaroo",phase:"playing",turnIndex:0,hands,deck,discard:null,
    tokens:p.map(()=>[-1,-1,-1,-1]),pendingCard:null,pendingToken:null,
    lastAction:null,selectedToken:null,moveOptions:[]
  });
}
function jackSteps(card){
  const r=String(card?.rank||"");
  if(r==="A")return 1;if(r==="K")return 13;if(r==="J")return 11;if(r==="Q")return 12;
  if(r==="4")return -4;if(r==="7")return 7;if(r==="10")return 10;
  return Number(r)||0;
}
function jackStart(i){return i*13}
function jackGlobal(i,pos){return pos<0?-1:(jackStart(i)+pos)%52}
function jackLegalTokens(s,i,card){
  const step=jackSteps(card),out=[];
  for(let n=0;n<4;n++){
    const v=s.tokens[i][n];
    if(v<0 && (card.rank==="A"||card.rank==="K"))out.push(n);
    else if(v>=0 && v<56 && ((step>=0&&v+step<=56)||(step<0&&v+step>=0)))out.push(n);
  }
  return out;
}
function jackCardMoves(s,i,card){
  const r=String(card?.rank||"");
  if(r==="J") return [0,1,2,3].filter(t=>s.tokens[i][t]>=0);
  if(r==="7") return [0,1,2,3].filter(t=>s.tokens[i][t]>=0);
  const step=jackSteps(card);
  return jackLegalTokens(s,i,card).filter(t=>step!==0);
}
function jackMoveToken(s,i,t,steps){
  const v=s.tokens[i][t];
  if(v<0){ if(steps!==1&&steps!==13) throw new Error("هذه الورقة لا تُخرج القطعة من البيت"); s.tokens[i][t]=0; return; }
  let next=v+steps;
  if(next<0||next>56) throw new Error("الحركة تتجاوز مسار القطعة");
  s.tokens[i][t]=next;
}
function jackFinish(s,p){
  const done=s.tokens.map(ts=>ts.filter(v=>v>=56).length);
  const winner=done.findIndex(n=>n===4);
  if(winner>=0){s.winner=p[winner]?.username||("لاعب "+(winner+1));s.phase="finished";return true}
  return false;
}
function baloot(p){
 let d=sh(S.flatMap(s=>R.map(r=>({id:"baloot-"+s+"-"+r,suit:s,rank:r})))),h=[[],[],[],[]];
 for(let n=0;n<5;n++)for(let i=0;i<4;i++)h[i].push(d.pop());
 let s=base("BALOOT",p);
 return Object.assign(s,{phase:"bidding",round:1,turnIndex:1,bidRound:1,bids:[],contract:null,trump:null,buyer:null,dealerIndex:0,hands:h,deck:d,turnCard:d.pop(),turnCardTaken:false,trick:[],tricks:[],teamScores:[0,0],matchScores:[0,0],roundPoints:[0,0]})
}
function spy(p){let x=SPY[Math.floor(Math.random()*SPY.length)],roles=p.map((_,i)=>({role:x[1][i%x[1].length],spy:false}));roles[Math.floor(Math.random()*p.length)].spy=true;let s=base("SPYFALL",p);return Object.assign(s,{location:x[0],roles,deadline:Date.now()+480000,questioner:0,lastQuestion:null})}
function code(p){let s=base("CODENAMES",p),rs=sh([..."rrrrrrrrrbbbbbbbbnnnnnnna"]),ws=sh(WORDS).slice(0,25);const roles={};p.forEach((x,i)=>{const seat=String(x.seatLabel||"");roles[k(x)]=seat==="قائد الأحمر"?"red_spymaster":seat==="قائد الأزرق"?"blue_spymaster":seat.includes("أحمر")?"red_agent":seat.includes("أزرق")?"blue_agent":i===0?"red_spymaster":"blue_agent"});return Object.assign(s,{words:ws.map((word,i)=>({word,role:{r:"red",b:"blue",n:"neutral",a:"assassin"}[rs[i]],revealed:false})),team:"red",clue:null,guesses:0,teamScores:{red:0,blue:0},playerRoles:roles})}
function create(game,p){if(game==="UNO")return uno(p);if(game==="LUDO")return ludo(p);if(game==="BALOOT")return baloot(p);if(game==="JAKAROO")return jackaroo(p);if(game==="SPYFALL")return spy(p);if(game==="CODENAMES")return code(p);let s=base(game,p);s.kind="text";s.choices=[];s.prompt="ابدأ الجولة";if(game==="TRIVIA"){let q=TRIVIA[Math.floor(Math.random()*TRIVIA.length)];Object.assign(s,{kind:"choice",prompt:q[0],choices:q[1],answer:q[2]})}else if(game==="EMOJI_GUESS"){let q=EMO[Math.floor(Math.random()*EMO.length)];Object.assign(s,{kind:"choice",prompt:q[0],choices:sh(EMO.map(x=>x[1])),answer:q[1]})}else if(game==="TABOO"){let q=TAB[Math.floor(Math.random()*TAB.length)];Object.assign(s,{prompt:"اشرح الكلمة دون الكلمات الممنوعة",secret:q[0],taboo:q[1],kind:"taboo"})}else if(game==="RIDDLE_RUSH"){let q=RIDDLE[Math.floor(Math.random()*RIDDLE.length)];Object.assign(s,{prompt:q[0],answer:q[1]})}else if(game==="FASTEST")Object.assign(s,{prompt:"ما ناتج 7 × 8؟",answer:"56"});else if(game==="WORD_BOMB")Object.assign(s,{letter:LET[Math.floor(Math.random()*LET.length)],prompt:"اكتب كلمة تبدأ بالحرف"});else if(game==="CATEGORIES")Object.assign(s,{category:CAT[Math.floor(Math.random()*CAT.length)],letter:LET[Math.floor(Math.random()*LET.length)],prompt:"اكتب إجابة من التصنيف بالحرف"});else if(game==="SECRET_WORD"||game==="WHOAMI")Object.assign(s,{secret:WORDS[Math.floor(Math.random()*WORDS.length)],prompt:"خمن الكلمة السرية"});else if(game==="PICTIONARY"||game==="DRAW_GUESS")Object.assign(s,{secret:WORDS[Math.floor(Math.random()*WORDS.length)],role:"drawer",prompt:"الرسام يرى الكلمة، والباقون يخمنون"});else if(game==="CHARADES"||game==="MIMIC")Object.assign(s,{secret:WORDS[Math.floor(Math.random()*WORDS.length)],role:"actor",prompt:"مثّل الكلمة بلا كلام"});else if(game==="DAQSH")Object.assign(s,{kind:"reaction",prompt:"انتظر الإشارة ثم اضغط فورًا",readyAt:Date.now()+2000+Math.random()*3000,signal:false});else if(game==="QAWSAR"){
 const deck=sh([
  ...S.flatMap(s=>R.map(r=>({id:"qawsar-"+s+"-"+r,suit:s,rank:r}))),
  {id:"qawsar-joker",suit:"joker",rank:"JOKER"}
 ]);
 const hands=p.map(()=>deck.splice(0,4));
 const revealed=p.map(()=>[true,true,false,false]);
 const discarded=deck.pop();
 Object.assign(s,{
   kind:"qawsar",prompt:"اسحب ورقة ثم بدّل أو وطّها بالنص",
   deck,hands,revealed,discarded,
   qawsarTurn:0,qawsarPhase:"draw",
   qawsarScores:p.map(()=>0),qawsarZeros:p.map(()=>0),qawsarOut:p.map(()=>false),
   qawsarCalledBy:null,qawsarRound:1,lastAction:null
 });
}else if(game==="WOULD_YOU_RATHER"||game==="HOT_SEAT")Object.assign(s,{kind:"choice",prompt:"اختر",choices:["الخيار الأول","الخيار الثاني","الخيار الثالث"]});else if(game==="GUESS_PLAYER")Object.assign(s,{kind:"choice",prompt:"اختر اللاعب الغامض",choices:p.map(x=>x.username),target:Math.floor(Math.random()*p.length)});else if(game==="LIAR"||game==="TRUTH_LIE")Object.assign(s,{kind:"claim",prompt:"صاحب الدور يكتب ادعاء ثم يصوت الباقون",claimant:0,votes:0});return s}
function priv(s,p,a){let i=p.findIndex(x=>k(x)===k(a)),o={};if(s.game==="SPYFALL"){let r=s.roles?.[i];if(r){o.spy=!!r.spy;o.location=r.spy?null:s.location;o.role=r.role}}if(s.game==="CODENAMES")o.role=s.playerRoles[k(a)];if(["UNO","LUDO","BALOOT","QAWSAR","JAKAROO"].includes(s.game)){if(s.game==="UNO")o.hand=s.hands[i]||[];if(s.game==="LUDO")o.tokens=s.tokens[i]||[-1,-1,-1,-1];if(s.game==="BALOOT")o.hand=s.hands[i]||[];if(s.game==="JAKAROO"){o.hand=s.hands[i]||[];o.tokens=s.tokens[i]||[-1,-1,-1,-1];o.pendingCard=s.pendingCard;o.moveOptions=s.moveOptions||[];o.playersTokens=s.tokens;}
 if(s.game==="QAWSAR"){
   o.hand=(s.hands[i]||[]).map((card,n)=>({card,revealed:!!s.revealed?.[i]?.[n]}));
   o.discarded=s.discarded||null;o.drawn=s.drawn||null;o.qawsarTurn=s.qawsarTurn;o.qawsarPhase=s.qawsarPhase;
   o.scores=s.qawsarScores;o.zeros=s.qawsarZeros;o.out=s.qawsarOut;
 }
 }if(s.secret&&(s.turnIndex===i||["WHOAMI","SECRET_WORD"].includes(s.game)))o.secret=s.secret;if(s.taboo)o.taboo=s.taboo;return o}
function sanitizeAction(game,act,x,s,p,i){
 const allowed={
 CODENAMES:["clue","guess","endTurn"],SPYFALL:["question","answer","spyGuess","accuse"],
 PICTIONARY:["submit","guess"],CHARADES:["submit","guess"],WHOAMI:["submit","guess"],TABOO:["submit","guess"],
 WORD_BOMB:["submit"],TRUTH_LIE:["claim","vote"],EMOJI_GUESS:["choose"],TRIVIA:["choose"],CATEGORIES:["submit"],
 LIAR:["claim","vote"],HOT_SEAT:["choose"],WOULD_YOU_RATHER:["choose"],DRAW_GUESS:["submit","guess"],
 FASTEST:["submit"],RIDDLE_RUSH:["submit"],SECRET_WORD:["submit","guess"],MIMIC:["submit","guess"],
 GUESS_PLAYER:["choose"],UNO:["draw","playCard","uno","challenge"],JAKAROO:["playCard","moveToken","swap"],LUDO:["roll","moveToken"],
 BALOOT:["bid","playCard","declare"],DAQSH:["submit"],QAWSAR:["draw","takeDiscard","playCard","reveal","burn8","specialSwap","callQawsar"]
 };
 if(!allowed[game]?.includes(act))throw Error("حركة غير مسموحة لهذه اللعبة");
 if(!Number.isInteger(i)||!p[i])throw Error("لاعب غير صالح");
 if(s.phase==="finished")throw Error("الجلسة منتهية");
 return {act,x:x&&typeof x==="object"?x:{}};
}
function pub(s,p,a){let o={...s};for(const x of["answer","secret","location","roles","playerRoles","target","hands","drawPile","deck","taboo","__players"])delete o[x];o.private=priv(s,p,a);if(s.game==="CODENAMES"){let r=s.playerRoles[k(a)];o.words=s.words.map(c=>{let x={word:c.word,revealed:c.revealed};if(c.revealed||r?.includes("spymaster"))x.role=c.role;return x});o.playerRole=r||"spectator"}if(["UNO","BALOOT","JAKAROO","QAWSAR"].includes(s.game)){o.handCount=(s.hands||[]).map(x=>x.length)}if(s.game==="UNO"){let i=p.findIndex(x=>k(x)===k(a));o.hand=s.hands[i]||[];o.handCount=s.hands.map(x=>x.length);o.drawCount=s.drawPile.length;o.discardCount=s.discardPile.length}if(s.game==="LUDO"){let i=p.findIndex(x=>k(x)===k(a));o.tokens=s.tokens[i]||[-1,-1,-1,-1];o.legalTokens=s.legalTokens||[]}if(s.game==="JAKAROO"){let i=p.findIndex(x=>k(x)===k(a));o.hand=s.hands[i]||[];o.tokens=s.tokens[i]||[-1,-1,-1,-1];o.discard=s.discard||null;o.deckCount=s.deck?.length||0;}if(s.game==="BALOOT"){let i=p.findIndex(x=>k(x)===k(a));o.hand=s.hands[i]||[];o.legalIndices=balootLegal(s,i);o.deckCount=s.deck?.length||0;o.turnCard=s.turnCard||null}if(s.game==="QAWSAR"){o.qawsar=s.private;o.qawsarTurn=s.qawsarTurn;o.qawsarPhase=s.qawsarPhase;o.lastAction=s.lastAction;o.deckCount=s.deck?.length||0}return o}
function balootRank(c,t){let o=t&&c.suit===t?["7","8","Q","K","10","A","9","J"]:["7","8","9","J","Q","K","10","A"];return o.indexOf(c.rank)+(t&&c.suit===t?100:0)}
function balootLegal(s,i){let h=s.hands[i]||[];if(!s.trick.length)return h.map((_,n)=>n);let led=s.trick[0].card.suit,a=h.map((c,n)=>c.suit===led?n:-1).filter(n=>n>=0);if(a.length)return a;return h.map((_,n)=>n)}
function balootCardPoints(c,trump){
 const trumped=trump&&c.suit===trump;
 if(trumped){return {J:20,9:14,A:11,10:10,K:4,Q:3}[c.rank]||0}
 return {A:11,10:10,K:4,Q:3,J:2}[c.rank]||0
}
function balootWinnerIndex(s){
 let best=s.trick[0],led=best.card.suit;
 for(const q of s.trick.slice(1)){
   const qb=q.card.suit===s.trump, bb=best.card.suit===s.trump;
   const qled=q.card.suit===led, bled=best.card.suit===led;
   const qr=balootRank(q.card,s.trump), br=balootRank(best.card,s.trump);
   if((qb&&!bb)||(!bb&&!qb&&qled&&!bled)||(!bb&&!qb&&qled&&bled&&qr>br))best=q;
 }
 return best.player
}
function finishBalootRound(s,p){
 const total=[s.roundPoints[0],s.roundPoints[1]];
 const buyerTeam=s.buyer%2,other=1-buyerTeam;
 const buyerMade=total[buyerTeam]>total[other];
 const awarded=buyerMade?total:[total[0]+total[1],total[0]+total[1]];
 s.matchScores[0]+=awarded[0];s.matchScores[1]+=awarded[1];
 s.teamScores=[s.matchScores[0],s.matchScores[1]];
 s.lastResult={message:"الفريق "+(buyerMade?"المشتري":"المدافع")+" كسب الصكة",roundPoints:total,matchScores:s.matchScores.slice()};
 if(Math.max(...s.matchScores)>=152){s.winner=s.matchScores[0]>=152?"الفريق A":"الفريق B";s.phase="finished";return s}
 let d=sh(S.flatMap(x=>R.map(r=>({suit:x,rank:r})))),h=[[],[],[],[]];
 for(let n=0;n<5;n++)for(let i=0;i<4;i++)h[i].push(d.pop());
 s.round++;s.phase="bidding";s.bidRound=1;s.bids=[];s.contract=null;s.trump=null;s.buyer=null;s.hands=h;s.deck=d;s.turnCard=d.pop();s.turnCardTaken=false;s.trick=[];s.tricks=[];s.roundPoints=[0,0];s.turnIndex=(s.dealerIndex+1)%4;s.dealerIndex=(s.dealerIndex+1)%4;
 return s
}
function apply(game,s,p,a,act,x={}){let i=p.findIndex(q=>k(q)===k(a));if(i<0)throw Error("لست داخل الجلسة"); sanitizeAction(game,act,x,s,p,i);
if(act==="answer" && ["WORD_BOMB","CATEGORIES","FASTEST","RIDDLE_RUSH","TABOO","PICTIONARY","DRAW_GUESS","CHARADES","MIMIC","SECRET_WORD","WHOAMI","DAQSH"].includes(game))act="submit";
if(game==="CODENAMES"){let r=s.playerRoles[k(a)],team=r?.startsWith("red")?"red":"blue";if(act==="clue"){if(!r?.endsWith("spymaster")||team!==s.team)throw Error("ليس دورك");s.clue={word:String(x.word||"").trim().split(/\s+/)[0],number:Math.max(1,Math.min(9,Number(x.number)||1))};s.guesses=s.clue.number;return s}if(act==="guess"){if(!r?.endsWith("agent")||team!==s.team||!s.clue)throw Error("لا يمكنك التخمين");let c=s.words[Number(x.index)];if(!c||c.revealed)throw Error("كلمة غير صالحة");c.revealed=true;if(c.role==="assassin"){s.winner=team==="red"?"blue":"red";s.phase="finished"}else if(c.role===team){s.teamScores[team]++;if(!s.words.some(q=>q.role===team&&!q.revealed)){s.winner=team;s.phase="finished"}else if(--s.guesses<=0){s.team=team==="red"?"blue":"red";s.clue=null}}else{s.team=team==="red"?"blue":"red";s.clue=null}return s}if(act==="endTurn"){s.team=team==="red"?"blue":"red";s.clue=null;return s}}
if(game==="SPYFALL"){if(act==="question"){if(s.turnIndex!==i)throw Error("ليس دورك");let t=Number(x.target);if(t===i||!p[t])throw Error("هدف غير صالح");s.lastQuestion={from:i,to:t,text:String(x.text||"").slice(0,200)};s.turnIndex=t;return s}if(act==="answer"){if(s.turnIndex!==i)throw Error("ليس دورك");s.lastAnswer=String(x.text||"").slice(0,250);return s}if(act==="accuse"){let t=Number(x.target);s.winner=s.roles[t]?.spy?"المحققون":"الجاسوس";s.phase="finished";return s}if(act==="spyGuess"){if(!s.roles[i].spy)throw Error("أنت لست الجاسوس");s.winner=String(x.location||"")===s.location?"الجاسوس":"المحققون";s.phase="finished";return s}}
if(game==="UNO"){if(s.turnIndex!==i)throw Error("ليس دورك");let h=s.hands[i];if(act==="draw"){let c=s.drawPile.pop();if(c)h.push(c);return s}if(act==="playCard"){let n=Number(x.index),c=h[n];if(!c||!(c.color==="wild"||c.color===s.color||c.value===s.top.value))throw Error("ورقة غير قانونية");h.splice(n,1);s.discardPile.push(c);s.top=c;s.color=c.color==="wild"?(C.includes(x.color)?x.color:null):c.color;if(!s.color)throw Error("اختر لونًا");if(!h.length){s.winner=p[i].username;s.phase="finished";return s}if(c.value==="Reverse")s.direction*=-1;s.turnIndex=(i+(["Skip","+2","+4"].includes(c.value)?2:1)*s.direction+p.length)%p.length;return s}}
if(game==="JAKAROO"){
  if(s.turnIndex!==i)throw new Error("ليس دورك الآن");
  const hand=s.hands[i]||[];
  if(act==="playCard"){
    const n=Number(x.index),card=hand[n];
    if(!card)throw new Error("الورقة غير موجودة");
    const legal=jackCardMoves(s,i,card);
    if(!legal.length)throw new Error("لا توجد حركة قانونية بهذه الورقة");
    s.pendingCard=n;s.pendingToken=null;s.moveOptions=legal;
    if(legal.length===1){s.pendingToken=legal[0];}
    return s;
  }
  if(act==="moveToken"){
    const t=Number(x.token);
    if(s.pendingCard==null)throw new Error("اختر ورقة أولًا");
    if(!s.moveOptions.includes(t))throw new Error("هذه القطعة لا يمكن تحريكها بهذه الورقة");
    const card=hand[s.pendingCard],r=String(card.rank||"");
    if(r==="J"){
      const targetPlayer=Number(x.targetPlayer),targetToken=Number(x.targetToken);
      if(!Number.isInteger(targetPlayer)||targetPlayer===i||!s.tokens[targetPlayer]||!Number.isInteger(targetToken))throw new Error("هدف التبديل غير صالح");
      if(!s.tokens[targetPlayer]||s.tokens[targetPlayer][targetToken]<0)throw new Error("قطعة الخصم غير موجودة على المسار");
      [s.tokens[i][t],s.tokens[targetPlayer][targetToken]]=[s.tokens[targetPlayer][targetToken],s.tokens[i][t]];
    }else if(r==="7"&&Number.isInteger(x.splitSteps)){
      const a=Math.max(1,Math.min(6,Number(x.splitSteps))),b=7-a;
      if(a+b!==7)throw new Error("تقسيم السبعة غير صحيح");
      jackMoveToken(s,i,t,a);
      const t2=Number(x.token2);
      if(!Number.isInteger(t2)||t2===t||s.tokens[i][t2]<0)throw new Error("اختر القطعة الثانية");
      jackMoveToken(s,i,t2,b);
    }else{
      jackMoveToken(s,i,t,jackSteps(card));
    }
    hand.splice(s.pendingCard,1);
    s.discard=card;s.pendingCard=null;s.pendingToken=null;s.moveOptions=[];
    jackFinish(s,p);
    if(s.phase!=="finished")s.turnIndex=ni(s,p.length);
    return s;
  }
  if(act==="swap"){
    if(s.pendingCard==null)throw new Error("اختر ورقة أولًا");
    const card=hand[s.pendingCard];
    const targetPlayer=Number(x.targetPlayer),targetToken=Number(x.targetToken);
    if(card.rank!=="J"||targetPlayer===i||!s.tokens[targetPlayer]||!Number.isInteger(targetToken)||s.tokens[targetPlayer][targetToken]<0)throw new Error("تبديل غير صالح");
    [s.tokens[i][Number(x.token)],s.tokens[targetPlayer][targetToken]]=[s.tokens[targetPlayer][targetToken],s.tokens[i][Number(x.token)]];
    hand.splice(s.pendingCard,1);s.discard=card;s.pendingCard=null;s.moveOptions=[];s.turnIndex=ni(s,p.length);return s;
  }
}
if(game==="LUDO"){if(s.turnIndex!==i)throw Error("ليس دورك");if(act==="roll"){if(s.awaitingMove)throw Error("اختر قطعة");s.dice=1+Math.floor(Math.random()*6);s.awaitingMove=true;s.legalTokens=[];s.tokens[i].forEach((v,n)=>{if(v===-1&&s.dice===6)s.legalTokens.push(n);else if(v>=0&&v<57&&v+s.dice<=57)s.legalTokens.push(n)});if(!s.legalTokens.length){s.awaitingMove=false;if(s.dice!==6)s.turnIndex=ni(s,p.length)}return s}if(act==="moveToken"){if(!s.awaitingMove||!s.legalTokens.includes(Number(x.token)))throw Error("قطعة غير قانونية");let t=Number(x.token),v=s.tokens[i][t];s.tokens[i][t]=v===-1?0:v+s.dice;s.awaitingMove=false;if(s.tokens[i].every(v=>v>=57)){s.winner=p[i].username;s.phase="finished";return s}if(s.dice!==6)s.turnIndex=ni(s,p.length);return s}}
if(game==="BALOOT"){
 if(s.turnIndex!==i)throw Error("ليس دورك");
 if(s.phase==="bidding"&&act==="bid"){
   const b=String(x.bid||"");
   if(b==="pass")s.bids.push({i,b});
   else if(b==="sun"){s.contract="sun";s.buyer=i}
   else if(b==="hokum"){const tr=S.includes(x.suit)?x.suit:s.turnCard?.suit;if(!tr)throw Error("حكم غير صالح");s.contract="hokum";s.trump=tr;s.buyer=i}
   else throw Error("طلب غير صالح");
   if(s.contract){
     if(s.turnCard&&!s.turnCardTaken){s.hands[i].push(s.turnCard);s.turnCardTaken=true}
     while(s.hands[i].length<8)s.hands[i].push(s.deck.pop());
     for(let z=0;z<4;z++)while(s.hands[z].length<8)s.hands[z].push(s.deck.pop());
     s.phase="playing";s.turnIndex=(s.dealerIndex+1)%4;
   }else{
     s.turnIndex=ni(s,4);
     if(s.bids.length>=4){
       if(s.bidRound===1){s.bidRound=2;s.bids=[];s.deck.push(s.turnCard);s.turnCard=undefined;s.turnCardTaken=false;s.turnIndex=(s.dealerIndex+1)%4}
       else return finishBalootRound(Object.assign(s,{buyer:s.dealerIndex}),p)
     }
   }
   return s
 }
 if(s.phase==="playing"&&act==="playCard"){
   const n=Number(x.index);if(!balootLegal(s,i).includes(n))throw Error("ورقة غير قانونية");
   const played=s.hands[i].splice(n,1)[0];s.trick.push({player:i,card:played});
   if(s.trick.length<4){s.turnIndex=ni(s,4);return s}
   const win=balootWinnerIndex(s),points=s.trick.reduce((sum,q)=>sum+balootCardPoints(q.card,s.trump),0);
   s.roundPoints[win%2]+=points;s.tricks.push({winner:win,cards:s.trick.slice(),points});s.trick=[];s.turnIndex=win;
   if(s.tricks.length>=8){s.roundPoints[win%2]+=10;return finishBalootRound(s,p)}
   return s
 }
}
if(game==="TRIVIA"||game==="EMOJI_GUESS"||game==="HOT_SEAT"||game==="WOULD_YOU_RATHER"||game==="GUESS_PLAYER"){let c=Number(x.choice),ok=game==="TRIVIA"?c===s.answer:game==="EMOJI_GUESS"?s.choices[c]===s.answer:game==="GUESS_PLAYER"?c===s.target:true;if(ok)s.scores[i]++;s.lastResult={correct:ok};s.turnIndex=ni(s,p.length);return s}
if(game==="TABOO"){let t=String(x.text||"").trim(),lo=t.toLocaleLowerCase("ar"),bad=s.taboo.some(w=>lo.includes(w))||lo.includes(s.secret);if(!t)throw Error("اكتب التلميح");if(bad)s.scores[i]=Math.max(0,s.scores[i]-1);else if(t.includes(s.secret))s.scores[i]++;s.turnIndex=bad?s.turnIndex:ni(s,p.length);s.lastResult={correct:!bad&&t.includes(s.secret),bad};return s}
if(game==="WORD_BOMB"){let t=String(x.text||"").trim();if(!t.startsWith(s.letter))throw Error("ابدأ بالحرف المطلوب");s.scores[i]++;s.turnIndex=ni(s,p.length);s.letter=LET[Math.floor(Math.random()*LET.length)];return s}
if(game==="CATEGORIES"){let t=String(x.text||"").trim();if(!t)throw Error("اكتب إجابة");if(t.startsWith(s.letter))s.scores[i]++;s.turnIndex=ni(s,p.length);return s}
if(game==="FASTEST"||game==="RIDDLE_RUSH"){let ok=String(x.text||"").trim().toLocaleLowerCase("ar")===String(s.answer).toLocaleLowerCase("ar");if(ok){s.scores[i]++;s.turnIndex=ni(s,p.length)}s.lastResult={correct:ok};return s}
if(["PICTIONARY","DRAW_GUESS","CHARADES","MIMIC","SECRET_WORD","WHOAMI"].includes(game)){let t=String(x.text||"").trim(),ok=t&&s.secret&&t.toLocaleLowerCase("ar").includes(s.secret.toLocaleLowerCase("ar"));if(ok)s.scores[i]++;s.lastResult={correct:!!ok};s.turnIndex=ni(s,p.length);return s}
if(game==="DAQSH"){if(!s.signal)throw Error("لم تظهر الإشارة");s.scores[i]++;s.signal=false;s.readyAt=Date.now()+1800+Math.random()*2800;s.turnIndex=ni(s,p.length);return s}
if(game==="QAWSAR"){
 if(s.qawsarOut[i])throw Error("أنت خارج الجولة");
 if(s.qawsarTurn!==i)throw Error("ليس دورك");
 const h=s.hands[i], n=Number(x.index);
 const valueOf=c=>c.rank==="JOKER"?20:(c.rank==="A"?1:c.rank==="K"?0:c.rank==="Q"?12:c.rank==="J"?11:Number(c.rank));
 const reveal=(pi,idx)=>{if(!s.hands[pi]?.[idx])throw Error("ورقة غير صالحة");s.revealed[pi][idx]=true};
 const nextTurn=()=>{
   let next=(i+1)%p.length;while(s.qawsarOut[next]){next=(next+1)%p.length;if(next===i)break}
   if(s.hands[i]?.length===0 || (s.qawsarCalledBy!=null && next===s.qawsarCalledBy)){
     const totals=s.hands.map(hand=>hand.reduce((z,c)=>z+valueOf(c),0));
     const active=totals.map((v,n)=>({v,n})).filter(x=>!s.qawsarOut[x.n]);
     const low=Math.min(...active.map(x=>x.v));
     const roundScores=totals.map((v,n)=>s.qawsarOut[n]?null:(v===low?0:v));
     s.qawsarScores=s.qawsarScores.map((v,n)=>s.qawsarOut[n]?v:v+(roundScores[n]||0));
     s.qawsarScores.forEach((v,n)=>{
       if(s.qawsarOut[n])return;
       if(v>=50){s.qawsarScores[n]=0;s.qawsarZeros[n]++;if(s.qawsarZeros[n]>=3)s.qawsarOut[n]=true;}
     });
     const left=s.qawsarOut.map((v,n)=>!v?n:-1).filter(n=>n>=0);
     s.lastAction={type:"roundEnd",totals,roundScores,lowest:active.filter(x=>x.v===low).map(x=>x.n),calledBy:s.qawsarCalledBy};
     if(left.length<=1){s.winner=left.length? p[left[0]].username : p[active.find(x=>x.v===low)?.n]?.username;s.phase="finished";return;}
     const d=sh([...S.flatMap(su=>R.map(r=>({suit:su,rank:r}))),{suit:"joker",rank:"JOKER"}]);
     s.hands=p.map(()=>d.splice(0,4));s.revealed=p.map(()=>[true,true,false,false]);
     s.deck=d;s.discarded=d.pop();s.drawn=null;s.qawsarCalledBy=null;s.qawsarRound++;s.qawsarTurn=left.includes((s.qawsarTurn+1)%p.length)?(s.qawsarTurn+1)%p.length:left[0];s.qawsarPhase="draw";return;
   }
   let n=(i+1)%p.length;while(s.qawsarOut[n]){n=(n+1)%p.length;if(n===i)break}s.qawsarTurn=n;s.qawsarPhase="draw";
 };
 if(act==="takeDiscard"){
   if(s.qawsarPhase!=="draw"||!s.discarded)throw Error("لا توجد ورقة مطروحة");
   const target=Number(x.index);
   if(!h[target])throw Error("ورقة غير صالحة");
   const old=h[target];h[target]=s.discarded;s.discarded=old;s.lastAction={type:"takeDiscard",player:i};nextTurn();return s;
 }
 if(act==="draw"){
   if(s.qawsarPhase!=="draw")throw Error("لا يمكنك السحب الآن");
   if(!s.deck.length){s.deck=sh(s.hands.flat().filter(Boolean));}
   const card=s.deck.pop();if(!card)throw Error("لا توجد أوراق للسحب");
   s.drawn=card;s.qawsarPhase="choice";s.lastAction={type:"draw",player:i};return s;
 }
 if(act==="playCard"){
   if(s.qawsarPhase!=="choice"||!s.drawn)throw Error("اسحب ورقة أولًا");
   const mode=String(x.mode||"discard");
   if(mode==="swap"){
     if(!h[n])throw Error("ورقة غير صالحة");
     const replaced=h[n];h[n]=s.drawn;s.drawn=null;s.discarded=replaced;nextTurn();return s;
   }
   if(mode==="swapOpponent"){
     const oi=Number(x.player),on=Number(x.opponentIndex);
     if(!s.hands[oi]||oi===i||!s.hands[oi][on])throw Error("خصم غير صالح");
     const mine=h[n];if(!mine)throw Error("ورقة غير صالحة");
     h[n]=s.hands[oi][on];s.hands[oi][on]=mine;s.drawn=null;nextTurn();return s;
   }
   if(mode==="swapAny"){
     if(!h[n])throw Error("ورقة غير صالحة");
     const old=h[n];h[n]=s.drawn;s.drawn=null;s.discarded=old;nextTurn();return s;
   }
   s.discarded=s.drawn;s.drawn=null;nextTurn();return s;
 }
 if(act==="burn8"){
   if(s.qawsarPhase!=="draw"||!h[n]||h[n].rank!=="8"||!s.discarded||s.discarded.rank!=="8")throw Error("الحرق متاح فقط بـ8 على 8");
   h.splice(n,1);s.revealed[i].splice(n,1);s.lastAction={type:"burn8",player:i};nextTurn();return s;
 }
 if(act==="reveal"){
   if(s.qawsarPhase!=="draw")throw Error("الكشف الآن غير متاح");
   if(!h[n])throw Error("ورقة غير صالحة");
   const r=h[n];
   if(r.rank==="8") reveal(i,Number(x.targetIndex));
   else if(r.rank==="9"&&["♠","♣"].includes(r.suit)) reveal(i,Number(x.targetIndex));
   else if(r.rank==="9"&&["♥","♦"].includes(r.suit)) {
     const pi=Number(x.player),idx=Number(x.targetIndex);
     if(!s.hands[pi]||pi===i)throw Error("يمكن للـ9 الأحمر كشف ورقة من الخصم فقط");
     reveal(pi,idx);
   } else throw Error("هذه الورقة لا تسمح بالكشف");
   s.lastAction={type:"reveal",player:i};nextTurn();return s;
 }
 if(act==="specialSwap"){
   if(s.qawsarPhase!=="draw"||h[n]?.rank!=="J"||!["♥","♦"].includes(h[n].suit))throw Error("الولد الأحمر فقط يسمح بالتبديل الشامل");
   const pi=Number(x.player),idx=Number(x.targetIndex);
   if(!s.hands[pi]?.[idx])throw Error("هدف غير صالح");
   [h[n],s.hands[pi][idx]]=[s.hands[pi][idx],h[n]];nextTurn();return s;
 }
 if(act==="callQawsar"){
   if(s.qawsarPhase!=="draw")throw Error("لا يمكن طلب قوصر الآن");
   s.qawsarCalledBy=i;s.lastAction={type:"qawsar",player:i};nextTurn();return s;
 }
 throw Error("حركة قوصر غير مدعومة");
}
if(game==="LIAR"||game==="TRUTH_LIE"){if(act==="claim"){s.claims=(s.claims||[]);s.claims.push({i,text:String(x.text||"").slice(0,180)});s.turnIndex=ni(s,p.length);return s}if(act==="vote"){s.votes=(s.votes||0)+1;if(Number(x.target)===s.claimant)s.scores[i]++;if(s.votes>=p.length-1){s.winner=p[s.claimant]?.username;s.phase="finished"}return s}}
throw Error("الحركة غير مدعومة")}
function bot(game,s,p){
 if(game==="DAQSH"&&!s.signal&&Date.now()>=s.readyAt)s.signal=true;
 if(s.phase==="finished"||!p[s.turnIndex]?.bot)return s;
 const a=p[game==="QAWSAR"?s.qawsarTurn:s.turnIndex];
 if(game==="UNO"){let i=s.turnIndex,h=s.hands[i],n=h.findIndex(c=>c.color==="wild"||c.color===s.color||c.value===s.top.value);if(n<0)return apply(game,s,p,a,"draw",{});return apply(game,s,p,a,"playCard",{index:n,color:C[Math.floor(Math.random()*4)]})}
 if(game==="JAKAROO"){
  const i=s.turnIndex,h=s.hands[i]||[];
  if(s.pendingCard==null){
    for(let n=0;n<h.length;n++){const legal=jackCardMoves(s,i,h[n]);if(legal.length){apply(game,s,p,a,"playCard",{index:n});break}}
  }
  if(s.pendingCard!=null&&s.moveOptions.length){const t=s.moveOptions[0];return apply(game,s,p,a,"moveToken",{token:t})}
  return s
}
 if(game==="LUDO"){apply(game,s,p,a,"roll",{});if(s.awaitingMove&&s.legalTokens.length)apply(game,s,p,a,"moveToken",{token:s.legalTokens[0]});return s}
 if(game==="BALOOT"){
   if(s.phase==="bidding"){const suit=s.turnCard?.suit||S[0],h=s.hands[s.turnIndex]||[],strength=h.filter(c=>c.suit===suit).length+(h.filter(c=>c.suit===suit&&["A","10","K","Q","J"].includes(c.rank)).length*0.5);if(strength>=3)return apply(game,s,p,a,"bid",{bid:"hokum",suit});if(s.bidRound===2&&h.some(c=>["A","10"].includes(c.rank)))return apply(game,s,p,a,"bid",{bid:"sun"});return apply(game,s,p,a,"bid",{bid:"pass"})}
   const legal=balootLegal(s,s.turnIndex);if(!legal.length)return s;let best=legal[0];for(const n of legal)if(balootRank(s.hands[s.turnIndex][n],s.trump)>balootRank(s.hands[s.turnIndex][best],s.trump))best=n;return apply(game,s,p,a,"playCard",{index:best})
 }
 if(game==="CODENAMES"){const role=s.playerRoles[k(a)]||"";if(role.endsWith("spymaster")&&!s.clue)return apply(game,s,p,a,"clue",{word:"مجموعة",number:1});if(role.endsWith("agent")&&s.clue){const n=s.words.findIndex(w=>!w.revealed);if(n>=0)return apply(game,s,p,a,"guess",{index:n});return apply(game,s,p,a,"endTurn")}}
 if(game==="SPYFALL"){if(s.roles?.[s.turnIndex]?.spy)return apply(game,s,p,a,"spyGuess",{location:s.location});return apply(game,s,p,a,"question",{target:(s.turnIndex+1)%p.length,text:"وش المكان؟"})}
 if(game==="TRIVIA")return apply(game,s,p,a,"choose",{choice:s.answer});
 if(game==="EMOJI_GUESS")return apply(game,s,p,a,"choose",{choice:s.choices.indexOf(s.answer)});
 if(["HOT_SEAT","WOULD_YOU_RATHER"].includes(game))return apply(game,s,p,a,"choose",{choice:0});
 if(game==="GUESS_PLAYER")return apply(game,s,p,a,"choose",{choice:s.target});
 if(game==="TABOO")return apply(game,s,p,a,"submit",{text:"شيء معروف"});
 if(game==="WORD_BOMB")return apply(game,s,p,a,"submit",{text:s.letter+"كتاب"});
 if(game==="CATEGORIES")return apply(game,s,p,a,"submit",{text:s.letter+"ا"});
 if(game==="FASTEST"||game==="RIDDLE_RUSH")return apply(game,s,p,a,"submit",{text:s.answer});
 if(["PICTIONARY","DRAW_GUESS","CHARADES","MIMIC","SECRET_WORD","WHOAMI"].includes(game))return apply(game,s,p,a,"submit",{text:s.secret});
 if(game==="DAQSH"){if(s.signal)return apply(game,s,p,a,"submit",{text:"ضغط"});return s}
 if(game==="QAWSAR"){
 if(s.qawsarPhase==="draw")return apply(game,s,p,a,"draw",{});
 const h=s.hands[s.qawsarTurn]||[],d=s.drawn;
 if(d?.rank==="8")return apply(game,s,p,a,"playCard",{index:h.findIndex(x=>x.rank==="8")>=0?h.findIndex(x=>x.rank==="8"):0,mode:"swap"});
 return apply(game,s,p,a,"playCard",{index:0,mode:"swap"});
}
 if(game==="LIAR"||game==="TRUTH_LIE"){if(!s.claims?.length)return apply(game,s,p,a,"claim",{text:"أعتقد أن هذه الجملة صحيحة"});return apply(game,s,p,a,"vote",{target:s.claimant})}
 return s
}
module.exports={create,apply,pub,bot};