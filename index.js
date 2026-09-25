"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const bcrypt = require("bcryptjs");

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
    process.env.DISCORD_BOT_TOKEN || "";

const DISCORD_GUILD_ID =
    process.env.DISCORD_GUILD_ID || "";

const PUBLIC_SITE_URL =
    process.env.PUBLIC_SITE_URL || "";

const VISIBLE_ROLE_IDS =
    String(process.env.VISIBLE_ROLE_IDS || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    "temporary-development-session-secret-change-this";

/* =========================================================
   TEMPORARY IN-MEMORY DATABASE
   ---------------------------------------------------------
   IMPORTANT:
   Everything here is temporary.
   Data disappears whenever Railway restarts/redeploys.
========================================================= */

const db = {
    users: [],
    groups: [],
    groupMembers: [],
    groupJoinRequests: [],
    groupMessages: [],

    tickets: [],
    ticketMessages: [],

    applications: [],
    applicationAnswers: [],

    logs: [],

    watchRooms: [],
    watchRoomMessages: [],

    reviews: [],
    notifications: [],

    discordMembers: [],
    discordMessages: [],

    privateMessages: [],

    games: [],
    gamePlayers: [],

    settings: {
        siteName: "Fahad",
        maintenance: false
    }
};

let ids = {
    user: 1,
    group: 1,
    groupMember: 1,
    groupJoinRequest: 1,
    groupMessage: 1,

    ticket: 1,
    ticketMessage: 1,

    application: 1,
    applicationAnswer: 1,

    log: 1,

    watchRoom: 1,
    watchRoomMessage: 1,

    review: 1,
    notification: 1,

    privateMessage: 1,

    game: 1,
    gamePlayer: 1
};

function nextId(type) {
    const value = ids[type] || 1;
    ids[type] = value + 1;
    return value;
}

/* =========================================================
   HELPERS
========================================================= */

function now() {
    return new Date().toISOString();
}

function normalizeUsername(username) {
    return String(username || "")
        .trim()
        .toLowerCase();
}

function safeUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatar: user.avatar || null,
        isAdmin: Boolean(user.isAdmin),
        createdAt: user.createdAt
    };
}

function getUserById(id) {
    return db.users.find(
        user => Number(user.id) === Number(id)
    ) || null;
}

function getUserByUsername(username) {
    const normalized = normalizeUsername(username);

    return db.users.find(
        user => user.username === normalized
    ) || null;
}

function currentUser(req) {
    if (!req.session || !req.session.userId) {
        return null;
    }

    return getUserById(req.session.userId);
}

function requireAuth(req, res, next) {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            ok: false,
            error: "يجب تسجيل الدخول أولاً"
        });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    const user = currentUser(req);

    if (!user || !user.isAdmin) {
        return res.status(403).json({
            ok: false,
            error: "غير مصرح"
        });
    }

    req.user = user;
    next();
}

function addLog(action, userId = null, details = {}) {
    const log = {
        id: nextId("log"),
        action,
        userId,
        details,
        createdAt: now()
    };

    db.logs.unshift(log);

    if (db.logs.length > 5000) {
        db.logs.length = 5000;
    }

    return log;
}

function findGroup(id) {
    return db.groups.find(
        group => Number(group.id) === Number(id)
    ) || null;
}

function findTicket(id) {
    return db.tickets.find(
        ticket => Number(ticket.id) === Number(id)
    ) || null;
}

function findApplication(id) {
    return db.applications.find(
        application => Number(application.id) === Number(id)
    ) || null;
}

function findWatchRoom(id) {
    return db.watchRooms.find(
        room => Number(room.id) === Number(id)
    ) || null;
}

function findGame(id) {
    return db.games.find(
        game => Number(game.id) === Number(id)
    ) || null;
}

function emitGroup(groupId) {
    io.to(`group:${groupId}`).emit(
        "group:update",
        {
            groupId
        }
    );
}

function emitTicket(ticketId) {
    io.to(`ticket:${ticketId}`).emit(
        "ticket:update",
        {
            ticketId
        }
    );
}

function emitWatchRoom(roomId) {
    io.to(`watch:${roomId}`).emit(
        "watch:update",
        {
            roomId
        }
    );
}

function emitGame(gameId) {
    io.to(`game:${gameId}`).emit(
        "game:update",
        {
            gameId
        }
    );
}

/* =========================================================
   DISCORD
========================================================= */

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User
    ]
});

let discordReady = false;

discordClient.once("ready", () => {
    discordReady = true;

    console.log(
        `Discord connected as ${discordClient.user.tag}`
    );

    if (DISCORD_GUILD_ID) {
        const guild = discordClient.guilds.cache.get(
            DISCORD_GUILD_ID
        );

        if (guild) {
            console.log(
                `Discord guild connected: ${guild.name}`
            );
        }
    }
});

discordClient.on("error", error => {
    console.error("Discord error:", error);
});

async function sendDiscordMessage(content, options = {}) {
    if (!discordReady) {
        console.log(
            "[Discord disabled/not ready]",
            content
        );

        return null;
    }

    try {
        const guild =
            discordClient.guilds.cache.get(
                DISCORD_GUILD_ID
            );

        if (!guild) return null;

        let channel = null;

        if (options.channelId) {
            channel =
                guild.channels.cache.get(
                    options.channelId
                );
        }

        if (!channel && options.channelName) {
            channel =
                guild.channels.cache.find(
                    ch => ch.name === options.channelName
                );
        }

        if (!channel) {
            channel =
                guild.systemChannel ||
                guild.channels.cache.find(
                    ch =>
                        ch.type === ChannelType.GuildText &&
                        ch.permissionsFor(
                            guild.members.me
                        )?.has(
                            PermissionFlagsBits.SendMessages
                        )
                );
        }

        if (!channel) return null;

        return await channel.send({
            content,
            embeds: options.embeds || undefined
        });
    } catch (error) {
        console.error(
            "sendDiscordMessage error:",
            error.message
        );

        return null;
    }
}

