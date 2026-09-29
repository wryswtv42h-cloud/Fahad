"use strict";
require("dotenv").config();

const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const helmet = require("helmet");
const compression = require("compression");
const gameEngines = require("./game-engines");
// native MLD game engine: games stay inside this service

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
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "deny" },
  noSniff: true,
  hidePoweredBy: true
}));
app.use(compression({ threshold: 1024 }));
app.use((req,res,next)=>{
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=()");
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use((err,req,res,next)=>{
  if(err && err.type==="entity.too.large") return res.status(413).json({error:"الطلب كبير جدًا، خفف البيانات وحاول مرة ثانية"});
  next(err);
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 8),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  query_timeout: 20000,
  keepAlive: true
});
// Prevent transient PostgreSQL connection failures from becoming uncaught process errors under burst load.
pool.on("error",(error)=>{ console.error("PostgreSQL pool error:", error.message); });
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || (process.env.NODE_ENV === "production" && sessionSecret === "mld-session-secret")) {
  console.error("A strong SESSION_SECRET is required");
  process.exit(1);
}
app.use(session({
  name: "mld.sid",
  secret: sessionSecret,
  resave: false,
  rolling: true,
  saveUninitialized: false,
  store: new pgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2592000000 }
}));

const limiterBuckets = new Map();
function rateLimit(windowMs,max,keyFn){
  return (req,res,next)=>{
    const key=keyFn(req);
    const now=Date.now();
    let bucket=limiterBuckets.get(key);
    if(!bucket || now-bucket.startedAt>=windowMs) bucket={startedAt:now,count:0};
    bucket.count++;
    limiterBuckets.set(key,bucket);
    if(bucket.count>max) return res.status(429).json({error:"طلبات كثيرة، حاول بعد قليل"});
    next();
  };
}
setInterval(()=>{
  const cutoff=Date.now()-15*60*1000;
  for(const [k,v] of limiterBuckets) if(v.startedAt<cutoff) limiterBuckets.delete(k);
},60000).unref();

const authLimiter=rateLimit(10*60*1000,30,req=>"auth:"+req.ip);
const resetLimiter=rateLimit(15*60*1000,5,req=>"reset:"+req.ip);
const writeLimiter=rateLimit(60*1000,90,req=>"write:"+((req.session&&req.session.user?.username)||req.ip));


app.get("/health",(req,res)=>{
  res.status(200).json({ok:true,service:"mld",version:"hardening-6",botReady:client.isReady(),membersCached:Boolean(memberSnapshot)});
});
app.get("/ready",(req,res)=>{
  const ready=client.isReady() && Boolean(memberSnapshot);
  res.status(ready?200:503).json({ok:ready,service:"mld",botReady:client.isReady(),membersCached:Boolean(memberSnapshot)});
});
app.use(express.static(path.join(__dirname, "public"),{maxAge:"1h",etag:true}));

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
let publicRolesCache = null;
let publicRolesCacheAt = 0;
let publicServerCache=null, publicServerCacheAt=0;
let publicTopCache=null, publicTopCacheAt=0;
let gameSessionsCache=null, gameSessionsCacheAt=0;

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
  publicRolesCacheAt = 0;
}

