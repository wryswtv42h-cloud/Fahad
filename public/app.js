const V={
 home:["الرئيسية","كل شيء في مكان واحد."],members:["الأعضاء","أعضاء السيرفر"],top:["الأعلى","ترتيب المجتمع"],roles:["الرتب","رتب المجتمع"],
 games:["الألعاب","جلسات حقيقية — لاعبين ومشاهدين"],groups:["القروبات","مجموعات المجتمع"],chat:["الشات العام","المحادثة العامة"],
 "private-chat":["الخاص","محادثاتك الخاصة"],message:["رسالة خاصة","إرسال رسالة"],jokes:["النكت","محتوى المجتمع"],
 stories:["القصص والصوت","قصص مولدة وصوت الجهاز"],tickets:["التذاكر","الدعم"],apply:["التقديم","طلبات التقديم"],
 reviews:["الآراء","آراء المجتمع"],anonymous:["الفضفضة","رسائل مجهولة"],profile:["ملفي","ملفي الشخصي"],account:["حسابي","إدارة الحساب"],login:["تسجيل الدخول","الدخول إلى الحساب"]
};
const GAMES=[
 ["UNO","أونو",4],["BALOOT","بلوت",4],["JAKAROO","جاكارو",4],["LUDO","لودو",4],["QAWSAR","قوصر",4],
 ["SPYFALL","سباي فول",6],["CODENAMES","كود نيمز",8],["TRIVIA","معلومات عامة",8],["EMOJI_GUESS","تخمين بالإيموجي",8]
];
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
  ["الحساب والخدمات",[["ملفي","profile"],["حسابي","account"],["التقديم","apply"],["تسجيل الدخول","login"]]]
 ];
 $("#menu").innerHTML=g.map(x=>'<div class="folder"><button class="folder-head" type="button">'+esc(x[0])+' <span>⌄</span></button><div class="folder-items">'+x[1].map(y=>'<button type="button" data-view="'+y[1]+'">'+esc(y[0])+"</button>").join("")+"</div></div>").join("");
}
async function stats(){
 try{const d=await api("/api/site/stats");$("#membersStat").textContent=Number(d.memberCount||0).toLocaleString("ar-SA");$("#onlineStat").textContent=Number(d.online||0).toLocaleString("ar-SA");$("#visitsStat").textContent=Number(d.visits||0).toLocaleString("ar-SA");$("#discordStat").textContent="متصل"}catch{$("#discordStat").textContent="غير متاح"}
}
function home(){
 $("#status").textContent=me?"مرحبًا "+me.username:"النظام يعمل";
 $("#content").innerHTML='<article class="card"><b>ملاذ</b><p class="muted">منصة عربية مرتبطة ببيانات السيرفر وقواعد PostgreSQL.</p></article>'+
 '<article class="card"><b>الألعاب</b><p class="muted">جلسات حقيقية للاعبين والمشاهدين مع حفظ حالة الجولة.</p></article>'+
 '<article class="card"><b>المجتمع</b><p class="muted">قروبات، شات عام، خاص، رسائل، تذاكر، تقديم وآراء.</p></article>'+
 '<article class="card"><b>الحساب</b><p class="muted">'+(me?"أنت مسجل باسم "+esc(me.username):"سجل الدخول لفتح المزايا الخاصة.")+"</p></article>";
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
 $("#status").textContent="الفضفضة";
 $("#content").innerHTML=formCard("إرسال فضفضة مجهولة",'<input id="anonTo" placeholder="اسم المستلم"><textarea id="anonBody" style="width:100%;min-height:130px" placeholder="اكتب ما تبي بدون اسمك"></textarea><button class="primary" id="anonSend">إرسال مجهول</button><h3>الوارد</h3><div>'+a.map(x=>'<div class="card" style="margin-bottom:8px"><span class="muted">مجهولة</span><p>'+esc(x.body)+'</p></div>').join("")+"</div>");
 $("#anonSend").onclick=async()=>{try{await api("/api/anonymous",{method:"POST",body:{recipient:$("#anonTo").value,body:$("#anonBody").value}});toast("تم الإرسال");anonymous()}catch(e){toast(e.message)}};
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
 const cards=GAMES.map(g=>'<article class="card"><b>'+g[1]+'</b><p class="muted">حتى '+g[2]+" لاعبين</p>"+(me?'<button class="primary" data-create="'+g[0]+'">إنشاء جلسة</button>':"<p class="muted">سجل الدخول للإنشاء</p>")+"</article>").join("");
 const list=sessions.map(s=>'<article class="card"><b>'+esc(s.gameName)+" · "+esc(s.code)+'</b><p class="muted">المضيف: '+esc(s.ownerUsername)+" · "+s.players.length+"/"+s.maxPlayers+" لاعبين · "+s.spectators.length+" مشاهدين</p><button class="ghost" data-join=""+esc(s.code)+'">انضمام</button> <button class="ghost" data-watch="'+esc(s.code)+'">مشاهدة</button></article>').join("");
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
  const d=await api("/api/games/sessions/"+currentGame+"/state"),s=d.session,state=d.state||{};
  $("#viewTitle").textContent=s.gameName+" · "+s.code;$("#viewSub").textContent=s.status==="playing"?"اللعبة جارية":"اللوبي";
  $("#status").textContent=s.players.length+" لاعبين · "+s.spectators.length+" مشاهدين";
  const isHost=me&&me.username===s.ownerUsername;
  let html='<article class="card" style="grid-column:1/-1"><div class="row"><div><b>اللاعبون</b><p class="muted">'+s.players.map(x=>esc(x.username)).join(" · ")+"</p></div><div><b>المشاهدون</b><p class="muted">"+s.spectators.map(x=>esc(x.username)).join(" · ")+"</p></div></div>"+(s.status==="open"&&isHost?'<button class="primary" id="startGame">بدء الجولة</button>':"")+"</article>";
  if(s.status==="playing")html+=gameControls(s,state);else html+='<article class="card"><b>بانتظار البداية</b><p class="muted">شارك كود الجلسة مع اللاعبين ثم ابدأ الجولة من حساب المضيف.</p></article>';
  $("#content").innerHTML=html;
  $("#startGame")?.addEventListener("click",async()=>{try{await api("/api/games/sessions/"+code+"/start",{method:"POST"});gameState()}catch(e){toast(e.message)}});
  $$("[data-action]").forEach(b=>b.onclick=async()=>{try{const data={};if(b.dataset.index!=null)data.index=Number(b.dataset.index);if(b.dataset.token!=null)data.token=Number(b.dataset.token);if(b.dataset.color)data.color=b.dataset.color;if(b.dataset.mode)data.mode=b.dataset.mode;if(b.dataset.player!=null)data.player=Number(b.dataset.player);if(b.dataset.targetIndex!=null)data.targetIndex=Number(b.dataset.targetIndex);await api("/api/games/sessions/"+code+"/action",{method:"POST",body:{action:b.dataset.action,data}});gameState()}catch(e){toast(e.message)}});
 }catch(e){toast(e.message);clearInterval(pollTimer)}
}
function gameControls(s,st){
 const p=st.private||{},turn=s.players?.[st.turnIndex]?.username||s.players?.[st.qawsarTurn]?.username||"—";
 let h='<article class="card" style="grid-column:1/-1"><b>الدور: '+esc(turn)+"</b><p class="muted">"+esc(st.prompt||st.lastAction?.type||st.lastAction||"")+"</p>";
 if(st.game==="UNO"){h+="<p>لون اللعب: "+esc(st.color||"—")+" · السحب: "+st.drawCount+"</p><div class="row" style="flex-wrap:wrap">"+(st.hand||[]).map((c,i)=>'<button class="primary" data-action="playCard" data-index="'+i+'" data-color="'+esc(c.color==="wild"?"🔴":c.color)+'">'+esc(c.value)+" "+esc(c.color)+"</button>").join("")+"</div><button class="ghost" data-action="draw">سحب ورقة</button>"}
 else if(st.game==="LUDO"){h+="<p>النرد: "+esc(st.dice??"—")+"</p><button class="primary" data-action="roll">🎲 رمي النرد</button><div class="row" style="margin-top:10px">"+(st.legalTokens||[]).map(i=>'<button class="ghost" data-action="moveToken" data-token="'+i+'">تحريك القطعة '+(i+1)+"</button>").join("")+"</div>"}
 else if(st.game==="JAKAROO"){h+="<p>الأوراق: "+(st.hand||[]).map((c,i)=>'<button class="ghost" data-action="playCard" data-index="'+i+'">'+esc(c.rank+c.suit)+"</button>").join(" ")+"</p>"+(st.moveOptions?.length?'<p>اختر القطعة:</p>'+st.moveOptions.map(i=>'<button class="primary" data-action="moveToken" data-token="'+i+'">قطعة '+(i+1)+"</button>").join(" "):"")+"<p class="muted">القطع: "+esc((st.tokens||[]).join(" · "))+"</p>"}
 else if(st.game==="BALOOT"){if(st.phase==="bidding")h+='<button class="ghost" data-action="bid" data-bid="pass">بس</button><button class="primary" data-action="bid" data-bid="sun">صن</button><button class="primary" data-action="bid" data-bid="hokum">حكم</button>';else h+=(st.hand||[]).map((c,i)=><button class="ghost" data-action="playCard" data-index="'+i+'">'+esc(c.rank+c.suit)+"</button>").join(" ")}
 else if(st.game==="QAWSAR"){h+="<p>الحالة: "+esc(st.qawsarPhase||"draw")+" · الورقة المطروحة: "+esc(st.discarded?.rank||"—")+"</p>";if(st.qawsarPhase==="draw"){h+='<button class="primary" data-action="draw">سحب</button>';h+='<button class="ghost" data-action="takeDiscard" data-index="0">خذ المطروحة مكان أول ورقة</button>'}else h+='<button class="primary" data-action="playCard" data-index="0" data-mode="swap">استبدل الورقة المسحوبة بالأولى</button>';h+='<p class="muted">يدك: '+(st.hand||[]).map((x,i)=>esc(x.card?.rank||x.rank||"?")).join(" · ")+"</p>"}
 else {h+='<div class="row"><input id="genericText" placeholder="إجابتك"><button class="primary" id="genericSend">إرسال</button></div>';setTimeout(()=>$("#genericSend")?.addEventListener("click",async()=>{try{await api("/api/games/sessions/"+currentGame+"/action",{method:"POST",body:{action:"submit",data:{text:$("#genericText").value}}});gameState()}catch(e){toast(e.message)}}),0)}
 return h+"</article>";
}
async function render(v){
 clearInterval(pollTimer);v=V[v]?v:"home";$("#viewTitle").textContent=V[v][0];$("#viewSub").textContent=V[v][1];$("#status").textContent="جاري تحميل البيانات...";$("#content").innerHTML="";
 try{
  if(v==="home")return home();if(v==="members")return membersView();if(v==="roles")return roles();if(v==="top")return top();if(v==="groups")return groups();if(v==="chat")return chat();if(v==="private-chat")return privateChat();if(v==="message")return message();if(v==="anonymous")return anonymous();if(v==="jokes")return jokes();if(v==="stories")return stories();if(v==="tickets")return tickets();if(v==="apply")return applyView();if(v==="reviews")return reviews();if(v==="profile")return profile();if(v==="account")return account();if(v==="login")return auth();if(v==="games")return games();
 }catch(e){$("#status").textContent=e.message;toast(e.message)}
}
async function boot(){
 try{const d=await api("/api/auth/me");me=d.user||null}catch{me=null}
 menu();await render(location.hash.slice(1)||"home");await stats();api("/api/site/visit",{method:"POST"}).catch(()=>{});setInterval(stats,15000);
}
document.addEventListener("click",e=>{
 const f=e.target.closest(".folder-head");if(f){f.parentElement.classList.toggle("open");return}
 const b=e.target.closest("[data-view]");if(b){const v=b.dataset.view;$("#drawer").classList.remove("open");history.replaceState(null,"","#"+v);render(v);return}
});
$("#menuBtn").onclick=()=>$("#drawer").classList.toggle("open");
window.addEventListener("hashchange",()=>render(location.hash.slice(1)||"home"));
boot();