async function sendDiscordDM(discordUserId, content) {
    if (!discordReady) return false;

    try {
        const user =
            await discordClient.users.fetch(
                discordUserId
            );

        if (!user) return false;

        await user.send(content);

        return true;
    } catch (error) {
        console.error(
            "Discord DM error:",
            error.message
        );

        return false;
    }
}

/* =========================================================
   EXPRESS
========================================================= */

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
        limit: "5mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "5mb"
    })
);

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure:
                process.env.NODE_ENV === "production",
            maxAge:
                1000 *
                60 *
                60 *
                24 *
                30
        }
    })
);

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        status: "online",
        database: "temporary-memory",
        discord: discordReady,
        time: now()
    });
});

/* =========================================================
   AUTH
========================================================= */

app.post("/api/auth/register", async (req, res) => {
    try {
        const username =
            normalizeUsername(req.body.username);

        const password =
            String(req.body.password || "");

        const displayName =
            String(
                req.body.displayName ||
                req.body.username ||
                ""
            ).trim();

        if (!username || !password) {
            return res.status(400).json({
                ok: false,
                error:
                    "اسم المستخدم وكلمة المرور مطلوبان"
            });
        }

        if (username.length < 3) {
            return res.status(400).json({
                ok: false,
                error:
                    "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                ok: false,
                error:
                    "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
            });
        }

        if (getUserByUsername(username)) {
            return res.status(409).json({
                ok: false,
                error:
                    "اسم المستخدم مستخدم بالفعل"
            });
        }

        const passwordHash =
            await bcrypt.hash(password, 12);

        const user = {
            id: nextId("user"),
            username,
            displayName:
                displayName || username,
            passwordHash,
            avatar: null,
            isAdmin: false,
            createdAt: now()
        };

        db.users.push(user);

        req.session.userId = user.id;

        addLog(
            "user_register",
            user.id,
            {
                username
            }
        );

        res.json({
            ok: true,
            user: safeUser(user)
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            error: "حدث خطأ أثناء التسجيل"
        });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const username =
            normalizeUsername(req.body.username);

        const password =
            String(req.body.password || "");

        const user =
            getUserByUsername(username);

        if (!user) {
            return res.status(401).json({
                ok: false,
                error:
                    "اسم المستخدم أو كلمة المرور غير صحيحة"
            });
        }

        const valid =
            await bcrypt.compare(
                password,
                user.passwordHash
            );

        if (!valid) {
            return res.status(401).json({
                ok: false,
                error:
                    "اسم المستخدم أو كلمة المرور غير صحيحة"
            });
        }

        req.session.userId = user.id;

        addLog(
            "user_login",
            user.id,
            {}
        );

        res.json({
            ok: true,
            user: safeUser(user)
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            error: "حدث خطأ أثناء تسجيل الدخول"
        });
    }
});

app.post("/api/auth/logout", (req, res) => {
    const user =
        currentUser(req);

    req.session.destroy(() => {
        if (user) {
            addLog(
                "user_logout",
                user.id,
                {}
            );
        }

        res.json({
            ok: true
        });
    });
});

app.get("/api/auth/me", (req, res) => {
    const user =
        currentUser(req);

    res.json({
        ok: true,
        user: safeUser(user)
    });
});

/* =========================================================
   PUBLIC SERVER
========================================================= */

app.get("/api/public/server", async (req, res) => {
    let guild = null;

    if (discordReady && DISCORD_GUILD_ID) {
        guild =
            discordClient.guilds.cache.get(
                DISCORD_GUILD_ID
            );
    }

    res.json({
        ok: true,
        server: {
            name:
                guild?.name ||
                "Fahad Community",
            id:
                guild?.id ||
                DISCORD_GUILD_ID ||
                null,
            icon:
                guild?.iconURL({
                    extension: "png",
                    size: 256
                }) ||
                null,
            memberCount:
                guild?.memberCount ||
                0,
            online:
                discordReady
        }
    });
});

app.get("/api/public/members", async (req, res) => {
    if (!discordReady || !DISCORD_GUILD_ID) {
        return res.json({
            ok: true,
            members: []
        });
    }

    try {
        const guild =
            discordClient.guilds.cache.get(
                DISCORD_GUILD_ID
            );

        if (!guild) {
            return res.json({
                ok: true,
                members: []
            });
        }

        await guild.members.fetch();

        const members =
            guild.members.cache
                .filter(
                    member =>
                        !member.user.bot
                )
                .map(member => ({
                    id: member.id,
                    username:
                        member.user.username,
                    displayName:
                        member.displayName,
                    avatar:
                        member.user.displayAvatarURL({
                            extension: "png",
                            size: 128
                        }),
                    roles:
                        member.roles.cache
                            .filter(
                                role =>
                                    role.id !==
                                    guild.id
                            )
                            .filter(
                                role =>
                                    VISIBLE_ROLE_IDS.length ===
                                    0 ||
                                    VISIBLE_ROLE_IDS.includes(
                                        role.id
                                    )
                            )
                            .map(role => ({
                                id: role.id,
                                name: role.name
                            }))
                }))
                .slice(0, 1000);

        res.json({
            ok: true,
            members
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            ok: false,
            error:
                "تعذر جلب أعضاء Discord"
        });
    }
});

/* =========================================================
   GROUPS
========================================================= */

