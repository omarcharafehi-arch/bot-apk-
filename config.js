module.exports = {
    owner: {
        number: 'YOUR_OWNER_NUMBER@s.whatsapp.net', // 9647...
        instagramUrl: 'https://www.instagram.com/yxx0p'
    },
    bot: {
        prefix: '!',
        reminderInterval: 300000 // 5 minutes in ms
    },
    api: {
        timeout: 30000, // 30 seconds
        maxFileSize: 1048576000, // 1 GB (for large APKs/OBBs)
    },
    messages: {
        welcome: '👋 أهلاً بك! لإرسال تطبيق، اكتب اسمه فقط (مثال: "Facebook").',
        help: '🤖 *بوت تحميل التطبيقات*\n\n' +
            '1. اكتب اسم التطبيق (مثل: *WhatsApp*) وسأرسله لك.\n' +
            '2. *!ping* : لفحص سرعة استجابة البوت.\n' +
            '3. *!owner* : لعرض معلومات المطور.\n\n' +
            '📸 المطور: @yxx0p',
        ownerInfo: '👤 *المطور*\n\n' +
            '📸 انستغرام: @yxx0p\n' +
            '🔗 https://www.instagram.com/yxx0p\n\n' +
            '❤️ شكراً لاستخدامك البوت!',
    }
};
