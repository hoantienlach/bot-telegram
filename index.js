const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot Telegram đang chạy 24/7!');
});

app.listen(PORT, () => {
  console.log(`Server HTTP đang chạy trên cổng ${PORT}`);
});

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const { authenticator } = require('otplib');

const USERS_FILE = './users.json';
const userStates = {};

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}));
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Lỗi khi đọc file users.json:', err);
    return {};
  }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Lỗi khi ghi file users.json:', err);
  }
}

const token = process.env.BOT_TOKEN || '8916854577:AAFhqasLZhIcXgDq4onY0PJ_mIQqdHMhjmc';
const bot = new TelegramBot(token, { polling: true });

// API KEY
const API_KEY_GMAILOTP = '6565dd2cdb5945cea58563c10af9ca6e';
const API_KEY_NPA = 'cmsnpa_2PW1uwK_Pw8wGjIcztt7lMPP336E0l4veVsM7rVvMRU';
const ADMIN_ID = '5426720868'; 

// ID hoặc Username của Group bắt buộc gia nhập (Nếu dùng link mời dạng invite link, bạn cần lấy Chat ID số của group, ví dụ: -100xxxxxxxxxx)
const REQUIRED_GROUP = '@hoantienlach_group'; // Thay bằng Username hoặc ID số của group Telegram của bạn

bot.setMyCommands([
  { command: 'start', description: 'Mở menu thuê số & kiểm tra ví' },
  { command: 'nap', description: 'Admin: Nạp tiền (/nap ID Số_tiền)' },
  { command: 'check', description: 'Admin: Kiểm tra số dư (/check ID)' },
  { command: 'stats', description: 'Admin: Thống kê số lượng thành viên' },
  { command: 'broadcast', description: 'Admin: Gửi thông báo toàn hệ thống' }
]).then(() => {
  console.log('Đã cập nhật danh sách lệnh Telegram thành công!');
}).catch(err => {
  console.error('Lỗi thiết lập danh sách lệnh:', err.message);
});

// Hàm kiểm tra thành viên group
async function checkUserInGroup(userId) {
  if (userId === ADMIN_ID) return true; // Admin luôn được phép
  try {
    const chatMember = await bot.getChatMember(REQUIRED_GROUP, userId);
    const status = chatMember.status;
    // Các trạng thái được coi là thành viên hợp lệ
    if (['creator', 'administrator', 'member'].includes(status)) {
      return true;
    }
    return false;
  } catch (err) {
    console.error('Lỗi kiểm tra group:', err.message);
    return false; // Nếu bot chưa làm admin group hoặc lỗi, mặc định chặn hoặc cấu hình lại
  }
}

// Danh sách dịch vụ
const SERVICE_MAPPING = {
  'rent_npa_shopee_ga': { name: 'Shopee Gà', price: 4000, service_id: 'shopee_ga', provider: 'npa' },
  'rent_npa_shopee_1': { name: 'Shopee 1', price: 4000, service_id: 'shopee_ga', provider: 'npa' },
  'rent_npa_shopee_2': { name: 'Shopee 2', price: 4000, service_id: 'shopee_bo', provider: 'npa' },
  'rent_npa_shopee_3': { name: 'Shopee 3', price: 4000, service_id: 'shopee_trau', provider: 'npa' },
  'rent_npa_shopee_4': { name: 'Shopee 4', price: 4000, service_id: 'shopee_call', provider: 'npa' },
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

  'rent_npa_grab_v1': { name: 'Grab V1', price: 3000, service_id: 'dyn_227006400d', provider: 'npa' },

  'rent_npa_lotteria': { name: 'Lotteria', price: 3000, service_id: 'lotteria', provider: 'npa' },
  'rent_npa_katinat': { name: 'Katinat', price: 3000, service_id: 'katinat', provider: 'npa' }
};

