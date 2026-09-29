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

  const slots = [
    { id:"community", name:"Community Bot", description:"إدارة المجتمع", commands:["ping","help","server","members"] },
    { id:"games", name:"Games Bot", description:"الألعاب والجلسات", commands:["games","ping","help"] },
    { id:"security", name:"Security Bot", description:"الحماية والتنبيهات", commands:["security","ping","help"] },
    { id:"economy", name:"Economy Bot", description:"البنك والستريك", commands:["balance","daily","streak","ping","help"] }
  ];

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

  function slot(id) { return slots.find(s => s.id === id); }
  function owned(req) { return store.bots.filter(b => b.ownerId === req.account.id); }
  function safeBot(b) {
    const live = runtime.get(b.id);
    return {
      id:b.id, slot:b.slot, name:b.name, description:b.description,
      guildId:b.guildId, guildName:b.guildName, botUserId:b.botUserId,
      botUsername:b.botUsername, enabled:Boolean(b.enabled),
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
      account.discordId = me.id;
      account.discordUsername = me.global_name || me.username;
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
      guilds:Array.isArray(a.discordGuilds) ? a.discordGuilds : []
    });
  });

  app.get("/api/platform/bot-catalog", auth, (req,res) => {
    res.json({ slots, encryptionReady:Boolean(masterSecret), oauthReady:Boolean(clientId && clientSecret && redirectUri), bots:owned(req).map(safeBot) });
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
        const content=String(message.content || "").trim();
        if (!content.startsWith("!")) return;
        const [cmd,...args]=content.slice(1).split(/\s+/);
        const reply = async text => { try { await message.reply(String(text).slice(0,1900)); } catch {} };
        try {
          if (cmd==="ping") return reply("🏓 " + record.name + " شغال.");
          if (cmd==="help") return reply("🤖 الأوامر: " + slot(record.slot).commands.map(x => "!" + x).join(" · "));
          if (cmd==="server") return reply("🌐 " + message.guild.name + " · " + message.guild.memberCount + " عضو");
          if (cmd==="members") return reply("👥 أعضاء السيرفر: " + message.guild.memberCount);
          if (cmd==="games") return reply("🎮 بلوت · UNO · جاكارو · لودو · مونوبولي");
          if (cmd==="security") return reply("🛡️ نظام الحماية متصل ويستقبل أوامر لوحة التحكم.");
          if (cmd==="balance") return reply("💰 نظام البنك متصل. استخدم لوحة المنصة لإدارة الرصيد.");
          if (cmd==="daily") return reply("🎁 اليومية متاحة من لوحة المنصة.");
          if (cmd==="streak") return reply("🔥 الستريك متاح من لوحة المنصة.");
        } catch (e) { console.error("Managed bot command:",e); }
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
      const slotId=String(req.body?.slot || "");
      const s=slot(slotId);
      const guildId=String(req.body?.guildId || "");
      const token=String(req.body?.token || "").trim();
      if (!s) return res.status(400).json({ error:"اختر بوتًا صحيحًا" });
      if (!token || token.length < 20) return res.status(400).json({ error:"أدخل توكن البوت الصحيح" });
      const guilds=Array.isArray(req.account.discordGuilds) ? req.account.discordGuilds : [];
      const selected=guilds.find(g=>g.id===guildId);
      if (!selected) return res.status(403).json({ error:"السيرفر غير موجود ضمن السيرفرات التي ربطتها بحساب Discord" });
      const existing=store.bots.find(b=>b.ownerId===req.account.id && b.slot===slotId);
      if (existing) {
        await stopBot(existing);
        existing.token=encrypt(token);
        existing.guildId=guildId;
        existing.guildName=selected.name;
        existing.name=s.name;
        existing.description=s.description;
        existing.lastError="";
        existing.status="starting";
        existing.enabled=true;
        save();
        try { await startBot(existing); } catch {}
        return res.json({ bot:safeBot(existing) });
      }
      const record={
        id:crypto.randomUUID(), ownerId:req.account.id, slot:slotId, name:s.name, description:s.description,
        guildId, guildName:selected.name, token:encrypt(token), botUserId:null, botUsername:null,
        enabled:true, status:"starting", lastError:"", createdAt:new Date().toISOString()
      };
      store.bots.push(record);
      save();
      try { await startBot(record); } catch {}
      res.status(201).json({ bot:safeBot(record) });
    } catch(e) {
      console.error("Add managed bot:",e);
      res.status(500).json({ error:String(e.message || "تعذر تشغيل البوت") });
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
    logPlatform("managed_bot_deleted",req.account.id,b.slot);
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
      logPlatform("managed_bot_command",req.account.id,x.b.slot+":"+command.slice(0,120));
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