app.get("/api/groups", (req, res) => {
    const groups =
        db.groups
            .filter(
                group =>
                    group.status === "approved"
            )
            .map(group => ({
                ...group,
                owner:
                    safeUser(
                        getUserById(
                            group.ownerId
                        )
                    ),
                memberCount:
                    db.groupMembers.filter(
                        member =>
                            member.groupId ===
                            group.id
                    ).length
            }));

    res.json({
        ok: true,
        groups
    });
});

app.get(
    "/api/groups/:id",
    (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                ok: false,
                error: "المجموعة غير موجودة"
            });
        }

        const members =
            db.groupMembers
                .filter(
                    member =>
                        member.groupId ===
                        group.id
                )
                .map(member => ({
                    ...member,
                    user:
                        safeUser(
                            getUserById(
                                member.userId
                            )
                        )
                }));

        const messages =
            db.groupMessages
                .filter(
                    message =>
                        message.groupId ===
                        group.id
                )
                .slice(-100)
                .map(message => ({
                    ...message,
                    user:
                        safeUser(
                            getUserById(
                                message.userId
                            )
                        )
                }));

        res.json({
            ok: true,
            group,
            owner:
                safeUser(
                    getUserById(
                        group.ownerId
                    )
                ),
            members,
            messages
        });
    }
);

app.post(
    "/api/groups",
    requireAuth,
    async (req, res) => {
        try {
            const name =
                String(
                    req.body.name || ""
                ).trim();

            const description =
                String(
                    req.body.description || ""
                ).trim();

            if (!name) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "اسم المجموعة مطلوب"
                });
            }

            const group = {
                id: nextId("group"),
                name,
                description,
                ownerId: req.user.id,
                status: "pending",
                createdAt: now(),
                approvedAt: null,
                approvedBy: null
            };

            db.groups.push(group);

            addLog(
                "group_create",
                req.user.id,
                {
                    groupId: group.id
                }
            );

            await sendDiscordMessage(
                `📥 طلب إنشاء مجموعة جديدة\n\n` +
                `الاسم: ${name}\n` +
                `الوصف: ${description || "بدون وصف"}\n` +
                `صاحب المجموعة: ${req.user.username}\n` +
                `User ID: ${req.user.id}\n` +
                `Group ID: ${group.id}`
            );

            res.json({
                ok: true,
                group
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                ok: false,
                error:
                    "تعذر إنشاء المجموعة"
            });
        }
    }
);

app.post(
    "/api/groups/:id/join",
    requireAuth,
    async (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                ok: false,
                error:
                    "المجموعة غير موجودة"
            });
        }

        if (group.status !== "approved") {
            return res.status(400).json({
                ok: false,
                error:
                    "المجموعة لم تتم الموافقة عليها بعد"
            });
        }

        const alreadyMember =
            db.groupMembers.some(
                member =>
                    member.groupId ===
                        group.id &&
                    member.userId ===
                        req.user.id
            );

        if (alreadyMember) {
            return res.status(400).json({
                ok: false,
                error:
                    "أنت عضو بالفعل في المجموعة"
            });
        }

        const existingRequest =
            db.groupJoinRequests.find(
                request =>
                    request.groupId ===
                        group.id &&
                    request.userId ===
                        req.user.id &&
                    request.status ===
                        "pending"
            );

        if (existingRequest) {
            return res.status(400).json({
                ok: false,
                error:
                    "لديك طلب انضمام قيد المراجعة"
            });
        }

        const request = {
            id: nextId(
                "groupJoinRequest"
            ),
            groupId: group.id,
            userId: req.user.id,
            status: "pending",
            createdAt: now(),
            reviewedAt: null,
            reviewedBy: null
        };

        db.groupJoinRequests.push(
            request
        );

        addLog(
            "group_join_request",
            req.user.id,
            {
                groupId: group.id,
                requestId: request.id
            }
        );

        await sendDiscordMessage(
            `📥 طلب انضمام لمجموعة\n\n` +
            `المجموعة: ${group.name}\n` +
            `المستخدم: ${req.user.username}\n` +
            `User ID: ${req.user.id}\n` +
            `Group ID: ${group.id}\n` +
            `Request ID: ${request.id}`
        );

        res.json({
            ok: true,
            request
        });
    }
);

app.get(
    "/api/groups/:id/members",
    requireAuth,
    (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                ok: false,
                error:
                    "المجموعة غير موجودة"
            });
        }

        const members =
            db.groupMembers
                .filter(
                    member =>
                        member.groupId ===
                        group.id
                )
                .map(member => ({
                    ...member,
                    user:
                        safeUser(
                            getUserById(
                                member.userId
                            )
                        )
                }));

        res.json({
            ok: true,
            members
        });
    }
);

app.post(
    "/api/groups/:id/messages",
    requireAuth,
    (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                ok: false,
                error:
                    "المجموعة غير موجودة"
            });
        }

        const isMember =
            db.groupMembers.some(
                member =>
                    member.groupId ===
                        group.id &&
                    member.userId ===
                        req.user.id
            );

        const isOwner =
            group.ownerId ===
            req.user.id;

        if (
            !isMember &&
            !isOwner &&
            !req.user.isAdmin
        ) {
            return res.status(403).json({
                ok: false,
                error:
                    "يجب أن تكون عضوًا في المجموعة"
            });
        }

        const content =
            String(
                req.body.content || ""
            ).trim();

        if (!content) {
            return res.status(400).json({
                ok: false,
                error:
                    "الرسالة فارغة"
            });
        }

        const message = {
            id: nextId(
                "groupMessage"
            ),
            groupId: group.id,
            userId: req.user.id,
            content,
            createdAt: now()
        };

        db.groupMessages.push(message);

        emitGroup(group.id);

        res.json({
            ok: true,
            message: {
                ...message,
                user:
                    safeUser(req.user)
            }
        });
    }
);

