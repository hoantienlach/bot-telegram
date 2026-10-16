const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bot Telegram đang chạy 24/7!');
});

let depositBonusPercent = 0;
let referralCommissionPercent = 10;

function removeAccentsAndUpperCase(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .trim();
}

app.post('/webhook/sepay', async (req, res) => {
  try {
    const data = req.body;
    console.log('👉 Nhận Webhook SePay:', data);

    const sepayContent = (data.content || data.description || '').toLowerCase();
    const transferAmount = parseInt(data.transferAmount || data.amount || 0, 10);

    if (!transferAmount || !sepayContent) {
      return res.status(200).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    const pendingDeposits = await Deposit.find({
      amount: transferAmount,
      status: 'pending'
    });

    let pendingDeposit = null;

    for (const dep of pendingDeposits) {
      const dbContent = dep.content.toLowerCase();
      if (sepayContent.includes(dbContent)) {
        pendingDeposit = dep;
        break;
      }
    }

    if (!pendingDeposit) {
      const allUsers = await User.find({ fullName: { $ne: null } });
      for (const u of allUsers) {
        const nameClean = u.fullName.toLowerCase();
        if (sepayContent.includes(nameClean)) {
          pendingDeposit = {
            userId: u.userId,
            amount: transferAmount,
            status: 'pending',
            content: u.fullName
          };
          break;
        }
      }
    }

    if (pendingDeposit) {
      if (pendingDeposit.save) {
        pendingDeposit.status = 'success';
        await pendingDeposit.save();
      }

      let finalReceiveAmount = transferAmount;
      let bonusAmount = 0;

      if (depositBonusPercent > 0) {
        bonusAmount = Math.floor((transferAmount * depositBonusPercent) / 100);
        finalReceiveAmount = transferAmount + bonusAmount;
      }

      const user = await User.findOneAndUpdate(
        { userId: pendingDeposit.userId },
        { $inc: { balance: finalReceiveAmount, total_deposited: transferAmount } },
        { new: true, upsert: true }
      );

      let msgText = `🎉 NẠP TIỀN TỰ ĐỘNG THÀNH CÔNG!\n\n` +
                    `💵 Số tiền chuyển: ${transferAmount.toLocaleString()}đ\n`;
      
      if (bonusAmount > 0) {
        msgText += `🎁 Khuyến mãi (${depositBonusPercent}%): +${bonusAmount.toLocaleString()}đ\n` +
                   `💰 Tổng nhận vào ví: +${finalReceiveAmount.toLocaleString()}đ\n`;
      } else {
        msgText += `💰 Số tiền nhận: +${transferAmount.toLocaleString()}đ\n`;
      }

      msgText += `💳 Số dư ví hiện tại: ${user.balance.toLocaleString()}đ`;

      bot.sendMessage(pendingDeposit.userId, msgText).catch(() => {});

      if (referralCommissionPercent > 0 && user.referredBy) {
        const commission = Math.floor((transferAmount * referralCommissionPercent) / 100);
        if (commission > 0) {
          const referrer = await User.findOneAndUpdate(
            { userId: user.referredBy },
            { $inc: { balance: commission, total_commission: commission } },
            { new: true }
          );

          if (referrer) {
            bot.sendMessage(
              user.referredBy,
              `🎁 NHẬN HOA HỒNG GIỚI THIỆU!\n\n` +
              `👤 Bạn bè (ID: ${pendingDeposit.userId}) vừa nạp thành công ${transferAmount.toLocaleString()}đ.\n` +
              `💰 Hoa hồng nhận được (${referralCommissionPercent}%): +${commission.toLocaleString()}đ\n` +
              `💳 Số dư ví hiện tại: ${referrer.balance.toLocaleString()}đ`
            ).catch(() => {});
          }
        }
      }
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

// 📌 DATABASE MODELS
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  total_deposited: { type: Number, default: 0 },
  referredBy: { type: String, default: null },
  referralCount: { type: Number, default: 0 },
  total_commission: { type: Number, default: 0 },
  fullName: { type: String, default: null }
});
const User = mongoose.model('User', userSchema);

const depositSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  content: { type: String, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now, expires: 600 }
});
const Deposit = mongoose.model('Deposit', depositSchema);

const orderSchema = new mongoose.Schema({
  reqId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  price: { type: Number, required: true },
  serviceName: { type: String },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Order = mongoose.model('Order', orderSchema);

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  isMaintenanceMode: { type: Boolean, default: false },
  allowedUsers: { type: [String], default: [] }
});
const Config = mongoose.model('Config', configSchema);

let isMaintenanceMode = false;
let allowedMaintenanceUsers = [];

async function loadSystemConfig() {
  try {
    let conf = await Config.findOne({ key: 'system_settings' });
    if (!conf) {
      conf = await Config.create({ key: 'system_settings', isMaintenanceMode: false, allowedUsers: [] });
    }
    isMaintenanceMode = conf.isMaintenanceMode;
    allowedMaintenanceUsers = conf.allowedUsers || [];
    console.log(`⚙️ Trạng thái bảo trì từ DB: ${isMaintenanceMode ? 'ĐANG BẬT 🔴' : 'ĐANG TẮT 🟢'}`);
  } catch (err) {
    console.error('Lỗi load cấu hình hệ thống:', err.message);
  }
}

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Đã kết nối thành công tới MongoDB Atlas!');
    loadSystemConfig();
  })
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err.message));

async function getUser(userId) {
  let user = await User.findOne({ userId: userId });
  if (!user) {
    user = await User.create({ userId: userId, balance: 0, total_deposited: 0 });
  }
  return user;
}

const token = process.env.BOT_TOKEN || '8151870148:AAHdqXysbRCDq0JHaBCqhpWzAXBFCnEi5cg';
const bot = new TelegramBot(token, { polling: true });

let botUsername = 'htlach_bot';
bot.getMe().then(me => {
  if (me && me.username) botUsername = me.username;
});

