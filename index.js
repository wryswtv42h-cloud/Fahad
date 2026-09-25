const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// بوت ديسكورد الأساسي
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

// تصميم الـ UI المطابق لموقع ملاذ تماماً
const malazTheme = `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f1115; color: #dbdee1; margin: 0; padding: 0; direction: rtl; }
    header { background: #16181d; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #22252a; }
    .logo { display: flex; align-items: center; gap: 15px; font-size: 20px; font-weight: bold; color: #fff; }
    .logo img { width: 45px; height: 45px; border-radius: 50%; border: 2px solid #5865f2; object-fit: cover; }
    nav a { color: #b5bac1; text-decoration: none; margin-left: 20px; transition: 0.2s; font-weight: 500; font-size: 15px; }
    nav a:hover { color: #fff; }
    .container { max-width: 900px; margin: 60px auto; background: #1a1d23; padding: 40px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); border: 1px solid #22252a; text-align: center; }
    h1 { color: #fff; font-size: 28px; margin-bottom: 15px; }
    p { color: #949ba4; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
    .btn { background: #5865f2; color: white; padding: 12px 30px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; transition: 0.2s; font-size: 15px; }
    .btn:hover { background: #4752c4; }
    .status-badge { display: inline-block; background: #248046; color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }
`;

// الصفحة الرئيسية المطابقة لموقع ملاذ
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Malaz Railway Bot API</title>
            <style>${malazTheme}</style>
        </head>
        <body>
            <header>
                <div class="logo">
                    <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png" alt="Logo">
                    <span>Malaz Platform</span>
                </div>
                <nav>
                    <a href="/">الرئيسية</a>
                    <a href="https://github.com" target="_blank">المصدر</a>
                </nav>
            </header>
            <div class="container">
                <div class="status-badge">● النظام يعمل بكفاءة على Railway</div>
                <h1>مرحباً بك في واجهة نظام ملاذ</h1>
                <p>هذه النسخة المطابقة والمخصصة للتشغيل السلس والمستقر. البوت والخدمات تعمل بشكل متكامل في الخلفية.</p>
                <a href="/" class="btn">حالة النظام: نشط</a>
            </div>
        </body>
        </html>
    `);
});

// تشغيل البوت والسيرفر
client.once('ready', () => {
    console.log(`[BOT] Logged in as ${client.user.tag}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);
});

if (TOKEN) {
    client.login(TOKEN);
} else {
    console.log("[WARNING] DISCORD_TOKEN is not provided, running web only.");
}
