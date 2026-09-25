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
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: true,
        credentials: true
    }
});

/* =========================================================
   ENV
========================================================= */

const PORT = Number(process.env.PORT || 3000);

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

const OWNER_ID = process.env.OWNER_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "change-me";

/* =========================================================
   BASIC CHECK
========================================================= */

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
    process.exit(1);
}

/* =========================================================
   APP CONFIG
========================================================= */

app.set("trust proxy", 1);

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    cors({
        origin: true,
        credentials: true
    })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/*
 * بدون DATABASE_URL:
 * الجلسات والبيانات تحفظ في الذاكرة فقط.
 * عند إعادة تشغيل Railway ستختفي بيانات الموقع.
 */
app.use(
    session({
        secret:
            process.env.OWNER_PASSWORD ||
            crypto.randomBytes(32).toString("hex"),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

/* =========================================================
   IN-MEMORY STORAGE
========================================================= */

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

let nextIds = {
    user: 1,
    group: 1,
    groupMessage: 1,
    ticket: 1,
    ticketMessage: 1,
    application: 1,
    log: 1,
    privateMessageLog: 1,
    watchRoom: 1
};

/* =========================================================
   HELPERS
========================================================= */

function id(type) {
    const value = nextIds[type] || 1;
    nextIds[type] = value + 1;
    return value;
}

function now() {
    return new Date().toISOString();
}

function clean(value, max = 5000) {
    return String(value ?? "").trim().slice(0, max);
}

function publicUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt
    };
}

function currentUser(req) {
    if (!req.session || !req.session.userId) return null;

    return (
        db.users.find(
            user => user.id === Number(req.session.userId)
        ) || null
    );
}

function isOwner(user) {
    return !!user && user.role === "owner";
}

function isAdmin(user) {
    return !!user && (
        user.role === "owner" ||
        user.role === "admin"
    );
}

function requireLogin(req, res, next) {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "يجب تسجيل الدخول أولًا"
        });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "يجب تسجيل الدخول أولًا"
        });
    }

    if (!isAdmin(user)) {
        return res.status(403).json({
            error: "ليس لديك صلاحية"
        });
    }

    req.user = user;
    next();
}

function requireOwner(req, res, next) {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "يجب تسجيل الدخول أولًا"
        });
    }

    if (!isOwner(user)) {
        return res.status(403).json({
            error: "هذه الصلاحية للمالك فقط"
        });
    }

    req.user = user;
    next();
}

function addLog(type, action, user, details = {}) {
    const log = {
        id: id("log"),
        type,
        action,
        userId: user?.id || null,
        username: user?.username || null,
        details,
        createdAt: now()
    };

    db.logs.unshift(log);

    if (db.logs.length > 5000) {
        db.logs.length = 5000;
    }

    return log;
}

function findUserByUsername(username) {
    return db.users.find(
        user =>
            user.username.toLowerCase() ===
            String(username).toLowerCase()
    );
}

function findGroup(groupId) {
    return db.groups.find(
        group => group.id === Number(groupId)
    );
}

function isGroupMember(groupId, userId) {
    return db.groupMembers.some(
        member =>
            member.groupId === Number(groupId) &&
            member.userId === Number(userId)
    );
}

/* =========================================================
   SIMPLE PASSWORD HASH
========================================================= */

function hashPassword(password) {
    return crypto
        .createHash("sha256")
        .update(String(password))
        .digest("hex");
}

function comparePassword(password, hash) {
    return hashPassword(password) === hash;
}

/* =========================================================
   OWNER ACCOUNT
========================================================= */

if (!findUserByUsername(OWNER_USERNAME)) {
    const owner = {
        id: id("user"),
        username: OWNER_USERNAME,
        displayName: "فهد المطيري",
        passwordHash: hashPassword(OWNER_PASSWORD),
        role: "owner",
        discordId: OWNER_ID || null,
        createdAt: now()
    };

    db.users.push(owner);

    console.log(
        `Owner account created: ${OWNER_USERNAME}`
    );
}

/* =========================================================
   DISCORD CLIENT
========================================================= */

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

let guild = null;

const leadershipRoleIds = [
    "1530712642384040027",
    "1521187079336362024",
    "1531109479264026706",
    "1548732297669255259",
    "1548732341185155103",
    "1548732606508703744"
];

