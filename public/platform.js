
"use strict";
(function(){
  var $=function(s){return document.querySelector(s)};
  var panel=$("#platform");
  var token=localStorage.getItem("mld_token")||"";
  var account=null;
  var names={"baloot":"بلوت","uno":"UNO","jackaroo":"جاكارو","ludo":"لودو","monopoly":"مونوبولي"};
  if(!panel)return;
  function esc(v){return String(v==null?"":v).replace(/[&<>\"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
  function api(url,opt){opt=opt||{};opt.headers=Object.assign({"Content-Type":"application/json"},opt.headers||{});if(token)opt.headers.Authorization="Bearer "+token;return fetch(url,opt).then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"حدث خطأ");return d})})}
  function show(title,html){panel.className=panel.className.replace(/\bhidden\b/g,"").trim();$("#directory").className+=" hidden";$("#view-title").textContent=title;$("#subtitle").textContent="منصة MLD";panel.innerHTML=html}
  function badge(){return account?"<span class='platform-chip "+(account.role==="owner"?"owner":"")+"'>@"+esc(account.username)+" · "+(account.role==="owner"?"OWNER":"عضو")+"</span>":"<span class='platform-chip'>زائر</span>"}
  function need(){if(account)return true;accountView();return false}
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
            if(v.status==="confirmed"){clearInterval(poll);token=v.token;account=v.account;localStorage.setItem("mld_token",token);updateOwnerMenu();accountView();}
            else if(v.status==="cancelled"){clearInterval(poll);$("#pending-status").textContent="❌ تم إلغاء إنشاء الحساب. لم يتم إنشاء أي حساب.";create.disabled=false;create.textContent="إرسال طلب إنشاء الحساب";}\n            else if(attempts>=60){clearInterval(poll);$("#pending-status").textContent="انتهت مهلة التأكيد. اضغط إنشاء الحساب للمحاولة من جديد.";create.disabled=false;create.textContent="إرسال طلب إنشاء الحساب";}
          }).catch(function(){});
          if(attempts>=60)clearInterval(poll);
        },5000);
      }).catch(function(e){alert(e.message);create.disabled=false;create.textContent="إرسال طلب إنشاء الحساب";});
    };
    var login=$("#show-login");if(login)login.onclick=loginView;
    var logout=$("#logout");if(logout)logout.onclick=function(){api("/api/platform/logout",{method:"POST"}).catch(function(){}).finally(function(){token="";account=null;localStorage.removeItem("mld_token");accountView()})};
  }
  function loginView(){
    show("تسجيل الدخول","<div class='account-card narrow'><span class='eyebrow'>WELCOME BACK</span><h2>تسجيل الدخول</h2><input id='login-user' class='full' placeholder='اسم المستخدم'><input id='login-pass' class='full' type='password' placeholder='كلمة المرور'><button class='primary wide' id='login'>دخول</button><button class='platform-link' id='new-account'>إنشاء حساب جديد</button></div>");
    $("#login").onclick=function(){api("/api/platform/login",{method:"POST",body:JSON.stringify({username:$("#login-user").value,password:$("#login-pass").value})}).then(function(d){token=d.token;account=d.account;localStorage.setItem("mld_token",token);updateOwnerMenu();accountView()}).catch(function(e){alert(e.message)})};
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
        }else{
          var pieces=(state.pieces&&state.pieces[my])||[];
          var extra=lobby.game==="monopoly"?"<p class='muted'>رصيدك: 💰 "+(state.money&&state.money[my]||0)+" · موقعك: "+(state.positions&&state.positions[my]||0)+"</p>":"<p class='muted'>رمية النرد: "+(state.lastRoll||"—")+"</p>";
          controls="<div class='game-controls'><div class='turn-box "+(isMyTurn?"my-turn":"")+"'>الدور الآن: <b>"+esc(seatName(lobby.currentPlayer))+"</b></div>"+extra+"<button class='primary' id='roll-game' "+(!isMyTurn?"disabled":"")+">🎲 رمي النرد</button>"+(lobby.game==="monopoly"?"<button class='platform-link' id='buy-property' "+(!isMyTurn?"disabled":"")+">شراء العقار</button>":"")+"<div class='piece-row'>"+pieces.map(function(pos,i){return "<button class='platform-link move-piece' data-piece='"+i+"' "+(!isMyTurn?"disabled":"")+">قطعة "+(i+1)+" · "+pos+"</button>"}).join("")+"</div></div>";
        }
      }else{
        controls="<div class='game-controls'><div class='turn-box'>"+(lobby.players.length+"/"+lobby.maxPlayers)+" مقاعد مشغولة</div><p class='muted'>اضغط «اختبار المقاعد» لملء المقاعد مؤقتًا، أو دع اللاعبين يدخلون بأنفسهم.</p></div>";
      }
      show(gameLabel(lobby.game)," <div class='mld-table-page'><div class='platform-head'><div><span class='eyebrow'>MLD PRIVATE TABLE</span><h2>طاولة ملاذ · "+esc(gameLabel(lobby.game))+"</h2><p class='muted'>كل لاعب له مقعد ودور وصلاحيات مستقلة.</p></div><button class='platform-link' id='back-games'>رجوع للألعاب</button></div><div class='mld-table'><div class='table-badge'>"+(started?"🎮 اللعب بدأ":"🪑 انتظار اللاعبين")+"</div><div class='table-top'><span>المضيف: @"+esc(lobby.host)+"</span><span>الحالة: "+esc(lobby.status)+"</span><span>"+lobby.players.length+"/"+lobby.maxPlayers+" لاعبين</span></div><div class='seat-grid'>"+seats+"</div><div class='table-center'>"+(started?"دور "+esc(seatName(lobby.currentPlayer)):"طاولة ملاذ الخاصة")+"<small>"+(state.lastAction?esc(state.lastAction.by)+" · "+esc(state.lastAction.type):"جاهزة للبدء")+"</small></div></div>"+controls+"<div class='table-actions'>"+(!started&&lobby.host===my?"<button class='platform-link' id='test-seats'>🧪 اختبار المقاعد</button><button class='primary' id='start-game' "+(lobby.players.length<2?"disabled":"")+">▶ بدء اللعبة</button>":"")+"<button class='platform-link' id='refresh-room'>تحديث</button>"+(!started?"<button class='platform-link danger-link' id='leave-table'>مغادرة الطاولة</button>":"")+"<button class='platform-link danger-link' id='close-table'>إغلاق الطاولة</button></div><div class='spectators'><h3>المشاهدون</h3><p class='muted'>"+((lobby.spectators||[]).map(function(x){return "👀 @"+esc(x)}).join(" · ")||"لا يوجد مشاهدون")+"</p></div></div>");
      $("#back-games").onclick=gamesView;
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
      }
      var nr=$("#new-from-table");if(nr)nr.onclick=gamesView;
    }
    render(lobby);
    gamePoll=setInterval(function(){api("/api/platform/lobbies").then(function(d){var found=d.lobbies.find(function(x){return x.id===lobby.id});if(found)render(found);else{stopGamePoll();gamesView();}}).catch(function(){})},2500);
  }
  function gamesView(){
    if(!need())return;
    stopGamePoll();
    Promise.all([api("/api/platform/games"),api("/api/platform/lobbies")]).then(function(x){
      var g=x[0],l=x[1],mine=(l.lobbies||[]).find(function(a){return a.host===account.username||a.players.indexOf(account.username)>=0||a.spectators.indexOf(account.username)>=0});
      var cards=g.games.map(function(a){return "<article class='game-card'><div class='game-icon'>"+a.icon+"</div><h3>"+a.name+"</h3><p>"+a.mode+"</p><p class='muted small'>"+esc(a.description||"")+" </p><button class='primary game-create' data-game='"+a.id+"'>إنشاء طاولة</button></article>"}).join("");
      var ls=l.lobbies.length?l.lobbies.map(function(a){return "<article class='lobby-card'><span class='platform-chip'>"+esc(gameLabel(a.game))+"</span><h3>طاولة @"+esc(a.host)+"</h3><p>🪑 "+a.players.length+"/"+a.maxPlayers+" · 👀 "+a.spectators.length+" · "+(a.started?"بدأت":"انتظار")+"</p><button class='primary' data-join='"+a.id+"' "+(a.started?"disabled":"")+">دخول لاعب</button> <button class='platform-link' data-watch='"+a.id+"'>مشاهدة</button></article>"}).join(""):"<div class='empty'>لا توجد طاولات الآن.</div>";
      show("الألعاب","<div class='platform-head'><div><span class='eyebrow'>MLD GAME TABLES</span><h2>الألعاب الجماعية</h2><p class='muted'>كل لاعب له طاولة ومقعد ودور. لا أحد يأخذ مكان لاعب آخر.</p></div>"+badge()+"</div>"+(mine?"<div class='account-card'><b>طاولتك الحالية</b><p class='muted'>"+esc(gameLabel(mine.game))+" · "+mine.players.length+"/"+mine.maxPlayers+"</p><button class='primary' id='open-my-room'>دخول الطاولة</button></div>":"")+"<div class='game-grid'>"+cards+"</div><div class='lobby-area'><div class='section-mini'><h3>الطاولات الحالية</h3><button class='platform-link' id='refresh-lobbies'>تحديث</button></div><div class='lobby-grid'>"+ls+"</div></div>");
      document.querySelectorAll(".game-create").forEach(function(b){b.onclick=function(){api("/api/platform/lobbies",{method:"POST",body:JSON.stringify({game:b.dataset.game})}).then(function(d){gameRoom(d.lobby)}).catch(function(e){if(e.lobby)gameRoom(e.lobby);else alert(e.message)})}});
      document.querySelectorAll("[data-join]").forEach(function(b){b.onclick=function(){api("/api/platform/lobbies/"+b.dataset.join+"/join",{method:"POST"}).then(function(d){gameRoom(d.lobby)}).catch(function(e){alert(e.message)})}});
      document.querySelectorAll("[data-watch]").forEach(function(b){b.onclick=function(){api("/api/platform/lobbies/"+b.dataset.watch+"/spectate",{method:"POST"}).then(function(d){gameRoom(d.lobby)}).catch(function(e){alert(e.message)})}});
      var om=$("#open-my-room");if(om)om.onclick=function(){gameRoom(mine)};
      $("#refresh-lobbies").onclick=gamesView;
    }).catch(function(e){alert(e.message)});
  }
  function groupsView(){
    api("/api/platform/groups").then(function(d){
      var list=d.groups.length?d.groups.map(function(g){return "<article class='group-card'><h3>"+esc(g.name)+"</h3><p>"+esc(g.description||"بدون وصف")+"</p><small>👥 "+g.members+" · @"+esc(g.owner)+"</small><button class='platform-link' data-group='"+g.id+"'>انضمام</button></article>"}).join(""):"<div class='empty'>لا توجد مجموعات بعد.</div>";
      show("المجموعات","<div class='platform-head'><div><span class='eyebrow'>MLD GROUPS</span><h2>المجموعات</h2><p class='muted'>مجتمعات صغيرة داخل MLD.</p></div>"+(account?"<button class='primary' id='new-group'>+ مجموعة</button>":"")+"</div><div id='group-create' class='account-card hidden'><input id='group-name' class='full' placeholder='اسم المجموعة'><input id='group-desc' class='full' placeholder='وصف مختصر'><button class='primary' id='save-group'>إنشاء</button></div><div class='group-grid'>"+list+"</div>");
      var ng=$("#new-group");if(ng)ng.onclick=function(){$("#group-create").className=$("#group-create").className.indexOf("hidden")>=0?$("#group-create").className.replace(/\bhidden\b/g,"").trim():$("#group-create").className+" hidden"};
      var sg=$("#save-group");if(sg)sg.onclick=function(){api("/api/platform/groups",{method:"POST",body:JSON.stringify({name:$("#group-name").value,description:$("#group-desc").value})}).then(groupsView).catch(function(e){alert(e.message)})};
      document.querySelectorAll("[data-group]").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/groups/"+b.dataset.group+"/join",{method:"POST"}).then(groupsView).catch(function(e){alert(e.message)})}});
    });
  }
  function adminView(){
    if(!need())return;
    api("/api/platform/admin").then(function(d){return api("/api/platform/logs").then(function(l){
      var stats=Object.keys(d).map(function(k){return "<div><b>"+esc(d[k])+"</b><small>"+esc(k)+"</small></div>"}).join("");
      var logs=l.logs.map(function(x){return "<div><b>"+esc(x.action)+"</b><span>"+esc(x.details)+"</span><small>"+new Date(x.at).toLocaleString("ar-SA")+"</small></div>"}).join("");
      show("الإدارة","<div class='platform-head'><div><span class='eyebrow'>OWNER CONTROL</span><h2>لوحة الأونر</h2><p class='muted'>إحصاءات المنصة والسجل.</p></div>"+badge()+"</div><div class='admin-stats'>"+stats+"</div><div class='log-list'>"+(logs||"<div class='empty'>لا توجد سجلات.</div>")+"</div>");
    })}).catch(function(e){alert(e.message)});
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
  function homeView(){panel.className="panel platform-panel hidden";$("#directory").className=$("#directory").className.replace(/\bhidden\b/g,"").trim();window.scrollTo({top:0,behavior:"smooth"});}
  document.querySelectorAll("[data-home]").forEach(function(b){b.onclick=homeView});
  document.querySelectorAll("[data-profile]").forEach(function(b){b.onclick=profileView});
  document.querySelectorAll("[data-chat]").forEach(function(b){b.onclick=chatView});
  function pigeonView(){
    show("الزاجل","<div class='message-box'><div class='message-icon'>✦</div><h3>الزاجل</h3><p class='muted'>ابحث عن عضو من سيرفر MLD، اختره، ثم أرسل رسالتك باسمك أو كمجهول.</p><input id='pigeon-search' class='full' placeholder='ابحث باسم العضو أو اليوزر...' autocomplete='off'><div id='pigeon-results' class='recipient-results'></div><div id='pigeon-selected' class='muted small'>لم يتم اختيار مستلم.</div><label class='check'><input id='pigeon-anon' type='checkbox'> إرسال كمجهول</label><input id='pigeon-name' class='full' maxlength='60' placeholder='اسم المرسل إذا اخترت الاسم الظاهر'><textarea id='pigeon-text' class='full' maxlength='2000' placeholder='اكتب رسالتك...'></textarea><p id='pigeon-status'></p><button class='primary wide' id='pigeon-send'>إرسال الزاجل</button></div>");
    var selected=null, timer;
    var ps=$("#pigeon-search");
    ps.oninput=function(){clearTimeout(timer);var q=ps.value.trim();selected=null;$("#pigeon-selected").textContent="جاري البحث...";if(q.length<2){$("#pigeon-results").innerHTML="";$("#pigeon-selected").textContent="اكتب حرفين على الأقل";return;}timer=setTimeout(function(){api("/api/public/members?q="+encodeURIComponent(q)).then(function(d){$("#pigeon-results").innerHTML=(d.members||[]).slice(0,8).map(function(m){return "<button class='recipient' data-pigeon-id='"+esc(m.id)+"'><img src='"+esc(m.avatar||"/logo.svg.JPG")+"'><span>"+esc(m.name)+"<small>@"+esc(m.username||"")+"</small></span></button>"}).join("")||"<span class='muted'>لا يوجد عضو مطابق</span>";document.querySelectorAll("[data-pigeon-id]").forEach(function(x){x.onclick=function(){selected={id:x.dataset.pigeonId,name:x.textContent};ps.value=x.textContent;$("#pigeon-results").innerHTML="<b class='selected'>تم اختيار المستلم ✓</b>";$("#pigeon-selected").textContent="المستلم: "+x.textContent;};});}).catch(function(e){$("#pigeon-status").textContent=e.message;});},250);};
    $("#pigeon-anon").onchange=function(){var a=$("#pigeon-anon").checked;$("#pigeon-name").classList.toggle("hidden",a);};
    $("#pigeon-send").onclick=function(){var st=$("#pigeon-status"),btn=$("#pigeon-send"),msg=$("#pigeon-text").value.trim(),anon=$("#pigeon-anon").checked,name=$("#pigeon-name").value.trim();if(!selected){st.textContent="اختر عضوًا أولًا";return;}if(!msg){st.textContent="اكتب الرسالة أولًا";return;}if(!anon&&!name){st.textContent="اكتب اسم المرسل أو فعّل الإرسال كمجهول";return;}btn.disabled=true;api("/api/public/message",{method:"POST",body:JSON.stringify({memberId:selected.id,title:"زاجل من MLD",message:anon?"مرسل مجهول\n\n"+msg:"من: "+name+"\n\n"+msg})}).then(function(){st.textContent="تم إرسال الزاجل بنجاح ✓";$("#pigeon-text").value="";}).catch(function(e){st.textContent=e.message;}).finally(function(){btn.disabled=false;});};
  }
  document.querySelectorAll("[data-pigeon]").forEach(function(b){b.onclick=function(){pigeonView();var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim();};});
  document.querySelectorAll("[data-logout]").forEach(function(b){b.onclick=logoutView});
  document.querySelectorAll("[data-owner]").forEach(function(b){b.onclick=function(){adminView();var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\\bopen\\b/g,"").trim();};});
  function updateOwnerMenu(){document.querySelectorAll("[data-owner]").forEach(function(b){if(account&&account.role==="owner")b.classList.remove("hidden");else b.classList.add("hidden");});}
  document.querySelectorAll("[data-platform]").forEach(function(b){b.onclick=function(){if(b.dataset.platform==="account")accountView();if(b.dataset.platform==="games")gamesView();if(b.dataset.platform==="groups")groupsView();if(b.dataset.platform==="admin")adminView();var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim()}});
  if(token)api("/api/platform/me").then(function(d){account=d.account;updateOwnerMenu();}).catch(function(){token="";localStorage.removeItem("mld_token");updateOwnerMenu();});
  updateOwnerMenu();
  window.MLDPlatform={accountView:accountView,gamesView:gamesView,groupsView:groupsView,adminView:adminView,profileView:profileView,chatView:chatView};
})();
