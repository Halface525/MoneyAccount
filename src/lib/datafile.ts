/**
 * 数据文件持久化。
 *
 * 核心问题：IndexedDB 是 WebView 内部的数据库，用户看不见、也没法备份，
 * 清应用数据或者换手机就没了。这里把每次改动都写成手机里的**真实文件**：
 *
 *   Documents/随手记/随手记-账本.json
 *
 * 放在公共「文档」目录，手机自带的「文件」App 里能直接看到，
 * 插 USB 能拷到电脑，卸载 App 也不会被删，还能被网盘/相册类工具同步。
 *
 * 每次启动先把文件读回来覆盖 IndexedDB，等于文件是真相、数据库是缓存，
 * 这样即使 WebView 的库被系统清掉，数据也还在。
 *
 * 另外每次保存会顺手在 archives/ 里按天留一份，误删了还能往前翻。
 */
import { Capacitor } from '@capacitor/core'
import { buildBackup, parseBackup, BACKUP_APP, type Backup } from './backup'
import { db, getSetting, setSetting } from '../db'

export const DATA_DIR = '随手记'
export const MAIN_FILE = '随手记-账本.json'
export const ARCHIVE_DIR = 'archives'

/** 文件在手机上的可读位置，界面上展示给用户看 */
export const FILE_PATH_HINT = '手机「文件」App → Documents/随手记/随手记-账本.json'

export const isNativePlatform = Capacitor.isNativePlatform()

type FS = typeof import('@capacitor/filesystem')
type Dir = (typeof import('@capacitor/filesystem'))['Directory'][keyof (typeof import('@capacitor/filesystem'))['Directory']]

interface FilesAccessPlugin {
  status(): Promise<{ granted: boolean; needsSettings: boolean }>
  request(): Promise<{ granted: boolean; openSettings?: boolean }>
}

const FilesAccess = () =>
  Capacitor.Plugins.FilesAccess as unknown as FilesAccessPlugin | undefined

/** 是否已经拿到「读写手机文件」的权限 */
export async function hasFileAccess(): Promise<boolean> {
  if (!isNativePlatform) return true
  try {
    const res = await FilesAccess()?.status()
    return !!res?.granted
  } catch {
    return false
  }
}

/**
 * 申请文件权限。安卓 11+ 会跳到系统设置页让用户手动开「所有文件访问」，
 * 所以要提示用户点了什么再允许。
 */
export async function requestFileAccess(): Promise<boolean> {
  if (!isNativePlatform) return true
  try {
    const res = await FilesAccess()?.request()
    return !!res?.granted
  } catch {
    return false
  }
}

async function fs(): Promise<FS> {
  return import('@capacitor/filesystem')
}

/**
 * 优先写公共「文档」目录（用户看得见、能拷走）；
 * 没有权限就退回 App 的外部目录（Android/data/…，插电脑也能拷）。
 * 判断方式是**真的写一个探针文件**，因为 mkdir 失败可能只是「目录已存在」，
 * 也可能是权限不足，不能拿它当依据。
 */
let activeDir: Dir | null = null

/**
 * 分区存储的坑：安卓 11+ 里，App 清除数据后就失去对自己写过的文件的访问权，
 * 读会失败。这时候如果照常保存，就会拿空数据覆盖掉原来那份好账本。
 * 所以读失败过、又没拿到「所有文件访问」权限时，一律**不写文件**。
 */
let writeBlocked = false

export function isWriteBlocked() {
  return writeBlocked
}

/**
 * 启动时「读文件回填」这段时间里，用户如果已经动手改了数据，
 * 就不能再拿文件去覆盖他刚做的事。这两个标志用来守住这个顺序。
 */
let bootRestoring = false
let changedDuringRestore = false

export function isRestoring() {
  return bootRestoring
}