/* =========================================================
   GROUP JOIN REQUESTS
========================================================= */

app.get(
    "/api/group-join-requests",
    requireAdmin,
    (req, res) => {
        const requests =
            db.groupJoinRequests.map(
                request => ({
                    ...request,
                    group:
                        findGroup(
                            request.groupId
                        ),
                    user:
                        safeUser(
                            getUserById(
                                request.userId
                            )
                        )
                })
            );

        res.json({
            ok: true,
            requests
        });
    }
);

app.post(
    "/api/group-join-requests/:id/review",
    requireAdmin,
    async (req, res) => {
        const request =
            db.groupJoinRequests.find(
                item =>
                    Number(item.id) ===
                    Number(req.params.id)
            );

        if (!request) {
            return res.status(404).json({
                ok: false,
                error:
                    "طلب الانضمام غير موجود"
            });
        }

        if (request.status !== "pending") {
            return res.status(400).json({
                ok: false,
                error:
                    "تمت مراجعة الطلب مسبقًا"
            });
        }

        const decision =
            String(
                req.body.status || ""
            ).toLowerCase();

        if (
            decision !== "approved" &&
            decision !== "rejected"
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "الحالة يجب أن تكون approved أو rejected"
            });
        }

        request.status = decision;
        request.reviewedAt = now();
        request.reviewedBy =
            req.user.id;

        const group =
            findGroup(
                request.groupId
            );

        if (
            decision === "approved" &&
            group
        ) {
            const exists =
                db.groupMembers.some(
                    member =>
                        member.groupId ===
                            group.id &&
                        member.userId ===
                            request.userId
                );

            if (!exists) {
                db.groupMembers.push({
                    id: nextId(
                        "groupMember"
                    ),
                    groupId: group.id,
                    userId:
                        request.userId,
                    role: "member",
                    createdAt: now()
                });
            }

            const joinedUser =
                getUserById(
                    request.userId
                );

            if (joinedUser) {
                await sendDiscordMessage(
                    `✅ تمت الموافقة على طلب الانضمام\n\n` +
                    `المجموعة: ${group.name}\n` +
                    `المستخدم: ${joinedUser.username}`
                );
            }
        }

        addLog(
            "group_join_request_review",
            req.user.id,
            {
                requestId:
                    request.id,
                status:
                    decision
            }
        );

        emitGroup(
            request.groupId
        );

        res.json({
            ok: true,
            request
        });
    }
);

/* =========================================================
   TICKETS
========================================================= */

app.get(
    "/api/tickets",
    requireAuth,
    (req, res) => {
        let tickets =
            db.tickets;

        if (!req.user.isAdmin) {
            tickets =
                tickets.filter(
                    ticket =>
                        ticket.userId ===
                        req.user.id
                );
        }

        tickets =
            tickets.map(ticket => ({
                ...ticket,
                user:
                    safeUser(
                        getUserById(
                            ticket.userId
                        )
                    ),
                assignedTo:
                    safeUser(
                        getUserById(
                            ticket.assignedTo
                        )
                    )
            }));

        res.json({
            ok: true,
            tickets
        });
    }
);

app.get(
    "/api/tickets/:id",
    requireAuth,
    (req, res) => {
        const ticket =
            findTicket(
                req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                ok: false,
                error:
                    "التذكرة غير موجودة"
            });
        }

        if (
            !req.user.isAdmin &&
            ticket.userId !==
                req.user.id
        ) {
            return res.status(403).json({
                ok: false,
                error:
                    "غير مصرح"
            });
        }

        const messages =
            db.ticketMessages
                .filter(
                    message =>
                        message.ticketId ===
                        ticket.id
                )
                .map(message => ({
                    ...message,
                    user:
                        safeUser(
                            getUserById(
                                message.userId
                            )
                        )
                }));

        res.json({
            ok: true,
            ticket,
            messages
        });
    }
);

app.post(
    "/api/tickets",
    requireAuth,
    async (req, res) => {
        const subject =
            String(
                req.body.subject || ""
            ).trim();

        const type =
            String(
                req.body.type ||
                "general"
            ).trim();

        const message =
            String(
                req.body.message || ""
            ).trim();

        if (!subject) {
            return res.status(400).json({
                ok: false,
                error:
                    "عنوان التذكرة مطلوب"
            });
        }

        const ticket = {
            id: nextId("ticket"),
            userId: req.user.id,
            subject,
            type,
            status: "open",
            priority: "normal",
            assignedTo: null,
            createdAt: now(),
            updatedAt: now()
        };

        db.tickets.push(ticket);

        if (message) {
            db.ticketMessages.push({
                id: nextId(
                    "ticketMessage"
                ),
                ticketId: ticket.id,
                userId: req.user.id,
                content: message,
                createdAt: now()
            });
        }

        await sendDiscordMessage(
            `🎫 تذكرة جديدة\n\n` +
            `العنوان: ${subject}\n` +
            `النوع: ${type}\n` +
            `المستخدم: ${req.user.username}\n` +
            `Ticket ID: ${ticket.id}`
        );

        addLog(
            "ticket_create",
            req.user.id,
            {
                ticketId:
                    ticket.id
            }
        );

        res.json({
            ok: true,
            ticket
        });
    }
);

