const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعدادات بوت ديسكورد مع تفعيل الصلاحيات اللازمة (بما فيها الرسائل الخاصة واللوقات)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID; // أيدي حسابك الخاص لجميع الصلاحيات واللوقات

// لوحة تحكم سيرفر الويب البسيطة
app.get('/', (req, res) => {
    res.send('<h1>Discord Community Platform is Running on Railway!</h1><p>System Status: Active & Secured.</p>');
});

client.once('ready', () => {
    console.log(`[BOT READY] Logged in as ${client.user.tag}`);
});

// نظام مراقبة الرسائل الخاصة واللوقات الخاصة بالمالك (Owner Logs)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // إذا كانت الرسالة في الخاصة (DM) ويتم إرسالها للبوت
    if (message.channel.type === ChannelType.DM) {
        console.log(`[DM LOG] From ${message.author.tag} (${message.author.id}): ${message.content}`);
        
        // إذا حبيت يوصلك لوق بالخاص على ديسكورد (عبر صاحب السيرفر)
        if (OWNER_ID) {
            try {
                const owner = await client.users.fetch(OWNER_ID);
                if (owner) {
                    await owner.send(`📩 **[رسالة خاصة جديدة - DM Log]**\n👤 **المارسِل:** ${message.author.tag} (\`${message.author.id}\`)\n💬 **النص:** ${message.content}`);
                }
            } catch (e) {
                console.error("Could not send DM log to owner:", e);
            }
        }
    }
});

// تشغيل السيرفر والبوت معاً على بورت ريلاوي
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Web server and Bot are running on port ${PORT}`);
});

if (TOKEN) {
    client.login(TOKEN);
} else {
    console.error("[ERROR] DISCORD_TOKEN is missing in environment variables!");
}
