(function(){
  setTimeout(function(){
    if(window.FAHAD_SITE_READY) return;
    console.warn("Fahad fallback boot activated");
    const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
    const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    async function api(url,opt={}){
      const o={credentials:"include",headers:{"Content-Type":"application/json"},...opt};
      if(o.body&&typeof o.body!=="string")o.body=JSON.stringify(o.body);
      const r=await fetch(url,o); let d={}; try{d=await r.json()}catch{}
      if(!r.ok) throw Error(d.error||"تعذر تنفيذ الطلب");
      return d;
    }
    function navigate(v){
      $$(".page-view").forEach(x=>x.classList.add("hidden"));
      const el=$("#"+v+"-view"); if(el) el.classList.remove("hidden");
      $$("#main-nav [data-view],#mobile-menu [data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
      $("#mobile-menu")?.classList.remove("open"); window.scrollTo(0,0);
      if(v==="home")loadHome(); if(v==="members")loadMembers();
      if(v==="groups")loadSimple("/api/groups","groups-content","groups-status","لا توجد مجموعات حالياً.");
      if(v==="games")loadSimple("/api/games","games-list",null,"لا توجد جلسات حالياً.");
      if(v==="watch")loadSimple("/api/watch","watch-content","watch-status","لا توجد غرف مشاهدة.");
    }
    async function loadHome(){
      try{
        const [s,c]=await Promise.all([api("/api/public/stats"),api("/api/public/community")]);
        $("#visit-count").textContent=s.visits??"—"; $("#website-user-count").textContent=s.websiteUsers??"—";
        $("#online-count").textContent=s.online??"—";
        $("#community-name").textContent=c.communityName||c.guild?.name||"مجتمع ملاذ";
        $("#community-sub").textContent=(c.guild?.memberCount||0)+" عضو · "+(c.online||0)+" متصل الآن";
        $("#bot-state").textContent=c.bot?.online?"BOT ONLINE":"BOT OFFLINE";
        $("#bot-state").className="badge "+(c.bot?.online?"online":"");
        $("#community-live-grid").innerHTML='<div class="live-column"><h3>الرتب النشطة</h3>'+
          (c.roles||[]).slice(0,8).map(r=>'<div class="live-stat"><b>'+esc(r.name)+'</b><span>'+r.count+' عضو</span></div>').join("")+
          '</div><div class="live-column"><h3>الأعضاء المتفاعلون</h3>'+
          (c.activeMembers||[]).slice(0,8).map(m=>'<div class="live-person"><img src="'+esc(m.avatar||"/logo.svg.JPG")+'"><div><b>'+esc(m.name||m.username)+'</b><small>@'+esc(m.username||"")+'</small></div></div>').join("")+
          '</div>';
      }catch(e){$("#community-sub").textContent="Discord غير متاح حالياً: "+e.message}
    }
    async function loadMembers(){
      const box=$("#members-content"),st=$("#members-status"); if(st)st.textContent="جاري تحميل أعضاء Discord...";
      try{
        const d=await api("/api/public/members"); const list=d.members||[];
        if(st)st.textContent=(d.totalServerMembers??list.length)+" عضو في Discord";
        box.innerHTML=list.map(m=>'<article class="member-card"><img src="'+esc(m.avatar||"/logo.svg.JPG")+'"><div><b>'+esc(m.name||m.username)+'</b><small>@'+esc(m.username||"")+'</small><span class="status-dot '+(m.status==="online"?"on":"")+'">'+(m.status==="online"?"متصل":"غير متصل")+'</span><div class="tags">'+(m.importantRoles||[]).slice(0,3).map(r=>'<i>'+esc(r.name)+'</i>').join("")+'</div></div></article>').join("")||'<div class="empty">لم يتم العثور على أعضاء.</div>';
      }catch(e){if(st)st.textContent="فشل Discord: "+e.message;box.innerHTML='<div class="empty">تعذر جلب الأعضاء من Discord.</div>'}
    }
    async function loadSimple(url,id,status,empty){
      try{const d=await api(url);const list=d.groups||d.games||d.rooms||d.watchRooms||[];const box=$("#"+id);if(!box)return;
        box.innerHTML=list.map(x=>'<article class="card"><span class="badge">'+esc(x.status||"active")+'</span><h3>'+esc(x.name||x.title||x.type||"عنصر")+'</h3><p>'+esc(x.description||x.message||x.mediaTitle||"")+'</p></article>').join("")||'<div class="empty">'+empty+'</div>';
        if(status)$("#"+status).textContent="";
      }catch(e){if(status)$("#"+status).textContent=e.message}
    }
    document.addEventListener("click",function(e){
      const v=e.target.closest("[data-view]")?.dataset.view;if(v){e.preventDefault();navigate(v);return}
      if(e.target.closest("#menu")){$("#mobile-menu")?.classList.toggle("open");return}
      if(e.target.closest("#modal-close")){$("#modal")?.classList.add("hidden");return}
      const a=e.target.closest("[data-action]")?.dataset.action;
      if(a==="logout"){api("/api/auth/logout",{method:"POST"}).finally(()=>navigate("home"));return}
      if(a==="create-group"){alert("سجل الدخول ثم استخدم إنشاء مجموعة.");navigate("login");return}
      if(a==="create-ticket"||a==="create-application"||a==="create-watch"||a==="create-review"){navigate(a==="create-review"?"reviews":a==="create-watch"?"watch":a==="create-ticket"?"tickets":"applications");return}
      const g=e.target.closest("[data-game]")?.dataset.game;if(g){navigate("login");return}
      const j=e.target.closest("[data-join-game]")?.dataset.joinGame;if(j){api("/api/games/"+j+"/join",{method:"POST"}).then(()=>navigate("games")).catch(x=>alert(x.message));return}
      const w=e.target.closest("[data-join-watch]")?.dataset.joinWatch;if(w){api("/api/watch/"+w+"/join",{method:"POST"}).then(()=>navigate("watch")).catch(x=>alert(x.message));}
    });
    $("#login-form")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/auth/login",{method:"POST",body:{username:$("#login-username").value,password:$("#login-password").value}});navigate("account")}catch(x){$("#login-status").textContent=x.message}});
    $("#register-form")?.addEventListener("submit",async e=>{e.preventDefault();try{if($("#register-password").value!==$("#register-confirm").value)throw Error("كلمتا المرور غير متطابقتين");await api("/api/auth/register",{method:"POST",body:{username:$("#register-username").value,password:$("#register-password").value}});navigate("account")}catch(x){$("#register-status").textContent=x.message}});
    navigate(location.hash.replace("#","")||"home");
  },0);
})();