const importantPermissionNames = [
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
];

/* =========================================================
   ACTIVITY
========================================================= */

const activity = new Map();

function getStats(userId) {
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

const voiceSessions = new Map();

function registerVoice(member) {
    if (!member?.id) return;

    const old = voiceSessions.get(member.id);

    if (old) return;

    voiceSessions.set(member.id, Date.now());

    const stats = getStats(member.id);
    stats.voiceJoins += 1;
}

/* =========================================================
   DISCORD DATA
========================================================= */

async function getGuild() {
    if (guild) return guild;

    try {
        guild = await discord.guilds.fetch(DISCORD_GUILD_ID);
        await guild.fetch();
        return guild;
    } catch (error) {
        console.error("Guild fetch error:", error.message);
        return null;
    }
}

async function fetchMembers() {
    const g = await getGuild();

    if (!g) return [];

    try {
        await g.members.fetch();
    } catch (error) {
        console.error(
            "Members fetch error:",
            error.message
        );
    }

    return [...g.members.cache.values()]
        .filter(member => !member.user.bot);
}

function memberObject(member) {
    const stats = getStats(member.id);

    const roles = member.roles.cache
        .filter(role => role.id !== member.guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
            position: role.position
        }));

    const importantRoles = roles.filter(role =>
        leadershipRoleIds.includes(role.id)
    );

    const permissions = [];

    for (const permission of importantPermissionNames) {
        try {
            if (member.permissions.has(permission)) {
                permissions.push(permission);
            }
        } catch {}
    }

    let rank = "عضو";

    if (member.permissions.has("Administrator")) {
        rank = "إدارة";
    } else if (importantRoles.length) {
        rank = importantRoles[0].name;
    }

    return {
        id: member.id,
        name: member.displayName || member.user.username,
        username: member.user.username,
        avatar:
            member.displayAvatarURL({
                size: 256,
                extension: "png"
            }),
        bot: member.user.bot,
        rank,
        roles,
        importantRoles,
        permissions,
        stats
    };
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        service: "MLD Community",
        time: now()
    });
});

/* =========================================================
   AUTH
========================================================= */

app.post("/api/auth/register", (req, res) => {
    const username = clean(req.body.username, 40);
    const password = String(req.body.password || "");
    const displayName =
        clean(req.body.displayName, 80) ||
        username;

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

    if (findUserByUsername(username)) {
        return res.status(409).json({
            error: "اسم المستخدم مستخدم بالفعل"
        });
    }

    const user = {
        id: id("user"),
        username,
        displayName,
        passwordHash: hashPassword(password),
        role: "user",
        discordId: clean(req.body.discordId, 30) || null,
        createdAt: now()
    };

    db.users.push(user);

    req.session.userId = user.id;

    addLog(
        "auth",
        "register",
        user
    );

    res.json({
        ok: true,
        user: publicUser(user)
    });
});

app.post("/api/auth/login", (req, res) => {
    const username = clean(req.body.username, 40);
    const password = String(req.body.password || "");

    const user = findUserByUsername(username);

    if (
        !user ||
        !comparePassword(
            password,
            user.passwordHash
        )
    ) {
        return res.status(401).json({
            error: "اسم المستخدم أو كلمة المرور غير صحيحة"
        });
    }

    req.session.userId = user.id;

    addLog(
        "auth",
        "login",
        user
    );

    res.json({
        ok: true,
        user: publicUser(user)
    });
});

app.post("/api/auth/logout", (req, res) => {
    const user = currentUser(req);

    if (user) {
        addLog(
            "auth",
            "logout",
            user
        );
    }

    req.session.destroy(() => {
        res.json({
            ok: true
        });
    });
});

app.get("/api/auth/me", (req, res) => {
    const user = currentUser(req);

    res.json({
        authenticated: !!user,
        user: publicUser(user),
        isAdmin: isAdmin(user),
        isOwner: isOwner(user)
    });
});

/* =========================================================
   PUBLIC DISCORD SERVER
========================================================= */

