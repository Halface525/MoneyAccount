// cap sync 只覆盖、不删除：换过几版之后 assets/public 里会堆着旧的
// index-*.js，白白把安装包撑大。同步前先清掉，让 APK 只带当前这一份。
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
rmSync(resolve(root, 'android/app/src/main/assets/public'), { recursive: true, force: true })
