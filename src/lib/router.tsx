import { useCallback, useEffect, useState } from 'react'

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/')

  useEffect(() => {
    const onChange = () => setHash(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to: string) => {
    if (window.location.hash.slice(1) === to) return
    window.location.hash = to
  }, [])

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = '/'
  }, [])

  return { route: hash, navigate, back }
}

export function parseRoute(route: string) {
  const [path, query] = route.split('?')
  const params = new URLSearchParams(query ?? '')
  const segs = path.split('/').filter(Boolean)
  return { path, segs, params }
}
