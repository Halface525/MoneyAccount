import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// 只面向安卓 App（Capacitor 外壳）。不再产出 PWA / Service Worker：
// dist 会被整个打进 APK，当成本地资源加载，联网与否都一样。
export default defineConfig({
  base: './',
  // 每次构建前清空 dist：旧版本带 hash 的 chunk 不能一起打进 APK
  build: {
    emptyOutDir: true,
  },
  // 版本号只在 package.json 里写一次，界面与安卓包都从这里取
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
})