/** Android 10（含）以下写公共目录要存储权限，先申请一次；失败就算了，会自动降级。 */
let permissionAsked = false
async function askStoragePermission() {
  if (permissionAsked) return
  permissionAsked = true
  const { Filesystem } = await fs()
  try {
    const state = await Filesystem.checkPermissions()
    if (state.publicStorage !== 'granted') {
      await Filesystem.requestPermissions()
    }
  } catch {
    // 新系统没有这个权限项，直接忽略
  }
}

async function probe(dir: Dir, path: string): Promise<boolean> {
  const { Filesystem, Encoding } = await fs()
  try {
    await Filesystem.writeFile({
      path: `${path}/.probe`,
      data: 'ok',
      directory: dir,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    await Filesystem.deleteFile({ path: `${path}/.probe`, directory: dir }).catch(() => {})
    return true
  } catch {
    return false
  }
}

/**
 * 选目录。
 *
 * 关键区别：安卓 11+ 里，**不管有没有权限都能往 Documents 写新文件**，
 * 区别在于清除应用数据之后还能不能读回来。所以不能拿「写得进去」当依据，
 * 必须以「有没有拿到所有文件访问权限」为准：
 *   - 有权限 → Documents/随手记，真正的长期文件
 *   - 没权限 → 退回应用私有目录，至少本次安装期间不会丢，界面上提示去授权
 */
async function resolveDir(): Promise<Dir> {
  if (activeDir) return activeDir
  const { Directory } = await fs()
  if (await hasFileAccess()) {
    activeDir = Directory.Documents
    return activeDir
  }
  await askStoragePermission()
  if (await probe(Directory.Documents, DATA_DIR)) {
    // 老系统（10 及以下）没有分区存储，有读写权限就够了
    activeDir = Directory.Documents
    return activeDir
  }
  if (await probe(Directory.External, DATA_DIR)) {
    activeDir = Directory.External
    return activeDir
  }
  activeDir = Directory.Data
  return activeDir
}

/** 拿到权限后重新尝试一次：先读回文件，然后解除写锁 */
export async function retryAfterPermission(): Promise<boolean> {
  if (!isNativePlatform) return false
  if (!(await hasFileAccess())) return false
  writeBlocked = false
  activeDir = null
  await restoreFromFile()
  return !writeBlocked
}

/** 当前实际使用的目录，用来在界面上告诉用户文件到底在哪 */
export async function currentDirLabel(): Promise<string> {
  const { Directory } = await fs()
  const dir = await resolveDir()
  if (dir === Directory.Documents) return 'Documents/随手记/随手记-账本.json'
  if (dir === Directory.External) {
    return 'Android/data/com.nimingzhe.moneyaccount/files/随手记/随手记-账本.json'
  }
  return '应用私有目录（未授权，建议去设置里允许访问文件）'
}

async function ensureDir(path: string) {
  const { Filesystem } = await fs()
  const directory = await resolveDir()
  try {
    await Filesystem.mkdir({ path, directory, recursive: true })
  } catch {
    // 已存在就会抛，忽略
  }
}

async function writeText(path: string, data: string) {
  const { Filesystem, Encoding } = await fs()
  const directory = await resolveDir()
  await Filesystem.writeFile({
    path,
    data,
    directory,
    encoding: Encoding.UTF8,
    recursive: true,
  })
}

async function readText(path: string): Promise<string | null> {
  const { Filesystem, Encoding } = await fs()
  const directory = await resolveDir()
  try {
    const res = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 })
    return typeof res.data === 'string' ? res.data : null
  } catch {
    return null
  }
}

async function fileExists(path: string): Promise<boolean> {
  const { Filesystem } = await fs()
  const directory = await resolveDir()
  try {
    await Filesystem.stat({ path, directory })
    return true
  } catch {
    return false
  }
}

async function deletePath(path: string) {
  const { Filesystem } = await fs()
  const directory = await resolveDir()
  try {
    await Filesystem.deleteFile({ path, directory })
  } catch {
    // 不存在就算了
  }
}

// ---------------------------------------------------------------- 保存

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving = false
let dirty = false

/** 本地数据最后改动时间，用来判断「文件比库旧」的情况 */
const LOCAL_CHANGE_KEY = 'money-account:lastLocalChange'

