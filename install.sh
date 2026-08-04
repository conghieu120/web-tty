#!/usr/bin/env bash
# Interactive installer for web-tty on Debian/Ubuntu (systemd).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/conghieu120/web-tty/master/install.sh -o install.sh
#   sudo bash install.sh
set -euo pipefail

INSTALL_DIR="/opt/web-tty"
BIN_NAME="web-tty"
SERVICE_NAME="web-tty"
ENV_FILE="${INSTALL_DIR}/.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RELEASE_URL="https://github.com/conghieu120/web-tty/releases/latest/download/web-tty-linux-x64"
CORS_ORIGINS="https://web-tty.vercel.app"

DEFAULT_LISTEN_ADDR=":8080"
DEFAULT_COOKIE_MAX_AGE="604800"
DEFAULT_IDLE_TIMEOUT="30m"
DEFAULT_LOGIN_DELAY="3s"
DEFAULT_MAX_TERMINALS="5"

# ---------- helpers ----------

die() {
  echo "Error: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "thiếu lệnh '$1'"
}

ask() {
  # ask "prompt" "default" -> sets REPLY
  local prompt="$1"
  local default="${2:-}"
  if [[ -n "${default}" ]]; then
    read -r -p "${prompt} [${default}]: " REPLY
    REPLY="${REPLY:-${default}}"
  else
    read -r -p "${prompt}: " REPLY
  fi
}

ask_secret() {
  # ask_secret "prompt" -> sets REPLY (hidden)
  local prompt="$1"
  read -r -s -p "${prompt}: " REPLY
  echo
}

ask_yes_no() {
  # ask_yes_no "prompt" "Y"|"N" -> returns 0 if yes
  local prompt="$1"
  local default="${2:-Y}"
  local hint
  if [[ "${default}" == "Y" || "${default}" == "y" ]]; then
    hint="Y/n"
  else
    hint="y/N"
  fi
  read -r -p "${prompt} [${hint}]: " REPLY
  REPLY="${REPLY:-${default}}"
  case "${REPLY}" in
    Y|y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

gen_secret() {
  # gen_secret [bytes] -> prints hex string
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${bytes}"
  else
    head -c "${bytes}" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# ---------- preflight ----------

if [[ "${EUID}" -ne 0 ]]; then
  die "chạy bằng root: sudo bash install.sh"
fi

need_cmd curl
need_cmd systemctl
need_cmd install

ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64|amd64) ;;
  aarch64|arm64|armv7l|armv6l|arm)
    die "arch=${ARCH} (ARM) chưa được hỗ trợ. Cần máy linux x86_64."
    ;;
  *)
    die "arch=${ARCH} chưa được hỗ trợ. Cần máy linux x86_64."
    ;;
esac

echo
echo "=== web-tty installer ==="
echo "Cài binary + systemd service, tự chạy khi boot."
echo "Binary: ${RELEASE_URL}"
echo

if ! ask_yes_no "Tiếp tục cài đặt vào ${INSTALL_DIR}?" "Y"; then
  echo "Đã hủy."
  exit 0
fi

# ---------- gather input ----------

KEEP_ENV=0
if [[ -f "${ENV_FILE}" ]]; then
  echo
  echo "Đã có ${ENV_FILE}."
  if ask_yes_no "Giữ nguyên .env hiện có (chỉ cập nhật binary)?" "Y"; then
    KEEP_ENV=1
  fi
fi

AUTH_PASSWORD=""
AUTH_PASSWORD_GENERATED=0
SESSION_SECRET=""
LISTEN_ADDR="${DEFAULT_LISTEN_ADDR}"
COOKIE_MAX_AGE="${DEFAULT_COOKIE_MAX_AGE}"
IDLE_TIMEOUT="${DEFAULT_IDLE_TIMEOUT}"
LOGIN_DELAY="${DEFAULT_LOGIN_DELAY}"
MAX_TERMINALS="${DEFAULT_MAX_TERMINALS}"

