const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bot Telegram đang chạy 24/7!');
});

// WEBHOOK NHẬN TIỀN TỰ ĐỘNG TỪ SEPAY (TPBANK)
app.post('/webhook/sepay', async (req, res) => {
  try {
    const data = req.body;
    console.log('👉 Nhận Webhook SePay:', data);

    const content = (data.content || data.description || '').toLowerCase();
    const transferAmount = parseInt(data.transferAmount || data.amount || 0, 10);

    const pendingDeposit = await Deposit.findOne({
      amount: transferAmount,
      status: 'pending',
      $expr: {
        $setIsSubset: [
          { $split: ["$content", " "] },
          { $split: [content, " "] }
        ]
      }
    });

    if (pendingDeposit) {
      pendingDeposit.status = 'success';
      await pendingDeposit.save();

      const user = await User.findOneAndUpdate(
        { userId: pendingDeposit.userId },
        { $inc: { balance: transferAmount, total_deposited: transferAmount } },
        { new: true, upsert: true }
      );

      bot.sendMessage(
        pendingDeposit.userId,
        `🎉 **NẠP TIỀN TỰ ĐỘNG THÀNH CÔNG!**\n\n` +
        `💵 Số tiền nhận: **+${transferAmount.toLocaleString()}đ**\n` +
        `💰 Số dư ví hiện tại: **${user.balance.toLocaleString()}đ**`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Lỗi Webhook nạp tiền:', err.message);
    res.status(500).json({ success: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server HTTP đang chạy trên cổng ${PORT}`);
});

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');
const { authenticator } = require('otplib');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://hoantienlach_db_user:hoantienlach@cluster0.lruwdot.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Đã kết nối thành công tới MongoDB Atlas!'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err.message));

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  total_deposited: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const depositSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  content: { type: String, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now, expires: 300 }
});
const Deposit = mongoose.model('Deposit', depositSchema);

async function getUser(userId) {
  let user = await User.findOne({ userId: userId });
  if (!user) {
    user = await User.create({ userId: userId, balance: 0, total_deposited: 0 });
  }
  return user;
}

const token = process.env.BOT_TOKEN || '8151870148:AAHdqXysbRCDq0JHaBCqhpWzAXBFCnEi5cg';
const bot = new TelegramBot(token, { polling: true });

const API_KEY_GMAILOTP = '6565dd2cdb5945cea58563c10af9ca6e';
const API_KEY_NPA = 'cmsnpa_2PW1uwK_Pw8wGjIcztt7lMPP336E0l4veVsM7rVvMRU';
const ADMIN_ID = '5426720868'; 

const REQUIRED_CHANNEL = '@htlach'; 
const INVITE_LINK = 'https://t.me/+TDKbQXkqoV5hZmQ1'; 

// BIẾN TRẠNG THÁI BẢO TRÌ (Mặc định là false - chạy bình thường)
let isMaintenanceMode = false;

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;
const userState = new Map();

function checkSpam(userId) {
  if (userId.toString() === ADMIN_ID) return false;
  const now = Date.now();
  const lastTime = cooldowns.get(userId) || 0;
  if (now - lastTime < COOLDOWN_TIME) {
    return true;
  }
  cooldowns.set(userId, now);
  return false;
}

async function checkUserMembership(userId) {
  if (userId.toString() === ADMIN_ID) return true;
  try {
    const chatMember = await bot.getChatMember(REQUIRED_CHANNEL, userId);
    const status = chatMember.status;
    return (status === 'creator' || status === 'administrator' || status === 'member');
  } catch (err) {
    console.error('Lỗi check membership:', err.message);
    return false;
  }
}

const verbs = ["banh", "mua", "an", "uong", "chuyen", "gui", "nap", "tra"];
const nouns = ["cho", "ga", "vit", "xe", "nha", "tien", "qua", "com"];
const adjectives = ["dao", "na", "tao", "oi", "me", "xoai", "dua", "mit"];

function randomText() {
  const v = verbs[Math.floor(Math.random() * verbs.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  return `${v} ${n}${a}`;
}

let npaServiceIds = {
  shopee_ga: 'shopee_ga',
  shopee_bo: 'shopee_bo',
  shopee_trau: 'shopee_trau',
  shopee_call: 'shopee_call',
  grab: 'dyn_227006400d',
  lotteria: 'lotteria',
  katinat: 'katinat'
};

async function updateNpaServiceIds() {
  try {
    const res = await axios.get('https://otpapi.cmsnpa.com/api/v1/services');
    if (res.data && res.data.services && Array.isArray(res.data.services)) {
      res.data.services.forEach(srv => {
        const label = (srv.label || '').toLowerCase();
        if (label.includes('shopee gà') || label.includes('shopee ga')) npaServiceIds.shopee_ga = srv.id;
        else if (label.includes('shopee bò') || label.includes('shopee bo')) npaServiceIds.shopee_bo = srv.id;
        else if (label.includes('shopee trâu') || label.includes('shopee trau')) npaServiceIds.shopee_trau = srv.id;
        else if (label.includes('shopee call')) npaServiceIds.shopee_call = srv.id;
        else if (label.includes('grab')) npaServiceIds.grab = srv.id;
        else if (label.includes('lotteria')) npaServiceIds.lotteria = srv.id;
        else if (label.includes('katinat')) npaServiceIds.katinat = srv.id;
      });
    }
  } catch (err) {}
}
updateNpaServiceIds();

async function setupBotCommands() {
  try {
    await bot.setMyCommands([
      { command: 'start', description: 'Mở menu thuê số & ví' }
    ]);

    await bot.setMyCommands([
      { command: 'start', description: 'Mở menu thuê số & ví' },
      { command: 'nap', description: 'Admin: Nạp tiền trực tiếp' },
      { command: 'baotri', description: 'Admin: Bật/Tắt chế độ bảo trì' },
      { command: 'sendall', description: 'Admin: Gửi thông báo toàn bộ user' }
    ], {
      scope: { type: 'chat', chat_id: ADMIN_ID }
    });
  } catch (e) {
    console.error('Lỗi cài đặt setMyCommands:', e.message);
  }
}
setupBotCommands();

function getServiceInfo(action) {
  const map = {
    'rent_npa_shopee_0': { name: 'Shopee 0', price: 4000, service_id: npaServiceIds.shopee_ga, provider: 'npa' },
    'rent_npa_shopee_1': { name: 'Shopee 1', price: 4000, service_id: npaServiceIds.shopee_ga, provider: 'npa' },
    'rent_npa_shopee_2': { name: 'Shopee 2', price: 4000, service_id: npaServiceIds.shopee_bo, provider: 'npa' },
    'rent_npa_shopee_3': { name: 'Shopee 3', price: 4000, service_id: npaServiceIds.shopee_trau, provider: 'npa' },
    'rent_npa_shopee_4': { name: 'Shopee 4', price: 2500, service_id: npaServiceIds.shopee_call, provider: 'npa' },
    'rent_shopee_vn5': { name: 'Shopee 5', price: 5000, service_id: '15461', provider: 'gmailotp' },
    'rent_shopee_vn8': { name: 'Shopee 6', price: 5000, service_id: '24901', provider: 'gmailotp' },
    'rent_tt_us10': { name: 'TikTok US 10', price: 1200, service_id: '19272', provider: 'gmailotp' },
    'rent_tt_us9': { name: 'TikTok US 9', price: 1200, service_id: '19194', provider: 'gmailotp' },
    'rent_tt_indo21': { name: 'TikTok Indonesia 21', price: 1200, service_id: '19244', provider: 'gmailotp' },
    'rent_tt_chile9': { name: 'TikTok Chile 9', price: 1200, service_id: '19404', provider: 'gmailotp' },
    'rent_tt_chile12': { name: 'TikTok Chile 12', price: 1200, service_id: '26145', provider: 'gmailotp' },
    'rent_tt_chile7': { name: 'TikTok Chile 7', price: 1200, service_id: '3421', provider: 'gmailotp' },
    'rent_tt_colombia7': { name: 'TikTok Colombia 7', price: 1200, service_id: '3429', provider: 'gmailotp' },
    'rent_tt_colombia8': { name: 'TikTok Colombia 8', price: 1200, service_id: '3430', provider: 'gmailotp' },
    'rent_npa_grab_v1': { name: 'Grab V1', price: 3000, service_id: npaServiceIds.grab, provider: 'npa' },
    'rent_npa_lotteria': { name: 'Lotteria', price: 3000, service_id: npaServiceIds.lotteria, provider: 'npa' },
    'rent_npa_katinat': { name: 'Katinat', price: 3000, service_id: npaServiceIds.katinat, provider: 'npa' }
  };
  return map[action];
}

async function sendMainMenu(chatId, userId) {
  userState.delete(userId);
  const user = await getUser(userId);
  const userBalance = (user.balance || 0).toLocaleString();
  const userDeposited = (user.total_deposited || 0).toLocaleString();

  let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA**\n` +
                 `👤 ID của bạn: \`${userId}\`\n` +
                 `💰 Số dư ví: ${userBalance}đ\n` +
                 `💳 Tổng đã nạp: ${userDeposited}đ\n\n` +
                 `👉 *Mẹo:* Dán trực tiếp chuỗi 2FA hoặc Secret Key vào đây bất kỳ lúc nào để lấy mã OTP 6 số!`;

  if (userId === ADMIN_ID) {
    const users = await User.find({});
    const totalUsers = users.length;
    let totalDepositedAll = 0;
    users.forEach(u => { totalDepositedAll += (u.total_deposited || 0); });

    menuText += `\n\n📊 **THỐNG KÊ HỆ THỐNG:**\n` +
                `👥 Tổng thành viên: **${totalUsers}** người\n` +
                `💵 Tổng tiền nạp tất cả: **${totalDepositedAll.toLocaleString()}đ**\n` +
                `🛠️ Trạng thái bảo trì: **${isMaintenanceMode ? 'ĐANG BẬT 🔴' : 'ĐANG TẮT 🟢'}**`;
  }

  bot.sendMessage(chatId, menuText, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎵 Thuê TikTok', callback_data: 'menu_tiktok' }],
        [{ text: '🛍️ Thuê Shopee', callback_data: 'menu_shopee' }],
        [{ text: '🚗 Thuê Grab', callback_data: 'menu_grab' }],
        [{ text: '⚡ Thuê số khác', callback_data: 'menu_npa' }],
        [{ text: '💳 Nạp tiền tự động', callback_data: 'menu_nap' }],
        [
          { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
          { text: '📞 Hỗ trợ Admin', url: 'https://t.me/phanhe' }
        ]
      ]
    }
  });
}

async function sendDepositMenu(chatId, messageId = null) {
  const text = `💰 **NẠP TIỀN TỰ ĐỘNG**\n\nChọn nhanh số tiền hoặc bấm nhập số tiền khác (Tối thiểu 10.000đ):`;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '10.000đ', callback_data: 'dep_10000' },
        { text: '20.000đ', callback_data: 'dep_20000' }
      ],
      [
        { text: '50.000đ', callback_data: 'dep_50000' },
        { text: '100.000đ', callback_data: 'dep_100000' }
      ],
      [{ text: '✏️ Nhập số tiền khác', callback_data: 'dep_custom' }],
      [{ text: '🏠 Trang chủ', callback_data: 'back_main' }]
    ]
  };

  if (messageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: replyMarkup }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: replyMarkup });
  }
}

