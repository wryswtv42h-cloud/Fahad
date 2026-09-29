const V={home:["الرئيسية","واجهة ملاذ"],members:["الأعضاء","أعضاء المجتمع"],top:["TOP","ترتيب المجتمع"],roles:["الرتب","رتب السيرفر"],games:["الألعاب","جلسات اللعب"],groups:["القروبات","مجموعات المجتمع"],chat:["الشات العام","المحادثة العامة"],"private-chat":["الخاص","محادثاتك"],message:["رسالة خاصة","إرسال رسالة"],anonymous:["الزاجل","رسائل مجهولة"],jokes:["النكت","ترفيه المجتمع"],stories:["القصص","قصص مولدة"],tickets:["التذاكر","الدعم"],apply:["التقديم","طلبات الانضمام"],reviews:["الآراء","آراء المجتمع"],profile:["ملفي","ملفك الشخصي"],account:["حسابي","إعدادات الحساب"],bots:["البوتات","لوحة البوتات"],login:["الدخول","الحساب"],admin:["الإدارة","لوحة الإدارة"]};
const GAMES=[
["UNO","أونو","🎴",4],["BALOOT","بلوت","🃏",4],["JAKAROO","جاكارو","♟️",4],["LUDO","لودو","🎲",4],["QAWSAR","قوصر","♛",4],["SPYFALL","سباي فول","🕵️",6],["CODENAMES","كود نيمز","🔐",8],["TRIVIA","معلومات عامة","🧠",8],["EMOJI_GUESS","تخمين الإيموجي","😎",8],["TABOO","تابو","🚫",8],["RIDDLE_RUSH","ألغاز","❓",8],["WORD_BOMB","قنبلة الكلمات","💣",8],["CATEGORIES","التصنيفات","🗂️",8],["FASTEST","الأسرع","⚡",8],["PICTIONARY","بيكشنري","✏️",8],["DRAW_GUESS","ارسم وخمن","🎨",8],["CHARADES","تمثيل صامت","🎭",8],["MIMIC","قلدها","🎤",8],["SECRET_WORD","الكلمة السرية","🔎",8],["WHOAMI","من أنا؟","🪪",8],["WOULD_YOU_RATHER","تفضل؟","⚖️",8],["HOT_SEAT","كرسي الاعتراف","🔥",8],["GUESS_PLAYER","خمن اللاعب","🎯",8],["LIAR","الكذاب","🤥",8],["LIAR_BAR","الكذاب — طاولة الخداع","🔫",6],["TRUTH_LIE","صدق أم كذب","🌓",8],["DAQSH","دقش","🌀",8],["CHESS","شطرنج","♟️",2]
];
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>{const d=document.createElement("div");d.textContent=String(s??"");return d.innerHTML};
const initials=s=>String(s||"?").trim().slice(0,1).toUpperCase();
let me=null,stats=null,gamePoll=null,activeGame=null;
async function api(url,opt={}){const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),9000);const o={credentials:"same-origin",cache:"no-store",signal:ctl.signal,...opt};if(o.body&&typeof o.body!=="string"){o.headers={"Content-Type":"application/json",...(o.headers||{})};o.body=JSON.stringify(o.body)}const r=await fetch(url,o);let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"تعذر تنفيذ الطلب");clearTimeout(timer);return d}
function toast(t){const x=$("#toast");if(!x)return;x.textContent=t;x.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.classList.remove("show"),2800)}
function avatar(url,name){return url?'<img class="avatar" src="'+esc(url)+'" alt="">':'<span class="avatar avatar-fallback">'+esc(initials(name))+"</span>"}
function date(x){try{return new Date(x).toLocaleString("ar-SA",{dateStyle:"short",timeStyle:"short"})}catch{return""}}
function isAuth(){return !!me}
function requireAuth(){if(!me){toast("سجّل الدخول أولًا");go("login");return false}return true}
function go(v){if(!V[v])v="home";location.hash="#"+v;render(v)}
function openModal(html){$("#modalBody").innerHTML=html;$("#modal").classList.remove("hidden")}
function closeModal(){$("#modal").classList.add("hidden")}
function menu(){
 const groups=[
 ["الأساسي",["home","members","top","roles"]],
 ["المجتمع",["groups","chat","private-chat","anonymous","reviews"]],
 ["الترفيه",["games","jokes","stories"]],
 ["الخدمات",["tickets","apply","bots"]],
 ["حسابك",["profile","account","login"]]
 ];
 const icon={home:"⌂",members:"♟",top:"↗",roles:"◆",groups:"◎",chat:"◌","private-chat":"✉",anonymous:"✦",reviews:"★",games:"🎮",jokes:"☻",stories:"▣",tickets:"⌁",apply:"✓",bots:"⚙",profile:"◉",account:"⚙",login:"↪",admin:"◆"};
 $("#menu").innerHTML=groups.map(([title,items])=>'<section class="menu-group"><p class="menu-title">'+title+'</p>'+items.map(k=>'<button class="menu-item" data-view="'+k+'"><span class="menu-icon">'+icon[k]+'</span><span><b>'+V[k][0]+'</b><small>'+V[k][1]+'</small></span></button>').join("")+"</section>").join("");
 if(me&&(me.role==="owner"||me.role==="admin"))$("#menu").insertAdjacentHTML("beforeend",'<section class="menu-group"><p class="menu-title">صلاحيات</p><button class="menu-item" data-view="admin"><span class="menu-icon">◆</span><span><b>الإدارة</b><small>التذاكر والتقديمات واللوق</small></span></button></section>');
}
function setUser(){
 const el=$("#topUser");if(!el)return;
 if(me){el.href="#profile";el.innerHTML=avatar(me.avatar,me.username)+'<span class="user-mini-text"><b>'+esc(me.username)+'</b><small>'+esc(me.role==="owner"?"Owner":me.role==="admin"?"Admin":"عضو")+"</small></span>"}else{el.href="#login";el.innerHTML='<span class="avatar-fallback">؟</span><span class="user-mini-text"><b>زائر</b><small>تسجيل الدخول</small></span>'}
}
function drawer(open){$("#drawer").classList.toggle("open",open);$("#drawerShade").classList.toggle("open",open);$("#drawer").setAttribute("aria-hidden",String(!open));$("#menuBtn").setAttribute("aria-expanded",String(open))}
async function boot(){
 try{const d=await Promise.race([api("/api/auth/me"),new Promise((_,rej)=>setTimeout(()=>rej(Error("auth timeout")),5000))]);me=d.user||null}catch(e){console.warn("auth boot:",e.message)}
 setUser();menu();
 try{await Promise.race([api("/api/site/visit",{method:"POST"}),new Promise((_,rej)=>setTimeout(()=>rej(Error("visit timeout")),2500))])}catch(e){console.warn("visit:",e.message)}
 $("#boot").style.opacity="0";setTimeout(()=>$("#boot").remove(),350);
 const v=(location.hash||"#home").slice(1)||"home";await render(V[v]?v:"home");
}
async function render(v=(location.hash||"#home").slice(1)){
 if(!V[v])v="home";drawer(false);$$("#menu .menu-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
 const root=$("#view");root.innerHTML='<div class="empty"><b>جاري التحميل…</b><span>نجهز لك الصفحة</span></div>';
 try{const fn=pages[v]||pages.home;root.innerHTML=await fn();bindPage(v)}catch(e){root.innerHTML='<div class="empty"><b>صار خطأ في تحميل القسم</b><span>'+esc(e.message)+'</span><div style="margin-top:14px"><button class="btn secondary" onclick="render(''+v+'')">إعادة المحاولة</button></div></div>';console.error(e)}
 window.scrollTo({top:0,behavior:"smooth"});
}
function bindPage(v){
 $$("#view [data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));
 $$("#view [data-action]").forEach(x=>x.onclick=()=>actions[x.dataset.action]?.(x));
}
const pages={};
pages.home=async()=>{
 let s={memberCount:"—",online:"—",visits:"—"};try{s=await api("/api/site/stats")}catch{}
 let reviews=[];try{reviews=(await api("/api/ratings")).items||[]}catch{}
 return '<section class="hero"><div class="hero-copy"><div class="eyebrow"><i></i> مجتمع عربي حي ومتجدد</div><h1>مكانك.<br><em>مزاجك. مجتمعك.</em></h1><p>ملاذ يجمع الأعضاء، الشات، القروبات، الألعاب الجماعية، البوتات والخدمات في تجربة واحدة مصممة للجوال والكمبيوتر.</p><div class="hero-actions"><button class="btn primary" data-go="games">ابدأ اللعب ←</button><button class="btn secondary" data-go="members">استكشف المجتمع ←</button></div></div><div class="hero-art"><div class="orb"><img src="/logo.svg.JPG" alt=""></div><span class="orb-tag tag-a">مجتمع حي</span><span class="orb-tag tag-b">ألعاب جماعية</span><span class="orb-tag tag-c">خدمات ملاذ</span></div></section>'+
 '<div class="stat-grid"><div class="stat"><b>'+esc(s.memberCount)+'</b><span>عضو في السيرفر</span></div><div class="stat"><b>'+esc(s.online)+'</b><span>متصل الآن</span></div><div class="stat"><b>'+esc(s.visits)+'</b><span>زيارة للمنصة</span></div><div class="stat"><b>'+GAMES.length+'</b><span>لعبة جماعية</span></div></div>'+
 '<div class="section-title"><div><h2>كل شيء قريب منك</h2><small>أقسام مرتبة بدل الزحمة</small></div></div>'+
 '<div class="feature-grid">'+[
 ["🎮","جلسات الألعاب","أنشئ جلسة، اختر اللعبة، شارك الكود وخَلِّ الآخرين يدخلون كلاعبين أو مشاهدين."],
 ["💬","المجتمع والتواصل","شات عام، رسائل خاصة، زاجل مجهول، وقروبات لها أصحاب وأعضاء."],
 ["🤖","لوحة البوتات","اربط بوتاتك وأدر الإعدادات والأوامر والإضافات والاشتراكات واللوق."],
 ["🛡️","الإدارة والدعم","تذاكر، تقديمات، طلبات القروبات، آراء المجتمع وسجل نشاط منظم."]
 ].map(x=>'<article class="feature"><div class="fi">'+x[0]+'</div><h3>'+x[1]+'</h3><p>'+x[2]+'</p></article>').join("")+'</div>'+
 '<div class="section-title"><div><h2>آخر آراء المجتمع</h2><small>تتحرك أفقيًا مثل ما طلبت</small></div><button class="btn secondary sm" data-go="reviews">كل الآراء</button></div>'+
 '<div class="review-track">'+(reviews.length?reviews.slice(0,12).map(reviewCard).join(""):'<div class="empty" style="min-width:100%">لا توجد آراء بعد — كن أول من يكتب رأيه.</div>')+'</div>';
};
function reviewCard(r){return '<article class="review"><div class="between"><b>'+esc(r.username||"عضو")+'</b><span class="stars">'+("★".repeat(Number(r.value)||0))+'</span></div><p>'+esc(r.body||"بدون تعليق")+'</p><small class="muted">'+date(r.created_at)+'</small></article>'}
pages.members=async()=>{
 const d=await api("/api/members"),a=d.members||[];
 return pageHead("الأعضاء","ابحث في أعضاء السيرفر واعرف رتبهم وحالتهم.",'<input id="memberFilter" placeholder="بحث عن عضو…" style="max-width:260px">')+
 '<div id="membersGrid" class="member-grid">'+a.map(memberCard).join("")+"</div>";
};
function memberCard(m){return '<article class="member">'+
 '<div class="member-top">'+avatar(m.avatar,m.name)+'<div style="min-width:0;flex:1"><b>'+esc(m.name)+'</b><small class="muted">@'+esc(m.username)+'</small></div><span class="pill"><i class="dot"></i>'+esc(m.rank||"عضو")+'</span></div>'+
 '<p>'+ (m.bot?"🤖 بوت":"عضو مجتمع")+' · '+(m.roles?.length||0)+" رتبة</p></article>"}
pages.top=async()=>{const d=await api("/api/top");return pageHead("TOP","ترتيب المجتمع حسب الرتب المعتمدة في السيرفر.")+'<div class="grid">'+(d.members||[]).slice(0,30).map((m,i)=>'<article class="card span-4"><div class="between"><span class="rank-num">#'+(i+1)+'</span>'+avatar(m.avatar,m.name)+'</div><h3 style="margin-top:14px">'+esc(m.name)+'</h3><span class="pill">'+esc(m.rank||"عضو")+"</span></article>").join("")+"</div>"};
pages.roles=async()=>{const d=await api("/api/roles");return pageHead("الرتب","ترتيب الرتب وعدد الأعضاء المرتبطين بها.")+'<div class="grid">'+(d.roles||[]).map(r=>'<article class="card span-4"><div class="between"><b style="color:'+esc(r.color||"#fff")+'">'+esc(r.name)+'</b><span class="pill">#'+r.position+"</span></div><p class="muted tiny" style="margin:16px 0 0">"+r.membersCount+" عضو · "+(r.mentionable?"قابلة للمناداة":"غير قابلة للمناداة")+"</p></article>").join("")+"</div>"};
pages.groups=async()=>{
 const d=await api("/api/groups");return pageHead("القروبات","أنشئ مجموعتك أو أرسل طلب انضمام لقروب مناسب.",'<button class="btn primary" data-action="createGroup">إنشاء قروب</button>')+'<div class="grid">'+(d.groups||[]).map(g=>'<article class="card span-4"><div class="between"><div><h3>'+esc(g.name)+'</h3><small class="muted">بواسطة '+esc(g.owner_username)+'</small></div><span class="pill">'+(g.members?.length||0)+' أعضاء</span></div><p class="lead" style="font-size:11px;margin:14px 0">'+esc(g.description||"بدون وصف")+'</p><button class="btn secondary sm" data-action="joinGroup" data-id="'+g.id+'">طلب انضمام</button></article>').join("")+"</div>";
};
pages.chat=async()=>{
 if(!me)return pageHead("الشات العام","المحادثة العامة مفتوحة للمشاهدة. للإرسال سجّل الدخول.",'<button class="btn primary" data-go="login">تسجيل الدخول</button>')+await chatHtml();
 return pageHead("الشات العام","المكان الرئيسي للمجتمع.",'<span class="pill"><i class="dot"></i> مباشر</span>')+await chatHtml();
};
async function chatHtml(){const d=await api("/api/chat/messages");return '<section class="card chat"><div id="chatMessages" class="messages">'+(d.messages||[]).map(m=>'<div class="msg '+(me&&m.username===me.username?"mine":"")+'"><b>'+esc(m.username)+'</b><p>'+esc(m.body)+'</p><time>'+date(m.created_at)+'</time></div>').join("")+'</div><form id="chatForm" class="composer">'+(me?'<input name="body" maxlength="2000" placeholder="اكتب رسالتك…"><button class="btn primary">إرسال</button>':'<input disabled placeholder="سجّل الدخول للإرسال"><button type="button" class="btn secondary" data-go="login">دخول</button>')+'</form></section>'}
pages["private-chat"]=async()=>{
 if(!requireAuth())return "";
 const d=await api("/api/private-messages");const by={};(d.messages||[]).forEach(x=>{const other=x.sender_username===me.username?x.recipient_username:x.sender_username;(by[other]??=[]).push(x)});
 return pageHead("الخاص","محادثاتك الخاصة في مكان واحد.",'<button class="btn primary" data-go="message">رسالة جديدة</button>')+'<div class="grid">'+Object.entries(by).map(([u,ms])=>'<article class="card span-4"><div class="between"><h3>@'+esc(u)+'</h3><span class="pill">'+ms.length+' رسالة</span></div><p class="muted">'+esc(ms[0]?.body||"")+'</p><button class="btn secondary sm" data-action="openPrivate" data-user="'+esc(u)+'">فتح المحادثة</button></article>').join("")||'<div class="empty span-12"><b>ما عندك محادثات بعد</b><span>ابدأ برسالة خاصة.</span></div>'+"</div>";
};
pages.message=async()=>{
 if(!requireAuth())return "";
 return pageHead("رسالة خاصة","أرسل رسالة لعضو بالاسم المسجل في المنصة.")+'<section class="card span-12"><form id="privateForm" class="form"><div class="field"><label>المستلم</label><input name="recipient" placeholder="اسم المستخدم"></div><div class="field"><label>الرسالة</label><textarea name="body" maxlength="4000" placeholder="اكتب رسالتك…"></textarea></div><button class="btn primary">إرسال الرسالة</button></form></section>';
};
pages.anonymous=async()=>{
 if(!requireAuth())return "";
 const d=await api("/api/anonymous");return pageHead("الزاجل","أرسل رسالة مجهولة أو اكشف اسمك عند الاستلام.",'<button class="btn primary" data-action="anonymousForm">إرسال رسالة</button>')+'<div class="list">'+(d.items||[]).map(x=>'<article class="list-row"><div class="grow"><b>'+esc(x.title)+'</b><small>'+esc(x.body)+'</small></div><span class="pill">'+(x.sender?"@"+esc(x.sender):"مجهول")+"</span></article>").join("")||'<div class="empty"><b>صندوقك هادئ</b><span>لا توجد رسائل حتى الآن.</span></div>'+"</div>";
};
pages.jokes=async()=>{const d=await api("/api/jokes");return pageHead("النكت","شارك نكتتك وتفاعل مع نكت المجتمع.",'<button class="btn primary" data-action="jokeForm">أضف نكتة</button>')+'<div class="grid">'+(d.items||[]).map(x=>'<article class="card span-4"><div class="between"><b>@'+esc(x.username)+'</b><span class="pill">😂 '+x.likes+'</span></div><p class="lead" style="font-size:12px">'+esc(x.body)+'</p><div class="row"><button class="btn secondary sm" data-action="reactJoke" data-id="'+x.id+'" data-type="like">👍 '+x.likes+'</button><button class="btn secondary sm" data-action="reactJoke" data-id="'+x.id+'" data-type="dislike">👎 '+x.dislikes+'</button></div></article>').join("")+"</div>"};
pages.stories=async()=>{const d=await api("/api/stories");return pageHead("القصص","اختر نوع القصة وطولها ودع ملاذ يولد لك قصة قصيرة.",'<button class="btn primary" data-action="storyForm">اكتب قصة</button>')+'<div class="grid">'+(d.items||[]).map(x=>'<article class="card span-4"><span class="kicker">'+esc(x.genre)+'</span><h3>'+esc(x.length)+'</h3><p class="lead" style="font-size:11px">'+esc(x.body)+'</p><small class="muted">'+date(x.created_at)+'</small></article>').join("")+"</div>"};
pages.reviews=async()=>{const d=await api("/api/ratings");return pageHead("آراء المجتمع","مكان واحد لآراء الأعضاء. يمكنك إضافة رأيك.",'<button class="btn primary" data-action="reviewForm">أضف رأيك</button>')+'<div class="review-track">'+(d.items||[]).map(reviewCard).join("")+"</div>"};
pages.tickets=async()=>{
 if(!requireAuth())return "";
 const d=await api("/api/tickets");return pageHead("التذاكر","افتح تذكرة للدعم وتابع حالتها.",'<button class="btn primary" data-action="ticketForm">تذكرة جديدة</button>')+'<div class="list">'+(d.items||[]).map(x=>'<button class="list-row" data-action="ticketOpen" data-id="'+x.id+'" style="text-align:right"><div class="grow"><b>#'+x.id+" · "+esc(x.subject)+'</b><small>'+date(x.updated_at||x.created_at)+'</small></div><span class="pill">'+esc(x.status)+'</span></button>').join("")||'<div class="empty"><b>لا توجد تذاكر</b><span>إذا احتجت شيئًا افتح تذكرة.</span></div>'+"</div>";
};
pages.apply=async()=>pageHead("التقديم","قدّم طلبك للانضمام إلى فريق المجتمع.",'<button class="btn primary" data-action="applyForm">ابدأ التقديم</button>')+'<div class="card"><h3>قبل التقديم</h3><p class="lead">اكتب اسم Discord الصحيح ووضح سبب التقديم وما تستطيع تقديمه للمجتمع. الطلب يصل للإدارة للمراجعة.</p></div>';
pages.profile=async()=>{
 if(!requireAuth())return "";
 const d=await api("/api/profile"),u=d.user;return pageHead("ملفي","ملفك الشخصي ونقاطك ومعلوماتك.")+'<div class="grid"><section class="card span-5"><div class="member-top">'+avatar(u.avatar,u.username)+'<div><h2>'+esc(u.username)+'</h2><span class="pill">'+esc(u.role)+'</span></div></div><p class="lead">'+esc(u.bio||"لا يوجد وصف بعد.")+'</p><div class="stat-grid" style="grid-template-columns:1fr 1fr"><div class="stat"><b>'+u.points+'</b><span>نقاط</span></div><div class="stat"><b>'+esc(u.discordUsername||"—")+'</b><span>Discord</span></div></div></section><section class="card span-7"><form id="profileForm" class="form"><div class="field"><label>Discord username</label><input name="discordUsername" value="'+esc(u.discordUsername||"")+'"></div><div class="field"><label>نبذة</label><textarea name="bio">'+esc(u.bio||"")+'</textarea></div><div class="field"><label>رابط الصورة (اختياري)</label><input name="avatar" value="'+esc(u.avatar||"")+'"></div><button class="btn primary">حفظ التعديلات</button></form></section></div>';
};
pages.account=async()=>{
 if(!requireAuth())return "";
 const d=await api("/api/account"),u=d.user;return pageHead("حسابي","إعدادات الحساب والأمان.")+'<div class="grid"><section class="card span-6"><h3>بيانات الحساب</h3><div class="list"><div class="list-row"><div class="grow"><b>اسم المستخدم</b><small>'+esc(u.username)+'</small></div></div><div class="list-row"><div class="grow"><b>Discord</b><small>'+esc(u.discord_username||"غير مربوط")+'</small></div></div><div class="list-row"><div class="grow"><b>الدور</b><small>'+esc(u.role)+'</small></div></div><div class="list-row"><div class="grow"><b>تاريخ الإنشاء</b><small>'+date(u.created_at)+'</small></div></div></div></section><section class="card span-6"><form id="passwordForm" class="form"><h3>تغيير كلمة المرور</h3><div class="field"><label>الحالية</label><input type="password" name="oldPassword"></div><div class="field"><label>الجديدة</label><input type="password" name="newPassword"></div><button class="btn primary">تغيير كلمة المرور</button><button type="button" class="btn danger" data-action="logout">تسجيل الخروج</button></form></section></div>';
};
pages.login=async()=>{
 if(me)return pageHead("أنت مسجل دخول","حسابك الحالي جاهز.",'<button class="btn danger" data-action="logout">تسجيل الخروج</button>')+'<div class="card"><div class="member-top">'+avatar(me.avatar,me.username)+'<div><h2>'+esc(me.username)+'</h2><span class="pill">'+esc(me.role)+'</span></div></div><p class="lead">انتقل إلى ملفك أو حسابك أو ابدأ اللعب.</p></div>';
 return pageHead("تسجيل الدخول","ادخل لحسابك أو أنشئ حسابًا جديدًا.")+'<div class="grid"><section class="card span-6"><form id="loginForm" class="form"><h3>تسجيل الدخول</h3><div class="field"><label>اسم المستخدم</label><input name="username" autocomplete="username"></div><div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password"></div><button class="btn primary">دخول</button></form></section><section class="card span-6"><form id="registerForm" class="form"><h3>إنشاء حساب</h3><div class="field"><label>اسم المستخدم</label><input name="username" minlength="3" maxlength="24"></div><div class="field"><label>Discord username</label><input id="discordReg" name="discordUsername" placeholder="ابدأ بالكتابة للعثور على حسابك"></div><div id="discordSuggest" class="list"></div><div class="field"><label>كلمة المرور</label><input name="password" type="password"></div><button class="btn primary">إنشاء الحساب</button></form></section></div>';
};
pages.games=async()=>{
 const d=await api("/api/games/sessions");return pageHead("الألعاب","اختر لعبة وأنشئ جلسة. اللاعبون يدخلون بالكود والمشاهدون يرون الجولة.",'<button class="btn primary" data-action="createGame">إنشاء جلسة</button>')+
 '<div class="section-title"><div><h2>الجلسات المفتوحة</h2><small>تتحدث تلقائيًا أثناء وجودك في الصفحة</small></div></div><div id="sessions" class="list">'+(d.sessions||[]).map(sessionCard).join("")||'<div class="empty"><b>لا توجد جلسات</b><span>كن أول من ينشئ جلسة.</span></div>'+"</div>"+
 '<div class="section-title"><div><h2>كل الألعاب</h2><small>'+GAMES.length+" لعبة</small></div></div><div class="grid">"+GAMES.map(gameCard).join("")+"</div>";
};
function gameCard(g){return '<article class="game-card span-3"><div class="game-icon">'+g[2]+'</div><h3>'+g[1]+'</h3><p>حتى '+g[3]+' لاعبين · جلسة خاصة</p><button class="btn secondary sm" data-action="quickGame" data-game="'+g[0]+'">إنشاء جلسة</button></article>'}
function sessionCard(s){const n=s.players?.length||s.players||0;return '<article class="list-row session"><div class="grow"><div class="between"><div><b>'+esc(s.gameName)+'</b><small>صاحب الجلسة: '+esc(s.ownerUsername)+'</small></div><span class="session-code">'+esc(s.code)+'</span></div><div class="progress"><i style="width:'+Math.min(100,n/Math.max(1,s.maxPlayers)*100)+'%"></i></div><small class="muted">'+n+'/'+s.maxPlayers+' لاعبين · '+(s.spectators?.length||s.spectators||0)+' مشاهدين · '+esc(s.status)+'</small></div><div class="row"><button class="btn green sm" data-action="joinGame" data-code="'+esc(s.code)+'">انضمام</button><button class="btn secondary sm" data-action="spectateGame" data-code="'+esc(s.code)+'">مشاهدة</button></div></article>'}
pages.bots=async()=>{
 if(!requireAuth())return "";
 const d=await api("/api/bots");return pageHead("البوتات","لوحة إدارة البوتات المرتبطة بحسابك وصلاحياتك.",'<button class="btn primary" data-action="botCreate">ربط بوت</button>')+
 '<div class="grid">'+(d.bots||[]).map(b=>'<article class="card span-4"><div class="between"><div><h3>'+esc(b.name)+'</h3><small class="muted">'+esc(b.guild_name||b.linked_guild_id||"")+'</small></div><span class="pill"><i class="dot"></i>'+esc(b.status)+'</span></div><p class="lead" style="font-size:10px">Prefix: '+esc(b.prefix)+' · '+esc(b.presence_mode)+'</p><div class="row"><button class="btn primary sm" data-action="botOpen" data-id="'+b.id+'">لوحة البوت</button></div></article>').join("")||'<div class="empty span-12"><b>لا توجد بوتات</b><span>اربط أول بوت من زر «ربط بوت».</span></div>'+"</div>";
};
pages.admin=async()=>{
 if(!me||!["owner","admin"].includes(me.role))return pageHead("الإدارة","هذا القسم متاح للإدارة فقط.");
 const [t,a,l]=await Promise.all([api("/api/admin/tickets"),api("/api/admin/applications"),api("/api/admin/logs")]);
 return pageHead("لوحة الإدارة","التذاكر والتقديمات واللوق في شاشة واحدة.")+'<div class="grid"><section class="card span-4"><div class="between"><h3>التذاكر</h3><span class="pill">'+(t.items||[]).length+'</span></div><div class="list">'+(t.items||[]).slice(0,8).map(x=>'<div class="list-row"><div class="grow"><b>#'+x.id+' '+esc(x.subject)+'</b><small>'+esc(x.status)+' · '+esc(x.username)+'</small></div></div>').join("")+'</div></section><section class="card span-4"><div class="between"><h3>التقديمات</h3><span class="pill">'+(a.items||[]).length+'</span></div><div class="list">'+(a.items||[]).slice(0,8).map(x=>'<div class="list-row"><div class="grow"><b>'+esc(x.discord_username)+'</b><small>'+esc(x.type)+' · '+esc(x.status)+'</small></div></div>').join("")+'</div></section><section class="card span-4"><div class="between"><h3>آخر اللوق</h3><span class="pill">'+(l.items||[]).length+'</span></div><div class="list">'+(l.items||[]).slice(0,8).map(x=>'<div class="list-row"><div class="grow"><b>'+esc(x.action)+'</b><small>'+esc(x.username||"system")+' · '+date(x.created_at)+'</small></div></div>').join("")+'</div></section></div>';
};
function pageHead(title,sub,action=""){return '<div class="page-head"><div><div class="eyebrow"><i></i> MLD / '+esc(title)+'</div><h2 style="font-size:32px;margin:7px 0">'+esc(title)+'</h2><p class="lead" style="margin:0">'+esc(sub)+'</p></div><div class="row">'+action+"</div></div>"}
const actions={
 createGroup:()=>openModal('<h2>إنشاء قروب</h2><p class="muted">أنت تصبح صاحب القروب تلقائيًا.</p><form id="groupForm" class="form"><div class="field"><label>اسم القروب</label><input name="name" maxlength="80" required></div><div class="field"><label>الوصف</label><textarea name="description" maxlength="1000"></textarea></div><button class="btn primary">إنشاء</button></form>'),
 joinGroup:async x=>{if(!requireAuth())return;try{await api("/api/groups/"+x.dataset.id+"/join",{method:"POST",body:{}});toast("تم إرسال طلب الانضمام")}catch(e){toast(e.message)}},
 anonymousForm:()=>openModal('<h2>إرسال زاجل</h2><form id="anonForm" class="form"><div class="field"><label>المستلم</label><input name="recipient" required></div><div class="field"><label>العنوان</label><input name="title" maxlength="160" required></div><div class="field"><label>الرسالة</label><textarea name="body" maxlength="4000" required></textarea></div><label class="row"><input type="checkbox" name="revealSender"> إظهار اسمي للمستلم</label><button class="btn primary">إرسال</button></form>'),
 jokeForm:()=>openModal('<h2>أضف نكتة</h2><form id="jokeForm" class="form"><div class="field"><label>النكتة</label><textarea name="body" maxlength="500" required></textarea></div><button class="btn primary">نشر</button></form>'),
 storyForm:()=>openModal('<h2>إنشاء قصة</h2><form id="storyForm" class="form"><div class="field"><label>النوع</label><select name="genre"><option>مغامرة</option><option>غموض</option><option>رعب خفيف</option><option>كوميديا</option><option>خيال</option></select></div><div class="field"><label>الطول</label><select name="length"><option>قصيرة</option><option>متوسطة</option><option>طويلة</option></select></div><button class="btn primary">توليد القصة</button></form>'),
 reviewForm:()=>openModal('<h2>أضف رأيك</h2><form id="reviewForm" class="form"><div class="field"><label>التقييم</label><select name="value"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></div><div class="field"><label>رأيك</label><textarea name="body" maxlength="1000"></textarea></div><button class="btn primary">نشر الرأي</button></form>'),
 ticketForm:()=>openModal('<h2>تذكرة جديدة</h2><form id="ticketForm" class="form"><div class="field"><label>العنوان</label><input name="subject" maxlength="160" required></div><div class="field"><label>التفاصيل</label><textarea name="body" maxlength="4000" required></textarea></div><button class="btn primary">فتح التذكرة</button></form>'),
 applyForm:()=>openModal('<h2>التقديم</h2><form id="applyForm" class="form"><div class="field"><label>Discord username</label><input name="discordUsername" required></div><div class="field"><label>نوع التقديم</label><select name="type"><option value="staff">إدارة</option><option value="moderator">إشراف</option><option value="developer">برمجة</option><option value="other">أخرى</option></select></div><div class="field"><label>التفاصيل</label><textarea name="body" required></textarea></div><button class="btn primary">إرسال الطلب</button></form>'),
 createGame:()=>gameCreateModal(),
 quickGame:x=>gameCreateModal(x.dataset.game),
 joinGame:async x=>{if(!requireAuth())return;try{const d=await api("/api/games/sessions/"+x.dataset.code+"/join",{method:"POST",body:{}});openGame(d.session)}catch(e){toast(e.message)}},
 spectateGame:async x=>{try{const d=await api("/api/games/sessions/"+x.dataset.code+"/spectate",{method:"POST",body:{}});openGame(d.session,true)}catch(e){toast(e.message)}},
 reactJoke:async x=>{if(!requireAuth())return;try{await api("/api/jokes/"+x.dataset.id+"/react",{method:"POST",body:{type:x.dataset.type}});render("jokes")}catch(e){toast(e.message)}},
 openPrivate:x=>{openModal('<h2>محادثة مع @'+esc(x.dataset.user)+'</h2><form id="privateQuick" class="form"><input type="hidden" name="recipient" value="'+esc(x.dataset.user)+'"><div class="field"><label>الرسالة</label><textarea name="body" required></textarea></div><button class="btn primary">إرسال</button></form>')},
 logout:async()=>{await api("/api/auth/logout",{method:"POST"});me=null;setUser();menu();toast("تم تسجيل الخروج");go("home")},
 ticketOpen:async x=>{try{const d=await api("/api/tickets/"+x.dataset.id);openModal('<h2>#'+d.ticket.id+" · "+esc(d.ticket.subject)+'</h2><div class="list">'+(d.messages||[]).map(m=>'<div class="list-row"><div class="grow"><b>'+esc(m.username)+'</b><small>'+esc(m.body)+'</small></div><time class="muted tiny">'+date(m.created_at)+'</time></div>').join("")+"</div>")}catch(e){toast(e.message)}},
 botCreate:()=>openModal('<h2>ربط بوت</h2><p class="muted">سيتم التحقق من التوكن والسيرفرات التي تملك فيها Administrator أو صلاحية المالك.</p><form id="botInspectForm" class="form"><div class="field"><label>اسم البوت</label><input name="name" required></div><div class="field"><label>Bot Token</label><input name="token" type="password" required></div><button class="btn primary">تحقق من التوكن</button></form>'),
 botVoiceTest:async()=>{try{await api("/api/bots/"+activeBotId+"/voice/test",{method:"POST",body:{}});toast("🔊 تم تشغيل الصوت")}catch(e){toast(e.message)}},
 botOpen:async x=>{try{const [d,c,l,data]=await Promise.all([api("/api/bots/"+x.dataset.id),api("/api/bots/"+x.dataset.id+"/control"),api("/api/bots/"+x.dataset.id+"/logs"),api("/api/bots/"+x.dataset.id+"/data")]);openModal(botPanel(d,c,l,data))}catch(e){toast(e.message)}}
};
function gameCreateModal(gameId=""){openModal('<h2>إنشاء جلسة لعبة</h2><form id="gameCreateForm" class="form"><div class="field"><label>اللعبة</label><select name="gameId">'+GAMES.map(g=>'<option value="'+g[0]+'" '+(gameId===g[0]?"selected":"")+'>'+g[2]+' '+g[1]+' — '+g[3]+' لاعبين</option>').join("")+'</select></div><div class="field"><label>اسم اللعبة</label><input name="gameName" placeholder="يظهر للناس"></div><div class="field"><label>أقصى عدد لاعبين</label><input name="maxPlayers" type="number" min="2" max="8" value="4"></div><button class="btn primary">إنشاء الجلسة</button></form>')}
function botPanel(d,c,l,data,v){const b=d.bot,s=v?.settings||{};return "<h2>"+esc(b.name)+"</h2><p class=\"muted\">"+esc(b.linked_guild_id)+" · "+esc(b.status)+"</p><div class=\"grid\" style=\"margin-top:18px\"><section class=\"card span-6\"><h3>⚙️ إعدادات البوت</h3><form id=\"botSettingsForm\" class=\"form\"><div class=\"field\"><label>Prefix</label><input name=\"prefix\" value=\""+esc(b.prefix)+"\"></div><div class=\"field\"><label>Presence</label><input name=\"presenceText\" value=\""+esc(b.presence_text)+"\"></div><button class=\"btn primary\">حفظ</button></form></section><section class=\"card span-6\"><h3>🔊 الترحيب الصوتي</h3><form id=\"botVoiceForm\" class=\"form\"><div class=\"field\"><label>الروم الصوتي</label><select name=\"channelId\">"+(v?.channels||[]).map(ch=>"<option value=\""+ch.id+"\" "+(s.channel_id===ch.id?"selected":"")+">"+esc(ch.name)+"</option>").join("")+"</select></div><div class=\"field\"><label>العبارة</label><textarea name=\"phrase\" maxlength=\"500\" required>"+esc(s.phrase||"مرحبًا بك في ملاذ 🤍")+"</textarea></div><label class=\"row\"><input type=\"checkbox\" name=\"enabled\" "+(s.enabled===false?"":"checked")+"> يرحب تلقائيًا عند دخول أي شخص</label><div class=\"row\"><button class=\"btn primary\">حفظ الصوت</button><button type=\"button\" class=\"btn secondary\" data-action=\"botVoiceTest\">تجربة الصوت</button></div></form></section><section class=\"card span-6\"><h3>🧩 الإضافات والصلاحيات</h3><p class=\"muted tiny\">"+(c.plugins||[]).length+" إضافة · "+(c.access||[]).length+" مستخدم · "+(c.templates||[]).length+" قالب</p></section><section class=\"card span-12\"><h3>🧾 آخر اللوق</h3><div class=\"list\">"+(l.items||[]).slice(0,16).map(x=>"<div class=\"list-row\"><div class=\"grow\"><b>"+esc(x.event_type)+"</b><small>"+esc(x.username||"system")+" · "+date(x.created_at)+"</small></div></div>").join("")+"</div></section><section class=\"card span-12\"><p class=\"muted tiny\">البيانات الدائمة: "+(data.items||[]).length+" سجل — لا تُحذف بانتهاء الاشتراك.</p></section></div>"}
async function openGame(s,spectator=false){
 activeGame=s.code;
 openModal('<div id="gameRoom"><h2>'+esc(s.gameName)+'</h2><p class="muted">كود الجلسة <b class="session-code">'+esc(s.code)+'</b> · '+(spectator?"مشاهد":"لاعب")+'</p><div id="gameState" class="card"><div class="empty"><b>جاري تجهيز الجولة</b></div></div></div>');
 await refreshGame(s.code);
 clearInterval(gamePoll);gamePoll=setInterval(()=>refreshGame(s.code),1800);
}
async function refreshGame(code){
 try{const d=await api("/api/games/sessions/"+code+"/state");const s=d.session,st=d.state;const el=$("#gameState");if(!el)return;let html='<div class="between"><div><b>'+esc(s.gameName)+'</b><small class="muted">'+(s.players?.length||0)+' لاعبين · '+(s.spectators?.length||0)+' مشاهدين</small></div><span class="pill">'+esc(s.status)+'</span></div>';
 if(s.status==="open"){html+='<div class="empty" style="margin-top:14px"><b>الجلسة بانتظار اللاعبين</b><span>شارك الكود <strong>'+esc(s.code)+'</strong> — لازم لاعبين على الأقل لبدء الجولة.</span></div>';if(me&&me.username===s.ownerUsername)html+='<button class="btn primary" data-game-start data-code="'+esc(code)+'" style="margin-top:14px">ابدأ الجولة</button>'}
 else if(st){html+='<div class="card" style="margin-top:14px"><h3>حالة الجولة</h3><pre style="white-space:pre-wrap;overflow:auto;color:#cbd1dc;font-size:10px;line-height:1.7">'+esc(JSON.stringify(st,null,2).slice(0,10000))+'</pre></div>'}
 el.innerHTML=html;const b=el.querySelector("[data-game-start]");if(b)b.onclick=async()=>{try{await api("/api/games/sessions/"+code+"/start",{method:"POST",body:{}});toast("بدأت الجولة");refreshGame(code)}catch(e){toast(e.message)}}
 }catch(e){if($("#gameState"))$("#gameState").innerHTML='<div class="empty"><b>انتهت أو اختفت الجلسة</b><span>'+esc(e.message)+'</span></div>'}
}
function wireForms(){
 document.addEventListener("submit",async e=>{
  const f=e.target;if(!f.matches("form"))return;e.preventDefault();const data=Object.fromEntries(new FormData(f).entries());
  try{
   if(f.id==="loginForm"){const d=await api("/api/auth/login",{method:"POST",body:data});me=d.user;setUser();menu();closeModal();toast("أهلًا "+me.username);go("home")}
   else if(f.id==="registerForm"){const d=await api("/api/auth/register",{method:"POST",body:data});me=d.user;setUser();menu();closeModal();toast("تم إنشاء الحساب");go("home")}
   else if(f.id==="chatForm"){await api("/api/chat/messages",{method:"POST",body:data});f.reset();render("chat")}
   else if(f.id==="privateForm"||f.id==="privateQuick"){await api("/api/private-messages",{method:"POST",body:data});f.reset();closeModal();toast("تم إرسال الرسالة");go("private-chat")}
   else if(f.id==="groupForm"){await api("/api/groups",{method:"POST",body:data});closeModal();toast("تم إنشاء القروب");render("groups")}
   else if(f.id==="anonForm"){data.revealSender=f.revealSender==="on";await api("/api/anonymous",{method:"POST",body:data});closeModal();toast("تم إرسال الزاجل");render("anonymous")}
   else if(f.id==="jokeForm"){await api("/api/jokes",{method:"POST",body:data});closeModal();render("jokes")}
   else if(f.id==="storyForm"){const d=await api("/api/stories/generate",{method:"POST",body:data});closeModal();openModal('<h2>القصة الجديدة</h2><p class="lead">'+esc(d.story.body)+'</p><button class="btn secondary" data-close>إغلاق</button>')}
   else if(f.id==="reviewForm"){await api("/api/ratings",{method:"POST",body:data});closeModal();render("reviews")}
   else if(f.id==="ticketForm"){await api("/api/tickets",{method:"POST",body:data});closeModal();render("tickets")}
   else if(f.id==="applyForm"){await api("/api/applications",{method:"POST",body:data});closeModal();toast("تم إرسال الطلب");go("home")}
   else if(f.id==="profileForm"){const d=await api("/api/profile",{method:"PATCH",body:data});me={...me,...d.user};setUser();toast("تم حفظ الملف");render("profile")}
   else if(f.id==="passwordForm"){await api("/api/account/password",{method:"PATCH",body:data});f.reset();toast("تم تغيير كلمة المرور")}
   else if(f.id==="gameCreateForm"){const d=await api("/api/games/sessions",{method:"POST",body:data});closeModal();toast("تم إنشاء الجلسة "+d.session.code);render("games")}
   else if(f.id==="botInspectForm"){const d=await api("/api/bots/inspect",{method:"POST",body:{token:data.token}});f.outerHTML='<form id="botCreateForm" class="form"><input type="hidden" name="token" value="'+esc(data.token)+'"><input type="hidden" name="name" value="'+esc(data.name)+'"><div class="field"><label>اختر السيرفر</label><select name="guildId">'+d.guilds.map(g=>'<option value="'+g.id+'">'+esc(g.name)+' — '+(g.isOwner?"Owner":"Administrator")+" · رتبة "+esc(g.userRole)+'</option>').join("")+'</select></div><p class="muted tiny">تم التحقق من البوت. اختر سيرفرًا واحدًا ثم اربطه.</p><button class="btn primary">ربط البوت</button></form>'}
   else if(f.id==="botCreateForm"){const d=await api("/api/bots",{method:"POST",body:data});closeModal();toast("تم ربط "+d.bot.name);render("bots")}
   else if(f.id==="botSettingsForm"){const id=activeBotId;await api("/api/bots/"+id,{method:"PATCH",body:{prefix:data.prefix,presenceText:data.presenceText}});toast("تم حفظ إعدادات البوت")}
   else if(f.id==="botVoiceForm"){await api("/api/bots/"+activeBotId+"/voice",{method:"PATCH",body:{channelId:data.channelId,phrase:data.phrase,enabled:data.enabled==="on"}});toast("🔊 تم حفظ الصوت")}
  }catch(err){toast(err.message)}
 });
}
let activeBotId=null;
const oldBotOpen=actions.botOpen;actions.botOpen=async x=>{activeBotId=x.dataset.id;await oldBotOpen(x)};
document.addEventListener("click",e=>{
 const v=e.target.closest("[data-view]")?.dataset.view;if(v){e.preventDefault();go(v);return}
 const g=e.target.closest("[data-go]")?.dataset.go;if(g){e.preventDefault();go(g);return}
 if(e.target.closest("[data-close]")){closeModal();return}
});
$("#menuBtn").onclick=()=>drawer(!$("#drawer").classList.contains("open"));$("#drawerClose").onclick=()=>drawer(false);$("#drawerShade").onclick=()=>drawer(false);
$("#searchBtn").onclick=()=>{$("#searchModal").classList.remove("hidden");setTimeout(()=>$("#globalSearch").focus(),50)};
$("#globalSearch").oninput=async e=>{const q=e.target.value.trim().toLowerCase(),box=$("#searchResults");if(!q){box.innerHTML="";return}const views=Object.entries(V).filter(([k,v])=>(v[0]+" "+v[1]+" "+k).toLowerCase().includes(q)).map(([k,v])=>'<div class="search-result" data-go="'+k+'"><b>'+v[0]+'</b><small class="muted"> · '+v[1]+"</small></div>");let members=[];if(q.length>=2)try{members=(await api("/api/members/search?q="+encodeURIComponent(q))).members||[]}catch{}box.innerHTML=views.concat(members.slice(0,8).map(m=>'<div class="search-result"><b>'+esc(m.name)+'</b><small class="muted"> · @'+esc(m.username)+' · '+esc(m.rank)+'</small></div>')).join("")};
$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});$("#searchModal").addEventListener("click",e=>{if(e.target.id==="searchModal")$("#searchModal").classList.add("hidden")});
document.addEventListener("input",e=>{if(e.target.id==="memberFilter"){const q=e.target.value.toLowerCase();$$(".member").forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?"":"none")}});
document.addEventListener("input",async e=>{if(e.target.id!=="discordReg")return;const q=e.target.value.trim();const box=$("#discordSuggest");if(q.length<2){box.innerHTML="";return}try{const d=await api("/api/members/search?q="+encodeURIComponent(q));box.innerHTML=(d.members||[]).slice(0,5).map(m=>'<button type="button" class="list-row" data-pick-discord="'+esc(m.username)+'" style="width:100%;text-align:right">'+avatar(m.avatar,m.name)+'<span class="grow"><b>'+esc(m.name)+'</b><small>@'+esc(m.username)+'</small></span></button>').join("")}catch{}});
document.addEventListener("click",e=>{const x=e.target.closest("[data-pick-discord]");if(x){$("#discordReg").value=x.dataset.pickDiscord;$("#discordSuggest").innerHTML='<div class="pill">✓ تم اختيار '+esc(x.dataset.pickDiscord)+'</div>'}});
window.addEventListener("hashchange",()=>render((location.hash||"#home").slice(1)));
window.addEventListener("error",e=>console.error("MLD",e.error||e.message));window.addEventListener("unhandledrejection",e=>console.error("MLD",e.reason));
wireForms();boot();