// 📌 API KEYS
const KEY_SERVER = '3ff5aed2e57cd639dc23131d4698683cc370eeff76db0180ce58609c95b25485';
const API_KEY_VIOTP = '41f6cd3efde9492c94be344dd0f1e81c';
const API_KEY_CHAYCODESO3 = '2b06086cc0d4e0e3';
const API_KEY_GMAILOTP = '6565dd2cdb5945cea58563c10af9ca6e';
const API_KEY_NPA = 'cmsnpa_2PW1uwK_Pw8wGjIcztt7lMPP336E0l4veVsM7rVvMRU';
const ADMIN_ID = '5426720868'; 

const REQUIRED_CHANNEL = '@htlach'; 
const INVITE_LINK = 'https://t.me/+TDKbQXkqoV5hZmQ1'; 

const cooldowns = new Map();
const COOLDOWN_TIME = 3000;
const userState = new Map();
const tempDepositData = new Map();

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

let npaServiceIds = {
  shopee_tl: 'dyn_86a0db7d3c',
  shopee_call: 'dyn_d8f753cd7c',
  shopee_bo: 'dyn_a3a3ad627f',
  shopee_trau: 'dyn_ab1eb87836',
  grab: 'dyn_227006400d'
};

async function updateNpaServiceIds() {
  try {
    const res = await axios.get('https://otpapi.cmsnpa.com/api/v1/services', {
      headers: { 'Authorization': `Bearer ${API_KEY_NPA}` }
    });
    if (res.data && res.data.services && Array.isArray(res.data.services)) {
      res.data.services.forEach(srv => {
        const label = (srv.label || '').toLowerCase();
        if (label.includes('sóp bi tl') || label.includes('shopee tl')) {
          npaServiceIds.shopee_tl = srv.id;
        } else if (label.includes('shopee call') || label.includes('cấm lộc')) {
          npaServiceIds.shopee_call = srv.id;
        } else if (label.includes('shopee bò') || label.includes('shopee bo') || label.includes('mượt')) {
          npaServiceIds.shopee_bo = srv.id;
        } else if (label.includes('shopee trâu') || label.includes('shopee trau') || label.includes('đá số')) {
          npaServiceIds.shopee_trau = srv.id;
        } else if (label.includes('grab') || label.includes('grap')) {
          npaServiceIds.grab = srv.id;
        }
      });
    }
  } catch (err) {}
}
updateNpaServiceIds();

async function setupBotCommands() {
  try {
    await bot.setMyCommands([
      { command: 'start', description: 'Mở menu thuê số & ví' }
    ], {
      scope: { type: 'all_private_chats' }
    });

    await bot.setMyCommands([
      { command: 'start', description: 'Mở menu thuê số & ví' },
      { command: 'nap', description: 'Admin: Nạp tiền qua tên' },
      { command: 'tru', description: 'Admin: Trừ tiền qua tên' },
      { command: 'hoan', description: 'Admin: Hoàn tiền qua mã đơn' },
      { command: 'setnap', description: 'Admin: Điều chỉnh tổng nạp qua tên' },
      { command: 'km', description: 'Admin: Cài đặt % khuyến mãi nạp' },
      { command: 'hoahong', description: 'Admin: Cài đặt % hoa hồng giới thiệu' },
      { command: 'baotri', description: 'Admin: Bật/Tắt chế độ bảo trì' },
      { command: 'baotri_cho', description: 'Admin: Thêm ID user được dùng khi bảo trì' },
      { command: 'baotri_xoa', description: 'Admin: Xóa ID user khỏi danh sách bảo trì' },
      { command: 'sendall', description: 'Admin: Gửi thông báo toàn bộ user' }
    ], {
      scope: { type: 'chat', chat_id: ADMIN_ID }
    });
  } catch (e) {
    console.error('Lỗi cài đặt setMyCommands:', e.message);
  }
}
setupBotCommands();

// 📌 CẤU HÌNH DỊCH VỤ
function getServiceInfo(action) {
  const map = {
    'rent_shopee': { name: 'Shopee HL', price: 5000, service_id: npaServiceIds.shopee_tl, provider: 'npa' },
    'rent_shopee_call': { name: 'Shopee Call', price: 2500, service_id: npaServiceIds.shopee_call, provider: 'npa' },
    'rent_shopee_muot': { name: 'Shopee Mượt', price: 4000, service_id: npaServiceIds.shopee_bo, provider: 'npa' },
    'rent_shopee_trau': { name: 'Shopee Ít đá số', price: 4000, service_id: npaServiceIds.shopee_trau, provider: 'npa' },
    'rent_shopee_viotp': { name: 'Shopee HV', price: 5000, service_id: 'shopee', site: 'viotp', apikey: API_KEY_VIOTP, provider: 'botmmo' },
    'rent_shopee_chaycode': { name: 'Shopee HC', price: 5000, service_id: 'shopee', site: 'chaycodeso3', apikey: API_KEY_CHAYCODESO3, provider: 'botmmo' },

    'rent_tt_us10': { name: 'TikTok US +1', price: 1200, service_id: '19272', provider: 'gmailotp' },
    'rent_tt_us9': { name: 'TikTok US +1', price: 1200, service_id: '19194', provider: 'gmailotp' },
    'rent_tt_indo19': { name: 'TikTok Indonesia +62', price: 1200, service_id: '19173', provider: 'gmailotp' },
    'rent_tt_indo21': { name: 'TikTok Indonesia +62', price: 1200, service_id: '19244', provider: 'gmailotp' },
    'rent_tt_chile12': { name: 'TikTok Chile +56', price: 1200, service_id: '26145', provider: 'gmailotp' },
    'rent_tt_chile7': { name: 'TikTok Chile +56', price: 1200, service_id: '3421', provider: 'gmailotp' },
    'rent_tt_colombia7': { name: 'TikTok Colombia +57', price: 1200, service_id: '3429', provider: 'gmailotp' },
    'rent_tt_colombia8': { name: 'TikTok Colombia +57', price: 1200, service_id: '3430', provider: 'gmailotp' },
    
    'rent_grab': { name: 'Grab', price: 3000, service_id: npaServiceIds.grab, provider: 'npa' }
  };
  return map[action];
}

