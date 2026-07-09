import { useState, useEffect } from 'react'
import { apiCall } from '../../api'
import styles from './Dashboard.module.css'

const TODAY = () => new Date().toISOString().split('T')[0]

function Ring({ value, max, label, unit, color, size = 116 }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={styles.ring}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface3)" strokeWidth="9" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="9"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className={styles.ringInner}>
        <div className={styles.ringVal}>{value.toLocaleString()}</div>
        <div className={styles.ringUnit}>{unit}</div>
      </div>
      <div className={styles.ringLabel}>{label}</div>
    </div>
  )
}

export default function Dashboard({ token, username, userStats, onNavigate }) {
  const [activity, setActivity] = useState(null)
  const [diet, setDiet]         = useState(null)
  const [proteinToday, setProteinToday] = useState(0)

  useEffect(() => {
    if (!token) return
    apiCall('GET', '/activity-log', null, token).then(r => {
      const t = (r.logs || []).find(l => l.date === TODAY()) || (r.logs || [])[0] || null
      setActivity(t)
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
        <div className={styles.date}>{new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
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
    </div>
  )
}
