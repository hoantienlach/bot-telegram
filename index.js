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

const USERS_FILE = './users.json';

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

const API_KEY = '6565dd2cdb5945cea58563c10af9ca6e';
const ADMIN_ID = '5426720868'; 

const SERVICE_MAPPING = {
  'rent_shopee_vn5': { name: 'Shopee Việt Nam 5', price: 5000, service_id: '15461' },
  'rent_shopee_vn8': { name: 'Shopee Việt Nam 8', price: 5000, service_id: '24901' },
  'rent_tt_us10': { name: 'TikTok US 10', price: 1600, service_id: '19272' },
  'rent_tt_us9': { name: 'TikTok US 9', price: 1600, service_id: '19194' },
  'rent_tt_chile': { name: 'TikTok Chile', price: 1600, service_id: '19404' },
  'rent_tt_colombia': { name: 'TikTok Colombia', price: 1600, service_id: '26145' }
};

// Lệnh /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  let db = loadUsers();
  if (!db[userId]) {
    db[userId] = { balance: 12000 };
    saveUsers(db);
  }

  const userBalance = db[userId].balance.toLocaleString();
  const totalUsers = Object.keys(db).length;

  let menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG**\n` +
                 `👤 ID của bạn: \`${userId}\`\n` +
                 `💰 Số dư ví: ${userBalance}đ`;

  if (userId === ADMIN_ID) {
    menuText += `\n📊 **Tổng thành viên:** ${totalUsers} người`;
  }

  bot.sendMessage(chatId, menuText, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🛍️ Shopee VN 5 (5k)', callback_data: 'rent_shopee_vn5' },
          { text: '🛍️ Shopee VN 8 (5k)', callback_data: 'rent_shopee_vn8' }
        ],
        [
          { text: '🎵 TikTok US 10 (1.6k)', callback_data: 'rent_tt_us10' },
          { text: '🎵 TikTok US 9 (1.6k)', callback_data: 'rent_tt_us9' }
        ],
        [
          { text: '🎵 TikTok Chile (1.6k)', callback_data: 'rent_tt_chile' },
          { text: '🎵 TikTok Colombia (1.6k)', callback_data: 'rent_tt_colombia' }
        ],
        [
          { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
          { text: '📞 Hỗ trợ Admin', callback_data: 'support_admin' }
        ]
      ]
    }
  });
});

// LỆNH ADMIN: Nạp/Cộng tiền cho người dùng (/nap [ID_Telegram] [Số_tiền])
bot.onText(/\/nap (\d+) (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
  }

  const targetUserId = match[1];
  const amount = parseInt(match[2], 10);

  if (isNaN(amount) || amount <= 0) {
    return bot.sendMessage(chatId, `❌ Số tiền phải lớn hơn 0! Cú pháp: \`/nap [ID] [Số_tiền]\``, { parse_mode: 'Markdown' });
  }

  let db = loadUsers();
  if (!db[targetUserId]) {
    db[targetUserId] = { balance: 0 };
  }

  db[targetUserId].balance += amount;
  saveUsers(db);

  const newBalance = db[targetUserId].balance.toLocaleString();

  // Báo kết quả cho Admin
  bot.sendMessage(
    chatId,
    `✅ **NẠP TIỀN THÀNH CÔNG!**\n\n` +
    `👤 ID người dùng: \`${targetUserId}\`\n` +
    `💵 Số tiền cộng: **+${amount.toLocaleString()}đ**\n` +
    `💰 Số dư mới: **${newBalance}đ**`,
    { parse_mode: 'Markdown' }
  );

  // Gửi thông báo cho khách hàng
  bot.sendMessage(
    targetUserId,
    `🎉 **NẠP TIỀN THÀNH CÔNG!**\n\n` +
    `💵 Tài khoản của bạn đã được cộng: **+${amount.toLocaleString()}đ**\n` +
    `💰 Số dư ví hiện tại: **${newBalance}đ**`,
    { parse_mode: 'Markdown' }
  ).catch(e => console.error('Không thể gửi tin nhắn cho khách:', e.message));
});

// LỆNH ADMIN: Thống kê số lượng người dùng (/stats)
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
  }

  let db = loadUsers();
  const totalUsers = Object.keys(db).length;

  bot.sendMessage(
    chatId,
    `📊 **THỐNG KÊ HỆ THỐNG**\n\n` +
    `👥 Tổng số người dùng trong cơ sở dữ liệu: **${totalUsers}** người`,
    { parse_mode: 'Markdown' }
  );
});

// LỆNH ADMIN: Gửi thông báo hàng loạt (/broadcast [nội dung])
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
  }

  const broadcastMessage = match[1];
  let db = loadUsers();
  const userIds = Object.keys(db);

  let successCount = 0;
  let failCount = 0;

  bot.sendMessage(chatId, `📢 Đang gửi thông báo đến ${userIds.length} người dùng, vui lòng đợi...`);

  for (const id of userIds) {
    try {
      await bot.sendMessage(id, `🔔 **THÔNG BÁO TỪ HỆ THỐNG**\n\n${broadcastMessage}`, { parse_mode: 'Markdown' });
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      failCount++;
    }
  }

  bot.sendMessage(chatId, `✅ **GỬI THÔNG BÁO HOÀN TẤT!**\n- Thành công: ${successCount}\n- Thất bại: ${failCount}`);
});

