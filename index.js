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

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    crypto.randomBytes(32).toString("hex");

const DISCORD_NOTIFICATION_CHANNEL_ID =
    process.env.DISCORD_NOTIFICATION_CHANNEL_ID || "";

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    console.error(
        "Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID"
    );

    process.exit(1);
}

/* =========================================================
   EXPRESS
========================================================= */

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

app.use(
    express.json({
        limit: "100kb"
    })
);

app.use(
    express.urlencoded({
        extended: true
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
                process.env.NODE_ENV ===
                "production",
            maxAge:
                1000 *
                60 *
                60 *
                24 *
                30
        }
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

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
    return bcrypt.hashSync(
        String(password),
        12
    );
}

function comparePassword(password, hash) {
    try {
        return bcrypt.compareSync(
            String(password),
            hash
        );
    } catch {
        return false;
    }
}

function publicUser(user) {
    if (!user) {
        return null;
    }

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
    if (!req.session?.userId) {
        return null;
    }

    return (
        db.users.find(
            user =>
                Number(user.id) ===
                Number(req.session.userId)
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
            Number(user.id) === 1
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
    return (
        db.users.find(
            user =>
                Number(user.id) ===
                Number(id)
        ) || null
    );
}

function findGroup(id) {
    return (
        db.groups.find(
            group =>
                Number(group.id) ===
                Number(id)
        ) || null
    );
}

function isGroupOwner(group, userId) {
    return Boolean(
        group &&
        Number(group.ownerId) ===
            Number(userId)
    );
}

function isGroupMember(groupId, userId) {
    const group = findGroup(groupId);

    if (
        !group ||
        group.status !== "approved"
    ) {
        return false;
    }

    if (
        isGroupOwner(
            group,
            userId
        )
    ) {
        return true;
    }

    return db.groupMembers.some(
        member =>
            Number(member.groupId) ===
                Number(groupId) &&
            Number(member.userId) ===
                Number(userId) &&
            member.status === "approved"
    );
}

function groupView(group) {
    if (!group) {
        return null;
    }

    const owner =
        findUser(group.ownerId);

    const members =
        db.groupMembers
            .filter(
                member =>
                    Number(member.groupId) ===
                        Number(group.id) &&
                    member.status ===
                        "approved"
            )
            .map(member => {
                const user =
                    findUser(
                        member.userId
                    );

                return {
                    id: member.id,
                    userId: member.userId,
                    username:
                        user?.username ||
                        "unknown",
                    displayName:
                        user?.displayName ||
                        user?.username ||
                        "unknown",
                    joinedAt:
                        member.createdAt
                };
            });

    return {
        ...group,
        owner:
            publicUser(owner),
        members,
        membersCount:
            members.length
    };
}

function addLog(type, data = {}) {
    db.logs.push({
        id: ids.log++,
        type,
        ...data,
        createdAt: now()
    });
}

/* =========================================================
   OWNER ACCOUNT
========================================================= */

if (!db.users.length) {
    db.users.push({
        id: ids.user++,
        username: OWNER_USERNAME,
        displayName: "فهد المطيري",
        passwordHash:
            hashPassword(
                OWNER_PASSWORD
            ),
        discordId:
            OWNER_ID || null,
        role: "owner",
        createdAt: now(),
        lastLoginAt: null
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

const importantPermissionNames =
    new Set([
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
        Date.now() - guildCacheAt <
            GUILD_CACHE_TTL
    ) {
        return guildCache;
    }

    if (guildFetchPromise) {
        return guildFetchPromise;
    }

    guildFetchPromise =
        discord.guilds
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
        Date.now() -
            memberSnapshotAt <
            MEMBER_CACHE_TTL;

    if (fresh) {
        return memberSnapshot;
    }

    if (memberFetchPromise) {
        return memberFetchPromise;
    }

    memberFetchPromise =
        guild.members
            .fetch()
            .then(collection => {
                memberSnapshot =
                    [...collection.values()];

                memberSnapshotAt =
                    Date.now();

                return memberSnapshot;
            })
            .catch(error => {
                if (
                    memberSnapshot?.length
                ) {
                    return memberSnapshot;
                }

                throw error;
            })
            .finally(() => {
                memberFetchPromise =
                    null;
            });

    return memberFetchPromise;
}

function importantPermissions(
    permissionCollection
) {
    return permissionCollection
        .toArray()
        .filter(permission =>
            importantPermissionNames.has(
                permission
            )
        );
}

function roleObject(
    role,
    membersCount =
        role.members?.size || 0
) {
    return {
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
        permissions:
            importantPermissions(
                role.permissions
            ),
        membersCount,
        mentionable:
            role.mentionable
    };
}

function memberObject(member) {
    const roles =
        member.roles.cache
            .filter(
                role =>
                    role.id !==
                    member.guild.id
            )
            .sort(
                (a, b) =>
                    b.position -
                    a.position
            )
            .map(role =>
                roleObject(role)
            );

    const importantRoles =
        roles.filter(role =>
            leadershipRoleSet.has(
                role.id
            )
        );

    const permissions = [];

    for (
        const permission
        of importantPermissionNames
    ) {
        try {
            if (
                member.permissions.has(
                    permission
                )
            ) {
                permissions.push(
                    permission
                );
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
    } else if (
        importantRoles.length
    ) {
        rank =
            importantRoles[0].name;
    }

    return {
        id: member.id,
        name:
            member.displayName ||
            member.user.username,
        username:
            member.user.username,
        globalName:
            member.user.globalName,
        avatar:
            member.user.displayAvatarURL({
                size: 256,
                extension: "png"
            }),
        bot: member.user.bot,
        joinedAt: member.joinedAt,
        rank,
        roles,
        importantRoles,
        permissions,
        stats: getStats(
            member.id
        )
    };
}

function sortedMemberObjects(
    members
) {
    return [...members]
        .sort((a, b) => {
            const aRole =
                a.roles.cache
                    .filter(role =>
                        leadershipRoleSet.has(
                            role.id
                        )
                    )
                    .sort(
                        (x, y) =>
                            y.position -
                            x.position
                    )
                    .first();

            const bRole =
                b.roles.cache
                    .filter(role =>
                        leadershipRoleSet.has(
                            role.id
                        )
                    )
                    .sort(
                        (x, y) =>
                            y.position -
                            x.position
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
    const guild =
        await getGuild();

    if (
        DISCORD_NOTIFICATION_CHANNEL_ID
    ) {
        const configured =
            guild.channels.cache.get(
                DISCORD_NOTIFICATION_CHANNEL_ID
            );

        if (
            configured &&
            configured.type ===
                ChannelType.GuildText
        ) {
            return configured;
        }
    }

    return (
        guild.channels.cache.find(
            channel => {
                if (
                    channel.type !==
                    ChannelType.GuildText
                ) {
                    return false;
                }

                const name =
                    String(
                        channel.name || ""
                    ).toLowerCase();

                return (
                    name.includes(
                        "website"
                    ) ||
                    name.includes(
                        "site"
                    ) ||
                    name.includes(
                        "admin"
                    ) ||
                    name.includes(
                        "طلبات"
                    ) ||
                    name.includes(
                        "الموقع"
                    )
                );
            }
        ) || null
    );
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

        const embed =
            new EmbedBuilder()
                .setTitle(
                    clean(title, 256)
                )
                .setDescription(
                    clean(
                        description,
                        4000
                    )
                )
                .setColor(color)
                .setTimestamp();

        if (fields.length) {
            embed.addFields(
                fields.map(field => ({
                    name: clean(
                        field.name,
                        256
                    ),
                    value: clean(
                        field.value,
                        1024
                    ),
                    inline:
                        Boolean(
                            field.inline
                        )
                }))
            );
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

async function setupDiscordGroup(
    group
) {
    const guild =
        await getGuild();

    const role =
        await guild.roles.create({
            name:
                `مجموعة · ${group.name}`
                    .slice(0, 100),
            reason:
                `Website group #${group.id}`
        });

    const category =
        await guild.channels.create({
            name:
                `مجموعة · ${group.name}`
                    .slice(0, 100),
            type:
                ChannelType.GuildCategory,
            reason:
                `Website group #${group.id}`
        });

    const textChannel =
        await guild.channels.create({
            name: "الدردشة",
            type:
                ChannelType.GuildText,
            parent: category.id,
            reason:
                `Website group #${group.id}`
        });

    const voiceChannel =
        await guild.channels.create({
            name: "الصوت",
            type:
                ChannelType.GuildVoice,
            parent: category.id,
            reason:
                `Website group #${group.id}`
        });

    group.discordRoleId =
        role.id;

    group.discordCategoryId =
        category.id;

    group.discordTextChannelId =
        textChannel.id;

    group.discordVoiceChannelId =
        voiceChannel.id;

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
    if (
        !group?.discordRoleId ||
        !user?.discordId
    ) {
        return false;
    }

    try {
        const guild =
            await getGuild();

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

app.get(
    "/api/auth/me",
    (req, res) => {
        const user =
            currentUser(req);

        res.json({
            authenticated:
                Boolean(user),
            user:
                publicUser(user)
        });
    }
);

app.post(
    "/api/auth/register",
    (req, res) => {
        const username =
            clean(
                req.body?.username,
                32
            );

        const password =
            String(
                req.body?.password || ""
            );

        const displayName =
            clean(
                req.body?.displayName,
                60
            ) || username;

        if (
            !username ||
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

        if (
            !/^[\p{L}\p{N}_.-]+$/u.test(
                username
            )
        ) {
            return res.status(400).json({
                error:
                    "اسم المستخدم يحتوي على رموز غير مسموحة"
            });
        }

        const exists =
            db.users.some(
                user =>
                    user.username.toLowerCase() ===
                    username.toLowerCase()
            );

        if (exists) {
            return res.status(409).json({
                error:
                    "اسم المستخدم مستخدم بالفعل"
            });
        }

        const user = {
            id: ids.user++,
            username,
            displayName,
            passwordHash:
                hashPassword(password),
            discordId:
                clean(
                    req.body?.discordId,
                    30
                ) || null,
            role: "user",
            createdAt: now(),
            lastLoginAt: now()
        };

        db.users.push(user);

        req.session.userId =
            user.id;

        res.status(201).json({
            ok: true,
            user:
                publicUser(user)
        });
    }
);

app.post(
    "/api/auth/login",
    (req, res) => {
        const username =
            clean(
                req.body?.username,
                32
            );

        const password =
            String(
                req.body?.password || ""
            );

        const user =
            db.users.find(
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
                error:
                    "اسم المستخدم أو كلمة المرور غير صحيحة"
            });
        }

        user.lastLoginAt =
            now();

        req.session.userId =
            user.id;

        res.json({
            ok: true,
            user:
                publicUser(user)
        });
    }
);

app.post(
    "/api/auth/logout",
    (req, res) => {
        req.session.destroy(
            () => {
                res.json({
                    ok: true
                });
            }
        );
    }
);

app.patch(
    "/api/auth/profile",
    requireAuth,
    (req, res) => {
        const displayName =
            clean(
                req.body?.displayName,
                60
            );

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
                clean(
                    req.body.discordId,
                    30
                ) || null;
        }

        res.json({
            ok: true,
            user:
                publicUser(
                    req.user
                )
        });
    }
);

app.post(
    "/api/auth/password",
    requireAuth,
    (req, res) => {
        const currentPassword =
            String(
                req.body?.currentPassword ||
                    ""
            );

        const newPassword =
            String(
                req.body?.newPassword ||
                    ""
            );

        if (
            !comparePassword(
                currentPassword,
                req.user.passwordHash
            )
        ) {
            return res.status(400).json({
                error:
                    "كلمة المرور الحالية غير صحيحة"
            });
        }

        if (
            newPassword.length < 6
        ) {
            return res.status(400).json({
                error:
                    "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"
            });
        }

        req.user.passwordHash =
            hashPassword(
                newPassword
            );

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
            const guild =
                await getGuild();

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
                    process.env
                        .SERVER_FOUNDER_NAME ||
                    "فهد المطيري",
                invite:
                    process.env
                        .DISCORD_INVITE_URL ||
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
                await fetchMembers(
                    guild
                );

            const query =
                String(
                    req.query.q || ""
                )
                    .trim()
                    .toLocaleLowerCase(
                        "ar"
                    );

            const cleanQuery =
                query.replace(
                    /^@/,
                    ""
                );

            const filtered =
                cleanQuery
                    ? allMembers.filter(
                          member => {
                              const searchable =
                                  [
                                      member.displayName,
                                      member.user.username,
                                      member.user.globalName,
                                      member.user.tag,
                                      member.id
                                  ]
                                      .filter(
                                          Boolean
                                      )
                                      .join(
                                          " "
                                      )
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
                    Boolean(
                        memberSnapshot
                    )
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
                await fetchMembers(
                    guild
                );

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
                    error:
                        "Role not found"
                });
            }

            const roleMembers =
                (
                    await fetchMembers(
                        guild
                    )
                ).filter(member =>
                    member.roles.cache.has(
                        role.id
                    )
                );

            res.json({
                role:
                    roleObject(
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
                ).map(
                    memberObject
                );

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
                    top(
                        "mentionsReceived"
                    ),
                voice:
                    top(
                        "voiceMinutes"
                    ),
                joins:
                    top(
                        "voiceJoins"
                    ),
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
                    .fetch(
                        req.params.id
                    )
                    .catch(
                        () => null
                    );

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
                ...memberObject(
                    member
                ),

                highestRole:
                    highest
                        ? roleObject(
                              highest
                          )
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
                        .map(role =>
                            roleObject(
                                role
                            )
                        )
                        .slice(0, 8)
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
            10000
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
            const guild =
                await getGuild();

            const member =
                await guild.members
                    .fetch(targetId)
                    .catch(
                        () => null
                    );

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
                    .setColor(
                        "#ff9cdc"
                    )
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

            db.privateMessageLogs.push({
                id:
                    ids.privateMessageLog++,
                targetId,
                title,
                createdAt: now()
            });

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
        res.json({
            groups:
                db.groups
                    .filter(
                        group =>
                            group.status ===
                            "approved"
                    )
                    .map(groupView)
        });
    }
);

app.get(
    "/api/groups/:id",
    (req, res) => {
        const group =
            findGroup(
                req.params.id
            );

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
            clean(
                req.body?.name,
                80
            );

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
                    group.name.toLowerCase() ===
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
            slug:
                makeSlug(name),
            description,
            ownerId:
                req.user.id,
            status:
                "pending",
            discordRoleId: null,
            discordCategoryId: null,
            discordTextChannelId:
                null,
            discordVoiceChannelId:
                null,
            createdAt: now(),
            reviewedAt: null,
            reviewedBy: null
        };

        db.groups.push(group);

        await notifyDiscordWebsite({
            title:
                "طلب إنشاء مجموعة جديدة",
            description:
                "تم إرسال طلب إنشاء مجموعة جديدة من الموقع.",
            color:
                "#f59e0b",
            fields: [
                {
                    name:
                        "المجموعة",
                    value:
                        group.name
                },
                {
                    name:
                        "المالك",
                    value:
                        req.user.username
                },
                {
                    name:
                        "الحالة",
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
            findGroup(
                req.params.id
            );

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
            ![
                "approve",
                "reject"
            ].includes(decision)
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
            decision ===
            "reject"
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

            addLog(
                "group_approved",
                {
                    admin:
                        req.user.username,
                    target:
                        group.id
                }
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
            findGroup(
                req.params.id
            );

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
                        Number(
                            group.id
                        ) &&
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
            findUser(
                group.ownerId
            );

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
            findGroup(
                req.params.id
            );

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
                        Number(
                            group.id
                        )
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
            findGroup(
                req.params.id
            );

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
                        Number(
                            group.id
                        )
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
            ![
                "approve",
                "reject"
            ].includes(decision)
        ) {
            return res.status(400).json({
                error:
                    "قرار المراجعة غير صحيح"
            });
        }

        const target =
            findUser(
                request.userId
            );

        if (!target) {
            return res.status(404).json({
                error:
                    "المستخدم غير موجود"
            });
        }

        request.status =
            decision ===
            "approve"
                ? "approved"
                : "rejected";

        request.reviewedAt =
            now();

        request.reviewedBy =
            req.user.id;

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
                `تمت مراجعة طلب "${target.username}" في مجموعة "${group.name}".`,
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

        if (target.discordId) {
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

        addLog(
            "group_join_review",
            {
                admin:
                    req.user.username,
                target:
                    request.id,
                status:
                    request.status
            }
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

app.post(
    "/api/tickets",
    requireAuth,
    async (req, res) => {
        const subject =
            clean(
                req.body?.subject,
                200
            );

        const type =
            clean(
                req.body?.type ||
                    "عام",
                80
            );

        const message =
            clean(
                req.body?.message,
                4000
            );

        const priority =
            clean(
                req.body?.priority ||
                    "normal",
                30
            );

        if (
            !subject ||
            !message
        ) {
            return res.status(400).json({
                error:
                    "العنوان والرسالة مطلوبان"
            });
        }

        const ticket = {
            id:
                crypto.randomUUID(),
            userId:
                req.user.id,
            username:
                req.user.username,
            subject,
            type,
            priority,
            status:
                "open",
            createdAt:
                now(),
            updatedAt:
                now()
        };

        db.tickets.push(ticket);

        const firstMessage = {
            id:
                crypto.randomUUID(),
            ticketId:
                ticket.id,
            userId:
                req.user.id,
            username:
                req.user.username,
            message,
            createdAt:
                now()
        };

        db.ticketMessages.push(
            firstMessage
        );

        await notifyDiscordWebsite({
            title:
                "تذكرة جديدة",
            description:
                `تم إنشاء تذكرة جديدة بواسطة ${req.user.username}.`,
            color:
                "#f59e0b",
            fields: [
                {
                    name:
                        "رقم التذكرة",
                    value:
                        ticket.id
                },
                {
                    name:
                        "النوع",
                    value:
                        ticket.type
                },
                {
                    name:
                        "الأولوية",
                    value:
                        ticket.priority
                },
                {
                    name:
                        "الموضوع",
                    value:
                        ticket.subject
                },
                {
                    name:
                        "الرسالة",
                    value:
                        firstMessage.message
                }
            ]
        });

        res.status(201).json({
            ok: true,
            ticket
        });
    }
);

app.get(
    "/api/tickets",
    requireAuth,
    (req, res) => {
        const tickets =
            db.tickets
                .filter(ticket =>
                    isAdmin(req.user)
                        ? true
                        : Number(
                              ticket.userId
                          ) ===
                          Number(
                              req.user.id
                          )
                )
                .sort(
                    (a, b) =>
                        new Date(
                            b.updatedAt
                        ) -
                        new Date(
                            a.updatedAt
                        )
                );

        res.json({
            tickets
        });
    }
);

app.get(
    "/api/tickets/:id",
    requireAuth,
    (req, res) => {
        const ticket =
            db.tickets.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                error:
                    "التذكرة غير موجودة"
            });
        }

        if (
            !isAdmin(req.user) &&
            Number(ticket.userId) !==
                Number(req.user.id)
        ) {
            return res.status(403).json({
                error:
                    "غير مصرح لك"
            });
        }

        const messages =
            db.ticketMessages
                .filter(
                    message =>
                        message.ticketId ===
                        ticket.id
                )
                .sort(
                    (a, b) =>
                        new Date(
                            a.createdAt
                        ) -
                        new Date(
                            b.createdAt
                        )
                );

        res.json({
            ticket,
            messages
        });
    }
);

app.post(
    "/api/tickets/:id/messages",
    requireAuth,
    async (req, res) => {
        const message =
            clean(
                req.body?.message,
                4000
            );

        if (!message) {
            return res.status(400).json({
                error:
                    "الرسالة مطلوبة"
            });
        }

        const ticket =
            db.tickets.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                error:
                    "التذكرة غير موجودة"
            });
        }

        if (
            !isAdmin(req.user) &&
            Number(ticket.userId) !==
                Number(req.user.id)
        ) {
            return res.status(403).json({
                error:
                    "غير مصرح لك"
            });
        }

        if (
            ticket.status ===
            "closed"
        ) {
            return res.status(400).json({
                error:
                    "التذكرة مغلقة"
            });
        }

        const item = {
            id:
                crypto.randomUUID(),
            ticketId:
                ticket.id,
            userId:
                req.user.id,
            username:
                req.user.username,
            message,
            createdAt:
                now()
        };

        db.ticketMessages.push(
            item
        );

        ticket.updatedAt =
            now();

        if (isAdmin(req.user)) {
            await notifyDiscordWebsite({
                title:
                    "رد إداري على تذكرة",
                description:
                    `رد ${req.user.username} على تذكرة ${ticket.id}.`,
                color:
                    "#3b82f6",
                fields: [
                    {
                        name:
                            "المستخدم",
                        value:
                            ticket.username
                    },
                    {
                        name:
                            "الرد",
                        value:
                            item.message
                    }
                ]
            });
        }

        res.json({
            ok: true,
            message: item
        });
    }
);

app.patch(
    "/api/admin/tickets/:id",
    requireAdmin,
    async (req, res) => {
        const ticket =
            db.tickets.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!ticket) {
            return res.status(404).json({
                error:
                    "التذكرة غير موجودة"
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
            allowedStatuses.includes(
                req.body.status
            )
        ) {
            ticket.status =
                req.body.status;
        }

        if (
            req.body?.priority
        ) {
            ticket.priority =
                clean(
                    req.body.priority,
                    30
                );
        }

        ticket.updatedAt =
            now();

        addLog(
            "ticket_update",
            {
                admin:
                    req.user.username,
                target:
                    ticket.id,
                status:
                    ticket.status
            }
        );

        res.json({
            ok: true,
            ticket
        });
    }
);

/* =========================================================
   APPLICATIONS
========================================================= */

app.post(
    "/api/applications",
    requireAuth,
    async (req, res) => {
        const type =
            clean(
                req.body?.type,
                100
            );

        const answers =
            req.body?.answers &&
            typeof req.body.answers ===
                "object"
                ? req.body.answers
                : {};

        const note =
            clean(
                req.body?.note,
                2000
            );

        if (!type) {
            return res.status(400).json({
                error:
                    "نوع الطلب مطلوب"
            });
        }

        const application = {
            id:
                crypto.randomUUID(),
            userId:
                req.user.id,
            username:
                req.user.username,
            type,
            answers,
            note,
            status:
                "pending",
            reviewer:
                null,
            reviewNote:
                null,
            createdAt:
                now(),
            updatedAt:
                now()
        };

        db.applications.push(
            application
        );

        await notifyDiscordWebsite({
            title:
                "طلب تقديم جديد",
            description:
                `تم إرسال طلب جديد بواسطة ${req.user.username}.`,
            color:
                "#8b5cf6",
            fields: [
                {
                    name:
                        "رقم الطلب",
                    value:
                        application.id
                },
                {
                    name:
                        "النوع",
                    value:
                        application.type
                },
                {
                    name:
                        "الحالة",
                    value:
                        "بانتظار المراجعة"
                },
                {
                    name:
                        "الملاحظات",
                    value:
                        application.note ||
                        "لا يوجد"
                }
            ]
        });

        res.status(201).json({
            ok: true,
            application
        });
    }
);

app.get(
    "/api/applications",
    requireAuth,
    (req, res) => {
        const applications =
            db.applications
                .filter(
                    application =>
                        isAdmin(req.user)
                            ? true
                            : Number(
                                  application.userId
                              ) ===
                              Number(
                                  req.user.id
                              )
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
            applications
        });
    }
);

app.get(
    "/api/applications/:id",
    requireAuth,
    (req, res) => {
        const application =
            db.applications.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!application) {
            return res.status(404).json({
                error:
                    "الطلب غير موجود"
            });
        }

        if (
            !isAdmin(req.user) &&
            Number(
                application.userId
            ) !==
                Number(req.user.id)
        ) {
            return res.status(403).json({
                error:
                    "غير مصرح لك"
            });
        }

        res.json({
            application
        });
    }
);

app.patch(
    "/api/admin/applications/:id/review",
    requireAdmin,
    async (req, res) => {
        const application =
            db.applications.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!application) {
            return res.status(404).json({
                error:
                    "الطلب غير موجود"
            });
        }

        const status =
            String(
                req.body?.status ||
                    ""
            );

        if (
            ![
                "approved",
                "rejected",
                "pending"
            ].includes(status)
        ) {
            return res.status(400).json({
                error:
                    "حالة غير صحيحة"
            });
        }

        application.status =
            status;

        application.reviewer =
            req.user.username;

        application.reviewNote =
            clean(
                req.body?.reviewNote,
                2000
            );

        application.updatedAt =
            now();

        addLog(
            "application_review",
            {
                admin:
                    req.user.username,
                target:
                    application.id,
                status
            }
        );

        await notifyDiscordWebsite({
            title:
                status === "approved"
                    ? "تم قبول طلب"
                    : status ===
                      "rejected"
                        ? "تم رفض طلب"
                        : "تم تحديث طلب",
            description:
                `تم تحديث طلب ${application.username}.`,
            color:
                status === "approved"
                    ? "#22c55e"
                    : status ===
                      "rejected"
                        ? "#ef4444"
                        : "#f59e0b",
            fields: [
                {
                    name:
                        "رقم الطلب",
                    value:
                        application.id
                },
                {
                    name:
                        "المستخدم",
                    value:
                        application.username
                },
                {
                    name:
                        "المراجع",
                    value:
                        req.user.username
                },
                {
                    name:
                        "الملاحظة",
                    value:
                        application.reviewNote ||
                        "لا يوجد"
                }
            ]
        });

        res.json({
            ok: true,
            application
        });
    }
);

/* =========================================================
   WATCH ROOMS
========================================================= */

function validMediaUrl(value) {
    try {
        const url =
            new URL(String(value));

        return (
            url.protocol ===
                "http:" ||
            url.protocol ===
                "https:"
        );
    } catch {
        return false;
    }
}

app.post(
    "/api/watch-rooms",
    requireAuth,
    (req, res) => {
        const title =
            clean(
                req.body?.title,
                150
            );

        const mediaUrl =
            clean(
                req.body?.mediaUrl,
                1000
            );

        const mediaType =
            clean(
                req.body?.mediaType ||
                    "video",
                50
            );

        const description =
            clean(
                req.body?.description,
                1000
            );

        if (
            !title ||
            !mediaUrl
        ) {
            return res.status(400).json({
                error:
                    "العنوان والرابط مطلوبان"
            });
        }

        if (
            !validMediaUrl(
                mediaUrl
            )
        ) {
            return res.status(400).json({
                error:
                    "رابط الوسائط غير صحيح"
            });
        }

        const room = {
            id:
                crypto.randomUUID(),
            ownerId:
                req.user.id,
            ownerUsername:
                req.user.username,
            title,
            mediaUrl,
            mediaType,
            description,
            status:
                "waiting",
            currentTime: 0,
            playing: false,
            members: [
                {
                    userId:
                        req.user.id,
                    username:
                        req.user.username,
                    joinedAt:
                        now()
                }
            ],
            createdAt:
                now()
        };

        db.watchRooms.push(
            room
        );

        io.emit(
            "watch:created",
            { room }
        );

        res.status(201).json({
            ok: true,
            room
        });
    }
);

app.get(
    "/api/watch-rooms",
    (req, res) => {
        res.json({
            rooms:
                db.watchRooms
                    .filter(
                        room =>
                            room.status !==
                            "closed"
                    )
                    .sort(
                        (a, b) =>
                            new Date(
                                b.createdAt
                            ) -
                            new Date(
                                a.createdAt
                            )
                    )
        });
    }
);

app.get(
    "/api/watch-rooms/:id",
    (req, res) => {
        const room =
            db.watchRooms.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!room) {
            return res.status(404).json({
                error:
                    "الغرفة غير موجودة"
            });
        }

        res.json({
            room
        });
    }
);

app.post(
    "/api/watch-rooms/:id/join",
    requireAuth,
    (req, res) => {
        const room =
            db.watchRooms.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!room) {
            return res.status(404).json({
                error:
                    "الغرفة غير موجودة"
            });
        }

        if (
            room.status ===
            "closed"
        ) {
            return res.status(400).json({
                error:
                    "الغرفة مغلقة"
            });
        }

        const exists =
            room.members.some(
                member =>
                    Number(
                        member.userId
                    ) ===
                    Number(
                        req.user.id
                    )
            );

        if (!exists) {
            room.members.push({
                userId:
                    req.user.id,
                username:
                    req.user.username,
                joinedAt:
                    now()
            });
        }

        io.to(
            `watch:${room.id}`
        ).emit(
            "watch:members",
            room.members
        );

        res.json({
            ok: true,
            room
        });
    }
);

app.patch(
    "/api/watch-rooms/:id/state",
    requireAuth,
    (req, res) => {
        const room =
            db.watchRooms.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!room) {
            return res.status(404).json({
                error:
                    "الغرفة غير موجودة"
            });
        }

        if (
            Number(room.ownerId) !==
            Number(req.user.id) &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error:
                    "مالك الغرفة أو الإدارة فقط يستطيع التحكم"
            });
        }

        if (
            typeof req.body?.currentTime ===
            "number"
        ) {
            room.currentTime =
                Math.max(
                    0,
                    req.body.currentTime
                );
        }

        if (
            typeof req.body?.playing ===
            "boolean"
        ) {
            room.playing =
                req.body.playing;
        }

        io.to(
            `watch:${room.id}`
        ).emit(
            "watch:state",
            {
                currentTime:
                    room.currentTime,
                playing:
                    room.playing
            }
        );

        res.json({
            ok: true,
            room
        });
    }
);

app.post(
    "/api/watch-rooms/:id/close",
    requireAuth,
    (req, res) => {
        const room =
            db.watchRooms.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!room) {
            return res.status(404).json({
                error:
                    "الغرفة غير موجودة"
            });
        }

        if (
            Number(room.ownerId) !==
                Number(req.user.id) &&
            !isAdmin(req.user)
        ) {
            return res.status(403).json({
                error:
                    "غير مصرح لك"
            });
        }

        room.status =
            "closed";

        io.to(
            `watch:${room.id}`
        ).emit(
            "watch:closed"
        );

        res.json({
            ok: true
        });
    }
);

/* =========================================================
   REVIEWS
========================================================= */

app.get(
    "/api/reviews",
    (req, res) => {
        const targetType =
            req.query.type
                ? String(
                      req.query.type
                  )
                : null;

        const targetId =
            req.query.targetId
                ? String(
                      req.query.targetId
                  )
                : null;

        const reviews =
            db.reviews
                .filter(review => {
                    if (
                        review.status !==
                        "approved"
                    ) {
                        return false;
                    }

                    if (
                        targetType &&
                        review.targetType !==
                            targetType
                    ) {
                        return false;
                    }

                    if (
                        targetId &&
                        review.targetId !==
                            targetId
                    ) {
                        return false;
                    }

                    return true;
                })
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
            reviews
        });
    }
);

app.post(
    "/api/reviews",
    requireAuth,
    (req, res) => {
        const targetType =
            clean(
                req.body?.targetType,
                50
            );

        const targetId =
            clean(
                req.body?.targetId,
                100
            );

        const targetName =
            clean(
                req.body?.targetName ||
                    targetId,
                150
            );

        const numericRating =
            Number(
                req.body?.rating
            );

        const comment =
            clean(
                req.body?.comment,
                2000
            );

        if (
            !targetType ||
            !targetId
        ) {
            return res.status(400).json({
                error:
                    "العنصر المطلوب تقييمه غير محدد"
            });
        }

        if (
            !Number.isInteger(
                numericRating
            ) ||
            numericRating < 1 ||
            numericRating > 5
        ) {
            return res.status(400).json({
                error:
                    "التقييم يجب أن يكون من 1 إلى 5"
            });
        }

        if (!comment) {
            return res.status(400).json({
                error:
                    "التعليق مطلوب"
            });
        }

        const existing =
            db.reviews.find(
                review =>
                    Number(
                        review.userId
                    ) ===
                        Number(
                            req.user.id
                        ) &&
                    review.targetType ===
                        targetType &&
                    review.targetId ===
                        targetId
            );

        if (existing) {
            return res.status(409).json({
                error:
                    "لديك تقييم سابق لهذا العنصر"
            });
        }

        const review = {
            id:
                crypto.randomUUID(),
            userId:
                req.user.id,
            username:
                req.user.username,
            targetType,
            targetId,
            targetName,
            rating:
                numericRating,
            comment,
            status:
                "pending",
            createdAt:
                now()
        };

        db.reviews.push(
            review
        );

        res.status(201).json({
            ok: true,
            review
        });
    }
);

app.get(
    "/api/admin/reviews",
    requireAdmin,
    (req, res) => {
        res.json({
            reviews:
                db.reviews
                    .slice()
                    .sort(
                        (a, b) =>
                            new Date(
                                b.createdAt
                            ) -
                            new Date(
                                a.createdAt
                            )
                    )
        });
    }
);

app.patch(
    "/api/admin/reviews/:id",
    requireAdmin,
    (req, res) => {
        const review =
            db.reviews.find(
                item =>
                    item.id ===
                    req.params.id
            );

        if (!review) {
            return res.status(404).json({
                error:
                    "التقييم غير موجود"
            });
        }

        const status =
            String(
                req.body?.status ||
                    ""
            );

        if (
            ![
                "approved",
                "rejected",
                "pending"
            ].includes(status)
        ) {
            return res.status(400).json({
                error:
                    "حالة غير صحيحة"
            });
        }

        review.status =
            status;

        addLog(
            "review_moderation",
            {
                admin:
                    req.user.username,
                target:
                    review.id,
                status
            }
        );

        res.json({
            ok: true,
            review
        });
    }
);

/* =========================================================
   ADMIN DATA
========================================================= */

app.get(
    "/api/admin/stats",
    requireAdmin,
    (req, res) => {
        res.json({
            users:
                db.users.length,

            groups:
                db.groups.length,

            pendingGroups:
                db.groups.filter(
                    group =>
                        group.status ===
                        "pending"
                ).length,

            joinRequests:
                db.groupJoinRequests.filter(
                    request =>
                        request.status ===
                        "pending"
                ).length,

            tickets:
                db.tickets.length,

            openTickets:
                db.tickets.filter(
                    ticket =>
                        ticket.status ===
                        "open"
                ).length,

            applications:
                db.applications.length,

            pendingApplications:
                db.applications.filter(
                    application =>
                        application.status ===
                        "pending"
                ).length,

            reviews:
                db.reviews.length,

            pendingReviews:
                db.reviews.filter(
                    review =>
                        review.status ===
                        "pending"
                ).length,

            watchRooms:
                db.watchRooms.filter(
                    room =>
                        room.status !==
                        "closed"
                ).length,

            logs:
                db.logs.length
        });
    }
);

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {
        res.json({
            users:
                db.users.map(user => ({
                    id: user.id,
                    username:
                        user.username,
                    displayName:
                        user.displayName,
                    discordId:
                        user.discordId ||
                        null,
                    role:
                        user.role,
                    createdAt:
                        user.createdAt,
                    lastLoginAt:
                        user.lastLoginAt ||
                        null
                }))
        });
    }
);

app.get(
    "/api/admin/logs",
    requireAdmin,
    (req, res) => {
        res.json({
            logs:
                db.logs
                    .slice()
                    .sort(
                        (a, b) =>
                            new Date(
                                b.createdAt
                            ) -
                            new Date(
                                a.createdAt
                            )
                    )
                    .slice(0, 500)
        });
    }
);

/* =========================================================
   DISCORD LINK
========================================================= */

app.post(
    "/api/profile/discord",
    requireAuth,
    async (req, res) => {
        const discordId =
            clean(
                req.body?.discordId,
                30
            );

        if (!discordId) {
            return res.status(400).json({
                error:
                    "Discord ID مطلوب"
            });
        }

        try {
            const guild =
                await getGuild();

            const member =
                await guild.members
                    .fetch(discordId)
                    .catch(
                        () => null
                    );

            if (!member) {
                return res.status(404).json({
                    error:
                        "عضو Discord غير موجود"
                });
            }

            const alreadyLinked =
                db.users.find(
                    user =>
                        user.id !==
                            req.user.id &&
                        user.discordId ===
                            member.id
                );

            if (alreadyLinked) {
                return res.status(409).json({
                    error:
                        "حساب Discord مرتبط بحساب موقع آخر"
                });
            }

            req.user.discordId =
                member.id;

            res.json({
                ok: true,
                user:
                    publicUser(
                        req.user
                    ),
                discord: {
                    id:
                        member.id,
                    username:
                        member.user
                            .username,
                    displayName:
                        member.displayName
                }
            });
        } catch (error) {
            console.error(
                "Discord link error:",
                error
            );

            res.status(400).json({
                error:
                    "تعذر ربط حساب Discord"
            });
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
            "watch:join",
            data => {
                if (
                    !data?.roomId
                ) {
                    return;
                }

                const room =
                    db.watchRooms.find(
                        item =>
                            item.id ===
                            data.roomId
                    );

                if (!room) {
                    return;
                }

                if (
                    room.status ===
                    "closed"
                ) {
                    return;
                }

                socket.join(
                    `watch:${room.id}`
                );

                socket.emit(
                    "watch:state",
                    {
                        currentTime:
                            room.currentTime,
                        playing:
                            room.playing
                    }
                );

                socket.emit(
                    "watch:members",
                    room.members
                );
            }
        );

        socket.on(
            "watch:leave",
            data => {
                if (
                    !data?.roomId
                ) {
                    return;
                }

                socket.leave(
                    `watch:${data.roomId}`
                );
            }
        );

        socket.on(
            "watch:chat",
            data => {
                if (
                    !data?.roomId ||
                    !data?.message
                ) {
                    return;
                }

                const room =
                    db.watchRooms.find(
                        item =>
                            item.id ===
                            data.roomId
                    );

                if (
                    !room ||
                    room.status ===
                        "closed"
                ) {
                    return;
                }

                const message =
                    clean(
                        data.message,
                        500
                    );

                if (!message) {
                    return;
                }

                const chat = {
                    id:
                        crypto.randomUUID(),
                    roomId:
                        room.id,
                    username:
                        clean(
                            data.username ||
                                "زائر",
                            60
                        ),
                    message,
                    createdAt:
                        now()
                };

                io.to(
                    `watch:${room.id}`
                ).emit(
                    "watch:chat",
                    chat
                );
            }
        );
    }
);

/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            ok: true,
            service:
                "Fahad Community Platform",
            time: now(),
            discord:
                Boolean(
                    discord.user
                )
        });
    }
);

