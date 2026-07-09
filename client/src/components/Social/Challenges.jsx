import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

const TODAY = () => new Date().toISOString().split('T')[0]
function plusDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }

const MEDALS = ['🥇', '🥈', '🥉']

function ChallengeDetail({ token, challenge, onBack }) {
  const [data, setData]     = useState(null)
  const [username, setUsername] = useState('')
  const [msg, setMsg]       = useState('')

  const load = useCallback(async () => {
    const res = await apiCall('GET', `/challenges/${challenge.id}`, null, token)
    setData(res)
  }, [token, challenge.id])

  useEffect(() => { load() }, [load])

  async function invite(e) {
    e.preventDefault()
    setMsg('')
    const res = await apiCall('POST', `/challenges/${challenge.id}/invite`, { username: username.trim() }, token)
    setMsg(res.error || res.message)
    if (!res.error) { setUsername(''); load() }
  }

  if (!data) return <div className={styles.loading}>Loading challenge…</div>

  return (
    <div className={styles.panel}>
      <button className={styles.backBtn} onClick={onBack}>← Challenges</button>
      <div className={styles.chalHead}>
        <h3>{data.challenge.name}</h3>
        <span className={`${styles.chalStatus} ${styles['status_' + data.challenge.status]}`}>{data.challenge.status}</span>
      </div>
      <div className={styles.chalDates}>{data.challenge.start_date} → {data.challenge.end_date} · steps</div>

      <div className={styles.leaderboard}>
        {data.leaderboard.map(row => (
          <div key={row.id} className={`${styles.lbRow} ${row.isMe ? styles.lbMe : ''}`}>
            <span className={styles.lbRank}>{MEDALS[row.rank - 1] || `#${row.rank}`}</span>
            <span className={styles.lbName}>{row.username}{row.isMe ? ' (you)' : ''}</span>
            <span className={styles.lbSteps}>{row.steps.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <form className={styles.addForm} onSubmit={invite}>
        <input type="text" placeholder="Invite a friend by username" value={username}
          onChange={e => setUsername(e.target.value)} required />
        <button type="submit">Invite</button>
      </form>
      {msg && <div className={styles.msg}>{msg}</div>}
    </div>
  )
}

function CreateChallenge({ token, onCreated, onCancel }) {
  const [name, setName]   = useState('')
  const [start, setStart] = useState(TODAY())
  const [end, setEnd]     = useState(plusDays(7))
  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState('')

  useEffect(() => { apiCall('GET', '/groups', null, token).then(r => setGroups(r.groups || [])) }, [token])

  async function submit(e) {
    e.preventDefault()
    const res = await apiCall('POST', '/challenges', { name: name.trim(), startDate: start, endDate: end, groupId: groupId || undefined }, token)
    if (!res.error) onCreated()
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <input type="text" placeholder="Challenge name (e.g. 7-Day Step Sprint)" value={name}
        onChange={e => setName(e.target.value)} required />
      <div className={styles.dateRow}>
        <label>Start <input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>End <input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      {groups.length > 0 && (
        <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">Invite friends manually</option>
          {groups.map(g => <option key={g.id} value={g.id}>Whole group: {g.name}</option>)}
        </select>
      )}
      <div className={styles.rowActions}>
        <button type="submit" className={styles.postBtn}>Create</button>
        <button type="button" className={styles.ghost} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default function Challenges({ token, socket }) {
  const [challenges, setChallenges] = useState([])
  const [active, setActive]   = useState(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await apiCall('GET', '/challenges', null, token)
    setChallenges(res.challenges || [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const off = socket.on('challenge_invite', load)
    return () => off()
  }, [socket, load])

  if (active) return <ChallengeDetail token={token} challenge={active} onBack={() => { setActive(null); load() }} />

  return (
    <div className={styles.panel}>
      {creating ? (
        <CreateChallenge token={token} onCreated={() => { setCreating(false); load() }} onCancel={() => setCreating(false)} />
      ) : (
        <button className={styles.postBtn} style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>+ New Challenge</button>
      )}

      {loading ? <div className={styles.loading}>Loading challenges…</div> :
        challenges.length === 0 ? <div className={styles.empty}>No challenges yet — start one and invite friends!</div> :
        <div className={styles.section}>
          {challenges.map(c => (
            <div key={c.id} className={styles.row} style={{ cursor: 'pointer' }} onClick={() => setActive(c)}>
              <span>🏆 {c.name}</span>
              <span className={`${styles.chalStatus} ${styles['status_' + c.status]}`}>{c.status}</span>
            </div>
          ))}
        </div>
      }
    </div>
  )
}
