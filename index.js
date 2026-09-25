"use strict";

require("dotenv").config();

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ChannelType
} = require("discord.js");

const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

const PORT = Number(process.env.PORT || 3000);

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

const OWNER_ID = process.env.OWNER_ID || "";
const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "change-me";

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    crypto.randomBytes(32).toString("hex");

const DISCORD_NOTIFICATION_CHANNEL_ID =
    process.env.DISCORD_NOTIFICATION_CHANNEL_ID || "";

const PUBLIC_SITE_URL =
    process.env.PUBLIC_SITE_URL || "";

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    console.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID");
    process.exit(1);
}

app.disable("x-powered-by");

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

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 24 * 30
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

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

/* =========================================================
   MEMORY DATABASE
========================================================= */

const db = {
    users: [],
    admins: [],
    groups: [],
    groupMembers: [],
    groupJoinRequests: [],
    groupMessages: [],
    tickets: [],
    ticketMessages: [],
    applications: [],
    logs: [],
    privateMessageLogs: [],
    watchRooms: [],
    reviews: [],
    games: [],
    gamePlayers: [],
    notifications: []
};

let ids = {
    user: 1,
    admin: 1,
    group: 1,
    groupMember: 1,
    groupJoinRequest: 1,
    groupMessage: 1,
    ticket: 1,
    ticketMessage: 1,
    application: 1,
    log: 1,
    privateMessageLog: 1,
    watchRoom: 1,
    review: 1,
    game: 1,
    gamePlayer: 1,
    notification: 1
};

/* =========================================================
   HELPERS
========================================================= */

function clean(value, max = 200) {
    return String(value ?? "")
        .trim()
        .slice(0, max);
}

function now() {
    return new Date().toISOString();
}

function hashPassword(password) {
    return bcrypt.hashSync(String(password), 12);
}

function comparePassword(password, hash) {
    try {
        return bcrypt.compareSync(String(password), hash);
    } catch {
        return false;
    }
}

function publicUser(user) {
    if (!user) return null;

    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        discordId: user.discordId || null,
        createdAt: user.createdAt
    };
}

function currentUser(req) {
    if (!req.session?.userId) return null;

    return (
        db.users.find(
            user => user.id === Number(req.session.userId)
        ) || null
    );
}

function requireAuth(req, res, next) {
    const user = currentUser(req);

    if (!user) {
        return res.status(401).json({
            error: "يجب تسجيل الدخول أولًا"
        });
    }

    req.user = user;
    next();
}

function isOwner(user) {
    return Boolean(
        user &&
        (
            user.role === "owner" ||
            user.id === 1
        )
    );
}

function isAdmin(user) {
    return Boolean(
        user &&
        (
            user.role === "owner" ||
            user.role === "admin"
        )
    );
}

function requireAdmin(req, res, next) {
    const user = currentUser(req);

    if (!user || !isAdmin(user)) {
        return res.status(403).json({
            error: "ليس لديك صلاحية الإدارة"
        });
    }

    req.user = user;
    next();
}

function makeSlug(text) {
    return clean(text, 80)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-_]/gu, "")
        .replace(/\s+/g, "-")
        .slice(0, 60);
}

function findUser(id) {
    return db.users.find(
        user => user.id === Number(id)
    ) || null;
}

function findGroup(id) {
    return db.groups.find(
        group => group.id === Number(id)
    ) || null;
}

function isGroupOwner(group, userId) {
    return Boolean(
        group &&
        Number(group.ownerId) === Number(userId)
    );
}

function isGroupMember(groupId, userId) {
    const group = findGroup(groupId);

    if (!group || group.status !== "approved") {
        return false;
    }

    if (isGroupOwner(group, userId)) {
        return true;
    }

    return db.groupMembers.some(member =>
        Number(member.groupId) === Number(groupId) &&
        Number(member.userId) === Number(userId) &&
        member.status === "approved"
    );
}

function groupView(group) {
    if (!group) return null;

    const owner = findUser(group.ownerId);

    const members = db.groupMembers
        .filter(member =>
            Number(member.groupId) === Number(group.id) &&
            member.status === "approved"
        )
        .map(member => {
            const user = findUser(member.userId);

            return {
                id: member.id,
                userId: member.userId,
                username: user?.username || "unknown",
                displayName: user?.displayName || user?.username || "unknown",
                joinedAt: member.createdAt
            };
        });

    return {
        ...group,
        owner: publicUser(owner),
        members,
        membersCount: members.length
    };
}

/* =========================================================
   OWNER ACCOUNT
========================================================= */

if (!db.users.length) {
    db.users.push({
        id: ids.user++,
        username: OWNER_USERNAME,
        displayName: "فهد المطيري",
        passwordHash: hashPassword(OWNER_PASSWORD),
        discordId: OWNER_ID || null,
        role: "owner",
        createdAt: now()
    });
}

/* =========================================================
   DISCORD CACHE
========================================================= */

let guildCache = null;
let guildCacheAt = 0;
let guildFetchPromise = null;

let memberSnapshot = null;
let memberSnapshotAt = 0;
let memberFetchPromise = null;

const GUILD_CACHE_TTL = 15000;
const MEMBER_CACHE_TTL = 45000;

const activity = new Map();
const voiceSessions = new Map();
const sendHits = new Map();

const leadershipRoleIds = [
    "1530712642384040027",
    "1521187079336362024",
    "1531109479264026706",
    "1548732297669255259",
    "1548732341185155103",
    "1548732606508703744"
];

const leadershipRoleSet =
    new Set(leadershipRoleIds);

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

