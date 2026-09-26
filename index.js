"use strict";
require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT || 3000);

if (!token || !guildId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences
  ]
});

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "20kb" }));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.use(session({ secret: process.env.SESSION_SECRET || "mld-session-secret", resave: false, saveUninitialized: false, store: new pgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }), cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2592000000 } }));
app.use(express.static(path.join(__dirname, "public")));

const leadershipRoleIds = [
  "1530712642384040027", // Owner
  "1521187079336362024", // Co-Owner
  "1531109479264026706", // Founder
  "1548732297669255259", // Senior Staff
  "1548732341185155103", // Staff
  "1548732606508703744"  // Junior Staff
];

const leadershipRoleSet = new Set(leadershipRoleIds);
const importantPermissionNames = new Set([
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "ManageMessages",
  "ManageWebhooks",
  "ManageNicknames",
  "BanMembers",
  "KickMembers",
  "ModerateMembers",
  "MentionEveryone",
  "ViewAuditLog",
  "ManageEvents",
  "ManageThreads",
  "ManageEmojisAndStickers"
]);

const activity = new Map();
const voiceSessions = new Map();
const sendHits = new Map();

let guildCache = null;
let guildCacheAt = 0;
let guildFetchPromise = null;
let memberSnapshot = null;
let memberSnapshotAt = 0;
let memberFetchPromise = null;

const MEMBER_CACHE_TTL = 45_000;
const GUILD_CACHE_TTL = 15_000;

function getActivity(id) {
  if (!activity.has(id)) {
    activity.set(id, {
      messages: 0,
      mentionsReceived: 0,
      mentionsSent: 0,
      voiceMinutes: 0,
      voiceJoins: 0,
      chatRounds: 0
    });
  }

  return activity.get(id);
}

async function getGuild() {
  if (guildCache && Date.now() - guildCacheAt < GUILD_CACHE_TTL) {
    return guildCache;
  }

  if (guildFetchPromise) return guildFetchPromise;

  guildFetchPromise = client.guilds.fetch(guildId)
    .then((guild) => {
      guildCache = guild;
      guildCacheAt = Date.now();
      return guild;
    })
    .finally(() => {
      guildFetchPromise = null;
    });

  return guildFetchPromise;
}

function invalidateMemberSnapshot() {
  memberSnapshotAt = 0;
}

async function getAllMembers(guild) {
  const fresh = memberSnapshot && Date.now() - memberSnapshotAt < MEMBER_CACHE_TTL;
  if (fresh) return memberSnapshot;
  if (memberFetchPromise) return memberFetchPromise;

  memberFetchPromise = guild.members.fetch()
    .then((collection) => {
      // لا نستبعد البوتات: هذه القائمة تمثل كل أعضاء السيرفر فعلًا.
      memberSnapshot = [...collection.values()];
      memberSnapshotAt = Date.now();
      return memberSnapshot;
    })
    .catch((error) => {
      // عند حدوث Rate Limit أو فشل مؤقت، نستخدم آخر لقطة صحيحة بدل قائمة فارغة.
      if (memberSnapshot?.length) return memberSnapshot;
      throw error;
    })
    .finally(() => {
      memberFetchPromise = null;
    });

  return memberFetchPromise;
}

function importantPermissions(permissionCollection) {
  return permissionCollection.toArray()
    .filter((permission) => importantPermissionNames.has(permission));
}

function roleJson(role, membersCount = role.members?.size || 0) {
  return {
    id: role.id,
    name: role.name,
    color: role.hexColor,
    position: role.position,
    permissions: importantPermissions(role.permissions),
    membersCount,
    mentionable: role.mentionable
  };
}

function memberJson(member) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => roleJson(role));

  const leadershipRoles = roles.filter((role) => leadershipRoleSet.has(role.id));

  return {
    id: member.id,
    name: member.displayName,
    username: member.user.username,
    globalName: member.user.globalName,
    bot: member.user.bot,
    avatar: member.user.displayAvatarURL({ extension: "png", size: 256 }),
    joinedAt: member.joinedAt,
    roles,
    importantRoles: leadershipRoles,
    rank: leadershipRoles[0]?.name || roles[0]?.name || "عضو",
    stats: getActivity(member.id)
  };
}

function sortedMemberJson(members) {
  return [...members]
    .sort((a, b) => {
      const aRole = a.roles.cache
        .filter((role) => leadershipRoleSet.has(role.id))
        .sort((x, y) => y.position - x.position)
        .first();
      const bRole = b.roles.cache
        .filter((role) => leadershipRoleSet.has(role.id))
        .sort((x, y) => y.position - x.position)
        .first();
      return (bRole?.position || 0) - (aRole?.position || 0);
    })
    .map(memberJson);
}


