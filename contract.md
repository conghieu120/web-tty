# Web Terminal (HTTP Only) - Technical Specification

## Overview

Personal single-user web terminal over HTTP (no WebSocket, no SSH).

Intended use: one person, one private Linux server, multiple browser tabs each with their own terminal.

Project structure:

```
root/
│
├── client/
│   ├── React + Vite
│   ├── Tailwind CSS
│   └── xterm.js
│
└── server/
    ├── Go
    └── Linux PTY
```

TLS terminates at nginx. The Go server listens on plain HTTP behind nginx.

---

# Goals

The terminal should feel as close as possible to a real SSH terminal.

Requirements:

- No WebSocket
- No SSH
- No TCP socket except HTTP
- No polling
- One long-lived HTTP stream (SSE)
- HTTP POST for every user input
- Supports ANSI escape sequences
- Supports interactive terminal applications

Examples that must work:

- bash
- sh
- zsh
- vim
- nano
- less
- top
- htop
- journalctl -f
- tail -f
- docker logs -f

Frontend: React + Vite + Tailwind + xterm.js.

Backend: Go + Linux PTY.

---

# Scope Assumptions

- Single operator (no multi-user, no username)
- Password from `.env`
- One auth session (cookie); multiple concurrent terminals (one per browser tab), capped by `MAX_TERMINALS`
- Cookie persists across tabs/reloads (`COOKIE_MAX_AGE`); client bootstraps via `GET /api/me`
- No reconnect: if stream drops, reload the page and open a new terminal
- CSRF mitigated by `SameSite=Strict` cookie (same-origin usage via nginx)
- No IP rate limiting (personal use)
- Deploy details later; local/dev runs Go on HTTP

---

# High Level Architecture

```
                  Browser

         +-------------------+
         |    xterm.js       |
         +-------------------+
              ▲         │
              │         │ onData()
              │         ▼
         GET /stream   POST /input
              │         │
              ▼         ▼

         +--------------------+
         |     Go Server       |
         +--------------------+
                  │
                  ▼
              Linux PTY
                  │
                  ▼
             /bin/bash
```

---

# API Surface

