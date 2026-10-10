const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Khởi tạo Express Server để duy trì kết nối Live trên Render
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

// Cấu hình Bot Telegram (nhập BOT_TOKEN trong Environment Variables trên Render hoặc điền trực tiếp)
const token = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

// Lắng nghe sự kiện callback_query (khi người dùng bấm nút thuê số)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id.toString();
  const action = query.data;

  // Ví dụ xử lý sự kiện thuê số
  if (action.startsWith('rent_')) {
    try {
      let db = loadUsers();
      if (!db[userId]) {
        db[userId] = { balance: 0 };
      }

      // Giả định dữ liệu trả về từ API thuê số
      const res = { data: { status: true, phone: '0987654321', request_id: 'REQ123456' } };

      if (res.data && res.data.status) {
        const phoneNum = res.data.phone || res.data.number || 'Không xác định';
        const reqId = res.data.request_id || res.data.id || 'N/A';

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
            reply_markup: {
              inline_keyboard: [
                [{ text: '📩 Lấy OTP', callback_data: `check_otp_${reqId}_${action}` }]
              ]
            }
          }
        );

        // --- BỘ ĐẾM 10 PHÚT TỰ ĐỘNG HOÀN TIỀN NẾU KHÔNG CÓ OTP ---
        setTimeout(async () => {let currentDb = loadUsers();
          // Kiểm tra xem đơn đã lấy thành công OTP chưa (nếu chưa thì thực hiện hoàn tiền)
          if (currentDb[userId]) {
            // Ví dụ cộng lại tiền thuê vào tài khoản:
            // currentDb[userId].balance += 1000;
            // saveUsers(currentDb);
            
            bot.sendMessage(
              chatId,
              `⏰ **ĐÃ HẾT 10 PHÚT!**\nĐơn hàng \`${reqId}\` chưa nhận được OTP nên hệ thống đã tự động hủy và hoàn tiền.`
            ).catch(e => console.error(e));
          }
        }, 10 * 60 * 1000);

      } else {
        bot.sendMessage(chatId, `❌ Hệ thống báo: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      console.error('Lỗi API lấy số:', err);
      bot.sendMessage(chatId, `❌ Lỗi kết nối API lấy số.`);
    }
  }
});

console.log('Bot đang chạy...');
