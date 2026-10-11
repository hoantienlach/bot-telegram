const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot Telegram đang chạy 24/7!');
});

app.listen(PORT, () => {
  console.log(`Server HTTP đang chạy trên cổng ${PORT}`);
});

const mongoose = require('mongoose');

// Hỗ trợ cả MONGO_URI và MONGODB_URI để tránh lỗi undefined
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ Lỗi: Chưa cấu hình biến môi trường MONGO_URI trên Render!');
}

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Đã kết nối MongoDB thành công!');
})
.catch((err) => {
  console.error('❌ Lỗi kết nối MongoDB:', err);
});

// Định nghĩa Schema và Model User cho MongoDB
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  total_deposited: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Hàm hỗ trợ lấy hoặc tạo user trên MongoDB
async function getUser(userId) {
  let user = await User.findOne({ telegramId: userId.toString() });
  if (!user) {
    user = new User({ telegramId: userId.toString(), balance: 0, total_deposited: 0 });
    await user.save();
  }
  return user;
}

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { authenticator } = require('otplib');

const token = process.env.BOT_TOKEN || '8151870148:AAEKTEEl-lmMBserauL0mr_A2rLoky98qxM';
const bot = new TelegramBot(token, { polling: true });

// API KEY
const API_KEY_GMAILOTP = '6565dd2cdb5945cea58563c10af9ca6e';
const API_KEY_NPA = 'cmsnpa_2PW1uwK_Pw8wGjIcztt7lMPP336E0l4veVsM7rVvMRU';
const ADMIN_ID = '5426720868'; 

// Username nhóm Telegram
const REQUIRED_GROUP = '@htlach';

// Biến lưu ID dịch vụ động của NPA
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
      console.log('✅ Đã cập nhật ID NPA động:', npaServiceIds);
    }
  } catch (err) {
    console.error('❌ Lỗi tải ID NPA:', err.message);
  }
}

updateNpaServiceIds();

bot.setMyCommands([
  { command: 'start', description: 'Mở menu thuê số & kiểm tra ví' },
  { command: 'nap', description: 'Admin: Nạp tiền (/nap ID Số_tiền)' },
  { command: 'check', description: 'Admin: Kiểm tra số dư (/check ID)' },
  { command: 'stats', description: 'Admin: Thống kê số lượng thành viên & nạp tiền' }
]).then(() => {
  console.log('Đã cập nhật lệnh Telegram thành công!');
}).catch(err => {
  console.error('Lỗi thiết lập lệnh:', err.message);
});

async function checkUserInGroup(userId) {
  // Cho phép tất cả người dùng qua bước kiểm tra nhóm để tránh bị kẹt lệnh /start
  return true;
}

function getServiceInfo(action) {
  const map = {
    'rent_npa_shopee_0': { name: 'Shopee 0', price: 4000, service_id: npaServiceIds.shopee_ga, provider: 'npa' },
    'rent_npa_shopee_1': { name: 'Shopee 1', price: 4000, service_id: npaServiceIds.shopee_ga, provider: 'npa' },
    'rent_npa_shopee_2': { name: 'Shopee 2', price: 4000, service_id: npaServiceIds.shopee_bo, provider: 'npa' },
    'rent_npa_shopee_3': { name: 'Shopee 3', price: 4000, service_id: npaServiceIds.shopee_trau, provider: 'npa' },
    'rent_npa_shopee_4': { name: 'Shopee 4', price: 4000, service_id: npaServiceIds.shopee_call, provider: 'npa' },
    'rent_shopee_vn5': { name: 'Shopee 5', price: 5000, service_id: '15461', provider: 'gmailotp' },
    'rent_shopee_vn8': { name: 'Shopee 6', price: 5000, service_id: '24901', provider: 'gmailotp' },

    'rent_tt_us10': { name: 'TikTok US 10', price: 1600, service_id: '19272', provider: 'gmailotp' },
    'rent_tt_us9': { name: 'TikTok US 9', price: 1600, service_id: '19194', provider: 'gmailotp' },
    'rent_tt_indo21': { name: 'TikTok Indonesia 21', price: 1600, service_id: '19244', provider: 'gmailotp' },
    'rent_tt_chile9': { name: 'TikTok Chile 9', price: 1600, service_id: '19404', provider: 'gmailotp' },
    'rent_tt_chile12': { name: 'TikTok Chile 12', price: 1600, service_id: '26145', provider: 'gmailotp' },
    'rent_tt_chile7': { name: 'TikTok Chile 7', price: 1600, service_id: '3421', provider: 'gmailotp' },
    'rent_tt_colombia7': { name: 'TikTok Colombia 7', price: 1600, service_id: '3429', provider: 'gmailotp' },
    'rent_tt_colombia8': { name: 'TikTok Colombia 8', price: 1600, service_id: '3430', provider: 'gmailotp' },

    'rent_npa_grab_v1': { name: 'Grab V1', price: 3000, service_id: npaServiceIds.grab, provider: 'npa' },
    'rent_npa_lotteria': { name: 'Lotteria', price: 3000, service_id: npaServiceIds.lotteria, provider: 'npa' },
    'rent_npa_katinat': { name: 'Katinat', price: 3000, service_id: npaServiceIds.katinat, provider: 'npa' }
  };
  return map[action];
}

