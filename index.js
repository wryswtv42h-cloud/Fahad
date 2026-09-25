"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const { Server } = require("socket.io");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const port = Number(process.env.PORT || 3000);

if (!token || !guildId) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
  process.exit(1);
}

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

/* =========================
   DISCORD
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

/* =========================
   EXPRESS
========================= */

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(cors());

app.use(express.json({ limit: "50kb" }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true
    }),
    secret:
      process.env.SESSION_SECRET ||
      "change-this-session-secret-before-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   OWNER
========================= */

const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "change-me";

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

/* =========================
   MEMORY
========================= */

const activity = new Map();
const voiceSessions = new Map();
const sendHits = new Map();

let guildCache = null;
let guildCacheAt = 0;
let guildFetchPromise = null;

let memberSnapshot = null;
let memberSnapshotAt = 0;
let memberFetchPromise = null;

const MEMBER_CACHE_TTL = 45000;
const GUILD_CACHE_TTL = 15000;

/* =========================
   DATABASE SETUP
========================= */

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      can_tickets BOOLEAN DEFAULT TRUE,
      can_applications BOOLEAN DEFAULT TRUE,
      can_groups BOOLEAN DEFAULT FALSE,
      can_logs BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(500),
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subject VARCHAR(150) NOT NULL,
      status VARCHAR(20) DEFAULT 'open',
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      answers JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'pending',
      reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      response TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS private_message_logs (
      id BIGSERIAL PRIMARY KEY,
      sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      discord_member_id TEXT,
      title TEXT,
      message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS watch_rooms (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      media_url TEXT NOT NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      current_time DOUBLE PRECISION DEFAULT 0,
      playing BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const ownerExists = await pool.query(
    "SELECT id FROM users WHERE username = $1 LIMIT 1",
    [OWNER_USERNAME]
  );

  if (!ownerExists.rows.length) {
    const hash = await bcrypt.hash(OWNER_PASSWORD, 12);

    await pool.query(
      `INSERT INTO users
       (username, password_hash, role)
       VALUES ($1, $2, 'owner')`,
      [OWNER_USERNAME, hash]
    );

    console.log("Owner account created:", OWNER_USERNAME);
  }
}

/* =========================
   AUTH HELPERS
========================= */

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "يجب تسجيل الدخول أولًا"
    });
  }

  next();
}

function requireOwner(req, res, next) {
  if (!req.session.user || req.session.user.role !== "owner") {
    return res.status(403).json({
      error: "هذه الصفحة للمالك فقط"
    });
  }

  next();
}

function requireStaff(req, res, next) {
  if (
    !req.session.user ||
    !["owner", "admin"].includes(req.session.user.role)
  ) {
    return res.status(403).json({
      error: "لا تملك صلاحية الإدارة"
    });
  }

  next();
}

async function writeLog(userId, action, details = {}) {
  try {
    await pool.query(
      `INSERT INTO logs
       (user_id, action, details)
       VALUES ($1, $2, $3)`,
      [userId || null, action, JSON.stringify(details)]
    );
  } catch (error) {
    console.error("Log error:", error.message);
  }
}

/* =========================
   AUTH API
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({
        error: "اسم المستخدم يجب أن يكون من 3 إلى 32 حرفًا أو رقمًا"
      });
    }

    if (password.length < 6 || password.length > 100) {
      return res.status(400).json({
        error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
      });
    }

    const exists = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (exists.rows.length) {
      return res.status(409).json({
        error: "اسم المستخدم مستخدم بالفعل"
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
       (username, password_hash, role)
       VALUES ($1, $2, 'user')
       RETURNING id, username, role`,
      [username, hash]
    );

    const user = result.rows[0];

    req.session.user = user;

    await writeLog(user.id, "register", {
      username
    });

    res.json({
      ok: true,
      user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "تعذر إنشاء الحساب"
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    const result = await pool.query(
      `SELECT id, username, password_hash, role
       FROM users
       WHERE username = $1
       LIMIT 1`,
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        error: "بيانات الدخول غير صحيحة"
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: "بيانات الدخول غير صحيحة"
      });
    }

    delete user.password_hash;

    req.session.user = user;

    await writeLog(user.id, "login");

    res.json({
      ok: true,
      user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "تعذر تسجيل الدخول"
    });
  }
});

app.post("/api/auth/logout", requireLogin, async (req, res) => {
  const id = req.session.user.id;

  await writeLog(id, "logout");

  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

app.get("/api/auth/me", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.user),
    user: req.session.user || null
  });
});

/* =========================
   GROUPS
========================= */

