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
COOKIE_MAX_AGE=604800
IDLE_TIMEOUT=30m
LOGIN_DELAY=3s
MAX_TERMINALS=5
LISTEN_ADDR=:8080
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174
```

- `COOKIE_MAX_AGE` — giây; `0` = session cookie (mất khi đóng browser). Mặc định 7 ngày.
- `IDLE_TIMEOUT` — hết hạn auth/terminal khi không hoạt động (Go duration, vd. `30m`).
- `LOGIN_DELAY` — delay cố định khi login (vd. `3s`).
- `MAX_TERMINALS` — số PTY đồng thời tối đa (mỗi tab một terminal).

Cookie session luôn `Secure` + `SameSite=None` (phù hợp HTTPS edge / Cloudflare Tunnel). Cập nhật `CORS_ORIGINS` theo origin UI.

## Luồng dùng

1. Chạy server trong WSL
2. Chạy client `npm run dev`
3. Đăng nhập bằng `AUTH_PASSWORD` (chờ theo `LOGIN_DELAY`)
4. Mở thêm tab → terminal mới, không cần login lại
5. Mất kết nối thì reload trang (tab đó mở PTY mới)
