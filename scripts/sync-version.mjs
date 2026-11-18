// 版本号的唯一来源是 package.json。
// Vite 构建时通过 define 注入 __APP_VERSION__，Gradle 侧由 scripts/sync-version.mjs
// 写进 android/app/build.gradle 的 versionName / versionCode。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = pkg.version

// Android 要求 versionCode 是单调递增的整数。用 major*10000 + minor*100 + patch，
// 1.0.0 → 10000，1.2.3 → 10203，既单调又看得懂。
const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0)
const versionCode = major * 10000 + minor * 100 + patch

const gradlePath = resolve(root, 'android/app/build.gradle')
let gradle = readFileSync(gradlePath, 'utf8')
const before = gradle
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`)

if (gradle !== before) {
  writeFileSync(gradlePath, gradle)
  console.log(`android/app/build.gradle → versionName "${version}" / versionCode ${versionCode}`)
} else {
  console.log(`versionCode ${versionCode} / versionName "${version}" 已是最新`)
}