app.post(
    "/api/tickets/:id/messages",
    requireAuth,
    (req, res) => {
        const ticket =
            findTicket(
                req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                ok: false,
                error:
                    "التذكرة غير موجودة"
            });
        }

        if (
            !req.user.isAdmin &&
            ticket.userId !==
                req.user.id
        ) {
            return res.status(403).json({
                ok: false,
                error:
                    "غير مصرح"
            });
        }

        const content =
            String(
                req.body.content || ""
            ).trim();

        if (!content) {
            return res.status(400).json({
                ok: false,
                error:
                    "الرسالة فارغة"
            });
        }

        const message = {
            id: nextId(
                "ticketMessage"
            ),
            ticketId: ticket.id,
            userId: req.user.id,
            content,
            createdAt: now()
        };

        db.ticketMessages.push(
            message
        );

        ticket.updatedAt = now();

        emitTicket(ticket.id);

        res.json({
            ok: true,
            message: {
                ...message,
                user:
                    safeUser(req.user)
            }
        });
    }
);

app.post(
    "/api/tickets/:id/claim",
    requireAdmin,
    (req, res) => {
        const ticket =
            findTicket(
                req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                ok: false,
                error:
                    "التذكرة غير موجودة"
            });
        }

        ticket.assignedTo =
            req.user.id;

        ticket.updatedAt = now();

        emitTicket(ticket.id);

        res.json({
            ok: true,
            ticket
        });
    }
);

app.post(
    "/api/tickets/:id/close",
    requireAuth,
    (req, res) => {
        const ticket =
            findTicket(
                req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                ok: false,
                error:
                    "التذكرة غير موجودة"
            });
        }

        if (
            !req.user.isAdmin &&
            ticket.userId !==
                req.user.id
        ) {
            return res.status(403).json({
                ok: false,
                error:
                    "غير مصرح"
            });
        }

        ticket.status = "closed";
        ticket.updatedAt = now();

        emitTicket(ticket.id);

        res.json({
            ok: true,
            ticket
        });
    }
);

/* =========================================================
   APPLICATIONS
========================================================= */

app.get(
    "/api/applications",
    requireAuth,
    (req, res) => {
        let applications =
            db.applications;

        if (!req.user.isAdmin) {
            applications =
                applications.filter(
                    application =>
                        application.userId ===
                        req.user.id
                );
        }

        applications =
            applications.map(
                application => ({
                    ...application,
                    user:
                        safeUser(
                            getUserById(
                                application.userId
                            )
                        ),
                    answers:
                        db.applicationAnswers
                            .filter(
                                answer =>
                                    answer.applicationId ===
                                    application.id
                            )
                })
            );

        res.json({
            ok: true,
            applications
        });
    }
);

app.post(
    "/api/applications",
    requireAuth,
    async (req, res) => {
        const type =
            String(
                req.body.type ||
                "general"
            ).trim();

        const title =
            String(
                req.body.title ||
                type
            ).trim();

        let answers =
            req.body.answers;

        if (
            !answers ||
            typeof answers !==
                "object"
        ) {
            answers = {};
        }

        const application = {
            id: nextId(
                "application"
            ),
            userId: req.user.id,
            type,
            title,
            status: "pending",
            createdAt: now(),
            reviewedAt: null,
            reviewedBy: null,
            reviewNote: null
        };

        db.applications.push(
            application
        );

        Object.entries(answers)
            .forEach(
                ([question, value]) => {
                    db.applicationAnswers.push({
                        id: nextId(
                            "applicationAnswer"
                        ),
                        applicationId:
                            application.id,
                        question,
                        value
                    });
                }
            );

        await sendDiscordMessage(
            `📝 طلب تقديم جديد\n\n` +
            `النوع: ${type}\n` +
            `العنوان: ${title}\n` +
            `المستخدم: ${req.user.username}\n` +
            `Application ID: ${application.id}`
        );

        addLog(
            "application_create",
            req.user.id,
            {
                applicationId:
                    application.id
            }
        );

        res.json({
            ok: true,
            application
        });
    }
);

app.post(
    "/api/applications/:id/review",
    requireAdmin,
    async (req, res) => {
        const application =
            findApplication(
                req.params.id
            );

        if (!application) {
            return res.status(404).json({
                ok: false,
                error:
                    "الطلب غير موجود"
            });
        }

        const status =
            String(
                req.body.status || ""
            ).toLowerCase();

        if (
            ![
                "approved",
                "rejected"
            ].includes(status)
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "الحالة غير صحيحة"
            });
        }

        application.status =
            status;

        application.reviewedAt =
            now();

        application.reviewedBy =
            req.user.id;

        application.reviewNote =
            String(
                req.body.note || ""
            ).trim();

        const targetUser =
            getUserById(
                application.userId
            );

        if (targetUser) {
            await sendDiscordMessage(
                `📋 تمت مراجعة طلب\n\n` +
                `المستخدم: ${targetUser.username}\n` +
                `النوع: ${application.type}\n` +
                `الحالة: ${status}`
            );
        }

        addLog(
            "application_review",
            req.user.id,
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
   ADMIN
========================================================= */

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {
        res.json({
            ok: true,
            users:
                db.users.map(
                    safeUser
                )
        });
    }
);

app.get(
    "/api/admin/groups",
    requireAdmin,
    (req, res) => {
        res.json({
            ok: true,
            groups:
                db.groups.map(
                    group => ({
                        ...group,
                        owner:
                            safeUser(
                                getUserById(
                                    group.ownerId
                                )
                            ),
                        memberCount:
                            db.groupMembers.filter(
                                member =>
                                    member.groupId ===
                                    group.id
                            ).length
                    })
                )
        });
    }
);

