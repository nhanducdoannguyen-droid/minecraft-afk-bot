const mineflayer = require('mineflayer');
const express = require('express');

// ============================================================
//  CẤU HÌNH
// ============================================================
const CONFIG = {
  host: process.env.MC_HOST || 'nhancu1234.aternos.me',
  port: parseInt(process.env.MC_PORT, 10) || 44076,
  username: process.env.MC_USERNAME || 'BotTreoServer',
  version: process.env.MC_VERSION || '1.21.1', // Thiết lập phiên bản Minecraft cụ thể để tránh ping tự động dò tìm gây ETIMEDOUT
  auth: 'offline',
  reconnectDelay: 30_000,
  antiAfkInterval: 8_000,
};

const PRISON = {
  centerY: 310,
  innerSize: 5,
};

// ============================================================
//  WEB SERVER
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;
let botStatus = { online: false, lastLogin: null, lastError: null, position: null };

app.get('/', (_req, res) => {
  res.json({
    status: botStatus.online ? '🟢 Online' : '🔴 Offline',
    server: `${CONFIG.host}:${CONFIG.port}`,
    username: CONFIG.username,
    edition: 'Java',
    ...botStatus,
    uptime: process.uptime().toFixed(0) + 's',
  });
});
app.get('/health', (_req, res) => res.send('OK'));
app.listen(PORT, () => console.log(`[WEB] Port ${PORT} ready`));

// ============================================================
//  BOT
// ============================================================
let bot = null;
let antiAfkTimer = null;
let reconnectTimer = null;
let isConnecting = false;
let prisonBuilt = false;
let prisonCenter = { x: 0, y: PRISON.centerY, z: 0 };

function destroyBot() {
  stopAntiAfk();
  if (bot) {
    try { bot.removeAllListeners(); } catch (_) {}
    try { bot.end('cleanup'); } catch (_) {}
    bot = null;
  }
}

function createBot() {
  if (isConnecting) return;
  isConnecting = true;
  prisonBuilt = false;

  // Dọn bot cũ
  destroyBot();

  console.log(`[BOT] Đang kết nối đến ${CONFIG.host}:${CONFIG.port} (Java Edition)...`);

  try {
    bot = mineflayer.createBot({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      auth: CONFIG.auth,
      version: CONFIG.version,
      hideErrors: false,
      skipValidation: true,
      checkTimeoutInterval: 60_000,
    });
  } catch (err) {
    console.log(`[BOT] ❌ Lỗi tạo bot: ${err.message}`);
    isConnecting = false;
    botStatus.lastError = err.message;
    scheduleReconnect();
    return;
  }

  // --- Guard chống xử lý disconnect nhiều lần ---
  let disconnected = false;
  function onDisconnect(reason) {
    if (disconnected) return;
    disconnected = true;
    console.log(`[BOT] 🔌 ${reason}`);
    botStatus.online = false;
    botStatus.lastError = reason;
    isConnecting = false;
    prisonBuilt = false;
    destroyBot();
    scheduleReconnect();
  }

  // Login thành công
  bot.on('login', () => {
    console.log('[BOT] ✅ Đã login!');
    botStatus.online = true;
    botStatus.lastLogin = new Date().toISOString();
    isConnecting = false;
  });

  // Spawn vào thế giới
  bot.once('spawn', () => {
    console.log('[BOT] ✅ Đã spawn!');
    if (!bot || !bot.entity) return;
    const p = bot.entity.position;
    console.log(`[BOT] 📍 Vị trí: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
    setTimeout(() => setupCreativePrison(), 3000);
  });

  // Chat
  bot.on('chat', (username, message) => {
    if (username === CONFIG.username) return;
    console.log(`[CHAT] <${username}> ${message}`);
  });

  // Disconnect events
  bot.on('kicked', (reason) => {
    let text = reason;
    try { text = JSON.parse(reason)?.text || reason; } catch (_) {}
    onDisconnect(`Kicked: ${text}`);
  });

  bot.on('error', (err) => {
    console.log(`[BOT] ❌ Lỗi: ${err.message}`);
    onDisconnect(`Error: ${err.message}`);
  });

  bot.on('end', (reason) => {
    onDisconnect(`End: ${reason || 'unknown'}`);
  });
}

// ============================================================
//  CREATIVE + NHÀ TÙ BEDROCK
// ============================================================
function setupCreativePrison() {
  if (!bot || prisonBuilt) return;

  console.log('[SETUP] 🎮 /gamemode creative');
  bot.chat('/gamemode creative');

  setTimeout(() => {
    if (!bot || !bot.entity) return;
    const p = bot.entity.position;
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    prisonCenter = { x: cx, y: PRISON.centerY, z: cz };

    console.log(`[SETUP] 🚀 TP lên Y=${PRISON.centerY}`);
    bot.chat(`/tp ${CONFIG.username} ${cx} ${PRISON.centerY} ${cz}`);

    setTimeout(() => buildPrison(cx, PRISON.centerY, cz), 2000);
  }, 2000);
}

function buildPrison(cx, cy, cz) {
  if (!bot) return;
  const h = Math.floor(PRISON.innerSize / 2);
  const height = PRISON.innerSize;

  // Fill bedrock đặc
  const cmd1 = `/fill ${cx-h-1} ${cy-1} ${cz-h-1} ${cx+h+1} ${cy+height} ${cz+h+1} minecraft:bedrock`;
  console.log(`[SETUP] 🧱 ${cmd1}`);
  bot.chat(cmd1);

  setTimeout(() => {
    if (!bot) return;
    // Đào rỗng bên trong
    const cmd2 = `/fill ${cx-h} ${cy} ${cz-h} ${cx+h} ${cy+height-1} ${cz+h} minecraft:air`;
    console.log(`[SETUP] 💨 ${cmd2}`);
    bot.chat(cmd2);

    setTimeout(() => {
      if (!bot) return;
      bot.chat(`/tp ${CONFIG.username} ${cx} ${cy} ${cz}`);
      prisonBuilt = true;
      botStatus.position = `(${cx}, ${cy}, ${cz})`;
      console.log(`[SETUP] ✅ Nhà tù bedrock hoàn thành tại (${cx}, ${cy}, ${cz})`);
      startAntiAfk();
    }, 1500);
  }, 1500);
}

// ============================================================
//  ANTI-AFK NÂNG CAO – giống người thật
// ============================================================
let tick = 0;
let chatTick = 0;

function startAntiAfk() {
  stopAntiAfk();
  console.log('[AFK] 🏃 Anti-AFK nâng cao đã bật');

  antiAfkTimer = setInterval(() => {
    if (!bot || !bot.entity) return;
    tick++;
    chatTick++;

    try {
      // Chọn 2-3 hành động ngẫu nhiên mỗi lần
      const pool = [doJump, doWalk, doSwingArm, doSneak, doLookAround, doSprint];
      const shuffled = pool.sort(() => Math.random() - 0.5);
      const count = 2 + Math.floor(Math.random() * 2);

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          try { if (bot) shuffled[i](); } catch (_) {}
        }, i * (800 + Math.random() * 1200));
      }

      // Chat mỗi ~5 phút
      if (chatTick >= 37) {
        chatTick = 0;
        const msgs = ['.', '..', 'hmm', 'ok', ':)'];
        try { bot.chat(msgs[Math.floor(Math.random() * msgs.length)]); } catch (_) {}
      }

      // Heartbeat log
      if (tick % 12 === 0 && bot.entity) {
        const p = bot.entity.position;
        botStatus.position = `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
        console.log(`[AFK] 💓 #${tick} - ${botStatus.position}`);
      }
    } catch (e) {
      console.log('[AFK] Lỗi:', e.message);
    }
  }, CONFIG.antiAfkInterval + Math.floor(Math.random() * 2000));
}