/* =========================================================
   ADMIN DISCORD
========================================================= */

app.get(
    "/api/admin/discord",
    requireAdmin,
    async (req, res) => {
        try {
            const guild =
                await getGuild();

            if (!guild) {
                return res.status(503).json({
                    connected:
                        false,
                    error:
                        "Discord غير متصل"
                });
            }

            res.json({
                connected: true,

                guild: {
                    id:
                        guild.id,
                    name:
                        guild.name,
                    memberCount:
                        guild.memberCount,
                    icon:
                        guild.iconURL({
                            extension:
                                "png",
                            size:
                                256
                        })
                },

                bot: {
                    id:
                        discord.user?.id ||
                        null,
                    username:
                        discord.user
                            ?.username ||
                        null,
                    tag:
                        discord.user?.tag ||
                        null
                }
            });
        } catch (error) {
            console.error(
                "Discord admin error:",
                error
            );

            res.status(500).json({
                connected:
                    false,
                error:
                    "تعذر قراءة بيانات Discord"
            });
        }
    }
);

/* =========================================================
   API 404
========================================================= */

app.use(
    "/api",
    (req, res) => {
        res.status(404).json({
            error:
                "API endpoint غير موجود"
        });
    }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (error, req, res, next) => {
        console.error(
            "Internal error:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        res.status(500).json({
            error:
                "حدث خطأ داخلي في السيرفر"
        });
    }
);

