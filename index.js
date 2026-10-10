const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

const TOKEN = '8916854577:AAFhqasLZhIcXgDq4onY0PJ_mIQqdHMhjmc';
const KEY = '6565dd2cdb5945cea58563c10af9ca6e';
const URL = 'https://gmailotp.site/api';

const ADMIN_IDS = ['5426720868'];
const bot = new TelegramBot(TOKEN, { polling: true });
const DB = './users.json';

function getDB() {
  if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({}));
  return JSON.parse(fs.readFileSync(DB));
}
function saveDB(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

const PRICE = {
  shopee: 5000,
  tiktok_us10: 2000,
  tiktok_us9: 2000,
  tiktok_chile: 2000,
  tiktok_colombia: 2000
};

const SERVICE_IDS = {
  shopee: '15461',
  tiktok_us10: '19272',
  tiktok_us9: '19194',
  tiktok_chile: '26145',
  tiktok_colombia: '3430'
};
bot.onText(/\/start/, (msg) => {
  const id = msg.from.id.toString();
  let db = getDB();
  if (!db[id]) { db[id] = { balance: 0 }; saveDB(db); }

  bot.sendMessage(msg.chat.id, `🤖 **HỆ THỐNG THUÊ SỐ TỰ ĐỘNG**\n👤 ID của bạn: \`${id}\`\n💰 Số dư ví: ${db[id].balance.toLocaleString()}đ`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🛍️ Shopee VN 5 (5k)', callback_data: 'shopee' }],
        [{ text: '🎵 TikTok US 10 (2k)', callback_data: 'tiktok_us10' }, { text: '🎵 TikTok US 9 (2k)', callback_data: 'tiktok_us9' }],
        [{ text: '🎵 TikTok Chile (2k)', callback_data: 'tiktok_chile' }, { text: '🎵 TikTok Colombia (2k)', callback_data: 'tiktok_colombia' }],
        [{ text: '💰 Kiểm tra số dư', callback_data: 'balance' }, { text: '☎️ Hỗ trợ Admin', callback_data: 'support' }]
      ]
    }
  });
});
bot.onText(/\/cong (\d+) (\d+)/, (msg, match) => {
  const adminId = msg.from.id.toString();

  if (!ADMIN_IDS.includes(adminId)) {
    return bot.sendMessage(msg.chat.id, `❌ Bạn không có quyền sử dụng lệnh này!`);
  }

  const uid = match[1];
  const amount = parseInt(match[2]);
  
  let db = getDB();
  if (!db[uid]) db[uid] = { balance: 0 };
  db[uid].balance += amount;
  saveDB(db);

  bot.sendMessage(msg.chat.id, `✅ Đã cộng ${amount.toLocaleString()}đ cho \`${uid}\`.\n💰 Dư mới: ${db[uid].balance.toLocaleString()}đ`, { parse_mode: 'Markdown' });
  
  try {
    bot.sendMessage(uid, `🎉 Tài khoản của bạn vừa được Admin cộng ${amount.toLocaleString()}đ!\n💰 Số dư hiện tại: ${db[uid].balance.toLocaleString()}đ`);
  } catch (e) {}
});
bot.on('callback_query', async (query) => {
  const id = query.from.id.toString();
  const action = query.data;
  bot.answerCallbackQuery(query.id);

  let db = getDB();
  if (!db[id]) { db[id] = { balance: 0 }; saveDB(db); }

  if (action === 'balance') {
    return bot.sendMessage(query.message.chat.id, `👤 ID của bạn: \`${id}\`\n💰 Số dư hiện tại: ${db[id].balance.toLocaleString()}đ`, { parse_mode: 'Markdown' });
  }

  // Xử lý nút Hỗ trợ Admin
  if (action === 'support') {
    return bot.sendMessage(query.message.chat.id, 
      `☎️ **HỖ TRỢ KHÁCH HÀNG**\n\n` +
      `👤 ID Telegram của bạn: \`${id}\`\n` +
      `💬 Liên hệ trực tiếp Admin để nạp tiền hoặc giải đáp thắc mắc:\n` +
      `👉 Admin: [Nhấn vào đây để chat](https://t.me/phanhe) hoặc nhắn qua tài khoản ID: \`5426720868\``, 
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }

  // Xử lý lấy mã OTP & Hoàn tiền tự động
  if (action.startsWith('check_otp_')) {
    const parts = action.split('_');
    const reqId = parts[2];
    const serviceKey = parts[3];

    bot.sendMessage(query.message.chat.id, `🔄 Đang kiểm tra OTP cho đơn ID \`${reqId}\`...`, { parse_mode: 'Markdown' });

    try {
      const res = await axios.get(`${URL}?key=${KEY}&action=get_code&id=${reqId}`);
      
      if (res.data && (res.data.code || res.data.otp || res.data.sms)) {
        const otpCode = res.data.code || res.data.otp || res.data.sms;
        return bot.sendMessage(query.message.chat.id, `🎉 **MÃ OTP CỦA BẠN LÀ:** \`${otpCode}\``, { parse_mode: 'Markdown' });
      } 
      
      if (res.data && (res.data.status === 'canceled' || res.data.status === 'expired' || res.data.message === 'Canceled')) {
        const refundAmount = PRICE[serviceKey] || 0;
        if (refundAmount > 0) {
          db[id].balance += refundAmount;
          saveDB(db);
          return bot.sendMessage(query.message.chat.id, `🔄 **ĐƠN ĐÃ HỦY / HẾT GIỜ!**\n💰 Đã hoàn trả **${refundAmount.toLocaleString()}đ** vào ví.\n💰 Số dư mới: ${db[id].balance.toLocaleString()}đ`, { parse_mode: 'Markdown' });
        }
      }

      bot.sendMessage(query.message.chat.id, `⏳ Chưa có OTP mới. Vui lòng chờ vài giây rồi bấm lại nút "📩 Lấy OTP".`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📩 Lấy OTP lại', callback_data: `check_otp_${reqId}_${serviceKey}` }]
          ]
        }
      });

    } catch (err) {
      bot.sendMessage(query.message.chat.id, `❌ Lỗi khi kiểm tra OTP.`);
    }
    return;
  }

  // Xử lý Thuê số
  if (SERVICE_IDS[action]) {
    const cost = PRICE[action];
    if (db[id].balance < cost) {
      return bot.sendMessage(query.message.chat.id, `❌ Không đủ tiền! Cần ${cost.toLocaleString()}đ nhưng ví chỉ có ${db[id].balance.toLocaleString()}đ.`);
    }
const sId = SERVICE_IDS[action];
    bot.sendMessage(query.message.chat.id, `🔄 Đang lấy số...`);

    try {
      const res = await axios.get(`${URL}?key=${KEY}&action=get_number&id=${sId}`);
      if (res.data && (res.data.phone || res.data.number || res.data.status === 'success')) {
        db[id].balance -= cost;
        saveDB(db);

        const phoneNum = res.data.phone || res.data.number || 'Không xác định';
        const reqId = res.data.request_id || res.data.id || 'N/A';

        bot.sendMessage(query.message.chat.id, 
          `✅ **THUÊ SỐ THÀNH CÔNG!**\n\n` +
          `📞 Số điện thoại: \`${phoneNum}\`\n` +
          `🆔 Mã đơn: \`${reqId}\`\n\n` +
          `💰 Số dư còn lại: ${db[id].balance.toLocaleString()}đ\n\n` +
          `👇 *Sau khi nhập số trên app, bấm nút bên dưới để lấy mã OTP:*`, 
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📩 Lấy OTP', callback_data: `check_otp_${reqId}_${action}` }]
              ]
            }
          }
        );
      } else {
        bot.sendMessage(query.message.chat.id, `❌ Hệ thống báo: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      bot.sendMessage(query.message.chat.id, `❌ Lỗi kết nối API lấy số.`);
    }
  }
});

console.log('Bot đang chạy...');