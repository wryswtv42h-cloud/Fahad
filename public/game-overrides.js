(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const names = {CODENAMES:"Codenames",SPYFALL:"Spyfall",PICTIONARY:"Pictionary",CHARADES:"Charades",WHOAMI:"Who Am I?",TABOO:"Taboo",WORD_BOMB:"Word Bomb",TRUTH_LIE:"Truth or Lie",EMOJI_GUESS:"Emoji Guess",TRIVIA:"Trivia",CATEGORIES:"Categories",LIAR:"Liar",HOT_SEAT:"Hot Seat",WOULD_YOU_RATHER:"Would You Rather",DRAW_GUESS:"Draw & Guess",FASTEST:"Fastest",RIDDLE_RUSH:"Riddle Rush",SECRET_WORD:"Secret Word",MIMIC:"Mimic",GUESS_PLAYER:"Guess Player",UNO:"UNO",LUDO:"Ludo",BALOOT:"Baloot",DAQSH:"Daqsh",QAWSAR:"Qawsar"};
  const seats = {CODENAMES:["قائد الأحمر","عميل الأحمر","قائد الأزرق","عميل الأزرق"],SPYFALL:["المحقق 1","المحقق 2","المحقق 3","الجاسوس"],PICTIONARY:["الرسام","المخمن 1","المخمن 2","المخمن 3"],CHARADES:["الممثل","المخمن 1","المخمن 2","المخمن 3"],WHOAMI:["اللاعب 1","اللاعب 2","اللاعب 3","اللاعب 4"],TABOO:["الشارح","المخمن 1","المخمن 2","المخمن 3"],WORD_BOMB:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],TRUTH_LIE:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],EMOJI_GUESS:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],TRIVIA:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],CATEGORIES:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],LIAR:["المتهم","المحقق 1","المحقق 2","المحقق 3"],HOT_SEAT:["المقعد الساخن","لاعب 2","لاعب 3","لاعب 4"],WOULD_YOU_RATHER:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],DRAW_GUESS:["الرسام","المخمن 1","المخمن 2","المخمن 3"],FASTEST:["متسابق 1","متسابق 2","متسابق 3","متسابق 4"],RIDDLE_RUSH:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],SECRET_WORD:["حامل السر","لاعب 2","لاعب 3","لاعب 4"],MIMIC:["المقلد","المخمن 1","المخمن 2","المخمن 3"],GUESS_PLAYER:["الشخص الغامض","المحقق 1","المحقق 2","المحقق 3"],UNO:["مقعد 1","مقعد 2","مقعد 3","مقعد 4"],LUDO:["مقعد 1","مقعد 2","مقعد 3","مقعد 4"],BALOOT:["فريق A - 1","فريق A - 2","فريق B - 1","فريق B - 2"],DAQSH:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],QAWSAR:["مقعد 1","مقعد 2","مقعد 3","مقعد 4"]};
  const gameRules={
CODENAMES:"فريقان. قائد الفريق يعطي كلمة ورقم، والعملاء يخمنون الكلمات. تجنبوا كلمة القاتل. أول فريق يكشف كلماته يفوز.",
SPYFALL:"كل اللاعبين يعرفون الموقع ما عدا الجاسوس. اسألوا بعضكم، جاوبوا بذكاء، ويمكن اتهام الجاسوس أو تخمين الموقع.",
UNO:"لكل لاعب 7 أوراق. طابق اللون أو الرقم/الرمز، والأوراق الخاصة تغير مجرى اللعب. أول من يتخلص من أوراقه يفوز.",
LUDO:"ارمِ النرد، أخرج القطعة عند 6، تحرك بعدد النرد، وأوصل قطعك للنهاية قبل الآخرين.",
BALOOT:"شراء ثم لعب 8 جولات. يجب اتباع اللون إذا أمكن، والحكم يتفوق في العقد. أعلى نتيجة للفريق تفوز.",
PICTIONARY:"الرسام يرى الكلمة ولا يكتبها أو يقولها، والبقية يخمنون قبل انتهاء الجولة.",
CHARADES:"مثّل الكلمة بدون كلام، والبقية يخمنون.",
TABOO:"اشرح الكلمة دون استخدام الكلمات الممنوعة أو ذكر الكلمة نفسها.",
TRIVIA:"اختر إجابتك من الخيارات. الإجابة الصحيحة تمنح نقطة.",
WORD_BOMB:"اكتب كلمة تبدأ بالحرف المطلوب قبل أن ينتقل الدور.",
CATEGORIES:"أعطِ كلمة من التصنيف تبدأ بالحرف المحدد.",
DAQSH:"انتظر الإشارة واضغط بأسرع ما تستطيع.",
QAWSAR:"اسحب أوراقك والعب حسب الدور؛ الفائز من ينهي يده أولًا."
};const meta = {CODENAMES:["▦","codenames"],SPYFALL:["◉","spyfall"],PICTIONARY:["✎","pictionary"],CHARADES:["✦","charades"],WHOAMI:["?","whoami"],TABOO:["⊘","taboo"],WORD_BOMB:["◈","wordbomb"],TRUTH_LIE:["✓","truthlie"],EMOJI_GUESS:["☺","emoji"],TRIVIA:["?","trivia"],CATEGORIES:["A","categories"],LIAR:["!","liar"],HOT_SEAT:["◉","hotseat"],WOULD_YOU_RATHER:["↔","wyr"],DRAW_GUESS:["✎","draw"],FASTEST:["⚡","fast"],RIDDLE_RUSH:["?","riddle"],SECRET_WORD:["◆","secret"],MIMIC:["◌","mimic"],GUESS_PLAYER:["◎","guess"],UNO:["UNO","uno"],LUDO:["●","ludo"],BALOOT:["♠","baloot"],DAQSH:["◆","daqsh"],QAWSAR:["♜","qawsar"]};
  const seatLabels=(game,max)=>{
    const n=Math.max(2,Number(max)||4);
    if(game==="CODENAMES")return ["قائد الأحمر",...Array.from({length:Math.max(0,Math.ceil((n-2)/2))},(_,i)=>"عميل أحمر "+(i+1)),"قائد الأزرق",...Array.from({length:Math.max(0,Math.floor((n-2)/2))},(_,i)=>"عميل أزرق "+(i+1))].slice(0,n);
    if(game==="UNO")return Array.from({length:n},(_,i)=>"مقعد "+(i+1));
    return (seats[game]||[]).concat(Array.from({length:Math.max(0,n-(seats[game]||[]).length)},(_,i)=>"مقعد "+((seats[game]||[]).length+i+1))).slice(0,n);
  };
  const gameCap=game=>game==="CODENAMES"?16:game==="UNO"?12:4;
  const guestId = localStorage.getItem("mld_guest_id") || ("g_"+crypto.randomUUID());
  localStorage.setItem("mld_guest_id", guestId);
  const payload = () => ({guestId,guestName:"زائر"});
  const api = async (url,opt={}) => { const r=await fetch(url,opt); let d={}; try{d=await r.json()}catch{} if(!r.ok) throw Error(d.error||"تعذر تنفيذ العملية"); return d; };
  let timer=null, activeId=null, spectator=false;
  const clearActive=()=>{localStorage.removeItem("mld_active_game_id");activeId=null};
  const stop=()=>{if(timer){clearInterval(timer);timer=null}};
  const goList=async()=>{stop();clearActive();if(typeof renderGames==="function" && renderGames!==enhancedGames) return renderGames();return window.change("games")};
  const sound=(kind)=>{try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();const f={click:520,card:680,dice:260,win:880,error:180}[kind]||440;o.frequency.value=f;o.type=kind==="dice"?"square":"sine";g.gain.setValueAtTime(.018,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.09);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.09)}catch{}};
  const setImmersive=(on)=>{const root=document.documentElement,body=document.body,room=$(".game-room");root.classList.toggle("mld-game-fullscreen",!!on);body.classList.toggle("mld-game-fullscreen",!!on);if(room)room.classList.toggle("game-focus-mode",!!on);if(on){body.setAttribute("data-mld-game-fullscreen","1");root.setAttribute("data-mld-game-fullscreen","1")}else{body.removeAttribute("data-mld-game-fullscreen");root.removeAttribute("data-mld-game-fullscreen")}};\n  const fullscreen=async()=>{const room=$(".game-room");if(!room)return;try{if(document.fullscreenElement||document.webkitFullscreenElement){if(document.exitFullscreen)await document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen();setImmersive(false);return}setImmersive(true);const fn=room.requestFullscreen||room.webkitRequestFullscreen;if(fn){const result=fn.call(room,{navigationUI:"hide"});if(result&&typeof result.catch==="function")await result.catch(()=>{})} }catch{setImmersive(true)}};
  function card(c,i,disabled){const label=c?.rank?String(c.suit||"")+" "+String(c.rank):String(c?.color||"")+" "+String(c?.value||"ورقة");return "<button type='button' class='game-card-button "+(disabled?"disabled":"")+"' data-game-card='"+i+"' "+(disabled?"disabled":"")+"><span>"+esc(label)+"</span></button>"}
  async function enhancedGames(){
    if(typeof searchWrap!=="undefined")searchWrap.style.display="none";
    if(typeof title!=="undefined")title.textContent="مركز الألعاب";
    if(typeof subtitle!=="undefined")subtitle.textContent="كل جهاز يرى منظور لاعبه فقط — مقعد، جلسة، خروج، تكبير، ولعب مباشر.";
    if(typeof content==="undefined")return;
    content.className="feature-grid";
    const d=await api("/api/games").catch(e=>({games:[],error:e.message}));
    const games=d.games||[];
    content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>إنشاء جلسة</h3><div class='form-stack'><label>اللعبة<select id='eg-kind' class='full'>"+Object.entries(names).map(([k,v])=>"<option value='"+k+"'>"+esc(v)+"</option>").join("")+"</select></label><label>عدد المقاعد<input id='eg-max' class='full' type='number' min='2' max='16' value='4'></label><small id='eg-cap-note' class='muted'>الحد الأقصى يتغير حسب اللعبة.</small><button class='primary wide' id='eg-create'>إنشاء جلسة</button><p id='eg-status' class='muted'></p></div></article><article class='feature-card game-lobby-card'><div class='game-lobby-head'><div><p class='eyebrow'>LIVE LOBBIES</p><h3>الجلسات الحالية</h3></div><button class='ghost' id='eg-refresh'>تحديث</button></div><div id='eg-list' class='log-list'>"+(games.length?games.map(g=>"<div class='group-item game-lobby-row'><span><b>#"+g.id+" · "+esc(names[g.game]||g.game)+"</b><small>"+esc(g.host_username||"ضيف")+" · "+(g.players||[]).length+"/"+g.max_players+" · "+esc(g.status)+"</small></span><div class='game-lobby-actions'><button class='primary' data-eg-join='"+g.id+"'>انضمام</button><button data-eg-watch='"+g.id+"'>مشاهدة</button></div></div>").join(""):"<p class='muted'>لا توجد جلسات مفتوحة حاليًا.</p>")+"</div></article>";
    const syncCap=()=>{const game=$("#eg-kind").value,cap=gameCap(game),input=$("#eg-max");input.max=String(cap);if(Number(input.value)>cap)input.value=String(cap);$("#eg-cap-note").textContent="هذه اللعبة تسمح حتى "+cap+" لاعب."};$("#eg-kind").onchange=syncCap;syncCap();
    $("#eg-create").onclick=async()=>{try{const game=$("#eg-kind").value,maxPlayers=Math.min(gameCap(game),Math.max(2,Number($("#eg-max").value)||4));const x=await api("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game,maxPlayers,...payload()})});sound("click");openSession(x.game.id,false)}catch(e){$("#eg-status").textContent=e.message;sound("error")}};
    $("#eg-refresh").onclick=enhancedGames;
    document.querySelectorAll("[data-eg-join]").forEach(b=>b.onclick=async()=>{try{await api("/api/games/"+b.dataset.egJoin+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});sound("click");openSession(Number(b.dataset.egJoin),false)}catch(e){alert(e.message);sound("error")}});
    document.querySelectorAll("[data-eg-watch]").forEach(b=>b.onclick=()=>openSession(Number(b.dataset.egWatch),true));
  }
  function visualCard(cardData,opts={}){const c=cardData||{};const suit=String(c.suit||"");const rank=String(c.rank??c.value??"");const color=(suit==="♥"||suit==="♦"||c.color==="red")?"red":"";return "<div class='table-card "+color+" "+(opts.back?"card-back":"")+"'><span>"+(opts.back?"✦":esc(suit))+"</span><b>"+(opts.back?"":esc(rank))+"</b><small>"+(opts.back?"":esc(suit))+"</small></div>"}
  function tablePlayers(players,g,s,current,myIndex){const hc=Array.isArray(s.handCount)?s.handCount:players.map(()=>0);return players.map((p,i)=>{const pos=i===0?"bottom":i===1?"left":i===2?"top":i===3?"right":"orbit";const turn=Number.isInteger(current)&&current===i;const count=Number(hc[i]||0);const cards=count>0?"<div class='opponent-cards'>"+Array.from({length:Math.min(count,12)},()=>visualCard(null,{back:true})).join("")+"</div>":"";return "<article class='table-player table-player-"+pos+" "+(turn?"is-turn ":"")+(p.bot?"is-bot":"")+"'><div class='table-avatar'>"+(p.bot?"BOT":esc((p.username||"لاعب").slice(0,2)))+"</div><div class='table-player-name'>"+esc(p.username||"لاعب")+"</div><small>"+esc(p.seatLabel||"مقعد")+(turn?" · دوره الآن":"")+"</small>"+cards+"</article>"}).join("")}
  function gameSurface(g,s,players,myIndex,current){
  const hand=(Array.isArray(s.hand)?s.hand:Array.isArray(s.private?.hand)?s.private.hand:[]);
  const handHtml=hand.length?"<div class='table-own-hand'><div class='table-hand-title'>أوراقك · "+hand.length+"</div><div class='table-hand-cards'>"+hand.map((c,i)=>visualCard(c,{clickable:true,index:i})).join("")+"</div></div>":"";
  if(g.game==="UNO")return "<div class='physical-table uno-physical'><div class='table-center-label'>UNO · "+(Number.isInteger(current)&&current===myIndex?"دورك الآن":"انتظر دورك")+"</div><div class='draw-pile'>"+visualCard(null,{back:true})+"<span>السحب · "+esc(s.drawCount??"0")+"</span></div><div class='uno-discard'>"+visualCard(s.discardTop||{value:"—"})+"</div><div class='turn-orbit'>اللون "+esc(s.currentColor||"—")+"</div>"+handHtml+"</div>";
  if(g.game==="BALOOT")return "<div class='physical-table baloot-physical'><div class='table-center-label'>"+(s.contract?"العقد: "+esc(s.contract):"انتظار الشراء")+"</div><div class='draw-pile'>"+visualCard(null,{back:true})+"<span>الرزمة</span></div><div class='trick-pile'>"+(s.trick||[]).map(z=>visualCard(z.card)).join("")+"</div>"+handHtml+"</div>";
  if(g.game==="LUDO")return "<div class='physical-table ludo-physical'><div class='ludo-dice'>🎲<b>"+esc(s.dice??"—")+"</b><span>"+(Number.isInteger(current)&&current===myIndex?"دورك":"انتظر")+"</span></div><div class='ludo-track'>"+Array.from({length:40},(_,i)=>"<i>"+((i+1)%10===0?"◆":"")+"</i>").join("")+"</div></div>";
  if(g.game==="QAWSAR"){const qh=Array.isArray(s.private?.hand)?s.private.hand:[];return "<div class='physical-table qawsar-physical'><div class='qawsar-middle'><span>الوسط</span>"+visualCard(s.private?.discarded||s.discarded||null,{back:!s.private?.discarded&&!s.discarded})+"</div><div class='qawsar-turn'>"+(Number(s.qawsarTurn)===myIndex?"دورك الآن":"انتظر دورك")+" · "+esc(s.qawsarPhase||"draw")+"</div><div class='qawsar-own-hand table-own-hand'><div class='table-hand-title'>أوراقك · "+qh.length+"</div><div class='table-hand-cards'>"+qh.map((x,i)=>"<button type='button' class='table-card-button qawsar-table-card' data-q-card='"+i+"'>"+visualCard(x)+"</button>").join("")+"</div></div></div>"}
  if(g.game==="CODENAMES")return "<div class='physical-table codenames-physical'><div class='code-board-mini'>"+(s.words||[]).map(w=>"<span class='"+(w.revealed?"revealed":"")+"'>"+esc(w.word)+"</span>").join("")+"</div><div class='turn-orbit'>"+esc(s.team||"")+"</div></div>";
  return "<div class='physical-table generic-physical'><div class='table-logo'>MLD COMMUNITY</div><div class='turn-orbit'>"+(Number.isInteger(current)&&current===myIndex?"دورك الآن":"انتظر دورك")+"</div></div>"
}
  async function openSession(id,watch){
    stop();activeId=id;spectator=!!watch;localStorage.setItem("mld_active_game_id",String(id));
    const render=async()=>{
      try{
        const d=await api("/api/games/"+id+"/state?guestId="+encodeURIComponent(guestId));
        const g=d.game,s=d.state||{},players=g.players||[];
        const me=players.find(p=>window.mldUser?p.username===window.mldUser.username:p.guestId===guestId);
        const myIndex=players.findIndex(p=>window.mldUser?p.username===window.mldUser.username:p.guestId===guestId);
        const current=Number(s.turnPlayerIndex ?? s.turnIndex);
        const roomMeta=meta[g.game]||["◆","default"];
        const occupied=new Set(players.map(p=>p.seat).filter(Boolean));
        const mySeat=me?.seat||"";
        const seatButtons=seatLabels(g.game,g.max_players).map((label,i)=>{const taken=occupied.has(label)&&mySeat!==label;return "<button type='button' class='game-seat-choice "+(mySeat===label?"selected":"")+"' data-eg-seat='"+i+"' "+(taken||g.status==="playing"?"disabled":"")+"><b>"+esc(label)+"</b><small>"+(taken?"محجوز":mySeat===label?"مقعدك":"متاح")+"</small></button>"}).join("");
        const seatCards=players.map((p,i)=>"<article class='game-seat "+(Number.isInteger(current)&&current===i?"turn ":"")+(p.bot?"bot":"")+"'><div class='game-seat-avatar'>"+(p.bot?"BOT":esc((p.username||"لاعب").slice(0,2)))+"</div><div><b>"+esc(p.seatLabel||p.username||"لاعب")+"</b><small>"+(p.host?"صاحب الجلسة · ":"")+(p.bot?"بوت":"لاعب")+"</small></div></article>").join("");
        let controls="";
        if(g.status!=="playing"){
          controls="<div class='game-perspective'>منظورك الخاص · "+(mySeat?esc(mySeat):"لم تختر مقعدًا بعد")+"</div><div class='game-seat-picker'>"+seatButtons+"</div><div class='game-lobby-note'>كل جهاز يختار مقعده بنفسه. المقعد المحجوز لا يظهر كمتاح.</div>"+(me?.host&&!mySeat?"<button class='primary wide' disabled>اختر مقعدك لبدء الجلسة</button>":me?.host?"<button class='primary wide game-start-button' id='eg-start'>▶ ابدأ الجلسة</button>":"");
        } else if(s.winner){
          const scoreRows=Array.isArray(s.scores)?players.map((p,i)=>"<div class='game-result-row'><span>"+esc(p.username||"لاعب")+"</span><b>"+esc(s.scores[i]??0)+" نقطة</b></div>").join(""):(s.teamScores?Object.entries(s.teamScores).map(([k,v])=>"<div class='game-result-row'><span>"+esc(k==="red"?"الفريق الأحمر":k==="blue"?"الفريق الأزرق":k==="0"?"الفريق A":"الفريق B")+"</span><b>"+esc(v)+"</b></div>").join(""):"");
          controls="<div class='game-results-panel'><div class='game-result-winner'>🏆 "+esc(s.winner)+"</div><p class='muted'>انتهت الجلسة — النتيجة محفوظة مؤقتًا.</p>"+scoreRows+"<div class='game-result-countdown' id='eg-result-countdown'></div></div>";
        } else if(spectator){
          controls="<div class='game-spectator'>وضع المشاهدة — لا توجد لك يد أو دور خاص.</div>";
        } else if(s.version>=4 && g.game==="CODENAMES"){
          const role=s.playerRole||"spectator",mineClue=role.endsWith("spymaster"),mineGuess=role.endsWith("agent");
          controls="<div class='game-phase-banner'>"+(role==="red_spymaster"?"🔴 قائد الأحمر":role==="blue_spymaster"?"🔵 قائد الأزرق":role==="red_agent"?"🔴 عميل الأحمر":role==="blue_agent"?"🔵 عميل الأزرق":"مشاهد")+" · الدور: "+esc(s.team==="red"?"الأحمر":"الأزرق")+"</div>";
          if(s.clue)controls+="<div class='game-prompt'>التلميح: <b>"+esc(s.clue.word)+"</b> · "+esc(s.clue.number)+"</div>";
          controls+="<div class='codenames-board'>"+(s.words||[]).map((w,i)=>"<button class='code-word "+(w.revealed?"revealed":"")+"' data-eg-guess='"+i+"' "+(!mineGuess||w.revealed||!s.clue?"disabled":"")+">"+esc(w.word)+"</button>").join("")+"</div>";
          if(mineClue)controls+="<div class='game-control-row'><input id='eg-clue' class='full' maxlength='30' placeholder='كلمة واحدة للتلميح'><input id='eg-clue-num' type='number' min='1' max='9' value='1'><button class='primary' data-eg-action='clue'>إعطاء التلميح</button></div>";
          if(mineGuess&&s.clue)controls+="<button class='ghost' data-eg-action='endTurn'>إنهاء الدور</button>";
        } else if(s.version>=4 && g.game==="SPYFALL"){
          const p=s.private||{},mine=myIndex===current;
          controls="<div class='game-private-card'><b>"+(p.spy?"🕵️ أنت الجاسوس":"📍 أنت لست الجاسوس")+"</b>"+(p.location?"<span>الموقع: "+esc(p.location)+"</span>":"")+(p.role?"<span>الدور: "+esc(p.role)+"</span>":"")+"</div>";
          if(s.lastQuestion)controls+="<div class='game-prompt'><b>السؤال:</b> "+esc(s.lastQuestion.text)+"</div>"+(s.lastAnswer?"<div class='game-prompt'><b>الجواب:</b> "+esc(s.lastAnswer)+"</div>":"");
          if(p.spy)controls+="<div class='game-control-row'><input id='eg-spy-location' class='full' placeholder='إذا عرفت الموقع اكتبه هنا'><button class='primary' data-eg-action='spyGuess'>كشف الموقع</button></div>";
          if(mine)controls+="<div class='game-control-row'><select id='eg-spy-target' class='full'>"+players.map((x,i)=>i===myIndex?"":("<option value='"+i+"'>اسأل "+esc(x.username||"لاعب")+"</option>")).join("")+"</select><input id='eg-spy-q' class='full' maxlength='200' placeholder='اكتب سؤالك'><button class='primary' data-eg-action='question'>إرسال السؤال</button></div>";
          if(s.lastQuestion&&s.lastQuestion.to===myIndex)controls+="<div class='game-control-row'><input id='eg-spy-a' class='full' maxlength='250' placeholder='اكتب إجابتك'><button class='primary' data-eg-action='answer'>إجابة</button></div>";
          controls+="<div class='game-choice-grid'>"+players.map((x,i)=>"<button data-eg-action='accuse' data-eg-target='"+i+"'>اتهام "+esc(x.username||"لاعب")+"</button>").join("")+"</div>";
        } else if(s.version>=4 && (g.game==="PICTIONARY"||g.game==="DRAW_GUESS"||g.game==="CHARADES"||g.game==="MIMIC"||g.game==="WHOAMI"||g.game==="SECRET_WORD")){
          const secret=s.private?.secret||"",mine=myIndex===current;
          controls="<div class='game-private-card'>"+(secret?"🔒 المعلومة الخاصة لهذا الجهاز: <b>"+esc(secret)+"</b>":"لا توجد معلومة خاصة لهذا الدور.")+"</div><div class='game-prompt'>"+esc(s.prompt||"ابدأ الجولة")+"</div><div class='game-control-row'><input id='eg-answer' class='full' placeholder='اكتب التخمين'><button class='primary' data-eg-action='submit'>إرسال التخمين</button></div>";
        } else if(s.version>=4 && g.game==="TABOO"){
          const p=s.private||{};controls="<div class='game-private-card'>الكلمة: <b>"+esc(p.secret||"—")+"</b><span>ممنوع: "+esc((p.taboo||[]).join(" · "))+"</span></div><div class='game-control-row'><input id='eg-taboo' class='full' maxlength='240' placeholder='اكتب التلميح'><button class='primary' data-eg-action='submit'>إرسال التلميح</button></div>";
        } else if(s.version>=4 && (g.game==="TRIVIA"||g.game==="EMOJI_GUESS"||g.game==="HOT_SEAT"||g.game==="WOULD_YOU_RATHER"||g.game==="GUESS_PLAYER")){
          controls="<div class='game-prompt'>"+esc(s.prompt||"اختر")+"</div><div class='game-choice-grid'>"+(s.choices||[]).map((x,i)=>"<button data-eg-choice='"+i+"'>"+esc(x)+"</button>").join("")+"</div>";
        } else if(s.version>=4 && (g.game==="WORD_BOMB"||g.game==="CATEGORIES"||g.game==="FASTEST"||g.game==="RIDDLE_RUSH")){
          controls="<div class='game-phase-banner'>"+esc(s.prompt||"")+(s.letter?" · الحرف: <b>"+esc(s.letter)+"</b>":"")+"</div><div class='game-control-row'><input id='eg-answer' class='full' maxlength='120' placeholder='اكتب الإجابة'><button class='primary' data-eg-action='submit'>إرسال</button></div>";
        } else if(s.version>=4 && g.game==="DAQSH"){
          controls="<div class='game-phase-banner'>"+(s.signal?"⚡ اضغط الآن!":"انتظر الإشارة...")+"</div><button class='primary wide' data-eg-action='daqsh' "+(!s.signal?"disabled":"")+">دقش ⚡</button>";
        } else if(s.version>=4 && g.game==="QAWSAR"){
          const q=s.private||{}, hand=q.hand||[], mine=myIndex===Number(s.qawsarTurn);
          controls="<div class='qawsar-room-panel'><div class='game-phase-banner'>"+(mine?(q.qawsarPhase==="draw"?"دورك: اسحب أو خذ ورقة الوسط":"دورك: اختر ماذا تفعل بالورقة المسحوبة"):"انتظر دورك")+" · الجولة "+esc(s.qawsarRound||1)+"</div><div class='qawsar-private-hand'>"+hand.map((x,i)=>"<button class='qawsar-card "+(x.revealed?"face-up":"face-down")+"' data-q-card='"+i+"'><span>"+(x.revealed?esc(x.card?.suit||"")+" "+esc(x.card?.rank||""):"✦")+"</span><small>"+(x.revealed?"مكشوف":"مخفي")+"</small></button>").join("")+"</div><div class='qawsar-actions'>"+(mine&&q.qawsarPhase==="draw"?"<button class='primary' data-q-action='draw'>🂠 اسحب</button><button class='ghost' data-q-action='takeDiscard'>خذ ورقة الوسط</button><button class='ghost' data-q-action='burn8'>🔥 احرق 8</button><button class='ghost' data-q-action='reveal'>كشف</button><button class='ghost' data-q-action='specialSwap'>تبديل J أحمر</button><button class='primary' data-q-action='callQawsar'>قوصر</button>":"")+(mine&&q.qawsarPhase==="choice"?"<button class='primary' data-q-action='swap'>بدّل الورقة المسحوبة</button><button class='ghost' data-q-action='discard'>وطّ الورقة المسحوبة</button>":"")+"</div><div class='qawsar-score-strip'>"+(q.scores||[]).map((v,i)=>"<span>"+esc(players[i]?.username||("لاعب "+(i+1)))+" · "+esc(v)+"</span>").join("")+"</div></div>";
        } else if(g.game==="BALOOT"){
          const mine=myIndex===current;
          if(s.phase==="bidding") controls="<div class='game-phase-banner'>"+(mine?"دورك في الشراء":"انتظر شراء اللاعبين")+" · الجولة "+esc(s.bidRound||1)+"</div><div class='game-bid-actions'><button data-eg-action='bid' data-bid='pass'>بس</button><button data-eg-action='bid' data-bid='sun'>صن</button>"+["♠","♥","♦","♣"].map(x=>"<button data-eg-action='bid' data-bid='hokum' data-suit='"+x+"'>حكم "+x+"</button>").join("")+"</div>";
          else controls="<div class='game-phase-banner'>"+(mine?"دورك — اختر ورقة":"انتظر دورك")+" · العقد: "+esc(s.contract||"—")+"</div><div class='game-hand'>"+(s.hand||[]).map((c,i)=>card(c,i,!mine||(Array.isArray(s.legalIndices)&&!s.legalIndices.includes(i)))).join("")+"</div><div class='game-trick'>"+(s.trick||[]).map(x=>"<span class='played-card'>"+esc((x.card?.suit||"")+" "+(x.card?.rank||""))+"</span>").join("")+"</div>";
        } else if(g.game==="UNO"){
          const mine=myIndex===current;controls="<div class='game-phase-banner'>"+(mine?"دورك":"انتظر دورك")+" · اللون "+esc(s.currentColor||"—")+"</div><div class='uno-table-card'>"+esc((s.discardTop?.color||"")+" "+(s.discardTop?.value||"—"))+"</div><div class='game-hand'>"+(s.hand||[]).map((c,i)=>card(c,i,!mine||(Array.isArray(s.legalIndices)&&!s.legalIndices.includes(i)))).join("")+"</div><button class='ghost' data-eg-action='draw' "+(mine?"":"disabled")+">سحب ورقة</button>";
        } else if(g.game==="LUDO"){
          const mine=myIndex===current;controls="<div class='game-phase-banner'>"+(s.awaitingMove?"اختر قطعة":"ارمِ النرد")+" · النرد "+esc(s.dice??"—")+"</div><div class='ludo-board'>"+(s.tokens||[]).map((t,i)=>"<button class='ludo-token' data-eg-token='"+i+"' "+(!mine||!s.awaitingMove||!(s.legalTokens||[]).includes(i)?"disabled":"")+">"+esc(t===-1?"🏠":t)+"</button>").join("")+"</div><button class='primary' data-eg-action='roll' "+(!mine||s.awaitingMove?"disabled":"")+">رمي النرد</button>";
        } else if(g.game==="CODENAMES"){
          controls="<div class='game-phase-banner'>"+esc(s.playerRole||"مشاهد")+" · الدور "+esc(s.turn||"—")+"</div>"+(s.words?.length?"<div class='codenames-board'>"+s.words.map((w,i)=>"<button class='code-word "+(w.revealed?"revealed":"")+"' data-eg-guess='"+i+"' "+(!s.canGuess||w.revealed?"disabled":"")+">"+esc(w.word||"مخفي")+"</button>").join("")+"</div>":"<div class='game-spectator'>المحتوى السري مخفي عن منظورك.</div>")+(s.canGiveClue?"<div class='game-control-row'><input id='eg-clue' class='full' maxlength='30' placeholder='كلمة التلميح'><input id='eg-clue-num' type='number' min='1' max='9' value='1'><button class='primary' data-eg-action='clue'>إعطاء التلميح</button></div>":"")+(s.canGuess?"<button class='ghost' data-eg-action='endTurn'>إنهاء الدور</button>":"");
        } else if(s.kind==="choice"&&Array.isArray(s.choices)){
          controls="<div class='game-prompt'>"+esc(s.prompt||"اختر إجابة")+"</div><div class='game-choice-grid'>"+s.choices.map((x,i)=>"<button data-eg-choice='"+i+"'>"+esc(x)+"</button>").join("")+"</div>";
        } else controls="<div class='game-prompt'>"+esc(s.prompt||"ابدأ الجولة")+"</div><textarea id='eg-answer' class='full' rows='4' placeholder='اكتب إجابتك...'></textarea><button class='primary wide' data-eg-action='answer'>إرسال الإجابة</button>";
        content.innerHTML="<section class='game-room game-theme-"+esc(roomMeta[1])+"'><header class='game-room-top'><div class='game-room-left'><button id='eg-back' class='ghost'>← الجلسات</button><span class='game-live-pill'>"+(g.status==="playing"?"LIVE":"LOBBY")+"</span><button id='eg-rules' class='ghost game-rules-btn'>القوانين</button></div><div class='game-room-title'><span>"+roomMeta[0]+"</span><div><b>"+esc(names[g.game]||g.game)+"</b><small>جلسة #"+id+" · "+players.length+"/"+g.max_players+"</small></div></div><div class='game-room-actions'><button id='eg-fullscreen' title='تكبير الشاشة' aria-label='تكبير الجلسة'>⛶ <span class="fullscreen-label">تكبير</span></button><button id='eg-leave'>"+(spectator?"خروج":"مغادرة")+"</button>"+(me?.host&&!spectator?"<button id='eg-finish'>إنهاء</button>":"")+"</div></header><div class='game-perspective-banner'>"+(spectator?"وضع مشاهدة":"منظور هذا الجهاز: "+esc(me?.seat||"لم تحدد مقعدًا"))+"</div><div class='game-table'><div class='table-players-layer'>"+tablePlayers(players,g,s,current)+"</div><div class='game-board'><div class='server-watermark'>MLD COMMUNITY</div>"+gameSurface(g,s,players,myIndex,current)+"<div class='game-board-status'>"+esc(s.lastResult?.message||"")+"</div></div></div><section class='game-controls'>"+controls+"</section></section>";
        $("#eg-back").onclick=goList;$("#eg-fullscreen").onclick=fullscreen;$("#eg-rules").onclick=()=>alert(gameRules[g.game]||"اتبع تعليمات الدور الظاهرة في الجلسة واحترم أدوار اللاعبين.");
        $("#eg-leave").onclick=async()=>{try{if(!spectator)await api("/api/games/"+id+"/leave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});sound("click");clearActive();await goList()}catch(e){alert(e.message)}};
        $("#eg-finish")?.addEventListener("click",async()=>{try{await api("/api/games/"+id+"/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});sound("win");clearActive();await goList()}catch(e){alert(e.message)}});
        document.querySelectorAll("[data-eg-seat]").forEach(b=>b.onclick=async()=>{try{sound("click");await api("/api/games/"+id+"/seat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload(),seat:b.dataset.egSeat})});await render()}catch(e){alert(e.message);sound("error")}});
        $("#eg-start")?.addEventListener("click",async()=>{try{await api("/api/games/"+id+"/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});await render()}catch(e){alert(e.message);sound("error")}});
        document.querySelectorAll("[data-eg-choice]").forEach(b=>b.onclick=()=>act("choose",{choice:Number(b.dataset.egChoice)}));
        document.querySelectorAll("[data-eg-guess]").forEach(b=>b.onclick=()=>act("guess",{index:Number(b.dataset.egGuess)}));
        document.querySelectorAll("[data-eg-token]").forEach(b=>b.onclick=()=>act("moveToken",{token:Number(b.dataset.egToken)}));
        document.querySelectorAll("[data-eg-action]").forEach(b=>b.onclick=()=>{
          const a=b.dataset.egAction;
          const extra={bid:b.dataset.bid,suit:b.dataset.suit,target:b.dataset.egTarget};
          if(a==="clue"){extra.word=$("#eg-clue")?.value.trim();extra.number=Number($("#eg-clue-num")?.value)||1}
          if(a==="question"){extra.target=Number($("#eg-spy-target")?.value);extra.text=$("#eg-spy-q")?.value.trim()}
          if(a==="answer"&&$("#eg-spy-a"))extra.text=$("#eg-spy-a").value.trim();
          if(a==="spyGuess")extra.location=$("#eg-spy-location")?.value.trim();
          if(a==="submit")extra.text=($("#eg-taboo")?.value||$("#eg-answer")?.value||"").trim();
          act(a,extra)
        });
        let qawsarSelected=-1;
        document.querySelectorAll("[data-q-card]").forEach(b=>b.onclick=()=>{qawsarSelected=Number(b.dataset.qCard);document.querySelectorAll("[data-q-card]").forEach(x=>x.classList.toggle("selected",x===b));});
        document.querySelectorAll("[data-q-action]").forEach(b=>b.onclick=()=>{const a=b.dataset.qAction;if(a==="draw")return act("draw",{});if(a==="takeDiscard")return act("takeDiscard",{index:qawsarSelected});if(a==="burn8")return act("burn8",{index:qawsarSelected});if(a==="reveal")return act("reveal",{index:qawsarSelected,targetIndex:Number(prompt("رقم الورقة المراد كشفها (0-3)")||0)});if(a==="specialSwap")return act("specialSwap",{index:qawsarSelected,player:Number(prompt("رقم اللاعب")||0),targetIndex:Number(prompt("رقم ورقته 0-3")||0)});if(a==="callQawsar")return act("callQawsar",{});if(a==="swap")return act("playCard",{index:qawsarSelected,mode:"swap"});if(a==="discard")return act("playCard",{index:qawsarSelected,mode:"discard"});});
        document.querySelectorAll("[data-game-card]").forEach(b=>b.onclick=()=>act("playCard",{index:Number(b.dataset.gameCard)}));
        document.querySelectorAll("[data-eg-card]").forEach(b=>b.onclick=()=>act("playCard",{index:Number(b.dataset.egCard)}));
        document.querySelectorAll("[data-eg-choice]").forEach(b=>b.onclick=()=>act("choose",{choice:Number(b.dataset.egChoice)}));
        document.querySelectorAll("[data-eg-guess]").forEach(b=>b.onclick=()=>act("guess",{index:Number(b.dataset.egGuess)}));
      }catch(e){clearActive();content.innerHTML="<section class='game-room'><h3>انتهت الجلسة</h3><p class='muted'>"+esc(e.message)+"</p><button class='primary' id='eg-dead-back'>العودة للألعاب</button></section>";$("#eg-dead-back").onclick=goList}
    };
    const act=async(action,extra={})=>{const body={...payload(),action,...extra};if(action==="clue"){body.word=$("#eg-clue")?.value.trim();body.number=Number($("#eg-clue-num")?.value)||1}if(action==="answer")body.answer=$("#eg-answer")?.value.trim()||"";try{await api("/api/games/"+id+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});sound(action==="playCard"?"card":"click");await render()}catch(e){const x=$(".game-board-status");if(x)x.textContent=e.message;sound("error")}};
    await render();timer=setInterval(render,1200);
  }
  document.addEventListener("fullscreenchange",()=>setImmersive(!!document.fullscreenElement));\n  document.addEventListener("webkitfullscreenchange",()=>setImmersive(!!document.webkitFullscreenElement));\n  window.addEventListener("orientationchange",()=>{if(document.body.classList.contains("mld-game-fullscreen"))setTimeout(()=>window.dispatchEvent(new Event("resize")),120)});\n  window.enhancedGames=enhancedGames;
  window.openEnhancedGameSession=openSession;
  window.renderGames=enhancedGames;
  if(typeof renderGames==="function")renderGames=enhancedGames;
  window.addEventListener("pagehide",()=>{if(activeId&&!spectator){try{navigator.sendBeacon("/api/games/"+activeId+"/leave",new Blob([JSON.stringify(payload())],{type:"application/json"}))}catch{}}});
})();