function doJump() {
  bot.setControlState('jump', true);
  setTimeout(() => { try { bot.setControlState('jump', false); } catch (_) {} }, 300 + Math.random() * 400);
}

function doWalk() {
  const dirs = ['forward', 'back', 'left', 'right'];
  const d = dirs[Math.floor(Math.random() * dirs.length)];
  bot.setControlState(d, true);
  setTimeout(() => { try { bot.setControlState(d, false); } catch (_) {} }, 500 + Math.random() * 1000);
}

function doSwingArm() {
  bot.swingArm('right');
  setTimeout(() => { try { bot.swingArm('left'); } catch (_) {} }, 200 + Math.random() * 300);
}

function doSneak() {
  bot.setControlState('sneak', true);
  setTimeout(() => { try { bot.setControlState('sneak', false); } catch (_) {} }, 800 + Math.random() * 1200);
}

function doLookAround() {
  const yaw = (Math.random() * 2 * Math.PI) - Math.PI;
  const pitch = (Math.random() - 0.5) * Math.PI * 0.6;
  bot.look(yaw, pitch, false);
}

function doSprint() {
  bot.setControlState('sprint', true);
  bot.setControlState('forward', true);
  setTimeout(() => {
    try {
      bot.setControlState('sprint', false);
      bot.setControlState('forward', false);
    } catch (_) {}
  }, 400 + Math.random() * 600);
}

function stopAntiAfk() {
  if (antiAfkTimer) {
    clearInterval(antiAfkTimer);
    antiAfkTimer = null;
  }
}

// ============================================================
//  RECONNECT
// ============================================================
function scheduleReconnect() {
  if (reconnectTimer) return;
  const sec = CONFIG.reconnectDelay / 1000;
  console.log(`[BOT] 🔄 Reconnect sau ${sec}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, CONFIG.reconnectDelay);
}

// ============================================================
//  KHỞI CHẠY
// ============================================================
console.log('=========================================');
console.log('  🤖 Minecraft AFK Bot – Aternos');
console.log(`  Server:  ${CONFIG.host}:${CONFIG.port}`);
console.log(`  Bot:     ${CONFIG.username}`);
console.log(`  Version: ${CONFIG.version}`);
console.log('  Edition: Java | Mode: Creative Prison');
console.log('=========================================');

createBot();

// Tắt an toàn
process.on('SIGINT', () => {
  console.log('\n[BOT] Tắt bot...');
  stopAntiAfk();
  destroyBot();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[BOT] SIGTERM...');
  stopAntiAfk();
  destroyBot();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.log(`[BOT] ❌ Exception: ${err.message}`);
  botStatus.lastError = err.message;
});

process.on('unhandledRejection', (err) => {
  console.log(`[BOT] ❌ Rejection: ${err}`);
});
