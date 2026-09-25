"use strict"; const content=document.querySelector("#content"),statusBox=document.querySelector("#status"),search=document.querySelector("#search"),searchWrap=document.querySelector("#search-wrap"),modal=document.querySelector("#modal"),box=document.querySelector("#modal-content"),viewTitle=document.querySelector("#view-title");let view="members",roles=[],allMembers=[],timer,refreshTimer;const fallback="/logo.svg",esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&","<":"<",">":">",'"':""","'":"'"}[c])),num=v=>new Intl.NumberFormat("ar-SA").format(Number(v)||0),avatar=m=>m?.avatar||fallback; const status=m=>{statusBox.textContent=m};const open=()=>{modal.classList.remove("hidden");document.body.classList.add("modal-open")};const close=()=>{modal.classList.add("hidden");document.body.classList.remove("modal-open")}; function memberCard(m){return <article class="card" data-member="${esc(m.id)}"><img src="${esc(avatar(m))}" onerror="this.src='${fallback}'"><div><h3>${esc(m.name)}</h3><p>@${esc(m.username||"")}</p><div class="roles">${(m.importantRoles||[]).map(r=>${esc(r.name)}).join("")||عضو}</div></div><b>↗</b></article>} function renderMembers(list){content.className="grid";content.innerHTML=list.length?list.map(memberCard).join(""):<div class="empty"><h3>لا توجد نتائج</h3><p>جرّب اسمًا أو يوزر مختلفًا.</p></div>;document.querySelectorAll("[data-member]").forEach(x=>x.onclick=()=>openMember(x.dataset.member))} function topSection(title,list,key,label){return <section class="top-section"><h3>${title}</h3>${list.map((m,i)=>

${i+1}


${label}
${esc(m.name)}

${num(m.stats?.[key])}
).join("")||
لا توجد بيانات.

}</section>} function renderTop(d){content.className="top-grid";content.innerHTML=topSection("🏆 أكثر الرسائل",d.messages||[],"messages","رسالة")+topSection("💬 أكثر المنشنات",d.mentions||[],"mentionsReceived","منشن")+topSection("🎙️ وقت الصوت",d.voice||[],"voiceMinutes","دقيقة")+topSection("⚡ دخول صوتي",d.joins||[],"voiceJoins","دخول");document.querySelectorAll("[data-member]").forEach(x=>x.onclick=()=>openMember(x.dataset.member))} function renderRoles(){content.className="role-grid";content.innerHTML=roles.map(r=><article class="role-card" data-role="${esc(r.id)}"><div class="role-top"><i style="background:${esc(r.color)}"></i><b>${num(r.membersCount)} عضو</b></div><h3>${esc(r.name)}</h3><div class="roles">${(r.permissions||[]).slice(0,4).map(p=>${esc(p)}).join("")||صلاحيات عادية}</div><small>اضغط لعرض الأعضاء</small></article>).join("");document.querySelectorAll("[data-role]").forEach(x=>x.onclick=()=>openRole(x.dataset.role))} function perms(p){return p?.length?p.map(x=><span class="permission">${esc(x)}</span>).join(""):<span class="muted">لا توجد صلاحيات إدارية بارزة</span>} async function openMember(id){box.innerHTML="
جاري التحميل...
";open();const r=await fetch(/api/public/member/${id}),m=await r.json(),s=m.stats||{};box.innerHTML=`

ملف العضو

${esc(m.name)}

@${esc(m.username||"")}

${esc(m.rank)}
${[[