async function sendMainMenu(chatId, userId) {
  userState.delete(userId);
  tempDepositData.delete(userId);
  const user = await getUser(userId);
  const userBalance = (user.balance || 0).toLocaleString();
  const userDeposited = (user.total_deposited || 0).toLocaleString();

  let menuText = `🤖 HỆ THỐNG THUÊ SỐ TỰ ĐỘNG & 2FA\n` +
                 `👤 ID của bạn: ${userId}\n` +
                 `💰 Số dư ví: ${userBalance}đ\n` +
                 `💳 Tổng đã nạp: ${userDeposited}đ\n`;

  if (depositBonusPercent > 0) {
    menuText += `🎁 Khuyến mãi nạp hiện tại: Tặng thêm +${depositBonusPercent}% vào ví!\n`;
  }

  menuText += `\n👉 Mẹo: Dán trực tiếp chuỗi 2FA hoặc Secret Key vào đây bất kỳ lúc nào để lấy mã OTP 6 số!`;

  if (userId === ADMIN_ID) {
    const users = await User.find({});
    const totalUsers = users.length;
    let totalDepositedAll = 0;
    let totalBalanceAll = 0;

    users.forEach(u => { 
      totalDepositedAll += (u.total_deposited || 0); 
      totalBalanceAll += (u.balance || 0);
    });

    menuText += `\n\n📊 THỐNG KÊ HỆ THỐNG:\n` +
                `👥 Tổng thành viên: ${totalUsers} người\n` +
                `💵 Tổng tiền nạp toàn bộ (gồm Admin): ${totalDepositedAll.toLocaleString()}đ\n` +
                `💰 Tổng số dư hiện tại trong ví: ${totalBalanceAll.toLocaleString()}đ\n` +
                `🎁 Mức khuyến mãi nạp: ${depositBonusPercent}%\n` +
                `🤝 Hoa hồng giới thiệu: ${referralCommissionPercent}%\n` +
                `🛠️ Trạng thái bảo trì: ${isMaintenanceMode ? 'ĐANG BẬT 🔴' : 'ĐANG TẮT 🟢'}\n` +
                `👥 Danh sách ngoại lệ bảo trì: ${allowedMaintenanceUsers.length > 0 ? allowedMaintenanceUsers.join(', ') : 'Trống'}`;
  }

  bot.sendMessage(chatId, menuText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎵 Thuê TikTok', callback_data: 'menu_tiktok' }],
        [{ text: '🛍️ Thuê Shopee', callback_data: 'menu_shopee' }],
        [{ text: '🚗 Thuê Grab', callback_data: 'menu_grab' }],
        [{ text: '💳 Nạp tiền tự động', callback_data: 'menu_nap' }],
        [{ text: '🔗 Giới thiệu bạn bè', callback_data: 'menu_ref' }],
        [
          { text: '💰 Kiểm tra số dư', callback_data: 'check_balance' },
          { text: '📞 Hỗ trợ Admin', url: 'https://t.me/phanhe' }
        ]
      ]
    }
  });
}

async function sendReferralMenu(chatId, userId, messageId) {
  userState.delete(userId);
  const user = await getUser(userId);
  const refCount = user.referralCount || 0;
  const totalComm = (user.total_commission || 0).toLocaleString();
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  const text = `🔗 GIỚI THIỆU BẠN BÈ\n` +
               `-----------------------------------\n\n` +
               `Chia sẻ link dưới đây cho bạn bè. Khi họ nạp tiền, bạn tự động nhận ${referralCommissionPercent}% hoa hồng mỗi lần họ nạp tiền.\n\n` +
               `👥 Đã giới thiệu: ${refCount} người\n` +
               `💰 Tổng hoa hồng đã nhận: ${totalComm}đ\n\n` +
               `🔗 Link giới thiệu của bạn:\n` +
               `${refLink}`;

  const shareText = encodeURIComponent(`🤖 Thuê số OTP tự động giá siêu rẻ & lấy mã 2FA cực nhanh tại đây: ${refLink}`);
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

  const replyMarkup = {
    inline_keyboard: [
      [{ text: '📬 Chia sẻ ngay', url: shareUrl }],
      [{ text: '🏠 Trang chủ', callback_data: 'back_main' }]
    ]
  };

  bot.deleteMessage(chatId, messageId).catch(() => {});
  bot.sendMessage(chatId, text, {
    reply_markup: replyMarkup,
    disable_web_page_preview: true
  });
}

async function sendDepositMenu(chatId, messageId = null) {
  let text = `💰 NẠP TIỀN TỰ ĐỘNG\n`;
  if (depositBonusPercent > 0) {
    text += `🎁 Đang có chương trình khuyến mãi: Tặng ngay +${depositBonusPercent}% giá trị nạp!\n\n`;
  }
  text += `Chọn nhanh số tiền hoặc bấm nhập số tiền khác (Tối thiểu 10.000đ):`;

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
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup }).catch(() => {});
  } else {
    bot.sendMessage(chatId, text, { reply_markup: replyMarkup });
  }
}

