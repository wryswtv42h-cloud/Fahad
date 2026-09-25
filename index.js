const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قاعدة بيانات تجريبية (للاختبار والتطوير)
const users = {
    [process.env.OWNER_USER || 'mld']: { 
        username: process.env.OWNER_USER || 'mld', 
        pass: process.env.OWNER_PASS || 'mld123', 
        role: 'owner',
        avatar: 'https://github.com/wryswtv42h-cloud/discord-community-platform/raw/main/avatar.png' // أو رابط الأفاتار حقك
    }
};
const membersList = [
    { name: 'MLD (Owner)', role: 'Owner', status: 'online' },
    { name: 'Admin 01', role: 'Admin', status: 'online' },
    { name: 'Member Test', role: 'User', status: 'idle' }
];
const directMessages = [];
const logs = [];
const sessions = {};

// إعدادات بوت ديسكورد
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
const OWNER_DISCORD_ID = process.env.OWNER_ID;

// تصميم MLD الأصلي الفخم (الواجهة، القائمة العلوية Top، الأفاتار، والألوان الداكنة المتناسقة)
const mldSandboxStyle = `
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f1115; color: #dbdee1; margin: 0; padding: 0; direction: rtl; }
    header { background: #16181d; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #22252a; }
    .logo-area { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: bold; color: #fff; }
    .logo-area img { width: 45px; height: 45px; border-radius: 50%; border: 2px solid #a0a0a0; object-fit: cover; box-shadow: 0 0 10px rgba(255,255,255,0.1); }
    nav a { color: #b5bac1; text-decoration: none; margin-left: 20px; transition: 0.2s; font-weight: 600; font-size: 14px; }
    nav a:hover { color: #fff; }
    .main-container { display: flex; max-width: 1200px; margin: 30px auto; gap: 20px; padding: 0 15px; }
    .sidebar { width: 280px; background: #1a1d23; border-radius: 10px; padding: 20px; border: 1px solid #22252a; height: fit-content; }
    .content-area { flex: 1; background: #1a1d23; border-radius: 10px; padding: 25px; border: 1px solid #22252a; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
    h1, h2, h3 { color: #fff; margin-top: 0; }
    .btn { background: #5865f2; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; transition: 0.2s; font-size: 14px; }
    .btn:hover { background: #4752c4; }
    .btn-danger { background: #ed4245; }
    .btn-danger:hover { background: #c03537; }
    input, textarea { width: 100%; padding: 11px; margin: 8px 0; background: #111214; border: 1px solid #22252a; border-radius: 6px; color: #fff; font-size: 14px; }
    input:focus, textarea:focus { border-color: #5865f2; outline: none; }
    .member-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #22252a; font-size: 14px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #248046; display: inline-block; }
    .log-box { background: #111214; padding: 15px; border-radius: 6px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 13px; color: #00ffcc; text-align: left; direction: ltr; border: 1px solid #22252a; }
    .sandbox-tag { background: #ed4245; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; }
`;

function getSessionUser(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([^;]+)/);
    if (match && sessions[match[1]]) return sessions[match[1]];
    return null;
}

