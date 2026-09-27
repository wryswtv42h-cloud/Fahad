"use strict";
const $=s=>document.querySelector(s),content=$("#content"),status=$("#status"),search=$("#search"),searchWrap=$("#search-wrap"),modal=$("#modal"),box=$("#modal-content"),title=$("#view-title"),subtitle=$("#subtitle"),mobile=$("#mobile-menu");let view="members",all=[],roles=[],timer,refreshTimer,selected=null;const fallback="/logo.svg",esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),num=v=>new Intl.NumberFormat("ar-SA").format(Number(v)||0),avatar=m=>m?.avatar||fallback;
function setStatus(x){status.textContent=x}function openModal(){modal.classList.remove("hidden");document.body.classList.add("modal-open")}function closeModal(){modal.classList.add("hidden");document.body.classList.remove("modal-open")}function bind(){document.querySelectorAll("[data-member]").forEach(x=>x.onclick=()=>openMember(x.dataset.member));document.querySelectorAll("[data-role]").forEach(x=>x.onclick=()=>openRole(x.dataset.role))}
function card(m){return `<article class="card" data-member="${esc(m.id)}"><img src="${esc(avatar(m))}" onerror="this.src='${fallback}'"><div><h3>${esc(m.name)}</h3><p>@${esc(m.username||"")}</p><div class="roles">${(m.importantRoles||[]).map(r=>`<span class="role">${esc(r.name)}</span>`).join("")||`<span class="member-tag">عضو</span>`}</div></div><b>↗</b></article>`}function renderMembers(list){content.className="grid";const rows=(list||[]).slice(0,5);content.innerHTML=rows.length?rows.map(card).join(""):`<div class="empty"><h3>لا توجد نتائج</h3><p>جرّب البحث باسم العضو.</p></div>`;bind()}
function topSec(t,list,k,l){return `<section class="top-section"><h3>${t}</h3>${list.map((m,i)=>`<article class="top-card" data-member="${esc(m.id)}"><span class="rank">${i+1}</span><img src="${esc(avatar(m))}"><div><small>${l}</small><h4>${esc(m.name)}</h4><strong>${num(m.stats?.[k])}</strong></div></article>`).join("")||`<p class="muted">لا توجد بيانات بعد.</p>`}</section>`}function renderTop(d){content.className="top-grid";const game=(d.gameTop||[]).map((m,i)=>`<article class="top-card"><span class="rank">${i+1}</span><div><small>فوز</small><h4>${esc(m.username)}</h4><strong>${num(m.wins)} فوز · ${num(m.points)} نقطة</strong></div></article>`).join("")||'<p class="muted">لا توجد نتائج ألعاب بعد.</p>';content.innerHTML=topSec("🏆 أكثر الرسائل",d.messages||[],"messages","رسالة")+topSec("💬 أكثر المنشنات",d.mentions||[],"mentionsReceived","منشن")+topSec("🎙️ وقت الصوت",d.voice||[],"voiceMinutes","دقيقة")+topSec("⚡ دخول صوتي",d.joins||[],"voiceJoins","دخول")+'<section class="top-section"><h3>🎮 TOP الألعاب</h3>'+game+'</section>';bind()}
function renderRoles(){content.className="role-grid";content.innerHTML=roles.map(r=>`<article class="role-card" data-role="${esc(r.id)}"><div class="role-top"><i style="background:${esc(r.color)}"></i><b>${num(r.membersCount)} عضو</b></div><h3>${esc(r.name)}</h3><div class="roles">${(r.permissions||[]).slice(0,4).map(p=>`<span class="permission">${esc(p)}</span>`).join("")||`<span class="muted">صلاحيات عادية</span>`}</div><small>عرض الأعضاء ↗</small></article>`).join("");bind()}
async function messageView(){await mldMe();if(!mldUser){title.textContent="رسالة خاصة";subtitle.textContent="لازم تسجل دخولك قبل الإرسال.";searchWrap.style.display="none";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon">🔐</div><h3>الرسائل الخاصة</h3><p class="muted">تسجيل الدخول مطلوب قبل إرسال أي رسالة.</p><button class="primary wide" id="dm-login">تسجيل الدخول</button></article>';$("#dm-login").onclick=()=>change("login");return}title.textContent="رسالة خاصة";subtitle.textContent="أرسل رسالة خاصة لعضو من السيرفر — وتُسجل العملية في لوق الأونر.";searchWrap.style.display="none";content.className="message-page";content.innerHTML=`<div class="message-box"><div class="message-icon">✦</div><h3>إرسال رسالة خاصة</h3><p class="muted">المُرسل: <b>${esc(mldUser.username)}</b> · Discord: <b>${esc(mldUser.discordUsername)}</b></p><input id="recipient-search" class="full" placeholder="ابحث عن المستلم..."><div id="recipient-results" class="recipient-results"></div><input id="msg-title" class="full" maxlength="120" placeholder="عنوان الرسالة"><textarea id="msg-text" class="full" maxlength="2000" rows="7" placeholder="اكتب الرسالة..."></textarea><p id="msg-status" class="muted"></p><button id="send" class="primary wide">إرسال الآن</button></div>`;const rs=$("#recipient-search");rs.oninput=async()=>{const q=rs.value.trim();if(!q){$("#recipient-results").innerHTML="";return}const d=await fetch(`/api/public/members?q=${encodeURIComponent(q)}&limit=8`).then(r=>r.json());$("#recipient-results").innerHTML=(d.members||[]).slice(0,8).map(m=>`<button class="recipient" data-recipient="${esc(m.id)}"><img src="${esc(avatar(m))}"><span>${esc(m.name)}<small>@${esc(m.username||"")}</small></span></button>`).join("");document.querySelectorAll("[data-recipient]").forEach(x=>x.onclick=()=>{selected={id:x.dataset.recipient,name:x.textContent};rs.value=x.textContent;$("#recipient-results").innerHTML="<b class='selected'>تم اختيار المستلم ✓</b>"})};$("#send").onclick=sendMessage}async function sendMessage(){await mldMe();if(!mldUser)return change("login");const st=$("#msg-status"),btn=$("#send"),text=$("#msg-text").value.trim();if(!selected)return st.textContent="اختر مستلمًا أولًا";if(!text)return st.textContent="اكتب الرسالة أولًا";btn.disabled=true;try{const r=await fetch("/api/public/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId:selected.id,title:$("#msg-title").value.trim()||"رسالة من حساب MLD",message:text})}),d=await r.json();if(!r.ok)throw Error(d.error);st.textContent="تم الإرسال بنجاح ✓ — تم تسجيل العملية في لوق الأونر";$("#msg-text").value=""}catch(e){st.textContent=e.message||"تعذر الإرسال"}finally{btn.disabled=false}}async function openMember(id){openModal();box.innerHTML="<div class='loading'>جاري التحميل...</div>";const m=await fetch(`/api/public/member/${id}`).then(r=>r.json()),s=m.stats||{};box.innerHTML=`<div class="profile"><div class="profile-head"><img src="${esc(avatar(m))}"><div><p class="eyebrow">ملف العضو</p><h2>${esc(m.name)}</h2><p class="muted">@${esc(m.username||"")}</p><span class="badge">${esc(m.rank||"عضو")}</span></div></div><div class="stats">${[[s.messages,"رسالة"],[s.mentionsReceived,"منشن جاه"],[s.mentionsSent,"منشن أرسله"],[`${Math.floor((s.voiceMinutes||0)/60)}س ${(s.voiceMinutes||0)%60}د`,"وقت صوتي"],[s.voiceJoins,"دخول صوتي"],[s.chatRounds,"نشاط شات"]].map(x=>`<b>${esc(num(x[0]))}<small>${x[1]}</small></b>`).join("")}</div><h3>كل الرتب</h3><div class="roles">${(m.roles||[]).map(x=>`<span class="role">${esc(x.name)}</span>`).join("")||`<span class="muted">لا توجد رتب</span>`}</div><h3>��قوى الصلاحيات</h3><div class="permission-box">${perms(m.permissions)}</div></div>`}
async function openRole(id){openModal();box.innerHTML="<div class='loading'>جاري تحميل الرتبة...</div>";const d=await fetch(`/api/public/roles/${id}/members`).then(r=>r.json());box.innerHTML=`<p class="eyebrow">دليل الرتبة</p><h2>${esc(d.role.name)}</h2><div class="role-meta"><b>${num(d.role.membersCount)} عضو فعلي</b></div><div class="permission-box">${perms(d.role.permissions)}</div><h3>الأعضاء</h3><div class="grid compact">${(d.members||[]).map(card).join("")||`<p class="muted">لا يوجد أعضاء بهذه الرتبة.</p>`}</div>`;bind()}
async function refresh(){try{const [sr,rr,ss]=await Promise.all([fetch("/api/public/server"),fetch("/api/public/roles"),siteStats()]);const s=await sr.json(),rd=await rr.json();$("#server-name").textContent=s.name||"MLD";$("#server-founder").textContent=s.ownerName||"فهد المطيري";$("#server-count").textContent=num(s.memberCount);$("#server-online").textContent=num(ss.online);$("#server-visits").textContent=num(ss.visits);$("#server-status").textContent="● متصل";roles=rd.roles||[];if(s.invite){$("#invite").href=s.invite;$("#invite-mobile").href=s.invite}else{$("#invite").style.display="none";$("#invite-mobile").style.display="none"}if(view==="members"&&!search.value){const d=await fetch("/api/public/members").then(r=>r.json());all=d.members||[];renderMembers(all);setStatus(num(all.length)+" عضو متصل")}else if(view==="roles")renderRoles();else if(view==="top")renderTop(await fetch("/api/public/top").then(r=>r.json()))}catch(e){console.error(e);setStatus("تعذر تحديث البيانات مؤقتًا")}}
async function searchMembers(){clearTimeout(timer);const q=search.value.trim();if(!q){renderMembers(all);setStatus(`${num(all.length)} عضو`);return}setStatus("جاري البحث...");timer=setTimeout(async()=>{const d=await fetch(`/api/public/members?q=${encodeURIComponent(q)}`).then(r=>r.json());renderMembers(d.members||[]);setStatus(`${num((d.members||[]).length)} نتيجة`)},250)}

search.oninput=()=>{if(view!=="members")window.change("members");searchMembers()};$("#menu").onclick=e=>{e.preventDefault();e.stopPropagation();mobile.classList.toggle("open")};$("#close").onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};document.onkeydown=e=>{if(e.key==="Escape")closeModal()};const yearEl=$("#year");if(yearEl)yearEl.textContent=new Date().getFullYear();
const welcome=document.getElementById("mld-welcome");if(welcome){welcome.classList.remove("hide");}
refreshTimer=setInterval(()=>{if(!modal.classList.contains("hidden")||view==="message")return;refresh()},15000);

// MLD Add-on: Games
function renderGames(){searchWrap.style.display="none";title.textContent="مركز الألعاب";subtitle.textContent="ألعاب خفيفة تعمل مباشرة من الموقع.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon">🎯</div><h3>اضغط بسرعة</h3><p class="muted">اجمع أكبر عدد خلال 10 ثواني.</p><div class="game-score" id="click-score">0</div><button class="primary wide" id="click-start">ابدأ الجولة</button></article><article class="feature-card"><div class="feature-icon">🎲</div><h3>رمي النرد</h3><div class="dice-result" id="dice-result">🎲 🎲</div><button class="primary wide" id="dice-roll">ارمِ النرد</button></article><article class="feature-card"><div class="feature-icon">🪙</div><h3>عملة الحظ</h3><div class="dice-result" id="coin-result">—</div><button class="primary wide" id="coin-flip">اقلب العملة</button></article>';let score=0,end=0;$("#click-start").onclick=()=>{score=0;end=Date.now()+10000;$("#click-score").textContent="0";$("#click-start").textContent="اضغط الآن!";const t=setInterval(()=>{if(Date.now()>=end){clearInterval(t);$("#click-start").textContent="انتهت الجولة — "+score;setTimeout(()=>$("#click-start").textContent="ابدأ الجولة",1200)}},100)};content.onclick=e=>{if(e.target.id==="click-start"&&end>Date.now()){score++;$("#click-score").textContent=score}if(e.target.id==="dice-roll")$("#dice-result").textContent=(Math.floor(Math.random()*6)+1)+" + "+(Math.floor(Math.random()*6)+1);if(e.target.id==="coin-flip")$("#coin-result").textContent=Math.random()<.5?"وجه 🪙":"كتابة ✨"};setStatus("الألعاب جاهزة")}

// MLD Add-on: Groups
async function renderGroups(){
 await mldMe();searchWrap.style.display="none";title.textContent="القروبات";subtitle.textContent="قروبات المجتمع — الانضمام والطلبات مرتبطة بالسيرفر.";content.className="feature-grid";
 const d=await fetch("/api/groups").then(r=>r.json()).catch(()=>({groups:[]})),groups=d.groups||[];
 content.innerHTML='<article class="feature-card"><div class="feature-icon">👥</div><h3>قروبات المجتمع</h3><p class="muted">القروب المعتمد ينشئ رول وروم في Discord، والموافقة على العضوية تعطي رول القروب.</p><div id="groups-list" class="groups-list">'+(groups.length?groups.map(g=>'<div class="group-item"><span><b>'+esc(g.name)+'</b><small>'+esc(g.description||"بدون وصف")+' · المالك: '+esc(g.owner_username)+' · '+num(g.member_count)+' عضو</small></span><button class="primary" data-join-group="'+g.id+'">طلب انضمام</button></div>').join(""):'<p class="muted">لا توجد قروبات معتمدة حاليًا.</p>')+'</div></article>';
 if(mldUser)document.querySelectorAll("[data-join-group]").forEach(btn=>btn.onclick=async()=>{const r=await fetch("/api/groups/"+btn.dataset.joinGroup+"/join",{method:"POST"}),x=await r.json();alert(r.ok?"تم إرسال طلب الانضمام.":(x.error||"تعذر إرسال الطلب"));});
 else document.querySelectorAll("[data-join-group]").forEach(btn=>btn.onclick=()=>change("login"));
 if(mldUser)content.innerHTML+='<article class="feature-card"><div class="feature-icon">➕</div><h3>إنشاء قروب</h3><input id="group-name" class="full" maxlength="60" placeholder="اسم القروب"><input id="group-desc" class="full" maxlength="240" placeholder="وصف القروب"><button class="primary wide" id="group-add">إرسال طلب إنشاء</button><p id="group-status" class="muted"></p></article>';
 if($("#group-add"))$("#group-add").onclick=async()=>{const name=$("#group-name").value.trim(),description=$("#group-desc").value.trim();const r=await fetch("/api/groups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description})}),x=await r.json();$("#group-status").textContent=r.ok?"تم إرسال الطلب للأونر ✓":(x.error||"تعذر الإرسال");};
 setStatus("القروبات جاهزة");
}

// MLD Add-on: Account/Admin/Logs
function renderAccount(){searchWrap.style.display="none";title.textContent="حسابي";subtitle.textContent="تخصيص محلي بسيط للواجهة.";content.className="feature-grid";const n=localStorage.getItem("mld_name")||"";content.innerHTML='<article class="feature-card account-card"><div class="feature-icon">👤</div><h3>اسم العرض</h3><p class="muted">هذا تخصيص على جهازك ولا يستبدل تسجيل دخول Discord.</p><input id="local-name" class="full" maxlength="30" placeholder="اسم العرض" value="'+esc(n)+'"><button class="primary wide" id="save-name">حفظ الاسم</button><p id="name-status" class="muted"></p></article>';$("#save-name").onclick=()=>{localStorage.setItem("mld_name",$("#local-name").value.trim());$("#name-status").textContent="تم الحفظ ✓"};setStatus("الحساب جاهز")}
async function renderAdmin(){searchWrap.style.display="none";title.textContent="لوحة الإدارة";subtitle.textContent="بيانات الرتب والإحصائيات من Discord.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon">🛡️</div><h3>الرتب القيادية</h3><div id="admin-roles" class="roles">جاري التحميل...</div></article><article class="feature-card"><div class="feature-icon">📊</div><h3>إحصائيات</h3><div id="admin-stats" class="stats">جاري التحميل...</div></article>';try{const [r,s]=await Promise.all([fetch("/api/public/roles").then(x=>x.json()),fetch("/api/public/server").then(x=>x.json())]);$("#admin-roles").innerHTML=(r.roles||[]).map(x=>'<span class="role">'+esc(x.name)+" · "+num(x.membersCount)+" عضو</span>").join("");$("#admin-stats").innerHTML=[[s.memberCount,"عضو"],[r.roles?.length||0,"رتبة قيادية"],["ONLINE","حالة الموقع"]].map(x=>'<b>'+esc(x[0])+'<small>'+esc(x[1])+"</small></b>").join("")}catch(e){$("#admin-roles").textContent="تعذر تحديث البيانات"}setStatus("لوحة الإدارة جاهزة")}
function renderLogs(){searchWrap.style.display="none";title.textContent="السجل";subtitle.textContent="آخر الصفحات التي فتحتها على هذا الجهاز.";content.className="feature-card";const a=JSON.parse(localStorage.getItem("mld_logs")||"[]");content.innerHTML='<h3>سجل النشاط</h3><div class="log-list">'+(a.length?a.map(x=>'<div class="log-item"><span>'+esc(x.time)+'</span><b>'+esc(x.text)+'</b></div>').join(""):'<p class="muted">لا يوجد نشاط محفوظ.</p>')+'</div><button class="primary wide" id="clear-log">مسح السجل</button>';$("#clear-log").onclick=()=>{localStorage.removeItem("mld_logs");renderLogs()};setStatus("السجل جاهز")}
let mldUser=null;
async function mldMe(){try{const r=await fetch("/api/auth/me");const d=await r.json();mldUser=d.user||null;updateAuthBar();return mldUser}catch(e){return null}}
function updateAuthBar(){const el=$("#auth-bar");if(!el)return;const admin=!!mldUser&&["owner","admin"].includes(mldUser.role);document.querySelectorAll("#logs-nav,#logs-nav-mobile").forEach(b=>b.style.display=mldUser?.role==="owner"?"":"none");document.querySelectorAll("[data-admin-nav]").forEach(b=>b.remove());document.querySelectorAll('[data-view="login"]').forEach(b=>b.style.display=mldUser?"none":"");document.querySelectorAll('[data-view="tickets"]').forEach(b=>b.style.display=admin?"":"none");if(admin){const d=document.querySelector(".desktop-nav"),m=document.querySelector("#mobile-menu");if(d){const z=document.createElement("button");z.dataset.view="admin";z.dataset.adminNav="1";z.textContent=mldUser.role==="owner"?"الأونر":"طلبات الإدارة";z.onclick=()=>change(mldUser.role==="owner"?"owner":"admin");d.insertBefore(z,d.querySelector(".invite"));}if(m){const z=document.createElement("button");z.dataset.view="admin";z.dataset.adminNav="1";z.textContent="الإدارة";z.onclick=()=>change("admin");m.insertBefore(z,m.querySelector(".invite")||m.lastElementChild);}}el.innerHTML=mldUser?'<div class="auth-chip">مرحبًا <b>'+esc(mldUser.username)+'</b> · Discord: <b>'+esc(mldUser.discordUsername)+'</b> · '+(mldUser.role==="owner"?"👑 أونر":mldUser.role==="admin"?"🛡️ إدارة":"عضو")+' <button id="logout-btn">خروج</button></div>':'<div class="auth-chip">غير مسجل · <button id="auth-open">تسجيل الدخول / إنشاء حساب</button></div>';$("#logout-btn")?.addEventListener("click",async()=>{await fetch("/api/auth/logout",{method:"POST"});location.reload()});$("#auth-open")?.addEventListener("click",()=>change("login"))}function authView(){
  if(mldUser){return change("home")}
  searchWrap.style.display="none"; title.textContent="تسجيل الدخول"; subtitle.textContent="الحساب يعمل فقط لأعضاء سيرفر MLD في Discord."; content.className="feature-grid";
  content.innerHTML='<article class="feature-card auth-card"><div class="feature-icon">🔐</div><h3 id="auth-heading">تسجيل الدخول</h3><input id="auth-user" class="full" maxlength="32" placeholder="اسم المستخدم"><input id="auth-pass" class="full" type="password" maxlength="100" placeholder="كلمة المرور"><div id="discord-wrap"><input id="auth-discord" class="full" maxlength="100" placeholder="يوزرك في Discord"></div><button class="primary wide" id="auth-submit">دخول</button><button class="wide" id="auth-toggle">إنشاء حساب جديد</button><button class="wide" id="forgot-toggle">نسيت كلمة المرور؟</button><p id="auth-status" class="muted"></p></article><article class="feature-card"><div class="feature-icon">🛡️</div><h3>حماية الحساب</h3><p class="muted">الموقع منفصل عن تسجيل Discord. نتحقق فقط من أنك عضو حالي في سيرفر MLD، ولا نطلب كلمة مرور Discord.</p></article></div>';
  let register=false,forgot=false;
  const sync=()=>{
    $("#auth-heading").textContent=forgot?"استعادة كلمة المرور":register?"إنشاء حساب":"تسجيل الدخول";
    $("#auth-submit").textContent=forgot?"إرسال للخاص":register?"إنشاء الحساب":"دخول";
    $("#auth-toggle").textContent=forgot?"العودة لتسجيل الدخول":register?"لدي حساب بالفعل":"إنشاء حساب جديد";
    $("#discord-wrap").classList.toggle("hidden",!register&&!forgot);
    $("#auth-pass").classList.toggle("hidden",forgot);
    $("#forgot-toggle").classList.toggle("hidden",forgot);
  };
  $("#auth-toggle").onclick=()=>{if(forgot){forgot=false;register=false}else register=!register;sync()};
  $("#forgot-toggle").onclick=()=>{forgot=true;register=false;sync()};
  $("#auth-submit").onclick=async()=>{
    const st=$("#auth-status"),btn=$("#auth-submit"),username=$("#auth-user").value.trim(),discordUsername=$("#auth-discord").value.trim();
    if(!username||((register||forgot)&&!discordUsername)) return st.textContent="عبّ كل البيانات المطلوبة";
    btn.disabled=true; st.textContent="جاري المعالجة...";
    try{
      if(forgot){
        const r=await fetch("/api/auth/forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,discordUsername})}),d=await r.json();
        if(!r.ok)throw Error(d.error||"تعذر إرسال كلمة المرور المؤقتة");
        st.textContent="تم إرسال كلمة مرور مؤقتة إلى الخاص في Discord ✓";
        forgot=false; register=false; sync();
      }else{
        const body={username,password:$("#auth-pass").value}; if(register) body.discordUsername=discordUsername;
        const r=await fetch(register?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d=await r.json();
        if(!r.ok)throw Error(d.error||"تعذر تسجيل الدخول");
        mldUser=d.user||null; updateAuthBar();
        if(mldUser?.mustChangePassword){ st.textContent="تم قبول كلمة المرور المؤقتة — غيّر كلمة المرور الآن"; return renderPasswordChange(); }
        st.textContent="تم بنجاح ✓"; setTimeout(()=>change("home"),250);
      }
    }catch(e){st.textContent=e.message||"تعذر تنفيذ العملية"}finally{btn.disabled=false}
  };
  sync(); setStatus("نظام الحسابات جاهز");
}
function renderPasswordChange(){
  searchWrap.style.display="none"; title.textContent="تغيير كلمة المرور"; subtitle.textContent="هذه الخطوة مطلوبة بعد استخدام كلمة المرور المؤقتة."; content.className="feature-grid";
  content.innerHTML='<article class="feature-card auth-card"><div class="feature-icon">🔑</div><h3>ضع كلمة مرور جديدة</h3><input id="new-pass" class="full" type="password" maxlength="100" placeholder="كلمة المرور الجديدة"><input id="new-pass2" class="full" type="password" maxlength="100" placeholder="تأكيد كلمة المرور"><button class="primary wide" id="save-pass">حفظ كلمة المرور</button><p id="pass-status" class="muted"></p></article>';
  $("#save-pass").onclick=async()=>{const p=$("#new-pass").value,p2=$("#new-pass2").value,st=$("#pass-status"),btn=$("#save-pass");if(p.length<6)return st.textContent="كلمة المرور يجب أن تكون 6 أحرف على الأقل";if(p!==p2)return st.textContent="كلمتا المرور غير متطابقتين";btn.disabled=true;try{const r=await fetch("/api/auth/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({newPassword:p})}),d=await r.json();if(!r.ok)throw Error(d.error);mldUser.mustChangePassword=false;updateAuthBar();st.textContent="تم تغيير كلمة المرور بنجاح ✓";setTimeout(()=>change("home"),400)}catch(e){st.textContent=e.message||"تعذر تغيير كلمة المرور"}finally{btn.disabled=false}};
}
function needAuth(){if(!mldUser){mldMe().then(u=>{if(u){change(view)}else change("login")});setStatus("جاري التحقق من جلسة الدخول…");return false}return true}
async function siteStats(){try{if(!sessionStorage.getItem("mld_visit_counted")){await fetch("/api/site/visit",{method:"POST"});sessionStorage.setItem("mld_visit_counted","1")}const r=await fetch("/api/site/stats");if(!r.ok)throw Error("stats");return await r.json()}catch(e){return {visits:0,online:0}}}
async function loadHomeReviews(){const box=$("#home-reviews");if(!box)return;const d=await fetch("/api/reviews").then(r=>r.json()).catch(()=>({reviews:[]}));const rows=d.reviews||[];box.innerHTML=rows.length?rows.concat(rows).map(x=>'<article class="review-slide"><div class="review-stars">'+("★".repeat(x.rating))+'</div><b>'+esc(x.username)+'</b><p>'+esc(x.message)+'</p></article>').join(""):'<div class="review-empty">لا توجد آراء بعد — كن أول شخص يكتب رأيه ✨</div>';}
async function homeView(){searchWrap.style.display="none";title.textContent="الصفحة الرئيسية";subtitle.textContent="كل شيء في واجهة واحدة — أعضاء، TOP، ألعاب، قروبات، آراء ودعم.";content.className="home-layout";const account=mldUser?'<article class="feature-card"><div class="feature-icon">👤</div><h3>حسابك</h3><p class="muted">مرحبًا '+esc(mldUser.username)+' · '+esc(mldUser.role)+'</p><button class="primary wide" data-home-go="account">فتح الحساب</button></article>':'<article class="feature-card"><div class="feature-icon">🔐</div><h3>تسجيل الدخول</h3><p class="muted">سجّل مرة واحدة وتظهر لك ميزات الحساب.</p><button class="primary wide" data-home-go="login">دخول</button></article>';content.innerHTML='<div class="feature-grid home-feature-grid"><article class="feature-card"><div class="feature-icon">👥</div><h3>الأعضاء</h3><p class="muted">أعضاء السيرفر والافتارات والرتب.</p><button class="primary wide" data-home-go="members">استكشف</button></article><article class="feature-card"><div class="feature-icon">🏆</div><h3>TOP</h3><p class="muted">إحصائيات المجتمع وTOP الألعاب.</p><button class="primary wide" data-home-go="top">TOP</button></article><article class="feature-card"><div class="feature-icon">🎮</div><h3>الألعاب</h3><p class="muted">جلسات ألعاب حقيقية مع إنشاء وانضمام ومشاهدة.</p><button class="primary wide" data-home-go="games">مركز الألعاب</button></article><article class="feature-card"><div class="feature-icon">👥</div><h3>القروبات</h3><p class="muted">قروبات عامة وأعضاء وطلبات انضمام.</p><button class="primary wide" data-home-go="groups">القروبات</button></article><article class="feature-card"><div class="feature-icon">💬</div><h3>رسالة خاصة</h3><p class="muted">محادثات خاصة للأعضاء المسجلين.</p><button class="primary wide" data-home-go="message">الرسائل</button></article><article class="feature-card"><div class="feature-icon">🎫</div><h3>التذاكر</h3><p class="muted">الدعم والتذاكر ومتابعة الردود.</p><button class="primary wide" data-home-go="tickets">الدعم</button></article><article class="feature-card"><div class="feature-icon">📝</div><h3>التقديمات</h3><p class="muted">استعراض وإرسال التقديمات.</p><button class="primary wide" data-home-go="apply">التقديم</button></article>'+account+'</div><section class="home-reviews-section"><div class="section-head"><div><p class="eyebrow">COMMUNITY VOICE</p><h2>آراء المجتمع</h2><p class="muted">آراء الأعضاء تظهر هنا مباشرة.</p></div><button class="primary" data-home-go="reviews">كل الآراء</button></div><div id="home-reviews" class="review-marquee"><span class="muted">جاري تحميل الآراء...</span></div></section>';const set=(s,v)=>{const e=$(s);if(e)e.textContent=v};try{const sc=await fetch("/api/public/server",{cache:"no-store"}).then(r=>r.ok?r.json():{});set("#server-name",sc.name||"MLD");set("#server-founder",sc.ownerName||"فهد المطيري");set("#server-count",num(sc.memberCount));if(sc.invite){$("#invite").href=sc.invite;$("#invite-mobile").href=sc.invite}}catch(e){console.warn("server data",e)}try{const stats=await siteStats();set("#server-online",num(stats.online));set("#server-visits",num(stats.visits))}catch(e){console.warn("stats",e);set("#server-online","0");set("#server-visits","0")}try{await loadHomeReviews()}catch(e){console.warn("reviews",e)}try{await announcementsLoad()}catch(e){console.warn("announcements",e)}setStatus("الرئيسية جاهزة")}
async function ticketView(){searchWrap.style.display="none";title.textContent="التذاكر";subtitle.textContent="شوف قائمة التذاكر للجميع، وفتح/الرد يحتاج تسجيل دخول.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon">🎫</div><h3>فتح تيكت</h3><input id="ticket-sub" class="full" maxlength="120" placeholder="عنوان الطلب"><textarea id="ticket-msg" class="full" rows="6" maxlength="3000" placeholder="اشرح طلبك..."></textarea><button class="primary wide" id="ticket-send">فتح التذكرة</button><p id="ticket-status" class="muted"></p></article><article class="feature-card"><h3>قائمة التذاكر</h3><div id="my-tickets" class="log-list">جاري التحميل...</div></article><article class="feature-card hidden" id="ticket-chat-card"><h3>محادثة التيكت</h3><div id="ticket-chat" class="log-list"></div><textarea id="ticket-reply" class="full" rows="4" placeholder="رد على التيكت..."></textarea><button class="primary wide" id="ticket-reply-btn">إرسال الرد</button></article>';$("#ticket-send").onclick=async()=>{if(!needAuth())return;const r=await fetch("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:$("#ticket-sub").value,message:$("#ticket-msg").value})}),d=await r.json();$("#ticket-status").textContent=d.error||`تم فتح التيكت #${d.id} ✓`;if(r.ok)ticketView()};const d=await fetch("/api/tickets").then(r=>r.json()).catch(()=>({tickets:[]}));$("#my-tickets").innerHTML=(d.tickets||[]).map(x=>`<button class="group-item ticket-row" data-ticket-id="${x.id}"><span><b>#${x.id} · ${esc(x.subject)}</b><small>${esc(x.status)} · ${esc(x.username||"")}</small><small>${new Date(x.created_at).toLocaleString("ar-SA")}</small></span><span>فتح ↗</span></button>`).join("")||'<p class="muted">لا توجد تيكات.</p>';document.querySelectorAll("[data-ticket-id]").forEach(b=>b.onclick=()=>openTicket(Number(b.dataset.ticketId)));if(!mldUser)$("#ticket-send").textContent="سجّل دخولك لفتح تيكت";setStatus("نظام التيكت جاهز")}async function openTicket(id){if(!needAuth())return;const r=await fetch("/api/tickets/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"تعذر فتح المحادثة");const html=(d.messages||[]).map(m=>`<div class="log-item"><b>${esc(m.username)} · Discord: ${esc(m.discord_username)}</b><small>${new Date(m.created_at).toLocaleString("ar-SA")}</small><p>${esc(m.message)}</p></div>`).join("")||"<p class='muted'>لا رسائل</p>";if($("#ticket-chat-card")){$("#ticket-chat-card").classList.remove("hidden");$("#ticket-chat").innerHTML=html;$("#ticket-reply-btn").onclick=async()=>{const text=$("#ticket-reply").value.trim();if(!text)return;const rr=await fetch("/api/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})}),dd=await rr.json();if(!rr.ok)return alert(dd.error);$("#ticket-reply").value="";openTicket(id)}}else{openModal();box.innerHTML=`<div class="message-box"><p class="eyebrow">محادثة التيكت #${id}</p><div class="log-list">${html}</div><textarea id="admin-ticket-reply" class="full" rows="4" placeholder="رد الإدارة..."></textarea><button class="primary wide" id="admin-ticket-send">إرسال الرد</button></div>`;$("#admin-ticket-send").onclick=async()=>{const text=$("#admin-ticket-reply").value.trim();if(!text)return;const rr=await fetch("/api/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})}),dd=await rr.json();if(!rr.ok)return alert(dd.error);openTicket(id)}}}async function applyView(){searchWrap.style.display="none";title.textContent="التقديمات";subtitle.textContent="نموذج تقديم ديناميكي يدار من الأونر.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon">📝</div><h3>تقديم جديد</h3><div id="dynamic-questions" class="form-stack"><div class="loading">جاري تحميل الأسئلة...</div></div><button class="primary wide" id="app-send">إرسال التقديم</button><p id="app-status" class="muted"></p></article><article class="feature-card"><h3>التقديمات الحالية</h3><div id="public-apps" class="log-list">جاري التحميل...</div></article>';const q=await fetch("/api/application-questions").then(r=>r.json()).catch(()=>({questions:[]}));const qs=q.questions||[];$("#dynamic-questions").innerHTML=(qs.length?qs:[{key:"experience",label:"خبرتك أو نبذة عنك",required:true},{key:"why",label:"ليش مناسب للتقديم؟",required:true}]).map(x=>`<label class="form-label">${esc(x.label)}${x.required?" *":""}<textarea class="full app-q" data-q="${esc(x.key)}" rows="4" maxlength="2000" placeholder="${esc(x.label)}"></textarea></label>`).join("");$("#app-send").onclick=async()=>{if(!needAuth())return;const answers={};document.querySelectorAll(".app-q").forEach(x=>answers[x.dataset.q]=x.value.trim());const r=await fetch("/api/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"إدارة",answers})}),d=await r.json();$("#app-status").textContent=d.error||`تم إرسال التقديم #${d.id} ✓`};const d=await fetch("/api/applications").then(r=>r.json()).catch(()=>({applications:[]}));$("#public-apps").innerHTML=(d.applications||[]).map(x=>`<div class="log-item"><b>#${x.id} · ${esc(x.type)}</b><span>${esc(x.username)} · ${esc(x.status)}</span></div>`).join("")||"<p class='muted'>لا توجد تقديمات.</p>"}
async function adminPanel(){await mldMe();if(!mldUser||mldUser.role!=="admin")return change("login");searchWrap.style.display="none";title.textContent="طلبات الإدارة";subtitle.textContent="للتذاكر والتقديمات فقط.";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon">🎫</div><h3>التذاكر</h3><div id="admin-tickets" class="log-list">جاري التحميل...</div></article><article class="feature-card"><div class="feature-icon">📝</div><h3>التقديمات</h3><div id="admin-apps" class="log-list">جاري التحميل...</div></article>';const t=await fetch("/api/owner/tickets").then(r=>r.json()),a=await fetch("/api/owner/applications").then(r=>r.json());$("#admin-tickets").innerHTML=(t.tickets||[]).map(x=>'<div class="log-item"><b>#'+x.id+' · '+esc(x.subject)+'</b><span>'+esc(x.username)+' · '+esc(x.status)+'</span><button data-admin-ticket="'+x.id+'">دخول للمحادثة</button><button data-admin-close="'+x.id+'">'+(x.status==="closed"?"إعادة فتح":"إغلاق")+'</button></div>').join("")||"<p class='muted'>لا توجد تيكات.</p>";document.querySelectorAll("[data-admin-ticket]").forEach(b=>b.onclick=()=>openTicket(Number(b.dataset.adminTicket)));document.querySelectorAll("[data-admin-close]").forEach(b=>b.onclick=async()=>{const id=b.dataset.adminClose;const row=b.parentElement;const closed=b.textContent.includes("إعادة");await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:closed?"open":"closed"})});adminPanel()});$("#admin-apps").innerHTML=(a.applications||[]).map(x=>'<div class="log-item"><b>#'+x.id+' · '+esc(x.type)+'</b><span>'+esc(x.username)+' · '+esc(x.discord_username)+' · '+esc(x.status)+'</span><small>'+esc(JSON.stringify(x.answers||{}))+'</small><button data-admin-app="'+x.id+'" data-status="approved">قبول</button><button data-admin-app="'+x.id+'" data-status="rejected">رفض</button></div>').join("")||"<p class='muted'>لا توجد تقديمات.</p>";document.querySelectorAll("[data-admin-app]").forEach(b=>b.onclick=async()=>{const r=await fetch("/api/owner/applications/"+b.dataset.adminApp+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:b.dataset.status})});if(!r.ok)alert((await r.json()).error);else adminPanel()});setStatus("طلبات الإدارة جاهزة")}
async function ownerPanel(){await mldMe();if(!mldUser||mldUser.role!=="owner")return authView();await renderAdmin();title.textContent="لوحة الأونر";subtitle.textContent="إحصائيات السيرفر والرتب وحالة المنصة.";setStatus("لوحة الأونر جاهزة")}
async function ownerLogs(){await mldMe();if(!mldUser||mldUser.role!=="owner"){return authView()}searchWrap.style.display="none";title.textContent="سجل الأونر";subtitle.textContent="آخر العمليات الإدارية المسجلة على الموقع.";content.className="feature-card";content.innerHTML="<div class='loading'>جاري تحميل السجل...</div>";try{const r=await fetch("/api/owner/logs"),d=await r.json();if(!r.ok)throw Error(d.error||"تعذر التحميل");content.innerHTML="<h3>سجل العمليات</h3><div class='log-list'>"+(d.logs||[]).map(x=>"<div class='log-item'><b>"+esc(x.action||"عملية")+"</b><span>"+esc(x.username||"النظام")+" · "+esc(x.discord_username||"")+"</span><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(x.details||"")+"</p></div>").join("")||"<p class='muted'>لا يوجد سجل حتى الآن.</p>"+"</div>"}catch(e){content.innerHTML="<p class='muted'>تعذر تحميل السجل حاليًا.</p>"}setStatus("السجل جاهز")}
async function reviewsView(){searchWrap.style.display="none";title.textContent="آراء المجتمع";subtitle.textContent="آراء الأعضاء وتقييماتهم.";content.className="feature-grid";content.innerHTML="<article class='feature-card'><div class='feature-icon'>⭐</div><h3>آراء المجتمع</h3><div id='reviews-list' class='log-list'>جاري التحميل...</div></article>";try{const r=await fetch("/api/reviews"),d=await r.json();$("#reviews-list").innerHTML=(d.reviews||[]).map(x=>"<article class='review-card'><div class='review-stars'>"+("★".repeat(Number(x.rating)||0))+"</div><b>"+esc(x.username)+"</b><p>"+esc(x.message)+"</p><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small></article>").join("")||"<p class='muted'>لا توجد آراء منشورة بعد.</p>"}catch(e){$("#reviews-list").textContent="تعذر تحميل الآراء حاليًا"}setStatus("الآراء جاهزة")}



function chatBadge(role){return role==="owner"?"<span class='chat-badge owner'>👑 المالك</span>":role==="admin"?"<span class='chat-badge admin'>🛡️ إداري</span>":"<span class='chat-badge user'>👤 عضو</span>"}
function stopChatPolling(){if(window.mldChatTimer){clearInterval(window.mldChatTimer);window.mldChatTimer=null}}
function chatMessageHtml(m,owner=false){return "<article class='chat-msg "+(m.sender===mldUser?.username?"mine":"")+"'><img src='"+esc(m.avatar||fallback)+"' onerror=\"this.src='"+fallback+"'\"><div class='chat-msg-main'><div class='chat-msg-head'><b>"+esc(m.displayName)+"</b>"+chatBadge(m.role)+"<small>"+new Date(m.createdAt).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})+"</small></div><div class='chat-msg-body'>"+esc(m.body)+"</div>"+(m.sender!==mldUser?.username?"<button class='chat-block-btn' data-block='"+esc(m.sender)+"'>حظر</button>":"")+(owner&&m.sender!==mldUser?.username?"<button class='chat-mute-btn' data-mute='"+esc(m.sender)+"'>كتم</button>":"")+"</div></article>"}
async function mldChatView(mode="public"){
  await mldMe(); stopChatPolling();
  if(!mldUser){title.textContent="الشات";subtitle.textContent="سجل دخولك لاستخدام الشات.";searchWrap.style.display="none";content.className="feature-grid";content.innerHTML="<article class='feature-card chat-hero-card'><div class='chat-orb'>✦</div><h2>MLD CHAT</h2><p class='muted'>شات كتابي عام وخاص، بروفايلات وصلاحيات حقيقية.</p><button class='primary wide' id='chat-login'>تسجيل الدخول</button></article>";$("#chat-login").onclick=()=>change("login");return}
  searchWrap.style.display="none";title.textContent=mode==="public"?"الشات العام":"المحادثات الخاصة";subtitle.textContent="نظام محادثات نصي سريع وآمن — بدون صوت.";
  content.className="chat-shell";
  content.innerHTML="<aside class='chat-sidebar'><div class='chat-brand'><span>✦</span><div><b>MLD CHAT</b><small>TEXT ONLY</small></div></div><button class='chat-tab "+(mode==="public"?"active":"")+"' data-chat-mode='public'>🌐 الشات العام</button><button class='chat-tab "+(mode!=="public"?"active":"")+"' data-chat-mode='private'>💬 الخاص <span id='chat-unread'>0</span></button><button class='chat-tab' data-chat-mode='profile'>👤 بروفايلي</button><button class='chat-tab' data-chat-mode='blocks'>🚫 المحظورون</button><div id='chat-side-list'></div></aside><section class='chat-main' id='chat-main'></section>";
  document.querySelectorAll("[data-chat-mode]").forEach(b=>b.onclick=()=>{const x=b.dataset.chatMode;if(x==="profile")mldChatProfile();else if(x==="blocks")mldChatBlocks();else mldChatView(x)});
  if(mode==="profile"){mldChatProfile();return}
  if(mode==="public")await mldPublicChat();else await mldPrivateChat();
}
async function mldPublicChat(){
  const main=$("#chat-main");main.innerHTML="<div class='chat-top'><div><b>🌐 الشات العام</b><small>كل أعضاء الموقع يقدرون يكتبون هنا</small></div><span class='live-dot'>● LIVE</span></div><div id='chat-feed' class='chat-feed'><div class='loading'>جاري تحميل الرسائل...</div></div><form id='chat-compose' class='chat-compose'><textarea id='chat-input' maxlength='2000' rows='2' placeholder='اكتب رسالتك...'></textarea><button class='primary' type='submit'>إرسال ↵</button></form><p id='chat-error' class='chat-error'></p>";
  const load=async()=>{if(document.hidden)return;try{const d=await fetch("/api/chat/public?limit=60").then(r=>r.json());if(!d.messages)return;$("#chat-feed").innerHTML=d.messages.map(x=>chatMessageHtml(x,mldUser.role==="owner")).join("")||"<div class='chat-empty'>ابدأ أول رسالة في MLD ✦</div>";const feed=$("#chat-feed");feed.scrollTop=feed.scrollHeight;document.querySelectorAll("[data-block]").forEach(b=>b.onclick=async()=>{if(!confirm("حظر @"+b.dataset.block+" من محادثاتك الخاصة؟"))return;const r=await fetch("/api/chat/blocks/"+encodeURIComponent(b.dataset.block),{method:"POST"});if(!r.ok)alert((await r.json()).error||"تعذر الحظر");else alert("تم حظر المستخدم ✓")});document.querySelectorAll("[data-mute]").forEach(b=>b.onclick=async()=>{const min=prompt("مدة الكتم بالدقائق — اتركها 0 للكتم الدائم","10");if(min===null)return;const r=await fetch("/api/chat/public/mute/"+encodeURIComponent(b.dataset.mute),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({minutes:Number(min),reason:"إدارة الشات العام"})});if(!r.ok)alert((await r.json()).error||"تعذر الكتم")})}catch(e){}};
  await load();window.mldChatTimer=setInterval(load,3500);document.addEventListener("visibilitychange",()=>{if(document.hidden)stopChatPolling()},{once:true});
  $("#chat-compose").onsubmit=async e=>{e.preventDefault();const input=$("#chat-input"),body=input.value.trim(),err=$("#chat-error");if(!body)return;const r=await fetch("/api/chat/public",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),d=await r.json();if(!r.ok){err.textContent=d.error||"تعذر الإرسال";return}err.textContent="";input.value="";await load();input.focus()};
}
async function mldPrivateChat(){
  const main=$("#chat-main");main.innerHTML="<div class='chat-top'><div><b>💬 المحادثات الخاصة</b><small>محادثة مع شخص أو مجموعة — لكل محادثة مالك</small></div><button class='primary' id='new-chat'>＋ محادثة</button></div><div id='private-list' class='private-list'><div class='loading'>جاري تحميل المحادثات...</div></div><div id='private-room' class='private-room hidden'></div>";
  const d=await fetch("/api/chat/conversations").then(r=>r.json());const list=$("#private-list");list.innerHTML=(d.conversations||[]).map(x=>"<button class='conversation' data-conv='"+x.id+"'><span class='conv-icon'>"+(x.kind==="private_group"?"👥":"💬")+"</span><span><b>"+esc(x.title||"محادثة خاصة")+"</b><small>"+esc(x.last_message||"لا توجد رسائل بعد")+"</small></span>"+(x.unread?"<em>"+x.unread+"</em>":"")+"</button>").join("")||"<div class='chat-empty'>لا توجد محادثات. أنشئ أول محادثة.</div>";
  document.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>openPrivateRoom(Number(b.dataset.conv)));
  $("#new-chat").onclick=async()=>{const names=prompt("اكتب يوزرات الأعضاء مفصولة بفاصلة");if(!names)return;const participants=names.split(",").map(x=>x.trim()).filter(Boolean);const r=await fetch("/api/chat/conversations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({participants,title:participants.length>1?"مجموعة MLD":"محادثة خاصة"})}),x=await r.json();if(!r.ok)return alert(x.error||"تعذر إنشاء المحادثة");await mldPrivateChat();openPrivateRoom(x.conversation.id)};
}
async function openPrivateRoom(id){
  const room=$("#private-room");if(!room)return;$("#private-list").classList.add("hidden");room.classList.remove("hidden");room.innerHTML="<button id='room-back' class='chat-back'>← المحادثات</button><div class='chat-top'><div><b>💬 محادثة MLD</b><small>رسائل نصية فقط</small></div></div><div id='room-feed' class='chat-feed'></div><form id='room-compose' class='chat-compose'><textarea id='room-input' maxlength='2000' rows='2' placeholder='اكتب رسالتك...'></textarea><button class='primary'>إرسال ↵</button></form><p id='room-error' class='chat-error'></p>";
  $("#room-back").onclick=()=>mldPrivateChat();
  const load=async()=>{if(document.hidden)return;try{const d=await fetch("/api/chat/conversations/"+id+"/messages?limit=80").then(r=>r.json());if(!d.messages)throw Error(d.error);$("#room-feed").innerHTML=d.messages.map(x=>chatMessageHtml(x,false)).join("")||"<div class='chat-empty'>ابدأ المحادثة ✦</div>";const f=$("#room-feed");f.scrollTop=f.scrollHeight}catch(e){$("#room-error").textContent=e.message||"تعذر التحميل"}};
  await load();window.mldChatTimer=setInterval(load,3500);document.addEventListener("visibilitychange",()=>{if(document.hidden)stopChatPolling()},{once:true});
  $("#room-compose").onsubmit=async e=>{e.preventDefault();const input=$("#room-input"),body=input.value.trim();if(!body)return;const r=await fetch("/api/chat/conversations/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),d=await r.json();if(!r.ok)return $("#room-error").textContent=d.error||"تعذر الإرسال";$("#room-error").textContent="";input.value="";await load();input.focus()};
}
async function mldChatBlocks(){const main=$("#chat-main");main.innerHTML="<div class=\"chat-top\"><div><b>🚫 المستخدمون المحظورون</b><small>تقدر تفك الحظر في أي وقت.</small></div></div><div id=\"blocks-list\" class=\"private-list\">جاري التحميل...</div>";const d=await fetch("/api/chat/blocks").then(r=>r.json());$("#blocks-list").innerHTML=(d.blocks||[]).map(u=>"<div class=\"conversation\"><b>@"+esc(u)+"</b><button class=\"primary\" data-unblock=\""+esc(u)+"\">فك الحظر</button></div>").join("")||"<div class=\"chat-empty\">ما عندك مستخدمين محظورين.</div>";document.querySelectorAll("[data-unblock]").forEach(b=>b.onclick=async()=>{await fetch("/api/chat/blocks/"+encodeURIComponent(b.dataset.unblock),{method:"DELETE"});mldChatBlocks()})}
async function mldChatProfile(){
  await mldMe();stopChatPolling();searchWrap.style.display="none";title.textContent="بروفايلي";subtitle.textContent="الاسم والأفاتار والنبذة التي تظهر في الشات.";content.className="feature-grid";const d=await fetch("/api/chat/profile").then(r=>r.json()),p=d.profile||{};content.innerHTML="<article class='feature-card profile-editor'><div class='chat-profile-preview'><img id='chat-avatar-preview' src='"+esc(p.avatar_url||fallback)+"' onerror=\"this.src='"+fallback+"'\"><div><b id='chat-name-preview'>"+esc(p.display_name||mldUser.username)+"</b>"+chatBadge(p.role)+"<small>@"+esc(mldUser.username)+"</small></div></div><label>الاسم الظاهر<input id='profile-name' class='full' maxlength='60' value='"+esc(p.display_name||mldUser.username)+"'></label><label>رابط الأفاتار<input id='profile-avatar' class='full' maxlength='500' value='"+esc(p.avatar_url||"")+"' placeholder='https://...'></label><label>نبذة<textarea id='profile-bio' class='full' maxlength='240' rows='4'>"+esc(p.bio||"")+"</textarea></label><button class='primary wide' id='profile-save'>حفظ البروفايل</button><p id='profile-status' class='muted'></p></article>";
  $("#profile-save").onclick=async()=>{const r=await fetch("/api/chat/profile",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({displayName:$("#profile-name").value,avatarUrl:$("#profile-avatar").value,bio:$("#profile-bio").value})}),x=await r.json();$("#profile-status").textContent=r.ok?"تم حفظ البروفايل ✓":(x.error||"تعذر الحفظ");if(r.ok){$("#chat-name-preview").textContent=x.profile.display_name;$("#chat-avatar-preview").src=x.profile.avatar_url||fallback}};
}



async function enhancedTicketView(){
  await mldMe(); searchWrap.style.display="none"; title.textContent="مركز التذاكر"; subtitle.textContent="كل تيكت له محادثة نصية كاملة وتسجيل إداري لكل حركة."; content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'>🎫</div><h3>فتح تيكت جديد</h3><input id='ticket-sub' class='full' maxlength='120' placeholder='عنوان الطلب'><textarea id='ticket-msg' class='full' rows='6' maxlength='3000' placeholder='اشرح طلبك بالتفصيل...'></textarea><button class='primary wide' id='ticket-send'>فتح التذكرة</button><p id='ticket-status' class='muted'></p></article><article class='feature-card'><h3>تيكاتي</h3><div id='my-tickets' class='log-list'>جاري التحميل...</div></article><article class='feature-card hidden' id='ticket-chat-card'><div class='chat-top'><div><b id='ticket-chat-title'>🎫 محادثة التيكت</b><small>رسائل نصية + تحديث مباشر</small></div></div><div id='ticket-chat' class='chat-feed'></div><form id='ticket-reply-form' class='chat-compose'><textarea id='ticket-reply' class='full' rows='2' maxlength='3000' placeholder='اكتب ردك...'></textarea><button class='primary'>إرسال ↵</button></form><p id='ticket-reply-status' class='chat-error'></p></article>";
  const load=async()=>{const d=await fetch("/api/tickets").then(r=>r.json()).catch(()=>({tickets:[]}));$("#my-tickets").innerHTML=(d.tickets||[]).map(x=>"<button class='group-item ticket-row' data-ticket-id='"+x.id+"'><span><b>#"+x.id+" · "+esc(x.subject)+"</b><small>"+esc(x.status)+" · "+esc(x.username||"")+"</small><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small></span><span>محادثة ↗</span></button>").join("")||"<p class='muted'>لا توجد تيكات.</p>";document.querySelectorAll("[data-ticket-id]").forEach(b=>b.onclick=()=>enhancedOpenTicket(Number(b.dataset.ticketId)))};
  $("#ticket-send").onclick=async()=>{if(!needAuth())return;const r=await fetch("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject:$("#ticket-sub").value,message:$("#ticket-msg").value})}),d=await r.json();if(!r.ok)return $("#ticket-status").textContent=d.error||"تعذر فتح التيكت";$("#ticket-status").textContent="تم فتح التيكت #"+d.id+" ✓";await load();enhancedOpenTicket(Number(d.id))};
  if(!mldUser)$("#ticket-send").textContent="سجّل دخولك لفتح تيكت"; await load();
}
async function enhancedOpenTicket(id){
  if(!needAuth())return;
  const r=await fetch("/api/tickets/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"تعذر فتح المحادثة");
  const card=$("#ticket-chat-card");if(!card){return} card.classList.remove("hidden");$("#ticket-chat-title").textContent="🎫 محادثة التيكت #"+id;
  const render=()=>{$("#ticket-chat").innerHTML=(d.messages||[]).map(m=>"<article class='chat-msg'><div class='chat-msg-main'><div class='chat-msg-head'><b>"+esc(m.username)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small></div><div class='chat-msg-body'>"+esc(m.message)+"</div></div></article>").join("")||"<div class='chat-empty'>لا توجد رسائل</div>";const f=$("#ticket-chat");f.scrollTop=f.scrollHeight};
  render();
  $("#ticket-reply-form").onsubmit=async e=>{e.preventDefault();const body=$("#ticket-reply").value.trim();if(!body)return;const rr=await fetch("/api/tickets/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:body})}),dd=await rr.json();if(!rr.ok)return $("#ticket-reply-status").textContent=dd.error||"تعذر الإرسال";$("#ticket-reply").value="";$("#ticket-reply-status").textContent="";const nr=await fetch("/api/tickets/"+id+"/messages");d.messages=(await nr.json()).messages||[];render()};
}
async function enhancedGroupsReal(){
  await mldMe();searchWrap.style.display="none";title.textContent="قروبات السيرفر";subtitle.textContent="نظام مستقل عن الخاص: طلب إنشاء، موافقة الأونر، رول وروم Discord، وطلبات انضمام.";content.className="feature-grid";
  const load=async()=>{
    const d=await fetch("/api/groups").then(r=>r.json()).catch(()=>({groups:[]}));
    content.innerHTML="<article class='feature-card'><div class='feature-icon'>👥</div><h3>إنشاء قروب سيرفر</h3><p class='muted'>بعد الإنشاء يوصلك طلب اعتماد للأونر عبر Discord. عند الموافقة ينشأ رول وروم خاص بالقروب.</p><input id='group-name' class='full' maxlength='60' placeholder='اسم القروب'><input id='group-desc' class='full' maxlength='240' placeholder='وصف القروب'><button class='primary wide' id='group-create'>إرسال طلب إنشاء</button><p id='group-create-status' class='muted'></p></article>"+
    (d.groups||[]).map(g=>{
      const owner=mldUser&&mldUser.username===g.owner_username, approved=g.status==="approved";
      const action=owner&&!approved?"<span class='group-status pending'>⏳ بانتظار موافقة الأونر</span>":approved?(owner?"<button data-group-requests='"+g.id+"'>طلبات الانضمام</button><button class='primary' data-group-chat='"+(g.group_conversation_id||0)+"'>💬 شات القروب</button>":"<button data-group-join='"+g.id+"'>➕ طلب انضمام</button>"):"<span class='group-status'>"+esc(g.status||"pending")+"</span>";
      return "<article class='feature-card group-card'><div class='feature-icon'>👥</div><h3>"+esc(g.name)+"</h3><p class='muted'>"+esc(g.description||"بدون وصف")+"</p><div class='group-meta'>👑 "+esc(g.owner_username)+" · 👥 "+g.member_count+" · "+(approved?"🟢 معتمد":"🟡 قيد الاعتماد")+"</div><div class='group-members'>"+(g.members||[]).map(m=>"<span>"+esc(m.username)+(m.username===g.owner_username?" 👑":"")+"</span>").join("")+"</div><div class='game-lobby-actions'>"+action+"</div></article>";
    }).join("")||"<p class='muted'>لا توجد قروبات معتمدة حتى الآن.</p>";
    $("#group-create").onclick=async()=>{
      if(!needAuth())return;
      const r=await fetch("/api/groups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("#group-name").value,description:$("#group-desc").value})}),x=await r.json();
      $("#group-create-status").textContent=r.ok?"تم إرسال طلب القروب للأونر عبر Discord ✓":(x.error||"تعذر إرسال الطلب");
      if(r.ok)await load();
    };
    document.querySelectorAll("[data-group-chat]").forEach(b=>b.onclick=()=>openGroupChat(Number(b.dataset.groupChat)));
    document.querySelectorAll("[data-group-join]").forEach(b=>b.onclick=async()=>{
      if(!needAuth())return;
      const r=await fetch("/api/groups/"+b.dataset.groupJoin+"/join",{method:"POST"}),x=await r.json();
      alert(r.ok?"تم إرسال طلب الانضمام لمالك القروب ✓":(x.error||"تعذر إرسال الطلب")); if(r.ok)load();
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
      alert(rr.ok?"تم قبول العضو ✓":"تعذر قبول العضو"); if(rr.ok)load();
    });
  };
  await load();
}

async function openGroupChat(id){
  if(!id)return alert("هذه القروب لم يتم إنشاء محادثته بعد");
  const r=await fetch("/api/chat/conversations/"+id+"/messages"),d=await r.json();if(!r.ok)return alert(d.error||"لا تملك صلاحية المحادثة");
  searchWrap.style.display="none";title.textContent="محادثة القروب";subtitle.textContent="كتابة فقط · أعضاء القروب فقط";content.className="chat-shell";
  content.innerHTML="<section class='chat-main'><div class='chat-top'><div><b>👥 محادثة القروب</b><small>نص فقط</small></div><button id='group-chat-back'>رجوع</button></div><div id='group-chat-feed' class='chat-feed'></div><form id='group-chat-form' class='chat-compose'><textarea id='group-chat-input' maxlength='2000' rows='2' placeholder='اكتب في القروب...'></textarea><button class='primary'>إرسال ↵</button></form><p id='group-chat-error' class='chat-error'></p></section>";
  const render=()=>{$("#group-chat-feed").innerHTML=(d.messages||[]).map(x=>chatMessageHtml(x,false)).join("")||"<div class='chat-empty'>ابدأ المحادثة ✦</div>";const f=$("#group-chat-feed");f.scrollTop=f.scrollHeight};
  render();$("#group-chat-back").onclick=()=>enhancedGroupsReal();$("#group-chat-form").onsubmit=async e=>{e.preventDefault();const body=$("#group-chat-input").value.trim();if(!body)return;const rr=await fetch("/api/chat/conversations/"+id+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})}),dd=await rr.json();if(!rr.ok)return $("#group-chat-error").textContent=dd.error||"تعذر الإرسال";$("#group-chat-input").value="";const nr=await fetch("/api/chat/conversations/"+id+"/messages"),nd=await nr.json();d.messages=nd.messages||[];render()};
}
ticketView=enhancedTicketView;
var groupsReal=enhancedGroupsReal;async function loadOwnerPrivateChats(){const el=$("#owner-private-chats");if(!el)return;const d=await fetch("/api/owner/chat/conversations").then(r=>r.json()).catch(()=>({conversations:[]}));el.innerHTML=(d.conversations||[]).map(x=>`<button class="group-item" data-owner-chat="${x.id}"><span><b>${esc(x.title||"محادثة خاصة")}</b><small>${esc(x.owner_username)} · ${x.participants} أعضاء · ${esc(x.last_message||"لا رسائل")}</small></span><span>فتح ↗</span></button>`).join("")||"<p class='muted'>لا توجد محادثات خاصة.</p>";document.querySelectorAll("[data-owner-chat]").forEach(b=>b.onclick=async()=>{const d=await fetch("/api/owner/chat/conversations/"+b.dataset.ownerChat).then(r=>r.json());openModal();box.innerHTML="<div class='message-box'><p class='eyebrow'>مراجعة المحادثة #"+b.dataset.ownerChat+"</p><div class='log-list'>"+(d.messages||[]).map(m=>"<div class='log-item'><b>"+esc(m.display_name)+" · @"+esc(m.sender_username)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.body)+"</p></div>").join("")+"</div></div>"})}


/* MLD Owner Control Center */
ownerPanel=async function(){
  await mldMe();
  if(!mldUser||mldUser.role!=="owner")return authView();
  searchWrap.style.display="none"; title.textContent="لوحة الأونر"; subtitle.textContent="التقديمات · التذاكر · الزاجل · الحسابات · كل اللوقات"; content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'>👑</div><h3>مركز الأونر</h3><p class='muted'>كل عمليات الإدارة من مكان واحد.</p><div class='game-lobby-actions'><button class='primary' data-owner-tab='apps'>📝 التقديمات</button><button data-owner-tab='tickets'>🎫 التذاكر</button><button data-owner-tab='logs'>📜 اللوقات</button><button data-owner-tab='users'>👥 الحسابات</button><button data-owner-tab='dms'>💬 الزاجل</button></div></article><div id='owner-panel-body' class='feature-grid'></div>";
  const body=$("#owner-panel-body");
  async function loadApps(){
    const r=await fetch("/api/owner/applications"),d=await r.json();
    body.innerHTML="<article class='feature-card'><h3>التقديمات</h3><div class='log-list'>"+(d.applications||[]).map(a=>"<div class='log-item'><b>#"+a.id+" · "+esc(a.type)+"</b><span>حساب الموقع: "+esc(a.username)+" · Discord: "+esc(a.discord_username)+"</span><small>"+new Date(a.created_at).toLocaleString("ar-SA")+" · الحالة: "+esc(a.status)+"</small><p>"+esc(JSON.stringify(a.answers||{},null,2))+"</p><div class='game-lobby-actions'>"+(a.status==="pending"?"<button class='primary' data-app-ok='"+a.id+"'>قبول</button><button data-app-no='"+a.id+"'>رفض</button>":"<b>"+(a.status==="approved"?"✅ مقبول":"❌ مرفوض")+"</b>")+"</div></div>").join("")||"<p class='muted'>لا توجد تقديمات.</p>"+"</div></article>";
    document.querySelectorAll("[data-app-ok]").forEach(b=>b.onclick=async()=>{const rr=await fetch("/api/owner/applications/"+b.dataset.appOk+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"approved"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر القبول");loadApps()});
    document.querySelectorAll("[data-app-no]").forEach(b=>b.onclick=async()=>{const rr=await fetch("/api/owner/applications/"+b.dataset.appNo+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"rejected"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر الرفض");loadApps()});
  }
  async function loadTickets(){
    const r=await fetch("/api/owner/tickets"),d=await r.json();
    body.innerHTML="<article class='feature-card'><h3>التذاكر</h3><div class='log-list'>"+(d.tickets||[]).map(t=>"<button class='group-item' data-owner-ticket='"+t.id+"'><span><b>#"+t.id+" · "+esc(t.subject)+"</b><small>"+esc(t.username)+" · Discord: "+esc(t.discord_username)+" · "+esc(t.status)+"</small></span><span>فتح ↗</span></button>").join("")||"<p class='muted'>لا توجد تذاكر.</p>"+"</div></article>";
    document.querySelectorAll("[data-owner-ticket]").forEach(b=>b.onclick=()=>openOwnerTicket(Number(b.dataset.ownerTicket)));
  }
  async function openOwnerTicket(id){
    const r=await fetch("/api/tickets/"+id+"/messages"),d=await r.json();
    const lg=await fetch("/api/owner/tickets/"+id+"/log").then(x=>x.json()).catch(()=>({log:null}));
    body.innerHTML="<article class='feature-card'><button id='owner-ticket-back'>رجوع</button><h3>🎫 تيكت #"+id+"</h3><div class='log-list'>"+(d.messages||[]).map(m=>"<div class='log-item'><b>"+esc(m.username)+" · Discord: "+esc(m.discord_username)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.message)+"</p></div>").join("")+"</div><div class='game-lobby-actions'><button class='primary' id='close-owner-ticket'>إغلاق وحفظ المحادثة</button><button id='owner-ticket-open'>فتح</button></div><h4>سجل الإغلاق</h4><div class='log-list'>"+(lg.log?(lg.log.transcript||[]).map(m=>"<div class='log-item'><b>"+esc(m.username)+" · Discord: "+esc(m.discord_username)+"</b><small>"+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.message)+"</p></div>").join(""):"<p class='muted'>لم يتم إغلاقه بعد.</p>")+"</div></article>";
    $("#owner-ticket-back").onclick=loadTickets;
    $("#close-owner-ticket").onclick=async()=>{const rr=await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"closed"})}),x=await rr.json();if(!rr.ok)return alert(x.error||"تعذر الإغلاق");openOwnerTicket(id)};
    $("#owner-ticket-open").onclick=async()=>{await fetch("/api/owner/tickets/"+id+"/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"open"})});openOwnerTicket(id)};
  }
  async function loadLogs(){
    const r=await fetch("/api/owner/logs"),d=await r.json();
    body.innerHTML="<article class='feature-card'><h3>كل اللوقات</h3><p class='muted'>ومنها الزاجل: الرسائل الخاصة تسجل صاحب الحساب وDiscord والمحادثة.</p><div class='log-list'>"+(d.logs||[]).map(x=>"<div class='log-item'><b>"+esc(x.action)+"</b><span>الموقع: "+esc(x.username||"النظام")+" · Discord: "+esc(x.discord_username||"")+"</span><small>"+new Date(x.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(x.details||"")+"</p></div>").join("")||"<p class='muted'>لا توجد لوقات.</p>"+"</div></article>";
  }
  async function loadUsers(){
    const r=await fetch("/api/owner/users"),d=await r.json();
    body.innerHTML="<article class='feature-card'><h3>حسابات الأعضاء</h3><div class='log-list'>"+(d.users||[]).map(u=>"<button class='group-item' data-owner-user='"+esc(u.username)+"'><span><b>"+esc(u.display_name||u.username)+"</b><small>الموقع: "+esc(u.username)+" · Discord: "+esc(u.discord_username)+" · "+esc(u.role)+"</small></span><span>"+(u.avatar_url?"🖼️":"👤")+" فتح ↗</span></button>").join("")||"<p class='muted'>لا توجد حسابات.</p>"+"</div></article>";
    document.querySelectorAll("[data-owner-user]").forEach(b=>b.onclick=()=>openOwnerUser(b.dataset.ownerUser));
  }
  async function openOwnerUser(username){
    const r=await fetch("/api/owner/users/"+encodeURIComponent(username)+"/messages"),d=await r.json();
    body.innerHTML="<article class='feature-card'><button id='owner-user-back'>رجوع</button><h3>💬 الزاجل · "+esc(username)+"</h3><p class='muted'>جميع الرسائل الخاصة التي يملك هذا الحساب صلاحية رؤيتها.</p><div class='log-list'>"+(d.messages||[]).map(m=>"<div class='log-item'><b>"+esc(m.display_name)+" · @"+esc(m.sender_username)+"</b><small>محادثة #"+esc(m.id)+" · "+new Date(m.created_at).toLocaleString("ar-SA")+"</small><p>"+esc(m.body)+"</p></div>").join("")||"<p class='muted'>لا توجد رسائل خاصة.</p>"+"</div></article>";
    $("#owner-user-back").onclick=loadUsers;
  }
  async function tab(t){if(t==="apps")return loadApps();if(t==="tickets")return loadTickets();if(t==="logs")return loadLogs();if(t==="users"||t==="dms")return loadUsers();}
  document.querySelectorAll("[data-owner-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.ownerTab));
  await loadApps(); setStatus("لوحة الأونر جاهزة");
};

applyView=async function(){
  await mldMe(); searchWrap.style.display="none"; title.textContent="التقديم"; subtitle.textContent="التقديمات الجديدة وتقديماتي"; content.className="feature-grid";
  content.innerHTML="<article class='feature-card'><div class='feature-icon'>📝</div><h3>تقديم جديد</h3><div id='dynamic-questions' class='form-stack'><div class='loading'>جاري التحميل...</div></div><button class='primary wide' id='app-send'>إرسال التقديم</button><p id='app-status' class='muted'></p></article><article class='feature-card'><h3>تقديماتي</h3><div id='my-applications' class='log-list'>جاري التحميل...</div></article>";
  if(!mldUser){$("#app-send").textContent="سجّل دخولك أولًا";$("#app-send").onclick=()=>change("login");return}
  const q=await fetch("/api/application-questions").then(r=>r.json()).catch(()=>({questions:[]})),qs=q.questions||[];
  $("#dynamic-questions").innerHTML=(qs.length?qs:[{key:"experience",label:"خبرتك أو نبذة عنك",required:true},{key:"why",label:"ليش مناسب للتقديم؟",required:true}]).map(x=>"<label class='form-label'>"+esc(x.label)+(x.required?" *":"")+"<textarea class='full app-q' data-q='"+esc(x.key)+"' rows='4' maxlength='2000' placeholder='"+esc(x.label)+"'></textarea></label>").join("");
  const my=await fetch("/api/my/applications").then(r=>r.json()).catch(()=>({applications:[]}));$("#my-applications").innerHTML=(my.applications||[]).map(a=>"<div class='log-item'><b>#"+a.id+" · "+esc(a.type)+"</b><small>"+new Date(a.created_at).toLocaleString("ar-SA")+" · "+esc(a.status)+"</small></div>").join("")||"<p class='muted'>ما عندك تقديمات.</p>";
  $("#app-send").onclick=async()=>{const answers={};document.querySelectorAll(".app-q").forEach(x=>answers[x.dataset.q]=x.value.trim());const rr=await fetch("/api/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"إدارة",answers})}),dd=await rr.json();$("#app-status").textContent=rr.ok?"تم إرسال التقديم ✓":(dd.error||"تعذر الإرسال");if(rr.ok)applyView()};
};


// MLD GAMES — lobby + session client
async function renderGames(){
  searchWrap.style.display="none";
  title.textContent="مركز الألعاب";
  subtitle.textContent="جلسات ألعاب حقيقية مرتبطة بالخادم — إنشاء، انضمام، مقاعد، مشاهدة، ولعب.";
  content.className="feature-grid";
  const guestId=localStorage.getItem("mld_guest_id")||("g_"+crypto.randomUUID());
  localStorage.setItem("mld_guest_id",guestId);
  let sessionTimer=null,sessionId=null;
   const names = { CODENAMES:"Codenames", SPYFALL:"Spyfall", PICTIONARY:"Pictionary", CHARADES:"Charades", WHOAMI:"Who Am I?", TABOO:"Taboo", WORD_BOMB:"Word Bomb", TRUTH_LIE:"Truth or Lie", EMOJI_GUESS:"Emoji Guess", TRIVIA:"Trivia", CATEGORIES:"Categories", LIAR:"Liar", HOT_SEAT:"Hot Seat", WOULD_YOU_RATHER:"Would You Rather", DRAW_GUESS:"Draw & Guess", FASTEST:"Fastest", RIDDLE_RUSH:"Riddle Rush", SECRET_WORD:"Secret Word", MIMIC:"Mimic", GUESS_PLAYER:"Guess Player", UNO:"UNO", LUDO:"Ludo", BALOOT:"Baloot", DAQSH:"Daqsh", QAWSAR:"Qawsar" };
   const seatNames = { CODENAMES:["Red Captain","Red Agent","Blue Captain","Blue Agent"], SPYFALL:["Investigator 1","Investigator 2","Investigator 3","Spy"], PICTIONARY:["Drawer","Guesser 1","Guesser 2","Guesser 3"], CHARADES:["Actor","Guesser 1","Guesser 2","Guesser 3"], WHOAMI:["Player 1","Player 2","Player 3","Player 4"], TABOO:["Explainer","Guesser 1","Guesser 2","Guesser 3"], WORD_BOMB:["Player 1","Player 2","Player 3","Player 4"], TRUTH_LIE:["Player 1","Player 2","Player 3","Player 4"], EMOJI_GUESS:["Player 1","Player 2","Player 3","Player 4"], TRIVIA:["Player 1","Player 2","Player 3","Player 4"], CATEGORIES:["Player 1","Player 2","Player 3","Player 4"], LIAR:["Accused","Detective 1","Detective 2","Detective 3"], HOT_SEAT:["Hot Seat","Player 2","Player 3","Player 4"], WOULD_YOU_RATHER:["Player 1","Player 2","Player 3","Player 4"], DRAW_GUESS:["Drawer","Guesser 1","Guesser 2","Guesser 3"], FASTEST:["Racer 1","Racer 2","Racer 3","Racer 4"], RIDDLE_RUSH:["Player 1","Player 2","Player 3","Player 4"], SECRET_WORD:["Secret Holder","Player 2","Player 3","Player 4"], MIMIC:["Mimic","Guesser 1","Guesser 2","Guesser 3"], GUESS_PLAYER:["Mystery Player","Detective 1","Detective 2","Detective 3"], UNO:["Seat 1","Seat 2","Seat 3","Seat 4"], LUDO:["Seat 1","Seat 2","Seat 3","Seat 4"], BALOOT:["Team A - 1","Team A - 2","Team B - 1","Team B - 2"], DAQSH:["Player 1","Player 2","Player 3","Player 4"], QAWSAR:["Seat 1","Seat 2","Seat 3","Seat 4"] };
  const escGame=x=>esc(x);
  const api=async(url,opt)=>{const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"تعذر تنفيذ العملية");return d};
  const guestPayload=()=>({guestId,guestName:"زائر"});
  const stop=()=>{if(sessionTimer){clearInterval(sessionTimer);sessionTimer=null}sessionId=null};
  const gamesList=async()=>{
    stop();
    let d;try{d=await api("/api/games")}catch(e){content.innerHTML="<article class='feature-card'><h3>الألعاب</h3><p class='muted'>"+escGame(e.message)+"</p></article>";return}
    const games=d.games||[];
    content.innerHTML=
      "<article class='feature-card'><div class='feature-icon'>🎮</div><h3>إنشاء جلسة</h3><div class='form-stack'><label>اللعبة<select id='game-kind' class='full'>"+Object.entries(names).map(([k,v])=>"<option value='"+k+"'>"+escGame(v)+"</option>").join("")+"</select></label><label>عدد المقاعد<input id='game-max' class='full' type='number' min='2' max='8' value='4'></label><button class='primary wide' id='game-create'>إنشاء الجلسة</button><p id='game-create-status' class='muted'></p></div></article>"+
      "<article class='feature-card'><h3>الجلسات الحالية</h3><div id='game-lobbies' class='log-list'>"+(games.length?games.map(g=>"<div class='group-item'><span><b>#"+g.id+" · "+escGame(names[g.game]||g.game)+"</b><small>"+escGame(g.host_username)+" · "+(g.players||[]).length+"/"+g.max_players+" · "+escGame(g.status)+"</small></span><div class='game-lobby-actions'><button class='primary' data-game-join='"+g.id+"'>انضمام</button><button data-game-watch='"+g.id+"'>مشاهدة</button></div></div>").join(""):"<p class='muted'>لا توجد جلسات مفتوحة حاليًا.</p>")+"</div></article>";
    $("#game-create").onclick=async()=>{
      const game=$("#game-kind").value,maxPlayers=Number($("#game-max").value)||4;
      try{const d=await api("/api/games",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({game,maxPlayers,...guestPayload()})});openGameSession(d.game.id,false)}
      catch(e){$("#game-create-status").textContent=e.message}
    };
    document.querySelectorAll("[data-game-join]").forEach(b=>b.onclick=async()=>{try{await api("/api/games/"+b.dataset.gameJoin+"/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(guestPayload())});openGameSession(Number(b.dataset.gameJoin),false)}catch(e){alert(e.message)}});
    document.querySelectorAll("[data-game-watch]").forEach(b=>b.onclick=()=>openGameSession(Number(b.dataset.gameWatch),true));
  };
  const openGameSession=async(id,spectator)=>{
    stop();sessionId=id;
    const renderState=async()=>{
      try{
        const d=await api("/api/games/"+id+"/state?guestId="+encodeURIComponent(guestId));
        const g=d.game,s=d.state||{},players=g.players||[];
        const active=players.find(p=>p.guestId===guestId);
        const seats=(players.map(p=>"<div class='log-item'><b>"+escGame(p.seatLabel||p.username)+"</b><small>"+(p.host?"👑 صاحب الجلسة · ":"")+((p.guest)?"زائر":"عضو")+"</small></div>").join("")||"<p class='muted'>لاعبون سيظهرون هنا.</p>");
        let action="";
        if(spectator) action="<p class='muted'>وضع مشاهدة — لا يمكنك تنفيذ حركات.</p>";
        else if(g.status!=="playing"){
          const seatOptions=seatNames[g.game]||[];
          action="<p class='muted'>اختر مقعدك ثم انتظر اكتمال اللاعبين.</p><div class='game-lobby-actions'>"+seatOptions.map((x,i)=>"<button data-game-seat='"+i+"'>"+escGame(x)+"</button>").join("")+"</div>";
          if(active?.host)action+="<button class='primary wide' id='game-start' "+(g.status!=="ready"?"disabled":"")+">ابدأ اللعبة</button>";
        }else{
          if(g.game==="CODENAMES"){
            if(s.canGiveClue) action="<div class='form-stack'><input id='game-clue' class='full' maxlength='30' placeholder='التلميح'><input id='game-clue-num' class='full' type='number' min='1' max='9' value='1'><button class='primary wide' data-game-action='clue'>إعطاء التلميح</button></div>";
            if(s.canGuess) action+="<div class='game-word-grid'>"+(s.words||[]).map((w,i)=>"<button data-game-guess='"+i+"'>"+escGame(w.word||"؟")+"</button>").join("")+"</div>";
          }else if(s.kind==="choice"&&Array.isArray(s.choices)) action="<p>"+escGame(s.prompt||"")+"</p><div class='game-lobby-actions'>"+s.choices.map((x,i)=>"<button data-game-choice='"+i+"'>"+escGame(x)+"</button>").join("")+"</div>";
          else action="<p>"+escGame(s.prompt||"ابدأ الجولة.")+"</p><textarea id='game-answer' class='full' rows='4' placeholder='إجابتك'></textarea><button class='primary wide' data-game-action='answer'>إرسال الإجابة</button>";
          action+="<button data-game-action='round'>جولة جديدة</button>";
        }
        content.innerHTML="<article class='feature-card'><button id='game-back'>رجوع للجلسات</button><div class='feature-icon'>🎮</div><h3>#"+id+" · "+escGame(names[g.game]||g.game)+"</h3><p class='muted'>الحالة: "+escGame(g.status)+" · "+players.length+"/"+g.max_players+" لاعبين</p><div class='log-list'>"+seats+"</div><div class='game-lobby-actions'>"+action+"<button id='game-leave'>"+(spectator?"خروج من المشاهدة":"مغادرة الجلسة")+"</button>"+(active?.host&&!spectator?"<button id='game-finish'>إنهاء الجلسة</button>":"")+"</div><p id='game-state-status' class='muted'>"+escGame(s.lastResult?.message||"")+"</p></article>";
        $("#game-back").onclick=gamesList;
        $("#game-leave").onclick=async()=>{try{if(!spectator)await api("/api/games/"+id+"/leave",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(guestPayload())});gamesList()}catch(e){alert(e.message)}};
        $("#game-finish")?.addEventListener("click",async()=>{try{await api("/api/games/"+id+"/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(guestPayload())});renderState()}catch(e){alert(e.message)}});
        document.querySelectorAll("[data-game-seat]").forEach(b=>b.onclick=async()=>{try{const seats=seatNames[g.game]||[];await api("/api/games/"+id+"/seat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...guestPayload(),seat:seats[Number(b.dataset.gameSeat)]})});renderState()}catch(e){alert(e.message)}});
        $("#game-start")?.addEventListener("click",async()=>{try{await api("/api/games/"+id+"/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(guestPayload())});renderState()}catch(e){alert(e.message)}});
        document.querySelectorAll("[data-game-choice]").forEach(b=>b.onclick=()=>doAction("choose",{choice:Number(b.dataset.gameChoice)}));
        document.querySelectorAll("[data-game-guess]").forEach(b=>b.onclick=()=>doAction("guess",{index:Number(b.dataset.gameGuess)}));
        document.querySelectorAll("[data-game-action]").forEach(b=>b.onclick=()=>doAction(b.dataset.gameAction));
      }catch(e){content.innerHTML="<article class='feature-card'><button id='game-back'>رجوع</button><h3>الجلسة</h3><p class='muted'>"+escGame(e.message)+"</p></article>";$("#game-back").onclick=gamesList}
    };
    const doAction=async(action,extra={})=>{
      const body={...guestPayload(),action,...extra};
      if(action==="clue"){body.word=$("#game-clue")?.value.trim();body.number=Number($("#game-clue-num")?.value)||1}
      if(action==="answer")body.answer=$("#game-answer")?.value.trim()||"";
      try{await api("/api/games/"+id+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});renderState()}catch(e){$("#game-state-status").textContent=e.message}
    };
    await renderState();sessionTimer=setInterval(renderState,1200);
  };
  await gamesList();setStatus("الألعاب والجلسات جاهزة");
}



// MLD NAVIGATION POLICY
function mldNavButton(view,label,extra=""){
  return '<button type="button" data-view="'+view+'" data-admin-nav="1" '+extra+'>'+label+'</button>';
}
function rebuildMobileMenu(){
  const menu=$("#mobile-menu"); if(!menu)return;
  const role=mldUser?.role||"";
  const isAdmin=role==="admin"||role==="owner";
  const isOwner=role==="owner";
  const base=[
    ["home","الرئيسية"],["members","الأعضاء"],["top","TOP"],["roles","الرتب القيادية"],
    ["chat","الشات العام"],["private-chat","المحادثات الخاصة"],["profile","بروفايلي"],
    ["games","الألعاب"],["groups","القروبات"],["account","حسابي"],["tickets","التذاكر"],
    ["apply","التقديم"],["reviews","الآراء"]
  ];
  let html=base.map(x=>'<button type="button" data-view="'+x[0]+'">'+x[1]+'</button>').join("");
  if(!mldUser) html+='<button type="button" data-view="login">تسجيل الدخول</button>';
  if(mldUser) html+='<button type="button" data-view="logout">تسجيل الخروج</button>';
  if(isAdmin) html+='<button type="button" data-view="admin">🛡️ الإدارة</button>';
  if(isOwner) html+='<button type="button" data-view="owner">👑 لوحة الأونر</button>';
  menu.innerHTML=html+'<a id="invite-mobile" class="invite" target="_blank">انضم للسيرفر</a>';
  
}

// FINAL MLD ROUTER — single source of truth
window.change=async function(v){
  view=v;
  mobile.classList.remove("open");
  searchWrap.style.display=v==="members"?"flex":"none";
  try{
    if(v==="home"){await homeView();return}
    if(v==="members"){await refresh();return}
    if(v==="roles"){await refresh();return}
    if(v==="top"){title.textContent="لوحة TOP";subtitle.textContent="إحصائيات المجتمع والألعاب.";await renderTop(await fetch("/api/public/top").then(r=>r.json()));setStatus("TOP جاهز");return}
    if(v==="chat"){await mldChatView("public");return}
    if(v==="private-chat"){await mldChatView("private");return}
    if(v==="profile"){await mldChatProfile();return}
    if(v==="message"){await messageView();return}
    if(v==="games"){await renderGames();return}
    if(v==="groups"){await groupsReal();return}
    if(v==="account"){await mldMe();if(!mldUser)return authView();await renderAccount();return}
    if(v==="tickets"){await mldMe();await ticketView();return}
    if(v==="apply"){await applyView();return}
    if(v==="login"){authView();return}
    if(v==="logout"){await fetch("/api/auth/logout",{method:"POST"});mldUser=null;updateAuthBar();await homeView();return}
    if(v==="reviews"){await reviewsView();return}
    if(v==="logs"){await ownerLogs();return}
    if(v==="admin"){await mldMe();if(mldUser?.role==="owner")await ownerPanel();else if(mldUser?.role==="admin")await adminPanel();else authView();return}
    if(v==="owner"){await ownerPanel();return}
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
  const isAdmin=role==="admin"||role==="owner";
  const isOwner=role==="owner";
  document.querySelectorAll('[data-view="login"]').forEach(x=>x.style.display=mldUser?"none":"");
  document.querySelectorAll('[data-view="tickets"]').forEach(x=>x.style.display=isAdmin?"":"none");
  document.querySelectorAll("#logs-nav,#logs-nav-mobile").forEach(x=>x.style.display=isOwner?"":"none");
  el.innerHTML=mldUser
    ? '<div class="auth-chip">مرحبًا <b>'+esc(mldUser.username)+'</b> · Discord: <b>'+esc(mldUser.discordUsername)+'</b> · '+(isOwner?"👑 أونر":isAdmin?"🛡️ إدارة":"👤 عضو")+' <button id="logout-btn" type="button">خروج</button></div>'
    : '<div class="auth-chip">غير مسجل · <button data-view="login" type="button">تسجيل الدخول</button></div>';
  const addNav=(host,mobileMode)=>{
    if(!host)return;
    const before=host.querySelector(".invite")||null;
    if(isOwner){
      const b=document.createElement("button");b.type="button";b.dataset.adminNav="1";b.dataset.view="owner";b.textContent="👑 الأونر";host.insertBefore(b,before);
    }else if(role==="admin"){
      const b=document.createElement("button");b.type="button";b.dataset.adminNav="1";b.dataset.view="admin";b.textContent="🛡️ الإدارة";host.insertBefore(b,before);
    }
  };
  rebuildMobileMenu();
  const desktop=document.querySelector(".desktop-nav");
  if(desktop){
    desktop.querySelectorAll('[data-view="logs"],[data-view="owner"],[data-view="admin"]').forEach(x=>x.remove());
    if(isOwner){const b=document.createElement("button");b.type="button";b.dataset.view="owner";b.textContent="👑 الأونر";desktop.insertBefore(b,desktop.querySelector(".invite"))}
    else if(role==="admin"){const b=document.createElement("button");b.type="button";b.dataset.view="admin";b.textContent="🛡️ الإدارة";desktop.insertBefore(b,desktop.querySelector(".invite"))}
  }
  const out=$("#logout-btn");
  if(out)out.onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});mldUser=null;updateAuthBar();window.change("home")};
  if(mldUser?.mustChangePassword) setTimeout(()=>window.change("password"),0);
};

// GLOBAL NAV DELEGATION — one navigation path for desktop + mobile
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-view],[data-home-go]");
  if(!b)return;
  const target=b.dataset.view||b.dataset.homeGo;
  if(!target)return;
  e.preventDefault();
  e.stopPropagation();
  if(mobile)mobile.classList.remove("open");
  window.change(target);
},true);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&mobile)mobile.classList.remove("open");
});
if(mobile){
  mobile.addEventListener("click",e=>{
    const b=e.target.closest("[data-view]");
    if(!b)return;
    mobile.classList.remove("open");
  });
}

// INITIAL BOOT: never show the old static homepage before the new one is ready
document.body.classList.add("mld-booting");
Promise.race([mldMe(),new Promise(r=>setTimeout(r,1500))]).catch(()=>null).then(()=>window.change("home")).catch(()=>window.change("home"));
