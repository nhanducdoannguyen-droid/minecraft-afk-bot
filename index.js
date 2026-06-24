const bedrock = require('bedrock-protocol');
const express = require('express');

// ============================================================
//  CẤU HÌNH BOT – thay đổi tại đây nếu cần
// ============================================================
const CONFIG = {
  host: process.env.MC_HOST || 'nhancu1234.aternos.me',
  port: parseInt(process.env.MC_PORT, 10) || 44076,
  username: process.env.MC_USERNAME || 'BotTreoServer',
  offline: true,                                  // Aternos dùng offline mode
  reconnectDelay: 30_000,                         // 30 giây giữa mỗi lần reconnect
  antiAfkInterval: 15_000,                        // 15 giây chống AFK
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
let client = null;
let antiAfkTimer = null;
let isConnecting = false;

function createBot() {
  if (isConnecting) return;
  isConnecting = true;

  console.log(`[BOT] Đang kết nối đến ${CONFIG.host}:${CONFIG.port} (Bedrock Edition)...`);

  try {
    client = bedrock.createClient({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      offline: CONFIG.offline,
      skipPing: true,
    });
  } catch (err) {
    console.log(`[BOT] ❌ Lỗi tạo client: ${err.message}`);
    isConnecting = false;
    botStatus.lastError = err.message;
    scheduleReconnect();
    return;
  }

  // === Sự kiện: Kết nối thành công (nhận gói start_game) ===
  client.on('start_game', (packet) => {
    console.log(`[BOT] ✅ Đã vào server thành công!`);
    console.log(`[BOT] 🌍 World: ${packet.world_name || 'unknown'}`);
    console.log(`[BOT] 🎮 GameMode: ${packet.player_gamemode}`);
    botStatus.online = true;
    botStatus.lastLogin = new Date().toISOString();
    isConnecting = false;
    startAntiAfk();
  });

  // === Sự kiện: Nhận tin nhắn chat ===
  client.on('text', (packet) => {
    if (packet.source_name === CONFIG.username) return;
    console.log(`[CHAT] <${packet.source_name || 'Server'}> ${packet.message}`);
  });

  // === Sự kiện: Bị kick ===
  client.on('disconnect', (packet) => {
    const reason = packet.message || packet.disconnect_reason || 'Unknown';
    console.log(`[BOT] ⚠️  Bị kick: ${reason}`);
    botStatus.online = false;
    botStatus.lastError = `Kicked: ${reason}`;
    isConnecting = false;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Lỗi ===
  client.on('error', (err) => {
    console.log(`[BOT] ❌ Lỗi: ${err.message}`);
    botStatus.lastError = err.message;
    botStatus.online = false;
    isConnecting = false;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Đóng kết nối ===
  client.on('close', () => {
    console.log(`[BOT] 🔌 Mất kết nối`);
    botStatus.online = false;
    isConnecting = false;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Spawn ===
  client.on('spawn', () => {
    console.log('[BOT] ✅ Đã spawn vào thế giới!');
  });
}

// ============================================================
//  CHỐNG AFK – gửi packet di chuyển mỗi 15 giây
// ============================================================
let posX = 0, posY = 64, posZ = 0;
let tick = 0;

function startAntiAfk() {
  stopAntiAfk();
  console.log('[AFK] Bắt đầu anti-AFK...');

  // Lắng nghe vị trí ban đầu
  if (client) {
    client.on('move_player', (packet) => {
      if (packet.runtime_id) {
        posX = packet.position?.x || posX;
        posY = packet.position?.y || posY;
        posZ = packet.position?.z || posZ;
      }
    });
  }

  antiAfkTimer = setInterval(() => {
    if (!client) return;
    tick++;

    try {
      // Gửi packet di chuyển (xoay đầu ngẫu nhiên)
      const yaw = Math.random() * 360;
      const pitch = (Math.random() - 0.5) * 60;

      // Di chuyển nhẹ ngẫu nhiên
      const dx = (Math.random() - 0.5) * 0.5;
      const dz = (Math.random() - 0.5) * 0.5;

      client.queue('move_player', {
        runtime_id: 1n,
        position: {
          x: posX + dx,
          y: posY,
          z: posZ + dz,
        },
        rotation: {
          x: pitch,
          y: yaw,
          z: yaw,
        },
        mode: 1,
        on_ground: true,
        riding_eid: 0n,
        tick: BigInt(tick),
      });

      // Nhảy mỗi 3 lần
      if (tick % 3 === 0) {
        client.queue('player_action', {
          runtime_id: 1n,
          action: 'jump',
          position: { x: Math.floor(posX), y: Math.floor(posY), z: Math.floor(posZ) },
          result_position: { x: 0, y: 0, z: 0 },
          face: 0,
        });
      }

      if (tick % 10 === 0) {
        console.log(`[AFK] Heartbeat #${tick} - vị trí (${posX.toFixed(1)}, ${posY.toFixed(1)}, ${posZ.toFixed(1)})`);
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
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return; // Đã có timer rồi

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
console.log('  Edition: Bedrock');
console.log('=========================================');

createBot();

// Xử lý tắt an toàn
process.on('SIGINT', () => {
  console.log('\n[BOT] Đang tắt bot...');
  stopAntiAfk();
  if (client) client.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[BOT] Nhận SIGTERM, đang tắt...');
  stopAntiAfk();
  if (client) client.close();
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
