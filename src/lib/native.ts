/**
 * 原生外壳适配（Capacitor）。
 *
 * 在浏览器 / PWA 里所有函数都是空操作，所以同一套代码既能当网页用，
 * 也能被 Android 原生壳加载。
 */
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform()

/** 让状态栏跟随应用主题（浅色主题配深色文字，反之亦然） */
export function syncStatusBar(resolved: 'light' | 'dark') {
  if (!isNative) return
  const dark = resolved === 'dark'
  StatusBar.setBackgroundColor({ color: dark ? '#12100E' : '#f4f1ec' }).catch(() => {})
  // Style.Dark = 浅色文字（给深色背景用），命名容易搞反，这里显式取反
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
}

/** 启动时初始化原生外观 */
export function initNative() {
  if (!isNative) return
  // 不让 WebView 铺到状态栏下面：内容区从状态栏下方开始最稳，也不用算安全区
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#12100E' }).catch(() => {})
}

/**
 * 注册安卓返回键。返回 true 表示已消费。
 * 顺序：先退子页面，再退到首页，最后才退出 App。
 */
export function registerBackButton(handler: () => boolean) {
  if (!isNative) return () => {}
  let removed = false
  const listener = CapApp.addListener('backButton', () => {
    if (!handler()) CapApp.exitApp().catch(() => {})
  })
  return () => {
    if (removed) return
    removed = true
    listener.then((l) => l.remove()).catch(() => {})
  }
}

function blobDownload(filename: string, data: string, mime: string) {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 在系统浏览器里打开外链。
 * 原生 WebView 里 window.open / location.href 会把当前页面导航走，
 * 或者被拦下来什么都不发生，所以统一走 Capacitor 的打开方式。
 */
export async function openExternal(url: string) {
  if (isNative) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'popover' })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 导出文件。
 * 网页端走 a[download]；原生端 WebView 不支持下载，改为写入缓存目录后
 * 调系统分享面板，用户可以存到「文件」或发给自己。
 */
export async function saveTextFile(filename: string, data: string, mime: string) {
  if (!isNative) {
    blobDownload(filename, data, mime)
    return
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const written = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })
  await Share.share({
    title: filename,
    url: written.uri,
    dialogTitle: '保存或分享',
  })
}