// LỆNH ADMIN: Kiểm tra số dư người dùng (/check [ID_Telegram])
bot.onText(/\/check (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
  }

  const targetUserId = match[1];
  let db = loadUsers();

  if (!db[targetUserId]) {
    return bot.sendMessage(chatId, `❌ Không tìm thấy thông tin của người dùng có ID: \`${targetUserId}\`.`);
  }

  const userBalance = db[targetUserId].balance.toLocaleString();

  bot.sendMessage(
    chatId,
    `🔍 **THÔNG TIN TÀI KHOẢN KHÁCH HÀNG**\n\n` +
    `👤 ID: \`${targetUserId}\`\n` +
    `💰 Số dư hiện tại: **${userBalance}đ**`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const action = query.data;

  let db = loadUsers();
  if (!db[userId]) {
    db[userId] = { balance: 12000 };
  }

  if (action === 'check_balance') {
    return bot.answerCallbackQuery(query.id, {
      text: `Số dư hiện tại của bạn: ${db[userId].balance.toLocaleString()}đ`,
      show_alert: true
    });
  }

  if (action === 'support_admin') {
    return bot.sendMessage(
      chatId,
      `📞 **HỖ TRỢ KHÁCH HÀNG**\n\n` +
      `👤 ID Telegram của bạn: \`${userId}\`\n` +
      `💬 Liên hệ trực tiếp Admin để nạp tiền hoặc giải đáp thắc mắc:\n` +
      `👉 Admin: https://t.me/phanhe`,
      { disable_web_page_preview: true }
    );
  }

  if (action.startsWith('rent_')) {
    const serviceInfo = SERVICE_MAPPING[action];
    if (!serviceInfo) return;

    const price = serviceInfo.price;
    const serviceId = serviceInfo.service_id;

    if (db[userId].balance < price) {
      return bot.sendMessage(chatId, `❌ **Số dư không đủ!** Bạn cần tối thiểu ${price.toLocaleString()}đ để thuê dịch vụ này.`, { parse_mode: 'Markdown' });
    }

    try {
      const apiUrl = `https://gmailotp.site/api?action=get_number&key=${API_KEY}&id=${serviceId}`;
      const apiResponse = await axios.get(apiUrl);
      const resData = apiResponse.data;

      if (resData && resData.success === true) {
        const phoneNum = resData.number || 'Không xác định';
        const reqId = resData.request_id || 'N/A';

        db[userId].balance -= price;
        saveUsers(db);

        await bot.sendMessage(
          chatId,
          `✅ **THUÊ SỐ THÀNH CÔNG!**\n\n` +
          `📞 Số điện thoại: \`${phoneNum}\`\n` +
          `🆔 Mã đơn: \`${reqId}\`\n` +
          `💰 Số dư còn lại: ${db[userId].balance.toLocaleString()}đ\n\n` +
          `⏳ *Hệ thống đang tự động chờ mã OTP (tối đa 5 phút)...*`,
          { parse_mode: 'Markdown' }
        );

        let isCompleted = false;

        const checkInterval = setInterval(async () => {
          if (isCompleted) return;

          try {
            const otpRes = await axios.get(`https://gmailotp.site/api?action=get_code&key=${API_KEY}&id=${reqId}`);
            const otpData = otpRes.data;

            if (otpData && otpData.success === true && otpData.otp_code && otpData.otp_code !== 'is_coming') {
              isCompleted = true;
              clearInterval(checkInterval);
              clearTimeout(timeoutRefund);

              bot.sendMessage(
                chatId,
                `🎉 **ĐÃ NHẬN ĐƯỢC MÃ OTP!**\n\n` +
                `📞 Số điện thoại: \`${phoneNum}\`\n` +
                `📩 **MÃ OTP:** \`${otpData.otp_code}\``,
                { parse_mode: 'Markdown' }
              );
            }
          } catch (e) {
            console.error('Lỗi check OTP nền:', e.message);
          }
        }, 5000);

        const timeoutRefund = setTimeout(async () => {
          if (isCompleted) return;
          isCompleted = true;
          clearInterval(checkInterval);

          try {
            await axios.get(`https://gmailotp.site/api?action=cancel_phone&key=${API_KEY}&id=${reqId}`);
          } catch (e) {
            console.error('Lỗi gọi API hủy số:', e.message);
          }

          let currentDb = loadUsers();
          if (currentDb[userId]) {
            currentDb[userId].balance += price;
            saveUsers(currentDb);

            bot.sendMessage(
              chatId,
              `⏰ **ĐÃ HẾT 5 PHÚT!**\nĐơn hàng \`${reqId}\` không nhận được OTP. Hệ thống đã tự động hủy đơn và hoàn lại **${price.toLocaleString()}đ** vào ví của bạn.`,
              { parse_mode: 'Markdown' }
            ).catch(e => console.error(e));
          }
        }, 5 * 60 * 1000);

      } else {
        const detailMsg = resData.message || resData.msg || 'Hệ thống hết số hoặc bận';
        bot.sendMessage(chatId, `❌ **Thông báo:** ${detailMsg}`);
      }
    } catch (err) {
      console.error('Lỗi API lấy số:', err.message);
      bot.sendMessage(chatId, `❌ Lỗi kết nối máy chủ, vui lòng thử lại sau!`);
    }
  }
});

console.log('Bot đang chạy...');
