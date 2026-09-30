// MLD boot repair: keep this file on the verified group/game route path.
"use strict";
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

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
const publicStatsFile = path.join(__dirname, "data", "public-stats.json");
let publicStats = { totalVisits: 0, recentVisitors: {} };
try {
  fs.mkdirSync(path.dirname(publicStatsFile), { recursive: true });
  if (fs.existsSync(publicStatsFile)) publicStats = JSON.parse(fs.readFileSync(publicStatsFile, "utf8"));
} catch (error) {
  console.error("Public stats read:", error);
}
function savePublicStats() {
  try {
    const tmp = publicStatsFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(publicStats, null, 2));
    fs.renameSync(tmp, publicStatsFile);
  } catch (error) {
    console.error("Public stats write:", error);
  }
}
function onlineMemberCount(members) {
  return members.filter((member) => member.presence && member.presence.status && member.presence.status !== "offline").length;
}
function onlineBotCount(members) {
  return members.filter((member) => member.user.bot && member.presence && member.presence.status && member.presence.status !== "offline").length;
}
function onlineHumanCount(members) {
  return members.filter((member) => !member.user.bot && member.presence && member.presence.status && member.presence.status !== "offline").length;
}

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

app.get("/api/public/stats", async (req, res) => {
  try {
    const guild = await getGuild();
    const members = await getAllMembers(guild);
    const visitorKey = crypto.createHash("sha256").update(String(req.ip || "") + "|" + String(req.headers["user-agent"] || "")).digest("hex");
    const now = Date.now();
    const last = Number(publicStats.recentVisitors[visitorKey] || 0);
    if (now - last > 30 * 60 * 1000) {
      publicStats.totalVisits = Number(publicStats.totalVisits || 0) + 1;
      publicStats.recentVisitors[visitorKey] = now;
      const cutoff = now - 24 * 60 * 60 * 1000;
      for (const [key, value] of Object.entries(publicStats.recentVisitors)) {
        if (Number(value) < cutoff) delete publicStats.recentVisitors[key];
      }
      savePublicStats();
    }
    res.json({
      totalVisits: Number(publicStats.totalVisits || 0),
      online: onlineMemberCount(members),
      onlineHumans: onlineHumanCount(members),
      onlineBots: onlineBotCount(members),
      totalMembers: members.length,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error("Public stats endpoint:", error);
    res.status(503).json({ error: "الإحصائيات غير متاحة مؤقتًا" });
  }
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

app.get("/api/public/server", async (req, res) => {
  try {
    const guild = await getGuild();
    const configuredSupportId = /^\d{15,22}$/.test(String(process.env.OWNER_DISCORD_ID || "")) ? String(process.env.OWNER_DISCORD_ID) : "";
    const supportMember = configuredSupportId ? null : guild.members.cache.find(m =>
      String(m.user.username || "").toLowerCase() === String(process.env.OWNER_DISCORD_USERNAME || "w4px").toLowerCase() ||
      String(m.user.globalName || "").toLowerCase() === String(process.env.OWNER_DISCORD_USERNAME || "w4px").toLowerCase()
    );
    res.json({
      id: guild.id, name: guild.name, icon: guild.iconURL({ extension: "png", size: 256 }),
      memberCount: guild.memberCount, ownerName: process.env.SERVER_FOUNDER_NAME || "فهد المطيري",
      invite: process.env.DISCORD_INVITE_URL || "", supportDiscordId: configuredSupportId || supportMember?.id || ""
    });
  } catch (error) { console.error("Server endpoint:", error); res.status(503).json({ error: "Discord server unavailable" }); }
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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const customId = String(interaction.customId || "");
  if (!customId.startsWith("mld_account_")) return;
  const parts = customId.split(":");
  const action = parts[0];
  const pendingId = parts[1];
  const pending = (platform.pendingAccounts || []).find(p => p.id === pendingId);
  if (!pending || pending.status !== "pending" || Date.parse(pending.expiresAt) <= Date.now()) {
    return interaction.reply({ content: "انتهت صلاحية طلب إنشاء الحساب. ارجع للموقع وحاول مرة أخرى.", ephemeral: true }).catch(() => {});
  }
  if (interaction.user.id !== pending.discordId) {
    return interaction.reply({ content: "هذا التأكيد مخصص لصاحب حساب Discord الذي طلب إنشاء الحساب.", ephemeral: true }).catch(() => {});
  }
  if (action === "mld_account_no") {
    pending.status = "cancelled";
    pending.cancelledAt = new Date().toISOString();
    savePlatform();
    logPlatform("account_confirmation_cancelled", null, pending.username + ":" + pending.discordId);
    return interaction.update({ content: "❌ تم إلغاء إنشاء الحساب. لم يتم إنشاء أي حساب.", components: [] }).catch(() => {});
  }
  if (action === "mld_account_yes") {
    if (platform.accounts.some(a => String(a.discordId) === String(pending.discordId))) {
      pending.status = "cancelled";
      savePlatform();
      return interaction.update({ content: "⚠️ هذا Discord مرتبط بحساب موجود بالفعل.", components: [] }).catch(() => {});
    }
    const account = {
      id: crypto.randomUUID(),
      username: pending.username,
      discordId: pending.discordId,
      discordUsername: pending.discordUsername || "",
      role: pending.role,
      passwordHash: pending.passwordHash,
      salt: pending.salt,
      createdAt: new Date().toISOString()
    };
    platform.accounts.push(account);
    pending.status = "confirmed";
    pending.accountId = account.id;
    pending.confirmedAt = new Date().toISOString();
    savePlatform();
    logPlatform("account_created", account.id, account.role === "owner" ? "owner account" : "member account");
    return interaction.update({ content: "✅ تم إنشاء حساب **@" + account.username + "** في ملاذ بنجاح. يمكنك الآن الدخول للموقع.", components: [] }).catch(() => {});
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
const OWNER_DISCORD_ID = String(process.env.OWNER_DISCORD_ID || "").trim().toLowerCase();
const OWNER_DISCORD_USERNAME = String(process.env.OWNER_DISCORD_USERNAME || "w4px").trim().toLowerCase();
const sessions = new Map();
const pendingAccountConfirmations = new Map();

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
      logs: Array.isArray(data.logs) ? data.logs : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      pendingAccounts: Array.isArray(data.pendingAccounts) ? data.pendingAccounts : []
    };
  } catch (error) {
    console.error("Platform storage read:", error);
    return { accounts: [], groups: [], lobbies: [], logs: [] };
  }
}

let platform = loadPlatform();
for (const session of platform.sessions || []) {
  if (session?.token && session?.accountId && platform.accounts.some(a => a.id === session.accountId)) sessions.set(session.token, session.accountId);
}
// Owner identity requested for the existing MLD account: Discord username w4px / site username 305.
for (const a of platform.accounts) { if (a.username === "305" || String(a.discordUsername || "").toLowerCase() === OWNER_DISCORD_USERNAME) a.role = "owner"; }
savePlatform();

function savePlatform() {
  platform.sessions = [...sessions.entries()].map(([token, accountId]) => ({ token, accountId }));
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
    role: a.role, admin: a.role === "owner" || a.admin === true, createdAt: a.createdAt,
    profileName: a.profileName || a.username,
    avatar: a.avatar || "",
    bio: a.bio || ""
  };
}

const adminRoleIds = new Set(["1521187079336362024","1531109479264026706","1548732297669255259","1548732341185155103","1548732606508703744"]);
async function syncAccountAccess(account) {
  try {
    if (account.role === "owner") { account.admin = true; return; }
    const member = await (await getGuild()).members.fetch(account.discordId).catch(() => null);
    account.admin = Boolean(member && member.roles.cache.some(r => adminRoleIds.has(r.id)));
  } catch { account.admin = account.admin === true; }
}
async function auth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const accountId = token ? sessions.get(token) : null;
  const account = accountId ? platform.accounts.find(a => a.id === accountId) : null;
  if (!account) return res.status(401).json({ error: "سجّل دخولك أولًا" });
  await syncAccountAccess(account);
  req.account = account;
  req.token = token;
  next();
}
function ownerOnly(req, res, next) {
  if (req.account?.role !== "owner") return res.status(403).json({ error: "هذا القسم للأونر فقط" });
  next();
}
function adminOnly(req, res, next) {
  if (req.account?.role !== "owner" && req.account?.admin !== true) return res.status(403).json({ error: "هذا القسم للإدارة والأونر فقط" });
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

app.get("/api/platform/account/discord-members", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLocaleLowerCase("ar");
    if (q.length < 2) return res.json({ members: [] });
    const members = await getAllMembers(await getGuild());
    const clean = q.replace(/^@/, "");
    const result = members.filter(m => {
      const hay = [m.user.username, m.user.globalName, m.displayName, m.user.tag, m.id].filter(Boolean).join(" ").toLocaleLowerCase("ar");
      return hay.includes(clean);
    }).slice(0, 12).map(m => ({
      id: m.id,
      username: m.user.username,
      globalName: m.user.globalName,
      displayName: m.displayName,
      avatar: m.user.displayAvatarURL({ extension: "png", size: 128 })
    }));
    res.json({ members: result });
  } catch (e) {
    console.error("Account Discord member search:", e);
    res.status(503).json({ error: "تعذر جلب أعضاء Discord مؤقتًا" });
  }
});

app.post("/api/platform/accounts", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const discordId = String(req.body?.discordId || "").trim();
  const password = String(req.body?.password || "");
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "اليوزر يجب أن يكون 3-24 حرفًا إنجليزيًا أو _" });
  if (password.length < 6) return res.status(400).json({ error: "كلمة المرور 6 أحرف على الأقل" });
  if (!/^\d{15,22}$/.test(discordId)) return res.status(400).json({ error: "اختر عضوًا صحيحًا من السيرفر" });
  if (platform.accounts.some(a => a.username === username)) return res.status(409).json({ error: "اليوزر مستخدم بالفعل" });
  if (platform.accounts.some(a => String(a.discordId) === discordId)) return res.status(409).json({ error: "هذا Discord مربوط بحساب موجود بالفعل" });
  if (platform.pendingAccounts?.some(a => a.status === "pending" && Date.parse(a.expiresAt) > Date.now() && (a.username === username || String(a.discordId) === discordId))) return res.status(409).json({ error: "لديك طلب إنشاء حساب بانتظار التأكيد" });

  const guild = await getGuild();
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return res.status(404).json({ error: "لازم تكون موجودًا في سيرفر ملاذ لإنشاء الحساب" });

  const owner = discordId.toLowerCase() === OWNER_DISCORD_ID || String(member.user.username || "").toLowerCase() === OWNER_DISCORD_USERNAME || String(member.user.globalName || "").toLowerCase() === OWNER_DISCORD_USERNAME;
  const pass = hashPassword(password);
  const pendingId = crypto.randomUUID();
  const browserToken = crypto.randomBytes(32).toString("hex");
  const pending = {
    id: pendingId, browserToken, username, discordId,
    role: owner ? "owner" : "member",
    discordUsername: String(member.user.username || member.user.globalName || "").trim(),
    passwordHash: pass.hash, salt: pass.salt,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    status: "pending"
  };
  platform.pendingAccounts = platform.pendingAccounts || [];
  platform.pendingAccounts.push(pending);
  platform.pendingAccounts = platform.pendingAccounts.filter(p => p.status === "pending" && Date.parse(p.expiresAt) > Date.now());
  savePlatform();

  try {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("mld_account_yes:" + pendingId).setLabel("نعم، إنشاء الحساب").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("mld_account_no:" + pendingId).setLabel("لا، إلغاء").setStyle(ButtonStyle.Danger)
    );
    await member.send({
      content: "🔐 **تأكيد إنشاء حساب ملاذ**\\n\\nتم طلب إنشاء حساب باسم **@" + username + "** المرتبط بحساب Discord الخاص بك.\\nهل أنت من أنشأ هذا الحساب؟",
      components: [row]
    });
    logPlatform("account_confirmation_sent", null, username + ":" + discordId);
    res.status(202).json({ pending: true, pendingId, browserToken, expiresAt: pending.expiresAt, message: "تم إرسال رسالة تأكيد إلى الخاص في Discord" });
  } catch (e) {
    platform.pendingAccounts = platform.pendingAccounts.filter(p => p.id !== pendingId);
    savePlatform();
    res.status(400).json({ error: "تعذر إرسال رسالة التأكيد إلى الخاص. افتح رسائل Discord الخاصة ثم حاول مرة أخرى." });
  }
});