app.post(
    "/api/admin/groups/:id/review",
    requireAdmin,
    async (req, res) => {
        const group =
            findGroup(
                req.params.id
            );

        if (!group) {
            return res.status(404).json({
                ok: false,
                error:
                    "المجموعة غير موجودة"
            });
        }

        const status =
            String(
                req.body.status || ""
            ).toLowerCase();

        if (
            ![
                "approved",
                "rejected"
            ].includes(status)
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "الحالة غير صحيحة"
            });
        }

        group.status = status;
        group.approvedAt =
            status === "approved"
                ? now()
                : null;

        group.approvedBy =
            req.user.id;

        if (
            status === "approved"
        ) {
            const owner =
                getUserById(
                    group.ownerId
                );

            const exists =
                db.groupMembers.some(
                    member =>
                        member.groupId ===
                            group.id &&
                        member.userId ===
                            group.ownerId
                );

            if (!exists) {
                db.groupMembers.push({
                    id: nextId(
                        "groupMember"
                    ),
                    groupId: group.id,
                    userId:
                        group.ownerId,
                    role: "owner",
                    createdAt: now()
                });
            }

            await sendDiscordMessage(
                `✅ تمت الموافقة على المجموعة\n\n` +
                `المجموعة: ${group.name}\n` +
                `صاحبها: ${owner?.username || "Unknown"}`
            );
        }

        addLog(
            "group_review",
            req.user.id,
            {
                groupId:
                    group.id,
                status
            }
        );

        res.json({
            ok: true,
            group
        });
    }
);

app.get(
    "/api/admin/logs",
    requireAdmin,
    (req, res) => {
        res.json({
            ok: true,
            logs:
                db.logs.slice(0, 1000)
        });
    }
);

app.get(
    "/api/admin/stats",
    requireAdmin,
    (req, res) => {
        res.json({
            ok: true,
            stats: {
                users:
                    db.users.length,
                groups:
                    db.groups.length,
                approvedGroups:
                    db.groups.filter(
                        g =>
                            g.status ===
                            "approved"
                    ).length,
                pendingGroups:
                    db.groups.filter(
                        g =>
                            g.status ===
                            "pending"
                    ).length,
                tickets:
                    db.tickets.length,
                openTickets:
                    db.tickets.filter(
                        t =>
                            t.status ===
                            "open"
                    ).length,
                applications:
                    db.applications.length,
                pendingApplications:
                    db.applications.filter(
                        a =>
                            a.status ===
                            "pending"
                    ).length,
                watchRooms:
                    db.watchRooms.length,
                games:
                    db.games.length
            }
        });
    }
);

/* =========================================================
   DISCORD DM
========================================================= */

app.post(
    "/api/admin/discord/dm",
    requireAdmin,
    async (req, res) => {
        const discordUserId =
            String(
                req.body.discordUserId ||
                ""
            ).trim();

        const content =
            String(
                req.body.content ||
                ""
            ).trim();

        if (
            !discordUserId ||
            !content
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "Discord User ID والرسالة مطلوبان"
            });
        }

        const sent =
            await sendDiscordDM(
                discordUserId,
                content
            );

        res.json({
            ok: sent
        });
    }
);

/* =========================================================
   WATCH ROOMS
========================================================= */

app.get(
    "/api/watch-rooms",
    (req, res) => {
        res.json({
            ok: true,
            rooms:
                db.watchRooms.map(
                    room => ({
                        ...room,
                        host:
                            safeUser(
                                getUserById(
                                    room.hostId
                                )
                            )
                    })
                )
        });
    }
);

app.post(
    "/api/watch-rooms",
    requireAuth,
    (req, res) => {
        const title =
            String(
                req.body.title ||
                ""
            ).trim();

        const mediaUrl =
            String(
                req.body.mediaUrl ||
                ""
            ).trim();

        if (!title) {
            return res.status(400).json({
                ok: false,
                error:
                    "اسم المشاهدة مطلوب"
            });
        }

        const room = {
            id: nextId(
                "watchRoom"
            ),
            hostId: req.user.id,
            title,
            mediaUrl,
            status: "waiting",
            currentTime: 0,
            playing: false,
            createdAt: now()
        };

        db.watchRooms.push(room);

        emitWatchRoom(room.id);

        res.json({
            ok: true,
            room
        });
    }
);

app.get(
    "/api/watch-rooms/:id",
    (req, res) => {
        const room =
            findWatchRoom(
                req.params.id
            );

        if (!room) {
            return res.status(404).json({
                ok: false,
                error:
                    "الغرفة غير موجودة"
            });
        }

        res.json({
            ok: true,
            room,
            messages:
                db.watchRoomMessages
                    .filter(
                        message =>
                            message.roomId ===
                            room.id
                    )
                    .slice(-100)
                    .map(message => ({
                        ...message,
                        user:
                            safeUser(
                                getUserById(
                                    message.userId
                                )
                            )
                    }))
        });
    }
);

app.post(
    "/api/watch-rooms/:id/state",
    requireAuth,
    (req, res) => {
        const room =
            findWatchRoom(
                req.params.id
            );

        if (!room) {
            return res.status(404).json({
                ok: false,
                error:
                    "الغرفة غير موجودة"
            });
        }

        if (
            room.hostId !==
            req.user.id &&
            !req.user.isAdmin
        ) {
            return res.status(403).json({
                ok: false,
                error:
                    "المضيف فقط يستطيع التحكم"
            });
        }

        if (
            typeof req.body.currentTime ===
            "number"
        ) {
            room.currentTime =
                Math.max(
                    0,
                    req.body.currentTime
                );
        }

        if (
            typeof req.body.playing ===
            "boolean"
        ) {
            room.playing =
                req.body.playing;
        }

        emitWatchRoom(room.id);

        res.json({
            ok: true,
            room
        });
    }
);

