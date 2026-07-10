import { useState, useEffect, useCallback, useRef } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

export default function Friends({ token, socket }) {
  const [friends, setFriends]   = useState([])
  const [requests, setRequests] = useState([])
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [sent, setSent]         = useState({}) // userId -> true once a request is sent
  const [loading, setLoading]   = useState(true)
  const debounce = useRef(null)

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

  // Live, case-insensitive, partial-match search as you type.
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
    load()
  }

  async function remove(friendshipId) {
    await apiCall('DELETE', `/friends/${friendshipId}`, null, token)
    load()
  }

  function labelFor(r) {
    if (r.status === 'accepted') return 'Friends'
    if (r.status === 'pending')  return 'Pending'
    if (sent[r.id])              return 'Requested'
    return null
  }

  if (loading) return <div className={styles.loading}>Loading friends…</div>

  return (
    <div className={styles.panel}>
      <div className={styles.addForm}>
        <input type="text" placeholder="Search people by name…" value={query}
          onChange={e => setQuery(e.target.value)} />
      </div>

      {query.trim().length >= 2 && (
        <div className={styles.searchResults}>
          {searching && <div className={styles.spinnerSm}>Searching…</div>}
          {!searching && results.length === 0 && <div className={styles.empty}>No one found matching “{query.trim()}”.</div>}
          {results.map(r => {
            const lbl = labelFor(r)
            return (
              <div key={r.id} className={styles.searchRow}>
                <span>{r.username}</span>
                {lbl ? <span className={styles.statusTag}>{lbl}</span>
                     : <button onClick={() => addFriend(r.id, r.username)}>Add</button>}
              </div>
            )
          })}
        </div>
      )}

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
