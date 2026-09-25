const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// بيانات تجريبية قابلة للتعديل
const users = {
    [process.env.OWNER_USER || 'admin']: { 
        username: process.env.OWNER_USER || 'admin', 
        pass: process.env.OWNER_PASS || 'admin123', 
        role: 'owner' 
    }
};
const membersList = [
    { name: 'فهد المطيري (Owner)', role: 'المالك المؤسس', status: 'online' },
    { name: 'مشرف النظام 01', role: 'إدارة التذاكر', status: 'online' },
    { name: 'عضو نشط', role: 'مميز', status: 'idle' }
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

// التصميم البنفسجي الأسطوري المماثل لموقع ملاذ الأصلي تماماً
const malazExactStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'Cairo', sans-serif; background: #120d1c; color: #f3f0ff; margin: 0; padding: 0; direction: rtl; }
    header { background: #1a1228; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .logo-area { display: flex; align-items: center; gap: 15px; font-size: 20px; font-weight: bold; color: #fff; }
    .logo-area img { width: 50px; height: 50px; border-radius: 50%; border: 2px solid #b19cd9; object-fit: cover; box-shadow: 0 0 15px rgba(177,156,217,0.3); }
    nav a { color: #d0c5ec; text-decoration: none; margin-left: 20px; transition: 0.2s; font-weight: 600; font-size: 15px; }
    nav a:hover { color: #fff; }
    .hero { text-align: center; padding: 60px 20px 30px; }
    .badge-live { display: inline-block; background: rgba(177,156,217,0.15); color: #d8b4fe; padding: 6px 18px; border-radius: 20px; font-size: 13px; font-weight: bold; border: 1px solid rgba(177,156,217,0.3); margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 900; color: #fff; margin-bottom: 15px; background: linear-gradient(45deg, #fff, #d8b4fe); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p { color: #b8b2cb; font-size: 16px; line-height: 1.6; max-width: 600px; margin: 0 auto 30px; }
    .main-container { max-width: 1000px; margin: 20px auto 60px; padding: 0 20px; display: grid; grid-template-columns: 1fr 300px; gap: 25px; }
    @media(max-width: 768px) { .main-container { grid-template-columns: 1fr; } }
    .card { background: #181124; border: 1px solid rgba(255,255,255,0.06); padding: 25px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); margin-bottom: 20px; }
    .btn-main { background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; padding: 12px 30px; border: none; border-radius: 12px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; transition: 0.2s; font-size: 15px; box-shadow: 0 4px 15px rgba(139,92,246,0.4); }
    .btn-main:hover { transform: translateY(-2px); opacity: 0.95; }
    input, textarea { width: 100%; padding: 12px; margin: 10px 0; background: #120d1c; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-size: 14px; font-family: 'Cairo', sans-serif; }
    input:focus, textarea:focus { border-color: #8b5cf6; outline: none; }
    .member-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; }
    .footer-credit { text-align: center; padding: 20px; color: #887d9c; font-size: 14px; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 40px; }
    .log-box { background: #120d1c; padding: 15px; border-radius: 10px; max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 13px; color: #34d399; text-align: left; direction: ltr; border: 1px solid rgba(255,255,255,0.1); }
`;

function getSessionUser(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([^;]+)/);
    if (match && sessions[match[1]]) return sessions[match[1]];
    return null;
}

// الصفحة الرئيسية (نفس هيبة ملاذ وتصميمه البنفسجي)
app.get('/', (req, res) => {
    const user = getSessionUser(req);
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>مجتمع MLD - Community Intelligence</title>
            <style>${malazExactStyle}</style>
        </head>
        <body>
            <header>
                <div class="logo-area">
                    <img src="https://i.imgur.com/7X4m56m.png" alt="Logo" onerror="this.src='https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png'">
                    <span>M L D</span>
                </div>
                <nav>
                    <a href="/">الرئيسية</a>
                    ${user ? `<a href="/dashboard" style="color:#d8b4fe;">لوحة التحكم (${user.username})</a> <a href="/logout" style="color:#ef4444;">خروج</a>` : `<a href="/login">دخول الإدارة</a>`}
                </nav>
            </header>

            <div class="hero">
                <div class="badge-live">● LIVE COMMUNITY SYSTEM</div>
                <h1>مجتمع MLD بشكل مختلف.</h1>
                <p>أعضاء، رتب، توب، ورسائل خاصة في لوحة فخمة وسريعة تتحدث تلقائياً.</p>
                <a href="#features" class="btn-main">ابدأ الاستكشاف ←</a>
            </div>

            <div class="main-container" id="features">
                <!-- قسم المحتوى الأساسي -->
                <div>
                    <div class="card">
                        <h2>🧪 بيئة التطوير التجريبية (Sandbox)</h2>
                        <p style="margin: 0 0 15px 0;">هنا تقدر تجرب وتختبر أي ميزة جديدة تبي تدمجها بموقعك الأساسي.</p>
                        
                        <h3 style="color:#fff; margin-top:20px;">محاكاة رسالة خاصة (DM Simulation)</h3>
                        <form action="/send-dm" method="POST">
                            <input type="text" name="sender" placeholder="اسم المرسل" required />
                            <textarea name="messageContent" placeholder="اكتب محتوى الرسالة الخاصة..." rows="3" required></textarea>
                            <button type="submit" class="btn-main" style="width:100%; margin-top:5px;">إرسال وتجربة اللوق</button>
                        </form>
                    </div>
                </div>

                <!-- شريط الأعضاء والتوب الجانبي -->
                <div>
                    <div class="card">
                        <h3 style="margin-top:0; color:#fff;">👑 طاقم الإدارة والأعضاء</h3>
                        <div style="margin-top: 15px;">
                            ${membersList.map(m => `
                                <div class="member-row">
                                    <span class="status-dot"></span>
                                    <div>
                                        <div style="font-weight: 700; color: #fff; font-size: 14px;">${m.name}</div>
                                        <div style="font-size: 12px; color: #a29bb8;">${m.role}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <div class="footer-credit">
                صُنِع بواسطة فهد المطيري
            </div>
        </body>
        </html>
    `);
});

// صفحة تسجيل الدخول للأدمن
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><title>تسجيل الدخول</title><style>${malazExactStyle}</style></head>
        <body>
            <div style="max-width: 400px; margin: 100px auto;">
                <div class="card">
                    <h2>تسجيل دخول المالك</h2>
                    <form action="/login" method="POST">
                        <input type="text" name="username" placeholder="اسم المستخدم" required />
                        <input type="password" name="password" placeholder="كلمة المرور" required />
                        <button type="submit" class="btn-main" style="width:100%; margin-top:10px;">دخول</button>
                    </form>
                    <p style="text-align:center; margin-top:15px;"><a href="/" style="color:#b8b2cb;">العودة للرئيسية</a></p>
                </div>
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
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('خطأ في البيانات'); window.location='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.redirect('/');
});

// لوحة التحكم واللوقات الخاصة
app.get('/dashboard', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.send(`<script>alert('يجب تسجيل الدخول أولاً!'); window.location='/login';</script>`);

    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><title>لوحة تحكم MLD</title><style>${malazExactStyle}</style></head>
        <body>
            <header>
                <div class="logo-area"><span>لوحة التحكم الشاملة (DM Logs)</span></div>
                <nav><a href="/">الرئيسية</a> <a href="/logout" style="color:#ef4444;">خروج</a></nav>
            </header>
            <div style="max-width: 900px; margin: 40px auto; padding: 0 20px;">
                <div class="card">
                    <h2>👑 جميع اللوقات والرسائل الخاصة (DM Logs)</h2>
                    <p>هنا تسجل وتظهر لك كافة الرسائل والنشاطات بشكل فوري:</p>
                    <div class="log-box">
                        ${directMessages.length === 0 ? 'لا توجد رسائل مسجلة حتى الآن.' : directMessages.join('<br>')}
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post('/send-dm', (req, res) => {
    const { sender, messageContent } = req.body;
    const time = new Date().toLocaleTimeString();
    directMessages.push(`[${time}] رسالة من (${sender}): ${messageContent}`);
    res.redirect('/');
});

// ربط البوت
client.once('ready', () => {
    console.log(`[MLD BOT] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.type === ChannelType.DM) {
        const time = new Date().toLocaleTimeString();
        directMessages.push(`[${time} - Discord DM] ${message.author.tag}: ${message.content}`);
        
        if (OWNER_DISCORD_ID) {
            try {
                const owner = await client.users.fetch(OWNER_DISCORD_ID);
                if (owner) await owner.send(`📩 **[MLD Log]** من ${message.author.tag}: ${message.content}`);
            } catch (e) {}
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);
});

if (TOKEN) client.login(TOKEN);