app.get("/api/platform/accounts/pending/:id", (req, res) => {
  const p = (platform.pendingAccounts || []).find(x => x.id === req.params.id && x.browserToken === String(req.query.token || ""));
  if (!p) return res.status(404).json({ error: "طلب إنشاء الحساب غير موجود أو انتهت صلاحيته" });
  if (p.status === "confirmed" && p.accountId) {
    const account = platform.accounts.find(a => a.id === p.accountId);
    if (!account) return res.status(404).json({ error: "الحساب غير موجود" });
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, account.id);
    savePlatform();
    p.status = "completed";
    savePlatform();
    return res.json({ status: "confirmed", token, account: safeAccount(account), owner: account.role === "owner" });
  }
  res.json({ status: p.status, expiresAt: p.expiresAt });
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
  savePlatform();
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

const GAME_CATALOG = [
  { id:"baloot", name:"بلوت", icon:"🃏", minPlayers:4, maxPlayers:4, mode:"فريقان · 4 لاعبين", description:"طاولة ورق بأربع مقاعد ودور واضح لكل لاعب." },
  { id:"uno", name:"UNO", icon:"🎴", minPlayers:2, maxPlayers:4, mode:"2-4 لاعبين", description:"سحب ولعب أوراق وألوان وفوز باليد." },
  { id:"jackaroo", name:"جاكارو", icon:"♟️", minPlayers:2, maxPlayers:4, mode:"2-4 لاعبين", description:"حركة أحجار بالدور مع رمية نرد." },
  { id:"ludo", name:"لودو", icon:"🎲", minPlayers:2, maxPlayers:4, mode:"2-4 لاعبين", description:"طاولة لودو بالدور ورمية نرد وتحريك القطع." },
  { id:"monopoly", name:"مونوبولي", icon:"🏦", minPlayers:2, maxPlayers:6, mode:"2-6 لاعبين", description:"رمية وحركة وشراء عقارات ورصيد لكل لاعب." },
  { id:"maqsor", name:"مقوصر", icon:"🃏", minPlayers:2, maxPlayers:6, mode:"2-6 لاعبين", description:"٤ أوراق لكل لاعب؛ ٢ علوية معروفة و٢ سفلية مخفية، والهدف أقل مجموع." }
];

function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function unoDeck(){const colors=["أحمر","أزرق","أخضر","أصفر"],deck=[];colors.forEach(c=>{deck.push({color:c,value:"0"});for(let n=1;n<=9;n++){deck.push({color:c,value:String(n)});deck.push({color:c,value:String(n)});}["+2","عكس","تخطي"].forEach(v=>{deck.push({color:c,value:v});deck.push({color:c,value:v});});});for(let i=0;i<4;i++){deck.push({color:"wild",value:"وايلد"});deck.push({color:"wild",value:"+4"});}return shuffle(deck);}
function balootDeck(){const suits=["♠","♥","♦","♣"],ranks=["7","8","9","10","J","Q","K","A"],d=[];suits.forEach(s=>ranks.forEach(r=>d.push({suit:s,rank:r,label:r+s})));return shuffle(d);}
function maqsorDeck(){const suits=["♠","♥","♦","♣"],ranks=["7","8","9","10","J","Q","K","A"],d=[];suits.forEach(s=>ranks.forEach(r=>d.push({suit:s,rank:r,label:r+s,known:false})));d.push({suit:"JOKER",rank:"JOKER",label:"Joker",known:false},{suit:"JOKER",rank:"JOKER",label:"Joker",known:false});return shuffle(d);}
function maqsorValue(c){if(!c)return 0;if(c.rank==="JOKER")return 20;if(c.rank==="J")return 11;if(c.rank==="Q")return 12;if(c.rank==="K")return 0;if(c.rank==="A")return 1;return Number(c.rank)||0;}
function maqsorRed(c){return c&&["♥","♦"].includes(c.suit);}
function maqsorCanBurn(a,b){return a&&b&&((a.rank==="JOKER"&&b.rank==="JOKER")||(a.rank!=="JOKER"&&b.rank!=="JOKER"&&a.rank===b.rank));}
function initialGameState(game,players){
  const base={version:1,startedAt:new Date().toISOString(),turnIndex:0,lastRoll:null,lastAction:null,winner:null,round:1};
  if(game==="uno"){const deck=unoDeck(),hands={};players.forEach(p=>hands[p]=[]);players.forEach(p=>{for(let i=0;i<7;i++)hands[p].push(deck.pop());});let top=deck.pop();while(top.color==="wild"){deck.unshift(top);top=deck.pop();}return {...base,deck,discard:[top],hands,currentColor:top.color};}
  if(game==="baloot"){const deck=balootDeck(),hands={};players.forEach(p=>hands[p]=deck.splice(0,8));return {...base,hands,trick:[],trickSuit:null,scores:players.reduce((a,p)=>(a[p]=0,a),{})};}
  if(game==="maqsor"){const deck=maqsorDeck(),hands={},scores={},zeros={};players.forEach(p=>{hands[p]=[deck.pop(),deck.pop(),deck.pop(),deck.pop()];hands[p][0].known=true;hands[p][1].known=true;scores[p]=0;zeros[p]=0;});return {...base,deck,discard:[deck.pop()],hands,scores,zeros,drawn:{},qawsarBy:null,publicReveals:[],roundResults:null,roundOver:false};}
  if(game==="monopoly")return {...base,money:players.reduce((a,p)=>(a[p]=1500,a),{}),positions:players.reduce((a,p)=>(a[p]=0,a),{}),properties:{},lastRoll:null};
  return {...base,pieces:players.reduce((a,p)=>(a[p]=[0,0,0,0],a),{})};
}
function publicGameState(lobby,username){
  const s=lobby.gameState||{},safe={...s};
  if(safe.hands)safe.hands=Object.fromEntries(Object.keys(safe.hands).map(p=>[p,p===username?safe.hands[p]:safe.hands[p].map((card,i)=>safe.publicReveals&&safe.publicReveals.some(r=>r.player===p&&r.index===i&&r.until>Date.now())?card:card&&card.known?card:{hidden:true})]));
  if(safe.game==="maqsor"&&safe.drawn){safe.drawn=Object.fromEntries(Object.keys(safe.drawn).map(p=>[p,p===username?safe.drawn[p]:null]));}
  safe.myHand=s.hands&&s.hands[username]?s.hands[username].map(c=>c):[];
  return safe;
}
function lobbyFor(lobby,username){return {id:lobby.id,game:lobby.game,host:lobby.host,players:lobby.players,spectators:lobby.spectators,maxPlayers:lobby.maxPlayers,status:lobby.status,createdAt:lobby.createdAt,started:Boolean(lobby.gameState?.startedAt),turn:lobby.gameState?.turnIndex??null,currentPlayer:lobby.gameState?lobby.players[lobby.gameState.turnIndex]||null:null,gameState:lobby.gameState?publicGameState(lobby,username):null};}
function advanceTurn(lobby){const s=lobby.gameState;s.turnIndex=(s.turnIndex+1)%lobby.players.length;if(lobby.game==="maqsor"&&s.qawsarBy&&lobby.players[s.turnIndex]===s.qawsarBy){const totals={};lobby.players.forEach(p=>totals[p]=(s.hands[p]||[]).reduce((n,c)=>n+maqsorValue(c),0));const min=Math.min(...Object.values(totals));lobby.players.forEach(p=>{if(totals[p]===min){s.scores[p]=0;s.zeros[p]=(s.zeros[p]||0)+1;}else{s.scores[p]=(s.scores[p]||0)+totals[p];}if(s.scores[p]>=50){s.scores[p]=0;s.zeros[p]=(s.zeros[p]||0)+1;}});s.roundResults=totals;s.roundWinner=Object.keys(totals).find(p=>totals[p]===min)||null;s.playersOut=lobby.players.filter(p=>(s.zeros[p]||0)>=3);if(s.playersOut.length){s.winner="خرج: "+s.playersOut.join("، ");s.roundOver=true;}else{const deck=maqsorDeck();lobby.players.forEach(p=>{s.hands[p]=[deck.pop(),deck.pop(),deck.pop(),deck.pop()];s.hands[p][0].known=true;s.hands[p][1].known=true;});s.deck=deck;s.discard=[s.deck.pop()];s.drawn={};s.publicReveals=[];s.qawsarBy=null;s.round++;s.turnIndex=0;s.roundOver=false;}}}
function drawUno(s){if(!s.deck.length){const top=s.discard.pop();s.deck=shuffle(s.discard.splice(0));if(top)s.discard=[top];}return s.deck.pop()||null;}
function canControl(req,lobby){const cur=lobby.players[lobby.gameState.turnIndex];return cur===req.account.username||(cur&&cur.startsWith("__test_")&&lobby.host===req.account.username);}

app.get("/api/platform/games",(req,res)=>res.json({botReady:client.isReady(),games:GAME_CATALOG.map(g=>({id:g.id,name:g.name,icon:g.icon,players:g.minPlayers===g.maxPlayers?String(g.minPlayers):g.minPlayers+"-"+g.maxPlayers,mode:g.mode,description:g.description}))}));

app.get("/api/platform/account/discord-members", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLocaleLowerCase("ar");
    if (q.length < 2) return res.json({ members: [] });
    const members = await getAllMembers(await getGuild());
    const clean = q.replace(/^@/, "");
    const result = members.filter(m => {
      const hay = [m.user.username, m.user.globalName, m.displayName, m.user.tag, m.id].filter(Boolean).join(" ").toLocaleLowerCase("ar");
      return hay.includes(clean);
    }).slice(0, 12).map(m => ({
      id: m.id,
      username: m.user.username,
      globalName: m.user.globalName,
      displayName: m.displayName,
      avatar: m.user.displayAvatarURL({ extension: "png", size: 128 })
    }));
    res.json({ members: result });
  } catch (e) {
    console.error("Account Discord member search:", e);
    res.status(503).json({ error: "تعذر جلب أعضاء Discord مؤقتًا" });
  }
});