async function initAppDatabase() {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (id SERIAL PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, password_hash TEXT NOT NULL, discord_username VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, subject VARCHAR(120) NOT NULL, message TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS ticket_messages (id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS applications (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, type VARCHAR(60) NOT NULL, answers JSONB NOT NULL DEFAULT '{}'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS community_groups (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, name VARCHAR(60) NOT NULL, description VARCHAR(240) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, username VARCHAR(32), discord_username VARCHAR(100), action VARCHAR(120) NOT NULL, details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE TABLE IF NOT EXISTS group_members (id SERIAL PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(group_id, username));
    CREATE TABLE IF NOT EXISTS group_join_requests (id SERIAL PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(group_id, username));
    CREATE TABLE IF NOT EXISTS game_scores (id SERIAL PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, discord_username VARCHAR(100) NOT NULL, wins INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0, guest BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS game_lobbies (id SERIAL PRIMARY KEY, game VARCHAR(30) NOT NULL, host_username VARCHAR(32) NOT NULL, host_discord_username VARCHAR(100) NOT NULL, max_players INTEGER NOT NULL DEFAULT 4, players JSONB NOT NULL DEFAULT '[]'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'waiting', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, rating INTEGER NOT NULL DEFAULT 5, message VARCHAR(1000) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'visible', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, text VARCHAR(300) NOT NULL, link TEXT DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS site_stats (id INTEGER PRIMARY KEY DEFAULT 1, visits BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS site_settings (key VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
    INSERT INTO site_settings(key,value) VALUES
      ('siteName','MLD'),('creatorName','فهد المطيري'),
      ('heroTitle','مجتمع MLD بشكل مختلف.'),('heroSubtitle','أعضاء، رتب، توب، ورسائل خاصة في لوحة فخمة وسريعة تتحدث تلقائيًا.')
      ON CONFLICT (key) DO NOTHING;
    INSERT INTO site_stats(id,visits) VALUES(1,0) ON CONFLICT (id) DO NOTHING;
  `);
}
function currentUser(req){ return req.session?.user || null; }
function requireAuth(req,res,next){ if(!currentUser(req)) return res.status(401).json({error:"يجب تسجيل الدخول أولًا"}); next(); }
function requireAdmin(req,res,next){ const u=currentUser(req); if(!u || !["owner","admin"].includes(u.role)) return res.status(403).json({error:"هذه الصفحة للأونر والإدارة فقط"}); next(); }
function requireOwner(req,res,next){ const u=currentUser(req); if(!u || u.role!=="owner") return res.status(403).json({error:"هذه الصفحة للأونر فقط"}); next(); }
async function audit(u,action,details=""){ if(!process.env.DATABASE_URL) return; await pool.query("INSERT INTO audit_logs(username,discord_username,action,details) VALUES($1,$2,$3,$4)",[u?.username||null,u?.discordUsername||null,action,details]); }
async function ensureOwner(){
  if(!process.env.DATABASE_URL || !process.env.OWNER_USERNAME || !process.env.OWNER_PASSWORD) return;
  const username=String(process.env.OWNER_USERNAME).trim().toLowerCase();
  const hash=await bcrypt.hash(String(process.env.OWNER_PASSWORD),12);
  const found=await pool.query("SELECT id FROM app_users WHERE username=$1",[username]);
  if(!found.rowCount) await pool.query("INSERT INTO app_users(username,password_hash,discord_username,role) VALUES($1,$2,$3,'owner')",[username,hash,process.env.OWNER_DISCORD_USERNAME||process.env.SERVER_FOUNDER_NAME||"فهد المطيري"]);
  else await pool.query("UPDATE app_users SET password_hash=$2,role='owner',discord_username=$3 WHERE username=$1",[username,hash,process.env.OWNER_DISCORD_USERNAME||process.env.SERVER_FOUNDER_NAME||"فهد المطيري"]);
}


app.get("/api/site/stats",async(req,res)=>{try{const s=await pool.query("SELECT visits FROM site_stats WHERE id=1");const g=await getGuild();const members=await getAllMembers(g);const online=members.filter(m=>!m.user.bot&&m.presence?.status&&m.presence.status!=="offline").length || [...(g.presences?.cache?.values?.()||[])].filter(p=>p.status&&p.status!=="offline").length;res.json({visits:Number(s.rows[0]?.visits||0),online});}catch(e){res.status(500).json({visits:0,online:0});}});
app.post("/api/site/visit",async(req,res)=>{try{await pool.query("UPDATE site_stats SET visits=visits+1,updated_at=NOW() WHERE id=1");res.json({ok:true});}catch(e){res.status(500).json({error:"stats"});}});
app.get("/api/site/settings",async(req,res)=>{try{const q=await pool.query("SELECT key,value FROM site_settings");res.json({settings:Object.fromEntries(q.rows.map(x=>[x.key,x.value]))});}catch(e){res.status(500).json({settings:{}});}});
app.post("/api/owner/settings",requireOwner,async(req,res)=>{try{const allowed=["siteName","creatorName","heroTitle","heroSubtitle"];for(const key of allowed){const value=String(req.body?.[key]??"").trim();if(value.length>500)return res.status(400).json({error:"إعداد طويل جدًا"});await pool.query("INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[key,value]);}await audit(req.session.user,"site_settings_update","تعديل إعدادات الموقع");res.json({ok:true});}catch(e){console.error("Site settings:",e);res.status(500).json({error:"تعذر حفظ الإعدادات"});}});
app.get("/api/auth/me",(req,res)=>{const u=currentUser(req);res.json({authenticated:Boolean(u),user:u?{username:u.username,discordUsername:u.discordUsername,role:u.role,isOwner:u.role==="owner"}:null});});
app.post("/api/auth/register",async(req,res)=>{
  try{
    const username=String(req.body?.username||"").trim().toLowerCase(), password=String(req.body?.password||""), discordUsername=String(req.body?.discordUsername||"").trim();
    if(!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({error:"اليوزر يجب أن يكون 3-32 حرفًا إنجليزيًا أو أرقامًا"});
    if(password.length<6||password.length>100) return res.status(400).json({error:"كلمة المرور يجب أن تكون 6 أحرف على الأقل"});
    if(discordUsername.length<2||discordUsername.length>100) return res.status(400).json({error:"أدخل يوزرك في Discord"});
    if(!process.env.DATABASE_URL) return res.status(503).json({error:"قاعدة البيانات غير متاحة"});
    if((await pool.query("SELECT id FROM app_users WHERE username=$1",[username])).rowCount) return res.status(409).json({error:"اسم المستخدم مستخدم مسبقًا"});
    const hash=await bcrypt.hash(password,12); await pool.query("INSERT INTO app_users(username,password_hash,discord_username) VALUES($1,$2,$3)",[username,hash,discordUsername]);
    req.session.user={username,discordUsername,role:"user"}; await audit(req.session.user,"register","إنشاء حساب"); res.json({ok:true,user:req.session.user});
  }catch(e){console.error("Register:",e);res.status(500).json({error:"تعذر إنشاء الحساب"});}
});
app.post("/api/auth/login",async(req,res)=>{
  try{
    const username=String(req.body?.username||"").trim().toLowerCase(),password=String(req.body?.password||"");
    const q=await pool.query("SELECT username,password_hash,discord_username,role FROM app_users WHERE username=$1",[username]);
    if(!q.rowCount||!(await bcrypt.compare(password,q.rows[0].password_hash))) return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
    const r=q.rows[0]; req.session.user={username:r.username,discordUsername:r.discord_username,role:r.role}; await pool.query("UPDATE app_users SET last_login_at=NOW() WHERE username=$1",[username]); await audit(req.session.user,"login","تسجيل دخول"); res.json({ok:true,user:req.session.user});
  }catch(e){console.error("Login:",e);res.status(500).json({error:"تعذر تسجيل الدخول"});}
});
app.post("/api/auth/logout",async(req,res)=>{const u=currentUser(req);if(u) await audit(u,"logout","تسجيل خروج").catch(()=>{});req.session.destroy(()=>res.json({ok:true}));});


app.get("/api/tickets",async(req,res)=>{
  const u=currentUser(req);
  if(u && u.role && ["owner","admin"].includes(u.role)){
    const q=await pool.query("SELECT id,username,discord_username,subject,status,created_at FROM tickets ORDER BY id DESC LIMIT 100");
    return res.json({tickets:q.rows,public:true,canOpen:true,admin:true});
  }
  if(!u) {
    const q=await pool.query("SELECT id,username,subject,status,created_at FROM tickets ORDER BY id DESC LIMIT 30");
    return res.json({tickets:q.rows,public:true,canOpen:false});
  }
  const q=await pool.query("SELECT id,username,discord_username,subject,message,status,created_at FROM tickets WHERE username=$1 ORDER BY id DESC",[u.username]);
  res.json({tickets:q.rows,public:true,canOpen:true});
});
app.get("/api/tickets/:id/messages",requireAuth,async(req,res)=>{
  const u=req.session.user,id=Number(req.params.id);
  const t=await pool.query("SELECT id,username FROM tickets WHERE id=$1",[id]);
  if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
  if(t.rows[0].username!==u.username&&!["owner","admin"].includes(u.role))return res.status(403).json({error:"لا تملك صلاحية مشاهدة محادثة التيكت"});
  const q=await pool.query("SELECT id,username,discord_username,message,created_at FROM ticket_messages WHERE ticket_id=$1 ORDER BY id ASC",[id]);
  res.json({messages:q.rows});
});
app.post("/api/tickets",requireAuth,async(req,res)=>{
  const subject=String(req.body?.subject||"").trim(),message=String(req.body?.message||"").trim(),u=req.session.user;
  if(subject.length<3||subject.length>120||message.length<3||message.length>3000)return res.status(400).json({error:"بيانات التيكت غير صحيحة"});
  const q=await pool.query("INSERT INTO tickets(username,discord_username,subject,message) VALUES($1,$2,$3,$4) RETURNING id",[u.username,u.discordUsername,subject,message]);
  await pool.query("INSERT INTO ticket_messages(ticket_id,username,discord_username,message) VALUES($1,$2,$3,$4)",[q.rows[0].id,u.username,u.discordUsername,message]);
  await audit(u,"ticket_create",`#${q.rows[0].id} ${subject}`);
  res.json({ok:true,id:q.rows[0].id});
});
app.post("/api/tickets/:id/messages",requireAuth,async(req,res)=>{
  const u=req.session.user,id=Number(req.params.id),message=String(req.body?.message||"").trim();
  if(message.length<1||message.length>3000)return res.status(400).json({error:"الرسالة غير صحيحة"});
  const t=await pool.query("SELECT id,username FROM tickets WHERE id=$1",[id]);
  if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
  if(t.rows[0].username!==u.username&&!["owner","admin"].includes(u.role))return res.status(403).json({error:"لا تملك صلاحية الرد"});
  const q=await pool.query("INSERT INTO ticket_messages(ticket_id,username,discord_username,message) VALUES($1,$2,$3,$4) RETURNING id,created_at",[id,u.username,u.discordUsername,message]);
  await audit(u,"ticket_reply",`#${id} ${message.slice(0,120)}`);
  res.json({ok:true,message:{id:q.rows[0].id,username:u.username,discord_username:u.discordUsername,message,created_at:q.rows[0].created_at}});
});
app.post("/api/owner/tickets/:id/status",requireAdmin,async(req,res)=>{
  const status=String(req.body?.status||"").toLowerCase(),id=Number(req.params.id);
  if(!["open","closed","pending"].includes(status))return res.status(400).json({error:"حالة غير صحيحة"});
  const q=await pool.query("UPDATE tickets SET status=$1 WHERE id=$2 RETURNING id,status",[status,id]);
  if(!q.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
  await audit(req.session.user,"ticket_status",`#${id} => ${status}`);
  res.json({ok:true,ticket:q.rows[0]});
});
app.get("/api/applications",async(req,res)=>{const q=await pool.query("SELECT type,status,created_at FROM applications ORDER BY id DESC LIMIT 30");res.json({applications:q.rows,public:true,canSubmit:Boolean(currentUser(req))});});
app.post("/api/applications",requireAuth,async(req,res)=>{const type=String(req.body?.type||"تقديم").trim(),answers=req.body?.answers||{},u=req.session.user;if(type.length>60||JSON.stringify(answers).length>8000)return res.status(400).json({error:"بيانات التقديم غير صحيحة"});const q=await pool.query("INSERT INTO applications(username,discord_username,type,answers) VALUES($1,$2,$3,$4) RETURNING id",[u.username,u.discordUsername,type,JSON.stringify(answers)]);await audit(u,"application_create",`#${q.rows[0].id} ${type}`);res.json({ok:true,id:q.rows[0].id});});
app.get("/api/groups",async(req,res)=>{
  const q=await pool.query(`
    SELECT g.id,g.name,g.description,g.username AS owner_username,g.discord_username AS owner_discord_username,g.created_at,
           COALESCE((SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id),0) AS member_count,
           COALESCE((SELECT json_agg(json_build_object('username',gm.username,'discordUsername',gm.discord_username) ORDER BY gm.joined_at) FROM group_members gm WHERE gm.group_id=g.id),'[]'::json) AS members
    FROM community_groups g ORDER BY g.id DESC
  `);
  res.json({groups:q.rows});
});
app.post("/api/groups/:id/join",requireAuth,async(req,res)=>{
  const u=req.session.user, gid=Number(req.params.id);
  const g=await pool.query("SELECT id,name,username FROM community_groups WHERE id=$1",[gid]);
  if(!g.rowCount)return res.status(404).json({error:"القروب غير موجود"});
  if(g.rows[0].username===u.username)return res.json({ok:true,status:"owner"});
  const exists=await pool.query("SELECT status FROM group_join_requests WHERE group_id=$1 AND username=$2",[gid,u.username]);
  if(exists.rowCount && exists.rows[0].status==="pending")return res.json({ok:true,status:"pending"});
  if(exists.rowCount) await pool.query("UPDATE group_join_requests SET status='pending',discord_username=$3,created_at=NOW() WHERE group_id=$1 AND username=$2",[gid,u.username,u.discordUsername]);
  else await pool.query("INSERT INTO group_join_requests(group_id,username,discord_username) VALUES($1,$2,$3)",[gid,u.username,u.discordUsername]);
  await audit(u,"group_join_request",`#${gid} ${g.rows[0].name}`);
  res.json({ok:true,status:"pending"});
});
app.get("/api/groups/:id/requests",requireAuth,async(req,res)=>{
  const u=req.session.user, gid=Number(req.params.id);
  const own=await pool.query("SELECT id FROM community_groups WHERE id=$1 AND username=$2",[gid,u.username]);
  if(!own.rowCount)return res.status(403).json({error:"أنت لست مالك القروب"});
  const q=await pool.query("SELECT id,username,discord_username,status,created_at FROM group_join_requests WHERE group_id=$1 ORDER BY id DESC",[gid]);
  res.json({requests:q.rows});
});
app.post("/api/groups/:id/requests/:requestId",requireAuth,async(req,res)=>{
  const u=req.session.user,gid=Number(req.params.id),rid=Number(req.params.requestId),status=String(req.body?.status||"").toLowerCase();
  if(!["approved","rejected"].includes(status))return res.status(400).json({error:"حالة غير صحيحة"});
  const own=await pool.query("SELECT id,name FROM community_groups WHERE id=$1 AND username=$2",[gid,u.username]);
  if(!own.rowCount)return res.status(403).json({error:"أنت لست مالك القروب"});
  const rq=await pool.query("SELECT username,discord_username FROM group_join_requests WHERE id=$1 AND group_id=$2 AND status='pending'",[rid,gid]);
  if(!rq.rowCount)return res.status(404).json({error:"الطلب غير موجود أو تمت معالجته"});
  await pool.query("UPDATE group_join_requests SET status=$1 WHERE id=$2",[status,rid]);
  if(status==="approved")await pool.query("INSERT INTO group_members(group_id,username,discord_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[gid,rq.rows[0].username,rq.rows[0].discord_username]);
  await audit(u,"group_join_request_update",`#${gid} request #${rid} => ${status}`);
  res.json({ok:true});
});
app.post("/api/groups",requireAuth,async(req,res)=>{
  const name=String(req.body?.name||"").trim(),description=String(req.body?.description||"").trim(),u=req.session.user;
  if(name.length<2||name.length>60||description.length>240)return res.status(400).json({error:"بيانات القروب غير صحيحة"});
  const q=await pool.query("INSERT INTO community_groups(username,discord_username,name,description) VALUES($1,$2,$3,$4) RETURNING *",[u.username,u.discordUsername,name,description]);
  await pool.query("INSERT INTO group_members(group_id,username,discord_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[q.rows[0].id,u.username,u.discordUsername]);
  await audit(u,"group_create",name);res.json({ok:true,group:q.rows[0]});
});
app.delete("/api/groups/:id",requireAuth,async(req,res)=>{await pool.query("DELETE FROM community_groups WHERE id=$1 AND username=$2",[req.params.id,req.session.user.username]);res.json({ok:true});});
app.get("/api/owner/logs",requireAdmin,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,action,details,created_at FROM audit_logs ORDER BY id DESC LIMIT 200");res.json({logs:q.rows});});
app.get("/api/owner/tickets",requireAdmin,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,subject,message,status,created_at FROM tickets ORDER BY id DESC LIMIT 100");res.json({tickets:q.rows});});
app.get("/api/owner/applications",requireAdmin,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,type,answers,status,created_at FROM applications ORDER BY id DESC LIMIT 100");res.json({applications:q.rows});});
app.post("/api/owner/applications/:id/status",requireAdmin,async(req,res)=>{const status=String(req.body?.status||"").toLowerCase(),id=Number(req.params.id);if(!["pending","approved","rejected"].includes(status))return res.status(400).json({error:"حالة غير صحيحة"});const q=await pool.query("UPDATE applications SET status=$1 WHERE id=$2 RETURNING id,status");if(!q.rowCount)return res.status(404).json({error:"التقديم غير موجود"});await audit(req.session.user,"application_status",`#${id} => ${status}`);res.json({ok:true,application:q.rows[0]});});
app.get("/api/reviews",async(req,res)=>{const q=await pool.query("SELECT id,username,rating,message,created_at FROM reviews WHERE status='visible' ORDER BY id DESC LIMIT 30");res.json({reviews:q.rows});});
app.post("/api/reviews",requireAuth,async(req,res)=>{const u=req.session.user,message=String(req.body?.message||"").trim(),rating=Math.max(1,Math.min(5,Number(req.body?.rating)||5));if(message.length<3||message.length>1000)return res.status(400).json({error:"الرأي يجب أن يكون بين 3 و1000 حرف"});const q=await pool.query("INSERT INTO reviews(username,discord_username,rating,message) VALUES($1,$2,$3,$4) RETURNING id",[u.username,u.discordUsername,rating,message]);await audit(u,"review_create",`#${q.rows[0].id}`);res.json({ok:true,id:q.rows[0].id});});
app.get("/api/announcements",async(req,res)=>{const q=await pool.query("SELECT id,text,link FROM announcements WHERE active=true ORDER BY id DESC LIMIT 5");res.json({announcements:q.rows});});
app.get("/api/owner/users",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,role,created_at,last_login_at FROM app_users ORDER BY id DESC LIMIT 300");res.json({users:q.rows});});
app.post("/api/owner/users/:id/role",requireOwner,async(req,res)=>{const role=String(req.body?.role||"user");if(!["user","admin","owner"].includes(role))return res.status(400).json({error:"صلاحية غير صحيحة"});const q=await pool.query("UPDATE app_users SET role=$1 WHERE id=$2 RETURNING username,role",[role,req.params.id]);if(!q.rowCount)return res.status(404).json({error:"الحساب غير موجود"});await audit(req.session.user,"user_role_change",`${q.rows[0].username} => ${role}`);res.json({ok:true,user:q.rows[0]});});
app.get("/api/owner/reviews",requireAdmin,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,rating,message,status,created_at FROM reviews ORDER BY id DESC LIMIT 200");res.json({reviews:q.rows});});
app.delete("/api/owner/reviews/:id",requireAdmin,async(req,res)=>{await pool.query("DELETE FROM reviews WHERE id=$1",[req.params.id]);await audit(req.session.user,"review_delete",`#${req.params.id}`);res.json({ok:true});});
app.post("/api/owner/announcements",requireAdmin,async(req,res)=>{const text=String(req.body?.text||"").trim(),link=String(req.body?.link||"").trim();if(text.length<2||text.length>300)return res.status(400).json({error:"الإعلان يجب أن يكون بين 2 و300 حرف"});const q=await pool.query("INSERT INTO announcements(text,link) VALUES($1,$2) RETURNING *",[text,link]);await audit(req.session.user,"announcement_create",text);res.json({ok:true,announcement:q.rows[0]});});
app.delete("/api/owner/announcements/:id",requireAdmin,async(req,res)=>{await pool.query("DELETE FROM announcements WHERE id=$1",[req.params.id]);await audit(req.session.user,"announcement_delete",`#${req.params.id}`);res.json({ok:true});});



app.get("/api/games",async(req,res)=>{
  const q=await pool.query("SELECT id,game,host_username,host_discord_username,max_players,players,status,created_at FROM game_lobbies WHERE status IN ('waiting','ready','playing') ORDER BY id DESC LIMIT 50");
  res.json({games:q.rows});
});
app.get("/api/games/:id",async(req,res)=>{
  const q=await pool.query("SELECT id,game,host_username,host_discord_username,max_players,players,status,created_at FROM game_lobbies WHERE id=$1",[req.params.id]);
  if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});
  res.json({game:q.rows[0]});
});
app.post("/api/games",async(req,res)=>{
  const game=String(req.body?.game||"").trim().toUpperCase(),max=Math.max(2,Math.min(8,Number(req.body?.maxPlayers)||4)),u=currentUser(req),guestName=String(req.body?.guestName||"زائر").trim().slice(0,40);
  if(!["UNO","LUDO","BALOOT","DAQSH","QAWSAR","CODENAMES","SPYFALL","PICTIONARY","CHARADES","WHOAMI","TABOO","WORD_BOMB","TRUTH_LIE","EMOJI_GUESS","TRIVIA","CATEGORIES","LIAR","HOT_SEAT","WOULD_YOU_RATHER","DRAW_GUESS","FASTEST","RIDDLE_RUSH","SECRET_WORD","MIMIC","GUESS_PLAYER"].includes(game))return res.status(400).json({error:"اللعبة غير مدعومة"});
  const hostName=u?.username||guestName||"زائر",discordName=u?.discordUsername||guestName;
  const players=[{username:hostName,discordUsername:discordName,guest:!u,bot:false,host:true}];
  const q=await pool.query("INSERT INTO game_lobbies(game,host_username,host_discord_username,max_players,players,status) VALUES($1,$2,$3,$4,$5,'waiting') RETURNING *",[game,hostName,discordName,max,JSON.stringify(players)]);
  if(u)await audit(u,"game_create",game);
  res.json({ok:true,game:q.rows[0]});
});
app.post("/api/games/:id/join",async(req,res)=>{
  const u=currentUser(req),guestName=String(req.body?.guestName||"زائر").trim().slice(0,40),name=u?.username||guestName||"زائر",discordName=u?.discordUsername||guestName;
  const q=await pool.query("SELECT * FROM game_lobbies WHERE id=$1",[req.params.id]);
  if(!q.rowCount)return res.status(404).json({error:"اللعبة غير موجودة"});
  const g=q.rows[0],players=Array.isArray(g.players)?g.players:[];
  if(g.status==="playing")return res.status(409).json({error:"الجلسة بدأت بالفعل"});
  if(g.status!=="waiting"&&g.status!=="ready")return res.status(409).json({error:"الجلسة غير متاحة"});
  if(players.some(x=>x.username===name&&x.discordUsername===discordName))return res.json({ok:true,game:g});
  if(players.length>=g.max_players)return res.status(409).json({error:"اللعبة مكتملة"});
  players.push({username:name,discordUsername:discordName,guest:!u,bot:false,host:false});
  const st=players.length>=g.max_players?"ready":"waiting";
  const updated=await pool.query("UPDATE game_lobbies SET players=$1,status=$2 WHERE id=$3 RETURNING *",[JSON.stringify(players),st,g.id]);
  if(u)await audit(u,"game_join",`#${g.id} ${g.game}`);
  res.json({ok:true,game:updated.rows[0]});
});
app.post("/api/games/:id/start",async(req,res)=>{
  const u=currentUser(req),q=await pool.query("SELECT * FROM game_lobbies WHERE id=$1",[req.params.id]);
  if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});
  const g=q.rows[0],hostMatches=u ? g.host_username===u.username : String(req.body?.guestName||"").trim().slice(0,40)===g.host_username;
  if(!hostMatches)return res.status(403).json({error:"فقط صاحب الجلسة يقدر يبدأ"});
  if(g.status==="playing")return res.json({ok:true,game:g});
  let players=Array.isArray(g.players)?g.players:[];
  let botNo=1;
  while(players.length<g.max_players){
    players.push({username:"بوت "+botNo,discordUsername:"BOT",guest:true,bot:true,host:false});
    botNo++;
  }
  const updated=await pool.query("UPDATE game_lobbies SET players=$1,status='playing' WHERE id=$2 RETURNING *",[JSON.stringify(players),g.id]);
  if(u)await audit(u,"game_start",`#${g.id} ${g.game} players=${players.length}`);
  res.json({ok:true,game:updated.rows[0]});
});
app.get("/api/games/top",async(req,res)=>{try{const q=await pool.query("SELECT username,discord_username,wins,points FROM game_scores WHERE guest=false ORDER BY wins DESC,points DESC LIMIT 50");res.json({top:q.rows});}catch(e){res.json({top:[]});}});
app.post("/api/games/:id/score",requireAuth,async(req,res)=>{const points=Math.max(1,Math.min(100,Number(req.body?.points)||10)),u=req.session.user;await pool.query("INSERT INTO game_scores(username,discord_username,wins,points,guest) VALUES($1,$2,1,$3,false) ON CONFLICT(username) DO UPDATE SET wins=game_scores.wins+1,points=game_scores.points+$3,discord_username=EXCLUDED.discord_username",[u.username,u.discordUsername,points]);await audit(u,"game_win",`#${req.params.id} +${points}`);res.json({ok:true});});
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    botReady: client.isReady(),
    membersCached: Boolean(memberSnapshot),
    membersCachedCount: memberSnapshot?.length || 0,
    membersUpdatedAt: memberSnapshotAt || null
  });
});

app.get("/api/public/server", async (req, res) => {
  try {
    const guild = await getGuild();
    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ extension: "png", size: 256 }),
      memberCount: guild.memberCount,
      ownerName: process.env.SERVER_FOUNDER_NAME || "فهد المطيري",
      invite: process.env.DISCORD_INVITE_URL || ""
    });
  } catch (error) {
    console.error("Server endpoint:", error);
    res.status(503).json({ error: "Discord server unavailable" });
  }
});

app.get("/api/public/members", async (req, res) => {
  try {
    const guild = await getGuild();
    const allMembers = await getAllMembers(guild);
    const query = String(req.query.q || "").trim().toLocaleLowerCase("ar");
    const cleanQuery = query.replace(/^@/, "");

    const filtered = cleanQuery
      ? allMembers.filter((member) => {
          const searchable = [
            member.displayName,
            member.user.username,
            member.user.globalName,
            member.user.tag,
            member.id
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("ar");
          return searchable.includes(cleanQuery);
        })
      : allMembers;

    const ranked = sortedMemberJson(filtered);
    res.json({
      members: ranked.slice(0, Math.min(Number(req.query.limit) || (cleanQuery ? 8 : 5), 8)),
      total: filtered.length,
      totalServerMembers: allMembers.length,
      updatedAt: memberSnapshotAt,
      cached: Boolean(memberSnapshot)
    });
  } catch (error) {
    console.error("Members endpoint:", error);
    res.status(503).json({ error: "Members are temporarily unavailable" });
  }
});

app.get("/api/public/roles", async (req, res) => {
  try {
    const guild = await getGuild();
    const allMembers = await getAllMembers(guild);

    const roles = leadershipRoleIds
      .map((id) => guild.roles.cache.get(id))
      .filter(Boolean)
      .map((role) => {
        const count = allMembers.reduce(
          (total, member) => total + (member.roles.cache.has(role.id) ? 1 : 0),
          0
        );
        return roleJson(role, count);
      });

    res.json({ roles, updatedAt: memberSnapshotAt });
  } catch (error) {
    console.error("Roles endpoint:", error);
    res.status(503).json({ error: "Roles are temporarily unavailable" });
  }
});

app.get("/api/public/roles/:id/members", async (req, res) => {
  try {
    const guild = await getGuild();
    const role = guild.roles.cache.get(req.params.id);

    if (!role || !leadershipRoleSet.has(role.id)) {
      return res.status(404).json({ error: "Role not found" });
    }

    const roleMembers = (await getAllMembers(guild))
      .filter((member) => member.roles.cache.has(role.id));

    res.json({
      role: roleJson(role, roleMembers.length),
      members: sortedMemberJson(roleMembers),
      updatedAt: memberSnapshotAt
    });
  } catch (error) {
    console.error("Role members endpoint:", error);
    res.status(503).json({ error: "Role members are temporarily unavailable" });
  }
});

app.get("/api/public/top", async (req, res) => {
  try {
    const members = (await getAllMembers(await getGuild())).map(memberJson);
    const top = (key) => [...members]
      .sort((a, b) => (b.stats[key] || 0) - (a.stats[key] || 0))
      .slice(0, 10);

    res.json({
      messages: top("messages"),
      mentions: top("mentionsReceived"),
      voice: top("voiceMinutes"),
      joins: top("voiceJoins"),
      updatedAt: memberSnapshotAt
    });
  } catch (error) {
    console.error("Top endpoint:", error);
    res.status(503).json({ error: "Top is temporarily unavailable" });
  }
});

app.get("/api/public/member/:id", async (req, res) => {
  try {
    const guild = await getGuild();
    const member = await guild.members.fetch(req.params.id).catch(() => null);

    if (!member) return res.status(404).json({ error: "Member not found" });

    const highest = member.roles.cache
      .filter((role) => role.id !== guild.id && !role.managed)
      .sort((a, b) => b.position - a.position)
      .first();

    res.json({
      ...memberJson(member),
      highestRole: highest ? roleJson(highest) : null,
      permissions: highest ? importantPermissions(highest.permissions) : [],
      upcomingRoles: guild.roles.cache
        .filter((role) => role.position > (highest?.position || 0) && !role.managed)
        .sort((a, b) => a.position - b.position)
        .first(8)
        .map((role) => roleJson(role))
    });
  } catch (error) {
    console.error("Member endpoint:", error);
    res.status(404).json({ error: "Member not found" });
  }
});

app.post("/api/public/message",requireAuth,async (req,res) => {
  const now = Date.now(), ip = req.ip || "unknown", last = sendHits.get(ip) || 0, u=req.session.user;
  if (now-last<10_000)return res.status(429).json({error:"انتظر 10 ثواني قبل الإرسال مرة أخرى"});
  const title=String(req.body?.title||"رسالة من إدارة MLD").trim(), text=String(req.body?.message||"").trim(), targetId=String(req.body?.memberId||"").trim();
  if(!targetId||!text||text.length>2000||title.length>120)return res.status(400).json({error:"بيانات الرسالة غير صحيحة"});
  try{
    const member=await (await getGuild()).members.fetch(targetId).catch(()=>null);
    if(!member)return res.status(404).json({error:"العضو غير موجود"});
    const embed=new EmbedBuilder().setTitle(title).setDescription(`من حساب الموقع: ${u.username} · Discord: ${u.discordUsername}

${text}`).setColor("#ff9cdc").setFooter({text:"MLD Community"}).setTimestamp();
    await member.send({embeds:[embed]}); sendHits.set(ip,now);
    await audit(u,"dm_send",`إلى Discord ID ${targetId} · ${title}`);
    res.json({ok:true});
  }catch(error){console.error("DM endpoint:",error);res.status(500).json({error:"تعذر الإرسال؛ قد يكون الخاص مقفلًا"});}
});
client.on("guildMemberAdd", invalidateMemberSnapshot);
client.on("guildMemberRemove", invalidateMemberSnapshot);
client.on("guildMemberUpdate", invalidateMemberSnapshot);

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const sender = getActivity(message.author.id);
  sender.messages += 1;
  sender.chatRounds += 1;

  for (const id of message.mentions.users.keys()) {
    getActivity(id).mentionsReceived += 1;
    sender.mentionsSent += 1;
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  const id = newState.id;

  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(id, Date.now());
    getActivity(id).voiceJoins += 1;
  }

  if (oldState.channelId && !newState.channelId && voiceSessions.has(id)) {
    getActivity(id).voiceMinutes += Math.round(
      (Date.now() - voiceSessions.get(id)) / 60000
    );
    voiceSessions.delete(id);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, async () => { console.log(`MLD listening on port ${port}`); try { await initAppDatabase(); await ensureOwner(); console.log("App database ready"); } catch (error) { console.error("Database init failed:", error.message); } });
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));
client.login(token).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});

// auth feature checkpoint
