
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
      html="<div class='platform-head'><div><span class='eyebrow'>MLD ACCOUNT</span><h2>حسابك جاهز</h2><p class='muted'>صلاحيتك الحالية محفوظة على حسابك.</p></div><div class='account-card'><div>"+badge()+"</div><h3>@"+esc(account.username)+"</h3><p>Discord ID: "+esc(account.discordId)+"</p><button class='primary' id='logout'>تسجيل خروج</button></div></div>";
    }else{
      html="<div class='account-card narrow'><span class='eyebrow'>MLD ACCOUNT</span><h2>إنشاء حساب MLD</h2><input id='acc-user' class='full' placeholder='اسم المستخدم'><input id='acc-discord' class='full' placeholder='Discord ID'><input id='acc-pass' class='full' type='password' placeholder='كلمة المرور (6 أحرف+)'><button class='primary wide' id='create-account'>إنشاء الحساب الآن</button><p class='muted small'>للاختبار: Discord ID = w4px يمنح الحساب OWNER مباشرة.</p><button class='platform-link' id='show-login'>عندي حساب — تسجيل الدخول</button></div>";
    }
    show("الحساب",html);
    var create=$("#create-account");
    if(create)create.onclick=function(){create.disabled=true;api("/api/platform/accounts",{method:"POST",body:JSON.stringify({username:$("#acc-user").value,discordId:$("#acc-discord").value,password:$("#acc-pass").value})}).then(function(d){token=d.token;account=d.account;localStorage.setItem("mld_token",token);accountView()}).catch(function(e){alert(e.message)}).finally(function(){create.disabled=false})};
    var login=$("#show-login");if(login)login.onclick=loginView;
    var logout=$("#logout");if(logout)logout.onclick=function(){api("/api/platform/logout",{method:"POST"}).catch(function(){}).finally(function(){token="";account=null;localStorage.removeItem("mld_token");accountView()})};
  }
  function loginView(){
    show("تسجيل الدخول","<div class='account-card narrow'><span class='eyebrow'>WELCOME BACK</span><h2>تسجيل الدخول</h2><input id='login-user' class='full' placeholder='اسم المستخدم'><input id='login-pass' class='full' type='password' placeholder='كلمة المرور'><button class='primary wide' id='login'>دخول</button><button class='platform-link' id='new-account'>إنشاء حساب جديد</button></div>");
    $("#login").onclick=function(){api("/api/platform/login",{method:"POST",body:JSON.stringify({username:$("#login-user").value,password:$("#login-pass").value})}).then(function(d){token=d.token;account=d.account;localStorage.setItem("mld_token",token);accountView()}).catch(function(e){alert(e.message)})};
    $("#new-account").onclick=accountView;
  }
  function gamesView(){
    Promise.all([api("/api/platform/games"),api("/api/platform/lobbies")]).then(function(x){
      var g=x[0],l=x[1];
      var cards=g.games.map(function(a){return "<article class='game-card'><div class='game-icon'>"+a.icon+"</div><h3>"+a.name+"</h3><p>"+a.mode+" · "+a.players+" لاعبين</p><button class='primary game-create' data-game='"+a.id+"'>إنشاء جلسة</button></article>"}).join("");
      var ls=l.lobbies.length?l.lobbies.map(function(a){return "<article class='lobby-card'><span class='platform-chip'>"+names[a.game]+"</span><h3>جلسة @"+esc(a.host)+"</h3><p>👥 "+a.players.length+"/"+a.maxPlayers+" لاعبين · 👀 "+a.spectators.length+" مشاهد</p><button class='primary' data-join='"+a.id+"'>دخول لاعب</button> <button class='platform-link' data-watch='"+a.id+"'>مشاهدة</button></article>"}).join(""):"<div class='empty'>لا توجد جلسات الآن.</div>";
      show("الألعاب والجلسات","<div class='platform-head'><div><span class='eyebrow'>MLD GAME HUB</span><h2>الألعاب الجماعية</h2><p class='muted'>بلوت، UNO، جاكارو، لودو، ومونوبولي.</p></div><div>"+badge()+(g.botReady?"<span class='platform-chip online'>BOT متصل</span>":"<span class='platform-chip'>BOT غير متصل</span>")+"</div></div><div class='game-grid'>"+cards+"</div><div class='lobby-area'><div class='section-mini'><h3>الجلسات الحالية</h3><button class='platform-link' id='refresh-lobbies'>تحديث</button></div><div class='lobby-grid'>"+ls+"</div></div>");
      document.querySelectorAll(".game-create").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/lobbies",{method:"POST",body:JSON.stringify({game:b.dataset.game,maxPlayers:4})}).then(gamesView).catch(function(e){alert(e.message)})}});
      document.querySelectorAll("[data-join]").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/lobbies/"+b.dataset.join+"/join",{method:"POST"}).then(gamesView).catch(function(e){alert(e.message)})}});
      document.querySelectorAll("[data-watch]").forEach(function(b){b.onclick=function(){if(!need())return;api("/api/platform/lobbies/"+b.dataset.watch+"/spectate",{method:"POST"}).then(gamesView).catch(function(e){alert(e.message)})}});
      $("#refresh-lobbies").onclick=gamesView;
    });
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
  document.querySelectorAll("[data-platform]").forEach(function(b){b.onclick=function(){if(b.dataset.platform==="account")accountView();if(b.dataset.platform==="games")gamesView();if(b.dataset.platform==="groups")groupsView();if(b.dataset.platform==="admin")adminView();var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim()}});
  if(token)api("/api/platform/me").then(function(d){account=d.account}).catch(function(){token="";localStorage.removeItem("mld_token")});
  window.MLDPlatform={accountView:accountView,gamesView:gamesView,groupsView:groupsView,adminView:adminView};
})();