app.get("/api/groups", requireLogin, async (req, res) => {
  const result = await pool.query(`
    SELECT
      g.*,
      COUNT(gm.user_id)::int AS members_count
    FROM groups g
    LEFT JOIN group_members gm
      ON gm.group_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `);

  res.json({
    groups: result.rows
  });
});

app.post("/api/groups", requireLogin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();

  if (!name || name.length > 80) {
    return res.status(400).json({
      error: "اسم القروب غير صحيح"
    });
  }

  const result = await pool.query(
    `INSERT INTO groups
     (name, description, owner_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, description.slice(0, 500), req.session.user.id]
  );

  const group = result.rows[0];

  await pool.query(
    `INSERT INTO group_members
     (group_id, user_id)
     VALUES ($1, $2)`,
    [group.id, req.session.user.id]
  );

  await writeLog(req.session.user.id, "group_created", {
    groupId: group.id,
    name
  });

  res.json({
    ok: true,
    group
  });
});

app.post("/api/groups/:id/join", requireLogin, async (req, res) => {
  const groupId = Number(req.params.id);

  await pool.query(
    `INSERT INTO group_members
     (group_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [groupId, req.session.user.id]
  );

  await writeLog(req.session.user.id, "group_joined", {
    groupId
  });

  res.json({
    ok: true
  });
});

app.get("/api/groups/:id/messages", requireLogin, async (req, res) => {
  const result = await pool.query(
    `SELECT
       gm.id,
       gm.message,
       gm.created_at,
       u.username
     FROM group_messages gm
     LEFT JOIN users u
       ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.created_at ASC
     LIMIT 200`,
    [Number(req.params.id)]
  );

  res.json({
    messages: result.rows
  });
});

app.post("/api/groups/:id/messages", requireLogin, async (req, res) => {
  const message = String(req.body?.message || "").trim();

  if (!message || message.length > 2000) {
    return res.status(400).json({
      error: "الرسالة غير صحيحة"
    });
  }

  const groupId = Number(req.params.id);

  const membership = await pool.query(
    `SELECT 1
     FROM group_members
     WHERE group_id = $1
       AND user_id = $2`,
    [groupId, req.session.user.id]
  );

  if (!membership.rows.length) {
    return res.status(403).json({
      error: "يجب أن تكون عضوًا في القروب"
    });
  }

  const result = await pool.query(
    `INSERT INTO group_messages
     (group_id, user_id, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [groupId, req.session.user.id, message]
  );

  const data = {
    ...result.rows[0],
    username: req.session.user.username
  };

  io.to(`group:${groupId}`).emit("group_message", data);

  await writeLog(req.session.user.id, "group_message", {
    groupId
  });

  res.json({
    ok: true,
    message: data
  });
});

/* =========================
   TICKETS
========================= */

app.post("/api/tickets", requireLogin, async (req, res) => {
  const subject = String(req.body?.subject || "").trim();

  if (!subject || subject.length > 150) {
    return res.status(400).json({
      error: "عنوان التذكرة غير صحيح"
    });
  }

  const result = await pool.query(
    `INSERT INTO tickets
     (user_id, subject)
     VALUES ($1, $2)
     RETURNING *`,
    [req.session.user.id, subject]
  );

  await writeLog(req.session.user.id, "ticket_created", {
    ticketId: result.rows[0].id
  });

  res.json({
    ok: true,
    ticket: result.rows[0]
  });
});

app.get("/api/tickets", requireLogin, async (req, res) => {
  const isStaff = ["owner", "admin"].includes(
    req.session.user.role
  );

  const result = isStaff
    ? await pool.query(`
        SELECT
          t.*,
          u.username
        FROM tickets t
        LEFT JOIN users u
          ON u.id = t.user_id
        ORDER BY t.created_at DESC
      `)
    : await pool.query(
        `SELECT *
         FROM tickets
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [req.session.user.id]
      );

  res.json({
    tickets: result.rows
  });
});