/* =========================================================
   FRONTEND
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
   DISCORD READY
========================================================= */

discord.once(
    "ready",
    async () => {
        console.log(
            `\n✅ Discord connected as ${discord.user.tag}`
        );

        const statusName =
            process.env
                .BOT_STATUS_NAME ||
            "Fahad Community";

        const statusType =
            String(
                process.env
                    .BOT_STATUS_TYPE ||
                    "WATCHING"
            ).toUpperCase();

        const typeMap = {
            PLAYING: 0,
            STREAMING: 1,
            LISTENING: 2,
            WATCHING: 3
        };

        const activityType =
            typeMap[statusType] ??
            3;

        const botActivity = {
            name:
                statusName,
            type:
                activityType
        };

        if (
            activityType ===
            1
        ) {
            botActivity.url =
                process.env
                    .BOT_STREAM_URL ||
                "https://twitch.tv/Njm";
        }

        try {
            discord.user.setPresence({
                status:
                    "online",
                activities: [
                    botActivity
                ]
            });

            console.log(
                `✅ Bot status: ${statusType} ${statusName}`
            );
        } catch (error) {
            console.error(
                "Failed to set bot status:",
                error
            );
        }

        try {
            const guild =
                await discord.guilds.fetch(
                    DISCORD_GUILD_ID
                );

            guildCache =
                guild;

            guildCacheAt =
                Date.now();

            console.log(
                `🏠 Connected to guild: ${guild.name}`
            );

            const members =
                await guild.members.fetch();

            memberSnapshot =
                [
                    ...members.values()
                ];

            memberSnapshotAt =
                Date.now();

            console.log(
                `👥 Cached members: ${memberSnapshot.length}`
            );
        } catch (error) {
            console.error(
                "Discord guild initialization error:",
                error
            );
        }

        const inviteLink =
            `https://discord.com/oauth2/authorize` +
            `?client_id=${discord.user.id}` +
            `&permissions=412384488512` +
            `&scope=bot%20applications.commands`;

        console.log(
            `\n🔗 Bot Invite:\n${inviteLink}\n`
        );

        console.log(
            "🚀 Fahad Community Discord system is ready."
        );
    }
);

