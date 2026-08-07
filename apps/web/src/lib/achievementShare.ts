import { achievementImageUrl, type Achievement } from './achievementsApi'

export type ShareLayout = 'museum' | 'minimal' | 'photo'
export type ShareAspect = 'square' | 'portrait'
export type ShareOptions = { layout: ShareLayout; aspect: ShareAspect; cover: boolean; category: boolean; story: boolean; reflection: boolean; stats: boolean; dark: boolean }

export const truncateShareText = (value: string, max = 150) => value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
export const shareStats = (item: Achievement) => item.stats ? [
  item.stats.focusedMinutes > 0 ? { value: `${Math.floor(item.stats.focusedMinutes / 60)}h`, label: 'Focused' } : null,
  item.stats.completedTasks > 0 ? { value: String(item.stats.completedTasks), label: 'Tasks completed' } : null,
  item.stats.focusSessions > 0 ? { value: String(item.stats.focusSessions), label: 'Focus sessions' } : null,
].filter(Boolean).slice(0, 3) as { value: string; label: string }[] : []

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const words = text.split(/\s+/); const lines: string[] = []; let current = ''
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (ctx.measureText(next).width > maxWidth && current) { lines.push(current); current = word } else current = next }
  if (current) lines.push(current)
  if (lines.length > maxLines) { const last = lines[maxLines - 1]; lines.length = maxLines; lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1)).trimEnd()}…` }
  return lines
}

export async function loadShareCover(token: string, item: Achievement) {
  const cover = item.images.find(image => image.isCover) ?? item.images[0]
  if (!cover) return null
  const response = await fetch(achievementImageUrl(item.id, cover.id), { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('The cover photo could not be loaded.')
  const blobUrl = URL.createObjectURL(await response.blob())
  const image = new Image(); image.src = blobUrl; await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The cover photo could not be rendered.')) })
  return { image, revoke: () => URL.revokeObjectURL(blobUrl) }
}

export async function renderAchievementShareCard(token: string, item: Achievement, options: ShareOptions) {
  const width = 1080; const height = options.aspect === 'portrait' ? 1350 : 1080; const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser cannot generate share images.')
  const bg = options.dark ? '#1A1F2C' : '#f8f6ee'; const ink = options.dark ? '#ffffff' : '#1A1F2C'; const muted = options.dark ? '#aeb7c7' : '#5c6575'; const yellow = '#FDEF4B'
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height)
  const loaded = options.cover ? await loadShareCover(token, item) : null
  try {
    const photoHeight = loaded && options.layout !== 'minimal' ? Math.round(height * (options.layout === 'photo' ? .54 : .38)) : 0
    if (loaded) { const scale = Math.max(width / loaded.image.width, photoHeight / loaded.image.height); const sw = loaded.image.width * scale; const sh = loaded.image.height * scale; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, photoHeight); ctx.clip(); ctx.drawImage(loaded.image, (width - sw) / 2, (photoHeight - sh) / 2, sw, sh); ctx.restore(); if (options.layout === 'photo') { const gradient = ctx.createLinearGradient(0, photoHeight, 0, 0); gradient.addColorStop(0, bg); gradient.addColorStop(1, 'transparent'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, photoHeight) } }
    const left = 88; const top = photoHeight ? photoHeight + 55 : 100; ctx.fillStyle = yellow; ctx.font = '900 26px system-ui'; ctx.fillText('ACHIEVEMENT', left, top)
    ctx.fillStyle = ink; ctx.font = '900 64px system-ui'; const titleLines = wrap(ctx, item.title, width - left * 2, 3); titleLines.forEach((line, index) => ctx.fillText(line, left, top + 90 + index * 72))
    const metaY = top + 100 + titleLines.length * 72; ctx.fillStyle = muted; ctx.font = '700 26px system-ui'; ctx.fillText(`${options.category ? `${item.category} · ` : ''}${new Date(`${item.achievementDate}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`, left, metaY)
    let cursor = metaY + 62; ctx.fillStyle = ink; ctx.font = '500 30px system-ui'
    if (options.story && item.description) { wrap(ctx, `“${truncateShareText(item.description)}”`, width - left * 2, 3).forEach(line => { ctx.fillText(line, left, cursor); cursor += 40 }); cursor += 15 }
    if (options.reflection && item.reflection) { ctx.fillStyle = muted; wrap(ctx, `“${truncateShareText(item.reflection)}”`, width - left * 2, 3).forEach(line => { ctx.fillText(line, left, cursor); cursor += 40 }); cursor += 15 }
    if (options.stats) { const stats = shareStats(item); ctx.fillStyle = ink; ctx.font = '900 34px system-ui'; stats.forEach((stat, index) => { const x = left + index * ((width - left * 2) / Math.max(1, stats.length)); ctx.fillText(stat.value, x, height - 150); ctx.fillStyle = muted; ctx.font = '600 20px system-ui'; ctx.fillText(stat.label, x, height - 115); ctx.fillStyle = ink; ctx.font = '900 34px system-ui' }) }
    ctx.fillStyle = yellow; ctx.fillRect(left, height - 72, 38, 7); ctx.fillStyle = muted; ctx.font = '900 24px system-ui'; ctx.fillText('BeePlan', left + 52, height - 64)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The share image could not be generated.')), 'image/png'))
  } finally { loaded?.revoke() }
}