function sendJoinGroupPrompt(chatId) {
  bot.sendMessage(
    chatId,
    `⚠️ **BẠN CHƯA THAM GIA GROUP!**\n\n` +
    `Vui lòng tham gia group bên dưới để tiếp tục sử dụng hệ thống thuê số và 2FA:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Tham gia Group ngay', url: 'https://t.me/htlach' }],
          [{ text: '🔄 Tôi đã tham gia (Kiểm tra lại)', callback_data: 'back_main' }]
        ]
      }
    }
  );
}

async function sendMainMenu(chatId, userId) {
  const user = await getUser(userId);

  const userBalance = (user.balance || 0).toLocaleString();
  const userDeposited = (user.total_deposited || 0).toLocaleString();
  const totalUsers = await User.countDocuments();

  let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA**\n` +
                 `👤 ID của bạn: \`${userId}\`\n` +
                 `💰 Số dư ví: ${userBalance}đ\n` +
                 `💳 Tổng đã nạp: ${userDeposited}đ\n\n` +
                 `👉 *Mẹo:* Dán trực tiếp chuỗi 2FA hoặc Secret Key vào đây bất kỳ lúc nào để lấy mã OTP 6 số!`;

  if (userId === ADMIN_ID) {
    menuText += `\n📊 **Tổng thành viên:** ${totalUsers} người`;
  }

  bot.sendMessage(chatId, menuText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛍️ Thuê Shopee', callback_data: 'menu_shopee' }],
        [{ text: '🎵 Thuê TikTok', callback_data: 'menu_tiktok' }],
        [{ text: '🚗 Thuê Grab', callback_data: 'menu_grab' }],
        [{ text: '⚡ Thuê số khác', callback_data: 'menu_npa' }],
        [
          { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
          { text: '📞 Hỗ trợ Admin', callback_data: 'support_admin' }
        ]
      ]
    }
  });
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  const isJoined = await checkUserInGroup(userId);
  if (!isJoined) {
    return sendJoinGroupPrompt(chatId);
  }

  await getUser(userId);
  sendMainMenu(chatId, userId);
});

