"use strict";
const $=s=>document.querySelector(s),content=$("#content"),status=$("#status"),search=$("#search"),searchWrap=$("#search-wrap"),modal=$("#modal"),box=$("#modal-content"),title=$("#view-title"),subtitle=$("#subtitle"),mobile=$("#mobile-menu"),menuButton=$("#menu");let view="members",all=[],roles=[],timer,refreshTimer,selected=null;const fallback="/logo.svg",esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),num=v=>new Intl.NumberFormat("ar-SA").format(Number(v)||0),avatar=m=>m?.avatar||fallback;
function setStatus(x){status.textContent=x}function openModal(){modal.classList.remove("hidden");document.body.classList.add("modal-open")}function closeModal(){modal.classList.add("hidden");document.body.classList.remove("modal-open")}function bind(){document.querySelectorAll("[data-member]").forEach(x=>x.onclick=()=>openMember(x.dataset.member));document.querySelectorAll("[data-role]").forEach(x=>x.onclick=()=>openRole(x.dataset.role))}
function card(m){return `<article class="card" data-member="${esc(m.id)}"><img src="${esc(avatar(m))}" onerror="this.src='${fallback}'"><div><h3>${esc(m.name)}</h3><p>@${esc(m.username||"")}</p><div class="roles">${(m.importantRoles||[]).map(r=>`<span class="role">${esc(r.name)}</span>`).join("")||`<span class="member-tag">عضو</span>`}</div></div></div><button class="member-fav" type="button" aria-label="إضافة للمفضلة" data-fav="${esc(m.id)}"></button><b>↗</b></article>`}function bindMemberFavorites(){document.querySelectorAll("[data-fav]").forEach(b=>{const id=b.dataset.fav;const key="mld-favorites";let fav=JSON.parse(localStorage.getItem(key)||"[]");const sync=()=>{fav=JSON.parse(localStorage.getItem(key)||"[]");b.textContent=fav.includes(id)?"":"";b.classList.toggle("active",fav.includes(id))};b.onclick=e=>{e.preventDefault();e.stopPropagation();fav=fav.includes(id)?fav.filter(x=>x!==id):[...fav,id];localStorage.setItem(key,JSON.stringify(fav));sync();window.mldToast?.(fav.includes(id)?"تمت الإضافة للمفضلة":"تمت الإزالة من المفضلة")};sync()})}
function renderMembers(list){content.className="grid";const rows=(list||[]);content.innerHTML=rows.length?rows.map(card).join(""):`<div class="empty"><h3>لا توجد نتائج</h3><p>جرّب البحث باسم العضو.</p></div>`;bind();bindMemberFavorites()}
function topSec(t,list,k,l){return `<section class="top-section"><h3>${t}</h3>${list.map((m,i)=>`<article class="top-card" data-member="${esc(m.id)}"><span class="rank">${i+1}</span><img src="${esc(avatar(m))}"><div><small>${l}</small><h4>${esc(m.name)}</h4><strong>${num(m.stats?.[k])}</strong></div></article>`).join("")||`<p class="muted">لا توجد بيانات بعد.</p>`}</section>`}
function renderTop(d){content.className="top-grid";const voice=(d.voice||[]).map(m=>{const min=Number(m.stats?.voiceMinutes)||0;return {...m,_hours:Math.floor(min/60),_days:Math.floor(min/1440)}});const game=(d.gameTop||[]).map((m,i)=>`<article class="top-card"><span class="rank">${i+1}</span><div><small>الإنجازات</small><h4>${esc(m.username)}</h4><strong>${num(m.wins)} فوز · ${num(m.points)} نقطة</strong></div></article>`).join("")||"<p class=\"muted\">لا توجد نتائج ألعاب بعد.</p>";const voiceCards=voice.map((m,i)=>`<article class="top-card"><span class="rank">${i+1}</span><img src="${esc(avatar(m))}"><div><small>وقت الفويس</small><h4>${esc(m.name)}</h4><strong>${num(m.stats?.voiceMinutes)} دقيقة · ${num(m._hours)} ساعة · ${num(m._days)} يوم</strong><small>دخول الفويس: ${num(m.stats?.voiceJoins)} مرة</small></div></article>`).join("")||"<p class=\"muted\">لا توجد بيانات فويس بعد.</p>";content.innerHTML=topSec("🔥 TOP الرسائل",d.messages||[],"messages","رسالة")+`<section class="top-section"><h3>🎙️ TOP الفويس</h3>${voiceCards}</section><section class="top-section"><h3>🎮 TOP الألعاب</h3>${game}</section>`;bind()}
function renderRoles(){content.className="role-grid";content.innerHTML=roles.map(r=>`<article class="role-card" data-role="${esc(r.id)}"><div class="role-top"><i style="background:${esc(r.color)}"></i><b>${num(r.membersCount)} عضو</b></div><h3>${esc(r.name)}</h3><div class="roles">${(r.permissions||[]).slice(0,4).map(p=>`<span class="permission">${esc(p)}</span>`).join("")||`<span class="muted">صلاحيات عادية</span>`}</div><small>عرض الأعضاء ↗</small></article>`).join("");bind()}
async function messageView(){await mldMe();if(!mldUser){title.textContent="رسالة خاصة";subtitle.textContent="لازم تسجل دخولك قبل الإرسال.";searchWrap.style.display="none";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon"></div><h3>الرسائل الخاصة</h3><p class="muted">تسجيل الدخول مطلوب قبل إرسال أي رسالة.</p><button class="primary wide" id="dm-login">تسجيل الدخول</button></article>';$("#dm-login").onclick=()=>change("login");return}title.textContent="رسالة خاصة";subtitle.textContent="أرسل رسالة خاصة لعضو من السيرفر — وتُسجل العملية في لوق الأونر.";searchWrap.style.display="none";content.className="message-page";content.innerHTML=`<div class="message-box"><div class="message-icon"></div><h3>إرسال رسالة خاصة</h3><p class="muted">اختر المستلم، ثم حدّد: إبقاء المرسل أو إخفاؤه بالكامل.</p><input id="recipient-search" class="full" placeholder="ابحث عن المستلم..."><div id="recipient-results" class="recipient-results"></div><input id="msg-title" class="full" maxlength="120" placeholder="عنوان الرسالة"><div class="sender-choice"><p class="eyebrow">ظهور المرسل</p><div class="choice-row"><label class="choice-card"><input type="radio" name="sender-mode" value="show"><span><b>إبقاء المرسل</b><small>تصل الرسالة باسم الشخص الذي يرسلها مع منشن Discord.</small></span></label><label class="choice-card"><input type="radio" name="sender-mode" value="hide"><span><b>إخفاء المرسل</b><small>تصل الرسالة من مجهول بدون اسم أو منشن.</small></span></label></div></div><textarea id="msg-text" class="full" maxlength="2000" rows="7" placeholder="اكتب الرسالة..."></textarea><p id="msg-status" class="muted"></p><button id="send" class="primary wide">إرسال الآن</button></div>`;const rs=$("#recipient-search");rs.oninput=async()=>{const q=rs.value.trim();if(!q){$("#recipient-results").innerHTML="";return}const d=await fetch(`/api/public/members?q=${encodeURIComponent(q)}&limit=8`).then(r=>r.json());$("#recipient-results").innerHTML=(d.members||[]).slice(0,8).map(m=>`<button class="recipient" data-recipient="${esc(m.id)}"><img src="${esc(avatar(m))}"><span>${esc(m.name)}<small>@${esc(m.username||"")}</small></span></button>`).join("");document.querySelectorAll("[data-recipient]").forEach(x=>x.onclick=()=>{selected={id:x.dataset.recipient,name:x.textContent};rs.value=x.textContent;$("#recipient-results").innerHTML="<b class='selected'>تم اختيار المستلم </b>"})};$("#send").onclick=sendMessage}async function sendMessage(){await mldMe();if(!mldUser)return change("login");const st=$("#msg-status"),btn=$("#send"),text=$("#msg-text").value.trim();if(!selected)return st.textContent="اختر مستلمًا أولًا";if(!text)return st.textContent="اكتب الرسالة أولًا";btn.disabled=true;try{const r=await fetch("/api/public/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId:selected.id,title:$("#msg-title").value.trim()||"رسالة من حساب MLD",message:text,senderMode:document.querySelector('input[name="sender-mode"]:checked')?.value||"hide"})}),d=await r.json();if(!r.ok)throw Error(d.error);st.textContent="تم الإرسال بنجاح  — تم تسجيل العملية في لوق الأونر";$("#msg-text").value=""}catch(e){st.textContent=e.message||"تعذر الإرسال"}finally{btn.disabled=false}}async function openMember(id){openModal();box.innerHTML="<div class='loading'>جاري التحميل...</div>";const m=await fetch(`/api/public/member/${id}`).then(r=>r.json()),s=m.stats||{};box.innerHTML=`<div class="profile"><div class="profile-head"><img src="${esc(avatar(m))}"><div><p class="eyebrow">ملف العضو</p><h2>${esc(m.name)}</h2><p class="muted">@${esc(m.username||"")}</p><span class="badge">${esc(m.rank||"عضو")}</span></div></div><div class="stats">${[[s.messages,"رسالة"],[s.mentionsReceived,"منشن جاه"],[s.mentionsSent,"منشن أرسله"],[`${Math.floor((s.voiceMinutes||0)/60)}س ${(s.voiceMinutes||0)%60}د`,"وقت صوتي"],[s.voiceJoins,"دخول صوتي"],[s.chatRounds,"نشاط شات"]].map(x=>`<b>${esc(num(x[0]))}<small>${x[1]}</small></b>`).join("")}</div><h3>كل الرتب</h3><div class="roles">${(m.roles||[]).map(x=>`<span class="role">${esc(x.name)}</span>`).join("")||`<span class="muted">لا توجد رتب</span>`}</div><h3>��قوى الصلاحيات</h3><div class="permission-box">${perms(m.permissions)}</div></div>`}
async function openRole(id){openModal();box.innerHTML="<div class='loading'>جاري تحميل الرتبة...</div>";const d=await fetch(`/api/public/roles/${id}/members`).then(r=>r.json());box.innerHTML=`<p class="eyebrow">دليل الرتبة</p><h2>${esc(d.role.name)}</h2><div class="role-meta"><b>${num(d.role.membersCount)} عضو فعلي</b></div><div class="permission-box">${perms(d.role.permissions)}</div><h3>الأعضاء</h3><div class="grid compact">${(d.members||[]).map(card).join("")||`<p class="muted">لا يوجد أعضاء بهذه الرتبة.</p>`}</div>`;bind()}
async function refresh(){try{const [sr,rr,ss]=await Promise.all([fetch("/api/public/server"),fetch("/api/public/roles"),siteStats()]);const s=await sr.json(),rd=await rr.json();$("#server-name").textContent=s.name||"MLD";$("#server-founder").textContent=s.ownerName||"فهد المطيري";$("#server-count").textContent=num(s.memberCount);$("#server-online").textContent=num(ss.online);$("#server-visits").textContent=num(ss.visits);$("#server-status").textContent="● متصل";roles=rd.roles||[];if(s.invite){$("#invite").href=s.invite;$("#invite-mobile").href=s.invite}else{$("#invite").style.display="none";$("#invite-mobile").style.display="none"}if(view==="members"&&!search.value){const d=await fetch("/api/public/members").then(r=>r.json());all=d.members||[];renderMembers(all);setStatus(num(all.length)+" عضو متصل")}else if(view==="roles")renderRoles();else if(view==="top")renderTop(await fetch("/api/public/top").then(r=>r.json()))}catch(e){console.error(e);setStatus("تعذر تحديث البيانات مؤقتًا")}}
async function searchMembers(){clearTimeout(timer);const q=search.value.trim();if(!q){renderMembers(all);setStatus(`${num(all.length)} عضو`);return}setStatus("جاري البحث...");timer=setTimeout(async()=>{const d=await fetch(`/api/public/members?q=${encodeURIComponent(q)}`).then(r=>r.json());renderMembers(d.members||[]);setStatus(`${num((d.members||[]).length)} نتيجة`)},250)}

search.oninput=()=>{if(view!=="members")window.change("members");searchMembers()};
function closeMobileMenu(){if(!mobile)return;mobile.classList.remove("open");document.body.classList.remove("mobile-nav-open");if(menuButton){menuButton.setAttribute("aria-expanded","false");menuButton.setAttribute("aria-label","فتح قائمة الموقع");menuButton.innerHTML="<span class=\"menu-bars\" aria-hidden=\"true\"><i></i><i></i><i></i></span>"}}function toggleMobileMenu(e){if(e){e.preventDefault();e.stopPropagation()}if(!mobile||!menuButton)return;const open=!mobile.classList.contains("open");if(open){mobile.classList.add("open");document.body.classList.add("mobile-nav-open");menuButton.setAttribute("aria-label","إغلاق قائمة الموقع");menuButton.innerHTML="<span class=\"menu-close\" aria-hidden=\"true\">×</span>"}else closeMobileMenu();menuButton.setAttribute("aria-expanded",String(open))}
if(menuButton){menuButton.setAttribute("aria-expanded","false");menuButton.setAttribute("aria-label","فتح قائمة الموقع");menuButton.innerHTML="<span class=\"menu-bars\" aria-hidden=\"true\"><i></i><i></i><i></i></span>";menuButton.addEventListener("click",toggleMobileMenu);}
$("#close").onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};document.onkeydown=e=>{if(e.key==="Escape")closeModal()};const yearEl=$("#year");if(yearEl)yearEl.textContent=new Date().getFullYear();
const welcome=document.getElementById("mld-welcome");if(welcome){const hideWelcome=()=>{if(welcome.classList.contains("hide"))return;welcome.classList.add("hide");setTimeout(()=>welcome.remove(),220)};welcome.classList.remove("hide");welcome.addEventListener("click",hideWelcome);setTimeout(hideWelcome,1200);}
refreshTimer=setInterval(()=>{if(!modal.classList.contains("hidden")||view==="message")return;refresh()},15000);

// MLD Add-on: Games
async function renderGames(){
  searchWrap.style.display="none"; title.textContent="صالات الألعاب";
  subtitle.textContent="اختر لعبة، أنشئ غرفة، وشاركها مع اللاعبين — بدون تسجيل دخول.";
  content.className="games-hub";
  const games=[
    {id:"uno",name:"UNO",icon:"🃏",max:6,desc:"ورق جماعي سريع"},
    {id:"monopoly",name:"مونوبولي",icon:"🎲",max:6,desc:"شراء وبناء وتنافس"},
    {id:"flightchess",name:"لودو",icon:"🎯",max:4,desc:"سباق جماعي"},
    {id:"hearts",name:"قلوب",icon:"♥️",max:4,desc:"لعبة ورق لأربعة"},
    {id:"rummikub",name:"رومي",icon:"🀄",max:4,desc:"تركيب وتجميع"},
    {id:"liarsbar",name:"لعبة الخداع",icon:"♣️",max:6,desc:"خداع وبلوف"},
    {id:"texas",name:"تكساس",icon:"♠️",max:8,desc:"بوكر جماعي"},
    {id:"doudizhu",name:"دوديزهو",icon:"🃏",max:3,desc:"لعبة ورق"},
    {id:"bigtwo",name:"Big Two",icon:"🂡",max:4,desc:"ورق وتنافس"},
    {id:"davinci",name:"رمز دافنشي",icon:"🧠",max:4,desc:"استنتاج"},
    {id:"mahjong-sichuan",name:"ماجونغ",icon:"🀄",max:4,desc:"طاولة"},
    {id:"drawguess",name:"ارسم وخمّن",icon:"✏️",max:8,desc:"حفلة رسم"},
    {id:"numberbomb",name:"القنبلة الرقمية",icon:"💣",max:10,desc:"تخمين"},
    {id:"oldmaid",name:"الورقة الشبح",icon:"👻",max:6,desc:"ورق"},
    {id:"exploding-kittens",name:"Exploding Kittens",icon:"🐱",max:6,desc:"كروت"},
    {id:"connect4",name:"أربعة على التوالي",icon:"🔴",max:2,desc:"كلاسيكية"},
    {id:"chess",name:"شطرنج",icon:"♟️",max:2,desc:"كلاسيكية"},
    {id:"checkers",name:"داما",icon:"⚫",max:2,desc:"استراتيجية"},
    {id:"codenames",name:"Code Names",icon:"🕵️",max:8,desc:"فرق وتخمين كلمات",disabled:true}
  ];
  let selected=games[0], sessions=[];
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const byId=id=>games.find(g=>g.id===id)||selected;
  const savedName=()=>String(localStorage.getItem("mld-game-name")||"").trim().slice(0,8);
  content.innerHTML=
    '<section class="games-hero-card"><div><span class="games-kicker">MLD GAMES</span><h2>🎮 مجلس الألعاب</h2><p>غرف جماعية حقيقية داخل MLD — لا تحتاج حساب.</p></div><div class="games-live-badge"><i></i> LIVE</div></section>'+
    '<section class="games-create-card"><div class="games-create-head"><div><h3>إنشاء غرفة</h3><p>اختر اللعبة وعدد اللاعبين ثم اكتب اسمك.</p></div><button id="game-catalog-open" class="games-secondary">قائمة الألعاب</button></div>'+
    '<div class="games-create-controls"><label>اللعبة<select id="game-select"></select></label><label>عدد اللاعبين<select id="game-max"></select></label><button id="game-create" class="games-primary">إنشاء غرفة</button></div><div id="game-create-status" class="games-status"></div></section>'+
    '<section class="games-sessions-card"><div class="games-create-head"><div><h3>الغرف المفتوحة</h3><p>الغرف التي تنتظر لاعبين تظهر هنا مباشرة.</p></div><button id="game-refresh" class="games-secondary">تحديث</button><span id="games-count" class="games-count"></span></div><div id="games-sessions" class="games-session-list"></div></section>'+
    '<div id="games-catalog-modal" class="games-catalog-modal hidden"><div class="games-catalog-box"><div class="games-catalog-head"><div><span class="games-kicker">MLD GAMES</span><h3>قائمة الألعاب</h3><p>اضغط على لعبة لاختيارها، ثم تختفي القائمة.</p></div><button id="games-catalog-close" class="games-catalog-close">×</button></div><div id="games-catalog-grid" class="games-catalog-grid"></div></div></div>'+
    '<div id="games-name-modal" class="games-catalog-modal hidden"><div class="games-name-box"><span class="games-kicker">PLAYER</span><h3>اسمك في اللعبة</h3><p>اكتب الاسم الذي سيظهر للاعبين.</p><input id="games-name-input" maxlength="8" placeholder="مثال: فهد"><button id="games-name-ok" class="games-primary">دخول اللعبة</button></div></div>';

  function renderSelects(){
    $("#game-select").innerHTML=games.filter(g=>!g.disabled).map(g=>'<option value="'+g.id+'">'+g.icon+' '+esc(g.name)+'</option>').join("");
    $("#game-select").value=selected.id;
    $("#game-max").innerHTML=Array.from({length:selected.max-1},(_,i)=>{const n=i+2;return '<option value="'+n+'" '+(n===selected.max?"selected":"")+'>'+n+' لاعبين</option>'}).join("");
  }
  function renderCatalog(){
    $("#games-catalog-grid").innerHTML=games.map(g=>'<button class="games-catalog-item '+(g.disabled?"disabled":"")+'" data-catalog-game="'+g.id+'"><span>'+g.icon+'</span><b>'+esc(g.name)+'</b><small>'+esc(g.desc)+(g.disabled?" · قريبًا":" · "+g.max+" لاعبين")+'</small></button>').join("");
    $("#games-catalog-grid").querySelectorAll("[data-catalog-game]").forEach(b=>b.onclick=()=>{
      const g=byId(b.dataset.catalogGame); if(g.disabled)return;
      selected=g; renderSelects(); $("#games-catalog-modal").classList.add("hidden");
    });
  }
  function askName(action){
    const modal=$("#games-name-modal"), input=$("#games-name-input");
    input.value=savedName(); modal.classList.remove("hidden"); setTimeout(()=>input.focus(),50);
    return new Promise(resolve=>{
      const ok=()=>{const name=input.value.trim().slice(0,8);if(!name){input.focus();return}localStorage.setItem("mld-game-name",name);modal.classList.add("hidden");cleanup();resolve(name)};
      const cleanup=()=>{ $("#games-name-ok").removeEventListener("click",ok); input.removeEventListener("keydown",key); };
      const key=e=>{if(e.key==="Enter")ok()};
      $("#games-name-ok").addEventListener("click",ok); input.addEventListener("keydown",key);
    });
  }
  function socket(){return new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host)}
  function save(msg,name,spectator){sessionStorage.setItem("roomId",msg.roomId);sessionStorage.setItem("playerIndex",spectator?"-1":String(msg.playerIndex??0));sessionStorage.setItem("game",msg.game);sessionStorage.setItem("mldGameSpectator",spectator?"1":"0");if(msg.resumeToken)sessionStorage.setItem("resumeToken",msg.resumeToken);if(name)sessionStorage.setItem("mldGamePlayerName",name)}
  function openGame(roomId,name,mode,sessionCode,spectator){
    const old=document.querySelector(".mld-game-stage");if(old)old.remove(); if(spectator)sessionStorage.setItem("mldGameSpectator","1");
    const s=document.createElement("section");s.className="mld-game-stage";
    s.innerHTML='<div class="mld-game-stage-head"><div><span>MLD LIVE ROOM</span><b>'+esc(name)+' · '+esc(roomId)+(spectator?' · 👁️ مشاهد':'')+'</b></div><div class="mld-game-stage-actions"><button id="game-fullscreen">⛶ ملء الشاشة</button><button id="game-close">رجوع</button></div></div><div class="mld-game-frame-wrap"><iframe id="mld-game-frame" src="/mld-games/game.html" allow="fullscreen; autoplay; clipboard-write" title="MLD Game"></iframe></div>';
    content.prepend(s);
    $("#game-close").onclick=()=>s.remove();
    $("#game-fullscreen").onclick=async()=>{try{await s.querySelector(".mld-game-frame-wrap").requestFullscreen()}catch{const f=s.querySelector("iframe");if(f.requestFullscreen)f.requestFullscreen()}};
    s.querySelector("iframe").addEventListener("load",()=>{try{const f=s.querySelector("iframe"),d=f.contentDocument,n=d&&d.getElementById("nameInput"),name=sessionStorage.getItem("mldGamePlayerName")||"";if(n&&name){n.value=name;n.dispatchEvent(new Event("change",{bubbles:true}))}if(spectator&&d){const bar=d.querySelector(".game-actions-fixed");if(bar)bar.style.display="none";const st=d.getElementById("status");if(st)st.textContent="👁️ وضع المشاهدة — للعرض فقط";}if(sessionCode&&!spectator&&d){const start=d.getElementById("startGameBtn");if(start&&!start.dataset.mldBound){start.dataset.mldBound="1";start.addEventListener("click",()=>{fetch("/api/games/sessions/"+encodeURIComponent(sessionCode)+"/start",{method:"POST",headers:{"Content-Type":"application/json"}}).catch(()=>{})},{capture:true});}}}catch(e){console.warn("MLD game sync",e)}});
    s.scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function createRoom(){
    const name=await askName("create"),st=$("#game-create-status"),max=Number($("#game-max").value);
    st.textContent="جاري إنشاء الغرفة...";
    const ws=socket();
    ws.onopen=()=>ws.send(JSON.stringify({type:"create_room",data:{game:selected.id,lang:"en",name:name}}));
    ws.onerror=()=>st.textContent="تعذر الاتصال بمحرك الألعاب.";
    ws.onmessage=async e=>{let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==="room_created"){
        save(m,name);
        const sr=await fetch("/api/games/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({gameId:selected.id+"::"+m.roomId,gameName:selected.name,maxPlayers:max,playerName:name})}).catch(()=>null); const sd=sr&&sr.ok?await sr.json().catch(()=>null):null;
        st.textContent="تم إنشاء الغرفة "+m.roomId; ws.close(); openGame(m.roomId,selected.name,"player",sd&&sd.session?sd.session.code:null,false); refreshSessions();
      }else if(m.type==="error")st.textContent=m.message||"تعذر إنشاء الغرفة.";
    };
  }
  async function joinRoom(s){
    const spectator=s.status==="playing"; const name=await askName("join"),roomId=String(s.game_id||"").split("::")[1]||s.code,ws=socket();
    ws.onopen=()=>ws.send(JSON.stringify({type:"join_room",data:{roomId,lang:"en",name:name}}));
    ws.onerror=()=>alert("تعذر الاتصال بمحرك الألعاب");
    ws.onmessage=async e=>{let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==="room_joined"){save(m,name,spectator);if(!spectator)await fetch("/api/games/sessions/"+encodeURIComponent(s.code)+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({playerName:name})}).catch(()=>{});else await fetch("/api/games/sessions/"+encodeURIComponent(s.code)+"/spectate",{method:"POST",headers:{"Content-Type":"application/json"}}).catch(()=>{});ws.close();openGame(m.roomId,byId(m.game).name,spectator?"spectator":"player",s.code,spectator);refreshSessions()}
      else if(m.type==="error")alert(m.message||"تعذر الدخول");
    };
  }
  async function refreshSessions(){
    try{sessions=(await fetch("/api/games/sessions?"+Date.now()).then(r=>r.json())).sessions||[]}catch{return}
    const live=sessions.filter(s=>s.status==="open"||s.status==="playing");
    $("#games-count").textContent=live.length+" غرف";
    $("#games-sessions").innerHTML=live.length?live.map(s=>{
      const g=byId(String(s.game_id).split("::")[0]),started=s.status==="playing";
      return '<article class="game-session-row"><div class="game-session-icon">'+g.icon+'</div><div class="game-session-info"><b>'+esc(g.name)+'</b><span>الغرفة <strong>'+esc(s.code)+'</strong> · '+esc(s.owner_username)+'</span><small>'+s.players+' / '+s.max_players+' لاعبين'+(started?" · بدأت":" · مفتوحة")+'</small></div><button class="games-primary games-join-btn" data-code="'+esc(s.code)+'">'+(started?"مشاهدة":"دخول")+'</button></article>'
    }).join(""):'<div class="games-empty">لا توجد غرف مفتوحة الآن. أنشئ أول غرفة 👑</div>';
    $("#games-sessions").querySelectorAll(".games-join-btn").forEach(b=>b.onclick=()=>{const s=sessions.find(x=>x.code===b.dataset.code);if(s)joinRoom(s)});
  }
  $("#game-select").onchange=()=>{selected=byId($("#game-select").value);renderSelects()};
  $("#game-create").onclick=createRoom; $("#game-refresh").onclick=refreshSessions;
  $("#game-catalog-open").onclick=()=>{renderCatalog();$("#games-catalog-modal").classList.remove("hidden")};
  $("#games-catalog-close").onclick=()=>$("#games-catalog-modal").classList.add("hidden");
  $("#games-catalog-modal").onclick=e=>{if(e.target.id==="games-catalog-modal")e.currentTarget.classList.add("hidden")};
  renderSelects(); await refreshSessions(); setStatus("صالات الألعاب جاهزة");
}
async function ownerGameLogs(){
  await mldMe(); if(!mldUser||mldUser.role!=="owner")return authView();
  title.textContent="لوق الألعاب";subtitle.textContent="سجل إنشاء الجلسات والانضمام والبدء والإنهاء.";
  searchWrap.style.display="none";content.className="feature-grid";
  const d=await fetch("/api/owner/logs/games").then(r=>r.json()).catch(()=>({logs:[]}));
  content.innerHTML="<section class='feature-card'><h3>🎮 لوق الألعاب</h3><div class='owner-log-list'>"+(d.logs||[]).map(x=>"<article class='owner-log-row'><b>"+esc(x.action)+"</b><span>"+esc(x.username||"-")+" · "+esc(x.details||"")+"</span><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small></article>").join("")||"<p class='muted'>لا يوجد نشاط ألعاب بعد.</p>"+"</div></section>";
  setStatus("لوق الألعاب جاهز");
}
function mldNavButton(view,label,extra=""){
  return '<button type="button" data-view="'+view+'" data-admin-nav="1" '+extra+'>'+label+'</button>';
}
function rebuildMobileMenu(){
  const menu=$("#mobile-menu"); if(!menu)return;
  const role=mldUser?.role||"";
  const isAdmin=role==="admin" || role==="owner";
  const isOwner=role==="owner";
  const group=(title,items,open=false)=>'<div class="mobile-menu-group '+(open?"is-open":"")+'"><button type="button" class="mobile-menu-group-toggle" aria-expanded="'+(open?"true":"false")+'"><span>'+title+'</span><span class="mobile-menu-chevron">⌄</span></button><div class="mobile-menu-sub">'+items.map(x=>'<button type="button" data-view="'+x[0]+'">'+x[1]+'</button>').join("")+'</div></div>';
  let html='';
  html+='<button type="button" class="mobile-menu-main" data-view="home">الرئيسية</button>';
  html+=group("المجتمع",[["members","الأعضاء"],["top","TOP"],["roles","الرتب القيادية"],["groups","القروبات"],["reviews","الآراء"]],true);
  html+=group("التواصل",[["chat","الشات"],["message","الزاجل"],["anonymous","الفضفضة"],["tickets","التذاكر"]]);
  html+=group("الألعاب",[["games","صالات الألعاب"],["jokes","😂 النكت"],["stories","📖 القصص والصوت"],["game-logs","لوق الألعاب"]]);
  html+=group("الحساب",[["profile","بروفايلي"],["account","حسابي"],["apply","التقديم"]]);
  if(isAdmin) html+=group("الإدارة",[["admin","لوحة الإدارة"]]);
  if(isOwner) html+=group("الأونر",[["owner","مركز الأونر"],["broadcast","برودكاست السيرفر"]]);
  if(!mldUser) html+='<button type="button" class="mobile-menu-main" data-view="login">تسجيل الدخول</button>';
  else html+='<button type="button" class="mobile-menu-main mobile-menu-logout" data-view="logout">تسجيل الخروج</button>';
  menu.innerHTML=html+'<a id="invite-mobile" class="invite" target="_blank">انضم للسيرفر</a>';
  menu.querySelectorAll(".mobile-menu-group-toggle").forEach(b=>b.onclick=()=>{
    const group=b.closest(".mobile-menu-group"); if(!group)return;
    const open=group.classList.toggle("is-open"); b.setAttribute("aria-expanded",open?"true":"false");
  });
}

