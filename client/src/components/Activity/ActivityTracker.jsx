import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './ActivityTracker.module.css'

const API     = '/api'
const TODAY   = () => new Date().toISOString().split('T')[0]
const STRIDE_M = 0.762

// ── Signal processing constants ───────────────────────────────────────
const LP_ALPHA       = 0.78   // low-pass: remove high-freq vibration
const BASELINE_ALPHA = 0.99   // baseline: slow drift removal (faster settle than 0.995)
const PEAK_HIGH      = 1.0    // m/s² — signal must rise above this to begin a step
const PEAK_LOW       = 0.30   // m/s² — signal must fall below this to CONFIRM the step
const MIN_STEP_MS    = 300    // minimum gap between steps (double-count guard)
const WARMUP_MS      = 2000   // skip counting during first 2 s while baseline settles

// ── NOTE: No MAX_STEP_MS check — that was the bug.
//    lastStep starts at 0, so sinceLastStep = Date.now() - 0 ≈ 1.7 trillion ms
//    which always exceeded MAX_STEP_MS (2200) and rejected every single step.
//    The warmup period now serves as the initial-step gate instead.

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

// ── SVG icon helpers ──────────────────────────────────────────────────
function Ico({ size = 20, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}
const IcoFlame  = () => <Ico><path d="M12 2c-2.8 3.8-4 7-4 9.5a4 4 0 008 0C16 9 14.8 5.8 12 2z"/><path d="M12 15.5v2"/></Ico>
const IcoPin    = () => <Ico><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z"/><circle cx="12" cy="9" r="2.5"/></Ico>
const IcoClock  = () => <Ico><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Ico>
const IcoTarget = () => <Ico><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></Ico>
const IcoRun    = () => <Ico size={40}><circle cx="12" cy="4" r="2"/><path d="M10 22v-6.5l2.5-3 2.5 3V22M7 14l3-2.5M15.5 11.5l2.5 2"/><path d="M7 14v-3l3-3h4l3 3"/></Ico>

export default function ActivityTracker({ token, userStats }) {
  const weightKg = userStats?.weightKg || 70

  const [sensorAvail,    setSensorAvail]    = useState(null)
  const [permission,     setPermission]     = useState('unknown')
  const [isTracking,     setIsTracking]     = useState(false)
  const [steps,          setSteps]          = useState(0)
  const [elapsed,        setElapsed]        = useState(0)
  const [stepGoal,       setStepGoal]       = useState(10000)
  const [editGoal,       setEditGoal]       = useState(false)
  const [goalInput,      setGoalInput]      = useState('10000')
  const [history,        setHistory]        = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── Sensor state refs (no re-render needed) ───────────────────────
  const smoothMag  = useRef(0)
  const baseline   = useRef(0)
  const inPeak     = useRef(false)
  const lastStep   = useRef(0)       // 0 = never stepped; warmup protects first detection
  const stepsRef   = useRef(0)

  // Gravity removal refs (for accelerationIncludingGravity fallback)
  const lpGX = useRef(0); const lpGY = useRef(0); const lpGZ = useRef(0)

  const timerRef = useRef(null)
  const saveRef  = useRef(null)
  const startTs  = useRef(0)

  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }

  useEffect(() => {
    setSensorAvail(typeof DeviceMotionEvent !== 'undefined')
    if (typeof DeviceMotionEvent === 'undefined') setPermission('unavailable')
  }, [])

  useEffect(() => {
    if (!token) return
    setLoadingHistory(true)
    fetch(`${API}/activity-log`, { headers })
      .then(r => r.json()).then(d => setHistory(d.logs || []))
      .catch(() => {}).finally(() => setLoadingHistory(false))
  }, [token])

  // ── Core step detection ───────────────────────────────────────────
  const handleMotion = useCallback((e) => {
    // Get linear acceleration
    let x, y, z
    const acc = e.acceleration
    if (acc && acc.x != null && acc.y != null) {
      x = acc.x || 0; y = acc.y || 0; z = acc.z || 0
    } else {
      const raw = e.accelerationIncludingGravity || {}
      const rx = raw.x || 0, ry = raw.y || 0, rz = raw.z || 0
      // Track gravity direction slowly (80/20 EMA) then subtract it
      lpGX.current = 0.85 * lpGX.current + 0.15 * rx
      lpGY.current = 0.85 * lpGY.current + 0.15 * ry
      lpGZ.current = 0.85 * lpGZ.current + 0.15 * rz
      x = rx - lpGX.current; y = ry - lpGY.current; z = rz - lpGZ.current
    }

    const now    = Date.now()
    const rawMag = Math.sqrt(x*x + y*y + z*z)

    // Stage 1: Low-pass filter — removes vibration noise
    smoothMag.current = LP_ALPHA * smoothMag.current + (1 - LP_ALPHA) * rawMag

    // Stage 2: Baseline tracker — removes slow DC drift
    baseline.current = BASELINE_ALPHA * baseline.current
                     + (1 - BASELINE_ALPHA) * smoothMag.current
    const signal = smoothMag.current - baseline.current

    // Skip detection while baseline calibrates during warmup
    if (now - startTs.current < WARMUP_MS) return

    const sinceLastStep = now - lastStep.current

    // Stage 3: Two-threshold hysteresis
    //   Rising edge — enter peak state when signal strong enough
    if (!inPeak.current && signal > PEAK_HIGH) {
      inPeak.current = true
    }
    //   Falling edge — confirm step when signal returns to rest
    if (inPeak.current && signal < PEAK_LOW) {
      inPeak.current = false

      // Stage 4: Anti-double-count gate
      // After warmup expires, lastStep=0 so sinceLastStep is huge — always passes.
      // Subsequent steps: reject only if they arrive impossibly fast (< 300ms).
      if (lastStep.current !== 0 && sinceLastStep < MIN_STEP_MS) return

      // ✓ Step confirmed
      lastStep.current  = now
      stepsRef.current += 1
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
    }
    setPermission('granted'); return true
  }

  async function startTracking() {
    let granted = permission === 'granted'
    if (!granted) granted = await requestPermission()
    if (!granted) return

    // Reset signal state — let baseline calibrate fresh during warmup
    smoothMag.current = 0; baseline.current = 0
    inPeak.current    = false
    lastStep.current  = 0   // 0 is safe here: warmup covers the first 2 s
    stepsRef.current  = steps
    startTs.current   = Date.now() - elapsed * 1000
    setIsTracking(true)

    window.addEventListener('devicemotion', handleMotion, { passive: true })
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTs.current) / 1000))
    }, 1000)
    // Sync steps to the server every ~2s while tracking so the live count is
    // persisted continuously (and reflected in the dashboard / challenges).
    saveRef.current = setInterval(() => saveTodayLog({ silent: true }), 2000)
  }

  function stopTracking() {
    setIsTracking(false)
    window.removeEventListener('devicemotion', handleMotion)
    clearInterval(timerRef.current); clearInterval(saveRef.current)
    saveTodayLog()
  }

  function resetSession() {
    if (isTracking) stopTracking()
    setSteps(0); stepsRef.current = 0; setElapsed(0)
    smoothMag.current = 0; baseline.current = 0
    inPeak.current = false; lastStep.current = 0
  }

  async function saveTodayLog({ silent = false } = {}) {
    const s    = stepsRef.current
    const dist = +(s * STRIDE_M / 1000).toFixed(2)
    const cal  = stepsToCalories(s, weightKg)
    const mins = Math.round(elapsed / 60)
    const payload = { date: TODAY(), steps: s, distanceKm: dist, caloriesBurned: cal, activeMinutes: mins, stepGoal }
    if (!token) return
    try {
      await fetch(`${API}/activity-log`, { method: 'POST', headers, body: JSON.stringify(payload) })
      // The 2s live sync just persists; only refresh the 7-day history on the
      // heavier saves (stop / manual) to avoid a fetch every 2 seconds.
      if (!silent) {
        const d = await fetch(`${API}/activity-log`, { headers }).then(r => r.json())
        setHistory(d.logs || [])
      }
    } catch { /* offline — will retry on next tick */ }
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
  const maxBar = Math.max(...last7.map(d => d.steps), stepGoal * 0.5, 1)

  return (
    <div className={styles.wrap}>

      {/* ── Page intro ── */}
      <div className={styles.intro}>
        <div className={styles.introIcon}><IcoRun /></div>
        <div className={styles.introText}>
          <h2 className={styles.introTitle}>Activity Tracker</h2>
          <p className={styles.introSub}>Count steps, track distance &amp; calories using your phone's motion sensor</p>
        </div>
        {isTracking && <div className={styles.livePill}><span className={styles.dot}/> Live</div>}
      </div>

      {/* ── Step hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroTop}>

          {/* Ring */}
          <div className={styles.ringWrap}>
            <svg className={styles.ring} viewBox="0 0 160 160">
              <defs>
                <linearGradient id="stepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00e5c0"/>
                  <stop offset="100%" stopColor="#60a5fa"/>
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r="68" className={styles.ringBg}/>
              <circle cx="80" cy="80" r="68" className={styles.ringFg}
                style={{ strokeDashoffset: Math.max(0, 427 - (427 * stepPct) / 100) }}/>
            </svg>
            <div className={styles.ringInner}>
              <div className={styles.stepCount}>{steps.toLocaleString()}</div>
              <div className={styles.stepLabel}>steps</div>
              <div className={styles.stepPct}>{stepPct}%</div>
            </div>
          </div>

          {/* Stat cards */}
          <div className={styles.statsGrid}>
            <div className={`${styles.stat} ${styles.statAmber}`}>
              <div className={styles.statIco}><IcoFlame /></div>
              <div className={styles.statVal}>{calBurned}</div>
              <div className={styles.statLbl}>Calories</div>
            </div>
            <div className={`${styles.stat} ${styles.statBlue}`}>
              <div className={styles.statIco}><IcoPin /></div>
              <div className={styles.statVal}>{distKm}</div>
              <div className={styles.statLbl}>km</div>
            </div>
            <div className={`${styles.stat} ${styles.statPurple}`}>
              <div className={styles.statIco}><IcoClock /></div>
              <div className={styles.statVal}>{fmtTime(elapsed)}</div>
              <div className={styles.statLbl}>Active</div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          {sensorAvail === false ? (
            <div className={styles.noSensor}>
              Motion sensor unavailable — works on mobile Chrome &amp; Safari over HTTPS.
            </div>
          ) : permission === 'denied' ? (
            <div className={styles.noSensor}>
              Motion permission denied. Enable it in browser settings and reload.
            </div>
          ) : (
            <>
              {!isTracking ? (
                <button className={`${styles.ctrlBtn} ${styles.start}`}
                  onClick={permission === 'unknown' ? requestPermission : startTracking}>
                  {permission === 'unknown' ? 'Allow Sensor & Start' : '▶  Start Tracking'}
                </button>
              ) : (
                <button className={`${styles.ctrlBtn} ${styles.stop}`} onClick={stopTracking}>
                  ⏸  Pause &amp; Save
                </button>
              )}
              <button className={styles.resetBtn} onClick={resetSession} disabled={isTracking}>
                ↺ Reset
              </button>
            </>
          )}
        </div>

        {/* Goal row */}
        <div className={styles.goalRow}>
          {editGoal ? (
            <>
              <label>Daily goal</label>
              <input type="number" inputMode="numeric" value={goalInput}
                onChange={e => setGoalInput(e.target.value)}/>
              <button onClick={() => {
                const g = Math.max(100, +goalInput || 10000)
                setStepGoal(g); setEditGoal(false)
                if (isTracking) saveTodayLog()
              }}>Save</button>
              <button className={styles.cancelBtn} onClick={() => setEditGoal(false)}>✕</button>
            </>
          ) : (
            <>
              <span className={styles.goalText}>
                <IcoTarget /> Goal: <strong>{stepGoal.toLocaleString()}</strong> steps
              </span>
              <button className={styles.editGoalBtn}
                onClick={() => { setGoalInput(String(stepGoal)); setEditGoal(true) }}>
                Edit
              </button>
            </>
          )}
        </div>

        {isTracking && (
          <div className={styles.livePulse}>
            <span className={styles.dot}/>
            Tracking active — keep phone in pocket or hand · first step counts after 2 s calibration
          </div>
        )}
      </div>

      {/* ── Achievement badges ── */}
      <div className={styles.badgeRow}>
        {[
          { val: steps >= stepGoal,  text: 'Goal Reached!', sub: `${steps.toLocaleString()} / ${stepGoal.toLocaleString()} steps` },
          { val: calBurned >= 200,   text: '200+ Calories',  sub: `${calBurned} kcal burned` },
          { val: distKm >= 1,        text: '1 km+ walked',   sub: `${distKm} km total` },
          { val: elapsed >= 600,     text: '10 min active',  sub: fmtTime(elapsed) + ' today' },
        ].map((b, i) => (
          <div key={i} className={`${styles.badge} ${b.val ? styles.earned : ''}`}>
            <div className={styles.badgeText}>{b.val ? '✓ ' + b.text : b.text}</div>
            <div className={styles.badgeSub}>{b.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Weekly bar chart ── */}
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
                    <div className={styles.barLabel}>
                      {d.steps >= 1000 ? `${(d.steps/1000).toFixed(1)}k` : d.steps}
                    </div>
                  )}
                  <div className={`${styles.bar} ${d.isToday ? styles.barToday : ''}`}
                    style={{ height: `${Math.max(4, (d.steps / maxBar) * 100)}%` }}/>
                </div>
                <div className={`${styles.barDay} ${d.isToday ? styles.barDayToday : ''}`}>
                  {d.label}
                </div>
                {d.steps >= stepGoal && <div className={styles.goalFlag}>✓</div>}
              </div>
            ))}
            <div className={styles.goalLine}
              style={{ bottom: `${Math.min(96, (stepGoal / maxBar) * 100)}%` }}/>
          </div>
        )}
        {!token && (
          <div className={styles.histNote}>Sign in to save and view weekly history</div>
        )}
      </div>

      {/* ── Tips ── */}
      <div className={styles.tipsCard}>
        <div className={styles.cardTitle}>Activity Tips</div>
        <div className={styles.tipsList}>
          {[
            { icon: '👖', tip: 'Keep phone in trouser pocket — hip movement is the clearest walking signal' },
            { icon: '🚶', tip: '10,000 steps/day burns 400–500 extra kcal and improves cardiovascular health' },
            { icon: '⏰', tip: 'Short 5-minute walks every hour break sedentary patterns and boost metabolism' },
            { icon: '💧', tip: 'Drink 200 ml water every 2,000 steps for better endurance' },
            { icon: '🌅', tip: 'Morning walks regulate circadian rhythm and lift mood all day' },
          ].map((t, i) => (
            <div key={i} className={styles.tip}>
              <span className={styles.tipIcon}>{t.icon}</span>
              <span>{t.tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
