"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder
} = require("discord.js");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

const OWNER_ID = process.env.OWNER_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "change-me";

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
  process.exit(1);
}

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  })
);

const publicDir = path.join(__dirname, "public");

function now() {
  return new Date().toISOString();
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value, max = 5000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function normalizeUsername(value) {
  return clean(value, 32).toLowerCase();
}

function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password))
    .digest("hex");
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: user.avatar || null,
    discordId: user.discordId || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

const db = {
  users: [],
  admins: [],
  groups: [],
  groupMembers: [],
  groupMessages: [],
  tickets: [],
  ticketMessages: [],
  applications: [],
  logs: [],
  privateMessageLogs: [],
  watchRooms: []
};

const discordStats = new Map();
const voiceSessions = new Map();

function getStats(discordId) {
  if (!discordStats.has(discordId)) {
    discordStats.set(discordId, {
      messages: 0,
      mentionsSent: 0,
      mentionsReceived: 0,
      voiceMinutes: 0,
      voiceJoins: 0,
      chatRounds: 0
    });
  }

  return discordStats.get(discordId);
}

function isAdminUser(user) {
  if (!user) return false;

  if (user.id === OWNER_ID && OWNER_ID) {
    return true;
  }

  return db.admins.some(
    (admin) => admin.userId === user.id && admin.active !== false
  );
}

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "يجب تسجيل الدخول"
    });
  }

  const user = db.users.find((item) => item.id === req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({
      error: "جلسة الدخول غير صالحة"
    });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "يجب تسجيل الدخول"
    });
  }

  const user = db.users.find((item) => item.id === req.session.userId);

  if (!user || !isAdminUser(user)) {
    return res.status(403).json({
      error: "ليس لديك صلاحية الإدارة"
    });
  }

  req.user = user;
  next();
}

function logAction(type, userId, details = {}) {
  db.logs.push({
    id: id("log"),
    type,
    userId: userId || null,
    details,
    createdAt: now()
  });

  if (db.logs.length > 5000) {
    db.logs.splice(0, db.logs.length - 5000);
  }
}

function getGuild() {
  return discord.guilds.cache.get(DISCORD_GUILD_ID) || null;
}

async function fetchMembers() {
  const guild = getGuild();

  if (!guild) {
    throw new Error("Discord server not found");
  }

  try {
    await guild.members.fetch();
  } catch (error) {
    console.error("Failed to fetch Discord members:", error.message);
  }

  return guild.members.cache;
}

function memberObject(member) {
  const stats = getStats(member.id);

  const leadershipRoleIds = new Set(
    String(process.env.VISIBLE_ROLE_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position
    }));

  const importantRoles = roles.filter((role) =>
    leadershipRoleIds.has(role.id)
  );

  const importantPermissionNames = [
    "Administrator",
    "ManageGuild",
    "ManageChannels",
    "ManageRoles",
    "ManageMessages",
    "KickMembers",
    "BanMembers",
    "ModerateMembers"
  ];

  const permissions = [];

  for (const permission of importantPermissionNames) {
    try {
      if (member.permissions.has(permission)) {
        permissions.push(permission);
      }
    } catch {}
  }

  let rank = "عضو";

  try {
    if (member.permissions.has("Administrator")) {
      rank = "إدارة";
    } else if (importantRoles.length) {
      rank = importantRoles[0].name;
    }
  } catch {}

  return {
    id: member.id,
    name: member.displayName || member.user?.globalName || member.user?.username,
    username: member.user?.username || null,
    avatar: member.user?.displayAvatarURL({
      extension: "png",
      size: 256
    }) || null,
    bot: Boolean(member.user?.bot),
    rank,
    roles,
    importantRoles,
    permissions,
    stats: {
      messages: stats.messages,
      mentionsSent: stats.mentionsSent,
      mentionsReceived: stats.mentionsReceived,
      voiceMinutes: stats.voiceMinutes,
      voiceJoins: stats.voiceJoins,
      chatRounds: stats.chatRounds
    }
  };
}

async function sendDiscordEmbed({
  channelId,
  title,
  description,
  color = 0x5865f2,
  fields = []
}) {
  try {
    const channel =
      discord.channels.cache.get(channelId) ||
      (await discord.channels.fetch(channelId).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      return null;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description || "")
      .setColor(color)
      .setTimestamp();

    if (fields.length) {
      embed.addFields(fields);
    }

    return await channel.send({
      embeds: [embed]
    });
  } catch (error) {
    console.error("Discord embed error:", error.message);
    return null;
  }
}

async function sendDiscordDM(discordId, content) {
  if (!discordId) return false;

  try {
    const user = await discord.users.fetch(discordId);
    if (!user) return false;

    await user.send(content);
    return true;
  } catch (error) {
    console.error("Discord DM error:", error.message);
    return false;
  }
}

function getNotificationChannelId() {
  return (
    process.env.DISCORD_NOTIFICATION_CHANNEL_ID ||
    process.env.DISCORD_ADMIN_CHANNEL_ID ||
    ""
  );
}

function getAdminDiscordChannelId() {
  return getNotificationChannelId();
}

function getUserByDiscordId(discordId) {
  return db.users.find((user) => user.discordId === discordId) || null;
}

function getGroup(groupId) {
  return db.groups.find((group) => group.id === groupId) || null;
}

function getGroupOwner(group) {
  return db.users.find((user) => user.id === group.ownerId) || null;
}

