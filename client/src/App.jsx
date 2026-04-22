import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthModal from './components/Auth/AuthModal'
import Header from './components/Header/Header'
import BMICalculator from './components/BMI/BMICalculator'
import DietTracker from './components/DietTracker/DietTracker'
import ActivityTracker from './components/Activity/ActivityTracker'
import WorkoutPlans from './components/Workout/WorkoutPlans'
import DietPlan from './components/DietPlan/DietPlan'
import StatsBanner from './components/StatsBanner/StatsBanner'

const LS_STATS = 'nm_userstats'

export default function App() {
  const { token, username, login, logout, isLoggedIn } = useAuth()
  const [tab, setTab]       = useState('bmi')
  const [authOpen, setAuthOpen] = useState(false)
  const [theme, setTheme]   = useState(() => localStorage.getItem('nm_theme') || 'dark')

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

  const showBanner = tab !== 'bmi' && userStats

  return (
    <>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onLogin={login} />
      <div className="container">
        <Header
          tab={tab} onTabChange={setTab}
          username={username} isLoggedIn={isLoggedIn}
          onLoginClick={() => setAuthOpen(true)} onLogout={handleLogout}
          theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        />

        {showBanner && (
          <StatsBanner userStats={userStats} onGoToBMI={() => setTab('bmi')} />
        )}

        {tab === 'bmi'      && <BMICalculator token={token} onBMIResult={handleBMIResult} savedStats={userStats} />}
        {tab === 'diet'     && <DietTracker   token={token} userStats={userStats} />}
        {tab === 'workout'  && <WorkoutPlans  userStats={userStats} />}
        {tab === 'plan'     && <DietPlan      userStats={userStats} onGoToBMI={() => setTab('bmi')} />}
        {tab === 'activity' && <ActivityTracker token={token} userStats={userStats} />}
      </div>
    </>
  )
}
