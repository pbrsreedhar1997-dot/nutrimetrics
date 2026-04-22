import styles from './StatsBanner.module.css'

const catColor = {
  Underweight:    '#60a5fa',
  'Normal Weight':'#34d399',
  Overweight:     '#fbbf24',
  Obese:          '#f87171',
}
const catIcon = {
  Underweight:    '📉',
  'Normal Weight':'✅',
  Overweight:     '⚠️',
  Obese:          '🔴',
}
const catGoal = {
  Underweight:    'Gain weight',
  'Normal Weight':'Maintain',
  Overweight:     'Lose weight',
  Obese:          'Lose weight',
}

export default function StatsBanner({ userStats, onGoToBMI }) {
  if (!userStats) return null

  const { bmi, category, weightKg, heightCm, age, gender } = userStats
  const color = catColor[category] || 'var(--accent)'

  return (
    <div className={styles.banner} style={{ borderColor: `${color}40` }}>
      <div className={styles.left}>
        <div className={styles.bmiChip} style={{ background: `${color}18`, borderColor: `${color}50`, color }}>
          {catIcon[category]} BMI {bmi}
          <span className={styles.catLabel}>{category}</span>
        </div>
      </div>

      <div className={styles.pills}>
        {weightKg && (
          <div className={styles.pill}>
            <span className={styles.pillIcon}>⚖️</span>
            <span className={styles.pillVal}>{weightKg} <small>kg</small></span>
          </div>
        )}
        {heightCm && (
          <div className={styles.pill}>
            <span className={styles.pillIcon}>📏</span>
            <span className={styles.pillVal}>{Math.round(heightCm)} <small>cm</small></span>
          </div>
        )}
        {age && (
          <div className={styles.pill}>
            <span className={styles.pillIcon}>🎂</span>
            <span className={styles.pillVal}>{age} <small>yrs</small></span>
          </div>
        )}
        {gender && (
          <div className={styles.pill}>
            <span className={styles.pillIcon}>{gender === 'm' ? '♂' : '♀'}</span>
            <span className={styles.pillVal}>{gender === 'm' ? 'Male' : 'Female'}</span>
          </div>
        )}
        {category && (
          <div className={styles.pill} style={{ color }}>
            <span className={styles.pillIcon}>🎯</span>
            <span className={styles.pillVal}>{catGoal[category]}</span>
          </div>
        )}
      </div>

      <button className={styles.updateBtn} onClick={onGoToBMI} title="Update measurements">
        ✏ Update
      </button>
    </div>
  )
}
