"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function setupMLDExtra({ app, client, auth, ownerOnly, logPlatform, getGuild, getAllMembers, platform, savePlatform }) {
  const dir = path.join(__dirname, "data");
  const file = path.join(dir, "features.json");
  const defaultData = {
    bots: [],
    botSettings: {},
    tickets: [],
    applications: [],
    reviews: [],
    privateMessages: [],
    chats: { general: [], rooms: {} },
    wallets: {},
    streaks: {},
    giveaways: []
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
  const staffOnly=(req,res,next)=>req.account?.role==="owner" ? next() : res.status(403).json({error:"هذا القسم للإدارة والأونر"});
  function chatMember(room, username){ return room.members.includes(username) || room.owner===username; }
  app.get("/api/platform/chat/general",(req,res)=>res.json({messages:data.chats.general.slice(-200)}));
  app.post("/api/platform/chat/general",auth,(req,res)=>{
    const message=clean(req.body?.message,1000); if(!message)return res.status(400).json({error:"اكتب رسالة"});
    const item={id:id(),username:req.account.username,message,at:new Date().toISOString()};
    data.chats.general.push(item); data.chats.general=data.chats.general.slice(-500); save(); logPlatform("general_chat_message",req.account.id,message.slice(0,80)); res.status(201).json({message:item});
  });
  app.get("/api/platform/chat/rooms",auth,(req,res)=>{
    const rooms=Object.values(data.chats.rooms).filter(r=>chatMember(r,req.account.username)).map(r=>({id:r.id,name:r.name,owner:r.owner,members:r.members,messages:r.messages.slice(-100)}));
    res.json({rooms});
  });
  app.post("/api/platform/chat/rooms",auth,(req,res)=>{
    const raw=Array.isArray(req.body?.members)?req.body.members.map(x=>clean(x,24).toLowerCase()).filter(Boolean):[];
    const members=[...new Set([req.account.username,...raw])];
    const valid=members.filter(u=>platform.accounts.some(a=>a.username===u));
    if(valid.length<2)return res.status(400).json({error:"اختر شخصًا واحدًا على الأقل من الحسابات المسجلة"});
    const room={id:id(),name:clean(req.body?.name,60)||"شات خاص",owner:req.account.username,members:valid,messages:[],createdAt:new Date().toISOString()};
    data.chats.rooms[room.id]=room; save(); logPlatform("private_chat_created",req.account.id,room.id); res.status(201).json({room});
  });
  app.post("/api/platform/chat/rooms/:id/message",auth,(req,res)=>{
    const room=data.chats.rooms[req.params.id]; if(!room)return res.status(404).json({error:"الشات غير موجود"});
    if(!chatMember(room,req.account.username))return res.status(403).json({error:"لست عضوًا في هذا الشات"});
    const message=clean(req.body?.message,1000); if(!message)return res.status(400).json({error:"اكتب رسالة"});
    const item={id:id(),username:req.account.username,message,at:new Date().toISOString()};
    room.messages.push(item); room.messages=room.messages.slice(-500); save(); logPlatform("private_chat_message",req.account.id,room.id); res.status(201).json({message:item});
  });
  app.post("/api/platform/chat/rooms/:id/members",auth,(req,res)=>{
    const room=data.chats.rooms[req.params.id]; if(!room)return res.status(404).json({error:"الشات غير موجود"});
    if(room.owner!==req.account.username)return res.status(403).json({error:"مالك الشات فقط يقدر يعدل الأعضاء"});
    const username=clean(req.body?.username,24).toLowerCase();
    if(!platform.accounts.some(a=>a.username===username))return res.status(404).json({error:"الحساب غير موجود"});
    if(!room.members.includes(username))room.members.push(username); save(); logPlatform("private_chat_member_added",req.account.id,room.id+":"+username); res.json({room});
  });
  app.delete("/api/platform/chat/rooms/:id/members/:username",auth,(req,res)=>{
    const room=data.chats.rooms[req.params.id]; if(!room)return res.status(404).json({error:"الشات غير موجود"});
    if(room.owner!==req.account.username)return res.status(403).json({error:"مالك الشات فقط يقدر يعدل الأعضاء"});
    const username=clean(req.params.username,24).toLowerCase(); if(username===room.owner)return res.status(400).json({error:"لا يمكن حذف مالك الشات"});
    room.members=room.members.filter(x=>x!==username); save(); logPlatform("private_chat_member_removed",req.account.id,room.id+":"+username); res.json({room});
  });
  require("./bot-manager")({ app, auth, logPlatform, platform, savePlatform });

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
    res.json({account:req.account});
  });

  app.get("/api/platform/tickets",auth,(req,res)=>{
    const mine=data.tickets.filter(t=>t.owner===req.account.username||req.account.role==="owner");
    res.json({tickets:mine});
  });
  app.post("/api/platform/tickets",auth,(req,res)=>{
    const ticket={id:id(),owner:req.account.username,title:clean(req.body?.title,100),category:clean(req.body?.category||"عام",30),message:clean(req.body?.message,1000),status:"open",createdAt:new Date().toISOString(),replies:[]};
    if(ticket.title.length<2||ticket.message.length<2)return res.status(400).json({error:"أكمل بيانات التذكرة"});
    data.tickets.unshift(ticket); save(); logPlatform("ticket_created",req.account.id,ticket.title); res.status(201).json({ticket});
  });
  app.post("/api/platform/tickets/:id/reply",auth,(req,res)=>{
    const t=data.tickets.find(x=>x.id===req.params.id); if(!t)return res.status(404).json({error:"التذكرة غير موجودة"});
    if(t.owner!==req.account.username&&req.account.role!=="owner")return res.status(403).json({error:"لا تملك صلاحية هذه التذكرة"});
    t.replies.push({id:id(),by:req.account.username,message:clean(req.body?.message,1000),at:new Date().toISOString()});
    save(); res.json({ticket:t});
  });
  app.post("/api/platform/tickets/:id/close",auth,(req,res)=>{
    const t=data.tickets.find(x=>x.id===req.params.id); if(!t)return res.status(404).json({error:"التذكرة غير موجودة"});
    if(t.owner!==req.account.username&&req.account.role!=="owner")return res.status(403).json({error:"لا تملك صلاحية إغلاقها"});
    t.status="closed"; save(); logPlatform("ticket_closed",req.account.id,t.id); res.json({ticket:t});
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

  app.get("/api/platform/reviews",(req,res)=>res.json({reviews:data.reviews.slice(0,100)}));
  app.post("/api/platform/reviews",auth,(req,res)=>{
    const r={id:id(),username:req.account.username,rating:Math.max(1,Math.min(5,Number(req.body?.rating||5))),text:clean(req.body?.text,500),createdAt:new Date().toISOString()};
    if(r.text.length<2)return res.status(400).json({error:"اكتب رأيك"});
    data.reviews.unshift(r); data.reviews=data.reviews.slice(0,200); save(); logPlatform("review_created",req.account.id,r.rating); res.status(201).json({review:r});
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
