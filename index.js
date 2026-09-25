const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قاعدة بيانات داخلية متكاملة وآمنة
const users = {
    [process.env.OWNER_USER || 'admin']: { 
        username: process.env.OWNER_USER || 'admin', 
        pass: process.env.OWNER_PASS || 'admin123', 
        role: 'owner' 
    }
};
const groups = [];
const tickets = [];
const applications = [];
const logs = [];
const sessions = {};

// إعدادات بوت ديسكورد مع تفعيل كافة الصلاحيات واللوقات
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

// ستايل التصميم الفخم والمطابق لهوية ملاذ وديسكورد الأصلية
const themeStyle = `
    * { box-sizing: border-box; }
    body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; background: #0f1115; color: #dbdee1; margin: 0; padding: 0; direction: rtl; }
    header { background: #16181d; padding: 18px 40px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #22252a; }
    .logo { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: bold; color: #fff; }
    .logo img { width: 42px; height: 42px; border-radius: 50%; border: 2px solid #5865f2; object-fit: cover; }
    nav a { color: #b5bac1; text-decoration: none; margin-left: 20px; transition: 0.2s; font-weight: 600; font-size: 15px; }
    nav a:hover { color: #fff; }
    .container { max-width: 1000px; margin: 40px auto; background: #1a1d23; padding: 35px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); border: 1px solid #22252a; }
    h1, h2, h3 { color: #fff; }
    .btn { background: #5865f2; color: white; padding: 11px 22px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; transition: 0.2s; font-size: 14px; }
    .btn:hover { background: #4752c4; transform: translateY(-1px); }
    .btn-danger { background: #ed4245; }
    .btn-danger:hover { background: #c03537; }
    .btn-success { background: #248046; }
    .btn-success:hover { background: #1a6335; }
    input, select, textarea { width: 100%; padding: 12px; margin: 10px 0; background: #111214; border: 1px solid #22252a; border-radius: 6px; color: #fff; font-size: 14px; }
    input:focus, textarea:focus { border-color: #5865f2; outline: none; }
    .card { background: #2b2d31; padding: 20px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #5865f2; }
    .log-box { background: #111214; padding: 15px; border-radius: 6px; max-height: 350px; overflow-y: auto; font-family: monospace; font-size: 13px; color: #00ffcc; text-align: left; direction: ltr; border: 1px solid #22252a; }
    .badge { background: #35363c; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #b5bac1; }
`;

function getSessionUser(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/session=([^;]+)/);
    if (match && sessions[match[1]]) return sessions[match[1]];
    return null;
}

// ----------------- الواجهات الأمامية -----------------

// الصفحة الرئيسية
app.get('/', (req, res) => {
    const user = getSessionUser(req);
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>منصة المجتمع الرسمية</title><style>${themeStyle}</style></head>
        <body>
            <header>
                <div class="logo">
                    <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png" alt="Avatar">
                    <span>Community Platform</span>
                </div>
                <nav>
                    <a href="/">الرئيسية</a>
                    <a href="/groups">القروبات والألعاب</a>
                    <a href="/tickets">التذاكر</a>
                    <a href="/applications">التقديمات</a>
                    ${user ? `<a href="/dashboard" style="color:#5865f2;">لوحة التحكم (${user.username})</a> <a href="/logout" style="color:#ed4245;">خروج</a>` : `<a href="/login" class="btn" style="padding:6px 15px;">تسجيل الدخول</a>`}
                </nav>
            </header>
            <div class="container" style="text-align: center;">
                <h1>أهلاً بك في منصة المجتمع الفخمة</h1>
                <p style="color: #949ba4; font-size: 16px; margin-bottom: 30px;">تصفح المنصة، العب ألعابك المفضلة (بلوت، أونو، لودو، جاكارو)، وأنشئ قروباتك بكل حرية وسهولة.</p>
                <a href="/groups" class="btn" style="padding: 14px 28px; font-size: 16px;">استعرض الألعاب والقروبات الآن</a>
            </div>
        </body>
        </html>
    `);
});

// تسجيل الدخول
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>تسجيل الدخول</title><style>${themeStyle}</style></head>
        <body>
            <div class="container" style="max-width: 400px; margin-top: 80px;">
                <h2>تسجيل الدخول</h2>
                <p style="color:#949ba4; font-size:13px;">مطلوب لتنفيذ العمليات، الألعاب، والتذاكر</p>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="اسم المستخدم" required />
                    <input type="password" name="password" placeholder="كلمة المرور" required />
                    <button type="submit" class="btn" style="width:100%; margin-top:10px;">دخول</button>
                </form>
                <p style="text-align:center; margin-top:15px;"><a href="/register" style="color:#5865f2;">تسجيل حساب جديد</a> | <a href="/" style="color:#b5bac1;">الرئيسية</a></p>
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
        logs.push(`[تسجيل دخول] المستخدم ${username} (${user.role}) سجل دخوله بنجاح.`);
        res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly`);
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('خطأ في اسم المستخدم أو كلمة المرور'); window.location='/login';</script>");
    }
});

