import { useMemo } from 'react'
import { generateDietPlan } from '../../utils/nutrition'
import styles from './DietPlan.module.css'

const GOAL_COLORS = {
  lose:     { color: '#ff5a5a', bg: 'rgba(255,90,90,0.1)',  icon: '🔥', label: 'Weight Loss' },
  maintain: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', icon: '⚖️', label: 'Maintain Fitness' },
  gain:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', icon: '💪', label: 'Muscle Gain' },
}

export default function DietPlan({ userStats, onGoToBMI }) {
  const plan = useMemo(() => {
    if (!userStats?.weightKg || !userStats?.heightCm) return null
    return generateDietPlan(userStats)
  }, [userStats])

  if (!plan) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📋</div>
        <div className={styles.emptyTitle}>No Data Yet</div>
        <div className={styles.emptyText}>
          Complete the BMI Calculator first — your personalized diet plan will appear here instantly.
        </div>
        <button className={styles.goBtn} onClick={onGoToBMI}>Go to BMI Calculator</button>
      </div>
    )
  }

  const gc = GOAL_COLORS[plan.dietGoal] || GOAL_COLORS.maintain
  const totalMacroG = plan.macros.protein + plan.macros.carbs + plan.macros.fat * 2.25
  const proteinPct  = Math.round((plan.macros.protein * 4 / plan.calories) * 100)
  const carbsPct    = Math.round((plan.macros.carbs   * 4 / plan.calories) * 100)
  const fatPct      = Math.round((plan.macros.fat     * 9 / plan.calories) * 100)

  function downloadPDF() {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()
      let y = 18

      // Header
      doc.setFillColor(0, 229, 192)
      doc.rect(0, 0, pw, 14, 'F')
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('NutriMetrics — Personalized Diet Plan', pw / 2, 9, { align: 'center' })

      doc.setTextColor(40, 40, 40)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, pw / 2, y, { align: 'center' })
      y += 8

      // User stats box
      doc.setFillColor(245, 245, 245)
      doc.roundedRect(14, y, pw - 28, 22, 3, 3, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Your Stats', 20, y + 7)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      const statsLine = [
        userStats.weightKg   ? `Weight: ${userStats.weightKg} kg`    : '',
        userStats.heightCm   ? `Height: ${userStats.heightCm} cm`    : '',
        userStats.bmi        ? `BMI: ${userStats.bmi}`               : '',
        userStats.age        ? `Age: ${userStats.age} yrs`           : '',
        userStats.gender     ? `Gender: ${userStats.gender === 'm' ? 'Male' : 'Female'}` : '',
      ].filter(Boolean).join('   |   ')
      doc.text(statsLine, 20, y + 14)
      y += 28

      // Calorie + macros
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(0, 180, 150)
      doc.text(`Goal: ${gc.label}`, 14, y)
      y += 6
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`BMR: ${plan.bmr} kcal   |   TDEE (moderate): ${plan.tdee} kcal   |   Daily Target: ${plan.calories} kcal`, 14, y)
      y += 6
      doc.text(`Protein: ${plan.macros.protein}g (${proteinPct}%)   |   Carbs: ${plan.macros.carbs}g (${carbsPct}%)   |   Fat: ${plan.macros.fat}g (${fatPct}%)   |   Water: ${plan.waterL}L / day`, 14, y)
      y += 10

      // Meals
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text('Meal Plan', 14, y)
      y += 5

      for (const meal of plan.meals) {
        doc.setFillColor(240, 250, 248)
        doc.roundedRect(14, y, pw - 28, 5 + meal.foods.length * 5 + 2, 2, 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(0, 140, 120)
        doc.text(`${meal.name}  —  ~${meal.calories} kcal  |  ~${meal.protein}g protein`, 18, y + 5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(50, 50, 50)
        meal.foods.forEach((f, i) => {
          doc.text(`• ${f}`, 20, y + 10 + i * 5)
        })
        y += 5 + meal.foods.length * 5 + 6
        if (y > 260) { doc.addPage(); y = 18 }
      }

      // Tips
      y += 2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text('Tips & Reminders', 14, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      plan.tips.forEach(tip => {
        doc.text(`• ${tip}`, 18, y)
        y += 6
      })

      // Footer
      doc.setFontSize(8)
      doc.setTextColor(160, 160, 160)
      doc.text('NutriMetrics — For informational purposes only. Consult a healthcare professional for medical advice.', pw / 2, 290, { align: 'center' })

      doc.save('NutriMetrics_DietPlan.pdf')
    })
  }

  return (
    <div className={styles.wrap}>
      {/* Hero */}
      <div className={styles.hero} style={{ borderColor: gc.color + '40', background: `linear-gradient(135deg, var(--surface) 0%, ${gc.bg} 100%)` }}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}>{gc.icon}</div>
          <div>
            <div className={styles.heroGoal} style={{ color: gc.color }}>{gc.label} Plan</div>
            <div className={styles.heroSub}>Personalized from your BMI & body measurements</div>
          </div>
        </div>
        <button className={styles.pdfBtn} onClick={downloadPDF}>
          <span className={styles.pdfIcon}>⬇</span> Download PDF
        </button>
      </div>

      {/* Stats strip */}
      <div className={styles.statsRow}>
        {[
          { label: 'Your BMI',    val: userStats.bmi,         unit: '',    color: 'var(--text)' },
          { label: 'BMR',        val: plan.bmr,               unit: 'kcal', color: 'var(--text2)' },
          { label: 'Daily TDEE', val: plan.tdee,              unit: 'kcal', color: 'var(--text2)' },
          { label: 'Calorie Target', val: plan.calories,      unit: 'kcal', color: gc.color },
          { label: 'Water / day', val: `${plan.waterL}L`,    unit: '',     color: '#5b9cf6' },
        ].map(s => (
          <div key={s.label} className={styles.statBox}>
            <div className={styles.statVal} style={{ color: s.color }}>{s.val}<small>{s.unit}</small></div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Macros */}
      <div className={styles.macroCard}>
        <div className={styles.cardTitle}>Daily Macros</div>
        <div className={styles.macroRow}>
          {[
            { name: 'Protein', grams: plan.macros.protein, pct: proteinPct, color: '#00e5c0', bar: '#00e5c0' },
            { name: 'Carbs',   grams: plan.macros.carbs,   pct: carbsPct,   color: '#fbbf24', bar: '#fbbf24' },
            { name: 'Fat',     grams: plan.macros.fat,     pct: fatPct,     color: '#a78bfa', bar: '#a78bfa' },
          ].map(m => (
            <div key={m.name} className={styles.macroItem}>
              <div className={styles.macroTop}>
                <span className={styles.macroName}>{m.name}</span>
                <span className={styles.macroGrams} style={{ color: m.color }}>{m.grams}g</span>
              </div>
              <div className={styles.macroBarTrack}>
                <div className={styles.macroBarFill} style={{ width: `${m.pct}%`, background: m.bar }} />
              </div>
              <div className={styles.macroPct}>{m.pct}% of calories</div>
            </div>
          ))}
        </div>
      </div>

      {/* Meal cards */}
      <div className={styles.mealsTitle}>Daily Meal Plan</div>
      <div className={styles.mealsGrid}>
        {plan.meals.map(meal => (
          <div key={meal.name} className={styles.mealCard}>
            <div className={styles.mealHeader}>
              <span className={styles.mealIcon}>{meal.icon}</span>
              <div>
                <div className={styles.mealName}>{meal.name}</div>
                <div className={styles.mealMeta}>~{meal.calories} kcal &nbsp;·&nbsp; ~{meal.protein}g protein</div>
              </div>
            </div>
            <ul className={styles.mealList}>
              {meal.foods.map(f => (
                <li key={f} className={styles.mealFood}>
                  <span className={styles.foodDot} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className={styles.tipsCard}>
        <div className={styles.cardTitle}>Tips for {gc.label}</div>
        <div className={styles.tipsList}>
          {plan.tips.map((tip, i) => (
            <div key={i} className={styles.tipItem}>
              <span className={styles.tipNum}>{i + 1}</span>
              {tip}
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className={styles.disclaimer}>
        For informational purposes only. Consult a healthcare professional before making significant dietary changes.
      </div>
    </div>
  )
}
