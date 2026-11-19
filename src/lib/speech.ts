import { Capacitor } from '@capacitor/core'

/**
 * 语音转文字。
 *
 * 安卓走系统的语音识别服务（`@capacitor-community/speech-recognition`），
 * 用的是手机上已经装好的识别器，不额外联网上传音频给第三方。
 * 浏览器（开发调试用）退回 Web Speech API。
 *
 * 之所以不自己接云端识别：记账是一句话的事，系统识别器认中文够用，
 * 而且不用再让用户为语音单独配一个 Key。
 */

export type SpeechLang = 'zh-CN'

export type SpeechResult = {
  /** 已经识别出来的文字，partialResults 时会不断更新 */
  text: string
  /** 是否已经说完（false 表示还在听，true 表示识别结束） */
  final: boolean
}

type Listener = (r: SpeechResult) => void

const isNative = Capacitor.isNativePlatform()

/** 识别器是否可用：安卓要系统里有 RecognitionService，浏览器要有 Web Speech API */
export async function speechAvailable(): Promise<boolean> {
  if (isNative) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')
      const r = await SpeechRecognition.available()
      return !!r.available
    } catch {
      return false
    }
  }
  return webSupported()
}

function webSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    SpeechRecognition?: unknown
    webkitSpeechRecognition?: unknown
  }
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
}

let stopNative: (() => void) | null = null
let stopWeb: (() => void) | null = null

/**
 * 开始听。返回一个停止函数，重复调用安全。
 *
 * `onResult` 会先收到若干条 `final: false` 的中间结果（边说边出字），
 * 最后收到一条 `final: true`。出错时也会收到 `final: true`，文字为空。
 */
export async function startListening(
  onResult: Listener,
  lang: SpeechLang = 'zh-CN',
): Promise<() => void> {
  await stopListening()

  if (isNative) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition')

      const perm = await SpeechRecognition.checkPermissions()
      if (perm.speechRecognition !== 'granted') {
        const req = await SpeechRecognition.requestPermissions()
        if (req.speechRecognition !== 'granted') {
          onResult({ text: '', final: true })
          return () => {}
        }
      }

      let last = ''
      let timer: ReturnType<typeof setTimeout> | null = null
      // 静默计时与 listeningState 都会收口，保证 final 只发一次
      let settled = false

      // 兜底看门狗：系统识别器出错（比如没检测到人声）时插件只 reject 内部
      // 的 call，不会发任何事件给我们。不设这个，界面会一直停在「听着呢」。
      const watchdog = setTimeout(() => {
        if (settled) return
        settled = true
        onResult({ text: last, final: true })
      }, 12000)

      // 安卓的 partialResults 在「最终结果」时也会再发一次，分不出是中间还是终局。
      // 做法是：拿不到新文字就静默 1.5 秒当说完——一句话记账，这个停顿够明显了。
      const settle = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (last && !settled) {
            settled = true
            clearTimeout(watchdog)
            onResult({ text: last, final: true })
          }
        }, 1500)
      }

      const partial = await SpeechRecognition.addListener(
        'partialResults',
        (data: { matches?: string[] }) => {
          const text = (data.matches ?? [])[0] ?? ''
          if (!text) return
          last = text
          onResult({ text, final: false })
          settle()
        },
      )

      const state = await SpeechRecognition.addListener(
        'listeningState',
        (data: { status?: string }) => {
          if (data.status !== 'stopped') return
          // 系统自己停了（识别完成或出错）：立刻收口，不用等静默计时
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          if (settled) return
          settled = true
          clearTimeout(watchdog)
          onResult({ text: last, final: true })
        },
      )

      stopNative = () => {
        clearTimeout(watchdog)
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        void partial.remove()
        void state.remove()
        void SpeechRecognition.stop().catch(() => {})
        void SpeechRecognition.removeAllListeners().catch(() => {})
        stopNative = null
      }

      // partialResults: 边听边出字，交给我们自己的界面显示，不用系统弹窗
      await SpeechRecognition.start({
        language: lang,
        maxResults: 3,
        partialResults: true,
        popup: false,
      })

      return () => {
        stopNative?.()
      }
    } catch {
      onResult({ text: '', final: true })
      return () => {}
    }
  }

  // ---- 浏览器：Web Speech API ----
  if (!webSupported()) {
    onResult({ text: '', final: true })
    return () => {}
  }

  const w = window as unknown as {
    SpeechRecognition?: new () => WebRecognition
    webkitSpeechRecognition?: new () => WebRecognition
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition!
  const rec = new Ctor()
  rec.lang = lang
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1

  let lastText = ''
  // onresult 的终局与 onend 都会到，用一个标记保证 onResult(final) 只发一次，
  // 否则同一句话会被当成两条消息发出去。
  let settled = false

  rec.onresult = (e: WebRecognitionEvent) => {
    let draft = ''
    let done = false
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      draft += r[0]?.transcript ?? ''
      if (r.isFinal) done = true
    }
    if (!draft) return
    lastText = draft
    if (done) settled = true
    onResult({ text: draft, final: done })
  }
  rec.onerror = () => {
    if (!settled) {
      settled = true
      onResult({ text: '', final: true })
    }
    stopWeb = null
  }
  rec.onend = () => {
    if (!settled) {
      settled = true
      onResult({ text: lastText, final: true })
    }
    stopWeb = null
  }

  stopWeb = () => {
    try {
      rec.stop()
    } catch {
      /* 已经停了 */
    }
    stopWeb = null
  }

  try {
    rec.start()
  } catch {
    onResult({ text: '', final: true })
  }

  return () => {
    stopWeb?.()
  }
}

export async function stopListening(): Promise<void> {
  stopNative?.()
  stopWeb?.()
  stopNative = null
  stopWeb = null
}

/* ---- Web Speech API 的最小类型（TS 的 DOM 库里还没有） ---- */

interface WebRecognitionEvent {
  resultIndex: number
  results: {
    length: number
    [i: number]: {
      isFinal: boolean
      [j: number]: { transcript: string }
    }
  }
}

interface WebRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: WebRecognitionEvent) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