function getStats(id) {
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

    if (guildFetchPromise) {
        return guildFetchPromise;
    }

    guildFetchPromise = discord.guilds
        .fetch(DISCORD_GUILD_ID)
        .then(guild => {
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

async function fetchMembers(guild) {
    const fresh =
        memberSnapshot &&
        Date.now() - memberSnapshotAt < MEMBER_CACHE_TTL;

    if (fresh) {
        return memberSnapshot;
    }

    if (memberFetchPromise) {
        return memberFetchPromise;
    }

    memberFetchPromise = guild.members
        .fetch()
        .then(collection => {
            memberSnapshot = [
                ...collection.values()
            ];

            memberSnapshotAt = Date.now();

            return memberSnapshot;
        })
        .catch(error => {
            if (memberSnapshot?.length) {
                return memberSnapshot;
            }

            throw error;
        })
        .finally(() => {
            memberFetchPromise = null;
        });

    return memberFetchPromise;
}

function importantPermissions(permissionCollection) {
    return permissionCollection
        .toArray()
        .filter(permission =>
            importantPermissionNames.has(permission)
        );
}

function roleObject(role, membersCount = role.members?.size || 0) {
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

function memberObject(member) {
    const roles = member.roles.cache
        .filter(role =>
            role.id !== member.guild.id
        )
        .sort((a, b) =>
            b.position - a.position
        )
        .map(role => roleObject(role));

    const importantRoles =
        roles.filter(role =>
            leadershipRoleSet.has(role.id)
        );

    const permissions = [];

    for (const permission of importantPermissionNames) {
        try {
            if (
                member.permissions.has(permission)
            ) {
                permissions.push(permission);
            }
        } catch {}
    }

    let rank = "عضو";

    if (
        member.permissions.has(
            "Administrator"
        )
    ) {
        rank = "إدارة";
    } else if (importantRoles.length) {
        rank = importantRoles[0].name;
    }

    return {
        id: member.id,
        name:
            member.displayName ||
            member.user.username,
        username: member.user.username,
        globalName: member.user.globalName,
        avatar: member.user.displayAvatarURL({
            size: 256,
            extension: "png"
        }),
        bot: member.user.bot,
        joinedAt: member.joinedAt,
        rank,
        roles,
        importantRoles,
        permissions,
        stats: getStats(member.id)
    };
}

function sortedMemberObjects(members) {
    return [...members]
        .sort((a, b) => {
            const aRole = a.roles.cache
                .filter(role =>
                    leadershipRoleSet.has(role.id)
                )
                .sort((x, y) =>
                    y.position - x.position
                )
                .first();

            const bRole = b.roles.cache
                .filter(role =>
                    leadershipRoleSet.has(role.id)
                )
                .sort((x, y) =>
                    y.position - x.position
                )
                .first();

            return (
                (bRole?.position || 0) -
                (aRole?.position || 0)
            );
        })
        .map(memberObject);
}

/* =========================================================
   DISCORD NOTIFICATIONS
========================================================= */

async function getNotificationChannel() {
    const guild = await getGuild();

    if (DISCORD_NOTIFICATION_CHANNEL_ID) {
        const configured =
            guild.channels.cache.get(
                DISCORD_NOTIFICATION_CHANNEL_ID
            );

        if (
            configured &&
            configured.type === ChannelType.GuildText
        ) {
            return configured;
        }
    }

    return guild.channels.cache.find(channel => {
        if (
            channel.type !==
            ChannelType.GuildText
        ) {
            return false;
        }

        const name =
            String(channel.name || "")
                .toLowerCase();

        return (
            name.includes("website") ||
            name.includes("site") ||
            name.includes("admin") ||
            name.includes("طلبات") ||
            name.includes("الموقع")
        );
    }) || null;
}

async function notifyDiscordWebsite({
    title,
    description,
    color = "#ff9cdc",
    fields = []
}) {
    try {
        const channel =
            await getNotificationChannel();

        if (!channel) {
            console.warn(
                "No Discord notification channel found."
            );
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

        await channel.send({
            embeds: [embed]
        });

        return true;
    } catch (error) {
        console.error(
            "Discord notification error:",
            error.message
        );

        return false;
    }
}

/* =========================================================
   DISCORD GROUP SYSTEM
========================================================= */

async function setupDiscordGroup(group) {
    const guild = await getGuild();

    let role = null;

    role = await guild.roles.create({
        name: `مجموعة · ${group.name}`.slice(0, 100),
        reason: `Website group #${group.id}`
    });

    const category = await guild.channels.create({
        name: `مجموعة · ${group.name}`.slice(0, 100),
        type: ChannelType.GuildCategory,
        reason: `Website group #${group.id}`
    });

    const textChannel = await guild.channels.create({
        name: "الدردشة",
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Website group #${group.id}`
    });

    const voiceChannel = await guild.channels.create({
        name: "الصوت",
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: `Website group #${group.id}`
    });

    group.discordRoleId = role.id;
    group.discordCategoryId = category.id;
    group.discordTextChannelId = textChannel.id;
    group.discordVoiceChannelId = voiceChannel.id;

    return {
        role,
        category,
        textChannel,
        voiceChannel
    };
}

async function syncGroupMemberToDiscord(
    group,
    user
) {
    if (!group?.discordRoleId || !user?.discordId) {
        return false;
    }

    try {
        const guild = await getGuild();

        const member =
            await guild.members
                .fetch(user.discordId)
                .catch(() => null);

        if (!member) {
            return false;
        }

        const role =
            guild.roles.cache.get(
                group.discordRoleId
            );

        if (!role) {
            return false;
        }

        await member.roles.add(
            role,
            `Website group: ${group.name}`
        );

        return true;
    } catch (error) {
        console.error(
            "Group Discord sync:",
            error.message
        );

        return false;
    }
}
/* =========================================================
   AUTH
========================================================= */

app.get("/api/auth/me", (req, res) => {
    const user = currentUser(req);

    res.json({
        authenticated: Boolean(user),
        user: publicUser(user)
    });
});

app.post("/api/auth/register", async (req, res) => {
    const username = clean(req.body?.username, 32);
    const password = String(req.body?.password || "");
    const displayName =
        clean(req.body?.displayName, 60) ||
        username;

    if (!username || username.length < 3) {
        return res.status(400).json({
            error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
        });
    }

    if (!/^[\p{L}\p{N}_.-]+$/u.test(username)) {
        return res.status(400).json({
            error: "اسم المستخدم يحتوي على رموز غير مسموحة"
        });
    }

    const exists = db.users.some(
        user =>
            user.username.toLowerCase() ===
            username.toLowerCase()
    );

    if (exists) {
        return res.status(409).json({
            error: "اسم المستخدم مستخدم بالفعل"
        });
    }

    const user = {
        id: ids.user++,
        username,
        displayName,
        passwordHash: hashPassword(password),
        discordId:
            clean(req.body?.discordId, 30) ||
            null,
        role: "user",
        createdAt: now()
    };

    db.users.push(user);

    req.session.userId = user.id;

    res.status(201).json({
        ok: true,
        user: publicUser(user)
    });
});

app.post("/api/auth/login", (req, res) => {
    const username = clean(
        req.body?.username,
        32
    );

    const password =
        String(req.body?.password || "");

    const user = db.users.find(
        item =>
            item.username.toLowerCase() ===
            username.toLowerCase()
    );

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

    res.json({
        ok: true,
        user: publicUser(user)
    });
});

app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            ok: true
        });
    });
});