app.get("/api/public/server", async (req, res) => {
    try {
        const g = await getGuild();

        if (!g) {
            return res.status(503).json({
                error: "Discord server unavailable"
            });
        }

        res.json({
            id: g.id,
            name: g.name,
            memberCount: g.memberCount,
            icon: g.iconURL({
                size: 256
            }),
            invite: null
        });
    } catch (error) {
        res.status(500).json({
            error: "تعذر تحميل بيانات السيرفر"
        });
    }
});

app.get("/api/public/members", async (req, res) => {
    try {
        const members = await fetchMembers();

        const q = clean(req.query.q, 100)
            .toLowerCase();

        let result = members.map(memberObject);

        if (q) {
            result = result.filter(member =>
                member.name.toLowerCase().includes(q) ||
                member.username.toLowerCase().includes(q)
            );
        }

        res.json({
            members: result
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "تعذر تحميل الأعضاء",
            members: []
        });
    }
});

app.get(
    "/api/public/member/:id",
    async (req, res) => {
        try {
            const g = await getGuild();

            if (!g) {
                return res.status(503).json({
                    error: "Discord unavailable"
                });
            }

            const member =
                await g.members.fetch(req.params.id);

            res.json(memberObject(member));
        } catch {
            res.status(404).json({
                error: "العضو غير موجود"
            });
        }
    }
);

app.get("/api/public/roles", async (req, res) => {
    try {
        const g = await getGuild();

        if (!g) {
            return res.status(503).json({
                error: "Discord unavailable"
            });
        }

        const members = await fetchMembers();

        const roles = [...g.roles.cache.values()]
            .filter(role =>
                role.id !== g.id &&
                (
                    leadershipRoleIds.includes(role.id) ||
                    role.members.size > 0
                )
            )
            .sort((a, b) => b.position - a.position)
            .map(role => {
                const permissions = [];

                for (const permission of importantPermissionNames) {
                    try {
                        if (role.permissions.has(permission)) {
                            permissions.push(permission);
                        }
                    } catch {}
                }

                return {
                    id: role.id,
                    name: role.name,
                    color: role.hexColor,
                    position: role.position,
                    membersCount: members.filter(
                        member =>
                            member.roles.cache.has(role.id)
                    ).length,
                    permissions
                };
            });

        res.json({
            roles
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "تعذر تحميل الرتب",
            roles: []
        });
    }
});

app.get(
    "/api/public/roles/:id/members",
    async (req, res) => {
        try {
            const g = await getGuild();

            const role =
                g.roles.cache.get(req.params.id);

            if (!role) {
                return res.status(404).json({
                    error: "الرتبة غير موجودة"
                });
            }

            const members =
                await fetchMembers();

            const roleMembers = members
                .filter(member =>
                    member.roles.cache.has(role.id)
                )
                .map(memberObject);

            const permissions = [];

            for (const permission of importantPermissionNames) {
                try {
                    if (role.permissions.has(permission)) {
                        permissions.push(permission);
                    }
                } catch {}
            }

            res.json({
                role: {
                    id: role.id,
                    name: role.name,
                    color: role.hexColor,
                    membersCount: roleMembers.length,
                    permissions
                },
                members: roleMembers
            });
        } catch (error) {
            res.status(500).json({
                error: "تعذر تحميل الرتبة"
            });
        }
    }
);

/* =========================================================
   TOP
========================================================= */

app.get("/api/public/top", async (req, res) => {
    try {
        const members = await fetchMembers();

        const list = members.map(memberObject);

        const messages = [...list]
            .sort(
                (a, b) =>
                    (b.stats.messages || 0) -
                    (a.stats.messages || 0)
            )
            .slice(0, 10);

        const mentions = [...list]
            .sort(
                (a, b) =>
                    (b.stats.mentionsReceived || 0) -
                    (a.stats.mentionsReceived || 0)
            )
            .slice(0, 10);

        const voice = [...list]
            .sort(
                (a, b) =>
                    (b.stats.voiceMinutes || 0) -
                    (a.stats.voiceMinutes || 0)
            )
            .slice(0, 10);

        const joins = [...list]
            .sort(
                (a, b) =>
                    (b.stats.voiceJoins || 0) -
                    (a.stats.voiceJoins || 0)
            )
            .slice(0, 10);

        res.json({
            messages,
            mentions,
            voice,
            joins
        });
    } catch (error) {
        res.status(500).json({
            error: "تعذر تحميل التوب"
        });
    }
});