All endpoints under `/api`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET`  | `/api/me` | yes | Check if auth cookie is still valid |
| `POST` | `/api/login` | no | Authenticate, set cookie |
| `POST` | `/api/logout` | yes | Clear cookie, destroy all terminals |
| `POST` | `/api/terminal/open` | yes | Create PTY + bash; returns terminal `id` |
| `GET`  | `/api/terminal/{id}/stream` | yes | SSE output stream for that terminal |
| `POST` | `/api/terminal/{id}/input` | yes | Forward keystrokes to that PTY |
| `POST` | `/api/terminal/{id}/resize` | yes | Update that PTY size |
| `POST` | `/api/terminal/{id}/close` | yes | Kill shell, close that PTY |

Auth binding: HttpOnly cookie. Terminal routing uses `{id}` in the path (needed for multi-tab + EventSource). Cookie still required for every call.

Error responses (JSON):

```json
{
  "error": "message"
}
```

Suggested status codes:

- `200` success
- `400` bad request / invalid body
- `401` not authenticated
- `409` too many terminals / no terminal / stream already active (as appropriate)
- `413` body too large
- `500` internal error

Login always returns the same error body on failure: `{ "error": "invalid credentials" }` with `401`, after the fixed delay.

---

# Communication Model

Two independent HTTP connections.

## 1. Output Channel

```
GET /api/terminal/{id}/stream
```

Long-lived SSE connection. Stays open until:

- browser closes / page unload
- logout
- idle timeout
- terminal close
- process/PTY exit

Server reads PTY output continuously and flushes immediately.

No polling. No automatic reconnect.

If the stream is lost, the client must reload; auth cookie is reused (`/api/me`), then open → stream for a new terminal id.

## 2. Input Channel

```
POST /api/terminal/{id}/input
```

Body:

```json
{
  "data": "..."
}
```

`data` is a JSON string of raw terminal bytes (UTF-16 code units as JS string / Go string decoded from JSON).

Examples:

- `"a"`
- `"\u0003"` (Ctrl+C)
- `"\u001b[A"` (Arrow Up)
- `"ls\r"`

Server does not parse keyboard input. It only:

```
PTY.Write(decodedBytes)
```

---

# Auth Model

Single password, no username.

### Environment

```env
AUTH_PASSWORD=your-secret-password
SESSION_SECRET=random-long-string
COOKIE_MAX_AGE=604800
IDLE_TIMEOUT=30m
LOGIN_DELAY=3s
MAX_TERMINALS=5
```

| Variable | Meaning | Default |
|----------|---------|---------|
| `COOKIE_MAX_AGE` | Cookie lifetime in seconds; `0` = browser session cookie | `604800` (7d) |
| `IDLE_TIMEOUT` | Auth/terminal idle expiry (Go duration) | `30m` |
| `LOGIN_DELAY` | Fixed delay before login response (Go duration) | `3s` |
| `MAX_TERMINALS` | Max concurrent PTY sessions | `5` |

At process start, server verifies `AUTH_PASSWORD` with constant-time compare (in-memory).

### Session check

```
GET /api/me
```

Requires valid auth cookie. Response: `200` `{ "ok": true }` or `401`.

Client calls this on boot; if ok, skip login and open a terminal.

### Login

```
POST /api/login
```

```json
{
  "password": "..."
}
```

Server:

1. Always wait `LOGIN_DELAY` before responding
2. Verify password
3. On success: destroy any existing terminals, create auth session in memory, set cookie
4. On failure: identical `{ "error": "invalid credentials" }`

### Cookie

Name: `web_tty_session`

Flags:

- `HttpOnly`
- `SameSite=None` (cross-origin UI + credentials; requires `Secure`)
- `Path=/`
- `Secure` — always on (HTTPS edge / Cloudflare Tunnel)
- `Max-Age` — from `COOKIE_MAX_AGE`

Cookie value: opaque random session token (not JWT required). Server maps token → auth session in memory.

### Logout

```
POST /api/logout
```

Server:

1. Kill all open terminals
2. Delete auth session from memory
3. Clear cookie

Response: `200` `{ "ok": true }`

---

# Terminal Lifecycle

One auth cookie may own multiple concurrent terminals (up to `MAX_TERMINALS`). Each browser tab opens its own terminal.

## Open

```
POST /api/terminal/open
```

Server:

- If `len(terminals) >= MAX_TERMINALS` → `409` `"too many terminals"`
- Create PTY
- Launch `/bin/bash`
- Store terminal session in memory, keyed by monotonic `id`

Response:

```json
{
  "ok": true,
  "id": 1
}
```

Client uses `id` for stream/input/resize/close.

## Stream

```
GET /api/terminal/{id}/stream
```

Requires auth cookie. Requires that terminal id; otherwise `409`. At most one stream per terminal id (`409` if already streaming).

When the stream ends (client disconnect, PTY exit, etc.), the server destroys that terminal.

Response headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### SSE binary encoding (decision)

PTY output is raw bytes and may contain `\n`, `\r`, `:` and non-UTF8 sequences. Raw SSE `data:` lines are unsafe.

**Use base64 in SSE `data` fields:**

```
event: output
data: <base64 of raw PTY bytes>

```

Client:

```typescript
const bytes = Uint8Array.from(atob(event.data), c => c.charCodeAt(0))
terminal.write(bytes)
```

Optional keepalive (recommended):

```
event: ping
data: {}

```

every ~15s so proxies do not idle-close the stream.

Flush each event immediately. No application-level buffering beyond one read chunk.

## Input

```
POST /api/terminal/{id}/input
```

```json
{
  "data": "\u001b[A"
}
```

Server: `PTY.Write(...)`. Nothing else.

Max body size: 4 KiB.

## Resize

```
POST /api/terminal/{id}/resize
```

```json
{
  "rows": 40,
  "cols": 120
}
```

Server: `pty.Setsize(...)`.

## Close

```
POST /api/terminal/{id}/close
```

Server:

- terminate shell
- close PTY
- remove that terminal session
- auth cookie remains valid

---

# Frontend

Stack:

- React
- Vite
- Tailwind CSS
- xterm.js + FitAddon

No router. No Redux/MobX. No WebSocket.

Minimal UI:

1. Login screen (password + submit)
2. Full-viewport terminal after login/open/stream succeeds
3. Optional small logout control

## Startup Flow

```
GET /api/me
    ↓
if 401 → Login screen → POST /api/login
if 200 → skip login
    ↓
POST /api/terminal/open  → { id }
    ↓
GET /api/terminal/{id}/stream (EventSource)
    ↓
