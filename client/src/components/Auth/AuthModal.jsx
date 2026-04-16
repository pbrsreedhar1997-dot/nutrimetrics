import { useState } from 'react'
import { apiCall } from '../../api'
import styles from './AuthModal.module.css'

export default function AuthModal({ open, onClose, onLogin }) {
  const [tab, setTab] = useState('login')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [regForm, setRegForm] = useState({ username: '', email: '', password: '' })
  const [loginErr, setLoginErr] = useState('')
  const [regErr, setRegErr] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleLogin(e) {
    e.preventDefault()
    setLoginErr('')
    setLoading(true)
    const res = await apiCall('POST', '/auth/login', loginForm)
    setLoading(false)
    if (res.error) { setLoginErr(res.error); return }
    onLogin(res.token, res.username)
    onClose()
  }

  async function handleRegister(e) {
    e.preventDefault()
    setRegErr('')
    setLoading(true)
    const res = await apiCall('POST', '/auth/register', regForm)
    setLoading(false)
    if (res.error) { setRegErr(res.error); return }
    onLogin(res.token, res.username)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.card}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.logo}>Nutri<span>Metrics</span></div>
        <p className={styles.subtitle}>Track your health, reach your goals</p>

        <div className={styles.tabs}>
          <button className={`${styles.tabBtn} ${tab === 'login' ? styles.active : ''}`} onClick={() => setTab('login')}>Sign In</button>
          <button className={`${styles.tabBtn} ${tab === 'register' ? styles.active : ''}`} onClick={() => setTab('register')}>Create Account</button>
        </div>

        {tab === 'login' && (
          <form className={styles.form} onSubmit={handleLogin}>
            <div className={styles.field}>
              <label>Username</label>
              <input type="text" placeholder="Your username" autoComplete="username" value={loginForm.username}
                onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))} required />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <input type="password" placeholder="Your password" autoComplete="current-password" value={loginForm.password}
                onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} required />
            </div>
            {loginErr && <div className={styles.error}>{loginErr}</div>}
            <button className={styles.submitBtn} type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form className={styles.form} onSubmit={handleRegister}>
            <div className={styles.field}>
              <label>Username</label>
              <input type="text" placeholder="Choose a username" autoComplete="username" value={regForm.username}
                onChange={e => setRegForm(p => ({ ...p, username: e.target.value }))} required />
            </div>
            <div className={styles.field}>
              <label>Email</label>
              <input type="email" placeholder="Your email" autoComplete="email" value={regForm.email}
                onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))} required />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <input type="password" placeholder="At least 6 characters" autoComplete="new-password" value={regForm.password}
                onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))} required />
            </div>
            {regErr && <div className={styles.error}>{regErr}</div>}
            <button className={styles.submitBtn} type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
