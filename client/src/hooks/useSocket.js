import { useEffect, useRef, useCallback } from 'react'

// Connects once authenticated, sends the JWT to identify the socket, and lets
// components subscribe to server-pushed events (new_message, new_like, etc.)
// without polling. Writes still go through plain REST via apiCall — this hook
// is a pure notification channel.
export function useSocket(token) {
  const wsRef = useRef(null)
  const listenersRef = useRef(new Map()) // event type -> Set<handler>

  useEffect(() => {
    if (!token) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }))

    ws.onmessage = (evt) => {
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }
      const handlers = listenersRef.current.get(msg.type)
      if (handlers) handlers.forEach(fn => fn(msg))
    }

    return () => ws.close()
  }, [token])

  const on = useCallback((type, handler) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set())
    listenersRef.current.get(type).add(handler)
    return () => listenersRef.current.get(type)?.delete(handler)
  }, [])

  return { on }
}
