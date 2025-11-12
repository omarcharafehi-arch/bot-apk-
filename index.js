// ============================================
// index.js - الملف الرئيسي
// ============================================
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const logger = pino({ level: 'silent' });
let lastReminderTime = Date.now();
// Standard User-Agent to avoid blocking
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36';


// Context info للإعلان
const getInstagramContext = () => ({
    externalAdReply: {
        title: '📸 تابع المطور',
        body: '@yxx0p على Instagram',
        thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png',
        sourceUrl: config.owner.instagramUrl,
        mediaType: 1,
        renderLargerThumbnail: false,
        showAdAttribution: true
    }
});

// البحث في APKPure
async function searchAPKPure(appName) {
    try {
        const response = await axios.get('https://api.apkpure.ai/api/v1/search', {
            params: {
                q: appName,
                limit: 5,
                region: 'en'
            },
            headers: {
                'User-Agent': BROWSER_USER_AGENT, // Fix: Use standard browser User-Agent
                'Accept': 'application/json'
            },
            timeout: config.api.timeout
        });

        if (response.data?.data?.length > 0) {
            return response.data.data;
        }
        return null;
    } catch (error) {
        logger.error(`APKPure search error: ${error.message}`);
        throw error;
    }
}

// الحصول على تفاصيل التطبيق
async function getAppDetails(packageName) {
    try {
        const response = await axios.get(`https://api.apkpure.ai/api/v1/app/${packageName}`, {
            headers: {
                'User-Agent': BROWSER_USER_AGENT, // Fix: Use standard browser User-Agent
                'Accept': 'application/json'
            },
            timeout: config.api.timeout
        });
        return response.data;
    } catch (error) {
        logger.error(`Get details error: ${error.message}`);
        return null;
    }
}

// تحميل الملف
async function downloadFile(url, fileName) {
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            maxContentLength: config.api.maxFileSize,
            maxBodyLength: config.api.maxFileSize,
            timeout: 600000, // 10 minutes
            headers: {
                'User-Agent': BROWSER_USER_AGENT // Fix: Use standard browser User-Agent
            }
        });

        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const filePath = path.join(downloadDir, fileName);
        fs.writeFileSync(filePath, response.data);
        return filePath;
    } catch (error) {
        logger.error(`Download error: ${error.message}`);
        throw error;
    }
}

