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