function groupObject(group) {
  const owner = getGroupOwner(group);

  const members = db.groupMembers
    .filter(
      (member) =>
        member.groupId === group.id &&
        member.status !== "rejected"
    )
    .map((member) => {
      const user = db.users.find((item) => item.id === member.userId);

      return {
        id: member.id,
        userId: member.userId,
        username: user?.username || null,
        displayName: user?.displayName || user?.username || null,
        status: member.status || "approved",
        joinedAt: member.joinedAt
      };
    });

  return {
    ...group,
    owner: publicUser(owner),
    members,
    memberCount: members.filter(
      (member) => member.status === "approved"
    ).length
  };
}

function ticketObject(ticket) {
  const owner = db.users.find((user) => user.id === ticket.userId);

  return {
    ...ticket,
    user: publicUser(owner),
    messages: db.ticketMessages
      .filter((message) => message.ticketId === ticket.id)
      .map((message) => ({
        ...message,
        user: publicUser(
          db.users.find((user) => user.id === message.userId)
        )
      }))
  };
}

function applicationObject(application) {
  return {
    ...application,
    user: publicUser(
      db.users.find((user) => user.id === application.userId)
    )
  };
}

/* ---------------- Discord ---------------- */

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

discord.once("ready", async () => {
  console.log(`Discord bot logged in as ${discord.user.tag}`);

  try {
    const guild = getGuild();

    if (guild) {
      await guild.members.fetch();
      console.log(
        `Discord guild connected: ${guild.name} (${guild.memberCount} members)`
      );
    } else {
      console.error(
        `Discord guild ${DISCORD_GUILD_ID} was not found`
      );
    }
  } catch (error) {
    console.error(
      "Discord initial data fetch error:",
      error.message
    );
  }
});

discord.on("messageCreate", async (message) => {
  if (!message.guild || message.author?.bot) {
    return;
  }

  const stats = getStats(message.author.id);

  stats.messages += 1;
  stats.chatRounds += 1;

  if (message.mentions?.users?.size) {
    stats.mentionsSent += message.mentions.users.size;

    for (const mentioned of message.mentions.users.values()) {
      const mentionedStats = getStats(mentioned.id);
      mentionedStats.mentionsReceived += 1;
    }
  }
});

discord.on("voiceStateUpdate", (oldState, newState) => {
  const userId = newState.id || oldState.id;

  if (!userId) {
    return;
  }

  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(userId, Date.now());

    const stats = getStats(userId);
    stats.voiceJoins += 1;
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    const startedAt = voiceSessions.get(userId);

    if (startedAt) {
      const minutes = Math.max(
        0,
        Math.round((Date.now() - startedAt) / 60000)
      );

      const stats = getStats(userId);
      stats.voiceMinutes += minutes;

      voiceSessions.delete(userId);
    }
  }
});

/* ---------------- Health ---------------- */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Fahad",
    discordReady: discord.isReady(),
    time: now()
  });
});

/* ---------------- Auth ---------------- */

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      authenticated: false,
      user: null
    });
  }

  const user = db.users.find(
    (item) => item.id === req.session.userId
  );

  if (!user) {
    req.session.destroy(() => {});

    return res.json({
      authenticated: false,
      user: null
    });
  }

  res.json({
    authenticated: true,
    user: publicUser(user),
    isAdmin: isAdminUser(user)
  });
});

app.post("/api/auth/register", (req, res) => {
  const username = clean(req.body.username, 32);
  const password = String(req.body.password || "");
  const displayName = clean(
    req.body.displayName || username,
    80
  );
  const discordId = clean(req.body.discordId, 64);

  if (!username || !password) {
    return res.status(400).json({
      error: "اسم المستخدم وكلمة المرور مطلوبان"
    });
  }

  if (username.length < 3) {
    return res.status(400).json({
      error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
    });
  }

  const normalized = normalizeUsername(username);

  const exists = db.users.some(
    (user) => normalizeUsername(user.username) === normalized
  );

  if (exists) {
    return res.status(409).json({
      error: "اسم المستخدم مستخدم بالفعل"
    });
  }

  const user = {
    id: id("user"),
    username,
    displayName,
    passwordHash: hashPassword(password),
    discordId: discordId || null,
    avatar: null,
    createdAt: now(),
    lastLoginAt: null
  };

  db.users.push(user);

  req.session.userId = user.id;

  logAction("register", user.id, {
    username: user.username
  });

  res.status(201).json({
    ok: true,
    user: publicUser(user)
  });
});

app.post("/api/auth/login", (req, res) => {
  const username = clean(req.body.username, 32);
  const password = String(req.body.password || "");

  const user = db.users.find(
    (item) =>
      normalizeUsername(item.username) ===
      normalizeUsername(username)
  );

  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({
      error: "اسم المستخدم أو كلمة المرور غير صحيحة"
    });
  }

  user.lastLoginAt = now();

  req.session.userId = user.id;

  logAction("login", user.id);

  res.json({
    ok: true,
    user: publicUser(user),
    isAdmin: isAdminUser(user)
  });
});

app.post("/api/auth/logout", (req, res) => {
  const userId = req.session.userId;

  req.session.destroy(() => {
    if (userId) {
      logAction("logout", userId);
    }

    res.json({
      ok: true
    });
  });
});

app.patch("/api/auth/profile", requireLogin, (req, res) => {
  const displayName = clean(req.body.displayName, 80);
  const discordId = clean(req.body.discordId, 64);

  if (displayName) {
    req.user.displayName = displayName;
  }

  if (req.body.discordId !== undefined) {
    req.user.discordId = discordId || null;
  }

  logAction("profile_update", req.user.id);

  res.json({
    ok: true,
    user: publicUser(req.user)
  });
});

