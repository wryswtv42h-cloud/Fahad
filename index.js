const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تخزين مؤقت للمستخدمين والجلسات واللوقات (قاعدة بيانات داخل الذاكرة أو قابلة للتطوير)
const users = {
    // حسابك المالك الافتراضي (يمكنك تغييره)
    owner: { username: process.env.OWNER_USER || 'admin', pass: process.env.OWNER_PASS || '123456', role: 'owner' }
};
const tickets = [];
const applications = [];
const logs = [];

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

// ----------------- الواجهات الأمامية (HTML Routes) -----------------

// الصفحة الرئيسية (عامة للكل)
app.get('/', (req, res) => {
    res.send(`
        <html dir="rtl">
        <head><title>منصة المجتمع</title><style>body{font-family:Tahoma;background:#111;color:#fff;text-align:center;padding:50px;} a{color:#00ffcc;margin:0 15px;text-decoration:none;font-size:18px;}</style></head>
        <body>
            <h1>أهلاً بك في منصة المجتمع الفخمة</h1>
            <p>الموقع مفتوح للجميع! تصفح واستمتع بالألعاب والخدمات.</p>
            <div style="margin-top:30px;">
                <a href="/login">تسجيل الدخول</a> | 
                <a href="/register">تسجيل حساب جديد</a> | 
                <a href="/dashboard">لوحة التحكم</a>
            </div>
        </body>
        </html>
    `);
});

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
    res.send(`
        <html dir="rtl">
        <head><title>تسجيل الدخول</title><style>body{font-family:Tahoma;background:#111;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} form{background:#222;padding:30px;border-radius:10px;box-shadow:0 0 10px #000;} input,button{display:block;width:100%;margin:10px 0;padding:10px;border-radius:5px;border:none;} button{background:#00ffcc;color:#000;font-weight:bold;cursor:pointer;}</style></head>
        <body>
            <form action="/login" method="POST">
                <h2>تسجيل الدخول</h2>
                <input type="text" name="username" placeholder="اسم المستخدم" required />
                <input type="password" name="password" placeholder="كلمة المرور" required />
                <button type="submit">دخول</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (user && user.pass === password) {
        res.redirect('/dashboard?user=' + username);
    } else {
        res.send("<script>alert('خطأ في اسم المستخدم أو كلمة المرور'); window.location='/login';</script>");
    }
});

// صفحة التسجيل (يوزر ورمز للأعضاء الجدد)
app.get('/register', (req, res) => {
    res.send(`
        <html dir="rtl">
        <head><title>تسجيل حساب جديد</title><style>body{font-family:Tahoma;background:#111;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;} form{background:#222;padding:30px;border-radius:10px;} input,button{display:block;width:100%;margin:10px 0;padding:10px;border-radius:5px;border:none;} button{background:#00ffcc;color:#000;font-weight:bold;cursor:pointer;}</style></head>
        <body>
            <form action="/register" method="POST">
                <h2>إنشاء حساب جديد</h2>
                <input type="text" name="username" placeholder="اختر اسم مستخدم" required />
                <input type="password" name="password" placeholder="اختر كلمة المرور" required />
                <button type="submit">تسجيل</button>
            </form>
        </body>
        </html>
    `);
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.send("<script>alert('اسم المستخدم موجود مسبقاً'); window.location='/register';</script>");
    }
    users[username] = { username, pass: password, role: 'member' };
    logs.push(`[تسجيل جديد] انضم المستخدم: ${username}`);
    res.redirect('/login');
});

// لوحة التحكم الموحدة (تتغير حسب الصلاحية: Owner / Admin / Member)
app.get('/dashboard', (req, res) => {
    const username = req.query.user || 'زائر';
    const user = users[username] || { role: 'guest' };

    let content = `<h2>أهلاً بك يا ${username} (${user.role})</h2>`;

    if (user.role === 'owner') {
        content += `
            <div style="background:#331111; padding:15px; margin:10px 0; border:1px solid red;">
                <h3>👑 لوحة المالك الشاملة (صلاحيات مطلقة)</h3>
                <p><strong>جميع اللوقات والرسائل والنشاطات:</strong></p>
                <ul style="text-align:right;">${logs.map(l => `<li>${l}</li>`).join('')}</ul>
            </div>
        `;
    } else if (user.role === 'admin') {
        content += `
            <div style="background:#113311; padding:15px; margin:10px 0; border:1px solid green;">
                <h3>🛡️ لوحة إدارة التذاكر والتقديمات</h3>
                <p>يمكنك هنا متابعة وإغلاق التذاكر وقبول/رفض التقديمات.</p>
            </div>
        `;
    } else {
        content += `
            <div style="background:#111133; padding:15px; margin:10px 0;">
                <h3>🎮 منطقة الأعضاء (القروبات، الألعاب، التذاكر، والتقديمات)</h3>
                <p>مرحباً بك! يمكنك التفاعل في الألعاب وفتح التذاكر براحتك.</p>
            </div>
        `;
    }

    res.send(`
        <html dir="rtl">
        <head><title>لوحة التحكم</title><style>body{font-family:Tahoma;background:#111;color:#fff;padding:30px;} a{color:#00ffcc;}</style></head>
        <body>
            ${content}
            <br><a href="/">الرئيسية</a> | <a href="/login">تسجيل الخروج</a>
        </body>
        </html>
    `);
});

// ----------------- ربط البوت وتسجيل اللوقات -----------------
client.once('ready', () => {
    console.log(`[BOT READY] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const logMsg = `[رسالة عامة / خاصة] ${message.author.tag}: ${message.content}`;
    logs.push(logMsg);

    if (message.channel.type === ChannelType.DM && OWNER_DISCORD_ID) {
        try {
            const owner = await client.users.fetch(OWNER_DISCORD_ID);
            if (owner) await owner.send(`📩 **لوق خاص جديد:** ${message.content} (من ${message.author.tag})`);
        } catch (e) { console.error(e); }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);
});

if (TOKEN) client.login(TOKEN);
