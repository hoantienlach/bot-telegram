
const express = require('express');
const app = express();
const PORT = process process.env.PORT || 3000;

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

// Bảng cấu hình dịch vụ & từ khóa tìm kiếm trong danh sách dịch vụ của web
const SERVICE_MAPPING = {
  'rent_shopee_vn5': { name: 'Shopee Việt Nam 5', price: 5000, fixed_id: '15461', keyword: 'Shopee Viet nam 5' },
  'rent_shopee_vn8': { name: 'Shopee Việt Nam 8', price: 5000, fixed_id: '24901', keyword: 'Shopee Viet nam 8' },
  'rent_tt_us10': { name: 'TikTok US 10', price: 1600, keyword: 'United States' },
  'rent_tt_us9': { name: 'TikTok US 9', price: 1600, keyword: 'United States' },
  'rent_tt_chile': { name: 'TikTok Chile', price: 1600, keyword: 'Chile' },
  'rent_tt_colombia': { name: 'TikTok Colombia', price: 1600, keyword: 'Colombia' }
};

// Hàm hỗ trợ tìm ID dịch vụ từ API web
async function getServiceId(info) {
  if (info.fixed_id) return info.fixed_id;

  try {
    const res = await axios.get(`https://gmailotp.site/api?action=get_all_services&key=${API_KEY}`);
    const services = res.data;

    if (Array.isArray(services)) {
      const found = services.find(s => s.name && s.name.toLowerCase().includes(info.keyword.toLowerCase()));
      if (found) return found.id;
    }
  } catch (e) {
    console.error('Lỗi khi lấy danh sách dịch vụ:', e.message);
  }
  return null;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  let db = loadUsers();
  if (!db[userId]) {
    db[userId] = { balance: 12000 };
    saveUsers(db);
  }

  const userBalance = db[userId].balance.toLocaleString();

  const menuText = `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG**\n` +
                   `👤 ID của bạn: \`${userId}\`\n` +
                   `💰 Số dư ví: ${userBalance}đ`;

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

  // Lấy OTP
  if (action.startsWith('check_otp_')) {
    const parts = action.split('_');
    const reqId = parts[2];

    try {
      const otpRes = await axios.get(`https://gmailotp.site/api?action=get_code&key=${API_KEY}&id=${reqId}`);
      const otpData = otpRes.data;

      if (otpData && otpData.success === true) {
        if (otpData.otp_code && otpData.otp_code !== 'is_coming') {
          return bot.sendMessage(chatId, `📩 **MÃ OTP CỦA BẠN:** \`${otpData.otp_code}\``, { parse_mode: 'Markdown' });
        } else {
          return bot.sendMessage(chatId, `⏳ Đang chờ mã OTP, vui lòng bấm lại sau ít giây...`);
        }
      } else {
        return bot.sendMessage(chatId, `❌ Chưa nhận được mã hoặc đơn hàng đã hết hạn.`);
      }
    } catch (err) {
      return bot.sendMessage(chatId, `❌ Lỗi kết nối kiểm tra OTP.`);
    }
  }

  // Thuê số
  if (action.startsWith('rent_')) {
    const serviceInfo = SERVICE_MAPPING[action];
    if (!serviceInfo) return;

    const price = serviceInfo.price;

    if (db[userId].balance < price) {
      return bot.sendMessage(chatId, `❌ **Số dư không đủ!** Bạn cần tối thiểu ${price.toLocaleString()}đ để thuê dịch vụ này.`, { parse_mode: 'Markdown' });
    }

    try {
      // Tự động tìm ID số chính xác từ server web
      const targetServiceId = await getServiceId(serviceInfo);

      if (!targetServiceId) {
        return bot.sendMessage(chatId, `❌ Tạm thời không tìm thấy ID dịch vụ này trên hệ thống. Vui lòng thử dịch vụ khác!`);
      }

      const apiUrl = `https://gmailotp.site/api?action=get_number&key=${API_KEY}&id=${targetServiceId}`;
      const apiResponse = await axios.get(apiUrl);
      const resData = apiResponse.data;

      console.log('API Response:', resData);

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
          `*Sau khi nhập số trên app, bấm nút bên dưới để lấy mã OTP:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📩 Lấy OTP', callback_data: `check_otp_${reqId}` }]
              ]
            }
          }
        );

        setTimeout(async () => {
          let currentDb = loadUsers();
          if (currentDb[userId]) {
            currentDb[userId].balance += price;
            saveUsers(currentDb);

            bot.sendMessage(
              chatId,
              `⏰ **ĐÃ HẾT 10 PHÚT!**\nĐơn hàng \`${reqId}\` chưa nhận được OTP. Hệ thống đã tự động hủy đơn và hoàn lại **${price.toLocaleString()}đ** vào ví của bạn.`,
              { parse_mode: 'Markdown' }
            ).catch(e => console.error(e));
          }
        }, 10 * 60 * 1000);

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