/* =========================================================
   DISCORD EVENTS
========================================================= */

discord.on(
    "guildMemberAdd",
    member => {
        console.log(
            `➕ Member joined: ${member.user.tag}`
        );

        invalidateMemberSnapshot();

        io.emit(
            "discord:memberAdd",
            {
                id:
                    member.id
            }
        );
    }
);

discord.on(
    "guildMemberRemove",
    member => {
        console.log(
            `➖ Member left: ${member.user.tag}`
        );

        invalidateMemberSnapshot();

        io.emit(
            "discord:memberRemove",
            {
                id:
                    member.id
            }
        );
    }
);

discord.on(
    "guildMemberUpdate",
    (oldMember, newMember) => {
        invalidateMemberSnapshot();

        io.emit(
            "discord:memberUpdate",
            {
                id:
                    newMember.id
            }
        );
    }
);

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
        stats.chatRounds += 1;

        if (
            message.mentions &&
            message.mentions.users
        ) {
            const mentions =
                message.mentions.users;

            if (
                mentions.size > 0
            ) {
                stats.mentionsSent +=
                    mentions.size;

                for (
                    const mentionedUser
                    of mentions.values()
                ) {
                    const mentionedStats =
                        getStats(
                            mentionedUser.id
                        );

                    mentionedStats
                        .mentionsReceived +=
                        1;
                }
            }
        }

        invalidateMemberSnapshot();

        io.emit(
            "discord:activity",
            {
                type:
                    "message",
                userId:
                    message.author.id
            }
        );
    }
);

