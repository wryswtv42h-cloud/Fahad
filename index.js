"use strict";
require("dotenv").config();
const path=require("path");
const express=require("express");
const session=require("express-session");
const pgSession=require("connect-pg-simple")(session);
const bcrypt=require("bcryptjs");
const helmet=require("helmet");
const compression=require("compression");
const {Client,GatewayIntentBits}=require("discord.js");
const {Pool}=require("pg");
const games=require("./game-engines");

const app=express();
const port=Number(process.env.PORT||3000);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:8000,keepAlive:true});
pool.on("error",e=>console.error("postgres",e.message));
const token=process.env.DISCORD_BOT_TOKEN,guildId=process.env.DISCORD_GUILD_ID;
if(!token||!guildId){console.error("Missing Discord configuration");process.exit(1)}
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildPresences,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
app.set("trust proxy",1);app.disable("x-powered-by");
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(compression());app.use(express.json({limit:"256kb"}));
app.use(session({name:"mld.sid",secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,store:new pgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:2592000000}}));
app.use(express.static(path.join(__dirname,"public"),{etag:true,maxAge:"5m"}));

const roleIds=new Set(["1530712642384040027","1521187079336362024","1531109479264026706","1548732297669255259","1548732341185155103","1548732606508703744"]);
let guildCache=null,memberCache=null,memberAt=0;
async function guild(){if(guildCache)return guildCache;guildCache=await client.guilds.fetch(guildId);return guildCache}
async function members(){if(memberCache&&Date.now()-memberAt<30000)return memberCache;const g=await guild();memberCache=[...(await g.members.fetch()).values()];memberAt=Date.now();return memberCache}
function me(req){return req.session.user||null}
function auth(req,res,next){if(!me(req))return res.status(401).json({error:"تسجيل الدخول مطلوب"});next()}
function owner(req,res,next){const u=me(req);if(!u||!["owner","admin"].includes(u.role))return res.status(403).json({error:"ليس لديك صلاحية"});next()}
function memberJson(m){const rs=m.roles.cache.filter(r=>r.id!==m.guild.id).sort((a,b)=>b.position-a.position).map(r=>({id:r.id,name:r.name,color:r.hexColor,position:r.position,mentionable:r.mentionable}));const lead=rs.filter(r=>roleIds.has(r.id));return{id:m.id,name:m.displayName,username:m.user.username,globalName:m.user.globalName,bot:m.user.bot,avatar:m.user.displayAvatarURL({extension:"png",size:256}),joinedAt:m.joinedAt,roles:rs,importantRoles:lead,rank:lead[0]?.name||rs[0]?.name||"عضو"}}
async function init(){await pool.query(`
CREATE TABLE IF NOT EXISTS app_users(id SERIAL PRIMARY KEY,username VARCHAR(32) UNIQUE NOT NULL,password_hash TEXT NOT NULL,discord_username VARCHAR(100) NOT NULL,discord_user_id VARCHAR(32),role VARCHAR(20) NOT NULL DEFAULT 'user',banned BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_login_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS site_stats(id INTEGER PRIMARY KEY DEFAULT 1,visits BIGINT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS site_settings(key VARCHAR(80) PRIMARY KEY,value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS game_sessions(id BIGSERIAL PRIMARY KEY,code VARCHAR(8) UNIQUE NOT NULL,game_id VARCHAR(60) NOT NULL,game_name VARCHAR(120) NOT NULL,owner_username VARCHAR(32) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'open',max_players INTEGER NOT NULL DEFAULT 4,players INTEGER NOT NULL DEFAULT 0,spectators INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),started_at TIMESTAMPTZ,ended_at TIMESTAMPTZ,players_json JSONB NOT NULL DEFAULT '[]'::jsonb,spectators_json JSONB NOT NULL DEFAULT '[]'::jsonb,state JSONB);
CREATE TABLE IF NOT EXISTS public_chat(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) NOT NULL,discord_username VARCHAR(100),body VARCHAR(2000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS community_groups(id BIGSERIAL PRIMARY KEY,name VARCHAR(80) NOT NULL,description VARCHAR(1000) NOT NULL DEFAULT '',owner_username VARCHAR(32) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS group_members(group_id BIGINT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,username VARCHAR(32) NOT NULL,joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(group_id,username));
CREATE TABLE IF NOT EXISTS group_join_requests(id BIGSERIAL PRIMARY KEY,group_id BIGINT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,username VARCHAR(32) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(group_id,username,status));
CREATE TABLE IF NOT EXISTS ratings(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) NOT NULL,value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5),body VARCHAR(1000) NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS jokes(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) NOT NULL,body VARCHAR(500) NOT NULL,likes INTEGER NOT NULL DEFAULT 0,dislikes INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS joke_reactions(joke_id BIGINT NOT NULL REFERENCES jokes(id) ON DELETE CASCADE,username VARCHAR(32) NOT NULL,type VARCHAR(10) NOT NULL CHECK(type IN ('like','dislike')),PRIMARY KEY(joke_id,username));
CREATE TABLE IF NOT EXISTS stories(id BIGSERIAL PRIMARY KEY,username VARCHAR(32),genre VARCHAR(40) NOT NULL,length VARCHAR(20) NOT NULL,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS tickets(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) NOT NULL,subject VARCHAR(160) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ticket_messages(id BIGSERIAL PRIMARY KEY,ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,username VARCHAR(32) NOT NULL,body VARCHAR(4000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS applications(id BIGSERIAL PRIMARY KEY,username VARCHAR(32),discord_username VARCHAR(100),type VARCHAR(40) NOT NULL DEFAULT 'staff',body VARCHAR(4000) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'pending',decision_note VARCHAR(1000),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS private_messages(id BIGSERIAL PRIMARY KEY,sender_username VARCHAR(32) NOT NULL,recipient_username VARCHAR(32) NOT NULL,body VARCHAR(4000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS anonymous_messages(id BIGSERIAL PRIMARY KEY,recipient_username VARCHAR(32) NOT NULL,body VARCHAR(4000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS bio VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
INSERT INTO site_stats(id,visits) VALUES(1,0) ON CONFLICT DO NOTHING;
`)}
async function ensureOwner(){
 const username=String(process.env.OWNER_USERNAME||"admin").trim().toLowerCase();
 const password=String(process.env.OWNER_PASSWORD||"");
 if(!password)return;
 const q=await pool.query("SELECT id FROM app_users WHERE username=$1",[username]);
 if(!q.rowCount)await pool.query("INSERT INTO app_users(username,password_hash,discord_username,role) VALUES($1,$2,$3,'owner')",[username,await bcrypt.hash(password,12),username]);
 else await pool.query("UPDATE app_users SET role='owner' WHERE username=$1",[username]);
}
function code(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function gameUser(req,body){const u=me(req);return{username:String(u?.username||body?.username||"زائر"),discordUsername:String(u?.discordUsername||body?.discordUsername||"")}}
function pub(s){return{id:s.id,code:s.code,gameId:s.game_id,gameName:s.game_name,ownerUsername:s.owner_username,status:s.status,maxPlayers:s.max_players,players:Array.isArray(s.players_json)?s.players_json:[],spectators:Array.isArray(s.spectators_json)?s.spectators_json:[],createdAt:s.created_at,startedAt:s.started_at,endedAt:s.ended_at}}
app.get("/health",(req,res)=>res.json({ok:true,service:"mld",botReady:client.isReady()}));
app.get("/ready",(req,res)=>res.status(client.isReady()?200:503).json({ok:client.isReady()}));
app.get("/api/public/server",async(req,res)=>{try{const g=await guild();res.json({id:g.id,name:g.name,icon:g.iconURL({extension:"png",size:256}),memberCount:g.memberCount,ownerName:g.ownerId||"",invite:process.env.DISCORD_INVITE_URL||""})}catch(e){res.status(503).json({error:"Discord غير متاح"})}});
app.get("/api/members",async(req,res)=>{try{res.json({members:(await members()).map(memberJson)})}catch(e){res.status(503).json({error:"تعذر تحميل الأعضاء"})}});
app.get("/api/roles",async(req,res)=>{try{const g=await guild();res.json({roles:[...g.roles.cache.values()].filter(r=>r.id!==g.id).sort((a,b)=>b.position-a.position).map(r=>({id:r.id,name:r.name,color:r.hexColor,position:r.position,membersCount:r.members.size,mentionable:r.mentionable}))})}catch(e){res.status(503).json({error:"تعذر تحميل الرتب"})}});
app.get("/api/public/roles",async(req,res)=>{try{const g=await guild();res.json({roles:[...g.roles.cache.values()].filter(r=>r.id!==g.id).sort((a,b)=>b.position-a.position).map(r=>({id:r.id,name:r.name,color:r.hexColor,position:r.position,membersCount:r.members.size,mentionable:r.mentionable}))})}catch(e){res.status(503).json({error:"تعذر تحميل الرتب"})}});app.get("/api/top",async(req,res)=>{try{const a=(await members()).filter(m=>!m.user.bot).sort((x,y)=>{const xr=x.roles.cache.filter(r=>roleIds.has(r.id)).sort((a,b)=>b.position-a.position).first()?.position||0;const yr=y.roles.cache.filter(r=>roleIds.has(r.id)).sort((a,b)=>b.position-a.position).first()?.position||0;return yr-xr}).map(memberJson);res.json({members:a})}catch(e){res.status(503).json({error:"تعذر تحميل TOP"})}});
app.get("/api/site/stats",async(req,res)=>{try{const s=await pool.query("SELECT visits FROM site_stats WHERE id=1");const g=await guild();const ms=await members();const online=ms.filter(m=>!m.user.bot&&m.presence&&m.presence.status&&m.presence.status!=="offline").length;res.set("Cache-Control","no-store");res.json({visits:Number(s.rows[0]?.visits||0),memberCount:g.memberCount||ms.length,online,updatedAt:new Date().toISOString()})}catch(e){res.status(503).json({error:"stats_unavailable"})}});
app.post("/api/site/visit",async(req,res)=>{try{await pool.query("UPDATE site_stats SET visits=visits+1,updated_at=NOW() WHERE id=1");res.json({ok:true})}catch(e){res.status(500).json({error:"stats"})}});
app.get("/api/auth/me",(req,res)=>{const u=me(req);res.json({authenticated:Boolean(u),user:u})});
app.post("/api/auth/register",async(req,res)=>{
 try{
  const username=String(req.body?.username||"").trim().toLowerCase();
  const password=String(req.body?.password||"");
  const discordUsername=String(req.body?.discordUsername||"").trim();
  if(!/^[a-zA-Z0-9_\-\u0600-\u06ff]{3,24}$/.test(username))return res.status(400).json({error:"اسم المستخدم يجب أن يكون بين 3 و24 حرفًا"});
  if(password.length<6)return res.status(400).json({error:"كلمة المرور يجب أن تكون 6 أحرف على الأقل"});
  if(!discordUsername)return res.status(400).json({error:"اكتب اسم Discord"});
  if((await pool.query("SELECT 1 FROM app_users WHERE username=$1",[username])).rowCount)return res.status(409).json({error:"اسم المستخدم مستخدم مسبقًا"});
  let dm=null;
  try{dm=(await members()).find(m=>m.user.username.toLowerCase()===discordUsername.toLowerCase()||m.displayName.toLowerCase()===discordUsername.toLowerCase()||String(m.user.globalName||"").toLowerCase()===discordUsername.toLowerCase())}catch{}
  if(!dm)return res.status(400).json({error:"لم يتم العثور على اسم Discord داخل السيرفر"});
  const hash=await bcrypt.hash(password,12);
  const q=await pool.query("INSERT INTO app_users(username,password_hash,discord_username,discord_user_id,avatar_url) VALUES($1,$2,$3,$4,$5) RETURNING id,username,discord_username,discord_user_id,role,banned,created_at,points,bio,avatar_url",[username,hash,dm.user.username,dm.id,dm.user.displayAvatarURL({extension:"png",size:256})]);
  const r=q.rows[0];req.session.user={username:r.username,discordUsername:r.discord_username,discordUserId:r.discord_user_id,role:r.role};
  res.status(201).json({ok:true,user:{...req.session.user,points:r.points,bio:r.bio,avatar:r.avatar_url}});
 }catch(e){console.error("register",e);res.status(500).json({error:"تعذر إنشاء الحساب"})}
});
app.post("/api/auth/login",async(req,res)=>{try{const username=String(req.body?.username||"").trim().toLowerCase(),password=String(req.body?.password||"");const q=await pool.query("SELECT * FROM app_users WHERE username=$1",[username]);if(!q.rowCount)return res.status(401).json({error:"بيانات الدخول غير صحيحة"});const r=q.rows[0];if(r.banned)return res.status(403).json({error:"الحساب محظور"});if(!await bcrypt.compare(password,r.password_hash))return res.status(401).json({error:"بيانات الدخول غير صحيحة"});req.session.user={username:r.username,discordUsername:r.discord_username,discordUserId:r.discord_user_id,role:r.role,points:r.points||0,bio:r.bio||"",avatar:r.avatar_url||""};await pool.query("UPDATE app_users SET last_login_at=NOW() WHERE id=$1",[r.id]);res.json({ok:true,user:req.session.user})}catch(e){res.status(500).json({error:"تعذر تسجيل الدخول"})}});
app.post("/api/auth/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/chat/messages",async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,body,created_at FROM public_chat ORDER BY id DESC LIMIT 100");res.json({messages:q.rows.reverse()})});
app.post("/api/chat/messages",auth,async(req,res)=>{const body=String(req.body?.body||"").trim();if(!body||body.length>2000)return res.status(400).json({error:"رسالة غير صالحة"});const u=me(req);const q=await pool.query("INSERT INTO public_chat(username,discord_username,body) VALUES($1,$2,$3) RETURNING *",[u.username,u.discordUsername,body]);res.json({ok:true,message:q.rows[0]})});
app.get("/api/games/sessions",async(req,res)=>{const q=await pool.query("SELECT * FROM game_sessions WHERE status IN ('open','playing') ORDER BY id DESC LIMIT 100");res.json({sessions:q.rows.map(pub)})});
app.post("/api/games/sessions",auth,async(req,res)=>{try{const id=String(req.body?.gameId||"").toUpperCase(),name=String(req.body?.gameName||id),max=Math.max(2,Math.min(8,Number(req.body?.maxPlayers)||4)),u=me(req),players=[gameUser(req,req.body||{})];let c=code();for(let i=0;i<5;i++){if(!(await pool.query("SELECT 1 FROM game_sessions WHERE code=$1",[c])).rowCount)break;c=code()}const q=await pool.query("INSERT INTO game_sessions(code,game_id,game_name,owner_username,max_players,players,players_json) VALUES($1,$2,$3,$4,$5,1,$6::jsonb) RETURNING *",[c,id,name,u.username,max,JSON.stringify(players)]);res.json({ok:true,session:pub(q.rows[0]),message:"تم إنشاء الجلسة "+c})}catch(e){res.status(500).json({error:"تعذر إنشاء الجلسة"})}});
app.post("/api/games/sessions/:code/join",auth,async(req,res)=>{const db=await pool.connect();try{await db.query("BEGIN");const q=await db.query("SELECT * FROM game_sessions WHERE code=$1 AND status='open' FOR UPDATE",[String(req.params.code).toUpperCase()]);if(!q.rowCount)throw Error("الجلسة غير موجودة أو بدأت");const s=q.rows[0],p=Array.isArray(s.players_json)?s.players_json:[],u=gameUser(req,req.body||{});if(p.some(x=>x.username===u.username)){await db.query("COMMIT");return res.json({ok:true,session:pub(s)})}if(p.length>=s.max_players)throw Error("الجلسة مكتملة");p.push(u);const x=await db.query("UPDATE game_sessions SET players=$2,players_json=$3::jsonb WHERE code=$1 RETURNING *",[s.code,p.length,JSON.stringify(p)]);await db.query("COMMIT");res.json({ok:true,session:pub(x.rows[0])})}catch(e){await db.query("ROLLBACK");res.status(400).json({error:e.message})}finally{db.release()}});
app.post("/api/games/sessions/:code/spectate",async(req,res)=>{try{const q=await pool.query("SELECT * FROM game_sessions WHERE code=$1 AND status='playing'",[String(req.params.code).toUpperCase()]);if(!q.rowCount)return res.status(404).json({error:"الجلسة غير متاحة"});const s=q.rows[0],a=Array.isArray(s.spectators_json)?s.spectators_json:[],u=gameUser(req,req.body||{});if(!a.some(x=>x.username===u.username))a.push(u);const x=await pool.query("UPDATE game_sessions SET spectators=$2,spectators_json=$3::jsonb WHERE code=$1 RETURNING *",[s.code,a.length,JSON.stringify(a)]);res.json({ok:true,session:pub(x.rows[0])})}catch(e){res.status(500).json({error:"تعذر تسجيل المشاهدة"})}});
app.post("/api/games/sessions/:code/start",auth,async(req,res)=>{try{const q=await pool.query("SELECT * FROM game_sessions WHERE code=$1 AND status='open'",[String(req.params.code).toUpperCase()]);if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});const s=q.rows[0],u=me(req);if(u.username!==s.owner_username)return res.status(403).json({error:"صاحب الجلسة فقط"});const p=Array.isArray(s.players_json)?s.players_json:[],engine=s.game_id.toUpperCase();const supported=new Set(["UNO","BALOOT","JAKAROO","LUDO","QAWSAR","SPYFALL","CODENAMES","TRIVIA","EMOJI_GUESS","TABOO","WORD_BOMB","CATEGORIES","FASTEST","RIDDLE_RUSH","PICTIONARY","DRAW_GUESS","CHARADES","MIMIC","SECRET_WORD","WHOAMI","WOULD_YOU_RATHER","HOT_SEAT","GUESS_PLAYER","LIAR","TRUTH_LIE","DAQSH"]);if(!supported.has(engine)||!games[engine])return res.status(400).json({error:"اللعبة غير مدعومة"});if(p.length<2)return res.status(400).json({error:"لازم لاعبين على الأقل قبل بدء الجولة"});const state=games.create(engine,p);const x=await pool.query("UPDATE game_sessions SET status='playing',started_at=NOW(),state=$2::jsonb WHERE code=$1 RETURNING *",[s.code,JSON.stringify(state)]);res.json({ok:true,session:pub(x.rows[0])})}catch(e){res.status(400).json({error:e.message||"تعذر بدء اللعبة"})}});
app.get("/api/games/sessions/:code/state",async(req,res)=>{try{const q=await pool.query("SELECT * FROM game_sessions WHERE code=$1 AND status IN ('open','playing')",[String(req.params.code).toUpperCase()]);if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});const s=q.rows[0];res.set("Cache-Control","no-store");res.json({ok:true,session:pub(s),state:s.state?games.pub(s.state,Array.isArray(s.players_json)?s.players_json:[],gameUser(req,req.query||{})):null})}catch(e){res.status(500).json({error:"تعذر تحميل حالة اللعبة"})}});
app.post("/api/games/sessions/:code/action",auth,async(req,res)=>{const db=await pool.connect();try{await db.query("BEGIN");const q=await db.query("SELECT * FROM game_sessions WHERE code=$1 AND status='playing' FOR UPDATE",[String(req.params.code).toUpperCase()]);if(!q.rowCount)throw Error("الجلسة غير موجودة");const s=q.rows[0],p=Array.isArray(s.players_json)?s.players_json:[],u=gameUser(req,req.body||{}),state=JSON.parse(JSON.stringify(s.state));const next=games.apply(String(s.game_id||"").toUpperCase(),state,p,u,req.body.action,req.body.data||{});const status=next.phase==="finished"?"ended":"playing";const x=await db.query("UPDATE game_sessions SET state=$2::jsonb,status=$3,ended_at=CASE WHEN $3='ended' THEN NOW() ELSE ended_at END WHERE code=$1 RETURNING *",[s.code,JSON.stringify(next),status]);await db.query("COMMIT");res.json({ok:true,finished:status==="ended",session:pub(x.rows[0]),state:games.pub(next,p,u)})}catch(e){await db.query("ROLLBACK");res.status(400).json({error:e.message||"الحركة غير صالحة"})}finally{db.release()}});
app.post("/api/games/sessions/:code/end",auth,async(req,res)=>{const q=await pool.query("SELECT * FROM game_sessions WHERE code=$1",[String(req.params.code).toUpperCase()]);if(!q.rowCount)return res.status(404).json({error:"الجلسة غير موجودة"});if(q.rows[0].owner_username!==me(req).username)return res.status(403).json({error:"صاحب الجلسة فقط"});const x=await pool.query("UPDATE game_sessions SET status='ended',ended_at=NOW() WHERE code=$1 RETURNING *",[q.rows[0].code]);res.json({ok:true,session:pub(x.rows[0])})});