app.post(
    "/api/watch-rooms/:id/messages",
    requireAuth,
    (req, res) => {
        const room =
            findWatchRoom(
                req.params.id
            );

        if (!room) {
            return res.status(404).json({
                ok: false,
                error:
                    "الغرفة غير موجودة"
            });
        }

        const content =
            String(
                req.body.content ||
                ""
            ).trim();

        if (!content) {
            return res.status(400).json({
                ok: false,
                error:
                    "الرسالة فارغة"
            });
        }

        const message = {
            id: nextId(
                "watchRoomMessage"
            ),
            roomId: room.id,
            userId: req.user.id,
            content,
            createdAt: now()
        };

        db.watchRoomMessages.push(
            message
        );

        emitWatchRoom(room.id);

        res.json({
            ok: true,
            message
        });
    }
);

/* =========================================================
   REVIEWS
========================================================= */

app.get(
    "/api/reviews",
    (req, res) => {
        res.json({
            ok: true,
            reviews:
                db.reviews.map(
                    review => ({
                        ...review,
                        user:
                            safeUser(
                                getUserById(
                                    review.userId
                                )
                            )
                    })
                )
        });
    }
);

app.post(
    "/api/reviews",
    requireAuth,
    (req, res) => {
        const targetType =
            String(
                req.body.targetType ||
                "site"
            ).trim();

        const targetId =
            String(
                req.body.targetId ||
                ""
            ).trim();

        const rating =
            Number(
                req.body.rating
            );

        const comment =
            String(
                req.body.comment ||
                ""
            ).trim();

        if (
            !Number.isFinite(
                rating
            ) ||
            rating < 1 ||
            rating > 5
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "التقييم يجب أن يكون من 1 إلى 5"
            });
        }

        const review = {
            id: nextId(
                "review"
            ),
            userId: req.user.id,
            targetType,
            targetId,
            rating,
            comment,
            status: "visible",
            createdAt: now()
        };

        db.reviews.push(review);

        res.json({
            ok: true,
            review
        });
    }
);

/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get(
    "/api/notifications",
    requireAuth,
    (req, res) => {
        const notifications =
            db.notifications
                .filter(
                    notification =>
                        notification.userId ===
                        req.user.id
                )
                .sort(
                    (a, b) =>
                        new Date(
                            b.createdAt
                        ) -
                        new Date(
                            a.createdAt
                        )
                );

        res.json({
            ok: true,
            notifications
        });
    }
);

function createNotification(
    userId,
    title,
    message,
    type = "info"
) {
    const notification = {
        id: nextId(
            "notification"
        ),
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: now()
    };

    db.notifications.push(
        notification
    );

    io.to(
        `user:${userId}`
    ).emit(
        "notification",
        notification
    );

    return notification;
}

/* =========================================================
   GAMES
========================================================= */

app.get(
    "/api/games",
    (req, res) => {
        res.json({
            ok: true,
            games:
                db.games.map(
                    game => ({
                        ...game,
                        players:
                            db.gamePlayers.filter(
                                player =>
                                    player.gameId ===
                                    game.id
                            )
                    })
                )
        });
    }
);

app.post(
    "/api/games",
    requireAuth,
    (req, res) => {
        const type =
            String(
                req.body.type ||
                ""
            ).trim();

        const name =
            String(
                req.body.name ||
                type
            ).trim();

        if (!type) {
            return res.status(400).json({
                ok: false,
                error:
                    "نوع اللعبة مطلوب"
            });
        }

        const game = {
            id: nextId("game"),
            type,
            name,
            hostId: req.user.id,
            status: "waiting",
            maxPlayers:
                Number(
                    req.body.maxPlayers ||
                    4
                ),
            createdAt: now()
        };

        db.games.push(game);

        db.gamePlayers.push({
            id: nextId(
                "gamePlayer"
            ),
            gameId: game.id,
            userId: req.user.id,
            position: 0,
            bot: false,
            joinedAt: now()
        });

        emitGame(game.id);

        res.json({
            ok: true,
            game
        });
    }
);

app.get(
    "/api/games/:id",
    (req, res) => {
        const game =
            findGame(
                req.params.id
            );

        if (!game) {
            return res.status(404).json({
                ok: false,
                error:
                    "اللعبة غير موجودة"
            });
        }

        const players =
            db.gamePlayers
                .filter(
                    player =>
                        player.gameId ===
                        game.id
                )
                .map(player => ({
                    ...player,
                    user:
                        player.bot
                            ? null
                            : safeUser(
                                getUserById(
                                    player.userId
                                )
                            )
                }));

        res.json({
            ok: true,
            game,
            players
        });
    }
);

app.post(
    "/api/games/:id/join",
    requireAuth,
    (req, res) => {
        const game =
            findGame(
                req.params.id
            );

        if (!game) {
            return res.status(404).json({
                ok: false,
                error:
                    "اللعبة غير موجودة"
            });
        }

        const already =
            db.gamePlayers.some(
                player =>
                    player.gameId ===
                        game.id &&
                    player.userId ===
                        req.user.id &&
                    !player.bot
            );

        if (already) {
            return res.status(400).json({
                ok: false,
                error:
                    "أنت داخل اللعبة بالفعل"
            });
        }

        const count =
            db.gamePlayers.filter(
                player =>
                    player.gameId ===
                    game.id
            ).length;

        if (
            count >=
            game.maxPlayers
        ) {
            return res.status(400).json({
                ok: false,
                error:
                    "اللعبة ممتلئة"
            });
        }

        db.gamePlayers.push({
            id: nextId(
                "gamePlayer"
            ),
            gameId: game.id,
            userId: req.user.id,
            position: count,
            bot: false,
            joinedAt: now()
        });

        emitGame(game.id);

        res.json({
            ok: true,
            game
        });
    }
);

