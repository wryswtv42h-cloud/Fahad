
"use strict";
(function(){
  var $=function(s){return document.querySelector(s)};
  var panel=$("#platform");
  var token=localStorage.getItem("mld_token")||"";
  var account=null;try{account=JSON.parse(localStorage.getItem("mld_account")||"null")}catch(e){account=null;}
  var names={"baloot":"بلوت","uno":"UNO","jackaroo":"جاكارو","ludo":"لودو","monopoly":"مونوبولي","maqsor":"مقوصر"};
  if(!panel)return;
  function esc(v){return String(v==null?"":v).replace(/[&<>\"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
  function api(url,opt){opt=opt||{};opt.headers=Object.assign({"Content-Type":"application/json"},opt.headers||{});if(token)opt.headers.Authorization="Bearer "+token;return fetch(url,opt).then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"حدث خطأ");return d})})}
  function show(title,html){panel.className=panel.className.replace(/\bhidden\b/g,"").trim();$("#directory").className+=" hidden";$("#view-title").textContent=title;$("#subtitle").textContent="منصة MLD";panel.innerHTML=html;requestAnimationFrame(function(){panel.scrollIntoView({behavior:"smooth",block:"start"});});}
  function badge(){return account?"<span class='platform-chip "+(account.role==="owner"?"owner":"")+"'>@"+esc(account.username)+" · "+(account.role==="owner"?"OWNER":"عضو")+"</span>":"<span class='platform-chip'>زائر</span>"}
  function need(){if(account)return true;loginView();return false}
  function accountView(){
    var html;
    if(account){
      html="<div class='platform-head'><div><span class='eyebrow'>MLD ACCOUNT</span><h2>حسابك جاهز</h2><p class='muted'>حسابك مرتبط بـ Discord ولا يمكن إنشاء حساب ثانٍ لنفس Discord.</p></div><div class='account-card'><div>"+badge()+"</div><h3>@"+esc(account.username)+"</h3><p>Discord: "+esc(account.discordId||"غير مربوط")+"</p><button class='primary' id='logout'>تسجيل خروج</button></div></div>";
    }else{
      html="<div class='account-card narrow'><span class='eyebrow'>MLD ACCOUNT</span><h2>إنشاء حساب MLD</h2><p class='muted'>لازم تكون عضوًا في سيرفر ملاذ. اختر حسابك من اقتراحات Discord؛ لن يتم إنشاء الحساب إلا بعد تأكيد الرسالة التي تصلك في الخاص.</p><label>يوزر Discord</label><input id='acc-discord-search' class='full' placeholder='اكتب اليوزر للبحث...' autocomplete='off'><div id='discord-suggestions' class='recipient-results'></div><input id='acc-user' class='full' placeholder='اسم المستخدم في الموقع (a-z, 0-9, _)'><input id='acc-pass' class='full' type='password' placeholder='كلمة المرور (6 أحرف+)'><p id='acc-selected' class='muted small'>لم يتم اختيار عضو Discord بعد.</p><button class='primary wide' id='create-account'>إرسال طلب إنشاء الحساب</button><div id='acc-pending' class='account-card hidden'></div><button class='platform-link' id='show-login'>عندي حساب — تسجيل الدخول</button></div>";
    }
    show("الحساب",html);
    var create=$("#create-account");
    var selectedDiscord=null;
    var search=$("#acc-discord-search");
    var timer;
    function renderSuggestions(list){
      var box=$("#discord-suggestions");
      box.innerHTML=(list||[]).slice(0,8).map(function(m){return "<button class='recipient' data-discord-id='"+esc(m.id)+"' data-discord-name='"+esc(m.displayName||m.globalName||m.username)+"'><img src='"+esc(m.avatar||"/logo.svg.JPG")+"'><span>"+esc(m.displayName||m.globalName||m.username)+"<small>@"+esc(m.username)+"</small></span></button>"}).join("");
      box.querySelectorAll("[data-discord-id]").forEach(function(b){b.onclick=function(){selectedDiscord={id:b.dataset.discordId,name:b.dataset.discordName};search.value="@"+b.dataset.discordName;box.innerHTML="<b class='selected'>تم اختيار @"+esc(b.dataset.discordName)+" ✓</b>";$("#acc-selected").textContent="Discord ID: "+selectedDiscord.id;};});
    }
    if(search)search.oninput=function(){clearTimeout(timer);var q=search.value.trim();selectedDiscord=null;$("#acc-selected").textContent="جاري البحث...";if(q.length<2){$("#discord-suggestions").innerHTML="";$("#acc-selected").textContent="اكتب حرفين على الأقل للبحث";return;}timer=setTimeout(function(){api("/api/platform/account/discord-members?q="+encodeURIComponent(q)).then(function(d){renderSuggestions(d.members);$("#acc-selected").textContent=d.members.length?"اختر حسابك من القائمة":"لا يوجد عضو مطابق داخل السيرفر";}).catch(function(e){$("#acc-selected").textContent=e.message;});},250);};
    if(create)create.onclick=function(){
      if(!selectedDiscord){alert("اختر حساب Discord من الاقتراحات أولًا");return;}
      create.disabled=true;create.textContent="جاري إرسال رسالة التأكيد...";
      api("/api/platform/accounts",{method:"POST",body:JSON.stringify({username:$("#acc-user").value,discordId:selectedDiscord.id,password:$("#acc-pass").value})}).then(function(d){
        $("#acc-pending").className="account-card";$("#acc-pending").innerHTML="<b>📩 تم إرسال رسالة تأكيد إلى Discord</b><p class='muted'>افتح الخاص في Discord واضغط <b>نعم</b> إذا أنت من أنشأ الحساب، أو <b>لا</b> لإلغاء العملية.</p><p id='pending-status' class='muted'>بانتظار تأكيدك...</p>";
        create.textContent="بانتظار تأكيد Discord...";
        var attempts=0;
        var poll=setInterval(function(){
          attempts++;
          api("/api/platform/accounts/pending/"+encodeURIComponent(d.pendingId)+"?token="+encodeURIComponent(d.browserToken)).then(function(v){
            if(v.status==="confirmed"){clearInterval(poll);token=v.token;account=v.account;localStorage.setItem("mld_token",token);localStorage.setItem("mld_account",JSON.stringify(account));updateOwnerMenu();accountView();}
            else if(v.status==="cancelled"){clearInterval(poll);$("#pending-status").textContent="❌ تم إلغاء إنشاء الحساب. لم يتم إنشاء أي حساب.";create.disabled=false;create.textContent="إرسال طلب إنشاء الحساب";}
            else if(attempts>=60){clearInterval(poll);$("#pending-status").textContent="انتهت مهلة التأكيد. اضغط إنشاء الحساب للمحاولة من جديد.";create.disabled=false;create.textContent="إرسال طلب إنشاء الحساب";}
          }).catch(function(){});
          if(attempts>=60)clearInterval(poll);
        },5000);
      }).catch(function(e){alert(e.message);create.disabled=false;create.textContent="إرسال طلب إنشاء الحساب";});
    };
    var login=$("#show-login");if(login)login.onclick=loginView;
    var logout=$("#logout");if(logout)logout.onclick=function(){api("/api/platform/logout",{method:"POST"}).catch(function(){}).finally(function(){token="";account=null;localStorage.removeItem("mld_token");localStorage.removeItem("mld_account");accountView()})};
  }
  function loginView(){
    show("تسجيل الدخول","<div class='account-card narrow'><span class='eyebrow'>مرحبًا بعودتك</span><h2>تسجيل الدخول</h2><input id='login-user' class='full' placeholder='اسم المستخدم'><input id='login-pass' class='full' type='password' placeholder='كلمة المرور'><button class='primary wide' id='login'>دخول</button><button class='platform-link' id='new-account'>إنشاء حساب جديد</button></div>");
    $("#login").onclick=function(){api("/api/platform/login",{method:"POST",body:JSON.stringify({username:$("#login-user").value,password:$("#login-pass").value})}).then(function(d){token=d.token;account=d.account;localStorage.setItem("mld_token",token);localStorage.setItem("mld_account",JSON.stringify(account));updateOwnerMenu();accountView()}).catch(function(e){alert(e.message)})};
    $("#new-account").onclick=accountView;
  }
  var gamePoll=null;
  function stopGamePoll(){if(gamePoll){clearInterval(gamePoll);gamePoll=null;}}
  function gameLabel(g){return names[g]||g}
  function seatName(p){return String(p||"").startsWith("__test_")?"🤖 مقعد اختبار":p?"@"+p:"المقعد فارغ"}
  function gameAction(id,action,extra){
    var body=Object.assign({action:action},extra||{});
    return api("/api/platform/lobbies/"+id+"/action",{method:"POST",body:JSON.stringify(body)});
  }
  function gameRoom(lobby){
    stopGamePoll();
    function render(room){
      lobby=room;
      var started=!!lobby.started, state=lobby.gameState||{}, my=account&&account.username;
      var seats="";
      for(var i=0;i<lobby.maxPlayers;i++){
        var p=lobby.players[i]||"";
        seats+="<article class='mld-seat "+(p?"occupied":"empty-seat")+"'><span class='seat-no'>مقعد "+(i+1)+"</span><div class='seat-avatar'>"+(p?"◉":"＋")+"</div><h3>"+esc(seatName(p))+"</h3><small>"+(p===lobby.host?"👑 المضيف":p&&String(p).startsWith("__test_")?"اختبار":"لاعب")+"</small>"+(!p&&!started?"<button class='platform-link seat-join' data-seat='"+i+"'>أخذ المقعد</button>":"")+"</article>";
      }
      var isMyTurn=lobby.currentPlayer===my || (lobby.currentPlayer&&String(lobby.currentPlayer).startsWith("__test_")&&lobby.host===my);
      var controls="";
      if(started){
        if(state.winner)controls="<div class='game-result'><b>🏆 الفائز: "+esc(seatName(state.winner))+"</b><button class='primary' id='new-from-table'>العودة للألعاب</button></div>";
        else if(lobby.game==="uno"){
          var hand=state.myHand||[];
          controls="<div class='game-controls'><div class='turn-box "+(isMyTurn?"my-turn":"")+"'>الدور الآن: <b>"+esc(seatName(lobby.currentPlayer))+"</b></div><p class='muted'>اللون الحالي: <b>"+esc(state.currentColor||"-")+"</b> · الأوراق: "+hand.length+"</p><div class='card-hand'>"+hand.map(function(card,i){return "<button class='uno-card' data-card='"+i+"'><b>"+esc(card.value)+"</b><small>"+esc(card.color)+"</small></button>"}).join("")+"</div><button class='primary' id='uno-draw' "+(!isMyTurn?"disabled":"")+">سحب ورقة</button></div>";
        }else if(lobby.game==="baloot"){
          var bh=state.myHand||[];
          controls="<div class='game-controls'><div class='turn-box "+(isMyTurn?"my-turn":"")+"'>الدور الآن: <b>"+esc(seatName(lobby.currentPlayer))+"</b></div><p class='muted'>النوع المفتوح: "+esc(state.trickSuit||"لم يبدأ")+"</p><div class='card-hand'>"+bh.map(function(card,i){return "<button class='uno-card' data-baloot-card='"+i+"'><b>"+esc(card.label)+"</b></button>"}).join("")+"</div><p class='muted'>عدد الأكلات: "+Object.keys(state.scores||{}).map(function(k){return "@"+esc(k)+": "+state.scores[k]}).join(" · ")+"</p></div>";
        }else if(lobby.game==="maqsor"){
          var mh=state.myHand||[], drawn=state.drawn&&state.drawn[my], scores=state.scores||{};
          controls="<div class='game-controls'><div class='turn-box "+(isMyTurn?"my-turn":"")+"'>الدور الآن: <b>"+esc(seatName(lobby.currentPlayer))+"</b></div><p class='muted'>النقاط: "+(scores[my]||0)+" · التصفيرات: "+((state.zeros&&state.zeros[my])||0)+" · الجولة: "+(state.round||1)+"</p><div class='card-hand maqsor-hand'>"+mh.map(function(card,i){return "<button class='uno-card maqsor-card' data-maqsor-card='"+i+"'><b>"+(card.hidden?"🂠 "+(i+1):esc(card.label))+"</b><small>"+(card.hidden?"مخفي":"قيمة "+(card.rank==="K"?0:card.rank==="JOKER"?20:card.rank==="J"?11:card.rank==="Q"?12:card.rank==="A"?1:Number(card.rank)))+"</small></button>"}).join("")+"</div>"+(drawn?"<p class='muted'>المسحوبة: <b>"+esc(drawn.label)+"</b> — اضغط ورقة لتبديلها أو استخدم زر الوطي.</p>":"")+"<div class='maqsor-actions'><button class='primary' id='maqsor-draw' "+(!isMyTurn||drawn?"disabled":"")+">سحب من الخبيصة</button><button class='platform-link' id='maqsor-take' "+(!isMyTurn||drawn?"disabled":"")+">أخذ المرمية</button><button class='platform-link' id='maqsor-qawsar' "+(!isMyTurn||drawn?"disabled":"")+">قوصر</button></div><p class='muted small'>الحرق بالقيمة فقط؛ 8 و9 تكشفان ورقة ذاتية، 9 الأحمر يكشف أي ورقة، والولد الأحمر يبدّل ورقتين.</p></div>";
        }else{
          var pieces=(state.pieces&&state.pieces[my])||[];
          var extra=lobby.game==="monopoly"?"<p class='muted'>رصيدك: 💰 "+(state.money&&state.money[my]||0)+" · موقعك: "+(state.positions&&state.positions[my]||0)+"</p>":"<p class='muted'>رمية النرد: "+(state.lastRoll||"—")+"</p>";
          controls="<div class='game-controls'><div class='turn-box "+(isMyTurn?"my-turn":"")+"'>الدور الآن: <b>"+esc(seatName(lobby.currentPlayer))+"</b></div>"+extra+"<button class='primary' id='roll-game' "+(!isMyTurn?"disabled":"")+">🎲 رمي النرد</button>"+(lobby.game==="monopoly"?"<button class='platform-link' id='buy-property' "+(!isMyTurn?"disabled":"")+">شراء العقار</button>":"")+"<div class='piece-row'>"+pieces.map(function(pos,i){return "<button class='platform-link move-piece' data-piece='"+i+"' "+(!isMyTurn?"disabled":"")+">قطعة "+(i+1)+" · "+pos+"</button>"}).join("")+"</div></div>";
        }
      }else{
        controls="<div class='game-controls'><div class='turn-box'>"+(lobby.players.length+"/"+lobby.maxPlayers)+" مقاعد مشغولة</div><p class='muted'>اضغط «اختبار المقاعد» لملء المقاعد مؤقتًا، أو دع اللاعبين يدخلون بأنفسهم.</p></div>";
      }
      var board="";
      if(started){
        if(lobby.game==="uno") board="<div class='game-board uno-board'><div class='board-status'><b>UNO</b><span>اللون: "+esc(state.currentColor||"-")+"</span></div><div class='board-piles'><div class='pile deck-pile'>🂠<small>الخبيصة</small></div><div class='pile discard-pile'>"+(state.discard&&state.discard.length?esc((state.discard[state.discard.length-1].value||"ورقة")):"—")+"<small>المرمية</small></div></div></div>";
        else if(lobby.game==="baloot") board="<div class='game-board cards-board'><div class='board-status'><b>بلوت</b><span>النوع: "+esc(state.trickSuit||"لم يبدأ")+"</span></div><div class='board-piles'><div class='pile deck-pile'>🂠<small>الأوراق</small></div><div class='pile discard-pile'>"+(state.trick&&state.trick.length?esc(state.trick[state.trick.length-1].label):"—")+"<small>الأكلة</small></div></div></div>";
        else if(lobby.game==="maqsor") board="<div class='game-board cards-board'><div class='board-status'><b>مقوصر</b><span>الجولة "+esc(state.round||1)+"</span></div><div class='board-piles'><div class='pile deck-pile'>🂠<small>الخبيصة</small></div><div class='pile discard-pile'>"+(state.discard&&state.discard.length?esc(state.discard[state.discard.length-1].label):"—")+"<small>المرمية</small></div></div></div>";
        else if(["ludo","jackaroo"].includes(lobby.game)) board="<div class='game-board board-game'><div class='board-status'><b>"+esc(gameLabel(lobby.game))+"</b><span>النرد: "+esc(state.lastRoll||"—")+"</span></div><div class='board-track'>"+Array.from({length:24},function(_,i){return "<i>"+(i+1)+"</i>"}).join("")+"</div></div>";
        else if(lobby.game==="monopoly") board="<div class='game-board board-game monopoly-board'><div class='board-status'><b>مونوبولي</b><span>الموقع: "+esc(state.positions&&state.positions[my]||0)+" · الرصيد: "+esc(state.money&&state.money[my]||0)+"</span></div><div class='property-ring'>"+Array.from({length:20},function(_,i){return "<i>"+(i+1)+"</i>"}).join("")+"</div></div>";
      }
      show(gameLabel(lobby.game)," <div class='mld-table-page'><div class='platform-head'><div><span class='eyebrow'>MLD PRIVATE TABLE</span><h2>طاولة ملاذ · "+esc(gameLabel(lobby.game))+"</h2><p class='muted'>كل لاعب له مكانه، والأوراق المخفية لا تظهر للاعبين الآخرين.</p></div><div class='table-head-actions'><button class='platform-link' id='fullscreen-game'>⛶ تكبير اللعبة</button><button class='platform-link' id='back-games'>رجوع للألعاب</button></div></div><div class='mld-table' id='game-stage'><div class='table-badge'>"+(started?"🎮 اللعب بدأ":"🪑 انتظار اللاعبين")+"</div><div class='table-top'><span>المضيف: @"+esc(lobby.host)+"</span><span>الحالة: "+esc(lobby.status)+"</span><span>"+lobby.players.length+"/"+lobby.maxPlayers+" لاعبين</span></div><div class='table-layout'><div class='seat-grid'>"+seats+"</div><div class='table-center'>"+board+"<div class='table-turn'>"+(started?"دور "+esc(seatName(lobby.currentPlayer)):"طاولة ملاذ الخاصة")+"</div><small>"+(state.lastAction?esc(state.lastAction.by)+" · "+esc(state.lastAction.type):"جاهزة للبدء")+"</small></div></div></div>"+controls+"<div class='table-actions'>"+(!started&&lobby.host===my?"<button class='platform-link' id='test-seats'>🧪 اختبار المقاعد</button><button class='primary' id='start-game' "+(lobby.players.length<2?"disabled":"")+">▶ بدء اللعبة</button>":"")+"<button class='platform-link' id='refresh-room'>تحديث</button>"+(!started?"<button class='platform-link danger-link' id='leave-table'>مغادرة الطاولة</button>":"")+"<button class='platform-link danger-link' id='close-table'>إغلاق الطاولة</button></div><div class='spectators'><h3>المشاهدون</h3><p class='muted'>"+((lobby.spectators||[]).map(function(x){return "👀 @"+esc(x)}).join(" · ")||"لا يوجد مشاهدون")+"</p></div></div>");
      $("#back-games").onclick=gamesView;
      var fs=$("#fullscreen-game"),stage=$("#game-stage");
      if(fs&&stage)fs.onclick=function(){
        if(document.fullscreenElement){document.exitFullscreen&&document.exitFullscreen().catch(function(){});}
        else if(stage.requestFullscreen){stage.requestFullscreen({navigationUI:"hide"}).catch(function(){stage.classList.add("game-maximized");});}
        else stage.classList.add("game-maximized");
      };
      document.addEventListener("fullscreenchange",function(){if(!document.fullscreenElement&&stage)stage.classList.remove("game-maximized");});
      var minGame=$("#game-stage"); if(minGame)minGame.addEventListener("dblclick",function(){if(this.classList.contains("game-maximized"))this.classList.remove("game-maximized");});

      $("#refresh-room").onclick=function(){api("/api/platform/lobbies/"+lobby.id).catch(function(){}) ; api("/api/platform/lobbies").then(function(d){var found=d.lobbies.find(function(x){return x.id===lobby.id});if(found)render(found);else gamesView();}).catch(function(e){alert(e.message)})};
      var test=$("#test-seats");if(test)test.onclick=function(){api("/api/platform/lobbies/"+lobby.id+"/test-seats",{method:"POST",body:JSON.stringify({count:lobby.maxPlayers-1})}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
      var start=$("#start-game");if(start)start.onclick=function(){api("/api/platform/lobbies/"+lobby.id+"/start",{method:"POST"}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
      var leave=$("#leave-table");if(leave)leave.onclick=function(){api("/api/platform/lobbies/"+lobby.id+"/leave",{method:"POST"}).then(gamesView).catch(function(e){alert(e.message)})};
      var close=$("#close-table");if(close)close.onclick=function(){if(confirm("إغلاق الطاولة؟"))api("/api/platform/lobbies/"+lobby.id,{method:"DELETE"}).then(gamesView).catch(function(e){alert(e.message)})};
      document.querySelectorAll(".seat-join").forEach(function(b){b.onclick=function(){api("/api/platform/lobbies/"+lobby.id+"/join",{method:"POST"}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})}});
      if(started&&isMyTurn&&!state.winner){
        var roll=$("#roll-game");if(roll)roll.onclick=function(){gameAction(lobby.id,"roll").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
        document.querySelectorAll(".move-piece").forEach(function(b){b.onclick=function(){gameAction(lobby.id,"move",{piece:Number(b.dataset.piece)}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})}});
        var buy=$("#buy-property");if(buy)buy.onclick=function(){gameAction(lobby.id,"buy").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
        document.querySelectorAll("[data-card]").forEach(function(b){b.onclick=function(){var color="";var card=(state.myHand||[])[Number(b.dataset.card)];if(card&&card.color==="wild")color=prompt("اختر اللون: أحمر / أزرق / أخضر / أصفر","أحمر")||"أحمر";gameAction(lobby.id,"play",{cardIndex:Number(b.dataset.card),color:color}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})}});
        document.querySelectorAll("[data-baloot-card]").forEach(function(b){b.onclick=function(){gameAction(lobby.id,"play-card",{cardIndex:Number(b.dataset.balootCard)}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})}});
        var draw=$("#uno-draw");if(draw)draw.onclick=function(){gameAction(lobby.id,"draw").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
        var md=$("#maqsor-draw");if(md)md.onclick=function(){gameAction(lobby.id,"draw").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
        var mt=$("#maqsor-take");if(mt)mt.onclick=function(){gameAction(lobby.id,"take-discard").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
        var mq=$("#maqsor-qawsar");if(mq)mq.onclick=function(){gameAction(lobby.id,"qawsar").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
        document.querySelectorAll("[data-maqsor-card]").forEach(function(b){b.onclick=function(){
          var i=Number(b.dataset.maqsorCard),card=(state.myHand||[])[i];
          if(!isMyTurn)return;
          if(drawn){gameAction(lobby.id,"replace",{index:i}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)});return;}
          if(card&&card.hidden)return;
          if(card&&(card.rank==="8"||card.rank==="9")){
            var t=prompt("اكتب رقم الورقة المخفية التي تريد كشفها (1-4):","3");if(t)gameAction(lobby.id,"reveal-self",{cardIndex:i,targetIndex:Number(t)-1}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)});return;
          }
          if(card&&card.rank==="J"&&["♥","♦"].includes(card.suit)){
            var p=prompt("اكتب يوزر اللاعب الآخر للتبديل:","");var oi=prompt("رقم ورقته 1-4:","1");if(p&&oi)gameAction(lobby.id,"swap",{myIndex:i,player:p,otherIndex:Number(oi)-1}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)});return;
          }
          if(card&&card.rank==="9"&&["♥","♦"].includes(card.suit)){
            var p=prompt("يوزر اللاعب الذي تريد كشف ورقته:","");var oi=prompt("رقم الورقة 1-4:","1");if(p&&oi)gameAction(lobby.id,"reveal-any",{cardIndex:i,player:p,index:Number(oi)-1}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)});return;
          }
          gameAction(lobby.id,"burn",{index:i}).then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)});
        }});
        var discardDrawn=document.querySelector("[data-maqsor-discard]");if(discardDrawn)discardDrawn.onclick=function(){gameAction(lobby.id,"discard-drawn").then(function(d){render(d.lobby)}).catch(function(e){alert(e.message)})};
      }
      var nr=$("#new-from-table");if(nr)nr.onclick=gamesView;
    }
    render(lobby);
    gamePoll=setInterval(function(){api("/api/platform/lobbies").then(function(d){var found=d.lobbies.find(function(x){return x.id===lobby.id});if(found)render(found);else{stopGamePoll();gamesView();}}).catch(function(){})},2500);
  }
  function gamesView(){
    stopGamePoll();
    function publicApi(url){return fetch(url,{headers:{"Content-Type":"application/json"}}).then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"حدث خطأ");return d})})}
    Promise.all([publicApi("/api/platform/games"),publicApi("/api/platform/lobbies")]).then(function(x){
      var g=x[0],l=x[1],my=account&&account.username,mine=my?(l.lobbies||[]).find(function(a){return a.host===my||a.players.indexOf(my)>=0||a.spectators.indexOf(my)>=0}):null;
      var cards=g.games.map(function(a){return "<article class='game-card'><div class='game-icon'>"+a.icon+"</div><h3>"+a.name+"</h3><p>"+a.mode+"</p><p class='muted small'>"+esc(a.description||"")+" </p><button class='primary game-create' data-game='"+a.id+"'>إنشاء طاولة</button></article>"}).join("");
      var ls=l.lobbies.length?l.lobbies.map(function(a){return "<article class='lobby-card'><span class='platform-chip'>"+esc(gameLabel(a.game))+"</span><h3>طاولة @"+esc(a.host)+"</h3><p>🪑 "+a.players.length+"/"+a.maxPlayers+" · 👀 "+a.spectators.length+" · "+(a.started?"بدأت":"انتظار")+"</p><button class='primary' data-join='"+a.id+"' "+(a.started?"disabled":"")+">دخول لاعب</button> <button class='platform-link' data-watch='"+a.id+"'>مشاهدة</button></article>"}).join(""):"<div class='empty'>لا توجد طاولات الآن.</div>";
      show("الألعاب","<div class='platform-head'><div><span class='eyebrow'>MLD GAME TABLES</span><h2>الألعاب الجماعية</h2><p class='muted'>كل لاعب له طاولة ومقعد ودور. لا أحد يأخذ مكان لاعب آخر.</p></div>"+badge()+"</div>"+(mine?"<div class='account-card'><b>طاولتك الحالية</b><p class='muted'>"+esc(gameLabel(mine.game))+" · "+mine.players.length+"/"+mine.maxPlayers+"</p><button class='primary' id='open-my-room'>دخول الطاولة</button></div>":"")+"<div class='game-grid'>"+cards+"</div><div class='lobby-area'><div class='section-mini'><h3>الطاولات الحالية</h3><button class='platform-link' id='refresh-lobbies'>تحديث</button></div><div class='lobby-grid'>"+ls+"</div></div>");
      document.querySelectorAll(".game-create").forEach(function(b){b.onclick=function(){
        if(!need())return;
        var game=g.games.find(function(x){return x.id===b.dataset.game})||{};
        var min=Number(game.minPlayers||2),max=Number(game.maxPlayers||6);
        var options=""; for(var n=min;n<=max;n++) options+="<option value='"+n+"'>"+n+" لاعبين</option>";
        show("إنشاء طاولة","<div class='account-card narrow'><span class='eyebrow'>NEW GAME TABLE</span><h2>"+esc(game.icon||"🎮")+" "+esc(game.name||"لعبة")+"</h2><p class='muted'>اختر عدد المقاعد قبل إنشاء الطاولة. لا يمكن تجاوز العدد المحدد.</p><label>عدد الأشخاص</label><select id='table-player-count' class='full'>"+options+"</select><button class='primary wide' id='confirm-create-table'>إنشاء الطاولة</button><button class='platform-link wide' id='cancel-create-table'>إلغاء</button></div>");
        $("#confirm-create-table").onclick=function(){
          var count=Number($("#table-player-count").value);
          api("/api/platform/lobbies",{method:"POST",body:JSON.stringify({game:b.dataset.game,maxPlayers:count})}).then(function(d){gameRoom(d.lobby)}).catch(function(e){if(e.lobby)gameRoom(e.lobby);else alert(e.message)});
        };
        $("#cancel-create-table").onclick=gamesView;
      }});
      document.querySelectorAll("[data-join]").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/lobbies/"+b.dataset.join+"/join",{method:"POST"}).then(function(d){gameRoom(d.lobby)}).catch(function(e){alert(e.message)})}});
      document.querySelectorAll("[data-watch]").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/lobbies/"+b.dataset.watch+"/spectate",{method:"POST"}).then(function(d){gameRoom(d.lobby)}).catch(function(e){alert(e.message)})}});
      var om=$("#open-my-room");if(om)om.onclick=function(){gameRoom(mine)};
      $("#refresh-lobbies").onclick=gamesView;
    }).catch(function(e){alert(e.message)});
  }
  function groupsView(){
    function publicApi(url){return fetch(url,{headers:{"Content-Type":"application/json"}}).then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"حدث خطأ");return d})})}
    publicApi("/api/platform/groups").then(function(d){
      var list=d.groups.length?d.groups.map(function(g){return "<article class='group-card'><h3>"+esc(g.name)+"</h3><p>"+esc(g.description||"بدون وصف")+"</p><small>👥 "+g.members+" · @"+esc(g.owner)+"</small><button class='platform-link' data-group='"+g.id+"'>انضمام</button></article>"}).join(""):"<div class='empty'>لا توجد مجموعات بعد.</div>";
      show("المجموعات","<div class='platform-head'><div><span class='eyebrow'>MLD GROUPS</span><h2>المجموعات</h2><p class='muted'>مجتمعات صغيرة داخل MLD.</p></div><button class='primary' id='new-group'>+ مجموعة</button></div><div id='group-create' class='account-card hidden'><input id='group-name' class='full' placeholder='اسم المجموعة'><input id='group-desc' class='full' placeholder='وصف مختصر'><button class='primary' id='save-group'>إنشاء</button></div><div class='group-grid'>"+list+"</div>");
      var ng=$("#new-group");if(ng)ng.onclick=function(){if(!need())return;$("#group-create").className=$("#group-create").className.indexOf("hidden")>=0?$("#group-create").className.replace(/\bhidden\b/g,"").trim():$("#group-create").className+" hidden"};
      var sg=$("#save-group");if(sg)sg.onclick=function(){api("/api/platform/groups",{method:"POST",body:JSON.stringify({name:$("#group-name").value,description:$("#group-desc").value})}).then(groupsView).catch(function(e){alert(e.message)})};
      document.querySelectorAll("[data-group]").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/groups/"+b.dataset.group+"/join",{method:"POST"}).then(groupsView).catch(function(e){alert(e.message)})}});
    });
  }
  function adminView(){
    if(!need())return;
    if(!account || !(account.role==="owner" || account.admin===true)){alert("هذه اللوحة للإدارة فقط");return;}
    api("/api/platform/admin").then(function(d){
      var stats=Object.keys(d).map(function(k){return "<div><b>"+esc(d[k])+"</b><small>"+esc(k)+"</small></div>"}).join("");
      show("الإدارة","<div class='platform-head'><div><span class='eyebrow'>STAFF CONTROL</span><h2>لوحة الإدارة</h2><p class='muted'>إحصاءات التشغيل وإدارة المنصة.</p></div>"+badge()+"</div><div class='admin-stats'>"+stats+"</div><div class='account-card'><b>صلاحيات الإدارة</b><p class='muted'>لوحة الأونر الخاصة منفصلة ولا تظهر إلا للحساب المصرح له.</p></div>");
    }).catch(function(e){alert(e.message)});
  }
  function ownerView(){
    if(!need())return;
    if(!account || account.role!=="owner"){alert("هذا القسم للأونر فقط");return;}
    Promise.all([api("/api/platform/admin"),api("/api/platform/logs"),api("/api/platform/announcement"),api("/api/platform/broadcast/channels")]).then(function(x){
      var d=x[0],l=x[1],ann=x[2].announcement||{},bc=x[3].channels||[];
      var stats=Object.keys(d).map(function(k){return "<div><b>"+esc(d[k])+"</b><small>"+esc(k)+"</small></div>"}).join("");
      var logs=(l.logs||[]).map(function(v){return "<div><b>"+esc(v.action)+"</b><span>"+esc(v.details)+"</span><small>"+new Date(v.at).toLocaleString("ar-SA")+"</small></div>"}).join("");
      var channels=bc.map(function(ch){return "<label class=\"check\"><input type=\"checkbox\" class=\"broadcast-channel\" value=\""+esc(ch.id)+"\"> #"+esc(ch.name)+"</label>"}).join("")||"<p class=\"muted\">لا توجد قنوات يمكن للبوت الإرسال فيها.</p>";
      var html="<div class=\"platform-head\"><div><span class=\"eyebrow\">OWNER CONTROL</span><h2>لوحة الأونر</h2><p class=\"muted\">تحكم كامل وسجل المنصة.</p></div>"+badge()+"</div><div class=\"admin-stats\">"+stats+"</div>"+
      "<div class=\"account-card\"><h3>📢 الإعلان العلوي</h3><p class=\"muted\">الإعلان يظهر أعلى الموقع لجميع الزوار.</p><textarea id=\"owner-ann-text\" class=\"full\" maxlength=\"500\" placeholder=\"اكتب الإعلان...\">"+esc(ann.text||"")+"</textarea><label class=\"check\"><input id=\"owner-ann-enabled\" type=\"checkbox\" "+(ann.enabled?"checked":"")+"> تفعيل الإعلان</label><label>لون الإعلان</label><input id=\"owner-ann-color\" class=\"full\" type=\"color\" value=\""+esc(ann.color||"#ff9cdc")+"\"><button class=\"primary\" id=\"save-announcement\">حفظ الإعلان</button></div>"+
      "<div class=\"account-card\"><h3>📣 البرودكاست</h3><p class=\"muted\">اختر طريقة الإرسال من <b>نفس بوت الزاجل</b>: إرسال للقنوات أو إرسال خاص لأعضاء السيرفر.</p><div class=\"bot-system-grid\">"+channels+"</div><textarea id=\"owner-broadcast-text\" class=\"full\" maxlength=\"4000\" placeholder=\"اكتب رسالة البرودكاست...\"></textarea><label class=\"check\"><input id=\"broadcast-everyone\" type=\"checkbox\"> تفعيل @everyone عند الإرسال للقنوات</label><div class=\"bot-command-row\"><button class=\"primary\" id=\"send-broadcast\">إرسال للقنوات</button><button class=\"primary\" id=\"send-broadcast-dm\">📩 إرسال خاص للأعضاء</button></div><p id=\"broadcast-result\" class=\"muted small\"></p></div>"+
      "<div class=\"log-list\">"+(logs||"<div class=\"empty\">لا توجد سجلات.</div>")+"</div>";
      show("الأونر",html);
      $("#save-announcement").onclick=function(){var btn=$("#save-announcement");btn.disabled=true;api("/api/platform/announcement",{method:"POST",body:JSON.stringify({text:$("#owner-ann-text").value,enabled:$("#owner-ann-enabled").checked,color:$("#owner-ann-color").value})}).then(function(){alert("تم حفظ الإعلان العلوي.");if(typeof loadAnnouncement==="function")loadAnnouncement();}).catch(function(e){alert(e.message)}).finally(function(){btn.disabled=false});};
      $("#send-broadcast").onclick=function(){var ids=[];document.querySelectorAll(".broadcast-channel:checked").forEach(function(z){ids.push(z.value)});var msg=$("#owner-broadcast-text").value.trim();if(!ids.length)return alert("اختر قناة واحدة على الأقل");if(!msg)return alert("اكتب رسالة البرودكاست");var btn=$("#send-broadcast");btn.disabled=true;btn.textContent="جاري الإرسال...";api("/api/platform/broadcast",{method:"POST",body:JSON.stringify({channelIds:ids,message:msg,mentionEveryone:$("#broadcast-everyone").checked})}).then(function(v){$("#broadcast-result").textContent="تم الإرسال بنجاح إلى "+v.sentCount+" قناة ✓";$("#owner-broadcast-text").value=""}).catch(function(e){$("#broadcast-result").textContent=e.message}).finally(function(){btn.disabled=false;btn.textContent="إرسال البرودكاست"});};
      $("#send-broadcast-dm").onclick=function(){var msg=$("#owner-broadcast-text").value.trim();if(!msg)return alert("اكتب رسالة البرودكاست");if(!confirm("سيتم إرسال الرسالة خاصًا إلى جميع أعضاء السيرفر باستخدام نفس بوت الزاجل. المتابعة؟"))return;var btn=$("#send-broadcast-dm");btn.disabled=true;btn.textContent="جاري البدء...";api("/api/platform/broadcast/dm",{method:"POST",body:JSON.stringify({message:msg})}).then(function(v){$("#broadcast-result").textContent="بدأ الإرسال: "+v.job.total+" عضو. جاري المتابعة...";$("#owner-broadcast-text").value="";var job=v.job.id;var poll=setInterval(function(){api("/api/platform/broadcast/dm/"+job).then(function(x){var j=x.job;$("#broadcast-result").textContent=(j.status==="completed"?"اكتمل":"جاري الإرسال")+" — تم "+j.sent+" · تعذر "+j.failed+" · الإجمالي "+j.total+(j.status==="completed"?" ✓":"");if(j.status!=="running"){clearInterval(poll);btn.disabled=false;btn.textContent="📩 إرسال خاص للأعضاء";}}).catch(function(e){clearInterval(poll);$("#broadcast-result").textContent=e.message;btn.disabled=false;btn.textContent="📩 إرسال خاص للأعضاء";});},1500)}).catch(function(e){$("#broadcast-result").textContent=e.message;btn.disabled=false;btn.textContent="📩 إرسال خاص للأعضاء"});};
    }).catch(function(e){alert(e.message)});
  }
  function profileView(){
    if(!need())return;
    show("بروفايلي","<div class='account-card narrow'><span class='eyebrow'>MY PROFILE</span><h2>بروفايلي</h2><p class='muted'>تعديل بيانات ظهورك داخل الموقع.</p><label>الاسم</label><input id='profile-name' class='full' value='"+esc(account.profileName||account.username)+"'><label>الأفتار</label><input id='profile-avatar' class='full' placeholder='رابط الصورة' value='"+esc(account.avatar||"")+"'><label>النبذة</label><textarea id='profile-bio' class='full' placeholder='نبذتك...'>"+esc(account.bio||"")+"</textarea><button class='primary wide' id='save-profile'>حفظ التعديلات</button></div>");
    $("#save-profile").onclick=function(){api("/api/platform/profile",{method:"POST",body:JSON.stringify({profileName:$("#profile-name").value,avatar:$("#profile-avatar").value,bio:$("#profile-bio").value})}).then(function(d){account=d.account;alert("تم حفظ بروفايلك.");profileView()}).catch(function(e){alert(e.message)})};
  }
  function chatView(){
    if(!need())return;
    Promise.all([api("/api/platform/chat/general"),api("/api/platform/chat/rooms")]).then(function(x){
      var general=x[0].messages||[], rooms=x[1].rooms||[];
      var generalHtml=general.map(function(m){return "<div class='chat-msg'><b>@"+esc(m.username)+"</b><p>"+esc(m.message)+"</p></div>"}).join("")||"<div class='empty'>لا توجد رسائل بعد.</div>";
      var roomHtml=rooms.map(function(r){return "<article class='group-card'><h3>"+esc(r.name)+"</h3><small>المالك: @"+esc(r.owner)+" · "+r.members.length+" أعضاء</small><div class='chat-msgs'>"+r.messages.map(function(m){return "<p><b>@"+esc(m.username)+"</b> "+esc(m.message)+"</p>"}).join("")+"</div><input class='full room-msg' data-room='"+r.id+"' placeholder='اكتب رسالة'><button class='primary send-room' data-room='"+r.id+"'>إرسال</button></article>"}).join("");
      show("الشات","<div class='platform-head'><div><span class='eyebrow'>MLD CHAT</span><h2>الشات</h2><p class='muted'>شات عام للجميع + شاتات خاصة بين الحسابات.</p></div><button class='primary' id='new-room'>+ شات خاص</button></div><div class='account-card'><h3>🌐 الشات العام</h3><div class='chat-msgs'>"+generalHtml+"</div><div class='bot-command-row'><input id='general-msg' class='full' placeholder='اكتب رسالتك'><button class='primary' id='send-general'>إرسال</button></div></div><h3>شاتاتي الخاصة</h3><div class='group-grid'>"+(roomHtml||"<div class='empty'>ما عندك شات خاص.</div>")+"</div>");
      $("#send-general").onclick=function(){api("/api/platform/chat/general",{method:"POST",body:JSON.stringify({message:$("#general-msg").value})}).then(chatView).catch(function(e){alert(e.message)})};
      $("#new-room").onclick=function(){var names=prompt("اكتب يوزرات الأشخاص المسجلين مفصولة بفاصلة:");if(!names)return;var members=names.split(",").map(function(x){return x.trim()}).filter(Boolean);var name=prompt("اسم الشات:","شات خاص");api("/api/platform/chat/rooms",{method:"POST",body:JSON.stringify({members:members,name:name})}).then(chatView).catch(function(e){alert(e.message)})};
      document.querySelectorAll(".send-room").forEach(function(b){b.onclick=function(){var inp=document.querySelector(".room-msg[data-room='"+b.dataset.room+"']");api("/api/platform/chat/rooms/"+b.dataset.room+"/message",{method:"POST",body:JSON.stringify({message:inp.value})}).then(chatView).catch(function(e){alert(e.message)})}});
    }).catch(function(e){alert(e.message)});
  }
  function logoutView(){api("/api/platform/logout",{method:"POST"}).catch(function(){}).finally(function(){token="";account=null;localStorage.removeItem("mld_token");location.hash="#top";location.reload()});}
  function homeView(){stopGamePoll();panel.className="panel platform-panel hidden";$("#directory").className="panel hidden";var rev=document.querySelector(".reviews-section");if(rev)rev.style.display="block";location.hash="#top";window.scrollTo({top:0,behavior:"smooth"});}
  document.querySelectorAll("[data-home]").forEach(function(b){b.onclick=function(){homeView();var m=$("#mobile-menu");if(m)m.classList.remove("open");window.location.hash="#top";}});
  document.querySelectorAll("[data-profile]").forEach(function(b){b.onclick=profileView});
  document.querySelectorAll("[data-chat]").forEach(function(b){b.onclick=chatView});
  function pigeonView(){
    if(!need())return;
    show("الزاجل","<div class='message-box'><div class='message-icon'>✦</div><h3>الزاجل</h3><p class='muted'>ابحث عن عضو من سيرفر MLD، اختره، ثم أرسل رسالتك باسمك أو كمجهول.</p><input id='pigeon-search' class='full' placeholder='ابحث باسم العضو أو اليوزر...' autocomplete='off'><div id='pigeon-results' class='recipient-results'></div><div id='pigeon-selected' class='muted small'>لم يتم اختيار مستلم.</div><label class='check'><input id='pigeon-anon' type='checkbox'> إرسال كمجهول</label><input id='pigeon-name' class='full' maxlength='60' placeholder='اسم المرسل إذا اخترت الاسم الظاهر'><textarea id='pigeon-text' class='full' maxlength='2000' placeholder='اكتب رسالتك...'></textarea><p id='pigeon-status'></p><button class='primary wide' id='pigeon-send'>إرسال الزاجل</button></div>");
    var selected=null, timer;
    var ps=$("#pigeon-search");
    ps.oninput=function(){clearTimeout(timer);var q=ps.value.trim();selected=null;$("#pigeon-selected").textContent="جاري البحث...";if(q.length<2){$("#pigeon-results").innerHTML="";$("#pigeon-selected").textContent="اكتب حرفين على الأقل";return;}timer=setTimeout(function(){api("/api/public/members?q="+encodeURIComponent(q)).then(function(d){$("#pigeon-results").innerHTML=(d.members||[]).slice(0,8).map(function(m){return "<button class='recipient' data-pigeon-id='"+esc(m.id)+"'><img src='"+esc(m.avatar||"/logo.svg.JPG")+"'><span>"+esc(m.name)+"<small>@"+esc(m.username||"")+"</small></span></button>"}).join("")||"<span class='muted'>لا يوجد عضو مطابق</span>";document.querySelectorAll("[data-pigeon-id]").forEach(function(x){x.onclick=function(){selected={id:x.dataset.pigeonId,name:x.textContent};ps.value=x.textContent;$("#pigeon-results").innerHTML="<b class='selected'>تم اختيار المستلم ✓</b>";$("#pigeon-selected").textContent="المستلم: "+x.textContent;};});}).catch(function(e){$("#pigeon-status").textContent=e.message;});},250);};
    $("#pigeon-anon").onchange=function(){var a=$("#pigeon-anon").checked;$("#pigeon-name").classList.toggle("hidden",a);};
    $("#pigeon-send").onclick=function(){var st=$("#pigeon-status"),btn=$("#pigeon-send"),msg=$("#pigeon-text").value.trim(),anon=$("#pigeon-anon").checked,name=$("#pigeon-name").value.trim();if(!selected){st.textContent="اختر عضوًا أولًا";return;}if(!msg){st.textContent="اكتب الرسالة أولًا";return;}if(!anon&&!name){st.textContent="اكتب اسم المرسل أو فعّل الإرسال كمجهول";return;}btn.disabled=true;api("/api/public/message",{method:"POST",body:JSON.stringify({memberId:selected.id,title:"زاجل من MLD",message:anon?"مرسل مجهول\n\n"+msg:"من: "+name+"\n\n"+msg})}).then(function(){st.textContent="تم إرسال الزاجل بنجاح ✓";$("#pigeon-text").value="";}).catch(function(e){st.textContent=e.message;}).finally(function(){btn.disabled=false;});};
  }
  document.querySelectorAll("[data-pigeon]").forEach(function(b){b.onclick=function(){pigeonView();var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim();};});
  document.querySelectorAll("[data-logout]").forEach(function(b){b.onclick=function(){if(account)logoutView();else{loginView();var m=$("#mobile-menu");if(m)m.classList.remove("open");}}});
  document.querySelectorAll("[data-login]").forEach(function(b){b.onclick=function(){loginView();var m=$("#mobile-menu");if(m)m.classList.remove("open");}});
  document.querySelectorAll("[data-owner]").forEach(function(b){b.onclick=function(){if(!need())return;ownerView();var m=$("#mobile-menu");if(m)m.classList.remove("open");};});
  function updateOwnerMenu(){
    var logged=!!account;
    var isOwner=logged && account.role==="owner";
    var isAdmin=logged && (account.role==="owner" || account.admin===true);
    document.querySelectorAll(".logged-only").forEach(function(b){b.classList.toggle("hidden",!logged);});
    document.querySelectorAll(".guest-only,[data-login]").forEach(function(b){b.classList.toggle("guest-hidden",logged);});
    document.querySelectorAll(".admin-only").forEach(function(b){
      if(isAdmin){b.classList.remove("hidden");b.style.removeProperty("display");b.setAttribute("aria-hidden","false");}
      else{b.classList.add("hidden");b.style.setProperty("display","none","important");b.setAttribute("aria-hidden","true");}
    });
    document.querySelectorAll(".owner-only,.owner-menu,[data-owner]").forEach(function(b){
      if(isOwner){b.classList.remove("hidden");b.style.removeProperty("display");b.setAttribute("aria-hidden","false");}
      else{b.classList.add("hidden");b.style.setProperty("display","none","important");b.setAttribute("aria-hidden","true");}
    });
  }
  document.querySelectorAll("[data-platform]").forEach(function(b){b.onclick=function(){if(b.dataset.platform==="account"&&!need())return;if(b.dataset.platform==="account")accountView();if(b.dataset.platform==="games")gamesView();if(b.dataset.platform==="groups")groupsView();if(b.dataset.platform==="admin"){if(!need())return;adminView();}var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim()}});
  updateOwnerMenu();
  if(token)api("/api/platform/me").then(function(d){account=d.account;localStorage.setItem("mld_account",JSON.stringify(account));updateOwnerMenu();}).catch(function(){updateOwnerMenu();});
  updateOwnerMenu();
  window.MLDPlatform={accountView:accountView,loginView:loginView,gamesView:gamesView,groupsView:groupsView,adminView:adminView,ownerView:ownerView,profileView:profileView,chatView:chatView,refreshMenu:updateOwnerMenu};
})();