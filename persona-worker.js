/**
 * dsh-agent-personality — child process optimizer.
 *
 * Spawned by the Host after every completed turn. It receives one JSON object on
 * stdin and rewrites ONLY the managed block inside the persona Markdown:
 *
 *   <!-- agent-personality:managed:start -->
 *   ## 相处记忆
 *   - 2026-10-24：一句具体的事
 *   ## 当前情绪
 *   - 心情：...
 *   <!-- agent-personality:managed:end -->
 *
 * What it does here (add / remove / modify):
 *   add      append one new dated memory line (deduplicated)
 *   remove   drop duplicate memories and the oldest overflow beyond maxMemory
 *   modify   rebuild the emotion block (mood / energy / affection / stage / date)
 *
 * It never touches the rest of the user's persona card.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const START = '<!-- agent-personality:managed:start -->'
const END = '<!-- agent-personality:managed:end -->'

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', reject)
  })
}

function normalize(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

function dayOf(iso) {
  const date = iso ? new Date(iso) : new Date()
  const d = Number.isNaN(date.getTime()) ? new Date() : date
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function stageOf(affection) {
  const a = Math.max(0, Math.min(100, Math.round(Number(affection) || 50)))
  if (a <= 19) return '冷淡'
  if (a <= 39) return '疏离'
  if (a <= 59) return '平常'
  if (a <= 79) return '亲近'
  return '依赖'
}

function memoryKey(line) {
  return String(line)
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\d{4}-\d{2}-\d{2}\s*[：:]\s*/, '')
    .replace(/[\s，。！？、,.!?~～…·:：;；"'“”‘’()（）]/g, '')
    .toLowerCase()
}

function parseBody(body) {
  const memories = []
  let inMemory = false
  for (const line of body.split('\n')) {
    if (/^##\s*相处记忆\s*$/.test(line.trim())) {
      inMemory = true
      continue
    }
    if (/^##\s*/.test(line.trim())) {
      inMemory = false
      continue
    }
    if (!inMemory) continue
    const m = line.match(/^\s*[-*]\s+(.+)$/)
    if (m !== null && m[1].trim() !== '') memories.push(m[1].trim())
  }
  return memories
}

function buildBlock(memories, payload) {
  const stage = stageOf(payload.affection)
  const affection = Math.max(0, Math.min(100, Math.round(Number(payload.affection) || 50)))
  const energy = Math.round(Math.max(0, Math.min(100, Number(payload.energy) || 0)))
  return [
    START,
    '',
    '## 相处记忆',
    ...(memories.length > 0 ? memories.map((line) => `- ${line}`) : ['- （还没有值得记住的具体小事）']),
    '',
    '## 当前情绪',
    `- 心情：${String(payload.mood ?? '平静').slice(0, 24)}`,
    `- 精力：${energy} / 100`,
    `- 情感：${affection} / 100（${stage}）`,
    `- 最近更新：${dayOf(payload.at)}`,
    '',
    END,
    '',
  ].join('\n')
}

async function main() {
  const raw = await readStdin()
  const payload = raw.trim() === '' ? {} : JSON.parse(raw)
  const file = String(payload.personaPath ?? '')
  if (file === '') throw new Error('missing personaPath')

  const original = normalize(readFileSync(file, 'utf8'))
  const i = original.indexOf(START)
  const j = original.indexOf(END)
  const hasBlock = i >= 0 && j > i
  const before = hasBlock ? original.slice(0, i) : `${original.replace(/\s+$/, '')}\n\n`
  const body = hasBlock ? original.slice(i + START.length, j) : ''
  const after = hasBlock ? original.slice(j + END.length) : '\n'

  const memories = parseBody(body)

  // add + dedupe
  let added = 0
  const incoming = typeof payload.memory === 'string' ? payload.memory.trim() : ''
  if (incoming !== '') {
    const clean = incoming.replace(/^\d{4}-\d{2}-\d{2}\s*[：:]\s*/, '')
    const line = `${dayOf(payload.at)}：${clean.replace(/\s+/g, ' ').slice(0, 160)}`
    const key = memoryKey(line)
    const duplicate = memories.some((existing) => {
      const other = memoryKey(existing)
      if (other === '' || key === '') return false
      return other === key || (other.length > 8 && key.length > 8 && (other.includes(key) || key.includes(other)))
    })
    if (!duplicate) {
      memories.push(line)
      added = 1
    }
  }

  // remove duplicate lines left by earlier runs
  const seen = new Set()
  const deduped = []
  let removed = 0
  for (const line of memories) {
    const key = memoryKey(line)
    if (key !== '' && seen.has(key)) {
      removed += 1
      continue
    }
    if (key !== '') seen.add(key)
    deduped.push(line)
  }

  // remove oldest overflow
  const limit = Math.max(10, Math.min(200, Number(payload.maxMemory) || 60))
  if (deduped.length > limit) {
    removed += deduped.length - limit
    deduped.splice(0, deduped.length - limit)
  }

  const next = `${before}${buildBlock(deduped, payload)}${after.replace(/^\n+/, '\n')}`
  const changed = next !== original

  let backup = null
  if (changed) {
    mkdirSync(path.dirname(file), { recursive: true })
    backup = `${file}.bak`
    writeFileSync(backup, original, 'utf8')
    const tmp = `${file}.tmp-${process.pid}`
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, file)
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    changed,
    added,
    removed,
    memoryCount: deduped.length,
    bytes: Buffer.byteLength(next, 'utf8'),
    backup,
  })}\n`)
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: String(error?.message ?? error) })}\n`)
  process.exitCode = 1
})