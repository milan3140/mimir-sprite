import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { dlog } from './debugLog'
import type { Attachment } from '../../src/shared/types'

// Attachment binaries live on disk (NOT in db.json), under:
//   userData/mimir-sprite/attachments/<owner>/<ownerId>/<attachmentId>.<ext>
// The db only stores the Attachment metadata + the path RELATIVE to userData/mimir-sprite.
// One mechanism shared by todo (M3b) and notebook (M4); cascade-delete on owner removal avoids orphans.

const ROOT = (): string => join(app.getPath('userData'), 'mimir-sprite')
const ownerDir = (owner: string, ownerId: string): string => join(ROOT(), 'attachments', owner, ownerId)

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp'
}

/** Save a pasted image (data URL) to disk and return its Attachment metadata. */
export async function saveImageAttachment(
  owner: string, ownerId: string, dataUrl: string, name: string,
  width?: number, height?: number
): Promise<Attachment> {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) throw new Error('attachment: not a base64 data URL')
  const mime = m[1]
  const buf = Buffer.from(m[2], 'base64')
  const ext = MIME_EXT[mime] ?? 'png'
  const { v4 } = await import('uuid')
  const id = v4()
  const dir = ownerDir(owner, ownerId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const abs = join(dir, `${id}.${ext}`)
  writeFileSync(abs, buf)
  const rel = join('attachments', owner, ownerId, `${id}.${ext}`).replace(/\\/g, '/')
  dlog('attachment:save', { owner, ownerId, id, rel, bytes: buf.length, mime })
  return {
    id, kind: 'image', path: rel, name: name || `${id}.${ext}`,
    mime, bytes: buf.length, width, height, createdAt: Date.now()
  }
}

/** Read an attachment file back as a data URL (for rendering). relPath is relative to userData/mimir-sprite. */
export function readAttachmentDataUrl(relPath: string): string | null {
  try {
    const abs = join(ROOT(), relPath)
    if (!existsSync(abs)) return null
    const ext = (relPath.split('.').pop() ?? 'png').toLowerCase()
    const mime = Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? 'image/png'
    const b64 = readFileSync(abs).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch (err) {
    dlog('attachment:read-error', { relPath, err: String(err) })
    return null
  }
}

/** Cascade-delete: remove all attachment files for an owner (called when the todo/notebook is removed). */
export function deleteAttachmentsForOwner(owner: string, ownerId: string): void {
  try {
    const dir = ownerDir(owner, ownerId)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      dlog('attachment:purge', { owner, ownerId })
    }
  } catch (err) {
    dlog('attachment:purge-error', { owner, ownerId, err: String(err) })
  }
}
