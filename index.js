"use strict";
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

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
    GatewayIntentBits.GuildVoiceStates
  ]
});

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "20kb" }));
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

    res.json({
      members: sortedMemberJson(filtered),
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

app.post("/api/public/message", async (req, res) => {
  const now = Date.now();
  const ip = req.ip || "unknown";
  const last = sendHits.get(ip) || 0;

  if (now - last < 10_000) {
    return res.status(429).json({ error: "انتظر 10 ثواني قبل الإرسال مرة أخرى" });
  }

  const title = String(req.body?.title || "رسالة من إدارة MLD").trim();
  const text = String(req.body?.message || "").trim();
  const targetId = String(req.body?.memberId || "").trim();

  if (!targetId || !text || text.length > 2000 || title.length > 120) {
    return res.status(400).json({ error: "بيانات الرسالة غير صحيحة" });
  }

  try {
    const member = await (await getGuild()).members.fetch(targetId).catch(() => null);
    if (!member) return res.status(404).json({ error: "العضو غير موجود" });

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(text)
      .setColor("#ff9cdc")
      .setFooter({ text: "MLD Community" })
      .setTimestamp();

    await member.send({ embeds: [embed] });
    sendHits.set(ip, now);
    res.json({ ok: true });
  } catch (error) {
    console.error("DM endpoint:", error);
    res.status(500).json({ error: "تعذر الإرسال؛ قد يكون الخاص مقفلًا" });
  }
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


/* =========================
   MLD PLATFORM CORE
   Accounts / groups / game lobbies / logs / owner
   ========================= */
const platformDir = path.join(__dirname, "data");
const platformFile = path.join(platformDir, "platform.json");
const OWNER_DISCORD_ID = String(process.env.OWNER_DISCORD_ID || "w4px").trim().toLowerCase();
const sessions = new Map();

function loadPlatform() {
  try {
    fs.mkdirSync(platformDir, { recursive: true });
    if (!fs.existsSync(platformFile)) {
      fs.writeFileSync(platformFile, JSON.stringify({
        accounts: [], groups: [], lobbies: [], logs: []
      }, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(platformFile, "utf8"));
    return {
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      groups: Array.isArray(data.groups) ? data.groups : [],
      lobbies: Array.isArray(data.lobbies) ? data.lobbies : [],
      logs: Array.isArray(data.logs) ? data.logs : []
    };
  } catch (error) {
    console.error("Platform storage read:", error);
    return { accounts: [], groups: [], lobbies: [], logs: [] };
  }
}

let platform = loadPlatform();

function savePlatform() {
  fs.mkdirSync(platformDir, { recursive: true });
  const tmp = `${platformFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(platform, null, 2));
  fs.renameSync(tmp, platformFile);
}

function logPlatform(action, accountId, details = "") {
  platform.logs.unshift({
    id: crypto.randomUUID(),
    action,
    accountId: accountId || null,
    details: String(details).slice(0, 500),
    at: new Date().toISOString()
  });
  platform.logs = platform.logs.slice(0, 500);
  savePlatform();
}

function safeAccount(a) {
  return {
    id: a.id, username: a.username, discordId: a.discordId,
    role: a.role, createdAt: a.createdAt
  };
}

function auth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const accountId = token ? sessions.get(token) : null;
  const account = accountId ? platform.accounts.find(a => a.id === accountId) : null;
  if (!account) return res.status(401).json({ error: "سجّل دخولك أولًا" });
  req.account = account;
  req.token = token;
  next();
}

function ownerOnly(req, res, next) {
  if (req.account?.role !== "owner") return res.status(403).json({ error: "هذا القسم للأونر فقط" });
  next();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

function passwordOk(password, account) {
  const hash = crypto.scryptSync(password, account.salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(account.passwordHash, "hex"));
}

app.get("/api/platform/games", (req, res) => {
  res.json({
    botReady: client.isReady(),
    games: [
      { id: "baloot", name: "بلوت", icon: "🃏", players: "4", mode: "فرق" },
      { id: "uno", name: "UNO", icon: "🎴", players: "2-4", mode: "تنافس" },
      { id: "jackaroo", name: "جاكارو", icon: "♟️", players: "2-4", mode: "تنافس" },
      { id: "ludo", name: "لودو", icon: "🎲", players: "2-4", mode: "تنافس" },
      { id: "monopoly", name: "مونوبولي", icon: "🏦", players: "2-6", mode: "تنافس" }
    ]
  });
});

app.post("/api/platform/accounts", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const discordId = String(req.body?.discordId || "").trim();
  const password = String(req.body?.password || "");
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "اليوزر يجب أن يكون 3-24 حرفًا إنجليزيًا أو _" });
  if (password.length < 6) return res.status(400).json({ error: "كلمة المرور 6 أحرف على الأقل" });
  if (!discordId) return res.status(400).json({ error: "أدخل Discord ID" });
  if (platform.accounts.some(a => a.username === username)) return res.status(409).json({ error: "اليوزر مستخدم بالفعل" });

  const owner = discordId.toLowerCase() === OWNER_DISCORD_ID;
  const pass = hashPassword(password);
  const account = {
    id: crypto.randomUUID(), username, discordId,
    role: owner ? "owner" : "member", passwordHash: pass.hash, salt: pass.salt,
    createdAt: new Date().toISOString()
  };
  platform.accounts.push(account);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, account.id);
  logPlatform("account_created", account.id, owner ? "owner account" : "member account");
  res.status(201).json({ token, account: safeAccount(account), owner });
});

app.post("/api/platform/login", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const account = platform.accounts.find(a => a.username === username);
  if (!account || !passwordOk(password, account)) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, account.id);
  res.json({ token, account: safeAccount(account) });
});

app.get("/api/platform/me", auth, (req, res) => res.json({ account: safeAccount(req.account) }));

app.post("/api/platform/logout", auth, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get("/api/platform/groups", (req, res) => {
  res.json({ groups: platform.groups.map(g => ({
    id:g.id, name:g.name, description:g.description, owner:g.owner,
    members:g.members.length, createdAt:g.createdAt
  }))});
});

app.post("/api/platform/groups", auth, (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 40);
  const description = String(req.body?.description || "").trim().slice(0, 200);
  if (name.length < 2) return res.status(400).json({ error: "اسم المجموعة قصير" });
  const group = {
    id: crypto.randomUUID(), name, description, owner: req.account.username,
    members: [req.account.username], createdAt: new Date().toISOString()
  };
  platform.groups.push(group);
  logPlatform("group_created", req.account.id, name);
  res.status(201).json({ group });
});

app.post("/api/platform/groups/:id/join", auth, (req, res) => {
  const group = platform.groups.find(g => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: "المجموعة غير موجودة" });
  if (!group.members.includes(req.account.username)) group.members.push(req.account.username);
  savePlatform();
  logPlatform("group_joined", req.account.id, group.name);
  res.json({ ok: true, group });
});

app.get("/api/platform/lobbies", (req, res) => {
  res.json({ lobbies: platform.lobbies.filter(l => l.status !== "closed") });
});

app.post("/api/platform/lobbies", auth, (req, res) => {
  const game = String(req.body?.game || "");
  const allowed = new Set(["baloot","uno","jackaroo","ludo","monopoly"]);
  if (!allowed.has(game)) return res.status(400).json({ error: "اللعبة غير متاحة" });
  const maxPlayers = Math.max(2, Math.min(6, Number(req.body?.maxPlayers || 4)));
  const lobby = {
    id: crypto.randomUUID(), game, host:req.account.username,
    players:[req.account.username], spectators:[], maxPlayers,
    status:"open", createdAt:new Date().toISOString()
  };
  platform.lobbies.push(lobby);
  logPlatform("lobby_created", req.account.id, game);
  res.status(201).json({ lobby });
});

app.post("/api/platform/lobbies/:id/join", auth, (req, res) => {
  const lobby = platform.lobbies.find(l => l.id === req.params.id);
  if (!lobby || lobby.status === "closed") return res.status(404).json({ error: "الجلسة غير متاحة" });
  if (!lobby.players.includes(req.account.username)) {
    if (lobby.players.length >= lobby.maxPlayers) return res.status(409).json({ error: "المقاعد مكتملة" });
    lobby.players.push(req.account.username);
  }
  if (lobby.players.length >= lobby.maxPlayers) lobby.status = "ready";
  savePlatform();
  logPlatform("lobby_joined", req.account.id, lobby.game);
  res.json({ lobby });
});

app.post("/api/platform/lobbies/:id/spectate", auth, (req, res) => {
  const lobby = platform.lobbies.find(l => l.id === req.params.id);
  if (!lobby) return res.status(404).json({ error: "الجلسة غير موجودة" });
  if (!lobby.spectators.includes(req.account.username) && !lobby.players.includes(req.account.username)) {
    lobby.spectators.push(req.account.username);
  }
  savePlatform();
  logPlatform("lobby_spectated", req.account.id, lobby.game);
  res.json({ lobby });
});

app.delete("/api/platform/lobbies/:id", auth, (req, res) => {
  const i = platform.lobbies.findIndex(l => l.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "الجلسة غير موجودة" });
  if (platform.lobbies[i].host !== req.account.username && req.account.role !== "owner") {
    return res.status(403).json({ error: "لا تملك صلاحية إغلاق الجلسة" });
  }
  platform.lobbies.splice(i, 1);
  logPlatform("lobby_closed", req.account.id, req.params.id);
  res.json({ ok:true });
});

app.get("/api/platform/logs", auth, ownerOnly, (req, res) => res.json({ logs: platform.logs.slice(0, 100) }));

app.get("/api/platform/admin", auth, ownerOnly, (req, res) => {
  res.json({
    accounts: platform.accounts.length,
    owners: platform.accounts.filter(a=>a.role==="owner").length,
    groups: platform.groups.length, lobbies: platform.lobbies.length,
    members: memberSnapshot?.length || 0, botReady: client.isReady()
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`MLD listening on port ${port}`));
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));
client.login(token).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});
