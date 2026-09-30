"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function setupMLDExtra({ app, client, auth, ownerOnly, adminOnly, logPlatform, getGuild, getAllMembers, platform, savePlatform }) {
  const dir = path.join(__dirname, "data");
  const file = path.join(dir, "features.json");
  const defaultData = {
    bots: [],
    botSettings: {},
    tickets: [],
    applications: [],
    reviews: [],
    privateMessages: [],
    chats: { general: [], rooms: {}, generalMuted: false, blockedUsers: [] },
    wallets: {},
    streaks: {},
    giveaways: [],
    jokes: [],
    jokeRatings: {},
    stories: [],
    announcement: { enabled: false, text: "", color: "", updatedAt: null },\n    ticketSettings: { questions: ["عنوان المشكلة","التفاصيل"] },\n    cinemaRooms: [],\n    cinemaCatalog: []
  };

  function load() {
    try {
      fs.mkdirSync(dir,{recursive:true});
      if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultData,null,2));
      const d=JSON.parse(fs.readFileSync(file,"utf8"));
      return Object.assign({}, defaultData, d);
    } catch(e) {
      console.error("MLD extra storage read:",e);
      return JSON.parse(JSON.stringify(defaultData));
    }
  }
  let data=load();
  function save(){ fs.mkdirSync(dir,{recursive:true}); const tmp=file+".tmp"; fs.writeFileSync(tmp,JSON.stringify(data,null,2)); fs.renameSync(tmp,file); }
  const id=()=>crypto.randomUUID();
  const clean=(v,n)=>String(v==null?"":v).trim().slice(0,n);
  const dmBroadcastJobs=new Map();
  const staffOnly=(req,res,next)=>req.account?.role==="owner" || req.account?.admin===true ? next() : res.status(403).json({error:"هذا القسم للإدارة والأونر"});
  function chatMember(room, username){ return room.members.includes(username) || room.owner===username; }