if [[ "${KEEP_ENV}" -eq 0 ]]; then
  echo
  echo "--- cấu hình ---"
  ask_secret "AUTH_PASSWORD (Enter = tự sinh, gõ sẽ ẩn)"
  AUTH_PASSWORD="${REPLY}"
  if [[ -z "${AUTH_PASSWORD}" ]]; then
    AUTH_PASSWORD="$(gen_secret 16)"
    AUTH_PASSWORD_GENERATED=1
    echo "Đã sinh AUTH_PASSWORD (sẽ in lại khi hoàn tất — hãy lưu lại)."
  fi

  ask_secret "SESSION_SECRET (Enter = tự sinh)"
  SESSION_SECRET="${REPLY}"
  if [[ -z "${SESSION_SECRET}" ]]; then
    SESSION_SECRET="$(gen_secret 32)"
    echo "Đã sinh SESSION_SECRET."
  fi

  ask "LISTEN_ADDR" "${DEFAULT_LISTEN_ADDR}"
  LISTEN_ADDR="${REPLY}"

  ask "COOKIE_MAX_AGE (giây, 0 = session cookie)" "${DEFAULT_COOKIE_MAX_AGE}"
  COOKIE_MAX_AGE="${REPLY}"
  ask "IDLE_TIMEOUT" "${DEFAULT_IDLE_TIMEOUT}"
  IDLE_TIMEOUT="${REPLY}"
  ask "LOGIN_DELAY" "${DEFAULT_LOGIN_DELAY}"
  LOGIN_DELAY="${REPLY}"
  ask "MAX_TERMINALS" "${DEFAULT_MAX_TERMINALS}"
  MAX_TERMINALS="${REPLY}"
fi

# ---------- summary ----------

echo
echo "=== tóm tắt ==="
echo "  RELEASE_URL : ${RELEASE_URL}"
echo "  INSTALL_DIR : ${INSTALL_DIR}"
echo "  SERVICE     : ${SERVICE_NAME}.service"
if [[ "${KEEP_ENV}" -eq 1 ]]; then
  echo "  .env        : giữ nguyên ${ENV_FILE}"
else
  if [[ "${AUTH_PASSWORD_GENERATED}" -eq 1 ]]; then
    echo "  AUTH_PASSWORD : (tự sinh — in khi xong)"
  else
    echo "  AUTH_PASSWORD : (đã nhập)"
  fi
  echo "  SESSION_SECRET: (đã đặt/sinh)"
  echo "  LISTEN_ADDR   : ${LISTEN_ADDR}"
  echo "  CORS_ORIGINS  : ${CORS_ORIGINS}"
  echo "  COOKIE_MAX_AGE: ${COOKIE_MAX_AGE}"
  echo "  IDLE_TIMEOUT  : ${IDLE_TIMEOUT}"
  echo "  LOGIN_DELAY   : ${LOGIN_DELAY}"
  echo "  MAX_TERMINALS : ${MAX_TERMINALS}"
fi
echo

if ! ask_yes_no "Xác nhận cài / cập nhật?" "Y"; then
  echo "Đã hủy."
  exit 0
fi

# ---------- install ----------

echo
echo "→ Tải binary..."
TMP_BIN="$(mktemp)"
trap 'rm -f "${TMP_BIN}"' EXIT
curl -fL --retry 3 --connect-timeout 15 -o "${TMP_BIN}" "${RELEASE_URL}"
chmod +x "${TMP_BIN}"

mkdir -p "${INSTALL_DIR}"

if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${SERVICE_NAME}\.service"; then
  systemctl stop "${SERVICE_NAME}" 2>/dev/null || true
fi

install -m 755 "${TMP_BIN}" "${INSTALL_DIR}/${BIN_NAME}"
echo "→ Đã cài ${INSTALL_DIR}/${BIN_NAME}"

if [[ "${KEEP_ENV}" -eq 0 ]]; then
  umask 077
  cat > "${ENV_FILE}" <<EOF
AUTH_PASSWORD=${AUTH_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
COOKIE_MAX_AGE=${COOKIE_MAX_AGE}
IDLE_TIMEOUT=${IDLE_TIMEOUT}
LOGIN_DELAY=${LOGIN_DELAY}
MAX_TERMINALS=${MAX_TERMINALS}
LISTEN_ADDR=${LISTEN_ADDR}
CORS_ORIGINS=${CORS_ORIGINS}
EOF
  chmod 600 "${ENV_FILE}"
  echo "→ Đã ghi ${ENV_FILE}"
fi

cat > "${UNIT_FILE}" <<EOF
[Unit]
Description=web-tty terminal API
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${BIN_NAME}
EnvironmentFile=${ENV_FILE}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
echo "→ Đã ghi ${UNIT_FILE}"

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo
echo "=== hoàn tất ==="
systemctl --no-pager --full status "${SERVICE_NAME}" || true
echo
if [[ "${KEEP_ENV}" -eq 0 && "${AUTH_PASSWORD_GENERATED}" -eq 1 ]]; then
  echo "AUTH_PASSWORD (tự sinh — lưu ngay, sẽ không hiện lại):"
  echo "  ${AUTH_PASSWORD}"
  echo
fi
echo "Lệnh hữu ích:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  journalctl -u ${SERVICE_NAME} -f"
echo "  nano ${ENV_FILE} && systemctl restart ${SERVICE_NAME}"
echo
echo "Nhắc: cookie Secure=true — production nên đặt sau HTTPS reverse proxy."
echo "Xong."