async function jokesView(){
 searchWrap.style.display="none";title.textContent="😂 النكت";subtitle.textContent="نكت خفيفة بلهجة سعودية ونكت من أعضاء المجتمع.";content.className="feature-grid";
 content.innerHTML="<article class='feature-card joke-spotlight'><div class='feature-icon'>😂</div><span class='eyebrow'>MLD SMART JOKES</span><blockquote id='joke-main' class='joke-main'>جاري تجهيز النكتة...</blockquote><div class='joke-actions'><button class='primary' id='joke-next'>🔄 غيرها</button><button class='games-secondary' id='joke-add'>✍️ أضف نكتتك</button></div></article><section class='feature-card'><h3>نكت المجتمع</h3><div id='joke-list' class='joke-list'></div></section>";
 async function load(){const d=await fetch("/api/jokes?"+Date.now()).then(r=>r.json());const items=d.items||[];const main=items[0];$("#joke-main").textContent=main?main.body:"ما فيه نكت الآن";$("#joke-list").innerHTML=items.slice(0,12).map(j=>"<article class='joke-item'><p>"+esc(j.body)+"</p><small>"+esc(j.author||"ملاذ")+"</small><div><button data-joke-like='"+j.id+"'>👍 "+j.likes+"</button><button data-joke-dislike='"+j.id+"'>👎 "+j.dislikes+"</button></div></article>").join("")||"<p class='muted'>كن أول من يضيف نكتة.</p>";document.querySelectorAll("[data-joke-like]").forEach(b=>b.onclick=()=>react(b.dataset.jokeLike,"like"));document.querySelectorAll("[data-joke-dislike]").forEach(b=>b.onclick=()=>react(b.dataset.jokeDislike,"dislike"))}
 async function react(id,type){await mldMe();if(!mldUser)return change("login");const r=await fetch("/api/jokes/"+id+"/react",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type})});const d=await r.json();if(!r.ok)return alert(d.error);load()}
 $("#joke-next").onclick=async()=>{const r=await fetch("/api/jokes/generate",{method:"POST"});const d=await r.json();if(r.ok){$("#joke-main").textContent=d.body;load()}};
 $("#joke-add").onclick=async()=>{await mldMe();if(!mldUser)return change("login");openModal();box.innerHTML="<div class='feature-card'><h3>✍️ أضف نكتتك</h3><textarea id='new-joke' class='full' rows='5' maxlength='500' placeholder='اكتب نكتتك...'></textarea><button id='save-joke' class='primary wide'>نشر</button></div>";$("#save-joke").onclick=async()=>{const body=$("#new-joke").value.trim();if(!body)return;const r=await fetch("/api/jokes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})});const d=await r.json();if(!r.ok)return alert(d.error);closeModal();load()}};await load();setStatus("النكت جاهزة")}
async function storiesView(){
 searchWrap.style.display="none";title.textContent="📖 القصص والصوت";subtitle.textContent="ولّد قصة، واختر جوّها، ثم اسمعها بصوت عربي من جهازك.";content.className="feature-grid";
 content.innerHTML="<article class='feature-card story-maker'><span class='eyebrow'>MLD STORY STUDIO</span><h2>✨ مولد القصص</h2><div class='story-controls'><select id='story-genre' class='full'><option>مغامرة</option><option>غموض</option><option>رعب خفيف</option><option>كوميديا</option><option>خيال</option></select><select id='story-length' class='full'><option value='قصيرة'>قصيرة</option><option value='متوسطة'>متوسطة</option><option value='طويلة'>طويلة</option></select><button id='story-generate' class='primary'>ولّد قصة</button><button id='story-speak' class='games-secondary'>🔊 اقرأ بصوت</button><button id='story-stop' class='games-secondary'>⏹ إيقاف</button></div><article id='story-output' class='story-output'>ولّد قصة وستظهر هنا.</article></article>";
 let storyText="";
 $("#story-generate").onclick=async()=>{const r=await fetch("/api/stories/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({genre:$("#story-genre").value,length:$("#story-length").value})});const d=await r.json();if(!r.ok)return alert(d.error);storyText=d.body;$("#story-output").innerHTML="<h3>📖 "+esc(d.genre)+"</h3><p>"+esc(d.body)+"</p>"};
 $("#story-speak").onclick=()=>{if(!storyText)return alert("ولّد قصة أولًا");if(!("speechSynthesis" in window))return alert("المتصفح لا يدعم القراءة الصوتية");speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(storyText);u.lang="ar-SA";u.rate=.9;u.pitch=1;speechSynthesis.speak(u)};
 $("#story-stop").onclick=()=>{if("speechSynthesis" in window)speechSynthesis.cancel()};
 setStatus("استوديو القصص جاهز");
}
async function anonymousView(){
  await mldMe(); if(!mldUser)return authView();
  searchWrap.style.display="none"; title.textContent="الفضفضة"; subtitle.textContent="اكتب بدون ظهور اسمك أو حسابك. لا يظهر للزوار أي معرف لصاحب المنشور أو الرد.";
  content.className="feature-grid";
  content.innerHTML="<article class='feature-card anonymous-compose'><div class='feature-icon'></div><h3>فضفضة سرية</h3><p class='muted'>مجهول بالكامل للناس — اسم الحساب وDiscord لا يظهران في المنشور أو الرد.</p><textarea id='anon-input' class='full' rows='5' maxlength='2000' placeholder='وش بخاطرك؟ اكتب هنا...'></textarea><button class='primary wide' id='anon-send'>نشر الفضفضة</button><p id='anon-status' class='muted'></p></article><section class='feature-card'><h3> فضفضات المجتمع</h3><div id='anon-feed' class='anonymous-feed'><div class='loading'>جاري التحميل...</div></div></section>";
  async function load(){const r=await fetch("/api/anonymous?"+Date.now()),d=await r.json();$("#anon-feed").innerHTML=(d.posts||[]).map(p=>"<article class='anon-post' data-anon='"+p.id+"'><div class='anon-head'><span> مجهول</span><small>"+new Date(p.created_at).toLocaleString("ar-SA")+"</small></div><p>"+esc(p.body)+"</p><div class='anon-replies'>"+(p.replies||[]).map(x=>"<div class='anon-reply'><b> مجهول</b><p>"+esc(x.body)+"</p><small>"+new Date(x.created_at).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})+"</small></div>").join("")+"</div><form class='anon-reply-form'><input class='full anon-reply-input' maxlength='2000' placeholder='رد بشكل مجهول...'><button>رد</button></form></article>").join("")||"<p class='muted'>لا توجد فضفضات حتى الآن.</p>";
    document.querySelectorAll(".anon-reply-form").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const input=f.querySelector(".anon-reply-input"),body=input.value.trim(),id=f.closest("[data-anon]").dataset.anon;if(!body)return;const rr=await fetch("/api/anonymous/"+id+"/replies",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})});const dd=await rr.json();if(!rr.ok)return alert(dd.error||"تعذر إرسال الرد");input.value="";load()});
  }
  $("#anon-send").onclick=async()=>{const input=$("#anon-input"),body=input.value.trim(),st=$("#anon-status");if(!body)return st.textContent="اكتب الفضفضة أولًا";const r=await fetch("/api/anonymous",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),d=await r.json();st.textContent=r.ok?"تم نشر الفضفضة بشكل مجهول ":(d.error||"تعذر النشر");if(r.ok){input.value="";load()}};
  await load();setStatus("الفضفضة جاهزة");
}

