# 🤖 Minecraft AFK Bot – Treo Server Aternos 24/7

Bot tự động kết nối và treo server Minecraft trên Aternos, deploy lên **Render** để chạy 24/7.

## Tính năng

- ✅ Tự động kết nối server Aternos
- ✅ Chống AFK (nhảy, xoay, đi ngẫu nhiên)
- ✅ Tự động reconnect khi mất kết nối hoặc bị kick
- ✅ Web health-check endpoint cho Render
- ✅ Hiển thị trạng thái bot qua API

## Cấu hình

Các biến môi trường (environment variables):

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `MC_HOST` | `nhancu1234.aternos.me` | IP server |
| `MC_PORT` | `44076` | Port server |
| `MC_USERNAME` | `BotTreoServer` | Tên bot |
| `MC_VERSION` | Auto-detect | Phiên bản MC |
| `PORT` | `3000` | Port web server |

## Deploy lên Render

### Bước 1: Push code lên GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Bước 2: Tạo Web Service trên Render

1. Vào [render.com](https://render.com) → **New** → **Web Service**
2. Kết nối repo GitHub vừa tạo
3. Cấu hình:
   - **Name**: `minecraft-afk-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (hoặc Starter nếu muốn ổn định)
4. Thêm **Environment Variables** nếu muốn thay đổi cấu hình mặc định
5. Click **Deploy**

### Bước 3: Giữ bot chạy 24/7 (Free Plan)

Render Free Plan sẽ tự tắt service sau 15 phút không có request. Để giữ bot luôn chạy:

- Dùng [UptimeRobot](https://uptimerobot.com) (miễn phí) ping endpoint `/health` mỗi 5 phút
- Hoặc dùng [cron-job.org](https://cron-job.org) ping URL của Render mỗi 5 phút

## Chạy local (test)

```bash
npm install
npm start
```

## Lưu ý quan trọng

⚠️ **Server Aternos phải đang ONLINE** thì bot mới kết nối được. Aternos không cho phép bot khởi động server, bạn cần bật server thủ công trước.

⚠️ **Aternos có thể tắt server** nếu không có ai chơi thực sự trong thời gian dài (phát hiện bot). Bot này giúp giữ server online lâu hơn nhưng không đảm bảo 100%.