// تسجيل حساب جديد
app.get('/register', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>تسجيل حساب جديد</title><style>${themeStyle}</style></head>
        <body>
            <div class="container" style="max-width: 400px; margin-top: 80px;">
                <h2>تسجيل حساب جديد</h2>
                <form action="/register" method="POST">
                    <input type="text" name="username" placeholder="اختر اسم مستخدم" required />
                    <input type="password" name="password" placeholder="اختر كلمة المرور" required />
                    <button type="submit" class="btn" style="width:100%; margin-top:10px;">إنشاء الحساب</button>
                </form>
                <p style="text-align:center; margin-top:15px;"><a href="/login" style="color:#5865f2;">لديك حساب؟ سجل دخول</a></p>
            </div>
        </body>
        </html>
    `);
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.send("<script>alert('اسم المستخدم مستخدم مسبقاً'); window.location='/register';</script>");
    }
    users[username] = { username, pass: password, role: 'member' };
    logs.push(`[عضو جديد] تم إنشاء حساب جديد باسم: ${username}`);
    res.send("<script>alert('تم إنشاء الحساب بنجاح! سجّل دخولك الآن.'); window.location='/login';</script>");
});

app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.redirect('/');
});

// الألعاب والقروبات (يتطلب تسجيل دخول عند الإنشاء)
app.get('/groups', (req, res) => {
    const user = getSessionUser(req);
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>القروبات والألعاب</title><style>${themeStyle}</style></head>
        <body>
            <header>
                <div class="logo"><img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png"><span>القروبات والألعاب الجماعية</span></div>
                <nav><a href="/">الرئيسية</a> <a href="/dashboard">لوحة التحكم</a></nav>
            </header>
            <div class="container">
                <h2>🎮 قسم الألعاب (بلوت، أونو، لودو، جاكارو) والقروبات</h2>
                ${!user ? `
                    <div style="background:#ed424522; border:1px solid #ed4245; padding:15px; border-radius:8px; margin-bottom:20px; text-align:center;">
                        <p style="margin:0;">⚠️ تنبيه: يجب عليك <a href="/login" style="color:#fff; font-weight:bold; text-decoration:underline;">تسجيل الدخول</a> لتتمكن من إنشاء قروب أو الانضمام لجلسات اللعب!</p>
                    </div>
                ` : `
                    <div class="card">
                        <h3>إنشاء جلسة لعب أو قروب جديد</h3>
                        <form action="/groups/create" method="POST">
                            <input type="text" name="groupName" placeholder="اسم القروب أو اللعبة (مثلاً: جلسة بلوت سريعة - متفرجين متاحين)" required />
                            <button type="submit" class="btn">إنشاء القروب فوراً</button>
                        </form>
                    </div>
                `}
                <h3>القروبات والجلسات النشطة حالياً:</h3>
                ${groups.length === 0 ? '<p style="color:#949ba4;">لا توجد قروبات نشطة حالياً. كن أول من ينشئ قروب!</p>' : 
                  groups.map(g => `<div class="card"><strong>${g.name}</strong><br><span class="badge">بواسطة: ${g.owner}</span></div>`).join('')}
            </div>
        </body>
        </html>
    `);
});

app.post('/groups/create', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.redirect('/login');
    const { groupName } = req.body;
    groups.push({ name: groupName, owner: user.username });
    logs.push(`[قروب جديد] أنشأ العضو ${user.username} قروب/جلسة: ${groupName}`);
    res.redirect('/groups');
});