/* ---------------- Public Discord API ---------------- */

app.get("/api/public/server", async (req, res) => {
  try {
    const guild = getGuild();

    if (!guild) {
      return res.status(503).json({
        error: "Discord server is not available"
      });
    }

    await guild.members.fetch().catch(() => {});

    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({
        extension: "png",
        size: 512
      }),
      banner: guild.bannerURL({
        extension: "png",
        size: 1024
      }),
      description: guild.description || "",
      memberCount: guild.memberCount,
      onlineCount: guild.members.cache.filter(
        (member) =>
          member.presence &&
          member.presence.status &&
          member.presence.status !== "offline"
      ).size,
      roles: guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        }))
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load Discord server"
    });
  }
});

app.get("/api/public/members", async (req, res) => {
  try {
    const members = await fetchMembers();

    const search = clean(req.query.search, 100).toLowerCase();
    const roleId = clean(req.query.roleId, 100);

    let result = [...members.values()];

    if (search) {
      result = result.filter((member) => {
        const name = String(
          member.displayName ||
            member.user?.globalName ||
            member.user?.username ||
            ""
        ).toLowerCase();

        const username = String(
          member.user?.username || ""
        ).toLowerCase();

        return (
          name.includes(search) ||
          username.includes(search)
        );
      });
    }

    if (roleId) {
      result = result.filter((member) =>
        member.roles.cache.has(roleId)
      );
    }

    result.sort((a, b) => {
      const aName =
        a.displayName ||
        a.user?.globalName ||
        a.user?.username ||
        "";

      const bName =
        b.displayName ||
        b.user?.globalName ||
        b.user?.username ||
        "";

      return aName.localeCompare(bName, "ar");
    });

    res.json({
      members: result.map(memberObject),
      total: result.length
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load Discord members"
    });
  }
});

app.get("/api/public/member/:id", async (req, res) => {
  try {
    const members = await fetchMembers();
    const member = members.get(req.params.id);

    if (!member) {
      return res.status(404).json({
        error: "Member not found"
      });
    }

    res.json(memberObject(member));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load member"
    });
  }
});

app.get("/api/public/roles", async (req, res) => {
  try {
    const guild = getGuild();

    if (!guild) {
      return res.status(503).json({
        error: "Discord server is not available"
      });
    }

    const roles = guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
        memberCount: guild.members.cache.filter(
          (member) => member.roles.cache.has(role.id)
        ).size
      }));

    res.json({
      roles
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load Discord roles"
    });
  }
});

app.get("/api/public/roles/:id/members", async (req, res) => {
  try {
    const guild = getGuild();

    if (!guild) {
      return res.status(503).json({
        error: "Discord server is not available"
      });
    }

    await guild.members.fetch().catch(() => {});

    const members = [...guild.members.cache.values()]
      .filter((member) =>
        member.roles.cache.has(req.params.id)
      )
      .map(memberObject);

    res.json({
      members,
      total: members.length
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load role members"
    });
  }
});

app.get("/api/public/top", async (req, res) => {
  try {
    const members = await fetchMembers();

    const top = [...members.values()]
      .filter((member) => !member.user?.bot)
      .map(memberObject)
      .sort(
        (a, b) =>
          b.stats.messages - a.stats.messages
      )
      .slice(0, 50);

    res.json({
      members: top
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load leaderboard"
    });
  }
});

/* ---------------- Groups ---------------- */

app.get("/api/groups", (req, res) => {
  const groups = db.groups
    .filter((group) => group.status !== "rejected")
    .map(groupObject);

  res.json({
    groups
  });
});

app.get("/api/groups/:id", (req, res) => {
  const group = getGroup(req.params.id);

  if (!group || group.status === "rejected") {
    return res.status(404).json({
      error: "المجموعة غير موجودة"
    });
  }

  res.json({
    group: groupObject(group)
  });
});

app.post("/api/groups", requireLogin, async (req, res) => {
  const name = clean(req.body.name, 100);
  const description = clean(req.body.description, 2000);

  if (!name) {
    return res.status(400).json({
      error: "اسم المجموعة مطلوب"
    });
  }

  const group = {
    id: id("group"),
    name,
    description,
    ownerId: req.user.id,
    status: "pending",
    createdAt: now(),
    approvedAt: null,
    rejectedAt: null,
    discordRoleId: null,
    discordTextChannelId: null,
    discordVoiceChannelId: null
  };

  db.groups.push(group);

  db.groupMembers.push({
    id: id("groupmember"),
    groupId: group.id,
    userId: req.user.id,
    status: "owner",
    joinedAt: now()
  });

  logAction("group_create", req.user.id, {
    groupId: group.id,
    name
  });

  const channelId = getAdminDiscordChannelId();

  if (channelId) {
    await sendDiscordEmbed({
      channelId,
      title: "طلب إنشاء مجموعة جديدة",
      description: `تم إنشاء طلب مجموعة جديد من الموقع.`,
      color: 0xf1c40f,
      fields: [
        {
          name: "اسم المجموعة",
          value: name || "—",
          inline: false
        },
        {
          name: "صاحب المجموعة",
          value: `${req.user.username} (${req.user.id})`,
          inline: false
        },
        {
          name: "معرف الطلب",
          value: group.id,
          inline: false
        },
        {
          name: "الحالة",
          value: "بانتظار موافقة الإدارة",
          inline: false
        }
      ]
    });
  }

  res.status(201).json({
    ok: true,
    group: groupObject(group),
    message: "تم إرسال المجموعة للإدارة للموافقة"
  });
});