/* =========================================================
   GROUPS
========================================================= */

app.get(
    "/api/groups",
    requireLogin,
    (req, res) => {
        const groups = db.groups.map(group => ({
            ...group,
            membersCount:
                db.groupMembers.filter(
                    member =>
                        member.groupId === group.id
                ).length
        }));

        res.json({
            groups
        });
    }
);

app.post(
    "/api/groups",
    requireLogin,
    (req, res) => {
        const name = clean(req.body.name, 80);
        const description =
            clean(req.body.description, 500);

        if (!name) {
            return res.status(400).json({
                error: "اكتب اسم المجموعة"
            });
        }

        const group = {
            id: id("group"),
            name,
            description,
            ownerId: req.user.id,
            createdAt: now()
        };

        db.groups.push(group);

        db.groupMembers.push({
            groupId: group.id,
            userId: req.user.id,
            joinedAt: now()
        });

        addLog(
            "groups",
            "create",
            req.user,
            {
                groupId: group.id,
                name
            }
        );

        res.json({
            ok: true,
            group
        });
    }
);

app.post(
    "/api/groups/:id/join",
    requireLogin,
    (req, res) => {
        const group = findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                error: "المجموعة غير موجودة"
            });
        }

        if (
            isGroupMember(
                group.id,
                req.user.id
            )
        ) {
            return res.json({
                ok: true,
                message: "أنت عضو بالفعل"
            });
        }

        db.groupMembers.push({
            groupId: group.id,
            userId: req.user.id,
            joinedAt: now()
        });

        addLog(
            "groups",
            "join",
            req.user,
            {
                groupId: group.id
            }
        );

        io.to(`group:${group.id}`).emit(
            "group:member",
            {
                type: "join",
                user: publicUser(req.user)
            }
        );

        res.json({
            ok: true
        });
    }
);

app.get(
    "/api/groups/:id/messages",
    requireLogin,
    (req, res) => {
        const group = findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                error: "المجموعة غير موجودة"
            });
        }

        if (
            !isGroupMember(
                group.id,
                req.user.id
            ) &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error: "يجب أن تكون عضوًا في المجموعة"
            });
        }

        const messages =
            db.groupMessages
                .filter(
                    message =>
                        message.groupId === group.id
                )
                .slice(-100);

        res.json({
            messages
        });
    }
);

app.post(
    "/api/groups/:id/messages",
    requireLogin,
    (req, res) => {
        const group = findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                error: "المجموعة غير موجودة"
            });
        }

        if (
            !isGroupMember(
                group.id,
                req.user.id
            ) &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error: "يجب أن تكون عضوًا"
            });
        }

        const text = clean(req.body.message, 2000);

        if (!text) {
            return res.status(400).json({
                error: "الرسالة فارغة"
            });
        }

        const message = {
            id: id("groupMessage"),
            groupId: group.id,
            userId: req.user.id,
            username: req.user.username,
            displayName: req.user.displayName,
            message: text,
            createdAt: now()
        };

        db.groupMessages.push(message);

        io.to(`group:${group.id}`).emit(
            "group:message",
            message
        );

        res.json({
            ok: true,
            message
        });
    }
);

/* =========================================================
   TICKETS
========================================================= */

app.post(
    "/api/tickets",
    requireLogin,
    (req, res) => {
        const subject =
            clean(req.body.subject, 150);

        const message =
            clean(req.body.message, 3000);

        if (!subject || !message) {
            return res.status(400).json({
                error: "أكمل بيانات التذكرة"
            });
        }

        const ticket = {
            id: id("ticket"),
            userId: req.user.id,
            username: req.user.username,
            subject,
            status: "open",
            claimedBy: null,
            createdAt: now(),
            updatedAt: now()
        };

        db.tickets.push(ticket);

        const firstMessage = {
            id: id("ticketMessage"),
            ticketId: ticket.id,
            userId: req.user.id,
            username: req.user.username,
            message,
            createdAt: now()
        };

        db.ticketMessages.push(firstMessage);

        addLog(
            "tickets",
            "create",
            req.user,
            {
                ticketId: ticket.id
            }
        );

        res.json({
            ok: true,
            ticket
        });
    }
);