app.patch(
    "/api/auth/profile",
    requireAuth,
    (req, res) => {
        const displayName =
            clean(req.body?.displayName, 60);

        const discordId =
            clean(req.body?.discordId, 30);

        if (displayName) {
            req.user.displayName =
                displayName;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                req.body || {},
                "discordId"
            )
        ) {
            req.user.discordId =
                discordId || null;
        }

        res.json({
            ok: true,
            user: publicUser(req.user)
        });
    }
);

app.post(
    "/api/auth/password",
    requireAuth,
    (req, res) => {
        const currentPassword =
            String(
                req.body?.currentPassword || ""
            );

        const newPassword =
            String(
                req.body?.newPassword || ""
            );

        if (
            !comparePassword(
                currentPassword,
                req.user.passwordHash
            )
        ) {
            return res.status(400).json({
                error: "كلمة المرور الحالية غير صحيحة"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                error:
                    "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"
            });
        }

        req.user.passwordHash =
            hashPassword(newPassword);

        res.json({
            ok: true
        });
    }
);

/* =========================================================
   PUBLIC DISCORD
========================================================= */

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
                memberCount:
                    guild.memberCount,
                ownerName:
                    process.env.SERVER_FOUNDER_NAME ||
                    "فهد المطيري",
                invite:
                    process.env.DISCORD_INVITE_URL ||
                    ""
            });
        } catch (error) {
            console.error(
                "Server endpoint:",
                error
            );

            res.status(503).json({
                error:
                    "Discord server unavailable"
            });
        }
    }
);

app.get(
    "/api/public/members",
    async (req, res) => {
        try {
            const guild =
                await getGuild();

            const allMembers =
                await fetchMembers(guild);

            const query =
                String(req.query.q || "")
                    .trim()
                    .toLocaleLowerCase("ar");

            const cleanQuery =
                query.replace(/^@/, "");

            const filtered =
                cleanQuery
                    ? allMembers.filter(
                          member => {
                              const searchable = [
                                  member.displayName,
                                  member.user.username,
                                  member.user.globalName,
                                  member.user.tag,
                                  member.id
                              ]
                                  .filter(Boolean)
                                  .join(" ")
                                  .toLocaleLowerCase(
                                      "ar"
                                  );

                              return searchable.includes(
                                  cleanQuery
                              );
                          }
                      )
                    : allMembers;

            res.json({
                members:
                    sortedMemberObjects(
                        filtered
                    ),
                total:
                    filtered.length,
                totalServerMembers:
                    allMembers.length,
                updatedAt:
                    memberSnapshotAt,
                cached:
                    Boolean(memberSnapshot)
            });
        } catch (error) {
            console.error(
                "Members endpoint:",
                error
            );

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
            const guild =
                await getGuild();

            const allMembers =
                await fetchMembers(guild);

            const roles =
                leadershipRoleIds
                    .map(id =>
                        guild.roles.cache.get(
                            id
                        )
                    )
                    .filter(Boolean)
                    .map(role => {
                        const count =
                            allMembers.reduce(
                                (
                                    total,
                                    member
                                ) =>
                                    total +
                                    (
                                        member.roles.cache.has(
                                            role.id
                                        )
                                            ? 1
                                            : 0
                                    ),
                                0
                            );

                        return roleObject(
                            role,
                            count
                        );
                    });

            res.json({
                roles,
                updatedAt:
                    memberSnapshotAt
            });
        } catch (error) {
            console.error(
                "Roles endpoint:",
                error
            );

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
            const guild =
                await getGuild();

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
                (
                    await fetchMembers(guild)
                ).filter(member =>
                    member.roles.cache.has(
                        role.id
                    )
                );

            res.json({
                role: roleObject(
                    role,
                    roleMembers.length
                ),
                members:
                    sortedMemberObjects(
                        roleMembers
                    ),
                updatedAt:
                    memberSnapshotAt
            });
        } catch (error) {
            console.error(
                "Role members endpoint:",
                error
            );

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
                    await fetchMembers(
                        await getGuild()
                    )
                ).map(memberObject);

            const top = key =>
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
            console.error(
                "Top endpoint:",
                error
            );

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
            const guild =
                await getGuild();

            const member =
                await guild.members
                    .fetch(req.params.id)
                    .catch(() => null);

            if (!member) {
                return res.status(404).json({
                    error:
                        "Member not found"
                });
            }

            const highest =
                member.roles.cache
                    .filter(
                        role =>
                            role.id !==
                                guild.id &&
                            !role.managed
                    )
                    .sort(
                        (a, b) =>
                            b.position -
                            a.position
                    )
                    .first();

            res.json({
                ...memberObject(member),

                highestRole:
                    highest
                        ? roleObject(highest)
                        : null,

                permissions:
                    highest
                        ? importantPermissions(
                              highest.permissions
                          )
                        : [],

                upcomingRoles:
                    guild.roles.cache
                        .filter(
                            role =>
                                role.position >
                                    (
                                        highest?.position ||
                                        0
                                    ) &&
                                !role.managed
                        )
                        .sort(
                            (a, b) =>
                                a.position -
                                b.position
                        )
                        .first(8)
                        .map(role =>
                            roleObject(role)
                        )
            });
        } catch (error) {
            console.error(
                "Member endpoint:",
                error
            );

            res.status(404).json({
                error:
                    "Member not found"
            });
        }
    }
);

/* =========================================================
   PRIVATE DISCORD MESSAGE
========================================================= */

app.post(
    "/api/public/message",
    async (req, res) => {
        const nowTime =
            Date.now();

        const ip =
            req.ip || "unknown";

        const last =
            sendHits.get(ip) || 0;

        if (
            nowTime - last <
            10_000
        ) {
            return res.status(429).json({
                error:
                    "انتظر 10 ثواني قبل الإرسال مرة أخرى"
            });
        }

        const title =
            String(
                req.body?.title ||
                    "رسالة من إدارة MLD"
            ).trim();

        const text =
            String(
                req.body?.message || ""
            ).trim();

        const targetId =
            String(
                req.body?.memberId || ""
            ).trim();

        if (
            !targetId ||
            !text ||
            text.length > 2000 ||
            title.length > 120
        ) {
            return res.status(400).json({
                error:
                    "بيانات الرسالة غير صحيحة"
            });
        }

        try {
            const member =
                await (
                    await getGuild()
                ).members
                    .fetch(targetId)
                    .catch(() => null);

            if (!member) {
                return res.status(404).json({
                    error:
                        "العضو غير موجود"
                });
            }

            const embed =
                new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(text)
                    .setColor("#ff9cdc")
                    .setFooter({
                        text:
                            "MLD Community"
                    })
                    .setTimestamp();

            await member.send({
                embeds: [embed]
            });

            sendHits.set(
                ip,
                nowTime
            );

            res.json({
                ok: true
            });
        } catch (error) {
            console.error(
                "DM endpoint:",
                error
            );

            res.status(500).json({
                error:
                    "تعذر الإرسال؛ قد يكون الخاص مقفلًا"
            });
        }
    }
);

