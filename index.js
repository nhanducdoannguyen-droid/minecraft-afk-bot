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
    prisonBuilt = false;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Lỗi ===
  client.on('error', (err) => {
    console.log(`[BOT] ❌ Lỗi: ${err.message}`);
    botStatus.lastError = err.message;
    botStatus.online = false;
    isConnecting = false;
    prisonBuilt = false;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Đóng kết nối ===
  client.on('close', () => {
    console.log(`[BOT] 🔌 Mất kết nối`);
    botStatus.online = false;
    isConnecting = false;
    prisonBuilt = false;
    stopAntiAfk();
    scheduleReconnect();
  });

  // === Sự kiện: Spawn – Chuyển Creative, TP lên cao, xây nhà tù bedrock ===
  client.on('spawn', () => {
    console.log('[BOT] ✅ Đã spawn vào thế giới!');
    setupCreativePrison();
  });
}

// ============================================================
//  SETUP CREATIVE + NHÀ TÙ BEDROCK Ở ĐỘ CAO TỐI ĐA
// ============================================================
const PRISON = {
  // Toạ độ trung tâm nhà tù (Y = 310 để có đủ chỗ xây lên trên)
  centerY: 310,
  // Kích thước bên trong: 5x5x5 (đủ rộng để bot di chuyển + nhảy)
  innerSize: 5,
};

let prisonBuilt = false;
let prisonCenter = { x: 0, y: PRISON.centerY, z: 0 };

function sendCommand(cmd) {
  if (!client) return;
  client.queue('command_request', {
    command: cmd,
    origin: {
      type: 'player',
      uuid: '',
      request_id: '',
    },
    internal: false,
    version: 52,
  });
}

function setupCreativePrison() {
  if (!client || prisonBuilt) return;

  console.log('[SETUP] 🎮 Chuyển sang Creative mode...');
  sendCommand('/gamemode creative');

  // Đợi 2 giây rồi teleport lên cao
  setTimeout(() => {
    // Lấy toạ độ X, Z hiện tại của bot, giữ nguyên, chỉ đổi Y
    const cx = Math.floor(posX);
    const cz = Math.floor(posZ);
    prisonCenter = { x: cx, y: PRISON.centerY, z: cz };

    console.log(`[SETUP] 🚀 Teleport lên (${cx}, ${PRISON.centerY}, ${cz})...`);
    sendCommand(`/tp @s ${cx} ${PRISON.centerY} ${cz}`);

    // Đợi 2 giây rồi xây nhà tù bedrock
    setTimeout(() => {
      buildBedrockPrison(cx, PRISON.centerY, cz);
    }, 2000);
  }, 2000);
}

function buildBedrockPrison(cx, cy, cz) {
  if (!client) return;

  const half = Math.floor(PRISON.innerSize / 2); // = 2
  const height = PRISON.innerSize;                // = 5

  // Toạ độ góc nhà tù (bao gồm tường bedrock bên ngoài)
  const x1 = cx - half - 1;
  const y1 = cy - 1;          // Sàn dưới chân
  const z1 = cz - half - 1;
  const x2 = cx + half + 1;
  const y2 = cy + height;     // Trần
  const z2 = cz + half + 1;

  console.log(`[SETUP] 🧱 Xây nhà tù bedrock từ (${x1},${y1},${z1}) đến (${x2},${y2},${z2})...`);
  console.log(`[SETUP] 📏 Kích thước bên trong: ${PRISON.innerSize}x${height}x${PRISON.innerSize}`);

  // Bước 1: Fill toàn bộ khối bằng bedrock (tạo khối đặc)
  sendCommand(`/fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} bedrock`);

  // Bước 2: Đợi 1 giây rồi đào rỗng bên trong bằng air
  setTimeout(() => {
    const ix1 = cx - half;
    const iy1 = cy;              // Sàn bên trong = ngang chân bot
    const iz1 = cz - half;
    const ix2 = cx + half;
    const iy2 = cy + height - 1; // Trần bên trong
    const iz2 = cz + half;

    console.log(`[SETUP] 💨 Đào rỗng bên trong (${ix1},${iy1},${iz1}) đến (${ix2},${iy2},${iz2})...`);
    sendCommand(`/fill ${ix1} ${iy1} ${iz1} ${ix2} ${iy2} ${iz2} air`);

    // Bước 3: Teleport bot vào giữa nhà tù
    setTimeout(() => {
      console.log('[SETUP] 📍 Teleport bot vào giữa nhà tù...');
      sendCommand(`/tp @s ${cx} ${cy} ${cz}`);

      prisonBuilt = true;
      posX = cx;
      posY = cy;
      posZ = cz;

      console.log('[SETUP] ✅ Nhà tù bedrock hoàn thành! Bot đã được giấu ở trên cao.');
      console.log(`[SETUP] 📍 Vị trí: (${cx}, ${cy}, ${cz}) - Độ cao gần tối đa`);

      // Bắt đầu anti-AFK
      startAntiAfk();
    }, 1500);
  }, 1500);
}

// ============================================================
//  CHỐNG AFK – di chuyển + nhảy trong nhà tù mỗi 15 giây
// ============================================================
let posX = 0, posY = 64, posZ = 0;
let tick = 0;

function startAntiAfk() {
  stopAntiAfk();
  console.log('[AFK] 🏃 Bắt đầu anti-AFK (nhảy + di chuyển trong nhà tù)...');

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

  const half = Math.floor(PRISON.innerSize / 2); // Giới hạn di chuyển trong nhà tù

  antiAfkTimer = setInterval(() => {
    if (!client) return;
    tick++;

    try {
      // Di chuyển ngẫu nhiên TRONG PHẠM VI nhà tù
      const yaw = Math.random() * 360;
      const pitch = (Math.random() - 0.5) * 60;

      // Tính vị trí ngẫu nhiên trong nhà tù (giới hạn ±half block từ tâm)
      const targetX = prisonCenter.x + (Math.random() - 0.5) * (half * 2 - 1);
      const targetZ = prisonCenter.z + (Math.random() - 0.5) * (half * 2 - 1);

      // Gửi packet di chuyển
      client.queue('move_player', {
        runtime_id: 1n,
        position: {
          x: targetX,
          y: posY,
          z: targetZ,
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

      // NHẢY MỖI LẦN để chống AFK tối đa
      client.queue('player_action', {
        runtime_id: 1n,
        action: 'jump',
        position: { x: Math.floor(posX), y: Math.floor(posY), z: Math.floor(posZ) },
        result_position: { x: 0, y: 0, z: 0 },
        face: 0,
      });

      // Xoay đầu liên tục (thêm 1 lớp chống AFK)
      client.queue('move_player', {
        runtime_id: 1n,
        position: {
          x: targetX,
          y: posY + 0.1, // Nhẹ lên sau nhảy
          z: targetZ,
        },
        rotation: {
          x: -pitch,
          y: (yaw + 180) % 360,
          z: (yaw + 180) % 360,
        },
        mode: 1,
        on_ground: false,
        riding_eid: 0n,
        tick: BigInt(tick + 1),
      });

      if (tick % 10 === 0) {
        console.log(`[AFK] 💓 Heartbeat #${tick} - vị trí (${posX.toFixed(1)}, ${posY.toFixed(1)}, ${posZ.toFixed(1)}) [trong nhà tù bedrock]`);
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