app.get("/api/tickets/:id/messages", requireLogin, async (req, res) => {
  const ticketId = Number(req.params.id);

  const ticket = await pool.query(
    `SELECT *
     FROM tickets
     WHERE id = $1`,
    [ticketId]
  );

  if (!ticket.rows.length) {
    return res.status(404).json({
      error: "التذكرة غير موجودة"
    });
  }

  const t = ticket.rows[0];

  const allowed =
    t.user_id === req.session.user.id ||
    ["owner", "admin"].includes(req.session.user.role);

  if (!allowed) {
    return res.status(403).json({
      error: "ليس لديك صلاحية"
    });
  }

  const messages = await pool.query(
    `SELECT
       tm.*,
       u.username
     FROM ticket_messages tm
     LEFT JOIN users u
       ON u.id = tm.user_id
     WHERE tm.ticket_id = $1
     ORDER BY tm.created_at ASC`,
    [ticketId]
  );

  res.json({
    ticket: t,
    messages: messages.rows
  });
});

app.post("/api/tickets/:id/messages", requireLogin, async (req, res) => {
  const message = String(req.body?.message || "").trim();

  if (!message || message.length > 2000) {
    return res.status(400).json({
      error: "الرسالة غير صحيحة"
    });
  }

  const ticketId = Number(req.params.id);

  const ticket = await pool.query(
    `SELECT *
     FROM tickets
     WHERE id = $1`,
    [ticketId]
  );

  if (!ticket.rows.length) {
    return res.status(404).json({
      error: "التذكرة غير موجودة"
    });
  }

  const t = ticket.rows[0];

  const allowed =
    t.user_id === req.session.user.id ||
    ["owner", "admin"].includes(req.session.user.role);

  if (!allowed) {
    return res.status(403).json({
      error: "ليس لديك صلاحية"
    });
  }

  const result = await pool.query(
    `INSERT INTO ticket_messages
     (ticket_id, user_id, message)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [ticketId, req.session.user.id, message]
  );

  io.to(`ticket:${ticketId}`).emit(
    "ticket_message",
    {
      ...result.rows[0],
      username: req.session.user.username
    }
  );

  await writeLog(req.session.user.id, "ticket_message", {
    ticketId
  });

  res.json({
    ok: true,
    message: result.rows[0]
  });
});

app.post(
  "/api/tickets/:id/claim",
  requireStaff,
  async (req, res) => {
    const ticketId = Number(req.params.id);

    await pool.query(
      `UPDATE tickets
       SET assigned_to = $1
       WHERE id = $2`,
      [req.session.user.id, ticketId]
    );

    await writeLog(req.session.user.id, "ticket_claimed", {
      ticketId
    });

    res.json({
      ok: true
    });
  }
);

app.post(
  "/api/tickets/:id/close",
  requireStaff,
  async (req, res) => {
    const ticketId = Number(req.params.id);

    await pool.query(
      `UPDATE tickets
       SET status = 'closed',
           closed_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );

    await writeLog(req.session.user.id, "ticket_closed", {
      ticketId
    });

    res.json({
      ok: true
    });
  }
);

/* =========================
   APPLICATIONS
========================= */

app.post("/api/applications", requireLogin, async (req, res) => {
  const answers = req.body?.answers;

  if (!answers || typeof answers !== "object") {
    return res.status(400).json({
      error: "بيانات التقديم غير صحيحة"
    });
  }

  const result = await pool.query(
    `INSERT INTO applications
     (user_id, answers)
     VALUES ($1, $2)
     RETURNING *`,
    [req.session.user.id, JSON.stringify(answers)]
  );

  await writeLog(req.session.user.id, "application_created", {
    applicationId: result.rows[0].id
  });

  res.json({
    ok: true,
    application: result.rows[0]
  });
});

