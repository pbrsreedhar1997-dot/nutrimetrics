import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './ActivityTracker.module.css'

const API    = '/api'
const TODAY  = () => new Date().toISOString().split('T')[0]
const STRIDE_M = 0.762   // average stride length in metres

// ─── Signal processing constants (tuned for walking accuracy) ────────
const LP_ALPHA       = 0.85   // low-pass noise filter (0–1; higher = smoother)
const BASELINE_ALPHA = 0.995  // baseline drift tracker (very slow)
const PEAK_HIGH      = 1.2    // m/s² — signal must EXCEED this to enter a step
const PEAK_LOW       = 0.50   // m/s² — signal must DROP below this to CONFIRM step
const MIN_STEP_MS    = 300    // ms — fastest real step (200 spm = race-walking)
const MAX_STEP_MS    = 2200   // ms — slowest real step (27 spm = very slow shuffle)
const CADENCE_FACTOR = 2.5    // reject if > N× recent average gap (shake filter)

function fmtTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function pct(val, max) { return Math.min(100, max > 0 ? Math.round((val / max) * 100) : 0) }

function stepsToCalories(steps, weightKg) {
  return Math.round(steps * 0.04 * ((weightKg || 70) / 70))
}

export default function ActivityTracker({ token, userStats }) {
  const weightKg = userStats?.weightKg || 70

  const [sensorAvail, setSensorAvail] = useState(null)
  const [permission,  setPermission]  = useState('unknown')
  const [isTracking,  setIsTracking]  = useState(false)
  const [steps,       setSteps]       = useState(0)
  const [elapsed,     setElapsed]     = useState(0)
  const [stepGoal,    setStepGoal]    = useState(10000)
  const [editGoal,    setEditGoal]    = useState(false)
  const [goalInput,   setGoalInput]   = useState('10000')
  const [history,     setHistory]     = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ─── Sensor signal state (refs — no render needed) ──────────────
  const smoothMag   = useRef(0)      // Stage 1: low-pass filtered magnitude
  const baseline    = useRef(0)      // Stage 2: very slow baseline
  const inPeak      = useRef(false)  // Stage 3: are we currently above PEAK_HIGH?
  const recentGaps  = useRef([])     // Stage 5: last 4 inter-step intervals (ms)
  const lastStep    = useRef(0)      // timestamp of last confirmed step
  const stepsRef    = useRef(0)      // mirror of steps state for callbacks

  // High-pass gravity removal (for accelerationIncludingGravity fallback)
  const lpGX = useRef(0); const lpGY = useRef(0); const lpGZ = useRef(0)

  // Timers
  const timerRef  = useRef(null)
  const saveRef   = useRef(null)
  const startTs   = useRef(0)

  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setSensorAvail(false); setPermission('unavailable')
    } else {
      setSensorAvail(true)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    setLoadingHistory(true)
    fetch(`${API}/activity-log`, { headers })
      .then(r => r.json()).then(d => setHistory(d.logs || []))
      .catch(() => {}).finally(() => setLoadingHistory(false))
  }, [token])

  // ─── Core step detection — 5-stage pipeline ─────────────────────
  const handleMotion = useCallback((e) => {

    // ── Get linear acceleration (without gravity) ─────────────────
    let x, y, z
    const acc = e.acceleration
    if (acc && acc.x !== null && acc.y !== null) {
      x = acc.x || 0; y = acc.y || 0; z = acc.z || 0
    } else {
      // Fallback: subtract low-pass gravity from accelerationIncludingGravity
      const raw = e.accelerationIncludingGravity || {}
      const rx = raw.x || 0, ry = raw.y || 0, rz = raw.z || 0
      // Slow low-pass tracks gravity direction
      lpGX.current = 0.8 * lpGX.current + 0.2 * rx
      lpGY.current = 0.8 * lpGY.current + 0.2 * ry
      lpGZ.current = 0.8 * lpGZ.current + 0.2 * rz
      x = rx - lpGX.current
      y = ry - lpGY.current
      z = rz - lpGZ.current
    }

    // ── Stage 1: Low-pass filter ──────────────────────────────────
    // Smooths out high-frequency noise: vibrations, taps, bumps
    const rawMag = Math.sqrt(x*x + y*y + z*z)
    smoothMag.current = LP_ALPHA * smoothMag.current + (1 - LP_ALPHA) * rawMag

    // ── Stage 2: Baseline tracker ─────────────────────────────────
    // Very slow moving average — removes slow drift and DC offset
    baseline.current = BASELINE_ALPHA * baseline.current
                     + (1 - BASELINE_ALPHA) * smoothMag.current

    // Signal = how much above the resting baseline we are
    const signal = smoothMag.current - baseline.current

    const now           = Date.now()
    const sinceLastStep = now - lastStep.current

    // ── Stage 3: Two-threshold hysteresis (no threshold bouncing) ─
    // Must cross HIGH to begin, must drop to LOW to confirm.
    // This prevents a single step from being counted multiple times.
    if (!inPeak.current && signal > PEAK_HIGH) {
      inPeak.current = true   // rising edge — entered step motion
    }

    if (inPeak.current && signal < PEAK_LOW) {
      inPeak.current = false  // falling edge — full step cycle complete

      // ── Stage 4: Cadence gate ─────────────────────────────────
      // Human walking: 27–200 steps/min → 300–2200ms between steps.
      // Outside this window = physically impossible (car shake, sudden bump).
      if (sinceLastStep < MIN_STEP_MS || sinceLastStep > MAX_STEP_MS) return

      // ── Stage 5: Cadence consistency (anti-shake) ─────────────
      // After a rhythm is established, new steps must fit that rhythm.
      // Random phone shakes are sporadic — walking is regular.
      const gaps = recentGaps.current
      if (gaps.length >= 3) {
        const avgGap = (gaps[gaps.length-1] + gaps[gaps.length-2] + gaps[gaps.length-3]) / 3
        if (sinceLastStep > avgGap * CADENCE_FACTOR) return  // too irregular
      }

      // ── Step confirmed ────────────────────────────────────────
      recentGaps.current = [...gaps.slice(-3), sinceLastStep]
      lastStep.current   = now
      stepsRef.current  += 1
      setSteps(stepsRef.current)
    }
  }, [])

  async function requestPermission() {
    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission()
        setPermission(res === 'granted' ? 'granted' : 'denied')
        return res === 'granted'
      } catch { setPermission('denied'); return false }
    } else {
      setPermission('granted'); return true
    }
  }

  async function startTracking() {
    let granted = permission === 'granted'
    if (!granted) granted = await requestPermission()
    if (!granted) return

    // Reset signal state so baseline calibrates fresh
    smoothMag.current  = 0; baseline.current = 0
    inPeak.current     = false; recentGaps.current = []
    lastStep.current   = 0
    stepsRef.current   = steps
    startTs.current    = Date.now() - elapsed * 1000
    setIsTracking(true)

    window.addEventListener('devicemotion', handleMotion, { passive: true })
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTs.current) / 1000))
    }, 1000)
    saveRef.current = setInterval(() => saveTodayLog(), 30000)
  }

  function stopTracking() {
    setIsTracking(false)
    window.removeEventListener('devicemotion', handleMotion)
    clearInterval(timerRef.current)
    clearInterval(saveRef.current)
    saveTodayLog()
  }

  function resetSession() {
    if (isTracking) stopTracking()
    setSteps(0); stepsRef.current = 0; setElapsed(0)
    recentGaps.current = []; lastStep.current = 0
    smoothMag.current  = 0; baseline.current  = 0
  }

  async function saveTodayLog() {
    const s    = stepsRef.current
    const dist = +(s * STRIDE_M / 1000).toFixed(2)
    const cal  = stepsToCalories(s, weightKg)
    const mins = Math.round(elapsed / 60)
    const payload = { date: TODAY(), steps: s, distanceKm: dist, caloriesBurned: cal, activeMinutes: mins, stepGoal }
    if (token) {
      fetch(`${API}/activity-log`, { method: 'POST', headers, body: JSON.stringify(payload) })
        .then(r => r.json())
        .then(() => fetch(`${API}/activity-log`, { headers }).then(r => r.json()).then(d => setHistory(d.logs || [])).catch(() => {}))
        .catch(() => {})
    }
  }

  useEffect(() => () => {
    window.removeEventListener('devicemotion', handleMotion)
    clearInterval(timerRef.current); clearInterval(saveRef.current)
  }, [handleMotion])

  const distKm    = +(steps * STRIDE_M / 1000).toFixed(2)
  const calBurned = stepsToCalories(steps, weightKg)
  const stepPct   = pct(steps, stepGoal)

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    const log = history.find(l => l.date === key)
    return { label: d.toLocaleDateString('en', { weekday: 'short' }), steps: log?.steps || 0, date: key, isToday: key === TODAY() }
  })
  const maxBar = Math.max(...last7.map(d => d.steps), 1)

  return (
    <div className={styles.wrap}>

      {/* ── Step ring ── */}
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

          <div className={styles.statsGrid}>
            {[
              { icon: '🔥', val: calBurned,      lbl: 'Calories' },
              { icon: '📍', val: distKm,          lbl: 'km'       },
              { icon: '⏱',  val: fmtTime(elapsed), lbl: 'Active'  },
            ].map(s => (
              <div key={s.lbl} className={styles.stat}>
                <div className={styles.statIcon}>{s.icon}</div>
                <div className={styles.statVal}>{s.val}</div>
                <div className={styles.statLbl}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {sensorAvail === false ? (
            <div className={styles.noSensor}>
              <span>📵</span> Motion sensor unavailable on this device/browser.<br />
              <small>Works on mobile Chrome &amp; Safari over HTTPS.</small>
            </div>
          ) : permission === 'denied' ? (
            <div className={styles.noSensor}>
              <span>🔒</span> Motion permission denied. Enable it in browser settings and reload.
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
              <button className={styles.resetBtn} onClick={resetSession} disabled={isTracking}>↺ Reset</button>
            </>
          )}
        </div>

        {/* Goal row */}
        <div className={styles.goalRow}>
          {editGoal ? (
            <>
              <label>Daily goal</label>
              <input type="number" inputMode="numeric" value={goalInput}
                onChange={e => setGoalInput(e.target.value)} />
              <button onClick={() => { const g = Math.max(100, +goalInput || 10000); setStepGoal(g); setEditGoal(false); if (isTracking) saveTodayLog() }}>Save</button>
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
            <span className={styles.dot} />
            Tracking active — 5-stage sensor pipeline running · keep phone in pocket or hand
          </div>
        )}
      </div>

      {/* ── Badges ── */}
      <div className={styles.badgeRow}>
        {[
          { label: 'Steps done',  val: steps >= stepGoal,  text: '🏆 Goal reached!',  sub: `${steps.toLocaleString()} / ${stepGoal.toLocaleString()}` },
          { label: 'Calories',    val: calBurned >= 200,   text: '🔥 200+ kcal',      sub: `${calBurned} kcal burned` },
          { label: 'Distance',    val: distKm >= 1,        text: '📍 1 km+',          sub: `${distKm} km walked` },
          { label: 'Active time', val: elapsed >= 600,     text: '⏱ 10 min active',  sub: `${fmtTime(elapsed)} today` },
        ].map(b => (
          <div key={b.label} className={`${styles.badge} ${b.val ? styles.earned : ''}`}>
            <div className={styles.badgeText}>{b.val ? b.text : b.label}</div>
            <div className={styles.badgeSub}>{b.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Weekly chart ── */}
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
            <div className={styles.goalLine} style={{ bottom: `${Math.min(98, (stepGoal / maxBar) * 100)}%` }} />
          </div>
        )}
        {!token && <div className={styles.histNote}>Sign in to save and view weekly history</div>}
      </div>

      {/* ── Tips ── */}
      <div className={styles.tipsCard}>
        <div className={styles.cardTitle}>Activity Tips</div>
        <div className={styles.tipsList}>
          {[
            { icon: '👖', tip: 'Keep phone in your trouser pocket for the most accurate step detection — hip movement is the clearest walking signal' },
            { icon: '🚶', tip: '10,000 steps/day burns 400–500 extra kcal and significantly improves cardiovascular health' },
            { icon: '⏰', tip: 'Short 5-minute walks every hour break sedentary patterns and improve metabolism' },
            { icon: '💧', tip: 'Drink 200 ml water every 2,000 steps — hydration improves endurance and focus' },
            { icon: '🌅', tip: 'Morning walks regulate your circadian rhythm and boost mood for the entire day' },
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
        <div className={styles.cardTitle}>5-Stage Sensor Pipeline</div>
        <div className={styles.howGrid}>
          {[
            { icon: '📡', head: 'Accelerometer + Fallback', body: 'Reads 3-axis linear acceleration. If the clean signal is unavailable, gravity is subtracted via a high-pass filter on the raw sensor.' },
            { icon: '〰️', head: 'Stage 1–2: Signal Filtering', body: 'Low-pass filter removes vibrations & bumps. A very slow baseline tracker removes gravity drift — leaving only real motion.' },
            { icon: '⚡', head: 'Stage 3: Hysteresis Detection', body: 'Two thresholds (HIGH to enter, LOW to confirm) ensure each step is counted exactly once — no bouncing around a single value.' },
            { icon: '⏱',  head: 'Stage 4: Cadence Gate', body: 'Steps outside 300–2200 ms (27–200 steps/min) are physically impossible — car shakes and bumps are dropped here.' },
            { icon: '🎵', head: 'Stage 5: Rhythm Check', body: 'After 3 steps, new steps must fit the established rhythm (±2.5×). Random shaking is sporadic — real walking is regular.' },
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
