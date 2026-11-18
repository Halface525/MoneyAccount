import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 按住拖动来排序的一小套逻辑，分类格子（记账页）和分类列表（分类页）共用。
 *
 * 监听的是 window 上的 pointermove，而不是对元素做 pointer capture：
 * 拖到一半时 React 会把元素在 DOM 里挪位置，capture 会跟着元素一起丢。
 * 判定排序目标用 elementFromPoint + [data-drag-id]，跟数据顺序无关。
 */
export function useDragReorder({
  ids,
  onCommit,
  threshold = 5,
}: {
  ids: string[]
  onCommit: (ids: string[]) => void
  /** 位移超过这个距离才算拖动，避免手指轻微抖动就被当成排序 */
  threshold?: number
}) {
  const [order, setOrder] = useState<string[]>(ids)
  const [dragId, setDragId] = useState<string | null>(null)
  const orderRef = useRef<string[]>(ids)
  const commitRef = useRef(onCommit)
  const originRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const activeRef = useRef(false)
  const droppedAtRef = useRef(0)

  commitRef.current = onCommit

  // 外部数据变了（新增/删除分类）就同步；拖动过程中不动，免得把正在拖的顺序冲掉
  useEffect(() => {
    if (activeRef.current) return
    const same =
      orderRef.current.length === ids.length && orderRef.current.every((v, i) => v === ids[i])
    if (!same) {
      orderRef.current = ids
      setOrder(ids)
    }
  }, [ids])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const origin = originRef.current
      if (!origin) return

      if (!activeRef.current) {
        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < threshold) return
        activeRef.current = true
        setDragId(origin.id)
      }

      const el = document.elementFromPoint(e.clientX, e.clientY)
      const target = el instanceof Element ? el.closest<HTMLElement>('[data-drag-id]') : null
      const targetId = target?.dataset.dragId
      if (!targetId || targetId === origin.id) return

      const arr = orderRef.current
      const from = arr.indexOf(origin.id)
      const to = arr.indexOf(targetId)
      if (from < 0 || to < 0 || from === to) return

      const next = arr.slice()
      next.splice(from, 1)
      next.splice(to, 0, origin.id)
      orderRef.current = next
      setOrder(next)
    }

    const finish = () => {
      const origin = originRef.current
      originRef.current = null
      if (!origin) return
      const moved = activeRef.current
      activeRef.current = false
      setDragId(null)
      if (moved) {
        droppedAtRef.current = Date.now()
        commitRef.current(orderRef.current)
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [threshold])

  const onPointerDown = useCallback((id: string, e: React.PointerEvent) => {
    originRef.current = { id, x: e.clientX, y: e.clientY }
    activeRef.current = false
  }, [])

  /** 刚拖完浏览器还会补一个 click，用它挡掉「拖动被当成点选」 */
  const wasDragging = useCallback(() => Date.now() - droppedAtRef.current < 300, [])

  return { order, dragId, dragging: dragId !== null, onPointerDown, wasDragging }
}
