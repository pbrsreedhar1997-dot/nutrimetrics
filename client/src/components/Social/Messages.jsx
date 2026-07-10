import { useState, useEffect, useCallback, useRef } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

function Thread({ token, other, socket, onBack }) {
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    const res = await apiCall('GET', `/messages/${other.id}`, null, token)
    setMessages(res.messages || [])
  }, [token, other.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Live-refresh the open thread when a message arrives or is deleted.
  useEffect(() => {
    if (!socket) return
    const offNew = socket.on('new_message', (msg) => { if (msg.from?.id === other.id) load() })
    const offDel = socket.on('message_deleted', (msg) => setMessages(ms => ms.filter(m => m.id !== msg.id)))
    return () => { offNew(); offDel() }
  }, [socket, other.id, load])

  async function send(e) {
    e.preventDefault()
    if (!text.trim()) return
    await apiCall('POST', `/messages/${other.id}`, { content: text.trim() }, token)
    setText('')
    load()
  }

  async function del(id) {
    setMessages(ms => ms.filter(m => m.id !== id)) // optimistic
    await apiCall('DELETE', `/messages/${id}`, null, token).catch(() => load())
  }

  return (
    <div className={styles.thread}>
      <button className={styles.backBtn} onClick={onBack}>← Messages</button>
      <h3>{other.username}</h3>
      <div className={styles.threadMessages}>
        {messages.map(m => {
          const mine = m.sender_id !== other.id
          return (
            <div key={m.id} className={`${styles.bubbleWrap} ${mine ? styles.mine : ''}`}>
              <div className={`${styles.bubble} ${mine ? styles.bubbleMe : styles.bubbleThem}`}>{m.content}</div>
              {mine && <button className={styles.msgDel} title="Delete" onClick={() => del(m.id)}>🗑</button>}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form className={styles.sendForm} onSubmit={send}>
        <input type="text" placeholder="Type a message…" value={text} onChange={e => setText(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}

export default function Messages({ token, socket }) {
  const [conversations, setConversations] = useState([])
  const [friends, setFriends]   = useState([])
  const [active, setActive]     = useState(null)
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([
      apiCall('GET', '/messages/conversations', null, token),
      apiCall('GET', '/friends', null, token),
    ])
    setConversations(c.conversations || [])
    setFriends(f.friends || [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const off = socket.on('new_message', load)
    return () => off()
  }, [socket, load])

  if (active) return <Thread token={token} other={active} socket={socket} onBack={() => { setActive(null); load() }} />

  if (loading) return <div className={styles.loading}>Loading messages…</div>

  const startedIds = new Set(conversations.map(c => c.id))
  const newFriends = friends.filter(f => !startedIds.has(f.id))

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <h4>Conversations</h4>
        {conversations.length === 0 && <div className={styles.empty}>No messages yet.</div>}
        {conversations.map(c => (
          <div key={c.id} className={styles.row} style={{ cursor: 'pointer' }}
            onClick={() => setActive({ id: c.id, username: c.username })}>
            <span>{c.username}{c.unread > 0 ? ` (${c.unread})` : ''}</span>
            <span className={styles.preview}>{c.lastMessage?.slice(0, 30)}</span>
          </div>
        ))}
      </div>
      {newFriends.length > 0 && (
        <div className={styles.section}>
          <h4>Start a conversation</h4>
          {newFriends.map(f => (
            <div key={f.id} className={styles.row} style={{ cursor: 'pointer' }}
              onClick={() => setActive({ id: f.id, username: f.username })}>
              <span>{f.username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
