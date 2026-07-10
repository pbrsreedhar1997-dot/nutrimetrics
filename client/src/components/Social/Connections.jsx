import { useState, useEffect, useCallback, useRef } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

function timeAgo(iso) {
  const d = new Date(iso), now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short' })
}

function Avatar({ name, isGroup }) {
  return (
    <div className={`${styles.avatar} ${isGroup ? styles.avatarGroup : ''}`}>
      {isGroup ? '👥' : (name?.[0] || '?').toUpperCase()}
    </div>
  )
}

// ── 1:1 DM thread ────────────────────────────────────────────────
function DmThread({ token, other, socket, onBack }) {
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    const res = await apiCall('GET', `/messages/${other.id}`, null, token)
    setMessages(res.messages || [])
  }, [token, other.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
    setMessages(ms => ms.filter(m => m.id !== id))
    await apiCall('DELETE', `/messages/${id}`, null, token).catch(() => load())
  }

  return (
    <div className={styles.thread}>
      <button className={styles.backBtn} onClick={onBack}>← Chats</button>
      <h3>{other.name}</h3>
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

// ── Group chat thread ────────────────────────────────────────────
function GroupThread({ token, group, socket, username, onBack }) {
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [members, setMembers]   = useState([])
  const [addUsername, setAddUsername] = useState('')
  const [addMsg, setAddMsg]     = useState('')
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    const res = await apiCall('GET', `/groups/${group.id}/messages`, null, token)
    setMessages(res.messages || [])
  }, [token, group.id])

  const loadMembers = useCallback(async () => {
    const res = await apiCall('GET', `/groups/${group.id}`, null, token)
    setMembers(res.members || [])
  }, [token, group.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!socket) return
    const offNew = socket.on('new_group_message', (msg) => { if (msg.group_id === group.id) load() })
    const offDel = socket.on('group_message_deleted', (msg) => { if (msg.group_id === group.id) setMessages(ms => ms.filter(m => m.id !== msg.id)) })
    return () => { offNew(); offDel() }
  }, [socket, group.id, load])

  async function send(e) {
    e.preventDefault()
    if (!text.trim()) return
    await apiCall('POST', `/groups/${group.id}/messages`, { content: text.trim() }, token)
    setText('')
    load()
  }

  async function del(id) {
    setMessages(ms => ms.filter(m => m.id !== id))
    await apiCall('DELETE', `/group-messages/${id}`, null, token).catch(() => load())
  }

  async function addMember(e) {
    e.preventDefault()
    setAddMsg('')
    const res = await apiCall('POST', `/groups/${group.id}/members`, { username: addUsername.trim() }, token)
    setAddMsg(res.error || res.message)
    if (!res.error) { setAddUsername(''); loadMembers() }
  }

  function openInfo() { setShowInfo(true); loadMembers() }

  if (showInfo) {
    return (
      <div className={styles.thread}>
        <button className={styles.backBtn} onClick={() => setShowInfo(false)}>← {group.name}</button>
        <h3>👥 {group.name}</h3>
        <div className={styles.section}>
          <h4>Members ({members.length})</h4>
          {members.map(m => (
            <div key={m.id} className={styles.row}>
              <span>{m.username}{m.role === 'owner' ? ' (owner)' : ''}</span>
            </div>
          ))}
          <form className={styles.addForm} onSubmit={addMember}>
            <input type="text" placeholder="Add a friend by username" value={addUsername}
              onChange={e => setAddUsername(e.target.value)} required />
            <button type="submit">Add</button>
          </form>
          {addMsg && <div className={styles.msg}>{addMsg}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.thread}>
      <button className={styles.backBtn} onClick={onBack}>← Chats</button>
      <div className={styles.threadHead}>
        <h3>👥 {group.name}</h3>
        <button className={styles.infoBtn} onClick={openInfo}>ⓘ</button>
      </div>
      <div className={styles.threadMessages}>
        {messages.map(m => {
          const mine = m.sender_username === username
          return (
            <div key={m.id} className={`${styles.bubbleWrap} ${mine ? styles.mine : ''}`}>
              <div>
                {!mine && <div className={styles.groupSender}>{m.sender_username}</div>}
                <div className={`${styles.bubble} ${mine ? styles.bubbleMe : styles.bubbleThem}`}>{m.content}</div>
              </div>
              {mine && <button className={styles.msgDel} title="Delete" onClick={() => del(m.id)}>🗑</button>}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form className={styles.sendForm} onSubmit={send}>
        <input type="text" placeholder="Message the group…" value={text} onChange={e => setText(e.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}

// ── New chat: search friends / send requests ──────────────────────
function NewChatPanel({ token, requests, onRequestsChanged, onOpenDm, onBack }) {
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [sent, setSent]     = useState({})
  const debounce = useRef(null)

  useEffect(() => {
    clearTimeout(debounce.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    debounce.current = setTimeout(async () => {
      const res = await apiCall('GET', `/users/search?q=${encodeURIComponent(q)}`, null, token)
      setResults(res.results || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(debounce.current)
  }, [query, token])

  async function addFriend(userId, username) {
    setSent(s => ({ ...s, [userId]: true }))
    await apiCall('POST', '/friends/request', { username }, token)
  }

  async function respond(id, action) {
    await apiCall('POST', `/friends/${id}/${action}`, {}, token)
    onRequestsChanged()
  }

  return (
    <div className={styles.thread}>
      <button className={styles.backBtn} onClick={onBack}>← Chats</button>
      <h3>New message</h3>

      {requests.length > 0 && (
        <div className={styles.section}>
          <h4>Friend Requests</h4>
          {requests.map(r => (
            <div key={r.id} className={styles.row}>
              <span>{r.from.username}</span>
              <div className={styles.rowActions}>
                <button onClick={() => respond(r.id, 'accept')}>Accept</button>
                <button className={styles.ghost} onClick={() => respond(r.id, 'decline')}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.addForm}>
        <input type="text" placeholder="Search people by name…" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
      </div>

      {query.trim().length >= 2 && (
        <div className={styles.searchResults}>
          {searching && <div className={styles.spinnerSm}>Searching…</div>}
          {!searching && results.length === 0 && <div className={styles.empty}>No one found matching “{query.trim()}”.</div>}
          {results.map(r => (
            <div key={r.id} className={styles.searchRow}>
              <span>{r.username}</span>
              {r.status === 'accepted' ? (
                <button onClick={() => onOpenDm({ id: r.id, name: r.username })}>Message</button>
              ) : r.status === 'pending' ? (
                <span className={styles.statusTag}>Pending</span>
              ) : sent[r.id] ? (
                <span className={styles.statusTag}>Requested</span>
              ) : (
                <button onClick={() => addFriend(r.id, r.username)}>Add friend</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── New group: name + pick friends ─────────────────────────────────
function NewGroupPanel({ token, onCreated, onBack }) {
  const [name, setName]   = useState('')
  const [friends, setFriends] = useState([])
  const [picked, setPicked]   = useState({})
  const [creating, setCreating] = useState(false)

  useEffect(() => { apiCall('GET', '/friends', null, token).then(r => setFriends(r.friends || [])) }, [token])

  function toggle(id) { setPicked(p => ({ ...p, [id]: !p[id] })) }

  async function create(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    const res = await apiCall('POST', '/groups', { name: name.trim() }, token)
    if (res.error) { setCreating(false); return }
    const memberIds = Object.keys(picked).filter(id => picked[id])
    await Promise.all(memberIds.map(id => {
      const f = friends.find(fr => fr.id === id)
      return f ? apiCall('POST', `/groups/${res.id}/members`, { username: f.username }, token) : null
    }))
    setCreating(false)
    onCreated({ id: res.id, name: res.name })
  }

  return (
    <div className={styles.thread}>
      <button className={styles.backBtn} onClick={onBack}>← Chats</button>
      <h3>New group</h3>
      <form className={styles.section} onSubmit={create}>
        <input type="text" placeholder="Group name" value={name} onChange={e => setName(e.target.value)}
          className={styles.groupNameInput} required />
        <h4 style={{ marginTop: 10 }}>Add friends</h4>
        {friends.length === 0 && <div className={styles.empty}>Add some friends first to include them.</div>}
        {friends.map(f => (
          <label key={f.id} className={styles.pickRow}>
            <input type="checkbox" checked={!!picked[f.id]} onChange={() => toggle(f.id)} />
            <span>{f.username}</span>
          </label>
        ))}
        <button type="submit" className={styles.postBtn} disabled={creating} style={{ marginTop: 10 }}>
          {creating ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  )
}

// ── Unified conversation list (WhatsApp-style) ──────────────────────
export default function Connections({ token, socket, username }) {
  const [conversations, setConversations] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [active, setActive]     = useState(null) // null | 'newChat' | 'newGroup' | {type,id,name}

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      apiCall('GET', '/conversations', null, token),
      apiCall('GET', '/friends/requests', null, token),
    ])
    setConversations(c.conversations || [])
    setRequests(r.requests || [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const offs = ['new_message', 'message_deleted', 'new_group_message', 'group_message_deleted', 'friend_request', 'friend_accepted', 'group_invite']
      .map(evt => socket.on(evt, load))
    return () => offs.forEach(off => off())
  }, [socket, load])

  if (active === 'newChat') {
    return <NewChatPanel token={token} requests={requests}
      onRequestsChanged={load}
      onOpenDm={(other) => setActive({ type: 'dm', ...other })}
      onBack={() => { setActive(null); load() }} />
  }
  if (active === 'newGroup') {
    return <NewGroupPanel token={token} onCreated={(g) => { setActive({ type: 'group', ...g }); load() }} onBack={() => setActive(null)} />
  }
  if (active?.type === 'dm') {
    return <DmThread token={token} other={active} socket={socket} onBack={() => { setActive(null); load() }} />
  }
  if (active?.type === 'group') {
    return <GroupThread token={token} group={active} socket={socket} username={username} onBack={() => { setActive(null); load() }} />
  }

  if (loading) return <div className={styles.loading}>Loading chats…</div>

  const pendingCount = requests.length

  return (
    <div className={styles.panel}>
      <div className={styles.chatsHead}>
        <h3 style={{ margin: 0 }}>Chats</h3>
        <div className={styles.chatsHeadActions}>
          <button className={styles.iconBtn} title="New group" onClick={() => setActive('newGroup')}>👥+</button>
          <button className={styles.iconBtn} title="New message" onClick={() => setActive('newChat')}>✎</button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className={styles.requestBanner} onClick={() => setActive('newChat')}>
          {pendingCount} friend request{pendingCount > 1 ? 's' : ''} — tap to review
        </div>
      )}

      {conversations.length === 0 ? (
        <div className={styles.empty}>No chats yet. Tap ✎ to message a friend or 👥+ to start a group.</div>
      ) : (
        <div className={styles.convoList}>
          {conversations.map(c => (
            <div key={`${c.type}-${c.id}`} className={styles.convoRow}
              onClick={() => setActive({ type: c.type, id: c.id, name: c.name })}>
              <Avatar name={c.name} isGroup={c.type === 'group'} />
              <div className={styles.convoBody}>
                <div className={styles.convoTop}>
                  <span className={styles.convoName}>{c.name}</span>
                  <span className={styles.convoTime}>{timeAgo(c.lastAt)}</span>
                </div>
                <div className={styles.convoBottom}>
                  <span className={styles.convoPreview}>{c.lastMessage?.slice(0, 40)}</span>
                  {c.unread > 0 && <span className={styles.unreadDot}>{c.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
