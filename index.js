"use strict";

require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const helmet = require("helmet");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT || 3000);

if (!token || !guildId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
  process.exit(1);
}

const baseIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildVoiceStates
];
const optionalIntents = [];
if (String(process.env.DISCORD_ENABLE_MEMBERS || "").toLowerCase() === "true") optionalIntents.push(GatewayIntentBits.GuildMembers);
if (String(process.env.DISCORD_ENABLE_PRESENCES || "").toLowerCase() === "true") optionalIntents.push(GatewayIntentBits.GuildPresences);
if (String(process.env.DISCORD_ENABLE_MESSAGE_CONTENT || "").toLowerCase() === "true") optionalIntents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents: [...baseIntents, ...optionalIntents] });

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const leadershipRoleIds = [
  "1530712642384040027",
  "1521187079336362024",
  "1531109479264026706",
  "1548732297669255259",
  "1548732341185155103",
  "1548732606508703744"
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

// Temporary in-memory storage. Replace with a real database later.
const users = new Map();
const admins = new Set();
const groups = new Map();
const groupMembers = new Map();
const groupJoinRequests = new Map();
const groupMessages = new Map();
const tickets = new Map();
const ticketMessages = new Map();
const applications = new Map();
const logs = [];
const privateMessageLogs = [];
const privateMessages = new Map();
const watchRooms = new Map();
const reviews = new Map();
const notifications = new Map();
const games = new Map();
const gameInvites = new Map();
const gameStats = new Map();
const announcements = [];

let nextUserId = 1;
let nextGroupId = 1;
let nextJoinId = 1;
let nextMessageId = 1;
let nextTicketId = 1;
let nextTicketMessageId = 1;
let nextApplicationId = 1;
let nextWatchRoomId = 1;
let nextReviewId = 1;
let nextNotificationId = 1;
let nextGameId = 1;
let nextInviteId = 1;
let nextAnnouncementId = 1;

const activity = new Map();
const voiceSessions = new Map();
const sendHits = new Map();
const guildInviteCache = { value: "", at: 0 };

let guildCache = null;
let guildCacheAt = 0;
let guildFetchPromise = null;
let memberSnapshot = null;
let memberSnapshotAt = 0;
let memberFetchPromise = null;

const MEMBER_CACHE_TTL = 5 * 60_000;
const GUILD_CACHE_TTL = 5 * 60_000;
const MAX_LOGS = 500;

function now() {
  return new Date().toISOString();
}

function id(prefix, value) {
  return `${prefix}_${value}`;
}

function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function slugify(value) {
  return cleanText(value, 80)
    .toLocaleLowerCase("ar")
    .replace(/[^\p{L}\p{N}\s_.-]/gu, "")
    .replace(/[\s_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `group-${Date.now()}`;
}

function randomToken() {
  return crypto.randomBytes(18).toString("hex");
}

function pushLog(type, data = {}) {
  logs.unshift({ id: randomToken(), type, at: now(), ...data });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

function getActivity(userId) {
  if (!activity.has(userId)) {
    activity.set(userId, {
      messages: 0,
      mentionsReceived: 0,
      mentionsSent: 0,
      voiceMinutes: 0,
      voiceJoins: 0,
      chatRounds: 0
    });
  }
  return activity.get(userId);
}

function roleJson(role, membersCount = role.members?.size || 0) {
  return {
    id: role.id,
    name: role.name,
    color: role.hexColor,
    position: role.position,
    permissions: role.permissions.toArray().filter((p) => importantPermissionNames.has(p)),
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
    name: member.displayName || member.user.globalName || member.user.username,
    displayName: member.displayName,
    username: member.user.username,
    globalName: member.user.globalName,
    bot: member.user.bot,
    status: member.presence?.status || "offline",
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
      const aRole = a.roles.cache.filter((r) => leadershipRoleSet.has(r.id)).sort((x, y) => y.position - x.position).first();
      const bRole = b.roles.cache.filter((r) => leadershipRoleSet.has(r.id)).sort((x, y) => y.position - x.position).first();
      return (bRole?.position || 0) - (aRole?.position || 0);
    })
    .map(memberJson);
}

async function getGuild() {
  if (guildCache && Date.now() - guildCacheAt < GUILD_CACHE_TTL) return guildCache;
  if (guildFetchPromise) return guildFetchPromise;

  guildFetchPromise = (client.guilds.cache.get(guildId) ? Promise.resolve(client.guilds.cache.get(guildId)) : client.guilds.fetch(guildId))
    .then((guild) => {
      guildCache = guild;
      guildCacheAt = Date.now();
      return guild;
    })
    .finally(() => { guildFetchPromise = null; });

  return guildFetchPromise;
}

function invalidateMemberSnapshot() {
  memberSnapshotAt = 0;
}

function refreshMemberSnapshot(guild) {
  if (memberFetchPromise) return memberFetchPromise;
  memberFetchPromise = Promise.race([
    guild.members.fetch(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Discord member fetch timeout")), 8000))
  ])
    .then((collection) => {
      memberSnapshot = [...collection.values()];
      memberSnapshotAt = Date.now();
      return memberSnapshot;
    })
    .catch((error) => {
      console.error("Discord member refresh failed:", error.message);
      const cached = [...guild.members.cache.values()];
      if (cached.length) {
        memberSnapshot = cached;
        memberSnapshotAt = Date.now();
        return memberSnapshot;
      }
      return [];
    })
    .finally(() => { memberFetchPromise = null; });
  return memberFetchPromise;
}

async function getAllMembers(guild, options = {}) {
  const cached = memberSnapshot || [...guild.members.cache.values()];
  if (cached.length) {
    if (options.refresh) refreshMemberSnapshot(guild);
    return cached;
  }
  return refreshMemberSnapshot(guild);
}

function userJson(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    discordId: user.discordId || null,
    createdAt: user.createdAt,
    suspended: Boolean(user.suspended),
    isAdmin: admins.has(user.id)
  };
}

function createUser(username, password, discordId = "") {
  const user = {
    id: String(nextUserId++),
    username: cleanText(username, 32),
    passwordHash: bcrypt.hashSync(password, 12),
    discordId: cleanText(discordId, 30),
    createdAt: now(),
    suspended: false
  };
  users.set(user.id, user);
  return user;
}

function findUserByUsername(username) {
  const target = cleanText(username, 32).toLocaleLowerCase("ar");
  return [...users.values()].find((u) => u.username.toLocaleLowerCase("ar") === target) || null;
}

function currentUser(req) {
  return req.session?.userId ? users.get(req.session.userId) || null : null;
}

function isAdminUser(user) {
  return Boolean(user && admins.has(user.id));
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  if (user.suspended) return res.status(403).json({ error: "الحساب موقوف" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  if (!isAdminUser(user)) return res.status(403).json({ error: "صلاحيات الإدارة مطلوبة" });
  req.user = user;
  next();
}

function isGroupMember(groupId, userId) {
  const group = groups.get(String(groupId));
  if (!group) return false;
  if (group.ownerId === userId) return true;
  const members = groupMembers.get(group.id) || new Map();
  return members.get(userId)?.status === "approved";
}

function groupView(group, includePrivate = false) {
  const members = groupMembers.get(group.id) || new Map();
  const result = {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    category: group.category,
    icon: group.icon,
    status: group.status,
    owner: userJson(users.get(group.ownerId)),
    memberCount: [...members.values()].filter((m) => m.status === "approved").length + 1,
    createdAt: group.createdAt
  };
  if (includePrivate) {
    result.discordRoleId = group.discordRoleId || null;
    result.discordTextChannelId = group.discordTextChannelId || null;
    result.discordVoiceChannelId = group.discordVoiceChannelId || null;
    result.members = [...members.values()].map((m) => ({ ...m, user: userJson(users.get(m.userId)) }));
  }
  return result;
}

async function getNotificationChannel() {
  const guild = await getGuild();
  const configured = process.env.DISCORD_NOTIFICATION_CHANNEL_ID;
  if (configured) {
    const channel = await guild.channels.fetch(configured).catch(() => null);
    if (channel?.isTextBased()) return channel;
  }

  await guild.channels.fetch().catch(() => null);
  return guild.channels.cache.find((channel) => {
    if (!channel.isTextBased()) return false;
    const name = String(channel.name || "").toLocaleLowerCase("ar");
    return /website|site|admin|طلبات|الموقع|إدارة/.test(name);
  }) || null;
}

async function notifyDiscordWebsite({ title, description, color = 0xff9cdc, fields = [] }) {
  try {
    const channel = await getNotificationChannel();
    if (!channel) return false;
    const embed = new EmbedBuilder()
      .setTitle(cleanText(title, 256))
      .setDescription(cleanText(description, 4000))
      .setColor(color)
      .setTimestamp();
    if (fields.length) embed.addFields(fields.slice(0, 25));
    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error("Discord notification:", error.message);
    return false;
  }
}

async function setupDiscordGroup(group) {
  const guild = await getGuild();
  const role = await guild.roles.create({
    name: `Group · ${cleanText(group.name, 80)}`,
    reason: `Website group ${group.id}`
  });

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    }
  ];

  const category = await guild.channels.create({
    name: `GROUP · ${cleanText(group.name, 70)}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: `Website group ${group.id}`
  });

  const textChannel = await guild.channels.create({
    name: "chat",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: `Website group ${group.id}`
  });

  const voiceChannel = await guild.channels.create({
    name: "voice",
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: `Website group ${group.id}`
  });

  group.discordRoleId = role.id;
  group.discordCategoryId = category.id;
  group.discordTextChannelId = textChannel.id;
  group.discordVoiceChannelId = voiceChannel.id;
  group.discordReadyAt = now();
  return group;
}

async function syncGroupMemberToDiscord(group, user) {
  if (!group.discordRoleId || !user?.discordId) return false;
  const guild = await getGuild();
  const member = await guild.members.fetch(user.discordId).catch(() => null);
  if (!member) return false;
  await member.roles.add(group.discordRoleId, `Website group ${group.id}`).catch(() => null);
  return true;
}

function validateUsername(username) {
  return /^[\p{L}\p{N}_.-]{3,32}$/u.test(username);
}

function publicGame(game) {
  return {
    id: game.id,
    type: game.type,
    name: game.name,
    status: game.status,
    host: userJson(users.get(game.hostId)),
    players: game.players.map((p) => ({ ...p, user: userJson(users.get(p.userId)) })),
    maxPlayers: game.maxPlayers,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt
  };
}

function gameStatsFor(userId) {
  if (!gameStats.has(userId)) gameStats.set(userId, { played: 0, wins: 0, losses: 0, draws: 0 });
  return gameStats.get(userId);
}

function createGame(type, hostId, maxPlayers) {
  const names = {
    uno: "UNO",
    ludo: "لودو",
    baloot: "بلوت",
    daqsh: "دقش",
    qawsar: "قوسر"
  };
  const game = {
    id: String(nextGameId++),
    type,
    name: names[type] || type,
    status: "waiting",
    hostId,
    maxPlayers,
    players: [{ userId: hostId, seat: 1, ready: true }],
    state: {},
    createdAt: now(),
    updatedAt: now()
  };
  games.set(game.id, game);
  return game;
}

// Bootstrap website owner account from environment.
const ownerUsername = cleanText(process.env.OWNER_USERNAME || "owner", 32);
const ownerPassword = String(process.env.OWNER_PASSWORD || "change-me");
let owner = findUserByUsername(ownerUsername);
if (!owner) owner = createUser(ownerUsername, ownerPassword, process.env.OWNER_ID || "");
else owner.passwordHash = bcrypt.hashSync(ownerPassword, 12);
admins.add(owner.id);

// -------------------- Health / auth --------------------

app.get("/health", async (req, res) => {
  let guild = null;
  let memberCount = 0;
  let memberFetch = "not-run";
  try {
    guild = await getGuild();
    memberCount = guild.memberCount || guild.members.cache.size || 0;
    memberFetch = "ok";
  } catch (error) {
    memberFetch = error.message;
  }
  res.json({ ok:true, discord:{ready:client.isReady(),tag:client.user?.tag||null,guildId:guildId||null,guildName:guild?.name||null,memberCount,memberFetch} });
});

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  res.json({ authenticated: Boolean(user), user: userJson(user) });
});

app.post("/api/auth/register", async (req, res) => {
  const username = cleanText(req.body?.username, 32);
  const password = String(req.body?.password || "");
  const discordId = cleanText(req.body?.discordId, 30);

  if (!validateUsername(username)) return res.status(400).json({ error: "اسم المستخدم من 3 إلى 32 حرفًا ويقبل الحروف والأرقام و _ . - فقط" });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "كلمة المرور يجب أن تكون بين 8 و128 حرفًا" });
  if (findUserByUsername(username)) return res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" });

  const user = createUser(username, password, discordId);
  req.session.userId = user.id;
  pushLog("user_registered", { userId: user.id, username: user.username });
  res.status(201).json({ user: userJson(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const username = cleanText(req.body?.username, 32);
  const password = String(req.body?.password || "");
  const user = findUserByUsername(username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  if (user.suspended) return res.status(403).json({ error: "الحساب موقوف" });

  req.session.userId = user.id;
  pushLog("user_login", { userId: user.id });
  res.json({ user: userJson(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.patch("/api/auth/profile", requireAuth, (req, res) => {
  const discordId = cleanText(req.body?.discordId, 30);
  req.user.discordId = discordId;
  res.json({ user: userJson(req.user) });
});
// -------------------- Public site analytics --------------------
let siteVisits = 0;
const recentVisitors = new Map();

app.post("/api/public/visit", (req, res) => {
  const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const nowMs = Date.now();
  const last = recentVisitors.get(key) || 0;
  if (nowMs - last > 30 * 60 * 1000) {
    siteVisits += 1;
    recentVisitors.set(key, nowMs);
  }
  res.json({ visits: siteVisits });
});

app.get("/api/public/stats", async (req, res) => {
  try {
    const guild = await getGuild();
    const allMembers = await getAllMembers(guild, { refresh: true });
    const allReviews = [...reviews.values()].flat();
    const avg = allReviews.length ? allReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / allReviews.length : 0;
    res.json({
      visits: siteVisits,
      members: guild.memberCount,
      websiteUsers: users.size,
      groups: groups.size,
      reviews: allReviews.length,
      averageRating: Number(avg.toFixed(1)),
      online: allMembers.filter((m) => m.presence?.status && m.presence.status !== "offline").length
    });
  } catch (error) {
    console.error("Public stats endpoint:", error);
    res.status(503).json({ error: "Stats temporarily unavailable" });
  }
});

app.get("/api/public/reviews", (req, res) => {
  const allReviews = [...reviews.values()].flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reviews: allReviews.slice(0, 8) });
});

// -------------------- Public Discord API --------------------

app.get("/api/public/community", async (req, res) => {
  try {
    const guild = await getGuild();
    const members = await getAllMembers(guild, { refresh: true });
    const online = members.filter(m => m.presence?.status && m.presence.status !== "offline").length;
    const roleCounts = {};
    for (const m of members) {
      for (const r of m.roles.cache.values()) {
        if (r.id !== guild.id) roleCounts[r.id] = (roleCounts[r.id] || 0) + 1;
      }
    }
    const roles = [...guild.roles.cache.values()]
      .filter(r => r.id !== guild.id)
      .sort((a,b) => (roleCounts[b.id]||0) - (roleCounts[a.id]||0) || b.position-a.position)
      .slice(0,12)
      .map(r => ({id:r.id,name:r.name,color:r.hexColor,count:roleCounts[r.id]||0,position:r.position}));
    const recent = members.filter(m => !m.user.bot).sort((a,b) => {
      const aa=getActivity(a.id), bb=getActivity(b.id); return (bb.messages+bb.voiceJoins+bb.chatRounds)-(aa.messages+aa.voiceJoins+aa.chatRounds);
    }).slice(0,10).map(memberJson);
    res.json({communityName: process.env.COMMUNITY_NAME || "مجتمع ملاذ", guild:{id:guild.id,name:guild.name,icon:guild.iconURL({extension:"png",size:256}),memberCount:guild.memberCount}, online, roles, activeMembers:recent, bot:{online:client.isReady(),tag:client.user?.tag||null}});
  } catch(error){ console.error("Community endpoint:",error); res.status(503).json({error:"Discord community unavailable"}); }
});

app.get("/api/public/server", async (req, res) => {
  try {
    const guild = await getGuild();
    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ extension: "png", size: 256 }),
      memberCount: guild.memberCount,
      visits: siteVisits,
      websiteUsers: users.size,
      online: (await getAllMembers(guild)).filter((m) => m.presence?.status && m.presence.status !== "offline").length,
      averageRating: (() => { const all = [...reviews.values()].flat(); return all.length ? Number((all.reduce((s, r) => s + Number(r.rating || 0), 0) / all.length).toFixed(1)) : 0; })(),
      recentReviews: [...reviews.values()].flat().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,8),
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
    const filtered = cleanQuery ? allMembers.filter((member) => {
      const searchable = [member.displayName, member.user.username, member.user.globalName, member.user.tag, member.id].filter(Boolean).join(" ").toLocaleLowerCase("ar");
      return searchable.includes(cleanQuery);
    }) : allMembers;

    res.json({ members: sortedMemberJson(filtered), total: filtered.length, totalServerMembers: allMembers.length, updatedAt: memberSnapshotAt, cached: Boolean(memberSnapshot) });
  } catch (error) {
    console.error("Members endpoint:", error);
    res.status(503).json({ error: "Members are temporarily unavailable" });
  }
});

app.get("/api/public/roles", async (req, res) => {
  try {
    const guild = await getGuild();
    const allMembers = await getAllMembers(guild);
    const roles = leadershipRoleIds.map((roleId) => guild.roles.cache.get(roleId)).filter(Boolean).map((role) => {
      const count = allMembers.reduce((total, member) => total + (member.roles.cache.has(role.id) ? 1 : 0), 0);
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
    if (!role || !leadershipRoleSet.has(role.id)) return res.status(404).json({ error: "Role not found" });
    const roleMembers = (await getAllMembers(guild)).filter((member) => member.roles.cache.has(role.id));
    res.json({ role: roleJson(role, roleMembers.length), members: sortedMemberJson(roleMembers), updatedAt: memberSnapshotAt });
  } catch (error) {
    console.error("Role members endpoint:", error);
    res.status(503).json({ error: "Role members are temporarily unavailable" });
  }
});

app.get("/api/public/top", async (req, res) => {
  try {
    const members = (await getAllMembers(await getGuild())).map(memberJson);
    const top = (key) => [...members].sort((a, b) => (b.stats[key] || 0) - (a.stats[key] || 0)).slice(0, 10);
    res.json({ messages: top("messages"), mentions: top("mentionsReceived"), voice: top("voiceMinutes"), joins: top("voiceJoins"), updatedAt: memberSnapshotAt });
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
    const highest = member.roles.cache.filter((role) => role.id !== guild.id && !role.managed).sort((a, b) => b.position - a.position).first();
    res.json({
      ...memberJson(member),
      highestRole: highest ? roleJson(highest) : null,
      permissions: highest ? highest.permissions.toArray().filter((p) => importantPermissionNames.has(p)) : []
    });
  } catch (error) {
    console.error("Member endpoint:", error);
    res.status(404).json({ error: "Member not found" });
  }
});

app.post("/api/public/message", async (req, res) => {
  const nowMs = Date.now();
  const ip = req.ip || "unknown";
  const last = sendHits.get(ip) || 0;
  if (nowMs - last < 10_000) return res.status(429).json({ error: "انتظر 10 ثواني قبل الإرسال مرة أخرى" });

  const title = cleanText(req.body?.title || "رسالة من إدارة MLD", 120);
  const text = cleanText(req.body?.message, 2000);
  const targetId = cleanText(req.body?.memberId, 30);
  if (!targetId || !text) return res.status(400).json({ error: "بيانات الرسالة غير صحيحة" });

  try {
    const member = await (await getGuild()).members.fetch(targetId).catch(() => null);
    if (!member) return res.status(404).json({ error: "العضو غير موجود" });
    const embed = new EmbedBuilder().setTitle(title).setDescription(text).setColor("#ff9cdc").setFooter({ text: "MLD Community" }).setTimestamp();
    await member.send({ embeds: [embed] });
    privateMessageLogs.push({
      id: randomToken(),
      targetId: member.id,
      targetUsername: member.user.username,
      title,
      message: text,
      createdAt: now(),
      ip
    });
    if (privateMessageLogs.length > 200) privateMessageLogs.shift();
    sendHits.set(ip, nowMs);
    res.json({ ok: true });
  } catch (error) {
    console.error("DM endpoint:", error);
    res.status(500).json({ error: "تعذر الإرسال؛ قد يكون الخاص مقفلًا" });
  }
});

// -------------------- Groups --------------------

app.get("/api/groups", (req, res) => {
  res.json({ groups: [...groups.values()].filter((g) => g.status === "approved").map((g) => groupView(g)) });
});

app.get("/api/groups/:id", (req, res) => {
  const group = groups.get(req.params.id);
  if (!group || group.status !== "approved") return res.status(404).json({ error: "المجموعة غير موجودة" });
  res.json({ group: groupView(group, Boolean(currentUser(req) && (currentUser(req).id === group.ownerId || isAdminUser(currentUser(req))))) });
});

app.post("/api/groups", requireAuth, async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const description = cleanText(req.body?.description, 500);
  const category = cleanText(req.body?.category || "عام", 50);
  const icon = cleanText(req.body?.icon || "👥", 10);
  if (name.length < 2) return res.status(400).json({ error: "اسم المجموعة مطلوب" });

  const group = {
    id: String(nextGroupId++),
    name,
    slug: slugify(name),
    description,
    category,
    icon,
    ownerId: req.user.id,
    status: "pending",
    createdAt: now(),
    discordRoleId: null,
    discordCategoryId: null,
    discordTextChannelId: null,
    discordVoiceChannelId: null
  };
  groups.set(group.id, group);
  groupMembers.set(group.id, new Map());
  pushLog("group_created", { groupId: group.id, userId: req.user.id });

  await notifyDiscordWebsite({
    title: "طلب إنشاء مجموعة جديد",
    description: `المستخدم ${req.user.username} أنشأ طلب مجموعة.`,
    fields: [
      { name: "المجموعة", value: group.name },
      { name: "المالك", value: req.user.username },
      { name: "المعرف", value: group.id }
    ]
  });

  res.status(201).json({ group: groupView(group) });
});

app.post("/api/groups/:id/join", requireAuth, async (req, res) => {
  const group = groups.get(req.params.id);
  if (!group || group.status !== "approved") return res.status(404).json({ error: "المجموعة غير موجودة" });
  if (group.ownerId === req.user.id || isGroupMember(group.id, req.user.id)) return res.status(400).json({ error: "أنت عضو بالفعل" });

  const requests = groupJoinRequests.get(group.id) || new Map();
  if ([...requests.values()].some((r) => r.userId === req.user.id && r.status === "pending")) return res.status(409).json({ error: "لديك طلب معلق بالفعل" });

  const request = { id: String(nextJoinId++), groupId: group.id, userId: req.user.id, message: cleanText(req.body?.message, 300), status: "pending", createdAt: now() };
  requests.set(request.id, request);
  groupJoinRequests.set(group.id, requests);

  await notifyDiscordWebsite({
    title: "طلب انضمام لمجموعة",
    description: `المستخدم ${req.user.username} يريد الانضمام إلى ${group.name}.`,
    fields: [{ name: "المجموعة", value: group.name }, { name: "العضو", value: req.user.username }, { name: "الطلب", value: request.id }]
  });
  res.status(201).json({ request });
});

// -------------------- Group chat --------------------
app.get("/api/groups/:id/messages", requireAuth, (req,res) => {
  const group=groups.get(req.params.id);
  if(!group) return res.status(404).json({error:"المجموعة غير موجودة"});
  if(!isGroupMember(group.id,req.user.id) && !isAdminUser(req.user)) return res.status(403).json({error:"يجب أن تكون عضوًا"});
  res.json({messages:groupMessages.get(group.id)||[]});
});
app.post("/api/groups/:id/messages", requireAuth, async (req,res) => {
  const group=groups.get(req.params.id);
  if(!group) return res.status(404).json({error:"المجموعة غير موجودة"});
  if(!isGroupMember(group.id,req.user.id) && !isAdminUser(req.user)) return res.status(403).json({error:"يجب أن تكون عضوًا"});
  const message=cleanText(req.body?.message,1500);
  if(!message) return res.status(400).json({error:"الرسالة مطلوبة"});
  const item={id:String(nextMessageId++),groupId:group.id,userId:req.user.id,username:req.user.username,message,createdAt:now()};
  const list=groupMessages.get(group.id)||[]; list.push(item); if(list.length>300) list.splice(0,list.length-300); groupMessages.set(group.id,list);
  res.status(201).json({message:item});
});
// -------------------- Tickets --------------------

app.get("/api/tickets", requireAuth, (req, res) => {
  const own = [...tickets.values()].filter((t) => t.userId === req.user.id);
  const data = isAdminUser(req.user) ? [...tickets.values()] : own;
  res.json({ tickets: data.map((t) => ({ ...t, messages: undefined })) });
});

app.post("/api/tickets", requireAuth, async (req, res) => {
  const type = cleanText(req.body?.type || "عام", 80);
  const subject = cleanText(req.body?.subject, 160);
  const message = cleanText(req.body?.message, 3000);
  if (!subject || !message) return res.status(400).json({ error: "العنوان والرسالة مطلوبان" });

  const ticket = { id: String(nextTicketId++), userId: req.user.id, type, subject, status: "open", createdAt: now(), updatedAt: now() };
  tickets.set(ticket.id, ticket);
  ticketMessages.set(ticket.id, [{ id: String(nextTicketMessageId++), ticketId: ticket.id, userId: req.user.id, message, createdAt: now() }]);

  await notifyDiscordWebsite({
    title: "تذكرة جديدة",
    description: `تذكرة ${ticket.id} من ${req.user.username}.`,
    fields: [{ name: "النوع", value: type }, { name: "العنوان", value: subject }]
  });
  res.status(201).json({ ticket, messages: ticketMessages.get(ticket.id) });
});

app.get("/api/tickets/:id", requireAuth, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
  if (!isAdminUser(req.user) && ticket.userId !== req.user.id) return res.status(403).json({ error: "غير مصرح" });
  res.json({ ticket, messages: ticketMessages.get(ticket.id) || [] });
});

app.post("/api/tickets/:id/messages", requireAuth, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
  if (!isAdminUser(req.user) && ticket.userId !== req.user.id) return res.status(403).json({ error: "غير مصرح" });
  if (ticket.status === "closed") return res.status(400).json({ error: "التذكرة مغلقة" });
  const message = cleanText(req.body?.message, 3000);
  if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });
  const item = { id: String(nextTicketMessageId++), ticketId: ticket.id, userId: req.user.id, message, createdAt: now() };
  const list = ticketMessages.get(ticket.id) || [];
  list.push(item);
  ticketMessages.set(ticket.id, list);
  ticket.updatedAt = now();
  res.status(201).json({ message: item });
});

app.patch("/api/tickets/:id", requireAdmin, (req, res) => {
  const ticket = tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
  const status = cleanText(req.body?.status, 30);
  if (status && ["open", "pending", "closed"].includes(status)) ticket.status = status;
  ticket.updatedAt = now();
  res.json({ ticket });
});

// -------------------- Applications --------------------

app.post("/api/applications", requireAuth, async (req, res) => {
  const type = cleanText(req.body?.type || "عام", 80);
  const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const application = { id: String(nextApplicationId++), userId: req.user.id, type, answers, status: "pending", createdAt: now(), reviewedAt: null, reviewedBy: null };
  applications.set(application.id, application);

  await notifyDiscordWebsite({
    title: "طلب تقديم جديد",
    description: `طلب ${application.id} من ${req.user.username}.`,
    fields: [{ name: "النوع", value: type }, { name: "المتقدم", value: req.user.username }]
  });
  res.status(201).json({ application });
});

app.get("/api/applications", requireAuth, (req, res) => {
  const list = [...applications.values()].filter((a) => isAdminUser(req.user) || a.userId === req.user.id);
  res.json({ applications: list });
});

// -------------------- Reviews --------------------

app.get("/api/reviews/:targetType/:targetId", (req, res) => {
  const key = `${req.params.targetType}:${req.params.targetId}`;
  const list = reviews.get(key) || [];
  const average = list.length ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : 0;
  res.json({ reviews: list, average: Number(average.toFixed(2)), count: list.length });
});

const publicReviewHits = new Map();

app.get("/api/reviews", (req, res) => {
  const all = [...reviews.values()].flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reviews: all.slice(0, 100) });
});

app.post("/api/reviews", (req, res) => {
  const targetType = cleanText(req.body?.targetType || "site", 40);
  const targetId = cleanText(req.body?.targetId || "fahad", 100);
  const targetName = cleanText(req.body?.targetName || "Fahad Community", 120);
  const rating = Number(req.body?.rating);
  const comment = cleanText(req.body?.comment, 1000);
  const visitorName = cleanText(req.body?.visitorName || "زائر", 40);
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  const last = publicReviewHits.get(ip) || 0;

  if (Date.now() - last < 60 * 1000) {
    return res.status(429).json({ error: "انتظر دقيقة قبل إرسال تقييم آخر" });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "التقييم يجب أن يكون من 1 إلى 5" });
  }
  if (comment.length < 3) {
    return res.status(400).json({ error: "اكتب تعليقًا قصيرًا على الأقل" });
  }

  const user = currentUser(req);
  const key = `${targetType}:${targetId}`;
  const list = reviews.get(key) || [];
  const item = {
    id: String(nextReviewId++),
    targetType,
    targetId,
    targetName,
    userId: user?.id || null,
    username: user?.username || visitorName,
    rating,
    comment,
    createdAt: now(),
    updatedAt: now(),
    status: "published"
  };

  list.unshift(item);
  reviews.set(key, list);
  publicReviewHits.set(ip, Date.now());
  res.status(201).json({ review: item });
});

app.delete("/api/reviews/:id", requireAuth, (req, res) => {
  for (const [key, list] of reviews.entries()) {
    const index = list.findIndex((r) => r.id === req.params.id);
    if (index !== -1) {
      if (list[index].userId !== req.user.id && !isAdminUser(req.user)) return res.status(403).json({ error: "غير مصرح" });
      list.splice(index, 1);
      reviews.set(key, list);
      return res.json({ ok: true });
    }
  }
  res.status(404).json({ error: "التقييم غير موجود" });
});

// -------------------- Watch rooms --------------------

app.get("/api/watch", (req, res) => {
  res.json({ rooms: [...watchRooms.values()].filter((r) => r.status === "open").map((r) => ({ ...r, chat: undefined })) });
});

app.post("/api/watch", requireAuth, (req, res) => {
  const title = cleanText(req.body?.title, 160);
  const mediaUrl = cleanText(req.body?.mediaUrl, 1000);
  if (!title || !/^https?:\/\//i.test(mediaUrl)) return res.status(400).json({ error: "العنوان ورابط وسائط صالحان مطلوبان" });

  const room = { id: String(nextWatchRoomId++), title, mediaUrl, hostId: req.user.id, status: "open", position: 0, playing: false, createdAt: now(), chat: [] };
  watchRooms.set(room.id, room);
  res.status(201).json({ room: { ...room, chat: undefined } });
});

app.post("/api/watch-rooms", requireAuth, (req, res) => {
  const title = cleanText(req.body?.title, 160);
  const mediaUrl = cleanText(req.body?.mediaUrl, 1000);
  if (!title || !/^https?:\/\//i.test(mediaUrl)) return res.status(400).json({ error: "العنوان ورابط وسائط صالحان مطلوبان" });
  const room = { id: String(nextWatchRoomId++), title, mediaUrl, hostId: req.user.id, status: "open", position: 0, playing: false, createdAt: now(), chat: [] };
  watchRooms.set(room.id, room);
  res.status(201).json({ room: { ...room, chat: undefined } });
});
app.post("/api/watch-rooms/:id/join", requireAuth, (req, res) => {
  const room = watchRooms.get(req.params.id);
  if (!room || room.status !== "open") return res.status(404).json({ error: "غرفة المشاهدة غير موجودة" });
  room.members = Array.isArray(room.members) ? room.members : [];
  if (!room.members.includes(req.user.id)) room.members.push(req.user.id);
  res.json({ room: { ...room, ownerId: room.hostId, ownerUsername: users.get(room.hostId)?.username || "—" } });
});

app.get("/api/watch/:id", requireAuth, (req, res) => {
  const room = watchRooms.get(req.params.id);
  if (!room || room.status !== "open") return res.status(404).json({ error: "غرفة المشاهدة غير موجودة" });
  res.json({ room: { ...room, ownerId: room.hostId, ownerUsername: users.get(room.hostId)?.username || "—", members: room.members || [], currentTime: room.position || 0 } });
});

app.post("/api/watch/:id/join", requireAuth, (req, res) => {
  const room = watchRooms.get(req.params.id);
  if (!room || room.status !== "open") return res.status(404).json({ error: "غرفة المشاهدة غير موجودة" });
  room.members = Array.isArray(room.members) ? room.members : [];
  if (!room.members.includes(req.user.id)) room.members.push(req.user.id);
  res.json({ room: { ...room, ownerId: room.hostId, ownerUsername: users.get(room.hostId)?.username || "—" } });
});

app.post("/api/watch/:id/state", requireAuth, (req, res) => {
  const room = watchRooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "الغرفة غير موجودة" });
  if (room.hostId !== req.user.id && !isAdminUser(req.user)) return res.status(403).json({ error: "مالك الغرفة فقط يستطيع التحكم" });
  if (req.body?.position !== undefined) room.position = Math.max(0, Number(req.body.position) || 0);
  if (req.body?.playing !== undefined) room.playing = Boolean(req.body.playing);
  res.json({ room: { ...room, chat: undefined } });
});

app.post("/api/watch/:id/chat", requireAuth, (req, res) => {
  const room = watchRooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: "الغرفة غير موجودة" });
  const message = cleanText(req.body?.message, 500);
  if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });
  const item = { id: randomToken(), userId: req.user.id, username: req.user.username, message, createdAt: now() };
  room.chat.push(item);
  if (room.chat.length > 200) room.chat.shift();
  res.status(201).json({ message: item });
});

// -------------------- Games --------------------

app.get("/api/games/:id/messages", requireAuth, (req,res)=>{
  const game=games.get(req.params.id); if(!game) return res.status(404).json({error:"اللعبة غير موجودة"});
  if(!game.players.some(p=>p.userId===req.user.id) && !isAdminUser(req.user)) return res.status(403).json({error:"يجب أن تكون داخل اللعبة"});
  res.json({messages:game.chat||[]});
});
app.post("/api/games/:id/messages", requireAuth, (req,res)=>{
  const game=games.get(req.params.id); if(!game) return res.status(404).json({error:"اللعبة غير موجودة"});
  if(!game.players.some(p=>p.userId===req.user.id) && !isAdminUser(req.user)) return res.status(403).json({error:"يجب أن تكون داخل اللعبة"});
  const message=cleanText(req.body?.message,1000); if(!message) return res.status(400).json({error:"الرسالة مطلوبة"});
  game.chat=Array.isArray(game.chat)?game.chat:[]; const item={id:randomToken(),userId:req.user.id,username:req.user.username,message,createdAt:now()};
  game.chat.push(item); if(game.chat.length>200) game.chat.shift(); game.updatedAt=now(); res.status(201).json({message:item});
});
app.get("/api/games", (req, res) => {
  res.json({ games: [...games.values()].filter((g) => g.status !== "finished").map(publicGame) });
});

app.get("/api/games/:id", (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "اللعبة غير موجودة" });
  res.json({ game: publicGame(game), state: game.state || {} });
});
app.post("/api/games", requireAuth, (req, res) => {
  const type = cleanText(req.body?.type, 30).toLocaleLowerCase("ar");
  const allowed = new Set(["uno", "ludo", "baloot", "daqsh", "qawsar"]);
  if (!allowed.has(type)) return res.status(400).json({ error: "نوع اللعبة غير مدعوم" });
  const maxPlayers = Math.min(8, Math.max(2, Number(req.body?.maxPlayers) || 4));
  const game = createGame(type, req.user.id, maxPlayers);
  res.status(201).json({ game: publicGame(game) });
});

app.post("/api/games/:id/join", requireAuth, async (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "اللعبة غير موجودة" });
  if (game.status !== "waiting") return res.status(400).json({ error: "اللعبة بدأت بالفعل" });
  if (game.players.some((p) => p.userId === req.user.id)) return res.status(400).json({ error: "أنت داخل اللعبة" });
  if (game.players.length >= game.maxPlayers) return res.status(400).json({ error: "اللعبة مكتملة" });

  game.players.push({ userId: req.user.id, seat: game.players.length + 1, ready: false });
  game.updatedAt = now();
  if (game.players.length >= game.maxPlayers) game.status = "active";
  res.json({ game: publicGame(game) });
});

app.post("/api/games/:id/invite", requireAuth, async (req, res) => {
  const game = games.get(req.params.id);
  const targetId = cleanText(req.body?.userId, 50);
  if (!game) return res.status(404).json({ error: "اللعبة غير موجودة" });
  if (!game.players.some((p) => p.userId === req.user.id)) return res.status(403).json({ error: "يجب أن تكون داخل اللعبة" });
  const target = users.get(targetId);
  if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });
  const invite = { id: String(nextInviteId++), gameId: game.id, fromUserId: req.user.id, toUserId: target.id, status: "pending", createdAt: now() };
  gameInvites.set(invite.id, invite);
  const list = notifications.get(target.id) || [];
  list.unshift({ id: String(nextNotificationId++), type: "game_invite", inviteId: invite.id, text: `${req.user.username} دعاك إلى لعبة ${game.name}`, createdAt: now() });
  notifications.set(target.id, list);
  res.status(201).json({ invite });
});

app.get("/api/games/invites", requireAuth, (req, res) => {
  res.json({ invites: [...gameInvites.values()].filter((i) => i.toUserId === req.user.id && i.status === "pending") });
});

app.post("/api/games/invites/:id/respond", requireAuth, (req, res) => {
  const invite = gameInvites.get(req.params.id);
  if (!invite || invite.toUserId !== req.user.id) return res.status(404).json({ error: "الدعوة غير موجودة" });
  const accept = Boolean(req.body?.accept);
  invite.status = accept ? "accepted" : "rejected";
  if (accept) {
    const game = games.get(invite.gameId);
    if (game && game.status === "waiting" && !game.players.some((p) => p.userId === req.user.id) && game.players.length < game.maxPlayers) {
      game.players.push({ userId: req.user.id, seat: game.players.length + 1, ready: false });
      if (game.players.length >= game.maxPlayers) game.status = "active";
      game.updatedAt = now();
    }
  }
  res.json({ invite });
});

app.post("/api/games/:id/action", requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "اللعبة غير موجودة" });
  const player = game.players.find((p) => p.userId === req.user.id);
  if (!player) return res.status(403).json({ error: "أنت لست لاعبًا" });

  const action = cleanText(req.body?.action, 40).toLowerCase();
  if (action === "ready") {
    player.ready = !player.ready;
    const everyoneReady = game.players.length >= 2 && game.players.every((p) => p.ready);
    if (everyoneReady || (game.players.length >= game.maxPlayers)) game.status = "active";
  } else if (action === "start") {
    if (game.hostId !== req.user.id && !isAdminUser(req.user)) return res.status(403).json({ error: "المضيف فقط يستطيع بدء اللعبة" });
    if (game.players.length < 2) return res.status(400).json({ error: "أضف لاعبًا واحدًا على الأقل" });
    game.status = "active";
    game.players.forEach((p) => { p.ready = true; });
  } else if (action === "move" || action === "play" || action === "roll" || action === "draw" || action === "pass") {
    if (game.status !== "active") return res.status(400).json({ error: "ابدأ اللعبة أولًا" });
    game.state.turnUserId = game.state.turnUserId || game.players[0].userId;
    if (game.state.turnUserId !== req.user.id) return res.status(400).json({ error: "ليس دورك الآن" });
    game.state.lastAction = { userId: req.user.id, action, data: req.body?.data || null, at: now() };
    const current = game.players.findIndex((p) => p.userId === req.user.id);
    game.state.turnUserId = game.players[(current + 1) % game.players.length].userId;
  } else {
    return res.status(400).json({ error: "حركة اللعبة غير معروفة" });
  }
  game.updatedAt = now();
  res.json({ game: publicGame(game), state: game.state });
});

app.post("/api/games/:id/finish", requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: "اللعبة غير موجودة" });
  if (game.hostId !== req.user.id && !isAdminUser(req.user)) return res.status(403).json({ error: "المضيف فقط يستطيع إنهاء اللعبة" });

  const winnerId = cleanText(req.body?.winnerId, 50);
  game.status = "finished";
  game.updatedAt = now();
  for (const player of game.players) {
    const stats = gameStatsFor(player.userId);
    stats.played += 1;
    if (winnerId && player.userId === winnerId) stats.wins += 1;
    else if (winnerId) stats.losses += 1;
  }
  res.json({ game: publicGame(game), stats: game.players.map((p) => ({ userId: p.userId, stats: gameStatsFor(p.userId) })) });
});

app.get("/api/games/stats/me", requireAuth, (req, res) => res.json({ stats: gameStatsFor(req.user.id) }));

// -------------------- Site announcements --------------------
app.get("/api/announcements",(req,res)=>res.json({announcements:announcements.filter(a=>a.active!==false).slice(0,20)}));
app.get("/api/admin/announcements",requireAdmin,(req,res)=>res.json({announcements:announcements.slice(0,100)}));
app.post("/api/admin/announcements",requireAdmin,(req,res)=>{
  const title=cleanText(req.body?.title,120), message=cleanText(req.body?.message,2000);
  if(!title||!message)return res.status(400).json({error:"العنوان والنص مطلوبان"});
  const item={id:String(nextAnnouncementId++),title,message,createdBy:req.user.id,createdByUsername:req.user.username,createdAt:now(),active:true};
  announcements.unshift(item); if(announcements.length>100)announcements.length=100;
  pushLog("announcement_created",{by:req.user.id,announcementId:item.id,title});
  res.status(201).json({announcement:item});
});
app.patch("/api/admin/announcements/:id",requireAdmin,(req,res)=>{
  const item=announcements.find(a=>a.id===req.params.id); if(!item)return res.status(404).json({error:"الإعلان غير موجود"});
  if(req.body?.active!==undefined)item.active=Boolean(req.body.active);
  if(req.body?.title!==undefined)item.title=cleanText(req.body.title,120);
  if(req.body?.message!==undefined)item.message=cleanText(req.body.message,2000);
  pushLog("announcement_updated",{by:req.user.id,announcementId:item.id});
  res.json({announcement:item});
});
// -------------------- Admin management --------------------
app.get("/api/admin/staff", requireAdmin, (req,res) => {
  res.json({ owner: userJson(owner), admins: [...admins].map((id) => userJson(users.get(id))).filter(Boolean) });
});
app.post("/api/admin/staff", requireAdmin, (req,res) => {
  const target = users.get(cleanText(req.body?.userId,50));
  if (!target) return res.status(404).json({error:"المستخدم غير موجود"});
  admins.add(target.id);
  pushLog("admin_added",{by:req.user.id,userId:target.id,username:target.username});
  res.json({user:userJson(target)});
});
app.delete("/api/admin/staff/:userId", requireAdmin, (req,res) => {
  if (req.params.userId === owner.id) return res.status(400).json({error:"لا يمكن إزالة الـOwner"});
  admins.delete(req.params.userId);
  pushLog("admin_removed",{by:req.user.id,userId:req.params.userId});
  res.json({ok:true});
});

// -------------------- Private Messenger --------------------
app.get("/api/messages/users", requireAuth, (req, res) => {
  res.json({ users: [...users.values()].filter((u) => u.id !== req.user.id && !u.suspended).map((u) => ({ id:u.id, username:u.username, discordId:u.discordId||"" })) });
});
app.get("/api/messages/:userId", requireAuth, (req, res) => {
  const other=users.get(req.params.userId);
  if(!other||other.id===req.user.id||other.suspended) return res.status(404).json({error:"المستخدم غير موجود"});
  const key=[req.user.id,other.id].sort().join(":");
  res.json({user:{id:other.id,username:other.username,discordId:other.discordId||""},messages:privateMessages.get(key)||[]});
});
app.post("/api/messages", requireAuth, (req, res) => {
  const toUserId=cleanText(req.body?.toUserId,50), message=cleanText(req.body?.message,1000), target=users.get(toUserId);
  if(!target||target.id===req.user.id||target.suspended) return res.status(404).json({error:"المستخدم غير موجود"});
  if(!message) return res.status(400).json({error:"الرسالة مطلوبة"});
  const key=[req.user.id,target.id].sort().join(":");
  const anonymous = Boolean(req.body?.anonymous);
  const item={id:randomToken(),fromUserId:req.user.id,toUserId:target.id,message,createdAt:now(),read:false,anonymous};
  const list=privateMessages.get(key)||[]; list.push(item); if(list.length>300) list.splice(0,list.length-300); privateMessages.set(key,list);
  const ns=notifications.get(target.id)||[]; ns.unshift({id:String(nextNotificationId++),type:"private_message",fromUserId:req.user.id,text:`رسالة خاصة جديدة من ${req.user.username}`,createdAt:now(),read:false}); notifications.set(target.id,ns.slice(0,100));
  privateMessageLogs.unshift({...item,fromUsername:req.user.username,toUsername:target.username}); if(privateMessageLogs.length>500) privateMessageLogs.length=500;
  res.status(201).json({message:item});
});

// -------------------- Notifications --------------------

app.get("/api/notifications", requireAuth, (req, res) => {
  res.json({ notifications: notifications.get(req.user.id) || [] });
});

app.post("/api/notifications/:id/read", requireAuth, (req, res) => {
  const list = notifications.get(req.user.id) || [];
  const item = list.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ error: "الإشعار غير موجود" });
  item.read = true;
  res.json({ notification: item });
});

// -------------------- Admin --------------------

app.get("/api/admin/overview", requireAdmin, (req, res) => {
  res.json({
    users: users.size,
    admins: admins.size,
    groups: groups.size,
    pendingGroups: [...groups.values()].filter((g) => g.status === "pending").length,
    joinRequests: [...groupJoinRequests.values()].reduce((n, map) => n + [...map.values()].filter((r) => r.status === "pending").length, 0),
    tickets: tickets.size,
    openTickets: [...tickets.values()].filter((t) => t.status !== "closed").length,
    applications: applications.size,
    pendingApplications: [...applications.values()].filter((a) => a.status === "pending").length,
    reviews: [...reviews.values()].reduce((n, list) => n + list.length, 0),
    games: games.size,
    watchRooms: watchRooms.size
  });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const reviewsCount = [...reviews.values()].reduce((n, list) => n + list.length, 0);
  res.json({
    users: users.size,
    groups: groups.size,
    pendingGroups: [...groups.values()].filter((g) => g.status === "pending").length,
    joinRequests: [...groupJoinRequests.values()].reduce((n, map) => n + [...map.values()].filter((r) => r.status === "pending").length, 0),
    tickets: tickets.size,
    applications: applications.size,
    reviews: reviewsCount,
    watchRooms: watchRooms.size,
    games: games.size
  });
});

app.get("/api/admin/users", requireAdmin, (req, res) => res.json({ users: [...users.values()].map(userJson) }));

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  if (req.body?.suspended !== undefined) user.suspended = Boolean(req.body.suspended);
  if (req.body?.admin !== undefined) {
    if (req.body.admin) admins.add(user.id); else if (user.id !== owner.id) admins.delete(user.id);
  }
  res.json({ user: userJson(user) });
});

app.get("/api/admin/groups/pending", requireAdmin, (req, res) => res.json({ groups: [...groups.values()].filter((g) => g.status === "pending").map((g) => groupView(g, true)) }));

app.patch("/api/admin/groups/:id", requireAdmin, async (req, res) => {
  const group = groups.get(req.params.id);
  if (!group) return res.status(404).json({ error: "المجموعة غير موجودة" });
  const decision = cleanText(req.body?.status, 30);
  if (!["approved", "rejected", "pending"].includes(decision)) return res.status(400).json({ error: "الحالة غير صحيحة" });

  group.status = decision;
  group.reviewedAt = now();
  group.reviewedBy = req.user.id;
  if (decision === "approved" && !group.discordRoleId) {
    try { await setupDiscordGroup(group); } catch (error) { console.error("Group Discord setup:", error.message); }
  }
  if (decision === "approved") await syncGroupMemberToDiscord(group, users.get(group.ownerId));
  pushLog("group_reviewed", { groupId: group.id, status: decision, adminId: req.user.id });
  res.json({ group: groupView(group, true) });
});

app.patch("/api/admin/groups/:id/review", requireAdmin, async (req, res) => { const group = groups.get(req.params.id); if (!group) return res.status(404).json({ error: "المجموعة غير موجودة" }); const status = cleanText(req.body?.status, 30); if (!["approved","rejected","pending"].includes(status)) return res.status(400).json({ error: "الحالة غير صحيحة" }); group.status = status; group.reviewedAt = now(); group.reviewedBy = req.user.id; if (status === "approved" && !group.discordRoleId) { try { await setupDiscordGroup(group); } catch (e) { console.error("Group Discord setup:", e.message); } } pushLog("group_reviewed", { groupId: group.id, status, adminId: req.user.id }); res.json({ group: groupView(group, true) }); });

app.get("/api/admin/groups/:id/requests", requireAdmin, (req, res) => {
  const group = groups.get(req.params.id);
  if (!group) return res.status(404).json({ error: "المجموعة غير موجودة" });
  const list = [...(groupJoinRequests.get(group.id) || new Map()).values()].map((r) => ({ ...r, user: userJson(users.get(r.userId)) }));
  res.json({ requests: list });
});

app.patch("/api/admin/groups/:groupId/requests/:requestId", requireAdmin, async (req, res) => {
  const group = groups.get(req.params.groupId);
  const request = (groupJoinRequests.get(req.params.groupId) || new Map()).get(req.params.requestId);
  if (!group || !request) return res.status(404).json({ error: "الطلب غير موجود" });
  const decision = cleanText(req.body?.status, 30);
  if (!["approved", "rejected", "pending"].includes(decision)) return res.status(400).json({ error: "الحالة غير صحيحة" });
  request.status = decision;
  request.reviewedAt = now();
  request.reviewedBy = req.user.id;

  if (decision === "approved") {
    const members = groupMembers.get(group.id) || new Map();
    members.set(request.userId, { userId: request.userId, status: "approved", joinedAt: now() });
    groupMembers.set(group.id, members);
    await syncGroupMemberToDiscord(group, users.get(request.userId));
  }
  res.json({ request: { ...request, user: userJson(users.get(request.userId)) } });
});

app.get("/api/admin/applications", requireAdmin, (req, res) => res.json({ applications: [...applications.values()] }));

app.patch("/api/admin/applications/:id", requireAdmin, async (req, res) => {
  const application = applications.get(req.params.id);
  if (!application) return res.status(404).json({ error: "الطلب غير موجود" });
  const status = cleanText(req.body?.status, 30);
  if (!["pending", "approved", "rejected"].includes(status)) return res.status(400).json({ error: "الحالة غير صحيحة" });
  application.status = status;
  application.reviewedAt = now();
  application.reviewedBy = req.user.id;
  await notifyDiscordWebsite({ title: "تحديث طلب تقديم", description: `تم تحديث الطلب ${application.id} إلى ${status}.` });
  res.json({ application });
});

app.get("/api/admin/reviews", requireAdmin, (req, res) => { res.json({ reviews: [...reviews.values()].flat().slice(-200).reverse() }); });

app.patch("/api/admin/tickets/:id", requireAdmin, (req, res) => { const ticket = tickets.get(req.params.id); if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" }); const status = cleanText(req.body?.status, 30); if (!["open","closed","pending","answered"].includes(status)) return res.status(400).json({ error: "الحالة غير صحيحة" }); ticket.status = status; ticket.updatedAt = now(); pushLog("ticket_reviewed", { ticketId: ticket.id, status, adminId: req.user.id }); res.json({ ticket }); });

app.get("/api/admin/private-messages", requireAdmin, (req, res) => res.json({ messages: privateMessageLogs.slice(-200).reverse() }));

app.get("/api/admin/logs", requireAdmin, (req, res) => res.json({ logs }));

app.get("/api/admin/discord", requireAdmin, async (req, res) => {
  try {
    const guild = await getGuild();
    res.json({
      bot: client.user ? { id: client.user.id, tag: client.user.tag } : null,
      guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
      ready: client.isReady()
    });
  } catch (error) {
    res.status(503).json({ error: "Discord unavailable" });
  }
});

// -------------------- Discord events --------------------

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
  const userId = newState.id;
  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(userId, Date.now());
    getActivity(userId).voiceJoins += 1;
  }
  if (oldState.channelId && !newState.channelId && voiceSessions.has(userId)) {
    getActivity(userId).voiceMinutes += Math.max(0, Math.round((Date.now() - voiceSessions.get(userId)) / 60000));
    voiceSessions.delete(userId);
  }
});

client.on("error", (error) => console.error("Discord client error:", error));
client.on("warn", (message) => console.warn("Discord warning:", message));

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  const statusName = process.env.BOT_STATUS_NAME || process.env.COMMUNITY_NAME || "مجتمع ملاذ";
  const statusType = String(process.env.BOT_STATUS_TYPE || "WATCHING").toUpperCase();
  const typeMap = { PLAYING: 0, STREAMING: 1, LISTENING: 2, WATCHING: 3 };
  const activityType = typeMap[statusType] ?? 3;
  const botActivity = { name: statusName, type: activityType };
  if (activityType === 1) botActivity.url = process.env.BOT_STREAM_URL || "https://twitch.tv/Njm";
  client.user.setPresence({ status: "online", activities: [botActivity] });
});

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "حدث خطأ داخلي في الخادم" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`Fahad Community listening on port ${port}`));

client.login(token).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});

process.on("SIGTERM", () => {
  client.destroy();
  process.exit(0);
});

process.on("SIGINT", () => {
  client.destroy();
  process.exit(0);
});