async function createAndSendQR(chatId, userId, amount, fullName) {
  const content = `${fullName} chuyen tien`;
  const orderId = 'ORD' + Date.now();

  await Deposit.create({ orderId, userId, amount, content, status: 'pending' });

  const bankId = 'TPB';
  const accountNo = '10005968827';
  const accountName = 'DINH CONG HOAT';
  const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;

  let caption = `💰 THÔNG TIN CHUYỂN KHOẢN (TPBANK)\n\n` +
                `🏛️ Ngân hàng: TPBank\n` +
                `💳 Số tài khoản: ${accountNo}\n` +
                `👤 Chủ tài khoản: ${accountName}\n` +
                `💵 Số tiền: ${amount.toLocaleString()}đ\n`;

  if (depositBonusPercent > 0) {
    const bonusVal = Math.floor((amount * depositBonusPercent) / 100);
    const totalVal = amount + bonusVal;
    caption += `🎁 Khuyến mãi (+${depositBonusPercent}%): +${bonusVal.toLocaleString()}đ\n` +
               `💰 Nhận thực tế vào ví: ${totalVal.toLocaleString()}đ\n`;
  }

  caption += `📝 Nội dung: ${content}\n\n` +
             `⚠️ Mã QR và nội dung này chỉ có hiệu lực trong vòng **10 PHÚT**.\n` +
             `⏰ Quá thời gian trên, vui lòng tạo mã QR mới trước khi chuyển!\n` +
             `⏳ Hệ thống sẽ tự cộng tiền sau vài giây khi bạn chuyển khoản thành công!`;

  bot.sendPhoto(chatId, qrUrl, {
    parse_mode: 'Markdown',
    caption: caption,
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

  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    if (text.startsWith('/start')) {
      return bot.sendMessage(
        chatId,
        `👋 Xin chào @${msg.from.username || msg.from.first_name || 'bạn'}!\n` +
        `👉 Vui lòng **nhắn riêng cho bot** để sử dụng dịch vụ thuê số và nạp tiền nhé!`,
        {
          reply_to_message_id: msg.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Nhắn riêng cho Bot ngay', url: `https://t.me/${botUsername}?start=from_group` }]
            ]
          }
        }
      ).catch(() => {});
    }
    return;
  }

  const isJoined = await checkUserMembership(userId);
  if (!isJoined && userId !== ADMIN_ID) {
    return bot.sendMessage(
      chatId, 
      `⚠️ BẠN CHƯA THAM GIA NHÓM!\n\n` +
      `👉 Vui lòng tham gia nhóm chính thức của hệ thống để sử dụng đầy đủ các tính năng thuê số và nạp tiền tự động.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Tham gia nhóm ngay', url: INVITE_LINK }],
            [{ text: '🔄 Đã tham gia, bấm để tiếp tục /start', callback_data: 'back_main' }]
          ]
        }
      }
    );
  }

  if (isMaintenanceMode && userId !== ADMIN_ID && !allowedMaintenanceUsers.includes(userId)) {
    return bot.sendMessage(chatId, `🛠️ HỆ THỐNG ĐANG BẢO TRÌ\n\nBot hiện đang tạm dừng hoạt động để nâng cấp và sửa lỗi. Vui lòng quay lại sau!`);
  }

  if (checkSpam(userId)) {
    return bot.sendMessage(chatId, `⚠️ Bạn thao tác quá nhanh! Vui lòng đợi vài giây trước khi tiếp tục.`).catch(() => {});
  }

  if (userState.get(userId) === 'awaiting_fullname') {
    const rawFullName = removeAccentsAndUpperCase(text);
    const isValidName = /^[A-Z\s]+$/.test(rawFullName);

    if (!isValidName || rawFullName.length < 3 || !rawFullName.includes(' ')) {
      return bot.sendMessage(chatId, `⚠️ Họ và tên không hợp lệ!\nVui lòng chỉ nhập đầy đủ Họ và Tên bằng chữ cái không dấu (Ví dụ: Hoang Van Khanh):`);
    }

    const proposedContent = `${rawFullName} chuyen tien`;

    const existingContent = await Deposit.findOne({ content: proposedContent, status: 'pending' });
    if (existingContent) {
      return bot.sendMessage(chatId, `❌ Họ và tên này đang được sử dụng trong một giao dịch khác hoặc đã tồn tại!\n\nVui lòng nhập Họ và Tên khác (hoặc thêm tên đệm):`);
    }

    await User.updateOne({ userId: userId }, { fullName: rawFullName });

    const amount = tempDepositData.get(userId);
    userState.delete(userId);
    tempDepositData.delete(userId);

    return createAndSendQR(chatId, userId, amount, rawFullName);
  }

  if (userState.get(userId) === 'awaiting_deposit_amount') {
    const cleanNumberText = text.replace(/[^0-9]/g, '');
    const customAmount = parseInt(cleanNumberText, 10);

    if (isNaN(customAmount) || customAmount < 10000) {
      return bot.sendMessage(chatId, `⚠️ Số tiền không hợp lệ!\n\nVui lòng nhập số tiền từ 10.000đ trở lên (Ví dụ gửi: 15000 hoặc 200000):`);
    }

    tempDepositData.set(userId, customAmount);
    
    const userDoc = await User.findOne({ userId: userId });
    if (userDoc && userDoc.fullName) {
      userState.delete(userId);
      tempDepositData.delete(userId);
      return createAndSendQR(chatId, userId, customAmount, userDoc.fullName);
    }

    userState.set(userId, 'awaiting_fullname');
    return bot.sendMessage(chatId, `✏️ NHẬP HỌ VÀ TÊN CỦA BẠN\n\n👉 Vui lòng nhập Họ và Tên không dấu (Ví dụ: Hoang Van Khanh):`);
  }

  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
      const inviterId = parts[1].replace('ref_', '').trim();
      
      if (inviterId !== userId) {
        let existingUser = await User.findOne({ userId: userId });
        if (!existingUser) {
          await User.create({ userId: userId, balance: 0, total_deposited: 0, referredBy: inviterId });
          await User.updateOne({ userId: inviterId }, { $inc: { referralCount: 1 } });

          bot.sendMessage(inviterId, `🎉 BẠN CÓ THÀNH VIÊN MỚI!\nUser ${userId} vừa tham gia bot qua link giới thiệu của bạn.`).catch(() => {});
        }
      }
    }
    return sendMainMenu(chatId, userId);
  }

  if (text.startsWith('/hoahong')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const parts = text.split(' ');
    const percent = parseInt(parts[1], 10);

    if (isNaN(percent) || percent < 0) {
      return bot.sendMessage(chatId, `⚠️ Cú pháp không hợp lệ!\n\nVui lòng cài đặt bằng cú pháp:\n- Đặt 10% hoa hồng: /hoahong 10\n- Tắt hoa hồng: /hoahong 0`);
    }

    referralCommissionPercent = percent;
    return bot.sendMessage(chatId, `✅ Đã cập nhật tỷ lệ hoa hồng giới thiệu: ${percent}% cho mỗi lần bạn bè nạp tiền.`);
  }

  if (text.startsWith('/km')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const parts = text.split(' ');
    const percent = parseInt(parts[1], 10);

    if (isNaN(percent) || percent < 0) {
      return bot.sendMessage(chatId, `⚠️ Định dạng không hợp lệ!\n\nVui lòng nhập đúng cú pháp:\n- Bật khuyến mãi 10%: /km 10\n- Tắt khuyến mãi: /km 0`);
    }

    depositBonusPercent = percent;
    if (percent > 0) {
      return bot.sendMessage(chatId, `🎁 Đã cập nhật khuyến mãi nạp tiền!\nTừ bây giờ mỗi khi khách nạp tiền sẽ được tặng thêm +${percent}% vào ví.`);
    } else {
      return bot.sendMessage(chatId, `❌ Đã tắt chương trình khuyến mãi nạp tiền.`);
    }
  }

  if (text.startsWith('/baotri_cho')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const parts = text.split(' ');
    const targetUserId = parts[1] ? parts[1].trim() : '';

    if (!targetUserId) {
      return bot.sendMessage(chatId, `⚠️ Vui lòng nhập ID user.\n*Ví dụ:* /baotri_cho 123456789`);
    }

    if (!allowedMaintenanceUsers.includes(targetUserId)) {
      allowedMaintenanceUsers.push(targetUserId);
      await Config.updateOne({ key: 'system_settings' }, { $set: { allowedUsers: allowedMaintenanceUsers } }, { upsert: true });
    }

    return bot.sendMessage(chatId, `✅ Đã cấp quyền cho User ID: \`${targetUserId}\` được phép tiếp tục sử dụng bot trong thời gian bảo trì.`);
  }

  if (text.startsWith('/baotri_xoa')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const parts = text.split(' ');
    const targetUserId = parts[1] ? parts[1].trim() : '';

    if (!targetUserId) {
      return bot.sendMessage(chatId, `⚠️ Vui lòng nhập ID user cần xóa.\n*Ví dụ:* /baotri_xoa 123456789`);
    }

    allowedMaintenanceUsers = allowedMaintenanceUsers.filter(id => id !== targetUserId);
    await Config.updateOne({ key: 'system_settings' }, { $set: { allowedUsers: allowedMaintenanceUsers } }, { upsert: true });

    return bot.sendMessage(chatId, `✅ Đã thu hồi quyền truy cập của User ID: \`${targetUserId}\` khi bot bảo trì.`);
  }

  if (text.startsWith('/baotri')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Bạn không có quyền sử dụng lệnh này!`);
    const parts = text.split(' ');
    const status = parts[1] ? parts[1].toLowerCase() : '';

    if (status === 'on') {
      isMaintenanceMode = true;
      await Config.updateOne({ key: 'system_settings' }, { $set: { isMaintenanceMode: true } }, { upsert: true });
      return bot.sendMessage(chatId, `🔴 Đã BẬT chế độ bảo trì! (Lưu vĩnh viễn trong DB).`);
    } else if (status === 'off') {
      isMaintenanceMode = false;
      await Config.updateOne({ key: 'system_settings' }, { $set: { isMaintenanceMode: false } }, { upsert: true });
      return bot.sendMessage(chatId, `🟢 Đã TẮT chế độ bảo trì! Bot đã hoạt động bình thường trở lại cho mọi thành viên.`);
    } else {
      return bot.sendMessage(chatId, `ℹ️ Trạng thái bảo trì hiện tại: ${isMaintenanceMode ? 'ĐANG BẬT 🔴' : 'ĐANG TẮT 🟢'}\n\n👉 Cách dùng:\n- Bật: /baotri on\n- Tắt: /baotri off`);
    }
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
            `📢 THÔNG BÁO TỪ HỆ THỐNG\n\n${messageContent}`,
            { disable_web_page_preview: true }
          );
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          failCount++;
        }
      }

      bot.sendMessage(chatId, `✅ GỬI THÔNG BÁO HOÀN TẤT!\n- Thành công: ${successCount}\n- Thất bại (chặn bot): ${failCount}`);
    } catch (err) {
      bot.sendMessage(chatId, `❌ Lỗi khi gửi thông báo hàng loạt.`);
    }
    return;
  }

  if (text.startsWith('/nap')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Không có quyền!`);
    const parts = text.replace('/nap', '').trim().split(' ');
    
    if (parts.length < 2) {
      return bot.sendMessage(chatId, `⚠️ Cú pháp không hợp lệ!\n*Dùng:* /nap <Họ Tên> <Số tiền>\n*Ví dụ:* /nap NGUYEN VAN A 50000`);
    }

    const amountStr = parts[parts.length - 1].replace(/[^0-9]/g, '');
    const amount = parseInt(amountStr, 10);
    const nameQuery = parts.slice(0, parts.length - 1).join(' ');
    const cleanSearchName = removeAccentsAndUpperCase(nameQuery);

    if (isNaN(amount) || amount <= 0 || !cleanSearchName) {
      return bot.sendMessage(chatId, `⚠️ Số tiền hoặc tên không hợp lệ!`);
    }

    const targetUser = await User.findOne({ 
      fullName: { $regex: new RegExp(cleanSearchName, 'i') } 
    });

    if (!targetUser) {
      return bot.sendMessage(chatId, `❌ Không tìm thấy user nào có tên chứa: "${nameQuery}"`);
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId: targetUser.userId },
      { $inc: { balance: amount, total_deposited: amount } },
      { new: true }
    );

    bot.sendMessage(chatId, `✅ Đã nạp thành công +${amount.toLocaleString()}đ cho user: **${targetUser.fullName}** (ID: ${targetUser.userId})\n💰 Số dư mới: ${updatedUser.balance.toLocaleString()}đ`);
    bot.sendMessage(targetUser.userId, `🎉 Tài khoản được cộng: +${amount.toLocaleString()}đ\n💰 Số dư ví hiện tại: ${updatedUser.balance.toLocaleString()}đ`).catch(() => {});
    return;
  }

  if (text.startsWith('/tru')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Không có quyền!`);
    const parts = text.replace('/tru', '').trim().split(' ');
    
    if (parts.length < 2) {
      return bot.sendMessage(chatId, `⚠️ Cú pháp không hợp lệ!\n*Dùng:* /tru <Họ Tên> <Số tiền>\n*Ví dụ:* /tru NGUYEN VAN A 20000`);
    }

    const amountStr = parts[parts.length - 1].replace(/[^0-9]/g, '');
    const amount = parseInt(amountStr, 10);
    const nameQuery = parts.slice(0, parts.length - 1).join(' ');
    const cleanSearchName = removeAccentsAndUpperCase(nameQuery);

    if (isNaN(amount) || amount <= 0 || !cleanSearchName) {
      return bot.sendMessage(chatId, `⚠️ Số tiền hoặc tên không hợp lệ!`);
    }

    const targetUser = await User.findOne({ 
      fullName: { $regex: new RegExp(cleanSearchName, 'i') } 
    });

    if (!targetUser) {
      return bot.sendMessage(chatId, `❌ Không tìm thấy user nào có tên chứa: "${nameQuery}"`);
    }

    const userBalance = targetUser.balance || 0;
    if (userBalance < amount) {
      return bot.sendMessage(chatId, `⚠️ Số dư của ${targetUser.fullName} (${userBalance.toLocaleString()}đ) nhỏ hơn số tiền muốn trừ (${amount.toLocaleString()}đ)!`);
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId: targetUser.userId },
      { $inc: { balance: -amount, total_deposited: -amount } },
      { new: true }
    );

    bot.sendMessage(chatId, `✅ Đã trừ -${amount.toLocaleString()}đ của user: **${targetUser.fullName}** (ID: ${targetUser.userId})\n💰 Số dư mới: ${updatedUser.balance.toLocaleString()}đ`);
    bot.sendMessage(targetUser.userId, `💸 Tài khoản bị trừ: -${amount.toLocaleString()}đ\n💳 Số dư ví hiện tại: ${updatedUser.balance.toLocaleString()}đ`).catch(() => {});
    return;
  }

  if (text.startsWith('/hoan')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Không có quyền!`);
    const parts = text.split(' ');
    if (parts.length >= 2) {
      const targetReqId = parts[1].trim();

      const orderData = await Order.findOne({
        $or: [
          { reqId: targetReqId },
          { reqId: parseInt(targetReqId, 10) }
        ]
      });

      if (!orderData) {
        return bot.sendMessage(chatId, `❌ Không tìm thấy thông tin đơn hàng có mã: ${targetReqId} trong hệ thống.`);
      }

      if (orderData.status === 'refunded') {
        return bot.sendMessage(chatId, `⚠️ Đơn hàng ${targetReqId} này đã được hoàn tiền trước đó rồi!`);
      }

      const targetUserId = orderData.userId;
      const refundAmount = orderData.price;

      const updatedUser = await User.findOneAndUpdate(
        { userId: targetUserId },
        { $inc: { balance: refundAmount } },
        { new: true }
      );

      if (!updatedUser) {
        return bot.sendMessage(chatId, `❌ Không tìm thấy user ID ${targetUserId} trong hệ thống.`);
      }

      orderData.status = 'refunded';
      await orderData.save();

      bot.sendMessage(
        chatId, 
        `✅ HOÀN TIỀN THÀNH CÔNG!\n` +
        `🆔 Mã đơn: ${targetReqId}\n` +
        `👤 User ID: ${targetUserId}\n` +
        `💵 Số tiền hoàn: +${refundAmount.toLocaleString()}đ\n` +
        `💰 Số dư mới của khách: ${updatedUser.balance.toLocaleString()}đ`
      );

      bot.sendMessage(
        targetUserId, 
        `🔄 HOÀN TIỀN ĐƠN HÀNG LỖI\n\n` +
        `🆔 Mã đơn: ${targetReqId}\n` +
        `💵 Số tiền hoàn: +${refundAmount.toLocaleString()}đ\n` +
        `💳 Số dư ví hiện tại: ${updatedUser.balance.toLocaleString()}đ`
      ).catch(() => {});
    } else {
      bot.sendMessage(chatId, `⚠️ Cú pháp: /hoan <mã_đơn>\n*Ví dụ:* /hoan 464168350`);
    }
    return;
  }

  if (text.startsWith('/setnap')) {
    if (userId !== ADMIN_ID) return bot.sendMessage(chatId, `❌ Không có quyền!`);
    const parts = text.replace('/setnap', '').trim().split(' ');
    
    if (parts.length < 2) {
      return bot.sendMessage(chatId, `⚠️ Cú pháp không hợp lệ!\n*Dùng:* /setnap <Họ Tên> <Số tiền muốn tăng/giảm>\n*Ví dụ:* /setnap Nguyen Van A 20000 (hoặc -10000)`);
    }

    const rawAmountStr = parts[parts.length - 1];
    const isNegative = rawAmountStr.startsWith('-');
    const amountVal = parseInt(rawAmountStr.replace(/[^0-9]/g, ''), 10);
    const amount = isNegative ? -amountVal : amountVal;

    const nameQuery = parts.slice(0, parts.length - 1).join(' ');
    const cleanSearchName = removeAccentsAndUpperCase(nameQuery);

    if (isNaN(amount) || !cleanSearchName) {
      return bot.sendMessage(chatId, `⚠️ Số tiền hoặc tên không hợp lệ!`);
    }

    const targetUser = await User.findOne({ 
      fullName: { $regex: new RegExp(cleanSearchName, 'i') } 
    });

    if (!targetUser) {
      return bot.sendMessage(chatId, `❌ Không tìm thấy user nào có tên chứa: "${nameQuery}"`);
    }

    const updatedUser = await User.findOneAndUpdate(
      { userId: targetUser.userId },
      { $inc: { total_deposited: amount } },
      { new: true }
    );

    return bot.sendMessage(chatId, `✅ Đã điều chỉnh tổng nạp của **${targetUser.fullName}** thêm ${amount.toLocaleString()}đ.\n💳 Tổng nạp mới: ${updatedUser.total_deposited.toLocaleString()}đ`);
  }

  if (text.startsWith('/')) return;

  let rawSecret = text.includes('|') ? text.split('|').pop() : text;
  let cleanSecret = rawSecret.toUpperCase().replace(/[^A-Z2-7]/g, '');

  if (cleanSecret.length >= 16) {
    try {
      const token2fa = authenticator.generate(cleanSecret);
      return bot.sendMessage(chatId, `🔐 MÃ 2FA:\n🔑 Secret: ${cleanSecret}\n✅ OTP: ${token2fa}`);
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

  const isJoined = await checkUserMembership(userId);
  if (!isJoined && userId !== ADMIN_ID) {
    return bot.answerCallbackQuery(query.id, { 
      text: `❌ Bạn chưa tham gia nhóm chính thức! Vui lòng tham gia nhóm để sử dụng.`, 
      show_alert: true 
    });
  }

  if (isMaintenanceMode && userId !== ADMIN_ID && !allowedMaintenanceUsers.includes(userId)) {
    return bot.answerCallbackQuery(query.id, { text: `🛠️ Hệ thống đang bảo trì, vui lòng quay lại sau!`, show_alert: true });
  }

  const user = await getUser(userId);

  if (action === 'menu_ref') {
    return sendReferralMenu(chatId, userId, messageId);
  }

  if (action === 'back_main') {
    bot.deleteMessage(chatId, messageId).catch(() => {});
    return sendMainMenu(chatId, userId);
  }

  if (action === 'menu_nap') {
    userState.delete(userId);
    tempDepositData.delete(userId);
    bot.deleteMessage(chatId, messageId).catch(() => {});
    return sendDepositMenu(chatId);
  }

  if (action.startsWith('dep_') && action !== 'dep_custom') {
    const amount = parseInt(action.replace('dep_', ''), 10);
    bot.deleteMessage(chatId, messageId).catch(() => {});

    if (user.fullName) {
      return createAndSendQR(chatId, userId, amount, user.fullName);
    }

    tempDepositData.set(userId, amount);
    userState.set(userId, 'awaiting_fullname');
    return bot.sendMessage(chatId, `✏️ NHẬP HỌ VÀ TÊN CỦA BẠN\n\n👉 Vui lòng nhập Họ và Tên không dấu (Ví dụ: Hoang Van Khanh):`);
  }

  if (action === 'dep_custom') {
    userState.set(userId, 'awaiting_deposit_amount');
    return bot.sendMessage(
      chatId,
      `✏️ NHẬP SỐ TIỀN BẠN MUỐN NẠP\n\n` +
      `👉 Vui lòng dán/nhập số tiền muốn nạp vào ô tin nhắn bên dưới (Tối thiểu 10.000đ).\n` +
      `*Ví dụ:* Nhập 15000 hoặc 500000`
    );
  }

  if (action === 'rent_more') {
    userState.delete(userId);
    bot.deleteMessage(chatId, messageId).catch(() => {});
    return sendMainMenu(chatId, userId);
  }

  if (action === 'menu_shopee') {
    return bot.editMessageText(`🛍️ CHỌN DỊCH VỤ SHOPEE (KHÔNG BẢO HÀNH)`, {
      chat_id: chatId, message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Shopee HN - 5.000đ', callback_data: 'rent_shopee' }],
          [{ text: '🛍️ Shopee HV - 5.000đ', callback_data: 'rent_shopee_viotp' }],
          [{ text: '🛍️ Shopee HC - 5.000đ', callback_data: 'rent_shopee_chaycode' }],
          [{ text: '🛍️ Shopee Call - 2.500đ', callback_data: 'rent_shopee_call' }],
          [{ text: '🛍️ Shopee Mượt - 4.000đ', callback_data: 'rent_shopee_muot' }],
          [{ text: '🛍️ Shopee Ít đá số - 4.000đ', callback_data: 'rent_shopee_trau' }],
          [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
        ]
      }
    });
  }

  if (action === 'menu_tiktok') {
    return bot.editMessageText(`🎵 CHỌN MÃ VÙNG TIKTOK`, {
      chat_id: chatId, message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎵 TikTok US +1 - 1.200đ', callback_data: 'rent_tt_us10' }],
          [{ text: '🎵 TikTok US +1 - 1.200đ', callback_data: 'rent_tt_us9' }],
          [{ text: '🎵 TikTok Indonesia +62 - 1.200đ', callback_data: 'rent_tt_indo19' }],
          [{ text: '🎵 TikTok Indonesia +62 - 1.200đ', callback_data: 'rent_tt_indo21' }],
          [{ text: '🎵 TikTok Chile +56 - 1.200đ', callback_data: 'rent_tt_chile12' }],
          [{ text: '🎵 TikTok Chile +56 - 1.200đ', callback_data: 'rent_tt_chile7' }],
          [{ text: '🎵 TikTok Colombia +57 - 1.200đ', callback_data: 'rent_tt_colombia7' }],
          [{ text: '🎵 TikTok Colombia +57 - 1.200đ', callback_data: 'rent_tt_colombia8' }],
          [{ text: '⬅️ Quay lại', callback_data: 'back_main' }]
        ]
      }
    });
  }

  if (action === 'menu_grab') {
    return bot.editMessageText(`🚗 CHỌN DỊCH VỤ GRAB`, {
      chat_id: chatId, message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚗 Grab - 3.000đ', callback_data: 'rent_grab' }],
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
      return bot.sendMessage(chatId, `❌ Số dư không đủ! Cần tối thiểu ${price.toLocaleString()}đ.`);
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
        
        const phoneNumber = resData ? (resData.number || resData.phone || resData.phoneNumber || resData.msg) : null;
        const requestId = resData ? (resData.request_id || resData.id || resData.requestId) : null;

        if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.length > 5) {
          rawPhone = phoneNumber;
          reqId = requestId || 'N/A';
        } else {
          if (!isAdmin) {
            await User.updateOne({ userId: userId }, { $inc: { balance: price } });
          }

          if (isAdmin) {
            const errorDetail = JSON.stringify(resData) || 'Phản hồi rỗng';
            return bot.sendMessage(chatId, `❌ [ADMIN DEBUG - GMAILOTP]\n- Dịch vụ: ${countryLabel} (ID: ${serviceId})\n- Phản hồi: ${errorDetail}`);
          }

          return bot.sendMessage(chatId, `❌ Dịch vụ hiện tại đang hết số, vui lòng thử lại sau!`);
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

          if (isAdmin) {
            const errorDetail = JSON.stringify(resData) || 'Phản hồi rỗng';
            return bot.sendMessage(chatId, `❌ [ADMIN DEBUG - NPA]\n- Dịch vụ: ${countryLabel} (Server: ${serviceId})\n- Phản hồi: ${errorDetail}`);
          }

          return bot.sendMessage(chatId, `❌ Dịch vụ hiện tại đang hết số, vui lòng thử lại sau!`);
        }
      } else if (provider === 'botmmo') {
        const site = serviceInfo.site;
        const apiKey = serviceInfo.apikey;

        const rentUrl = `https://botmmo.xyz/api/rent_number.php?mode=4&site=${site}&apikey=${apiKey}&serviceId=${serviceId}&network=7&hostname=https://botmmo.xyz`;
        
        const apiResponse = await axios.get(rentUrl, {
          headers: { 'APIKEY': KEY_SERVER }
        });
        
        const resData = apiResponse.data;
        console.log(`🔍 Phản hồi API thuê số BOTMMO (${site}):`, resData);

        const phoneObj = resData.data || resData.Result;
        const foundPhone = phoneObj?.phone_number || phoneObj?.sdt || phoneObj?.number || '';
        const foundReqId = phoneObj?.request_id || phoneObj?.reference || phoneObj?.id || 'N/A';

        if (foundPhone && foundPhone.length > 5) {
          rawPhone = foundPhone;
          reqId = foundReqId;
        } else {
          if (!isAdmin) {
            await User.updateOne({ userId: userId }, { $inc: { balance: price } });
          }

          if (isAdmin) {
            const errorDetail = JSON.stringify(resData) || 'Phản hồi rỗng';
            return bot.sendMessage(chatId, `❌ [ADMIN DEBUG - BOTMMO (${site})]\n- Dịch vụ: ${countryLabel}\n- Phản hồi: ${errorDetail}`);
          }

          return bot.sendMessage(chatId, `❌ Dịch vụ hiện tại đang hết số hoặc chưa lọc được số mới, vui lòng thử lại sau!`);
        }
      }

      if (reqId && reqId !== 'N/A') {
        await Order.create({ reqId: reqId.toString(), userId: userId, price: price, serviceName: countryLabel, status: 'pending' }).catch(() => {});
      }

      const balanceDisplay = isAdmin ? "Miễn phí (Admin)" : `${updatedUser.balance.toLocaleString()}đ`;

      await bot.sendMessage(
        chatId,
        `✅ THUÊ SỐ THÀNH CÔNG!\n\n` +
        `🌐 Dịch vụ: ${countryLabel}\n` +
        `📞 Số điện thoại: ${rawPhone}\n` +
        `🆔 Mã đơn: ${reqId}\n` +
        `💰 Số dư còn lại: ${balanceDisplay}\n\n` +
        `⏳ Đang chờ mã OTP (tối đa 5 phút)...`
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
            const otpRes = await axios.post(
              'https://otpapi.cmsnpa.com/api/v1/check_code', 
              { id: reqId.toString() }, 
              {
                headers: { 
                  'Authorization': `Bearer ${API_KEY_NPA}`, 
                  'Content-Type': 'application/json' 
                }
              }
            );

            if (otpRes.data) {
              if (otpRes.data.ok === true && otpRes.data.code) {
                otpCode = otpRes.data.code;
              } else if (otpRes.data.Result && otpRes.data.Result.Code) {
                otpCode = otpRes.data.Result.Code;
              } else if (otpRes.data.code && typeof otpRes.data.code === 'string') {
                otpCode = otpRes.data.code;
              } else if (otpRes.data.sms && typeof otpRes.data.sms === 'string') {
                otpCode = otpRes.data.sms;
              }
            }
          } else if (provider === 'botmmo') {
            const checkOtpUrl = `https://botmmo.xyz/api/check_code.php?requestId=${reqId}`;
            const otpRes = await axios.get(checkOtpUrl);

            if (otpRes.data) {
              if (otpRes.data.status === 'done' && otpRes.data.code) {
                otpCode = otpRes.data.code;
              } else if (otpRes.data.status === 'timeout') {
                isCompleted = true;
                clearInterval(checkInterval);
              }
            }
          }

          if (otpCode && !isCompleted) {
            isCompleted = true;
            clearInterval(checkInterval);
            clearTimeout(timeoutRefund);
            
            if (reqId && reqId !== 'N/A') {
              await Order.updateOne({ reqId: reqId.toString() }, { $set: { status: 'completed' } }).catch(() => {});
            }

            bot.sendMessage(
              chatId,
              `🎉 ĐÃ NHẬN ĐƯỢC MÃ OTP CHO ĐƠN ${reqId}\n🔑 Mã OTP: ${otpCode}`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: '🔄 Lấy số khác cùng loại', callback_data: action }]]
                }
              }
            ).catch(() => {});
          }
        } catch (e) {}
      }, 3000);

      const timeoutRefund = setTimeout(async () => {
        if (isCompleted) return;
        isCompleted = true;
        clearInterval(checkInterval);

        if (provider === 'gmailotp' && reqId !== 'N/A') {
          axios.get(`https://gmailotp.site/api?action=cancel_phone&key=${API_KEY_GMAILOTP}&id=${reqId}`).catch(() => {});
        }

        let refundMsg = `⏰ ĐÃ HẾT 5 PHÚT! Đơn hàng ${reqId} đã được hoàn tiền ${price.toLocaleString()}đ vào ví.`;
        if (isAdmin) {
          refundMsg = `⏰ ĐÃ HẾT 5 PHÚT! Đã hủy đơn hàng ${reqId} (Tài khoản Admin miễn phí).`;
        } else {
          await User.updateOne({ userId: userId }, { $inc: { balance: price } });
        }

        if (reqId && reqId !== 'N/A') {
          await Order.updateOne({ reqId: reqId.toString() }, { $set: { status: 'failed' } }).catch(() => {});
        }

        bot.sendMessage(chatId, refundMsg, {
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
