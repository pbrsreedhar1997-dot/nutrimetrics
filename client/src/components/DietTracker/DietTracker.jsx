import { useState, useEffect, useRef } from 'react'
import { FOODS } from '../../data/foods'
import styles from './DietTracker.module.css'

const API = '/api'
const TODAY = () => new Date().toISOString().split('T')[0]

// Daily recommended values
const RDA = {
  vitB12: 2.4,   // mcg
  vitC:   90,    // mg
  vitD:   600,   // IU
  iron:   18,    // mg
  calcium:1000,  // mg
}

function scale(food, grams) {
  const f = grams / 100
  return {
    protein:  +(food.protein  * f).toFixed(1),
    carbs:    +(food.carbs    * f).toFixed(1),
    fat:      +(food.fat      * f).toFixed(1),
    calories: +(food.calories * f).toFixed(0),
    fiber:    +(food.fiber    * f).toFixed(1),
    vitB12:   +(food.vitB12   * f).toFixed(2),
    vitC:     +(food.vitC     * f).toFixed(1),
    vitD:     +(food.vitD     * f).toFixed(0),
    iron:     +(food.iron     * f).toFixed(2),
    calcium:  +(food.calcium  * f).toFixed(0),
  }
}

function sum(logs, key) {
  return +logs.reduce((a, l) => a + (l[key] || 0), 0).toFixed(key === 'vitB12' || key === 'iron' ? 2 : key === 'vitD' || key === 'calcium' ? 0 : 1)
}

function pct(val, max) { return Math.min(100, max > 0 ? Math.round((val / max) * 100) : 0) }