// FINAL MLD ROUTER — single source of truth
window.change=async function(v){
  view=v;
  closeMobileMenu();
  searchWrap.style.display=v==="members"?"flex":"none";
  try{
    if(v==="home"){await homeView();return}
    if(v==="members"){title.textContent="الأعضاء";subtitle.textContent="كل الأعضاء والبيانات تتحدث تلقائيًا.";await refresh();return}
    if(v==="roles"){title.textContent="الرتب القيادية";subtitle.textContent="الرتب والصلاحيات القيادية في سيرفر MLD.";await refresh();return}
    if(v==="top"){title.textContent="لوحة TOP";subtitle.textContent="إحصائيات المجتمع والألعاب.";await renderTop(await fetch("/api/public/top").then(r=>r.json()));setStatus("TOP جاهز");return}
    if(v==="chat"){await mldChatView("public");return}     if(v==="private-chat"){await mldChatView("private");return}
    if(v==="profile"){await mldChatProfile();return}
    if(v==="message"){await messageView();return}
    if(v==="anonymous"){await anonymousView();return}
    if(v==="games"){await renderGames();return}
    if(v==="jokes"){await jokesView();return}
    if(v==="stories"){await storiesView();return}
    if(v==="game-logs"){await ownerGameLogs();return}
    if(v==="groups"){await groupsReal();return}
    if(v==="account"){await mldMe();if(!mldUser)return authView();await renderAccount();return}
    if(v==="tickets"){await mldMe();await ticketView();return}
    if(v==="apply"){await applyView();return}
    if(v==="login"){authView();return}
    if(v==="logout"){await fetch("/api/auth/logout",{method:"POST"});mldUser=null;updateAuthBar();await homeView();return}
    if(v==="reviews"){await reviewsView();return};if(v==="anonymous")return anonymousView()
    if(v==="logs"){await ownerLogs();return}
    if(v==="admin"){await mldMe();if(["admin","owner"].includes(mldUser?.role))return window.adminPanel();return authView()}
    if(v==="owner"){await ownerControlCenter();return}
    if(v==="broadcast"){await mldMe();if(mldUser?.role!=="owner")return authView();return ownerBroadcastView()}
    if(v==="blocks"){await mldChatBlocks();return}
    await homeView();
  }catch(e){
    console.error("MLD route error:",v,e);
    setStatus("تعذر فتح القائمة حاليًا");
  }finally{
    document.body.classList.remove("mld-booting");
  }
};

