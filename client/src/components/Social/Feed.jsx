import { useState, useEffect, useCallback } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

function Composer({ token, onPosted }) {
  const [mode, setMode]       = useState('thought') // 'thought' | 'activity'
  const [content, setContent] = useState('')
  const [recentLogs, setRecentLogs] = useState([])
  const [selectedLog, setSelectedLog] = useState('')
  const [groups, setGroups]   = useState([])
  const [groupId, setGroupId] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    apiCall('GET', '/activity-log', null, token).then(r => setRecentLogs(r.logs || []))
    apiCall('GET', '/groups', null, token).then(r => setGroups(r.groups || []))
  }, [token])

  async function submit(e) {
    e.preventDefault()
    setPosting(true)
    const body = mode === 'thought'
      ? { kind: 'thought', content: content.trim(), groupId: groupId || undefined }
      : { kind: 'activity', activityLogId: selectedLog, groupId: groupId || undefined }
    const res = await apiCall('POST', '/posts', body, token)
    setPosting(false)
    if (!res.error) {
      setContent(''); setSelectedLog(''); setGroupId('')
      onPosted()
    }
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <div className={styles.composerModes}>
        <button type="button" className={mode === 'thought' ? styles.active : ''} onClick={() => setMode('thought')}>💭 Thought</button>
        <button type="button" className={mode === 'activity' ? styles.active : ''} onClick={() => setMode('activity')}>🚶 Share Activity</button>
      </div>

      {mode === 'thought' ? (
        <textarea placeholder="Share what's on your mind…" value={content}
          onChange={e => setContent(e.target.value)} required rows={2} />
      ) : (
        <select value={selectedLog} onChange={e => setSelectedLog(e.target.value)} required>
          <option value="">Pick a day to share…</option>
          {recentLogs.map(l => (
            <option key={l.id} value={l.id}>{l.date} — {l.steps} steps</option>
          ))}
        </select>
      )}

      {groups.length > 0 && (
        <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">Share with all friends</option>
          {groups.map(g => <option key={g.id} value={g.id}>Share to: {g.name}</option>)}
        </select>
      )}

      <button type="submit" className={styles.postBtn} disabled={posting}>{posting ? 'Posting…' : 'Post'}</button>
    </form>
  )
}

function Post({ token, post, onChanged }) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')

  async function toggleLike() {
    if (post.liked_by_me) await apiCall('DELETE', `/posts/${post.id}/like`, null, token)
    else await apiCall('POST', `/posts/${post.id}/like`, {}, token)
    onChanged()
  }

  async function openComments() {
    setShowComments(s => !s)
    if (!showComments) {
      const res = await apiCall('GET', `/posts/${post.id}/comments`, null, token)
      setComments(res.comments || [])
    }
  }

  async function submitComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    await apiCall('POST', `/posts/${post.id}/comments`, { content: newComment.trim() }, token)
    setNewComment('')
    const res = await apiCall('GET', `/posts/${post.id}/comments`, null, token)
    setComments(res.comments || [])
    onChanged()
  }

  return (
    <div className={styles.postCard}>
      <div className={styles.postAuthor}>{post.author}</div>
      {post.kind === 'activity' ? (
        <div className={styles.postActivity}>
          🚶 <strong>{post.steps?.toLocaleString()}</strong> steps · {post.distance_km} km · {Math.round(post.calories_burned || 0)} kcal
        </div>
      ) : (
        <div className={styles.postContent}>{post.content}</div>
      )}
      <div className={styles.postActions}>
        <button className={post.liked_by_me ? styles.liked : ''} onClick={toggleLike}>
          ❤ {post.like_count}
        </button>
        <button onClick={openComments}>💬 {post.comment_count}</button>
      </div>
      {showComments && (
        <div className={styles.commentBox}>
          {comments.map(c => (
            <div key={c.id} className={styles.comment}><strong>{c.author}:</strong> {c.content}</div>
          ))}
          <form onSubmit={submitComment} className={styles.commentForm}>
            <input type="text" placeholder="Add a comment…" value={newComment}
              onChange={e => setNewComment(e.target.value)} />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function Feed({ token, socket }) {
  const [posts, setPosts]     = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await apiCall('GET', '/feed', null, token)
    setPosts(res.posts || [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const offs = ['new_post', 'new_like', 'new_comment'].map(evt => socket.on(evt, load))
    return () => offs.forEach(off => off())
  }, [socket, load])

  return (
    <div className={styles.panel}>
      <Composer token={token} onPosted={load} />
      {loading ? (
        <div className={styles.loading}>Loading feed…</div>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>No posts yet — share something, or add friends to see theirs.</div>
      ) : (
        posts.map(p => <Post key={p.id} token={token} post={p} onChanged={load} />)
      )}
    </div>
  )
}