let memberFetchFailedAt=0;
async function getAllMembers(guild) {
  const fresh = memberSnapshot && Date.now() - memberSnapshotAt < MEMBER_CACHE_TTL;
  if (fresh) return memberSnapshot;
  if (memberFetchPromise) return memberFetchPromise;

  const cached=[...guild.members.cache.values()];
  if(Date.now()-memberFetchFailedAt<30000 && cached.length) return cached;
  memberFetchPromise = guild.members.fetch()
    .then((collection) => {
      memberSnapshot = [...collection.values()];
      memberSnapshotAt = Date.now();
      memberFetchFailedAt = 0;
      return memberSnapshot;
    })
    .catch((error) => {
      memberFetchFailedAt=Date.now();
      const fallback=memberSnapshot?.length?memberSnapshot:cached;
      if(fallback.length) return fallback;
      console.error("member fetch unavailable:",String(error?.message||error));
      return [];
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

function sortedMemberJson(members, limit = members.length) {
  const ranked = [...members].sort((a,b)=>{
    const aRole=a.roles.cache.filter(r=>leadershipRoleSet.has(r.id)).sort((x,y)=>y.position-x.position).first();
    const bRole=b.roles.cache.filter(r=>leadershipRoleSet.has(r.id)).sort((x,y)=>y.position-x.position).first();
    return (bRole?.position||0)-(aRole?.position||0);
  });
  return ranked.slice(0,Math.max(0,limit)).map(memberJson);
}


async function initAppDatabase() {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mld_jokes (id BIGSERIAL PRIMARY KEY, body TEXT NOT NULL, author VARCHAR(80) NOT NULL DEFAULT 'ملاذ الذكي', likes INTEGER NOT NULL DEFAULT 0, dislikes INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS mld_joke_reactions (joke_id BIGINT NOT NULL REFERENCES mld_jokes(id) ON DELETE CASCADE, username VARCHAR(80) NOT NULL, reaction VARCHAR(10) NOT NULL, PRIMARY KEY(joke_id,username));
    CREATE TABLE IF NOT EXISTS mld_stories (id BIGSERIAL PRIMARY KEY, genre VARCHAR(40) NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS app_users (id SERIAL PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, password_hash TEXT NOT NULL, discord_username VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ); ALTER TABLE app_users ADD COLUMN IF NOT EXISTS discord_user_id VARCHAR(32);
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ; ALTER TABLE app_users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS password_resets (id BIGSERIAL PRIMARY KEY, username VARCHAR(32), discord_username VARCHAR(100), temp_password_hash TEXT, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS registration_verifications (id BIGSERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, password_hash TEXT NOT NULL, discord_username VARCHAR(100) NOT NULL, discord_user_id VARCHAR(32) NOT NULL, code VARCHAR(12) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), decision VARCHAR(12) NOT NULL DEFAULT 'pending', message_id VARCHAR(32)); ALTER TABLE registration_verifications ADD COLUMN IF NOT EXISTS decision VARCHAR(12) NOT NULL DEFAULT 'pending'; ALTER TABLE registration_verifications ADD COLUMN IF NOT EXISTS message_id VARCHAR(32); CREATE INDEX IF NOT EXISTS registration_verifications_lookup_idx ON registration_verifications(discord_user_id,created_at DESC);
    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS temp_password_hash TEXT;
    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
    ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS password_resets_lookup_idx ON password_resets(username, created_at DESC);
    UPDATE app_users SET username=COALESCE(NULLIF(username,''),'user_'||id::text) WHERE username IS NULL;
    UPDATE app_users SET discord_username=COALESCE(NULLIF(discord_username,''),'MLD') WHERE discord_username IS NULL;
    UPDATE app_users SET role=COALESCE(NULLIF(role,''),'user') WHERE role IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_unique ON app_users(username);
    CREATE TABLE IF NOT EXISTS tickets (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, subject VARCHAR(120) NOT NULL, message TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ; ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_by VARCHAR(32); CREATE TABLE IF NOT EXISTS ticket_messages (id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS applications (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, type VARCHAR(60) NOT NULL, answers JSONB NOT NULL DEFAULT '{}'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS application_questions (id SERIAL PRIMARY KEY, label VARCHAR(180) NOT NULL, key VARCHAR(80) NOT NULL UNIQUE, type VARCHAR(20) NOT NULL DEFAULT 'text', required BOOLEAN NOT NULL DEFAULT true, position INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true);
    CREATE TABLE IF NOT EXISTS community_groups (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, discord_username VARCHAR(100) NOT NULL, name VARCHAR(60) NOT NULL, description VARCHAR(240) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, username VARCHAR(32), discord_username VARCHAR(100), action VARCHAR(120) NOT NULL, details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS game_sessions (id BIGSERIAL PRIMARY KEY, code VARCHAR(8) UNIQUE NOT NULL, game_id VARCHAR(60) NOT NULL, game_name VARCHAR(120) NOT NULL, owner_username VARCHAR(32) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open', max_players INTEGER NOT NULL DEFAULT 4, players INTEGER NOT NULL DEFAULT 0, spectators INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, players_json JSONB NOT NULL DEFAULT '[]'::jsonb, spectators_json JSONB NOT NULL DEFAULT '[]'::jsonb, state JSONB); ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS players_json JSONB NOT NULL DEFAULT '[]'::jsonb; ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS spectators_json JSONB NOT NULL DEFAULT '[]'::jsonb; ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS state JSONB; UPDATE game_sessions SET players_json=jsonb_build_array(jsonb_build_object('username',owner_username)) WHERE COALESCE(jsonb_array_length(players_json),0)=0 AND players>0; CREATE INDEX IF NOT EXISTS game_sessions_status_idx ON game_sessions(status,created_at DESC);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details TEXT;

    CREATE TABLE IF NOT EXISTS group_members (id SERIAL PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, username VARCHAR(32), discord_username VARCHAR(100), joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(group_id, username));
    CREATE TABLE IF NOT EXISTS group_join_requests (id SERIAL PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, username VARCHAR(32), discord_username VARCHAR(100), status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(group_id, username));
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE group_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
    ALTER TABLE group_join_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS group_conversation_id BIGINT; ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'; ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS discord_role_id VARCHAR(32); ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(32);
    CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL DEFAULT 'زائر مجهول', discord_username VARCHAR(100) NOT NULL DEFAULT 'غير مسجل', rating INTEGER NOT NULL DEFAULT 5, message VARCHAR(1000) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'visible', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 5;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS message TEXT;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'visible';
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE reviews ALTER COLUMN text DROP NOT NULL;
    UPDATE reviews SET message=COALESCE(NULLIF(message,''),text,'رأي قديم') WHERE message IS NULL OR message='';
    UPDATE reviews SET username=COALESCE(NULLIF(username,''),'زائر مجهول'),discord_username=COALESCE(NULLIF(discord_username,''),'غير مسجل'),rating=GREATEST(1,LEAST(5,COALESCE(rating,5))),status=COALESCE(NULLIF(status,''),'visible') WHERE username IS NULL OR discord_username IS NULL OR rating IS NULL OR status IS NULL;
    INSERT INTO reviews(username,discord_username,rating,message,text,is_demo,status)
    SELECT 'زائر مجهول #'||gs::text,'غير مسجل',1+floor(random()*5)::int,
      (ARRAY['التصميم مرتب وسهل الاستخدام من أول دخول.','تجربة الجوال ممتازة والتنقل واضح.','قسم الألعاب ممتع وفكرته جميلة.','الأعضاء والرتب معروضة بشكل مرتب.','الشات سريع وواضح في الاستخدام.','القروبات فكرة حلوة للمجتمع.','واجهة الموقع نظيفة ومريحة للعين.','أعجبني ترتيب الصفحات وسهولة الوصول لها.','الرسائل الخاصة إضافة مفيدة للمجتمع.','قسم الآراء نفسه بسيط وسريع.','تجربة الموقع على الشاشة الصغيرة ممتازة.','فكرة جلسات الألعاب جميلة جدًا.','التصميم يعطي إحساس منصة مجتمع متكاملة.','التذاكر مرتبة وسهلة المتابعة.','عرض الأعضاء والبيانات واضح.','الموقع خفيف وسلس في التصفح.','تنظيم الأقسام ممتاز.','واجهة الألعاب واضحة للمستخدم.','فكرة الزاجل والرسائل مميزة.','التجربة العامة مرتبة وممتعة.'])[1+floor(random()*20)::int],
      (ARRAY['التصميم مرتب وسهل الاستخدام من أول دخول.','تجربة الجوال ممتازة والتنقل واضح.','قسم الألعاب ممتع وفكرته جميلة.','الأعضاء والرتب معروضة بشكل مرتب.','الشات سريع وواضح في الاستخدام.','القروبات فكرة حلوة للمجتمع.','واجهة الموقع نظيفة ومريحة للعين.','أعجبني ترتيب الصفحات وسهولة الوصول لها.','الرسائل الخاصة إضافة مفيدة للمجتمع.','قسم الآراء نفسه بسيط وسريع.','تجربة الموقع على الشاشة الصغيرة ممتازة.','فكرة جلسات الألعاب جميلة جدًا.','التصميم يعطي إحساس منصة مجتمع متكاملة.','التذاكر مرتبة وسهلة المتابعة.','عرض الأعضاء والبيانات واضح.','الموقع خفيف وسلس في التصفح.','تنظيم الأقسام ممتاز.','واجهة الألعاب واضحة للمستخدم.','فكرة الزاجل والرسائل مميزة.','التجربة العامة مرتبة وممتعة.'])[1+floor(random()*20)::int],
      true,'visible'
    FROM generate_series(1,196) gs
    WHERE (SELECT COUNT(*) FROM reviews WHERE is_demo=true) < 196
      AND gs <= 196-(SELECT COUNT(*) FROM reviews WHERE is_demo=true);
    CREATE TABLE IF NOT EXISTS announcements (id SERIAL PRIMARY KEY, text VARCHAR(300) NOT NULL, link TEXT DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS site_stats (id INTEGER PRIMARY KEY DEFAULT 1, visits BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS site_settings (key VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
    INSERT INTO site_settings(key,value) VALUES
      ('siteName','MLD'),('creatorName','فهد المطيري'),
      ('heroTitle','مجتمع MLD بشكل مختلف.'),('heroSubtitle','أعضاء، رتب، توب، ورسائل خاصة في لوحة فخمة وسريعة تتحدث تلقائيًا.')
      ON CONFLICT (key) DO NOTHING;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS discord_user_id VARCHAR(32);
    CREATE TABLE IF NOT EXISTS ticket_close_logs (id BIGSERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE, closed_by VARCHAR(32), transcript JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());\n    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved';
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS discord_role_id VARCHAR(64);
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS discord_channel_id VARCHAR(64);
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS group_conversation_id BIGINT;
    CREATE TABLE IF NOT EXISTS anonymous_posts (id BIGSERIAL PRIMARY KEY, author_username VARCHAR(32), body VARCHAR(2000) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS anonymous_replies (id BIGSERIAL PRIMARY KEY, post_id BIGINT NOT NULL REFERENCES anonymous_posts(id) ON DELETE CASCADE, author_username VARCHAR(32), body VARCHAR(2000) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS username VARCHAR(32);
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
    -- Legacy-schema compatibility: older deployments used user_id and omitted newer fields.
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS type VARCHAR(60) DEFAULT 'تقديم';
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
    ALTER TABLE applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subject VARCHAR(120) DEFAULT 'دعم';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open';
    ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS name VARCHAR(60) DEFAULT 'قروب';
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS description VARCHAR(240) NOT NULL DEFAULT '';
    ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
    CREATE INDEX IF NOT EXISTS tickets_username_idx ON tickets(username,id DESC);
    CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx ON ticket_messages(ticket_id,id ASC);
    CREATE INDEX IF NOT EXISTS applications_username_idx ON applications(username,id DESC);
    CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status,id DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_action_created_idx ON audit_logs(action,created_at DESC);
    CREATE INDEX IF NOT EXISTS group_members_username_idx ON group_members(username,group_id);
    CREATE INDEX IF NOT EXISTS group_join_requests_group_status_idx ON group_join_requests(group_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS community_groups_status_idx ON community_groups(status,id DESC);
    CREATE INDEX IF NOT EXISTS chat_public_mutes_until_idx ON chat_public_mutes(muted_until);
    CREATE INDEX IF NOT EXISTS password_resets_active_idx ON password_resets(username,expires_at DESC) WHERE used_at IS NULL;
    INSERT INTO site_stats(id,visits) VALUES(1,0) ON CONFLICT (id) DO NOTHING;
  `);
  // Repair very old schemas without breaking foreign keys.
  for (const table of ["group_members","group_join_requests","community_groups","applications","tickets","reviews"]) {
    const legacy = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='user_id'", [table]);
    if (!legacy.rowCount) continue;
    const pk = await pool.query("SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY' AND kcu.column_name='user_id'", [table]);
    if (pk.rowCount) {
      await pool.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_pkey" CASCADE`);
      await pool.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS id SERIAL`);
      await pool.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_pkey" PRIMARY KEY (id)`);
    }
    await pool.query(`ALTER TABLE "${table}" ALTER COLUMN user_id DROP NOT NULL`);
  }
  // Restore foreign keys that may have been removed by a legacy primary-key repair.
  await pool.query(`ALTER TABLE ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_ticket_id_fkey`);
  await pool.query(`ALTER TABLE ticket_messages ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE ticket_close_logs DROP CONSTRAINT IF EXISTS ticket_close_logs_ticket_id_fkey`);
  await pool.query(`ALTER TABLE ticket_close_logs ADD CONSTRAINT ticket_close_logs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE group_members DROP CONSTRAINT IF EXISTS group_members_group_id_fkey`);
  await pool.query(`ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES community_groups(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE group_join_requests DROP CONSTRAINT IF EXISTS group_join_requests_group_id_fkey`);
  await pool.query(`ALTER TABLE group_join_requests ADD CONSTRAINT group_join_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES community_groups(id) ON DELETE CASCADE`);
}
function currentUser(req){ return req.session?.user || null; }
function normalizeDiscordName(value){
  return String(value||"").trim().replace(/^@/,"").toLowerCase();
}
function discordNameMatches(member,wanted){
  const w=normalizeDiscordName(wanted);
  if(!w||!member)return false;
  const values=[
    member.user?.username,
    member.user?.globalName,
    member.displayName
  ].map(normalizeDiscordName).filter(Boolean);
  return values.includes(w) || values.some(v=>v.split("#")[0]===w);
}
async function findGuildMemberByUsername(discordUsername){
  const wanted=normalizeDiscordName(discordUsername);
  if(!wanted) return null;
  try{
    const guild=await getGuild();
    const members=await getAllMembers(guild);
    return members.find(m=>discordNameMatches(m,wanted))||null;
  }catch(e){ console.error("Discord membership check:",e.message); return null; }
}
async function requireGuildMember(req,res,next){
  const u=currentUser(req); if(!u) return res.status(401).json({error:"يجب تسجيل الدخول أولًا"});
  const member=await findGuildMemberByUsername(u.discordUsername);
  if(!member){ try{ await audit(u,"guild_membership_logout","انتهت عضوية Discord وتم إنهاء الجلسة"); }catch{} req.session.destroy(()=>{}); return res.status(403).json({error:"يجب أن تكون داخل سيرفر MLD لاستخدام الحساب"}); }
  next();
}
function requireAuth(req,res,next){ requireGuildMember(req,res,next); }
function requireAdmin(req,res,next){ requireGuildMember(req,res,()=>{ const u=currentUser(req); if(!u || !["owner","admin"].includes(u.role)) return res.status(403).json({error:"هذه الصفحة للأونر والإدارة فقط"}); next(); }); }
function requireOwner(req,res,next){ requireGuildMember(req,res,()=>{ const u=currentUser(req); if(!u || u.role!=="owner") return res.status(403).json({error:"هذه الصفحة للأونر فقط"}); next(); }); }
async function audit(u,action,details=""){ if(!process.env.DATABASE_URL) return; await pool.query("INSERT INTO audit_logs(username,discord_username,action,details) VALUES($1,$2,$3,$4)",[u?.username||null,u?.discordUsername||null,action,details]); }
async function ensureOwner(){
  if(!process.env.DATABASE_URL || !process.env.OWNER_USERNAME || !process.env.OWNER_PASSWORD) return;
  const username=String(process.env.OWNER_USERNAME).trim().toLowerCase();
  const discordIdentity=String(process.env.OWNER_DISCORD_USERNAME||process.env.OWNER_USERNAME).trim();
  const hash=await bcrypt.hash(String(process.env.OWNER_PASSWORD),12);
  const found=await pool.query("SELECT id FROM app_users WHERE username=$1",[username]);
  if(!found.rowCount){
    await pool.query("INSERT INTO app_users(username,password_hash,discord_username,role) VALUES($1,$2,$3,'owner')",[username,hash,discordIdentity]);
  }else{
    await pool.query("UPDATE app_users SET password_hash=$2,role='owner',discord_username=$3 WHERE username=$1",[username,hash,discordIdentity]);
  }
}


const jokeSeeds=[
"واحد قال لخويه: عندي سالفة طويلة… قاله: ارسلها واتساب لا تتعبنا 😂",
"قلت للربع بنام بدري… جلست معهم لين الفجر عشان أتأكد إنهم ناموا 😭",
"الراتب عندي سريع مرة… يدخل الحساب ويطلع قبل لا أقول السلام عليكم 😂",
"دخلت المطبخ أدور شيء آكله… الثلاجة قالت: تراك قبل شوي جيتني لا تحرجني 😂",
"واحد اشترى ساعة ذكية… صارت أذكى منه وقالت له نام بدري 😭"
];
const storySeed={
"مغامرة":["في ليلة هادئة وصلته رسالة تقول: لا تفتح الباب إذا سمعت ثلاث دقات.","نزل إلى آخر الممر فوجد مفتاحًا صغيرًا مكتوبًا عليه ملاذ.","فتح الباب فظهرت خريطة تقوده إلى مكان لم يره أحد من قبل."],
"غموض":["توقفت ساعة المحل عند الدقيقة نفسها منذ سنوات.","وجد في جيبه ورقة لم يكتبها، وفيها موعد الليلة التالية.","عندما وصل الموعد اكتشف أن صاحب الرسالة يعرف عنه كل شيء."],
"رعب خفيف":["انطفأت الأنوار لحظة واحدة، وعندما عادت كان الكرسي قد تحرك وحده.","ضحك وقال أكيد أحد يمزح، ثم سمع نفس الضحكة من الغرفة الفاضية.","فتح الباب فوجد قطة صغيرة تنظر له وكأنها صاحبة المكان 😂."],
"كوميديا":["قرر أن يبدأ يومه بنشاط وضبط خمس منبهات.","قام بعد المنبه السادس وهو يسأل نفسه: ليه الحياة صعبة؟","قرر ينام بدري من بكرة… وكانت هذه أول كذبة في القصة 😂."],
"خيال":["وجد بابًا صغيرًا خلف مكتبة قديمة، وعلى الباب نقش يضيء إذا اقترب.","دخل فوجد مدينة معلقة فوق السحاب، وكل بيت فيها يحفظ ذكرى شخص.","اختار بيتًا واحدًا، وعندما فتحه وجد ذكرى لم يعشها بعد."]
};
async function ensureEngagementSeed(){try{const x=await pool.query("SELECT COUNT(*)::int n FROM mld_jokes");if(!Number(x.rows[0]?.n)){for(const body of jokeSeeds)await pool.query("INSERT INTO mld_jokes(body) VALUES($1)",[body]);}}catch(e){console.error("Engagement seed:",e.message)}}
async function engagementUser(req,res,next){const u=currentUser(req);if(!u)return res.status(401).json({error:"يجب تسجيل الدخول أولًا"});req.mldUser=u;next();}
app.get("/api/jokes",async(req,res)=>{try{const q=await pool.query("SELECT id,body,author,likes,dislikes,created_at FROM mld_jokes ORDER BY created_at DESC LIMIT 100");res.json({items:q.rows});}catch(e){res.status(500).json({error:"تعذر تحميل النكت"})}});
app.post("/api/jokes",writeLimiter,engagementUser,async(req,res)=>{const body=String(req.body?.body||"").trim().slice(0,500);if(body.length<5)return res.status(400).json({error:"اكتب نكتة أطول شوي"});try{const q=await pool.query("INSERT INTO mld_jokes(body,author) VALUES($1,$2) RETURNING id,body,author,likes,dislikes,created_at",[body,req.mldUser.username]);res.status(201).json(q.rows[0]);}catch(e){res.status(500).json({error:"تعذر نشر النكتة"})}});
app.post("/api/jokes/generate",writeLimiter,async(req,res)=>{const body=jokeSeeds[Math.floor(Math.random()*jokeSeeds.length)];try{const q=await pool.query("INSERT INTO mld_jokes(body,author) VALUES($1,'ملاذ الذكي') RETURNING id,body,author,likes,dislikes,created_at",[body]);res.status(201).json(q.rows[0]);}catch(e){res.status(500).json({error:"تعذر توليد النكتة"})}});
app.post("/api/jokes/:id/react",writeLimiter,engagementUser,async(req,res)=>{const type=req.body?.type==="dislike"?"dislike":"like";try{const old=await pool.query("SELECT reaction FROM mld_joke_reactions WHERE joke_id=$1 AND username=$2",[req.params.id,req.mldUser.username]);if(old.rowCount)await pool.query("UPDATE mld_joke_reactions SET reaction=$3 WHERE joke_id=$1 AND username=$2",[req.params.id,req.mldUser.username,type]);else await pool.query("INSERT INTO mld_joke_reactions(joke_id,username,reaction) VALUES($1,$2,$3)",[req.params.id,req.mldUser.username,type]);await pool.query("UPDATE mld_jokes SET likes=(SELECT COUNT(*) FROM mld_joke_reactions WHERE joke_id=$1 AND reaction='like'),dislikes=(SELECT COUNT(*) FROM mld_joke_reactions WHERE joke_id=$1 AND reaction='dislike') WHERE id=$1",[req.params.id]);const q=await pool.query("SELECT id,body,author,likes,dislikes,created_at FROM mld_jokes WHERE id=$1",[req.params.id]);if(!q.rowCount)return res.status(404).json({error:"النكتة غير موجودة"});res.json(q.rows[0]);}catch(e){res.status(500).json({error:"تعذر حفظ التفاعل"})}});
app.post("/api/stories/generate",async(req,res)=>{const genre=Object.prototype.hasOwnProperty.call(storySeed,req.body?.genre)?req.body.genre:"مغامرة";const len=req.body?.length==="طويلة"?6:req.body?.length==="متوسطة"?4:3;const src=storySeed[genre],parts=[];for(let i=0;i<len;i++)parts.push(src[i%src.length]);const body=parts.join(" ");try{const q=await pool.query("INSERT INTO mld_stories(genre,body) VALUES($1,$2) RETURNING id,genre,body,created_at",[genre,body]);res.status(201).json(q.rows[0]);}catch(e){res.status(500).json({error:"تعذر توليد القصة"})}});
app.get("/api/support",async(req,res)=>{try{const g=await getGuild();const wanted=String(process.env.OWNER_DISCORD_USERNAME||process.env.OWNER_USERNAME||"w4px").trim().toLowerCase();let member=null;const members=await getAllMembers(g);for(const m of members){const names=[m.user?.username,m.user?.globalName,m.displayName].filter(Boolean).map(x=>String(x).toLowerCase());if(names.includes(wanted)||names.some(x=>x.split("#")[0]===wanted)){member=m;break;}}const id=member?.user?.id||null;res.json({ok:!!id,username:wanted,url:id?"https://discord.com/users/"+id:null});}catch(e){res.json({ok:false,username:String(process.env.OWNER_DISCORD_USERNAME||process.env.OWNER_USERNAME||"w4px").trim().toLowerCase(),url:null})}});

const GAME_ENGINE_MAP={uno:"UNO",ludo:"LUDO",flightchess:"LUDO",baloot:"BALOOT",jackaroo:"JAKAROO",qawsar:"QAWSAR"};
const GAME_LIMITS={UNO:{min:2,max:6},LUDO:{min:2,max:4},BALOOT:{min:4,max:4},JAKAROO:{min:2,max:4},QAWSAR:{min:2,max:6}};
function engineFor(id){return GAME_ENGINE_MAP[String(id||"").toLowerCase()]||null}
function gameIdentity(req,body={}){
  const u=currentUser(req);
  if(u)return {username:String(u.username).slice(0,32),discordUsername:String(u.discordUsername||"").slice(0,100)};
  const guestId=String(body.guestId||"").trim().slice(0,64);
  const username=String(body.playerName||"زائر").trim().slice(0,32)||"زائر";
  return guestId?{guestId,username}:{guestId:"guest-"+require("crypto").randomBytes(8).toString("hex"),username};
}
function sameGamePlayer(a,b){return a&&b&&((a.username&&b.username&&String(a.username).toLowerCase()===String(b.username).toLowerCase())||(a.guestId&&b.guestId&&a.guestId===b.guestId))}
function publicGameSession(row){
  return {
    id:row.id,code:row.code,game_id:row.game_id,game_name:row.game_name,owner_username:row.owner_username,
    status:row.status,max_players:Number(row.max_players||4),players:Number(row.players||0),spectators:Number(row.spectators||0),
    players_list:Array.isArray(row.players_json)?row.players_json.map((p,i)=>({seat:i+1,username:p.username||"زائر",guestId:p.guestId||null})):[],
    created_at:row.created_at,started_at:row.started_at
  };
}
app.get("/api/games/sessions",async(req,res)=>{
  try{
    const q=await pool.query("SELECT id,code,game_id,game_name,owner_username,status,max_players,players,spectators,created_at,started_at,players_json FROM game_sessions WHERE status IN ('open','playing') ORDER BY created_at DESC LIMIT 100");
    res.set("Cache-Control","no-store");res.json({sessions:q.rows.map(publicGameSession)});
  }catch(e){console.error("Game sessions list:",e);res.status(500).json({error:"تعذر تحميل جلسات الألعاب",sessions:[]})}
});
app.post("/api/games/sessions",writeLimiter,async(req,res)=>{
  try{
    const engine=engineFor(req.body?.gameId);if(!engine)return res.status(400).json({error:"هذه اللعبة غير مدعومة بمحرك داخل ملاذ حاليًا"});
    const limits=GAME_LIMITS[engine],gameName=String(req.body?.gameName||engine).trim().slice(0,120);
    const player=gameIdentity(req,{...req.body,playerName:req.body?.playerName||currentUser(req)?.username||"زائر"});
    const max=Math.max(limits.min,Math.min(limits.max,Number(req.body?.maxPlayers)||limits.max));
    let code="";
    for(let i=0;i<12;i++){code=Math.random().toString(36).slice(2,8).toUpperCase();const x=await pool.query("SELECT 1 FROM game_sessions WHERE code=$1",[code]);if(!x.rowCount)break}
    const q=await pool.query("INSERT INTO game_sessions(code,game_id,game_name,owner_username,max_players,players,players_json,spectators_json) VALUES($1,$2,$3,$4,$5,1,$6::jsonb,'[]'::jsonb) RETURNING *",[code,String(req.body.gameId||engine).toLowerCase(),gameName,player.username,max,JSON.stringify([player])]);
    res.json({ok:true,session:publicGameSession(q.rows[0])});
  }catch(e){console.error("Game session create:",e);res.status(500).json({error:"تعذر إنشاء جلسة اللعبة"})}
});
app.post("/api/games/sessions/:code/join",writeLimiter,async(req,res)=>{
  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    const code=String(req.params.code||"").toUpperCase(),q=await db.query("SELECT * FROM game_sessions WHERE code=$1 AND status='open' FOR UPDATE",[code]);
    if(!q.rowCount)throw Object.assign(new Error("الجلسة غير موجودة أو بدأت"),{statusCode:404});
    const s=q.rows[0],players=Array.isArray(s.players_json)?s.players_json:[],player=gameIdentity(req,req.body||{});
    if(players.some(p=>sameGamePlayer(p,player)))return db.query("ROLLBACK").then(()=>res.json({ok:true,session:publicGameSession(s),already:true}));
    if(players.length>=Number(s.max_players))throw Object.assign(new Error("الجلسة مكتملة"),{statusCode:409});
    players.push(player);
    const u=await db.query("UPDATE game_sessions SET players=$2,players_json=$3::jsonb WHERE code=$1 RETURNING *",[code,players.length,JSON.stringify(players)]);
    await db.query("COMMIT");res.json({ok:true,session:publicGameSession(u.rows[0])});
  }catch(e){try{await db.query("ROLLBACK")}catch{};res.status(e.statusCode||500).json({error:e.message||"تعذر الانضمام للجلسة"})}finally{db.release()}
});
app.post("/api/games/sessions/:code/start",writeLimiter,async(req,res)=>{
  try{
    const code=String(req.params.code||"").toUpperCase(),q=await pool.query("SELECT * FROM game_sessions WHERE code=$1 AND status='open'",[code]);
    if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة أو بدأت"});
    const s=q.rows[0],u=currentUser(req);if(!u||String(u.username).toLowerCase()!==String(s.owner_username).toLowerCase())return res.status(403).json({error:"صاحب الجلسة فقط يستطيع بدء اللعبة"});
    const players=Array.isArray(s.players_json)?s.players_json:[],engine=engineFor(s.game_id),limits=GAME_LIMITS[engine];
    if(!engine||players.length<limits.min)return res.status(409).json({error:"اللعبة تحتاج "+limits.min+" لاعبين على الأقل"});
    const state=gameEngines.create(engine,players);
    const u2=await pool.query("UPDATE game_sessions SET status='playing',started_at=COALESCE(started_at,NOW()),state=$2::jsonb,players=$3 WHERE code=$1 AND status='open' RETURNING *",[code,JSON.stringify(state),players.length]);
    res.json({ok:true,session:publicGameSession(u2.rows[0])});
  }catch(e){console.error("Game start:",e);res.status(500).json({error:e.message||"تعذر بدء اللعبة"})}
});
app.get("/api/games/sessions/:code/state",async(req,res)=>{
  try{
    const code=String(req.params.code||"").toUpperCase(),q=await pool.query("SELECT * FROM game_sessions WHERE code=$1 AND status IN ('open','playing')",[code]);
    if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});
    const s=q.rows[0],players=Array.isArray(s.players_json)?s.players_json:[],viewer=gameIdentity(req,req.query||{});
    if(s.status==="open")return res.json({ok:true,session:publicGameSession(s),state:null});
    const state=s.state?JSON.parse(JSON.stringify(s.state)):null;
    if(!state)return res.status(503).json({error:"حالة اللعبة غير جاهزة"});
    res.set("Cache-Control","no-store");res.json({ok:true,session:publicGameSession(s),state:gameEngines.pub(state,players,viewer)});
  }catch(e){console.error("Game state:",e);res.status(500).json({error:e.message||"تعذر تحميل حالة اللعبة"})}
});
app.post("/api/games/sessions/:code/action",writeLimiter,async(req,res)=>{
  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    const code=String(req.params.code||"").toUpperCase(),q=await db.query("SELECT * FROM game_sessions WHERE code=$1 AND status='playing' FOR UPDATE",[code]);
    if(!q.rowCount)throw Object.assign(new Error("الجلسة غير موجودة أو اللعبة لم تبدأ"),{statusCode:404});
    const s=q.rows[0],players=Array.isArray(s.players_json)?s.players_json:[],actor=gameIdentity(req,req.body||{}),idx=players.findIndex(p=>sameGamePlayer(p,actor));
    if(idx<0)throw Object.assign(new Error("لست لاعبًا في هذه الجلسة"),{statusCode:403});
    const state=s.state?JSON.parse(JSON.stringify(s.state)):null;if(!state)throw Error("حالة اللعبة غير جاهزة");
    const next=gameEngines.apply(state.game,state,players,actor,String(req.body?.action||""),req.body?.data||{});
    const u=await db.query("UPDATE game_sessions SET state=$2::jsonb,status=$3 WHERE code=$1 RETURNING *",[code,JSON.stringify(next),next.phase==="finished"?"ended":"playing"]);
    await db.query("COMMIT");
    res.json({ok:true,finished:next.phase==="finished",session:publicGameSession(u.rows[0]),state:gameEngines.pub(next,players,actor)});
  }catch(e){try{await db.query("ROLLBACK")}catch{};res.status(e.statusCode||400).json({error:e.message||"الحركة غير صالحة"})}finally{db.release()}
});
app.post("/api/games/sessions/:code/spectate",writeLimiter,async(req,res)=>{
  const db=await pool.connect();
  try{
    await db.query("BEGIN");const code=String(req.params.code||"").toUpperCase(),q=await db.query("SELECT * FROM game_sessions WHERE code=$1 AND status='playing' FOR UPDATE",[code]);
    if(!q.rowCount)throw Object.assign(new Error("الجلسة غير متاحة للمشاهدة"),{statusCode:404});
    const s=q.rows[0],viewer=gameIdentity(req,req.body||{}),list=Array.isArray(s.spectators_json)?s.spectators_json:[];
    if(!list.some(p=>sameGamePlayer(p,viewer)))list.push(viewer);
    const u=await db.query("UPDATE game_sessions SET spectators=$2,spectators_json=$3::jsonb WHERE code=$1 RETURNING *",[code,list.length,JSON.stringify(list)]);
    await db.query("COMMIT");res.json({ok:true,session:publicGameSession(u.rows[0])});
  }catch(e){try{await db.query("ROLLBACK")}catch{};res.status(e.statusCode||500).json({error:e.message||"تعذر تسجيل المشاهدة"})}finally{db.release()}
});
app.post("/api/games/sessions/:code/leave",writeLimiter,async(req,res)=>{
  const db=await pool.connect();
  try{
    await db.query("BEGIN");const code=String(req.params.code||"").toUpperCase(),q=await db.query("SELECT * FROM game_sessions WHERE code=$1 AND status IN ('open','playing') FOR UPDATE",[code]);
    if(!q.rowCount)throw Object.assign(new Error("الجلسة غير موجودة"),{statusCode:404});
    const s=q.rows[0],actor=gameIdentity(req,req.body||{}),players=Array.isArray(s.players_json)?s.players_json:[],next=players.filter(p=>!sameGamePlayer(p,actor));
    if(next.length===players.length)throw Object.assign(new Error("أنت لست في الجلسة"),{statusCode:404});
    if(s.status==="playing")throw Object.assign(new Error("لا يمكن تغيير مقاعد اللاعبين بعد بدء اللعبة"),{statusCode:409});
    const u=await db.query("UPDATE game_sessions SET players=$2,players_json=$3::jsonb WHERE code=$1 RETURNING *",[code,next.length,JSON.stringify(next)]);
    await db.query("COMMIT");res.json({ok:true,session:publicGameSession(u.rows[0])});
  }catch(e){try{await db.query("ROLLBACK")}catch{};res.status(e.statusCode||500).json({error:e.message||"تعذر الخروج من الجلسة"})}finally{db.release()}
});
app.post("/api/games/sessions/:code/end",writeLimiter,async(req,res)=>{
  try{
    const code=String(req.params.code||"").toUpperCase(),q=await pool.query("SELECT * FROM game_sessions WHERE code=$1",[code]);if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});
    const s=q.rows[0],u=currentUser(req);if(!u||String(u.username).toLowerCase()!==String(s.owner_username).toLowerCase())return res.status(403).json({error:"صاحب الجلسة فقط يستطيع إنهاء الجلسة"});
    const x=await pool.query("UPDATE game_sessions SET status='ended',ended_at=COALESCE(ended_at,NOW()) WHERE code=$1 RETURNING *",[code]);res.json({ok:true,session:publicGameSession(x.rows[0])});
  }catch(e){res.status(500).json({error:"تعذر إنهاء الجلسة"})}
});

let siteStatsCache={data:null,at:0};let siteStatsCache={data:null,at:0};
app.get("/api/site/stats",async(req,res)=>{
  try{
    if(siteStatsCache.data&&Date.now()-siteStatsCache.at<1000)return res.json({...siteStatsCache.data,cached:true});
    const q=await pool.query("SELECT visits FROM site_stats WHERE id=1");
    const g=await getGuild();
    const members=await getAllMembers(g);
    const presenceCount=[...(g.presences?.cache?.values?.()||[])].filter(p=>p.status&&p.status!=="offline"&&!g.members.cache.get(p.userId)?.user.bot).length;
    const online=presenceCount||members.filter(m=>!m.user.bot&&m.presence?.status&&m.presence?.status!=="offline").length;
    const data={visits:Number(q.rows[0]?.visits||0),online,memberCount:Number(g.memberCount||members.length||0),updatedAt:new Date().toISOString()};
    siteStatsCache={data,at:Date.now()};
    res.set("Cache-Control","no-store");
    res.json({...data,cached:false});
  }catch(e){
    console.error("Site stats:",e);
    res.status(503).json({error:"stats_unavailable"});
  }
});
app.post("/api/site/visit",async(req,res)=>{try{await pool.query("UPDATE site_stats SET visits=visits+1,updated_at=NOW() WHERE id=1");res.json({ok:true});}catch(e){res.status(500).json({error:"stats"});}});
app.get("/api/site/settings",async(req,res)=>{try{const q=await pool.query("SELECT key,value FROM site_settings");res.json({settings:Object.fromEntries(q.rows.map(x=>[x.key,x.value]))});}catch(e){res.status(500).json({settings:{}});}});
app.post("/api/owner/settings",requireOwner,async(req,res)=>{try{const allowed=["siteName","heroTitle","heroSubtitle"];for(const key of allowed){const value=String(req.body?.[key]??"").trim();if(value.length>500)return res.status(400).json({error:"إعداد طويل جدًا"});await pool.query("INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[key,value]);}await audit(req.session.user,"site_settings_update","تعديل إعدادات الموقع");res.json({ok:true});}catch(e){console.error("Site settings:",e);res.status(500).json({error:"تعذر حفظ الإعدادات"});}});
app.get("/api/auth/me",async(req,res)=>{const u=currentUser(req); if(!u) return res.json({authenticated:false,user:null}); const member=await findGuildMemberByUsername(u.discordUsername); if(!member){try{await audit(u,"guild_membership_logout","انتهت عضوية Discord وتم إنهاء الجلسة");}catch{} return req.session.destroy(()=>res.json({authenticated:false,user:null,reason:"guild_membership_required"}));} res.json({authenticated:true,user:{username:u.username,discordUsername:u.discordUsername,role:u.role,isOwner:u.role==="owner",mustChangePassword:!!u.mustChangePassword}});});
app.post("/api/auth/register",authLimiter,async(req,res)=>{
  try{
    const username=String(req.body?.username||"").trim().toLowerCase(), password=String(req.body?.password||""), discordUsername=String(req.body?.discordUsername||"").trim(), discordUserId=String(req.body?.discordUserId||"").trim();
    if(!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({error:"اليوزر يجب أن يكون 3-32 حرفًا إنجليزيًا أو أرقامًا"});
    if(password.length<6||password.length>100) return res.status(400).json({error:"كلمة المرور يجب أن تكون 6 أحرف على الأقل"});
    if(discordUsername.length<2||discordUsername.length>100) return res.status(400).json({error:"أدخل يوزرك في Discord"});
    const member=discordUserId ? (await getAllMembers(await getGuild())).find(m=>m.user?.id===discordUserId)||null : await findGuildMemberByUsername(discordUsername);
    if(!member) return res.status(403).json({error:"لازم تكون داخل سيرفر MLD في Discord قبل إنشاء الحساب"});
    if(discordUserId && member.user.id!==discordUserId) return res.status(400).json({error:"اختيار Discord غير صالح، اختر حسابك من الاقتراحات."});
    if((await pool.query("SELECT id FROM app_users WHERE username=$1",[username])).rowCount) return res.status(409).json({error:"اسم المستخدم مستخدم مسبقًا"});
    if((await pool.query("SELECT id FROM app_users WHERE lower(trim(discord_username))=lower(trim($1))",[member.user.username])).rowCount) return res.status(409).json({error:"حساب موقع موجود مسبقًا لهذا Discord"});
    const hash=await bcrypt.hash(password,12);
    const crypto=require("crypto"),code=crypto.randomBytes(3).toString("hex").toUpperCase();
    await pool.query("UPDATE registration_verifications SET used_at=NOW(),decision='superseded' WHERE (username=$1 OR discord_user_id=$2) AND used_at IS NULL",[username,member.user.id]);
    const pending=await pool.query("INSERT INTO registration_verifications(username,password_hash,discord_username,discord_user_id,code,expires_at,decision) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '10 minutes','pending') RETURNING id",[username,hash,member.user.username,member.user.id,code]);
    const verificationId=pending.rows[0].id;
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("register_v2_yes:"+verificationId).setLabel("نعم، هذا حسابي").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("register_v2_no:"+verificationId).setLabel("لا، إلغاء").setStyle(ButtonStyle.Danger));
    try{
      const verificationMessage=await member.send({embeds:[new EmbedBuilder().setTitle("تأكيد إنشاء حساب MLD").setDescription("تم العثور على حساب Discord **"+member.user.username+"**. هل تريد إنشاء حساب الموقع **"+username+"**؟\n\nاضغط «نعم» لإنشاء الحساب فورًا، أو «لا» لإلغاء الطلب.\n\nينتهي الطلب خلال 10 دقائق.").setColor("#ff9cdc").setTimestamp()],components:[row]}); await pool.query("UPDATE registration_verifications SET message_id=$1 WHERE id=$2 AND used_at IS NULL AND decision='pending'",[verificationMessage.id,verificationId]);
    }catch(e){await pool.query("UPDATE registration_verifications SET used_at=NOW() WHERE id=$1 AND used_at IS NULL",[verificationId]);return res.status(400).json({error:"تعذر إرسال رسالة التأكيد في Discord. افتح الخاص مع الزاجل ثم حاول مرة أخرى."});}
    await audit({username,discordUsername:member.user.username},"register_pending","طلب إنشاء حساب بانتظار تأكيد زر Discord").catch(()=>{});
    res.json({ok:true,pending:true,message:"تم إرسال رسالة التأكيد إلى الخاص في Discord. اضغط «نعم» أو «لا» هناك."});
  }catch(e){console.error("Register:",e);res.status(500).json({error:"تعذر إنشاء طلب الحساب"});}
});
app.post("/api/auth/login",authLimiter,async(req,res)=>{
  try{
    const username=String(req.body?.username||"").trim().toLowerCase(),password=String(req.body?.password||"");
    const q=await pool.query("SELECT username,password_hash,discord_username,discord_user_id,role,banned FROM app_users WHERE username=$1",[username]);
    if(!q.rowCount) return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
    const r=q.rows[0]; if(r.banned)return res.status(403).json({error:"هذا الحساب محظور من الموقع"}); const member=await findGuildMemberByUsername(r.discord_username); if(!member) return res.status(403).json({error:"لازم تكون داخل سيرفر MLD في Discord قبل تسجيل الدخول"});
    let valid=await bcrypt.compare(password,r.password_hash),temp=false;
    if(!valid){ const reset=await pool.query("SELECT id,temp_password_hash FROM password_resets WHERE username=$1 AND used_at IS NULL AND expires_at>NOW() ORDER BY id DESC LIMIT 1",[r.username]); if(reset.rowCount&&await bcrypt.compare(password,reset.rows[0].temp_password_hash)){ valid=true; temp=true; await pool.query("UPDATE password_resets SET used_at=NOW() WHERE id=$1",[reset.rows[0].id]); } }
    if(!valid) return res.status(401).json({error:"بيانات الدخول غير صحيحة"});
    req.session.user={username:r.username,discordUsername:r.discord_username,discordUserId:r.discord_user_id||member.user.id,role:r.role,mustChangePassword:temp}; await pool.query("UPDATE app_users SET last_login_at=NOW(),discord_user_id=$2 WHERE username=$1",[username,r.discord_user_id||member.user.id]); await new Promise((resolve,reject)=>req.session.save(err=>err?reject(err):resolve())); await audit(req.session.user,"login","تسجيل دخول").catch(()=>{}); res.json({ok:true,user:req.session.user});
  }catch(e){console.error("Login:",e);res.status(500).json({error:"تعذر تسجيل الدخول"});}
});
app.post("/api/auth/forgot-password",resetLimiter,async(req,res)=>{
  try{
    const username=String(req.body?.username||"").trim().toLowerCase(),discordUsername=String(req.body?.discordUsername||"").trim();
    if(!username||!discordUsername) return res.status(400).json({error:"أدخل اسم الحساب وDiscord username"});
    const q=await pool.query("SELECT username,discord_username FROM app_users WHERE username=$1",[username]); if(!q.rowCount) return res.status(404).json({error:"الحساب غير موجود"});
    const account=q.rows[0]; if(account.discord_username.trim().toLowerCase()!==discordUsername.toLowerCase()) return res.status(400).json({error:"بيانات الاسترداد غير مطابقة"});
    const member=await findGuildMemberByUsername(account.discord_username); if(!member) return res.status(403).json({error:"يجب أن تكون داخل سيرفر MLD أولًا"});
    const crypto=require("crypto"),temp=crypto.randomBytes(9).toString("base64url"),hash=await bcrypt.hash(temp,12);
    await pool.query("UPDATE password_resets SET used_at=NOW() WHERE username=$1 AND used_at IS NULL",[username]);
    await pool.query("INSERT INTO password_resets(username,discord_username,temp_password_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '15 minutes')",[username,member.user.username,hash]);
    await member.send({embeds:[new EmbedBuilder().setTitle("MLD — إعادة كلمة المرور").setDescription("تم طلب إعادة كلمة المرور لحساب موقع MLD.\n\nكلمة المرور المؤقتة:\n**"+temp+"**\n\nتنتهي خلال 15 دقيقة وتستخدم مرة واحدة فقط. بعد تسجيل الدخول غيّرها فورًا.\n\nإذا لم تطلب هذه العملية، تجاهل الرسالة.").setColor("#ff9cdc").setTimestamp()]});
    await audit({username,discordUsername:member.user.username},"password_reset_request","تم إرسال كلمة مرور مؤقتة عبر Discord DM").catch(()=>{}); res.json({ok:true,message:"أرسلنا كلمة مرور مؤقتة إلى الخاص في Discord"});
  }catch(e){ console.error("Forgot password:",e.message); res.status(500).json({error:"تعذر إرسال كلمة المرور المؤقتة؛ تأكد أن الخاص مفتوح"}); }
});
app.post("/api/auth/change-password",requireAuth,writeLimiter,async(req,res)=>{
  try{ const u=req.session.user,newPassword=String(req.body?.newPassword||""); if(newPassword.length<6||newPassword.length>100) return res.status(400).json({error:"كلمة المرور الجديدة يجب أن تكون 6-100 أحرف"}); const hash=await bcrypt.hash(newPassword,12); await pool.query("UPDATE app_users SET password_hash=$2 WHERE username=$1",[u.username]); await pool.query("UPDATE password_resets SET used_at=COALESCE(used_at,NOW()) WHERE username=$1 AND used_at IS NULL",[u.username]); req.session.user.mustChangePassword=false; await new Promise((resolve,reject)=>req.session.save(err=>err?reject(err):resolve())); await audit(u,"password_change","تغيير كلمة المرور").catch(()=>{}); res.json({ok:true}); }
  catch(e){ console.error("Change password:",e.message); res.status(500).json({error:"تعذر تغيير كلمة المرور"}); }
});
app.post("/api/auth/logout",async(req,res)=>{const u=currentUser(req);if(u) await audit(u,"logout","تسجيل خروج").catch(()=>{});req.session.destroy(()=>res.json({ok:true}));});


app.get("/api/tickets",async(req,res)=>{
  const u=currentUser(req);
  if(u && u.role && ["owner","admin"].includes(u.role)){
    const q=await pool.query("SELECT id,username,discord_username,subject,status,created_at FROM tickets ORDER BY id DESC LIMIT 100");
    return res.json({tickets:q.rows,public:true,canOpen:true,admin:true});
  }
  if(!u) {
    const q=await pool.query("SELECT id,username,subject,status,created_at FROM tickets ORDER BY id DESC LIMIT 100");
    return res.json({tickets:q.rows,public:true,canOpen:false});
  }
  const q=await pool.query("SELECT id,username,discord_username,subject,message,status,created_at FROM tickets WHERE username=$1 ORDER BY id DESC",[u.username]);
  res.json({tickets:q.rows,public:true,canOpen:true});
});
app.get("/api/tickets/:id/messages",requireAuth,async(req,res)=>{
  const u=req.session.user,id=Number(req.params.id);
  const t=await pool.query("SELECT id,username,status,subject FROM tickets WHERE id=$1",[id]);
  if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
  if(t.rows[0].username!==u.username&&!["owner","admin"].includes(u.role))return res.status(403).json({error:"لا تملك صلاحية مشاهدة محادثة التيكت"});
  const q=await pool.query("SELECT tm.id,tm.username,tm.discord_username,tm.message,tm.created_at,COALESCE(u.role,'user') AS role FROM ticket_messages tm LEFT JOIN app_users u ON u.username=tm.username WHERE tm.ticket_id=$1 ORDER BY tm.id ASC",[id]);
  res.json({ticket:t.rows[0],messages:q.rows});
});
app.post("/api/tickets",requireAuth,writeLimiter,async(req,res)=>{
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
  const t=await pool.query("SELECT id,username,status FROM tickets WHERE id=$1",[id]);
  if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
  if(t.rows[0].username!==u.username&&!["owner","admin"].includes(u.role))return res.status(403).json({error:"لا تملك صلاحية الرد"});
  if(t.rows[0].status==="closed")return res.status(400).json({error:"التيكت مغلق. افتحه من الإدارة قبل إضافة رد جديد."});
  const q=await pool.query("INSERT INTO ticket_messages(ticket_id,username,discord_username,message) VALUES($1,$2,$3,$4) RETURNING id,created_at",[id,u.username,u.discordUsername,message]);
  await audit(u,"ticket_reply",`#${id} ${message.slice(0,120)}`);
  res.json({ok:true,message:{id:q.rows[0].id,username:u.username,discord_username:u.discordUsername,message,created_at:q.rows[0].created_at}});
});
app.post("/api/owner/tickets/:id/status",requireAdmin,async(req,res)=>{
  try{
    const status=String(req.body?.status||"").toLowerCase(),id=Number(req.params.id);
    if(!["open","closed","pending"].includes(status))return res.status(400).json({error:"حالة غير صحيحة"});
    if(status==="closed"){
      const msgs=await pool.query("SELECT id,username,discord_username,message,created_at FROM ticket_messages WHERE ticket_id=$1 ORDER BY id ASC",[id]);
      const t=await pool.query("SELECT id FROM tickets WHERE id=$1",[id]);
      if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
      await pool.query("INSERT INTO ticket_close_logs(ticket_id,closed_by,transcript) VALUES($1,$2,$3)",[id,req.session.user.username,JSON.stringify(msgs.rows)]);
    }
    const q=await pool.query("UPDATE tickets SET status=$1,closed_at=CASE WHEN $1='closed' THEN NOW() ELSE NULL END,closed_by=CASE WHEN $1='closed' THEN $2 ELSE NULL END WHERE id=$3 RETURNING id,status,closed_at,closed_by",[status,req.session.user.username,id]);
    if(!q.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
    await audit(req.session.user,"ticket_status","#"+id+" => "+status+(status==="closed"?" · تم حفظ كامل المحادثة في سجل إغلاق التيكت":""));
    res.json({ok:true,ticket:q.rows[0]});
  }catch(e){console.error("Ticket status:",e);res.status(500).json({error:"تعذر تحديث التيكت"});}
});
app.get("/api/owner/tickets/:id/log",requireAdmin,async(req,res)=>{
  const id=Number(req.params.id);
  const q=await pool.query("SELECT id,ticket_id,closed_by,transcript,created_at FROM ticket_close_logs WHERE ticket_id=$1 ORDER BY id DESC LIMIT 1",[id]);
  res.json({log:q.rows[0]||null});
});

app.get("/api/my/applications",requireAuth,async(req,res)=>{const q=await pool.query("SELECT id,type,status,answers,created_at FROM applications WHERE username=$1 ORDER BY id DESC LIMIT 100",[req.session.user.username]);res.json({applications:q.rows});});
app.get("/api/applications",async(req,res)=>{const q=await pool.query("SELECT type,status,created_at FROM applications ORDER BY id DESC LIMIT 30");res.json({applications:q.rows,public:true,canSubmit:Boolean(currentUser(req))});});
app.get("/api/application-questions",requireAuth,async(req,res)=>{const q=await pool.query("SELECT id,label,key,type,required,position FROM application_questions WHERE active=true ORDER BY position,id");res.json({questions:q.rows});});
app.post("/api/applications",requireAuth,writeLimiter,async(req,res)=>{const type=String(req.body?.type||"تقديم").trim(),answers=req.body?.answers||{},u=req.session.user;if(type.length>60||JSON.stringify(answers).length>8000)return res.status(400).json({error:"بيانات التقديم غير صحيحة"});const q=await pool.query("INSERT INTO applications(username,discord_username,type,answers) VALUES($1,$2,$3,$4) RETURNING id",[u.username,u.discordUsername,type,JSON.stringify(answers)]);await audit(u,"application_create",`#${q.rows[0].id} ${type}`);res.json({ok:true,id:q.rows[0].id});});
async function findGuildMemberByDiscordUsername(value){
  const wanted=String(value||"").trim().toLowerCase(); if(!wanted)return null;
  const guild=await getGuild(),members=await getAllMembers(guild);
  return members.find(m=>[m.user?.username,m.user?.globalName,m.displayName,m.user?.tag].filter(Boolean).some(x=>String(x).toLowerCase()===wanted||String(x).toLowerCase().split("#")[0]===wanted))||null;
}
async function getServerOwnerMember(){ const guild=await getGuild(); return guild.ownerId?guild.members.fetch(guild.ownerId).catch(()=>null):findGuildMemberByDiscordUsername(process.env.OWNER_DISCORD_USERNAME||process.env.OWNER_USERNAME||"w4px"); }
async function createServerGroupAssets(group){
  const guild=await getGuild();
  const me=guild.members.me||await guild.members.fetchMe();
  const perms=me.permissions;
  if(!perms.has(PermissionFlagsBits.ManageRoles))throw new Error("بوت الزاجل يحتاج صلاحية Manage Roles (إدارة الرتب)");
  if(!perms.has(PermissionFlagsBits.ManageChannels))throw new Error("بوت الزاجل يحتاج صلاحية Manage Channels (إدارة القنوات)");
  const role=await guild.roles.create({name:"MLD • "+group.name,reason:"اعتماد قروب MLD #"+group.id});
  try{
    const botHighest=me.roles.highest;
    if(botHighest&&botHighest.position>1)await role.setPosition(Math.max(1,botHighest.position-1),"ترتيب رتبة قروب MLD أسفل رتبة بوت الزاجل");
  }catch(e){try{await role.delete("فشل ترتيب رتبة القروب");}catch{};throw new Error("تعذر ترتيب رتبة القروب أسفل رتبة بوت الزاجل: "+e.message);}
  let channel;
  try{
    channel=await guild.channels.create({name:"mld-group-"+group.id,type:ChannelType.GuildText,topic:"روم قروب MLD #"+group.id,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:role.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]}],reason:"روم قروب MLD #"+group.id});
  }catch(e){try{await role.delete("فشل إنشاء روم القروب");}catch{};throw e;}
  const gc=await pool.query("INSERT INTO chat_conversations(kind,owner_username,title) VALUES('server_group',$1,$2) RETURNING id",[group.username,group.name]);
  await pool.query("UPDATE community_groups SET status='approved',discord_role_id=$1,discord_channel_id=$2,group_conversation_id=$3 WHERE id=$4",[role.id,channel.id,gc.rows[0].id,group.id]);
  await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[gc.rows[0].id,group.username]);
  const owner=await findGuildMemberByDiscordUsername(group.discord_username); if(owner)await owner.roles.add(role.id,"مالك قروب MLD");
  return {role,channel};
}
async function sendGroupCreateRequestDM(group){ const owner=await getServerOwnerMember(); if(!owner)throw new Error("تعذر العثور على أونر السيرفر"); await owner.send("🟣 طلب إنشاء قروب MLD\nالقروب: "+group.name+"\nالمالك: "+group.username+"\nرقم الطلب: "+group.id+"\nاكتب YES "+group.id+" للموافقة أو NO "+group.id+" للرفض."); }
async function sendGroupJoinRequestDM(ownerUsername,gid,name,applicant){ const ownerUser=await chatUser(ownerUsername); const owner=await findGuildMemberByDiscordUsername(ownerUser?.discord_username||ownerUsername); if(!owner)throw new Error("تعذر العثور على مالك القروب"); await owner.send("🟣 طلب انضمام لقروب MLD\nالقروب: "+name+"\nالمتقدم: "+applicant.username+"\nرقم القروب: "+gid+"\nاكتب YES JOIN "+gid+" "+applicant.username+" للموافقة أو NO JOIN "+gid+" "+applicant.username+" للرفض."); }
async function handleGroupDMApproval(message){
  if(message.guildId||message.author.bot)return false; const owner=await getServerOwnerMember(); if(!owner||message.author.id!==owner.id)return false; const text=String(message.content||"").trim(); let m=text.match(/^YES\s+(\d+)$/i);
  if(m){const q=await pool.query("SELECT * FROM community_groups WHERE id=$1 AND status='pending'",[Number(m[1])]); if(!q.rowCount){await message.reply("❌ الطلب غير موجود أو تمت معالجته.");return true;} try{await createServerGroupAssets(q.rows[0]);await message.reply("✅ تم اعتماد القروب وإنشاء الرول والروم.");}catch(e){console.error("group approval:",e);await message.reply("❌ تعذر إنشاء الرول والروم. تأكد من صلاحيات البوت.");} return true;}
  m=text.match(/^NO\s+(\d+)$/i); if(m){const q=await pool.query("UPDATE community_groups SET status='rejected' WHERE id=$1 AND status='pending' RETURNING name",[Number(m[1])]); await message.reply(q.rowCount?"❌ تم رفض طلب إنشاء القروب.":"❌ الطلب غير موجود أو تمت معالجته.");return true;}
  m=text.match(/^YES\s+JOIN\s+(\d+)\s+([a-z0-9_.-]{3,32})$/i); if(m){const gid=Number(m[1]),username=m[2].toLowerCase();const g=await pool.query("SELECT * FROM community_groups WHERE id=$1 AND status='approved'",[gid]);const rq=await pool.query("SELECT id,discord_username FROM group_join_requests WHERE group_id=$1 AND username=$2 AND status='pending'",[gid,username]);if(!g.rowCount||!rq.rowCount){await message.reply("❌ طلب الانضمام غير موجود أو تمت معالجته.");return true;}await pool.query("UPDATE group_join_requests SET status='approved' WHERE id=$1",[rq.rows[0].id]);await pool.query("INSERT INTO group_members(group_id,username,discord_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[gid,username,rq.rows[0].discord_username]);const gc=await pool.query("SELECT group_conversation_id FROM community_groups WHERE id=$1",[gid]);if(gc.rows[0]?.group_conversation_id)await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[gc.rows[0].group_conversation_id,username]);const gr=await pool.query("SELECT discord_role_id,name FROM community_groups WHERE id=$1",[gid]);const gm=await findGuildMemberByDiscordUsername(rq.rows[0].discord_username);if(gm&&gr.rows[0]?.discord_role_id){try{await gm.roles.add(gr.rows[0].discord_role_id,"تم قبولك في القروب "+gr.rows[0].name);}catch(e){console.error("group DM role:",e.message);}}try{const member=await findGuildMemberByDiscordUsername(rq.rows[0].discord_username);if(member&&g.rows[0].discord_role_id)await member.roles.add(g.rows[0].discord_role_id,"قبول طلب الانضمام لقروب MLD");if(g.rows[0].group_conversation_id)await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[g.rows[0].group_conversation_id,username]);await message.reply("✅ تمت الموافقة وإعطاء الرول.");}catch(e){await message.reply("⚠️ تم تسجيل العضوية لكن تعذر إعطاء الرول.");}return true;}
  m=text.match(/^NO\s+JOIN\s+(\d+)\s+([a-z0-9_.-]{3,32})$/i); if(m){const q=await pool.query("UPDATE group_join_requests SET status='rejected' WHERE group_id=$1 AND username=$2 AND status='pending' RETURNING id",[Number(m[1]),m[2].toLowerCase()]);await message.reply(q.rowCount?"❌ تم رفض الطلب.":"❌ الطلب غير موجود أو تمت معالجته.");return true;} return false;
}
app.get("/api/groups",async(req,res)=>{
  const q=await pool.query(`
    SELECT g.id,g.name,g.description,g.username AS owner_username,g.discord_username AS owner_discord_username,g.status,g.discord_role_id,g.discord_channel_id,g.group_conversation_id,g.created_at,
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
  if(status==="approved"){await pool.query("INSERT INTO group_members(group_id,username,discord_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[gid,rq.rows[0].username,rq.rows[0].discord_username]);const gc=await pool.query("SELECT group_conversation_id FROM community_groups WHERE id=$1",[gid]);if(gc.rows[0]?.group_conversation_id)await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[gc.rows[0].group_conversation_id,rq.rows[0].username]);const gm=await findGuildMemberByDiscordUsername(rq.rows[0].discord_username);const gr=await pool.query("SELECT discord_role_id,name FROM community_groups WHERE id=$1",[gid]);if(gm&&gr.rows[0]?.discord_role_id){try{await gm.roles.add(gr.rows[0].discord_role_id,"تم قبولك في القروب "+gr.rows[0].name);}catch(e){console.error("group member role:",e.message);}}}
  await audit(u,"group_join_request_update",`#${gid} request #${rid} => ${status}`);
  res.json({ok:true});
});
app.post("/api/groups/:id/members",requireAuth,async(req,res)=>{const gid=Number(req.params.id),u=req.session.user.username,t=String(req.body?.username||"").trim().toLowerCase();const g=await pool.query("SELECT username,group_conversation_id FROM community_groups WHERE id=$1",[gid]);if(!g.rowCount)return res.status(404).json({error:"القروب غير موجود"});if(g.rows[0].username!==u)return res.status(403).json({error:"مالك القروب فقط يقدر يضيف أعضاء"});const tu=await chatUser(t);if(!tu)return res.status(404).json({error:"المستخدم غير موجود"});await pool.query("INSERT INTO group_members(group_id,username,discord_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[gid,t,tu.discord_username||""]);if(g.rows[0].group_conversation_id)await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[g.rows[0].group_conversation_id,t]);await audit(req.session.user,"group_member_add","group #"+gid+" + "+t);res.json({ok:true});});
app.delete("/api/groups/:id/members/:username",requireAuth,async(req,res)=>{const gid=Number(req.params.id),u=req.session.user.username,t=String(req.params.username||"").trim().toLowerCase();const g=await pool.query("SELECT username,group_conversation_id FROM community_groups WHERE id=$1",[gid]);if(!g.rowCount)return res.status(404).json({error:"القروب غير موجود"});if(g.rows[0].username!==u)return res.status(403).json({error:"مالك القروب فقط يقدر يطرد عضو"});if(t===u)return res.status(400).json({error:"مالك القروب لا يطرد نفسه"});await pool.query("DELETE FROM group_members WHERE group_id=$1 AND username=$2",[gid,t]);if(g.rows[0].group_conversation_id)await pool.query("DELETE FROM chat_participants WHERE conversation_id=$1 AND username=$2",[g.rows[0].group_conversation_id,t]);await audit(req.session.user,"group_member_remove","group #"+gid+" - "+t);res.json({ok:true});});
app.post("/api/groups",requireAuth,async(req,res)=>{
  const name=String(req.body?.name||"").trim(),description=String(req.body?.description||"").trim(),u=req.session.user;
  if(name.length<2||name.length>60||description.length>240)return res.status(400).json({error:"بيانات القروب غير صحيحة"});
  const q=await pool.query("INSERT INTO community_groups(username,discord_username,name,description,status) VALUES($1,$2,$3,$4,'pending') RETURNING *",[u.username,u.discordUsername,name,description]);
  await pool.query("INSERT INTO group_members(group_id,username,discord_username) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[q.rows[0].id,u.username,u.discordUsername]);
  await audit(u,"group_create_request","#"+q.rows[0].id+" "+name);
  await sendGroupCreateRequestDM(q.rows[0]).catch(e=>console.error("group create DM:",e.message));
  res.json({ok:true,pending:true,group:q.rows[0]});
});
app.delete("/api/groups/:id",requireAuth,async(req,res)=>{await pool.query("DELETE FROM community_groups WHERE id=$1 AND username=$2",[req.params.id,req.session.user.username]);res.json({ok:true});});
app.get("/api/owner/groups",requireOwner,async(req,res)=>{try{const q=await pool.query("SELECT id,name,description,username,discord_username,status,discord_role_id,discord_channel_id,created_at FROM community_groups ORDER BY id DESC LIMIT 300");res.json({groups:q.rows});}catch(e){res.status(500).json({error:"تعذر تحميل القروبات"});}});
app.post("/api/owner/groups/:id/status",requireOwner,async(req,res)=>{try{const id=Number(req.params.id),status=String(req.body?.status||"").toLowerCase();if(!["approved","rejected"].includes(status))return res.status(400).json({error:"حالة غير صحيحة"});const q=await pool.query("SELECT * FROM community_groups WHERE id=$1",[id]);if(!q.rowCount)return res.status(404).json({error:"القروب غير موجود"});const g=q.rows[0];if(status==="rejected"){await pool.query("UPDATE community_groups SET status='rejected' WHERE id=$1",[id]);await audit(req.session.user,"group_status","#"+id+" => rejected");return res.json({ok:true,status:"rejected"});}if(g.status==="approved"&&g.discord_role_id)return res.json({ok:true,status:"approved",alreadyProvisioned:true});const assets=await createServerGroupAssets(g);await audit(req.session.user,"group_status","#"+id+" => approved · role="+assets.role.id+" · channel="+assets.channel.id);res.json({ok:true,status:"approved",roleId:assets.role.id,channelId:assets.channel.id});}catch(e){console.error("Owner group approval:",e);res.status(500).json({error:"تعذر اعتماد القروب وإنشاء الرول والروم عبر بوت الزاجل: "+(e.message||"خطأ غير معروف")});}});
app.delete("/api/owner/groups/:id",requireOwner,async(req,res)=>{try{const id=Number(req.params.id);const q=await pool.query("SELECT * FROM community_groups WHERE id=$1",[id]);if(!q.rowCount)return res.status(404).json({error:"القروب غير موجود"});const g=q.rows[0];const guild=await getGuild();if(g.discord_channel_id){try{const ch=await guild.channels.fetch(g.discord_channel_id);if(ch)await ch.delete("حذف قروب MLD بواسطة الأونر");}catch(e){console.warn("Group channel delete:",e.message)}}if(g.discord_role_id){try{const role=await guild.roles.fetch(g.discord_role_id);if(role)await role.delete("حذف قروب MLD بواسطة الأونر");}catch(e){console.warn("Group role delete:",e.message)}}if(g.group_conversation_id)await pool.query("DELETE FROM chat_participants WHERE conversation_id=$1",[g.group_conversation_id]).catch(()=>{});await pool.query("DELETE FROM community_groups WHERE id=$1",[id]);await audit(req.session.user,"group_delete","#"+id+" "+g.name);res.json({ok:true});}catch(e){console.error("Owner group delete:",e);res.status(500).json({error:"تعذر حذف القروب: "+(e.message||"خطأ غير معروف")});}});
app.get("/api/owner/logs/groups",requireOwner,async(req,res)=>{try{const q=await pool.query("SELECT id,username,discord_username,action,details,created_at FROM audit_logs WHERE action LIKE 'group_%' OR action LIKE 'owner_group_%' ORDER BY created_at DESC LIMIT 500");res.json({logs:q.rows});}catch(e){res.status(500).json({error:"تعذر تحميل لوق القروبات"});}});
app.get("/api/owner/anonymous/logs",requireOwner,async(req,res)=>{const q=await pool.query("SELECT p.id,p.created_at,p.body,(SELECT COUNT(*) FROM anonymous_replies r WHERE r.post_id=p.id) replies FROM anonymous_posts p ORDER BY p.id DESC LIMIT 300");res.json({posts:q.rows});});
app.delete("/api/owner/anonymous/:id",requireOwner,async(req,res)=>{const id=Number(req.params.id);await pool.query("DELETE FROM anonymous_posts WHERE id=$1",[id]);await audit(req.session.user,"anonymous_post_delete","#"+id);res.json({ok:true});});
app.get("/api/anonymous",async(req,res)=>{const q=await pool.query("SELECT p.id,p.body,p.created_at,COALESCE((SELECT json_agg(json_build_object('id',r.id,'body',r.body,'created_at',r.created_at) ORDER BY r.id) FROM anonymous_replies r WHERE r.post_id=p.id),'[]'::json) replies FROM anonymous_posts p ORDER BY p.id DESC LIMIT 100");res.json({posts:q.rows});});
app.post("/api/anonymous",requireAuth,writeLimiter,async(req,res)=>{const body=String(req.body?.body||"").trim();if(body.length<1||body.length>2000)return res.status(400).json({error:"الفضفضة يجب أن تكون بين 1 و2000 حرف"});const q=await pool.query("INSERT INTO anonymous_posts(author_username,body) VALUES($1,$2) RETURNING id,created_at",[req.session.user.username,body]);await audit(req.session.user,"anonymous_post_create","#"+q.rows[0].id);res.json({ok:true,post:q.rows[0]});});
app.post("/api/anonymous/:id/replies",requireAuth,writeLimiter,async(req,res)=>{const body=String(req.body?.body||"").trim(),id=Number(req.params.id);if(body.length<1||body.length>2000)return res.status(400).json({error:"الرد غير صحيح"});const q=await pool.query("SELECT id FROM anonymous_posts WHERE id=$1",[id]);if(!q.rowCount)return res.status(404).json({error:"الفضفضة غير موجودة"});const r=await pool.query("INSERT INTO anonymous_replies(post_id,author_username,body) VALUES($1,$2,$3) RETURNING id,created_at",[id,req.session.user.username,body]);await audit(req.session.user,"anonymous_reply_create","#"+id);res.json({ok:true,reply:r.rows[0]});});
app.get("/api/owner/chat/conversations",requireOwner,async(req,res)=>{const q=await pool.query("SELECT c.id,c.kind,c.owner_username,c.title,c.updated_at,(SELECT COUNT(*) FROM chat_participants p WHERE p.conversation_id=c.id) participants,(SELECT body FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message FROM chat_conversations c WHERE c.kind IN ('dm','private_group') ORDER BY c.updated_at DESC LIMIT 200");res.json({conversations:q.rows.map(x=>({...x,id:Number(x.id),participants:Number(x.participants)}))});});
app.get("/api/owner/chat/conversations/:id",requireOwner,async(req,res)=>{const q=await pool.query("SELECT m.id,m.sender_username,m.body,m.created_at,COALESCE(p.display_name,m.sender_username) display_name FROM chat_messages m LEFT JOIN chat_profiles p ON p.username=m.sender_username WHERE m.conversation_id=$1 ORDER BY m.id ASC LIMIT 500",[Number(req.params.id)]);res.json({messages:q.rows});});
app.get("/api/owner/logs",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,action,details,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 300");res.json({logs:q.rows});});
app.get("/api/owner/logs/zajel",requireOwner,async(req,res)=>{try{
  const q=await pool.query("SELECT id,username,discord_username,action,details,created_at FROM audit_logs WHERE action IN ('dm_send','admin_dm_send','zajel_private_message') ORDER BY created_at DESC LIMIT 500");
  const logs=q.rows.map(x=>{
    const details=String(x.details||"");
    const recipient=(details.match(/إلى Discord ID ([0-9]+)/)||[])[1]||((details.match(/(?:إلى|المستلم)\\s+([^·]+)/)||[])[1]||"غير محدد").trim();
    const body=(details.match(/النص: ([\\s\\S]*)$/)||[])[1]||((details.match(/conversation #[0-9]+ · ([\\s\\S]*)$/)||[])[1]||"");
    const type=x.action==="zajel_private_message"?"رسالة زاجل داخلية":"رسالة زاجل عبر Discord";
    return {...x,recipient,body,type};
  });
  res.json({logs});
}catch(e){console.error("Zajel logs:",e);res.status(500).json({error:"تعذر تحميل لوق الزاجل"});}});
app.get("/api/owner/tickets",requireAdmin,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,subject,message,status,created_at FROM tickets ORDER BY id DESC LIMIT 100");res.json({tickets:q.rows});});
app.get("/api/owner/tickets/:id/messages",requireAdmin,async(req,res)=>{
  try{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"رقم التيكت غير صحيح"});
    const t=await pool.query("SELECT id,username,discord_username,subject,message,status,created_at FROM tickets WHERE id=$1",[id]);
    if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
    const q=await pool.query("SELECT id,username,discord_username,message,created_at FROM ticket_messages WHERE ticket_id=$1 ORDER BY id ASC",[id]);
    res.json({ticket:t.rows[0],messages:q.rows});
  }catch(e){console.error("Admin ticket messages:",e);res.status(500).json({error:"تعذر تحميل محادثة التيكت"});}
});
app.post("/api/owner/tickets/:id/messages",requireAdmin,writeLimiter,async(req,res)=>{
  try{
    const id=Number(req.params.id),message=String(req.body?.message||"").trim(),u=req.session.user;
    if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"رقم التيكت غير صحيح"});
    if(message.length<1||message.length>3000)return res.status(400).json({error:"الرسالة غير صحيحة"});
    const t=await pool.query("SELECT id,username,status FROM tickets WHERE id=$1",[id]);
    if(!t.rowCount)return res.status(404).json({error:"التيكت غير موجود"});
    if(t.rows[0].status==="closed")return res.status(400).json({error:"التيكت مغلق. أعد فتحه أولًا ثم أرسل الرد."});
    const q=await pool.query("INSERT INTO ticket_messages(ticket_id,username,discord_username,message) VALUES($1,$2,$3,$4) RETURNING id,created_at",[id,u.username,u.discordUsername,message]);
    await audit(u,"ticket_admin_reply",`#${id} ${message.slice(0,120)}`);
    res.json({ok:true,message:{id:q.rows[0].id,username:u.username,discord_username:u.discordUsername,message,created_at:q.rows[0].created_at}});
  }catch(e){console.error("Admin ticket reply:",e);res.status(500).json({error:"تعذر إرسال رد الإدارة"});}
});

app.get("/api/owner/applications",requireAdmin,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,type,answers,status,created_at FROM applications ORDER BY id DESC LIMIT 100");res.json({applications:q.rows});});
app.post("/api/owner/applications/:id/status",requireAdmin,async(req,res)=>{
  try{
    const status=String(req.body?.status||"").toLowerCase(),id=Number(req.params.id);
    if(!["pending","approved","rejected"].includes(status))return res.status(400).json({error:"حالة غير صحيحة"});
    const q=await pool.query("SELECT * FROM applications WHERE id=$1",[id]);
    if(!q.rowCount)return res.status(404).json({error:"التقديم غير موجود"});
    const appRow=q.rows[0];

    if(status==="approved"){
      let member=null;const au=await pool.query("SELECT discord_user_id,discord_username FROM app_users WHERE username=$1",[appRow.username]);const did=au.rows[0]?.discord_user_id;if(did){try{member=await (await getGuild()).members.fetch(did)}catch{}}if(!member)member=await findGuildMemberByUsername(appRow.discord_username);
      if(!member)return res.status(400).json({error:"صاحب التقديم لم يعد داخل السيرفر أو لم يتم ربط Discord بالحساب"});
      const guild=await getGuild();
      const roles=[];for(const rid of leadershipRoleIds){try{const rr=guild.roles.cache.get(rid)||await guild.roles.fetch(rid).catch(()=>null);if(rr)roles.push(rr)}catch{}}roles.sort((a,b)=>a.position-b.position);
      const adminRole=roles[0];
      if(!adminRole)return res.status(500).json({error:"لم يتم العثور على رتبة الإدارة الأدنى"});
      let roleError="";
      try{ await member.roles.add(adminRole.id,"قبول التقديم من إدارة MLD"); }catch(e){ roleError=e.message; console.error("Application role grant:",e.message); }
      await pool.query("UPDATE app_users SET role=CASE WHEN role='owner' THEN role ELSE 'admin' END,discord_username=$2,discord_user_id=$3 WHERE username=$1",[appRow.username,member.user.username,member.user.id]);
      try{await member.send({embeds:[new EmbedBuilder().setTitle("🎉 تم قبول تقديمك في MLD").setDescription("تم قبول تقديمك بنجاح.\n\nتم تحديث صلاحية حسابك إلى الإدارة."+ (roleError?"\nملاحظة: تعذر إعطاء رتبة Discord تلقائيًا وسيحتاج الأونر لإعطائها يدويًا.":"\nتمت إضافة رتبة الإدارة في السيرفر.") +"\nحساب الموقع: **"+appRow.username+"**\nDiscord: **"+member.user.username+"**").setColor("#8b5cf6").setTimestamp()]});}catch{}
    }else if(status==="rejected"){
      const member=await findGuildMemberByUsername(appRow.discord_username).catch(()=>null);
      if(member){try{await member.send({embeds:[new EmbedBuilder().setTitle("MLD — نتيجة التقديم").setDescription("تم رفض تقديمك حاليًا. يمكنك التقديم مرة أخرى لاحقًا.").setColor("#ef4444").setTimestamp()]});}catch{}}
    }
    const updated=await pool.query("UPDATE applications SET status=$1 WHERE id=$2 RETURNING id,status",[status,id]);
    await audit(req.session.user,"application_status","#"+id+" => "+status+" · الموقع="+appRow.username+" · Discord="+appRow.discord_username);
    res.json({ok:true,application:updated.rows[0]});
  }catch(e){console.error("Application status:",e);res.status(500).json({error:"تعذر تحديث التقديم: "+(e.message||"خطأ غير معروف")});}
});


// OWNER FULL CONTROL — destructive actions are owner-only and audited.
app.get("/api/owner/groups",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,name,description,username,discord_username,status,created_at FROM community_groups ORDER BY id DESC LIMIT 300");res.json({groups:q.rows});});
app.get("/api/owner/group-requests",requireOwner,async(req,res)=>{const q=await pool.query("SELECT r.id,r.group_id,r.username,r.discord_username,r.status,r.created_at,g.name AS group_name FROM group_join_requests r JOIN community_groups g ON g.id=r.group_id ORDER BY r.id DESC LIMIT 300");res.json({requests:q.rows});});
app.get("/api/owner/reviews",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,rating,message,status,created_at FROM reviews ORDER BY id DESC LIMIT 200");res.json({reviews:q.rows});});
app.delete("/api/owner/applications/:id",requireOwner,async(req,res)=>{const id=Number(req.params.id);const q=await pool.query("DELETE FROM applications WHERE id=$1 RETURNING id",[id]);if(!q.rowCount)return res.status(404).json({error:"التقديم غير موجود"});await audit(req.session.user,"application_delete","#"+id);res.json({ok:true});});
app.delete("/api/owner/tickets/:id",requireOwner,async(req,res)=>{const id=Number(req.params.id);const q=await pool.query("DELETE FROM tickets WHERE id=$1 RETURNING id",[id]);if(!q.rowCount)return res.status(404).json({error:"التيكت غير موجود"});await audit(req.session.user,"ticket_delete","#"+id);res.json({ok:true});});
app.delete("/api/owner/groups/:id",requireOwner,async(req,res)=>{
  const id=Number(req.params.id),g=await pool.query("SELECT * FROM community_groups WHERE id=$1",[id]);
  if(!g.rowCount)return res.status(404).json({error:"القروب غير موجود"});
  const row=g.rows[0];
  if(row.group_conversation_id){await pool.query("DELETE FROM chat_messages WHERE conversation_id=$1",[row.group_conversation_id]).catch(()=>{});await pool.query("DELETE FROM chat_participants WHERE conversation_id=$1",[row.group_conversation_id]).catch(()=>{});await pool.query("DELETE FROM chat_conversations WHERE id=$1",[row.group_conversation_id]).catch(()=>{});}
  if(row.discord_role_id){try{const guild=await getGuild();const role=guild.roles.cache.get(row.discord_role_id)||await guild.roles.fetch(row.discord_role_id).catch(()=>null);if(role)await role.delete("حذف قروب MLD بواسطة الأونر");}catch(e){console.error("group role delete:",e.message);}}
  if(row.discord_channel_id){try{const guild=await getGuild();const ch=guild.channels.cache.get(row.discord_channel_id)||await guild.channels.fetch(row.discord_channel_id).catch(()=>null);if(ch)await ch.delete("حذف قروب MLD بواسطة الأونر");}catch(e){console.error("group channel delete:",e.message);}}
  await pool.query("DELETE FROM community_groups WHERE id=$1",[id]);await audit(req.session.user,"group_delete","#"+id+" "+row.name);res.json({ok:true});
});
app.delete("/api/owner/group-requests/:id",requireOwner,async(req,res)=>{const id=Number(req.params.id);const q=await pool.query("DELETE FROM group_join_requests WHERE id=$1 RETURNING id,group_id,username",[id]);if(!q.rowCount)return res.status(404).json({error:"طلب القروب غير موجود"});await audit(req.session.user,"group_request_delete","#"+id);res.json({ok:true});});
app.delete("/api/owner/reviews/:id",requireOwner,async(req,res)=>{const id=Number(req.params.id);const q=await pool.query("DELETE FROM reviews WHERE id=$1 RETURNING id",[id]);if(!q.rowCount)return res.status(404).json({error:"الرأي غير موجود"});await audit(req.session.user,"review_delete","#"+id);res.json({ok:true});});
app.get("/api/reviews",async(req,res)=>{const q=await pool.query("SELECT id,username,rating,message,is_demo,created_at FROM reviews WHERE status='visible' ORDER BY id DESC LIMIT 100");res.set("Cache-Control","no-store");res.json({reviews:q.rows});});
app.post("/api/reviews",async(req,res)=>{const u=req.session.user||null,message=String(req.body?.message||"").trim(),rating=Math.max(1,Math.min(5,Number(req.body?.rating)||5));if(message.length<3||message.length>1000)return res.status(400).json({error:"الرأي يجب أن يكون بين 3 و1000 حرف"});const username=u?.username||"زائر",discordUsername=u?.discordUsername||"غير مسجل";const q=await pool.query("INSERT INTO reviews(username,discord_username,rating,message,text,is_demo) VALUES($1,$2,$3,$4,$4,false) RETURNING id",[username,discordUsername,rating,message]);if(u)await audit(u,"review_create",`#${q.rows[0].id}`);res.json({ok:true,id:q.rows[0].id});});
app.get("/api/announcements",async(req,res)=>{const q=await pool.query("SELECT id,text,link FROM announcements WHERE active=true ORDER BY id DESC LIMIT 5");res.json({announcements:q.rows});});
app.post("/api/owner/users/:id/ban",requireOwner,async(req,res)=>{const banned=!!req.body?.banned,id=Number(req.params.id);const q=await pool.query("UPDATE app_users SET banned=$1 WHERE id=$2 AND role<>$3 RETURNING id,username,banned",[banned,id,"owner"]);if(!q.rowCount)return res.status(404).json({error:"الحساب غير موجود أو لا يمكن حظر الأونر"});await audit(req.session.user,banned?"account_ban":"account_unban",q.rows[0].username);res.json({ok:true,user:q.rows[0]});});
app.delete("/api/owner/users/:id",requireOwner,async(req,res)=>{const id=Number(req.params.id),u=await pool.query("SELECT username,role FROM app_users WHERE id=$1",[id]);if(!u.rowCount||u.rows[0].role==="owner")return res.status(404).json({error:"الحساب غير موجود أو لا يمكن حذف الأونر"});const username=u.rows[0].username,c=await pool.connect();try{await c.query("BEGIN");await c.query("DELETE FROM registration_verifications WHERE username=$1 OR discord_user_id IN (SELECT discord_user_id FROM app_users WHERE username=$1)",[username]);await c.query("DELETE FROM password_resets WHERE username=$1",[username]);await c.query("DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE username=$1)",[username]);await c.query("DELETE FROM tickets WHERE username=$1",[username]);await c.query("DELETE FROM applications WHERE username=$1",[username]);await c.query("DELETE FROM group_join_requests WHERE username=$1",[username]);await c.query("DELETE FROM group_members WHERE username=$1",[username]);await c.query("DELETE FROM community_groups WHERE username=$1",[username]);await c.query("DELETE FROM reviews WHERE username=$1",[username]);await c.query("DELETE FROM anonymous_replies WHERE author_username=$1",[username]);await c.query("DELETE FROM anonymous_posts WHERE author_username=$1",[username]);await c.query("DELETE FROM audit_logs WHERE username=$1",[username]);await c.query("DELETE FROM chat_public_mutes WHERE username=$1 OR muted_by=$1",[username]);await c.query("DELETE FROM chat_blocks WHERE blocker_username=$1 OR blocked_username=$1",[username]);await c.query("DELETE FROM chat_messages WHERE sender_username=$1",[username]);await c.query("DELETE FROM chat_conversations WHERE owner_username=$1",[username]);await c.query("DELETE FROM chat_profiles WHERE username=$1",[username]);await c.query("DELETE FROM user_sessions WHERE sess->'user'->>'username'=$1",[username]).catch(()=>{});await c.query("DELETE FROM app_users WHERE username=$1",[username]);await c.query("COMMIT");await audit(req.session.user,"account_delete",username);res.json({ok:true})}catch(e){await c.query("ROLLBACK");console.error("Owner account delete:",e);res.status(500).json({error:"تعذر حذف الحساب بالكامل"})}finally{c.release()}});
app.get("/api/owner/logs/deleted-messages",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,details,created_at FROM audit_logs WHERE action='message_deleted_for_everyone' ORDER BY id DESC LIMIT 500");res.json({logs:q.rows})});
app.get("/api/owner/users",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,role,created_at,last_login_at FROM app_users ORDER BY id DESC LIMIT 300");res.json({users:q.rows});});
app.get("/api/owner/users/:username/messages",requireOwner,async(req,res)=>{
  const username=String(req.params.username||"").trim().toLowerCase();
  if(!username)return res.status(400).json({error:"الحساب غير صحيح"});
  const q=await pool.query("SELECT m.id,m.sender_username,m.body,m.created_at,c.id AS conversation_id,c.title,COALESCE(p.display_name,m.sender_username) AS display_name,COALESCE(p.avatar_url,'') AS avatar_url FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id JOIN chat_participants cp ON cp.conversation_id=c.id AND cp.username=$1 LEFT JOIN chat_profiles p ON p.username=m.sender_username WHERE c.kind='dm' AND m.deleted_at IS NULL ORDER BY m.id ASC LIMIT 1000",[username]);
  res.json({messages:q.rows});
});
app.post("/api/owner/users/:id/role",requireOwner,async(req,res)=>{const role=String(req.body?.role||"user");if(!["user","admin","owner"].includes(role))return res.status(400).json({error:"صلاحية غير صحيحة"});const q=await pool.query("UPDATE app_users SET role=$1 WHERE id=$2 RETURNING username,role",[role,req.params.id]);if(!q.rowCount)return res.status(404).json({error:"الحساب غير موجود"});await audit(req.session.user,"user_role_change",`${q.rows[0].username} => ${role}`);res.json({ok:true,user:q.rows[0]});});
app.get("/api/owner/application-questions",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,label,key,type,required,position,active FROM application_questions WHERE active=true ORDER BY position,id");res.json({questions:q.rows});});
app.post("/api/owner/application-questions",requireOwner,async(req,res)=>{const label=String(req.body?.label||"").trim();if(label.length<2||label.length>180)return res.status(400).json({error:"السؤال غير صحيح"});const key="q_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);const p=await pool.query("SELECT COALESCE(MAX(position),0)+1 AS n FROM application_questions");const q=await pool.query("INSERT INTO application_questions(label,key,position) VALUES($1,$2,$3) RETURNING *",[label,key,p.rows[0].n]);await audit(req.session.user,"application_question_create",label);res.json({ok:true,question:q.rows[0]});});
app.delete("/api/owner/application-questions/:id",requireOwner,async(req,res)=>{const q=await pool.query("UPDATE application_questions SET active=false WHERE id=$1 RETURNING id",[req.params.id]);if(!q.rowCount)return res.status(404).json({error:"السؤال غير موجود"});await audit(req.session.user,"application_question_delete",String(req.params.id));res.json({ok:true});});
app.get("/api/owner/reviews",requireOwner,async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,rating,message,status,created_at FROM reviews ORDER BY id DESC LIMIT 200");res.json({reviews:q.rows});});
app.delete("/api/owner/reviews/:id",requireOwner,async(req,res)=>{await pool.query("DELETE FROM reviews WHERE id=$1",[req.params.id]);await audit(req.session.user,"review_delete",`#${req.params.id}`);res.json({ok:true});});
app.post("/api/owner/announcements",requireOwner,async(req,res)=>{const text=String(req.body?.text||"").trim(),link=String(req.body?.link||"").trim();if(text.length<2||text.length>300)return res.status(400).json({error:"الإعلان يجب أن يكون بين 2 و300 حرف"});const q=await pool.query("INSERT INTO announcements(text,link) VALUES($1,$2) RETURNING *",[text,link]);await audit(req.session.user,"announcement_create",text);res.json({ok:true,announcement:q.rows[0]});});
app.delete("/api/owner/announcements/:id",requireOwner,async(req,res)=>{await pool.query("DELETE FROM announcements WHERE id=$1",[req.params.id]);await audit(req.session.user,"announcement_delete",`#${req.params.id}`);res.json({ok:true});});
app.post("/api/owner/broadcast",requireOwner,async(req,res)=>{
  const message=String(req.body?.message||"").trim();
  if(message.length<1||message.length>2000)return res.status(400).json({error:"الرسالة يجب أن تكون بين 1 و2000 حرف"});
  try{
    const guild=await getGuild();
    const members=await getAllMembers(guild);
    const targets=members.filter(m=>m?.user && !m.user.bot && m.user.id!==client.user?.id);
    let sent=0,failed=0;
    const failures=[];
    const worker=async()=>{
      while(true){
        const member=targets.shift();
        if(!member)break;
        try{ await member.send({content:message}); sent++; }
        catch(error){ failed++; if(failures.length<100) failures.push({id:member.id,username:member.user?.username||member.displayName||"عضو",reason:String(error?.message||"تعذر الإرسال").slice(0,180)}); }
      }
    };
    await Promise.all(Array.from({length:Math.min(4,Math.max(1,targets.length))},()=>worker()));
    await audit(req.session.user,"owner_broadcast","sent="+sent+" failed="+failed+" total="+(sent+failed));
    res.json({ok:true,total:sent+failed,sent,failed,failures});
  }catch(error){ console.error("owner broadcast failed",error); res.status(500).json({error:"تعذر تجهيز الإرسال الجماعي حاليًا"}); }
});



app.get("/api/public/server", async (req, res) => {
  try {
    if(publicServerCache && Date.now()-publicServerCacheAt<5000) return res.json({...publicServerCache,cached:true});
    const guild = await getGuild();
    publicServerCache={id:guild.id,name:guild.name,icon:guild.iconURL({extension:"png",size:256}),memberCount:guild.memberCount,ownerName:process.env.SERVER_FOUNDER_NAME||"فهد المطيري",invite:process.env.DISCORD_INVITE_URL||""};
    publicServerCacheAt=Date.now();
    res.json({...publicServerCache,cached:false});
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
          const username=String(member.user.username||"").toLocaleLowerCase("ar");
          const globalName=String(member.user.globalName||"").toLocaleLowerCase("ar");
          const displayName=String(member.displayName||"").toLocaleLowerCase("ar");
          const tag=String(member.user.tag||"").toLocaleLowerCase("ar");
          const id=String(member.id||"");
          return username.includes(cleanQuery)||globalName.includes(cleanQuery)||displayName.includes(cleanQuery)||tag.includes(cleanQuery)||id===cleanQuery;
        })
      : allMembers;

    const resultLimit=cleanQuery ? Math.min(Number(req.query.limit) || 8, 8) : filtered.length;
    const ranked=[...filtered].sort((a,b)=>{
      const aq=String(a.user.username||"").toLocaleLowerCase("ar"), bq=String(b.user.username||"").toLocaleLowerCase("ar");
      const as=aq===cleanQuery?0:aq.startsWith(cleanQuery)?1:2, bs=bq===cleanQuery?0:bq.startsWith(cleanQuery)?1:2;
      if(as!==bs)return as-bs;
      return (b.roles.cache.filter(r=>leadershipRoleSet.has(r.id)).sort((x,y)=>y.position-x.position).first()?.position||0)-(a.roles.cache.filter(r=>leadershipRoleSet.has(r.id)).sort((x,y)=>y.position-x.position).first()?.position||0);
    }).slice(0,resultLimit).map(memberJson);
    res.json({
      members: ranked,
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
    if(publicRolesCache && Date.now()-publicRolesCacheAt<30000) return res.json({roles:publicRolesCache,updatedAt:memberSnapshotAt,cached:true});
    const guild = await getGuild();
    const allMembers = await getAllMembers(guild);
    const roles = leadershipRoleIds
      .map((id) => guild.roles.cache.get(id))
      .filter(Boolean)
      .map((role) => roleJson(role, role.members?.size ?? allMembers.reduce((total,member)=>total+(member.roles.cache.has(role.id)?1:0),0)));
    publicRolesCache=roles;
    publicRolesCacheAt=Date.now();
    res.json({ roles, updatedAt: memberSnapshotAt, cached:false });
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
    if(publicTopCache && Date.now()-publicTopCacheAt<5000) return res.json({...publicTopCache,cached:true});
    const members=(await getAllMembers(await getGuild())).map(memberJson);
    const top=(key)=>[...members].sort((a,b)=>(b.stats[key]||0)-(a.stats[key]||0)).slice(0,10);
    const gameQ=await pool.query("SELECT owner_username username,COUNT(*)::int wins FROM game_sessions WHERE status='ended' GROUP BY owner_username ORDER BY wins DESC LIMIT 10");
    const gameTop=gameQ.rows.map(x=>({...x,points:Number(x.wins)*10}));
    publicTopCache={messages:top("messages"),mentions:top("mentionsReceived"),voice:top("voiceMinutes"),joins:top("voiceJoins"),gameTop,updatedAt:memberSnapshotAt}; publicTopCacheAt=Date.now();
    res.json({...publicTopCache,cached:false});
  } catch(error){console.error("Top endpoint:",error);res.status(503).json({error:"Top is temporarily unavailable"});}
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

app.post("/api/admin/message",requireAdmin,async (req,res) => {
  const now=Date.now(), ip=req.ip||"unknown", last=sendHits.get("admin:"+ip)||0, u=req.session.user;
  if(now-last<10_000)return res.status(429).json({error:"انتظر 10 ثواني قبل الإرسال مرة أخرى"});
  const title=String(req.body?.title||"رسالة من إدارة MLD").trim(), text=String(req.body?.message||"").trim(), targetId=String(req.body?.memberId||"").trim();
  if(!targetId||!text||text.length>2000||title.length>120)return res.status(400).json({error:"بيانات الرسالة غير صحيحة"});
  try{
    const member=await (await getGuild()).members.fetch(targetId).catch(()=>null);
    if(!member)return res.status(404).json({error:"العضو غير موجود"});
    const embed=new EmbedBuilder().setTitle(title).setDescription("من إدارة MLD\n\n"+text).setColor("#ff9cdc").setFooter({text:"MLD Community"}).setTimestamp();
    await member.send({embeds:[embed]}); sendHits.set("admin:"+ip,now);
    await audit(u,"admin_dm_send","إلى Discord ID "+targetId+" · العنوان: "+title+" · النص: "+text);
    res.json({ok:true});
  }catch(error){console.error("Admin DM endpoint:",error);res.status(500).json({error:"تعذر الإرسال؛ قد يكون الخاص مقفلًا"});}
});

app.post("/api/public/message",requireAuth,async (req,res) => {
  const now = Date.now(), ip = req.ip || "unknown", last = sendHits.get(ip) || 0, u=req.session.user;
  if (now-last<10_000)return res.status(429).json({error:"انتظر 10 ثواني قبل الإرسال مرة أخرى"});
  const title=String(req.body?.title||"رسالة من إدارة MLD").trim(), text=String(req.body?.message||"").trim(), targetId=String(req.body?.memberId||"").trim(), senderMode=req.body?.senderMode==="show"?"show":"hide";
  if(!targetId||!text||text.length>2000||title.length>120)return res.status(400).json({error:"بيانات الرسالة غير صحيحة"});
  try{
    const member=await (await getGuild()).members.fetch(targetId).catch(()=>null);
    if(!member)return res.status(404).json({error:"العضو غير موجود"});
    const senderId=String(u.discordUserId||"").replace(/[^0-9]/g,"");
    const senderLine=senderMode==="show" && senderId ? `المرسل: <@${senderId}>` : "";
    const description=senderLine ? `${senderLine}\n\n${text}` : text;
    const embed=new EmbedBuilder().setTitle(title).setDescription(description).setColor("#ff9cdc").setFooter({text:"MLD Community"}).setTimestamp();
    await member.send({embeds:[embed]}); sendHits.set(ip,now);
    await audit(u,"dm_send",`إلى Discord ID ${targetId} · العنوان: ${title} · النص: ${text}`);
    res.json({ok:true});
  }catch(error){console.error("DM endpoint:",error);res.status(500).json({error:"تعذر الإرسال؛ قد يكون الخاص مقفلًا"});}
});
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const parts=String(interaction.customId||"").split(":");
  const action=parts[0], id=Number(parts[1]);
  if(!["register_v2_yes","register_v2_no"].includes(action)) return;
  if(!Number.isInteger(id)){
    return interaction.reply({content:"⚠️ طلب التسجيل غير صالح.",ephemeral:true}).catch(()=>{});
  }

  // Acknowledge the Discord interaction first. The database transaction is the source
  // of truth; editing the original Discord message is only presentation and can never
  // roll back a successful confirmation/cancellation.
  try{
    if(!interaction.deferred&&!interaction.replied) await interaction.deferUpdate();
  }catch(e){
    console.error("Registration interaction acknowledgement:",e.message);
    return;
  }

  let db;
  try{
    db=await pool.connect();
    await db.query("BEGIN");

    const q=await db.query(
      "SELECT * FROM registration_verifications WHERE id=$1 AND discord_user_id=$2 AND used_at IS NULL AND decision='pending' AND expires_at>NOW() AND (message_id IS NULL OR message_id=$3) FOR UPDATE",
      [id,interaction.user.id,String(interaction.message?.id||"")]
    );

    if(!q.rowCount){
      await db.query("ROLLBACK");
      // Never turn a Discord button failure into an ambiguous "session ended" state.
      // If the same request was already consumed, show its terminal decision and never create an account.
      const previous=await pool.query(
        "SELECT decision FROM registration_verifications WHERE id=$1 AND discord_user_id=$2 LIMIT 1",
        [id,interaction.user.id]
      ).catch(()=>({rowCount:0,rows:[]}));
      const decision=previous.rows?.[0]?.decision;
      const message=decision==="cancelled"
        ?"❌ تم إلغاء إنشاء الحساب مسبقًا. لم يتم إنشاء حساب."
        :decision==="confirmed"
          ?"✅ تم تأكيد إنشاء الحساب مسبقًا. لا يوجد حساب إضافي سيتم إنشاؤه."
          :"⚠️ طلب التأكيد غير صالح أو انتهت مدته. لم يتم إنشاء حساب من هذا الطلب.";
      await interaction.message.edit({content:message,embeds:[],components:[]}).catch(()=>{});
      return;
    }

    const v=q.rows[0];

    // NO is terminal and performs no app_users INSERT.
    if(action==="register_v2_no"){
      await db.query(
        "UPDATE registration_verifications SET used_at=NOW(),decision='cancelled' WHERE id=$1 AND used_at IS NULL AND decision='pending'",
        [id]
      );
      await db.query("COMMIT");

      await interaction.message.edit({content:"❌ تم إلغاء إنشاء الحساب. لم يتم إنشاء أي حساب.",embeds:[],components:[]}).catch(()=>{});
      await audit(
        {username:v.username,discordUsername:v.discord_username},
        "register_cancelled",
        "إلغاء طلب إنشاء الحساب"
      ).catch(()=>{});
      return;
    }

    // YES is the only branch allowed to create an account.
    const exists=await db.query(
      "SELECT id FROM app_users WHERE username=$1 OR lower(trim(discord_username))=lower(trim($2)) OR discord_user_id=$3",
      [v.username,v.discord_username,v.discord_user_id]
    );

    if(exists.rowCount){
      await db.query(
        "UPDATE registration_verifications SET used_at=NOW(),decision='rejected' WHERE id=$1 AND used_at IS NULL AND decision='pending'",
        [id]
      );
      await db.query("COMMIT");
      await interaction.message.edit({content:"⚠️ لم يتم إنشاء حساب جديد لأن البيانات مرتبطة بحساب موجود.",embeds:[],components:[]}).catch(()=>{});
      return;
    }

    const created=await db.query(
      "INSERT INTO app_users(username,password_hash,discord_username,discord_user_id,role) VALUES($1,$2,$3,$4,'user') ON CONFLICT DO NOTHING RETURNING id",
      [v.username,v.password_hash,v.discord_username,v.discord_user_id]
    );
    if(!created.rowCount){
      await db.query("UPDATE registration_verifications SET used_at=NOW(),decision='rejected' WHERE id=$1 AND used_at IS NULL AND decision='pending'",[id]);
      await db.query("COMMIT");
      await interaction.message.edit({content:"⚠️ لم يتم إنشاء الحساب لأن اسم المستخدم أو Discord مرتبط بحساب موجود مسبقًا.",embeds:[],components:[]}).catch(()=>{});
      return;
    }
    await db.query(
      "UPDATE registration_verifications SET used_at=NOW(),decision='confirmed' WHERE id=$1 AND used_at IS NULL AND decision='pending'",
      [id]
    );
    await db.query("COMMIT");

    // The transaction is already committed. Update the original message exactly once.
    await interaction.message.edit({
      content:"✅ تم تأكيد إنشاء حساب MLD بنجاح.",
      embeds:[],
      components:[]
    }).catch((editError)=>console.error("Registration confirmation message edit:",editError.message));
    await audit(
      {username:v.username,discordUsername:v.discord_username},
      "register_confirmed",
      "تأكيد إنشاء الحساب من زر Discord"
    ).catch(()=>{});
    await interaction.user.send({
      content:"بيانات حسابك في MLD:\nاسم المستخدم: **"+v.username+"**\nDiscord: **"+v.discord_username+"**\nكلمة المرور: هي كلمة المرور التي اخترتها في الموقع.\n\nتقدر الآن تسجل الدخول من الموقع."
    }).catch(()=>{});
  }catch(e){
    if(db) await db.query("ROLLBACK").catch(()=>{});
    console.error("Registration button transaction:",e.message);
    await interaction.message.edit({
      content:"⚠️ تعذر تنفيذ طلب التسجيل. لم يتم إنشاء الحساب.",
      embeds:[],
      components:[]
    }).catch(()=>{});
  }finally{
    db?.release();
  }
});
client.on("guildMemberAdd", invalidateMemberSnapshot);
client.on("guildMemberRemove", async (member) => {
  invalidateMemberSnapshot();
  try{ const username=String(member.user?.username||"").trim(); if(username) await pool.query("DELETE FROM user_sessions WHERE sess->'user'->>'discordUsername' = $1",[username]); }catch(e){ console.error("Membership session revoke:",e.message); }
});
client.on("guildMemberUpdate", invalidateMemberSnapshot);

async function handleRegistrationDM(message){
  const text=String(message.content||"").trim();
  const m=text.match(/^(?:تأكيد|confirm)\\s+([A-Z0-9]{6,12})$/i);
  if(!m) return false;
  await message.author.send("لأمان الحساب، إنشاء الحساب يتم فقط من زر «نعم، هذا حسابي» في رسالة التأكيد. لا يتم إنشاء أي حساب من خلال كتابة رمز في الخاص.");
  return true;
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guildId) { try { if (await handleRegistrationDM(message)) return; await handleGroupDMApproval(message); } catch(e) { console.error("DM handler:",e.message); } return; }

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


async function ensureChatDatabase(){
  await pool.query("CREATE TABLE IF NOT EXISTS chat_profiles (username VARCHAR(32) PRIMARY KEY REFERENCES app_users(username) ON DELETE CASCADE, display_name VARCHAR(60) NOT NULL, avatar_url TEXT NOT NULL DEFAULT '', bio VARCHAR(240) NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");
  await pool.query("CREATE TABLE IF NOT EXISTS chat_blocks (blocker_username VARCHAR(32) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE, blocked_username VARCHAR(32) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(blocker_username,blocked_username)); CREATE TABLE IF NOT EXISTS chat_public_mutes (username VARCHAR(32) PRIMARY KEY REFERENCES app_users(username) ON DELETE CASCADE, muted_by VARCHAR(32), reason VARCHAR(240) NOT NULL DEFAULT '', muted_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");
  await pool.query("CREATE TABLE IF NOT EXISTS chat_conversations (id BIGSERIAL PRIMARY KEY, kind VARCHAR(12) NOT NULL DEFAULT 'dm', owner_username VARCHAR(32) NOT NULL REFERENCES app_users(username), title VARCHAR(100) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");
  await pool.query("CREATE TABLE IF NOT EXISTS chat_participants (conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE, username VARCHAR(32) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_read_message_id BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(conversation_id,username));");
  await pool.query("CREATE TABLE IF NOT EXISTS chat_messages (id BIGSERIAL PRIMARY KEY, conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE CASCADE, scope VARCHAR(12) NOT NULL DEFAULT 'private', sender_username VARCHAR(32) NOT NULL REFERENCES app_users(username), body VARCHAR(2000) NOT NULL, reply_to BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");
  await pool.query("CREATE INDEX IF NOT EXISTS chat_public_idx ON chat_messages(scope,id DESC);");
  await pool.query("CREATE INDEX IF NOT EXISTS chat_private_idx ON chat_messages(conversation_id,id DESC);");
  await pool.query("CREATE INDEX IF NOT EXISTS chat_participants_user_idx ON chat_participants(username,conversation_id);");
  const users=await pool.query("SELECT username FROM app_users");
  for(const row of users.rows) await pool.query("INSERT INTO chat_profiles(username,display_name) VALUES($1,$1) ON CONFLICT(username) DO NOTHING",[row.username]);
}
function chatRole(u){return u?.role==="owner"?"owner":u?.role==="admin"?"admin":"user"}
async function chatUser(username){
  const q=await pool.query("SELECT u.username,u.discord_username,u.role,COALESCE(p.display_name,u.username) display_name,COALESCE(p.avatar_url,'') avatar_url,COALESCE(p.bio,'') bio FROM app_users u LEFT JOIN chat_profiles p ON p.username=u.username WHERE u.username=$1",[username]);
  if(!q.rowCount)return null; return {...q.rows[0],badge:chatRole(q.rows[0])};
}
function chatClean(v,max){return String(v??"").replace(/[\u0000-\u001F\u007F]/g,"").trim().slice(0,max||2000)}
function chatMsg(r){return {id:Number(r.id),body:r.deleted_at?"تم حذف هذه الرسالة":r.body,deleted:!!r.deleted_at,createdAt:r.created_at,sender:r.sender_username,displayName:r.display_name||r.sender_username,avatar:r.avatar_url||"",role:chatRole(r)}}
const chatHits=new Map();
function chatRate(u){const now=Date.now(),a=(chatHits.get(u)||[]).filter(x=>now-x<10000);if(a.length>=12){chatHits.set(u,a);return false}a.push(now);chatHits.set(u,a);return true}
app.get("/api/chat/profile",requireAuth,async(req,res)=>res.json({profile:await chatUser(req.session.user.username)}));
app.put("/api/chat/profile",requireAuth,async(req,res)=>{try{const u=req.session.user.username,n=chatClean(req.body?.displayName,60),a=chatClean(req.body?.avatarUrl,500),b=chatClean(req.body?.bio,240);if(n.length<2)return res.status(400).json({error:"الاسم الظاهر قصير جدًا"});if(a&&!/^https?:\/\/[^\s]+$/i.test(a))return res.status(400).json({error:"رابط الأفاتار غير صالح"});await pool.query("INSERT INTO chat_profiles(username,display_name,avatar_url,bio) VALUES($1,$2,$3,$4) ON CONFLICT(username) DO UPDATE SET display_name=EXCLUDED.display_name,avatar_url=EXCLUDED.avatar_url,bio=EXCLUDED.bio,updated_at=NOW()",[u,n,a,b]);res.json({ok:true,profile:await chatUser(u)})}catch(e){res.status(500).json({error:"تعذر حفظ البروفايل"})}});
app.get("/api/chat/blocks",requireAuth,async(req,res)=>{const u=req.session.user.username,q=await pool.query("SELECT blocked_username FROM chat_blocks WHERE blocker_username=$1 ORDER BY created_at DESC",[u]);res.json({blocks:q.rows.map(x=>x.blocked_username)});});
app.post("/api/chat/blocks/:username",requireAuth,async(req,res)=>{const u=req.session.user.username,t=String(req.params.username||"").trim().toLowerCase();if(!t||t===u)return res.status(400).json({error:"المستخدم غير صالح"});if(!(await chatUser(t)))return res.status(404).json({error:"المستخدم غير موجود"});await pool.query("INSERT INTO chat_blocks(blocker_username,blocked_username) VALUES($1,$2) ON CONFLICT DO NOTHING",[u,t]);res.json({ok:true});});
app.delete("/api/chat/blocks/:username",requireAuth,async(req,res)=>{await pool.query("DELETE FROM chat_blocks WHERE blocker_username=$1 AND blocked_username=$2",[req.session.user.username,String(req.params.username).toLowerCase()]);res.json({ok:true});});
app.get("/api/chat/public",requireAuth,async(req,res)=>{const l=Math.min(Math.max(Number(req.query.limit)||40,1),80),before=Number(req.query.before)||0,q=await pool.query("SELECT m.*,p.display_name,p.avatar_url,u.role FROM chat_messages m JOIN app_users u ON u.username=m.sender_username LEFT JOIN chat_profiles p ON p.username=m.sender_username WHERE m.scope='public'"+(before?" AND m.id < $2":"")+" ORDER BY m.id DESC LIMIT $1",before?[l,before]:[l]);res.json({messages:q.rows.reverse().map(chatMsg),nextBefore:q.rows.length?Number(q.rows[0].id):null})});
app.delete("/api/chat/public/:id",requireAuth,async(req,res)=>{try{const id=Number(req.params.id),u=req.session.user.username,q=await pool.query("SELECT body,sender_username FROM chat_messages WHERE id=$1 AND scope='public' AND deleted_at IS NULL",[id]);if(!q.rowCount)return res.status(404).json({error:"الرسالة غير موجودة"});const m=q.rows[0];if(m.sender_username!==u&&req.session.user.role!=="owner")return res.status(403).json({error:"تقدر تحذف رسالتك فقط"});await pool.query("UPDATE chat_messages SET deleted_at=NOW() WHERE id=$1",[id]);await audit(req.session.user,"message_deleted_for_everyone",`public #${id} · ${m.body}`);res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:"تعذر حذف الرسالة"})}});
app.post("/api/chat/public",requireAuth,writeLimiter,async(req,res)=>{const u=req.session.user.username,b=chatClean(req.body?.body,2000);if(!b)return res.status(400).json({error:"اكتب رسالة أولًا"});if(!chatRate(u))return res.status(429).json({error:"أرسلت رسائل كثيرة، انتظر قليلًا"});const m=await pool.query("SELECT muted_until FROM chat_public_mutes WHERE username=$1",[u]);if(m.rowCount&&(!m.rows[0].muted_until||new Date(m.rows[0].muted_until)>new Date()))return res.status(403).json({error:"أنت مكتوم من الشات العام"});const q=await pool.query("INSERT INTO chat_messages(scope,sender_username,body) VALUES('public',$1,$2) RETURNING *",[u,b]);res.json({ok:true,message:chatMsg({...q.rows[0],...(await chatUser(u))})})});
app.post("/api/chat/public/mute/:username",requireOwner,async(req,res)=>{const t=String(req.params.username||"").toLowerCase(),min=Math.min(Math.max(Number(req.body?.minutes)||0,0),10080),reason=chatClean(req.body?.reason,240),until=min?new Date(Date.now()+min*60000):null;if(!t||t===req.session.user.username)return res.status(400).json({error:"المستخدم غير صالح"});if(!(await chatUser(t)))return res.status(404).json({error:"المستخدم غير موجود"});await pool.query("INSERT INTO chat_public_mutes(username,muted_by,reason,muted_until) VALUES($1,$2,$3,$4) ON CONFLICT(username) DO UPDATE SET muted_by=EXCLUDED.muted_by,reason=EXCLUDED.reason,muted_until=EXCLUDED.muted_until",[t,req.session.user.username,reason,until]);await audit(req.session.user,"chat_mute",t);res.json({ok:true})});
app.delete("/api/chat/public/mute/:username",requireOwner,async(req,res)=>{const t=String(req.params.username||"").toLowerCase();await pool.query("DELETE FROM chat_public_mutes WHERE username=$1",[t]);await audit(req.session.user,"chat_unmute",t);res.json({ok:true})});
app.get("/api/chat/conversations",requireAuth,async(req,res)=>{const u=req.session.user.username,q=await pool.query("SELECT c.id,c.kind,c.owner_username,c.title,c.updated_at,(SELECT body FROM chat_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1) last_message,(SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=c.id AND m.id>p.last_read_message_id AND m.sender_username<>$1 AND m.deleted_at IS NULL) unread FROM chat_conversations c JOIN chat_participants p ON p.conversation_id=c.id AND p.username=$1 WHERE c.kind IN ('dm','private_group') ORDER BY c.updated_at DESC LIMIT 100",[u]);res.json({conversations:q.rows.map(x=>({...x,id:Number(x.id),unread:Number(x.unread)}))})});
app.post("/api/chat/conversations",requireAuth,async(req,res)=>{try{const u=req.session.user.username,n=[u,...(Array.isArray(req.body?.participants)?req.body.participants:[]).map(x=>String(x).toLowerCase())].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,20);if(n.length<2)return res.status(400).json({error:"اختر شخصًا واحدًا على الأقل"});const q=await pool.query("SELECT username FROM app_users WHERE username=ANY($1::text[])",[n]);if(q.rowCount!==n.length)return res.status(404).json({error:"أحد المستخدمين غير موجود"});const c=await pool.query("INSERT INTO chat_conversations(kind,owner_username,title) VALUES($1,$2,$3) RETURNING id,kind,owner_username,title",[n.length===2?"dm":"private_group",u,chatClean(req.body?.title,100)||"محادثة جديدة"]);for(const x of n)await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2)",[c.rows[0].id,x]);res.json({ok:true,conversation:{...c.rows[0],id:Number(c.rows[0].id)}})}catch(e){res.status(500).json({error:"تعذر إنشاء المحادثة"})}});
app.get("/api/chat/conversations/:id/participants",requireAuth,async(req,res)=>{
const id=Number(req.params.id),u=req.session.user.username; const ok=await pool.query("SELECT 1 FROM chat_participants WHERE conversation_id=$1 AND username=$2",[id,u]); if(!ok.rowCount)return res.status(403).json({error:"لا تملك صلاحية هذه المحادثة"});
const q=await pool.query("SELECT p.username,p.joined_at,c.owner_username,u.role,COALESCE(cp.display_name,p.username) display_name,COALESCE(cp.avatar_url,'') avatar_url FROM chat_participants p JOIN chat_conversations c ON c.id=p.conversation_id JOIN app_users u ON u.username=p.username LEFT JOIN chat_profiles cp ON cp.username=p.username WHERE p.conversation_id=$1 ORDER BY p.joined_at",[id]); res.json({participants:q.rows.map(x=>({...x,isOwner:x.username===x.owner_username}))});
});
app.post("/api/chat/conversations/:id/participants",requireAuth,async(req,res)=>{
const id=Number(req.params.id),u=req.session.user.username,t=String(req.body?.username||"").trim().toLowerCase(); const c=await pool.query("SELECT kind,owner_username FROM chat_conversations WHERE id=$1",[id]);
if(!c.rowCount)return res.status(404).json({error:"المحادثة غير موجودة"}); if(c.rows[0].owner_username!==u)return res.status(403).json({error:"مالك المحادثة فقط يقدر يضيف أعضاء"}); if(c.rows[0].kind!=="private_group")return res.status(400).json({error:"هذه ليست مجموعة محادثة خاصة"}); if(!t||t===u)return res.status(400).json({error:"العضو غير صالح"}); if(!(await chatUser(t)))return res.status(404).json({error:"المستخدم غير موجود"});
await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,t]); await audit(req.session.user,"chat_participant_add","conversation #"+id+" + "+t); res.json({ok:true});
});
app.delete("/api/chat/conversations/:id/participants/:username",requireAuth,async(req,res)=>{
const id=Number(req.params.id),u=req.session.user.username,t=String(req.params.username||"").trim().toLowerCase(); const c=await pool.query("SELECT owner_username FROM chat_conversations WHERE id=$1",[id]); if(!c.rowCount)return res.status(404).json({error:"المحادثة غير موجودة"}); if(c.rows[0].owner_username!==u)return res.status(403).json({error:"مالك المحادثة فقط يقدر يطرد عضو"}); if(t===u)return res.status(400).json({error:"المالك لا يطرد نفسه"});
const r=await pool.query("DELETE FROM chat_participants WHERE conversation_id=$1 AND username=$2 RETURNING username",[id,t]); if(!r.rowCount)return res.status(404).json({error:"العضو غير موجود في المحادثة"}); await audit(req.session.user,"chat_participant_remove","conversation #"+id+" - "+t); res.json({ok:true});
});
app.get("/api/chat/conversations/:id/messages",requireAuth,async(req,res)=>{const id=Number(req.params.id),u=req.session.user.username,p=await pool.query("SELECT 1 FROM chat_participants WHERE conversation_id=$1 AND username=$2",[id,u]);if(!p.rowCount){const g=await pool.query("SELECT cg.id FROM community_groups cg WHERE cg.group_conversation_id=$1 AND cg.status='approved' AND (cg.username=$2 OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=cg.id AND gm.username=$2))",[id,u]);if(g.rowCount){await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,u]);}else return res.status(403).json({error:"ما عندك صلاحية شات هذا القروب"});}const l=Math.min(Math.max(Number(req.query.limit)||50,1),100),before=Number(req.query.before)||0,q=await pool.query("SELECT m.*,p.display_name,p.avatar_url,u.role FROM chat_messages m JOIN app_users u ON u.username=m.sender_username LEFT JOIN chat_profiles p ON p.username=m.sender_username WHERE m.conversation_id=$1"+(before?" AND m.id < $3":"")+" ORDER BY m.id DESC LIMIT $2",before?[id,l,before]:[id,l]);await pool.query("UPDATE chat_participants SET last_read_message_id=COALESCE((SELECT MAX(id) FROM chat_messages WHERE conversation_id=$1),0) WHERE conversation_id=$1 AND username=$2",[id,u]);res.json({messages:q.rows.reverse().map(chatMsg),nextBefore:q.rows.length?Number(q.rows[0].id):null})});
app.delete("/api/chat/conversations/:id/messages/:messageId",requireAuth,async(req,res)=>{try{const id=Number(req.params.id),mid=Number(req.params.messageId),u=req.session.user.username,q=await pool.query("SELECT m.body,m.sender_username FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.username=$2 WHERE m.id=$1 AND m.conversation_id=$3 AND m.deleted_at IS NULL",[mid,u,id]);if(!q.rowCount)return res.status(404).json({error:"الرسالة غير موجودة"});const m=q.rows[0];if(m.sender_username!==u&&req.session.user.role!=="owner")return res.status(403).json({error:"تقدر تحذف رسالتك فقط"});await pool.query("UPDATE chat_messages SET deleted_at=NOW() WHERE id=$1",[mid]);await audit(req.session.user,"message_deleted_for_everyone",`conversation #${id} · #${mid} · ${m.body}`);res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:"تعذر حذف الرسالة"})}});
app.post("/api/chat/conversations/:id/messages",requireAuth,writeLimiter,async(req,res)=>{const id=Number(req.params.id),u=req.session.user.username,b=chatClean(req.body?.body,2000),p=await pool.query("SELECT 1 FROM chat_participants WHERE conversation_id=$1 AND username=$2",[id,u]);if(!p.rowCount){const g=await pool.query("SELECT cg.id FROM community_groups cg WHERE cg.group_conversation_id=$1 AND cg.status='approved' AND (cg.username=$2 OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=cg.id AND gm.username=$2))",[id,u]);if(g.rowCount){await pool.query("INSERT INTO chat_participants(conversation_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,u]);}else return res.status(403).json({error:"ما عندك صلاحية شات هذا القروب"});}const blocked=await pool.query("SELECT 1 FROM chat_participants a JOIN chat_participants b ON a.conversation_id=b.conversation_id JOIN chat_blocks bl ON ((bl.blocker_username=a.username AND bl.blocked_username=b.username) OR (bl.blocker_username=b.username AND bl.blocked_username=a.username)) WHERE a.conversation_id=$1 LIMIT 1",[id]);if(blocked.rowCount)return res.status(403).json({error:"المحادثة تحتوي على مستخدم محظور"});if(!b)return res.status(400).json({error:"اكتب رسالة أولًا"});if(!chatRate(u))return res.status(429).json({error:"أرسلت رسائل كثيرة، انتظر قليلًا"});const q=await pool.query("INSERT INTO chat_messages(conversation_id,scope,sender_username,body) VALUES($1,'private',$2,$3) RETURNING *",[id,u,b]);await pool.query("UPDATE chat_conversations SET updated_at=NOW() WHERE id=$1",[id]);await audit(req.session.user,"zajel_private_message","conversation #"+id+" · "+b);res.json({ok:true,message:chatMsg({...q.rows[0],...(await chatUser(u))})})});
app.post("/api/chat/conversations/:id/read",requireAuth,async(req,res)=>{const id=Number(req.params.id),u=req.session.user.username;await pool.query("UPDATE chat_participants SET last_read_message_id=COALESCE((SELECT MAX(id) FROM chat_messages WHERE conversation_id=$1),0) WHERE conversation_id=$1 AND username=$2",[id,u]);res.json({ok:true})});
app.post("/api/chat/conversations/:id/leave",requireAuth,async(req,res)=>{const id=Number(req.params.id),u=req.session.user.username,c=await pool.query("SELECT owner_username,kind FROM chat_conversations WHERE id=$1",[id]);if(!c.rowCount)return res.status(404).json({error:"غير موجود"});if(c.rows[0].owner_username===u&&c.rows[0].kind==="private_group")return res.status(400).json({error:"مالك المحادثة لا يمكنه الخروج"});await pool.query("DELETE FROM chat_participants WHERE conversation_id=$1 AND username=$2",[id,u]);res.json({ok:true})});

app.use("/api", (req,res) => res.status(404).json({error:"API route not found"}));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(port, async () => {
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 30_000;
  console.log(`MLD listening on port ${port}`);
  try { await initAppDatabase(); await ensureOwner(); await ensureChatDatabase(); await ensureEngagementSeed(); console.log("App database ready"); }
  catch (error) { console.error("Database init failed:", error.message); }
});

async function gracefulShutdown(signal){
  console.log(`Shutting down: ${signal}`);
  server.close(()=>{});
  try { await pool.end(); } catch {}
  try { await client.destroy(); } catch {}
  setTimeout(()=>process.exit(0),5000).unref();
}
process.once("SIGTERM",()=>gracefulShutdown("SIGTERM"));
process.once("SIGINT",()=>gracefulShutdown("SIGINT"));
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const guild = await getGuild();
    await getAllMembers(guild);
    console.log(`Member snapshot warmed: ${memberSnapshot?.length || 0}`);
  } catch (e) {
    console.error("Member snapshot warmup:", e.message);
  }
});
client.login(token).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});

// auth feature checkpoint