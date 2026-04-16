import { useState, useEffect } from 'react'
import { PLANS, EXERCISES } from '../../data/exercises'
import { getWorkoutGoal } from '../../utils/nutrition'
import ExerciseCard from './ExerciseCard'
import styles from './WorkoutPlans.module.css'

const GOALS = [
  { id: 'lose',     icon: '🔥', name: 'Lose Weight',  desc: 'Cardio + HIIT to burn fat and shed kilos' },
  { id: 'muscle',   icon: '💪', name: 'Build Muscle',  desc: 'Strength training to grow lean mass' },
  { id: 'maintain', icon: '⚖️', name: 'Stay Fit',     desc: 'Balanced mix to maintain health and energy' },
]
const LEVELS = ['beginner', 'intermediate', 'advanced']

export default function WorkoutPlans({ userStats }) {
  const bmi = userStats?.bmi ?? null
  const [goal, setGoal]   = useState(null)
  const [level, setLevel] = useState('beginner')
  const [plan, setPlan]   = useState(null)
  const [dayIdx, setDayIdx] = useState(0)
  const [hint, setHint]   = useState('')
  const [autoApplied, setAutoApplied] = useState(false)

  useEffect(() => {
    if (userStats?.bmi && !autoApplied) {
      const recommended = getWorkoutGoal(userStats.bmi)
      setGoal(recommended)
      setPlan(PLANS[recommended])
      setDayIdx(0)
      setAutoApplied(true)
      const bmiLabel = userStats.bmi
      if (recommended === 'lose')     setHint(`BMI ${bmiLabel} detected — auto-selected Weight Loss plan to help you reach a healthy range.`)
      else if (recommended === 'muscle') setHint(`BMI ${bmiLabel} detected — auto-selected Muscle Building plan to help you gain healthy weight.`)
      else setHint(`BMI ${bmiLabel} — you're in a healthy range! Auto-selected a Maintain Fitness plan.`)
    }
  }, [userStats])

  function generate() {
    if (!goal) return
    if (bmi) {
      if (goal === 'lose' && bmi < 25) setHint(`Your BMI is ${bmi} (healthy). This plan will still lean you out and build endurance.`)
      else if (goal === 'muscle' && bmi >= 30) setHint(`Your BMI is ${bmi}. We'll focus on compound movements for your goals.`)
      else setHint(`Your BMI is ${bmi}. This plan is well-matched to your current stats!`)
    }
    setPlan(PLANS[goal])
    setDayIdx(0)
  }

  const days = plan ? plan[level] : null
  const activeDay = days ? days[dayIdx] : null
  const isFullRest = activeDay && activeDay.rest && activeDay.exs.length === 0

  return (
    <div className={styles.wrap}>
      {/* Goal selector */}
      <div className={styles.selectorCard}>
        <div className={styles.cardTitle}>Choose Your Fitness Goal</div>
        <div className={styles.goalGrid}>
          {GOALS.map(g => (
            <div key={g.id} className={`${styles.goalCard} ${goal === g.id ? styles.selected : ''}`}
              onClick={() => setGoal(g.id)}>
              <div className={styles.goalIcon}>{g.icon}</div>
              <div className={styles.goalName}>{g.name}</div>
              <div className={styles.goalDesc}>{g.desc}</div>
            </div>
          ))}
        </div>

        <div className={styles.levelWrap}>
          <div className={styles.subTitle}>Fitness Level</div>
          <div className={styles.levelBtns}>
            {LEVELS.map(l => (
              <button key={l} className={`${styles.levelBtn} ${level === l ? styles.active : ''}`}
                onClick={() => setLevel(l)} style={{ textTransform: 'capitalize' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {hint && <div className={styles.hint}>{hint}</div>}
        <button className={styles.genBtn} onClick={generate}>Generate My Plan</button>
      </div>

      {/* Plan output */}
      {plan && days && (
        <div className={styles.planOutput}>
          {/* Plan header */}
          <div className={styles.planHeader}>
            <div className={styles.planIcon}>{plan.icon}</div>
            <div>
              <div className={styles.planName}>{plan.label}</div>
              <div className={styles.planSub}>{plan.sub}</div>
              <div className={styles.badges}>
                {plan.badges.map(b => (
                  <span key={b.text} className={`${styles.badge} ${styles[`badge_${b.cls}`]}`}>{b.text}</span>
                ))}
                <span className={`${styles.badge} ${styles.badge_accent}`} style={{ textTransform: 'capitalize' }}>{level}</span>
              </div>
            </div>
          </div>

          {/* Week grid */}
          <div className={styles.weekCard}>
            <div className={styles.cardTitle}>Weekly Schedule</div>
            <div className={styles.weekScroll}>
              <div className={styles.weekGrid}>
                {days.map((d, i) => (
                  <div key={i}
                    className={`${styles.dayPill} ${i === dayIdx ? styles.dayActive : ''} ${d.rest && !d.exs.length ? styles.restDay : ''}`}
                    onClick={() => setDayIdx(i)}>
                    <div className={styles.dayName}>{d.day}</div>
                    <div className={styles.dayType}>{d.label.split(' ')[0]}</div>
                    <div className={styles.dayDot} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Day exercises */}
          {activeDay && (
            <div className={styles.dayPanel}>
              <div className={styles.dayHeader}>
                <div>
                  <div className={styles.dayHeaderLabel}>{activeDay.day} — {activeDay.label}</div>
                  <div className={styles.dayHeaderSub}>{isFullRest ? 'Recovery' : `${activeDay.exs.length} exercises`}</div>
                </div>
                <span className={`${styles.badge} ${styles.badge_accent}`}>{activeDay.day}</span>
              </div>

              {isFullRest ? (
                <div className={styles.restCard}>
                  <div className={styles.restIcon}>😴</div>
                  <div className={styles.restTitle}>Rest Day</div>
                  <div className={styles.restSub}>Your muscles grow during recovery. Hydrate, sleep well, and relax.</div>
                </div>
              ) : (
                <div className={styles.exGrid}>
                  {activeDay.exs.map(key => (
                    EXERCISES[key] ? <ExerciseCard key={key} exKey={key} exercise={EXERCISES[key]} /> : null
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
