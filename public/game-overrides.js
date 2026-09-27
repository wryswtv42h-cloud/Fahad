(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const names = {CODENAMES:"Codenames",SPYFALL:"Spyfall",PICTIONARY:"Pictionary",CHARADES:"Charades",WHOAMI:"Who Am I?",TABOO:"Taboo",WORD_BOMB:"Word Bomb",TRUTH_LIE:"Truth or Lie",EMOJI_GUESS:"Emoji Guess",TRIVIA:"Trivia",CATEGORIES:"Categories",LIAR:"Liar",HOT_SEAT:"Hot Seat",WOULD_YOU_RATHER:"Would You Rather",DRAW_GUESS:"Draw & Guess",FASTEST:"Fastest",RIDDLE_RUSH:"Riddle Rush",SECRET_WORD:"Secret Word",MIMIC:"Mimic",GUESS_PLAYER:"Guess Player",UNO:"UNO",LUDO:"Ludo",BALOOT:"Baloot",DAQSH:"Daqsh",QAWSAR:"Qawsar"};
  const seats = {CODENAMES:["قائد الأحمر","عميل الأحمر","قائد الأزرق","عميل الأزرق"],SPYFALL:["المحقق 1","المحقق 2","المحقق 3","الجاسوس"],PICTIONARY:["الرسام","المخمن 1","المخمن 2","المخمن 3"],CHARADES:["الممثل","المخمن 1","المخمن 2","المخمن 3"],WHOAMI:["اللاعب 1","اللاعب 2","اللاعب 3","اللاعب 4"],TABOO:["الشارح","المخمن 1","المخمن 2","المخمن 3"],WORD_BOMB:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],TRUTH_LIE:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],EMOJI_GUESS:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],TRIVIA:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],CATEGORIES:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],LIAR:["المتهم","المحقق 1","المحقق 2","المحقق 3"],HOT_SEAT:["المقعد الساخن","لاعب 2","لاعب 3","لاعب 4"],WOULD_YOU_RATHER:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],DRAW_GUESS:["الرسام","المخمن 1","المخمن 2","المخمن 3"],FASTEST:["متسابق 1","متسابق 2","متسابق 3","متسابق 4"],RIDDLE_RUSH:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],SECRET_WORD:["حامل السر","لاعب 2","لاعب 3","لاعب 4"],MIMIC:["المقلد","المخمن 1","المخمن 2","المخمن 3"],GUESS_PLAYER:["الشخص الغامض","المحقق 1","المحقق 2","المحقق 3"],UNO:["مقعد 1","مقعد 2","مقعد 3","مقعد 4"],LUDO:["مقعد 1","مقعد 2","مقعد 3","مقعد 4"],BALOOT:["فريق A - 1","فريق A - 2","فريق B - 1","فريق B - 2"],DAQSH:["لاعب 1","لاعب 2","لاعب 3","لاعب 4"],QAWSAR:["مقعد 1","مقعد 2","مقعد 3","مقعد 4"]};
  const meta = {CODENAMES:["▦","codenames"],SPYFALL:["◉","spyfall"],PICTIONARY:["✎","pictionary"],CHARADES:["✦","charades"],WHOAMI:["?","whoami"],TABOO:["⊘","taboo"],WORD_BOMB:["◈","wordbomb"],TRUTH_LIE:["✓","truthlie"],EMOJI_GUESS:["☺","emoji"],TRIVIA:["?","trivia"],CATEGORIES:["A","categories"],LIAR:["!","liar"],HOT_SEAT:["◉","hotseat"],WOULD_YOU_RATHER:["↔","wyr"],DRAW_GUESS:["✎","draw"],FASTEST:["⚡","fast"],RIDDLE_RUSH:["?","riddle"],SECRET_WORD:["◆","secret"],MIMIC:["◌","mimic"],GUESS_PLAYER:["◎","guess"],UNO:["UNO","uno"],LUDO:["●","ludo"],BALOOT:["♠","baloot"],DAQSH:["◆","daqsh"],QAWSAR:["♜","qawsar"]};
  const guestId = localStorage.getItem("mld_guest_id") || ("g_"+crypto.randomUUID());
  localStorage.setItem("mld_guest_id", guestId);
  const payload = () => ({guestId,guestName:"زائر"});
  const api = async (url,opt={}) => { const r=await fetch(url,opt); let d={}; try{d=await r.json()}catch{} if(!r.ok) throw Error(d.error||"تعذر تنفيذ العملية"); return d; };
  let timer=null, activeId=null, spectator=false;
  const clearActive=()=>{localStorage.removeItem("mld_active_game_id");activeId=null};
  const stop=()=>{if(timer){clearInterval(timer);timer=null}};
  const goList=async()=>{stop();clearActive();if(typeof renderGames==="function" && renderGames!==enhancedGames) return renderGames();return window.change("games")};
  const sound=(kind)=>{try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();const f={click:520,card:680,dice:260,win:880,error:180}[kind]||440;o.frequency.value=f;o.type=kind==="dice"?"square":"sine";g.gain.setValueAtTime(.018,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.09);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.09)}catch{}};
  const fullscreen=async()=>{const room=$(".game-room");if(!room)return;try{if(document.fullscreenElement){await document.exitFullscreen();return}if(room.requestFullscreen)await room.requestFullscreen();else room.classList.toggle("game-focus-mode")}catch{room.classList.toggle("game-focus-mode")}};
  function card(c,i,disabled){const label=c?.rank?String(c.suit||"")+" "+String(c.rank):String(c?.color||"")+" "+String(c?.value||"ورقة");return "<button type='button' class='game-card-button "+(disabled?"disabled":"")+"' data-game-card='"+i+"' "+(disabled?"disabled":"")+"><span>"+esc(label)+"</span></button>"}
  async function enhancedGames(){
    if(typeof searchWrap!=="undefined")searchWrap.style.display="none";
    if(typeof title!=="undefined")title.textContent="مركز الألعاب";
    if(typeof subtitle!=="undefined")subtitle.textContent="كل جهاز يرى منظور لاعبه فقط — مقعد، جلسة، خروج، تكبير، ولعب مباشر.";
    if(typeof content==="undefined")return;
    content.className="feature-grid";
    const d=await api("/api/games").catch(e=>({games:[],error:e.message}));
    const games=d.games||[];
    content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>إنشاء جلسة</h3><div class='form-stack'><label>اللعبة<select id='eg-kind' class='full'>"+Object.entries(names).map(([k,v])=>"<option value='"+k+"'>"+esc(v)+"</option>").join("")+"</select></label><label>عدد المقاعد<input id='eg-max' class='full' type='number' min='2' max='8' value='4'></label><button class='primary wide' id='eg-create'>إنشاء جلسة</button><p id='eg-status' class='muted'></p></div></article><article class='feature-card game-lobby-card'><div class='game-lobby-head'><div><p class='eyebrow'>LIVE LOBBIES</p><h3>الجلسات الحالية</h3></div><button class='ghost' id='eg-refresh'>تحديث</button></div><div id='eg-list' class='log-list'>"+(games.length?games.map(g=>"<div class='group-item game-lobby-row'><span><b>#"+g.id+" · "+esc(names[g.game]||g.game)+"</b><small>"+esc(g.host_username||"ضيف")+" · "+(g.players||[]).length+"/"+g.max_players+" · "+esc(g.status)+"</small></span><div class='game-lobby-actions'><button class='primary' data-eg-join='"+g.id+"'>انضمام</button><button data-eg-watch='"+g.id+"'>مشاهدة</button></div></div>").join(""):"<p class='muted'>لا توجد جلسات مفتوحة حاليًا.</p>")+"</div></article>";
    $("#eg-create").onclick=async()=>{try{const game=$("#eg-kind").value,maxPlayers=Number($("#eg-max").value)||4;const x=await api("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game,maxPlayers,...payload()})});sound("click");openSession(x.game.id,false)}catch(e){$("#eg-status").textContent=e.message;sound("error")}};
    $("#eg-refresh").onclick=enhancedGames;
    document.querySelectorAll("[data-eg-join]").forEach(b=>b.onclick=async()=>{try{await api("/api/games/"+b.dataset.egJoin+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});sound("click");openSession(Number(b.dataset.egJoin),false)}catch(e){alert(e.message);sound("error")}});
    document.querySelectorAll("[data-eg-watch]").forEach(b=>b.onclick=()=>openSession(Number(b.dataset.egWatch),true));
  }
  async function openSession(id,watch){
    stop();activeId=id;spectator=!!watch;localStorage.setItem("mld_active_game_id",String(id));
    const render=async()=>{
      try{
        const d=await api("/api/games/"+id+"/state?guestId="+encodeURIComponent(guestId));
        const g=d.game,s=d.state||{},players=g.players||[];
        const me=players.find(p=>window.mldUser?p.username===window.mldUser.username:p.guestId===guestId);
        const myIndex=players.findIndex(p=>window.mldUser?p.username===window.mldUser.username:p.guestId===guestId);
        const current=Number(s.turnPlayerIndex);
        const roomMeta=meta[g.game]||["◆","default"];
        const occupied=new Set(players.map(p=>p.seat).filter(Boolean));
        const mySeat=me?.seat||"";
        const seatButtons=(seats[g.game]||[]).slice(0,Number(g.max_players)||4).map((label,i)=>{const taken=occupied.has(label)&&mySeat!==label;return "<button type='button' class='game-seat-choice "+(mySeat===label?"selected":"")+"' data-eg-seat='"+i+"' "+(taken||g.status==="playing"?"disabled":"")+"><b>"+esc(label)+"</b><small>"+(taken?"محجوز":mySeat===label?"مقعدك":"متاح")+"</small></button>"}).join("");
        const seatCards=players.map((p,i)=>"<article class='game-seat "+(Number.isInteger(current)&&current===i?"turn ":"")+(p.bot?"bot":"")+"'><div class='game-seat-avatar'>"+(p.bot?"BOT":esc((p.username||"لاعب").slice(0,2)))+"</div><div><b>"+esc(p.seatLabel||p.username||"لاعب")+"</b><small>"+(p.host?"صاحب الجلسة · ":"")+(p.bot?"بوت":"لاعب")+"</small></div></article>").join("");
        let controls="";
        if(g.status!=="playing"){
          controls="<div class='game-perspective'>منظورك الخاص · "+(mySeat?esc(mySeat):"لم تختر مقعدًا بعد")+"</div><div class='game-seat-picker'>"+seatButtons+"</div><div class='game-lobby-note'>كل جهاز يختار مقعده بنفسه. المقعد المحجوز لا يظهر كمتاح.</div>"+(me?.host&&!mySeat?"<button class='primary wide' disabled>اختر مقعدك لبدء الجلسة</button>":me?.host?"<button class='primary wide' id='eg-start'>ابدأ الجلسة</button>":"");
        } else if(s.winner){
          controls="<div class='game-result'><strong>انتهت اللعبة</strong><span>"+esc(s.winner)+"</span></div>";
        } else if(spectator){
          controls="<div class='game-spectator'>وضع المشاهدة — لا توجد لك يد أو دور خاص.</div>";
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
        content.innerHTML="<section class='game-room game-theme-"+esc(roomMeta[1])+"'><header class='game-room-top'><div class='game-room-left'><button id='eg-back' class='ghost'>← الجلسات</button><span class='game-live-pill'>"+(g.status==="playing"?"LIVE":"LOBBY")+"</span></div><div class='game-room-title'><span>"+roomMeta[0]+"</span><div><b>"+esc(names[g.game]||g.game)+"</b><small>جلسة #"+id+" · "+players.length+"/"+g.max_players+"</small></div></div><div class='game-room-actions'><button id='eg-fullscreen' title='تكبير الشاشة'>⛶</button><button id='eg-leave'>"+(spectator?"خروج":"مغادرة")+"</button>"+(me?.host&&!spectator?"<button id='eg-finish'>إنهاء</button>":"")+"</div></header><div class='game-perspective-banner'>"+(spectator?"وضع مشاهدة":"منظور هذا الجهاز: "+esc(me?.seat||"لم تحدد مقعدًا"))+"</div><div class='game-table'><div class='game-seats game-seats-top'>"+seatCards+"</div><div class='game-board'>"+roomMeta[0]+"<div class='game-board-status'>"+esc(s.lastResult?.message||"")+"</div></div><div class='game-seats game-seats-bottom'></div></div><section class='game-controls'>"+controls+"</section></section>";
        $("#eg-back").onclick=goList;$("#eg-fullscreen").onclick=fullscreen;
        $("#eg-leave").onclick=async()=>{try{if(!spectator)await api("/api/games/"+id+"/leave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});sound("click");clearActive();await goList()}catch(e){alert(e.message)}};
        $("#eg-finish")?.addEventListener("click",async()=>{try{await api("/api/games/"+id+"/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});sound("win");clearActive();await goList()}catch(e){alert(e.message)}});
        document.querySelectorAll("[data-eg-seat]").forEach(b=>b.onclick=async()=>{try{sound("click");await api("/api/games/"+id+"/seat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload(),seat:b.dataset.egSeat})});await render()}catch(e){alert(e.message);sound("error")}});
        $("#eg-start")?.addEventListener("click",async()=>{try{await api("/api/games/"+id+"/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});await render()}catch(e){alert(e.message);sound("error")}});
        document.querySelectorAll("[data-eg-choice]").forEach(b=>b.onclick=()=>act("choose",{choice:Number(b.dataset.egChoice)}));
        document.querySelectorAll("[data-eg-guess]").forEach(b=>b.onclick=()=>act("guess",{index:Number(b.dataset.egGuess)}));
        document.querySelectorAll("[data-eg-token]").forEach(b=>b.onclick=()=>act("moveToken",{token:Number(b.dataset.egToken)}));
        document.querySelectorAll("[data-eg-action]").forEach(b=>b.onclick=()=>act(b.dataset.egAction,{bid:b.dataset.bid,suit:b.dataset.suit}));
        document.querySelectorAll("[data-game-card]").forEach(b=>b.onclick=()=>act("playCard",{index:Number(b.dataset.gameCard)}));
      }catch(e){clearActive();content.innerHTML="<section class='game-room'><h3>انتهت الجلسة</h3><p class='muted'>"+esc(e.message)+"</p><button class='primary' id='eg-dead-back'>العودة للألعاب</button></section>";$("#eg-dead-back").onclick=goList}
    };
    const act=async(action,extra={})=>{const body={...payload(),action,...extra};if(action==="clue"){body.word=$("#eg-clue")?.value.trim();body.number=Number($("#eg-clue-num")?.value)||1}if(action==="answer")body.answer=$("#eg-answer")?.value.trim()||"";try{await api("/api/games/"+id+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});sound(action==="playCard"?"card":"click");await render()}catch(e){const x=$(".game-board-status");if(x)x.textContent=e.message;sound("error")}};
    await render();timer=setInterval(render,1200);
  }
  window.enhancedGames=enhancedGames;
  window.openEnhancedGameSession=openSession;
  window.renderGames=enhancedGames;
  if(typeof renderGames==="function")renderGames=enhancedGames;
  window.addEventListener("pagehide",()=>{if(activeId&&!spectator){try{navigator.sendBeacon("/api/games/"+activeId+"/leave",new Blob([JSON.stringify(payload())],{type:"application/json"}))}catch{}}});
})();