app.get(
    "/api/tickets",
    requireLogin,
    (req, res) => {
        let tickets;

        if (isAdmin(req.user)) {
            tickets = db.tickets;
        } else {
            tickets = db.tickets.filter(
                ticket =>
                    ticket.userId === req.user.id
            );
        }

        res.json({
            tickets: tickets
                .slice()
                .sort(
                    (a, b) =>
                        new Date(b.updatedAt) -
                        new Date(a.updatedAt)
                )
        });
    }
);

app.get(
    "/api/tickets/:id/messages",
    requireLogin,
    (req, res) => {
        const ticket =
            db.tickets.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!ticket) {
            return res.status(404).json({
                error: "التذكرة غير موجودة"
            });
        }

        if (
            ticket.userId !== req.user.id &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error: "ليس لديك صلاحية"
            });
        }

        res.json({
            messages:
                db.ticketMessages.filter(
                    message =>
                        message.ticketId === ticket.id
                )
        });
    }
);

app.post(
    "/api/tickets/:id/messages",
    requireLogin,
    (req, res) => {
        const ticket =
            db.tickets.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!ticket) {
            return res.status(404).json({
                error: "التذكرة غير موجودة"
            });
        }

        if (
            ticket.userId !== req.user.id &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error: "ليس لديك صلاحية"
            });
        }

        const message =
            clean(req.body.message, 3000);

        if (!message) {
            return res.status(400).json({
                error: "الرسالة فارغة"
            });
        }

        const item = {
            id: id("ticketMessage"),
            ticketId: ticket.id,
            userId: req.user.id,
            username: req.user.username,
            message,
            createdAt: now()
        };

        db.ticketMessages.push(item);

        ticket.updatedAt = now();

        io.to(`ticket:${ticket.id}`).emit(
            "ticket:message",
            item
        );

        res.json({
            ok: true,
            message: item
        });
    }
);

app.post(
    "/api/tickets/:id/claim",
    requireAdmin,
    (req, res) => {
        const ticket =
            db.tickets.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!ticket) {
            return res.status(404).json({
                error: "التذكرة غير موجودة"
            });
        }

        ticket.claimedBy = req.user.id;
        ticket.status = "claimed";
        ticket.updatedAt = now();

        addLog(
            "tickets",
            "claim",
            req.user,
            {
                ticketId: ticket.id
            }
        );

        res.json({
            ok: true,
            ticket
        });
    }
);

app.post(
    "/api/tickets/:id/close",
    requireLogin,
    (req, res) => {
        const ticket =
            db.tickets.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!ticket) {
            return res.status(404).json({
                error: "التذكرة غير موجودة"
            });
        }

        if (
            ticket.userId !== req.user.id &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error: "ليس لديك صلاحية"
            });
        }

        ticket.status = "closed";
        ticket.updatedAt = now();

        addLog(
            "tickets",
            "close",
            req.user,
            {
                ticketId: ticket.id
            }
        );

        res.json({
            ok: true,
            ticket
        });
    }
);

/* =========================================================
   ADMIN APPLICATIONS
========================================================= */

app.post(
    "/api/applications",
    requireLogin,
    (req, res) => {
        const reason =
            clean(req.body.reason, 3000);

        const experience =
            clean(req.body.experience, 3000);

        if (!reason) {
            return res.status(400).json({
                error: "اكتب سبب التقديم"
            });
        }

        const existing =
            db.applications.find(
                application =>
                    application.userId === req.user.id &&
                    application.status === "pending"
            );

        if (existing) {
            return res.status(409).json({
                error: "لديك طلب قيد المراجعة بالفعل"
            });
        }

        const application = {
            id: id("application"),
            userId: req.user.id,
            username: req.user.username,
            displayName: req.user.displayName,
            reason,
            experience,
            status: "pending",
            reviewedBy: null,
            reviewMessage: null,
            createdAt: now(),
            updatedAt: now()
        };

        db.applications.push(application);

        addLog(
            "applications",
            "create",
            req.user,
            {
                applicationId: application.id
            }
        );

        res.json({
            ok: true,
            application
        });
    }
);