// معالجة طلب APK
async function handleAPKRequest(sock, message, appName) {
    const sender = message.key.remoteJid;

    try {
        await sock.sendMessage(sender, { react: { text: '🔍', key: message.key } });

        const results = await searchAPKPure(appName);

        if (!results || results.length === 0) {
            await sock.sendMessage(sender, { react: { text: '❌', key: message.key } });
            await sock.sendMessage(sender, {
                text: `❌ لم أجد "${appName}"\nجرب اسم آخر`,
                contextInfo: getInstagramContext()
            });
            return;
        }

        const app = results[0];
        const details = await getAppDetails(app.package);

        if (!details?.download_url) {
            await sock.sendMessage(sender, {
                text: `❌ فشل التحميل\nحاول لاحقاً`,
                contextInfo: getInstagramContext()
            });
            return;
        }

        await sock.sendMessage(sender, { react: { text: '⬇️', key: message.key } });

        // إرسال معلومات التطبيق
        if (app.icon) {
            try {
                const iconData = await axios.get(app.icon, { responseType: 'arraybuffer' });
                await sock.sendMessage(sender, {
                    image: Buffer.from(iconData.data),
                    caption: `📱 *${app.name}*\n` +
                        `📦 ${app.package}\n` +
                        `📊 ${details.version || 'N/A'}\n` +
                        `💾 ${details.size || 'N/A'}\n\n` +
                        `⏳ جاري التحميل...`,
                    contextInfo: getInstagramContext()
                });
            } catch (e) {
                logger.error(`Icon error: ${e.message}`);
            }
        }

        // تحميل APK
        const fileName = `${app.name.replace(/[^a-zA-Z0-9]/g, '_')}.apk`;
        const filePath = await downloadFile(details.download_url, fileName);

        if (!fs.existsSync(filePath)) {
            throw new Error('File not found after download');
        }

        await sock.sendMessage(sender, { react: { text: '📤', key: message.key } });

        const fileStats = fs.statSync(filePath);
        await sock.sendMessage(sender, {
            document: fs.readFileSync(filePath),
            fileName: fileName,
            mimetype: 'application/vnd.android.package-archive',
            caption: `✅ *${app.name}*\n💾 ${(fileStats.size / 1024 / 1024).toFixed(2)} MB\n\n📸 @yxx0p`,
            contextInfo: getInstagramContext()
        });

        fs.unlinkSync(filePath);

        // تحميل OBB إذا وجد
        if (details.obb_url) {
            try {
                const obbName = `${app.name.replace(/[^a-zA-Z0-9]/g, '_')}.obb`;
                await sock.sendMessage(sender, {
                    text: `📦 جاري تحميل ملف OBB...`,
                    contextInfo: getInstagramContext()
                });

                const obbPath = await downloadFile(details.obb_url, obbName);
                const obbStats = fs.statSync(obbPath);

                await sock.sendMessage(sender, {
                    document: fs.readFileSync(obbPath),
                    fileName: obbName,
                    mimetype: 'application/octet-stream',
                    caption: `📦 *OBB File*\n` +
                        `💾 ${(obbStats.size / 1024 / 1024).toFixed(2)} MB\n\n` +
                        `📁 ضعه في:\nAndroid/obb/${app.package}/\n\n` +
                        `📸 @yxx0p`,
                    contextInfo: getInstagramContext()
                });

                fs.unlinkSync(obbPath);
            } catch (obbError) {
                logger.error(`OBB error: ${obbError.message}`);
            }
        }

        await sock.sendMessage(sender, { react: { text: '✅', key: message.key } });

    } catch (error) {
        logger.error(`Error: ${error.message}`);
        await sock.sendMessage(sender, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(sender, {
            text: `❌ خطأ: ${error.message}`,
            contextInfo: getInstagramContext()
        });
    }
}

// إرسال تذكير كل 5 دقائق
function sendReminder(sock) {
    setInterval(async () => {
        const now = Date.now();
        if (now - lastReminderTime >= config.bot.reminderInterval) {
            lastReminderTime = now;
            // يمكنك إضافة منطق لإرسال التذكير للمستخدمين النشطين
            logger.info('Reminder interval reached');
        }
    }, 60000); // فحص كل دقيقة
}

// الاتصال بواتساب
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: Browsers.macOS('Chrome'),
        markOnlineOnConnect: true,
        getMessage: async () => ({ conversation: '' })
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error instanceof Boom
                ? lastDisconnect.error.output?.statusCode
                : null;

            const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                statusCode !== DisconnectReason.connectionReplaced;

            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot Connected!');
            sendReminder(sock);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    if (!state.creds.registered) {
        setTimeout(async () => {
            let phone = process.env.PHONE_NUMBER;
            if (!phone) {
                console.log('⚠️ Set PHONE_NUMBER in environment');
                process.exit(1);
            }
            phone = phone.replace(/[^0-9]/g, '');
            try {
                const code = await sock.requestPairingCode(phone);
                console.log(`\n📱 PAIRING CODE: ${code}\n`);
            } catch (error) {
                console.log(`❌ Pairing error: ${error.message}`);
            }
        }, 3000);
    }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const sender = msg.key.remoteJid;
        const isOwner = sender === config.owner.number;

        // رسالة ترحيب للأعضاء الجدد
        if (msg.messageStubType === 27 || msg.messageStubType === 28) {
            await sock.sendMessage(sender, {
                text: config.messages.welcome,
                contextInfo: getInstagramContext()
            });
            return;
        }

        // الأوامر
        if (text.startsWith(config.bot.prefix)) {
            const cmd = text.slice(1).toLowerCase();

            if (cmd === 'help') {
                await sock.sendMessage(sender, {
                    text: config.messages.help,
                    contextInfo: getInstagramContext()
                });
            } else if (cmd === 'ping') {
                const start = Date.now();
                await sock.sendMessage(sender, { text: '🏓 جاري الفحص...' });
                const ping = Date.now() - start;
                await sock.sendMessage(sender, {
                    text: `⚡ *السرعة:* ${ping}ms\n\n📸 @yxx0p`,
                    contextInfo: getInstagramContext()
                });
            } else if (cmd === 'owner') {
                await sock.sendMessage(sender, {
                    text: config.messages.ownerInfo,
                    contextInfo: getInstagramContext()
                });
            }
        } else if (text.length > 0 && !text.startsWith(config.bot.prefix)) {
            // طلب تطبيق
            const appName = text.replace(/\.apk$/i, '').trim();
            if (appName.length > 0) {
                await handleAPKRequest(sock, msg, appName);
            }
        }
    });

    return sock;
}

connectToWhatsApp().catch(err => {
    logger.error(`Fatal: ${err.message}`);
    setTimeout(() => connectToWhatsApp(), 5000);
});