/* =========================================================
   GROUPS
========================================================= */

app.get(
    "/api/groups",
    (req, res) => {
        const groups =
            db.groups
                .filter(
                    group =>
                        group.status ===
                        "approved"
                )
                .map(groupView);

        res.json({
            groups
        });
    }
);

app.get(
    "/api/groups/:id",
    (req, res) => {
        const group =
            findGroup(req.params.id);

        if (
            !group ||
            group.status !==
                "approved"
        ) {
            return res.status(404).json({
                error:
                    "المجموعة غير موجودة"
            });
        }

        res.json({
            group:
                groupView(group)
        });
    }
);

app.post(
    "/api/groups",
    requireAuth,
    async (req, res) => {
        const name =
            clean(req.body?.name, 80);

        const description =
            clean(
                req.body?.description,
                1000
            );

        if (
            !name ||
            name.length < 2
        ) {
            return res.status(400).json({
                error:
                    "اسم المجموعة مطلوب"
            });
        }

        const duplicate =
            db.groups.some(
                group =>
                    group.name
                        .toLowerCase() ===
                    name.toLowerCase() &&
                    group.status !==
                        "rejected"
            );

        if (duplicate) {
            return res.status(409).json({
                error:
                    "يوجد مجموعة بهذا الاسم"
            });
        }

        const group = {
            id: ids.group++,
            name,
            slug: makeSlug(name),
            description,
            ownerId:
                req.user.id,
            status: "pending",
            discordRoleId: null,
            discordCategoryId: null,
            discordTextChannelId: null,
            discordVoiceChannelId: null,
            createdAt: now(),
            reviewedAt: null,
            reviewedBy: null
        };

        db.groups.push(group);

        await notifyDiscordWebsite({
            title:
                "طلب إنشاء مجموعة جديدة",
            description:
                `تم إرسال طلب إنشاء مجموعة جديدة من الموقع.`,
            color:
                "#f59e0b",
            fields: [
                {
                    name: "المجموعة",
                    value:
                        group.name
                },
                {
                    name: "المالك",
                    value:
                        req.user.username
                },
                {
                    name: "الحالة",
                    value:
                        "بانتظار موافقة الإدارة"
                }
            ]
        });

        res.status(201).json({
            ok: true,
            group:
                groupView(group)
        });
    }
);

app.get(
    "/api/admin/groups/pending",
    requireAdmin,
    (req, res) => {
        res.json({
            groups:
                db.groups
                    .filter(
                        group =>
                            group.status ===
                            "pending"
                    )
                    .map(groupView)
        });
    }
);

app.patch(
    "/api/admin/groups/:id/review",
    requireAdmin,
    async (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                error:
                    "المجموعة غير موجودة"
            });
        }

        if (
            group.status !==
            "pending"
        ) {
            return res.status(400).json({
                error:
                    "تمت مراجعة المجموعة مسبقًا"
            });
        }

        const decision =
            String(
                req.body?.decision || ""
            ).toLowerCase();

        if (
            decision !== "approve" &&
            decision !== "reject"
        ) {
            return res.status(400).json({
                error:
                    "قرار المراجعة غير صحيح"
            });
        }

        group.reviewedAt =
            now();

        group.reviewedBy =
            req.user.id;

        if (
            decision === "reject"
        ) {
            group.status =
                "rejected";

            await notifyDiscordWebsite({
                title:
                    "رفض إنشاء مجموعة",
                description:
                    `تم رفض طلب المجموعة "${group.name}".`,
                color:
                    "#ef4444",
                fields: [
                    {
                        name:
                            "المالك",
                        value:
                            findUser(
                                group.ownerId
                            )?.username ||
                            "unknown"
                    },
                    {
                        name:
                            "المراجع",
                        value:
                            req.user.username
                    }
                ]
            });

            return res.json({
                ok: true,
                group:
                    groupView(group)
            });
        }

        try {
            await setupDiscordGroup(
                group
            );

            group.status =
                "approved";

            const owner =
                findUser(
                    group.ownerId
                );

            await syncGroupMemberToDiscord(
                group,
                owner
            );

            await notifyDiscordWebsite({
                title:
                    "تمت الموافقة على المجموعة",
                description:
                    `تم اعتماد مجموعة "${group.name}" وإنشاء مساحتها في Discord.`,
                color:
                    "#22c55e",
                fields: [
                    {
                        name:
                            "المالك",
                        value:
                            owner?.username ||
                            "unknown"
                    }
                ]
            });

            return res.json({
                ok: true,
                group:
                    groupView(group)
            });
        } catch (error) {
            console.error(
                "Group approval:",
                error
            );

            group.status =
                "pending";

            return res.status(500).json({
                error:
                    "تعذر إنشاء مساحة المجموعة في Discord"
            });
        }
    }
);

/* =========================================================
   GROUP JOIN REQUESTS
========================================================= */

app.post(
    "/api/groups/:id/join",
    requireAuth,
    async (req, res) => {
        const group =
            findGroup(req.params.id);

        if (
            !group ||
            group.status !==
                "approved"
        ) {
            return res.status(404).json({
                error:
                    "المجموعة غير موجودة"
            });
        }

        if (
            isGroupOwner(
                group,
                req.user.id
            )
        ) {
            return res.status(400).json({
                error:
                    "أنت مالك المجموعة بالفعل"
            });
        }

        if (
            isGroupMember(
                group.id,
                req.user.id
            )
        ) {
            return res.status(400).json({
                error:
                    "أنت عضو بالفعل"
            });
        }

        const pending =
            db.groupJoinRequests.find(
                request =>
                    Number(
                        request.groupId
                    ) ===
                        Number(group.id) &&
                    Number(
                        request.userId
                    ) ===
                        Number(
                            req.user.id
                        ) &&
                    request.status ===
                        "pending"
            );

        if (pending) {
            return res.status(409).json({
                error:
                    "لديك طلب انضمام قيد المراجعة"
            });
        }

        const request = {
            id:
                ids.groupJoinRequest++,
            groupId:
                group.id,
            userId:
                req.user.id,
            status:
                "pending",
            createdAt:
                now(),
            reviewedAt:
                null,
            reviewedBy:
                null
        };

        db.groupJoinRequests.push(
            request
        );

        const owner =
            findUser(group.ownerId);

        await notifyDiscordWebsite({
            title:
                "طلب انضمام إلى مجموعة",
            description:
                `يوجد طلب جديد للانضمام إلى مجموعة "${group.name}".`,
            color:
                "#3b82f6",
            fields: [
                {
                    name:
                        "المتقدم",
                    value:
                        req.user.username
                },
                {
                    name:
                        "مالك المجموعة",
                    value:
                        owner?.username ||
                        "unknown"
                }
            ]
        });

        res.status(201).json({
            ok: true,
            request
        });
    }
);

