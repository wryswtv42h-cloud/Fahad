"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client, GatewayIntentBits } = require("discord.js");

module.exports = function setupBotManager({ app, auth, logPlatform, platform, savePlatform }) {
  const dir = path.join(__dirname, "data");
  const file = path.join(dir, "user-bots.json");
  const clientId = String(process.env.DISCORD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || "").trim();
  const publicUrl = String(process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const redirectUri = String(process.env.DISCORD_OAUTH_REDIRECT_URI || (publicUrl ? publicUrl + "/api/platform/discord/callback" : "")).trim();
  const masterSecret = String(process.env.BOT_TOKEN_ENCRYPTION_KEY || "").trim();
  const runtime = new Map();
  const oauthStates = new Map();

  function load() {
    try {
      fs.mkdirSync(dir, { recursive:true });
      if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ bots:[] }, null, 2));
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      return { bots:Array.isArray(d.bots) ? d.bots : [] };
    } catch (e) {
      console.error("Bot manager storage read:", e);
      return { bots:[] };
    }
  }
  let store = load();

  function save() {
    fs.mkdirSync(dir, { recursive:true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, file);
  }

  function key() {
    if (!masterSecret) return null;
    return crypto.createHash("sha256").update(masterSecret).digest();
  }

  function encrypt(value) {
    const k = key();
    if (!k) throw new Error("أضف BOT_TOKEN_ENCRYPTION_KEY في متغيرات Railway أولًا");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { iv:iv.toString("base64"), tag:cipher.getAuthTag().toString("base64"), data:data.toString("base64") };
  }

  function decrypt(payload) {
    const k = key();
    if (!k || !payload) throw new Error("مفتاح تشفير البوت غير متوفر");
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
  }

  function owned(req) { return store.bots.filter(b => b.ownerId === req.account.id); }
  function safeBot(b) {
    const live = runtime.get(b.id);
    return {
      id:b.id, name:b.name, description:b.description,
      guildId:b.guildId, guildName:b.guildName, botUserId:b.botUserId,
      botUsername:b.botUsername, botAvatar:b.botAvatar || null, enabled:Boolean(b.enabled), modules:Array.isArray(b.modules) ? b.modules : [],
      status:live?.status || b.status || "stopped",
      lastError:b.lastError || "",
      createdAt:b.createdAt
    };
  }

  async function discordApi(url, options={}) {
    const r = await fetch("https://discord.com/api/v10" + url, options);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message || "Discord API error");
    return body;
  }

  function pruneStates() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [state, value] of oauthStates) if (value.at < cutoff) oauthStates.delete(state);
  }

  app.get("/api/platform/discord/oauth/start", auth, (req, res) => {
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(503).json({ error:"ربط Discord غير مفعّل: أضف DISCORD_OAUTH_CLIENT_ID وDISCORD_OAUTH_CLIENT_SECRET وDISCORD_OAUTH_REDIRECT_URI" });
    }
    pruneStates();
    const state = crypto.randomBytes(32).toString("hex");
    oauthStates.set(state, { accountId:req.account.id, at:Date.now() });
    const url = new URL("https://discord.com/oauth2/authorize");
    url.searchParams.set("response_type","code");
    url.searchParams.set("client_id",clientId);
    url.searchParams.set("scope","identify guilds");
    url.searchParams.set("state",state);
    url.searchParams.set("redirect_uri",redirectUri);
    res.json({ url:url.toString() });
  });

  app.get("/api/platform/discord/callback", async (req, res) => {
    try {
      pruneStates();
      const state = String(req.query.state || "");
      const code = String(req.query.code || "");
      const pending = oauthStates.get(state);
      oauthStates.delete(state);
      if (!pending || !code) return res.status(400).send("رابط الربط غير صالح أو انتهت صلاحيته.");
      if (!clientId || !clientSecret || !redirectUri) return res.status(503).send("Discord OAuth غير مفعّل.");
      const params = new URLSearchParams({
        grant_type:"authorization_code", code, redirect_uri:redirectUri,
        client_id:clientId, client_secret:clientSecret
      });
      const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
        method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body:params
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error_description || "فشل ربط Discord");
      const headers = { Authorization:"Bearer " + tokenData.access_token };
      const [me, guilds] = await Promise.all([
        discordApi("/users/@me", { headers }),
        discordApi("/users/@me/guilds", { headers })
      ]);
      const account = platform.accounts.find(a => a.id === pending.accountId);
      if (!account) return res.status(404).send("الحساب غير موجود.");
      const manageableGuilds = guilds.filter(g => {
        try {
          const p = BigInt(String(g.permissions || "0"));
          return (p & 8n) !== 0n || (p & 32n) !== 0n || g.owner;
        } catch { return Boolean(g.owner); }
      }).map(g => ({ id:g.id, name:g.name, icon:g.icon || null, owner:Boolean(g.owner), permissions:String(g.permissions || "0") }));
      account.discordOauthId = me.id;
      account.discordUsername = account.discordUsername || me.username;
      account.discordGuilds = manageableGuilds;
      account.discordLinkedAt = new Date().toISOString();
      savePlatform();
      logPlatform("discord_linked", account.id, me.id);
      const target = publicUrl || "/";
      return res.redirect(target + "#bots-linked");
    } catch (e) {
      console.error("Discord OAuth callback:", e);
      return res.status(500).send("تعذر ربط Discord: " + String(e.message || "خطأ"));
    }
  });

  app.get("/api/platform/discord/status", auth, (req, res) => {
    const a=req.account;
    res.json({
      linked:Boolean(a.discordId && /^\d{15,22}$/.test(String(a.discordId))),
      discordId:a.discordId || null,
      username:a.discordUsername || null,
      oauthLinked:Boolean(a.discordOauthId),
      guilds:Array.isArray(a.discordGuilds) ? a.discordGuilds : []
    });
  });

  app.get("/api/platform/bot-catalog", (req,res) => {
    const publicBots = [
      {id:"mld-suite",name:"MLD Suite",description:"حزمة بوت متكاملة: حماية وألعاب وبنك وستريك وتذاكر وتقديمات وبرودكاست وقيفاوي.",botUsername:"MLD Suite",status:"online",enabled:true,programmed:true,features:["حماية كاملة","ألعاب كاملة","بنك كامل","ستريك كامل","تيكت كامل","تقديم كامل","برودكاست كامل","قيفاوي كامل"],systems:["protection","games","bank","streak","tickets","applications","broadcast","giveaways"]},
      {id:"mld-protection",name:"MLD Protection",description:"نظام حماية مستقل لمكافحة السبام والروابط والمنشنات والهجمات السريعة.",botUsername:"MLD Protection",status:"online",enabled:true,programmed:true,features:["مكافحة السبام","روابط الدعوات","منشنات جماعية","قفل القنوات"],systems:["protection"]},
      {id:"mld-games",name:"MLD Games",description:"بوت ألعاب للسيرفر مع روليت وألعاب سريعة ونظام نتائج.",botUsername:"MLD Games",status:"online",enabled:true,programmed:true,features:["روليت","عملة","نرد","نتائج"],systems:["games"]},
      {id:"mld-economy",name:"MLD Economy",description:"بنك واقتصاد وستريك يومي وحوالات وترتيب أعضاء.",botUsername:"MLD Economy",status:"online",enabled:true,programmed:true,features:["رصيد","يومية","تحويل","ستريك","توب"],systems:["bank","streak"]},
      {id:"mld-support",name:"MLD Support",description:"نظام تيكت وتقديمات منظم مع قنوات خاصة وإغلاق وحفظ السجل.",botUsername:"MLD Support",status:"online",enabled:true,programmed:true,features:["تيكت","تقديمات","قنوات خاصة","إغلاق"],systems:["tickets","applications"]},
      {id:"mld-community",name:"MLD Community",description:"برودكاست وقيفاوي وأدوات تفاعل المجتمع.",botUsername:"MLD Community",status:"online",enabled:true,programmed:true,features:["برودكاست","قيفاوي","مشاركات","اختيار فائز"],systems:["broadcast","giveaways"]},
      {id:"mld-managed",name:"البوتات المضافة",description:"البوتات التي يضيفها أصحاب الحسابات من لوحة البوتات.",botUsername:"بوتات الأعضاء",status:"catalog",enabled:true,programmed:false,features:["مصادقة Discord","اختيار السيرفر","تشغيل وإيقاف","اختبار الاتصال","لوحة تحكم"],systems:[]}
    ];
    let mine=[];
    try {
      const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      const accountId=sessions?.get(bearer);
      if(accountId) mine=store.bots.filter(b=>b.ownerId===accountId).map(safeBot);
    } catch {}
    res.json({ encryptionReady:Boolean(masterSecret), oauthReady:Boolean(clientId && clientSecret && redirectUri), bots:publicBots.concat(mine) });
  });

  async function startBot(record) {
    if (runtime.has(record.id)) return runtime.get(record.id);
    const rt = { status:"starting", client:null };
    runtime.set(record.id, rt);
    record.status = "starting";
    record.lastError = "";
    save();

    try {
      const token = decrypt(record.token);
      const c = new Client({
        intents:[
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ]
      });
      rt.client = c;
      c.once("ready", async () => {
        try {
          const guild = await c.guilds.fetch(record.guildId);
          if (!guild) throw new Error("البوت ليس داخل السيرفر المحدد");
          record.botUserId = c.user.id;
          record.botUsername = c.user.tag || c.user.username;
          record.botAvatar = c.user.displayAvatarURL({ extension: "png", size: 256 });
          record.status = "online";
          record.enabled = true;
          record.lastError = "";
          rt.status = "online";
          save();
        } catch (e) {
          record.status="error"; record.lastError=String(e.message || e);
          rt.status="error";
          save();
          try { await c.destroy(); } catch {}
          runtime.delete(record.id);
        }
      });
      c.on("error", e => {
        record.lastError=String(e.message || e);
        record.status="error";
        rt.status="error";
        save();
      });
      c.on("messageCreate", async message => {
        if (message.author.bot || !message.guild || message.guild.id !== record.guildId) return;
        record.lastActivityAt = new Date().toISOString();
        save();

        const content = String(message.content || "").trim();
        const prefix = String(record.prefix || "!").slice(0, 5);
        record.data = record.data || {wallets:{},streaks:{},tickets:{},applications:{},giveaways:{}};
        record.data.wallets = record.data.wallets || {};
        record.data.streaks = record.data.streaks || {};
        record.data.tickets = record.data.tickets || {};
        record.data.applications = record.data.applications || {};
        record.data.giveaways = record.data.giveaways || {};
        const enabled = id => !Array.isArray(record.modules) || record.modules.length===0 || record.modules.includes(id);
        const wallet = id => { if(!record.data.wallets[id]) record.data.wallets[id]={coins:100}; return record.data.wallets[id]; };
        const durationMs = value => { const m=String(value||"").match(/^(\d+)(s|m|h|d)$/i); if(!m)return 600000; const n=Number(m[1]); return n*({s:1000,m:60000,h:3600000,d:86400000})[m[2].toLowerCase()]; };
        const memberName = m => m?.displayName || m?.user?.globalName || m?.user?.username || "عضو";
        if(enabled("protection") && !message.member?.permissions?.has("Administrator")){
          const rt=runtime.get(record.id); rt.spam=rt.spam||new Map(); const key=message.author.id; const now=Date.now();
          const arr=(rt.spam.get(key)||[]).filter(t=>now-t<8000); arr.push(now); rt.spam.set(key,arr);
          const invite=/(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/i.test(content);
          if(invite || arr.length>=7){try{await message.delete();}catch{} if(message.member?.moderatable){try{await message.member.timeout(60000,"MLD Protection");}catch{}} return;}
        }
        if (!content.startsWith(prefix)) return;

        const raw = content.slice(prefix.length).trim();
        const parts = raw ? raw.split(/\s+/) : [];
        const command = String(parts.shift() || "").toLowerCase();
        const args = parts;

        try {
          if (command === "ping") {
            await message.reply("🏓 Pong! " + Math.max(0, Math.round(c.ws.ping)) + "ms");
          } else if (command === "balance" && enabled("bank")) {
            const w=wallet(message.author.id); await message.reply("💰 رصيدك: **"+w.coins+"**");
          } else if (command === "daily" && (enabled("bank") || enabled("streak"))) {
            const w=wallet(message.author.id), now=Date.now(), day=86400000, last=Number(w.daily||0);
            if(now-last<day)return message.reply("⏳ أخذت اليومية بالفعل. ارجع بعد "+Math.ceil((day-(now-last))/3600000)+" ساعة.");
            w.coins+=100; w.daily=now; const st=record.data.streaks[message.author.id]||{days:0,last:0};
            st.days=(now-st.last<=48*3600000)?st.days+1:1; st.last=now; record.data.streaks[message.author.id]=st; save();
            await message.reply("🎁 اليومية: **+100** عملة · 🔥 الستريك: **"+st.days+"** يوم");
          } else if (command === "streak" && enabled("streak")) {
            const st=record.data.streaks[message.author.id]||{days:0}; await message.reply("🔥 ستريكك: **"+st.days+"** يوم");
          } else if (command === "pay" && enabled("bank")) {
            const target=message.mentions.users.first(), amount=Math.floor(Number(args.find(x=>/^\\d+$/.test(x))||0));
            if(!target||amount<=0)return message.reply("استخدم: "+prefix+"pay @عضو 100");
            const from=wallet(message.author.id); if(from.coins<amount)return message.reply("رصيدك لا يكفي.");
            from.coins-=amount; wallet(target.id).coins+=amount; save(); await message.reply("💸 تم تحويل **"+amount+"** عملة إلى @"+target.username);
          } else if (command === "top" && enabled("bank")) {
            const top=Object.entries(record.data.wallets).sort((a,b)=>b[1].coins-a[1].coins).slice(0,10).map((x,i)=>(i+1)+". <@"+x[0]+"> — "+x[1].coins).join("\\n");
            await message.reply("🏆 **توب البنك**\\n"+(top||"لا يوجد رصيد بعد."));
          } else if (command === "coin" && enabled("games")) {
            await message.reply("🪙 **"+(Math.random()<0.5?"وجه":"كتابة")+"**");
          } else if (command === "dice" && enabled("games")) {
            await message.reply("🎲 النتيجة: **"+(Math.floor(Math.random()*6)+1)+"**");
          } else if (command === "ticket" && enabled("tickets")) {
            const existing=Object.values(record.data.tickets).find(t=>t.userId===message.author.id&&t.open);
            if(existing)return message.reply("🎫 عندك تيكت مفتوح بالفعل: <#"+existing.channelId+">");
            const ch=await message.guild.channels.create({name:"ticket-"+message.author.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,20),type:0,permissionOverwrites:[{id:message.guild.roles.everyone.id,deny:["ViewChannel"]},{id:message.author.id,allow:["ViewChannel","SendMessages","ReadMessageHistory"]},{id:c.user.id,allow:["ViewChannel","SendMessages","ReadMessageHistory","ManageChannels"]}]});
            record.data.tickets[ch.id]={userId:message.author.id,channelId:ch.id,open:true,createdAt:new Date().toISOString()}; save();
            await ch.send("🎫 **تيكت جديد**\\n@"+memberName(message.member)+" سيتم الرد عليك هنا. استخدم "+prefix+"ticket-close عند انتهاء الطلب.");
          } else if (command === "ticket-close" && enabled("tickets")) {
            const t=record.data.tickets[message.channel.id]; if(!t)return message.reply("هذه القناة ليست تيكت لهذا البوت.");
            t.open=false;t.closedAt=new Date().toISOString();save(); await message.channel.send("🔒 سيتم إغلاق التيكت."); setTimeout(()=>message.channel.delete().catch(()=>{}),1500);
          } else if (command === "apply" && enabled("applications")) {
            const ch=await message.guild.channels.create({name:"application-"+message.author.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,18),type:0,permissionOverwrites:[{id:message.guild.roles.everyone.id,deny:["ViewChannel"]},{id:message.author.id,allow:["ViewChannel","SendMessages","ReadMessageHistory"]},{id:c.user.id,allow:["ViewChannel","SendMessages","ReadMessageHistory","ManageChannels"]}]});
            record.data.applications[ch.id]={userId:message.author.id,channelId:ch.id,status:"pending",createdAt:new Date().toISOString()};save();
            await ch.send("📝 **تقديم جديد**\\nاكتب إجاباتك هنا، وسيتم حفظ التقديم حتى يراجعه المسؤولون.");
          } else if (command === "broadcast" && enabled("broadcast")) {
            const channel=message.mentions.channels.first(), text=args.filter(x=>!/^<#[0-9]+>$/.test(x)).join(" ");
            if(!channel||!text)return message.reply("استخدم: "+prefix+"broadcast #القناة الرسالة");
            if(!message.member.permissions.has("ManageGuild"))return message.reply("تحتاج صلاحية إدارة السيرفر.");
            await channel.send("📢 **إعلان**\\n"+text); await message.reply("✅ تم نشر البرودكاست.");
          } else if (command === "giveaway" && enabled("giveaways")) {
            const channel=message.channel, ms=durationMs(args[0]), prize=args.slice(1).join(" ")||"جائزة";
            const end=Date.now()+ms; const msg=await channel.send("🎉 **قيفاوي**\\n🎁 الجائزة: **"+prize+"**\\nاضغط 🎉 للمشاركة.\\nينتهي: <t:" + Math.floor(end/1000) + ":R>");
            await msg.react("🎉").catch(()=>{});
            record.data.giveaways[msg.id]={messageId:msg.id,channelId:channel.id,prize,endsAt:end,entries:[]};save();
            setTimeout(async()=>{const g=record.data.giveaways[msg.id];if(!g||g.finished)return;const m=await channel.messages.fetch(msg.id).catch(()=>null);const users=m?await m.reactions.cache.get("🎉")?.users.fetch().catch(()=>null):null;const candidates=users?[...users.values()].filter(u=>!u.bot):[];const winner=candidates[Math.floor(Math.random()*candidates.length)];g.finished=true;g.winnerId=winner?.id||null;save();await channel.send(winner?"🏆 الفائز: <@"+winner.id+"> — "+prize:"❌ انتهى القيفاوي بدون مشاركين.");},ms);
          } else if (command === "enter" && enabled("giveaways")) {
            const g=Object.values(record.data.giveaways).find(x=>x.channelId===message.channel.id&&!x.finished); if(!g)return message.reply("لا يوجد قيفاوي مفتوح هنا."); if(!g.entries.includes(message.author.id))g.entries.push(message.author.id);save(); await message.reply("🎉 تم تسجيل مشاركتك.");
          } else if (command === "lock" && enabled("protection")) {
            if(!message.member.permissions.has("ManageChannels"))return message.reply("تحتاج صلاحية إدارة القنوات.");
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:false}); await message.reply("🔒 تم قفل القناة.");
          } else if (command === "unlock" && enabled("protection")) {
            if(!message.member.permissions.has("ManageChannels"))return message.reply("تحتاج صلاحية إدارة القنوات.");
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:null}); await message.reply("🔓 تم فتح القناة.");
          } else if (command === "clear" && enabled("protection")) {
            if(!message.member.permissions.has("ManageMessages"))return message.reply("تحتاج صلاحية إدارة الرسائل.");
            const n=Math.max(1,Math.min(100,Number(args[0]||10))); const msgs=await message.channel.messages.fetch({limit:n}); await message.channel.bulkDelete(msgs,true); await message.reply("🧹 تم حذف "+msgs.size+" رسالة.").then(x=>setTimeout(()=>x.delete().catch(()=>{}),1800));
          } else if (command === "help") {
            await message.reply([
              "🤖 أوامر البوت:",
              prefix + "ping — فحص الاتصال",
              prefix + "help — عرض الأوامر",
              prefix + "server — معلومات السيرفر",
              prefix + "bot — معلومات البوت",
              prefix + "roulette @شخص @شخص... — سحب عشوائي متحرك بالأسماء"
            ].join("\\n"));
          } else if (command === "roulette") {
            const mentions = Array.from(message.mentions.members?.values?.() || []).filter(m => !m.user.bot);
            const unique = [];
            const seen = new Set();
            for (const m of mentions) {
              if (!seen.has(m.id)) { seen.add(m.id); unique.push(m); }
            }
            if (unique.length < 2) return message.reply("🎰 اذكر شخصين أو أكثر بعد الأمر، مثال: " + prefix + "roulette @أحمد @محمد");
            const names = unique.slice(0, 20).map(m => m.displayName || m.user.globalName || m.user.username);
            const spin = await message.reply("🎰 الروليت تبدأ...\\n" + names.map((n, i) => (i === 0 ? "👉 " : "▫️ ") + n).join("\\n"));
            const rounds = Math.min(10, Math.max(5, names.length + 3));
            for (let i = 0; i < rounds; i++) {
              const pick = Math.floor(Math.random() * names.length);
              const frame = names.map((n, j) => (j === pick ? "🟢 " : "▫️ ") + n).join("\\n");
              await new Promise(resolve => setTimeout(resolve, 180 + i * 35));
              await spin.edit("🎰 الروليت تدور...\\n" + frame).catch(() => {});
            }
            const winner = Math.floor(Math.random() * names.length);
            await spin.edit("🎰 **النتيجة النهائية**\\n🏆 **" + names[winner] + "**").catch(() => {});
          } else if (command === "server") {
            await message.reply("🏠 " + message.guild.name + " • الأعضاء: " + message.guild.memberCount);
          } else if (command === "bot") {
            await message.reply("🤖 " + (c.user?.tag || c.user?.username || "Bot") + " • متصل ✓");
          }
        } catch (e) {
          record.lastError = String(e.message || e);
          save();
        }
      });
      await c.login(token);
      return rt;
    } catch (e) {
      record.status="error";
      record.enabled=false;
      record.lastError=String(e.message || "فشل تشغيل البوت");
      save();
      runtime.delete(record.id);
      throw e;
    }
  }

  async function stopBot(record) {
    const rt=runtime.get(record.id);
    if (rt?.client) {
      try { await rt.client.destroy(); } catch {}
    }
    runtime.delete(record.id);
    record.enabled=false;
    record.status="stopped";
    save();
  }

  app.get("/api/platform/my-bots", auth, (req,res) => {
    res.json({ bots:owned(req).map(safeBot), encryptionReady:Boolean(masterSecret) });
  });

  app.post("/api/platform/my-bots", auth, async (req,res) => {
    try {
      if (!masterSecret) return res.status(503).json({ error:"أضف BOT_TOKEN_ENCRYPTION_KEY في Railway قبل حفظ توكنات البوتات" });
      if (!req.account.discordId) return res.status(400).json({ error:"اربط حساب Discord أولًا" });
      const guildId=String(req.body?.guildId || "");
      const token=String(req.body?.token || "").trim();
      const name=String(req.body?.name || "").trim().slice(0,80);
      const prefix=String(req.body?.prefix || "!").trim().slice(0,5) || "!";
      if (!token || token.length < 20) return res.status(400).json({ error:"أدخل توكن البوت الصحيح" });
      const guilds=Array.isArray(req.account.discordGuilds) ? req.account.discordGuilds : [];
      const selected=guilds.find(g=>g.id===guildId);
      if (!selected) return res.status(403).json({ error:"السيرفر غير موجود ضمن السيرفرات التي ربطتها بحساب Discord" });

      const testClient=new Client({ intents:[GatewayIntentBits.Guilds] });
      let botUser;
      try {
        await testClient.login(token);
        botUser=testClient.user;
        if (!botUser?.bot) throw new Error("التوكن ليس لبوت Discord");
        const guild=await testClient.guilds.fetch(guildId).catch(()=>null);
        if (!guild) throw new Error("البوت غير موجود داخل السيرفر المحدد. ادعُ البوت إلى السيرفر أولًا ثم حاول مرة أخرى.");
      } finally {
        try { await testClient.destroy(); } catch {}
      }

      const duplicate=store.bots.find(b=>b.ownerId===req.account.id && b.botUserId===botUser.id);
      if (duplicate) return res.status(409).json({ error:"هذا البوت مضاف عندك بالفعل" });

      const record={
        id:crypto.randomUUID(),
        ownerId:req.account.id,
        name:name || botUser.globalName || botUser.username || "بوت Discord",
        description:"بوتك الخاص المستضاف على MLD",
        guildId,
        guildName:selected.name,
        token:encrypt(token),
        botUserId:botUser.id,
        botUsername:botUser.tag || botUser.username,
        botAvatar:botUser.displayAvatarURL({ extension:"png", size:256 }),
        prefix,
        modules: Array.isArray(req.body?.modules) ? req.body.modules.filter(x => ["protection","games","bank","streak","tickets","applications","broadcast","giveaways"].includes(String(x))) : [],
        enabled:true,
        status:"starting",
        lastError:"",
        lastActivityAt:null,
        createdAt:new Date().toISOString()
      };
      store.bots.push(record);
      save();
      try { await startBot(record); }
      catch (e) {
        store.bots=store.bots.filter(x=>x.id!==record.id);
        save();
        return res.status(400).json({ error:record.lastError || String(e.message || "تعذر تشغيل البوت") });
      }
      logPlatform("managed_bot_created",req.account.id,record.botUserId+":"+record.guildId);
      res.status(201).json({ bot:safeBot(record) });
    } catch(e) {
      console.error("Add managed bot:",e);
      res.status(400).json({ error:String(e.message || "تعذر إضافة البوت") });
    }
  });

  app.post("/api/platform/my-bots/:id/start", auth, async (req,res) => {
    const b=store.bots.find(x=>x.id===req.params.id && x.ownerId===req.account.id);
    if(!b) return res.status(404).json({error:"البوت غير موجود"});
    try { await startBot(b); res.json({bot:safeBot(b)}); }
    catch(e){ res.status(400).json({error:b.lastError || String(e.message || "تعذر التشغيل")}); }
  });

  app.post("/api/platform/my-bots/:id/stop", auth, async (req,res) => {
    const b=store.bots.find(x=>x.id===req.params.id && x.ownerId===req.account.id);
    if(!b) return res.status(404).json({error:"البوت غير موجود"});
    await stopBot(b); res.json({bot:safeBot(b)});
  });

  app.delete("/api/platform/my-bots/:id", auth, async (req,res) => {
    const i=store.bots.findIndex(x=>x.id===req.params.id && x.ownerId===req.account.id);
    if(i<0) return res.status(404).json({error:"البوت غير موجود"});
    const b=store.bots[i];
    await stopBot(b);
    store.bots.splice(i,1);
    save();
    logPlatform("managed_bot_deleted",req.account.id,b.botUserId || b.id);
    res.json({ok:true});
  });

  function getRuntime(req) {
    const b=store.bots.find(x=>x.id===req.params.id && x.ownerId===req.account.id);
    const rt=runtime.get(req.params.id);
    if(!b) return {error:"البوت غير موجود"};
    if(!rt?.client || rt.status!=="online") return {error:"البوت غير متصل حاليًا"};
    return {b,rt};
  }

  app.get("/api/platform/my-bots/:id/channels", auth, async (req,res) => {
    const x=getRuntime(req); if(x.error)return res.status(400).json({error:x.error});
    const guild=await x.rt.client.guilds.fetch(x.b.guildId);
    const channels=await guild.channels.fetch();
    res.json({channels:[...channels.values()].filter(c=>c && c.isTextBased() && c.viewable).sort((a,b)=>a.position-b.position).map(c=>({id:c.id,name:c.name}))});
  });

  app.post("/api/platform/my-bots/:id/command", auth, async (req,res) => {
    try {
      const x=getRuntime(req); if(x.error)return res.status(400).json({error:x.error});
      const channelId=String(req.body?.channelId || "");
      const command=String(req.body?.command || "").trim();
      if(!channelId || !command) return res.status(400).json({error:"اختر القناة والأمر"});
      if(!/^![a-z0-9-]{1,32}(?:\s+.{0,300})?$/i.test(command)) return res.status(400).json({error:"صيغة الأمر غير صحيحة"});
      const channel=await x.rt.client.channels.fetch(channelId);
      if(!channel || !channel.isTextBased()) return res.status(404).json({error:"القناة غير موجودة"});
      await channel.send(command);
      logPlatform("managed_bot_command",req.account.id,x.b.botUserId+":"+command.slice(0,120));
      res.json({ok:true});
    } catch(e) { res.status(400).json({error:String(e.message || "تعذر تنفيذ الأمر")}); }
  });

  app.post("/api/platform/my-bots/:id/test", auth, async (req,res) => {
    try {
      const x=getRuntime(req); if(x.error)return res.status(400).json({error:x.error});
      const guild=await x.rt.client.guilds.fetch(x.b.guildId);
      res.json({ok:true,ping:x.rt.client.ws.ping,guild:{id:guild.id,name:guild.name,members:guild.memberCount},bot:{id:x.rt.client.user.id,tag:x.rt.client.user.tag}});
    } catch(e){res.status(400).json({error:String(e.message || "فشل الاختبار")});}
  });

  // Start previously saved bots after a restart. They use encrypted tokens and never expose them.
  setTimeout(async () => {
    for (const b of store.bots) {
      if (b.enabled && b.ownerId && b.guildId) {
        try { await startBot(b); } catch {}
      }
    }
  }, 1500);
};
