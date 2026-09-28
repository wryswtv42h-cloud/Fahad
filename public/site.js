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
function renderGames(){
 searchWrap.style.display="none";
 title.textContent="مركز الألعاب";
 subtitle.textContent="ألعاب جماعية جاهزة داخل الموقع — غرف، لعب جماعي لحظي، وبوتات تكمل المقاعد عند الحاجة.";
 content.className="feature-grid ready-games-grid";
 const games=[
  ["GameNest Arcade","🎮","قاعة الألعاب الجماعية: غرف خاصة، كود دخول، مقاعد وبوتات، وأكثر من 30 لعبة جاهزة.","https://mld-gamenest-production.up.railway.app/"],
  ["ألعاب فردية سريعة","⚡","2048 وSnake وTetris وSudoku — ألعاب خفيفة داخل الموقع.","/games/2048.html"]
 ];
 content.innerHTML=games.map(([name,icon,desc,path],i)=>"<article class='feature-card ready-game-card game-brand-card'>"+
   "<div class='ready-game-icon'>"+icon+"</div><span class='pill'>"+(i===0?"MLD × GameNest":"MLD Arcade")+"</span>"+
   "<h3>"+esc(name)+"</h3><p class='muted'>"+esc(desc)+"</p>"+
   "<div class='game-card-rights'>© MLD Community · الألعاب مدمجة داخل مركز الألعاب</div>"+
   "<button class='primary wide' data-ready-game='"+esc(path)+"'>🎮 افتح داخل الموقع</button></article>").join("");
 document.querySelectorAll("[data-ready-game]").forEach(btn=>btn.onclick=()=>openReadyGame(btn.dataset.readyGame));
 setStatus("مركز الألعاب الجماعية جاهز");
}
function openReadyGame(path){
 const isGameNest=path.includes("mld-gamenest-production.up.railway.app");
 const name=isGameNest?"MLD GameNest":"MLD Arcade";
 modal.classList.remove("hidden");
 box.innerHTML="<div class='ready-game-modal branded-game-modal'>"+
   "<div class='ready-game-modal-head'><div><span class='pill'>🎮 MLD GAMES</span><h2>"+esc(name)+"</h2><small class='game-rights-line'>© MLD Community · powered by open-source game software</small></div>"+
   "<button class='ghost' id='ready-game-close'>إغلاق</button></div>"+
   "<div class='game-frame-wrap'><div class='game-watermark'>MLD</div><iframe class='ready-game-frame' src='"+esc(path)+"' title='"+esc(name)+"' loading='eager' allow='fullscreen; autoplay'></iframe></div></div>";
 $("#ready-game-close").onclick=closeModal;
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
  html+=group("الألعاب",[["games","صالات الألعاب"]]);
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