app.get(
    "/api/groups/:id/join-requests",
    requireAuth,
    (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                error:
                    "المجموعة غير موجودة"
            });
        }

        if (
            !isGroupOwner(
                group,
                req.user.id
            ) &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error:
                    "ليس لديك صلاحية"
            });
        }

        const requests =
            db.groupJoinRequests
                .filter(
                    request =>
                        Number(
                            request.groupId
                        ) ===
                        Number(group.id)
                )
                .map(request => ({
                    ...request,
                    user:
                        publicUser(
                            findUser(
                                request.userId
                            )
                        )
                }));

        res.json({
            requests
        });
    }
);

app.post(
    "/api/groups/:id/join-requests/:requestId/review",
    requireAuth,
    async (req, res) => {
        const group =
            findGroup(req.params.id);

        if (!group) {
            return res.status(404).json({
                error:
                    "المجموعة غير موجودة"
            });
        }

        if (
            !isGroupOwner(
                group,
                req.user.id
            ) &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error:
                    "ليس لديك صلاحية"
            });
        }

        const request =
            db.groupJoinRequests.find(
                item =>
                    Number(item.id) ===
                    Number(
                        req.params.requestId
                    ) &&
                    Number(
                        item.groupId
                    ) ===
                    Number(group.id)
            );

        if (!request) {
            return res.status(404).json({
                error:
                    "طلب الانضمام غير موجود"
            });
        }

        if (
            request.status !==
            "pending"
        ) {
            return res.status(400).json({
                error:
                    "تمت مراجعة الطلب مسبقًا"
            });
        }

        const decision =
            String(
                req.body?.decision || ""
            ).toLowerCase();

        if (
            decision !== "approve" &&
            decision !== "reject"
        ) {
            return res.status(400).json({
                error:
                    "قرار المراجعة غير صحيح"
            });
        }

        request.status =
            decision === "approve"
                ? "approved"
                : "rejected";

        request.reviewedAt =
            now();

        request.reviewedBy =
            req.user.id;

        const target =
            findUser(
                request.userId
            );

        if (
            decision ===
                "approve"
        ) {
            const exists =
                db.groupMembers.find(
                    member =>
                        Number(
                            member.groupId
                        ) ===
                            Number(
                                group.id
                            ) &&
                        Number(
                            member.userId
                        ) ===
                            Number(
                                target.id
                            )
                );

            if (!exists) {
                db.groupMembers.push({
                    id:
                        ids.groupMember++,
                    groupId:
                        group.id,
                    userId:
                        target.id,
                    status:
                        "approved",
                    createdAt:
                        now()
                });
            } else {
                exists.status =
                    "approved";
            }

            await syncGroupMemberToDiscord(
                group,
                target
            );
        }

        await notifyDiscordWebsite({
            title:
                decision ===
                "approve"
                    ? "تم قبول عضو في المجموعة"
                    : "تم رفض طلب الانضمام",
            description:
                `تمت مراجعة طلب "${target?.username || "unknown"}" في مجموعة "${group.name}".`,
            color:
                decision ===
                "approve"
                    ? "#22c55e"
                    : "#ef4444",
            fields: [
                {
                    name:
                        "المراجع",
                    value:
                        req.user.username
                }
            ]
        });

        if (
            target?.discordId
        ) {
            try {
                const guild =
                    await getGuild();

                const member =
                    await guild.members
                        .fetch(
                            target.discordId
                        )
                        .catch(
                            () => null
                        );

                if (member) {
                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                decision ===
                                    "approve"
                                    ? "تم قبول طلبك"
                                    : "تم رفض طلبك"
                            )
                            .setDescription(
                                decision ===
                                    "approve"
                                    ? `تم قبولك في مجموعة "${group.name}".`
                                    : `تم رفض طلب انضمامك إلى مجموعة "${group.name}".`
                            )
                            .setColor(
                                decision ===
                                    "approve"
                                    ? "#22c55e"
                                    : "#ef4444"
                            )
                            .setTimestamp();

                    await member.send({
                        embeds: [
                            embed
                        ]
                    });
                }
            } catch (error) {
                console.error(
                    "Join request DM:",
                    error.message
                );
            }
        }

        res.json({
            ok: true,
            request
        });
    }
);
// =========================
// PART 3/4
// Tickets + Applications + Watch Rooms + Reviews
// =========================

