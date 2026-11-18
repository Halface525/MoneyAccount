/**
 * 随手记 · 本地静态服务器
 *
 * 用途：构建完成后把 dist/ 跑起来，方便手机在同一个 Wi-Fi 下访问。
 *
 *   node scripts/serve.mjs          # http://<局域网IP>:5173
 *   node scripts/serve.mjs --https  # https://<局域网IP>:5173（自签证书，首次需在手机上信任）
 *
 * 为什么要 --https：iOS/Android 只有在 HTTPS（或 localhost）下才允许 Service Worker，
 * 也就是只有 HTTPS 才能“离线打开”和真正装到桌面成为独立 App。
 * 自签证书首次访问会提示不安全，点“继续访问”即可；若要长期使用建议部署到任意静态托管。
 */
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 5173)
const USE_HTTPS = process.argv.includes('--https')
const CERT_DIR = path.resolve(__dirname, '..', '.cert')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

if (!fs.existsSync(ROOT)) {
  console.error('找不到 dist/，请先运行：npm run build')
  process.exit(1)
}

function lanAddresses() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

function ensureCert() {
  const key = path.join(CERT_DIR, 'key.pem')
  const crt = path.join(CERT_DIR, 'cert.pem')
  if (fs.existsSync(key) && fs.existsSync(crt)) return { key, crt }
  fs.mkdirSync(CERT_DIR, { recursive: true })
  const ips = lanAddresses()
  const alt = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',')
  console.log('生成自签证书…')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', crt, '-days', '825',
    '-subj', '/CN=money-account.local',
    '-addext', `subjectAltName=${alt}`,
  ], { stdio: 'ignore' })
  console.log('证书已生成：.cert/cert.pem（有效期 825 天）')
  return { key, crt }
}

function handler(req, res) {
  const url = new URL(req.url ?? '/', 'http://x')
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname))

  // 目录 → index.html；未知路径回落 index.html（单页应用）
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html')
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(ROOT, 'index.html')
  }
  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const isHashed = /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(filePath)
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  }
  if (path.basename(filePath) === 'sw.js') {
    headers['Cache-Control'] = 'no-cache'
    headers['Service-Worker-Allowed'] = '/'
  }
  res.writeHead(200, headers)
  fs.createReadStream(filePath).pipe(res)
}

let server
if (USE_HTTPS) {
  const { key, crt } = ensureCert()
  server = https.createServer(
    { key: fs.readFileSync(key), cert: fs.readFileSync(crt) },
    handler,
  )
} else {
  server = http.createServer(handler)
}

server.listen(PORT, '0.0.0.0', () => {
  const scheme = USE_HTTPS ? 'https' : 'http'
  console.log(`\n  随手记 已启动（静态目录 dist/）\n`)
  console.log(`  本机     ${scheme}://localhost:${PORT}`)
  for (const ip of lanAddresses()) {
    console.log(`  局域网   ${scheme}://${ip}:${PORT}`)
  }
  if (!USE_HTTPS) {
    console.log(
      '\n  提示：从手机用 http://局域网IP 访问时功能全部正常，但浏览器只在 localhost\n' +
        '        或 HTTPS 下允许注册 Service Worker，所以那样没有“离线打开”。\n' +
        '        想装成真正的 App 请用：npm run serve:https\n',
    )
  } else {
    console.log('\n  自签证书：手机首次访问会提示“不安全”，选择继续访问即可。\n')
  }
})
