const V={
 home:["الرئيسية","كل شيء في مكان واحد."],members:["الأعضاء","أعضاء السيرفر"],top:["الأعلى","ترتيب المجتمع"],roles:["الرتب","رتب المجتمع"],
 games:["الألعاب","جلسات حقيقية — لاعبين ومشاهدين"],groups:["القروبات","مجموعات المجتمع"],chat:["الشات العام","المحادثة العامة"],
 "private-chat":["الخاص","محادثاتك الخاصة"],message:["رسالة خاصة","إرسال رسالة"],jokes:["النكت","محتوى المجتمع"],
 stories:["القصص والصوت","قصص مولدة وصوت الجهاز"],tickets:["التذاكر","الدعم"],apply:["التقديم","طلبات التقديم"],
 reviews:["الآراء","آراء المجتمع"],anonymous:["الفضفضة","رسائل مجهولة"],profile:["ملفي","ملفي الشخصي"],account:["حسابي","إدارة الحساب"],bots:["البوتات","لوحة البوتات والخدمات"],login:["تسجيل الدخول","الدخول إلى الحساب"]
};
const GAMES=[["UNO","أونو",4],["BALOOT","بلوت",4],["JAKAROO","جاكارو",4],["LUDO","لودو",4],["QAWSAR","قوصر",4],["SPYFALL","سباي فول",6],["CODENAMES","كود نيمز",8],["TRIVIA","معلومات عامة",8],["EMOJI_GUESS","تخمين بالإيموجي",8],["TABOO","تابو",8],["RIDDLE_RUSH","سباق الألغاز",8],["WORD_BOMB","قنبلة الكلمات",8],["CATEGORIES","التصنيفات",8],["FASTEST","الأسرع",8],["PICTIONARY","بيكشنري",8],["DRAW_GUESS","ارسم وخمّن",8],["CHARADES","تمثيل صامت",8],["MIMIC","قلّدها",8],["SECRET_WORD","الكلمة السرية",8],["WHOAMI","من أنا؟",8],["WOULD_YOU_RATHER","تفضّل؟",8],["HOT_SEAT","المقعد الساخن",8],["GUESS_PLAYER","خمن اللاعب",8],["LIAR","الكذاب",8],["TRUTH_LIE","صدق أم كذب",8],["DAQSH","دقش",8]];
const $=s=>document.querySelector(s);
const esc=s=>{const d=document.createElement("div");d.textContent=String(s??"");return d.innerHTML};
let me=null, currentGame=null, pollTimer=null;