app.post("/api/platform/accounts", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const discordId = String(req.body?.discordId || "").trim();
  const password = String(req.body?.password || "");
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "اليوزر يجب أن يكون 3-24 حرفًا إنجليزيًا أو _" });
  if (password.length < 6) return res.status(400).json({ error: "كلمة المرور 6 أحرف على الأقل" });
  if (!/^\d{15,22}$/.test(discordId)) return res.status(400).json({ error: "اختر عضوًا صحيحًا من السيرفر" });
  if (platform.accounts.some(a => a.username === username)) return res.status(409).json({ error: "اليوزر مستخدم بالفعل" });
  if (platform.accounts.some(a => String(a.discordId) === discordId)) return res.status(409).json({ error: "هذا Discord مربوط بحساب موجود بالفعل" });
  if (platform.pendingAccounts?.some(a => a.status === "pending" && Date.parse(a.expiresAt) > Date.now() && (a.username === username || String(a.discordId) === discordId))) return res.status(409).json({ error: "لديك طلب إنشاء حساب بانتظار التأكيد" });

  const guild = await getGuild();
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return res.status(404).json({ error: "لازم تكون موجودًا في سيرفر ملاذ لإنشاء الحساب" });

  const owner = discordId.toLowerCase() === OWNER_DISCORD_ID || String(member.user.username || "").toLowerCase() === OWNER_DISCORD_USERNAME || String(member.user.globalName || "").toLowerCase() === OWNER_DISCORD_USERNAME;
  const pass = hashPassword(password);
  const pendingId = crypto.randomUUID();
  const browserToken = crypto.randomBytes(32).toString("hex");
  const pending = {
    id: pendingId, browserToken, username, discordId,
    role: owner ? "owner" : "member",
    discordUsername: String(member.user.username || member.user.globalName || "").trim(),
    passwordHash: pass.hash, salt: pass.salt,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    status: "pending"
  };
  platform.pendingAccounts = platform.pendingAccounts || [];
  platform.pendingAccounts.push(pending);
  platform.pendingAccounts = platform.pendingAccounts.filter(p => p.status === "pending" && Date.parse(p.expiresAt) > Date.now());
  savePlatform();

  try {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("mld_account_yes:" + pendingId).setLabel("نعم، إنشاء الحساب").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("mld_account_no:" + pendingId).setLabel("لا، إلغاء").setStyle(ButtonStyle.Danger)
    );
    await member.send({
      content: "🔐 **تأكيد إنشاء حساب ملاذ**\\n\\nتم طلب إنشاء حساب باسم **@" + username + "** المرتبط بحساب Discord الخاص بك.\\nهل أنت من أنشأ هذا الحساب؟",
      components: [row]
    });
    logPlatform("account_confirmation_sent", null, username + ":" + discordId);
    res.status(202).json({ pending: true, pendingId, browserToken, expiresAt: pending.expiresAt, message: "تم إرسال رسالة تأكيد إلى الخاص في Discord" });
  } catch (e) {
    platform.pendingAccounts = platform.pendingAccounts.filter(p => p.id !== pendingId);
    savePlatform();
    res.status(400).json({ error: "تعذر إرسال رسالة التأكيد إلى الخاص. افتح رسائل Discord الخاصة ثم حاول مرة أخرى." });
  }
});

