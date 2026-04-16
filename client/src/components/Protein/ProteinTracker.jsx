import { useState, useEffect, useRef, useCallback } from 'react'
import { FOODS } from '../../data/foods'
import { apiCall } from '../../api'
import styles from './ProteinTracker.module.css'

const today = () => new Date().toISOString().split('T')[0]

export default function ProteinTracker({ token, userStats }) {
  const lastWeightKg = userStats?.weightKg ?? null
  const [log, setLog]         = useState([])
  const [goal, setGoalVal]    = useState(120)
  const [goalInput, setGI]    = useState('120')
  const [search, setSearch]   = useState('')
  const [grams, setGrams]     = useState('')
  const [selected, setSelected] = useState(null)
  const [suggestions, setSug] = useState([])
  const [sugOpen, setSugOpen] = useState(false)
  const [toast, setToast]     = useState('')
  const toastTimer            = useRef(null)
  const autoGoalApplied       = useRef(false)

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])

  useEffect(() => {
    async function load() {
      if (token) {
        const res = await apiCall('GET', `/protein-log?date=${today()}`, null, token)
        if (!res.error) {
          setLog((res.logs || []).map(l => ({ id: l._id, name: l.food_name, emoji: l.emoji, grams: l.grams, protein: l.protein })))
          setGoalVal(res.protein_goal || 120)
          setGI(String(res.protein_goal || 120))
        }
      } else {
        try {
          const s = JSON.parse(localStorage.getItem('nm_state') || '{}')
          if (s.foodLog) setLog(s.foodLog)
          if (s.proteinGoal) { setGoalVal(s.proteinGoal); setGI(String(s.proteinGoal)) }
        } catch {}
      }
    }
    load()
  }, [token])

  // Auto-set protein goal when userStats arrives from BMI tab
  useEffect(() => {
    if (userStats?.weightKg && !autoGoalApplied.current) {
      const g = Math.round(userStats.weightKg * 1.6)
      setGoalVal(g)
      setGI(String(g))
      autoGoalApplied.current = true
      if (token) apiCall('PUT', '/protein-goal', { protein_goal: g, date: today() }, token)
    }
  }, [userStats, token])

  function persist(newLog, newGoal) {
    if (!token) localStorage.setItem('nm_state', JSON.stringify({ foodLog: newLog, proteinGoal: newGoal }))
  }

  function handleSearch(val) {
    setSearch(val)
    setSelected(null)
    if (!val.trim()) { setSugOpen(false); return }
    const matches = FOODS.filter(f => f.name.toLowerCase().includes(val.toLowerCase())).slice(0, 8)
    setSug(matches)
    setSugOpen(matches.length > 0)
  }

  function pickFood(food) {
    setSelected(food)
    setSearch(food.name)
    setSugOpen(false)
  }

  async function addFood() {
    if (!search.trim()) { showToast('Please enter a food name.'); return }
    if (!grams || parseFloat(grams) <= 0) { showToast('Enter a valid amount in grams.'); return }

    let food = selected || FOODS.find(f => f.name.toLowerCase() === search.toLowerCase())
              || FOODS.find(f => f.name.toLowerCase().includes(search.toLowerCase()))
    if (!food) { showToast(`"${search}" not found. Try searching from the list.`); return }

    const protein = Math.round((food.protein * parseFloat(grams)) / 100 * 10) / 10
    const item = { name: food.name, emoji: food.emoji, grams: parseFloat(grams), protein }

    if (token) {
      const res = await apiCall('POST', '/protein-log', { date: today(), food_name: food.name, grams: parseFloat(grams), protein, emoji: food.emoji, protein_goal: goal }, token)
      if (res.error) { showToast(res.error); return }
      item.id = res.id
    } else {
      item.id = Date.now()
    }

    const newLog = [...log, item]
    setLog(newLog)
    persist(newLog, goal)
    setSearch(''); setGrams(''); setSelected(null)
    showToast(`Added ${food.emoji} ${food.name} — +${protein}g protein`)
  }

  async function removeFood(id) {
    if (token) await apiCall('DELETE', `/protein-log/${id}`, null, token)
    const newLog = log.filter(f => f.id !== id)
    setLog(newLog)
    persist(newLog, goal)
  }

  async function clearLog() {
    if (!log.length) return
    if (token) {
      for (const item of log) await apiCall('DELETE', `/protein-log/${item.id}`, null, token)
    }
    setLog([])
    persist([], goal)
    showToast('Log cleared')
  }

  function setGoal() {
    const v = parseInt(goalInput)
    if (!v || v < 10) { showToast('Enter a valid goal.'); return }
    setGoalVal(v)
    persist(log, v)
    if (token) apiCall('PUT', '/protein-goal', { protein_goal: v, date: today() }, token)
    showToast(`Goal set to ${v}g protein`)
  }

  function autoGoal() {
    if (!lastWeightKg) { showToast('Calculate BMI first to auto-set goal.'); return }
    const g = Math.round(lastWeightKg * 1.6)
    setGoalVal(g); setGI(String(g))
    persist(log, g)
    if (token) apiCall('PUT', '/protein-goal', { protein_goal: g, date: today() }, token)
    showToast(`Goal auto-set to ${g}g (weight × 1.6)`)
  }

  const total     = log.reduce((s, f) => s + f.protein, 0)
  const remaining = Math.max(0, goal - total)
  const pct       = Math.min(100, Math.round((total / goal) * 100))

  const preview = selected && parseFloat(grams) > 0
    ? `→ ${selected.emoji} ${grams}g of ${selected.name} = ${((selected.protein * parseFloat(grams)) / 100).toFixed(1)}g protein`
    : selected ? `${selected.name}: ${selected.protein}g protein per 100g` : ''

  return (
    <div className={styles.wrap}>
      {/* Stats */}
      <div className={styles.hero}>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <div className={styles.statVal} style={{ color: 'var(--accent)' }}>{Math.round(total * 10) / 10}<small>g</small></div>
            <div className={styles.statLbl}>Consumed</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statVal} style={{ color: 'var(--text2)' }}>{goal}<small style={{ color: 'var(--text3)' }}>g</small></div>
            <div className={styles.statLbl}>Daily Goal</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statVal} style={{ color: total >= goal ? 'var(--green)' : 'var(--amber)' }}>
              {total >= goal ? '✓' : `${Math.round(remaining * 10) / 10}`}<small>g</small>
            </div>
            <div className={styles.statLbl}>Remaining</div>
          </div>
        </div>

        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressMeta}>
            <span>{pct}% of goal</span>
            <span>{log.length} item{log.length !== 1 ? 's' : ''} logged</span>
          </div>
        </div>

        <div className={styles.goalRow}>
          <label>Daily Goal (g):</label>
          <input type="number" value={goalInput} onChange={e => setGI(e.target.value)} min={10} max={500} />
          <button className={styles.btnSm} onClick={setGoal}>Set Goal</button>
          <button className={`${styles.btnSm} ${styles.accent}`} onClick={autoGoal}>Auto from weight</button>
        </div>
      </div>

      {/* Add food */}
      <div className={styles.adder}>
        <div className={styles.adderTitle}>Add Food</div>
        <div className={styles.adderRow}>
          <div className={styles.searchWrap}>
            <label className={styles.fieldLabel}>Food Name</label>
            <div className={styles.suggestContainer}>
              <input type="text" placeholder="Search food (e.g. paneer, almonds)" value={search}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFood(); if (e.key === 'Escape') setSugOpen(false) }}
                autoComplete="off" />
              {sugOpen && (
                <div className={styles.suggestions}>
                  {suggestions.map(f => (
                    <div key={f.name} className={styles.sugItem} onMouseDown={() => pickFood(f)}>
                      <span>{f.emoji} {f.name}</span>
                      <span className={styles.sugProtein}>{f.protein}g / 100g</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={styles.gramsWrap}>
            <label className={styles.fieldLabel}>Amount</label>
            <div className={styles.inputWrap}>
              <input type="number" placeholder="100" value={grams}
                onChange={e => setGrams(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFood()} />
              <span className={styles.unit}>g</span>
            </div>
          </div>
          <button className={styles.btnAdd} onClick={addFood}>+ Add</button>
        </div>
        {preview && <div className={styles.preview}>{preview}</div>}
      </div>

      {/* Food log */}
      <div className={styles.logCard}>
        <div className={styles.logHeader}>
          <span>Today's Log</span>
          <button className={styles.btnClear} onClick={clearLog}>Clear all</button>
        </div>
        {log.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nothing logged yet</strong>
            Search for a food above and add it to track your protein
          </div>
        ) : (
          log.map(f => (
            <div key={f.id} className={styles.foodItem}>
              <div className={styles.foodDot} />
              <div className={styles.foodName}>{f.emoji} {f.name}</div>
              <div className={styles.foodGrams}>{f.grams}g</div>
              <div className={styles.foodProtein}>{f.protein}<small>g</small></div>
              <button className={styles.btnRemove} onClick={() => removeFood(f.id)}>×</button>
            </div>
          ))
        )}
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