app.post(
  "/api/groups/:id/join",
  requireLogin,
  async (req, res) => {
    const group = getGroup(req.params.id);

    if (!group || group.status !== "approved") {
      return res.status(404).json({
        error: "المجموعة غير متاحة للانضمام"
      });
    }

    if (group.ownerId === req.user.id) {
      return res.status(400).json({
        error: "أنت صاحب المجموعة بالفعل"
      });
    }

    const existing = db.groupMembers.find(
      (member) =>
        member.groupId === group.id &&
        member.userId === req.user.id &&
        member.status !== "rejected"
    );

    if (existing) {
      return res.status(409).json({
        error:
          existing.status === "pending"
            ? "طلبك قيد المراجعة"
            : "أنت عضو بالفعل"
      });
    }

    const membership = {
      id: id("groupmember"),
      groupId: group.id,
      userId: req.user.id,
      status: "pending",
      joinedAt: now()
    };

    db.groupMembers.push(membership);

    const owner = getGroupOwner(group);

    logAction("group_join_request", req.user.id, {
      groupId: group.id,
      ownerId: group.ownerId
    });

    if (owner?.discordId) {
      await sendDiscordDM(
        owner.discordId,
        `طلب انضمام جديد إلى مجموعة "${group.name}"\n\nاسم المستخدم: ${req.user.username}\nمعرف المستخدم: ${req.user.id}\nمعرف المجموعة: ${group.id}\n\nيمكن لصاحب المجموعة مراجعة الطلب من لوحة الموقع.`
      );
    }

    const adminChannelId = getAdminDiscordChannelId();

    if (adminChannelId) {
      await sendDiscordEmbed({
        channelId: adminChannelId,
        title: "طلب انضمام إلى مجموعة",
        description: `يوجد طلب جديد للانضمام إلى مجموعة.`,
        color: 0x3498db,
        fields: [
          {
            name: "المجموعة",
            value: group.name,
            inline: false
          },
          {
            name: "المستخدم",
            value: `${req.user.username} (${req.user.id})`,
            inline: false
          },
          {
            name: "صاحب المجموعة",
            value: owner?.username || group.ownerId,
            inline: false
          }
        ]
      });
    }

    res.status(201).json({
      ok: true,
      message: "تم إرسال طلب الانضمام"
    });
  }
);

app.get(
  "/api/groups/:id/join-requests",
  requireLogin,
  (req, res) => {
    const group = getGroup(req.params.id);

    if (!group) {
      return res.status(404).json({
        error: "المجموعة غير موجودة"
      });
    }

    if (
      group.ownerId !== req.user.id &&
      !isAdminUser(req.user)
    ) {
      return res.status(403).json({
        error: "ليس لديك صلاحية"
      });
    }

    const requests = db.groupMembers
      .filter(
        (member) =>
          member.groupId === group.id &&
          member.status === "pending"
      )
      .map((member) => ({
        ...member,
        user: publicUser(
          db.users.find(
            (user) => user.id === member.userId
          )
        )
      }));

    res.json({
      requests
    });
  }
);

app.post(
  "/api/groups/:id/join-requests/:requestId",
  requireLogin,
  async (req, res) => {
    const group = getGroup(req.params.id);

    if (!group) {
      return res.status(404).json({
        error: "المجموعة غير موجودة"
      });
    }

    if (
      group.ownerId !== req.user.id &&
      !isAdminUser(req.user)
    ) {
      return res.status(403).json({
        error: "ليس لديك صلاحية"
      });
    }

    const request = db.groupMembers.find(
      (member) =>
        member.id === req.params.requestId &&
        member.groupId === group.id
    );

    if (!request) {
      return res.status(404).json({
        error: "الطلب غير موجود"
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        error: "تمت معالجة الطلب مسبقاً"
      });
    }

    const action =
      clean(req.body.action, 20).toLowerCase();

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        error: "الإجراء غير صالح"
      });
    }

    request.status =
      action === "approve"
        ? "approved"
        : "rejected";

    request.reviewedAt = now();
    request.reviewedBy = req.user.id;

    const targetUser = db.users.find(
      (user) => user.id === request.userId
    );

    if (action === "approve") {
      if (targetUser?.discordId) {
        await sendDiscordDM(
          targetUser.discordId,
          `تم قبول طلب انضمامك إلى مجموعة "${group.name}".`
        );
      }
    } else {
      if (targetUser?.discordId) {
        await sendDiscordDM(
          targetUser.discordId,
          `تم رفض طلب انضمامك إلى مجموعة "${group.name}".`
        );
      }
    }

    logAction(
      action === "approve"
        ? "group_join_approved"
        : "group_join_rejected",
      req.user.id,
      {
        groupId: group.id,
        userId: request.userId
      }
    );

    res.json({
      ok: true,
      request
    });
  }
);

app.delete(
  "/api/groups/:id/members/:userId",
  requireLogin,
  (req, res) => {
    const group = getGroup(req.params.id);

    if (!group) {
      return res.status(404).json({
        error: "المجموعة غير موجودة"
      });
    }

    if (
      group.ownerId !== req.user.id &&
      !isAdminUser(req.user)
    ) {
      return res.status(403).json({
        error: "ليس لديك صلاحية"
      });
    }

    const member = db.groupMembers.find(
      (item) =>
        item.groupId === group.id &&
        item.userId === req.params.userId
    );

    if (!member) {
      return res.status(404).json({
        error: "العضو غير موجود"
      });
    }

    member.status = "removed";
    member.removedAt = now();
    member.removedBy = req.user.id;

    res.json({
      ok: true
    });
  }
);