async function api(u,o={}){
 const opts={credentials:"same-origin",cache:"no-store",...o};
 if(opts.body&&typeof opts.body!=="string"){opts.headers={"Content-Type":"application/json",...(opts.headers||{})};opts.body=JSON.stringify(opts.body)}
 const r=await fetch(u,opts);let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw Error(d.error||"تعذر تنفيذ الطلب");return d;
}
function toast(t){const x=$("#toast");x.textContent=t;x.classList.add("show");clearTimeout(window.tt);window.tt=setTimeout(()=>x.classList.remove("show"),2600)}
function menu(){
 const g=[
  ["الرئيسية",[["الرئيسية","home"]]],
  ["المجتمع",[["الأعضاء","members"],["الأعلى","top"],["الرتب","roles"],["القروبات","groups"],["الآراء","reviews"]]],
  ["التواصل",[["الشات العام","chat"],["الخاص","private-chat"],["رسالة خاصة","message"],["الفضفضة","anonymous"],["التذاكر","tickets"]]],
  ["الألعاب والترفيه",[["جلسات الألعاب","games"],["النكت","jokes"],["القصص والصوت","stories"]]],
  ["الحساب والخدمات",[["ملفي","profile"],["حسابي","account"],["البوتات","bots"],["التقديم","apply"],["تسجيل الدخول","login"]]]
 ];
 $("#menu").innerHTML=g.map(x=>'<div class="folder"><button class="folder-head" type="button">'+esc(x[0])+' <span>⌄</span></button><div class="folder-items">'+x[1].map(y=>'<button type="button" data-view="'+y[1]+'">'+esc(y[0])+"</button>").join("")+"</div></div>").join("");
}
async function stats(){
 try{
  const d=await api("/api/site/stats");
  const s=await api("/api/public/server").catch(()=>({}));
  const memberCount=Number(d.memberCount||s.memberCount||0);
  const online=Number(d.online||0);
  const visits=Number(d.visits||0);
  const set=(id,value)=>{const el=$("#"+id);if(el)el.textContent=value};
  set("membersStat",memberCount.toLocaleString("ar-SA"));
  set("onlineStat",online.toLocaleString("ar-SA"));
  set("visitsStat",visits.toLocaleString("ar-SA"));
  set("discordStat","متصل");
  set("heroSubtitle",s.name?("مجتمع "+s.name+" — متصل مباشرة ببيانات السيرفر."):"مجتمع متكامل بتجربة عربية سلسة، مرتبط مباشرة ببيانات السيرفر.");
 }catch(e){
  ["membersStat","onlineStat","visitsStat"].forEach(id=>{const el=$("#"+id);if(el)el.textContent="—"});
  const el=$("#discordStat");if(el)el.textContent="غير متاح";
 }
}
async function home(){
 $("#status").textContent="آراء المجتمع";
 let reviews=[];try{const d=await api("/api/ratings");reviews=d.reviews||[]}catch{}
 const sample=reviews.slice(0,12);
 const ratings=sample.map(x=>'<article class="card review-card"><div class="row"><div class="review-stars">★★★★★</div><span class="muted">'+esc(x.username||"عضو")+'</span></div><p>'+esc(x.body||x.text||x.content||"رأي من المجتمع")+'</p></article>').join("")||'<article class="card"><b>آراء المجتمع</b><p class="muted">كن أول من يضيف رأيه.</p></article>';
 $("#content").innerHTML='<section class="home-reviews"><div class="home-section-title"><div><p class="kicker">تجارب المجتمع</p><h3>التقييمات والآراء</h3></div><button class="ghost" data-view="reviews">عرض الكل</button></div><div class="content">'+ratings+'</div></section>'+
 '<section class="home-features"><div class="home-section-title"><div><p class="kicker">كل ما تحتاجه</p><h3>مميزات الموقع</h3></div></div><div class="feature-grid">'+
 '<article class="card feature-card"><b>مجتمع متكامل</b><p class="muted">أعضاء، رتب، قروبات، شات عام ورسائل خاصة في مكان واحد.</p></article>'+
 '<article class="card feature-card"><b>ألعاب جماعية</b><p class="muted">جلسات ألعاب للاعبين والمشاهدين مع نظام دخول ومتابعة.</p></article>'+
 '<article class="card feature-card"><b>تواصل وخصوصية</b><p class="muted">محادثات خاصة، مجموعات، تذاكر ورسائل مجهولة.</p></article>'+
 '<article class="card feature-card"><b>حسابك ومجتمعك</b><p class="muted">ملف شخصي، نقاط، رتب وبيانات محفوظة بشكل مستمر.</p></article>'+
 '<article class="card feature-card"><b>بوتات وخدمات</b><p class="muted">ربط وإدارة البوتات من لوحة واحدة مع الصلاحيات والإعدادات.</p></article>'+
 '<article class="card feature-card"><b>تجربة سريعة</b><p class="muted">واجهة بسيطة ومتجاوبة تعمل على الجوال والكمبيوتر.</p></article>'+
 '</div></section>';
}
async function membersView(){
 const d=await api("/api/members"),a=d.members||[];
 $("#status").textContent=a.length+" عضو";
 $("#content").innerHTML='<div class="card" style="grid-column:1/-1"><input id="memberQ" placeholder="ابحث باسم العضو أو Discord..."><div id="memberResults" class="content" style="margin-top:12px"></div></div>';
 const draw=(q="")=>{const z=a.filter(m=>(m.name+" "+m.username+" "+(m.globalName||"")).toLowerCase().includes(q.toLowerCase())).slice(0,120);$("#memberResults").innerHTML=z.map(m=>'<article class="card"><div class="row"><img class="avatar" src="'+esc(m.avatar||"/logo.svg.JPG")+'" alt=""><div><b>'+esc(m.name||m.username)+'</b><div class="muted">@'+esc(m.username||"")+'</div></div></div><p class="muted">'+esc(m.rank||"عضو")+'</p></article>').join("")||'<div class="card">لا توجد نتائج</div>'};
 $("#memberQ").oninput=e=>draw(e.target.value);draw();
}
async function roles(){const d=await api("/api/roles"),a=d.roles||[];$("#status").textContent=a.length+" رتبة";$("#content").innerHTML=a.map(r=>'<article class="card"><b>'+esc(r.name)+'</b><p class="muted">'+Number(r.membersCount||0).toLocaleString("ar-SA")+" أعضاء</p></article>").join("")}
async function top(){const d=await api("/api/top"),a=d.members||[];$("#status").textContent=a.length+" نتيجة";$("#content").innerHTML=a.slice(0,60).map((m,i)=>'<article class="card"><b>الترتيب '+(i+1)+" — "+esc(m.name||m.username)+'</b><p class="muted">'+esc(m.rank||"عضو")+"</p></article>").join("")}
function formCard(title,body){return '<article class="card" style="grid-column:1/-1"><h3 style="margin-top:0">'+esc(title)+"</h3>"+body+"</article>"}
async function groups(){
 const d=await api("/api/groups"),a=d.groups||[];
 $("#status").textContent=a.length+" قروب";
 let html=me?'<article class="card"><b>إنشاء قروب</b><input id="groupName" placeholder="اسم القروب"><input id="groupDesc" placeholder="وصف القروب"><button class="primary" id="groupCreate">إنشاء</button></article>':"";
 html+=a.map(g=>'<article class="card"><b>'+esc(g.name)+'</b><p class="muted">'+esc(g.description||"")+'</p><p class="muted">المالك: '+esc(g.owner_username)+' · '+(g.members?.length||0)+" أعضاء</p>"+(me&&g.owner_username!==me.username?'<button class="ghost" data-group-join="'+g.id+'">طلب انضمام</button>':"")+"</article>").join("");
 $("#content").innerHTML=html||'<div class="card">لا توجد قروبات</div>';
 $("#groupCreate")?.addEventListener("click",async()=>{try{await api("/api/groups",{method:"POST",body:{name:$("#groupName").value,description:$("#groupDesc").value}});toast("تم إنشاء القروب");groups()}catch(e){toast(e.message)}});
 $$("[data-group-join]").forEach(b=>b.onclick=async()=>{try{await api("/api/groups/"+b.dataset.groupJoin+"/join",{method:"POST"});toast("تم إرسال طلب الانضمام")}catch(e){toast(e.message)}});
}
function $$ (s){return [...document.querySelectorAll(s)]}
async function chat(){
 const d=await api("/api/chat/messages"),a=d.messages||[];
 $("#status").textContent="آخر "+a.length+" رسالة";
 $("#content").innerHTML=formCard("الشات العام",'<div id="chatList" style="max-height:430px;overflow:auto">'+a.map(x=>'<div class="card" style="margin-bottom:8px"><b>'+esc(x.username)+'</b><small class="muted"> · '+new Date(x.created_at).toLocaleString("ar-SA")+'</small><p>'+esc(x.body)+'</p></div>').join("")+'</div>'+
 (me?'<div class="row" style="margin-top:12px"><input id="chatText" placeholder="اكتب رسالتك..."><button class="primary" id="chatSend">إرسال</button></div>':'<p class="muted">سجل الدخول للكتابة.</p>'));
 $("#chatSend")?.addEventListener("click",async()=>{try{await api("/api/chat/messages",{method:"POST",body:{body:$("#chatText").value}});chat()}catch(e){toast(e.message)}});
}
function auth(mode="login"){
 const register=mode==="register";
 $("#status").textContent=register?"إنشاء حساب":"تسجيل الدخول";
 $("#content").innerHTML=formCard(register?"إنشاء حساب":"تسجيل الدخول",
 '<input id="authUser" placeholder="اسم المستخدم">'+
 (register?'<input id="authDiscord" placeholder="اسم Discord كما يظهر في السيرفر">':"")+
 '<input id="authPass" type="password" placeholder="كلمة المرور">'+
 '<button class="primary" id="authGo">'+(register?"إنشاء الحساب":"دخول")+"</button>"+
 '<p class="muted" style="cursor:pointer" id="authSwitch">'+(register?"لديك حساب؟ تسجيل الدخول":"مستخدم جديد؟ إنشاء حساب")+"</p>");
 $("#authGo").onclick=async()=>{try{const body={username:$("#authUser").value,password:$("#authPass").value};if(register)body.discordUsername=$("#authDiscord").value;const d=await api("/api/auth/"+(register?"register":"login"),{method:"POST",body});me=d.user;toast(register?"تم إنشاء الحساب":"تم تسجيل الدخول");await render("profile")}catch(e){toast(e.message)}};
 $("#authSwitch").onclick=()=>auth(register?"login":"register");
}
async function profile(){
 if(!me){auth();return}
 const d=await api("/api/profile"),u=d.user;
 $("#status").textContent="الحساب الشخصي";
 $("#content").innerHTML=formCard("ملفي",
 '<div class="row"><img class="avatar" src="'+esc(u.avatar||"/logo.svg.JPG")+'"><div><b>'+esc(u.username)+'</b><div class="muted">'+esc(u.discordUsername||"Discord غير مربوط")+'</div></div></div>'+
 '<input id="bio" maxlength="500" placeholder="نبذة عنك" value="'+esc(u.bio||"")+'">'+
 '<input id="profileDiscord" placeholder="تحديث اسم Discord" value="'+esc(u.discordUsername||"")+'">'+
 '<button class="primary" id="saveProfile">حفظ الملف</button> <button class="ghost" id="logout">تسجيل الخروج</button>');
 $("#saveProfile").onclick=async()=>{try{const r=await api("/api/profile",{method:"PATCH",body:{bio:$("#bio").value,discordUsername:$("#profileDiscord").value}});me=r.user;toast("تم حفظ الملف")}catch(e){toast(e.message)}};
 $("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});me=null;toast("تم تسجيل الخروج");render("home")};
}
async function account(){
 if(!me){auth();return}
 const d=await api("/api/account"),u=d.user;
 $("#status").textContent="الحساب والصلاحيات";
 $("#content").innerHTML='<article class="card"><b>اسم المستخدم</b><p>'+esc(u.username)+'</p><b>الصلاحية</b><p>'+esc(u.role)+'</p><b>النقاط</b><p>'+Number(u.points||0)+'</p><b>تاريخ الإنشاء</b><p class="muted">'+new Date(u.created_at).toLocaleString("ar-SA")+'</p></article>'+
 formCard("تغيير كلمة المرور",'<input id="oldPass" type="password" placeholder="كلمة المرور الحالية"><input id="newPass" type="password" placeholder="كلمة المرور الجديدة"><button class="primary" id="passGo">تحديث كلمة المرور</button>');
 $("#passGo").onclick=async()=>{try{await api("/api/account/password",{method:"PATCH",body:{oldPassword:$("#oldPass").value,newPassword:$("#newPass").value}});toast("تم تحديث كلمة المرور")}catch(e){toast(e.message)}};
}
async function privateChat(){
 if(!me){auth();return}
 const d=await api("/api/private-messages"),a=d.messages||[];
 $("#status").textContent="المحادثات الخاصة";
 $("#content").innerHTML=formCard("الرسائل الخاصة",
 '<div class="row"><input id="pmTo" placeholder="اسم المستخدم أو Discord"><input id="pmBody" placeholder="اكتب الرسالة"><button class="primary" id="pmSend">إرسال</button></div>'+
 '<div style="margin-top:14px">'+a.map(x=>'<div class="card" style="margin-bottom:8px"><b>'+esc(x.sender_username)+" → "+esc(x.recipient_username)+'</b><p>'+esc(x.body)+'</p><small class="muted">'+new Date(x.created_at).toLocaleString("ar-SA")+"</small></div>").join("")+"</div>");
 $("#pmSend").onclick=async()=>{try{await api("/api/private-messages",{method:"POST",body:{recipient:$("#pmTo").value,body:$("#pmBody").value}});toast("تم إرسال الرسالة");privateChat()}catch(e){toast(e.message)}};
}
async function message(){return privateChat()}
async function anonymous(){
 if(!me){auth();return}
 const d=await api("/api/anonymous"),a=d.items||[];
 $("#status").textContent="الزاجل";
 $("#content").innerHTML=formCard("الرسائل المجهولة — الزاجل",'<input id="anonTo" placeholder="اسم المستلم أو Discord"><input id="anonTitle" placeholder="عنوان الرسالة"><textarea id="anonBody" style="width:100%;min-height:130px" placeholder="اكتب الرسالة"></textarea><label class="row" style="gap:8px"><input id="anonReveal" type="checkbox" style="width:auto"> إظهار اسمي للمستلم مع منشن</label><button class="primary" id="anonSend">إرسال الزاجل</button><h3>الوارد</h3><div>'+a.map(x=>'<div class="card" style="margin-bottom:8px"><b>'+esc(x.title||"رسالة")+'</b><p>'+esc(x.body)+'</p><small class="muted">'+(x.sender?("من "+esc(x.mention||x.sender)):"مجهول")+' · '+new Date(x.created_at).toLocaleString("ar-SA")+'</small></div>').join("")+"</div>");
 $("#anonSend").onclick=async()=>{try{await api("/api/anonymous",{method:"POST",body:{recipient:$("#anonTo").value,title:$("#anonTitle").value,body:$("#anonBody").value,revealSender:$("#anonReveal").checked}});toast("تم إرسال الزاجل");anonymous()}catch(e){toast(e.message)}};
}
async function jokes(){
 const d=await api("/api/jokes"),a=d.items||[];
 $("#status").textContent=a.length+" نكتة";
 $("#content").innerHTML=(me?'<article class="card"><input id="jokeText" placeholder="أضف نكتتك"><button class="primary" id="jokeAdd">إضافة نكتة</button></article>':"")+a.map(x=>'<article class="card"><b>😂 '+esc(x.username)+'</b><p>'+esc(x.body)+'</p><button class="ghost" data-joke-like="'+x.id+'">👍 '+x.likes+'</button> <button class="ghost" data-joke-dislike="'+x.id+'">👎 '+x.dislikes+"</button></article>").join("");
 $("#jokeAdd")?.addEventListener("click",async()=>{try{await api("/api/jokes",{method:"POST",body:{body:$("#jokeText").value}});jokes()}catch(e){toast(e.message)}});
 $$("[data-joke-like]").forEach(b=>b.onclick=()=>reactJoke(b.dataset.jokeLike,"like"));$$("[data-joke-dislike]").forEach(b=>b.onclick=()=>reactJoke(b.dataset.jokeDislike,"dislike"));
}
async function reactJoke(id,type){try{await api("/api/jokes/"+id+"/react",{method:"POST",body:{type}});jokes()}catch(e){toast(e.message)}}
async function stories(){
 $("#status").textContent="القصص والصوت";
 $("#content").innerHTML=formCard("ولّد قصة",
 '<div class="row"><select id="storyGenre"><option>مغامرة</option><option>غموض</option><option>رعب خفيف</option><option>كوميديا</option><option>خيال</option></select><select id="storyLength"><option>قصيرة</option><option>متوسطة</option><option>طويلة</option></select><button class="primary" id="storyGo">توليد</button><button class="ghost" id="speak">🔊 صوت</button></div><article id="storyOut" class="card" style="margin-top:14px">اختر الإعدادات ثم ولّد.</article>');
 $("#storyGo").onclick=async()=>{try{const d=await api("/api/stories/generate",{method:"POST",body:{genre:$("#storyGenre").value,length:$("#storyLength").value}});$("#storyOut").textContent=d.story.body;$("#speak").onclick=()=>speechSynthesis.speak(new SpeechSynthesisUtterance(d.story.body))}catch(e){toast(e.message)}};
}
async function tickets(){
 if(!me){auth();return}
 const d=await api("/api/tickets"),a=d.items||[];
 $("#status").textContent="التذاكر";
 $("#content").innerHTML='<article class="card"><input id="ticketSubject" placeholder="عنوان التذكرة"><textarea id="ticketBody" style="width:100%;min-height:130px" placeholder="اشرح مشكلتك"></textarea><button class="primary" id="ticketGo">فتح تذكرة</button></article>'+a.map(x=>'<article class="card"><b>#'+x.id+" · "+esc(x.subject)+'</b><p class="muted">الحالة: '+esc(x.status)+'</p><button class="ghost" data-ticket="'+x.id+'">فتح</button></article>').join("");
 $("#ticketGo").onclick=async()=>{try{await api("/api/tickets",{method:"POST",body:{subject:$("#ticketSubject").value,body:$("#ticketBody").value}});toast("تم فتح التذكرة");tickets()}catch(e){toast(e.message)}};
 $$("[data-ticket]").forEach(b=>b.onclick=()=>ticketDetail(b.dataset.ticket));
}
async function ticketDetail(id){const d=await api("/api/tickets/"+id);$("#content").innerHTML=formCard("تذكرة #"+id,"<p>"+esc(d.ticket.subject)+"</p>"+d.messages.map(x=>'<div class="card"><b>'+esc(x.username)+'</b><p>'+esc(x.body)+"</p></div>").join(""))}
async function applyView(){
 $("#status").textContent="التقديم";
 $("#content").innerHTML=formCard("التقديم للإدارة",'<select id="applyType"><option value="staff">إدارة</option><option value="event">تنظيم فعاليات</option><option value="other">أخرى</option></select><input id="applyDiscord" placeholder="اسم Discord"><textarea id="applyBody" style="width:100%;min-height:160px" placeholder="ليش تبي تقدم؟"></textarea><button class="primary" id="applyGo">إرسال التقديم</button>');
 $("#applyGo").onclick=async()=>{try{await api("/api/applications",{method:"POST",body:{type:$("#applyType").value,discordUsername:$("#applyDiscord").value,body:$("#applyBody").value}});toast("تم إرسال التقديم")}catch(e){toast(e.message)}};
}
async function reviews(){
 const d=await api("/api/ratings"),a=d.items||[];
 $("#status").textContent=a.length+" رأي";
 $("#content").innerHTML=(me?'<article class="card"><select id="rate"><option value="5">5 نجوم</option><option value="4">4 نجوم</option><option value="3">3 نجوم</option><option value="2">نجمتان</option><option value="1">نجمة</option></select><textarea id="rateBody" style="width:100%;min-height:100px" placeholder="اكتب رأيك"></textarea><button class="primary" id="rateGo">إضافة رأي</button></article>':"")+a.map(x=>'<article class="card"><b>'+("⭐".repeat(x.value))+'</b><p>'+esc(x.body)+'</p><small class="muted">— '+esc(x.username)+'</small></article>').join("");
 $("#rateGo")?.addEventListener("click",async()=>{try{await api("/api/ratings",{method:"POST",body:{value:Number($("#rate").value),body:$("#rateBody").value}});reviews()}catch(e){toast(e.message)}});
}
async function games(){
 const d=await api("/api/games/sessions"),sessions=d.sessions||[];
 $("#status").textContent="الجلسات المفتوحة";
 const cards=GAMES.map(g=>'<article class="card"><b>'+esc(g[1])+'</b><p class="muted">حتى '+g[2]+' لاعبين</p>'+(me?'<button class="primary" data-create="'+g[0]+'">إنشاء جلسة</button>':'<p class="muted">سجل الدخول للإنشاء</p>')+'</article>').join("");
 const list=sessions.map(x=>'<article class="card"><b>'+esc(x.gameName)+' · '+esc(x.code)+'</b><p class="muted">المضيف: '+esc(x.ownerUsername)+' · '+x.players.length+'/'+x.maxPlayers+' لاعبين · '+x.spectators.length+' مشاهدين</p><button class="ghost" data-join="'+esc(x.code)+'">انضمام</button> <button class="ghost" data-watch="'+esc(x.code)+'">مشاهدة</button></article>').join("");
 $("#content").innerHTML=cards+list;
 $$("[data-create]").forEach(b=>b.onclick=async()=>{try{const g=GAMES.find(x=>x[0]===b.dataset.create);const d=await api("/api/games/sessions",{method:"POST",body:{gameId:g[0],gameName:g[1],maxPlayers:g[2]}});toast("الجلسة "+d.session.code+" جاهزة");openGame(d.session.code)}catch(e){toast(e.message)}});
 $$("[data-join]").forEach(b=>b.onclick=async()=>{try{await api("/api/games/sessions/"+b.dataset.join+"/join",{method:"POST"});openGame(b.dataset.join)}catch(e){toast(e.message)}});
 $$("[data-watch]").forEach(b=>b.onclick=async()=>{try{await api("/api/games/sessions/"+b.dataset.watch+"/spectate",{method:"POST"});openGame(b.dataset.watch)}catch(e){toast(e.message)}});
}
async function openGame(code){
 clearInterval(pollTimer);currentGame=code;await gameState();pollTimer=setInterval(gameState,1300);
}
async function gameState(){
 if(!currentGame)return;
 try{
  const d=await api("/api/games/sessions/"+currentGame+"/state");
  const session=d.session,state=d.state||{};
  $("#viewTitle").textContent=session.gameName+" · "+session.code;
  $("#viewSub").textContent=session.status==="playing"?"اللعبة جارية":"اللوبي";
  $("#status").textContent=(session.players?.length||0)+" لاعبين · "+(session.spectators?.length||0)+" مشاهدين";
  const isHost=me&&me.username===session.ownerUsername;
  let html='<article class="card" style="grid-column:1/-1"><div class="row"><div><b>اللاعبون</b><p class="muted">'+(session.players||[]).map(x=>esc(x.username)).join(" · ")+'</p></div><div><b>المشاهدون</b><p class="muted">'+(session.spectators||[]).map(x=>esc(x.username)).join(" · ")+'</p></div></div>';
  if(session.status==="open"&&isHost)html+='<button class="primary" id="startGame">بدء الجولة</button>';
  html+='</article>';
  if(session.status==="playing")html+=gameControls(session,state);else html+='<article class="card"><b>بانتظار البداية</b><p class="muted">شارك كود الجلسة مع اللاعبين ثم ابدأ الجولة.</p></article>';
  $("#content").innerHTML=html;
  $("#startGame")?.addEventListener("click",async()=>{try{await api("/api/games/sessions/"+session.code+"/start",{method:"POST"});gameState()}catch(e){toast(e.message)}});
  $$("[data-action]").forEach(btn=>btn.onclick=async()=>{
   try{
    const data={};
    if(btn.dataset.index!=null)data.index=Number(btn.dataset.index);
    if(btn.dataset.token!=null)data.token=Number(btn.dataset.token);
    if(btn.dataset.color)data.color=btn.dataset.color;
    if(btn.dataset.mode)data.mode=btn.dataset.mode;
    if(btn.dataset.player!=null)data.player=Number(btn.dataset.player);
    if(btn.dataset.targetIndex!=null)data.targetIndex=Number(btn.dataset.targetIndex);
    if(btn.dataset.bid)data.bid=btn.dataset.bid;
    await api("/api/games/sessions/"+session.code+"/action",{method:"POST",body:{action:btn.dataset.action,data}});
    gameState();
   }catch(e){toast(e.message)}
  });
 }catch(e){toast(e.message);clearInterval(pollTimer)}
}
function gameControls(session,st){
 const p=st.private||{};
 const turn=st.players?.[st.turnIndex]?.username||st.players?.[st.qawsarTurn]?.username||"—";
 let h='<article class="card" style="grid-column:1/-1"><b>الدور: '+esc(turn)+'</b><p class="muted">'+esc(st.prompt||st.lastAction?.type||st.lastAction||"")+'</p>';
 if(st.game==="UNO"){
  h+='<p>لون اللعب: '+esc(st.color||"—")+' · السحب: '+esc(st.drawCount??0)+'</p><div class="row">'+(st.hand||[]).map((card,i)=>'<button class="primary" data-action="playCard" data-index="'+i+'" data-color="'+esc(card.color||"")+'">'+esc(card.value)+' '+esc(card.color)+'</button>').join("")+'</div><button class="ghost" data-action="draw">سحب ورقة</button>';
 }else if(st.game==="LUDO"){
  h+='<p>النرد: '+esc(st.dice??"—")+'</p><button class="primary" data-action="roll">🎲 رمي النرد</button><div class="row">'+(st.legalTokens||[]).map(i=>'<button class="ghost" data-action="moveToken" data-token="'+i+'">تحريك القطعة '+(i+1)+'</button>').join("")+'</div>';
 }else if(st.game==="JAKAROO"||st.game==="BALOOT"){
  h+='<div class="row">'+(st.hand||[]).map((card,i)=>'<button class="ghost" data-action="playCard" data-index="'+i+'">'+esc((card.rank||"")+(card.suit||""))+'</button>').join("")+'</div>';
  if(st.game==="BALOOT"&&st.phase==="bidding")h+='<button class="ghost" data-action="bid" data-bid="pass">بس</button><button class="primary" data-action="bid" data-bid="sun">صن</button><button class="primary" data-action="bid" data-bid="hokum">حكم</button>';
 }else if(st.game==="QAWSAR"){
  h+='<p>الحالة: '+esc(st.qawsarPhase||"draw")+' · المطروحة: '+esc(st.discarded?.rank||"—")+'</p>';
  h+=st.qawsarPhase==="draw"?'<button class="primary" data-action="draw">سحب</button><button class="ghost" data-action="takeDiscard" data-index="0">خذ المطروحة</button>':'<button class="primary" data-action="playCard" data-index="0" data-mode="swap">استبدل الورقة</button>';
  h+='<p class="muted">يدك: '+(p.hand||[]).map(x=>esc(x.card?.rank||x.rank||"?")).join(" · ")+'</p>';
 }else{
  h+='<div class="row"><input id="genericText" placeholder="إجابتك"><button class="primary" id="genericSend">إرسال</button></div>';
  setTimeout(()=>$("#genericSend")?.addEventListener("click",async()=>{try{await api("/api/games/sessions/"+currentGame+"/action",{method:"POST",body:{action:"submit",data:{text:$("#genericText").value}}});gameState()}catch(e){toast(e.message)}}),0);
 }
 return h+"</article>";
}
async function bots(){
 if(!me){auth();return}
 const d=await api("/api/bots"),a=d.bots||[];
 $("#status").textContent=a.length+" بوت";
 let html=formCard("ربط بوت جديد",
 ''+
 '<input id="botName" placeholder="اسم البوت">'+
 '<input id="botToken" type="password" autocomplete="off" placeholder="Bot Token">'+
 '<button class="primary" id="botInspect">فحص التوكن واختيار السيرفر</button><div id="botGuildPicker" style="display:none;margin-top:12px"></div>'+
 '<button class="primary" id="botAdd" style="display:none">ربط وتشغيل البوت</button>');
 html+=a.map(b=>'<article class="card"><div class="row"><div><b>'+esc(b.name)+'</b><div class="muted">السيرفر: '+esc(b.guild_name||b.linked_guild_id||"—")+'</div></div><span class="badge">'+esc(b.status||"offline")+'</span></div><p class="muted">Prefix: '+esc(b.prefix||"!")+' · '+esc(b.presence_mode||"watching")+'</p><button class="primary" data-bot="'+b.id+'">لوحة التحكم</button> <button class="ghost" data-botlogs="'+b.id+'">اللوقات</button></article>').join("");
 $("#content").innerHTML=html||'<div class="card">لا توجد بوتات.</div>';
 let inspected=null;
 $("#botInspect")?.addEventListener("click",async()=>{try{const token=$("#botToken").value.trim();if(!token)throw Error("اكتب توكن البوت");const d=await api("/api/bots/inspect",{method:"POST",body:{token}});inspected=d;const p=$("#botGuildPicker");p.style.display="block";p.innerHTML='<label><b>اختر السيرفر</b><select id="botGuild" style="width:100%;margin-top:8px">'+d.guilds.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name)+' · '+esc(g.userRole)+' · البوت: '+esc(g.botRole)+'</option>').join("")+'</select></label>';$("#botAdd").style.display="block"}catch(e){toast(e.message)}});
 $("#botAdd")?.addEventListener("click",async()=>{try{if(!inspected)throw Error("افحص التوكن أولًا");await api("/api/bots",{method:"POST",body:{name:$("#botName").value.trim(),token:$("#botToken").value.trim(),guildId:$("#botGuild").value}});toast("تم الربط وتشغيل البوت");bots()}catch(e){toast(e.message)}});
 $$("[data-bot]").forEach(x=>x.onclick=()=>botPanel(x.dataset.bot));$$("[data-botlogs]").forEach(x=>x.onclick=()=>botLogs(x.dataset.botlogs));
}
async function botPanel(id){
 const d=await api("/api/bots/"+id),b=d.bot;
 const c=await api("/api/bots/"+id+"/control");
 const perms=c.permissions||[];
 const pluginNames=["protection","tickets","applications","broadcast","giveaways","games","bank","music","streak"];
 $("#status").textContent="مركز قيادة "+b.name;
 const accessRows=(c.access||[]).map(x=>'<div class="card" style="margin-bottom:8px"><b>'+esc(x.username)+'</b><div class="muted">'+esc((x.permissions||[]).join(" · ")||"بدون صلاحيات")+'</div></div>').join("")||'<p class="muted">لا يوجد مديرون إضافيون.</p>';
 const templateRows=(c.templates||[]).map(x=>'<div class="card" style="margin-bottom:8px"><div class="row"><b>'+esc(x.command)+'</b><button class="ghost" data-tpl-toggle="'+x.id+'">'+(x.enabled?"تعطيل":"تفعيل")+'</button></div><p class="muted">'+esc(x.name)+' · '+esc(x.description||"")+'</p><p>'+esc(x.response_template)+'</p></div>').join("")||'<p class="muted">لا توجد قوالب. أضف أول أمر من النموذج.</p>';
 const pluginRows=pluginNames.map(k=>{const p=(c.plugins||[]).find(x=>x.plugin_key===k);return '<div class="card"><div class="row"><div><b>'+esc(k)+'</b><div class="muted"></div></div><button class="'+(p?.enabled===false?"ghost":"primary")+'" data-plugin="'+k+'">'+(p?.enabled===false?"تشغيل":"مفعلة")+'</button></div></div>'}).join("");
 $("#content").innerHTML=formCard("الإعدادات الأساسية",
 '<div class="row" style="flex-wrap:wrap"><span class="badge">سيرفر واحد</span><span class="badge">بيانات دائمة</span><span class="badge">صلاحيات دقيقة</span><span class="badge">قوالب أوامر</span></div>'+
 '<input id="botPrefix" maxlength="8" value="'+esc(b.prefix||"!")+'" placeholder="Prefix">'+
 '<select id="botPresence"><option value="watching" '+(b.presence_mode==="watching"?"selected":"")+' >Watching</option><option value="playing" '+(b.presence_mode==="playing"?"selected":"")+' >Playing</option></select>'+
 '<input id="botPresenceText" maxlength="190" value="'+esc(b.presence_text||"")+'" placeholder="نص الحالة">'+
 '<label class="row"><input id="botHide" type="checkbox" style="width:auto" '+(b.hide_website?"checked":"")+'> إخفاء رابط الموقع (يتطلب اشتراكًا)</label>'+
 '<button class="primary" id="botSave">حفظ الإعدادات</button>')+
 formCard("قوالب الأوامر",
 '<input id="tplName" placeholder="اسم القالب — مثال: ترحيب">'+
 '<input id="tplCommand" placeholder="الأمر بدون prefix — مثال: welcome">'+
 '<input id="tplDesc" placeholder="وصف مختصر">'+
 '<textarea id="tplResponse" rows="4" placeholder="الرد. متغيرات: {user} {username} {bot} {guild} {args}"></textarea>'+
 '<input id="tplRoles" placeholder="رتب مسموحة: IDs أو أسماء، مفصولة بفاصلة (اختياري)">'+
 '<input id="tplChannels" placeholder="قنوات مسموحة: IDs مفصولة بفاصلة (اختياري)">'+
 '<button class="primary" id="tplAdd">إضافة الأمر</button><div style="margin-top:12px">'+templateRows+'</div>')+
 formCard("الإضافات",
 '<p class="muted">كل إضافة تعمل كوحدة مستقلة؛ إيقافها لا يحذف إعداداتها أو بياناتها.</p><div class="content">'+pluginRows+'</div>')+
 formCard("الصلاحيات الدقيقة",
 '<input id="accessUser" placeholder="اسم مستخدم المنصة">'+
 '<div class="row" style="flex-wrap:wrap">'+perms.map(p=>'<label class="badge"><input type="checkbox" class="accessPerm" value="'+p+'" style="width:auto"> '+p+'</label>').join("")+'</div>'+
 '<button class="primary" id="accessAdd">منح الصلاحيات</button><div style="margin-top:12px">'+accessRows+'</div>')+
 '<div class="card"><b></b><p class="muted">المالك يحتفظ بالتحكم الكامل. كل تغيير مهم يسجل في اللوقات، والاشتراك يوقف الميزة فقط ولا يحذف البيانات.</p></div>';
 $("#botSave").onclick=async()=>{try{await api("/api/bots/"+id,{method:"PATCH",body:{prefix:$("#botPrefix").value,presenceMode:$("#botPresence").value,presenceText:$("#botPresenceText").value,hideWebsite:$("#botHide").checked}});toast("تم حفظ الإعدادات");botPanel(id)}catch(e){toast(e.message)}};
 $("#tplAdd").onclick=async()=>{try{const roles=$("#tplRoles").value.split(",").map(x=>x.trim()).filter(Boolean),channels=$("#tplChannels").value.split(",").map(x=>x.trim()).filter(Boolean);await api("/api/bots/"+id+"/templates",{method:"POST",body:{name:$("#tplName").value,command:$("#tplCommand").value,description:$("#tplDesc").value,responseTemplate:$("#tplResponse").value,allowedRoles:roles,channels}});toast("تمت إضافة الأمر");botPanel(id)}catch(e){toast(e.message)}};
 $$("[data-tpl-toggle]").forEach(x=>x.onclick=async()=>{const t=(c.templates||[]).find(q=>String(q.id)===String(x.dataset.tplToggle));if(!t)return;try{await api("/api/bots/"+id+"/templates/"+t.id,{method:"PATCH",body:{enabled:!t.enabled}});botPanel(id)}catch(e){toast(e.message)}});
 $$("[data-plugin]").forEach(x=>x.onclick=async()=>{try{const old=(c.plugins||[]).find(p=>p.plugin_key===x.dataset.plugin),enabled=old?.enabled===false;await api("/api/bots/"+id+"/plugins/"+x.dataset.plugin,{method:"PATCH",body:{enabled}});toast(enabled?"تم تشغيل الإضافة":"تم إيقاف الإضافة");botPanel(id)}catch(e){toast(e.message)}});
 $("#accessAdd").onclick=async()=>{try{const permissions=$$(".accessPerm:checked").map(x=>x.value);await api("/api/bots/"+id+"/access",{method:"POST",body:{username:$("#accessUser").value,permissions}});toast("تم تحديث صلاحيات المستخدم");botPanel(id)}catch(e){toast(e.message)}};
}