app.post("/api/tickets", requireAuth, async (req, res) => {
    const { subject, type, message, priority } = req.body || {};

    if (!subject || !message) {
        return res.status(400).json({
            error: "العنوان والرسالة مطلوبان"
        });
    }

    const ticket = {
        id: crypto.randomUUID(),
        userId: req.session.userId,
        username: req.session.username,
        subject: String(subject).trim(),
        type: String(type || "عام").trim(),
        priority: String(priority || "normal"),
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    db.tickets.push(ticket);

    const firstMessage = {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        userId: req.session.userId,
        username: req.session.username,
        message: String(message).trim(),
        createdAt: new Date().toISOString()
    };

    db.ticketMessages.push(firstMessage);

    await notifyDiscordWebsite(
        "تذكرة جديدة",
        [
            `**رقم التذكرة:** \`${ticket.id}\``,
            `**المستخدم:** ${ticket.username}`,
            `**النوع:** ${ticket.type}`,
            `**الأولوية:** ${ticket.priority}`,
            `**الموضوع:** ${ticket.subject}`,
            `**الرسالة:** ${firstMessage.message}`
        ].join("\n")
    );

    res.json({
        ok: true,
        ticket
    });
});

app.get("/api/tickets", requireAuth, (req, res) => {
    const isAdminUser = isAdmin(req);

    const tickets = db.tickets
        .filter(ticket => {
            if (isAdminUser) return true;
            return ticket.userId === req.session.userId;
        })
        .sort((a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );

    res.json({
        tickets
    });
});

app.get("/api/tickets/:id", requireAuth, (req, res) => {
    const ticket = db.tickets.find(
        item => item.id === req.params.id
    );

    if (!ticket) {
        return res.status(404).json({
            error: "التذكرة غير موجودة"
        });
    }

    if (
        !isAdmin(req) &&
        ticket.userId !== req.session.userId
    ) {
        return res.status(403).json({
            error: "غير مصرح لك"
        });
    }

    const messages = db.ticketMessages
        .filter(message => message.ticketId === ticket.id)
        .sort((a, b) =>
            new Date(a.createdAt) - new Date(b.createdAt)
        );

    res.json({
        ticket,
        messages
    });
});

app.post("/api/tickets/:id/messages", requireAuth, async (req, res) => {
    const { message } = req.body || {};

    if (!message || !String(message).trim()) {
        return res.status(400).json({
            error: "الرسالة مطلوبة"
        });
    }

    const ticket = db.tickets.find(
        item => item.id === req.params.id
    );

    if (!ticket) {
        return res.status(404).json({
            error: "التذكرة غير موجودة"
        });
    }

    if (
        !isAdmin(req) &&
        ticket.userId !== req.session.userId
    ) {
        return res.status(403).json({
            error: "غير مصرح لك"
        });
    }

    if (ticket.status === "closed") {
        return res.status(400).json({
            error: "التذكرة مغلقة"
        });
    }

    const item = {
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        userId: req.session.userId,
        username: req.session.username,
        message: String(message).trim(),
        createdAt: new Date().toISOString()
    };

    db.ticketMessages.push(item);

    ticket.updatedAt = new Date().toISOString();

    if (isAdmin(req)) {
        await notifyDiscordWebsite(
            "رد إداري على تذكرة",
            [
                `**التذكرة:** \`${ticket.id}\``,
                `**المستخدم:** ${ticket.username}`,
                `**الموظف:** ${req.session.username}`,
                `**الرد:** ${item.message}`
            ].join("\n")
        );
    }

    res.json({
        ok: true,
        message: item
    });
});

app.patch("/api/admin/tickets/:id", requireAdmin, async (req, res) => {
    const ticket = db.tickets.find(
        item => item.id === req.params.id
    );

    if (!ticket) {
        return res.status(404).json({
            error: "التذكرة غير موجودة"
        });
    }

    const allowedStatuses = [
        "open",
        "pending",
        "closed",
        "rejected"
    ];

    if (
        req.body?.status &&
        allowedStatuses.includes(req.body.status)
    ) {
        ticket.status = req.body.status;
    }

    if (req.body?.priority) {
        ticket.priority = String(req.body.priority);
    }

    ticket.updatedAt = new Date().toISOString();

    db.logs.push({
        id: crypto.randomUUID(),
        type: "ticket_update",
        admin: req.session.username,
        target: ticket.id,
        createdAt: new Date().toISOString()
    });

    res.json({
        ok: true,
        ticket
    });
});


// =========================
// APPLICATIONS
// =========================

app.post("/api/applications", requireAuth, async (req, res) => {
    const {
        type,
        answers,
        note
    } = req.body || {};

    if (!type) {
        return res.status(400).json({
            error: "نوع الطلب مطلوب"
        });
    }

    const application = {
        id: crypto.randomUUID(),
        userId: req.session.userId,
        username: req.session.username,
        type: String(type).trim(),
        answers: answers || {},
        note: String(note || "").trim(),
        status: "pending",
        reviewer: null,
        reviewNote: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    db.applications.push(application);

    await notifyDiscordWebsite(
        "طلب تقديم جديد",
        [
            `**رقم الطلب:** \`${application.id}\``,
            `**المستخدم:** ${application.username}`,
            `**النوع:** ${application.type}`,
            `**الحالة:** انتظار المراجعة`,
            `**الملاحظات:** ${application.note || "لا يوجد"}`
        ].join("\n")
    );

    res.json({
        ok: true,
        application
    });
});

app.get("/api/applications", requireAuth, (req, res) => {
    const applications = db.applications
        .filter(application => {
            if (isAdmin(req)) return true;
            return application.userId === req.session.userId;
        })
        .sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

    res.json({
        applications
    });
});

app.get("/api/applications/:id", requireAuth, (req, res) => {
    const application = db.applications.find(
        item => item.id === req.params.id
    );

    if (!application) {
        return res.status(404).json({
            error: "الطلب غير موجود"
        });
    }

    if (
        !isAdmin(req) &&
        application.userId !== req.session.userId
    ) {
        return res.status(403).json({
            error: "غير مصرح لك"
        });
    }

    res.json({
        application
    });
});

app.patch(
    "/api/admin/applications/:id/review",
    requireAdmin,
    async (req, res) => {
        const application = db.applications.find(
            item => item.id === req.params.id
        );

        if (!application) {
            return res.status(404).json({
                error: "الطلب غير موجود"
            });
        }

        const status = String(req.body?.status || "");

        if (
            !["approved", "rejected", "pending"].includes(status)
        ) {
            return res.status(400).json({
                error: "حالة غير صحيحة"
            });
        }

        application.status = status;
        application.reviewer = req.session.username;
        application.reviewNote =
            String(req.body?.reviewNote || "").trim();
        application.updatedAt = new Date().toISOString();

        db.logs.push({
            id: crypto.randomUUID(),
            type: "application_review",
            admin: req.session.username,
            target: application.id,
            status,
            createdAt: new Date().toISOString()
        });

        await notifyDiscordWebsite(
            status === "approved"
                ? "تم قبول طلب"
                : status === "rejected"
                    ? "تم رفض طلب"
                    : "تم تحديث طلب",
            [
                `**رقم الطلب:** \`${application.id}\``,
                `**المستخدم:** ${application.username}`,
                `**المراجع:** ${req.session.username}`,
                `**الحالة:** ${status}`,
                `**الملاحظة:** ${application.reviewNote || "لا يوجد"}`
            ].join("\n")
        );

        res.json({
            ok: true,
            application
        });
    }
);


// =========================
// WATCH ROOMS
// =========================

app.post("/api/watch-rooms", requireAuth, (req, res) => {
    const {
        title,
        mediaUrl,
        mediaType,
        description
    } = req.body || {};

    if (!title || !mediaUrl) {
        return res.status(400).json({
            error: "العنوان والرابط مطلوبان"
        });
    }

    const room = {
        id: crypto.randomUUID(),
        ownerId: req.session.userId,
        ownerUsername: req.session.username,
        title: String(title).trim(),
        mediaUrl: String(mediaUrl).trim(),
        mediaType: String(mediaType || "video"),
        description: String(description || "").trim(),
        status: "waiting",
        currentTime: 0,
        playing: false,
        members: [
            {
                userId: req.session.userId,
                username: req.session.username,
                joinedAt: new Date().toISOString()
            }
        ],
        createdAt: new Date().toISOString()
    };

    db.watchRooms.push(room);

    io.emit("watch:created", {
        room
    });

    res.json({
        ok: true,
        room
    });
});

app.get("/api/watch-rooms", (req, res) => {
    const rooms = db.watchRooms
        .filter(room => room.status !== "closed")
        .sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );

    res.json({
        rooms
    });
});

app.get("/api/watch-rooms/:id", (req, res) => {
    const room = db.watchRooms.find(
        item => item.id === req.params.id
    );

    if (!room) {
        return res.status(404).json({
            error: "الغرفة غير موجودة"
        });
    }

    res.json({
        room
    });
});

app.post("/api/watch-rooms/:id/join", requireAuth, (req, res) => {
    const room = db.watchRooms.find(
        item => item.id === req.params.id
    );

    if (!room) {
        return res.status(404).json({
            error: "الغرفة غير موجودة"
        });
    }

    const exists = room.members.some(
        member => member.userId === req.session.userId
    );

    if (!exists) {
        room.members.push({
            userId: req.session.userId,
            username: req.session.username,
            joinedAt: new Date().toISOString()
        });
    }

    io.to(`watch:${room.id}`).emit(
        "watch:members",
        room.members
    );

    res.json({
        ok: true,
        room
    });
});

app.patch("/api/watch-rooms/:id/state", requireAuth, (req, res) => {
    const room = db.watchRooms.find(
        item => item.id === req.params.id
    );

    if (!room) {
        return res.status(404).json({
            error: "الغرفة غير موجودة"
        });
    }

    if (room.ownerId !== req.session.userId) {
        return res.status(403).json({
            error: "مالك الغرفة فقط يستطيع التحكم"
        });
    }

    if (typeof req.body?.currentTime === "number") {
        room.currentTime = Math.max(
            0,
            req.body.currentTime
        );
    }

    if (typeof req.body?.playing === "boolean") {
        room.playing = req.body.playing;
    }

    io.to(`watch:${room.id}`).emit(
        "watch:state",
        {
            currentTime: room.currentTime,
            playing: room.playing
        }
    );

    res.json({
        ok: true,
        room
    });
});

app.post("/api/watch-rooms/:id/close", requireAuth, (req, res) => {
    const room = db.watchRooms.find(
        item => item.id === req.params.id
    );

    if (!room) {
        return res.status(404).json({
            error: "الغرفة غير موجودة"
        });
    }

    if (room.ownerId !== req.session.userId && !isAdmin(req)) {
        return res.status(403).json({
            error: "غير مصرح لك"
        });
    }

    room.status = "closed";

    io.to(`watch:${room.id}`).emit(
        "watch:closed"
    );

    res.json({
        ok: true
    });
});


// =========================
// REVIEWS
// =========================

app.get("/api/reviews", (req, res) => {
    const targetType = req.query.type
        ? String(req.query.type)
        : null;

    const targetId = req.query.targetId
        ? String(req.query.targetId)
        : null;

    let reviews = db.reviews.filter(review => {
        if (review.status !== "approved") return false;

        if (
            targetType &&
            review.targetType !== targetType
        ) {
            return false;
        }

        if (
            targetId &&
            review.targetId !== targetId
        ) {
            return false;
        }

        return true;
    });

    reviews = reviews.sort(
        (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
    );

    res.json({
        reviews
    });
});

app.post("/api/reviews", requireAuth, (req, res) => {
    const {
        targetType,
        targetId,
        targetName,
        rating,
        comment
    } = req.body || {};

    const numericRating = Number(rating);

    if (!targetType || !targetId) {
        return res.status(400).json({
            error: "العنصر المطلوب تقييمه غير محدد"
        });
    }

    if (
        !Number.isInteger(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
    ) {
        return res.status(400).json({
            error: "التقييم يجب أن يكون من 1 إلى 5"
        });
    }

    if (!comment || !String(comment).trim()) {
        return res.status(400).json({
            error: "التعليق مطلوب"
        });
    }

    const existing = db.reviews.find(
        review =>
            review.userId === req.session.userId &&
            review.targetType === String(targetType) &&
            review.targetId === String(targetId)
    );

    if (existing) {
        return res.status(409).json({
            error: "لديك تقييم سابق لهذا العنصر"
        });
    }

    const review = {
        id: crypto.randomUUID(),
        userId: req.session.userId,
        username: req.session.username,
        targetType: String(targetType),
        targetId: String(targetId),
        targetName: String(targetName || targetId),
        rating: numericRating,
        comment: String(comment).trim(),
        status: "pending",
        createdAt: new Date().toISOString()
    };

    db.reviews.push(review);

    res.json({
        ok: true,
        review
    });
});

app.get("/api/admin/reviews", requireAdmin, (req, res) => {
    const reviews = db.reviews
        .slice()
        .sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        );

    res.json({
        reviews
    });
});

app.patch(
    "/api/admin/reviews/:id",
    requireAdmin,
    (req, res) => {
        const review = db.reviews.find(
            item => item.id === req.params.id
        );

        if (!review) {
            return res.status(404).json({
                error: "التقييم غير موجود"
            });
        }

        const status = String(req.body?.status || "");

        if (
            !["approved", "rejected", "pending"].includes(status)
        ) {
            return res.status(400).json({
                error: "حالة غير صحيحة"
            });
        }

        review.status = status;

        db.logs.push({
            id: crypto.randomUUID(),
            type: "review_moderation",
            admin: req.session.username,
            target: review.id,
            status,
            createdAt: new Date().toISOString()
        });

        res.json({
            ok: true,
            review
        });
    }
);


// =========================
// ADMIN DATA
// =========================

app.get("/api/admin/stats", requireAdmin, (req, res) => {
    res.json({
        users: db.users.length,
        groups: db.groups.length,
        pendingGroups: db.groups.filter(
            group => group.status === "pending"
        ).length,
        joinRequests: db.groupJoinRequests.filter(
            request => request.status === "pending"
        ).length,
        tickets: db.tickets.length,
        openTickets: db.tickets.filter(
            ticket => ticket.status === "open"
        ).length,
        applications: db.applications.length,
        pendingApplications: db.applications.filter(
            application => application.status === "pending"
        ).length,
        reviews: db.reviews.length,
        pendingReviews: db.reviews.filter(
            review => review.status === "pending"
        ).length,
        watchRooms: db.watchRooms.filter(
            room => room.status !== "closed"
        ).length,
        logs: db.logs.length
    });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
    const users = db.users.map(user => ({
        id: user.id,
        username: user.username,
        discordId: user.discordId || null,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || null
    }));

    res.json({
        users
    });
});

app.get("/api/admin/logs", requireAdmin, (req, res) => {
    const logs = db.logs
        .slice()
        .sort(
            (a, b) =>
                new Date(b.createdAt) -
                new Date(a.createdAt)
        )
        .slice(0, 500);

    res.json({
        logs
    });
});


// =========================
// DISCORD LINK
// =========================

app.post("/api/profile/discord", requireAuth, async (req, res) => {
    const { discordId } = req.body || {};

    if (!discordId) {
        return res.status(400).json({
            error: "Discord ID مطلوب"
        });
    }

    const guild = await getGuild();

    if (!guild) {
        return res.status(503).json({
            error: "السيرفر غير متاح"
        });
    }

    try {
        const member = await guild.members.fetch(
            String(discordId)
        );

        if (!member) {
            return res.status(404).json({
                error: "عضو Discord غير موجود"
            });
        }

        const user = db.users.find(
            item => item.id === req.session.userId
        );

        if (!user) {
            return res.status(404).json({
                error: "المستخدم غير موجود"
            });
        }

        user.discordId = member.id;

        res.json({
            ok: true,
            user: publicUser(user),
            discord: {
                id: member.id,
                username: member.user.username,
                displayName: member.displayName
            }
        });

    } catch (error) {
        console.error("Discord link error:", error);

        res.status(400).json({
            error: "تعذر ربط حساب Discord"
        });
    }
});


// =========================
// SOCKET.IO
// =========================

io.on("connection", socket => {
    socket.on("watch:join", data => {
        if (!data?.roomId) return;

        socket.join(`watch:${data.roomId}`);

        const room = db.watchRooms.find(
            item => item.id === data.roomId
        );

        if (room) {
            socket.emit(
                "watch:state",
                {
                    currentTime: room.currentTime,
                    playing: room.playing
                }
            );

            socket.emit(
                "watch:members",
                room.members
            );
        }
    });

    socket.on("watch:leave", data => {
        if (!data?.roomId) return;

        socket.leave(`watch:${data.roomId}`);
    });

    socket.on("watch:chat", data => {
        if (!data?.roomId || !data?.message) {
            return;
        }

        const room = db.watchRooms.find(
            item => item.id === data.roomId
        );

        if (!room) return;

        const chat = {
            id: crypto.randomUUID(),
            roomId: room.id,
            username: String(
                data.username || "زائر"
            ),
            message: String(data.message).slice(0, 500),
            createdAt: new Date().toISOString()
        };

        io.to(`watch:${room.id}`).emit(
            "watch:chat",
            chat
        );
    });
});


// =========================
// ERROR HANDLER
// =========================

app.use((error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "حدث خطأ داخلي في السيرفر"
    });
});
// =========================
// SERVER + DISCORD
// =========================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "Fahad Community Platform",
        time: new Date().toISOString()
    });
});