app.get(
  "/api/groups/:id/messages",
  requireLogin,
  (req, res) => {
    const group = getGroup(req.params.id);

    if (!group) {
      return res.status(404).json({
        error: "المجموعة غير موجودة"
      });
    }

    const member = db.groupMembers.find(
      (item) =>
        item.groupId === group.id &&
        item.userId === req.user.id &&
        ["owner", "approved"].includes(item.status)
    );

    if (!member && !isAdminUser(req.user)) {
      return res.status(403).json({
        error: "يجب أن تكون عضواً"
      });
    }

    const messages = db.groupMessages
      .filter(
        (message) => message.groupId === group.id
      )
      .map((message) => ({
        ...message,
        user: publicUser(
          db.users.find(
            (user) => user.id === message.userId
          )
        )
      }));

    res.json({
      messages
    });
  }
);

app.post(
  "/api/groups/:id/messages",
  requireLogin,
  (req, res) => {
    const group = getGroup(req.params.id);

    if (!group) {
      return res.status(404).json({
        error: "المجموعة غير موجودة"
      });
    }

    const member = db.groupMembers.find(
      (item) =>
        item.groupId === group.id &&
        item.userId === req.user.id &&
        ["owner", "approved"].includes(item.status)
    );

    if (!member && !isAdminUser(req.user)) {
      return res.status(403).json({
        error: "يجب أن تكون عضواً"
      });
    }

    const content = clean(req.body.content, 4000);

    if (!content) {
      return res.status(400).json({
        error: "الرسالة فارغة"
      });
    }

    const message = {
      id: id("groupmsg"),
      groupId: group.id,
      userId: req.user.id,
      content,
      createdAt: now()
    };

    db.groupMessages.push(message);

    io.emit("group_message", {
      groupId: group.id,
      message: {
        ...message,
        user: publicUser(req.user)
      }
    });

    res.status(201).json({
      ok: true,
      message: {
        ...message,
        user: publicUser(req.user)
      }
    });
  }
);

/* ---------------- Tickets ---------------- */

app.get("/api/tickets", requireLogin, (req, res) => {
  const tickets = db.tickets
    .filter(
      (ticket) =>
        ticket.userId === req.user.id ||
        isAdminUser(req.user)
    )
    .map(ticketObject);

  res.json({
    tickets
  });
});

app.post("/api/tickets", requireLogin, async (req, res) => {
  const subject = clean(req.body.subject, 200);
  const type = clean(req.body.type || "general", 50);
  const content = clean(req.body.content, 5000);

  if (!subject || !content) {
    return res.status(400).json({
      error: "عنوان التذكرة والرسالة مطلوبان"
    });
  }

  const ticket = {
    id: id("ticket"),
    userId: req.user.id,
    subject,
    type,
    status: "open",
    createdAt: now(),
    updatedAt: now()
  };

  db.tickets.push(ticket);

  db.ticketMessages.push({
    id: id("ticketmsg"),
    ticketId: ticket.id,
    userId: req.user.id,
    content,
    createdAt: now(),
    internal: false
  });

  const channelId = getAdminDiscordChannelId();

  if (channelId) {
    await sendDiscordEmbed({
      channelId,
      title: "تذكرة جديدة",
      color: 0x2ecc71,
      fields: [
        {
          name: "المستخدم",
          value: `${req.user.username} (${req.user.id})`,
          inline: false
        },
        {
          name: "العنوان",
          value: subject,
          inline: false
        },
        {
          name: "النوع",
          value: type,
          inline: true
        },
        {
          name: "التذكرة",
          value: ticket.id,
          inline: true
        },
        {
          name: "الرسالة",
          value: content.slice(0, 1000),
          inline: false
        }
      ]
    });
  }

  logAction("ticket_create", req.user.id, {
    ticketId: ticket.id
  });

  res.status(201).json({
    ok: true,
    ticket: ticketObject(ticket)
  });
});

app.get(
  "/api/tickets/:id",
  requireLogin,
  (req, res) => {
    const ticket = db.tickets.find(
      (item) => item.id === req.params.id
    );

    if (!ticket) {
      return res.status(404).json({
        error: "التذكرة غير موجودة"
      });
    }

    if (
      ticket.userId !== req.user.id &&
      !isAdminUser(req.user)
    ) {
      return res.status(403).json({
        error: "ليس لديك صلاحية"
      });
    }

    res.json({
      ticket: ticketObject(ticket)
    });
  }
);

app.post(
  "/api/tickets/:id/messages",
  requireLogin,
  (req, res) => {
    const ticket = db.tickets.find(
      (item) => item.id === req.params.id
    );

    if (!ticket) {
      return res.status(404).json({
        error: "التذكرة غير موجودة"
      });
    }

    if (
      ticket.userId !== req.user.id &&
      !isAdminUser(req.user)
    ) {
      return res.status(403).json({
        error: "ليس لديك صلاحية"
      });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({
        error: "التذكرة مغلقة"
      });
    }

    const content = clean(req.body.content, 5000);

    if (!content) {
      return res.status(400).json({
        error: "الرسالة فارغة"
      });
    }

    const message = {
      id: id("ticketmsg"),
      ticketId: ticket.id,
      userId: req.user.id,
      content,
      createdAt: now(),
      internal: false
    };

    db.ticketMessages.push(message);
    ticket.updatedAt = now();

    res.status(201).json({
      ok: true,
      message: {
        ...message,
        user: publicUser(req.user)
      }
    });
  }
);