function sendJoinGroupPrompt(chatId) {
  bot.sendMessage(
    chatId,
    `⚠️ **BẠN CHƯA THAM GIA GROUP!**\n\n` +
    `Vui lòng tham gia group bên dưới để tiếp tục sử dụng hệ thống thuê số và 2FA:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Tham gia Group ngay', url: 'https://t.me/+ThVZHCtALDEyY2Y1' }],
          [{ text: '🔄 Tôi đã tham gia (Kiểm tra lại)', callback_data: 'back_main' }]
        ]
      }
    }
  );
}

function sendMainMenu(chatId, userId) {
  let db = loadUsers();
  if (!db[userId]) {
    db[userId] = { balance: 12000 };
    saveUsers(db);
  }

  const userBalance = db[userId].balance.toLocaleString();
  const totalUsers = Object.keys(db).length;

  let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA**\n` +
                 `👤 ID của bạn: \`${userId}\`\n` +
                 `💰 Số dư ví: ${userBalance}đ`;

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
        [{ text: '🔐 Lấy mã 2FA (2fa.live)', callback_data: 'get_2fa_menu' }],
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
  userStates[userId] = null;

  const isJoined = await checkUserInGroup(userId);
  if (!isJoined) {
    return sendJoinGroupPrompt(chatId);
  }

  sendMainMenu(chatId, userId);
});

bot.onText(/\/nap (\d+) (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);

  const targetUserId = match[1];
  const amount = parseInt(match[2], 10);

  let db = loadUsers();
  if (!db[targetUserId]) db[targetUserId] = { balance: 0 };

  db[targetUserId].balance += amount;
  saveUsers(db);

  const newBalance = db[targetUserId].balance.toLocaleString();

  bot.sendMessage(chatId, `✅ Đã nạp thành công ${amount.toLocaleString()}đ cho user \`${targetUserId}\`. Số dư mới: ${newBalance}đ`, { parse_mode: 'Markdown' });
  bot.sendMessage(targetUserId, `🎉 Tài khoản của bạn đã được cộng: **+${amount.toLocaleString()}đ**. Số dư mới: ${newBalance}đ`, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  if (msg.from.id.toString() !== ADMIN_ID) return;
  const db = loadUsers();
  bot.sendMessage(chatId, `📊 Tổng thành viên hệ thống: **${Object.keys(db).length}** người`, { parse_mode: 'Markdown' });
});

bot.onText(/\/check (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  if (msg.from.id.toString() !== ADMIN_ID) return;
  const db = loadUsers();
  const targetId = match[1];
  if (!db[targetId]) return bot.sendMessage(chatId, `❌ Không tìm thấy user.`);
  bot.sendMessage(chatId, `🔍 User \`${targetId}\` có số dư: **${db[targetId].balance.toLocaleString()}đ**`, { parse_mode: 'Markdown' });
});