app.get("/api/admin/discord", requireAdmin, async (req, res) => {
    try {
        const guild = await getGuild();

        if (!guild) {
            return res.status(503).json({
                connected: false,
                error: "Discord غير متصل"
            });
        }

        res.json({
            connected: true,
            guild: {
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount,
                icon: guild.iconURL({
                    extension: "png",
                    size: 256
                })
            },
            bot: {
                id: discordClient.user?.id || null,
                username: discordClient.user?.username || null,
                tag: discordClient.user?.tag || null
            }
        });
    } catch (error) {
        console.error("Discord admin error:", error);

        res.status(500).json({
            connected: false,
            error: "تعذر قراءة بيانات Discord"
        });
    }
});


// =========================
// DEFAULT API 404
// =========================

app.use("/api", (req, res) => {
    res.status(404).json({
        error: "API endpoint غير موجود"
    });
});


// =========================
// FRONTEND
// =========================

app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});


// =========================
// DISCORD EVENTS
// =========================

discordClient.once("ready", async () => {
    console.log(
        `Discord connected as ${discordClient.user.tag}`
    );

    try {
        const guild = await discordClient.guilds.fetch(
            DISCORD_GUILD_ID
        );

        console.log(
            `Connected to guild: ${guild.name}`
        );

        await guild.members.fetch();

        console.log(
            `Cached members: ${guild.members.cache.size}`
        );
    } catch (error) {
        console.error(
            "Discord guild initialization error:",
            error
        );
    }
});

