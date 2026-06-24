const mineflayer = require('mineflayer');
const express = require('express');

// ============================================================
//  CẤU HÌNH BOT – thay đổi tại đây nếu cần
// ============================================================
const CONFIG = {
  host: process.env.MC_HOST || 'nhancu1234.aternos.me',
  port: parseInt(process.env.MC_PORT, 10) || 44076,
  username: process.env.MC_USERNAME || 'BotTreoServer',
  version: process.env.MC_VERSION || false,      // tự detect phiên bản
  reconnectDelay: 30_000,                         // 30 giây giữa mỗi lần reconnect
  antiAfkInterval: 15_000,                        // 15 giây nhảy 1 lần chống AFK
};

// ============================================================
//  WEB SERVER – Render yêu cầu 1 HTTP endpoint để giữ service
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

let botStatus = { online: false, lastLogin: null, lastError: null };

app.get('/', (_req, res) => {
  res.json({
    status: botStatus.online ? '🟢 Bot đang online' : '🔴 Bot đang offline',
    server: `${CONFIG.host}:${CONFIG.port}`,
    username: CONFIG.username,
    lastLogin: botStatus.lastLogin,
    lastError: botStatus.lastError,
    uptime: process.uptime().toFixed(0) + 's',
  });
});

app.get('/health', (_req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`[WEB] Health-check server đang chạy tại port ${PORT}`);
});

// ============================================================
//  TẠO & QUẢN LÝ BOT
// ============================================================
let bot = null;
let antiAfkTimer = null;

function createBot() {
  console.log(`[BOT] Đang kết nối đến ${CONFIG.host}:${CONFIG.port} ...`);

  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    version: CONFIG.version || undefined,
    auth: 'offline',                // Aternos thường dùng offline mode
    hideErrors: false,
  });

  // === Sự kiện: Đăng nhập thành công ===
  bot.on('login', () => {
    console.log(`[BOT] ✅ Đã đăng nhập thành công với tên "${bot.username}"`);
    botStatus.online = true;
    botStatus.lastLogin = new Date().toISOString();
  });

  bot.on('spawn', () => {
    console.log('[BOT] ✅ Đã spawn vào thế giới!');
    startAntiAfk();
  });

  // === Sự kiện: Chat ===
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] <${username}> ${message}`);
  });

  // === Sự kiện: Bị kick ===
  bot.on('kicked', (reason) => {
    console.log(`[BOT] ⚠️  Bị kick: ${reason}`);
    botStatus.online = false;
    botStatus.lastError = `Kicked: ${reason}`;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Lỗi ===
  bot.on('error', (err) => {
    console.log(`[BOT] ❌ Lỗi: ${err.message}`);
    botStatus.lastError = err.message;
  });

  // === Sự kiện: Mất kết nối ===
  bot.on('end', (reason) => {
    console.log(`[BOT] 🔌 Mất kết nối: ${reason || 'unknown'}`);
    botStatus.online = false;
    botStatus.lastError = `Disconnected: ${reason || 'unknown'}`;
    stopAntiAfk();
    scheduleReconnect();
  });
}

// ============================================================
//  CHỐNG AFK – nhảy & xoay đầu mỗi 15 giây
// ============================================================
function startAntiAfk() {
  stopAntiAfk();
  console.log('[AFK] Bắt đầu anti-AFK...');

  antiAfkTimer = setInterval(() => {
    if (!bot || !bot.entity) return;

    try {
      // Nhảy
      bot.setControlState('jump', true);
      setTimeout(() => {
        if (bot) bot.setControlState('jump', false);
      }, 500);

      // Xoay ngẫu nhiên
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * Math.PI;
      bot.look(yaw, pitch, false);

      // Đôi khi đi vòng tròn nhỏ
      if (Math.random() > 0.7) {
        const directions = ['forward', 'back', 'left', 'right'];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        bot.setControlState(dir, true);
        setTimeout(() => {
          if (bot) bot.setControlState(dir, false);
        }, 1000);
      }
    } catch (e) {
      console.log('[AFK] Lỗi anti-afk:', e.message);
    }
  }, CONFIG.antiAfkInterval);
}

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearInterval(antiAfkTimer);
    antiAfkTimer = null;
  }
}

// ============================================================
//  TỰ ĐỘNG RECONNECT
// ============================================================
function scheduleReconnect() {
  const delaySec = CONFIG.reconnectDelay / 1000;
  console.log(`[BOT] 🔄 Sẽ kết nối lại sau ${delaySec} giây...`);

  setTimeout(() => {
    console.log('[BOT] 🔄 Đang kết nối lại...');
    createBot();
  }, CONFIG.reconnectDelay);
}

// ============================================================
//  KHỞI CHẠY
// ============================================================
console.log('=========================================');
console.log('  🤖 Minecraft AFK Bot – Aternos');
console.log(`  Server: ${CONFIG.host}:${CONFIG.port}`);
console.log(`  Bot:    ${CONFIG.username}`);
console.log('=========================================');

createBot();

// Xử lý tắt an toàn
process.on('SIGINT', () => {
  console.log('\n[BOT] Đang tắt bot...');
  stopAntiAfk();
  if (bot) bot.quit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[BOT] Nhận SIGTERM, đang tắt...');
  stopAntiAfk();
  if (bot) bot.quit();
  process.exit(0);
});
