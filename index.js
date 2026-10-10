const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Khởi tạo Express Server để duy trì kết nối Live trên Render
app.get('/', (req, res) => {
  res.send('Bot Telegram đang chạy 24/7!');
});

app.listen(PORT, () => {
  console.log(`Server HTTP đang chạy trên cổng ${PORT}`);
});

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Đường dẫn file cơ sở dữ liệu người dùng
const USERS_FILE = './users.json';

// Hàm đọc dữ liệu người dùng
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

// Hàm ghi dữ liệu người dùng
function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Lỗi khi ghi file users.json:', err);
  }
}

// Cấu hình Bot Telegram
const token = process.env.BOT_TOKEN || '8916854577:AAFhqasLZhIcXgDq4onY0PJ_mIQqdHMhjmc';
const bot = new TelegramBot(token, { polling: true });

// API Key gmailotp.site của bạn
const API_KEY = '6565dd2cdb5945cea58563c10af9ca6e';

// Bảng ánh xạ giá tiền và ID dịch vụ trên gmailotp.site
const SERVICE_MAPPING = {
  'rent_shopee_vn5': { name: 'Shopee Việt Nam 5', price: 5000, service_id: '15461' },
  'rent_shopee_vn8': { name: 'Shopee Việt Nam 8', price: 5000, service_id: '24901' },
  'rent_tt_us10': { name: 'TikTok US 10', price: 1600, service_id: 'tiktok_us10' },
  'rent_tt_us9': { name: 'TikTok US 9', price: 1600, service_id: 'tiktok_us9' },
  'rent_tt_chile': { name: 'TikTok Chile', price: 1600, service_id: 'tiktok_chile' },
  'rent_tt_colombia': { name: 'TikTok Colombia', price: 1600, service_id: 'tiktok_colombia' }
};

// Lệnh /start hiển thị menu chính
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  let db = loadUsers();
  if (!db[userId]) {
    db[userId] = { balance: 12000 }; // Số dư mặc định
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

// Lắng nghe sự kiện bấm nút trên giao diện
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const action = query.data;

  let db = loadUsers();
  if (!db[userId]) {
    db[userId] = { balance: 12000 };
  }

  // 1. Kiểm tra số dư
  if (action === 'check_balance') {
    return bot.answerCallbackQuery(query.id, {
      text: `Số dư hiện tại của bạn: ${db[userId].balance.toLocaleString()}đ`,
      show_alert: true
    });
  }

  // 2. Hỗ trợ Admin
  if (action === 'support_admin') {
    return bot.sendMessage(
      chatId,
      `📞 **HỖ TRỢ KHÁCH HÀNG**\n\n` +
      `👤 ID Telegram của bạn: \`${userId}\`\n` +
      `💬 Liên hệ trực tiếp Admin để nạp tiền hoặc giải đáp thắc mắc:\n` +
      `👉 Admin: Nhắn qua tài khoản ID: \`5426720868\``,
      { parse_mode: 'Markdown' }
    );
  }

  // 3. Xử lý thuê số dịch vụ
  if (action.startsWith('rent_')) {
    const serviceInfo = SERVICE_MAPPING[action];
    if (!serviceInfo) return;

    const price = serviceInfo.price;
    const serviceCode = serviceInfo.service_id;

    // Kiểm tra số dư người dùng
    if (db[userId].balance < price) {
      return bot.sendMessage(chatId, `❌ **Số dư không đủ!** Bạn cần tối thiểu ${price.toLocaleString()}đ để thuê dịch vụ này.`);
    }

    try {
      // Gọi API lấy số từ gmailotp.site
      const apiResponse = await axios.get(`https://gmailotp.site/api/get_number?apikey=${API_KEY}&service=${serviceCode}`);
      const resData = apiResponse.data;

      if (resData && (resData.status === true || resData.success === true)) {
        const phoneNum = resData.phone || resData.number || 'Không xác định';
        const reqId = resData.request_id || resData.id || 'N/A';

        // Trừ tiền tương ứng ứng với giá dịch vụ
        db[userId].balance -= price;
        saveUsers(db);

        // Gửi thông báo thuê số thành công
        await bot.sendMessage(
          chatId,
          `✅ **THUÊ SỐ THÀNH CÔNG!**\n\n` +
          `📞 Số điện thoại: \`${phoneNum}\`\n` +
          `🆔 Mã đơn: \`${reqId}\`\n` +
          `💰 Số dư còn lại: ${db[userId].balance.toLocaleString()}đ\n\n` +
          `*Sau khi nhập số trên app, bấm nút bên dưới để lấy mã OTP:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {inline_keyboard: [
                [{ text: '📩 Lấy OTP', callback_data: `check_otp_${reqId}_${action}` }]
              ]
            }
          }
        );

        // --- BỘ ĐẾM 10 PHÚT TỰ ĐỘNG HOÀN TIỀN NẾU KHÔNG CÓ OTP ---
        setTimeout(async () => {
          let currentDb = loadUsers();
          if (currentDb[userId]) {
            // Hoàn lại chính xác số tiền đã trừ vào tài khoản
            currentDb[userId].balance += price;
            saveUsers(currentDb);

            bot.sendMessage(
              chatId,
              `⏰ **ĐÃ HẾT 10 PHÚT!**\nĐơn hàng \`${reqId}\` chưa nhận được OTP. Hệ thống đã tự động hủy đơn và hoàn lại **${price.toLocaleString()}đ** vào ví của bạn.`
            ).catch(e => console.error(e));
          }
        }, 10 * 60 * 1000);

      } else {
        bot.sendMessage(chatId, `❌ Hệ thống báo: ${JSON.stringify(resData)}`);
      }
    } catch (err) {
      console.error('Lỗi API lấy số:', err);
      bot.sendMessage(chatId, `❌ Lỗi kết nối API lấy số từ gmailotp.site.`);
    }
  }
});

console.log('Bot đang chạy...');
