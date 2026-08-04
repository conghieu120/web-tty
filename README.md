# web-tty

Personal HTTP-only web terminal (React + Go PTY). Spec: `contract.md`.

## Client (Windows / PowerShell)

```powershell
cd d:\pet-proj\web-tty\client
npm install
npm run dev
```

Mở http://localhost:5173 (hoặc 5174 nếu 5173 bận).

Browser gọi API thẳng tới `http://localhost:8080` (xem `VITE_API_BASE` trong `client/.env` nếu cần đổi).

## Server (WSL Debian — bắt buộc, cần Linux PTY + Go)

Trong terminal WSL:

```bash
cd /mnt/d/pet-proj/web-tty/server

# lần đầu
cp .env.example .env
# sửa AUTH_PASSWORD và SESSION_SECRET trong .env

go mod tidy
go run .
```

Sau khi sửa code server, **restart** `go run .`.

Server lắng nghe `:8080`.

### .env

```env
AUTH_PASSWORD=your-secret
SESSION_SECRET=long-random-string
COOKIE_SECURE=false
LISTEN_ADDR=:8080
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174
```

Khi chạy sau nginx HTTPS, đặt `COOKIE_SECURE=true` và cập nhật `CORS_ORIGINS`.

## Luồng dùng

1. Chạy server trong WSL
2. Chạy client `npm run dev`
3. Đăng nhập bằng `AUTH_PASSWORD` (chờ ~3 giây)
4. Dùng terminal; mất kết nối thì reload trang