app.get(
    "/api/applications",
    requireLogin,
    (req, res) => {
        let applications;

        if (isAdmin(req.user)) {
            applications = db.applications;
        } else {
            applications =
                db.applications.filter(
                    application =>
                        application.userId ===
                        req.user.id
                );
        }

        res.json({
            applications:
                applications
                    .slice()
                    .sort(
                        (a, b) =>
                            new Date(b.createdAt) -
                            new Date(a.createdAt)
                    )
        });
    }
);

app.post(
    "/api/applications/:id/review",
    requireAdmin,
    (req, res) => {
        const application =
            db.applications.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!application) {
            return res.status(404).json({
                error: "الطلب غير موجود"
            });
        }

        const status =
            clean(req.body.status, 30);

        if (
            !["accepted", "rejected", "pending"]
                .includes(status)
        ) {
            return res.status(400).json({
                error: "حالة غير صحيحة"
            });
        }

        application.status = status;
        application.reviewedBy = req.user.id;
        application.reviewMessage =
            clean(req.body.message, 1000);
        application.updatedAt = now();

        addLog(
            "applications",
            "review",
            req.user,
            {
                applicationId:
                    application.id,
                status
            }
        );

        res.json({
            ok: true,
            application
        });
    }
);

/* =========================================================
   ADMIN MANAGEMENT
========================================================= */

app.get(
    "/api/admins",
    requireAdmin,
    (req, res) => {
        res.json({
            admins: db.users
                .filter(
                    user =>
                        user.role === "admin" ||
                        user.role === "owner"
                )
                .map(publicUser)
        });
    }
);

app.post(
    "/api/admins",
    requireOwner,
    (req, res) => {
        const username =
            clean(req.body.username, 40);

        const user =
            findUserByUsername(username);

        if (!user) {
            return res.status(404).json({
                error: "المستخدم غير موجود"
            });
        }

        if (user.role === "owner") {
            return res.status(400).json({
                error: "هذا المستخدم مالك"
            });
        }

        user.role = "admin";

        if (!db.admins.includes(user.id)) {
            db.admins.push(user.id);
        }

        addLog(
            "admins",
            "add",
            req.user,
            {
                targetUserId: user.id,
                username: user.username
            }
        );

        res.json({
            ok: true,
            user: publicUser(user)
        });
    }
);

app.delete(
    "/api/admins/:id",
    requireOwner,
    (req, res) => {
        const user =
            db.users.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!user) {
            return res.status(404).json({
                error: "المستخدم غير موجود"
            });
        }

        if (user.role === "owner") {
            return res.status(400).json({
                error: "لا يمكن إزالة المالك"
            });
        }

        user.role = "user";

        db.admins = db.admins.filter(
            id => id !== user.id
        );

        addLog(
            "admins",
            "remove",
            req.user,
            {
                targetUserId: user.id
            }
        );

        res.json({
            ok: true
        });
    }
);

/* =========================================================
   LOGS
========================================================= */

app.get(
    "/api/logs",
    requireAdmin,
    (req, res) => {
        res.json({
            logs: db.logs.slice(0, 500)
        });
    }
);

app.get(
    "/api/private-message-logs",
    requireOwner,
    (req, res) => {
        res.json({
            logs:
                db.privateMessageLogs.slice(0, 500)
        });
    }
);

/* =========================================================
   DISCORD PRIVATE MESSAGE
========================================================= */

async function sendDiscordMessage(
    memberId,
    title,
    message,
    senderName,
    sentBy
) {
    const g = await getGuild();

    if (!g) {
        throw new Error(
            "تعذر الاتصال بسيرفر Discord"
        );
    }

    const member =
        await g.members.fetch(memberId);

    const embed = new EmbedBuilder()
        .setTitle(
            title ||
            "رسالة من إدارة MLD"
        )
        .setDescription(
            message
        )
        .setTimestamp();

    if (senderName) {
        embed.setFooter({
            text: `من: ${senderName}`
        });
    } else {
        embed.setFooter({
            text: "MLD Community"
        });
    }

    await member.send({
        embeds: [embed]
    });

    const log = {
        id: id("privateMessageLog"),
        senderUserId: sentBy?.id || null,
        senderUsername: sentBy?.username || null,
        memberId,
        title,
        message,
        senderName: senderName || null,
        createdAt: now()
    };

    db.privateMessageLogs.unshift(log);

    if (db.privateMessageLogs.length > 2000) {
        db.privateMessageLogs.length = 2000;
    }

    return log;
}