discordClient.on("guildMemberAdd", member => {
    console.log(
        `Member joined: ${member.user.tag}`
    );

    memberCache.delete(member.id);
});

discordClient.on("guildMemberRemove", member => {
    console.log(
        `Member left: ${member.user.tag}`
    );

    memberCache.delete(member.id);
});

discordClient.on("guildMemberUpdate", (oldMember, newMember) => {
    memberCache.delete(newMember.id);

    io.emit("discord:memberUpdate", {
        id: newMember.id
    });
});

discordClient.on("messageCreate", message => {
    if (!message.guild) return;
    if (message.author.bot) return;

    activityCache.set(message.author.id, {
        type: "message",
        at: Date.now()
    });

    memberCache.delete(message.author.id);

    io.emit("discord:activity", {
        type: "message",
        userId: message.author.id
    });
});

discordClient.on("voiceStateUpdate", (oldState, newState) => {
    const member =
        newState.member ||
        oldState.member;

    if (!member) return;

    activityCache.set(member.id, {
        type: newState.channelId
            ? "voice_join"
            : "voice_leave",
        at: Date.now()
    });

    memberCache.delete(member.id);

    io.emit("discord:voice", {
        userId: member.id,
        channelId: newState.channelId || null
    });
});


// =========================
// START SERVER
// =========================

const PORT = Number(
    process.env.PORT || 3000
);

server.listen(PORT, () => {
    console.log(
        `Website running on port ${PORT}`
    );
});


// =========================
// DISCORD LOGIN
// =========================

discordClient.login(
    DISCORD_BOT_TOKEN
).catch(error => {
    console.error(
        "Discord login failed:",
        error.message
    );
});


// =========================
// GRACEFUL SHUTDOWN
// =========================

async function shutdown(signal) {
    console.log(
        `${signal} received. Shutting down...`
    );

    try {
        discordClient.destroy();
    } catch (error) {
        console.error(
            "Discord shutdown error:",
            error
        );
    }

    server.close(() => {
        console.log(
            "HTTP server closed."
        );

        process.exit(0);
    });

    setTimeout(() => {
        process.exit(0);
    }, 5000);
}

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);
