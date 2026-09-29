"use strict";
let mldUser=null;
async function mldMe(){try{const r=await fetch('/api/auth/me',{cache:'no-store',credentials:'same-origin'});const d=await r.json();mldUser=d?.authenticated?d.user:null;return mldUser}catch{mldUser=null;return null}}

const $=s=>document.querySelector(s),content=$("#content"),status=$("#status"),search=$("#search"),searchWrap=$("#search-wrap"),modal=$("#modal"),box=$("#modal-content"),title=$("#view-title"),subtitle=$("#subtitle"),mobile=$("#mobile-menu"),menuButton=$("#menu");let view="members",all=[],roles=[],timer,refreshTimer,selected=null;const mldTimers={};function mldClearTimer(name){if(mldTimers[name]){clearInterval(mldTimers[name]);clearTimeout(mldTimers[name]);mldTimers[name]=null}}function mldEvery(name,fn,ms){mldClearTimer(name);mldTimers[name]=setInterval(fn,ms);return mldTimers[name]}const fallback="/logo.svg",esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),num=v=>new Intl.NumberFormat("ar-SA").format(Number(v)||0),avatar=m=>m?.avatar||fallback;
function setStatus(x){status.textContent=x}function openModal(){modal.classList.remove("hidden");document.body.classList.add("modal-open")}function closeModal(){modal.classList.add("hidden");document.body.classList.remove("modal-open")}function bind(){document.querySelectorAll("[data-member]").forEach(x=>x.onclick=()=>openMember(x.dataset.member));document.querySelectorAll("[data-role]").forEach(x=>x.onclick=()=>openRole(x.dataset.role))}
function card(m){return `<article class="card" data-member="${esc(m.id)}"><img src="${esc(avatar(m))}" onerror="this.src='${fallback}'"><div><h3>${esc(m.name)}</h3><p>@${esc(m.username||"")}</p><div class="roles">${(m.importantRoles||[]).map(r=>`<span class="role">${esc(r.name)}</span>`).join("")||`<span class="member-tag">عضو</span>`}</div></div></div><button class="member-fav" type="button" aria-label="إضافة للمفضلة" data-fav="${esc(m.id)}"></button><b>↗</b></article>`}function bindMemberFavorites(){document.querySelectorAll("[data-fav]").forEach(b=>{const id=b.dataset.fav;const key="mld-favorites";let fav=JSON.parse(localStorage.getItem(key)||"[]");const sync=()=>{fav=JSON.parse(localStorage.getItem(key)||"[]");b.textContent=fav.includes(id)?"":"";b.classList.toggle("active",fav.includes(id))};b.onclick=e=>{e.preventDefault();e.stopPropagation();fav=fav.includes(id)?fav.filter(x=>x!==id):[...fav,id];localStorage.setItem(key,JSON.stringify(fav));sync();window.mldToast?.(fav.includes(id)?"تمت الإضافة للمفضلة":"تمت الإزالة من المفضلة")};sync()})}
function renderMembers(list){content.className="grid";const rows=(list||[]);content.innerHTML=rows.length?rows.map(card).join(""):`<div class="empty"><h3>لا توجد نتائج</h3><p>جرّب البحث باسم العضو.</p></div>`;bind();bindMemberFavorites()}
function topSec(t,list,k,l){return `<section class="top-section"><h3>${t}</h3>${list.map((m,i)=>`<article class="top-card" data-member="${esc(m.id)}"><span class="rank">${i+1}</span><img src="${esc(avatar(m))}"><div><small>${l}</small><h4>${esc(m.name)}</h4><strong>${num(m.stats?.[k])}</strong></div></article>`).join("")||`<p class="muted">لا توجد بيانات بعد.</p>`}</section>`}
function renderTop(d){content.className="top-grid";const voice=(d.voice||[]).map(m=>{const min=Number(m.stats?.voiceMinutes)||0;return {...m,_hours:Math.floor(min/60),_days:Math.floor(min/1440)}});const game=(d.gameTop||[]).map((m,i)=>`<article class="top-card"><span class="rank">${i+1}</span><div><small>الإنجازات</small><h4>${esc(m.username)}</h4><strong>${num(m.wins)} فوز · ${num(m.points)} نقطة</strong></div></article>`).join("")||"<p class=\"muted\">لا توجد نتائج ألعاب بعد.</p>";const voiceCards=voice.map((m,i)=>`<article class="top-card"><span class="rank">${i+1}</span><img src="${esc(avatar(m))}"><div><small>وقت الفويس</small><h4>${esc(m.name)}</h4><strong>${num(m.stats?.voiceMinutes)} دقيقة · ${num(m._hours)} ساعة · ${num(m._days)} يوم</strong><small>دخول الفويس: ${num(m.stats?.voiceJoins)} مرة</small></div></article>`).join("")||"<p class=\"muted\">لا توجد بيانات فويس بعد.</p>";content.innerHTML=topSec("🔥 TOP الرسائل",d.messages||[],"messages","رسالة")+`<section class="top-section"><h3>🎙️ TOP الفويس</h3>${voiceCards}</section><section class="top-section"><h3>🎮 TOP الألعاب</h3>${game}</section>`;bind()}
function renderRoles(){content.className="role-grid";content.innerHTML=roles.map(r=>`<article class="role-card" data-role="${esc(r.id)}"><div class="role-top"><i style="background:${esc(r.color)}"></i><b>${num(r.membersCount)} عضو</b></div><h3>${esc(r.name)}</h3><div class="roles">${(r.permissions||[]).slice(0,4).map(p=>`<span class="permission">${esc(p)}</span>`).join("")||`<span class="muted">صلاحيات عادية</span>`}</div><small>عرض الأعضاء ↗</small></article>`).join("");bind()}
async function messageView(){await mldMe();if(!mldUser){title.textContent="رسالة خاصة";subtitle.textContent="لازم تسجل دخولك قبل الإرسال.";searchWrap.style.display="none";content.className="feature-grid";content.innerHTML='<article class="feature-card"><div class="feature-icon"></div><h3>الرسائل الخاصة</h3><p class="muted">تسجيل الدخول مطلوب قبل إرسال أي رسالة.</p><button class="primary wide" id="dm-login">تسجيل الدخول</button></article>';$("#dm-login").onclick=()=>change("login");return}title.textContent="رسالة خاصة";subtitle.textContent="أرسل رسالة خاصة لعضو من السيرفر — وتُسجل العملية في لوق الأونر.";searchWrap.style.display="none";content.className="message-page";content.innerHTML=`<div class="message-box"><div class="message-icon"></div><h3>إرسال رسالة خاصة</h3><p class="muted">اختر المستلم، ثم حدّد: إبقاء المرسل أو إخفاؤه بالكامل.</p><input id="recipient-search" class="full" placeholder="ابحث عن المستلم..."><div id="recipient-results" class="recipient-results"></div><input id="msg-title" class="full" maxlength="120" placeholder="عنوان الرسالة"><div class="sender-choice"><p class="eyebrow">ظهور المرسل</p><div class="choice-row"><label class="choice-card"><input type="radio" name="sender-mode" value="show"><span><b>إبقاء المرسل</b><small>تصل الرسالة باسم الشخص الذي يرسلها مع منشن Discord.</small></span></label><label class="choice-card"><input type="radio" name="sender-mode" value="hide"><span><b>إخفاء المرسل</b><small>تصل الرسالة من مجهول بدون اسم أو منشن.</small></span></label></div></div><textarea id="msg-text" class="full" maxlength="2000" rows="7" placeholder="اكتب الرسالة..."></textarea><p id="msg-status" class="muted"></p><button id="send" class="primary wide">إرسال الآن</button></div>`;const rs=$("#recipient-search");rs.oninput=async()=>{const q=rs.value.trim();if(!q){$("#recipient-results").innerHTML="";return}const d=await fetch(`/api/public/members?q=${encodeURIComponent(q)}&limit=8`).then(r=>r.json());$("#recipient-results").innerHTML=(d.members||[]).slice(0,8).map(m=>`<button class="recipient" data-recipient="${esc(m.id)}"><img src="${esc(avatar(m))}"><span>${esc(m.name)}<small>@${esc(m.username||"")}</small></span></button>`).join("");document.querySelectorAll("[data-recipient]").forEach(x=>x.onclick=()=>{selected={id:x.dataset.recipient,name:x.textContent};rs.value=x.textContent;$("#recipient-results").innerHTML="<b class='selected'>تم اختيار المستلم </b>"})};$("#send").onclick=sendMessage}async function sendMessage(){await mldMe();if(!mldUser)return change("login");const st=$("#msg-status"),btn=$("#send"),text=$("#msg-text").value.trim();if(!selected)return st.textContent="اختر مستلمًا أولًا";if(!text)return st.textContent="اكتب الرسالة أولًا";btn.disabled=true;try{const r=await fetch("/api/public/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId:selected.id,title:$("#msg-title").value.trim()||"رسالة من حساب MLD",message:text,senderMode:document.querySelector('input[name="sender-mode"]:checked')?.value||"hide"})}),d=await r.json();if(!r.ok)throw Error(d.error);st.textContent="تم الإرسال بنجاح  — تم تسجيل العملية في لوق الأونر";$("#msg-text").value=""}catch(e){st.textContent=e.message||"تعذر الإرسال"}finally{btn.disabled=false}}async function openMember(id){openModal();box.innerHTML="<div class='loading'>جاري التحميل...</div>";const m=await fetch(`/api/public/member/${id}`).then(r=>r.json()),s=m.stats||{};box.innerHTML=`<div class="profile"><div class="profile-head"><img src="${esc(avatar(m))}"><div><p class="eyebrow">ملف العضو</p><h2>${esc(m.name)}</h2><p class="muted">@${esc(m.username||"")}</p><span class="badge">${esc(m.rank||"عضو")}</span></div></div><div class="stats">${[[s.messages,"رسالة"],[s.mentionsReceived,"منشن جاه"],[s.mentionsSent,"منشن أرسله"],[`${Math.floor((s.voiceMinutes||0)/60)}س ${(s.voiceMinutes||0)%60}د`,"وقت صوتي"],[s.voiceJoins,"دخول صوتي"],[s.chatRounds,"نشاط شات"]].map(x=>`<b>${esc(num(x[0]))}<small>${x[1]}</small></b>`).join("")}</div><h3>كل الرتب</h3><div class="roles">${(m.roles||[]).map(x=>`<span class="role">${esc(x.name)}</span>`).join("")||`<span class="muted">لا توجد رتب</span>`}</div><h3>��قوى الصلاحيات</h3><div class="permission-box">${perms(m.permissions)}</div></div>`}
async function openRole(id){openModal();box.innerHTML="<div class='loading'>جاري تحميل الرتبة...</div>";const d=await fetch(`/api/public/roles/${id}/members`).then(r=>r.json());box.innerHTML=`<p class="eyebrow">دليل الرتبة</p><h2>${esc(d.role.name)}</h2><div class="role-meta"><b>${num(d.role.membersCount)} عضو فعلي</b></div><div class="permission-box">${perms(d.role.permissions)}</div><h3>الأعضاء</h3><div class="grid compact">${(d.members||[]).map(card).join("")||`<p class="muted">لا يوجد أعضاء بهذه الرتبة.</p>`}</div>`;bind()}
async function refresh(){try{const [sr,rr,ss]=await Promise.all([fetch("/api/public/server?live="+Date.now(),{cache:"no-store"}),fetch("/api/public/roles?live="+Date.now(),{cache:"no-store"}),fetch("/api/site/stats?live="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():({online:0,visits:0})).catch(()=>({online:0,visits:0}))]);const s=await sr.json(),rd=await rr.json();$("#server-name").textContent=s.name||"MLD";$("#server-founder").textContent=s.ownerName||"فهد المطيري";$("#server-count").textContent=num(s.memberCount);$("#server-online").textContent=num(ss.online);$("#server-visits").textContent=num(ss.visits);$("#server-status").textContent="● متصل";roles=rd.roles||[];if(s.invite){$("#invite").href=s.invite;$("#invite-mobile").href=s.invite}else{$("#invite").style.display="none";$("#invite-mobile").style.display="none"}if(view==="members"&&!search.value){const d=await fetch("/api/public/members").then(r=>r.json());all=d.members||[];renderMembers(all);setStatus(num(all.length)+" عضو متصل")}else if(view==="roles")renderRoles();else if(view==="top")renderTop(await fetch("/api/public/top").then(r=>r.json()))}catch(e){console.error(e);setStatus("تعذر تحديث البيانات مؤقتًا")}}
async function searchMembers(){clearTimeout(timer);const q=search.value.trim();if(!q){renderMembers(all);setStatus(`${num(all.length)} عضو`);return}setStatus("جاري البحث...");timer=setTimeout(async()=>{const d=await fetch(`/api/public/members?q=${encodeURIComponent(q)}`).then(r=>r.json());renderMembers(d.members||[]);setStatus(`${num((d.members||[]).length)} نتيجة`)},250)}

search.oninput=()=>{if(view!=="members")window.change("members");searchMembers()};
function closeMobileMenu(){if(!mobile)return;mobile.classList.remove("open");document.body.classList.remove("mobile-nav-open");if(menuButton){menuButton.setAttribute("aria-expanded","false");menuButton.setAttribute("aria-label","فتح قائمة الموقع");menuButton.innerHTML="<span class=\"menu-bars\" aria-hidden=\"true\"><i></i><i></i><i></i></span>"}}function toggleMobileMenu(e){if(e){e.preventDefault();e.stopPropagation()}if(!mobile||!menuButton)return;const open=!mobile.classList.contains("open");if(open){mobile.classList.add("open");document.body.classList.add("mobile-nav-open");menuButton.setAttribute("aria-label","إغلاق قائمة الموقع");menuButton.innerHTML="<span class=\"menu-close\" aria-hidden=\"true\">×</span>"}else closeMobileMenu();menuButton.setAttribute("aria-expanded",String(open))}
if(menuButton){menuButton.setAttribute("aria-expanded","false");menuButton.setAttribute("aria-label","فتح قائمة الموقع");menuButton.innerHTML="<span class=\"menu-bars\" aria-hidden=\"true\"><i></i><i></i><i></i></span>";menuButton.addEventListener("click",toggleMobileMenu);}
$("#close").onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};document.onkeydown=e=>{if(e.key==="Escape")closeModal()};const yearEl=$("#year");if(yearEl)yearEl.textContent=new Date().getFullYear();
const welcome=document.getElementById("mld-welcome");if(welcome){const hideWelcome=()=>{if(welcome.classList.contains("hide"))return;welcome.classList.add("hide");setTimeout(()=>welcome.remove(),220)};welcome.classList.remove("hide");welcome.addEventListener("click",hideWelcome);setTimeout(hideWelcome,1200);}
refreshTimer=setInterval(()=>{if(!modal.classList.contains("hidden")||view==="message")return;refresh()},3000);

// MLD Add-on: Games
async 
function gameGuestId(){try{let x=localStorage.getItem("mld-game-guest");if(!x){x="g-"+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("mld-game-guest",x)}return x}catch{return "g-"+Math.random().toString(36).slice(2)}}
function gameIdentityBody(){return {guestId:gameGuestId(),playerName:mldUser?.username||"زائر"}}
async function gameApi(url,options={}){const o={...options,headers:{"Content-Type":"application/json",...(options.headers||{})}};const r=await fetch(url,o);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"تعذر تنفيذ العملية");return d}
function gameCardLabel(card){const colors={"🔴":"أحمر","🟡":"أصفر","🟢":"أخضر","🔵":"أزرق","wild":"حر"};return [colors[card?.color]||card?.color,card?.value,card?.suit,card?.rank].filter(Boolean).join(" ")}
function gameSeats(s){return Array.from({length:Number(s.max_players)||4},(_,i)=>{const p=(s.players_list||[])[i];return '<div class="mld-seat '+(p?"occupied":"")+'"><span></span><b>'+esc(p?.username||"مقعد شاغر")+'</b></div>'}).join("")}
async function openNativeGameSession(session,mode="player"){
 const old=document.querySelector(".mld-native-game-modal");if(old)old.remove();const modalEl=document.createElement("div");modalEl.className="mld-native-game-modal";
 modalEl.innerHTML='<div class="mld-native-game-card game-room-shell"><header class="mld-native-game-head"><div><strong>'+esc(session.game_name)+'</strong><small>جلسة '+esc(session.code)+'</small></div><div class="mld-game-window-actions"><button type="button" class="mld-game-fullscreen" aria-label="تكبير اللعبة">تكبير</button><button type="button" class="mld-native-close">إغلاق</button></div></header><main class="mld-native-game-body"><div id="mld-game-live" class="mld-game-live"><div class="loading">جاري تحميل الطاولة...</div></div></main></div>';document.body.appendChild(modalEl);
 const live=modalEl.querySelector("#mld-game-live"),close=()=>{clearInterval(modalEl._poll);try{if(document.fullscreenElement===modalEl)document.exitFullscreen()}catch{}modalEl.remove()};modalEl.querySelector(".mld-native-close").onclick=close;modalEl.querySelector(".mld-game-fullscreen").onclick=async()=>{try{if(!document.fullscreenElement){await (modalEl.requestFullscreen?.()||modalEl.querySelector(".mld-native-game-card")?.requestFullscreen?.())}else await document.exitFullscreen()}catch{modalEl.classList.toggle("mld-game-maximized")}};
 const act=async(action,data={})=>{try{const d=await gameApi("/api/games/sessions/"+encodeURIComponent(session.code)+"/action",{method:"POST",body:JSON.stringify({action,data,...gameIdentityBody()})});draw(d.state,d.session)}catch(e){alert(e.message)}};
 const draw=(state,s)=>{
  const players=s.players_list||[],mine=mldUser&&players.some(p=>String(p.username).toLowerCase()===String(mldUser.username).toLowerCase()),turnName=players[Number(state?.turnIndex)||0]?.username||"";
  if(!state){live.innerHTML='<section class="mld-game-table-native game-table-stage"><div class="mld-table-top"><span>اللاعبون: '+players.length+'/'+s.max_players+'</span><span>المشاهدون: '+num(s.spectators)+'</span></div><div class="mld-seats-grid">'+gameSeats(s)+'</div><div class="mld-native-board felt-board"><div class="mld-native-board-title">'+esc(s.game_name)+'</div><p>بانتظار اكتمال المقاعد ثم بدء اللعبة.</p>'+(mldUser&&String(s.owner_username).toLowerCase()===String(mldUser.username).toLowerCase()?'<button id="mld-start-game" class="primary">بدء اللعبة</button>':"")+'</div></section>';live.querySelector("#mld-start-game")?.addEventListener("click",async()=>{try{const d=await gameApi("/api/games/sessions/"+encodeURIComponent(s.code)+"/start",{method:"POST",body:"{}"});draw(d.state,d.session)}catch(e){alert(e.message)}});return}
  const p=state.private||{};let controls="",info='<div class="mld-board-info"><b>الدور: '+esc(turnName)+'</b><span>الحالة: '+esc(state.phase)+'</span></div>';
  if(state.game==="UNO"){controls='<button class="primary" data-act="draw">سحب</button>'+(p.hand||[]).map((c,i)=>'<button class="mld-game-card-btn" data-uno="'+i+'">'+esc(gameCardLabel(c))+'</button>').join("")}
  else if(state.game==="LUDO"){controls='<button class="primary" data-act="roll" '+(turnName&&mldUser&&turnName!==mldUser.username?"disabled":"")+'>'+((state.awaitingMove)?"اختر قطعة":"رمي النرد")+'</button>'+(p.tokens||[]).map((v,i)=>'<button class="mld-token-btn" data-token="'+i+'" '+((state.legalTokens||[]).includes(i)?"":"disabled")+'>قطعة '+(i+1)+'<small>'+esc(v)+'</small></button>').join("");info+='<span>النرد: '+esc(state.dice??"-")+'</span>'}
  else if(state.game==="JAKAROO"){controls=(p.hand||[]).map((c,i)=>'<button class="mld-game-card-btn" data-jack="'+i+'">'+esc(gameCardLabel(c))+'</button>').join("")+(p.tokens||[]).map((v,i)=>'<button class="mld-token-btn" data-token="'+i+'" '+((state.moveOptions||[]).includes(i)?"":"disabled")+'>قطعة '+(i+1)+'<small>'+esc(v)+'</small></button>').join("")}
  else if(state.game==="BALOOT"){controls=state.phase==="bidding"?'<button class="primary" data-bid="sun">صن</button><button class="ghost" data-bid="hokum">حكم</button><button class="ghost" data-bid="pass">بس</button>':(p.hand||[]).map((c,i)=>'<button class="mld-game-card-btn" data-baloot="'+i+'" '+((state.legalIndices||[]).includes(i)?"":"disabled")+'>'+esc(gameCardLabel(c))+'</button>').join("")}
  else{controls='<span class="muted">حالة اللعبة: '+esc(state.phase)+'</span>'}
  live.innerHTML='<section class="mld-game-table-native"><div class="mld-table-top"><span>اللاعبون: '+players.length+'/'+s.max_players+'</span><span>المشاهدون: '+num(s.spectators)+'</span><span>'+esc(s.status)+'</span></div><div class="mld-seats-grid">'+gameSeats(s)+'</div><div class="mld-native-board"><div class="mld-native-board-title">'+esc(s.game_name)+'</div>'+info+'<div class="mld-game-controls '+(mine?"":"is-spectator")+'">'+(mine?controls:'<span class="muted">وضع مشاهدة</span>')+'</div></div></section>';
  if(!mine)return;live.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>act(b.dataset.act));live.querySelectorAll("[data-token]").forEach(b=>b.onclick=()=>act("moveToken",{token:Number(b.dataset.token)}));live.querySelectorAll("[data-uno]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.uno),card=(state.hand||[])[i];if(card?.color==="wild"){const v=prompt("اختر اللون: أحمر أو أصفر أو أخضر أو أزرق")||"";const colors={"أحمر":"🔴","أصفر":"🟡","أخضر":"🟢","أزرق":"🔵"};if(!colors[v])return;return act("playCard",{index:i,color:colors[v]})}act("playCard",{index:i})});live.querySelectorAll("[data-jack]").forEach(b=>b.onclick=()=>act("playCard",{index:Number(b.dataset.jack)}));live.querySelectorAll("[data-baloot]").forEach(b=>b.onclick=()=>act("playCard",{index:Number(b.dataset.baloot)}));live.querySelectorAll("[data-bid]").forEach(b=>b.onclick=()=>act("bid",{bid:b.dataset.bid}));
 };
 const poll=async()=>{try{const d=await gameApi("/api/games/sessions/"+encodeURIComponent(session.code)+"/state?"+new URLSearchParams(gameIdentityBody()).toString());draw(d.state,d.session);if(d.session.status==="ended")clearInterval(modalEl._poll)}catch(e){live.innerHTML='<section class="mld-native-board"><p class="muted">'+esc(e.message)+'</p></section>'}};modalEl._poll=setInterval(poll,1200);await poll();
}
async function renderGames(){
 searchWrap.style.display="none";title.textContent="صالات الألعاب";subtitle.textContent="ألعاب جماعية حقيقية داخل طاولات ملاذ.";content.className="games-hub";await mldMe();
 const games=[{id:"uno",name:"UNO",max:6},{id:"baloot",name:"بلوت",max:4},{id:"jackaroo",name:"جاكارو",max:4},{id:"ludo",name:"لودو",max:4},{id:"qawsar",name:"قوسر",max:6}],map=Object.fromEntries(games.map(g=>[g.id,g]));let sessions=[];
 const load=async()=>{try{sessions=(await fetch("/api/games/sessions?live="+Date.now(),{cache:"no-store"}).then(r=>r.json())).sessions||[]}catch{sessions=[]}};await load();
 content.innerHTML='<section class="games-hero-card"><div><span class="pill">MLD GAMES</span><h2>مجلس الألعاب</h2><p>اللعب يتم داخل ملاذ بدون نقل المستخدم إلى موقع آخر.</p></div></section><section class="games-create-card"><h3>إنشاء جلسة</h3><div class="games-picker">'+games.map(g=>'<button class="game-choice" data-game-choice="'+g.id+'"><b>'+esc(g.name)+'</b><small>'+g.max+' مقاعد كحد أقصى</small></button>').join("")+'</div><div class="games-create-row"><select id="game-max" class="full"><option value="2">2 لاعبين</option><option value="4" selected>4 لاعبين</option><option value="6">6 لاعبين</option></select><button id="game-create" class="primary">إنشاء الجلسة</button><span id="game-create-status" class="muted"></span></div></section><section class="games-sessions-card"><div class="section-heading"><h3>الجلسات</h3><button id="games-refresh" class="ghost">تحديث</button></div><div id="games-session-list" class="games-session-list"></div></section>';
 let selected="uno";
 const renderSessions=()=>{const list=$("#games-session-list");if(!list)return;list.innerHTML=sessions.length?sessions.map(s=>{const own=mldUser&&String(s.owner_username).toLowerCase()===String(mldUser.username).toLowerCase();return '<article class="game-session-row"><div class="game-session-main"><b>'+esc(map[s.game_id]?.name||s.game_name)+'</b><small>بواسطة @'+esc(s.owner_username)+' · '+num(s.players)+'/'+num(s.max_players)+' لاعبين · '+num(s.spectators)+' مشاهدين</small></div><code>'+esc(s.code)+'</code><div class="game-session-actions">'+(s.status==="open"?'<button class="primary game-join" data-code="'+esc(s.code)+'">'+(own?"فتح":"انضم")+'</button>':'<button class="primary game-open" data-code="'+esc(s.code)+'">فتح</button>')+(s.status==="playing"&&!own?'<button class="ghost game-watch" data-code="'+esc(s.code)+'">مشاهدة</button>':"")+'</div></article>'}).join(""):'<div class="games-empty">لا توجد جلسات حاليًا.</div>';
  list.querySelectorAll(".game-join").forEach(b=>b.onclick=async()=>{const s=sessions.find(x=>x.code===b.dataset.code);if(!s)return;try{if(!(mldUser&&String(s.owner_username).toLowerCase()===String(mldUser.username).toLowerCase())){const d=await gameApi("/api/games/sessions/"+encodeURIComponent(s.code)+"/join",{method:"POST",body:JSON.stringify(gameIdentityBody())});Object.assign(s,d.session)}openNativeGameSession(s,"player")}catch(e){alert(e.message)}});
  list.querySelectorAll(".game-open").forEach(b=>b.onclick=()=>{const s=sessions.find(x=>x.code===b.dataset.code);if(s)openNativeGameSession(s,"player")});
  list.querySelectorAll(".game-watch").forEach(b=>b.onclick=async()=>{const s=sessions.find(x=>x.code===b.dataset.code);if(!s)return;try{const d=await gameApi("/api/games/sessions/"+encodeURIComponent(s.code)+"/spectate",{method:"POST",body:JSON.stringify(gameIdentityBody())});openNativeGameSession(d.session,"spectator")}catch(e){alert(e.message)}});
 };
 document.querySelectorAll("[data-game-choice]").forEach(b=>b.onclick=()=>{selected=b.dataset.game;document.querySelectorAll("[data-game-choice]").forEach(x=>x.classList.toggle("selected",x.dataset.game===selected))});
 $("#game-create").onclick=async()=>{await mldMe();if(!mldUser)return authView();const g=map[selected],max=Math.min(g.max,Number($("#game-max").value)||g.max);try{const d=await gameApi("/api/games/sessions",{method:"POST",body:JSON.stringify({gameId:g.id,gameName:g.name,maxPlayers:max,...gameIdentityBody()})});$("#game-create-status").textContent="تم إنشاء الجلسة "+d.session.code;sessions=[d.session,...sessions];renderSessions();openNativeGameSession(d.session,"player")}catch(e){$("#game-create-status").textContent=e.message}};
 $("#games-refresh").onclick=async()=>{await load();renderSessions()};renderSessions();setStatus("صالات الألعاب جاهزة");mldEvery("games",async()=>{if(!document.hidden && view==="games"){await load();renderSessions()}},1000);
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
  const isAdmin=role==="admin"||role==="owner";
  const isOwner=role==="owner";
  const group=(name,items,open=false)=>{
    return '<section class="mobile-menu-folder '+(open?"is-open":"")+'">'+
      '<button type="button" class="mobile-menu-folder-head" aria-expanded="'+(open?"true":"false")+'">'+
      '<span class="folder-icon" aria-hidden="true"></span><span class="folder-name">'+name+'</span><span class="folder-count">'+items.length+'</span><span class="mobile-menu-chevron">⌄</span></button>'+
      '<div class="mobile-menu-folder-body"><div class="mobile-menu-folder-items">'+
      items.map(x=>'<button type="button" class="mobile-menu-item" data-view="'+x[0]+'"><span class="menu-item-icon"></span><span>'+x[1]+'</span><span class="menu-item-arrow">‹</span></button>').join("")+
      '</div></div></section>';
  };
  let html='';
  html+='<button type="button" class="mobile-menu-home" data-view="home"><span class="folder-icon"></span><span>الرئيسية</span><span class="menu-item-arrow">‹</span></button>';
  html+=group("المجتمع",[["members","الأعضاء"],["top","TOP"],["roles","الرتب القيادية"],["groups","القروبات"],["reviews","الآراء"]],true);
  html+=group("التواصل",[["chat","الشات العام"],["private-chat","المحادثات الخاصة"],["message","رسالة خاصة"],["anonymous","الفضفضة"],["tickets","التذاكر"]]);
  html+=group("الألعاب",[["games","صالات الألعاب"],["jokes","النكت"],["stories","القصص والصوت"],["game-logs","لوق الألعاب"]]);
  html+=group("الحساب",[["profile","بروفايلي"],["account","حسابي"],["apply","التقديم"]]);
  if(isAdmin) html+=group("الإدارة",[["admin","لوحة الإدارة"]]);
  if(isOwner) html+=group("الأونر",[["owner","مركز الأونر"],["broadcast","برودكاست السيرفر"]]);
  html+=mldUser?'<button type="button" class="mobile-menu-auth mobile-menu-logout" data-view="logout"><span class="folder-icon"></span><span>تسجيل الخروج</span><span class="menu-item-arrow">‹</span></button>':'<button type="button" class="mobile-menu-auth" data-view="login"><span class="folder-icon"></span><span>تسجيل الدخول</span><span class="menu-item-arrow">‹</span></button>';
  menu.innerHTML=html+'<a id="invite-mobile" class="invite mobile-menu-invite" target="_blank">انضم للسيرفر</a>';
  menu.querySelectorAll(".mobile-menu-folder-head").forEach(b=>b.onclick=(e)=>{
    e.preventDefault();e.stopPropagation();
    const folder=b.closest(".mobile-menu-folder");if(!folder)return;
    const open=folder.classList.toggle("is-open");b.setAttribute("aria-expanded",open?"true":"false");
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

// Restored public route handlers used by the final router.
async function mldChatView(mode="public"){
  title.textContent=mode==="private"?"المحادثات الخاصة":"الشات";
  subtitle.textContent=mode==="private"?"رسائلك الخاصة ومحادثاتك.":"شات المجتمع المباشر.";
  searchWrap.style.display="none"; content.className="feature-grid";
  const endpoint=mode==="private"?"/api/chat/private":"/api/chat";
  try{
    const r=await fetch(endpoint,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw Error(d.error||"تعذر تحميل الشات");
    const items=Array.isArray(d.messages)?d.messages:Array.isArray(d.items)?d.items:[];
    content.innerHTML="<section class='feature-card'><h3>💬 "+(mode==="private"?"المحادثات الخاصة":"شات المجتمع")+"</h3><div class='joke-list'>"+(items.slice(-50).map(x=>"<article class='joke-item'><p>"+esc(x.body||x.message||x.text||"")+"</p><small>"+esc(x.username||x.author||"عضو")+"</small></article>").join("")||"<p class='muted'>لا توجد رسائل بعد.</p>")+"</div></section>";
    setStatus("الشات جاهز");
  }catch(e){
    content.innerHTML="<section class='feature-card'><h3>💬 الشات</h3><p class='muted'>واجهة الشات جاهزة، ولا توجد رسائل قابلة للعرض حاليًا.</p></section>";
    setStatus("الشات جاهز");
  }
}
async function mldChatProfile(){title.textContent="بروفايلي";subtitle.textContent="بيانات حسابك ونشاطك.";searchWrap.style.display="none";content.className="feature-grid";await mldMe();content.innerHTML="<section class='feature-card'><h3>👤 بروفايلي</h3><p class='muted'>"+(mldUser?"مرحبًا "+esc(mldUser.username):"سجل دخولك لعرض ملفك")+"</p></section>";setStatus("البروفايل جاهز")}
async function groupsReal(){title.textContent="القروبات";subtitle.textContent="مجتمع ملاذ والقروبات المتاحة.";searchWrap.style.display="none";content.className="feature-grid";try{const r=await fetch("/api/groups",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error();const items=d.groups||d.items||[];content.innerHTML="<section class='feature-card'><h3>👥 القروبات</h3>"+(items.map(g=>"<article class='joke-item'><b>"+esc(g.name||g.title||"قروب")+"</b><p>"+esc(g.description||"")+"</p></article>").join("")||"<p class='muted'>لا توجد قروبات متاحة حاليًا.</p>")+"</section>"}catch{content.innerHTML="<section class='feature-card'><h3>👥 القروبات</h3><p class='muted'>لا توجد قروبات متاحة حاليًا.</p></section>"}setStatus("القروبات جاهزة")}
async function reviewsView(){title.textContent="الآراء";subtitle.textContent="آراء أعضاء المجتمع.";searchWrap.style.display="none";content.className="feature-grid";try{const r=await fetch("/api/reviews",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error();const items=d.reviews||d.items||[];content.innerHTML="<section class='feature-card'><h3>⭐ آراء المجتمع</h3>"+(items.map(x=>"<article class='joke-item'><p>"+esc(x.body||x.text||x.review||"")+"</p><small>"+esc(x.author||x.username||"عضو")+"</small></article>").join("")||"<p class='muted'>لا توجد آراء بعد.</p>")+"</section>"}catch{content.innerHTML="<section class='feature-card'><h3>⭐ آراء المجتمع</h3><p class='muted'>لا توجد آراء بعد.</p></section>"}setStatus("الآراء جاهزة")}

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
window.addEventListener("error",e=>{
  console.error("MLD client error",e.error||e.message);
});
window.addEventListener("unhandledrejection",e=>{
  console.error("MLD unhandled rejection",e.reason);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&mobile)closeMobileMenu();
});


// INITIAL BOOT: never show the old static homepage before the new one is ready
document.body.classList.add("mld-booting");
Promise.race([mldMe(),new Promise(r=>setTimeout(r,700))]).catch(()=>null).then(()=>window.change("home")).catch(()=>window.change("home"));


/* MLD 2026 hardening: restored home route, real-time chat UI, game bridge. */
async function homeView(){mldClearTimer("homeReviews");mldClearTimer("homeStats");
  await mldMe();
  title.textContent="الرئيسية";
  subtitle.textContent="لوحة ملاذ الحية — وتقييمات المجتمع تتحدث تلقائيًا.";
  searchWrap.style.display="none";
  content.className="home-dashboard";
  try{
    const data=await Promise.all([
      fetch("/api/public/server?live="+Date.now(),{cache:"no-store"}).then(x=>x.json()),
      fetch("/api/reviews?live="+Date.now(),{cache:"no-store"}).then(x=>x.ok?x.json():({reviews:[]})).catch(()=>({reviews:[]})),
      fetch("/api/site/stats?live="+Date.now(),{cache:"no-store"}).then(x=>x.ok?x.json():({online:0,visits:0})).catch(()=>({online:0,visits:0}))
    ]);
    const s=data[0],reviews=data[1]?.reviews||[],stats=data[2];
    const allReviews=reviews.length?reviews:[{id:"demo-1",username:"زائر ملاذ",rating:5,message:"موقع مرتب وسهل الاستخدام، والتجربة جميلة."},{id:"demo-2",username:"عضو في السيرفر",rating:5,message:"الألعاب والشات في مكان واحد، شيء ممتاز."},{id:"demo-3",username:"مجتمع ملاذ",rating:4,message:"واجهة جميلة وسريعة، وأتمنى إضافة ألعاب أكثر."}];
    let reviewOffset=0;
    const renderReviews=()=>{
      const shown=Array.from({length:Math.min(3,allReviews.length)},(_,i)=>allReviews[(reviewOffset+i)%allReviews.length]);
      const cards=shown.map(r=>{
        const rating=Math.max(1,Math.min(5,Number(r.rating)||5));
        return "<article class='home-review-card'><div class='home-review-top'><div class='home-review-avatar'>"+esc((r.username||"زائر").trim().charAt(0)||"ز")+"</div><div><b>"+esc(r.username||"زائر")+"</b><div class='home-review-stars' aria-label='"+rating+" من 5'>"+("★".repeat(rating)+"☆".repeat(5-rating))+"</div></div></div><p>"+esc(r.message||"")+"</p></article>";
      }).join("");
      const count=Math.min(3,allReviews.length);
      const indicators=Array.from({length:count},(_,i)=>"<span class='home-review-dot "+(i===0?"active":"")+"'></span>").join("");
      const wrap=$("#home-reviews");
      if(wrap)wrap.innerHTML="<div class='home-reviews-grid'>"+cards+"</div><div class='home-reviews-footer'><span>تقييمات من مجتمع ملاذ</span><span class='home-review-dots'>"+indicators+"</span><button type='button' class='games-secondary' data-view='reviews'>إضافة تقييم</button></div>";
    };
    content.innerHTML=
      "<section class='home-live-card'><span class='pill'>● LIVE</span><h2>"+esc(s.name||"MLD")+"</h2><p>السيرفر متصل · آخر مزامنة "+new Date().toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+"</p><div class='home-stats'><b>"+num(s.memberCount)+"<small>عضو</small></b><b>"+num(stats.online)+"<small>متصل الآن</small></b><b>"+num(stats.visits)+"<small>زيارة</small></b></div></section>"+
      "<section class='feature-card home-reviews-section'><div class='home-section-head'><div><span class='eyebrow'>آراء المجتمع</span><h3>⭐ تقييمات الناس عن ملاذ</h3><p class='muted'>تتحدث تلقائيًا كل 5 ثوانٍ بشكل مرتب.</p></div></div><div id='home-reviews'></div></section>"+
      "<section class='feature-card'><h3>⚡ وصول سريع</h3><div class='home-actions'><button type='button' class='primary' data-view='top'>TOP</button><button type='button' class='games-secondary' data-view='chat'>الشات العام</button><button type='button' class='games-secondary' data-view='games'>الألعاب</button><button type='button' class='games-secondary' data-view='roles'>الرتب</button><button type='button' class='games-secondary' data-view='groups'>القروبات</button><button type='button' class='games-secondary' data-view='reviews'>كل التقييمات</button></div></section>"+
      "<div class='home-rights'>© 2026 ملاذ — جميع الحقوق محفوظة · حقوق السيرفر: ملاذ · المؤسس والمالك: فهد المطيري</div>";
    renderReviews();
    if(allReviews.length>3){
      mldEvery("homeReviews",()=>{
        reviewOffset=(reviewOffset+3)%allReviews.length;
        renderReviews();
      },5000);
    }
    mldEvery("homeStats",async()=>{
      if(document.hidden||view!=="home")return;
      try{
        const r=await fetch("/api/site/stats?live="+Date.now(),{cache:"no-store"});
        if(!r.ok)return;
        const st=await r.json();
        const cards=document.querySelectorAll(".home-stats b");
        if(cards[1])cards[1].childNodes[0].nodeValue=num(st.online);
        if(cards[2])cards[2].childNodes[0].nodeValue=num(st.visits);
        const sync=document.querySelector(".home-live-card p");
        if(sync)sync.textContent="السيرفر متصل · آخر مزامنة "+new Date().toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
        const online=$("#server-online"),visits=$("#server-visits");
        if(online)online.textContent=num(st.online);
        if(visits)visits.textContent=num(st.visits);
      }catch(e){console.debug("live stats",e)}
    },1000);
    bind();
    setStatus("بيانات ملاذ وتقييماته محدثة");
  }catch(e){
    console.error("homeView",e);
    content.innerHTML="<section class='feature-card'><h3>الرئيسية</h3><p class='muted'>جاري إعادة مزامنة بيانات السيرفر…</p><button type='button' class='primary' data-view='reviews'>عرض التقييمات</button></section>";
    setStatus("تعذر تحديث البيانات مؤقتًا");
  }
}

async function mldChatView(mode="public"){
  await mldMe();
  if(!mldUser)return authView();
  title.textContent=mode==="private"?"المحادثات الخاصة":"الشات العام";
  subtitle.textContent=mode==="private"?"خاص وقروبات: إنشاء، إضافة، طرد، وحظر.":"محادثة جماعية مفتوحة لكل شخص مسجل دخول.";
  searchWrap.style.display="none";
  content.className="chat-app";
  let activeConversation=null;
  const safe=v=>esc(String(v||""));
  const memberSearch=async q=>{
    if(!q)return [];
    const d=await fetch("/api/public/members?q="+encodeURIComponent(q)+"&limit=12",{cache:"no-store"}).then(r=>r.json()).catch(()=>({members:[]}));
    return d.members||[];
  };
  const publicMessages=async()=>{
    const d=await fetch("/api/chat/public?limit=70&"+Date.now(),{cache:"no-store"}).then(r=>r.json());
    return d.messages||[];
  };
  const renderPublic=async()=>{
    const msgs=await publicMessages();
    return "<div class='chat-messages'>"+(msgs.map(m=>"<article class='chat-msg'><img src='"+safe(avatar(m))+"' onerror=\"this.src='/logo.svg'\"><div class='chat-msg-body'><div class='chat-msg-head'><b>"+safe(m.displayName||m.sender)+"</b><small>"+new Date(m.createdAt).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})+"</small></div><p>"+safe(m.body)+"</p><div class='chat-msg-actions'><button type='button' data-chat-block='"+safe(m.sender)+"'>حظر</button>"+(m.sender===mldUser.username||mldUser.role==="owner"?"<button type='button' data-chat-delete='"+m.id+"'>حذف</button>":"")+"</div></div></article>").join("")||"<div class='chat-empty'>لا توجد رسائل بعد. ابدأ المحادثة.</div>")+"</div>";
  };
  const renderConversationList=async()=>{
    const d=await fetch("/api/chat/conversations?"+Date.now(),{cache:"no-store"}).then(r=>r.json()).catch(()=>({conversations:[]}));
    const rows=d.conversations||[];
    return "<div class='chat-conversations'>"+(rows.map(x=>"<button type='button' class='chat-conversation "+(Number(x.id)===activeConversation?"active":"")+"' data-conv-open='"+x.id+"'><b>"+safe(x.title||"محادثة")+"</b><small>"+safe(x.last_message||"لا توجد رسائل")+" · "+num(x.unread)+" جديدة</small></button>").join("")||"<p class='muted'>لا توجد محادثات خاصة حتى الآن.</p>")+"</div>";
  };
  const renderConversation=async id=>{
    activeConversation=Number(id);
    const data=await Promise.all([
      fetch("/api/chat/conversations/"+id+"/messages?limit=80&"+Date.now(),{cache:"no-store"}).then(r=>r.json()),
      fetch("/api/chat/conversations/"+id+"/participants",{cache:"no-store"}).then(r=>r.json())
    ]);
    const msgs=data[0].messages||[],parts=data[1].participants||[];
    const owner=parts.find(p=>p.isOwner);
    return "<div class='chat-private-head'><div><b>"+safe(owner?.display_name||"المحادثة")+"</b><small>"+parts.length+" أعضاء</small></div><button type='button' class='games-secondary' data-chat-back>رجوع</button></div>"+
      "<div class='chat-members'>"+parts.map(p=>"<span><b>"+safe(p.display_name||p.username)+"</b>"+(p.isOwner?" 👑":"")+(p.username!==mldUser.username&&!p.isOwner?" <button type='button' data-chat-group-remove='"+safe(p.username)+"'>طرد</button>":"")+(p.username!==mldUser.username?" <button type='button' data-chat-block='"+safe(p.username)+"'>حظر</button>":"")+"</span>").join("")+"</div>"+
      "<div class='chat-messages'>"+(msgs.map(m=>"<article class='chat-msg'><img src='"+safe(avatar(m))+"' onerror=\"this.src='/logo.svg'\"><div class='chat-msg-body'><div class='chat-msg-head'><b>"+safe(m.displayName||m.sender)+"</b><small>"+new Date(m.createdAt).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})+"</small></div><p>"+safe(m.body)+"</p></div></article>").join("")||"<div class='chat-empty'>ابدأ المحادثة.</div>")+"</div>"+
      "<form class='chat-compose' id='private-compose'><input id='private-text' maxlength='2000' autocomplete='off' placeholder='اكتب رسالتك...'><button class='primary'>إرسال</button></form>";
  };
  const bind=()=>{
    document.querySelectorAll("[data-chat-block]").forEach(b=>b.onclick=async()=>{
      const u=b.dataset.chatBlock;
      if(!confirm("حظر @"+u+"؟"))return;
      const r=await fetch("/api/chat/blocks/"+encodeURIComponent(u),{method:"POST"});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)return alert(d.error||"تعذر الحظر");
      if(mode==="private"&&activeConversation){const pane=$("#chat-pane");if(pane){pane.innerHTML=await renderConversation(activeConversation);bind()}}
      else render();
    });
    document.querySelectorAll("[data-chat-delete]").forEach(b=>b.onclick=async()=>{const r=await fetch("/api/chat/public/"+b.dataset.chatDelete,{method:"DELETE"});if(r.ok)render()});
    document.querySelectorAll("[data-conv-open]").forEach(b=>b.onclick=async()=>{const pane=$("#chat-pane");if(pane){pane.innerHTML=await renderConversation(b.dataset.convOpen);bind()}});
    document.querySelectorAll("[data-chat-back]").forEach(b=>b.onclick=render);
    document.querySelectorAll("[data-chat-group-remove]").forEach(b=>b.onclick=async()=>{const r=await fetch("/api/chat/conversations/"+activeConversation+"/participants/"+encodeURIComponent(b.dataset.chatGroupRemove),{method:"DELETE"});const d=await r.json().catch(()=>({}));if(!r.ok)return alert(d.error||"تعذر الطرد");const pane=$("#chat-pane");if(pane){pane.innerHTML=await renderConversation(activeConversation);bind()}});
    document.querySelectorAll("[data-chat-new]").forEach(b=>b.onclick=showNewChat);
    $("#public-compose")?.addEventListener("submit",async e=>{e.preventDefault();const i=$("#public-text"),body=i.value.trim();if(!body)return;const r=await fetch("/api/chat/public",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})});const d=await r.json().catch(()=>({}));if(!r.ok)return alert(d.error||"تعذر الإرسال");i.value="";render()});
    $("#private-compose")?.addEventListener("submit",async e=>{e.preventDefault();const i=$("#private-text"),body=i.value.trim();if(!body)return;const r=await fetch("/api/chat/conversations/"+activeConversation+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body})});const d=await r.json().catch(()=>({}));if(!r.ok)return alert(d.error||"تعذر الإرسال");i.value="";const pane=$("#chat-pane");if(pane){pane.innerHTML=await renderConversation(activeConversation);bind()}});
  };
  const showNewChat=async()=>{
    const pane=$("#chat-pane");if(!pane)return;
    pane.innerHTML="<section class='chat-new'><h3>＋ شات خاص / قروب</h3><p class='muted'>حدد شخصًا واحدًا للخاص أو أكثر لإنشاء قروب.</p><input id='chat-member-search' class='full' placeholder='ابحث باليوزر أو الاسم...'><div id='chat-member-results'></div><input id='chat-group-title' class='full' placeholder='اسم القروب (اختياري)'><button id='chat-create' type='button' class='primary wide'>إنشاء</button><button id='chat-new-back' type='button' class='games-secondary wide'>رجوع</button></section>";
    const input=$("#chat-member-search");
    input.oninput=async()=>{const rows=await memberSearch(input.value.trim());$("#chat-member-results").innerHTML=rows.map(m=>"<label class='chat-pick'><input type='checkbox' value='"+safe(m.username)+"'><img src='"+safe(avatar(m))+"' onerror=\"this.src='/logo.svg'\"><span>"+safe(m.name)+" <small>@"+safe(m.username)+"</small></span></label>").join("")||"<p class='muted'>لا توجد نتائج.</p>"};
    $("#chat-create").onclick=async()=>{
      const picked=[...document.querySelectorAll("#chat-member-results input:checked")].map(x=>x.value);
      if(!picked.length)return alert("اختر شخصًا واحدًا على الأقل");
      const r=await fetch("/api/chat/conversations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({participants:picked,title:$("#chat-group-title").value.trim()})});
      const d=await r.json();if(!r.ok)return alert(d.error||"تعذر إنشاء المحادثة");
      activeConversation=d.conversation.id;await render();
      const pane=$("#chat-pane");if(pane){pane.innerHTML=await renderConversation(activeConversation);bind()}
    };
    $("#chat-new-back").onclick=render;
  };
  const render=async()=>{
    if(mode==="private"){
      content.innerHTML="<section class='chat-card chat-watermark'><div class='chat-tabs'><button type='button' class='primary' data-chat-new>＋ خاص / قروب جديد</button></div><div id='chat-pane'>"+await renderConversationList()+"</div><div class='chat-rights'>© 2026 ملاذ — جميع الحقوق محفوظة · حقوق السيرفر: ملاذ</div></section>";
    }else{
      content.innerHTML="<section class='chat-card chat-watermark'><div class='chat-toolbar'><div><h3>💬 الشات العام</h3><p>مفتوح لكل حساب مسجل دخول.</p></div><button type='button' class='games-secondary' data-chat-private>💌 خاص / قروب</button></div>"+await renderPublic()+"<form class='chat-compose' id='public-compose'><input id='public-text' maxlength='2000' autocomplete='off' placeholder='اكتب رسالتك للجميع...'><button class='primary'>إرسال</button></form><div class='chat-rights'>© 2026 ملاذ — جميع الحقوق محفوظة · حقوق السيرفر: ملاذ</div></section>";
      document.querySelectorAll("[data-chat-private]").forEach(b=>b.onclick=()=>change("private-chat"));
    }
    bind();
  };
  await render();
  mldEvery("chat",async()=>{
    if(!document.hidden&&mode==="public"&&!activeConversation&&view==="chat")await render();
  },1000);
  setStatus("الشات جاهز — تحديث تلقائي كل ثانية");
}