function markLocalChange() {
  try {
    localStorage.setItem(LOCAL_CHANGE_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

function lastLocalChange(): number {
  try {
    return Number(localStorage.getItem(LOCAL_CHANGE_KEY)) || 0
  } catch {
    return 0
  }
}

/** 上次成功保存的时间（毫秒）与笔数，给设置页显示 */
export type SaveState = { at: number; count: number }
let lastSave: SaveState | null = null
const saveListeners = new Set<(s: SaveState) => void>()

export function onSaved(fn: (s: SaveState) => void) {
  saveListeners.add(fn)
  return () => {
    saveListeners.delete(fn)
  }
}

export function getLastSave() {
  return lastSave
}

async function doSave() {
  if (!isNativePlatform) return
  if (writeBlocked) return
  if (saving) {
    // 正在写就再排一次，避免并发写同一个文件
    dirty = true
    return
  }
  saving = true
  try {
    const data: Backup = await buildBackup()
    await ensureDir(DATA_DIR)
    // 不缩进：3000 笔时带缩进的文件约 880KB，压成一行约 340KB，
    // 解析和复制都更快。备份仍然是合法 JSON，人眼靠格式化工具也能看。
    const json = JSON.stringify(data)
    await writeText(`${DATA_DIR}/${MAIN_FILE}`, json)

    // 按天留档：同一天重复保存会覆盖当天那一份
    const day = new Date().toISOString().slice(0, 10)
    await ensureDir(`${DATA_DIR}/${ARCHIVE_DIR}`)
    await writeText(`${DATA_DIR}/${ARCHIVE_DIR}/${day}.json`, json)

    lastSave = { at: Date.now(), count: data.transactions.length }
    await setSetting('lastFileSaveAt', lastSave.at)
    await setSetting('lastFileSaveCount', lastSave.count)
    saveListeners.forEach((fn) => fn(lastSave!))
  } catch (err) {
    console.warn('[datafile] 保存失败', err)
  } finally {
    saving = false
    if (dirty) {
      dirty = false
      void doSave()
    }
  }
}

/** 请求保存（防抖 800ms）。任何写数据的地方调一下就行。 */
export function scheduleSave() {
  if (!isNativePlatform) return
  markLocalChange()
  // 还在从文件回填的阶段用户就改了东西：记下来，回填时放弃覆盖
  if (bootRestoring) changedDuringRestore = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void doSave()
  }, 800)
}

/** 立即保存，页面隐藏 / 应用退到后台时用 */
export async function flushSave() {
  if (!isNativePlatform) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await doSave()
}

/**
 * 给所有表挂上写入钩子，任何一个地方改了数据都会自动落盘。
 * 这样不用在每个页面里手写保存调用，也不会漏。
 */
let autoSaveInstalled = false
export function installAutoSave() {
  if (autoSaveInstalled || !isNativePlatform) return
  autoSaveInstalled = true
  // 注意不能把 settings 挂进来：保存时自己要写 settings 记录时间，
  // 挂上就会自己触发自己，无限循环。
  const tables = [db.transactions, db.accounts, db.categories, db.budgets, db.recurring]
  for (const table of tables) {
    table.hook('creating', () => { scheduleSave() })
    table.hook('updating', () => { scheduleSave() })
    table.hook('deleting', () => { scheduleSave() })
  }
}

// ---------------------------------------------------------------- 还原

/**
 * 启动时把文件读回 IndexedDB。
 * 返回 null 表示没有文件（第一次装）；否则返回文件里的信息。
 */
export async function restoreFromFile(): Promise<{ count: number; savedAt: string } | null> {
  if (!isNativePlatform) return null
  // 没拿到「所有文件访问」权限时，既有账本读不到，这时写文件只会另起一份空的，
  // 用户会以为数据丢了。所以干脆先不写，等授权后再说（界面上会提示去授权）。
  if (!(await hasFileAccess())) {
    writeBlocked = true
    console.warn('[datafile] 未获得文件访问权限，暂停文件读写')
    return null
  }
  writeBlocked = false
  bootRestoring = true
  changedDuringRestore = false
  try {
    return await restoreInner()
  } finally {
    bootRestoring = false
  }
}

async function restoreInner(): Promise<{ count: number; savedAt: string } | null> {
  const path = `${DATA_DIR}/${MAIN_FILE}`
  if (!(await fileExists(path))) return null
  const text = await readText(path)
  if (!text) return null
  const data = parseBackup(text)
  if (!data) {
    console.warn('[datafile] 文件格式不对，跳过还原')
    return null
  }

  // 文件是空的但库里有数据（例如刚升级上来第一次跑），
  // 那就反过来把库写进文件，不要拿空文件把数据冲掉
  const localCount = await db.transactions.count()
  if (data.transactions.length === 0 && localCount > 0) {
    await flushSave()
    return null
  }

  // 文件比本地库还旧（上次保存失败、或者写到一半被杀），说明文件不是最新的，
  // 这时以库为准重新写一遍文件，而不是让旧文件回滚掉新数据。
  const fileTime = Date.parse(data.exportedAt) || 0
  if (localCount > 0 && fileTime > 0 && fileTime < lastLocalChange()) {
    console.warn('[datafile] 文件比本地数据旧，以本地为准')
    await flushSave()
    return null
  }

  // 回填期间用户已经改过数据（哪怕只有一笔），就以他改的为准，不要被文件盖掉
  if (changedDuringRestore) {
    console.warn('[datafile] 回填期间有新写入，放弃用文件覆盖')
    return null
  }

  await db.transaction(
    'rw',
    [db.transactions, db.accounts, db.categories, db.budgets, db.recurring],
    async () => {
      if (data.categories.length) {
        await db.categories.clear()
        await db.categories.bulkPut(data.categories)
      }
      if (data.accounts.length) {
        await db.accounts.clear()
        await db.accounts.bulkPut(data.accounts)
      }
      await db.transactions.clear()
      if (data.transactions.length) await db.transactions.bulkPut(data.transactions)
      await db.budgets.clear()
      if (data.budgets.length) await db.budgets.bulkPut(data.budgets)
      await db.recurring.clear()
      if (data.recurring.length) await db.recurring.bulkPut(data.recurring)
    },
  )

  lastSave = { at: Date.parse(data.exportedAt) || Date.now(), count: data.transactions.length }
  return { count: data.transactions.length, savedAt: data.exportedAt }
}

/** 列出按天留档的文件，新的在前 */
export async function listArchives(): Promise<{ name: string; size: number; mtime: number }[]> {
  if (!isNativePlatform) return []
  const { Filesystem } = await fs()
  const directory = await resolveDir()
  try {
    const res = await Filesystem.readdir({ path: `${DATA_DIR}/${ARCHIVE_DIR}`, directory })
    const files = res.files
      .filter((f) => f.name.endsWith('.json'))
      .map((f) => ({ name: f.name, size: f.size, mtime: f.mtime }))
    return files.sort((a, b) => (a.name < b.name ? 1 : -1))
  } catch {
    return []
  }
}

export async function deleteArchive(name: string) {
  await deletePath(`${DATA_DIR}/${ARCHIVE_DIR}/${name}`)
}

/** 把某一天的留档读出来（用于回滚） */
export async function readArchive(name: string): Promise<Backup | null> {
  if (!isNativePlatform) return null
  const text = await readText(`${DATA_DIR}/${ARCHIVE_DIR}/${name}`)
  return text ? parseBackup(text) : null
}

/** 上次保存状态，冷启动时从 settings 里读回来 */
export async function loadSaveState(): Promise<SaveState | null> {
  const at = await getSetting<number>('lastFileSaveAt', 0)
  const count = await getSetting<number>('lastFileSaveCount', 0)
  if (!at) return null
  lastSave = { at, count }
  return lastSave
}

export const BACKUP_MARK = BACKUP_APP