app.patch(
  "/api/tickets/:id",
  requireAdmin,
  (req, res) => {
    const ticket = db.tickets.find(
      (item) => item.id === req.params.id
    );

    if (!ticket) {
      return res.status(404).json({
        error: "التذكرة غير موجودة"
      });
    }

    const status = clean(req.body.status, 50);

    if (
      status &&
      !["open", "pending", "closed", "resolved"].includes(
        status
      )
    ) {
      return res.status(400).json({
        error: "حالة غير صالحة"
      });
    }

    if (status) {
      ticket.status = status;
    }

    ticket.updatedAt = now();

    logAction("ticket_update", req.user.id, {
      ticketId: ticket.id,
      status: ticket.status
    });

    res.json({
      ok: true,
      ticket: ticketObject(ticket)
    });
  }
);

/* ---------------- Applications ---------------- */

app.get(
  "/api/applications",
  requireLogin,
  (req, res) => {
    const applications = db.applications
      .filter(
        (application) =>
          application.userId === req.user.id ||
          isAdminUser(req.user)
      )
      .map(applicationObject);

    res.json({
      applications
    });
  }
);

app.post(
  "/api/applications",
  requireLogin,
  async (req, res) => {
    const type = clean(req.body.type, 100);
    const answers =
      req.body.answers &&
      typeof req.body.answers === "object"
        ? req.body.answers
        : {};

    if (!type) {
      return res.status(400).json({
        error: "نوع الطلب مطلوب"
      });
    }

    const application = {
      id: id("application"),
      userId: req.user.id,
      type,
      answers,
      status: "pending",
      createdAt: now(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: ""
    };

    db.applications.push(application);

    const channelId = getAdminDiscordChannelId();

    if (channelId) {
      await sendDiscordEmbed({
        channelId,
        title: "طلب تقديم جديد",
        color: 0x9b59b6,
        fields: [
          {
            name: "المستخدم",
            value: `${req.user.username} (${req.user.id})`,
            inline: false
          },
          {
            name: "النوع",
            value: type,
            inline: false
          },
          {
            name: "رقم الطلب",
            value: application.id,
            inline: false
          },
          {
            name: "الإجابات",
            value: JSON.stringify(answers).slice(0, 1000),
            inline: false
          }
        ]
      });
    }

    logAction("application_create", req.user.id, {
      applicationId: application.id,
      type
    });

    res.status(201).json({
      ok: true,
      application: applicationObject(application)
    });
  }
);

app.patch(
  "/api/applications/:id",
  requireAdmin,
  async (req, res) => {
    const application = db.applications.find(
      (item) => item.id === req.params.id
    );

    if (!application) {
      return res.status(404).json({
        error: "الطلب غير موجود"
      });
    }

    const status = clean(req.body.status, 50);
    const reviewNote = clean(
      req.body.reviewNote,
      2000
    );

    if (
      !["pending", "approved", "rejected"].includes(
        status
      )
    ) {
      return res.status(400).json({
        error: "حالة غير صالحة"
      });
    }

    application.status = status;
    application.reviewedAt = now();
    application.reviewedBy = req.user.id;
    application.reviewNote = reviewNote;

    const targetUser = db.users.find(
      (user) => user.id === application.userId
    );

    if (targetUser?.discordId) {
      await sendDiscordDM(
        targetUser.discordId,
        `تم تحديث حالة طلبك "${application.type}" إلى: ${status}${
          reviewNote ? `\nملاحظة الإدارة: ${reviewNote}` : ""
        }`
      );
    }

    logAction("application_update", req.user.id, {
      applicationId: application.id,
      status
    });

    res.json({
      ok: true,
      application: applicationObject(application)
    });
  }
);

/* ---------------- Watch Rooms ---------------- */

app.get("/api/watch-rooms", requireLogin, (req, res) => {
  res.json({
    rooms: db.watchRooms
  });
});

app.post(
  "/api/watch-rooms",
  requireLogin,
  (req, res) => {
    const title = clean(req.body.title, 200);
    const mediaId = clean(req.body.mediaId, 200);

    if (!title || !mediaId) {
      return res.status(400).json({
        error: "عنوان المحتوى ومعرفه مطلوبان"
      });
    }

    const room = {
      id: id("watch"),
      ownerId: req.user.id,
      title,
      mediaId,
      status: "waiting",
      currentTime: 0,
      playing: false,
      participants: [req.user.id],
      createdAt: now()
    };

    db.watchRooms.push(room);

    res.status(201).json({
      ok: true,
      room
    });
  }
);

app.get(
  "/api/watch-rooms/:id",
  requireLogin,
  (req, res) => {
    const room = db.watchRooms.find(
      (item) => item.id === req.params.id
    );

    if (!room) {
      return res.status(404).json({
        error: "غرفة المشاهدة غير موجودة"
      });
    }

    res.json({
      room
    });
  }
);

app.post(
  "/api/watch-rooms/:id/join",
  requireLogin,
  (req, res) => {
    const room = db.watchRooms.find(
      (item) => item.id === req.params.id
    );

    if (!room) {
      return res.status(404).json({
        error: "غرفة المشاهدة غير موجودة"
      });
    }

    if (!room.participants.includes(req.user.id)) {
      room.participants.push(req.user.id);
    }

    io.to(`watch:${room.id}`).emit(
      "watch_participants",
      room.participants
    );

    res.json({
      ok: true,
      room
    });
  }
);

/* ---------------- Admin ---------------- */

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  let discordMembers = 0;

  try {
    const guild = getGuild();

    if (guild) {
      await guild.members.fetch().catch(() => {});
      discordMembers = guild.memberCount;
    }
  } catch {}

  res.json({
    stats: {
      users: db.users.length,
      admins: db.admins.length,
      groups: db.groups.length,
      pendingGroups: db.groups.filter(
        (group) => group.status === "pending"
      ).length,
      tickets: db.tickets.length,
      openTickets: db.tickets.filter(
        (ticket) => ticket.status !== "closed"
      ).length,
      applications: db.applications.length,
      pendingApplications: db.applications.filter(
        (application) => application.status === "pending"
      ).length,
      watchRooms: db.watchRooms.length,
      discordMembers
    }
  });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({
    users: db.users.map(publicUser)
  });
});

