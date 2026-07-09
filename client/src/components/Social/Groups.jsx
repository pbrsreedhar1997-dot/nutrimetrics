import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

function GroupDetail({ token, group, socket, onBack }) {
  const [detail, setDetail]   = useState(null)
  const [username, setUsername] = useState('')
  const [msg, setMsg]         = useState('')

  const load = useCallback(async () => {
    const res = await apiCall('GET', `/groups/${group.id}`, null, token)
    setDetail(res)
  }, [token, group.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const offs = ['new_post', 'new_like', 'new_comment'].map(evt => socket.on(evt, load))
    return () => offs.forEach(off => off())
  }, [socket, load])

  async function addMember(e) {
    e.preventDefault()
    setMsg('')
    const res = await apiCall('POST', `/groups/${group.id}/members`, { username: username.trim() }, token)
    setMsg(res.error || res.message)
    if (!res.error) { setUsername(''); load() }
  }

  if (!detail) return <div className={styles.loading}>Loading group…</div>

  return (
    <div className={styles.panel}>
      <button className={styles.backBtn} onClick={onBack}>← Groups</button>
      <h3>{detail.group?.name}</h3>

      <div className={styles.section}>
        <h4>Members ({detail.members.length})</h4>
        {detail.members.map(m => (
          <div key={m.id} className={styles.row}>
            <span>{m.username}{m.role === 'owner' ? ' (owner)' : ''}</span>
          </div>
        ))}
        <form className={styles.addForm} onSubmit={addMember}>
          <input type="text" placeholder="Add a friend by username"
            value={username} onChange={e => setUsername(e.target.value)} required />
          <button type="submit">Add</button>
        </form>
        {msg && <div className={styles.msg}>{msg}</div>}
      </div>

      <div className={styles.section}>
        <h4>Group Posts</h4>
        {detail.posts.length === 0 && <div className={styles.empty}>No posts shared here yet.</div>}
        {detail.posts.map(p => (
          <div key={p.id} className={styles.postCard}>
            <div className={styles.postAuthor}>{p.author}</div>
            {p.kind === 'activity' ? (
              <div className={styles.postActivity}>
                🚶 {p.steps?.toLocaleString()} steps · {p.distance_km} km · {Math.round(p.calories_burned)} kcal
              </div>
            ) : <div className={styles.postContent}>{p.content}</div>}
            <div className={styles.postMeta}>❤ {p.like_count} · 💬 {p.comment_count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Groups({ token, socket }) {
  const [groups, setGroups]   = useState([])
  const [name, setName]       = useState('')
  const [active, setActive]   = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await apiCall('GET', '/groups', null, token)
    setGroups(res.groups || [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  async function createGroup(e) {
    e.preventDefault()
    const res = await apiCall('POST', '/groups', { name: name.trim() }, token)
    if (!res.error) { setName(''); load() }
  }

  if (active) return <GroupDetail token={token} group={active} socket={socket} onBack={() => { setActive(null); load() }} />

  if (loading) return <div className={styles.loading}>Loading groups…</div>

  return (
    <div className={styles.panel}>
      <form className={styles.addForm} onSubmit={createGroup}>
        <input type="text" placeholder="New group name" value={name} onChange={e => setName(e.target.value)} required />
        <button type="submit">Create Group</button>
      </form>

      <div className={styles.section}>
        {groups.length === 0 && <div className={styles.empty}>No groups yet — create one above.</div>}
        {groups.map(g => (
          <div key={g.id} className={styles.row} onClick={() => setActive(g)} style={{ cursor: 'pointer' }}>
            <span>{g.name}</span>
            <span className={styles.roleTag}>{g.role}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
