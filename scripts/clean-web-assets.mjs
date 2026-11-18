// 构建前把网页产物清干净。
//
// 1. dist：换过几版之后里面会堆着旧的 index-*.js（Vite 这边的清空在这台机器上
//    没生效），不清就会一起打进 APK。
// 2. android/app/src/main/assets/public：cap sync 只覆盖不删除，同样会累积。
//
// 两个目录都删掉，让安装包只带当前这一份。
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

rmSync(resolve(root, 'dist'), { recursive: true, force: true })
rmSync(resolve(root, 'android/app/src/main/assets/public'), { recursive: true, force: true })