app.get("/api/admin/groups", requireAdmin, (req, res) => {
  res.json({
    groups: db.groups.map(groupObject)
  });
});

app.patch(
  "/api/admin/groups/:id",
  requireAdmin,
  async (req, res) => {
    const group = getGroup(req.params.id);

    if (!group) {
      return res.status(404).json({
        error: "المجموعة غير موجودة"
      });
    }

    const status = clean(req.body.status, 30);

    if (
      !["pending", "approved", "rejected"].includes(
        status
      )
    ) {
      return res.status(400).json({
        error: "حالة غير صالحة"
      });
    }

    group.status = status;

    if (status === "approved") {
      group.approvedAt = now();
      group.rejectedAt = null;

      const ownerMembership =
        db.groupMembers.find(
          (member) =>
            member.groupId === group.id &&
            member.userId === group.ownerId
        );

      if (ownerMembership) {
        ownerMembership.status = "owner";
      }

      const owner = getGroupOwner(group);

      if (owner?.discordId) {
        await sendDiscordDM(
          owner.discordId,
          `تمت الموافقة على مجموعتك "${group.name}".`
        );
      }
    }

    if (status === "rejected") {
      group.rejectedAt = now();

      const owner = getGroupOwner(group);

      if (owner?.discordId) {
        await sendDiscordDM(
          owner.discordId,
          `تم رفض إنشاء مجموعتك "${group.name}".`
        );
      }
    }

    logAction("group_status_change", req.user.id, {
      groupId: group.id,
      status
    });

    res.json({
      ok: true,
      group: groupObject(group)
    });
  }
);

app.get(
  "/api/admin/tickets",
  requireAdmin,
  (req, res) => {
    res.json({
      tickets: db.tickets.map(ticketObject)
    });
  }
);

app.get(
  "/api/admin/applications",
  requireAdmin,
  (req, res) => {
    res.json({
      applications: db.applications.map(
        applicationObject
      )
    });
  }
);

app.get("/api/admin/logs", requireAdmin, (req, res) => {
  const limit = Math.min(
    Number(req.query.limit || 200),
    1000
  );

  res.json({
    logs: db.logs.slice(-limit).reverse()
  });
});

app.get("/api/admin/discord", requireAdmin, async (req, res) => {
  try {
    const guild = getGuild();

    if (!guild) {
      return res.status(503).json({
        error: "Discord server is not available"
      });
    }

    await guild.members.fetch().catch(() => {});

    res.json({
      ready: discord.isReady(),
      server: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount
      },
      roles: guild.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        })),
      channels: guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId || null
      }))
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load Discord admin data"
    });
  }
});

app.post(
  "/api/admin/discord/message",
  requireAdmin,
  async (req, res) => {
    const channelId = clean(
      req.body.channelId,
      100
    );
    const content = clean(req.body.content, 4000);

    if (!channelId || !content) {
      return res.status(400).json({
        error: "القناة والرسالة مطلوبان"
      });
    }

    try {
      const channel =
        discord.channels.cache.get(channelId) ||
        (await discord.channels.fetch(channelId));

      if (!channel || !channel.isTextBased()) {
        return res.status(400).json({
          error: "القناة غير صالحة"
        });
      }

      const message = await channel.send({
        content
      });

      logAction("discord_message", req.user.id, {
        channelId,
        messageId: message.id
      });

      res.json({
        ok: true,
        messageId: message.id
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "فشل إرسال الرسالة إلى Discord"
      });
    }
  }
);

app.get(
  "/api/admin/notifications",
  requireAdmin,
  (req, res) => {
    const notifications = [];

    for (const group of db.groups.filter(
      (item) => item.status === "pending"
    )) {
      notifications.push({
        id: `group:${group.id}`,
        type: "group",
        title: "طلب مجموعة جديد",
        message: `طلب إنشاء مجموعة: ${group.name}`,
        createdAt: group.createdAt,
        data: groupObject(group)
      });
    }

    for (const application of db.applications.filter(
      (item) => item.status === "pending"
    )) {
      notifications.push({
        id: `application:${application.id}`,
        type: "application",
        title: "طلب تقديم جديد",
        message: application.type,
        createdAt: application.createdAt,
        data: applicationObject(application)
      });
    }

    for (const ticket of db.tickets.filter(
      (item) =>
        item.status !== "closed"
    )) {
      notifications.push({
        id: `ticket:${ticket.id}`,
        type: "ticket",
        title: "تذكرة مفتوحة",
        message: ticket.subject,
        createdAt: ticket.createdAt,
        data: ticketObject(ticket)
      });
    }

    notifications.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

    res.json({
      notifications
    });
  }
);

/* ---------------- Admin Accounts ---------------- */

