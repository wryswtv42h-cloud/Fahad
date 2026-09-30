"use strict";
(function(){
  function $(s){return document.querySelector(s);}
  var panel=$("#platform");
  if(!panel)return;
  function token(){return localStorage.getItem("mld_token")||"";}
  function esc(v){return String(v==null?"":v).replace(/[&<>\"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
  function api(url,opt){opt=opt||{};opt.headers=Object.assign({"Content-Type":"application/json"},opt.headers||{});if(token())opt.headers.Authorization="Bearer "+token();return fetch(url,opt).then(function(r){return r.json().then(function(d){if(!r.ok)throw Error(d.error||"حدث خطأ");return d;});});}
  function show(title,body){panel.className=panel.className.replace(/\bhidden\b/g,"").trim();$("#directory").className+=" hidden";$("#view-title").textContent=title;$("#subtitle").textContent="منصة MLD";panel.innerHTML=body;}
  function login(){if(token())return true;alert("سجّل دخولك من قسم الحساب أولًا");return false;}
  function nav(){var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim();}
  function bots(){
    if(!login())return;
    function statusText(s){return s==="online"?"● يعمل":s==="starting"?"◌ جاري التشغيل":s==="error"?"⚠ خطأ":"○ متوقف";}
    function load(){
      Promise.all([api("/api/platform/bot-catalog"),api("/api/platform/discord/status")]).then(function(x){
        var d=x[0],ds=x[1],linked=ds.linked;
        var cards=(d.bots||[]).map(function(b){
          return "<article class='game-card bot-manager-card'><div class='game-icon'>🤖</div><h3>"+esc(b.name)+"</h3><p>"+esc(b.botUsername||"بوت Discord")+"</p><span class='platform-chip "+(b.status==="online"?"online":"")+"'>"+statusText(b.status)+"</span><p class='small'>"+esc(b.guildName||"السيرفر غير محدد")+"</p>"+(b.lastError?"<p class='small danger-link'>"+esc(b.lastError)+"</p>":"")+"<div class='bot-actions'><button class='primary' data-openbot='"+b.id+"'>لوحة التحكم</button><button class='platform-link' data-stopbot='"+b.id+"'>"+(b.status==="online"?"إيقاف":"تشغيل")+"</button><button class='platform-link danger-link' data-delbot='"+b.id+"'>حذف البوت</button></div></article>";
        }).join("");
        if(!cards)cards="<div class='empty'>ما عندك بوتات مضافة. اضغط «+ إضافة بوت» لبدء الاستضافة.</div>";
        var head="<div class='platform-head'><div><span class='eyebrow'>MLD BOT HOSTING</span><h2>بوتاتي</h2><p class='muted'>أضف بوتات Discord الخاصة بك، اختر السيرفر، وأدخل التوكن. كل بوت مستقل عن الآخر.</p></div>"+(linked?"<span class='platform-chip online'>Discord مربوط</span>":"<button class='primary' id='link-discord'>ربط حساب Discord</button>")+"</div>";
        var note=!linked?"<div class='account-card bot-note'><b>اربط Discord أولًا</b><p>نحتاج حساب Discord لمعرفة السيرفرات التي تملك صلاحية إدارتها.</p></div>":"<div class='account-card bot-note'><div><b>"+esc(ds.username||"Discord")+"</b><p class='muted'>السيرفرات المتاحة: "+ds.guilds.length+"</p></div><button class='primary' id='add-bot'>+ إضافة بوت</button></div>";
        show("بوتاتي",head+note+"<div class='game-grid'>"+cards+"</div><div id='bot-workspace'></div>");
        var link=$("#link-discord");if(link)link.onclick=function(){api("/api/platform/discord/oauth/start").then(function(v){location.href=v.url}).catch(function(e){alert(e.message)})};
        var add=$("#add-bot");if(add)add.onclick=function(){addBot(ds)};
        document.querySelectorAll("[data-stopbot]").forEach(function(b){b.onclick=function(){var mine=d.bots.find(function(z){return z.id===b.dataset.stopbot;});var url="/api/platform/my-bots/"+b.dataset.stopbot+(mine&&mine.status==="online"?"/stop":"/start");api(url,{method:"POST"}).then(load).catch(function(e){alert(e.message)})}});
        document.querySelectorAll("[data-delbot]").forEach(function(b){b.onclick=function(){if(confirm("حذف البوت وإيقاف استضافته؟"))api("/api/platform/my-bots/"+b.dataset.delbot,{method:"DELETE"}).then(load).catch(function(e){alert(e.message)})}});
        document.querySelectorAll("[data-openbot]").forEach(function(b){b.onclick=function(){commandPanel(b.dataset.openbot)}});
      }).catch(function(e){alert(e.message)});
    }
    function addBot(ds){
      if(!ds.linked){alert("اربط حساب Discord أولًا");return;}
      var options=ds.guilds.map(function(g){return "<option value='"+esc(g.id)+"'>"+esc(g.name)+"</option>"}).join("");
      show("إضافة بوت","<div class='platform-head'><div><span class='eyebrow'>NEW DISCORD BOT</span><h2>إضافة بوتك</h2><p class='muted'>اختر السيرفر، ثم ضع بيانات بوت Discord الخاص بك.</p></div><button class='platform-link' id='back-bots'>رجوع</button></div><div class='account-card bot-form'><label>اسم البوت داخل لوحة MLD (اختياري)</label><input id='bot-name' class='full' maxlength='80' placeholder='مثال: بوت الحماية'><label>السيرفر</label><select id='bot-guild' class='full'>"+options+"</select><label>Prefix الأوامر</label><input id='bot-prefix' class='full' maxlength='5' value='!' placeholder='!'><label>توكن البوت</label><input id='bot-token' class='full' type='password' autocomplete='new-password' placeholder='ألصق توكن البوت هنا'><small class='muted'>التوكن لا يظهر في الواجهة بعد الحفظ ويُحفظ مشفرًا. يجب أن يكون البوت مضافًا مسبقًا إلى السيرفر المحدد.</small><button class='primary full-btn' id='save-bot'>تحقق وتشغيل البوت</button></div>");
      $("#back-bots").onclick=bots;
      $("#save-bot").onclick=function(){
        var btn=$("#save-bot");btn.disabled=true;btn.textContent="جاري التحقق والتشغيل...";
        api("/api/platform/my-bots",{method:"POST",body:JSON.stringify({name:$("#bot-name").value,guildId:$("#bot-guild").value,prefix:$("#bot-prefix").value,token:$("#bot-token").value})}).then(function(v){alert("تمت إضافة البوت وتشغيله.");commandPanel(v.bot.id)}).catch(function(e){alert(e.message);btn.disabled=false;btn.textContent="تحقق وتشغيل البوت"});
      };
    }
    function commandPanel(id){
      Promise.all([api("/api/platform/my-bots/"+id+"/channels"),api("/api/platform/my-bots").then(function(d){return d.bots.find(function(b){return b.id===id})})]).then(function(x){
        var ch=x[0],bot=x[1],opts=ch.channels.map(function(a){return "<option value='"+esc(a.id)+"'>#"+esc(a.name)+"</option>"}).join("");
        show("لوحة تحكم البوت","<div class='platform-head'><div><span class='eyebrow'>BOT CONTROL PANEL</span><h2>"+esc(bot?bot.name:"البوت")+"</h2><p class='muted'>"+esc(bot?bot.botUsername:"")+" · "+esc(bot?bot.guildName:"")+"</p></div><button class='platform-link' id='back-bots'>رجوع للبوتات</button></div><div class='account-card'><div class='bot-actions'><button class='primary' id='test-bot'>اختبار الاتصال</button><button class='platform-link' id='restart-bot'>إعادة تشغيل</button><button class='platform-link danger-link' id='delete-bot'>حذف البوت</button></div><p id='bot-test-result' class='muted'></p><label>القناة</label><select id='bot-channel' class='full'>"+opts+"</select><label>الأمر</label><div class='bot-command-row'><input id='bot-command' class='full' placeholder='مثال: !ping أو أي أمر يدعمه بوتك'><button class='primary' id='send-command'>إرسال</button></div><p class='muted small'>هذه اللوحة ترسل الأمر في Discord؛ تنفيذ الأمر نفسه يعتمد على نظام الأوامر الموجود داخل بوتك.</p></div>");
        $("#back-bots").onclick=bots;
        $("#test-bot").onclick=function(){api("/api/platform/my-bots/"+id+"/test",{method:"POST"}).then(function(v){$("#bot-test-result").textContent="🟢 متصل · "+v.bot.tag+" · Ping "+v.ping+"ms · "+v.guild.name}).catch(function(e){$("#bot-test-result").textContent="🔴 "+e.message})};
        $("#restart-bot").onclick=function(){api("/api/platform/my-bots/"+id+"/stop",{method:"POST"}).then(function(){return api("/api/platform/my-bots/"+id+"/start",{method:"POST"})}).then(commandPanel).catch(function(e){alert(e.message)})};
        $("#delete-bot").onclick=function(){if(confirm("حذف البوت نهائيًا؟"))api("/api/platform/my-bots/"+id,{method:"DELETE"}).then(bots).catch(function(e){alert(e.message)})};
        $("#send-command").onclick=function(){var command=$("#bot-command").value.trim();if(!command)return alert("اكتب الأمر أولًا");api("/api/platform/my-bots/"+id+"/command",{method:"POST",body:JSON.stringify({channelId:$("#bot-channel").value,command:command})}).then(function(){alert("تم إرسال الأمر إلى Discord.")}).catch(function(e){alert(e.message)})};
      }).catch(function(e){alert(e.message)});
    }
    load();
  }
  function tickets(){if(!login())return;api("/api/platform/tickets").then(function(d){var h="<div class='platform-head'><div><span class='eyebrow'>SUPPORT</span><h2>التذاكر</h2></div><button class='primary' id='nt'>+ تذكرة</button></div><div id='tf' class='account-card hidden'><input id='tt' class='full' placeholder='العنوان'><input id='tc' class='full' placeholder='القسم'><textarea id='tm' class='full' placeholder='المشكلة'></textarea><button class='primary' id='st'>إرسال</button></div><div class='group-grid'>";d.tickets.forEach(function(t){h+="<article class='group-card'><h3>"+esc(t.title)+"</h3><p>"+esc(t.message)+"</p><small>"+esc(t.category)+" · "+esc(t.status)+"</small></article>";});if(!d.tickets.length)h+="<div class='empty'>لا توجد تذاكر.</div>";h+="</div>";show("التذاكر",h);$("#nt").onclick=function(){$("#tf").className="account-card";};$("#st").onclick=function(){api("/api/platform/tickets",{method:"POST",body:JSON.stringify({title:$("#tt").value,category:$("#tc").value,message:$("#tm").value})}).then(tickets).catch(function(e){alert(e.message);});};}).catch(function(e){alert(e.message);});}
  function applications(){if(!login())return;api("/api/platform/applications").then(function(d){var h="<div class='platform-head'><div><span class='eyebrow'>APPLICATIONS</span><h2>التقديمات</h2></div><button class='primary' id='na'>+ تقديم</button></div><div id='af' class='account-card hidden'><input id='ar' class='full' placeholder='القسم/الرتبة'><textarea id='aa' class='full' placeholder='إجاباتك'></textarea><button class='primary' id='sa'>إرسال</button></div><div class='group-grid'>";d.applications.forEach(function(a){h+="<article class='group-card'><h3>@"+esc(a.username)+" · "+esc(a.role)+"</h3><p>"+esc(a.answers)+"</p><small>"+esc(a.status)+"</small></article>";});if(!d.applications.length)h+="<div class='empty'>لا توجد تقديمات مفتوحة.</div>";h+="</div>";show("التقديمات",h);$("#na").onclick=function(){$("#af").className="account-card";};$("#sa").onclick=function(){api("/api/platform/applications",{method:"POST",body:JSON.stringify({role:$("#ar").value,answers:$("#aa").value})}).then(applications).catch(function(e){alert(e.message);});};}).catch(function(e){alert(e.message);});}
  function reviews(){api("/api/platform/reviews").then(function(d){var h="<div class='platform-head'><div><span class='eyebrow'>COMMUNITY VOICE</span><h2>آراء المجتمع</h2></div>"+(token()?"<button class='primary' id='nr'>+ أضف رأيك</button>":"")+"</div><div id='rf' class='account-card hidden'><input id='rr' class='full' type='number' min='1' max='5' value='5'><textarea id='rt' class='full' placeholder='رأيك'></textarea><button class='primary' id='sr'>نشر</button></div><div class='group-grid'>";d.reviews.forEach(function(r){h+="<article class='group-card'><h3>@"+esc(r.username)+" · "+("★".repeat(r.rating))+"</h3><p>"+esc(r.text)+"</p></article>";});if(!d.reviews.length)h+="<div class='empty'>لا توجد آراء بعد.</div>";h+="</div>";show("الآراء",h);var n=$("#nr");if(n)n.onclick=function(){$("#rf").className="account-card";};var s=$("#sr");if(s)s.onclick=function(){api("/api/platform/reviews",{method:"POST",body:JSON.stringify({rating:$("#rr").value,text:$("#rt").value})}).then(reviews).catch(function(e){alert(e.message);});};}).catch(function(e){alert(e.message);});}
  function messages(){if(!login())return;api("/api/platform/messages").then(function(d){var h="<div class='platform-head'><div><span class='eyebrow'>PRIVATE</span><h2>الرسائل الخاصة</h2></div><div class='account-card'><input id='mt' class='full' placeholder='يوزر المستلم'><textarea id='mm' class='full' placeholder='رسالتك'></textarea><button class='primary' id='sm'>إرسال</button></div></div><div class='group-grid'>";d.messages.forEach(function(m){h+="<article class='group-card'><h3>@"+esc(m.from)+" → @"+esc(m.to)+"</h3><p>"+esc(m.message)+"</p></article>";});if(!d.messages.length)h+="<div class='empty'>لا توجد رسائل.</div>";h+="</div>";show("الرسائل الخاصة",h);$("#sm").onclick=function(){api("/api/platform/messages",{method:"POST",body:JSON.stringify({to:$("#mt").value,message:$("#mm").value})}).then(messages).catch(function(e){alert(e.message);});};}).catch(function(e){alert(e.message);});}
  function economy(){if(!login())return;api("/api/platform/economy").then(function(d){show("البنك والستريك","<div class='platform-head'><div><span class='eyebrow'>ECONOMY</span><h2>البنك والستريك</h2><p class='muted'>💰 "+d.wallet.coins+" عملة · 🔥 "+d.streak.days+" يوم</p></div><button class='primary' id='daily'>استلم اليومية</button></div>");$("#daily").onclick=function(){api("/api/platform/daily",{method:"POST"}).then(economy).catch(function(e){alert(e.message);});};}).catch(function(e){alert(e.message);});}
  function giveaways(){api("/api/platform/giveaways").then(function(d){var h="<div class='platform-head'><div><span class='eyebrow'>GIVEAWAY</span><h2>السحوبات</h2></div></div><div class='group-grid'>";d.giveaways.forEach(function(g){h+="<article class='group-card'><h3>"+esc(g.title)+"</h3><p>🎁 "+esc(g.prize)+"</p><small>"+esc(g.endsAt)+" · "+g.entries.length+" مشارك</small><button class='primary' data-g='"+g.id+"'>مشاركة</button></article>";});if(!d.giveaways.length)h+="<div class='empty'>لا توجد سحوبات.</div>";h+="</div>";show("السحوبات",h);document.querySelectorAll("[data-g]").forEach(function(x){x.onclick=function(){if(!login())return;api("/api/platform/giveaways/"+x.dataset.g+"/join",{method:"POST"}).then(giveaways).catch(function(e){alert(e.message);});};});}).catch(function(e){alert(e.message);});}
  function overview(){if(!login())return;api("/api/platform/overview").then(function(d){var h="<div class='platform-head'><div><span class='eyebrow'>MLD CONTROL</span><h2>مركز المنصة</h2></div></div><div class='admin-stats'>";Object.keys(d).forEach(function(k){h+="<div><b>"+esc(d[k])+"</b><small>"+esc(k)+"</small></div>";});h+="</div>";show("مركز المنصة",h);}).catch(function(e){alert(e.message);});}
  var map={bots:bots,tickets:tickets,applications:applications,reviews:reviews,messages:messages,economy:economy,giveaways:giveaways,overview:overview};
  document.querySelectorAll("[data-extra]").forEach(function(b){b.onclick=function(){if(map[b.dataset.extra])map[b.dataset.extra]();nav();};});
  window.MLDExtra={bots:bots,tickets:tickets,applications:applications,reviews:reviews,messages:messages,economy:economy,giveaways:giveaways,overview:overview};

  function closeMenu(){var m=$("#mobile-menu");if(m)m.className=m.className.replace(/\bopen\b/g,"").trim();}
  function wrapLogin(button){
    if(!button)return;
    var original=button.onclick;
    button.onclick=function(e){
      if(!token()){alert("سجّل دخولك أولًا من «حسابي».");closeMenu();return;}
      if(original)original.call(button,e);
      closeMenu();
    };
  }
  document.querySelectorAll("[data-chat],[data-profile],[data-pigeon],[data-platform='games'],[data-platform='groups'],[data-extra='bots'],[data-extra='tickets'],[data-extra='applications'],[data-extra='messages'],[data-extra='economy'],[data-extra='overview'],[data-logout]").forEach(wrapLogin);

  function syncAccess(){
    var admin=document.querySelectorAll("[data-platform='admin']"),owner=document.querySelectorAll("[data-owner]");
    if(!admin.length&&!owner.length)return;
    fetch("/api/platform/me",{headers:{Authorization:"Bearer "+token()}}).then(function(r){return r.ok?r.json():Promise.reject()}).then(function(d){
      var a=d.account,canAdmin=!!a&&(a.role==="owner"||a.admin===true);
      admin.forEach(function(b){b.classList.toggle("hidden",!canAdmin);});
      owner.forEach(function(b){b.classList.toggle("hidden",!(a&&a.role==="owner"));});
    }).catch(function(){admin.forEach(function(b){b.classList.add("hidden");});owner.forEach(function(b){b.classList.add("hidden");});});
  }
  syncAccess();
  setInterval(syncAccess,1500);

  document.querySelectorAll("#mobile-menu [data-view],#mobile-menu [data-home],#mobile-menu [data-extra],#mobile-menu [data-owner]").forEach(function(b){
    var original=b.onclick;
    b.onclick=function(e){if(original)original.call(b,e);closeMenu();};
  });
})();