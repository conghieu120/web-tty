type ClipboardPerm = 'granted' | 'denied' | 'prompt' | 'unknown'

async function queryClipboardPermission(
  name: 'clipboard-read' | 'clipboard-write',
): Promise<ClipboardPerm> {
  try {
    // Not all browsers type clipboard-* as PermissionName.
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    })
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Ensure permission; calling read/write while `prompt` triggers the browser dialog. */
async function ensureClipboardPermission(
  name: 'clipboard-read' | 'clipboard-write',
): Promise<'ok' | 'denied'> {
  const perm = await queryClipboardPermission(name)
  if (perm === 'denied') return 'denied'
  return 'ok'
}

export async function clipboardWrite(
  text: string,
): Promise<'ok' | 'denied' | 'unavailable'> {
  if (!navigator.clipboard?.writeText) return 'unavailable'
  if ((await ensureClipboardPermission('clipboard-write')) === 'denied') {
    return 'denied'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'ok'
  } catch {
    return 'denied'
  }
}

export async function clipboardRead(): Promise<
  { ok: true; text: string } | { ok: false; reason: 'denied' | 'unavailable' }
> {
  if (!navigator.clipboard?.readText) {
    return { ok: false, reason: 'unavailable' }
  }
  if ((await ensureClipboardPermission('clipboard-read')) === 'denied') {
    return { ok: false, reason: 'denied' }
  }
  try {
    const text = await navigator.clipboard.readText()
    return { ok: true, text }
  } catch {
    return { ok: false, reason: 'denied' }
  }
}
