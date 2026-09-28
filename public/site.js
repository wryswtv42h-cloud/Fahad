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
 subtitle.textContent="ألعاب جاهزة تعمل مباشرة داخل الموقع — بدون جلسات الألعاب القديمة.";
 content.className="feature-grid ready-games-grid";
 const games=[
  ["2048","🔢","ألغاز دمج الأرقام وسجّل رقمك القياسي.","/games/2048.html"],
  ["Snake","🐍","الثعبان الكلاسيكي مع تحكم بالجوال والكمبيوتر.","/games/snake.html"],
  ["Tetris","🧱","رتّب القطع وامسح الصفوف وارفع المستوى.","/games/tetris.html"],
  ["Sudoku","🧩","ثلاث درجات صعوبة مع فحص وحل.","/games/sudoku.html"],
  ["Connect Four","🔴","أربع متتالية ضد الذكاء الاصطناعي أو لاعب ثانٍ.","/games/connect-four.html"],
  ["Tic-Tac-Toe","❌","إكس أو ضد الذكاء الاصطناعي أو لاعبين.","/games/tic-tac-toe.html"]
 ];
 content.innerHTML=games.map(([name,icon,desc,path])=>"<article class='feature-card ready-game-card'><div class='ready-game-icon'>"+icon+"</div><span class='pill'>لعبة جاهزة</span><h3>"+esc(name)+"</h3><p class='muted'>"+esc(desc)+"</p><button class='primary wide' data-ready-game='"+esc(path)+"'>🎮 العب الآن</button></article>").join("");
 document.querySelectorAll("[data-ready-game]").forEach(btn=>btn.onclick=()=>openReadyGame(btn.dataset.readyGame));
 setStatus("الألعاب جاهزة");
}
function openReadyGame(path){
 const name=path.split("/").pop().replace(".html","");
 modal.classList.remove("hidden");
 modalContent.innerHTML="<div class='ready-game-modal'><div class='ready-game-modal-head'><div><span class='pill'>🎮 لعبة جاهزة</span><h2>"+esc(name)+"</h2></div><button class='ghost' id='ready-game-close'>إغلاق</button></div><iframe class='ready-game-frame' src='"+esc(path)+"' title='"+esc(name)+"' loading='eager' allow='fullscreen'></iframe></div>";
 $("#ready-game-close").onclick=()=>modal.classList.add("hidden");
}
// MLD Add-on: Groups
async function renderGroups(){
 await mldMe();searchWrap.style.display="none";title.textContent="القروبات";subtitle.textContent="قروبات المجتمع — الانضمام والطلبات مرتبطة بالسيرفر.";content.className="feature-grid";
 const d=await fetch("/api/groups").then(r=>r.json()).catch(()=>({groups:[]})),groups=d.groups||[];
 content.innerHTML='<article class="feature-card"><div class="feature-icon"></div><h3>قروبات المجتمع</h3><p class="muted">القروب المعتمد ينشئ رول وروم في Discord، والموافقة على العضوية تعطي رول القروب.</p><div id="groups-list" class="groups-list">'+(groups.length?groups.map(g=>'<div class="group-item"><span><b>'+esc(g.name)+'</b><small>'+esc(g.description||"بدون وصف")+' · المالك: '+esc(g.owner_username)+' · '+num(g.member_count)+' عضو</small></span><button class="primary" data-join-group="'+g.id+'">طلب انضمام</button></div>').join(""):'<p class="muted">لا توجد قروبات معتمدة حاليًا.</p>')+'</div></article>';
 if(mldUser)document.querySelectorAll("[data-join-group]").forEach(btn=>btn.onclick=async()=>{const r=await fetch("/api/groups/"+btn.dataset.joinGroup+"/join",{method:"POST"}),x=await r.json();alert(r.ok?"تم إرسال طلب الانضمام.":(x.error||"تعذر إرسال الطلب"));});
 else document.querySelectorAll("[data-join-group]").forEach(btn=>btn.onclick=()=>change("login"));
 if(mldUser)content.innerHTML+='<article class="feature-card"><div class="feature-icon"></div><h3>إنشاء قروب</h3><input id="group-name" class="full" maxlength="60" placeholder="اسم القروب"><input id="group-desc" class="full" maxlength="240" placeholder="وصف القروب"><button class="primary wide" id="group-add">إرسال طلب إنشاء</button><p id="group-status" class="muted"></p></article>';
 if($("#group-add"))$("#group-add").onclick=async()=>{const name=$("#group-name").value.trim(),description=$("#group-desc").value.trim();const r=await fetch("/api/groups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description})}),x=await r.json();$("#group-status").textContent=r.ok?"تم إرسال الطلب للأونر ":(x.error||"تعذر الإرسال");};
 setStatus("القروبات جاهزة");
}

// MLD Add-on: Account/Admin/Logs
function renderAccount(){searchWrap.style.display="none";title.textContent="حسابي";subtitle.textContent="تخصيص محلي بسيط للواجهة.";content.className="feature-grid";const n=localStorage.getItem("mld_name")||"";content.innerHTML='<article class="feature-card account-card"><div class="feature-icon"></div><h3>اسم العرض</h3><p class="muted">هذا تخصيص على جهازك ولا يستبدل تسجيل دخول Discord.</p><input id="local-name" class="full" maxlength="30" placeholder="اسم العرض" value="'+esc(n)+'"><button class="primary wide" id="save-name">حفظ الاسم</button><p id="name-status" class="muted"></p></article>';$("#save-name").onclick=()=>{localStorage.setItem("mld_name",$("#local-name").value.trim());$("#name-status").textContent="تم الحفظ "};setStatus("الحساب جاهز")}
async function renderAdmin(){searchWrap.style.display="none";title.textContent="لوحة الإدارة";subtitle.textContent="بيانات الرتب والإحصائيات من Discord.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon"></div><h3>الرتب القيادية</h3><div id="admin-roles" class="roles">جاري التحميل...</div></article><article class="feature-card"><div class="feature-icon"></div><h3>إحصائيات</h3><div id="admin-stats" class="stats">جاري التحميل...</div></article><article class="feature-card"><div class="feature-icon"></div><h3>إرسال رسالة لعضو</h3><p class="muted">رسالة خاصة من إدارة MLD عبر Discord.</p><input id="admin-msg-search" class="full" maxlength="100" placeholder="ابحث باسم Discord"><div id="admin-msg-results" class="roles"></div><input id="admin-msg-title" class="full" maxlength="120" placeholder="عنوان الرسالة"><textarea id="admin-msg-body" class="full" rows="5" maxlength="2000" placeholder="اكتب الرسالة..."></textarea><button class="primary wide" id="admin-msg-send">إرسال</button><p id="admin-msg-status" class="muted"></p></article>';try{const [r,s]=await Promise.all([fetch("/api/public/roles").then(x=>x.json()),fetch("/api/public/server").then(x=>x.json())]);$("#admin-roles").innerHTML=(r.roles||[]).map(x=>'<span class="role">'+esc(x.name)+" · "+num(x.membersCount)+" عضو</span>").join("");$("#admin-stats").innerHTML=[[s.memberCount,"عضو"],[r.roles?.length||0,"رتبة قيادية"],["ONLINE","حالة الموقع"]].map(x=>'<b>'+esc(x[0])+'<small>'+esc(x[1])+"</small></b>").join("")}catch(e){$("#admin-roles").textContent="تعذر تحديث البيانات"}setStatus("لوحة الإدارة جاهزة")}
async function initAdminMessaging(){
 const input=$("#admin-msg-search"),results=$("#admin-msg-results"),send=$("#admin-msg-send"); if(!input||!results||!send)return;
 let selected=null,timer=null;
 input.oninput=()=>{clearTimeout(timer);selected=null;results.innerHTML="";const q=input.value.trim();if(!q)return;timer=setTimeout(async()=>{const d=await fetch("/api/public/members?q="+encodeURIComponent(q)+"&limit=8").then(r=>r.json()).catch(()=>({members:[]}));results.innerHTML=(d.members||[]).slice(0,8).map(m=>"<button type='button' class='role admin-recipient' data-id='"+esc(m.id)+"'>"+esc(m.name||m.username)+" · @"+esc(m.username||"")+"</button>").join("")||"<span class='muted'>لا توجد نتائج</span>";document.querySelectorAll(".admin-recipient").forEach(b=>b.onclick=()=>{selected=b.dataset.id;input.value=b.textContent;results.innerHTML="<span class='role'>تم اختيار العضو </span>"})},180)};
 send.onclick=async()=>{const st=$("#admin-msg-status"),body=$("#admin-msg-body").value.trim(),title=$("#admin-msg-title").value.trim()||"رسالة من إدارة MLD";if(!selected)return st.textContent="اختر عضوًا أولًا";if(!body)return st.textContent="اكتب الرسالة أولًا";send.disabled=true;try{const r=await fetch("/api/admin/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId:selected,title,message:body})}),d=await r.json();if(!r.ok)throw Error(d.error);st.textContent="تم إرسال الرسالة للعضو ";$("#admin-msg-body").value=""}catch(e){st.textContent=e.message||"تعذر الإرسال"}finally{send.disabled=false}};
}
function renderLogs(){searchWrap.style.display="none";title.textContent="السجل";subtitle.textContent="آخر الصفحات التي فتحتها على هذا الجهاز.";content.className="feature-card";const a=JSON.parse(localStorage.getItem("mld_logs")||"[]");content.innerHTML='<h3>سجل النشاط</h3><div class="log-list">'+(a.length?a.map(x=>'<div class="log-item"><span>'+esc(x.time)+'</span><b>'+esc(x.text)+'</b></div>').join(""):'<p class="muted">لا يوجد نشاط محفوظ.</p>')+'</div><button class="primary wide" id="clear-log">مسح السجل</button>';$("#clear-log").onclick=()=>{localStorage.removeItem("mld_logs");renderLogs()};setStatus("السجل جاهز")}
let mldUser=null;
async function mldMe(){try{const r=await fetch("/api/auth/me");const d=await r.json();mldUser=d.user||null;updateAuthBar();return mldUser}catch(e){return null}}
function updateAuthBar(){const el=$("#auth-bar");if(!el)return;const admin=!!mldUser&&["owner","admin"].includes(mldUser.role);document.querySelectorAll("#logs-nav,#logs-nav-mobile").forEach(b=>b.style.display=mldUser?.role==="owner"?"":"none");document.querySelectorAll("[data-admin-nav]").forEach(b=>b.remove());document.querySelectorAll('[data-view="login"]').forEach(b=>b.style.display=mldUser?"none":"");document.querySelectorAll('[data-view="tickets"]').forEach(b=>b.style.display=admin?"":"none");if(admin){const d=document.querySelector(".desktop-nav"),m=document.querySelector("#mobile-menu");if(d){const z=document.createElement("button");z.dataset.view="admin";z.dataset.adminNav="1";z.textContent=" الإدارة";z.onclick=()=>change("admin");d.insertBefore(z,d.querySelector(".invite"));if(mldUser.role==="owner"){const o=document.createElement("button");o.dataset.view="owner";o.dataset.adminNav="1";o.textContent=" لوحة الأونر";o.onclick=()=>change("owner");d.insertBefore(o,d.querySelector(".invite"));}}if(m){const z=document.createElement("button");z.dataset.view="admin";z.dataset.adminNav="1";z.textContent=" الإدارة";z.onclick=()=>change("admin");m.insertBefore(z,m.querySelector(".invite")||m.lastElementChild);if(mldUser.role==="owner"){const o=document.createElement("button");o.dataset.view="owner";o.dataset.adminNav="1";o.textContent=" لوحة الأونر";o.onclick=()=>change("owner");m.insertBefore(o,m.querySelector(".invite")||m.lastElementChild);}}}el.innerHTML=mldUser?'<div class="auth-chip">مرحبًا <b>'+esc(mldUser.username)+'</b> · Discord: <b>'+esc(mldUser.discordUsername)+'</b> · '+(mldUser.role==="owner"?" أونر":mldUser.role==="admin"?" إدارة":"عضو")+' <button id="logout-btn">خروج</button></div>':'<div class="auth-chip">غير مسجل · <button id="auth-open">تسجيل الدخول / إنشاء حساب</button></div>';$("#logout-btn")?.addEventListener("click",async()=>{await fetch("/api/auth/logout",{method:"POST"});location.reload()});$("#auth-open")?.addEventListener("click",()=>change("login"))}function authView(){
  if(mldUser){return change("home")}
  searchWrap.style.display="none"; title.textContent="تسجيل الدخول"; subtitle.textContent="الحساب يعمل فقط لأعضاء سيرفر MLD في Discord."; content.className="feature-grid";
  content.innerHTML='<article class="feature-card auth-card"><div class="feature-icon"></div><h3 id="auth-heading">تسجيل الدخول</h3><input id="auth-user" class="full" maxlength="32" placeholder="اسم المستخدم"><input id="auth-pass" class="full" type="password" maxlength="100" placeholder="كلمة المرور"><div id="discord-wrap"><input id="auth-discord" class="full" maxlength="100" placeholder="ابحث عن يوزرك في Discord"><input id="auth-discord-id" type="hidden"><div id="discord-suggestions" class="recipient-results"></div></div><button class="primary wide" id="auth-submit">دخول</button><button class="wide" id="auth-toggle">إنشاء حساب جديد</button><button class="wide" id="forgot-toggle">نسيت كلمة المرور؟</button><p id="auth-status" class="muted"></p></article><article class="feature-card"><div class="feature-icon"></div><h3>حماية الحساب</h3><p class="muted">لا نطلب كلمة مرور Discord. عند إنشاء الحساب اختر حسابك من أعضاء السيرفر للتأكد من اليوزر بشكل صحيح.</p></article>';
  let register=false,forgot=false,searchTimer=null;
  const sync=()=>{
    $("#auth-heading").textContent=forgot?"استعادة كلمة المرور":register?"إنشاء حساب":"تسجيل الدخول";
    $("#auth-submit").textContent=forgot?"إرسال للخاص":register?"إرسال طلب الإنشاء":"دخول";
    $("#auth-toggle").textContent=forgot?"العودة لتسجيل الدخول":register?"لدي حساب بالفعل":"إنشاء حساب جديد";
    $("#discord-wrap").classList.toggle("hidden",!register&&!forgot);
    $("#auth-pass").classList.toggle("hidden",forgot);
    $("#forgot-toggle").classList.toggle("hidden",forgot);
    if(!register){$("#auth-discord-id").value="";$("#discord-suggestions").innerHTML="";}
  };
  const ds=$("#auth-discord"), sid=$("#auth-discord-id"), sug=$("#discord-suggestions");
  ds.oninput=()=>{
    sid.value="";
    if(!register){sug.innerHTML="";return}
    clearTimeout(searchTimer); const q=ds.value.trim();
    if(q.length<1){sug.innerHTML="";return}
    sug.innerHTML='<span class="muted">جاري البحث...</span>';
    searchTimer=setTimeout(async()=>{
      try{
        const d=await fetch("/api/public/members?q="+encodeURIComponent(q)+"&limit=8").then(r=>r.json());
        const rows=d.members||[];
        sug.innerHTML=rows.length?rows.map(m=>'<button type="button" class="recipient discord-suggestion" data-discord-id="'+esc(m.id)+'" data-discord-username="'+esc(m.username||"")+'"><img src="'+esc(avatar(m))+'"><span>'+esc(m.name||m.username)+'<small>@'+esc(m.username||"")+'</small></span></button>').join(""):'<span class="muted">ما لقيت عضو بهذا اليوزر.</span>';
        sug.querySelectorAll("[data-discord-id]").forEach(btn=>btn.onclick=()=>{
          ds.value=btn.dataset.discordUsername;
          sid.value=btn.dataset.discordId;
          sug.innerHTML='<b class="selected">تم اختيار حسابك: @'+esc(btn.dataset.discordUsername)+' </b>';
        });
      }catch(e){sug.innerHTML='<span class="muted">تعذر جلب أعضاء السيرفر حاليًا.</span>'}
    },180);
  };
  $("#auth-toggle").onclick=()=>{if(forgot){forgot=false;register=false}else register=!register;sync()};
  $("#forgot-toggle").onclick=()=>{forgot=true;register=false;sync()};
  $("#auth-submit").onclick=async()=>{
    const st=$("#auth-status"),btn=$("#auth-submit"),username=$("#auth-user").value.trim(),discordUsername=ds.value.trim(),discordUserId=sid.value.trim();
    if(!username||((register||forgot)&&!discordUsername)) return st.textContent="عبّ كل البيانات المطلوبة";
    if(register&&!discordUserId)return st.textContent="اختر حسابك في Discord من الاقتراحات أولًا";
    btn.disabled=true; st.textContent="جاري المعالجة...";
    try{
      if(forgot){
        const r=await fetch("/api/auth/forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,discordUsername})}),d=await r.json();
        if(!r.ok)throw Error(d.error||"تعذر إرسال كلمة المرور المؤقتة");
        st.textContent="تم إرسال كلمة مرور مؤقتة إلى الخاص في Discord ";forgot=false;register=false;sync();
      }else{
        const body={username,password:$("#auth-pass").value};if(register){body.discordUsername=discordUsername;body.discordUserId=discordUserId}
        const r=await fetch(register?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d=await r.json();
        if(!r.ok)throw Error(d.error||"تعذر تسجيل الدخول");
        if(register&&d.pending){st.textContent="تم إرسال رسالة التأكيد إلى الخاص في Discord. اضغط «نعم» لإنشاء الحساب أو «لا» للإلغاء.";btn.disabled=false;return}
        mldUser=d.user||null;updateAuthBar();
        if(mldUser?.mustChangePassword){st.textContent="تم قبول كلمة المرور المؤقتة — غيّرها الآن";return renderPasswordChange()}
        st.textContent="تم بنجاح ";setTimeout(()=>change("home"),250);
      }
    }catch(e){st.textContent=e.message||"تعذر تنفيذ العملية"}finally{btn.disabled=false}
  };
  sync();setStatus("نظام الحسابات جاهز");
}
function renderPasswordChange(){
  searchWrap.style.display="none"; title.textContent="تغيير كلمة المرور"; subtitle.textContent="هذه الخطوة مطلوبة بعد استخدام كلمة المرور المؤقتة."; content.className="feature-grid";
  content.innerHTML='<article class="feature-card auth-card"><div class="feature-icon"></div><h3>ضع كلمة مرور جديدة</h3><input id="new-pass" class="full" type="password" maxlength="100" placeholder="كلمة المرور الجديدة"><input id="new-pass2" class="full" type="password" maxlength="100" placeholder="تأكيد كلمة المرور"><button class="primary wide" id="save-pass">حفظ كلمة المرور</button><p id="pass-status" class="muted"></p></article>';
  $("#save-pass").onclick=async()=>{const p=$("#new-pass").value,p2=$("#new-pass2").value,st=$("#pass-status"),btn=$("#save-pass");if(p.length<6)return st.textContent="كلمة المرور يجب أن تكون 6 أحرف على الأقل";if(p!==p2)return st.textContent="كلمتا المرور غير متطابقتين";btn.disabled=true;try{const r=await fetch("/api/auth/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({newPassword:p})}),d=await r.json();if(!r.ok)throw Error(d.error);mldUser.mustChangePassword=false;updateAuthBar();st.textContent="تم تغيير كلمة المرور بنجاح ";setTimeout(()=>change("home"),400)}catch(e){st.textContent=e.message||"تعذر تغيير كلمة المرور"}finally{btn.disabled=false}};
}
function needAuth(){if(!mldUser){mldMe().then(u=>{if(u){change(view)}else change("login")});setStatus("جاري التحقق من جلسة الدخول…");return false}return true}
async function siteStats(){try{if(!sessionStorage.getItem("mld_visit_counted")){await fetch("/api/site/visit",{method:"POST"});sessionStorage.setItem("mld_visit_counted","1")}const r=await fetch("/api/site/stats");if(!r.ok)throw Error("stats");return await r.json()}catch(e){return {visits:0,online:0}}}
let homeReviewTimer=null;
async function loadHomeReviews(){
  const box=$("#home-reviews");if(!box)return;
  const d=await fetch("/api/reviews?limit=100",{cache:"no-store"}).then(r=>r.ok?r.json():{reviews:[]}).catch(()=>({reviews:[]}));
  const rows=(d.reviews||[]).slice(0,100);
  clearInterval(homeReviewTimer);
  if(!rows.length){box.innerHTML="<div class=\"review-empty\">لا توجد آراء بعد — كن أول شخص يكتب رأيه.</div>";return}
  let offset=0;
  const draw=()=>{
    const visible=rows.slice(offset,offset+3);
    const list=visible.length===3?visible:visible.concat(rows.slice(0,3-visible.length));
    box.innerHTML=`<div class="review-rotator">${list.map(x=>`<article class="review-slide"><div class="review-stars">${"★".repeat(Number(x.rating)||0)}${"☆".repeat(Math.max(0,5-(Number(x.rating)||0)))}</div><b>${esc(x.username||"زائر مجهول")}</b><p>${esc(x.message||"")}</p></article>`).join("")}</div>`;
    offset=(offset+1)%Math.max(rows.length,1);
  };
  draw();homeReviewTimer=setInterval(draw,3500);
}
async function announcementsLoad(){const box=$("#announcement-bar");if(!box)return;try{const d=await fetch("/api/announcements",{cache:"no-store"}).then(r=>r.ok?r.json():{announcements:[]});const a=(d.announcements||[])[0];if(!a){box.classList.add("hidden");return}box.innerHTML='<span> '+esc(a.text)+'</span>'+(a.link?'<a href="'+esc(a.link)+'" target="_blank" rel="noopener">فتح</a>':'');box.classList.remove("hidden")}catch(e){box.classList.add("hidden")}}
async function homeView(){searchWrap.style.display="none";title.textContent="الصفحة الرئيسية";subtitle.textContent="كل شيء في واجهة واحدة — أعضاء، TOP، ألعاب، قروبات، آراء ودعم.";content.className="home-layout";const account=mldUser?'<article class="feature-card"><div class="feature-icon"></div><h3>حسابك</h3><p class="muted">مرحبًا '+esc(mldUser.username)+' · '+esc(mldUser.role)+'</p><button class="primary wide" data-home-go="account">فتح الحساب</button></article>':'<article class="feature-card"><div class="feature-icon"></div><h3>تسجيل الدخول</h3><p class="muted">سجّل مرة واحدة وتظهر لك ميزات الحساب.</p><button class="primary wide" data-home-go="login">دخول</button></article>';content.innerHTML='<section class="home-reviews-section"><div class="section-head"><div><p class="eyebrow">COMMUNITY VOICE</p><h2>آراء المجتمع</h2><p class="muted">آراء المجتمع تتحرك هنا بشكل تدريجي ومنتظم.</p></div><div class="home-review-actions"><button class="primary" data-home-go="reviews">كل الآراء</button><button class="ghost" data-home-go="reviews-add">إضافة رأي</button></div></div><div id="home-reviews" class="review-marquee"><span class="muted">جاري تحميل الآراء...</span></div></section><div class="feature-grid home-feature-grid"><article class="feature-card"><div class="feature-icon"></div><h3>الأعضاء</h3><p class="muted">أعضاء السيرفر والافتارات والرتب.</p><button class="primary wide" data-home-go="members">استكشف</button></article><article class="feature-card"><div class="feature-icon"></div><h3>TOP</h3><p class="muted">إحصائيات المجتمع وTOP الألعاب.</p><button class="primary wide" data-home-go="top">TOP</button></article><article class="feature-card"><div class="feature-icon"></div><h3>الألعاب</h3><p class="muted">جلسات ألعاب حقيقية مع إنشاء وانضمام ومشاهدة.</p><button class="primary wide" data-home-go="games">مركز الألعاب</button></article><article class="feature-card"><div class="feature-icon"></div><h3>القروبات</h3><p class="muted">قروبات عامة وأعضاء وطلبات انضمام.</p><button class="primary wide" data-home-go="groups">القروبات</button></article><article class="feature-card"><div class="feature-icon"></div><h3>رسالة خاصة</h3><p class="muted">محادثات خاصة للأعضاء المسجلين.</p><button class="primary wide" data-home-go="message">الرسائل</button></article><article class="feature-card"><div class="feature-icon"></div><h3>التذاكر</h3><p class="muted">الدعم والتذاكر ومتابعة الردود.</p><button class="primary wide" data-home-go="tickets">الدعم</button></article><article class="feature-card"><div class="feature-icon"></div><h3>التقديمات</h3><p class="muted">استعراض وإرسال التقديمات.</p><button class="primary wide" data-home-go="apply">التقديم</button></article>'+account+'</div>';const set=(s,v)=>{const e=$(s);if(e)e.textContent=v};try{const sc=await fetch("/api/public/server",{cache:"no-store"}).then(r=>r.ok?r.json():{});set("#server-name",sc.name||"MLD");set("#server-founder",sc.ownerName||"فهد المطيري");set("#server-count",num(sc.memberCount));if(sc.invite){$("#invite").href=sc.invite;$("#invite-mobile").href=sc.invite}}catch(e){}try{const stats=await siteStats();set("#server-online",num(stats.online));set("#server-visits",num(stats.visits))}catch(e){set("#server-online","0");set("#server-visits","0")}await loadHomeReviews();await announcementsLoad();setStatus("")}
function ticketRoleBadge(role){return '<span class="role-badge role-'+esc(role||"user")+'">'+(role==="owner"?"أونر":role==="admin"?"إداري":"عضو")+"</span>"}
async function ticketView(){searchWrap.style.display="none";title.textContent="التذاكر";subtitle.textContent="التذاكر الخاصة بك، والإدارة/الأونر يقدرون متابعة المحادثات والرد والإغلاق.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon"></div><h3>فتح تيكت</h3><input id="ticket-sub" class="full" maxlength="120" placeholder="عنوان الطلب"><textarea id="ticket-msg" class="full" rows="6" maxlength="3000" placeholder="اشرح طلبك..."></textarea><button class="primary wide" id="ticket-send">فتح التذكرة</button><p id="ticket-status" class="muted"></p></article><article class="feature-card"><h3>التذاكر</h3><div id="my-tickets" class="log-list">جاري التحميل...</div></article><article class="feature-card hidden" id="ticket-chat-card"><h3 id="ticket-chat-title">محادثة التيكت</h3><div id="ticket-chat" class="log-list"></div><textarea id="ticket-reply" class="full" rows="4" placeholder="اكتب ردك..."></textarea><button class="primary wide" id="ticket-reply-btn">إرسال الرد</button></article>';
$("#ticket-send").onclick=async()=>{if(!needAuth())return;try{const r=await fetch("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:$("#ticket-sub").value,message:$("#ticket-msg").value})}),d=await r.json();$("#ticket-status").textContent=r.ok?"تم فتح التيكت #"+d.id+" ":(d.error||"تعذر إنشاء التذكرة");if(r.ok)ticketView()}catch(e){$("#ticket-status").textContent="تعذر إنشاء التذكرة"}};
const d=await fetch("/api/tickets").then(r=>r.json()).catch(()=>({tickets:[]}));$("#my-tickets").innerHTML=(d.tickets||[]).map(x=>"<button class='group-item ticket-row' data-ticket-id='"+x.id+"'><span><b>#"+x.id+" · "+esc(x.subject)+"</b><small>"+esc(x.status)+" · "+esc(x.username||"")+"</small><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small></span><span>فتح ↗</span></button>").join("")||'<p class="muted">لا توجد تيكات.</p>';document.querySelectorAll("[data-ticket-id]").forEach(b=>b.onclick=()=>openTicket(Number(b.dataset.ticketId)));if(!mldUser)$("#ticket-send").textContent="سجّل دخولك لفتح تيكت";setStatus("نظام التيكت جاهز")}
async function openTicket(id){if(!needAuth())return;const r=await fetch("/api/owner/tickets/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"تعذر فتح المحادثة");const html=(d.messages||[]).map(m=>"<div class='log-item'><b>"+esc(m.username)+" · Discord: "+esc(m.discord_username)+" "+ticketRoleBadge(m.role)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.message)+"</p></div>").join("")||"<p class='muted'>لا رسائل</p>";if($("#ticket-chat-card")){$("#ticket-chat-card").classList.remove("hidden");$("#ticket-chat-title").textContent=" #"+id+" · "+esc(d.ticket?.subject||"محادثة التذكرة");$("#ticket-chat").innerHTML=html;$("#ticket-reply-btn").onclick=async()=>{const text=$("#ticket-reply").value.trim();if(!text)return;const rr=await fetch("/api/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})}),dd=await rr.json();if(!rr.ok)return alert(dd.error||"تعذر إرسال الرد");$("#ticket-reply").value="";openTicket(id)}}}

async function applyView(){searchWrap.style.display="none";title.textContent="التقديمات";subtitle.textContent="أرسل طلبك وتابع حالة تقديماتك.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon"></div><h3>تقديم جديد</h3><div id="dynamic-questions" class="form-stack"><div class="loading">جاري تحميل الأسئلة...</div></div><button class="primary wide" id="app-send">إرسال التقديم</button><p id="app-status" class="muted"></p></article><article class="feature-card"><h3>تقديماتي</h3><div id="my-apps" class="log-list">جاري التحميل...</div></article>';const q=await fetch("/api/application-questions").then(r=>r.ok?r.json():{}).catch(()=>({questions:[]}));const qs=q.questions||[];$("#dynamic-questions").innerHTML=(qs.length?qs:[{key:"experience",label:"خبرتك أو نبذة عنك",required:true},{key:"why",label:"ليش مناسب للتقديم؟",required:true}]).map(x=>`<label class="form-label">${esc(x.label)}${x.required?" *":""}<textarea class="full app-q" data-q="${esc(x.key)}" rows="4" maxlength="2000" placeholder="${esc(x.label)}"></textarea></label>`).join("");$("#app-send").onclick=async()=>{if(!needAuth())return;const answers={};document.querySelectorAll(".app-q").forEach(x=>answers[x.dataset.q]=x.value.trim());const r=await fetch("/api/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"إدارة",answers})}),d=await r.json();$("#app-status").textContent=d.error||`تم إرسال التقديم #${d.id} `;if(r.ok)loadMyApps()};const loadMyApps=async()=>{const el=$("#my-apps");if(!el)return;await mldMe();if(!mldUser){el.innerHTML="<p class='muted'>سجل دخولك لعرض تقديماتك.</p>";return}const r=await fetch("/api/my/applications"),d=await r.json();el.innerHTML=(d.applications||[]).map(x=>`<div class="log-item"><b>#${x.id} · ${esc(x.type)}</b><span>الحالة: ${esc(x.status)}</span><small>${new Date(x.created_at).toLocaleString("ar-SA")}</small></div>`).join("")||"<p class='muted'>ما عندك تقديمات سابقة.</p>"};loadMyApps()}
async function ownerPanel(){await mldMe();if(!mldUser||mldUser.role!=="owner")return authView();await renderAdmin();title.textContent="لوحة الأونر";subtitle.textContent="إحصائيات السيرفر والرتب وحالة المنصة.";setStatus("لوحة الأونر جاهزة")}
async function ownerLogs(){await mldMe();if(!mldUser||mldUser.role!=="owner"){return authView()}searchWrap.style.display="none";title.textContent="سجل الأونر";subtitle.textContent="آخر العمليات الإدارية المسجلة على الموقع.";content.className="feature-card";content.innerHTML="<div class='loading'>جاري تحميل السجل...</div>";try{const r=await fetch("/api/owner/logs"),d=await r.json();if(!r.ok)throw Error(d.error||"تعذر التحميل");content.innerHTML="<h3>سجل العمليات</h3><div class='log-list'>"+(d.logs||[]).map(x=>"<div class='log-item'><b>"+esc(x.action||"عملية")+"</b><span>"+esc(x.username||"النظام")+" · "+esc(x.discord_username||"")+"</span><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(x.details||"")+"</p></div>").join("")||"<p class='muted'>لا يوجد سجل حتى الآن.</p>"+"</div>"}catch(e){content.innerHTML="<p class='muted'>تعذر تحميل السجل حاليًا.</p>"}setStatus("السجل جاهز")}
async function reviewsView(){
  searchWrap.style.display="none";
  title.textContent="آراء المجتمع";
  subtitle.textContent="كل الآراء مرتبة تحت بعض مثل قائمة الأعضاء، مع إضافة رأي مباشرة.";
  content.className="feature-card reviews-page";
  content.innerHTML=`
<section class="reviews-head"><div><div class="feature-icon">⭐</div><h2>آراء المجتمع</h2><p class="muted">كل رأي جديد يظهر مباشرة في القائمة، سواء من عضو أو زائر.</p></div><button class="primary" id="review-add-top" type="button">إضافة رأي</button></section>
<section class="review-add-card" id="review-add-form"><div class="review-add-title"><div><h3>أضف رأيك</h3><p class="muted">رأيك يظهر في القائمة الرئيسية فور إضافته.</p></div><span class="review-add-icon">✦</span></div><div class="review-form-row"><select id="review-rating"><option value="5">★★★★★ — 5</option><option value="4">★★★★☆ — 4</option><option value="3">★★★☆☆ — 3</option><option value="2">★★☆☆☆ — 2</option><option value="1">★☆☆☆☆ — 1</option></select><textarea id="review-message" maxlength="1000" rows="4" placeholder="اكتب رأيك هنا..."></textarea><button class="primary" id="review-submit">إضافة الرأي</button></div><p id="review-form-status" class="muted"></p></section>
<section class="reviews-list-section"><div class="reviews-section-head"><div><h3>كل الآراء</h3><small class="muted" id="reviews-count">جاري التحميل...</small></div></div><div id="reviews-list" class="reviews-list-vertical">جاري التحميل...</div></section>`;
const renderReviews=(rows)=>{
  const list=rows||[];
  $("#reviews-count").textContent=list.length+" رأي";
  $("#reviews-list").innerHTML=list.length?list.map(x=>`<article class="review-card review-card-vertical"><div class="review-card-top"><div class="review-stars">${"★".repeat(Number(x.rating)||0)}${"☆".repeat(Math.max(0,5-(Number(x.rating)||0)))}</div><div class="review-author"><b>${esc(x.username||"زائر مجهول")}</b>${x.is_demo?'<span class="review-demo-badge">تجريبي</span>':''}</div></div><p>${esc(x.message)}</p><small>${new Date(x.created_at).toLocaleString("ar-SA")}</small></article>`).join(""):"<p class='muted'>لا توجد آراء منشورة بعد.</p>";
};
const loadReviews=async()=>{
  const r=await fetch("/api/reviews?ts="+Date.now(),{cache:"no-store"});
  const d=await r.json();
  if(!r.ok)throw Error(d.error||"تعذر تحميل الآراء");
  renderReviews(d.reviews||[]);
};
try{
  await loadReviews();
  $("#review-add-top").onclick=()=>$("#review-add-form")?.scrollIntoView({behavior:"smooth",block:"center"});
  $("#review-submit").onclick=async()=>{
    const btn=$("#review-submit"),msg=$("#review-message").value.trim(),rating=Number($("#review-rating").value),st=$("#review-form-status");
    if(msg.length<3){st.textContent="اكتب رأيًا من 3 أحرف على الأقل";return}
    btn.disabled=true;st.textContent="جاري إضافة رأيك...";
    try{
      const rr=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,rating})});
      const dd=await rr.json();
      if(!rr.ok)throw Error(dd.error||"تعذر إضافة الرأي");
      $("#review-message").value="";st.textContent="تمت إضافة رأيك بنجاح";
      await loadReviews();
      $("#reviews-list")?.querySelector(".review-card")?.scrollIntoView({behavior:"smooth",block:"center"});
    }catch(e){st.textContent=e.message||"تعذر إضافة الرأي"}
    finally{btn.disabled=false}
  };
}catch(e){$("#reviews-list").innerHTML="<p class='muted'>"+esc(e.message||"تعذر تحميل الآراء حاليًا")+"</p>"}
setStatus("الآراء جاهزة");
}
function chatBadge(role){return role==="owner"?"<span class='chat-badge owner'> المالك</span>":role==="admin"?"<span class='chat-badge admin'> إداري</span>":"<span class='chat-badge user'> عضو</span>"}
function stopChatPolling(){if(window.mldChatTimer){clearInterval(window.mldChatTimer);window.mldChatTimer=null}}
function chatMessageHtml(m,owner=false){const mine=m.sender===mldUser?.username;const canDelete=!m.deleted&&(mine||owner);const avatarUrl=esc(m.avatar||fallback);const sender=esc(m.sender);return `<article class="chat-msg ${mine?"mine":""}"><img src="${avatarUrl}" onerror="this.src='${fallback}'"><div class="chat-msg-main"><div class="chat-msg-head"><b>${esc(m.displayName)}</b>${chatBadge(m.role)}<small>${new Date(m.createdAt).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})}</small></div><div class="chat-msg-body">${esc(m.body)}</div>${canDelete?`<button class="chat-delete-btn" data-delete-msg="${esc(m.id)}">حذف للكل</button>`:""}${m.sender!==mldUser?.username?`<button class="chat-block-btn" data-block="${sender}">حظر</button>`:""}${owner&&m.sender!==mldUser?.username?`<button class="chat-mute-btn" data-mute="${sender}">كتم</button>`:""}</div></article>`}
async function mldChatView(mode="public"){
  await mldMe(); stopChatPolling();
  if(!mldUser){title.textContent="الشات";subtitle.textContent="سجل دخولك لاستخدام الشات.";searchWrap.style.display="none";content.className="feature-grid";content.innerHTML="<article class='feature-card chat-hero-card'><div class='chat-orb'></div><h2>MLD CHAT</h2><p class='muted'>شات كتابي عام وخاص، بروفايلات وصلاحيات حقيقية.</p><button class='primary wide' id='chat-login'>تسجيل الدخول</button></article>";$("#chat-login").onclick=()=>change("login");return}
  searchWrap.style.display="none";title.textContent="الشات";subtitle.textContent="الشات العام والمحادثات الخاصة في قائمة واحدة.";
  content.className="chat-shell";
  content.innerHTML="<aside class='chat-sidebar'><div class='chat-brand'><span></span><div><b>MLD CHAT</b><small>TEXT ONLY</small></div></div><button class='chat-tab "+(mode==="public"?"active":"")+"' data-chat-mode='public'> الشات العام</button><button class='chat-tab "+(mode!=="public"?"active":"")+"' data-chat-mode='private'> الخاص <span id='chat-unread'>0</span></button><button class='chat-tab' data-chat-mode='profile'> بروفايلي</button><button class='chat-tab' data-chat-mode='blocks'> المحظورون</button><div id='chat-side-list'></div></aside><section class='chat-main' id='chat-main'></section>";
  document.querySelectorAll("[data-chat-mode]").forEach(b=>b.onclick=()=>{const x=b.dataset.chatMode;if(x==="profile")mldChatProfile();else if(x==="blocks")mldChatBlocks();else mldChatView(x)});
  if(mode==="profile"){mldChatProfile();return}
  if(mode==="public")await mldPublicChat();else await mldPrivateChat();
}
async function mldPublicChat(){
  const main=$("#chat-main");main.innerHTML="<div class='chat-top'><div><b> الشات العام</b><small>كل أعضاء الموقع يقدرون يكتبون هنا</small></div><span class='live-dot'>● LIVE</span></div><div id='chat-feed' class='chat-feed'><div class='loading'>جاري تحميل الرسائل...</div></div><form id='chat-compose' class='chat-compose'><textarea id='chat-input' maxlength='2000' rows='2' placeholder='اكتب رسالتك...'></textarea><button class='primary' type='submit'>إرسال ↵</button></form><p id='chat-error' class='chat-error'></p>";
  const load=async()=>{if(document.hidden)return;try{const d=await fetch("/api/chat/public?limit=60").then(r=>r.json());if(!d.messages)return;$("#chat-feed").innerHTML=d.messages.map(x=>chatMessageHtml(x,mldUser.role==="owner")).join("")||"<div class='chat-empty'>ابدأ أول رسالة في MLD </div>";const feed=$("#chat-feed");feed.scrollTop=feed.scrollHeight;document.querySelectorAll("[data-block]").forEach(b=>b.onclick=async()=>{if(!confirm("حظر @"+b.dataset.block+" من محادثاتك الخاصة؟"))return;const r=await fetch("/api/chat/blocks/"+encodeURIComponent(b.dataset.block),{method:"POST"});if(!r.ok)alert((await r.json()).error||"تعذر الحظر");else alert("تم حظر المستخدم ")});document.querySelectorAll("[data-delete-msg]").forEach(b=>b.onclick=async()=>{if(!confirm("حذف الرسالة عند الجميع؟"))return;const r=await fetch("/api/chat/public/"+encodeURIComponent(b.dataset.deleteMsg),{method:"DELETE"});if(!r.ok)return alert((await r.json()).error||"تعذر الحذف");load()});document.querySelectorAll("[data-mute]").forEach(b=>b.onclick=async()=>{const min=prompt("مدة الكتم بالدقائق — اتركها 0 للكتم الدائم","10");if(min===null)return;const r=await fetch("/api/chat/public/mute/"+encodeURIComponent(b.dataset.mute),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({minutes:Number(min),reason:"إدارة الشات العام"})});if(!r.ok)alert((await r.json()).error||"تعذر الكتم")})}catch(e){}};
  await load();window.mldChatTimer=setInterval(load,3500);document.addEventListener("visibilitychange",()=>{if(document.hidden)stopChatPolling()},{once:true});
  $("#chat-compose").onsubmit=async e=>{e.preventDefault();const input=$("#chat-input"),body=input.value.trim(),err=$("#chat-error");if(!body)return;const r=await fetch("/api/chat/public",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),d=await r.json();if(!r.ok){err.textContent=d.error||"تعذر الإرسال";return}err.textContent="";input.value="";await load();input.focus()};
}
async function mldPrivateChat(){
  const main=$("#chat-main");main.innerHTML="<div class='chat-top'><div><b> المحادثات الخاصة</b><small>محادثة مع شخص أو مجموعة — لكل محادثة مالك</small></div><button class='primary' id='new-chat'>＋ محادثة</button></div><div id='private-list' class='private-list'><div class='loading'>جاري تحميل المحادثات...</div></div><div id='private-room' class='private-room hidden'></div>";
  const d=await fetch("/api/chat/conversations").then(r=>r.json());const list=$("#private-list");list.innerHTML=(d.conversations||[]).map(x=>"<button class='conversation' data-conv='"+x.id+"'><span class='conv-icon'>"+(x.kind==="private_group"?"":"")+"</span><span><b>"+esc(x.title||"محادثة خاصة")+"</b><small>"+esc(x.last_message||"لا توجد رسائل بعد")+"</small></span>"+(x.unread?"<em>"+x.unread+"</em>":"")+"</button>").join("")||"<div class='chat-empty'>لا توجد محادثات. أنشئ أول محادثة.</div>";
  document.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>openPrivateRoom(Number(b.dataset.conv)));
  $("#new-chat").onclick=async()=>{const names=prompt("اكتب يوزرات الأعضاء مفصولة بفاصلة");if(!names)return;const participants=names.split(",").map(x=>x.trim()).filter(Boolean);const r=await fetch("/api/chat/conversations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({participants,title:participants.length>1?"مجموعة MLD":"محادثة خاصة"})}),x=await r.json();if(!r.ok)return alert(x.error||"تعذر إنشاء المحادثة");await mldPrivateChat();openPrivateRoom(x.conversation.id)};
}
async function openPrivateRoom(id){
  const room=$("#private-room");if(!room)return;$("#private-list").classList.add("hidden");room.classList.remove("hidden");room.innerHTML="<button id='room-back' class='chat-back'>← المحادثات</button><div class='chat-top'><div><b> محادثة MLD</b><small>رسائل نصية فقط</small></div></div><div id='room-feed' class='chat-feed'></div><form id='room-compose' class='chat-compose'><textarea id='room-input' maxlength='2000' rows='2' placeholder='اكتب رسالتك...'></textarea><button class='primary'>إرسال ↵</button></form><p id='room-error' class='chat-error'></p>";
  $("#room-back").onclick=()=>mldPrivateChat();
  const load=async()=>{if(document.hidden)return;try{const d=await fetch("/api/chat/conversations/"+id+"/messages?limit=80").then(r=>r.json());if(!d.messages)throw Error(d.error);$("#room-feed").innerHTML=d.messages.map(x=>chatMessageHtml(x,mldUser.role==="owner")).join("")||"<div class='chat-empty'>ابدأ المحادثة </div>";document.querySelectorAll("[data-delete-msg]").forEach(b=>b.onclick=async()=>{if(!confirm("حذف الرسالة عند الجميع؟"))return;const r=await fetch("/api/chat/conversations/"+id+"/messages/"+encodeURIComponent(b.dataset.deleteMsg),{method:"DELETE"});if(!r.ok)return alert((await r.json()).error||"تعذر الحذف");load()});const f=$("#room-feed");f.scrollTop=f.scrollHeight}catch(e){$("#room-error").textContent=e.message||"تعذر التحميل"}};
  await load();window.mldChatTimer=setInterval(load,3500);document.addEventListener("visibilitychange",()=>{if(document.hidden)stopChatPolling()},{once:true});
  $("#room-compose").onsubmit=async e=>{e.preventDefault();const input=$("#room-input"),body=input.value.trim();if(!body)return;const r=await fetch("/api/chat/conversations/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),d=await r.json();if(!r.ok)return $("#room-error").textContent=d.error||"تعذر الإرسال";$("#room-error").textContent="";input.value="";await load();input.focus()};
}
async function mldChatBlocks(){const main=$("#chat-main");main.innerHTML="<div class=\"chat-top\"><div><b> المستخدمون المحظورون</b><small>تقدر تفك الحظر في أي وقت.</small></div></div><div id=\"blocks-list\" class=\"private-list\">جاري التحميل...</div>";const d=await fetch("/api/chat/blocks").then(r=>r.json());$("#blocks-list").innerHTML=(d.blocks||[]).map(u=>"<div class=\"conversation\"><b>@"+esc(u)+"</b><button class=\"primary\" data-unblock=\""+esc(u)+"\">فك الحظر</button></div>").join("")||"<div class=\"chat-empty\">ما عندك مستخدمين محظورين.</div>";document.querySelectorAll("[data-unblock]").forEach(b=>b.onclick=async()=>{await fetch("/api/chat/blocks/"+encodeURIComponent(b.dataset.unblock),{method:"DELETE"});mldChatBlocks()})}
async function mldChatProfile(){
  await mldMe();stopChatPolling();searchWrap.style.display="none";title.textContent="بروفايلي";subtitle.textContent="الاسم والأفاتار والنبذة التي تظهر في الشات.";content.className="feature-grid";const d=await fetch("/api/chat/profile").then(r=>r.json()),p=d.profile||{};content.innerHTML="<article class='feature-card profile-editor'><div class='chat-profile-preview'><img id='chat-avatar-preview' src='"+esc(p.avatar_url||fallback)+"' onerror=\"this.src='"+fallback+"'\"><div><b id='chat-name-preview'>"+esc(p.display_name||mldUser.username)+"</b>"+chatBadge(p.role)+"<small>@"+esc(mldUser.username)+"</small></div></div><label>الاسم الظاهر<input id='profile-name' class='full' maxlength='60' value='"+esc(p.display_name||mldUser.username)+"'></label><label>رابط الأفاتار<input id='profile-avatar' class='full' maxlength='500' value='"+esc(p.avatar_url||"")+"' placeholder='https://...'></label><label>نبذة<textarea id='profile-bio' class='full' maxlength='240' rows='4'>"+esc(p.bio||"")+"</textarea></label><button class='primary wide' id='profile-save'>حفظ البروفايل</button><p id='profile-status' class='muted'></p></article>";
  $("#profile-save").onclick=async()=>{const r=await fetch("/api/chat/profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:$("#profile-name").value,avatarUrl:$("#profile-avatar").value,bio:$("#profile-bio").value})}),x=await r.json();$("#profile-status").textContent=r.ok?"تم حفظ البروفايل ":(x.error||"تعذر الحفظ");if(r.ok){$("#chat-name-preview").textContent=x.profile.display_name;$("#chat-avatar-preview").src=x.profile.avatar_url||fallback}};
}



async function enhancedTicketView(){
  await mldMe(); searchWrap.style.display="none"; title.textContent="مركز التذاكر"; subtitle.textContent="كل تيكت له محادثة نصية كاملة وتسجيل إداري لكل حركة."; content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>فتح تيكت جديد</h3><input id='ticket-sub' class='full' maxlength='120' placeholder='عنوان الطلب'><textarea id='ticket-msg' class='full' rows='6' maxlength='3000' placeholder='اشرح طلبك بالتفصيل...'></textarea><button class='primary wide' id='ticket-send'>فتح التذكرة</button><p id='ticket-status' class='muted'></p></article><article class='feature-card'><h3>تيكاتي</h3><div id='my-tickets' class='log-list'>جاري التحميل...</div></article><article class='feature-card hidden' id='ticket-chat-card'><div class='chat-top'><div><b id='ticket-chat-title'> محادثة التيكت</b><small>رسائل نصية + تحديث مباشر</small></div></div><div id='ticket-chat' class='chat-feed'></div><form id='ticket-reply-form' class='chat-compose'><textarea id='ticket-reply' class='full' rows='2' maxlength='3000' placeholder='اكتب ردك...'></textarea><button class='primary'>إرسال ↵</button></form><p id='ticket-reply-status' class='chat-error'></p></article>";
  const load=async()=>{const d=await fetch("/api/tickets").then(r=>r.json()).catch(()=>({tickets:[]}));$("#my-tickets").innerHTML=(d.tickets||[]).map(x=>"<button class='group-item ticket-row' data-ticket-id='"+x.id+"'><span><b>#"+x.id+" · "+esc(x.subject)+"</b><small>"+esc(x.status)+" · "+esc(x.username||"")+"</small><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small></span><span>محادثة ↗</span></button>").join("")||"<p class='muted'>لا توجد تيكات.</p>";document.querySelectorAll("[data-ticket-id]").forEach(b=>b.onclick=()=>enhancedOpenTicket(Number(b.dataset.ticketId)))};
  $("#ticket-send").onclick=async()=>{if(!needAuth())return;const r=await fetch("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:$("#ticket-sub").value,message:$("#ticket-msg").value})}),d=await r.json();if(!r.ok)return $("#ticket-status").textContent=d.error||"تعذر فتح التيكت";$("#ticket-status").textContent="تم فتح التيكت #"+d.id+" ";await load();enhancedOpenTicket(Number(d.id))};
  if(!mldUser)$("#ticket-send").textContent="سجّل دخولك لفتح تيكت"; await load();
}
async function enhancedOpenTicket(id){
  if(!needAuth())return;
  const r=await fetch("/api/owner/tickets/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"تعذر فتح المحادثة");
  const card=$("#ticket-chat-card");if(!card){return} card.classList.remove("hidden");$("#ticket-chat-title").textContent=" محادثة التيكت #"+id;
  const render=()=>{$("#ticket-chat").innerHTML=(d.messages||[]).map(m=>"<article class='chat-msg'><div class='chat-msg-main'><div class='chat-msg-head'><b>"+esc(m.username)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small></div><div class='chat-msg-body'>"+esc(m.message)+"</div></div></article>").join("")||"<div class='chat-empty'>لا توجد رسائل</div>";const f=$("#ticket-chat");f.scrollTop=f.scrollHeight};
  render();
  $("#ticket-reply-form").onsubmit=async e=>{e.preventDefault();const body=$("#ticket-reply").value.trim();if(!body)return;const rr=await fetch("/api/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:body})}),dd=await rr.json();if(!rr.ok)return $("#ticket-reply-status").textContent=dd.error||"تعذر الإرسال";$("#ticket-reply").value="";$("#ticket-reply-status").textContent="";const nr=await fetch("/api/tickets/"+id+"/messages");d.messages=(await nr.json()).messages||[];render()};
}
async function enhancedGroupsReal(){
  await mldMe();searchWrap.style.display="none";title.textContent="قروبات السيرفر";subtitle.textContent="نظام مستقل عن الخاص: طلب إنشاء، موافقة الأونر، رول وروم Discord، وطلبات انضمام.";content.className="feature-grid";
  const load=async()=>{
    const d=await fetch("/api/groups").then(r=>r.json()).catch(()=>({groups:[]}));
    content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>إنشاء قروب سيرفر</h3><p class='muted'>بعد الإنشاء يوصلك طلب اعتماد للأونر عبر Discord. عند الموافقة ينشأ رول وروم خاص بالقروب.</p><input id='group-name' class='full' maxlength='60' placeholder='اسم القروب'><input id='group-desc' class='full' maxlength='240' placeholder='وصف القروب'><button class='primary wide' id='group-create'>إرسال طلب إنشاء</button><p id='group-create-status' class='muted'></p></article>"+
    (d.groups||[]).map(g=>{
      const owner=mldUser&&mldUser.username===g.owner_username, approved=g.status==="approved";
      const member=(g.members||[]).some(m=>String(m.username||"").toLowerCase()===String(mldUser?.username||"").toLowerCase()); const action=owner&&!approved?"<span class='group-status pending'>⏳ بانتظار موافقة الأونر</span>":approved&&member?(owner?"<button data-group-requests='"+g.id+"'>طلبات الانضمام</button><button class='primary' data-group-chat='"+(g.group_conversation_id||0)+"'> شات القروب</button>":"<button class='primary' data-group-chat='"+(g.group_conversation_id||0)+"'> شات القروب</button>"):approved?"<button data-group-join='"+g.id+"'> طلب انضمام</button>":"<span class='group-status'>"+esc(g.status||"pending")+"</span>";
      return "<article class='feature-card group-card'><div class='feature-icon'></div><h3>"+esc(g.name)+"</h3><p class='muted'>"+esc(g.description||"بدون وصف")+"</p><div class='group-meta'> "+esc(g.owner_username)+" ·  "+g.member_count+" · "+(approved?" معتمد":" قيد الاعتماد")+"</div><div class='group-members'>"+(g.members||[]).map(m=>"<span>"+esc(m.username)+(m.username===g.owner_username?" ":"")+"</span>").join("")+"</div><div class='game-lobby-actions'>"+action+"</div></article>";
    }).join("")||"<p class='muted'>لا توجد قروبات معتمدة حتى الآن.</p>";
    $("#group-create").onclick=async()=>{
      if(!needAuth())return;
      const r=await fetch("/api/groups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("#group-name").value,description:$("#group-desc").value})}),x=await r.json();
      $("#group-create-status").textContent=r.ok?"تم إرسال طلب القروب للأونر عبر Discord ":(x.error||"تعذر إرسال الطلب");
      if(r.ok)await load();
    };
    document.querySelectorAll("[data-group-chat]").forEach(b=>b.onclick=()=>openGroupChat(Number(b.dataset.groupChat)));
    document.querySelectorAll("[data-group-join]").forEach(b=>b.onclick=async()=>{
      if(!needAuth())return;
      const r=await fetch("/api/groups/"+b.dataset.groupJoin+"/join",{method:"POST"}),x=await r.json();
      alert(r.ok?"تم إرسال طلب الانضمام لمالك القروب ":(x.error||"تعذر إرسال الطلب")); if(r.ok)load();
    });
    document.querySelectorAll("[data-group-requests]").forEach(b=>b.onclick=async()=>{
      const r=await fetch("/api/groups/"+b.dataset.groupRequests+"/requests"),x=await r.json();
      if(!r.ok)return alert(x.error||"تعذر تحميل الطلبات");
      const pending=(x.requests||[]).filter(v=>v.status==="pending");
      if(!pending.length)return alert("ما فيه طلبات معلقة حاليًا.");
      const item=pending[0];
      const ok=confirm("طلب انضمام من "+item.username+"\nاضغط موافق لقبوله.");
      if(!ok)return;
      const rr=await fetch("/api/groups/"+b.dataset.groupRequests+"/requests/"+item.id,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"approved"})});
      alert(rr.ok?"تم قبول العضو ":"تعذر قبول العضو"); if(rr.ok)load();
    });
  };
  await load();
}

async function openGroupChat(id){
  if(!id)return alert("هذه القروب لم يتم إنشاء محادثته بعد");
  const r=await fetch("/api/chat/conversations/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"لا تملك صلاحية المحادثة");
  searchWrap.style.display="none";title.textContent="محادثة القروب";subtitle.textContent="كتابة فقط · أعضاء القروب فقط";content.className="chat-shell";
  content.innerHTML="<section class='chat-main'><div class='chat-top'><div><b> محادثة القروب</b><small>نص فقط</small></div><button id='group-chat-back'>رجوع</button></div><div id='group-chat-feed' class='chat-feed'></div><form id='group-chat-form' class='chat-compose'><textarea id='group-chat-input' maxlength='2000' rows='2' placeholder='اكتب في القروب...'></textarea><button class='primary'>إرسال ↵</button></form><p id='group-chat-error' class='chat-error'></p></section>";
  const render=()=>{$("#group-chat-feed").innerHTML=(d.messages||[]).map(x=>chatMessageHtml(x,false)).join("")||"<div class='chat-empty'>ابدأ المحادثة </div>";const f=$("#group-chat-feed");f.scrollTop=f.scrollHeight};
  render();$("#group-chat-back").onclick=()=>enhancedGroupsReal();$("#group-chat-form").onsubmit=async e=>{e.preventDefault();const body=$("#group-chat-input").value.trim();if(!body)return;const rr=await fetch("/api/chat/conversations/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),dd=await rr.json();if(!rr.ok)return $("#group-chat-error").textContent=dd.error||"تعذر الإرسال";$("#group-chat-input").value="";const nr=await fetch("/api/chat/conversations/"+id+"/messages"),nd=await nr.json();d.messages=nd.messages||[];render()};
}
ticketView=enhancedTicketView;
var groupsReal=enhancedGroupsReal;/* MLD Admin Control Center */
window.adminPanel=async function(){
  await mldMe();
  if(!mldUser||!["admin","owner"].includes(mldUser.role))return authView();
  searchWrap.style.display="none";
  title.textContent="لوحة الإدارة";
  subtitle.textContent="لوحة الإدارة — التقديمات والتذاكر فقط.";
  content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>التقديمات</h3><p class='muted'>عرض ومراجعة طلبات الأعضاء وقبولها أو رفضها.</p><button class='primary wide' data-admin-tab='apps'>فتح التقديمات</button></article><article class='feature-card'><div class='feature-icon'></div><h3>التذاكر</h3><p class='muted'>عرض التذاكر وفتح المحادثات وإغلاقها.</p><button class='primary wide' data-admin-tab='tickets'>فتح التذاكر</button></article><article class='feature-card'><div class='feature-icon'></div><h3>رسالة لعضو</h3><p class='muted'>إرسال رسالة خاصة من إدارة MLD عبر Discord.</p><button class='primary wide' data-admin-tab='message'>إرسال رسالة</button></article><div id='admin-panel-body' class='feature-grid'></div>";
  const body=$("#admin-panel-body");
  async function loadAdminMessage(){
    body.innerHTML="<article class='feature-card'><h3> إرسال رسالة لعضو</h3><input id='admin-msg-search' class='full' maxlength='100' placeholder='ابحث باسم Discord'><div id='admin-msg-results' class='roles'></div><input id='admin-msg-title' class='full' maxlength='120' placeholder='عنوان الرسالة'><textarea id='admin-msg-body' class='full' rows='5' maxlength='2000' placeholder='اكتب الرسالة...'></textarea><button class='primary wide' id='admin-msg-send'>إرسال</button><p id='admin-msg-status' class='muted'></p></article>";
    const input=$("#admin-msg-search"),results=$("#admin-msg-results"),send=$("#admin-msg-send"); let selected=null,timer=null;
    input.oninput=()=>{clearTimeout(timer);selected=null;results.innerHTML="";const q=input.value.trim();if(!q)return;timer=setTimeout(async()=>{const d=await fetch("/api/public/members?q="+encodeURIComponent(q)+"&limit=8").then(r=>r.json()).catch(()=>({members:[]}));results.innerHTML=(d.members||[]).slice(0,8).map(m=>"<button type='button' class='role admin-recipient' data-id='"+esc(m.id)+"'>"+esc(m.name||m.username)+" · @"+esc(m.username||"")+"</button>").join("")||"<span class='muted'>لا توجد نتائج</span>";document.querySelectorAll(".admin-recipient").forEach(b=>b.onclick=()=>{selected=b.dataset.id;input.value=b.textContent;results.innerHTML="<span class='role'>تم اختيار العضو </span>"})},180)};
    send.onclick=async()=>{const st=$("#admin-msg-status"),bodyText=$("#admin-msg-body").value.trim(),titleText=$("#admin-msg-title").value.trim()||"رسالة من إدارة MLD";if(!selected)return st.textContent="اختر عضوًا أولًا";if(!bodyText)return st.textContent="اكتب الرسالة أولًا";send.disabled=true;try{const r=await fetch("/api/admin/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId:selected,title:titleText,message:bodyText})}),d=await r.json();if(!r.ok)throw Error(d.error);st.textContent="تم إرسال الرسالة للعضو ";$("#admin-msg-body").value=""}catch(e){st.textContent=e.message||"تعذر الإرسال"}finally{send.disabled=false}};
  }
  async function loadApps(){
    const r=await fetch("/api/owner/applications"),d=await r.json();
    if(!r.ok)return body.innerHTML="<article class='feature-card'><p class='muted'>"+esc(d.error||"تعذر تحميل التقديمات")+"</p></article>";
    body.innerHTML="<article class='feature-card'><h3>التقديمات</h3><div class='log-list'>"+(d.applications||[]).map(a=>"<div class='log-item'><b>#"+a.id+" · "+esc(a.type)+"</b><span>الحساب: "+esc(a.username)+" · Discord: "+esc(a.discord_username)+"</span><small>"+new Date(a.created_at).toLocaleString("ar-SA")+" · "+esc(a.status)+"</small><p>"+esc(JSON.stringify(a.answers||{},null,2))+"</p><div class='game-lobby-actions'>"+(a.status==="pending"?"<button class='primary' data-admin-app-ok='"+a.id+"'>قبول</button><button data-admin-app-no='"+a.id+"'>رفض</button>":"<b>"+(a.status==="approved"?" مقبول":" مرفوض")+"</b>")+"</div></div>").join("")||"<p class='muted'>لا توجد تقديمات.</p>"+"</div></article>";
    document.querySelectorAll("[data-admin-app-ok]").forEach(b=>b.onclick=async()=>{const rr=await fetch("/api/owner/applications/"+b.dataset.adminAppOk+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"approved"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر القبول");loadApps()});
    document.querySelectorAll("[data-admin-app-no]").forEach(b=>b.onclick=async()=>{const rr=await fetch("/api/owner/applications/"+b.dataset.adminAppNo+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"rejected"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر الرفض");loadApps()});
  }
  async function loadTickets(){
    const r=await fetch("/api/owner/tickets"),d=await r.json();
    if(!r.ok)return body.innerHTML="<article class='feature-card'><p class='muted'>"+esc(d.error||"تعذر تحميل التذاكر")+"</p></article>";
    body.innerHTML="<article class='feature-card'><h3>التذاكر</h3><div class='log-list'>"+(d.tickets||[]).map(t=>"<button class='group-item' data-admin-ticket='"+t.id+"'><span><b>#"+t.id+" · "+esc(t.subject)+"</b><small>"+esc(t.username)+" · Discord: "+esc(t.discord_username)+" · "+esc(t.status)+"</small></span><span>فتح ↗</span></button>").join("")||"<p class='muted'>لا توجد تذاكر.</p>"+"</div></article>";
    document.querySelectorAll("[data-admin-ticket]").forEach(b=>b.onclick=()=>openAdminTicket(Number(b.dataset.adminTicket)));
  }
  async function openAdminTicket(id){
    const r=await fetch("/api/tickets/"+id+"/messages"),d=await r.json();
    if(!r.ok)return alert(d.error||"تعذر فتح التيكت");
    const closed=d.ticket?.status==="closed";
    body.innerHTML="<article class='feature-card'><button id='admin-ticket-back'>رجوع</button><h3> تيكت #"+id+"</h3><p class='muted'>"+esc(d.ticket?.subject||"")+" · الحالة: <b>"+(closed?" مغلق":" مفتوح")+"</b></p><div class='log-list'>"+(d.messages||[]).map(m=>"<div class='log-item'><b>"+esc(m.username)+" · Discord: "+esc(m.discord_username)+" "+ticketRoleBadge(m.role)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.message)+"</p></div>").join("")||"<p class='muted'>لا توجد رسائل.</p>"+"</div>"+(closed?"":"<textarea id='admin-ticket-reply' class='full' rows='4' placeholder='رد على صاحب التيكت...'></textarea><button class='primary wide' id='admin-ticket-send'>إرسال الرد</button>")+"<div class='game-lobby-actions'>"+(closed?"<button class='primary' id='admin-ticket-open'>إعادة فتح التيكت</button>":"<button class='danger' id='admin-ticket-close'>إغلاق وحفظ المحادثة</button>")+"</div></article>";
    $("#admin-ticket-back").onclick=loadTickets;
    if(closed)$("#admin-ticket-open").onclick=async()=>{const rr=await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"open"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر إعادة الفتح");openAdminTicket(id)};
    else{$("#admin-ticket-send").onclick=async()=>{const text=$("#admin-ticket-reply").value.trim();if(!text)return;const rr=await fetch("/api/owner/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر إرسال الرد");openAdminTicket(id)};$("#admin-ticket-close").onclick=async()=>{const rr=await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"closed"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر الإغلاق");openAdminTicket(id)}}
  }
  document.querySelectorAll("[data-admin-tab]").forEach(b=>b.onclick=()=>b.dataset.adminTab==="apps"?loadApps():b.dataset.adminTab==="message"?loadAdminMessage():loadTickets());
  await loadApps();
  setStatus("لوحة الإدارة جاهزة");
};

async function ownerBroadcastView(){
  searchWrap.style.display="none";title.textContent="برودكاست السيرفر";subtitle.textContent="إرسال رسالة خاصة من البوت إلى أعضاء السيرفر — للأونر فقط.";content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><h3>برودكاست السيرفر</h3><p class='muted'>اكتب رسالتك ثم أرسلها لكل أعضاء السيرفر. الحد الأقصى 2000 حرف.</p><div class='form-stack'><textarea id='broadcast-main-text' class='full' maxlength='2000' rows='9' placeholder='اكتب الرسالة هنا...'></textarea><button class='primary wide' id='broadcast-main-send'>إرسال للجميع</button><p id='broadcast-main-status' class='muted'></p></div></article>";
  $("#broadcast-main-send").onclick=async()=>{const message=$("#broadcast-main-text").value.trim(),st=$("#broadcast-main-status"),btn=$("#broadcast-main-send");if(!message)return st.textContent="اكتب الرسالة أولًا.";if(!confirm("متأكد من إرسال الرسالة لكل أعضاء السيرفر؟"))return;btn.disabled=true;st.textContent="جاري الإرسال...";try{const r=await fetch("/api/owner/broadcast",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})}),d=await r.json();if(!r.ok)throw Error(d.error||"تعذر الإرسال");st.textContent="تم: أُرسلت "+d.sent+"، وتعذر الوصول إلى "+d.failed+" من أصل "+d.total+".";if(d.failed&&d.failures?.length){content.insertAdjacentHTML("beforeend","<article class='feature-card'><h3>تعذر الإرسال لبعض الأعضاء</h3><div class='log-list'>"+d.failures.map(x=>"<div class='log-item'><b>"+esc(x.username)+"</b><small>"+esc(x.id)+"</small><p>"+esc(x.reason)+"</p></div>").join("")+"</div></article>")}}catch(e){st.textContent=e.message}finally{btn.disabled=false}};
}
/* MLD Owner Control Center */
async function ownerControlCenter(){
  await mldMe(); if(!mldUser||mldUser.role!=="owner")return authView();
  searchWrap.style.display="none"; title.textContent="لوحة الأونر"; subtitle.textContent="تحكم كامل: التقديمات، التذاكر، القروبات، الألعاب، الزاجل، اللوقات والإعلانات."; content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>مركز الأونر</h3><div class='game-lobby-actions'><button class='primary' data-owner-tab='apps'> التقديمات</button><button data-owner-tab='tickets'> التذاكر</button><button data-owner-tab='groups'> القروبات</button><button data-owner-tab='group-requests'> طلبات القروبات</button><button data-owner-tab='games'> الألعاب</button><button data-owner-tab='logs'> لوقات الحسابات</button><button data-owner-tab='zajel-log'> لوق الزاجل</button><button data-owner-tab='deleted-messages'> الرسائل المحذوفة</button><button data-owner-tab='group-logs'> لوق القروبات</button><button data-owner-tab='users'> الحسابات</button><button data-owner-tab='anonymous-log'> لوق الفضفضة</button><button data-owner-tab='announcements'> الشريط الإعلاني</button><button data-owner-tab='broadcast'> برودكاست</button></div></article><div id='owner-panel-body' class='feature-grid'></div>";
  const body=$("#owner-panel-body");
  async function loadApps(){const r=await fetch("/api/owner/applications"),d=await r.json();body.innerHTML="<article class='feature-card'><h3> التقديمات</h3><div class='log-list'>"+(d.applications||[]).map(a=>"<div class='log-item'><b>#"+a.id+" · "+esc(a.type)+"</b><span>"+esc(a.username)+" · "+esc(a.discord_username)+"</span><small>"+new Date(a.created_at).toLocaleString("ar-SA")+" · "+esc(a.status)+"</small><pre>"+esc(JSON.stringify(a.answers||{},null,2))+"</pre><div class='game-lobby-actions'>"+(a.status==="pending"?"<button class='primary' data-app-ok='"+a.id+"'>قبول + إعطاء الرتبة</button><button data-app-no='"+a.id+"'>رفض</button>":"<b>"+(a.status==="approved"?" مقبول":" مرفوض")+"</b>")+"</div></div>").join("")||"<p class='muted'>لا توجد تقديمات.</p>"+"</div></article>";document.querySelectorAll("[data-app-ok]").forEach(b=>b.onclick=async()=>{const rr=await fetch("/api/owner/applications/"+b.dataset.appOk+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"approved"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر القبول");loadApps()});document.querySelectorAll("[data-app-no]").forEach(b=>b.onclick=async()=>{const rr=await fetch("/api/owner/applications/"+b.dataset.appNo+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"rejected"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر الرفض");loadApps()})}
  async function loadTickets(){const r=await fetch("/api/owner/tickets"),d=await r.json();if(!r.ok)return body.innerHTML="<article class='feature-card'><p>"+esc(d.error||"تعذر تحميل التذاكر")+"</p></article>";body.innerHTML="<article class='feature-card'><h3> التذاكر</h3><div class='log-list'>"+(d.tickets||[]).map(t=>"<button class='group-item' data-owner-ticket='"+t.id+"'><span><b>#"+t.id+" · "+esc(t.subject)+"</b><small>"+esc(t.username)+" · "+esc(t.discord_username)+" · "+esc(t.status)+"</small></span><span>فتح المحادثة ↗</span></button>").join("")||"<p class='muted'>لا توجد تذاكر.</p>"+"</div></article>";document.querySelectorAll("[data-owner-ticket]").forEach(b=>b.onclick=()=>openTicketAdmin(Number(b.dataset.ownerTicket)))}
  async function openTicketAdmin(id){const r=await fetch("/api/tickets/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"تعذر فتح المحادثة");const closed=d.ticket?.status==="closed";body.innerHTML="<article class='feature-card'><button id='ot-back'>رجوع</button><h3> #"+id+" · "+esc(d.ticket?.subject||"")+"</h3><p class='muted'>"+(closed?" مغلق":" مفتوح")+"</p><div class='log-list'>"+(d.messages||[]).map(m=>"<div class='log-item'><b>"+esc(m.username)+" · Discord: "+esc(m.discord_username)+" "+ticketRoleBadge(m.role)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.message)+"</p></div>").join("")+"</div>"+(closed?"":"<textarea id='ot-reply' class='full' rows='4' placeholder='اكتب ردك لصاحب التيكت...'></textarea><button class='primary wide' id='ot-send'>إرسال الرد</button>")+"<div class='game-lobby-actions'>"+(closed?"<button class='primary' id='ot-open'>إعادة فتح</button>":"<button class='danger' id='ot-close'>إغلاق وحفظ المحادثة</button>")+"</div></article>";$("#ot-back").onclick=loadTickets;if(closed)$("#ot-open").onclick=async()=>{const x=await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"open"})}),z=await x.json();if(!x.ok)return alert(z.error||"تعذر إعادة الفتح");openTicketAdmin(id)};else{$("#ot-send").onclick=async()=>{const msg=$("#ot-reply").value.trim();if(!msg)return;const x=await fetch("/api/owner/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg})}),z=await x.json();if(!x.ok)return alert(z.error||"تعذر الرد");openTicketAdmin(id)};$("#ot-close").onclick=async()=>{const x=await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"closed"})}),z=await x.json();if(!x.ok)return alert(z.error||"تعذر الإغلاق");openTicketAdmin(id)}}}
  async function loadGroups(){const r=await fetch("/api/owner/groups"),d=await r.json();body.innerHTML="<article class='feature-card'><h3> إدارة القروبات</h3><div class='log-list'>"+(d.groups||[]).map(g=>"<div class='log-item'><b>#"+g.id+" · "+esc(g.name)+"</b><span>"+esc(g.username)+" · "+esc(g.status||"approved")+"</span><p>"+esc(g.description||"")+"</p><div class='game-lobby-actions'>"+(g.status==="pending"?"<button class='primary' data-gok='"+g.id+"'>قبول</button><button data-gno='"+g.id+"'>رفض</button>":"")+"<button class='danger' data-gdel='"+g.id+"'>حذف القروب</button></div></div>").join("")||"<p class='muted'>لا توجد قروبات.</p>"+"</div></article>";document.querySelectorAll("[data-gok],[data-gno]").forEach(b=>b.onclick=async()=>{const status=b.dataset.gok?"approved":"rejected",id=b.dataset.gok||b.dataset.gno;const x=await fetch("/api/owner/groups/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})}),z=await x.json();if(!x.ok)return alert(z.error||"تعذر تحديث القروب");loadGroups()});document.querySelectorAll("[data-gdel]").forEach(b=>b.onclick=async()=>{if(!confirm("حذف القروب نهائيًا؟"))return;const x=await fetch("/api/owner/groups/"+b.dataset.gdel,{method:"DELETE"});if(!x.ok)return alert("تعذر الحذف");loadGroups()})}
  async function loadGroupRequests(){const r=await fetch("/api/owner/group-requests"),d=await r.json();if(!r.ok)return body.innerHTML="<article class='feature-card'><p>"+esc(d.error||"تعذر تحميل طلبات القروبات")+"</p></article>";body.innerHTML="<article class='feature-card'><h3> طلبات الانضمام للقروبات</h3><div class='log-list'>"+(d.requests||[]).map(x=>"<div class='log-item'><b>#"+x.id+" · "+esc(x.group_name)+"</b><span>"+esc(x.username)+" · "+esc(x.discord_username)+" · "+esc(x.status)+"</span><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small><div class='game-lobby-actions'><button class='danger' data-grdel='"+x.id+"'>حذف الطلب</button></div></div>").join("")||"<p class='muted'>لا توجد طلبات.</p>"+"</div></article>";document.querySelectorAll("[data-grdel]").forEach(b=>b.onclick=async()=>{if(!confirm("حذف طلب القروب؟"))return;const x=await fetch("/api/owner/group-requests/"+b.dataset.grdel,{method:"DELETE"});if(!x.ok)return alert((await x.json()).error||"تعذر حذف الطلب");loadGroupRequests()})}
  async function loadGames(){await gamesList()}
  async function tab(t){if(t==="apps")return loadApps();if(t==="tickets")return loadTickets();if(t==="groups")return loadGroups();if(t==="group-requests")return loadGroupRequests();if(t==="games")return loadGames();if(t==="logs")return loadLogs();if(t==="zajel-log")return loadZajelLogs();if(t==="deleted-messages")return loadDeletedMessages();if(t==="group-logs")return loadGroupLogs();if(t==="users")return loadUsers();if(t==="anonymous-log")return loadAnonymousLogs();if(t==="announcements")return loadAnnouncements();if(t==="broadcast")return loadBroadcast()}
  document.querySelectorAll("[data-owner-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.ownerTab));await loadApps();setStatus("لوحة الأونر جاهزة");
};

applyView=async function(){
  await mldMe(); searchWrap.style.display="none"; title.textContent="التقديم"; subtitle.textContent="التقديمات الجديدة وتقديماتي"; content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'></div><h3>تقديم جديد</h3><div id='dynamic-questions' class='form-stack'><div class='loading'>جاري التحميل...</div></div><button class='primary wide' id='app-send'>إرسال التقديم</button><p id='app-status' class='muted'></p></article><article class='feature-card'><h3>تقديماتي</h3><div id='my-applications' class='log-list'>جاري التحميل...</div></article>";
  if(!mldUser){$("#app-send").textContent="سجّل دخولك أولًا";$("#app-send").onclick=()=>change("login");return}
  const q=await fetch("/api/application-questions").then(r=>r.json()).catch(()=>({questions:[]})),qs=q.questions||[];
  $("#dynamic-questions").innerHTML=(qs.length?qs:[{key:"experience",label:"خبرتك أو نبذة عنك",required:true},{key:"why",label:"ليش مناسب للتقديم؟",required:true}]).map(x=>"<label class='form-label'>"+esc(x.label)+(x.required?" *":"")+"<textarea class='full app-q' data-q='"+esc(x.key)+"' rows='4' maxlength='2000' placeholder='"+esc(x.label)+"'></textarea></label>").join("");
  const my=await fetch("/api/my/applications").then(r=>r.json()).catch(()=>({applications:[]}));$("#my-applications").innerHTML=(my.applications||[]).map(a=>"<div class='log-item'><b>#"+a.id+" · "+esc(a.type)+"</b><small>"+new Date(a.created_at).toLocaleString("ar-SA")+" · "+esc(a.status)+"</small></div>").join("")||"<p class='muted'>ما عندك تقديمات.</p>";
  $("#app-send").onclick=async()=>{const answers={};document.querySelectorAll(".app-q").forEach(x=>answers[x.dataset.q]=x.value.trim());const rr=await fetch("/api/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"إدارة",answers})}),dd=await rr.json();$("#app-status").textContent=rr.ok?"تم إرسال التقديم ":(dd.error||"تعذر الإرسال");if(rr.ok)applyView()};
};


// MLD GAMES — ready-made arcade and external multiplayer hubs
async function renderGames(){
  searchWrap.style.display="none";
  title.textContent="مركز الألعاب";
  subtitle.textContent="ألعاب جاهزة ومجانية — فردية وجماعية، مع ألعاب عربية وألعاب أونلاين.";
  content.className="feature-grid ready-games-grid";
  const games=[
    ["2048","🔢","ألغاز دمج الأرقام — جاهزة داخل الموقع.","local","/games/2048.html"],
    ["Snake","🐍","الثعبان الكلاسيكي — جاهز للجوال والكمبيوتر.","local","/games/snake.html"],
    ["Tetris","🧱","تتريس كلاسيكي جاهز وسريع.","local","/games/tetris.html"],
    ["Sudoku","🧩","سودوكو بثلاث درجات صعوبة.","local","/games/sudoku.html"],
    ["Connect Four","🔴","أربع متتالية ضد الكمبيوتر أو لاعب ثانٍ.","local","/games/connect-four.html"],
    ["Tic-Tac-Toe","❌","إكس أو ضد الكمبيوتر أو لاعبين.","local","/games/tic-tac-toe.html"],
    ["بلوت","🃏","بلوت سعودي أونلاين — غرف حتى 4 لاعبين واللعب ضد الكمبيوتر.","external","https://la3ebni.com/games/baloot"],
    ["UNO","🎴","UNO جماعي جاهز مع نظام غرف ولعب أونلاين.","external","https://game-production-03da.up.railway.app/"],
    ["GameNest","🎮","مركز ألعاب جماعية جاهز: UNO، شطرنج، داما، رومي، مونوبولي، Exploding Kittens وغيرها.","external","https://game-production-03da.up.railway.app/"],
    ["Waraq","♠️","ألعاب عربية جاهزة: بلوت، طرنيب، تركس، تقدير، هاند، طاولة، داما، دومينو وغيرها.","external","https://playwaraq.com/"],
    ["لعبني","🇸🇦","مكتبة ألعاب عربية كبيرة تشمل بلوت وألعاب جماعية وألعاب متصفح كثيرة.","external","https://la3ebni.com/"],
    ["Codenames","🕵️","لعبة كلمات جماعية أونلاين من مشروع جاهز.","external","https://codenames.ai/"],
    ["Draw & Guess","🎨","ارسم وخمّن للجلسات مع الأصدقاء.","external","https://drawparty-public.pages.dev/"],
    ["Multiplayer Tetris","⚡","تتريس جماعي لحظي جاهز للعب عبر المتصفح.","external","https://tetris.4444.wtf/"]
  ];
  content.innerHTML=games.map(([name,icon,desc,type,path])=>{
    const button=type==="local"
      ? "<button class='primary wide' data-ready-game='"+esc(path)+"'>🎮 العب الآن</button>"
      : "<button class='primary wide' data-external-game='"+esc(path)+"'>🚀 افتح اللعبة</button>";
    return "<article class='feature-card ready-game-card'><div class='ready-game-icon'>"+icon+"</div><span class='pill'>"+(type==="local"?"جاهزة داخل الموقع":"مشروع جاهز أونلاين")+"</span><h3>"+esc(name)+"</h3><p class='muted'>"+esc(desc)+"</p>"+button+"</article>";
  }).join("");
  document.querySelectorAll("[data-ready-game]").forEach(btn=>btn.onclick=()=>openReadyGame(btn.dataset.readyGame));
  document.querySelectorAll("[data-external-game]").forEach(btn=>btn.onclick=()=>window.open(btn.dataset.externalGame,"_blank","noopener,noreferrer"));
  setStatus("مركز الألعاب جاهز");
}
function openReadyGame(path){
  const name=path.split("/").pop().replace(".html","");
  modal.classList.remove("hidden");
  box.innerHTML="<div class='ready-game-modal'><div class='ready-game-modal-head'><div><span class='pill'>🎮 لعبة جاهزة</span><h2>"+esc(name)+"</h2></div><button class='ghost' id='ready-game-close'>إغلاق</button></div><iframe class='ready-game-frame' src='"+esc(path)+"' title='"+esc(name)+"' loading='eager' allow='fullscreen'></iframe></div>";
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
