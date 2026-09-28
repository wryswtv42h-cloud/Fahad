(() => {
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const N={CODENAMES:"كود نيمز",SPYFALL:"سباي فول",PICTIONARY:"بيكشنري",CHARADES:"تمثيل",WHOAMI:"من أنا؟",TABOO:"تابو",WORD_BOMB:"قنبلة الكلمات",TRUTH_LIE:"صدق أو كذب",EMOJI_GUESS:"تخمين الإيموجي",TRIVIA:"معلومات عامة",CATEGORIES:"التصنيفات",LIAR:"الكذاب",HOT_SEAT:"المقعد الساخن",WOULD_YOU_RATHER:"تفضّل",DRAW_GUESS:"ارسم وخمّن",FASTEST:"الأسرع",RIDDLE_RUSH:"سباق الألغاز",SECRET_WORD:"الكلمة السرية",MIMIC:"المقلد",GUESS_PLAYER:"خمن اللاعب",UNO:"UNO",LUDO:"لودو",BALOOT:"بلوت",DAQSH:"دقش",QAWSAR:"قوصر",JAKAROO:"جاكارو"};
const ICON={CODENAMES:"▦",SPYFALL:"◉",PICTIONARY:"✎",CHARADES:"✦",WHOAMI:"?",TABOO:"⊘",WORD_BOMB:"◈",TRUTH_LIE:"✓",EMOJI_GUESS:"☺",TRIVIA:"?",CATEGORIES:"A",LIAR:"!",HOT_SEAT:"◉",WOULD_YOU_RATHER:"↔",DRAW_GUESS:"✎",FASTEST:"⚡",RIDDLE_RUSH:"?",SECRET_WORD:"◆",MIMIC:"◌",GUESS_PLAYER:"◎",UNO:"UNO",LUDO:"●",BALOOT:"♠",DAQSH:"◆",QAWSAR:"♜",JAKAROO:"♟"};
const CAP=g=>g==="CODENAMES"?16:g==="UNO"?12:g==="QAWSAR"?4:g==="JAKAROO"?4:4;
const RULES={
CODENAMES:"القائد يعطي تلميحًا ورقمًا، والعملاء يكشفون الكلمات التابعة لفريقهم. تجنبوا المحايد والقاتل.",
UNO:"7 أوراق لكل لاعب. طابق اللون أو الرمز، استخدم الأوراق الخاصة، وتخلّص من يدك أولًا.",
LUDO:"ارمِ النرد، أخرج القطعة عند 6، حرّكها بعدد النرد، وأوصل قطعك الأربع للنهاية.",
BALOOT:"شراء ثم لعب 8 أكلات. اتبع اللون إذا أمكن، والحكم يتفوق في عقد الحكم.",
QAWSAR:"أربع أوراق لكل لاعب؛ أول ورقتين مكشوفتان. اسحب أو خذ الوسط، بدّل أو ارمِ، واستخدم قدرات الأوراق.",
JAKAROO:"أربع قطع وأربع أوراق. A/K للإخراج، الحركة حسب الورقة، 7 للتقسيم وJ للتبديل. الهدف إدخال القطع الأربع."
};
const guest=()=>{let x=localStorage.getItem("mld_guest_id");if(!x){x="g_"+(crypto.randomUUID?.()||Math.random().toString(36).slice(2));localStorage.setItem("mld_guest_id",x)}return x};
const body=()=>({guestId:guest(),guestName:"زائر"});
const api=async(u,o={})=>{const r=await fetch(u,o);let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.error||"تعذر تنفيذ العملية");e.status=r.status;throw e}return d};
let activeId=null,timer=null,spectator=false,actionBusy=false,gameFullscreen=false,selectedSeat=null;
const stop=()=>{if(timer){clearInterval(timer);timer=null}};
const list=()=>{stop();activeId=null;gameFullscreen=false;localStorage.removeItem("mld_active_game_id");document.body.classList.remove("mld-game-fullscreen");document.documentElement.classList.remove("mld-game-fullscreen");document.body.style.overflow="";document.body.style.touchAction="";return typeof window.change==="function"?window.change("games"):null};
const tone=(f=520,d=.07,type="sine")=>{try{const C=AudioContext||webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(.025,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d)}catch{}};
const applyFullscreen=()=>{
 const r=$(".game-room"),on=!!gameFullscreen;
 if(r)r.classList.toggle("fallback-fullscreen",on);
 document.body.classList.toggle("mld-game-fullscreen",on);
 document.documentElement.classList.toggle("mld-game-fullscreen",on);
 document.body.style.overflow=on?"hidden":"";
 document.body.style.touchAction=on?"none":"";
 const b=$("#eg-fullscreen"),f=$("#eg-fullscreen-fab");
 [b,f].forEach(x=>{if(x){x.innerHTML=on?"⤢ <span>خروج من تكبير الطاولة</span>":"⛶ <span>تكبير الطاولة</span>";x.setAttribute("aria-label",on?"الخروج من تكبير الطاولة":"تكبير طاولة اللعب")}});
};
const fs=async()=>{
 const room=$(".game-room");
 if(!room)return;
 try{
   if(!gameFullscreen){
     let native=false;
     if(room.requestFullscreen){
       try{await room.requestFullscreen({navigationUI:"hide"});native=!!document.fullscreenElement}catch{}
     }
     // iOS Safari and a few embedded browsers do not expose Element.requestFullscreen.
     // The CSS fallback keeps the table full-screen on those devices.
     gameFullscreen=true;
     applyFullscreen();
     if(native)document.body.classList.add("mld-native-game-fullscreen");
   }else{
     if(document.fullscreenElement){try{await document.exitFullscreen()}catch{}}
     gameFullscreen=false;
     document.body.classList.remove("mld-native-game-fullscreen");
     applyFullscreen();
   }
   tone(gameFullscreen?760:420,.06);
 }catch(e){
   gameFullscreen=!gameFullscreen;
   applyFullscreen();
 } 
};
document.addEventListener("fullscreenchange",()=>{
 const native=!!document.fullscreenElement;
 if(native!==gameFullscreen){gameFullscreen=native;applyFullscreen();}
});
const card=(c,back=false,extra="")=>{if(back)return "<div class='playing-card back'><i>MLD</i><b>✦</b></div>";c=c||{};const suit=esc(c.suit||"");const rank=esc(c.rank??c.value??"");const red=["♥","♦"].includes(c.suit)||c.color==="red";return "<button type='button' class='playing-card "+(red?"red ":"")+" "+extra+"'><span>"+suit+"</span><strong>"+rank+"</strong><small>"+suit+"</small></button>"};
const seatName=(g,i)=>{const maps={CODENAMES:["قائد الأحمر",...Array.from({length:7},(_,n)=>"عميل أحمر "+(n+1)),"قائد الأزرق",...Array.from({length:7},(_,n)=>"عميل أزرق "+(n+1))],BALOOT:["فريق A - 1","فريق A - 2","فريق B - 1","فريق B - 2"],JAKAROO:["فريق A - 1","فريق A - 2","فريق B - 1","فريق B - 2"]};return maps[g]?.[i]||"مقعد "+(i+1)};
const renderSeats=(g,players,current,me,s={})=>{
 const n=players.length||1,cardGame=["UNO","BALOOT","JAKAROO","QAWSAR"].includes(g);
 return players.map((p,i)=>{
  const rel=((i-me)%n+n)%n,angle=(Math.PI/2)+(rel*(Math.PI*2/n));
  const rx=n<=4?43:n<=8?46:48,ry=n<=4?39:n<=8?42:44;
  const left=Math.max(5,Math.min(95,50+Math.cos(angle)*rx)),top=Math.max(7,Math.min(93,50+Math.sin(angle)*ry));
  const count=Number((s.handCount||[])[i]||0);
  const backs=cardGame&&i!==me&&count?Math.min(4,count):0;
  const visible=g==="QAWSAR"&&i!==me?(s.qawsarVisible?.[i]||[]).filter(Boolean):[];
  const mini=visible.length
   ? "<div class='seat-mini-cards face-mini'>"+visible.map(v=>card(v)).join("")+(Math.max(0,count-visible.length)?Array.from({length:Math.max(0,count-visible.length)},()=>"<span class='mini-back'>✦</span>").join(""):"")+"</div>"
   : (backs?"<div class='seat-mini-cards'>"+Array.from({length:backs},()=>"<span class='mini-back'>✦</span>").join("")+"</div>":"");
  return "<div class='player-seat "+(i===current?"turn ":"")+(i===me?"self ":"")+(p.bot?"bot ":"")+"seat-n"+n+"' style='left:"+left+"%;top:"+top+"%;transform:translate(-50%,-50%)'>"+mini+"<div class='seat-avatar'>"+(p.bot?"BOT":esc((p.username||"لاعب").slice(0,2)))+"</div><div><b>"+esc(i===me?"أنت":p.username||"لاعب")+"</b><small>"+esc(p.seatLabel||seatName(g,i))+(i===current?" · الدور الآن":"")+"</small></div></div>";
 }).join("");
};
const tableCards=(s,g,me)=>{
 if(g==="UNO")return "<div class='center-piles'><div><span>السحب</span>"+card(null,true)+"<small>"+(s.drawCount??0)+" ورقة</small></div><div class='active-card'>"+card(s.discardTop||s.top)+"<small>اللون "+esc(s.currentColor||s.color||"—")+"</small></div></div>";
 if(g==="BALOOT")return "<div class='center-piles'><div>"+card(null,true)+"<small>الرزمة</small></div><div class='trick-fan'>"+(s.trick||[]).map(x=>card(x.card)).join("")+"</div></div>";
 if(g==="QAWSAR")return "<div class='center-piles'><div><span>الوسط</span>"+card(s.discarded||s.private?.discarded)+"</div><div class='table-status'>"+(Number(s.qawsarTurn)===me?"دورك الآن":"انتظر دورك")+"<small>"+esc(s.qawsarPhase||"draw")+"</small></div></div>";
 if(g==="LUDO")return "<div class='ludo-center'><div class='big-dice'>"+esc(s.dice??"🎲")+"</div><b>لودو</b><small>"+(s.awaitingMove?"اختر قطعة":"ارمِ النرد")+"</small></div>";
 if(g==="JAKAROO"){const ts=Array.isArray(s.tokens)?s.tokens:[];const colors=["🔴","🔵","🟢","🟡"];return "<div class='jack-board real-jackaroo'><div class='jack-houses'>"+ts.slice(0,4).map((arr,pi)=>"<div class='jack-house house-"+pi+"'>"+Array.from({length:4},(_,ti)=>"<span class='jack-piece "+(Number(arr?.[ti])>=0?"on-track":"home-piece")+"'>"+colors[pi]+"</span>").join("")+"</div>").join("")+"</div><div class='jack-path'>"+Array.from({length:52},(_,i)=>"<i>"+(i+1)+"</i>").join("")+"</div><div class='jack-center'><b>JAKAROO</b><small>طاولة اللعب</small></div></div>";}
 if(g==="CODENAMES")return "<div class='code-board'>"+(s.words||[]).map((w,i)=>"<button class='code-tile "+(w.revealed?"revealed role-"+w.role:"")+"' data-code='"+i+"'>"+esc(w.word)+"</button>").join("")+"</div>";
 return "<div class='generic-center'><div class='game-icon'>"+esc(ICON[g]||"✦")+"</div><b>"+esc(N[g]||g)+"</b><small>"+esc(s.prompt||"الجلسة شغالة")+"</small></div>";
};
const handHtml=(s,g,me,current)=>{
 let h=s.hand||s.private?.hand||[]; if(!h.length)return "";
 const disabled=current!==me;
 return "<section class='my-hand table-own-hand "+(g==='QAWSAR'?'qawsar-own-hand ':g==='JAKAROO'?'jackaroo-hand ':'')+"'><header><b>يدك</b><span>"+h.length+" ورقة</span></header><div class='hand-cards'>"+h.map((x,i)=>{
   const qCard=g==='QAWSAR'?(x?.card||x):x;
   const hidden=g==='QAWSAR' && x?.revealed===false;
   const button=card(qCard,hidden,"hand-card "+(hidden?"is-hidden":"")).replace("<button type='button'","<button type='button' data-card='"+i+"' data-qcard='"+i+"' "+(disabled?"disabled":""));
   return button;
 }).join("")+"</div></section>";
};
function controls(g,s,players,me,current){
 const mine=me===current,p=s.private||{};
 if(s.phase==="finished")return "<div class='result-panel'><div class='winner'>🏆</div><h2>"+esc(s.winner||"انتهت الجولة")+"</h2><p>النتيجة محفوظة لمدة 5 دقائق.</p></div>";
 if(g==="UNO")return "<div class='control-box'><div class='turn-chip'>"+(mine?"🟢 دورك الآن":"⏳ دور "+esc(players[current]?.username||"اللاعب"))+"</div><div class='action-row'><button class='primary' data-action='draw' "+(!mine?"disabled":"")+">سحب ورقة</button><button data-action='uno' "+(!mine?"disabled":"")+">UNO</button></div><p class='hint'>اضغط الورقة من يدك للعبها. عند الورقة البرية سيظهر اختيار اللون.</p></div>";
 if(g==="LUDO")return "<div class='control-box'><div class='turn-chip'>"+(mine?"🟢 دورك":"⏳ انتظر")+"</div><button class='primary huge' data-action='roll' "+(!mine||s.awaitingMove?"disabled":"")+">🎲 رمي النرد</button>"+(s.awaitingMove?"<div class='token-grid'>"+(s.legalTokens||[]).map(i=>"<button data-token='"+i+"'>قطعة "+(i+1)+"</button>").join("")+"</div>":"")+"</div>";
 if(g==="BALOOT"){if(s.phase==="bidding")return "<div class='control-box'><div class='turn-chip'>"+(mine?"🟢 دورك في الشراء":"⏳ انتظار الشراء")+"</div><div class='action-row'><button data-bid='pass'>بس</button><button data-bid='sun'>صن</button>"+["♠","♥","♦","♣"].map(x=>"<button data-bid='hokum' data-suit='"+x+"'>حكم "+x+"</button>").join("")+"</div></div>";return "<div class='control-box'><div class='turn-chip'>"+(mine?"🟢 اختر ورقة":"⏳ انتظر دورك")+"</div><p class='hint'>الأوراق غير القانونية ستُقفل تلقائيًا.</p></div>"}
 if(g==="JAKAROO"){const h=p.hand||[],pending=Number.isInteger(p.pendingCard)?p.pendingCard:-1;return "<div class='control-box'><div class='turn-chip'>"+(mine?"🟢 اختر ورقة ثم قطعة":"⏳ انتظر دورك")+"</div><div class='jack-hand'>"+h.map((x,i)=>card(x,false,"jack-card "+(pending===i?"selected":"")).replace("<button type='button'","<button type='button' data-jack-card='"+i+"' "+(!mine?"disabled":""))).join("")+"</div>"+(pending>=0?"<div class='token-grid'>"+(p.moveOptions||[]).map(i=>"<button data-jack-token='"+i+"'>حرّك قطعة "+(i+1)+"</button>").join("")+"</div>":"")+"</div>"}
 if(g==="QAWSAR"){const h=p.hand||[],selected=Number.isInteger(window.__mldQawsarSelected)?window.__mldQawsarSelected:-1,target=Number.isInteger(window.__mldQawsarTarget)?window.__mldQawsarTarget:-1,targetPlayer=Number.isInteger(window.__mldQawsarTargetPlayer)?window.__mldQawsarTargetPlayer:((me+1)%Math.max(1,players.length)),turn=me===Number(s.qawsarTurn),hidden=h.map((x,i)=>x?.revealed===false?i:-1).filter(i=>i>=0),others=players.map((p,i)=>({p,i})).filter(x=>x.i!==me&&!x.p.bot);return "<div class='control-box'><div class='turn-chip'>"+(turn?"🟢 دورك":"⏳ دور "+esc(players[s.qawsarTurn]?.username||"اللاعب"))+"</div><div class='q-selected'>"+(selected>=0?"الورقة المحددة: "+(selected+1):"حدد ورقة من يدك أولًا")+"</div><div class='q-actions'>"+(turn&&s.qawsarPhase==="draw"?"<button class='primary' data-q='draw'>🂠 سحب من الرزمة</button><button data-q='take'>خذ ورقة الوسط</button><button data-q='reveal' "+(selected<0?"disabled":"")+">كشف</button><button data-q='burn' "+(selected<0?"disabled":"")+">🔥 حرق 8</button><button data-q='special' "+(selected<0?"disabled":"")+">تبديل J</button><button data-q='call'>قوصر</button>":"")+(turn&&s.qawsarPhase==="choice"?"<button class='primary' data-q='swap' "+(selected<0?"disabled":"")+">بدّل الورقة المسحوبة</button><button data-q='discard'>ارمِ المسحوبة بالنص</button>":"")+"</div><div class='q-note'>في قوصر اختر الورقة من يدك؛ الاختيار يُستخدم فعليًا في الكشف والتبديل والحرق.</div></div>"}
 if(g==="CODENAMES"){const role=String(s.playerRole||"");const team=role.startsWith("red")?"red":role.startsWith("blue")?"blue":"";const leader=role.endsWith("spymaster")&&team===s.team;const agent=role.endsWith("agent")&&team===s.team;return "<div class='control-box'><div class='turn-chip'>"+esc(role||"مشاهد")+" · "+esc(s.team||"")+"</div>"+(s.clue?"<div class='clue-card'>التلميح <b>"+esc(s.clue.word)+"</b> · "+s.clue.number+" · المتبقي "+(s.guesses||0)+"</div>":"")+(leader?"<div class='action-row'><input id='clue' placeholder='كلمة التلميح'><input id='clueNo' type='number' min='1' max='9' value='1'><button class='primary' data-action='clue'>إعطاء التلميح</button></div>":"")+(agent?"<button data-action='endTurn'>إنهاء الدور</button>":"")+"</div>"}
 if(["TRIVIA","EMOJI_GUESS","HOT_SEAT","WOULD_YOU_RATHER","GUESS_PLAYER"].includes(g))return "<div class='control-box'><div class='prompt'>"+esc(s.prompt||"اختر")+"</div><div class='choice-grid'>"+(s.choices||[]).map((x,i)=>"<button data-choice='"+i+"'>"+esc(x)+"</button>").join("")+"</div></div>";
 if(g==="DAQSH")return "<div class='control-box'><div class='prompt'>"+(s.signal?"⚡ اضغط الآن!":"انتظر الإشارة...")+"</div><button class='primary huge' data-action='submit' "+(!s.signal?"disabled":"")+">دقش ⚡</button></div>";
 if(["PICTIONARY","DRAW_GUESS","CHARADES","MIMIC","SECRET_WORD","WHOAMI","TABOO","WORD_BOMB","CATEGORIES","FASTEST","RIDDLE_RUSH","LIAR","TRUTH_LIE"].includes(g)){return "<div class='control-box'><div class='prompt'>"+esc(p.secret||s.prompt||"جولتك")+"</div><div class='action-row'><input id='answer' maxlength='240' placeholder='اكتب إجابتك'><button class='primary' data-action='submit'>إرسال</button></div></div>"}
 return "<div class='control-box'><p>"+esc(s.prompt||"الجلسة فعالة.")+"</p></div>";
}
async function openSession(id,watch=false){
 stop();activeId=id;spectator=!!watch;selectedSeat=null;localStorage.setItem("mld_active_game_id",String(id));
 const render=async()=>{
  try{
   const d=await api("/api/games/"+id+"/state?guestId="+encodeURIComponent(guest()));
   const g=d.game,s=d.state||{},players=g.players||[],viewer=d.viewer||null;
   const me=players.findIndex(p=>viewer&&((p.guest&&p.guestId===guest())||p.username===viewer.username&&p.seat===viewer.seat));
   const current=Number.isInteger(s.turnIndex)?s.turnIndex:Number.isInteger(s.turnPlayerIndex)?s.turnPlayerIndex:Number.isInteger(s.qawsarTurn)?s.qawsarTurn:Number.isInteger(s.turnIndex)?s.turnIndex:0;
   const seatButtons=Array.from({length:Number(g.max_players)||players.length||4},(_,i)=>{
     const seat=(g.seats&&g.seats[i])||seatName(g.game,i);
     const occupant=players.find(p=>p.seat===seat);
     const selected=viewer?.seat===seat||selectedSeat===seat||localStorage.getItem("mld_selected_seat_"+id)===seat;
     const mine=occupant&&(occupant.guest&&occupant.guestId===guest()||occupant.username===viewer?.username);
     return "<button type='button' class='game-seat-choice "+(selected?"selected ":"")+(occupant&&!mine?"occupied":"")+"' data-seat='"+esc(seat)+"' "+(occupant&&!mine?"disabled":"")+"><b>"+esc(seat)+"</b><small>"+(occupant?(mine?"أنت":esc(occupant.username||"محجوز")):"مقعد فارغ — اختره")+"</small></button>";
   }).join("");
   const lobbyHtml=g.status!=="playing"
     ?"<div class='lobby'><div class='lobby-badge'>LOBBY</div><h2>جهّز مقعدك</h2><p>اختر مكانك على الطاولة. بعد البداية تظهر الأوراق واللوحة من منظورك.</p><div class='seat-picker'>"+seatButtons+"</div><button id='eg-start' class='primary huge' "+(viewer?.host?"":"disabled")+">▶ ابدأ الجلسة</button></div>"
     :controls(g.game,s,players,me,current);
   const room="<section class='game-room "+(gameFullscreen?"fallback-fullscreen":"")+"'>"+
     "<header class='room-top'><button id='game-back' type='button'>← الألعاب</button><div class='room-name'><span class='live-dot game-live-pill'>LIVE</span><b>"+esc(N[g.game]||g.game)+"</b><small>جلسة #"+id+" · "+players.length+"/"+g.max_players+"</small></div><div class='room-actions'><button id='eg-fullscreen' type='button'>⛶ <span>"+(gameFullscreen?"خروج من التكبير":"تكبير الطاولة")+"</span></button><button id='game-rules' type='button'>القوانين</button><button id='eg-leave' type='button'>"+(spectator?"خروج":"مغادرة")+"</button>"+(viewer?.host&&!spectator?"<button id='eg-finish' type='button'>إنهاء</button>":"")+"</div></header>"+
     "<div class='perspective game-perspective-banner'>"+(spectator?"👁️ وضع المشاهدة":"🎮 منظورك: "+esc(viewer?.seatLabel||"اختر مقعدك"))+"</div>"+
     "<button id='eg-fullscreen-fab' class='game-fullscreen-fab' type='button' aria-label='تكبير طاولة اللعب' style='pointer-events:"+(g.status==="playing"||g.status==="finished"?"auto":"none")+"'>⛶</button>"+
     "<div class='table-shell game-table'><div class='players-ring'>"+renderSeats(g.game,players,current,me,s)+"</div><div class='felt physical-table "+String(g.game).toLowerCase()+"-physical'>"+tableCards(s,g.game,me)+"<div class='table-logo'>MLD COMMUNITY</div>"+handHtml(s,g.game,me,current)+"</div></div>"+
     "<div class='room-controls'><button type='button' class='game-menu-toggle' id='game-menu-toggle' aria-expanded='false'>☰ <span>خيارات الطاولة</span><b>⌄</b></button><div class='game-menu-panel' id='game-menu-panel'>"+lobbyHtml+"</div></div><div class='room-status'>"+esc(s.lastResult?.message||"")+"</div></section>";   if(typeof content!=="undefined"){content.className="feature-grid game-page";content.innerHTML=room;applyFullscreen()}
   $("#game-back").onclick=list;$("#eg-fullscreen").onclick=fs;$("#eg-fullscreen-fab").onclick=fs;$("#game-menu-toggle").onclick=()=>{const b=$("#game-menu-toggle"),p=$("#game-menu-panel"),open=p.classList.toggle("open");b.setAttribute("aria-expanded",String(open));b.classList.toggle("open",open);b.querySelector("b").textContent=open?"⌃":"⌄";if(open)p.scrollIntoView({behavior:"smooth",block:"nearest"})};$("#game-rules").onclick=()=>alert(RULES[g.game]||"القوانين تظهر حسب الدور داخل الجلسة.");
   $("#eg-leave").onclick=async()=>{if(!spectator)await api("/api/games/"+id+"/leave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())});list()};
   $("#game-finish")?.addEventListener("click",async()=>{await api("/api/games/"+id+"/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())});list()});
   document.querySelectorAll("[data-seat]").forEach(b=>b.onclick=async()=>{if(b.disabled)return;const seat=b.dataset.seat;selectedSeat=seat;localStorage.setItem("mld_selected_seat_"+id,seat);b.disabled=true;b.classList.add("selected");b.setAttribute("aria-pressed","true");document.querySelectorAll("[data-seat]").forEach(x=>{if(x!==b){x.classList.remove("selected");x.setAttribute("aria-pressed","false")}});try{const d=await api("/api/games/"+id+"/seat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body(),seat})});if(d?.game?.players){const me=d.game.players.find(p=>(p.guest&&p.guestId===guest())||(!p.guest&&p.username===d.game.host_username&&p.host));if(!me||me.seat!==seat)throw Error("تعذر تثبيت المقعد على الخادم");selectedSeat=seat;localStorage.setItem("mld_selected_seat_"+id,seat);const banner=$(".game-perspective-banner");if(banner)banner.textContent="🎮 منظورك: "+seat;const start=$("#eg-start");if(start){start.disabled=false;start.textContent="▶ ابدأ الجلسة";}document.querySelectorAll("[data-seat]").forEach(x=>{const mine=x.dataset.seat===seat;x.classList.toggle("selected",mine);x.setAttribute("aria-pressed",String(mine));});}}catch(e){selectedSeat=null;localStorage.removeItem("mld_selected_seat_"+id);b.classList.remove("selected");b.setAttribute("aria-pressed","false");const x=$(".room-status");if(x)x.textContent=e.message||"تعذر اختيار المقعد"}finally{b.disabled=false}});
   $("#eg-start")?.addEventListener("click",async()=>{const b=$("#eg-start");b.disabled=true;try{await api("/api/games/"+id+"/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())});await render()}catch(e){const st=$(".room-status");if(st)st.textContent=e.message||"تعذر بدء الجلسة";}finally{b.disabled=false}});
   document.querySelectorAll("[data-card]").forEach(b=>b.onclick=()=>{if(g.game==="QAWSAR"){window.__mldQawsarSelected=Number(b.dataset.card);tone(620,.05);render();return}act("playCard",{index:Number(b.dataset.card)})});
   document.querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>act("choose",{choice:Number(b.dataset.choice)}));
   document.querySelectorAll("[data-token]").forEach(b=>b.onclick=()=>act("moveToken",{token:Number(b.dataset.token)}));
   document.querySelectorAll("[data-code]").forEach(b=>b.onclick=()=>act("guess",{index:Number(b.dataset.code)}));
   document.querySelectorAll("[data-bid]").forEach(b=>b.onclick=()=>act("bid",{bid:b.dataset.bid,suit:b.dataset.suit}));
   document.querySelectorAll("[data-jack-card]").forEach(b=>b.onclick=()=>act("playCard",{index:Number(b.dataset.jackCard)}));
   document.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==="clue")return act("clue",{word:$("#clue")?.value,number:Number($("#clueNo")?.value)||1});if(a==="submit")return act("submit",{text:$("#answer")?.value||"",answer:$("#answer")?.value||""});act(a,{})});
   document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{const q=b.dataset.q,idx=Number.isInteger(window.__mldQawsarSelected)?window.__mldQawsarSelected:0;if(q==="draw")return act("draw",{});if(q==="take")return act("takeDiscard",{index:idx});if(q==="call")return act("callQawsar",{});if(q==="discard")return act("playCard",{index:idx,mode:"discard"});if(q==="swap")return act("playCard",{index:idx,mode:"swap"});if(q==="burn")return act("burn8",{index:idx});if(q==="reveal")return act("reveal",{index:idx,targetIndex:Number($("#q-target")?.value??idx),player:Number($("#q-target-player")?.value??0)});if(q==="special")return act("specialSwap",{index:idx,player:Number($("#q-target-player")?.value??0),targetIndex:Number($("#q-target")?.value??idx)})});
  }catch(e){
   if(e.status===404||e.status===410){gameFullscreen=false;if(typeof content!=="undefined")content.innerHTML="<section class='game-room'><h2>انتهت الجلسة</h2><p>"+esc(e.message)+"</p><button class='primary' id='dead-back'>العودة للألعاب</button></section>";$("#dead-back").onclick=list;stop();return}
  }
 };
 const act=async(action,x={})=>{if(actionBusy)return;actionBusy=true;try{await api("/api/games/"+id+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body(),action,...x})});tone(action==="playCard"?680:520);await render()}catch(e){const x=$(".room-status");if(x)x.textContent=e.message||"تعذر تنفيذ الحركة";tone(180,.1,"square")}finally{actionBusy=false}};
 await render();timer=setInterval(render,1200);
}
async function games(){
 if(typeof searchWrap!=="undefined")searchWrap.style.display="none";
 if(typeof title!=="undefined")title.textContent="غرف الألعاب";
 if(typeof subtitle!=="undefined")subtitle.textContent="أنشئ جلسة حقيقية — تدخل للطاولة، تختار مقعدك، وتلعب من منظور جهازك.";
 const d=await api("/api/games").catch(()=>({games:[]})),gs=d.games||[];
 if(typeof content==="undefined")return;
 content.className="feature-grid game-page";
 content.innerHTML="<section class='game-create'><div class='create-copy'><span>LIVE GAME ROOMS</span><h2>ابنِ طاولتك وابدأ اللعب</h2><p>كل لعبة لها جلسة مستقلة. بعد البداية تتحول الشاشة إلى طاولة لعب فعلية.</p></div><div class='create-form'><label>اللعبة<select id='eg-kind'>"+Object.entries(N).map(([k,v])=>"<option value='"+k+"'>"+esc(v)+"</option>").join("")+"</select></label><label>عدد اللاعبين<input id='eg-max' type='number' min='2' max='16' value='4'></label><button id='eg-create' class='primary huge'>إنشاء طاولة</button></div></section><section class='lobbies'><header><div><span>OPEN TABLES</span><h2>الجلسات المفتوحة</h2></div><button id='refresh-games'>تحديث</button></header><div id='eg-list' class='lobby-grid'>"+(gs.length?gs.map(g=>"<article class='lobby-card'><div class='lobby-icon'>"+esc(ICON[g.game]||"✦")+"</div><div><b>"+esc(N[g.game]||g.game)+"</b><small>جلسة #"+g.id+" · "+(g.players||[]).length+"/"+g.max_players+" · "+esc(g.host_username||"زائر")+"</small></div><div><button class='primary' data-join='"+g.id+"'>انضمام</button><button data-watch='"+g.id+"'>مشاهدة</button></div></article>").join(""):"<div class='empty-games'>لا توجد طاولات مفتوحة الآن.</div>")+"</div></section>";
 const sync=()=>{$("#eg-max").max=String(CAP($("#eg-kind").value));if(Number($("#eg-max").value)>CAP($("#eg-kind").value))$("#eg-max").value=CAP($("#eg-kind").value)};
 $("#eg-kind").onchange=sync;sync();
 $("#eg-create").onclick=async()=>{try{const game=$("#eg-kind").value,maxPlayers=Math.min(CAP(game),Math.max(2,Number($("#eg-max").value)||4));const d=await api("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body(),game,maxPlayers})});openSession(d.game.id,false)}catch(e){alert(e.message)}};
 $("#refresh-games").onclick=games;
 document.querySelectorAll("[data-join]").forEach(b=>b.onclick=async()=>{try{await api("/api/games/"+b.dataset.join+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())});openSession(b.dataset.join,false)}catch(e){alert(e.message)}});
 document.querySelectorAll("[data-watch]").forEach(b=>b.onclick=()=>openSession(b.dataset.watch,true));
}
window.enhancedGames=games;window.renderGames=games;window.openEnhancedGameSession=openSession;
if(typeof window.change==="function"&&!window.__mldGameRoomV2){const oldChange=window.change;window.__mldGameRoomV2=true;window.change=async r=>{if(activeId&&r!=="games"&&!document.body.classList.contains("mld-booting")){const id=activeId,sp=spectator;stop();activeId=null;const out=await oldChange(r);if(!sp)api("/api/games/"+id+"/leave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body())}).catch(()=>{});return out}return oldChange(r)}}
document.addEventListener("fullscreenchange",()=>{document.body.style.overflow=document.fullscreenElement?"hidden":""});
if(typeof renderGames==="function")games();
})();