app.post("/api/platform/lobbies",auth,(req,res)=>{
  const game=String(req.body?.game||""),rules=GAME_CATALOG.find(g=>g.id===game);
  if(!rules)return res.status(400).json({error:"اللعبة غير متاحة"});
  const existing=platform.lobbies.find(l=>l.status!=="closed"&&(l.host===req.account.username||l.players.includes(req.account.username)));
  if(existing)return res.status(409).json({error:"عندك جلسة ألعاب موجودة بالفعل. ادخل جلستك بدل إنشاء جلسة ثانية.",lobby:lobbyFor(existing,req.account.username)});
  const maxPlayers=Math.max(rules.minPlayers,Math.min(rules.maxPlayers,Number(req.body?.maxPlayers||rules.maxPlayers)));
  const lobby={id:crypto.randomUUID(),game,host:req.account.username,players:[req.account.username],spectators:[],maxPlayers,status:"open",createdAt:new Date().toISOString(),gameState:null};
  platform.lobbies.push(lobby);savePlatform();logPlatform("lobby_created",req.account.id,game);res.status(201).json({lobby:lobbyFor(lobby,req.account.username)});
});

app.post("/api/platform/lobbies/:id/join",auth,(req,res)=>{
  const lobby=platform.lobbies.find(l=>l.id===req.params.id);if(!lobby||lobby.status==="closed")return res.status(404).json({error:"الجلسة غير متاحة"});
  if(lobby.gameState?.startedAt)return res.status(409).json({error:"اللعبة بدأت، لا يمكن أخذ مقعد الآن"});
  const elsewhere=platform.lobbies.find(l=>l.status!=="closed"&&l.id!==lobby.id&&l.players.includes(req.account.username));if(elsewhere)return res.status(409).json({error:"أنت جالس في طاولة أخرى. اخرج منها أولًا."});
  lobby.spectators=lobby.spectators.filter(x=>x!==req.account.username);
  if(!lobby.players.includes(req.account.username)){if(lobby.players.length>=lobby.maxPlayers)return res.status(409).json({error:"المقاعد مكتملة"});lobby.players.push(req.account.username);}
  lobby.status=lobby.players.length>=lobby.maxPlayers?"ready":"open";savePlatform();logPlatform("lobby_joined",req.account.id,lobby.game);res.json({lobby:lobbyFor(lobby,req.account.username)});
});