// Xử lý 2FA
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const isJoined = await checkUserInGroup(userId);
  if (!isJoined) {
    return sendJoinGroupPrompt(chatId);
  }

  if (userStates[userId] === 'waiting_for_2fa') {
    userStates[userId] = null;

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
        `🔐 **MÃ 2FA THÀNH CÔNG!**\n\n` +
        `🔑 **Secret trích xuất:** \`${cleanSecret}\`\n` +
        `✅ **Mã 2FA hiện tại:** \`${token2fa}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Lấy mã khác', callback_data: 'get_2fa_menu' }],
              [{ text: '🏠 Về menu chính', callback_data: 'back_main' }]
            ]
          }
        }
      );
    } catch (err) {
      bot.sendMessage(
        chatId,
        `❌ **Không thể tạo mã 2FA từ đoạn dữ liệu này!**\nVui lòng kiểm tra lại cấu trúc chuỗi và thử lại.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Thử lại', callback_data: 'get_2fa_menu' }],
              [{ text: '🏠 Về menu chính', callback_data: 'back_main' }]
            ]
          }
        }
      );
    }
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id.toString();
  const action = query.data;

  // Kiểm tra group trước mọi thao tác bấm nút
  const isJoined = await checkUserInGroup(userId);
  if (!isJoined) {
    bot.answerCallbackQuery(query.id, { text: '⚠️ Bạn cần tham gia group trước!', show_alert: true });
    return sendJoinGroupPrompt(chatId);
  }

  let db = loadUsers();
  if (!db[userId]) db[userId] = { balance: 12000 };

  if (action === 'rent_more' || action === 'back_main') {
    userStates[userId] = null;
    const userBalance = db[userId].balance.toLocaleString();
    const totalUsers = Object.keys(db).length;

    let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA**\n` +
                   `👤 ID của bạn: \`${userId}\`\n` +
                   `💰 Số dư ví: ${userBalance}đ`;

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
          [{ text: '🔐 Lấy mã 2FA (2fa.live)', callback_data: 'get_2fa_menu' }],
          [
            { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
            { text: '📞 Hỗ trợ Admin', callback_data: 'support_admin' }
          ]
        ]
      }
    });
  }

  if (action === 'get_2fa_menu') {
    userStates[userId] = 'waiting_for_2fa';
    return bot.editMessageText(
      `🔐 **HỆ THỐNG LẤY MÃ 2FA**\n\n` +
      `Bạn có thể dán nguyên cụm (Ví dụ: \`mail|pass|secret_key\`) hoặc dán riêng mã Secret Key vào khung chat. Bot sẽ tự động lọc lấy phần key để tạo mã!`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
          ]
        }
      }
    );
  }

  if (action === 'menu_shopee') {
    return bot.editMessageText(`🛍️ **CHỌN DỊCH VỤ SHOPEE**`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Shopee gà - 4.000đ', callback_data: 'rent_npa_shopee_ga' }],
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
    return bot.answerCallbackQuery(query.id, { text: `Số dư hiện tại của bạn: ${db[userId].balance.toLocaleString()}đ`, show_alert: true });
  }

  if (action === 'support_admin') {
    return bot.sendMessage(chatId, `📞 **HỖ TRỢ KHÁCH HÀNG**\n👉 Liên hệ Admin: https://t.me/phanhe`, { disable_web_page_preview: true });
  }

  // Xử lý thuê số
  if (action.startsWith('rent_')) {
    const serviceInfo = SERVICE_MAPPING[action];
    if (!serviceInfo) return;

    const price = serviceInfo.price;
    const serviceId = serviceInfo.service_id;
    const provider = serviceInfo.provider;

    if (db[userId].balance < price) {
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

        if (resData && (resData.ResponseCode === 0 || resData.ok === true) && resData.Result) {
          rawPhone = resData.Result.Number || '';
          reqId = resData.Result.Id || 'N/A';
        } else {
          return bot.sendMessage(chatId, `❌ **Thông báo:** ${resData.Msg || 'Hết số hoặc số dư API không đủ'}`);
        }
      }

      db[userId].balance -= price;
      saveUsers(db);

      await bot.sendMessage(
        chatId,
        `✅ **THUÊ SỐ THÀNH CÔNG!**\n\n` +
        `🌐 **Dịch vụ:** ${countryLabel}\n` +
        `📞 **Số điện thoại:** \`${rawPhone}\`\n` +
        `🆔 **Mã đơn:** \`${reqId}\`\n` +
        `💰 **Số dư còn lại:** ${db[userId].balance.toLocaleString()}đ\n\n` +
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
            const otpRes = await axios.post(`https://otpapi.cmsnpa.com/api/v1/check_code`, { id: reqId }, {
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
                  inline_keyboard: [[{ text: '🔄 Thuê tiếp', callback_data: 'back_main' }]]
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

        let currentDb = loadUsers();
        if (currentDb[userId]) {
          currentDb[userId].balance += price;
          saveUsers(currentDb);

          bot.sendMessage(
            chatId,
            `⏰ **ĐÃ HẾT 5 PHÚT!** Đơn hàng \`${reqId}\` đã được hoàn tiền **${price.toLocaleString()}đ**.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🔄 Thuê tiếp', callback_data: 'back_main' }]]
              }
            }
          ).catch(() => {});
        }
      }, 5 * 60 * 1000);

    } catch (err) {
      console.error(err.message);
      bot.sendMessage(chatId, `❌ Lỗi kết nối máy chủ!`);
    }
  }
});

console.log('Bot đang chạy...');