Attach xterm.js
```

Each new browser tab repeats open → stream (new id). Auth cookie is shared.

If stream errors/closes unexpectedly: show a simple “disconnected — reload” state. No auto-reconnect.

## Output Handling

```
SSE event:output → base64 decode → terminal.write(bytes)
```

No ANSI parsing on client beyond what xterm.js does.

## Input Handling

```typescript
terminal.onData((data) => {
  fetch(`/api/terminal/${id}/input`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
})
```

Do not interpret keys. Forward `onData` payload as-is.

## Resize Handling

FitAddon on window resize / container resize → `POST /api/terminal/{id}/resize`.

---

# Backend

Language: Go.

Prefer stdlib `net/http`.

Allowed packages:

- `github.com/creack/pty`
- Argon2id helper (`golang.org/x/crypto/argon2` or equivalent)

No web framework required.

Serve API from Go. In production/nginx, static client assets may be served by nginx; for local/dev, Go may also serve `client/dist` or Vite proxy to Go.

Shell must not run as root unless explicitly required by the operator.

---

# Session Model

In-memory only. Restarting the Go process invalidates everything.

### Auth session

```
AuthSession
- Token
- CreatedAt
- LastActive
```

### Terminal session

```
TerminalSession
- ID
- PTY
- Cmd
- CreatedAt
- LastActive
- streaming
```

Auth: single in-memory session. Terminals: `map[id]*TerminalSession`, capped by `MAX_TERMINALS`. Protected by `sync.Mutex`.

`UserID` is unnecessary (single operator).

Update `LastActive` on input, resize, and successful stream reads/writes as practical.

---

# Session Cleanup

Idle timeout: **`IDLE_TIMEOUT`** (default 30 minutes) without activity →

- kill idle terminals individually when their `LastActive` expires
- if auth `LastActive` expires: kill all terminals, delete auth session (cookie becomes invalid)

No separate “maximum session lifetime” beyond idle timeout (personal use).

**Chosen rule:** when the SSE stream ends for any reason, server closes that terminal. User reloads (auth cookie reused) and opens a fresh terminal. Idle timeout still applies as a safety net.

---

# Security

Required for this personal deployment:

- Cookie: HttpOnly + Secure + SameSite=None
- Constant-time password verify + `LOGIN_DELAY`
- One auth session; multiple terminals capped by `MAX_TERMINALS`
- Idle timeout via `IDLE_TIMEOUT`
- Request size limit on JSON bodies (4 KiB input; small limits elsewhere)
- Do not expose server without nginx/auth at the edge if reachable from the internet

Explicitly not required:

- HTTPS inside Go
- IP rate limiting
- Extra CSRF tokens (SameSite=Strict + same-origin)
- Origin allowlist (optional; may add later)

---

# Terminal Rendering

Server MUST NOT:

- parse ANSI
- emulate a terminal
- generate HTML
- generate screen diffs

Pipeline:

```
PTY → raw bytes → base64 SSE → browser → decode → xterm.js → render
```

---

# Data Format Summary

### Input (JSON)

```json
{
  "data": "raw terminal string from xterm onData"
}
```

### Output (SSE)

```
event: output
data: BASE64(raw PTY bytes)
```

---

# Things That MUST NOT Be Implemented

- WebSocket
- SSH
- Polling / long polling
- Terminal emulator on server
- ANSI parser on server
- Screen diff rendering
- HTML terminal rendering
- VNC
- Auto-reconnect of the output stream
- Multi-user / username accounts

---

# Complete Flow

```
User opens website / new tab
    ↓
GET /api/me  (reuse cookie if present)
    ↓
[if needed] POST /api/login
    ↓
POST /api/terminal/open  → { id }
    ↓
GET /api/terminal/{id}/stream  (SSE, keep alive)
    ↓
xterm.js attached
    ↓
User types
    ↓
terminal.onData()
    ↓
POST /api/terminal/{id}/input
    ↓
PTY.Write()
    ↓
bash / app handles input
    ↓
PTY stdout
    ↓
SSE event:output (base64)
    ↓
decode → terminal.write()
    ↓
Screen updates
```

Logout:

```
POST /api/logout → kill all terminals → clear cookie → show login
```

---

# Design Principles

The backend is intentionally dumb.

It only:

- authenticates the single operator
- manages one PTY lifecycle
- forwards keyboard bytes into the PTY
- forwards PTY bytes back to the browser (base64 over SSE)

It must not understand terminal semantics.

The frontend only displays output with xterm.js and forwards input/resize.

Linux PTY and programs inside it (bash, vim, nano, htop, …) interpret keys and produce ANSI.
