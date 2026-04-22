import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './ActivityTracker.module.css'

const API = '/api'
const TODAY = () => new Date().toISOString().split('T')[0]

// Step detection tunables
const STEP_THRESHOLD = 1.4   // m/s² peak magnitude (without gravity)
const MIN_STEP_GAP   = 280   // ms — ignore bounces faster than this
const STRIDE_M       = 0.762 // average stride length in metres

function fmtTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function pct(val, max) { return Math.min(100, max > 0 ? Math.round((val / max) * 100) : 0) }

function stepsToCalories(steps, weightKg) {
  // MET-based: ~0.04 kcal per step per 70kg body weight
  return Math.round(steps * 0.04 * ((weightKg || 70) / 70))
}

export default function ActivityTracker({ token, userStats }) {
  const weightKg = userStats?.weightKg || 70

  // Sensor state
  const [sensorAvail, setSensorAvail]   = useState(null) // null=checking, true/false
  const [permission, setPermission]     = useState('unknown') // unknown | granted | denied | unavailable
  const [isTracking, setIsTracking]     = useState(false)

  // Session state
  const [steps, setSteps]               = useState(0)
  const [elapsed, setElapsed]           = useState(0)    // seconds
  const [stepGoal, setStepGoal]         = useState(10000)
  const [editGoal, setEditGoal]         = useState(false)
  const [goalInput, setGoalInput]       = useState('10000')

  // History
  const [history, setHistory]           = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Sensor internals (refs — no re-render needed)
  const lastMag    = useRef(0)
  const lastStep   = useRef(0)
  const peakSeen   = useRef(false)
  const timerRef   = useRef(null)
  const saveRef    = useRef(null)
  const startTs    = useRef(0)
  const stepsRef   = useRef(0)   // mirror of steps for use inside callbacks

  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }

  // ── Check sensor availability ──────────────────────────────────
  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setSensorAvail(false)
      setPermission('unavailable')
    } else {
      setSensorAvail(true)
    }
  }, [])

  // ── Load history ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    setLoadingHistory(true)
    fetch(`${API}/activity-log`, { headers })
      .then(r => r.json())
      .then(d => setHistory(d.logs || []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [token])

  // ── Step detection callback ───────────────────────────────────
  const handleMotion = useCallback((e) => {
    // Prefer acceleration without gravity; fall back to with-gravity filtered
    const acc = e.acceleration
    if (!acc) return
    const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0
    const mag = Math.sqrt(x * x + y * y + z * z)

    // Rising edge
    if (mag > lastMag.current) {
      peakSeen.current = true
    }
    // Falling edge after a peak above threshold → step
    if (peakSeen.current && mag < lastMag.current && lastMag.current > STEP_THRESHOLD) {
      const now = Date.now()
      if (now - lastStep.current > MIN_STEP_GAP) {
        lastStep.current = now
        stepsRef.current += 1
        setSteps(stepsRef.current)
      }
      peakSeen.current = false
    }
    lastMag.current = mag
  }, [])

  // ── Request iOS permission ────────────────────────────────────
  async function requestPermission() {
    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission()
        setPermission(res === 'granted' ? 'granted' : 'denied')
      } catch {
        setPermission('denied')
      }
    } else {
      // Android / non-iOS — no permission needed
      setPermission('granted')
    }
  }

  // ── Start tracking ────────────────────────────────────────────
  async function startTracking() {
    if (permission === 'unknown') {
      await requestPermission()
    }
    if (permission === 'denied') return

    stepsRef.current = steps
    startTs.current  = Date.now() - elapsed * 1000
    setIsTracking(true)

    window.addEventListener('devicemotion', handleMotion, { passive: true })

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTs.current) / 1000))
    }, 1000)

    // Auto-save every 30s
    saveRef.current = setInterval(() => saveTodayLog(), 30000)
  }

  // ── Stop tracking ─────────────────────────────────────────────
  function stopTracking() {
    setIsTracking(false)
    window.removeEventListener('devicemotion', handleMotion)
    clearInterval(timerRef.current)
    clearInterval(saveRef.current)
    saveTodayLog()
  }

  // ── Reset session ─────────────────────────────────────────────
  function resetSession() {
    if (isTracking) stopTracking()
    setSteps(0); stepsRef.current = 0
    setElapsed(0)
  }

  // ── Save to backend ───────────────────────────────────────────
  async function saveTodayLog() {
    const s = stepsRef.current
    const dist = +(s * STRIDE_M / 1000).toFixed(2)
    const cal  = stepsToCalories(s, weightKg)
    const mins = Math.round(elapsed / 60)

    const payload = {
      date: TODAY(), steps: s, distanceKm: dist,
      caloriesBurned: cal, activeMinutes: mins, stepGoal
    }

    if (token) {
      fetch(`${API}/activity-log`, { method: 'POST', headers, body: JSON.stringify(payload) })
        .then(r => r.json())
        .then(() => {
          // Refresh history
          fetch(`${API}/activity-log`, { headers })
            .then(r => r.json()).then(d => setHistory(d.logs || [])).catch(() => {})
        })
        .catch(() => {})
    }
  }

  // Cleanup on unmount
  useEffect(() => () => {
    window.removeEventListener('devicemotion', handleMotion)
    clearInterval(timerRef.current)
    clearInterval(saveRef.current)
  }, [handleMotion])

  // Derived values
  const distKm   = +(steps * STRIDE_M / 1000).toFixed(2)
  const calBurned = stepsToCalories(steps, weightKg)
  const stepPct  = pct(steps, stepGoal)

  // Weekly chart — last 7 days
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    const log = history.find(l => l.date === key)
    return { label: d.toLocaleDateString('en', { weekday: 'short' }), steps: log?.steps || 0, date: key, isToday: key === TODAY() }
  })
  const maxBar = Math.max(...last7.map(d => d.steps), 1)

  return (
    <div className={styles.wrap}>

      {/* ── Step ring + controls ── */}
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.ringWrap}>
            <svg className={styles.ring} viewBox="0 0 160 160">
              <defs>
                <linearGradient id="stepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#00e5c0" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r="68" className={styles.ringBg} />
              <circle cx="80" cy="80" r="68" className={styles.ringFg}
                style={{ strokeDashoffset: Math.max(0, 427 - (427 * stepPct) / 100) }} />
            </svg>
            <div className={styles.ringInner}>
              <div className={styles.stepCount}>{steps.toLocaleString()}</div>
              <div className={styles.stepLabel}>steps</div>
              <div className={styles.stepGoalLabel}>of {stepGoal.toLocaleString()}</div>
              <div className={styles.stepPct}>{stepPct}%</div>
            </div>
          </div>

          {/* Stats grid */}
          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <div className={styles.statIcon}>🔥</div>
              <div className={styles.statVal}>{calBurned}</div>
              <div className={styles.statLbl}>Calories</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statIcon}>📍</div>
              <div className={styles.statVal}>{distKm}</div>
              <div className={styles.statLbl}>km</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statIcon}>⏱</div>
              <div className={styles.statVal}>{fmtTime(elapsed)}</div>
              <div className={styles.statLbl}>Active</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {sensorAvail === false ? (
            <div className={styles.noSensor}>
              <span>📵</span> Motion sensor not available on this device / browser.<br />
              <small>Works on mobile Chrome & Safari with HTTPS.</small>
            </div>
          ) : permission === 'denied' ? (
            <div className={styles.noSensor}>
              <span>🔒</span> Motion permission denied. Enable it in your browser settings and reload.
            </div>
          ) : (
            <>
              {!isTracking ? (
                <button className={`${styles.ctrlBtn} ${styles.start}`}
                  onClick={permission === 'unknown' ? requestPermission : startTracking}>
                  {permission === 'unknown' ? '🔓 Allow Sensor & Start' : '▶ Start Tracking'}
                </button>
              ) : (
                <button className={`${styles.ctrlBtn} ${styles.stop}`} onClick={stopTracking}>
                  ⏸ Pause & Save
                </button>
              )}
              <button className={styles.resetBtn} onClick={resetSession} disabled={isTracking}>
                ↺ Reset
              </button>
            </>
          )}
        </div>

        {/* Step goal */}
        <div className={styles.goalRow}>
          {editGoal ? (
            <>
              <label>Daily goal</label>
              <input type="number" inputMode="numeric" value={goalInput}
                onChange={e => setGoalInput(e.target.value)} />
              <button onClick={() => {
                const g = Math.max(100, +goalInput || 10000)
                setStepGoal(g); setEditGoal(false)
                if (isTracking) saveTodayLog()
              }}>Save</button>
              <button className={styles.cancelBtn} onClick={() => setEditGoal(false)}>✕</button>
            </>
          ) : (
            <>
              <span className={styles.goalText}>🎯 Goal: <strong>{stepGoal.toLocaleString()}</strong> steps</span>
              <button className={styles.editGoalBtn} onClick={() => { setGoalInput(String(stepGoal)); setEditGoal(true) }}>Edit</button>
            </>
          )}
        </div>

        {isTracking && (
          <div className={styles.livePulse}>
            <span className={styles.dot} /> Live tracking active — keep phone in pocket or hand
          </div>
        )}
      </div>

      {/* ── Activity badges ── */}
      <div className={styles.badgeRow}>
        {[
          { label: 'Steps done',   val: steps >= stepGoal,    text: '🏆 Goal reached!',   sub: `${steps.toLocaleString()} / ${stepGoal.toLocaleString()}` },
          { label: 'Calories',     val: calBurned >= 200,     text: '🔥 200+ kcal',       sub: `${calBurned} kcal burned` },
          { label: 'Distance',     val: distKm >= 1,          text: '📍 1km+',            sub: `${distKm} km walked` },
          { label: 'Active time',  val: elapsed >= 600,       text: '⏱ 10 min active',   sub: `${fmtTime(elapsed)} today` },
        ].map(b => (
          <div key={b.label} className={`${styles.badge} ${b.val ? styles.earned : ''}`}>
            <div className={styles.badgeText}>{b.val ? b.text : b.label}</div>
            <div className={styles.badgeSub}>{b.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Weekly history chart ── */}
      <div className={styles.chartCard}>
        <div className={styles.cardTitle}>Weekly Steps</div>
        {loadingHistory ? (
          <div className={styles.chartLoading}>Loading history…</div>
        ) : (
          <div className={styles.barChart}>
            {last7.map(d => (
              <div key={d.date} className={styles.barCol}>
                <div className={styles.barWrap}>
                  {d.steps > 0 && (
                    <div className={styles.barLabel}>{d.steps >= 1000 ? `${(d.steps/1000).toFixed(1)}k` : d.steps}</div>
                  )}
                  <div className={`${styles.bar} ${d.isToday ? styles.barToday : ''}`}
                    style={{ height: `${Math.max(4, (d.steps / maxBar) * 100)}%` }} />
                </div>
                <div className={`${styles.barDay} ${d.isToday ? styles.barDayToday : ''}`}>{d.label}</div>
                {d.steps >= stepGoal && <div className={styles.goalFlag}>✓</div>}
              </div>
            ))}
            {/* Goal line */}
            <div className={styles.goalLine} style={{ bottom: `${(stepGoal / maxBar) * 100}%` }} />
          </div>
        )}
        {!token && <div className={styles.histNote}>Sign in to save and view weekly history</div>}
      </div>

      {/* ── Tips card ── */}
      <div className={styles.tipsCard}>
        <div className={styles.cardTitle}>Activity Tips</div>
        <div className={styles.tipsList}>
          {[
            { icon: '📱', tip: 'Carry your phone in your pocket or hand for best step accuracy' },
            { icon: '🚶', tip: '10,000 steps/day burns 400–500 extra kcal and improves heart health' },
            { icon: '⏰', tip: 'Take short 5-minute walks every hour to break sedentary patterns' },
            { icon: '💧', tip: 'Drink 200ml water every 2,000 steps — hydration boosts performance' },
            { icon: '🌅', tip: 'Morning walks improve mood and metabolism for the whole day' },
          ].map((t, i) => (
            <div key={i} className={styles.tip}>
              <span className={styles.tipIcon}>{t.icon}</span>
              <span>{t.tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <div className={styles.howCard}>
        <div className={styles.cardTitle}>How It Works</div>
        <div className={styles.howGrid}>
          {[
            { icon: '📡', head: 'Accelerometer', body: 'Reads your phone\'s motion sensor 50× per second to detect walking patterns' },
            { icon: '🔢', head: 'Peak Detection', body: 'Each time acceleration crosses a threshold it counts as one step' },
            { icon: '📏', head: 'Distance', body: `Steps × ${STRIDE_M}m average stride = distance in km` },
            { icon: '🔥', head: 'Calories', body: 'Calculated using your weight from the BMI tab for accuracy' },
          ].map(h => (
            <div key={h.head} className={styles.howItem}>
              <div className={styles.howIcon}>{h.icon}</div>
              <div className={styles.howHead}>{h.head}</div>
              <div className={styles.howBody}>{h.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
