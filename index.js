"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");

const {
    pool,
    query,
    initDatabase
} = require("./database");

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const { Server } = require("socket.io");

/* =========================================================
   APP
========================================================= */

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

const DISCORD_BOT_TOKEN =
    process.env.DISCORD_BOT_TOKEN;

const DISCORD_GUILD_ID =
    process.env.DISCORD_GUILD_ID;

const OWNER_ID =
    process.env.OWNER_ID || "";

const OWNER_USERNAME =
    process.env.OWNER_USERNAME || "owner";

const OWNER_PASSWORD =
    process.env.OWNER_PASSWORD || "change-me";

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    console.error(
        "Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID"
    );
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
}

if (!process.env.SESSION_SECRET) {
    console.error("Missing SESSION_SECRET");
    process.exit(1);
}

/* =========================================================
   MIDDLEWARE
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

app.use(
    express.json({
        limit: "2mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

/* =========================================================
   SESSION
========================================================= */

app.use(
    session({
        store: new pgSession({
            pool,
            tableName: "user_sessions",
            createTableIfMissing: true
        }),

        secret: process.env.SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge:
                1000 *
                60 *
                60 *
                24 *
                7
        }
    })
);

/* =========================================================
   HELPERS
========================================================= */

function clean(value, max = 5000) {
    return String(value ?? "")
        .trim()
        .slice(0, max);
}

function now() {
    return new Date().toISOString();
}

function publicUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        discordId: user.discord_id || null,
        createdAt: user.created_at
    };
}

async function getUserById(userId) {
    if (!userId) return null;

    const result = await query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [Number(userId)]
    );

    return result.rows[0] || null;
}

async function getUserByUsername(username) {
    const result = await query(
        `
        SELECT *
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
        `,
        [username]
    );

    return result.rows[0] || null;
}

async function currentUser(req) {
    if (
        !req.session ||
        !req.session.userId
    ) {
        return null;
    }

    return getUserById(
        req.session.userId
    );
}

function isOwner(user) {
    return (
        !!user &&
        user.role === "owner"
    );
}

function isAdmin(user) {
    return (
        !!user &&
        (
            user.role === "owner" ||
            user.role === "admin"
        )
    );
}