// FINAL MLD AUTH/NAV VISIBILITY
window.updateAuthBar=function(){
  const el=$("#auth-bar"); if(!el)return;
  document.querySelectorAll("[data-admin-nav]").forEach(x=>x.remove());
  const role=mldUser?.role||"";
  const isAdmin=role==="admin" || role==="owner";
  const isOwner=role==="owner";
  document.querySelectorAll('[data-view="login"]').forEach(x=>x.style.display=mldUser?"none":"");
  document.querySelectorAll('[data-view="tickets"]').forEach(x=>x.style.display="");
  document.querySelectorAll("#logs-nav,#logs-nav-mobile").forEach(x=>x.remove());
  el.innerHTML=mldUser
    ? '<div class="auth-chip">مرحبًا <b>'+esc(mldUser.username)+'</b> · Discord: <b>'+esc(mldUser.discordUsername)+'</b> · '+(isOwner?" أونر":isAdmin?" إدارة":" عضو")+' <button id="logout-btn" type="button">خروج</button></div>'
    : '<div class="auth-chip">غير مسجل · <button data-view="login" type="button">تسجيل الدخول</button></div>';
  const addNav=(host,mobileMode)=>{
    if(!host)return;
    const before=host.querySelector(".invite")||null;
    if(isOwner){
      const b=document.createElement("button");b.type="button";b.dataset.adminNav="1";b.dataset.view="owner";b.textContent=" الأونر";host.insertBefore(b,before);
    }else if(role==="admin"){
      const b=document.createElement("button");b.type="button";b.dataset.adminNav="1";b.dataset.view="admin";b.textContent=" الإدارة";host.insertBefore(b,before);
    }
  };
  rebuildMobileMenu();
  const desktop=document.querySelector(".desktop-nav");
  if(desktop){
    desktop.querySelectorAll('[data-view="logs"],[data-view="owner"],[data-view="admin"]').forEach(x=>x.remove());
    if(isOwner){const b=document.createElement("button");b.type="button";b.dataset.view="admin";b.textContent="الإدارة";desktop.insertBefore(b,desktop.querySelector(".invite"));const o=document.createElement("button");o.type="button";o.dataset.view="owner";o.textContent="الأونر";desktop.insertBefore(o,desktop.querySelector(".invite"))}
    else if(role==="admin"){const b=document.createElement("button");b.type="button";b.dataset.view="admin";b.textContent="الإدارة";desktop.insertBefore(b,desktop.querySelector(".invite"))}
  }
  const out=$("#logout-btn");
  if(out)out.onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});mldUser=null;updateAuthBar();window.change("home")};
  if(mldUser?.mustChangePassword) setTimeout(()=>window.change("password"),0);
};

// GLOBAL NAV DELEGATION — one navigation path for desktop + mobile
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-view],[data-home-go]");
  if(!b)return;
  const target=b.dataset.homeGo==="reviews-add"?"reviews":(b.dataset.view||b.dataset.homeGo);
  if(!target)return;
  e.preventDefault();
  e.stopPropagation();
  closeMobileMenu();
  window.change(target);
},true);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&mobile)closeMobileMenu();
});


// INITIAL BOOT: never show the old static homepage before the new one is ready
document.body.classList.add("mld-booting");
Promise.race([mldMe(),new Promise(r=>setTimeout(r,700))]).catch(()=>null).then(()=>window.change("home")).catch(()=>window.change("home"));