app.get(
  "/api/admin/admins",
  requireAdmin,
  (req, res) => {
    res.json({
      admins: db.admins.map((admin) => ({
        ...admin,
        user: publicUser(
          db.users.find(
            (user) => user.id === admin.userId
          )
        )
      }))
    });
  }
);

app.post(
  "/api/admin/admins",
  requireAdmin,
  (req, res) => {
    const username = clean(req.body.username, 32);

    const user = db.users.find(
      (item) =>
        normalizeUsername(item.username) ===
        normalizeUsername(username)
    );

    if (!user) {
      return res.status(404).json({
        error: "المستخدم غير موجود"
      });
    }

    const exists = db.admins.some(
      (admin) => admin.userId === user.id
    );

    if (exists) {
      return res.status(409).json({
        error: "المستخدم مدير بالفعل"
      });
    }

    const admin = {
      id: id("admin"),
      userId: user.id,
      active: true,
      createdAt: now(),
      createdBy: req.user.id
    };

    db.admins.push(admin);

    logAction("admin_add", req.user.id, {
      userId: user.id
    });

    res.status(201).json({
      ok: true,
      admin
    });
  }
);

app.delete(
  "/api/admin/admins/:id",
  requireAdmin,
  (req, res) => {
    const admin = db.admins.find(
      (item) => item.id === req.params.id
    );

    if (!admin) {
      return res.status(404).json({
        error: "المدير غير موجود"
      });
    }

    admin.active = false;

    logAction("admin_remove", req.user.id, {
      adminId: admin.id
    });

    res.json({
      ok: true
    });
  }
);

/* ---------------- User Notifications ---------------- */

app.get(
  "/api/notifications",
  requireLogin,
  (req, res) => {
    const notifications = [];

    for (const group of db.groups) {
      if (group.ownerId === req.user.id) {
        const pending = db.groupMembers.filter(
          (member) =>
            member.groupId === group.id &&
            member.status === "pending"
        );

        for (const request of pending) {
          const user = db.users.find(
            (item) => item.id === request.userId
          );

          notifications.push({
            id: `join:${request.id}`,
            type: "group_join",
            title: "طلب انضمام جديد",
            message: `${user?.username || "مستخدم"} يريد الانضمام إلى ${group.name}`,
            createdAt: request.joinedAt,
            data: {
              groupId: group.id,
              requestId: request.id
            }
          });
        }
      }
    }

    for (const application of db.applications.filter(
      (item) =>
        item.userId === req.user.id &&
        item.status !== "pending"
    )) {
      notifications.push({
        id: `application:${application.id}`,
        type: "application",
        title: "تحديث طلب",
        message: `تم تحديث طلب ${application.type} إلى ${application.status}`,
        createdAt:
          application.reviewedAt ||
          application.createdAt,
        data: applicationObject(application)
      });
    }

    notifications.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

    res.json({
      notifications
    });
  }
);

/* ---------------- Socket.IO ---------------- */

io.on("connection", (socket) => {
  socket.on("join_group", (groupId) => {
    if (!groupId) return;

    socket.join(`group:${groupId}`);
  });

  socket.on("leave_group", (groupId) => {
    if (!groupId) return;

    socket.leave(`group:${groupId}`);
  });

  socket.on("join_watch", (roomId) => {
    if (!roomId) return;

    socket.join(`watch:${roomId}`);
  });

  socket.on("leave_watch", (roomId) => {
    if (!roomId) return;

    socket.leave(`watch:${roomId}`);
  });

  socket.on("watch_state", (data) => {
    if (!data || !data.roomId) {
      return;
    }

    const room = db.watchRooms.find(
      (item) => item.id === data.roomId
    );

    if (!room) {
      return;
    }

    if (typeof data.currentTime === "number") {
      room.currentTime = Math.max(
        0,
        data.currentTime
      );
    }

    if (typeof data.playing === "boolean") {
      room.playing = data.playing;
    }

    socket
      .to(`watch:${room.id}`)
      .emit("watch_state", {
        currentTime: room.currentTime,
        playing: room.playing,
        updatedAt: now()
      });
  });

  socket.on("disconnect", () => {});
});

/* ---------------- Static ---------------- */

app.use(express.static(publicDir));

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path === "/health"
  ) {
    return next();
  }

  res.sendFile(
    path.join(publicDir, "index.html"),
    (error) => {
      if (error) {
        next(error);
      }
    }
  );
});

/* ---------------- Error Handler ---------------- */

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "حدث خطأ داخلي في الخادم"
  });
});

/* ---------------- Owner Account ---------------- */

function ensureOwnerAccount() {
  if (!OWNER_USERNAME) {
    return;
  }

  const existing = db.users.find(
    (user) =>
      normalizeUsername(user.username) ===
      normalizeUsername(OWNER_USERNAME)
  );

  if (existing) {
    return;
  }

  const owner = {
    id: OWNER_ID || id("user"),
    username: OWNER_USERNAME,
    displayName: OWNER_USERNAME,
    passwordHash: hashPassword(OWNER_PASSWORD),
    discordId: OWNER_ID || null,
    avatar: null,
    createdAt: now(),
    lastLoginAt: null
  };

  db.users.push(owner);

  db.admins.push({
    id: id("admin"),
    userId: owner.id,
    active: true,
    createdAt: now(),
    createdBy: owner.id
  });

  console.log(
    `Owner account created: ${OWNER_USERNAME}`
  );
}

ensureOwnerAccount();

/* ---------------- Start ---------------- */

server.listen(PORT, () => {
  console.log(`Fahad website running on port ${PORT}`);
});

discord.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error(
    "Discord login failed:",
    error.message
  );
});