app.post(
    "/api/public/message",
    requireAdmin,
    async (req, res) => {
        const memberId =
            clean(req.body.memberId, 40);

        const title =
            clean(
                req.body.title ||
                "رسالة من إدارة MLD",
                120
            );

        const message =
            clean(req.body.message, 2000);

        if (!memberId || !message) {
            return res.status(400).json({
                error: "بيانات الرسالة ناقصة"
            });
        }

        try {
            await sendDiscordMessage(
                memberId,
                title,
                message,
                null,
                req.user
            );

            addLog(
                "messages",
                "discord_dm",
                req.user,
                {
                    memberId,
                    title
                }
            );

            res.json({
                ok: true
            });
        } catch (error) {
            console.error(
                "Discord DM error:",
                error.message
            );

            res.status(500).json({
                error:
                    "تعذر إرسال الرسالة. تأكد أن العضو يسمح بالرسائل الخاصة."
            });
        }
    }
);

app.post(
    "/api/discord/message",
    requireAdmin,
    async (req, res) => {
        const memberId =
            clean(req.body.memberId, 40);

        const title =
            clean(
                req.body.title ||
                "رسالة من إدارة MLD",
                120
            );

        const message =
            clean(req.body.message, 2000);

        const senderName =
            clean(req.body.senderName, 60);

        if (!memberId || !message) {
            return res.status(400).json({
                error: "بيانات الرسالة ناقصة"
            });
        }

        try {
            await sendDiscordMessage(
                memberId,
                title,
                message,
                senderName,
                req.user
            );

            addLog(
                "messages",
                "discord_dm",
                req.user,
                {
                    memberId,
                    title
                }
            );

            res.json({
                ok: true
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "تعذر إرسال الرسالة"
            });
        }
    }
);

/* =========================================================
   WATCH ROOMS
========================================================= */

app.post(
    "/api/watch-rooms",
    requireLogin,
    (req, res) => {
        const name =
            clean(req.body.name, 100);

        const mediaUrl =
            clean(req.body.mediaUrl, 2000);

        if (!name || !mediaUrl) {
            return res.status(400).json({
                error:
                    "اكتب اسم الغرفة ورابط المحتوى"
            });
        }

        const room = {
            id: id("watchRoom"),
            name,
            mediaUrl,
            ownerId: req.user.id,
            state: "paused",
            currentTime: 0,
            createdAt: now(),
            updatedAt: now()
        };

        db.watchRooms.push(room);

        addLog(
            "watch_rooms",
            "create",
            req.user,
            {
                roomId: room.id
            }
        );

        res.json({
            ok: true,
            room
        });
    }
);

app.get(
    "/api/watch-rooms",
    requireLogin,
    (req, res) => {
        res.json({
            rooms: db.watchRooms
        });
    }
);

app.get(
    "/api/watch-rooms/:id",
    requireLogin,
    (req, res) => {
        const room =
            db.watchRooms.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!room) {
            return res.status(404).json({
                error: "الغرفة غير موجودة"
            });
        }

        res.json({
            room
        });
    }
);