function chatBlocked(username){ return Array.isArray(data.chats.blockedUsers)&&data.chats.blockedUsers.includes(username); }
app.get("/api/platform/chat/general",(req,res)=>res.json({messages:data.chats.general.slice(-200),muted:Boolean(data.chats.generalMuted)}));
app.post("/api/platform/chat/general",auth,(req,res)=>{
  if(data.chats.generalMuted&&req.account.role!=="owner"&&req.account.admin!==true)return res.status(403).json({error:"الشات العام مكتوم حاليًا"});
  if(chatBlocked(req.account.username))return res.status(403).json({error:"تم منعك من الدردشة"});
  const message=clean(req.body?.message,1000); if(!message)return res.status(400).json({error:"اكتب رسالة"});
  const item={id:id(),username:req.account.username,message,at:new Date().toISOString()};
  data.chats.general.push(item); data.chats.general=data.chats.general.slice(-500); save(); logPlatform("general_chat_message",req.account.id,message.slice(0,80)); res.status(201).json({message:item});
});
app.post("/api/platform/chat/general/settings",auth,ownerOnly,(req,res)=>{
  data.chats.generalMuted=Boolean(req.body?.muted); save(); logPlatform("general_chat_mute",req.account.id,String(data.chats.generalMuted)); res.json({muted:data.chats.generalMuted});
});
app.get("/api/platform/chat/rooms",auth,(req,res)=>{
  const rooms=Object.values(data.chats.rooms).filter(r=>chatMember(r,req.account.username)).map(r=>({id:r.id,name:r.name,owner:r.owner,members:r.members,messages:r.messages.slice(-100),createdAt:r.createdAt}));
  res.json({rooms});
});
app.post("/api/platform/chat/rooms",auth,(req,res)=>{
  const raw=Array.isArray(req.body?.members)?req.body.members.map(x=>clean(x,24).toLowerCase()).filter(Boolean):[];
  const members=[...new Set([req.account.username,...raw])].filter(u=>platform.accounts.some(x=>x.username===u));
  if(members.length<2)return res.status(400).json({error:"اختر شخصًا واحدًا على الأقل من الحسابات المسجلة"});
  const room={id:id(),name:clean(req.body?.name,60)||"شات خاص",owner:req.account.username,members,messages:[],createdAt:new Date().toISOString()};
  data.chats.rooms[room.id]=room; save(); logPlatform("private_chat_created",req.account.id,room.id); res.status(201).json({room});
});
app.post("/api/platform/chat/rooms/:id/message",auth,(req,res)=>{
  const room=data.chats.rooms[req.params.id]; if(!room)return res.status(404).json({error:"الشات غير موجود"});
  if(!chatMember(room,req.account.username))return res.status(403).json({error:"لست عضوًا في هذا الشات"});
  if(chatBlocked(req.account.username))return res.status(403).json({error:"تم منعك من الدردشة"});
  const message=clean(req.body?.message,1000); if(!message)return res.status(400).json({error:"اكتب رسالة"});
  const item={id:id(),username:req.account.username,message,at:new Date().toISOString()};
  room.messages.push(item); room.messages=room.messages.slice(-500); save(); logPlatform("private_chat_message",req.account.id,room.id); res.status(201).json({message:item});
});
app.post("/api/platform/chat/rooms/:id/members",auth,(req,res)=>{
  const room=data.chats.rooms[req.params.id]; if(!room)return res.status(404).json({error:"الشات غير موجود"});
  if(room.owner!==req.account.username)return res.status(403).json({error:"مالك الشات فقط يقدر يعدل الأعضاء"});
  const username=clean(req.body?.username,24).toLowerCase();
  if(!platform.accounts.some(x=>x.username===username))return res.status(404).json({error:"الحساب غير موجود"});
  if(chatBlocked(username))return res.status(403).json({error:"هذا العضو محظور من الدردشة"});
  if(!room.members.includes(username))room.members.push(username); save(); logPlatform("private_chat_member_added",req.account.id,room.id+":"+username); res.json({room});
});
app.delete("/api/platform/chat/rooms/:id/members/:username",auth,(req,res)=>{
  const room=data.chats.rooms[req.params.id]; if(!room)return res.status(404).json({error:"الشات غير موجود"});
  if(room.owner!==req.account.username)return res.status(403).json({error:"مالك الشات فقط يقدر يعدل الأعضاء"});
  const username=clean(req.params.username,24).toLowerCase(); if(username===room.owner)return res.status(400).json({error:"لا يمكن حذف مالك الشات"});
  room.members=room.members.filter(x=>x!==username); save(); logPlatform("private_chat_member_removed",req.account.id,room.id+":"+username); res.json({room});
});
app.get("/api/platform/chat/users",auth,(req,res)=>{
  const users=platform.accounts.map(x=>({id:x.id,username:x.username,displayName:x.displayName||x.username,avatar:x.avatar||"",role:x.role||"member"}));
  res.json({users});
});
app.get("/api/platform/chat/blocked",auth,(req,res)=>res.json({blocked:data.chats.blockedUsers||[]}));
app.post("/api/platform/chat/block/:username",auth,(req,res)=>{
  const username=clean(req.params.username,24).toLowerCase(); if(username===req.account.username)return res.status(400).json({error:"لا يمكنك حظر نفسك"});
  if(!platform.accounts.some(x=>x.username===username))return res.status(404).json({error:"الحساب غير موجود"});
  data.chats.blockedUsers=[...new Set([...(data.chats.blockedUsers||[]),username])]; save(); logPlatform("chat_user_blocked",req.account.id,username); res.json({ok:true,blocked:data.chats.blockedUsers});
});
app.delete("/api/platform/chat/block/:username",auth,(req,res)=>{
  const username=clean(req.params.username,24).toLowerCase(); data.chats.blockedUsers=(data.chats.blockedUsers||[]).filter(x=>x!==username); save(); logPlatform("chat_user_unblocked",req.account.id,username); res.json({ok:true,blocked:data.chats.blockedUsers});
});
app.get("/api/platform/owner/accounts",auth,ownerOnly,(req,res)=>{
    res.json({accounts:platform.accounts.map(a=>({id:a.id,username:a.username,displayName:a.displayName||a.username,discordUsername:a.discordUsername||"",role:a.role||"member",admin:Boolean(a.admin),createdAt:a.createdAt||null}))});
  });
  app.post("/api/platform/owner/accounts/:id/admin",auth,ownerOnly,(req,res)=>{
    const account=platform.accounts.find(a=>a.id===req.params.id);
    if(!account)return res.status(404).json({error:"الحساب غير موجود"});
    if(account.role==="owner")return res.status(400).json({error:"لا يمكن تغيير صلاحية الأونر"});
    const enabled=Boolean(req.body?.enabled);
    account.admin=enabled; account.role=enabled?"admin":"member"; savePlatform();
    logPlatform("admin_role_updated",req.account.id,account.username+":"+enabled);
    res.json({account:{id:account.id,username:account.username,role:account.role,admin:account.admin}});
  });
  app.get("/api/platform/announcement",(req,res)=>{
    const a=data.announcement||{enabled:false,text:"",color:"",updatedAt:null};
    res.json({announcement:{enabled:Boolean(a.enabled),text:clean(a.text,500),color:/^#[0-9a-fA-F]{6}$/.test(String(a.color||""))?a.color:"",updatedAt:a.updatedAt||null}});
  });
  app.post("/api/platform/announcement",auth,ownerOnly,(req,res)=>{
    const text=clean(req.body?.text,500),enabled=Boolean(req.body?.enabled)&&text.length>0;
    const color=/^#[0-9a-fA-F]{6}$/.test(String(req.body?.color||""))?String(req.body.color):"";
    data.announcement={enabled,text,color,updatedAt:new Date().toISOString()};save();
    logPlatform("announcement_updated",req.account.id,enabled?text:"disabled");
    res.json({announcement:data.announcement});
  });
  app.get("/api/platform/broadcast/channels",auth,ownerOnly,async(req,res)=>{
    try{
      const guild=await getGuild();
      const channels=guild.channels.cache.filter(ch=>ch.isTextBased()&&!ch.isThread()&&ch.viewable!==false)
        .map(ch=>({id:ch.id,name:ch.name,canSend:Boolean(ch.permissionsFor(client.user)?.has("SendMessages"))}))
        .filter(ch=>ch.canSend).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
      res.json({channels});
    }catch(e){console.error("Broadcast channels:",e);res.status(503).json({error:"تعذر جلب قنوات البرودكاست"});}
  });
  app.post("/api/platform/broadcast",auth,ownerOnly,async(req,res)=>{
    const message=clean(req.body?.message,4000);
    const channelIds=Array.isArray(req.body?.channelIds)?[...new Set(req.body.channelIds.map(x=>String(x).trim()).filter(Boolean))].slice(0,20):[];
    const mentionEveryone=Boolean(req.body?.mentionEveryone);
    if(!message)return res.status(400).json({error:"اكتب رسالة البرودكاست"});
    if(!channelIds.length)return res.status(400).json({error:"اختر قناة واحدة على الأقل"});
    try{
      const guild=await getGuild(),results=[];
      for(const channelId of channelIds){
        const channel=guild.channels.cache.get(channelId)||await guild.channels.fetch(channelId).catch(()=>null);
        if(!channel||!channel.isTextBased()||channel.isThread()){results.push({channelId,ok:false,error:"القناة غير صالحة"});continue;}
        const perms=channel.permissionsFor(client.user);
        if(!perms?.has("ViewChannel")||!perms?.has("SendMessages")){results.push({channelId,ok:false,error:"البوت لا يملك صلاحية الإرسال"});continue;}
        if(mentionEveryone&&!perms.has("MentionEveryone")){results.push({channelId,ok:false,error:"البوت لا يملك صلاحية Mention Everyone"});continue;}
        const sent=await channel.send({content:message,allowedMentions:{parse:mentionEveryone?["everyone"]:[]}});
        results.push({channelId,ok:true,messageId:sent.id});
      }
      const sentCount=results.filter(x=>x.ok).length;
      if(!sentCount)return res.status(400).json({error:"لم يتم إرسال البرودكاست لأي قناة",results});
      logPlatform("broadcast_sent",req.account.id,"channels="+sentCount+" mentionEveryone="+mentionEveryone);
      res.json({ok:true,sentCount,results});
    }catch(e){console.error("Broadcast send:",e);res.status(500).json({error:"تعذر تنفيذ البرودكاست"});}
  });
  app.post("/api/platform/broadcast/dm",auth,ownerOnly,async(req,res)=>{
    const message=clean(req.body?.message,2000);
    if(!message)return res.status(400).json({error:"اكتب رسالة البرودكاست"});
    try{
      const guild=await getGuild();
      const members=[...(await guild.members.fetch()).values()].filter(m=>!m.user?.bot);
      const jobId=id();
      const job={id:jobId,status:"running",total:members.length,sent:0,failed:0,startedAt:new Date().toISOString(),finishedAt:null,error:null};
      dmBroadcastJobs.set(jobId,job);
      res.status(202).json({ok:true,job});
      (async()=>{
        try{
          for(const member of members){
            try{
              await member.send({content:"📣 **MLD Community**

"+message});
              job.sent++;
            }catch(e){
              job.failed++;
            }
            if(job.sent+job.failed < members.length) await new Promise(r=>setTimeout(r,250));
          }
          job.status="completed";
          job.finishedAt=new Date().toISOString();
          logPlatform("broadcast_dm_sent",req.account.id,"sent="+job.sent+" failed="+job.failed+" total="+job.total);
        }catch(e){
          job.status="failed";
          job.error=String(e?.message||e);
          job.finishedAt=new Date().toISOString();
          console.error("Broadcast DM:",e);
        }
      })();
    }catch(e){console.error("Broadcast DM prepare:",e);res.status(500).json({error:"تعذر تجهيز برودكاست الخاص"});}
  });
  app.get("/api/platform/broadcast/dm/:id",auth,ownerOnly,(req,res)=>{
    const job=dmBroadcastJobs.get(req.params.id);
    if(!job)return res.status(404).json({error:"عملية البرودكاست غير موجودة"});
    res.json({job});
  });


  app.get("/api/platform/cinema/catalog",(req,res)=>res.json({items:data.cinemaCatalog||[]}));
  app.get("/api/platform/cinema/rooms",(req,res)=>res.json({rooms:(data.cinemaRooms||[]).filter(r=>r.status!=="closed").map(r=>({id:r.id,name:r.name,content:r.content,host:r.host,members:r.members.length,createdAt:r.createdAt,status:r.status}))}));
  app.post("/api/platform/cinema/rooms",auth,(req,res)=>{
    const name=clean(req.body?.name,60)||"غرفة مشاهدة"; const content=clean(req.body?.content,200);
    if(content.length<2)return res.status(400).json({error:"اكتب اسم المحتوى"});
    const room={id:id(),name,content,host:req.account.username,members:[req.account.username],createdAt:new Date().toISOString(),status:"open"};
    data.cinemaRooms.unshift(room);data.cinemaRooms=data.cinemaRooms.slice(0,100);save();logPlatform("cinema_room_created",req.account.id,content);res.status(201).json({room});
  });
  app.post("/api/platform/cinema/rooms/:id/join",auth,(req,res)=>{
    const room=data.cinemaRooms.find(x=>x.id===req.params.id);if(!room||room.status==="closed")return res.status(404).json({error:"غرفة المشاهدة غير موجودة"});
    if(!room.members.includes(req.account.username))room.members.push(req.account.username);save();logPlatform("cinema_room_joined",req.account.id,room.id);res.json({room});
  });
  app.post("/api/platform/cinema/rooms/:id/close",auth,(req,res)=>{
    const room=data.cinemaRooms.find(x=>x.id===req.params.id);if(!room)return res.status(404).json({error:"الغرفة غير موجودة"});
    if(room.host!==req.account.username&&req.account.role!=="owner")return res.status(403).json({error:"صاحب الغرفة أو الأونر فقط"});
    room.status="closed";save();logPlatform("cinema_room_closed",req.account.id,room.id);res.json({ok:true});
  });
\n  require("./bot-manager")({ app, auth, logPlatform, platform, savePlatform });

  app.get("/api/platform/bots",(req,res)=>res.json({bots:data.bots.map(b=>Object.assign({},b,{settings:data.botSettings[b.id]||{}}))}));

  app.post("/api/platform/bots/:id/toggle",auth,ownerOnly,(req,res)=>{
    const bot=data.bots.find(b=>b.id===req.params.id); if(!bot)return res.status(404).json({error:"البوت غير موجود"});
    bot.enabled=!bot.enabled; save(); logPlatform("bot_toggled",req.account.id,bot.id+":"+bot.enabled); res.json({bot});
  });

  app.post("/api/platform/bots/:id/settings",auth,ownerOnly,(req,res)=>{
    const bot=data.bots.find(b=>b.id===req.params.id); if(!bot)return res.status(404).json({error:"البوت غير موجود"});
    data.botSettings[bot.id]={prefix:clean(req.body?.prefix||"!",3), welcome:Boolean(req.body?.welcome), logs:Boolean(req.body?.logs), automod:Boolean(req.body?.automod)};
    save(); logPlatform("bot_settings",req.account.id,bot.id); res.json({settings:data.botSettings[bot.id]});
  });

  app.post("/api/platform/profile",auth,(req,res)=>{
    req.account.profileName=clean(req.body?.profileName,60)||req.account.username;
    req.account.avatar=clean(req.body?.avatar,500);
    req.account.bio=clean(req.body?.bio,300);
    savePlatform();
    logPlatform("profile_updated",req.account.id,req.account.username);
    res.json({account:{id:req.account.id,username:req.account.username,discordId:req.account.discordId,role:req.account.role,createdAt:req.account.createdAt,profileName:req.account.profileName||req.account.username,avatar:req.account.avatar||"",bio:req.account.bio||""}});
  });

  app.get("/api/platform/tickets",auth,(req,res)=>{
  const staff=req.account.role==="owner"||req.account.admin===true;
  const tickets=data.tickets.filter(t=>staff||t.owner===req.account.username);
  res.json({tickets});
});
app.get("/api/platform/tickets/settings",auth,(req,res)=>{
  if(req.account.role!=="owner"&&req.account.admin!==true)return res.status(403).json({error:"للإدارة فقط"});
  res.json({questions:data.ticketSettings?.questions||["عنوان المشكلة","التفاصيل"]});
});
app.post("/api/platform/tickets/settings",auth,ownerOnly,(req,res)=>{
  const questions=Array.isArray(req.body?.questions)?req.body.questions.map(x=>clean(x,120)).filter(Boolean).slice(1,10):[];
  data.ticketSettings={questions:questions.length?questions:["عنوان المشكلة","التفاصيل"]}; save(); logPlatform("ticket_questions_updated",req.account.id,String(questions.length)); res.json({questions:data.ticketSettings.questions});
});
app.post("/api/platform/tickets",auth,(req,res)=>{
  const title=clean(req.body?.title,100),message=clean(req.body?.message,2000),category=clean(req.body?.category||"عام",40);
  if(title.length<2||message.length<2)return res.status(400).json({error:"أكمل بيانات التذكرة"});
  const ticket={id:id(),owner:req.account.username,title,category,message,status:"open",claimedBy:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),replies:[]};
  data.tickets.unshift(ticket); save(); logPlatform("ticket_created",req.account.id,title); res.status(201).json({ticket});
});
app.post("/api/platform/tickets/:id/reply",auth,(req,res)=>{
  const t=data.tickets.find(x=>x.id===req.params.id); if(!t)return res.status(404).json({error:"التذكرة غير موجودة"});
  const staff=req.account.role==="owner"||req.account.admin===true;
  if(t.owner!==req.account.username&&!staff)return res.status(403).json({error:"لا تملك صلاحية هذه التذكرة"});
  const message=clean(req.body?.message,2000); if(!message)return res.status(400).json({error:"اكتب الرد"});
  t.replies.push({id:id(),by:req.account.username,message,at:new Date().toISOString()});t.updatedAt=new Date().toISOString();save();logPlatform("ticket_replied",req.account.id,t.id);res.json({ticket:t});
});
app.post("/api/platform/tickets/:id/claim",auth,adminOnly,(req,res)=>{
  const t=data.tickets.find(x=>x.id===req.params.id); if(!t)return res.status(404).json({error:"التذكرة غير موجودة"});
  if(t.status==="closed")return res.status(409).json({error:"التذكرة مغلقة"});
  t.claimedBy=req.account.username; t.status="claimed";t.updatedAt=new Date().toISOString();save();logPlatform("ticket_claimed",req.account.id,t.id);res.json({ticket:t});
});
app.post("/api/platform/tickets/:id/close",auth,(req,res)=>{
  const t=data.tickets.find(x=>x.id===req.params.id); if(!t)return res.status(404).json({error:"التذكرة غير موجودة"});
  const staff=req.account.role==="owner"||req.account.admin===true;
  if(t.owner!==req.account.username&&!staff)return res.status(403).json({error:"لا تملك صلاحية إغلاقها"});
  t.status="closed";t.updatedAt=new Date().toISOString();save();logPlatform("ticket_closed",req.account.id,t.id);res.json({ticket:t});
});

  app.get("/api/platform/applications",(req,res)=>res.json({applications:data.applications.filter(a=>a.status==="open")}));
  app.post("/api/platform/applications",auth,(req,res)=>{
    const a={id:id(),username:req.account.username,role:clean(req.body?.role||"عضو",40),answers:clean(req.body?.answers,2000),status:"open",createdAt:new Date().toISOString()};
    if(a.answers.length<5)return res.status(400).json({error:"اكتب إجابتك"});
    data.applications.unshift(a); save(); logPlatform("application_created",req.account.id,a.role); res.status(201).json({application:a});
  });
  app.post("/api/platform/applications/:id/status",auth,ownerOnly,(req,res)=>{
    const a=data.applications.find(x=>x.id===req.params.id); if(!a)return res.status(404).json({error:"التقديم غير موجود"});
    a.status=["accepted","rejected","open"].includes(req.body?.status)?req.body.status:"open"; save(); logPlatform("application_status",req.account.id,a.id+":"+a.status); res.json({application:a});
  });

  const DEMO_REVIEW_NAMES=["سارة","راكان","نوف","عبدالعزيز","ليان","تركي","جود","مشعل","ريم","خالد","شهد","ناصر","دانة","سلطان","هيا","وليد","لينا","فيصل","غلا","مازن","رهف","بندر","لمى","زياد","تالا","أنس","مها","عمر","جنى","سلمان"];
  const DEMO_REVIEW_TEXTS=[
    "الموقع مرتب وسريع، خصوصًا قسم الألعاب 😂","التصميم فخم والنكت رهيبة","فكرة المجتمع جميلة وتحتاج استمرار","دخلت أتصفح وجلست وقت طويل 😭","قسم القصص حلو جدًا","واجهة الموقع مريحة على الجوال","الألعاب والجلسات فكرة ممتازة","أحببت تنوع الأقسام في الموقع","الشات والمجتمع يعطيان جو حلو","تجربة ممتعة وأتمنى إضافة ألعاب أكثر"
  ];
  function seedDemoReviews(){
    if(data.reviews.some(r=>r.demo)) return;
    for(let i=0;i<30;i++){
      data.reviews.push({id:"demo-review-"+(i+1),username:DEMO_REVIEW_NAMES[i%DEMO_REVIEW_NAMES.length],rating:1+(i*7)%5,text:DEMO_REVIEW_TEXTS[i%DEMO_REVIEW_TEXTS.length],createdAt:new Date(Date.now()-i*86400000).toISOString(),demo:true});
    }
    data.reviews=data.reviews.slice(0,200);
    save();
  }
  seedDemoReviews();
  app.get("/api/platform/reviews",(req,res)=>res.json({reviews:data.reviews.slice(0,100)}));
  app.post("/api/platform/reviews",auth,(req,res)=>{
    const r={id:id(),username:req.account.username,rating:Math.max(1,Math.min(5,Number(req.body?.rating||5))),text:clean(req.body?.text,500),createdAt:new Date().toISOString()};
    if(r.text.length<2)return res.status(400).json({error:"اكتب رأيك"});
    data.reviews.unshift(r); data.reviews=data.reviews.slice(0,200); save(); logPlatform("review_created",req.account.id,r.username+":"+r.rating); res.status(201).json({review:r});
  });
  app.delete("/api/platform/reviews/:id",auth,ownerOnly,(req,res)=>{
    const i=data.reviews.findIndex(x=>x.id===req.params.id);
    if(i<0)return res.status(404).json({error:"الرأي غير موجود"});
    const [removed]=data.reviews.splice(i,1); save(); logPlatform("review_deleted",req.account.id,removed.id); res.json({ok:true});
  });

  const DEFAULT_JOKES=[
    "واحد راح للدكتور وقال له: كل ما أشرب شاي عيني توجعني. قاله الدكتور: جرّب تشيل الملعقة من الكوب 😂",
    "واحد سأل صاحبه: ليه الكمبيوتر زعلان؟ قاله: عنده مشاكل في الويندوز 😂",
    "واحد بخيل جدًا، إذا عطس قال: الحمد لله بدون صوت عشان ما يضيّع الأجر 😂",
    "واحد دخل اختبار ذكاء، طلع منه وقال: الحمد لله نجحت في الخروج 😂",
    "واحد نذل راح يعزي صاحبه وقال له: مبروك على الصبر مقدمًا 😂",
    "واحد قال لصاحبه: أنا سريع بالحساب. قاله: كم 7×8؟ قال: بسرعة ولا عادي؟ 😂",
    "واحد نام متأخر وصحى بدري، اكتشف أن المشكلة مو في النوم… المشكلة في الحياة 😂",
    "واحد فتح الثلاجة بالليل، الثلاجة قالت له: رجعت؟ 😂",
    "واحد اشترى ساعة ذكية، صارت كل شوي تقول له: قم تحرك… باعها من كثر الإزعاج 😂",
    "واحد دخل مطعم وقال: عندكم شيء خفيف؟ قالوا: نعم، الفاتورة 😂"
  ];
  const DEFAULT_STORIES=[
    ["ليلة مختلفة","في ليلة هادئة وصلته رسالة قصيرة: لا تنام قبل أن تنظر خلف الباب. تردد، ثم فتحه، فلم يجد أحدًا… فقط ظرفًا صغيرًا فيه مفتاح ورسالة: بعض الأبواب لا تُفتح إلا عندما تتوقف عن الخوف."],
    ["المقعد الفاضي","كان يترك دائمًا مقعدًا فارغًا بجانبه. سألوه لماذا، فقال: ربما يأتي شخص يحتاج جلسة بدون أسئلة. بعد أيام صار المقعد مكانًا يبدأ منه الغرباء صداقات جديدة."],
    ["الرسالة الأخيرة","قبل أن يغادر المدينة كتب لصديقه: إذا ضاقت بك الدنيا اتصل بي. مرّت سنوات، وفي يوم صعب فتح هاتفه واتصل. جاءه الرد فورًا: كنت أنتظر اتصالك."],
    ["المصعد","دخل المصعد وضغط الطابق السابع. توقف عند السادس وفتح بابه، لكنه لم يجد طابقًا هناك. ظهرت ورقة على الأرض مكتوب عليها: لا تنزل. ضغط زر الإغلاق، وعندما وصل السابع اختفت الورقة."],
    ["النجمة","كل ليلة كان طفل ينظر إلى نجمة واحدة ويطلب أمنية. في يوم سأله والده عن أمنيته، فقال: أتمنى أن أبقى أتذكر أن الأشياء الصغيرة تقدر تفرحنا."],
    ["الكرسي","وجد كرسيًا قديمًا أمام بيت مهجور. جلس عليه لدقائق، فسمع ضحكة أطفال من داخل البيت. ابتسم، ثم أدرك أن بعض الأماكن تحفظ أصوات من مرّوا بها أكثر مما تحفظ الجدران."],
    ["الموعد","كتب لها: سأنتظرك عند المكان القديم. لم تأتِ. بعد ساعة وجد رسالة تحت الطاولة: وصلت قبلك، لكنني كنت أعرف أنك ستبحث عني هنا."],
    ["الباب الأزرق","كان في آخر الممر باب أزرق لم يره أحد من قبل. فتحه فوجد غرفة مليئة بصور لحظاته الجميلة. على الجدار الأخير صورة لمستقبله، وتحتها جملة: لا تنسَ أن تصنع المزيد."]
  ];
  if(!Array.isArray(data.jokes)) data.jokes=[];
  if(!Array.isArray(data.stories)) data.stories=[];
  function ensureJokes(){
    if(data.jokes.length) return;
    DEFAULT_JOKES.forEach((text,i)=>data.jokes.push({id:"joke-"+(i+1),text,author:"MLD",likes:0,dislikes:0,createdAt:new Date().toISOString()}));
    save();
  }
  ensureJokes();
  function generatedJoke(exclude){
    const pool=[
      "واحد دخل محل نظارات وقال للبائع: أبي نظارة أشوف فيها مستقبلي. قال له: ادفع أول، المستقبل مو مجاني.",
      "سأل واحد صاحبه: ليه الجوال دايم معك؟ قال: لأن حتى أهلي صاروا يقولون لي وينك بالواتساب.",
      "واحد قال لصاحبه: أنا سريع في اتخاذ القرارات. قال: من زمان... بس أفكر فيها بكرة.",
      "قال المدرس للطالب: لماذا ورقتك فاضية؟ قال: كتبت الإجابة بخط شفاف عشان ما تنكشف.",
      "واحد قرر يرتب حياته، بدأ يرتب التطبيقات في جواله، وبعد ثلاث ساعات اكتشف أنه ما زال ما رتب حياته."
    ].filter(x=>x!==exclude);
    return pool[Math.floor(Math.random()*pool.length)]||"خلنا نغير الجو: وش أكثر شيء يضحكك بدون سبب؟";
  }
  function generatedStory(exclude){
    const pool=[
      {title:"مدينة لا تنام",opening:"في آخر طرف من المدينة، كان هناك شارع صغير لا يظهر في الخرائط. كل ليلة، بعد منتصف الليل، تضاء مصابيحه واحدًا تلو الآخر، ويبدأ شيء غريب يحدث خلف النوافذ القديمة."},
      {title:"المفتاح الذي لا يفتح بابًا",opening:"وجد سامي مفتاحًا نحاسيًا صغيرًا داخل كتاب قديم اشتراه من سوق مهجور. لم يكن للمفتاح شكل مألوف، والأغرب أن الورقة الأخيرة من الكتاب كانت تحمل اسمه فقط."},
      {title:"الرسالة بعد عشر سنوات",opening:"وصلت رسالة إلى صندوق بريد نورة في صباح عادي. لم يكن عليها اسم المرسل، لكن التاريخ المكتوب عليها كان بعد عشر سنوات من ذلك اليوم."},
      {title:"القطار الأخير",opening:"عند الساعة 11:59 تمامًا، ظهر قطار لم يكن موجودًا في جدول المحطة. لم يركبه أحد، ومع ذلك كان الباب مفتوحًا وكأن شخصًا ما ينتظر وصوله."},
      {title:"البيت الذي يتذكر",opening:"حين عاد مازن إلى بيت طفولته، لاحظ أن الأشياء لم تكن في أماكنها القديمة. كل غرفة كانت تتغير قليلًا كلما تذكر شيئًا من طفولته، وكأن البيت نفسه يحاول أن يحكي له قصة."}
    ].filter(x=>x.opening!==exclude);
    const x=pool[Math.floor(Math.random()*pool.length)]||{title:"قصة جديدة",opening:"بدأت الحكاية في ليلة هادئة، عندما حدث شيء لم يكن في الحسبان."};
    const middle=" ومع مرور الوقت، بدأت التفاصيل الصغيرة تقود البطل إلى مكان لم يكن يتوقعه. وجد دفترًا قديمًا، ثم سمع صوتًا خلف الباب، وعندما التفت رأى علامة يعرفها من حلم قديم. لم يكن أمامه إلا أن يتبع الخيط حتى النهاية، رغم أن كل خطوة كانت تكشف سؤالًا جديدًا أكثر غرابة من السابق. في الطريق قابل أشخاصًا ترك كل واحد منهم جزءًا من الحقيقة، وبعضهم كان يحاول إبعاده عن الطريق، لكن فضوله كان أقوى من الخوف.";
    const ending=" وفي النهاية، اكتشف أن الرحلة لم تكن بحثًا عن مكان أو شخص، بل كانت فرصة ليفهم نفسه ويختار ما يريد أن يصبح عليه. عاد إلى المدينة مع أول ضوء للفجر، لكنه هذه المرة لم يرَ الشارع كما كان من قبل. كان يعرف أن بعض القصص لا تنتهي عندما نصل إلى النهاية، بل تبدأ هناك.";
    return {title:x.title,text:x.opening+middle+ending};
  }
  app.get("/api/platform/jokes/generate",(req,res)=>{
    const text=generatedJoke(String(req.query?.exclude||""));
    res.json({joke:{id:"generated-"+Date.now(),text,author:"MLD Bot",bot:true,createdAt:new Date().toISOString()}});
  });
  app.get("/api/platform/stories/generate",(req,res)=>{
    const s=generatedStory(String(req.query?.exclude||""));
    res.json({story:{id:"generated-story-"+Date.now(),title:s.title,text:s.text,author:"MLD Bot",bot:true,createdAt:new Date().toISOString()}});
  });
  app.get("/api/platform/jokes",(req,res)=>{
    const list=data.jokes.slice(0,200).map(j=>({id:j.id,text:j.text,author:j.author,likes:j.likes||0,dislikes:j.dislikes||0,createdAt:j.createdAt}));
    res.json({jokes:list});
  });
  app.post("/api/platform/jokes",auth,(req,res)=>{
    const text=clean(req.body?.text,500);
    if(text.length<3)return res.status(400).json({error:"اكتب النكتة"});
    const j={id:id(),text,author:req.account.username,likes:0,dislikes:0,createdAt:new Date().toISOString()};
    data.jokes.unshift(j); data.jokes=data.jokes.slice(0,200); save(); logPlatform("joke_created",req.account.id,j.id);
    res.status(201).json({joke:j});
  });
  app.post("/api/platform/jokes/:id/rate",auth,(req,res)=>{
    const j=data.jokes.find(x=>x.id===req.params.id); if(!j)return res.status(404).json({error:"النكتة غير موجودة"});
    const rating=req.body?.rating==="like"||req.body?.rating==="dislike"?req.body.rating:null;
    if(!rating)return res.status(400).json({error:"تقييم غير صالح"});
    if(!data.jokeRatings[req.account.username])data.jokeRatings[req.account.username]={};
    const previous=data.jokeRatings[req.account.username][j.id];
    if(previous===rating)return res.json({joke:j});
    if(previous==="like")j.likes=Math.max(0,(j.likes||0)-1);
    if(previous==="dislike")j.dislikes=Math.max(0,(j.dislikes||0)-1);
    j[rating==="like"?"likes":"dislikes"]=(j[rating==="like"?"likes":"dislikes"]||0)+1;
    data.jokeRatings[req.account.username][j.id]=rating; save(); res.json({joke:j});
  });
  app.get("/api/platform/stories",(req,res)=>{
    if(!data.stories.length){DEFAULT_STORIES.forEach((s,i)=>data.stories.push({id:"story-"+(i+1),title:s[0],text:s[1],author:"MLD",createdAt:new Date().toISOString()}));save();}
    res.json({stories:data.stories.slice(0,100)});
  });
  app.post("/api/platform/stories",auth,(req,res)=>{
    const title=clean(req.body?.title,100), text=clean(req.body?.text,3000);
    if(text.length<20)return res.status(400).json({error:"اكتب قصة أطول قليلًا"});
    const s={id:id(),title:title||"قصة جديدة",text,author:req.account.username,createdAt:new Date().toISOString()};
    data.stories.unshift(s);data.stories=data.stories.slice(0,100);save();logPlatform("story_created",req.account.id,s.id);res.status(201).json({story:s});
  });

  app.get("/api/platform/messages",auth,(req,res)=>res.json({messages:data.privateMessages.filter(m=>m.to===req.account.username||m.from===req.account.username||req.account.role==="owner").slice(0,100)}));
  app.post("/api/platform/messages",auth,(req,res)=>{
    const to=clean(req.body?.to,24).toLowerCase(), message=clean(req.body?.message,1000);
    if(!to||!message)return res.status(400).json({error:"أكمل الرسالة"});
    const target=platform.accounts?.find(a=>a.username===to);
    const m={id:id(),from:req.account.username,to,message,createdAt:new Date().toISOString()};
    data.privateMessages.unshift(m); save(); logPlatform("private_message",req.account.id,to); res.status(201).json({message:m,recipientExists:Boolean(target)});
  });

  app.get("/api/platform/economy",auth,(req,res)=>{
    const w=data.wallets[req.account.username]||{coins:0}; const s=data.streaks[req.account.username]||{days:0,last:null};
    res.json({wallet:w,streak:s});
  });
  app.post("/api/platform/daily",auth,(req,res)=>{
    const u=req.account.username, now=Date.now(), old=data.streaks[u]||{days:0,last:null};
    const day=86400000;
    if(old.last && now-old.last<day)return res.status(409).json({error:"استلمت مكافأة اليوم بالفعل"});
    old.days=old.last&&now-old.last<day*2?old.days+1:1; old.last=now;
    data.streaks[u]=old; data.wallets[u]=Object.assign({coins:0},data.wallets[u],{coins:(data.wallets[u]?.coins||0)+100+old.days*10});
    save(); logPlatform("daily_reward",req.account.id,String(data.wallets[u].coins)); res.json({wallet:data.wallets[u],streak:old});
  });

  app.get("/api/platform/giveaways",(req,res)=>res.json({giveaways:data.giveaways.filter(g=>g.status==="open")}));
  app.post("/api/platform/giveaways",auth,ownerOnly,(req,res)=>{
    const g={id:id(),title:clean(req.body?.title,100),prize:clean(req.body?.prize,100),endsAt:clean(req.body?.endsAt,40),entries:[],status:"open",createdAt:new Date().toISOString()};
    if(!g.title||!g.prize)return res.status(400).json({error:"أدخل عنوان وجائزة"});
    data.giveaways.unshift(g); save(); logPlatform("giveaway_created",req.account.id,g.title); res.status(201).json({giveaway:g});
  });
  app.post("/api/platform/giveaways/:id/join",auth,(req,res)=>{
    const g=data.giveaways.find(x=>x.id===req.params.id&&x.status==="open"); if(!g)return res.status(404).json({error:"السحب غير موجود"});
    if(!g.entries.includes(req.account.username))g.entries.push(req.account.username); save(); res.json({giveaway:g});
  });

  app.get("/api/platform/overview",auth,async(req,res)=>{
    let members=0; try{members=(await getAllMembers(await getGuild())).length;}catch{}
    res.json({members,bots:data.bots.length,tickets:data.tickets.filter(t=>t.status==="open").length,applications:data.applications.filter(a=>a.status==="open").length,reviews:data.reviews.length,giveaways:data.giveaways.filter(g=>g.status==="open").length,botReady:client.isReady()});
  });

  client.on("messageCreate",async(message)=>{
    if(message.author.bot||!message.guild||message.guild.id!==process.env.DISCORD_GUILD_ID)return;
    const text=String(message.content||"").trim(); if(!text.startsWith("!"))return;
    const [cmd,...args]=text.slice(1).split(/\s+/);
    try{
      if(cmd==="ping") await message.reply("🏓 MLD Bot شغال.");
      else if(cmd==="help") await message.reply("🤖 MLD: !ping !server !top !balance !daily !streak !games");
      else if(cmd==="server"){const g=await getGuild(); await message.reply("🌐 "+g.name+" · "+g.memberCount+" عضو");}
      else if(cmd==="top"){const g=await getGuild(); const ms=await getAllMembers(g); const top=ms.sort((a,b)=>(b.id.localeCompare(a.id))).slice(0,5); await message.reply("🏆 TOP\n"+top.map((m,i)=>(i+1)+". "+m.displayName).join("\n"));}
      else if(cmd==="balance"){const w=data.wallets[message.author.id]||{coins:0}; await message.reply("💰 رصيدك: "+w.coins+" عملة");}
      else if(cmd==="daily"){const key=message.author.id, now=Date.now(), old=data.streaks[key]||{days:0,last:null}; if(old.last&&now-old.last<86400000)return message.reply("⏳ استلمت اليومية بالفعل."); old.days=old.last&&now-old.last<172800000?old.days+1:1; old.last=now; data.streaks[key]=old; data.wallets[key]=Object.assign({coins:0},data.wallets[key],{coins:(data.wallets[key]?.coins||0)+100+old.days*10}); save(); await message.reply("🎁 استلمت "+(100+old.days*10)+" عملة · ستريك "+old.days);}
      else if(cmd==="streak"){const s=data.streaks[message.author.id]||{days:0}; await message.reply("🔥 ستريك: "+s.days+" يوم");}
      else if(cmd==="games") await message.reply("🎮 الألعاب: بلوت · UNO · جاكارو · لودو · مونوبولي");
    }catch(e){console.error("MLD command:",e);}
  });
};