app.post("/api/platform/lobbies/:id/spectate",auth,(req,res)=>{
  const lobby=platform.lobbies.find(l=>l.id===req.params.id);if(!lobby)return res.status(404).json({error:"الجلسة غير موجودة"});
  if(!lobby.players.includes(req.account.username)&&!lobby.spectators.includes(req.account.username))lobby.spectators.push(req.account.username);
  savePlatform();logPlatform("lobby_spectated",req.account.id,lobby.game);res.json({lobby:lobbyFor(lobby,req.account.username)});
});

app.post("/api/platform/lobbies/:id/test-seats",auth,(req,res)=>{
  const lobby=platform.lobbies.find(l=>l.id===req.params.id);if(!lobby)return res.status(404).json({error:"الجلسة غير موجودة"});
  if(lobby.host!==req.account.username)return res.status(403).json({error:"اختبار المقاعد للمضيف فقط"});
  if(lobby.gameState?.startedAt)return res.status(409).json({error:"اللعبة بدأت بالفعل"});
  const wanted=Math.max(0,Math.min(lobby.maxPlayers-1,Number(req.body?.count||lobby.maxPlayers-1)));
  lobby.players=lobby.players.filter(p=>!p.startsWith("__test_"));
  for(let i=1;i<=wanted&&lobby.players.length<lobby.maxPlayers;i++)lobby.players.push("__test_"+i);
  lobby.status=lobby.players.length>=lobby.maxPlayers?"ready":"open";savePlatform();logPlatform("lobby_test_seats",req.account.id,lobby.game);res.json({lobby:lobbyFor(lobby,req.account.username)});
});

