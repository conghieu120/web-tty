# Web Terminal (HTTP Only) - Technical Specification

## Overview

Personal single-user web terminal over HTTP (no WebSocket, no SSH).

Intended use: one person, one private Linux server, one active session at a time.

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
- Exactly one auth session and one terminal at a time
- No reconnect: if stream drops, reload the page and start over
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
| `POST` | `/api/login` | no | Authenticate, set cookie |
| `POST` | `/api/logout` | yes | Clear cookie, destroy terminal |
| `POST` | `/api/terminal/open` | yes | Create PTY + bash |
| `GET`  | `/api/terminal/stream` | yes | SSE output stream |
| `POST` | `/api/terminal/input` | yes | Forward keystrokes to PTY |
| `POST` | `/api/terminal/resize` | yes | Update PTY size |
| `POST` | `/api/terminal/close` | yes | Kill shell, close PTY |

Auth binding: HttpOnly cookie only. No session id in URL/query/body for stream/input/resize/close.

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
- `409` terminal already open / no terminal to operate on (as appropriate)
- `413` body too large
- `500` internal error

Login always returns the same error body on failure: `{ "error": "invalid credentials" }` with `401`, after the fixed delay.

---

# Communication Model

Two independent HTTP connections.

## 1. Output Channel

```
GET /api/terminal/stream
```

Long-lived SSE connection. Stays open until:

- browser closes / page unload
- logout
- idle timeout
- terminal close
- process/PTY exit

Server reads PTY output continuously and flushes immediately.

No polling. No automatic reconnect.

If the stream is lost, the client must reload and run login → open → stream again.

## 2. Input Channel

```
POST /api/terminal/input
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
```

At process start, server derives an Argon2id hash from `AUTH_PASSWORD` and keeps it in memory. The plaintext password is not kept after startup if practical; verification uses Argon2id against the in-memory hash.

Optional alternative (also acceptable): store a precomputed Argon2id encoded hash in `AUTH_PASSWORD_HASH` instead of plaintext `AUTH_PASSWORD`.

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

1. Always wait exactly 3 seconds before responding
2. Verify with Argon2id
3. On success: create auth session in memory, set cookie
4. On failure: identical `{ "error": "invalid credentials" }`

If already logged in, login may replace the existing auth session and destroy any open terminal (single session rule).

### Cookie

Name: `web_tty_session`

Flags:

- `HttpOnly`
- `SameSite=Strict`
- `Path=/`
- `Secure` — set when env `COOKIE_SECURE=true` (recommended behind nginx HTTPS). Default `false` for plain local HTTP.

Cookie value: opaque random session token (not JWT required). Server maps token → auth session in memory.

### Logout

```
POST /api/logout
```

Server:

1. If a terminal is open: kill shell, close PTY, delete terminal session
2. Delete auth session from memory
3. Clear cookie (`Max-Age=0`)

Response: `200` `{ "ok": true }`

---

# Terminal Lifecycle

Exactly one terminal may exist at a time for the single auth session.

## Open

```
POST /api/terminal/open
```

Server:

- If a terminal already exists → `409` (or destroy the old one and create new; prefer `409` so UI is explicit)
- Create PTY
- Launch `/bin/bash` (login shell optional; default non-login interactive is fine)
- Store terminal session in memory, bound to the auth cookie session

Response:

```json
{
  "ok": true
}
```

No client-visible terminal uuid needed — binding is the cookie.

## Stream

```
GET /api/terminal/stream
```

Requires auth cookie. Requires an open terminal; otherwise `409`.

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
POST /api/terminal/input
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
POST /api/terminal/resize
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
POST /api/terminal/close
```

Server:

- terminate shell
- close PTY
- remove terminal session
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
Login screen
    ↓
POST /api/login
    ↓
POST /api/terminal/open
    ↓
GET /api/terminal/stream (EventSource or fetch stream)
    ↓
Attach xterm.js
```

If stream errors/closes unexpectedly: show a simple “disconnected — reload” state. No auto-reconnect.

## Output Handling

```
SSE event:output → base64 decode → terminal.write(bytes)
```

No ANSI parsing on client beyond what xterm.js does.

## Input Handling

```typescript
terminal.onData((data) => {
  fetch('/api/terminal/input', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
})
```

Do not interpret keys. Forward `onData` payload as-is.

## Resize Handling

FitAddon on window resize / container resize → `POST /api/terminal/resize`.

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
- PTY
- Cmd
- CreatedAt
- LastActive
```

Single slot each. Protected by `sync.Mutex` / `sync.RWMutex`.

`UserID` is unnecessary (single operator).

Update `LastActive` on input, resize, and successful stream reads/writes as practical.

---

# Session Cleanup

Idle timeout: **30 minutes** without activity →

- kill shell
- close PTY
- delete terminal session
- delete auth session
- cookie becomes invalid

No separate “maximum session lifetime” beyond idle timeout (personal use).

On stream disconnect alone: keep terminal alive until idle timeout or explicit close/logout, so a brief network blip does not instantly kill the shell — but the UI does not reconnect; user must reload and will hit `409` if terminal still open, or open a new one after close. 

**Simpler personal rule (chosen):** when the SSE stream ends for any reason, server closes the terminal session. User reloads and opens fresh. Idle timeout still applies as a safety net if stream is open but unused.

---

# Security

Required for this personal deployment:

- Cookie: HttpOnly + SameSite=Strict
- Cookie Secure when `COOKIE_SECURE=true` (behind nginx HTTPS)
- Argon2id password verification
- Constant 3-second login delay
- One auth session, one terminal
- Idle timeout 30 minutes
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
User opens website
    ↓
POST /api/login
    ↓
POST /api/terminal/open
    ↓
GET /api/terminal/stream  (SSE, keep alive)
    ↓
xterm.js attached
    ↓
User types
    ↓
terminal.onData()
    ↓
POST /api/terminal/input
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
POST /api/logout → kill terminal (if any) → clear cookie → show login
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
