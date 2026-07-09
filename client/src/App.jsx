import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { useSocket } from './hooks/useSocket'
import AuthModal from './components/Auth/AuthModal'
import Header from './components/Header/Header'
import Dashboard from './components/Dashboard/Dashboard'
import ActivityHub from './components/Hubs/ActivityHub'
import NutritionHub from './components/Hubs/NutritionHub'
import Social from './components/Social/Social'

const LS_STATS = 'nm_userstats'

export default function App() {
  const { token, username, login, logout, isLoggedIn } = useAuth()
  const [tab, setTab]       = useState('home')
  const [authOpen, setAuthOpen] = useState(false)
  const [theme, setTheme]   = useState(() => localStorage.getItem('nm_theme') || 'dark')
  const [hasNotif, setHasNotif] = useState(false)
  const socket = useSocket(token)

  // ── Notification badge on the Social tab for live social events ────
  useEffect(() => {
    const events = ['friend_request', 'friend_accepted', 'new_message', 'new_like', 'new_comment', 'new_post']
    const offs = events.map(evt => socket.on(evt, () => setHasNotif(true)))
    return () => offs.forEach(off => off())
  }, [socket])

  function handleTabChange(t) {
    setTab(t)
    if (t === 'social') setHasNotif(false)
  }

  // ── Persisted user stats ──────────────────────────────────────
  const [userStats, setUserStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_STATS)) || null }
    catch { return null }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nm_theme', theme)
  }, [theme])

  // ── Restore stats from backend when user logs in ──────────────
  useEffect(() => {
    if (!token) return
    // Already have stats in memory — no need to fetch
    if (userStats) return
    fetch('/api/bmi-log', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => {
        if (d.logs && d.logs.length > 0) {
          const last = d.logs[0]   // sorted desc, most recent first
          const restored = {
            weightKg: last.weight_kg,
            heightCm: last.height_cm,
            bmi:      last.bmi,
            category: last.category,
            age:      last.age   || null,
            gender:   last.gender|| 'm',
          }
          setUserStats(restored)
          localStorage.setItem(LS_STATS, JSON.stringify(restored))
        }
      })
      .catch(() => {})
  }, [token])

  // ── Clear local stats on logout ───────────────────────────────
  function handleLogout() {
    logout()
    // Keep stats in localStorage so they still work without login,
    // but clear them if user explicitly wants a fresh session.
    // Design choice: keep — guest can still see their last data.
  }

  // ── Called by BMICalculator when a result is computed ─────────
  function handleBMIResult(stats) {
    setUserStats(stats)
    localStorage.setItem(LS_STATS, JSON.stringify(stats))
  }

  return (
    <>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onLogin={login} />
      <div className="container">
        <Header
          tab={tab} onTabChange={handleTabChange}
          username={username} isLoggedIn={isLoggedIn}
          onLoginClick={() => setAuthOpen(true)} onLogout={handleLogout}
          theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          hasNotif={hasNotif}
        />

        {tab === 'home'      && <Dashboard    token={token} username={username} userStats={userStats} onNavigate={handleTabChange} />}
        {tab === 'activity'  && <ActivityHub  token={token} userStats={userStats} />}
        {tab === 'nutrition' && <NutritionHub token={token} userStats={userStats} onBMIResult={handleBMIResult} />}
        {tab === 'social'    && <Social       token={token} />}
      </div>
    </>
  )
}