async function requireLogin(
    req,
    res,
    next
) {
    try {
        const user =
            await currentUser(req);

        if (!user) {
            return res.status(401).json({
                error:
                    "يجب تسجيل الدخول أولًا"
            });
        }

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

async function requireAdmin(
    req,
    res,
    next
) {
    try {
        const user =
            await currentUser(req);

        if (!user) {
            return res.status(401).json({
                error:
                    "يجب تسجيل الدخول أولًا"
            });
        }

        if (!isAdmin(user)) {
            return res.status(403).json({
                error:
                    "ليس لديك صلاحية"
            });
        }

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

async function requireOwner(
    req,
    res,
    next
) {
    try {
        const user =
            await currentUser(req);

        if (!user) {
            return res.status(401).json({
                error:
                    "يجب تسجيل الدخول أولًا"
            });
        }

        if (!isOwner(user)) {
            return res.status(403).json({
                error:
                    "هذه الصلاحية للمالك فقط"
            });
        }

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

async function addLog(
    action,
    user,
    details = {}
) {
    await query(
        `
        INSERT INTO logs
        (
            user_id,
            action,
            details
        )
        VALUES
        ($1, $2, $3)
        `,
        [
            user?.id || null,
            action,
            JSON.stringify(details)
        ]
    );
}

/* =========================================================
   PASSWORDS
========================================================= */

async function hashPassword(
    password
) {
    return bcrypt.hash(
        String(password),
        12
    );
}

async function comparePassword(
    password,
    hash
) {
    return bcrypt.compare(
        String(password),
        String(hash)
    );
}

/* =========================================================
   OWNER
========================================================= */

async function ensureOwner() {
    const existing =
        await getUserByUsername(
            OWNER_USERNAME
        );

    if (existing) {
        if (
            existing.role !== "owner"
        ) {
            await query(
                `
                UPDATE users
                SET role = 'owner'
                WHERE id = $1
                `,
                [existing.id]
            );
        }

        return;
    }

    const passwordHash =
        await hashPassword(
            OWNER_PASSWORD
        );

    await query(
        `
        INSERT INTO users
        (
            username,
            display_name,
            password_hash,
            role,
            discord_id
        )
        VALUES
        ($1, $2, $3, 'owner', $4)
        `,
        [
            OWNER_USERNAME,
            "فهد المطيري",
            passwordHash,
            OWNER_ID || null
        ]
    );

    console.log(
        `Owner account created: ${OWNER_USERNAME}`
    );
}

/* =========================================================
   DISCORD
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

async function getGuild() {
    if (guild) return guild;

    guild =
        await discord.guilds.fetch(
            DISCORD_GUILD_ID
        );

    return guild;
}

async function sendDiscordEmbed(
    title,
    description,
    color
) {
    const g =
        await getGuild();

    const channel =
        g.channels.cache.find(
            channel =>
                channel.type ===
                    ChannelType.GuildText &&
                (
                    channel.name
                        .toLowerCase()
                        .includes("website") ||
                    channel.name
                        .toLowerCase()
                        .includes("site") ||
                    channel.name
                        .toLowerCase()
                        .includes("admin")
                )
        );

    if (!channel) {
        return null;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color || 0x5865f2)
            .setTimestamp();

    return channel.send({
        embeds: [embed]
    });
}

async function sendDiscordDM(
    memberId,
    title,
    message
) {
    const g =
        await getGuild();

    const member =
        await g.members.fetch(
            memberId
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                title ||
                "رسالة من إدارة الموقع"
            )
            .setDescription(message)
            .setTimestamp();

    await member.send({
        embeds: [embed]
    });
}

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/health",
    async (req, res) => {
        try {
            await query(
                "SELECT 1"
            );

            res.json({
                ok: true,
                service:
                    "Fahad Community",
                database: "connected",
                time: now()
            });
        } catch {
            res.status(503).json({
                ok: false,
                database:
                    "disconnected"
            });
        }
    }
);

/* =========================================================
   AUTH REGISTER
========================================================= */

app.post(
    "/api/auth/register",
    async (req, res, next) => {
        try {
            const username =
                clean(
                    req.body.username,
                    40
                );

            const password =
                String(
                    req.body.password ||
                    ""
                );

            const displayName =
                clean(
                    req.body.displayName,
                    80
                ) || username;

            if (
                !/^[a-zA-Z0-9_\u0600-\u06FF-]+$/.test(
                    username
                )
            ) {
                return res.status(400).json({
                    error:
                        "اسم المستخدم يحتوي على رموز غير مسموحة"
                });
            }

            if (
                username.length < 3
            ) {
                return res.status(400).json({
                    error:
                        "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
                });
            }

            if (
                password.length < 6
            ) {
                return res.status(400).json({
                    error:
                        "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
                });
            }

            const existing =
                await getUserByUsername(
                    username
                );

            if (existing) {
                return res.status(409).json({
                    error:
                        "اسم المستخدم مستخدم بالفعل"
                });
            }

            const passwordHash =
                await hashPassword(
                    password
                );

            const result =
                await query(
                    `
                    INSERT INTO users
                    (
                        username,
                        display_name,
                        password_hash,
                        role
                    )
                    VALUES
                    ($1, $2, $3, 'user')
                    RETURNING *
                    `,
                    [
                        username,
                        displayName,
                        passwordHash
                    ]
                );

            const user =
                result.rows[0];

            await new Promise(
                (resolve, reject) => {
                    req.session.regenerate(
                        error => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        }
                    );
                }
            );

            req.session.userId =
                user.id;

            await addLog(
                "register",
                user
            );

            res.json({
                ok: true,
                user:
                    publicUser(user)
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   AUTH LOGIN
========================================================= */

app.post(
    "/api/auth/login",
    async (req, res, next) => {
        try {
            const username =
                clean(
                    req.body.username,
                    40
                );

            const password =
                String(
                    req.body.password ||
                    ""
                );

            const user =
                await getUserByUsername(
                    username
                );

            if (!user) {
                return res.status(401).json({
                    error:
                        "اسم المستخدم أو كلمة المرور غير صحيحة"
                });
            }

            const valid =
                await comparePassword(
                    password,
                    user.password_hash
                );

            if (!valid) {
                return res.status(401).json({
                    error:
                        "اسم المستخدم أو كلمة المرور غير صحيحة"
                });
            }

            await new Promise(
                (resolve, reject) => {
                    req.session.regenerate(
                        error => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        }
                    );
                }
            );

            req.session.userId =
                user.id;

            await addLog(
                "login",
                user
            );

            res.json({
                ok: true,
                user:
                    publicUser(user)
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   AUTH LOGOUT
========================================================= */

app.post(
    "/api/auth/logout",
    async (req, res) => {
        const user =
            await currentUser(req);

        if (user) {
            await addLog(
                "logout",
                user
            );
        }

        req.session.destroy(
            () => {
                res.clearCookie(
                    "connect.sid"
                );

                res.json({
                    ok: true
                });
            }
        );
    }
);

/* =========================================================
   AUTH ME
========================================================= */

app.get(
    "/api/auth/me",
    async (req, res, next) => {
        try {
            const user =
                await currentUser(req);

            res.json({
                authenticated:
                    !!user,

                user:
                    publicUser(user),

                isAdmin:
                    isAdmin(user),

                isOwner:
                    isOwner(user)
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   PUBLIC SERVER
========================================================= */

app.get(
    "/api/public/server",
    async (req, res) => {
        try {
            const g =
                await getGuild();

            res.json({
                id: g.id,
                name: g.name,
                memberCount:
                    g.memberCount,
                icon:
                    g.iconURL({
                        size: 256
                    }),
                invite: null
            });
        } catch {
            res.status(503).json({
                error:
                    "تعذر تحميل بيانات السيرفر"
            });
        }
    }
);

/* =========================================================
   DISCORD MEMBERS
========================================================= */

app.get(
    "/api/public/members",
    async (req, res) => {
        try {
            const g =
                await getGuild();

            await g.members.fetch();

            const q =
                clean(
                    req.query.q,
                    100
                ).toLowerCase();

            let members =
                [...g.members.cache.values()]
                    .filter(
                        member =>
                            !member.user.bot
                    );

            if (q) {
                members =
                    members.filter(
                        member =>
                            member.displayName
                                .toLowerCase()
                                .includes(q) ||
                            member.user.username
                                .toLowerCase()
                                .includes(q)
                    );
            }

            res.json({
                members:
                    members.map(
                        member => ({
                            id:
                                member.id,

                            name:
                                member.displayName,

                            username:
                                member.user.username,

                            avatar:
                                member.displayAvatarURL({
                                    size: 256
                                }),

                            bot:
                                member.user.bot,

                            roles:
                                member.roles.cache
                                    .filter(
                                        role =>
                                            role.id !==
                                            g.id
                                    )
                                    .map(
                                        role => ({
                                            id:
                                                role.id,
                                            name:
                                                role.name,
                                            color:
                                                role.hexColor
                                        })
                                    )
                        })
                    )
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "تعذر تحميل الأعضاء",
                members: []
            });
        }
    }
);

/* =========================================================
   GROUPS LIST
========================================================= */

app.get(
    "/api/groups",
    requireLogin,
    async (req, res, next) => {
        try {
            const result =
                await query(`
                    SELECT
                        g.*,
                        u.username AS owner_username,
                        COUNT(
                            CASE
                                WHEN gm.status = 'approved'
                                THEN 1
                            END
                        ) AS members_count
                    FROM groups g
                    JOIN users u
                        ON u.id = g.owner_id
                    LEFT JOIN group_members gm
                        ON gm.group_id = g.id
                    WHERE
                        g.status = 'approved'
                        OR g.owner_id = $1
                    GROUP BY
                        g.id,
                        u.username
                    ORDER BY
                        g.created_at DESC
                `, [req.user.id]);

            res.json({
                groups:
                    result.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   CREATE GROUP
========================================================= */

app.post(
    "/api/groups",
    requireLogin,
    async (req, res, next) => {
        try {
            const name =
                clean(
                    req.body.name,
                    80
                );

            const description =
                clean(
                    req.body.description,
                    1000
                );

            if (!name) {
                return res.status(400).json({
                    error:
                        "اكتب اسم المجموعة"
                });
            }

            const result =
                await query(
                    `
                    INSERT INTO groups
                    (
                        name,
                        description,
                        owner_id,
                        status
                    )
                    VALUES
                    ($1, $2, $3, 'pending')
                    RETURNING *
                    `,
                    [
                        name,
                        description,
                        req.user.id
                    ]
                );

            const group =
                result.rows[0];

            await query(
                `
                INSERT INTO group_members
                (
                    group_id,
                    user_id,
                    status
                )
                VALUES
                ($1, $2, 'approved')
                ON CONFLICT
                DO NOTHING
                `,
                [
                    group.id,
                    req.user.id
                ]
            );

            await addLog(
                "group_create",
                req.user,
                {
                    groupId:
                        group.id,
                    name
                }
            );

            try {
                await sendDiscordEmbed(
                    "طلب إنشاء مجموعة جديد",
                    [
                        `**المجموعة:** ${name}`,
                        `**الوصف:** ${description || "لا يوجد"}`,
                        `**المالك:** ${req.user.username}`,
                        `**ID:** ${group.id}`,
                        "",
                        "الحالة الحالية: انتظار موافقة الإدارة"
                    ].join("\n")
                );
            } catch (error) {
                console.error(
                    "Discord group notification:",
                    error.message
                );
            }

            res.json({
                ok: true,
                group
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   GROUP JOIN REQUEST
========================================================= */

app.post(
    "/api/groups/:id/join",
    requireLogin,
    async (req, res, next) => {
        try {
            const groupId =
                Number(req.params.id);

            const groupResult =
                await query(
                    `
                    SELECT *
                    FROM groups
                    WHERE id = $1
                    `,
                    [groupId]
                );

            const group =
                groupResult.rows[0];

            if (!group) {
                return res.status(404).json({
                    error:
                        "المجموعة غير موجودة"
                });
            }

            const existing =
                await query(
                    `
                    SELECT *
                    FROM group_members
                    WHERE
                        group_id = $1
                        AND user_id = $2
                    `,
                    [
                        groupId,
                        req.user.id
                    ]
                );

            if (existing.rows.length) {
                return res.json({
                    ok: true,
                    status:
                        existing.rows[0]
                            .status
                });
            }

            await query(
                `
                INSERT INTO group_members
                (
                    group_id,
                    user_id,
                    status
                )
                VALUES
                ($1, $2, 'pending')
                `,
                [
                    groupId,
                    req.user.id
                ]
            );

            const owner =
                await getUserById(
                    group.owner_id
                );

            await addLog(
                "group_join_request",
                req.user,
                {
                    groupId
                }
            );

            try {
                await sendDiscordEmbed(
                    "طلب انضمام لمجموعة",
                    [
                        `**المجموعة:** ${group.name}`,
                        `**المتقدم:** ${req.user.username}`,
                        `**مالك المجموعة:** ${owner?.username || "غير معروف"}`,
                        `**Group ID:** ${groupId}`,
                        "",
                        "يوجد طلب انضمام جديد يحتاج للمراجعة."
                    ].join("\n")
                );
            } catch (error) {
                console.error(
                    "Discord join notification:",
                    error.message
                );
            }

            res.json({
                ok: true,
                status: "pending"
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   GROUP MEMBERS
========================================================= */

app.get(
    "/api/groups/:id/members",
    requireLogin,
    async (req, res, next) => {
        try {
            const result =
                await query(
                    `
                    SELECT
                        gm.*,
                        u.username,
                        u.display_name
                    FROM group_members gm
                    JOIN users u
                        ON u.id = gm.user_id
                    WHERE
                        gm.group_id = $1
                    ORDER BY
                        gm.joined_at ASC
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            res.json({
                members:
                    result.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   GROUP MESSAGES
========================================================= */

app.get(
    "/api/groups/:id/messages",
    requireLogin,
    async (req, res, next) => {
        try {
            const result =
                await query(
                    `
                    SELECT
                        gm.*,
                        u.username,
                        u.display_name
                    FROM group_messages gm
                    JOIN users u
                        ON u.id = gm.user_id
                    WHERE
                        gm.group_id = $1
                    ORDER BY
                        gm.created_at DESC
                    LIMIT 100
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            res.json({
                messages:
                    result.rows.reverse()
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/groups/:id/messages",
    requireLogin,
    async (req, res, next) => {
        try {
            const text =
                clean(
                    req.body.message,
                    2000
                );

            if (!text) {
                return res.status(400).json({
                    error:
                        "الرسالة فارغة"
                });
            }

            const result =
                await query(
                    `
                    INSERT INTO group_messages
                    (
                        group_id,
                        user_id,
                        message
                    )
                    VALUES
                    ($1, $2, $3)
                    RETURNING *
                    `,
                    [
                        Number(req.params.id),
                        req.user.id,
                        text
                    ]
                );

            const message =
                {
                    ...result.rows[0],
                    username:
                        req.user.username,
                    displayName:
                        req.user.display_name
                };

            io.to(
                `group:${req.params.id}`
            ).emit(
                "group:message",
                message
            );

            res.json({
                ok: true,
                message
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   TICKETS
========================================================= */

app.post(
    "/api/tickets",
    requireLogin,
    async (req, res, next) => {
        try {
            const subject =
                clean(
                    req.body.subject,
                    150
                );

            const message =
                clean(
                    req.body.message,
                    3000
                );

            if (!subject || !message) {
                return res.status(400).json({
                    error:
                        "أكمل بيانات التذكرة"
                });
            }

            const result =
                await query(
                    `
                    INSERT INTO tickets
                    (
                        user_id,
                        subject,
                        status
                    )
                    VALUES
                    ($1, $2, 'open')
                    RETURNING *
                    `,
                    [
                        req.user.id,
                        subject
                    ]
                );

            const ticket =
                result.rows[0];

            await query(
                `
                INSERT INTO ticket_messages
                (
                    ticket_id,
                    user_id,
                    message
                )
                VALUES
                ($1, $2, $3)
                `,
                [
                    ticket.id,
                    req.user.id,
                    message
                ]
            );

            await addLog(
                "ticket_create",
                req.user,
                {
                    ticketId:
                        ticket.id
                }
            );

            res.json({
                ok: true,
                ticket
            });
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    "/api/tickets",
    requireLogin,
    async (req, res, next) => {
        try {
            let result;

            if (isAdmin(req.user)) {
                result =
                    await query(`
                        SELECT
                            t.*,
                            u.username
                        FROM tickets t
                        JOIN users u
                            ON u.id = t.user_id
                        ORDER BY
                            t.updated_at DESC
                    `);
            } else {
                result =
                    await query(
                        `
                        SELECT *
                        FROM tickets
                        WHERE user_id = $1
                        ORDER BY
                            updated_at DESC
                        `,
                        [
                            req.user.id
                        ]
                    );
            }

            res.json({
                tickets:
                    result.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    "/api/tickets/:id/messages",
    requireLogin,
    async (req, res, next) => {
        try {
            const ticket =
                await query(
                    `
                    SELECT *
                    FROM tickets
                    WHERE id = $1
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            const row =
                ticket.rows[0];

            if (!row) {
                return res.status(404).json({
                    error:
                        "التذكرة غير موجودة"
                });
            }

            if (
                row.user_id !==
                    req.user.id &&
                !isAdmin(req.user)
            ) {
                return res.status(403).json({
                    error:
                        "ليس لديك صلاحية"
                });
            }

            const messages =
                await query(
                    `
                    SELECT
                        tm.*,
                        u.username,
                        u.display_name
                    FROM ticket_messages tm
                    JOIN users u
                        ON u.id = tm.user_id
                    WHERE
                        tm.ticket_id = $1
                    ORDER BY
                        tm.created_at ASC
                    `,
                    [row.id]
                );

            res.json({
                messages:
                    messages.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/tickets/:id/messages",
    requireLogin,
    async (req, res, next) => {
        try {
            const message =
                clean(
                    req.body.message,
                    3000
                );

            if (!message) {
                return res.status(400).json({
                    error:
                        "الرسالة فارغة"
                });
            }

            const ticket =
                await query(
                    `
                    SELECT *
                    FROM tickets
                    WHERE id = $1
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            const row =
                ticket.rows[0];

            if (!row) {
                return res.status(404).json({
                    error:
                        "التذكرة غير موجودة"
                });
            }

            if (
                row.user_id !==
                    req.user.id &&
                !isAdmin(req.user)
            ) {
                return res.status(403).json({
                    error:
                        "ليس لديك صلاحية"
                });
            }

            const result =
                await query(
                    `
                    INSERT INTO ticket_messages
                    (
                        ticket_id,
                        user_id,
                        message
                    )
                    VALUES
                    ($1, $2, $3)
                    RETURNING *
                    `,
                    [
                        row.id,
                        req.user.id,
                        message
                    ]
                );

            await query(
                `
                UPDATE tickets
                SET updated_at = NOW()
                WHERE id = $1
                `,
                [row.id]
            );

            io.to(
                `ticket:${row.id}`
            ).emit(
                "ticket:message",
                result.rows[0]
            );

            res.json({
                ok: true,
                message:
                    result.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/tickets/:id/claim",
    requireAdmin,
    async (req, res, next) => {
        try {
            const result =
                await query(
                    `
                    UPDATE tickets
                    SET
                        status = 'claimed',
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            if (!result.rows[0]) {
                return res.status(404).json({
                    error:
                        "التذكرة غير موجودة"
                });
            }

            await addLog(
                "ticket_claim",
                req.user,
                {
                    ticketId:
                        result.rows[0].id
                }
            );

            res.json({
                ok: true,
                ticket:
                    result.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/tickets/:id/close",
    requireLogin,
    async (req, res, next) => {
        try {
            const result =
                await query(
                    `
                    SELECT *
                    FROM tickets
                    WHERE id = $1
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            const ticket =
                result.rows[0];

            if (!ticket) {
                return res.status(404).json({
                    error:
                        "التذكرة غير موجودة"
                });
            }

            if (
                ticket.user_id !==
                    req.user.id &&
                !isAdmin(req.user)
            ) {
                return res.status(403).json({
                    error:
                        "ليس لديك صلاحية"
                });
            }

            const closed =
                await query(
                    `
                    UPDATE tickets
                    SET
                        status = 'closed',
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                    `,
                    [ticket.id]
                );

            res.json({
                ok: true,
                ticket:
                    closed.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   APPLICATIONS
========================================================= */

app.post(
    "/api/applications",
    requireLogin,
    async (req, res, next) => {
        try {
            const reason =
                clean(
                    req.body.reason,
                    3000
                );

            const experience =
                clean(
                    req.body.experience,
                    3000
                );

            if (!reason) {
                return res.status(400).json({
                    error:
                        "اكتب سبب التقديم"
                });
            }

            const existing =
                await query(
                    `
                    SELECT *
                    FROM applications
                    WHERE
                        user_id = $1
                        AND status = 'pending'
                    LIMIT 1
                    `,
                    [
                        req.user.id
                    ]
                );

            if (existing.rows.length) {
                return res.status(409).json({
                    error:
                        "لديك طلب قيد المراجعة بالفعل"
                });
            }

            const result =
                await query(
                    `
                    INSERT INTO applications
                    (
                        user_id,
                        type,
                        data,
                        status
                    )
                    VALUES
                    (
                        $1,
                        'general',
                        $2,
                        'pending'
                    )
                    RETURNING *
                    `,
                    [
                        req.user.id,
                        JSON.stringify({
                            reason,
                            experience
                        })
                    ]
                );

            await addLog(
                "application_create",
                req.user,
                {
                    applicationId:
                        result.rows[0].id
                }
            );

            res.json({
                ok: true,
                application:
                    result.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    "/api/applications",
    requireLogin,
    async (req, res, next) => {
        try {
            let result;

            if (isAdmin(req.user)) {
                result =
                    await query(`
                        SELECT
                            a.*,
                            u.username,
                            u.display_name
                        FROM applications a
                        JOIN users u
                            ON u.id = a.user_id
                        ORDER BY
                            a.created_at DESC
                    `);
            } else {
                result =
                    await query(
                        `
                        SELECT *
                        FROM applications
                        WHERE user_id = $1
                        ORDER BY
                            created_at DESC
                        `,
                        [
                            req.user.id
                        ]
                    );
            }

            res.json({
                applications:
                    result.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/applications/:id/review",
    requireAdmin,
    async (req, res, next) => {
        try {
            const status =
                clean(
                    req.body.status,
                    30
                );

            if (
                ![
                    "accepted",
                    "rejected",
                    "pending"
                ].includes(status)
            ) {
                return res.status(400).json({
                    error:
                        "حالة غير صحيحة"
                });
            }

            const result =
                await query(
                    `
                    UPDATE applications
                    SET
                        status = $1,
                        updated_at = NOW()
                    WHERE id = $2
                    RETURNING *
                    `,
                    [
                        status,
                        Number(req.params.id)
                    ]
                );

            if (!result.rows[0]) {
                return res.status(404).json({
                    error:
                        "الطلب غير موجود"
                });
            }

            await addLog(
                "application_review",
                req.user,
                {
                    applicationId:
                        result.rows[0].id,
                    status
                }
            );

            res.json({
                ok: true,
                application:
                    result.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   ADMIN
========================================================= */

app.get(
    "/api/admins",
    requireAdmin,
    async (req, res, next) => {
        try {
            const result =
                await query(`
                    SELECT *
                    FROM users
                    WHERE role IN
                    ('owner', 'admin')
                    ORDER BY
                        created_at ASC
                `);

            res.json({
                admins:
                    result.rows.map(
                        publicUser
                    )
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    "/api/admins",
    requireOwner,
    async (req, res, next) => {
        try {
            const username =
                clean(
                    req.body.username,
                    40
                );

            const user =
                await getUserByUsername(
                    username
                );

            if (!user) {
                return res.status(404).json({
                    error:
                        "المستخدم غير موجود"
                });
            }

            if (
                user.role === "owner"
            ) {
                return res.status(400).json({
                    error:
                        "هذا المستخدم مالك"
                });
            }

            const result =
                await query(
                    `
                    UPDATE users
                    SET role = 'admin'
                    WHERE id = $1
                    RETURNING *
                    `,
                    [user.id]
                );

            await addLog(
                "admin_add",
                req.user,
                {
                    targetUserId:
                        user.id
                }
            );

            res.json({
                ok: true,
                user:
                    publicUser(
                        result.rows[0]
                    )
            });
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    "/api/admins/:id",
    requireOwner,
    async (req, res, next) => {
        try {
            const result =
                await query(
                    `
                    SELECT *
                    FROM users
                    WHERE id = $1
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            const user =
                result.rows[0];

            if (!user) {
                return res.status(404).json({
                    error:
                        "المستخدم غير موجود"
                });
            }

            if (
                user.role === "owner"
            ) {
                return res.status(400).json({
                    error:
                        "لا يمكن إزالة المالك"
                });
            }

            await query(
                `
                UPDATE users
                SET role = 'user'
                WHERE id = $1
                `,
                [user.id]
            );

            await addLog(
                "admin_remove",
                req.user,
                {
                    targetUserId:
                        user.id
                }
            );

            res.json({
                ok: true
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   LOGS
========================================================= */

app.get(
    "/api/logs",
    requireAdmin,
    async (req, res, next) => {
        try {
            const result =
                await query(`
                    SELECT
                        l.*,
                        u.username
                    FROM logs l
                    LEFT JOIN users u
                        ON u.id = l.user_id
                    ORDER BY
                        l.created_at DESC
                    LIMIT 500
                `);

            res.json({
                logs:
                    result.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   DISCORD DM
========================================================= */

app.post(
    "/api/discord/message",
    requireAdmin,
    async (req, res, next) => {
        try {
            const memberId =
                clean(
                    req.body.memberId,
                    50
                );

            const title =
                clean(
                    req.body.title ||
                        "رسالة من إدارة الموقع",
                    120
                );

            const message =
                clean(
                    req.body.message,
                    3000
                );

            if (
                !memberId ||
                !message
            ) {
                return res.status(400).json({
                    error:
                        "بيانات الرسالة ناقصة"
                });
            }

            await sendDiscordDM(
                memberId,
                title,
                message
            );

            await addLog(
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
                    "تعذر إرسال الرسالة الخاصة في Discord"
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
    async (req, res, next) => {
        try {
            const name =
                clean(
                    req.body.name,
                    200
                );

            const mediaUrl =
                clean(
                    req.body.mediaUrl,
                    2000
                );

            if (!name || !mediaUrl) {
                return res.status(400).json({
                    error:
                        "اكتب اسم الغرفة ورابط المحتوى"
                });
            }

            const result =
                await query(
                    `
                    INSERT INTO watch_rooms
                    (
                        owner_id,
                        name,
                        media_url,
                        status
                    )
                    VALUES
                    ($1, $2, $3, 'waiting')
                    RETURNING *
                    `,
                    [
                        req.user.id,
                        name,
                        mediaUrl
                    ]
                );

            res.json({
                ok: true,
                room:
                    result.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    "/api/watch-rooms",
    requireLogin,
    async (req, res, next) => {
        try {
            const result =
                await query(`
                    SELECT *
                    FROM watch_rooms
                    ORDER BY
                        created_at DESC
                `);

            res.json({
                rooms:
                    result.rows
            });
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    "/api/watch-rooms/:id",
    requireLogin,
    async (req, res, next) => {
        try {
            const result =
                await query(
                    `
                    SELECT *
                    FROM watch_rooms
                    WHERE id = $1
                    `,
                    [
                        Number(req.params.id)
                    ]
                );

            if (!result.rows[0]) {
                return res.status(404).json({
                    error:
                        "الغرفة غير موجودة"
                });
            }

            res.json({
                room:
                    result.rows[0]
            });
        } catch (error) {
            next(error);
        }
    }
);

/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
    "connection",
    socket => {

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
    }
);

/* =========================================================
   DISCORD EVENTS
========================================================= */

discord.once(
    "ready",
    async () => {
        console.log(
            `Discord bot logged in as ${discord.user.tag}`
        );

        try {
            guild =
                await discord.guilds.fetch(
                    DISCORD_GUILD_ID
                );

            console.log(
                `Connected to guild: ${guild.name}`
            );
        } catch (error) {
            console.error(
                "Guild error:",
                error.message
            );
        }
    }
);

/* =========================================================
   DISCORD MESSAGE STATS
========================================================= */

const activity =
    new Map();

function getStats(
    userId
) {
    if (!activity.has(userId)) {
        activity.set(
            userId,
            {
                messages: 0,
                mentionsReceived: 0,
                mentionsSent: 0,
                voiceMinutes: 0,
                voiceJoins: 0
            }
        );
    }

    return activity.get(
        userId
    );
}

const voiceSessions =
    new Map();

discord.on(
    "messageCreate",
    message => {
        if (!message.guild) {
            return;
        }

        if (message.author.bot) {
            return;
        }

        const stats =
            getStats(
                message.author.id
            );

        stats.messages += 1;

        if (
            message.mentions &&
            message.mentions.users
        ) {
            stats.mentionsSent +=
                message.mentions.users.size;

            for (
                const mentioned
                of message.mentions.users.values()
            ) {
                if (mentioned.bot) {
                    continue;
                }

                const target =
                    getStats(
                        mentioned.id
                    );

                target.mentionsReceived +=
                    1;
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

        if (
            !member ||
            member.user.bot
        ) {
            return;
        }

        const joined =
            !oldState.channelId &&
            !!newState.channelId;

        const left =
            !!oldState.channelId &&
            !newState.channelId;

        if (joined) {
            voiceSessions.set(
                member.id,
                Date.now()
            );

            getStats(
                member.id
            ).voiceJoins += 1;
        }

        if (left) {
            const started =
                voiceSessions.get(
                    member.id
                );

            if (started) {
                const minutes =
                    Math.floor(
                        (
                            Date.now() -
                            started
                        ) / 60000
                    );

                getStats(
                    member.id
                ).voiceMinutes +=
                    Math.max(
                        0,
                        minutes
                    );

                voiceSessions.delete(
                    member.id
                );
            }
        }
    }
);

/* =========================================================
   STATIC
========================================================= */

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

/* =========================================================
   FALLBACK
========================================================= */

app.get(
    "*",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

/* =========================================================
   ERROR
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        res.status(500).json({
            error:
                "حدث خطأ في السيرفر"
        });
    }
);

/* =========================================================
   START
========================================================= */

async function start() {
    try {
        console.log(
            "Initializing PostgreSQL..."
        );

        await initDatabase();

        console.log(
            "PostgreSQL connected."
        );

        await ensureOwner();

        httpServer.listen(
            PORT,
            "0.0.0.0",
            () => {
                console.log(
                    `Fahad website running on port ${PORT}`
                );
            }
        );

        await discord.login(
            DISCORD_BOT_TOKEN
        );

    } catch (error) {
        console.error(
            "STARTUP ERROR:",
            error
        );

        process.exit(1);
    }
}

start();