// التذاكر (يتطلب تسجيل دخول)
app.get('/tickets', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.send(`<script>alert('يجب تسجيل الدخول لفتح التذاكر والدعم!'); window.location='/login';</script>`);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>التذاكر والدعم</title><style>${themeStyle}</style></head>
        <body>
            <header>
                <div class="logo"><img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png"><span>نظام التذاكر</span></div>
                <nav><a href="/">الرئيسية</a> <a href="/dashboard">لوحة التحكم</a></nav>
            </header>
            <div class="container">
                <h2>🎫 تذاكر الدعم الفني</h2>
                <div class="card">
                    <form action="/tickets/create" method="POST">
                        <input type="text" name="subject" placeholder="عنوان التذكرة (مشكلة أو استفسار)" required />
                        <textarea name="message" placeholder="اكتب تفاصيل مشكلتك هنا..." rows="4" required></textarea>
                        <button type="submit" class="btn">فتح تذكرة جديدة</button>
                    </form>
                </div>
                <h3>تذاكرك المسجلة:</h3>
                ${tickets.filter(t => user.role === 'owner' || user.role === 'admin' || t.author === user.username).length === 0 ? '<p style="color:#949ba4;">لا توجد تذاكر مسجلة.</p>' : 
                  tickets.map(t => `<div class="card"><strong>${t.subject}</strong><br><span class="badge">بواسطة: ${t.author}</span> | <span class="badge">الحالة: ${t.status}</span></div>`).join('')}
            </div>
        </body>
        </html>
    `);
});

app.post('/tickets/create', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.redirect('/login');
    const { subject, message } = req.body;
    tickets.push({ subject, message, author: user.username, status: 'مفتوحة' });
    logs.push(`[تذكرة جديدة] فتح العضو ${user.username} تذكرة بعنوان: ${subject}`);
    res.redirect('/tickets');
});

// التقديمات (يتطلب تسجيل دخول)
app.get('/applications', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.send(`<script>alert('يجب تسجيل الدخول لتقديم طلب!'); window.location='/login';</script>`);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>التقديمات</title><style>${themeStyle}</style></head>
        <body>
            <header>
                <div class="logo"><img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png"><span>التقديمات</span></div>
                <nav><a href="/">الرئيسية</a> <a href="/dashboard">لوحة التحكم</a></nav>
            </header>
            <div class="container">
                <h2>📋 نموذج تقديم الإدارة</h2>
                <div class="card">
                    <form action="/applications/create" method="POST">
                        <textarea name="details" placeholder="اكتب طلب تقديمك وخبراتك..." rows="5" required></textarea>
                        <button type="submit" class="btn">إرسال التقديم</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.post('/applications/create', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.redirect('/login');
    const { details } = req.body;
    applications.push({ author: user.username, details, status: 'قيد المراجعة' });
    logs.push(`[تقديم جديد] قام العضو ${user.username} بتقديم طلب انضمام.`);
    res.send("<script>alert('تم إرسال تقديمك بنجاح!'); window.location='/applications';</script>");
});

// ----------------- لوحة التحكم الشاملة -----------------
app.get('/dashboard', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.redirect('/login');

    let panelHTML = '';

    if (user.role === 'owner') {
        panelHTML = `
            <div class="card" style="border-left-color: #ed4245;">
                <h3 style="color: #ed4245;">👑 لوحة تحكم المالك (صلاحيات مطلقة وشاملة)</h3>
                <p>تشاهد أدناه كافة السجلات، اللوقات، الرسائل، وتفاصيل المنصة بلا استثناء:</p>
                <div class="log-box">${logs.length === 0 ? 'لا توجد لوقات مسجلة حتى الآن.' : logs.join('<br>')}</div>
            </div>
        `;
    } else if (user.role === 'admin') {
        panelHTML = `
            <div class="card" style="border-left-color: #57f287;">
                <h3 style="color: #57f287;">🛡️ لوحة إدارة التذاكر والتقديمات</h3>
                <p>مرحباً بك يا إداري. يمكنك متابعة وإدارة التذاكر والتقديمات أدناه:</p>
                <h4>التذاكر الحالية:</h4>
                ${tickets.length === 0 ? '<p>لا توجد تذاكر.</p>' : tickets.map(t => `<div style="background:#111214; padding:10px; margin:5px 0; border-radius:4px;"><strong>${t.subject}</strong> (${t.author})</div>`).join('')}
                <h4>التقديمات الحالية:</h4>
                ${applications.length === 0 ? '<p>لا توجد تقديمات.</p>' : applications.map(a => `<div style="background:#111214; padding:10px; margin:5px 0; border-radius:4px;"><strong>متقدم: ${a.author}</strong> -${a.details}</div>`).join('')}
            </div>
        `;
    } else {
        panelHTML = `
            <div class="card">
                <h3>👤 لوحة العضو (${user.username})</h3>
                <p>أنت مسجل دخول بنجاح وتستمتع بكافة مميزات المنصة والألعاب.</p>
            </div>
        `;
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>لوحة التحكم</title><style>${themeStyle}</style></head>
        <body>
            <header>
                <div class="logo"><img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47e.png"><span>لوحة التحكم</span></div>
                <nav><a href="/">الرئيسية</a> <a href="/groups">القروبات والألعاب</a> <a href="/tickets">التذاكر</a> <a href="/logout" style="color:#ed4245;">خروج</a></nav>
            </header>
            <div class="container">
                <h2>مرحباً بك، ${user.username}</h2>
                ${panelHTML}
            </div>
        </body>
        </html>
    `);
});

// ----------------- ربط البوت -----------------
client.once('ready', () => {
    console.log(`[BOT READY] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    logs.push(`[ديسكورد] ${message.author.tag}: ${message.content}`);

    if (message.channel.type === ChannelType.DM && OWNER_DISCORD_ID) {
        try {
            const owner = await client.users.fetch(OWNER_DISCORD_ID);
            if (owner) await owner.send(`📩 **[DM Log]** من ${message.author.tag}: ${message.content}`);
        } catch (e) { console.error(e); }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] Running on port ${PORT}`);
});

if (TOKEN) client.login(TOKEN);