// الرابط الرئيسي (الواجهة المطابقة تماماً مع شريط الأعضاء والرسائل الخاصة)
app.get('/', (req, res) => {
    const user = getSessionUser(req);
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>MLD - Sandbox Environment</title>
            <style>${mldSandboxStyle}</style>
        </head>
        <body>
            <header>
                <div class="logo-area">
                    <!-- استخدام أفاتار MLD المطابق -->
                    <img src="https://i.imgur.com/7X4m56m.png" alt="MLD Avatar" onerror="this.src='https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png'">
                    <span>MLD Platform <span class="sandbox-tag">SANDBOX</span></span>
                </div>
                <nav>
                    <a href="/">الرئيسية (الواجهة)</a>
                    <a href="/dm-logs">الرسائل الخاصة واللوقات</a>
                    ${user ? `<a href="/logout" style="color:#ed4245;">خروج (${user.username})</a>` : `<a href="/login" class="btn" style="padding:5px 12px;">دخول الأدمن</a>`}
                </nav>
            </header>

            <div class="main-container">
                <!-- القائمة الجانبية (شريط الأعضاء والتوب) -->
                <div class="sidebar">
                    <h3>👥 أعضاء النظام</h3>
                    <div style="margin-top: 15px;">
                        ${membersList.map(m => `
                            <div class="member-item">
                                <span class="status-dot"></span>
                                <div>
                                    <div style="font-weight: bold; color: #fff;">${m.name}</div>
                                    <div style="font-size: 11px; color: #949ba4;">${m.role}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- منطقة المحتوى الرئيسية -->
                <div class="content-area">
                    <h2>مرحباً بك في بيئة تطوير MLD التجريبية</h2>
                    <p style="color: #949ba4;">هذه الصفحة مخصصة لاختبار الميزات الجديدة وتعديل الواجهات قبل نقلها للموقع الرئيسي.</p>
                    
                    <div style="background: #2b2d31; padding: 20px; border-radius: 8px; margin-top: 20px;">
                        <h3>📥 تجربة إرسال رسالة خاصة (DM Simulation)</h3>
                        <form action="/send-dm" method="POST">
                            <input type="text" name="sender" placeholder="اسم المرسل / العضو" required />
                            <textarea name="messageContent" placeholder="اكتب نص الرسالة الخاصة..." rows="3" required></textarea>
                            <button type="submit" class="btn">إرسال وتجربة اللوق</button>
                        </form>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// تسجيل الدخول للأدمن
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><title>دخول الأدمن</title><style>${mldSandboxStyle}</style></head>
        <body>
            <div style="max-width: 400px; margin: 100px auto; background: #1a1d23; padding: 30px; border-radius: 10px; border: 1px solid #22252a;">
                <h2>تسجيل دخول المالك (MLD)</h2>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" required />
                    <input type="password" name="password" placeholder="كلمة المرور" required />
                    <button type="submit" class="btn" style="width:100%; margin-top:10px;">دخول</button>
                </form>
                <p style="text-align:center; margin-top:15px;"><a href="/" style="color:#b5bac1;">العودة للرئيسية</a></p>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (user && user.pass === password) {
        const sessionId = Math.random().toString(36).substring(2);
        sessions[sessionId] = user;
        res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly`);
        res.redirect('/dm-logs');
    } else {
        res.send("<script>alert('خطأ في البيانات'); window.location='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.redirect('/');
});

// صفحة اللوقات والرسائل الخاصة (مخصصة لك وحدك)
app.get('/dm-logs', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.send(`<script>alert('هذه الصفحة خاصة بالمالك فقط! سجّل دخولك.'); window.location='/login';</script>`);

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><title>لوقات الرسائل الخاصة</title><style>${mldSandboxStyle}</style></head>
        <body>
            <header>
                <div class="logo-area">
                    <span>MLD - لوحة مراقبة الرسائل الخاصة واللوقات</span>
                </div>
                <nav><a href="/">الرئيسية</a> <a href="/logout" style="color:#ed4245;">خروج</a></nav>
            </header>
            <div style="max-width: 900px; margin: 40px auto; background: #1a1d23; padding: 30px; border-radius: 10px; border: 1px solid #22252a;">
                <h2>👑 السجلات والرسائل الخاصة (DM Logs)</h2>
                <p style="color: #949ba4;">جميع الرسائل الخاصة والنشاطات تظهر هنا بشكل فوري:</p>
                <div class="log-box">
                    ${directMessages.length === 0 ? 'لا توجد رسائل مسجلة حتى الآن.' : directMessages.join('<br>')}
                </div>
            </div>
        </body>
        </html>
    `);
});

// مسار تجربة الرسائل
app.post('/send-dm', (req, res) => {
    const { sender, messageContent } = req.body;
    const time = new Date().toLocaleTimeString();
    directMessages.push(`[${time}] رسالة من (${sender}): ${messageContent}`);
    res.redirect('/');
});

// ----------------- ربط البوت -----------------
client.once('ready', () => {
    console.log(`[MLD BOT] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.type === ChannelType.DM) {
        const time = new Date().toLocaleTimeString();
        directMessages.push(`[${time} - Discord DM] ${message.author.tag}: ${message.content}`);
        
        // إشعار لك في الخاص إذا تبيه
        if (OWNER_DISCORD_ID) {
            try {
                const owner = await client.users.fetch(OWNER_DISCORD_ID);
                if (owner) await owner.send(`📩 **[MLD DM Log]** من ${message.author.tag}: ${message.content}`);
            } catch (e) {}
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] MLD Sandbox running on port ${PORT}`);
});

if (TOKEN) client.login(TOKEN);
