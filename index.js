const mineflayer = require('mineflayer');
const express = require('express');

// ============================================================
//  CẤU HÌNH BOT – thay đổi tại đây nếu cần
// ============================================================
const CONFIG = {
  host: process.env.MC_HOST || 'nhancu1234.aternos.me',
  port: parseInt(process.env.MC_PORT, 10) || 44076,
  username: process.env.MC_USERNAME || 'BotTreoServer',
  auth: 'offline',                                  // Aternos dùng offline mode
  reconnectDelay: 30_000,                           // 30 giây giữa mỗi lần reconnect
  antiAfkInterval: 8_000,                           // 8 giây chống AFK (Aternos kick sau 10 phút)
};

// ============================================================
//  CẤU HÌNH NHÀ TÙ BEDROCK
// ============================================================
const PRISON = {
  centerY: 310,       // Độ cao trung tâm nhà tù (gần max Y=319)
  innerSize: 5,       // Kích thước bên trong 5x5x5 (đủ rộng di chuyển + nhảy)
};

// ============================================================
//  WEB SERVER – Render yêu cầu 1 HTTP endpoint để giữ service
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

let botStatus = { online: false, lastLogin: null, lastError: null, position: null };

app.get('/', (_req, res) => {
  res.json({
    status: botStatus.online ? '🟢 Bot đang online' : '🔴 Bot đang offline',
    server: `${CONFIG.host}:${CONFIG.port}`,
    username: CONFIG.username,
    edition: 'Java',
    lastLogin: botStatus.lastLogin,
    lastError: botStatus.lastError,
    position: botStatus.position,
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
let isConnecting = false;
let prisonBuilt = false;
let prisonCenter = { x: 0, y: PRISON.centerY, z: 0 };

function createBot() {
  if (isConnecting) return;
  isConnecting = true;

  console.log(`[BOT] Đang kết nối đến ${CONFIG.host}:${CONFIG.port} (Java Edition)...`);

  try {
    bot = mineflayer.createBot({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      auth: CONFIG.auth,
      hideErrors: false,
    });
  } catch (err) {
    console.log(`[BOT] ❌ Lỗi tạo bot: ${err.message}`);
    isConnecting = false;
    botStatus.lastError = err.message;
    scheduleReconnect();
    return;
  }

  // === Sự kiện: Đã login vào server ===
  bot.on('login', () => {
    console.log(`[BOT] ✅ Đã login vào server!`);
    botStatus.online = true;
    botStatus.lastLogin = new Date().toISOString();
    isConnecting = false;
  });

  // === Sự kiện: Spawn – Chuyển Creative, TP lên cao, xây nhà tù ===
  bot.once('spawn', () => {
    console.log('[BOT] ✅ Đã spawn vào thế giới!');
    const pos = bot.entity.position;
    console.log(`[BOT] 📍 Vị trí spawn: (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);

    // Delay nhẹ để server xử lý xong spawn
    setTimeout(() => {
      setupCreativePrison();
    }, 3000);
  });

  // === Sự kiện: Nhận tin nhắn chat ===
  bot.on('chat', (username, message) => {
    if (username === CONFIG.username) return;
    console.log(`[CHAT] <${username}> ${message}`);
  });

  // === Sự kiện: Bị kick ===
  bot.on('kicked', (reason) => {
    let reasonText = reason;
    try { reasonText = JSON.parse(reason)?.text || reason; } catch (_) {}
    console.log(`[BOT] ⚠️  Bị kick: ${reasonText}`);
    botStatus.online = false;
    botStatus.lastError = `Kicked: ${reasonText}`;
    prisonBuilt = false;
    cleanup();
    scheduleReconnect();
  });

  // === Sự kiện: Lỗi ===
  bot.on('error', (err) => {
    console.log(`[BOT] ❌ Lỗi: ${err.message}`);
    botStatus.lastError = err.message;
    botStatus.online = false;
    prisonBuilt = false;
    cleanup();
    scheduleReconnect();
  });

  // === Sự kiện: Mất kết nối ===
  bot.on('end', (reason) => {
    console.log(`[BOT] 🔌 Mất kết nối: ${reason || 'unknown'}`);
    botStatus.online = false;
    prisonBuilt = false;
    cleanup();
    scheduleReconnect();
  });
}

function cleanup() {
  isConnecting = false;
  stopAntiAfk();
  bot = null;
}

// ============================================================
//  SETUP CREATIVE + NHÀ TÙ BEDROCK Ở ĐỘ CAO TỐI ĐA
// ============================================================
function setupCreativePrison() {
  if (!bot || prisonBuilt) return;

  // Bước 1: Chuyển sang Creative mode
  console.log('[SETUP] 🎮 Chuyển sang Creative mode...');
  bot.chat('/gamemode creative');

  // Bước 2: Teleport lên cao
  setTimeout(() => {
    if (!bot) return;
    const pos = bot.entity.position;
    const cx = Math.floor(pos.x);
    const cz = Math.floor(pos.z);
    prisonCenter = { x: cx, y: PRISON.centerY, z: cz };

    console.log(`[SETUP] 🚀 Teleport lên (${cx}, ${PRISON.centerY}, ${cz})...`);
    bot.chat(`/tp ${CONFIG.username} ${cx} ${PRISON.centerY} ${cz}`);

    // Bước 3: Xây nhà tù bedrock
    setTimeout(() => {
      buildBedrockPrison(cx, PRISON.centerY, cz);
    }, 2000);
  }, 2000);
}

function buildBedrockPrison(cx, cy, cz) {
  if (!bot) return;

  const half = Math.floor(PRISON.innerSize / 2); // = 2
  const height = PRISON.innerSize;                // = 5

  // Toạ độ nhà tù bên ngoài (tường bedrock)
  const x1 = cx - half - 1;
  const y1 = cy - 1;
  const z1 = cz - half - 1;
  const x2 = cx + half + 1;
  const y2 = cy + height;
  const z2 = cz + half + 1;

  console.log(`[SETUP] 🧱 Xây nhà tù bedrock từ (${x1},${y1},${z1}) đến (${x2},${y2},${z2})...`);
  console.log(`[SETUP] 📏 Kích thước bên trong: ${PRISON.innerSize}x${height}x${PRISON.innerSize}`);

  // Fill toàn bộ khối bedrock (Java syntax)
  bot.chat(`/fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} minecraft:bedrock`);

  // Đào rỗng bên trong
  setTimeout(() => {
    if (!bot) return;
    const ix1 = cx - half;
    const iy1 = cy;
    const iz1 = cz - half;
    const ix2 = cx + half;
    const iy2 = cy + height - 1;
    const iz2 = cz + half;

    console.log(`[SETUP] 💨 Đào rỗng bên trong (${ix1},${iy1},${iz1}) đến (${ix2},${iy2},${iz2})...`);
    bot.chat(`/fill ${ix1} ${iy1} ${iz1} ${ix2} ${iy2} ${iz2} minecraft:air`);

    // TP bot vào giữa nhà tù
    setTimeout(() => {
      if (!bot) return;
      console.log('[SETUP] 📍 Teleport bot vào giữa nhà tù...');
      bot.chat(`/tp ${CONFIG.username} ${cx} ${cy} ${cz}`);

      prisonBuilt = true;
      botStatus.position = `(${cx}, ${cy}, ${cz})`;

      console.log('[SETUP] ✅ Nhà tù bedrock hoàn thành! Bot đã được giấu ở trên cao.');
      console.log(`[SETUP] 📍 Vị trí: (${cx}, ${cy}, ${cz}) - Độ cao gần tối đa`);

      // Bắt đầu anti-AFK
      startAntiAfk();
    }, 1500);
  }, 1500);
}

// ============================================================
//  CHỐNG AFK – hành vi giống người thật (Aternos kick sau 10 phút)
// ============================================================
let tick = 0;
let chatTick = 0;

function startAntiAfk() {
  stopAntiAfk();
  console.log('[AFK] 🏃 Bắt đầu anti-AFK nâng cao (giống người thật)...');

  antiAfkTimer = setInterval(() => {
    if (!bot || !bot.entity) return;
    tick++;
    chatTick++;

    try {
      // Chọn ngẫu nhiên 2-3 hành động mỗi lần
      const actions = shuffleArray([
        doJump,
        doWalk,
        doSwingArm,
        doSneak,
        doLookAround,
        doSprint,
      ]);

      // Thực hiện 2-3 hành động ngẫu nhiên
      const numActions = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < numActions && i < actions.length; i++) {
        setTimeout(() => {
          if (bot) actions[i]();
        }, i * (1000 + Math.random() * 1500)); // Delay ngẫu nhiên giữa các hành động
      }

      // Gửi chat message mỗi 5 phút (tránh bị coi là idle)
      if (chatTick >= 37) { // ~5 phút (37 * 8s = 296s)
        chatTick = 0;
        const msgs = ['.', '..', '...', 'hmm', 'ok', ':)', 'afk'];
        bot.chat(msgs[Math.floor(Math.random() * msgs.length)]);
        console.log('[AFK] 💬 Gửi chat message chống idle');
      }

      // Log heartbeat
      if (tick % 12 === 0 && bot.entity) {
        const pos = bot.entity.position;
        botStatus.position = `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`;
        console.log(`[AFK] 💓 Heartbeat #${tick} - vị trí ${botStatus.position} [trong nhà tù bedrock]`);
      }
    } catch (e) {
      console.log('[AFK] Lỗi anti-afk:', e.message);
    }
  }, CONFIG.antiAfkInterval + Math.floor(Math.random() * 2000)); // Thêm jitter ngẫu nhiên
}

// === CÁC HÀNH ĐỘNG CHỐNG AFK ===

function doJump() {
  if (!bot) return;
  bot.setControlState('jump', true);
  setTimeout(() => {
    if (bot) bot.setControlState('jump', false);
  }, 300 + Math.random() * 400);
}

function doWalk() {
  if (!bot) return;
  const directions = ['forward', 'back', 'left', 'right'];
  const dir = directions[Math.floor(Math.random() * directions.length)];
  bot.setControlState(dir, true);
  setTimeout(() => {
    if (bot) bot.setControlState(dir, false);
  }, 500 + Math.random() * 1000);
}

function doSwingArm() {
  if (!bot) return;
  // Swing arm là tín hiệu anti-AFK hiệu quả nhất
  bot.swingArm('right');
  setTimeout(() => {
    if (bot) bot.swingArm('left');
  }, 200 + Math.random() * 300);
}

function doSneak() {
  if (!bot) return;
  bot.setControlState('sneak', true);
  setTimeout(() => {
    if (bot) bot.setControlState('sneak', false);
  }, 800 + Math.random() * 1200);
}

function doLookAround() {
  if (!bot) return;
  const yaw = (Math.random() * 2 * Math.PI) - Math.PI;
  const pitch = (Math.random() - 0.5) * Math.PI * 0.6;
  bot.look(yaw, pitch, false);
  // Nhìn lại hướng khác sau 1 giây
  setTimeout(() => {
    if (bot) {
      const yaw2 = (Math.random() * 2 * Math.PI) - Math.PI;
      const pitch2 = (Math.random() - 0.5) * Math.PI * 0.3;
      bot.look(yaw2, pitch2, false);
    }
  }, 800 + Math.random() * 700);
}

function doSprint() {
  if (!bot) return;
  bot.setControlState('sprint', true);
  bot.setControlState('forward', true);
  setTimeout(() => {
    if (bot) {
      bot.setControlState('sprint', false);
      bot.setControlState('forward', false);
    }
  }, 400 + Math.random() * 600);
}

// === HELPER ===
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;

  const delaySec = CONFIG.reconnectDelay / 1000;
  console.log(`[BOT] 🔄 Sẽ kết nối lại sau ${delaySec} giây...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
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
console.log('  Edition: Java');
console.log('  Mode:   Creative + Bedrock Prison');
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

// Bắt lỗi không xử lý
process.on('uncaughtException', (err) => {
  console.log(`[BOT] ❌ Uncaught Exception: ${err.message}`);
  botStatus.lastError = err.message;
});

process.on('unhandledRejection', (err) => {
  console.log(`[BOT] ❌ Unhandled Rejection: ${err}`);
});