app.post(
    "/api/games/:id/bots",
    requireAuth,
    (req, res) => {
        const game =
            findGame(
                req.params.id
            );

        if (!game) {
            return res.status(404).json({
                ok: false,
                error:
                    "اللعبة غير موجودة"
            });
        }

        if (
            game.hostId !==
            req.user.id &&
            !req.user.isAdmin
        ) {
            return res.status(403).json({
                ok: false,
                error:
                    "المضيف فقط يستطيع إضافة لاعبين آليين"
            });
        }

        const currentCount =
            db.gamePlayers.filter(
                player =>
                    player.gameId ===
                    game.id
            ).length;

        const requested =
            Math.max(
                0,
                Number(
                    req.body.count ||
                    1
                )
            );

        const available =
            Math.max(
                0,
                game.maxPlayers -
                    currentCount
            );

        const amount =
            Math.min(
                requested,
                available
            );

        for (
            let i = 0;
            i < amount;
            i++
        ) {
            db.gamePlayers.push({
                id: nextId(
                    "gamePlayer"
                ),
                gameId: game.id,
                userId: null,
                position:
                    currentCount +
                    i,
                bot: true,
                botName:
                    `Bot ${i + 1}`,
                joinedAt: now()
            });
        }

        emitGame(game.id);

        res.json({
            ok: true,
            game,
            added: amount
        });
    }
);

/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
    "connection",
    socket => {
        socket.on(
            "authenticate",
            userId => {
                const user =
                    getUserById(
                        userId
                    );

                if (!user) return;

                socket.userId =
                    user.id;

                socket.join(
                    `user:${user.id}`
                );
            }
        );

        socket.on(
            "join-group",
            groupId => {
                socket.join(
                    `group:${groupId}`
                );
            }
        );

        socket.on(
            "leave-group",
            groupId => {
                socket.leave(
                    `group:${groupId}`
                );
            }
        );

        socket.on(
            "join-ticket",
            ticketId => {
                socket.join(
                    `ticket:${ticketId}`
                );
            }
        );

        socket.on(
            "leave-ticket",
            ticketId => {
                socket.leave(
                    `ticket:${ticketId}`
                );
            }
        );

        socket.on(
            "join-watch",
            roomId => {
                socket.join(
                    `watch:${roomId}`
                );
            }
        );

        socket.on(
            "leave-watch",
            roomId => {
                socket.leave(
                    `watch:${roomId}`
                );
            }
        );

        socket.on(
            "join-game",
            gameId => {
                socket.join(
                    `game:${gameId}`
                );
            }
        );

        socket.on(
            "leave-game",
            gameId => {
                socket.leave(
                    `game:${gameId}`
                );
            }
        );
    }
);

/* =========================================================
   DISCORD EVENTS
========================================================= */

discordClient.on(
    "messageCreate",
    message => {
        if (message.author.bot) {
            return;
        }

        db.discordMessages.push({
            id: message.id,
            channelId:
                message.channelId,
            authorId:
                message.author.id,
            authorUsername:
                message.author.username,
            content:
                message.content,
            createdAt:
                now()
        });

        if (
            db.discordMessages.length >
            5000
        ) {
            db.discordMessages.shift();
        }
    }
);

discordClient.on(
    "guildMemberAdd",
    member => {
        db.discordMembers.push({
            id: member.id,
            username:
                member.user.username,
            joinedAt: now()
        });

        io.emit(
            "discord:member:add",
            {
                id: member.id,
                username:
                    member.user.username
            }
        );
    }
);

discordClient.on(
    "guildMemberRemove",
    member => {
        io.emit(
            "discord:member:remove",
            {
                id: member.id
            }
        );
    }
);

/* =========================================================
   ADMIN OWNER
========================================================= */

async function ensureOwner() {
    const ownerUsername =
        normalizeUsername(
            process.env.OWNER_USERNAME ||
            "owner"
        );

    const ownerPassword =
        String(
            process.env.OWNER_PASSWORD ||
            "change-this-password"
        );

    let owner =
        getUserByUsername(
            ownerUsername
        );

    if (!owner) {
        owner = {
            id: nextId("user"),
            username:
                ownerUsername,
            displayName:
                process.env.OWNER_DISPLAY_NAME ||
                "Owner",
            passwordHash:
                await bcrypt.hash(
                    ownerPassword,
                    12
                ),
            avatar: null,
            isAdmin: true,
            createdAt: now()
        };

        db.users.push(owner);

        console.log(
            `Temporary owner created: ${ownerUsername}`
        );
    } else {
        owner.isAdmin = true;
    }
}

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

app.get(
    "*",
    (req, res, next) => {
        if (
            req.path.startsWith(
                "/api/"
            )
        ) {
            return next();
        }

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
   ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.error(
            "Server error:",
            error
        );

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            ok: false,
            error:
                "حدث خطأ داخلي في الخادم"
        });
    }
);

/* =========================================================
   START
========================================================= */

async function start() {
    try {
        await ensureOwner();

        httpServer.listen(
            PORT,
            () => {
                console.log(
                    `Fahad server running on port ${PORT}`
                );

                console.log(
                    "Database mode: TEMPORARY IN-MEMORY"
                );

                if (
                    DISCORD_BOT_TOKEN
                ) {
                    discordClient
                        .login(
                            DISCORD_BOT_TOKEN
                        )
                        .catch(error => {
                            console.error(
                                "Discord login failed:",
                                error.message
                            );
                        });
                } else {
                    console.log(
                        "DISCORD_BOT_TOKEN not configured. Discord disabled."
                    );
                }
            }
        );
    } catch (error) {
        console.error(
            "Startup error:",
            error
        );

        process.exit(1);
    }
}

start();