app.post("/api/platform/lobbies/:id/start",auth,(req,res)=>{
  const lobby=platform.lobbies.find(l=>l.id===req.params.id),rules=lobby&&GAME_CATALOG.find(g=>g.id===lobby.game);
  if(!lobby||!rules)return res.status(404).json({error:"الجلسة غير موجودة"});
  if(lobby.host!==req.account.username)return res.status(403).json({error:"فقط صاحب الطاولة يقدر يبدأ اللعبة"});
  if(lobby.gameState?.startedAt)return res.status(409).json({error:"اللعبة بدأت بالفعل"});
  if(lobby.players.length<rules.minPlayers)return res.status(409).json({error:"عدد المقاعد غير كافٍ للبدء: "+rules.minPlayers});
  lobby.gameState=initialGameState(lobby.game,lobby.players);lobby.status="playing";savePlatform();logPlatform("game_started",req.account.id,lobby.game);res.json({lobby:lobbyFor(lobby,req.account.username)});
});

app.post("/api/platform/lobbies/:id/action",auth,(req,res)=>{
  const lobby=platform.lobbies.find(l=>l.id===req.params.id);if(!lobby||lobby.status==="closed")return res.status(404).json({error:"الطاولة غير موجودة"});
  if(!lobby.gameState?.startedAt)return res.status(409).json({error:"ابدأ اللعبة أولًا"});
  if(lobby.gameState.winner)return res.status(409).json({error:"اللعبة انتهت"});
  if(!canControl(req,lobby))return res.status(403).json({error:"ليس دورك الآن"});
  const s=lobby.gameState,actor=lobby.players[s.turnIndex],action=String(req.body?.action||"");
  if(action==="roll"){
    const roll=crypto.randomInt(1,7);s.lastRoll=roll;s.lastAction={by:actor,type:"roll",value:roll,at:new Date().toISOString()};
    if(lobby.game==="monopoly"){const old=s.positions[actor];s.positions[actor]=(old+roll)%40;if(old+roll>=40)s.money[actor]+=200;advanceTurn(lobby);}
    savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"رمية: "+roll});
  }
  if(["ludo","jackaroo"].includes(lobby.game)){
    if(action!=="move")return res.status(400).json({error:"ارمِ النرد ثم اختر قطعة"});
    const idx=Math.max(0,Math.min(3,Number(req.body?.piece||0))),steps=Number(s.lastRoll||0);if(!steps)return res.status(400).json({error:"ارمِ النرد أولًا"});
    if(!s.pieces[actor])return res.status(400).json({error:"لا يوجد مقعد للاعب"});s.pieces[actor][idx]=(s.pieces[actor][idx]+steps)%40;s.lastAction={by:actor,type:"move",piece:idx,steps,at:new Date().toISOString()};if(steps!==6)advanceTurn(lobby);else s.lastRoll=null;
    savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم تحريك القطعة"});
  }
  if(lobby.game==="uno"){
    if(action==="draw"){const card=drawUno(s);if(card)s.hands[actor].push(card);s.lastAction={by:actor,type:"draw",at:new Date().toISOString()};advanceTurn(lobby);}
    else if(action==="play"){const idx=Number(req.body?.cardIndex),hand=s.hands[actor]||[],card=hand[idx],top=s.discard[s.discard.length-1];const match=card&&(card.color==="wild"||card.color===s.currentColor||card.value===top.value);if(!card||!match)return res.status(400).json({error:"لا يمكنك لعب هذه الورقة الآن"});hand.splice(idx,1);s.discard.push(card);if(card.color==="wild")s.currentColor=String(req.body?.color||"أحمر");else s.currentColor=card.color;if(card.value==="+2"){const n=lobby.players[(s.turnIndex+1)%lobby.players.length];for(let i=0;i<2;i++){const x=drawUno(s);if(x)s.hands[n].push(x);}}if(card.value==="+4"){const n=lobby.players[(s.turnIndex+1)%lobby.players.length];for(let i=0;i<4;i++){const x=drawUno(s);if(x)s.hands[n].push(x);}}if(!hand.length)s.winner=actor;else if(card.value==="عكس"&&lobby.players.length>2)s.turnIndex=(s.turnIndex-1+lobby.players.length)%lobby.players.length;else if(card.value!=="تخطي")advanceTurn(lobby);s.lastAction={by:actor,type:"play",card,at:new Date().toISOString()};}
    else return res.status(400).json({error:"حركة UNO غير معروفة"});savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم تنفيذ الحركة"});
  }
  if(lobby.game==="baloot"){
    if(action!=="play-card")return res.status(400).json({error:"اختر ورقة من يدك"});
    const idx=Number(req.body?.cardIndex),hand=s.hands[actor]||[],card=hand[idx];if(!card)return res.status(400).json({error:"الورقة غير موجودة"});
    if(s.trickSuit&&card.suit!==s.trickSuit&&hand.some(x=>x.suit===s.trickSuit))return res.status(400).json({error:"يجب متابعة النوع"});
    hand.splice(idx,1);if(!s.trickSuit)s.trickSuit=card.suit;s.trick.push({player:actor,card});
    if(s.trick.length<4)advanceTurn(lobby);else{s.scores[s.trick[0].player]=(s.scores[s.trick[0].player]||0);const winner=s.trick.reduce((best,t)=>t.card.suit===s.trickSuit&&["7","8","Q","K","10","A","9","J"].indexOf(t.card.rank)>["7","8","Q","K","10","A","9","J"].indexOf(best.card.rank)?t:best,s.trick[0]);s.scores[winner.player]=(s.scores[winner.player]||0)+1;s.trick=[];s.trickSuit=null;s.turnIndex=lobby.players.indexOf(winner.player);if(Object.values(s.hands).every(h=>h.length===0))s.winner=Object.keys(s.scores).sort((a,b)=>s.scores[b]-s.scores[a])[0];}
    s.lastAction={by:actor,type:"play-card",card,at:new Date().toISOString()};savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم لعب الورقة"});
  }
  if(lobby.game==="maqsor"){
    const hand=s.hands[actor]||[];
    if(action==="draw"){if(s.drawn[actor])return res.status(409).json({error:"عندك ورقة مسحوبة بالفعل"});const card=s.deck.pop();if(!card)return res.status(409).json({error:"الخبيصة فارغة"});s.drawn[actor]=card;s.lastAction={by:actor,type:"draw",at:new Date().toISOString()};savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"سحبت من الخبيصة"});}
    if(action==="take-discard"){if(s.drawn[actor])return res.status(409).json({error:"عندك ورقة مسحوبة بالفعل"});const card=s.discard.pop();if(!card)return res.status(409).json({error:"لا توجد مرمية"});s.drawn[actor]=card;s.lastAction={by:actor,type:"take-discard",at:new Date().toISOString()};savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"أخذت المرمية"});}
    if(action==="replace"){const source=s.drawn[actor],i=Number(req.body?.index);if(!source)return res.status(409).json({error:"اسحب أو خذ المرمية أولًا"});if(i<0||i>3)return res.status(400).json({error:"اختر ورقة صحيحة"});const old=hand[i];hand[i]={...source,known:true};s.discard.push(old);delete s.drawn[actor];s.lastAction={by:actor,type:"replace",index:i,at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم التبديل"});}
    if(action==="discard-drawn"){const source=s.drawn[actor];if(!source)return res.status(409).json({error:"لا توجد ورقة مسحوبة"});s.discard.push(source);delete s.drawn[actor];s.lastAction={by:actor,type:"discard-drawn",at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم الوطي"});}
    if(action==="burn"){const i=Number(req.body?.index),card=hand[i],top=s.discard[s.discard.length-1];if(i<0||i>3||!maqsorCanBurn(card,top))return res.status(400).json({error:"الحرق يكون بنفس الرقم فقط، والجوكر يحرق جوكر"});hand.splice(i,1);const fresh=s.deck.pop();if(fresh)hand.push({...fresh,known:false});s.lastAction={by:actor,type:"burn",index:i,at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم الحرق"});}
    if(action==="reveal-self"){const i=Number(req.body?.cardIndex),target=Number(req.body?.targetIndex),card=hand[i];if(!card||!["8","9"].includes(card.rank))return res.status(400).json({error:"تحتاج 8 أو 9"});if(!hand[target]||hand[target].known)return res.status(400).json({error:"اختر ورقة مخفية"});hand[target].known=true;hand.splice(i,1);s.discard.push(card);s.lastAction={by:actor,type:"reveal-self",index:target,at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم كشف ورقتك"});}
    if(action==="reveal-any"){const i=Number(req.body?.cardIndex),targetPlayer=String(req.body?.player||""),targetIndex=Number(req.body?.index),card=hand[i];if(!card||card.rank!=="9"||!maqsorRed(card))return res.status(400).json({error:"تحتاج 9 أحمر"});const th=s.hands[targetPlayer]||[];if(!th[targetIndex])return res.status(400).json({error:"اختر ورقة صحيحة"});s.publicReveals=(s.publicReveals||[]).filter(r=>r.until>Date.now());s.publicReveals.push({player:targetPlayer,index:targetIndex,until:Date.now()+10000});hand.splice(i,1);s.discard.push(card);s.lastAction={by:actor,type:"reveal-any",player:targetPlayer,index:targetIndex,at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم كشف الورقة مؤقتًا"});}
    if(action==="swap"){const i=Number(req.body?.myIndex),p=String(req.body?.player||""),j=Number(req.body?.otherIndex),card=hand[i],other=s.hands[p]||[],jack=hand.find(c=>c.rank==="J"&&maqsorRed(c));if(!jack||!card||!other[j])return res.status(400).json({error:"تحتاج ولدًا أحمر واختر الورقتين"});const t=card;hand[i]=other[j];other[j]=t;hand[i].known=true;other[j].known=false;const ji=hand.indexOf(jack);if(ji>=0){hand.splice(ji,1);s.discard.push(jack);}s.lastAction={by:actor,type:"swap",player:p,at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم التبديل"});}
    if(action==="qawsar"){if(s.qawsarBy)return res.status(409).json({error:"تم إعلان قوصر بالفعل"});if(s.drawn[actor])return res.status(409).json({error:"أنهِ الورقة المسحوبة أولًا"});s.qawsarBy=actor;s.lastAction={by:actor,type:"qawsar",at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم إعلان قوصر"});}
    return res.status(400).json({error:"حركة مقوصر غير معروفة"});
  }
  if(lobby.game==="monopoly"){
    if(action!=="buy")return res.status(400).json({error:"بعد الرمية، إذا العقار متاح اضغط شراء"});
    const pos=s.positions[actor],price=200+(pos%8)*25;if(s.properties[pos])return res.status(400).json({error:"العقار مملوك"});if(s.money[actor]<price)return res.status(400).json({error:"رصيدك لا يكفي"});s.money[actor]-=price;s.properties[pos]={owner:actor,price};s.lastAction={by:actor,type:"buy",at:new Date().toISOString()};advanceTurn(lobby);savePlatform();return res.json({lobby:lobbyFor(lobby,req.account.username),message:"تم شراء العقار"});
  }
  return res.status(400).json({error:"حركة غير مدعومة"});
});

app.post("/api/platform/lobbies/:id/leave",auth,(req,res)=>{
  const lobby=platform.lobbies.find(l=>l.id===req.params.id);if(!lobby)return res.status(404).json({error:"الجلسة غير موجودة"});if(lobby.gameState?.startedAt)return res.status(409).json({error:"لا يمكن مغادرة طاولة بدأت؛ أغلقها المضيف"});
  lobby.players=lobby.players.filter(p=>p!==req.account.username);lobby.spectators=lobby.spectators.filter(p=>p!==req.account.username);if(lobby.host===req.account.username)platform.lobbies=platform.lobbies.filter(x=>x.id!==lobby.id);else lobby.status=lobby.players.length>=lobby.maxPlayers?"ready":"open";savePlatform();logPlatform("lobby_left",req.account.id,lobby.game);res.json({ok:true});
});
app.delete("/api/platform/lobbies/:id",auth,(req,res)=>{
  const i=platform.lobbies.findIndex(l=>l.id===req.params.id);if(i<0)return res.status(404).json({error:"الجلسة غير موجودة"});if(platform.lobbies[i].host!==req.account.username&&req.account.role!=="owner")return res.status(403).json({error:"لا تملك صلاحية إغلاق الجلسة"});platform.lobbies[i].status="closed";savePlatform();logPlatform("lobby_closed",req.account.id,req.params.id);res.json({ok:true});
});

ame, description, owner: req.account.username,
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
  const existing = platform.lobbies.find(l => l.status !== "closed" && l.host === req.account.username);
  if (existing) return res.status(409).json({ error: "عندك جلسة ألعاب موجودة بالفعل. ادخل جلستك بدل إنشاء جلسة ثانية." , lobby: existing });
  const maxPlayers = Math.max(2, Math.min(6, Number(req.body?.maxPlayers || 4)));
  const lobby = {
    id: crypto.randomUUID(), game, host:req.account.username,
    players:[req.account.username], spectators:[], maxPlayers,
    status:"open", createdAt:new Date().toISOString()
  };
  platform.lobbies.push(lobby);
  savePlatform();
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

app.get("/api/platform/logs", auth, adminOnly, (req, res) => res.json({ logs: req.account.role === "owner" ? platform.logs.slice(0, 100) : [] }));

app.get("/api/platform/admin", auth, adminOnly, (req, res) => {
  res.json({
    accounts: platform.accounts.length,
    owners: platform.accounts.filter(a=>a.role==="owner").length,
    groups: platform.groups.length, lobbies: platform.lobbies.length,
    members: memberSnapshot?.length || 0, botReady: client.isReady()
  });
});

require("./platform-extra")({ app, client, auth, ownerOnly, adminOnly, logPlatform, getGuild, getAllMembers, platform, savePlatform });

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => console.log(`MLD listening on port ${port}`));
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));
client.login(token).catch((error) => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});