export default function DietTracker({ token, userStats }) {
  const [logs, setLogs]         = useState([])
  const [goals, setGoals]       = useState({ calories: 2000, protein: 120, carbs: 250, fat: 65 })
  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState(null)
  const [grams, setGrams]       = useState('')
  const [suggestions, setSugg]  = useState([])
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState('')
  const [showGoals, setShowGoals] = useState(false)
  const [editGoals, setEditGoals] = useState({ calories: 2000, protein: 120, carbs: 250, fat: 65 })
  const [date] = useState(TODAY)
  const autoGoalRef = useRef(false)

  const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }

  // Auto-apply goals from BMI result
  useEffect(() => {
    if (userStats && !autoGoalRef.current) {
      const { calories: c, protein: p } = calcFromStats(userStats)
      if (c && p) {
        const g = { calories: c, protein: p, carbs: Math.round((c * 0.45) / 4), fat: Math.round((c * 0.28) / 9) }
        setGoals(g)
        setEditGoals(g)
        if (token) saveGoals(g)
        autoGoalRef.current = true
      }
    }
  }, [userStats])

  function calcFromStats(s) {
    if (!s) return {}
    const bmr = s.gender === 'female'
      ? 10 * s.weightKg + 6.25 * s.heightCm - 5 * (s.age || 25) - 161
      : 10 * s.weightKg + 6.25 * s.heightCm - 5 * (s.age || 25) + 5
    const tdee = Math.round(bmr * 1.55)
    const goal = s.bmi >= 25 ? tdee - 300 : s.bmi < 18.5 ? tdee + 300 : tdee
    const protein = Math.round(s.weightKg * 1.8)
    return { calories: goal, protein }
  }

  // Load today's log
  useEffect(() => {
    if (!token) return
    fetch(`${API}/diet-log?date=${date}`, { headers })
      .then(r => r.json())
      .then(d => {
        setLogs(d.logs || [])
        if (d.goals && !autoGoalRef.current) {
          setGoals(d.goals)
          setEditGoals(d.goals)
        }
      })
      .catch(() => {})
  }, [token, date])

  // Food search
  useEffect(() => {
    if (!query.trim()) { setSugg([]); return }
    const q = query.toLowerCase()
    setSugg(FOODS.filter(f => f.name.toLowerCase().includes(q)).slice(0, 8))
  }, [query])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function selectFood(food) {
    setSelected(food)
    setQuery(food.name)
    setSugg([])
  }

  async function addEntry() {
    if (!selected || !grams || +grams <= 0) return
    const g = +grams
    const nutr = scale(selected, g)
    const entry = {
      date,
      food_name: selected.name,
      emoji: selected.emoji,
      grams: g,
      ...nutr,
    }
    if (token) {
      setLoading(true)
      try {
        const r = await fetch(`${API}/diet-log`, { method: 'POST', headers, body: JSON.stringify(entry) })
        const d = await r.json()
        setLogs(prev => [...prev, { _id: d.id, ...entry }])
      } catch { showToast('Failed to save') }
      setLoading(false)
    } else {
      setLogs(prev => [...prev, { _id: Date.now().toString(), ...entry }])
    }
    setQuery(''); setSelected(null); setGrams('')
    showToast(`${selected.emoji} ${selected.name} added!`)
  }

  async function removeEntry(id) {
    setLogs(prev => prev.filter(l => l._id !== id))
    if (token) {
      fetch(`${API}/diet-log/${id}`, { method: 'DELETE', headers }).catch(() => {})
    }
  }

  async function saveGoals(g) {
    if (!token) { setGoals(g); return }
    await fetch(`${API}/diet-goals`, { method: 'PUT', headers, body: JSON.stringify(g) })
    setGoals(g)
  }

  function handleSaveGoals() {
    const g = {
      calories: +editGoals.calories || 2000,
      protein:  +editGoals.protein  || 120,
      carbs:    +editGoals.carbs    || 250,
      fat:      +editGoals.fat      || 65,
    }
    setEditGoals(g)
    saveGoals(g)
    setShowGoals(false)
    showToast('Goals updated!')
  }

  // Totals
  const totals = {
    calories: sum(logs, 'calories'),
    protein:  sum(logs, 'protein'),
    carbs:    sum(logs, 'carbs'),
    fat:      sum(logs, 'fat'),
    fiber:    sum(logs, 'fiber'),
    vitB12:   sum(logs, 'vitB12'),
    vitC:     sum(logs, 'vitC'),
    vitD:     sum(logs, 'vitD'),
    iron:     sum(logs, 'iron'),
    calcium:  sum(logs, 'calcium'),
  }

  const preview = selected && grams && +grams > 0 ? scale(selected, +grams) : null

  return (
    <div className={styles.wrap}>

      {/* ── Calorie ring + macros ── */}
      <div className={styles.hero}>
        <div className={styles.ringRow}>
          <div className={styles.ringWrap}>
            <svg className={styles.ring} viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className={styles.ringTrack} />
              <circle cx="60" cy="60" r="52" className={styles.ringFill}
                style={{ strokeDashoffset: 327 - (327 * pct(totals.calories, goals.calories)) / 100 }} />
            </svg>
            <div className={styles.ringInner}>
              <div className={styles.ringVal}>{totals.calories}</div>
              <div className={styles.ringUnit}>kcal</div>
              <div className={styles.ringLabel}>of {goals.calories}</div>
            </div>
          </div>

          <div className={styles.macroList}>
            {[
              { label: 'Protein', val: totals.protein,  goal: goals.protein,  unit: 'g', color: 'var(--accent)' },
              { label: 'Carbs',   val: totals.carbs,    goal: goals.carbs,    unit: 'g', color: 'var(--amber)'  },
              { label: 'Fat',     val: totals.fat,      goal: goals.fat,      unit: 'g', color: 'var(--purple)' },
              { label: 'Fiber',   val: totals.fiber,    goal: 25,             unit: 'g', color: 'var(--green)'  },
            ].map(m => (
              <div key={m.label} className={styles.macroItem}>
                <div className={styles.macroTop}>
                  <span className={styles.macroLabel}>{m.label}</span>
                  <span className={styles.macroVal} style={{ color: m.color }}>
                    {m.val}<small>/{m.goal}{m.unit}</small>
                  </span>
                </div>
                <div className={styles.macroTrack}>
                  <div className={styles.macroFill}
                    style={{ width: `${pct(m.val, m.goal)}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button className={styles.editGoalBtn} onClick={() => { setShowGoals(v => !v); setEditGoals(goals) }}>
          {showGoals ? 'Cancel' : '✏ Edit Goals'}
        </button>

        {showGoals && (
          <div className={styles.goalEdit}>
            {['calories','protein','carbs','fat'].map(k => (
              <div key={k} className={styles.goalField}>
                <label>{k.charAt(0).toUpperCase() + k.slice(1)} {k === 'calories' ? '(kcal)' : '(g)'}</label>
                <input type="number" value={editGoals[k]}
                  onChange={e => setEditGoals(p => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <button className={styles.saveGoalBtn} onClick={handleSaveGoals}>Save Goals</button>
          </div>
        )}
      </div>

      {/* ── Vitamins & Minerals ── */}
      <div className={styles.vitCard}>
        <div className={styles.vitTitle}>Vitamins & Minerals</div>
        <div className={styles.vitGrid}>
          {[
            { label: 'Vitamin B12', val: totals.vitB12,   rda: RDA.vitB12,   unit: 'mcg', color: '#60a5fa' },
            { label: 'Vitamin C',   val: totals.vitC,     rda: RDA.vitC,     unit: 'mg',  color: '#fbbf24' },
            { label: 'Vitamin D',   val: totals.vitD,     rda: RDA.vitD,     unit: 'IU',  color: '#f97316' },
            { label: 'Iron',        val: totals.iron,     rda: RDA.iron,     unit: 'mg',  color: '#ef4444' },
            { label: 'Calcium',     val: totals.calcium,  rda: RDA.calcium,  unit: 'mg',  color: '#a78bfa' },
          ].map(v => {
            const p = pct(v.val, v.rda)
            return (
              <div key={v.label} className={styles.vitItem}>
                <div className={styles.vitTop}>
                  <span className={styles.vitLabel}>{v.label}</span>
                  <span className={styles.vitVal} style={{ color: v.color }}>
                    {v.val}<small> {v.unit}</small>
                    <span className={styles.vitPct}>{p}%</span>
                  </span>
                </div>
                <div className={styles.vitTrack}>
                  <div className={styles.vitFill} style={{ width: `${p}%`, background: v.color }} />
                </div>
                <div className={styles.vitRda}>RDA: {v.rda} {v.unit}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Food adder ── */}
      <div className={styles.adder}>
        <div className={styles.adderTitle}>Add Food</div>
        <div className={styles.adderRow}>
          <div className={styles.searchWrap}>
            <div className={styles.fieldLabel}>Search food</div>
            <div className={styles.suggestContainer}>
              <input
                type="text"
                placeholder="e.g. Chicken Breast"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null) }}
              />
              {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  {suggestions.map(f => (
                    <div key={f.name} className={styles.sugItem} onClick={() => selectFood(f)}>
                      <span>{f.emoji} {f.name}</span>
                      <span className={styles.sugInfo}>{f.protein}g P · {f.calories} kcal</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.gramsWrap}>
            <div className={styles.fieldLabel}>Amount</div>
            <div className={styles.inputWrap}>
              <input
                type="number" inputMode="decimal"
                placeholder="100"
                value={grams}
                onChange={e => setGrams(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEntry()}
              />
              <span className={styles.unit}>g</span>
            </div>
          </div>

          <button className={styles.btnAdd} onClick={addEntry} disabled={!selected || !grams || loading}>
            {loading ? '…' : '+ Add'}
          </button>
        </div>

        {preview && (
          <div className={styles.preview}>
            {grams}g → {preview.calories} kcal · P:{preview.protein}g · C:{preview.carbs}g · F:{preview.fat}g
            {preview.vitB12 > 0 ? ` · B12:${preview.vitB12}mcg` : ''}
            {preview.vitC   > 0 ? ` · C:${preview.vitC}mg`      : ''}
            {preview.vitD   > 0 ? ` · D:${preview.vitD}IU`      : ''}
          </div>
        )}
      </div>

      {/* ── Daily log ── */}
      <div className={styles.logCard}>
        <div className={styles.logHeader}>
          <span>Today's Log ({logs.length} items)</span>
          {logs.length > 0 && (
            <button className={styles.btnClear}
              onClick={() => { logs.forEach(l => removeEntry(l._id)) }}>
              Clear all
            </button>
          )}
        </div>
        {logs.length === 0 ? (
          <div className={styles.empty}>
            <strong>No food logged yet</strong>
            Search and add foods above to track your nutrition today
          </div>
        ) : (
          logs.map(l => (
            <div key={l._id} className={styles.foodItem}>
              <span className={styles.foodEmoji}>{l.emoji}</span>
              <div className={styles.foodInfo}>
                <div className={styles.foodName}>{l.food_name}</div>
                <div className={styles.foodMacros}>
                  {l.grams}g · {l.calories} kcal · P:{l.protein}g · C:{l.carbs}g · F:{l.fat}g
                </div>
              </div>
              <button className={styles.btnRemove} onClick={() => removeEntry(l._id)}>×</button>
            </div>
          ))
        )}
      </div>

      {!token && (
        <div className={styles.authNote}>
          Sign in to save your diet log and goals across sessions
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
