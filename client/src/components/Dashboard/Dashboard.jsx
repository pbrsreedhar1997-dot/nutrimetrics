import { useState, useEffect } from 'react'
import { apiCall } from '../../api'
import styles from './Dashboard.module.css'

const TODAY = () => new Date().toISOString().split('T')[0]

function Ring({ value, max, label, unit, color, size = 116 }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  const full = pct >= 1
  // Animate the ring filling in on mount (Apple-style earned progress).
  const [draw, setDraw] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setDraw(pct), 120)
    return () => clearTimeout(t)
  }, [pct])
  return (
    <div className={`${styles.ring} ${full ? styles.ringFull : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface3)" strokeWidth="9" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - draw)}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)', filter: full ? `drop-shadow(0 0 6px ${color})` : 'none' }} />
      </svg>
      <div className={styles.ringInner}>
        <div className={styles.ringVal}>{value.toLocaleString()}</div>
        <div className={styles.ringUnit}>{full ? '✓ done' : unit}</div>
      </div>
      <div className={styles.ringLabel}>{label}</div>
    </div>
  )
}

function GetApp() {
  const [showIos, setShowIos] = useState(false)
  return (
    <div className={styles.getApp}>
      <div className={styles.getAppHead}>
        <span className={styles.getAppIcon}>📲</span>
        <div>
          <div className={styles.appTitle}>Get the app</div>
          <div className={styles.appSub}>Install NutriMetrics on your phone</div>
        </div>
      </div>
      <div className={styles.getAppRow}>
        <a className={styles.storeBtn} href="/downloads/NutriMetrics.apk" download>
          <span>🤖</span> Android<small>Download APK</small>
        </a>
        <button className={styles.storeBtn} type="button" onClick={() => setShowIos(s => !s)}>
          <span></span> iPhone<small>Add to Home Screen</small>
        </button>
      </div>
      {showIos && (
        <div className={styles.iosSteps}>
          <b>Install on iPhone (no App Store needed):</b>
          <ol>
            <li>Open this site in <b>Safari</b></li>
            <li>Tap the <b>Share</b> button <span aria-hidden="true">⬆️</span> at the bottom</li>
            <li>Scroll down and tap <b>“Add to Home Screen”</b></li>
            <li>Tap <b>Add</b> — NutriMetrics appears as an app icon</li>
          </ol>
          <div className={styles.iosNote}>Apple only allows iPhone apps via this method or the App Store — a direct download isn’t possible.</div>
        </div>
      )}
    </div>
  )
}

// Consecutive days (ending today or yesterday) with any recorded steps.
function computeStreak(logs) {
  const byDate = new Set((logs || []).filter(l => (l.steps || 0) > 0).map(l => l.date))
  let streak = 0
  const d = new Date()
  // allow the streak to still count if today isn't logged yet
  if (!byDate.has(d.toISOString().split('T')[0])) d.setDate(d.getDate() - 1)
  while (byDate.has(d.toISOString().split('T')[0])) { streak++; d.setDate(d.getDate() - 1) }
  return streak
}

export default function Dashboard({ token, username, userStats, onNavigate }) {
  const [activity, setActivity] = useState(null)
  const [streak, setStreak]     = useState(0)
  const [diet, setDiet]         = useState(null)
  const [proteinToday, setProteinToday] = useState(0)

  useEffect(() => {
    if (!token) return
    apiCall('GET', '/activity-log', null, token).then(r => {
      const t = (r.logs || []).find(l => l.date === TODAY()) || (r.logs || [])[0] || null
      setActivity(t)
      setStreak(computeStreak(r.logs))
    })
    apiCall('GET', '/diet-log', null, token).then(r => setDiet(r))
    apiCall('GET', '/protein-log', null, token).then(r => {
      const total = (r.logs || []).reduce((a, l) => a + (l.protein || 0), 0)
      setProteinToday(Math.round(total))
    })
  }, [token])

  const steps    = activity?.steps || 0
  const stepGoal = activity?.step_goal || 10000
  const active   = activity?.active_minutes || 0
  const caloriesEaten = (diet?.logs || []).reduce((a, l) => a + (l.calories || 0), 0)
  const calGoal  = diet?.goals?.calories || 2000
  const proteinGoal = diet?.goals?.protein || 120
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (!token) {
    return (
      <div className={styles.wrap}>
        <div className={styles.hero}>
          <h1>Welcome to NutriMetrics</h1>
          <p>Sign in to track your steps, workouts, nutrition, and compete with friends.</p>
        </div>
        <GetApp />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <div className={styles.greeting}>{greeting},</div>
          <div className={styles.name}>{username} 👋</div>
        </div>
        {streak > 0
          ? <div className={styles.streak} title={`${streak}-day activity streak`}>🔥 {streak} day{streak > 1 ? 's' : ''}</div>
          : <div className={styles.date}>{new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</div>}
      </div>

      <div className={styles.rings}>
        <Ring value={steps}          max={stepGoal}    label="Steps"    unit="steps"   color="#00e5c0" />
        <Ring value={Math.round(caloriesEaten)} max={calGoal} label="Calories" unit="eaten" color="#ff9f43" />
        <Ring value={proteinToday}   max={proteinGoal} label="Protein"  unit="grams"   color="#5b9cf6" />
        <Ring value={active}         max={60}          label="Active"   unit="mins"    color="#a855f7" />
      </div>

      <div className={styles.quickGrid}>
        <button className={styles.quickCard} onClick={() => onNavigate('activity')}>
          <span className={styles.quickIcon}>🚶</span>
          <span className={styles.quickLabel}>Track Steps</span>
          <span className={styles.quickSub}>{steps.toLocaleString()} / {stepGoal.toLocaleString()}</span>
        </button>
        <button className={styles.quickCard} onClick={() => onNavigate('activity')}>
          <span className={styles.quickIcon}>💪</span>
          <span className={styles.quickLabel}>Workouts</span>
          <span className={styles.quickSub}>Start a session</span>
        </button>
        <button className={styles.quickCard} onClick={() => onNavigate('nutrition')}>
          <span className={styles.quickIcon}>🥗</span>
          <span className={styles.quickLabel}>Log Food</span>
          <span className={styles.quickSub}>{Math.round(caloriesEaten)} kcal today</span>
        </button>
        <button className={styles.quickCard} onClick={() => onNavigate('social')}>
          <span className={styles.quickIcon}>🏆</span>
          <span className={styles.quickLabel}>Challenges</span>
          <span className={styles.quickSub}>Compete with friends</span>
        </button>
      </div>

      {userStats?.bmi && (
        <div className={styles.bmiStrip} onClick={() => onNavigate('nutrition')}>
          <span>BMI</span>
          <strong>{userStats.bmi}</strong>
          <span className={styles.bmiCat}>{userStats.category}</span>
        </div>
      )}

      <GetApp />
    </div>
  )
}
