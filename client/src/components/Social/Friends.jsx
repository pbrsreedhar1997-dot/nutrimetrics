import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

export default function Friends({ token, socket }) {
  const [friends, setFriends]   = useState([])
  const [requests, setRequests] = useState([])
  const [username, setUsername] = useState('')
  const [msg, setMsg]           = useState('')
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    const [f, r] = await Promise.all([
      apiCall('GET', '/friends', null, token),
      apiCall('GET', '/friends/requests', null, token),
    ])
    setFriends(f.friends || [])
    setRequests(r.requests || [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const offReq = socket.on('friend_request', load)
    const offAcc = socket.on('friend_accepted', load)
    return () => { offReq(); offAcc() }
  }, [socket, load])

  async function sendRequest(e) {
    e.preventDefault()
    setMsg('')
    const res = await apiCall('POST', '/friends/request', { username: username.trim() }, token)
    setMsg(res.error || res.message)
    if (!res.error) setUsername('')
  }

  async function respond(id, action) {
    await apiCall('POST', `/friends/${id}/${action}`, {}, token)
    load()
  }

  async function remove(friendshipId) {
    await apiCall('DELETE', `/friends/${friendshipId}`, null, token)
    load()
  }

  if (loading) return <div className={styles.loading}>Loading friends…</div>

  return (
    <div className={styles.panel}>
      <form className={styles.addForm} onSubmit={sendRequest}>
        <input
          type="text" placeholder="Add a friend by username"
          value={username} onChange={e => setUsername(e.target.value)} required
        />
        <button type="submit">Send Request</button>
      </form>
      {msg && <div className={styles.msg}>{msg}</div>}

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

      <div className={styles.section}>
        <h4>Friends ({friends.length})</h4>
        {friends.length === 0 && <div className={styles.empty}>No friends yet — add one above.</div>}
        {friends.map(f => (
          <div key={f.friendshipId} className={styles.row}>
            <span>{f.username}</span>
            <button className={styles.ghost} onClick={() => remove(f.friendshipId)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}