discord.on(
    "voiceStateUpdate",
    (oldState, newState) => {
        const member =
            newState.member ||
            oldState.member;

        if (!member) {
            return;
        }

        const memberId =
            member.id;

        const oldChannel =
            oldState.channelId;

        const newChannel =
            newState.channelId;

        if (
            !oldChannel &&
            newChannel
        ) {
            const stats =
                getStats(
                    memberId
                );

            stats.voiceJoins +=
                1;

            voiceSessions.set(
                memberId,
                Date.now()
            );

            io.emit(
                "discord:voice",
                {
                    userId:
                        memberId,
                    channelId:
                        newChannel,
                    type:
                        "join"
                }
            );
        } else if (
            oldChannel &&
            !newChannel
        ) {
            const startedAt =
                voiceSessions.get(
                    memberId
                );

            if (startedAt) {
                const minutes =
                    Math.max(
                        0,
                        Math.round(
                            (
                                Date.now() -
                                startedAt
                            ) /
                                60000
                        )
                    );

                const stats =
                    getStats(
                        memberId
                    );

                stats.voiceMinutes +=
                    minutes;

                voiceSessions.delete(
                    memberId
                );
            }

            io.emit(
                "discord:voice",
                {
                    userId:
                        memberId,
                    channelId:
                        null,
                    type:
                        "leave"
                }
            );
        } else if (
            oldChannel &&
            newChannel &&
            oldChannel !==
                newChannel
        ) {
            io.emit(
                "discord:voice",
                {
                    userId:
                        memberId,
                    channelId:
                        newChannel,
                    oldChannelId:
                        oldChannel,
                    type:
                        "move"
                }
            );
        }

        invalidateMemberSnapshot();
    }
);

/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {
        console.log(
            `🌐 Website running on port ${PORT}`
        );
    }
);

/* =========================================================
   DISCORD LOGIN
========================================================= */

discord
    .login(
        DISCORD_BOT_TOKEN
    )
    .catch(error => {
        console.error(
            "❌ Discord login failed:",
            error.message
        );

        process.exit(1);
    });

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `${signal} received. Shutting down...`
    );

    try {
        discord.destroy();
    } catch (error) {
        console.error(
            "Discord shutdown error:",
            error
        );
    }

    server.close(
        () => {
            console.log(
                "HTTP server closed."
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => {
            process.exit(0);
        },
        5000
    );
}

process.on(
    "SIGTERM",
    () =>
        shutdown(
            "SIGTERM"
        )
);

process.on(
    "SIGINT",
    () =>
        shutdown(
            "SIGINT"
        )
);
