"use strict";
require("dotenv").config();

const path=require("path");
const express=require("express");
const cors=require("cors");
const helmet=require("helmet");
const session=require("express-session");
const PgSession=require("connect-pg-simple")(session);
const {Pool}=require("pg");
const bcrypt=require("bcryptjs");
const {Client,GatewayIntentBits,EmbedBuilder}=require("discord.js");

const token=process.env.DISCORD_BOT_TOKEN;
const guildId=process.env.DISCORD_GUILD_ID;
const port=Number(process.env.PORT||3000);
const app=express();
app.disable("x-powered-by");
app.use(helmet({contentSecurityPolicy:false}));
app.use(cors({origin:true,credentials:true}));
app.use(express.json({limit:"50kb"}));
app.use(express.static(path.join(__dirname,"public")));

const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes("railway.app")?{rejectUnauthorized:false}:undefined}):null;
if(pool){
 app.use(session({store:new PgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),secret:process.env.SESSION_SECRET||"change-me",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:1000*60*60*24*30}}));
}else{
 app.use(session({secret:process.env.SESSION_SECRET||"change-me",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax"}}));
}

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildVoiceStates]});
const leadershipRoleIds=["1530712642384040027","1521187079336362024","1531109479264026706","1548732297669255259","1548732341185155103","1548732606508703744"];
const leadershipRoleSet=new Set(leadershipRoleIds);
const importantPermissionNames=new Set(["Administrator","ManageGuild","ManageRoles","ManageChannels","ManageMessages","ManageWebhooks","ManageNicknames","BanMembers","KickMembers","ModerateMembers","MentionEveryone","ViewAuditLog","ManageEvents","ManageThreads","ManageEmojisAndStickers"]);
const activity=new Map(),voiceSessions=new Map(),sendHits=new Map();
let guildCache=null,guildCacheAt=0,guildFetchPromise=null,memberSnapshot=null,memberSnapshotAt=0,memberFetchPromise=null;
const MEMBER_CACHE_TTL=45000,GUILD_CACHE_TTL=15000;

