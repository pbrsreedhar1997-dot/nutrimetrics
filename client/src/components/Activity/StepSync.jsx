import { useState, useEffect, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Health } from 'capacitor-health'
import styles from './StepSync.module.css'

const API   = '/api'
const TODAY = () => new Date().toISOString().split('T')[0]
const APK_URL = '/downloads/NutriMetrics.apk'

export default function StepSync({ token, userStats }) {
  const isNative = Capacitor.isNativePlatform()
  const weightKg = userStats?.weightKg || 70

  const [available, setAvailable] = useState(null)   // Health Connect present on device
  const [permitted, setPermitted] = useState(false)
  const [steps,     setSteps]     = useState(0)
  const [stepGoal,  setStepGoal]  = useState(10000)
  const [editGoal,  setEditGoal]  = useState(false)
  const [goalInput, setGoalInput] = useState('10000')
  const [history,   setHistory]   = useState([])
  const [fullHistory, setFullHistory] = useState(null) // lazy-loaded up to a year
  const [status,    setStatus]    = useState('')
  const [lastSync,  setLastSync]  = useState(null)

  const timer      = useRef(null)
  const lastPosted = useRef(-1)

  const headers = token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }

  const fetchHistory = useCallback(async () => {
    if (!token) return
    try {
      const d = await fetch(`${API}/activity-log`, { headers }).then(r => r.json())
      setHistory(d.logs || [])
      const t = (d.logs || []).find(l => l.date === TODAY())
      if (t) { if (!permitted) setSteps(t.steps || 0); if (t.step_goal) setStepGoal(t.step_goal) }
    } catch { /* offline */ }
  }, [token]) // eslint-disable-line

  useEffect(() => { fetchHistory() }, [fetchHistory])

  useEffect(() => {
    if (!isNative) { setAvailable(false); return }
    Health.isHealthAvailable().then(r => setAvailable(!!r.available)).catch(() => setAvailable(false))
  }, [isNative])

  const sync = useCallback(async () => {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const res = await Health.queryAggregated({
        startDate: start.toISOString(), endDate: new Date().toISOString(),
        dataType: 'steps', bucket: 'day',
      })
      const total = Math.round((res.aggregatedData || []).reduce((a, s) => a + (s.value || 0), 0))
      setSteps(total)
      setLastSync(new Date())
      // Persist to the server only when the count actually changed (feeds the
      // dashboard + challenge leaderboards) — avoids hammering the DB.
      if (total !== lastPosted.current) {
        lastPosted.current = total
        const dist = +(total * 0.000762).toFixed(2)
        const cal  = Math.round(total * 0.04 * (weightKg / 70))
        const mins = Math.round(total / 110)
        await fetch(`${API}/activity-log`, {
          method: 'POST', headers,
          body: JSON.stringify({ date: TODAY(), steps: total, distanceKm: dist, caloriesBurned: cal, activeMinutes: mins, stepGoal }),
        }).catch(() => {})
      }
    } catch (e) { setStatus('Sync failed — ' + (e?.message || 'try again')) }
  }, [weightKg, stepGoal]) // eslint-disable-line

  async function connect() {
    setStatus('Requesting access to your health data…')
    try {
      await Health.requestHealthPermissions({ permissions: ['READ_STEPS'] })
      setPermitted(true); setStatus('')
      sync()
    } catch {
      setStatus('Access not granted. Open Health Connect settings and allow step reading.')
    }
  }

  // Live sync loop while connected
  useEffect(() => {
    if (!permitted) return
    timer.current = setInterval(sync, 4000)
    return () => clearInterval(timer.current)
  }, [permitted, sync])

  async function saveGoal() {
    const g = parseInt(goalInput, 10)
    if (g > 0) {
      setStepGoal(g); setEditGoal(false)
      await fetch(`${API}/activity-log`, {
        method: 'POST', headers,
        body: JSON.stringify({ date: TODAY(), steps, stepGoal: g }),
      }).catch(() => {})
    }
  }

  const pct = Math.min(100, stepGoal > 0 ? Math.round((steps / stepGoal) * 100) : 0)
  const distKm = +(steps * 0.000762).toFixed(2)
  const cal    = Math.round(steps * 0.04 * (weightKg / 70))
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    const log = history.find(l => l.date === key)
    return { label: d.toLocaleDateString('en', { weekday: 'short' }), steps: log?.steps || 0, isToday: key === TODAY() }
  })
  const maxBar = Math.max(...last7.map(d => d.steps), stepGoal * 0.5, 1)

  const StepsPanel = (
    <>
      <div className={styles.hero}>
        <div className={styles.big}>{steps.toLocaleString()}</div>
        <div className={styles.bigLabel}>steps today</div>
        <div className={styles.bar}><div className={styles.barFill} style={{ width: `${pct}%` }} /></div>
        <div className={styles.goalRow}>
          {editGoal ? (
            <>
              <input className={styles.goalInput} type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)} />
              <button onClick={saveGoal}>Save</button>
            </>
          ) : (
            <span onClick={() => { setGoalInput(String(stepGoal)); setEditGoal(true) }}>
              Goal {stepGoal.toLocaleString()} · {pct}% <span className={styles.edit}>edit</span>
            </span>
          )}
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}><span>{distKm}</span><label>km</label></div>
        <div className={styles.stat}><span>{cal}</span><label>kcal</label></div>
        <div className={styles.stat}><span>{Math.round(steps / 110)}</span><label>active min</label></div>
      </div>
    </>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2>Steps</h2>
          <p>{isNative ? 'Synced from your phone’s Health app' : 'Accurate steps via the Android app'}</p>
        </div>
        {permitted && (
          <div className={styles.live}>
            <span className={styles.dot} /> Live
            {lastSync && <span className={styles.syncTime}>{lastSync.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )}
      </div>

      {/* Native + Health Connect available, not yet connected */}
      {isNative && available && !permitted && (
        <div className={styles.connect}>
          <div className={styles.connectIcon}>❤️‍🔥</div>
          <div className={styles.connectTitle}>Connect your Health app</div>
          <div className={styles.connectSub}>
            Read accurate step counts from Health Connect — the same data Google Fit,
            Samsung Health and your phone’s pedometer record.
          </div>
          <button className={styles.connectBtn} onClick={connect}>Allow step access</button>
          {status && <div className={styles.status}>{status}</div>}
        </div>
      )}

      {/* Native but Health Connect missing */}
      {isNative && available === false && (
        <div className={styles.connect}>
          <div className={styles.connectIcon}>⚠️</div>
          <div className={styles.connectTitle}>Health Connect not found</div>
          <div className={styles.connectSub}>
            Install “Health Connect” from the Play Store (built-in on Android 14+) and
            make sure an app like Google Fit is recording your steps, then reopen this tab.
          </div>
        </div>
      )}

      {/* Web (not the app) */}
      {!isNative && (
        <a className={styles.connect} href={APK_URL} download style={{ textDecoration: 'none' }}>
          <div className={styles.connectIcon}>📱</div>
          <div className={styles.connectTitle}>Get accurate steps</div>
          <div className={styles.connectSub}>
            Install the Android app to sync real step counts from your phone’s health app —
            far more accurate than a browser can measure.
          </div>
          <span className={styles.connectBtn}>Download the app</span>
        </a>
      )}

      {permitted && StepsPanel}

      {/* 7-day history (from the server — always shown once there's data) */}
      {(permitted || history.length > 0) && (
        <div className={styles.history}>
          <div className={styles.historyHead}>Last 7 days</div>
          <div className={styles.chart}>
            {last7.map((d, i) => (
              <div key={i} className={styles.col}>
                <div className={styles.colBarWrap}>
                  <div className={`${styles.colBar} ${d.isToday ? styles.colBarToday : ''}`}
                    style={{ height: `${Math.max(4, (d.steps / maxBar) * 100)}%` }} />
                </div>
                <div className={styles.colVal}>{d.steps >= 1000 ? (d.steps/1000).toFixed(1)+'k' : d.steps}</div>
                <div className={styles.colLabel}>{d.label}</div>
              </div>
            ))}
          </div>

          {/* Full history — every day is stored permanently and can be revisited */}
          {!fullHistory ? (
            <button className={styles.histBtn} onClick={async () => {
              const d = await fetch(`${API}/activity-log?limit=365`, { headers }).then(r => r.json())
              setFullHistory(d.logs || [])
            }}>View full history →</button>
          ) : (
            <div className={styles.histList}>
              <div className={styles.historyHead} style={{ marginTop: 14 }}>All-time · {fullHistory.length} days recorded</div>
              {fullHistory.map(l => (
                <div key={l.id} className={styles.histRow}>
                  <span>{new Date(l.date).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })}</span>
                  <strong>{(l.steps || 0).toLocaleString()} steps</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