bot.onText(/\/nap (\d+) (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);

  const targetUserId = match[1];
  const amount = parseInt(match[2], 10);

  let user = await User.findOne({ telegramId: targetUserId });
  if (!user) {
    user = new User({ telegramId: targetUserId, balance: 0, total_deposited: 0 });
  }

  user.balance = (user.balance || 0) + amount;
  user.total_deposited = (user.total_deposited || 0) + amount;
  await user.save();

  const newBalance = user.balance.toLocaleString();
  const totalDep = user.total_deposited.toLocaleString();

  bot.sendMessage(chatId, `✅ Đã nạp **+${amount.toLocaleString()}đ** cho user \`${targetUserId}\`.\n💰 Số dư mới: ${newBalance}đ\n💳 Tổng đã nạp: ${totalDep}đ`, { parse_mode: 'Markdown' });
  bot.sendMessage(targetUserId, `🎉 Tài khoản của bạn đã được cộng: **+${amount.toLocaleString()}đ**.\n💰 Số dư mới: ${newBalance}đ\n💳 Tổng đã nạp: ${totalDep}đ`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id.toString() !== ADMIN_ID) return;

  const users = await User.find({});
  const totalUsers = users.length;
  let totalDepositedAll = 0;
  let totalBalanceAll = 0;

  users.forEach(user => {
    totalDepositedAll += (user.total_deposited || 0);
    totalBalanceAll += (user.balance || 0);
  });

  bot.sendMessage(
    chatId,
    `📊 **THỐNG KÊ HỆ THỐNG**\n\n` +
    `👥 Tổng thành viên: **${totalUsers}** người\n` +
    `💵 Tổng số tiền đã nạp: **${totalDepositedAll.toLocaleString()}đ**\n` +
    `💰 Tổng số dư ví hiện tại: **${totalBalanceAll.toLocaleString()}đ**`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/check (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (msg.from.id.toString() !== ADMIN_ID) return;
  const targetId = match[1];

  const user = await User.findOne({ telegramId: targetId });
  if (!user) return bot.sendMessage(chatId, `❌ Không tìm thấy user.`);
  
  const bal = (user.balance || 0).toLocaleString();
  const dep = (user.total_deposited || 0).toLocaleString();

  bot.sendMessage(chatId, `🔍 User \`${targetId}\`:\n💰 Số dư ví: **${bal}đ**\n💳 Tổng đã nạp: **${dep}đ**`, { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const isJoined = await checkUserInGroup(userId);
  if (!isJoined) {
    return sendJoinGroupPrompt(chatId);
  }

  let cleanSecret = '';
  if (text.includes('|')) {
    const parts = text.split('|');
    cleanSecret = parts[parts.length - 1].trim().toUpperCase();
  } else {
    cleanSecret = text.replace(/\s+/g, '').toUpperCase();
  }

  try {
    const token2fa = authenticator.generate(cleanSecret);

    bot.sendMessage(
      chatId,
      `🔐 **MÃ 2FA CỦA BẠN:**\n\n` +
      `🔑 Secret: \`${cleanSecret}\`\n` +
      `✅ Mã OTP: \`${token2fa}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {}
});

async function forceCancelGmailOtp(reqId, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const cancelRes = await axios.get(`https://gmailotp.site/api?action=cancel_phone&key=${API_KEY_GMAILOTP}&id=${reqId}`);
      if (cancelRes.data && (cancelRes.data.success === true || cancelRes.data.status === 'success' || cancelRes.data.msg === 'success')) {
        break;
      }
    } catch (err) {}
    await new Promise(res => setTimeout(res, 5000));
  }
}

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id.toString();
  const action = query.data;

  const isJoined = await checkUserInGroup(userId);
  if (!isJoined) {
    bot.answerCallbackQuery(query.id, { text: '⚠️ Bạn cần tham gia group trước!', show_alert: true });
    return sendJoinGroupPrompt(chatId);
  }

  const user = await getUser(userId);

  if (action === 'rent_more' || action === 'back_main') {
    const userBalance = (user.balance || 0).toLocaleString();
    const userDeposited = (user.total_deposited || 0).toLocaleString();
    const totalUsers = await User.countDocuments();

    let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA**\n` +
                   `👤 ID của bạn: \`${userId}\`\n` +
                   `💰 Số dư ví: ${userBalance}đ\n` +
                   `💳 Tổng đã nạp: ${userDeposited}đ\n\n` +
                   `👉 *Mẹo:* Dán trực tiếp chuỗi 2FA hoặc Secret Key vào đây bất kỳ lúc nào để lấy mã OTP 6 số!`;

    if (userId === ADMIN_ID) menuText += `\n📊 **Tổng thành viên:** ${totalUsers} người`;

    return bot.editMessageText(menuText, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Thuê Shopee', callback_data: 'menu_shopee' }],
          [{ text: '🎵 Thuê TikTok', callback_data: 'menu_tiktok' }],
          [{ text: '🚗 Thuê Grab', callback_data: 'menu_grab' }],
          [{ text: '⚡ Thuê số khác', callback_data: 'menu_npa' }],
          [
            { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
            { text: '📞 Hỗ trợ Admin', callback_data: 'support_admin' }
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
          [{ text: '🛍️ Shopee 4 - 4.000đ', callback_data: 'rent_npa_shopee_4' }],
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
          [{ text: '🎵 TikTok US 10 - 1.600đ', callback_data: 'rent_tt_us10' }],
          [{ text: '🎵 TikTok US 9 - 1.600đ', callback_data: 'rent_tt_us9' }],
          [{ text: '🎵 TikTok Indonesia 21 - 1.600đ', callback_data: 'rent_tt_indo21' }],
          [{ text: '🎵 TikTok Chile 9 - 1.600đ', callback_data: 'rent_tt_chile9' }],
          [{ text: '🎵 TikTok Chile 12 - 1.600đ', callback_data: 'rent_tt_chile12' }],
          [{ text: '🎵 TikTok Chile 7 - 1.600đ', callback_data: 'rent_tt_chile7' }],
          [{ text: '🎵 TikTok Colombia 7 - 1.600đ', callback_data: 'rent_tt_colombia7' }],
          [{ text: '🎵 TikTok Colombia 8 - 1.600đ', callback_data: 'rent_tt_colombia8' }],
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

  if (action === 'support_admin') {
    return bot.sendMessage(chatId, `📞 **HỖ TRỢ KHÁCH HÀNG**\n👉 Liên hệ Admin: https://t.me/phanhe`, { disable_web_page_preview: true });
  }

  if (action.startsWith('rent_')) {
    const serviceInfo = getServiceInfo(action);
    if (!serviceInfo) return;

    const price = serviceInfo.price;
    const serviceId = serviceInfo.service_id;
    const provider = serviceInfo.provider;

    if (user.balance < price) {
      return bot.sendMessage(chatId, `❌ **Số dư không đủ!** Bạn cần tối thiểu ${price.toLocaleString()}đ.`, { parse_mode: 'Markdown' });
    }

    try {
      let rawPhone = '';
      let reqId = '';
      let countryLabel = serviceInfo.name;

      if (provider === 'gmailotp') {
        const apiUrl = `https://gmailotp.site/api?action=get_number&key=${API_KEY_GMAILOTP}&id=${serviceId}`;
        const apiResponse = await axios.get(apiUrl);
        const resData = apiResponse.data;

        if (resData && resData.success === true) {
          rawPhone = resData.number || '';
          reqId = resData.request_id || 'N/A';
        } else {
          return bot.sendMessage(chatId, `❌ **Thông báo:** ${resData.message || resData.msg || 'Hết số'}`);
        }
      } else if (provider === 'npa') {
        const apiUrl = `https://otpapi.cmsnpa.com/api/v1/get_number`;
        const apiResponse = await axios.post(apiUrl, { server: serviceId }, {
          headers: {
            'Authorization': `Bearer ${API_KEY_NPA}`,
            'Content-Type': 'application/json'
          }
        });
        const resData = apiResponse.data;

        if (resData && resData.ResponseCode === 0 && resData.Result) {
          rawPhone = resData.Result.Number || '';
          reqId = resData.Result.Id || 'N/A';
        } else {
          return bot.sendMessage(chatId, `❌ **Thông báo NPA:** ${resData.Msg || 'Hết số hoặc lỗi hệ thống'}`);
        }
      }

      user.balance -= price;
      await user.save();

      await bot.sendMessage(
        chatId,
        `✅ **THUÊ SỐ THÀNH CÔNG!**\n\n` +
        `🌐 **Dịch vụ:** ${countryLabel}\n` +
        `📞 **Số điện thoại:** \`${rawPhone}\`\n` +
        `🆔 **Mã đơn:** \`${reqId}\`\n` +
        `💰 **Số dư còn lại:** ${user.balance.toLocaleString()}đ\n\n` +
        `⏳ *Hệ thống đang tự động chờ mã OTP (tối đa 5 phút)...*`,
        { parse_mode: 'Markdown' }
      );

      let isCompleted = false;

      const checkInterval = setInterval(async () => {
        if (isCompleted) return;
        try {
          let otpCode = null;

          if (provider === 'gmailotp') {
            const otpRes = await axios.get(`https://gmailotp.site/api?action=get_code&key=${API_KEY_GMAILOTP}&id=${reqId}`);
            const otpData = otpRes.data;
            otpCode = otpData.otp_code || otpData.code || otpData.otp || otpData.sms;
            if (otpCode === 'is_coming') otpCode = null;
          } else if (provider === 'npa') {
            const otpRes = await axios.post(`https://otpapi.cmsnpa.com/api/v1/check_code`, { id: reqId.toString() }, {
              headers: {
                'Authorization': `Bearer ${API_KEY_NPA}`,
                'Content-Type': 'application/json'
              }
            });
            const otpData = otpRes.data;
            if (otpData && otpData.ok === true && otpData.code) {
              otpCode = otpData.code;
            }
          }

          if (otpCode) {
            isCompleted = true;
            clearInterval(checkInterval);
            clearTimeout(timeoutRefund);

            bot.sendMessage(
              chatId,
              `🎉 **ĐÃ NHẬN ĐƯỢC MÃ OTP!**\n\n` +
              `🌐 **Dịch vụ:** ${countryLabel}\n` +
              `📞 **Số điện thoại:** \`${rawPhone}\`\n` +
              `📩 **MÃ OTP:** \`${otpCode}\``,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[{ text: '🔄 Lấy số khác cùng loại', callback_data: action }]]
                }
              }
            );
          }
        } catch (e) {
          console.error('Lỗi check OTP:', e.message);
        }
      }, 5000);

      const timeoutRefund = setTimeout(async () => {
        if (isCompleted) return;
        isCompleted = true;
        clearInterval(checkInterval);

        if (provider === 'gmailotp' && reqId && reqId !== 'N/A') {
          forceCancelGmailOtp(reqId, 5);
        }

        let currentUser = await User.findOne({ telegramId: userId.toString() });
        if (currentUser) {
          currentUser.balance += price;
          await currentUser.save();

          bot.sendMessage(
            chatId,
            `⏰ **ĐÃ HẾT 5 PHÚT!** Đơn hàng \`${reqId}\` đã được hoàn tiền **${price.toLocaleString()}đ** vào ví.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🔄 Lấy số khác cùng loại', callback_data: action }]]
              }
            }
          ).catch(() => {});
        }
      }, 300 * 1000);

    } catch (err) {
      console.error(err.message);
      bot.sendMessage(chatId, `❌ Lỗi kết nối máy chủ!`);
    }
  }
});

console.log('Bot đang chạy...');
