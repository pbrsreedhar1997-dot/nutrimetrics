import { useState, useEffect, useCallback, useRef } from 'react'
import { apiCall } from '../../api'
import styles from './Social.module.css'

const MAX_MEDIA_MB = 50

function MediaPicker({ token, media, setMedia, uploading, setUploading }) {
  const inputRef = useRef(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) { alert(`File too large — max ${MAX_MEDIA_MB}MB`); return }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setMedia({ url: res.url, type: res.type })
    } catch (err) {
      alert(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={styles.mediaPicker}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        hidden onChange={onFile} />
      {!media ? (
        <button type="button" className={styles.mediaAddBtn} disabled={uploading} onClick={() => inputRef.current.click()}>
          {uploading ? 'Uploading…' : '📎 Add photo / gif / video'}
        </button>
      ) : (
        <div className={styles.mediaPreview}>
          {media.type === 'video'
            ? <video src={media.url} muted controls />
            : <img src={media.url} alt="" />}
          <button type="button" className={styles.mediaRemove} onClick={() => setMedia(null)}>✕ Remove</button>
        </div>
      )}
    </div>
  )
}

function Composer({ token, onPosted }) {
  const [mode, setMode]       = useState('thought') // 'thought' | 'activity'
  const [content, setContent] = useState('')
  const [recentLogs, setRecentLogs] = useState([])
  const [selectedLog, setSelectedLog] = useState('')
  const [groups, setGroups]   = useState([])
  const [groupId, setGroupId] = useState('')
  const [posting, setPosting] = useState(false)
  const [media, setMedia]     = useState(null) // { url, type }
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    apiCall('GET', '/activity-log', null, token).then(r => setRecentLogs(r.logs || []))
    apiCall('GET', '/groups', null, token).then(r => setGroups(r.groups || []))
  }, [token])

  async function submit(e) {
    e.preventDefault()
    setPosting(true)
    const body = mode === 'thought'
      ? { kind: 'thought', content: content.trim(), groupId: groupId || undefined, mediaUrl: media?.url, mediaType: media?.type }
      : { kind: 'activity', activityLogId: selectedLog, groupId: groupId || undefined, mediaUrl: media?.url, mediaType: media?.type }
    const res = await apiCall('POST', '/posts', body, token)
    setPosting(false)
    if (!res.error) {
      setContent(''); setSelectedLog(''); setGroupId(''); setMedia(null)
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
          onChange={e => setContent(e.target.value)} required={!media} rows={2} />
      ) : (
        <select value={selectedLog} onChange={e => setSelectedLog(e.target.value)} required>
          <option value="">Pick a day to share…</option>
          {recentLogs.map(l => (
            <option key={l.id} value={l.id}>{l.date} — {l.steps} steps</option>
          ))}
        </select>
      )}

      <MediaPicker token={token} media={media} setMedia={setMedia} uploading={uploading} setUploading={setUploading} />

      {groups.length > 0 && (
        <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">Share with all friends</option>
          {groups.map(g => <option key={g.id} value={g.id}>Share to: {g.name}</option>)}
        </select>
      )}

      <button type="submit" className={styles.postBtn} disabled={posting || uploading}>{posting ? 'Posting…' : 'Post'}</button>
    </form>
  )
}

function Post({ token, post, onChanged }) {
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  // Optimistic like state — fills instantly, reconciles with the server after.
  const [liked, setLiked]     = useState(!!post.liked_by_me)
  const [likeCount, setLikeCount] = useState(post.like_count || 0)
  const [burst, setBurst]     = useState(false)

  async function setLike(next) {
    if (next === liked) return
    setLiked(next)
    setLikeCount(c => c + (next ? 1 : -1))
    if (navigator.vibrate) navigator.vibrate(10)
    try {
      await apiCall(next ? 'POST' : 'DELETE', `/posts/${post.id}/like`, next ? {} : null, token)
    } catch {
      setLiked(!next); setLikeCount(c => c + (next ? -1 : 1)) // revert on failure
    }
  }

  function toggleLike() { setLike(!liked) }

  // Instagram-style double-tap to like: only ever likes (never unlikes) + heart burst.
  function onDoubleTap() {
    setBurst(true)
    setTimeout(() => setBurst(false), 900)
    setLike(true)
  }

  async function deletePost() {
    if (!window.confirm('Delete this post?')) return
    await apiCall('DELETE', `/posts/${post.id}`, null, token)
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
      <div className={styles.postTop}>
        <div className={styles.postAuthor}>{post.author}</div>
        {post.is_mine && <button className={styles.delBtn} title="Delete post" onClick={deletePost}>🗑</button>}
      </div>
      <div className={styles.postBody} onDoubleClick={onDoubleTap}>
        {post.kind === 'activity' ? (
          <div className={styles.postActivity}>
            🚶 <strong>{post.steps?.toLocaleString()}</strong> steps · {post.distance_km} km · {Math.round(post.calories_burned || 0)} kcal
          </div>
        ) : (
          post.content && <div className={styles.postContent}>{post.content}</div>
        )}
        {post.media_url && (
          <div className={styles.postMedia}>
            {post.media_type === 'video'
              ? <video src={post.media_url} controls playsInline />
              : <img src={post.media_url} alt="" loading="lazy" />}
          </div>
        )}
        {burst && <span className={styles.heartBurst}>❤</span>}
      </div>
      <div className={styles.postActions}>
        <button className={liked ? styles.liked : ''} onClick={toggleLike}>
          <span className={liked ? styles.heartPop : ''}>{liked ? '❤' : '🤍'}</span> {likeCount}
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