app.post(
    "/api/watch-rooms/:id/state",
    requireLogin,
    (req, res) => {
        const room =
            db.watchRooms.find(
                item =>
                    item.id === Number(req.params.id)
            );

        if (!room) {
            return res.status(404).json({
                error: "الغرفة غير موجودة"
            });
        }

        const action =
            clean(req.body.action, 30);

        const currentTime =
            Number(req.body.currentTime);

        if (
            !["play", "pause", "seek", "stop"]
                .includes(action)
        ) {
            return res.status(400).json({
                error: "حركة غير صحيحة"
            });
        }

        if (Number.isFinite(currentTime)) {
            room.currentTime =
                Math.max(0, currentTime);
        }

        if (action === "play") {
            room.state = "playing";
        }

        if (action === "pause") {
            room.state = "paused";
        }

        if (action === "stop") {
            room.state = "paused";
            room.currentTime = 0;
        }

        room.updatedAt = now();

        const payload = {
            roomId: room.id,
            state: room.state,
            currentTime: room.currentTime,
            action,
            updatedAt: room.updatedAt
        };

        io.to(`watch:${room.id}`).emit(
            "watch:state",
            payload
        );

        res.json({
            ok: true,
            room
        });
    }
);

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", socket => {
    socket.on(
        "group:join",
        groupId => {
            socket.join(
                `group:${Number(groupId)}`
            );
        }
    );

    socket.on(
        "group:leave",
        groupId => {
            socket.leave(
                `group:${Number(groupId)}`
            );
        }
    );

    socket.on(
        "ticket:join",
        ticketId => {
            socket.join(
                `ticket:${Number(ticketId)}`
            );
        }
    );

    socket.on(
        "watch:join",
        roomId => {
            socket.join(
                `watch:${Number(roomId)}`
            );
        }
    );

    socket.on(
        "watch:state",
        data => {
            if (!data) return;

            const room =
                db.watchRooms.find(
                    item =>
                        item.id ===
                        Number(data.roomId)
                );

            if (!room) return;

            if (
                ["play", "pause", "seek", "stop"]
                    .includes(data.action)
            ) {
                const currentTime =
                    Number(data.currentTime);

                if (Number.isFinite(currentTime)) {
                    room.currentTime =
                        Math.max(
                            0,
                            currentTime
                        );
                }

                if (data.action === "play") {
                    room.state = "playing";
                }

                if (data.action === "pause") {
                    room.state = "paused";
                }

                if (data.action === "stop") {
                    room.state = "paused";
                    room.currentTime = 0;
                }

                room.updatedAt = now();

                io.to(
                    `watch:${room.id}`
                ).emit(
                    "watch:state",
                    {
                        roomId: room.id,
                        state: room.state,
                        currentTime:
                            room.currentTime,
                        action: data.action,
                        updatedAt:
                            room.updatedAt
                    }
                );
            }
        }
    );
});

/* =========================================================
   DISCORD EVENTS
========================================================= */

discord.once("ready", async () => {
    console.log(
        `Discord bot logged in as ${discord.user.tag}`
    );

    try {
        guild = await discord.guilds.fetch(
            DISCORD_GUILD_ID
        );

        console.log(
            `Connected to guild: ${guild.name}`
        );
    } catch (error) {
        console.error(
            "Initial guild error:",
            error.message
        );
    }
});

discord.on(
    "messageCreate",
    message => {
        if (!message.guild) return;
        if (message.author.bot) return;

        const stats =
            getStats(message.author.id);

        stats.messages += 1;
        stats.chatRounds += 1;

        if (message.mentions?.users?.size) {
            stats.mentionsSent +=
                message.mentions.users.size;

            for (
                const mentioned
                of message.mentions.users.values()
            ) {
                if (mentioned.bot) continue;

                const mentionedStats =
                    getStats(mentioned.id);

                mentionedStats.mentionsReceived += 1;
            }
        }
    }
);

discord.on(
    "voiceStateUpdate",
    (oldState, newState) => {
        const member =
            newState.member ||
            oldState.member;

        if (!member || member.user.bot) {
            return;
        }

        const wasConnected =
            !!oldState.channelId;

        const isConnected =
            !!newState.channelId;

        if (!wasConnected && isConnected) {
            registerVoice(member);
            return;
        }

        if (wasConnected && !isConnected) {
            const started =
                voiceSessions.get(member.id);

            if (started) {
                const minutes =
                    Math.max(
                        0,
                        Math.floor(
                            (Date.now() - started) /
                            60000
                        )
                    );

                const stats =
                    getStats(member.id);

                stats.voiceMinutes += minutes;

                voiceSessions.delete(
                    member.id
                );
            }
        }
    }
);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/* =========================================================
   FALLBACK
========================================================= */

app.get("*", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (error, req, res, next) => {
        console.error(error);

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            error: "حدث خطأ في السيرفر"
        });
    }
);

/* =========================================================
   START
========================================================= */

httpServer.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `MLD website running on port ${PORT}`
        );
    }
);

discord.login(DISCORD_BOT_TOKEN)
    .catch(error => {
        console.error(
            "Discord login failed:",
            error.message
        );
    });