async function render(v){
 clearInterval(pollTimer);v=V[v]?v:"home";$("#viewTitle").textContent=V[v][0];$("#viewSub").textContent=V[v][1];$("#status").textContent="جاري تحميل البيانات...";$("#content").innerHTML="";
 try{
  if(v==="home")return home();if(v==="bots")return bots();if(v==="members")return membersView();if(v==="roles")return roles();if(v==="top")return top();if(v==="groups")return groups();if(v==="chat")return chat();if(v==="private-chat")return privateChat();if(v==="message")return message();if(v==="anonymous")return anonymous();if(v==="jokes")return jokes();if(v==="stories")return stories();if(v==="tickets")return tickets();if(v==="apply")return applyView();if(v==="reviews")return reviews();if(v==="profile")return profile();if(v==="account")return account();if(v==="login")return auth();if(v==="games")return games();
 }catch(e){$("#status").textContent=e.message;toast(e.message)}
}
async function boot(){
 try{const d=await api("/api/auth/me");me=d.user||null}catch{me=null}
 menu();await render(location.hash.slice(1)||"home");await stats();
api("/api/site/visit",{method:"POST"}).then(()=>stats()).catch(()=>{});
setInterval(stats,15000);
}
document.addEventListener("click",e=>{
 const f=e.target.closest(".folder-head");if(f){f.parentElement.classList.toggle("open");return}
 const b=e.target.closest("[data-view]");if(b){const v=b.dataset.view;$("#drawer").classList.remove("open");history.replaceState(null,"","#"+v);render(v);return}
});
const menuBtn=$("#menuBtn"),drawer=$("#drawer");
function toggleMenu(e){
 if(e){e.preventDefault();e.stopPropagation()}
 if(!drawer)return;
 const open=!drawer.classList.contains("open");
 drawer.classList.toggle("open",open);
 drawer.setAttribute("aria-hidden",String(!open));
}
if(menuBtn&&drawer){
 const runMenu=(e)=>{
  if(e){e.preventDefault();e.stopPropagation()}
  const open=!drawer.classList.contains("open");
  drawer.classList.toggle("open",open);
  drawer.setAttribute("aria-hidden",String(!open));
  menuBtn.setAttribute("aria-expanded",String(open));
 };
 menuBtn.addEventListener("pointerup",runMenu);
 menuBtn.addEventListener("keydown",e=>{
  if(e.key==="Enter"||e.key===" "){e.preventDefault();runMenu(e)}
 });
}
document.addEventListener("click",e=>{
 if(drawer&&drawer.classList.contains("open")&&!drawer.contains(e.target)&&!menuBtn?.contains(e.target)){drawer.classList.remove("open");drawer.setAttribute("aria-hidden","true")}
});
window.addEventListener("hashchange",()=>render(location.hash.slice(1)||"home"));
boot();