app.get(
  "/api/applications",
  requireStaff,
  async (req, res) => {
    const result = await pool.query(`
      SELECT
        a.*,
        u.username
      FROM applications a
      LEFT JOIN users u
        ON u.id = a.user_id
      ORDER BY a.created_at DESC
    `);

    res.json({
      applications: result.rows
    });
  }
);

app.post(
  "/api/applications/:id/review",
  requireStaff,
  async (req, res) => {
    const status = String(req.body?.status || "").trim();
    const response = String(req.body?.response || "").trim();

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        error: "حالة التقديم غير صحيحة"
      });
    }

    await pool.query(
      `UPDATE applications
       SET status = $1,
           reviewer_id = $2,
           response = $3,
           reviewed_at = NOW()
       WHERE id = $4`,
      [
        status,
        req.session.user.id,
        response,
        Number(req.params.id)
      ]
    );

    await writeLog(req.session.user.id, "application_reviewed", {
      applicationId: Number(req.params.id),
      status
    });

    res.json({
      ok: true
    });
  }
);

/* =========================
   ADMIN MANAGEMENT
========================= */

app.get("/api/admins", requireOwner, async (req, res) => {
  const result = await pool.query(`
    SELECT
      u.id,
      u.username,
      u.created_at,
      a.can_tickets,
      a.can_applications,
      a.can_groups,
      a.can_logs
    FROM users u
    JOIN admins a
      ON a.user_id = u.id
    WHERE u.role = 'admin'
    ORDER BY u.created_at DESC
  `);

  res.json({
    admins: result.rows
  });
});

app.post("/api/admins", requireOwner, async (req, res) => {
  const username = String(req.body?.username || "").trim();

  const user = await pool.query(
    `SELECT id
     FROM users
     WHERE username = $1`,
    [username]
  );

  if (!user.rows.length) {
    return res.status(404).json({
      error: "المستخدم غير موجود"
    });
  }

  const id = user.rows[0].id;

  await pool.query(
    `UPDATE users
     SET role = 'admin'
     WHERE id = $1`,
    [id]
  );

  await pool.query(
    `INSERT INTO admins
     (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [id]
  );

  await writeLog(req.session.user.id, "admin_added", {
    targetUserId: id
  });

  res.json({
    ok: true
  });
});

app.delete("/api/admins/:id", requireOwner, async (req, res) => {
  const id = Number(req.params.id);

  await pool.query(
    `UPDATE users
     SET role = 'user'
     WHERE id = $1`,
    [id]
  );

  await pool.query(
    `DELETE FROM admins
     WHERE user_id = $1`,
    [id]
  );

  await writeLog(req.session.user.id, "admin_removed", {
    targetUserId: id
  });

  res.json({
    ok: true
  });
});

/* =========================
   LOGS
========================= */

app.get("/api/logs", requireOwner, async (req, res) => {
  const result = await pool.query(`
    SELECT
      l.*,
      u.username
    FROM logs l
    LEFT JOIN users u
      ON u.id = l.user_id
    ORDER BY l.created_at DESC
    LIMIT 1000
  `);

  res.json({
    logs: result.rows
  });
});

app.get(
  "/api/logs/private-messages",
  requireOwner,
  async (req, res) => {
    const result = await pool.query(`
      SELECT
        p.*,
        u.username
      FROM private_message_logs p
      LEFT JOIN users u
        ON u.id = p.sender_user_id
      ORDER BY p.created_at DESC
      LIMIT 1000
    `);

    res.json({
      logs: result.rows
    });
  }
);

/* =========================
   DISCORD PRIVATE MESSAGE
========================= */

app.post(
  "/api/discord/message",
  requireStaff,
  async (req, res) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const last = sendHits.get(ip) || 0;

    if (now - last < 10000) {
      return res.status(429).json({
        error: "انتظر 10 ثواني قبل الإرسال مرة أخرى"
      });
    }

    const targetId = String(req.body?.memberId || "").trim();
    const title = String(
      req.body?.title || "رسالة من إدارة ملاذ"
    ).trim();
    const text = String(req.body?.message || "").trim();

    if (!targetId || !text || text.length > 2000) {
      return res.status(400).json({
        error: "بيانات الرسالة غير صحيحة"
      });
    }

    try {
      const guild = await getGuild();

      const member = await guild.members
        .fetch(targetId)
        .catch(() => null);

      if (!member) {
        return res.status(404).json({
          error: "العضو غير موجود"
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(text)
        .setColor("#ff9cdc")
        .setFooter({
          text: "Malaz Community"
        })
        .setTimestamp();

      await member.send({
        embeds: [embed]
      });

      sendHits.set(ip, now);

      await pool.query(
        `INSERT INTO private_message_logs
         (sender_user_id, discord_member_id, title, message)
         VALUES ($1, $2, $3, $4)`,
        [
          req.session.user.id,
          targetId,
          title,
          text
        ]
      );

      await writeLog(
        req.session.user.id,
        "discord_private_message",
        {
          discordMemberId: targetId
        }
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error("Discord DM:", error);

      res.status(500).json({
        error: "تعذر إرسال الرسالة"
      });
    }
  }
);

/* =========================
   WATCH ROOMS
========================= */

function randomRoomId() {
  return Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase();
}

app.post(
  "/api/watch/rooms",
  requireLogin,
  async (req, res) => {
    const name = String(req.body?.name || "غرفة مشاهدة")
      .trim()
      .slice(0, 100);

    const mediaUrl = String(req.body?.mediaUrl || "")
      .trim();

    if (!mediaUrl) {
      return res.status(400).json({
        error: "رابط المحتوى مطلوب"
      });
    }

    const id = randomRoomId();

    const result = await pool.query(
      `INSERT INTO watch_rooms
       (id, name, media_url, owner_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        id,
        name,
        mediaUrl,
        req.session.user.id
      ]
    );

    res.json({
      ok: true,
      room: result.rows[0]
    });
  }
);