async function createAndSendQR(chatId, userId, amount) {
  const content = randomText();
  const orderId = 'ORD' + Date.now();

  await Deposit.create({ orderId, userId, amount, content, status: 'pending' });

  const bankId = 'TPB';
  const accountNo = '10005968827';
  const accountName = 'DINH CONG HOAT';
  const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;

  const caption = `💰 **THÔNG TIN CHUYỂN KHOẢN (TPBANK)**\n\n` +
                  `🏛️ Ngân hàng: **TPBank**\n` +
                  `💳 Số tài khoản: \`${accountNo}\`\n` +
                  `👤 Chủ tài khoản: **${accountName}**\n` +
                  `💵 Số tiền: **${amount.toLocaleString()}đ**\n` +
                  `📝 Nội dung: \`${content}\`\n\n` +
                  `⚠️ *Không sửa số tiền hoặc nội dung.*\n` +
                  `⏳ Hệ thống sẽ tự cộng tiền sau vài giây khi bạn chuyển khoản thành công!`;

  bot.sendPhoto(chatId, qrUrl, {
    caption: caption,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Kiểm tra số dư', callback_data: 'check_balance' }],
        [{ text: '💰 Tạo QR khác', callback_data: 'menu_nap' }],
        [{ text: '🏠 Trang chủ', callback_data: 'back_main' }]
      ]
    }
  });
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;

  if (!text) return;

  // NẾU ĐANG BẬT BẢO TRÌ VÀ KHÔNG PHẢI ADMIN THÌ CHẶN NGAY
  if (isMaintenanceMode && userId !== ADMIN_ID) {
    return bot.sendMessage(
      chatId, 
      `🛠️ **HỆ THỐNG ĐANG BẢO TRÌ**\n\nBot hiện đang tạm dừng hoạt động để nâng cấp và sửa lỗi. Vui lòng quay lại sau!`,
      { parse_mode: 'Markdown' }
    );
  }

  if (checkSpam(userId)) {
    return bot.sendMessage(chatId, `⚠️ Bạn thao tác quá nhanh! Vui lòng đợi vài giây trước khi tiếp tục.`).catch(() => {});
  }

  // XỬ LÝ LỆNH BẬT/TẮT BẢO TRÌ CHO ADMIN: /baotri on hoặc /baotri off
  if (text.startsWith('/baotri')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const parts = text.split(' ');
    const status = parts[1] ? parts[1].toLowerCase() : '';

    if (status === 'on') {
      isMaintenanceMode = true;
      return bot.sendMessage(chatId, `🔴 **Đã BẬT chế độ bảo trì!** Thành viên thường sẽ không sử dụng được bot. Chỉ có Admin được phép thao tác.`);
    } else if (status === 'off') {
      isMaintenanceMode = false;
      return bot.sendMessage(chatId, `🟢 **Đã TẮT chế độ bảo trì!** Bot đã hoạt động bình thường trở lại cho mọi thành viên.`);
    } else {
      return bot.sendMessage(chatId, `ℹ️ Trạng thái bảo trì hiện tại: **${isMaintenanceMode ? 'ĐANG BẬT 🔴' : 'ĐANG TẮT 🟢'}**\n\n👉 Cách dùng:\n- Bật: \`/baotri on\`\n- Tắt: \`/baotri off\``, { parse_mode: 'Markdown' });
    }
  }

  // XỬ LÝ NHẬP SỐ TIỀN TÙY CHỌN
  if (userState.get(userId) === 'awaiting_deposit_amount') {
    const cleanNumberText = text.replace(/[^0-9]/g, '');
    const customAmount = parseInt(cleanNumberText, 10);

    if (isNaN(customAmount) || customAmount < 10000) {
      return bot.sendMessage(chatId, `⚠️ **Số tiền không hợp lệ!**\n\nVui lòng nhập số tiền từ **10.000đ** trở lên (Ví dụ gửi: \`15000\` hoặc \`200000\`):`, { parse_mode: 'Markdown' });
    }

    userState.delete(userId);
    return createAndSendQR(chatId, userId, customAmount);
  }

  if (text.startsWith('/sendall')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const messageContent = text.replace('/sendall', '').trim();
    if (!messageContent) {
      return bot.sendMessage(chatId, `⚠️ Vui lòng nhập nội dung thông báo. Ví dụ: /sendall Bảo trì hệ thống...`);
    }

    bot.sendMessage(chatId, `⏳ Đang gửi thông báo đến tất cả thành viên...`);
    
    try {
      const allUsers = await User.find({});
      let successCount = 0;
      let failCount = 0;

      for (const u of allUsers) {
        try {
          await bot.sendMessage(
            u.userId,
            `📢 **THÔNG BÁO TỪ HỆ THỐNG**\n\n${messageContent}`,
            { parse_mode: 'Markdown', disable_web_page_preview: true }
          );
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          failCount++;
        }
      }

      bot.sendMessage(chatId, `✅ **GỬI THÔNG BÁO HOÀN TẤT!**\n- Thành công: ${successCount}\n- Thất bại (chặn bot): ${failCount}`, { parse_mode: 'Markdown' });
    } catch (err) {
      bot.sendMessage(chatId, `❌ Lỗi khi gửi thông báo hàng loạt.`);
    }
    return;
  }

  const isJoined = await checkUserMembership(userId);
  if (!isJoined) {
    return bot.sendMessage(
      chatId, 
      `⚠️ **BẠN CHƯA THAM GIA NHÓM!**\n\n` +
      `👉 Vui lòng tham gia nhóm chính thức của hệ thống để sử dụng đầy đủ các tính năng thuê số và nạp tiền tự động.`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Tham gia nhóm ngay', url: INVITE_LINK }],
            [{ text: '🔄 Đã tham gia, bấm để tiếp tục /start', callback_data: 'back_main' }]
          ]
        }
      }
    );
  }

  if (text.startsWith('/start') || text.startsWith('/menu')) {
    return sendMainMenu(chatId, userId);
  }

  if (text.startsWith('/nap')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Không có quyền!`);
    const parts = text.split(' ');
    if (parts.length >= 3) {
      const targetUserId = parts[1];
      const amount = parseInt(parts[2], 10);
      const user = await User.findOneAndUpdate(
        { userId: targetUserId },
        { $inc: { balance: amount, total_deposited: amount } },
        { new: true, upsert: true }
      );
      bot.sendMessage(chatId, `✅ Đã nạp +${amount.toLocaleString()}đ cho user \`${targetUserId}\``, { parse_mode: 'Markdown' });
      bot.sendMessage(targetUserId, `🎉 Tài khoản được cộng: **+${amount.toLocaleString()}đ**\n💰 Số dư: ${user.balance.toLocaleString()}đ`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    return;
  }

  if (text.startsWith('/')) return;

  // LỌC CHUỖI 2FA SIÊU SẠCH: CHỈ GIỮ LẠI CÁC KÝ TỰ VALID BASE32 (A-Z VÀ 2-7)
  let rawSecret = text.includes('|') ? text.split('|').pop() : text;
  let cleanSecret = rawSecret.toUpperCase().replace(/[^A-Z2-7]/g, '');

  if (cleanSecret.length >= 16) {
    try {
      const token2fa = authenticator.generate(cleanSecret);
      return bot.sendMessage(chatId, `🔐 **MÃ 2FA:**\n🔑 Secret: \`${cleanSecret}\`\n✅ OTP: \`${token2fa}\``, { parse_mode: 'Markdown' });
    } catch (err) {}
  } else {
    bot.sendMessage(chatId, `❌ Chuỗi Secret Key không hợp lệ! Vui lòng kiểm tra lại.`);
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id.toString();
  const action = query.data;

  // NẾU ĐANG BẬT BẢO TRÌ VÀ KHÔNG PHẢI ADMIN THÌ CHẶN NÚT BẤM
  if (isMaintenanceMode && userId !== ADMIN_ID) {
    return bot.answerCallbackQuery(query.id, { text: `🛠️ Hệ thống đang bảo trì, vui lòng quay lại sau!`, show_alert: true });
  }

  const isJoined = await checkUserMembership(userId);
  if (!isJoined) {
    return bot.answerCallbackQuery(query.id, { text: `❌ Vui lòng bấm tham gia nhóm trước!`, show_alert: true });
  }

  const user = await getUser(userId);

  if (action === 'menu_nap') {
    userState.delete(userId);
    bot.deleteMessage(chatId, messageId).catch(() => {});
    return sendDepositMenu(chatId);
  }

  if (action === 'dep_custom') {
    userState.set(userId, 'awaiting_deposit_amount');
    return bot.sendMessage(
      chatId,
      `✏️ **NHẬP SỐ TIỀN BẠN MUỐN NẠP**\n\n` +
      `👉 Vui lòng dán/nhập số tiền muốn nạp vào ô tin nhắn bên dưới (Tối thiểu **10.000đ**).\n` +
      `*Ví dụ:* Nhập \`15000\` hoặc \`500000\``,
      { parse_mode: 'Markdown' }
    );
  }

  if (action.startsWith('dep_')) {
    userState.delete(userId);
    const amount = parseInt(action.replace('dep_', ''), 10);
    bot.deleteMessage(chatId, messageId).catch(() => {});
    return createAndSendQR(chatId, userId, amount);
  }

  if (action === 'rent_more' || action === 'back_main') {
    userState.delete(userId);
    const userBalance = (user.balance || 0).toLocaleString();
    const userDeposited = (user.total_deposited || 0).toLocaleString();

    let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA**\n` +
                   `👤 ID của bạn: \`${userId}\`\n` +
                   `💰 Số dư ví: ${userBalance}đ\n` +
                   `💳 Tổng đã nạp: ${userDeposited}đ\n\n` +
                   `👉 *Mẹo:* Dán trực tiếp chuỗi 2FA hoặc Secret Key vào đây bất kỳ lúc nào để lấy mã OTP 6 số!`;

    if (userId === ADMIN_ID) {
      const users = await User.find({});
      const totalUsers = users.length;
      let totalDepositedAll = 0;
      users.forEach(u => { totalDepositedAll += (u.total_deposited || 0); });

      menuText += `\n\n📊 **THỐNG KÊ HỆ THỐNG:**\n` +
                  `👥 Tổng thành viên: **${totalUsers}** người\n` +
                  `💵 Tổng tiền nạp tất cả: **${totalDepositedAll.toLocaleString()}đ**\n` +
                  `🛠️ Trạng thái bảo trì: **${isMaintenanceMode ? 'ĐANG BẬT 🔴' : 'ĐANG TẮT 🟢'}**`;
    }

    if (query.message.photo) {
      bot.deleteMessage(chatId, messageId).catch(() => {});
      return bot.sendMessage(chatId, menuText, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎵 Thuê TikTok', callback_data: 'menu_tiktok' }],
            [{ text: '🛍️ Thuê Shopee', callback_data: 'menu_shopee' }],
            [{ text: '🚗 Thuê Grab', callback_data: 'menu_grab' }],
            [{ text: '⚡ Thuê số khác', callback_data: 'menu_npa' }],
            [{ text: '💳 Nạp tiền tự động', callback_data: 'menu_nap' }],
            [
              { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
              { text: '📞 Hỗ trợ Admin', url: 'https://t.me/phanhe' }
            ]
          ]
        }
      });
    }

    return bot.editMessageText(menuText, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎵 Thuê TikTok', callback_data: 'menu_tiktok' }],
          [{ text: '🛍️ Thuê Shopee', callback_data: 'menu_shopee' }],
          [{ text: '🚗 Thuê Grab', callback_data: 'menu_grab' }],
          [{ text: '⚡ Thuê số khác', callback_data: 'menu_npa' }],
          [{ text: '💳 Nạp tiền tự động', callback_data: 'menu_nap' }],
          [
            { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
            { text: '📞 Hỗ trợ Admin', url: 'https://t.me/phanhe' }
          ]
        ]
      }
    });
  }

  if (action === 'menu_shopee') {
    return bot.editMessageText(`🛍️ **CHỌN DỊCH VỤ SHOPEE**`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Shopee 0 - 4.000đ', callback_data: 'rent_npa_shopee_0' }],
          [{ text: '🛍️ Shopee 1 - 4.000đ', callback_data: 'rent_npa_shopee_1' }],
          [{ text: '🛍️ Shopee 2 - 4.000đ', callback_data: 'rent_npa_shopee_2' }],
          [{ text: '🛍️ Shopee 3 - 4.000đ', callback_data: 'rent_npa_shopee_3' }],
          [{ text: '🛍️ Shopee 4 - 2.500đ', callback_data: 'rent_npa_shopee_4' }],
          [{ text: '🛍️ Shopee 5 - 5.000đ', callback_data: 'rent_shopee_vn5' }],
          [{ text: '🛍️ Shopee 6 - 5.000đ', callback_data: 'rent_shopee_vn8' }],
          [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
        ]
      }
    });
  }

  if (action === 'menu_tiktok') {
    return bot.editMessageText(`🎵 **CHỌN MÃ VÙNG TIKTOK**`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎵 TikTok US 10 - 1.200đ', callback_data: 'rent_tt_us10' }],
          [{ text: '🎵 TikTok US 9 - 1.200đ', callback_data: 'rent_tt_us9' }],
          [{ text: '🎵 TikTok Indonesia 21 - 1.200đ', callback_data: 'rent_tt_indo21' }],
          [{ text: '🎵 TikTok Chile 9 - 1.200đ', callback_data: 'rent_tt_chile9' }],
          [{ text: '🎵 TikTok Chile 12 - 1.200đ', callback_data: 'rent_tt_chile12' }],
          [{ text: '🎵 TikTok Chile 7 - 1.200đ', callback_data: 'rent_tt_chile7' }],
          [{ text: '🎵 TikTok Colombia 7 - 1.200đ', callback_data: 'rent_tt_colombia7' }],
          [{ text: '🎵 TikTok Colombia 8 - 1.200đ', callback_data: 'rent_tt_colombia8' }],
          [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
        ]
      }
    });
  }

  if (action === 'menu_grab') {
    return bot.editMessageText(`🚗 **CHỌN DỊCH VỤ GRAB**`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚗 Grab V1 - 3.000đ', callback_data: 'rent_npa_grab_v1' }],
          [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
        ]
      }
    });
  }

  if (action === 'menu_npa') {
    return bot.editMessageText(`⚡ **DANH SÁCH DỊCH VỤ KHÁC**`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡ Lotteria - 3.000đ', callback_data: 'rent_npa_lotteria' }],
          [{ text: '⚡ Katinat - 3.000đ', callback_data: 'rent_npa_katinat' }],
          [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
        ]
      }
    });
  }

  if (action === 'check_balance') {
    const bal = (user.balance || 0).toLocaleString();
    const dep = (user.total_deposited || 0).toLocaleString();
    return bot.answerCallbackQuery(query.id, { text: `💰 Số dư ví: ${bal}đ | 💳 Tổng nạp: ${dep}đ`, show_alert: true });
  }

  if (action.startsWith('rent_')) {
    if (checkSpam(userId)) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ Bạn bấm quá nhanh, vui lòng từ từ!', show_alert: true });
    }

    const serviceInfo = getServiceInfo(action);
    if (!serviceInfo) return;

    const price = serviceInfo.price;
    const serviceId = serviceInfo.service_id;
    const provider = serviceInfo.provider;
    const isAdmin = (userId === ADMIN_ID);

    if (!isAdmin && user.balance < price) {
      return bot.sendMessage(chatId, `❌ **Số dư không đủ!** Cần tối thiểu ${price.toLocaleString()}đ.`, { parse_mode: 'Markdown' });
    }

    let updatedUser = user;
    if (!isAdmin) {
      updatedUser = await User.findOneAndUpdate(
        { userId: userId },
        { $inc: { balance: -price } },
        { new: true }
      );
    }

    try {
      let rawPhone = '';
      let reqId = '';
      let countryLabel = serviceInfo.name;

      if (provider === 'gmailotp') {
        const apiResponse = await axios.get(`https://gmailotp.site/api?action=get_number&key=${API_KEY_GMAILOTP}&id=${serviceId}`);
        const resData = apiResponse.data;
        if (resData && resData.success === true) {
          rawPhone = resData.number || '';
          reqId = resData.request_id || 'N/A';
        } else {
          if (!isAdmin) {
            await User.updateOne({ userId: userId }, { $inc: { balance: price } });
          }
          const errorMsg = resData.message || resData.msg || 'Hết số';
          return bot.sendMessage(chatId, `❌ Không thể thuê số: ${errorMsg}`);
        }
      } else if (provider === 'npa') {
        const apiResponse = await axios.post(`https://otpapi.cmsnpa.com/api/v1/get_number`, { server: serviceId }, {
          headers: { 'Authorization': `Bearer ${API_KEY_NPA}`, 'Content-Type': 'application/json' }
        });
        const resData = apiResponse.data;
        if (resData && resData.ResponseCode === 0 && resData.Result) {
          rawPhone = resData.Result.Number || '';
          reqId = resData.Result.Id || 'N/A';
        } else {
          if (!isAdmin) {
            await User.updateOne({ userId: userId }, { $inc: { balance: price } });
          }
          const errorMsg = resData.Msg || 'Hết số';
          return bot.sendMessage(chatId, `❌ Không thể thuê số: ${errorMsg}`);
        }
      }

      const balanceDisplay = isAdmin ? "Miễn phí (Admin)" : `${updatedUser.balance.toLocaleString()}đ`;

      await bot.sendMessage(
        chatId,
        `✅ **THUÊ SỐ THÀNH CÔNG!**\n\n` +
        `🌐 **Dịch vụ:** ${countryLabel}\n` +
        `📞 **Số điện thoại:** \`${rawPhone}\`\n` +
        `🆔 **Mã đơn:** \`${reqId}\`\n` +
        `💰 **Số dư còn lại:** ${balanceDisplay}\n\n` +
        `⏳ *Đang chờ mã OTP (tối đa 5 phút)...*`,
        { parse_mode: 'Markdown' }
      );

      let isCompleted = false;
      const checkInterval = setInterval(async () => {
        if (isCompleted) return;
        try {
          let otpCode = null;
          if (provider === 'gmailotp') {
            const otpRes = await axios.get(`https://gmailotp.site/api?action=get_code&key=${API_KEY_GMAILOTP}&id=${reqId}`);
            let resOtp = otpRes.data.otp_code || otpRes.data.code || otpRes.data.otp || otpRes.data.sms;
            
            if (resOtp && typeof resOtp === 'string') {
              const cleanOtp = resOtp.trim().toLowerCase();
              if (!['is_coming', 'too_fast', 'wait', 'pending', 'none'].includes(cleanOtp)) {
                otpCode = resOtp;
              }
            }
          } else if (provider === 'npa') {
            const otpRes = await axios.post(`https://otpapi.cmsnpa.com/api/v1/check_code`, { id: reqId.toString() }, {
              headers: { 'Authorization': `Bearer ${API_KEY_NPA}`, 'Content-Type': 'application/json' }
            });
            if (otpRes.data && otpRes.data.ok === true && otpRes.data.code) {
              otpCode = otpRes.data.code;
            }
          }

          if (otpCode) {
            isCompleted = true;
            clearInterval(checkInterval);
            clearTimeout(timeoutRefund);
            
            bot.sendMessage(
              chatId,
              `🎉 **ĐÃ NHẬN ĐƯỢC MÃ OTP CHO ĐƠN \`${reqId}\`**\n🔑 Mã OTP: \`${otpCode}\``,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔄 Lấy số khác cùng loại', callback_data: action }]]
                }
              }
            ).catch(() => {});
          }
        } catch (e) {}
      }, 10000);

      const timeoutRefund = setTimeout(async () => {
        if (isCompleted) return;
        isCompleted = true;
        clearInterval(checkInterval);

        if (provider === 'gmailotp' && reqId !== 'N/A') {
          axios.get(`https://gmailotp.site/api?action=cancel_phone&key=${API_KEY_GMAILOTP}&id=${reqId}`).catch(() => {});
        }

        let refundMsg = `⏰ **ĐÃ HẾT 5 PHÚT!** Đơn hàng \`${reqId}\` đã được hoàn tiền **${price.toLocaleString()}đ** vào ví.`;
        if (isAdmin) {
          refundMsg = `⏰ **ĐÃ HẾT 5 PHÚT!** Đã hủy đơn hàng \`${reqId}\` (Tài khoản Admin miễn phí).`;
        } else {
          await User.updateOne({ userId: userId }, { $inc: { balance: price } });
        }

        bot.sendMessage(chatId, refundMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🔄 Lấy số khác cùng loại', callback_data: action }]]
          }
        }).catch(() => {});

      }, 300 * 1000);

    } catch (err) {
      if (!isAdmin) {
        await User.updateOne({ userId: userId }, { $inc: { balance: price } });
      }
      bot.sendMessage(chatId, `❌ Lỗi máy chủ, hệ thống đã hoàn lại tiền vào ví cho bạn!`);
    }
  }
});

console.log('Bot đang chạy...');