function currentUser(req){return me(req)}
async function findUserByName(name){
 const q=await pool.query("SELECT username,discord_username,discord_user_id,role,points,bio,avatar_url FROM app_users WHERE lower(username)=lower($1) OR lower(discord_username)=lower($1) LIMIT 1",[String(name||"").trim()]);
 return q.rows[0]||null;
}
app.get("/api/profile",auth,async(req,res)=>{
 const q=await pool.query("SELECT username,discord_username,discord_user_id,role,points,bio,avatar_url,created_at,last_login_at FROM app_users WHERE username=$1",[me(req).username]);
 if(!q.rowCount)return res.status(404).json({error:"الحساب غير موجود"});
 const u=q.rows[0];res.json({user:{username:u.username,discordUsername:u.discord_username,discordUserId:u.discord_user_id,role:u.role,points:u.points||0,bio:u.bio||"",avatar:u.avatar_url||"",createdAt:u.created_at,lastLoginAt:u.last_login_at}});
});
app.patch("/api/profile",auth,async(req,res)=>{
 const bio=String(req.body?.bio||"").trim().slice(0,500),discordUsername=String(req.body?.discordUsername||"").trim().slice(0,100);
 let avatar=String(req.body?.avatar||"").trim().slice(0,1000);
 if(discordUsername){
  const m=(await members()).find(x=>x.user.username.toLowerCase()===discordUsername.toLowerCase()||x.displayName.toLowerCase()===discordUsername.toLowerCase()||String(x.user.globalName||"").toLowerCase()===discordUsername.toLowerCase());
  if(!m)return res.status(400).json({error:"اسم Discord غير موجود في السيرفر"});
  avatar=m.user.displayAvatarURL({extension:"png",size:256});
  await pool.query("UPDATE app_users SET discord_username=$1,discord_user_id=$2,avatar_url=$3,bio=$4 WHERE username=$5",[m.user.username,m.id,avatar,bio,me(req).username]);
  req.session.user.discordUsername=m.user.username;req.session.user.discordUserId=m.id;req.session.user.avatar=avatar;
 }else{
  await pool.query("UPDATE app_users SET bio=$1,avatar_url=CASE WHEN $2='' THEN avatar_url ELSE $2 END WHERE username=$3",[bio,avatar,me(req).username]);
  req.session.user.bio=bio;if(avatar)req.session.user.avatar=avatar;
 }
 res.json({ok:true,user:req.session.user});
});
app.get("/api/members/search",async(req,res)=>{const q=String(req.query.q||"").trim().toLowerCase();try{const a=(await members()).filter(m=>!q||[m.user.username,m.displayName,m.user.globalName||"",m.id].join(" ").toLowerCase().includes(q)).slice(0,30).map(memberJson);res.json({members:a})}catch(e){res.status(503).json({error:"تعذر تحميل الأعضاء"})}});
app.get("/api/groups",async(req,res)=>{
 const q=await pool.query("SELECT g.*,COALESCE(json_agg(json_build_object('username',gm.username)) FILTER (WHERE gm.username IS NOT NULL),'[]') members FROM community_groups g LEFT JOIN group_members gm ON gm.group_id=g.id WHERE g.status='open' GROUP BY g.id ORDER BY g.id DESC LIMIT 100");
 res.json({groups:q.rows});
});
app.post("/api/groups",auth,async(req,res)=>{
 const name=String(req.body?.name||"").trim().slice(0,80),description=String(req.body?.description||"").trim().slice(0,1000),u=me(req).username;
 if(name.length<2)return res.status(400).json({error:"اسم القروب قصير"});
 const q=await pool.query("INSERT INTO community_groups(name,description,owner_username) VALUES($1,$2,$3) RETURNING *",[name,description,u]);
 await pool.query("INSERT INTO group_members(group_id,username) VALUES($1,$2)",[q.rows[0].id,u]);
 res.status(201).json({ok:true,group:q.rows[0]});
});
app.post("/api/groups/:id/join",auth,async(req,res)=>{
 const id=Number(req.params.id),u=me(req).username;
 const g=await pool.query("SELECT * FROM community_groups WHERE id=$1 AND status='open'",[id]);if(!g.rowCount)return res.status(404).json({error:"القروب غير موجود"});
 const already=await pool.query("SELECT 1 FROM group_members WHERE group_id=$1 AND username=$2",[id,u]);if(already.rowCount)return res.status(409).json({error:"أنت عضو بالفعل"});
 const q=await pool.query("INSERT INTO group_join_requests(group_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *",[id,u]);if(!q.rowCount)return res.status(409).json({error:"لديك طلب سابق"});
 res.status(201).json({ok:true,request:q.rows[0],message:"تم إرسال طلب الانضمام"});
});
app.get("/api/groups/:id",async(req,res)=>{
 const q=await pool.query("SELECT g.*,COALESCE(json_agg(json_build_object('username',gm.username)) FILTER (WHERE gm.username IS NOT NULL),'[]') members FROM community_groups g LEFT JOIN group_members gm ON gm.group_id=g.id WHERE g.id=$1 GROUP BY g.id",[Number(req.params.id)]);
 if(!q.rowCount)return res.status(404).json({error:"القروب غير موجود"});res.json({group:q.rows[0]});
});
app.get("/api/chat/messages",async(req,res)=>{const q=await pool.query("SELECT id,username,discord_username,body,created_at FROM public_chat ORDER BY id DESC LIMIT 100");res.json({messages:q.rows.reverse()})});
app.post("/api/chat/messages",auth,async(req,res)=>{const body=String(req.body?.body||"").trim().slice(0,2000);if(!body)return res.status(400).json({error:"اكتب الرسالة"});const u=me(req);const q=await pool.query("INSERT INTO public_chat(username,discord_username,body) VALUES($1,$2,$3) RETURNING *",[u.username,u.discordUsername,body]);await pool.query("UPDATE app_users SET points=points+1 WHERE username=$1",[u.username]);res.status(201).json({ok:true,message:q.rows[0]})});
app.get("/api/private-messages",auth,async(req,res)=>{const u=me(req).username;const q=await pool.query("SELECT id,sender_username,recipient_username,body,created_at,read_at FROM private_messages WHERE sender_username=$1 OR recipient_username=$1 ORDER BY id DESC LIMIT 200",[u]);res.json({messages:q.rows})});
app.post("/api/private-messages",auth,async(req,res)=>{const to=String(req.body?.recipient||"").trim(),body=String(req.body?.body||"").trim().slice(0,4000);if(!to||!body)return res.status(400).json({error:"حدد المستلم واكتب الرسالة"});const target=await findUserByName(to);if(!target)return res.status(404).json({error:"المستلم غير موجود"});if(target.username===me(req).username)return res.status(400).json({error:"لا يمكنك مراسلة نفسك"});const q=await pool.query("INSERT INTO private_messages(sender_username,recipient_username,body) VALUES($1,$2,$3) RETURNING *",[me(req).username,target.username,body]);res.status(201).json({ok:true,message:q.rows[0]})});
app.post("/api/private-messages/:id/read",auth,async(req,res)=>{const q=await pool.query("UPDATE private_messages SET read_at=NOW() WHERE id=$1 AND recipient_username=$2 RETURNING id",[Number(req.params.id),me(req).username]);res.json({ok:Boolean(q.rowCount)})});
app.get("/api/jokes",async(req,res)=>{const q=await pool.query("SELECT * FROM jokes ORDER BY id DESC LIMIT 100");res.json({items:q.rows})});
app.post("/api/jokes",auth,async(req,res)=>{const body=String(req.body?.body||"").trim().slice(0,500);if(body.length<5)return res.status(400).json({error:"النكتة قصيرة"});const q=await pool.query("INSERT INTO jokes(username,body) VALUES($1,$2) RETURNING *",[me(req).username,body]);res.status(201).json({joke:q.rows[0]})});
app.post("/api/jokes/:id/react",auth,async(req,res)=>{const type=req.body?.type==="dislike"?"dislike":"like",jid=Number(req.params.id),u=me(req).username;const old=await pool.query("SELECT type FROM joke_reactions WHERE joke_id=$1 AND username=$2",[jid,u]);if(old.rowCount&&old.rows[0].type===type)return res.json({ok:true});if(old.rowCount){await pool.query("UPDATE joke_reactions SET type=$3 WHERE joke_id=$1 AND username=$2",[jid,u,type]);await pool.query("UPDATE jokes SET likes=likes+CASE WHEN $1='like' THEN 1 ELSE -1 END,dislikes=dislikes+CASE WHEN $1='dislike' THEN 1 ELSE -1 END WHERE id=$2",[type,jid])}else{await pool.query("INSERT INTO joke_reactions(joke_id,username,type) VALUES($1,$2,$3)",[jid,u,type]);await pool.query("UPDATE jokes SET "+(type==="like"?"likes":"dislikes")+"="+(type==="like"?"likes":"dislikes")+"+1 WHERE id=$1",[jid])}res.json({ok:true})});
app.get("/api/stories",async(req,res)=>{const q=await pool.query("SELECT * FROM stories ORDER BY id DESC LIMIT 50");res.json({items:q.rows})});
app.post("/api/stories/generate",async(req,res)=>{const genres={مغامرة:["في ليلة هادئة وصل إشعار غريب إلى هاتفه.","قادته الإشارة إلى باب لم يره أحد من قبل.","خلف الباب وجد خريطة تقوده إلى مكان جديد."],غموض:["توقفت الساعة عند نفس الدقيقة كل ليلة.","وجد ورقة في جيبه بخط لا يعرفه.","في الموعد اكتشف أن الرسالة تعرف سره."],"رعب خفيف":["انطفأت الأنوار لحظة واحدة.","عندما عادت كان الكرسي قد تحرك.","ضحك، ثم سمع نفس الضحكة من غرفة فارغة."],كوميديا:["قرر أن يبدأ يومه بنشاط.","ضبط خمس منبهات ثم عاد للنوم.","استيقظ يسأل لماذا الحياة صعبة."],خيال:["وجد بابًا خلف مكتبة قديمة.","دخل مدينة معلقة فوق السحاب.","في أول بيت وجد ذكرى لم يعشها بعد."]};const genre=genres[req.body?.genre]||genres["مغامرة"],length=String(req.body?.length||"قصيرة"),n=length==="طويلة"?3:length==="متوسطة"?2:1,body=genre.slice(0,n).join(" ");const q=await pool.query("INSERT INTO stories(username,genre,length,body) VALUES($1,$2,$3,$4) RETURNING *",[me(req)?.username||"زائر",req.body?.genre||"مغامرة",length,body]);res.status(201).json({story:q.rows[0]})});
app.get("/api/ratings",async(req,res)=>{const q=await pool.query("SELECT * FROM ratings ORDER BY id DESC LIMIT 100");res.json({items:q.rows})});
app.post("/api/ratings",auth,async(req,res)=>{const value=Math.max(1,Math.min(5,Number(req.body?.value)||0)),body=String(req.body?.body||"").trim().slice(0,1000);if(!value)return res.status(400).json({error:"التقييم غير صالح"});const q=await pool.query("INSERT INTO ratings(username,value,body) VALUES($1,$2,$3) RETURNING *",[me(req).username,value,body]);res.status(201).json({rating:q.rows[0]})});
app.post("/api/tickets",auth,async(req,res)=>{const subject=String(req.body?.subject||"").trim().slice(0,160),body=String(req.body?.body||"").trim().slice(0,4000);if(!subject||!body)return res.status(400).json({error:"اكتب عنوان التذكرة والرسالة"});const db=await pool.connect();try{await db.query("BEGIN");const t=await db.query("INSERT INTO tickets(username,subject) VALUES($1,$2) RETURNING *",[me(req).username,subject]);await db.query("INSERT INTO ticket_messages(ticket_id,username,body) VALUES($1,$2,$3)",[t.rows[0].id,me(req).username,body]);await db.query("COMMIT");res.status(201).json({ticket:t.rows[0]})}catch(e){await db.query("ROLLBACK");res.status(500).json({error:"تعذر إنشاء التذكرة"})}finally{db.release()}});
app.get("/api/tickets",auth,async(req,res)=>{const q=await pool.query("SELECT * FROM tickets WHERE username=$1 ORDER BY id DESC",[me(req).username]);res.json({items:q.rows})});
app.get("/api/tickets/:id",auth,async(req,res)=>{const q=await pool.query("SELECT * FROM tickets WHERE id=$1 AND username=$2",[Number(req.params.id),me(req).username]);if(!q.rowCount)return res.status(404).json({error:"التذكرة غير موجودة"});const m=await pool.query("SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY id",[Number(req.params.id)]);res.json({ticket:q.rows[0],messages:m.rows})});
app.post("/api/applications",async(req,res)=>{const discordUsername=String(req.body?.discordUsername||"").trim().slice(0,100),body=String(req.body?.body||"").trim().slice(0,4000),type=String(req.body?.type||"staff").slice(0,40);if(!discordUsername||!body)return res.status(400).json({error:"اكتب اسم Discord وتفاصيل التقديم"});const q=await pool.query("INSERT INTO applications(username,discord_username,type,body) VALUES($1,$2,$3,$4) RETURNING *",[me(req)?.username||null,discordUsername,type,body]);res.status(201).json({application:q.rows[0]})});
app.get("/api/anonymous",auth,async(req,res)=>{const q=await pool.query("SELECT id,body,created_at FROM anonymous_messages WHERE recipient_username=$1 ORDER BY id DESC LIMIT 100",[me(req).username]);res.json({items:q.rows})});
app.post("/api/anonymous",async(req,res)=>{const recipient=String(req.body?.recipient||"").trim(),body=String(req.body?.body||"").trim().slice(0,4000);if(!recipient||!body)return res.status(400).json({error:"حدد المستلم واكتب الفضفضة"});const target=await findUserByName(recipient);if(!target)return res.status(404).json({error:"المستلم غير موجود"});if(target.username===me(req)?.username)return res.status(400).json({error:"لا ترسل لنفسك"});const q=await pool.query("INSERT INTO anonymous_messages(recipient_username,body) VALUES($1,$2) RETURNING id,created_at",[target.username,body]);res.status(201).json({ok:true,message:q.rows[0]})});
app.get("/api/account",auth,async(req,res)=>{const q=await pool.query("SELECT username,discord_username,discord_user_id,role,banned,points,bio,avatar_url,created_at,last_login_at FROM app_users WHERE username=$1",[me(req).username]);if(!q.rowCount)return res.status(404).json({error:"الحساب غير موجود"});res.json({user:q.rows[0]})});
app.patch("/api/account/password",auth,async(req,res)=>{const old=String(req.body?.oldPassword||""),next=String(req.body?.newPassword||"");if(next.length<6)return res.status(400).json({error:"كلمة المرور الجديدة 6 أحرف على الأقل"});const q=await pool.query("SELECT id,password_hash FROM app_users WHERE username=$1",[me(req).username]);if(!q.rowCount||!await bcrypt.compare(old,q.rows[0].password_hash))return res.status(400).json({error:"كلمة المرور الحالية غير صحيحة"});await pool.query("UPDATE app_users SET password_hash=$1 WHERE id=$2",[await bcrypt.hash(next,12),q.rows[0].id]);res.json({ok:true})});
app.get("/api/admin/tickets",owner,async(req,res)=>{const q=await pool.query("SELECT * FROM tickets ORDER BY id DESC LIMIT 200");res.json({items:q.rows})});
app.post("/api/admin/tickets/:id/reply",owner,async(req,res)=>{const body=String(req.body?.body||"").trim().slice(0,4000);if(!body)return res.status(400).json({error:"اكتب الرد"});await pool.query("INSERT INTO ticket_messages(ticket_id,username,body) VALUES($1,$2,$3)",[Number(req.params.id),me(req).username,body]);await pool.query("UPDATE tickets SET updated_at=NOW() WHERE id=$1",[Number(req.params.id)]);res.json({ok:true})});
app.post("/api/admin/tickets/:id/close",owner,async(req,res)=>{await pool.query("UPDATE tickets SET status='closed',updated_at=NOW() WHERE id=$1",[Number(req.params.id)]);res.json({ok:true})});
app.get("/api/admin/applications",owner,async(req,res)=>{const q=await pool.query("SELECT * FROM applications ORDER BY id DESC LIMIT 200");res.json({items:q.rows})});
app.post("/api/admin/applications/:id/decision",owner,async(req,res)=>{const status=req.body?.status==="accepted"?"accepted":"rejected";const note=String(req.body?.note||"").slice(0,1000);await pool.query("UPDATE applications SET status=$2,decision_note=$3,updated_at=NOW() WHERE id=$1",[Number(req.params.id),status,note]);res.json({ok:true})});
app.get("/api/admin/groups",owner,async(req,res)=>{const q=await pool.query("SELECT * FROM community_groups ORDER BY id DESC LIMIT 200");res.json({groups:q.rows})});
app.get("/api/admin/logs",owner,async(req,res)=>{const q=await pool.query("SELECT id,created_at,username,action,details FROM (SELECT id,created_at,username,'system' action,body details FROM public_chat) x ORDER BY id DESC LIMIT 200");res.json({items:q.rows})});

app.use((req,res,next)=>req.path.startsWith("/api/")?res.status(404).json({error:"المسار غير موجود"}):next());
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
(async()=>{try{await init();await ensureOwner();await client.login(token);client.once("ready",()=>console.log("MLD Discord ready:",client.user.tag));app.listen(port,()=>console.log("MLD rebuilt server listening on",port))}catch(e){console.error("BOOT FAILED",e);process.exit(1)}})();