app.get(
  "/api/watch/rooms/:id",
  async (req, res) => {
    const result = await pool.query(
      `SELECT *
       FROM watch_rooms
       WHERE id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "الغرفة غير موجودة"
      });
    }

    res.json({
      room: result.rows[0]
    });
  }
);

/* =========================
   SOCKET.IO
========================= */

const httpServer = require("http").createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});

io.on("connection", (socket) => {
  socket.on("join_group", (groupId) => {
    socket.join(`group:${groupId}`);
  });

  socket.on("join_ticket", (ticketId) => {
    socket.join(`ticket:${ticketId}`);
  });

  socket.on("join_watch", (roomId) => {
    socket.join(`watch:${roomId}`);
  });

  socket.on("watch_control", async (data) => {
    if (!data?.roomId) return;

    const roomId = String(data.roomId);

    if (
      !["play", "pause", "seek"].includes(data.action)
    ) {
      return;
    }

    const playing = data.action === "play";

    let currentTime = Number(data.currentTime || 0);

    if (!Number.isFinite(currentTime) || currentTime < 0) {
      currentTime = 0;
    }

    if (data.action === "seek") {
      await pool.query(
        `UPDATE watch_rooms
         SET current_time = $1
         WHERE id = $2`,
        [currentTime, roomId]
      );
    } else {
      await pool.query(
        `UPDATE watch_rooms
         SET playing = $1,
             current_time = $2
         WHERE id = $3`,
        [playing, currentTime, roomId]
      );
    }

    io.to(`watch:${roomId}`).emit(
      "watch_state",
      {
        action: data.action,
        currentTime,
        playing
      }
    );
  });
});

/* =========================
   DISCORD FUNCTIONS
========================= */

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
  if (
    guildCache &&
    Date.now() - guildCacheAt < GUILD_CACHE_TTL
  ) {
    return guildCache;
  }

  if (guildFetchPromise) return guildFetchPromise;

  guildFetchPromise = client.guilds
    .fetch(guildId)
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
  const fresh =
    memberSnapshot &&
    Date.now() - memberSnapshotAt < MEMBER_CACHE_TTL;

  if (fresh) return memberSnapshot;

  if (memberFetchPromise) {
    return memberFetchPromise;
  }

  memberFetchPromise = guild.members
    .fetch()
    .then((collection) => {
      memberSnapshot = [...collection.values()];
      memberSnapshotAt = Date.now();

      return memberSnapshot;
    })
    .finally(() => {
      memberFetchPromise = null;
    });

  return memberFetchPromise;
}

function importantPermissions(permissionCollection) {
  return permissionCollection
    .toArray()
    .filter((permission) =>
      importantPermissionNames.has(permission)
    );
}

function roleJson(
  role,
  membersCount = role.members?.size || 0
) {
  return {
    id: role.id,
    name: role.name,
    color: role.hexColor,
    position: role.position,
    permissions: importantPermissions(
      role.permissions
    ),
    membersCount,
    mentionable: role.mentionable
  };
}

function memberJson(member) {
  const roles = member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => roleJson(role));

  const leadershipRoles = roles.filter((role) =>
    leadershipRoleSet.has(role.id)
  );

  return {
    id: member.id,
    name: member.displayName,
    username: member.user.username,
    globalName: member.user.globalName,
    bot: member.user.bot,
    avatar: member.user.displayAvatarURL({
      extension: "png",
      size: 256
    }),
    joinedAt: member.joinedAt,
    roles,
    importantRoles: leadershipRoles,
    rank:
      leadershipRoles[0]?.name ||
      roles[0]?.name ||
      "عضو",
    stats: getActivity(member.id)
  };
}

function sortedMemberJson(members) {
  return [...members]
    .sort((a, b) => {
      const aRole = a.roles.cache
        .filter((role) =>
          leadershipRoleSet.has(role.id)
        )
        .sort((x, y) => y.position - x.position)
        .first();

      const bRole = b.roles.cache
        .filter((role) =>
          leadershipRoleSet.has(role.id)
        )
        .sort((x, y) => y.position - x.position)
        .first();

      return (
        (bRole?.position || 0) -
        (aRole?.position || 0)
      );
    })
    .map(memberJson);
}

/* =========================
   PUBLIC DISCORD API
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    botReady: client.isReady(),
    database: true,
    membersCached: Boolean(memberSnapshot),
    membersCachedCount:
      memberSnapshot?.length || 0
  });
});

app.get(
  "/api/public/server",
  async (req, res) => {
    try {
      const guild = await getGuild();

      res.json({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({
          extension: "png",
          size: 256
        }),
        memberCount: guild.memberCount,
        ownerName:
          process.env.SERVER_FOUNDER_NAME ||
          "فهد المطيري",
        invite:
          process.env.DISCORD_INVITE_URL || ""
      });
    } catch (error) {
      console.error(error);

      res.status(503).json({
        error: "Discord server unavailable"
      });
    }
  }
);

app.get(
  "/api/public/members",
  async (req, res) => {
    try {
      const guild = await getGuild();
      const allMembers =
        await getAllMembers(guild);

      const query = String(
        req.query.q || ""
      )
        .trim()
        .toLocaleLowerCase("ar");

      const cleanQuery =
        query.replace(/^@/, "");

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

            return searchable.includes(
              cleanQuery
            );
          })
        : allMembers;

      res.json({
        members:
          sortedMemberJson(filtered),
        total: filtered.length,
        totalServerMembers:
          allMembers.length,
        updatedAt:
          memberSnapshotAt
      });
    } catch (error) {
      console.error(error);

      res.status(503).json({
        error:
          "Members are temporarily unavailable"
      });
    }
  }
);

app.get(
  "/api/public/roles",
  async (req, res) => {
    try {
      const guild = await getGuild();

      const allMembers =
        await getAllMembers(guild);

      const roles = leadershipRoleIds
        .map((id) =>
          guild.roles.cache.get(id)
        )
        .filter(Boolean)
        .map((role) => {
          const count =
            allMembers.reduce(
              (total, member) =>
                total +
                (member.roles.cache.has(
                  role.id
                )
                  ? 1
                  : 0),
              0
            );

          return roleJson(role, count);
        });

      res.json({
        roles,
        updatedAt:
          memberSnapshotAt
      });
    } catch (error) {
      console.error(error);

      res.status(503).json({
        error:
          "Roles are temporarily unavailable"
      });
    }
  }
);

app.get(
  "/api/public/roles/:id/members",
  async (req, res) => {
    try {
      const guild = await getGuild();

      const role =
        guild.roles.cache.get(
          req.params.id
        );

      if (
        !role ||
        !leadershipRoleSet.has(
          role.id
        )
      ) {
        return res.status(404).json({
          error: "Role not found"
        });
      }

      const roleMembers =
        (await getAllMembers(guild))
          .filter((member) =>
            member.roles.cache.has(
              role.id
            )
          );

      res.json({
        role: roleJson(
          role,
          roleMembers.length
        ),
        members:
          sortedMemberJson(
            roleMembers
          ),
        updatedAt:
          memberSnapshotAt
      });
    } catch (error) {
      console.error(error);

      res.status(503).json({
        error:
          "Role members are temporarily unavailable"
      });
    }
  }
);

app.get(
  "/api/public/top",
  async (req, res) => {
    try {
      const members =
        (
          await getAllMembers(
            await getGuild()
          )
        ).map(memberJson);

      const top = (key) =>
        [...members]
          .sort(
            (a, b) =>
              (b.stats[key] || 0) -
              (a.stats[key] || 0)
          )
          .slice(0, 10);

      res.json({
        messages:
          top("messages"),
        mentions:
          top("mentionsReceived"),
        voice:
          top("voiceMinutes"),
        joins:
          top("voiceJoins"),
        updatedAt:
          memberSnapshotAt
      });
    } catch (error) {
      console.error(error);

      res.status(503).json({
        error:
          "Top is temporarily unavailable"
      });
    }
  }
);

app.get(
  "/api/public/member/:id",
  async (req, res) => {
    try {
      const guild = await getGuild();

      const member =
        await guild.members
          .fetch(req.params.id)
          .catch(() => null);

      if (!member) {
        return res.status(404).json({
          error: "Member not found"
        });
      }

      const highest =
        member.roles.cache
          .filter(
            (role) =>
              role.id !== guild.id &&
              !role.managed
          )
          .sort(
            (a, b) =>
              b.position - a.position
          )
          .first();

      res.json({
        ...memberJson(member),
        highestRole: highest
          ? roleJson(highest)
          : null,
        permissions: highest
          ? importantPermissions(
              highest.permissions
            )
          : []
      });
    } catch (error) {
      console.error(error);

      res.status(404).json({
        error: "Member not found"
      });
    }
  }
);

/* =========================
   DISCORD EVENTS
========================= */

client.on(
  "guildMemberAdd",
  invalidateMemberSnapshot
);

client.on(
  "guildMemberRemove",
  invalidateMemberSnapshot
);

client.on(
  "guildMemberUpdate",
  invalidateMemberSnapshot
);

client.on(
  "messageCreate",
  (message) => {
    if (message.author.bot) return;

    const sender =
      getActivity(
        message.author.id
      );

    sender.messages += 1;
    sender.chatRounds += 1;

    for (
      const id of message.mentions.users.keys()
    ) {
      getActivity(id)
        .mentionsReceived += 1;

      sender.mentionsSent += 1;
    }
  }
);

client.on(
  "voiceStateUpdate",
  (oldState, newState) => {
    const id = newState.id;

    if (
      !oldState.channelId &&
      newState.channelId
    ) {
      voiceSessions.set(
        id,
        Date.now()
      );

      getActivity(id)
        .voiceJoins += 1;
    }

    if (
      oldState.channelId &&
      !newState.channelId &&
      voiceSessions.has(id)
    ) {
      getActivity(id)
        .voiceMinutes += Math.round(
          (
            Date.now() -
            voiceSessions.get(id)
          ) / 60000
        );

      voiceSessions.delete(id);
    }
  }
);

/* =========================
   FALLBACK
========================= */

app.get("*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/* =========================
   START
========================= */

async function start() {
  try {
    await setupDatabase();

    httpServer.listen(
      port,
      () => {
        console.log(
          `Malaz listening on port ${port}`
        );
      }
    );

    client.once(
      "ready",
      () => {
        console.log(
          `Logged in as ${client.user.tag}`
        );
      }
    );

    await client.login(token);
  } catch (error) {
    console.error(
      "Startup error:",
      error
    );

    process.exit(1);
  }
}

start();