async function db(sql,params=[]){if(!pool)throw new Error("DATABASE_UNAVAILABLE");return pool.query(sql,params)}
async function initDb(){
 if(!pool)return;
 await db(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',avatar TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS groups(id SERIAL PRIMARY KEY,name TEXT NOT NULL,description TEXT DEFAULT '',owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS group_members(group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,role TEXT DEFAULT 'member',PRIMARY KEY(group_id,user_id));
 CREATE TABLE IF NOT EXISTS tickets(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT DEFAULT 'open',created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS applications(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,type TEXT NOT NULL,data JSONB DEFAULT '{}'::jsonb,status TEXT DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS reviews(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),text TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS watch_rooms(id SERIAL PRIMARY KEY,name TEXT NOT NULL,owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,url TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,meta JSONB DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ DEFAULT NOW());`);
}
async function audit(req,action,meta={}){try{await db("INSERT INTO audit_logs(user_id,action,meta) VALUES($1,$2,$3)",[req.session?.user?.id||null,action,JSON.stringify(meta)])}catch{}}
function requireAuth(req,res,next){if(!req.session.user)return res.status(401).json({error:"يجب تسجيل الدخول"});next()}
function requireStaff(req,res,next){if(!req.session.user||!["owner","admin","staff"].includes(req.session.user.role))return res.status(403).json({error:"لا تملك صلاحية"});next()}
function safeUser(u){return{id:u.id,username:u.username,email:u.email,displayName:u.display_name,role:u.role,avatar:u.avatar,createdAt:u.created_at}}
function getActivity(id){if(!activity.has(id))activity.set(id,{messages:0,mentionsReceived:0,mentionsSent:0,voiceMinutes:0,voiceJoins:0,chatRounds:0});return activity.get(id)}
async function getGuild(){if(guildCache&&Date.now()-guildCacheAt<GUILD_CACHE_TTL)return guildCache;if(guildFetchPromise)return guildFetchPromise;guildFetchPromise=client.guilds.fetch(guildId).then(g=>{guildCache=g;guildCacheAt=Date.now();return g}).finally(()=>guildFetchPromise=null);return guildFetchPromise}
function invalidateMemberSnapshot(){memberSnapshotAt=0}
async function getAllMembers(guild){if(memberSnapshot&&Date.now()-memberSnapshotAt<MEMBER_CACHE_TTL)return memberSnapshot;if(memberFetchPromise)return memberFetchPromise;memberFetchPromise=guild.members.fetch().then(c=>{memberSnapshot=[...c.values()];memberSnapshotAt=Date.now();return memberSnapshot}).catch(e=>{if(memberSnapshot?.length)return memberSnapshot;throw e}).finally(()=>memberFetchPromise=null);return memberFetchPromise}
function importantPermissions(c){return c.toArray().filter(x=>importantPermissionNames.has(x))}
function roleJson(role,membersCount=role.members?.size||0){return{id:role.id,name:role.name,color:role.hexColor,position:role.position,permissions:importantPermissions(role.permissions),membersCount,mentionable:role.mentionable}}
function memberJson(m){const roles=m.roles.cache.filter(r=>r.id!==m.guild.id).sort((a,b)=>b.position-a.position).map(r=>roleJson(r));const lead=roles.filter(r=>leadershipRoleSet.has(r.id));return{id:m.id,name:m.displayName,username:m.user.username,globalName:m.user.globalName,bot:m.user.bot,avatar:m.user.displayAvatarURL({extension:"png",size:256}),joinedAt:m.joinedAt,roles,importantRoles:lead,rank:lead[0]?.name||roles[0]?.name||"عضو",stats:getActivity(m.id)}}
function sortedMemberJson(ms){return[...ms].sort((a,b)=>{const ar=a.roles.cache.filter(r=>leadershipRoleSet.has(r.id)).sort((x,y)=>y.position-x.position).first();const br=b.roles.cache.filter(r=>leadershipRoleSet.has(r.id)).sort((x,y)=>y.position-x.position).first();return(br?.position||0)-(ar?.position||0)}).map(memberJson)}

app.get("/health",(req,res)=>res.json({ok:true,botReady:client.isReady(),database:Boolean(pool)}));
app.get("/api/public/server",async(req,res)=>{try{const g=await getGuild();res.json({id:g.id,name:g.name,icon:g.iconURL({extension:"png",size:256}),memberCount:g.memberCount,ownerName:process.env.SERVER_FOUNDER_NAME||"فهد المطيري",invite:process.env.DISCORD_INVITE_URL||""})}catch(e){res.status(503).json({error:"Discord server unavailable"})}});
app.get("/api/public/members",async(req,res)=>{try{const ms=await getAllMembers(await getGuild()),q=String(req.query.q||"").trim().toLocaleLowerCase("ar").replace(/^@/,""),filtered=q?ms.filter(m=>[m.displayName,m.user.username,m.user.globalName,m.user.tag,m.id].filter(Boolean).join(" ").toLocaleLowerCase("ar").includes(q)):ms;res.json({members:sortedMemberJson(filtered),total:filtered.length,totalServerMembers:ms.length,updatedAt:memberSnapshotAt})}catch(e){res.status(503).json({error:"Members unavailable"})}});
app.get("/api/public/roles",async(req,res)=>{try{const g=await getGuild(),ms=await getAllMembers(g);res.json({roles:leadershipRoleIds.map(id=>g.roles.cache.get(id)).filter(Boolean).map(r=>roleJson(r,ms.filter(m=>m.roles.cache.has(r.id)).length)),updatedAt:memberSnapshotAt})}catch(e){res.status(503).json({error:"Roles unavailable"})}});
app.get("/api/public/roles/:id/members",async(req,res)=>{try{const g=await getGuild(),r=g.roles.cache.get(req.params.id);if(!r||!leadershipRoleSet.has(r.id))return res.status(404).json({error:"Role not found"});const ms=(await getAllMembers(g)).filter(m=>m.roles.cache.has(r.id));res.json({role:roleJson(r,ms.length),members:sortedMemberJson(ms)})}catch(e){res.status(503).json({error:"Role members unavailable"})}});
app.get("/api/public/top",async(req,res)=>{try{const ms=(await getAllMembers(await getGuild())).map(memberJson),top=k=>[...ms].sort((a,b)=>(b.stats[k]||0)-(a.stats[k]||0)).slice(0,10);res.json({messages:top("messages"),mentions:top("mentionsReceived"),voice:top("voiceMinutes"),joins:top("voiceJoins")})}catch(e){res.status(503).json({error:"Top unavailable"})}});
app.get("/api/public/member/:id",async(req,res)=>{try{const g=await getGuild(),m=await g.members.fetch(req.params.id).catch(()=>null);if(!m)return res.status(404).json({error:"Member not found"});const highest=m.roles.cache.filter(r=>r.id!==g.id&&!r.managed).sort((a,b)=>b.position-a.position).first();res.json({...memberJson(m),highestRole:highest?roleJson(highest):null,permissions:highest?importantPermissions(highest.permissions):[]})}catch(e){res.status(404).json({error:"Member not found"})}});
app.post("/api/public/message",async(req,res)=>{const now=Date.now(),ip=req.ip||"unknown",last=sendHits.get(ip)||0;if(now-last<10000)return res.status(429).json({error:"انتظر 10 ثواني قبل الإرسال"});const title=String(req.body?.title||"رسالة من إدارة MLD").trim(),text=String(req.body?.message||"").trim(),targetId=String(req.body?.memberId||"").trim();if(!targetId||!text||text.length>2000)return res.status(400).json({error:"بيانات الرسالة غير صحيحة"});try{const m=await(await getGuild()).members.fetch(targetId).catch(()=>null);if(!m)return res.status(404).json({error:"العضو غير موجود"});await m.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(text).setColor("#ff9cdc").setFooter({text:"MLD Community"}).setTimestamp()]});sendHits.set(ip,now);res.json({ok:true})}catch(e){res.status(500).json({error:"تعذر الإرسال؛ قد يكون الخاص مقفلًا"})}});

app.get("/api/auth/me",(req,res)=>res.json({user:req.session.user||null}));
app.post("/api/auth/register",async(req,res)=>{try{const username=String(req.body.username||"").trim().toLowerCase(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||""),displayName=String(req.body.displayName||username).trim();if(!/^[a-z0-9_.-]{3,24}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||password.length<6)return res.status(400).json({error:"بيانات التسجيل غير صحيحة"});const exists=await db("SELECT id FROM users WHERE username=$1 OR email=$2",[username,email]);if(exists.rowCount)return res.status(409).json({error:"اسم المستخدم أو البريد مستخدم"});const hash=await bcrypt.hash(password,12);const r=await db("INSERT INTO users(username,email,password_hash,display_name) VALUES($1,$2,$3,$4) RETURNING *",[username,email,hash,displayName]);req.session.user=safeUser(r.rows[0]);await audit(req,"register",{username});res.json({user:req.session.user})}catch(e){res.status(500).json({error:"تعذر إنشاء الحساب"})}});
app.post("/api/auth/login",async(req,res)=>{try{const login=String(req.body.login||"").trim().toLowerCase(),password=String(req.body.password||"");const r=await db("SELECT * FROM users WHERE username=$1 OR email=$1",[login]);if(!r.rowCount||!(await bcrypt.compare(password,r.rows[0].password_hash)))return res.status(401).json({error:"بيانات الدخول غير صحيحة"});req.session.user=safeUser(r.rows[0]);await audit(req,"login");res.json({user:req.session.user})}catch(e){res.status(500).json({error:"تعذر تسجيل الدخول"})}});
app.post("/api/auth/logout",async(req,res)=>{await audit(req,"logout");req.session.destroy(()=>res.json({ok:true}))});

app.get("/api/groups",async(req,res)=>{try{const r=await db("SELECT g.*,u.display_name owner_name,(SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) members_count FROM groups g LEFT JOIN users u ON u.id=g.owner_id ORDER BY g.created_at DESC");res.json({groups:r.rows})}catch(e){res.status(500).json({error:"المجموعات غير متاحة"})}});
app.post("/api/groups",requireAuth,async(req,res)=>{try{const name=String(req.body.name||"").trim(),description=String(req.body.description||"").trim();if(!name)return res.status(400).json({error:"اكتب اسم المجموعة"});const r=await db("INSERT INTO groups(name,description,owner_id) VALUES($1,$2,$3) RETURNING *",[name,description,req.session.user.id]);await db("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'owner')",[r.rows[0].id,req.session.user.id]);await audit(req,"group_create",{groupId:r.rows[0].id});res.json({group:r.rows[0]})}catch(e){res.status(500).json({error:"تعذر إنشاء المجموعة"})}});
app.post("/api/groups/:id/join",requireAuth,async(req,res)=>{try{await db("INSERT INTO group_members(group_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,req.session.user.id]);await audit(req,"group_join",{groupId:req.params.id});res.json({ok:true})}catch(e){res.status(500).json({error:"تعذر الانضمام"})}});

app.get("/api/tickets",requireAuth,async(req,res)=>{const r=await db("SELECT * FROM tickets WHERE user_id=$1 ORDER BY created_at DESC",[req.session.user.id]);res.json({tickets:r.rows})});
app.post("/api/tickets",requireAuth,async(req,res)=>{const subject=String(req.body.subject||"").trim(),message=String(req.body.message||"").trim();if(!subject||!message)return res.status(400).json({error:"أكمل بيانات التذكرة"});const r=await db("INSERT INTO tickets(user_id,subject,message) VALUES($1,$2,$3) RETURNING *",[req.session.user.id,subject,message]);await audit(req,"ticket_create",{ticketId:r.rows[0].id});res.json({ticket:r.rows[0]})});
app.get("/api/applications",requireAuth,async(req,res)=>{const r=await db("SELECT * FROM applications WHERE user_id=$1 ORDER BY created_at DESC",[req.session.user.id]);res.json({applications:r.rows})});
app.post("/api/applications",requireAuth,async(req,res)=>{const type=String(req.body.type||"staff"),data=req.body.data||{};const r=await db("INSERT INTO applications(user_id,type,data) VALUES($1,$2,$3) RETURNING *",[req.session.user.id,type,JSON.stringify(data)]);await audit(req,"application_create",{applicationId:r.rows[0].id,type});res.json({application:r.rows[0]})});
app.get("/api/reviews",async(req,res)=>{const r=await db("SELECT r.*,u.display_name FROM reviews r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100");res.json({reviews:r.rows})});
app.post("/api/reviews",requireAuth,async(req,res)=>{const rating=Math.round(Number(req.body.rating)),text=String(req.body.text||"").trim();if(rating<1||rating>5||!text)return res.status(400).json({error:"التقييم غير صحيح"});const r=await db("INSERT INTO reviews(user_id,rating,text) VALUES($1,$2,$3) RETURNING *",[req.session.user.id,rating,text]);await audit(req,"review_create",{rating});res.json({review:r.rows[0]})});
app.get("/api/watch",async(req,res)=>{const r=await db("SELECT w.*,u.display_name owner_name FROM watch_rooms w LEFT JOIN users u ON u.id=w.owner_id ORDER BY w.created_at DESC");res.json({rooms:r.rows})});
app.post("/api/watch",requireAuth,async(req,res)=>{const name=String(req.body.name||"").trim(),url=String(req.body.url||"").trim();if(!name)return res.status(400).json({error:"اسم الغرفة مطلوب"});const r=await db("INSERT INTO watch_rooms(name,owner_id,url) VALUES($1,$2,$3) RETURNING *",[name,req.session.user.id,url]);await audit(req,"watch_room_create",{roomId:r.rows[0].id});res.json({room:r.rows[0]})});
app.get("/api/admin/logs",requireStaff,async(req,res)=>{const r=await db("SELECT l.*,u.display_name FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 200");res.json({logs:r.rows})});
app.get("/api/admin/users",requireStaff,async(req,res)=>{const r=await db("SELECT id,username,email,display_name,role,created_at FROM users ORDER BY created_at DESC");res.json({users:r.rows})});
app.post("/api/admin/users/:id/role",requireStaff,async(req,res)=>{const role=["member","staff","admin","owner"].includes(req.body.role)?req.body.role:null;if(!role)return res.status(400).json({error:"رتبة غير صحيحة"});await db("UPDATE users SET role=$1 WHERE id=$2",[role,req.params.id]);await audit(req,"user_role_change",{targetId:req.params.id,role});res.json({ok:true})});

client.on("guildMemberAdd",invalidateMemberSnapshot);client.on("guildMemberRemove",invalidateMemberSnapshot);client.on("guildMemberUpdate",invalidateMemberSnapshot);
client.on("messageCreate",m=>{if(m.author.bot)return;const s=getActivity(m.author.id);s.messages++;s.chatRounds++;for(const id of m.mentions.users.keys()){getActivity(id).mentionsReceived++;s.mentionsSent++}});
client.on("voiceStateUpdate",(oldState,newState)=>{const id=newState.id;if(!oldState.channelId&&newState.channelId){voiceSessions.set(id,Date.now());getActivity(id).voiceJoins++}if(oldState.channelId&&!newState.channelId&&voiceSessions.has(id)){getActivity(id).voiceMinutes+=Math.round((Date.now()-voiceSessions.get(id))/60000);voiceSessions.delete(id)}});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
(async()=>{try{await initDb()}catch(e){console.error("DB init failed:",e.message)}app.listen(port,()=>console.log("MLD listening on "+port));if(token&&guildId){client.once("ready",()=>console.log("Logged in as "+client.user.tag));client.login(token).catch(e=>console.error("Discord login failed:",e.message))}else console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID")})();
