import { useState } from 'react'
import { RECIPES } from '../../data/recipes'
import styles from './Recipes.module.css'

const DIET_OPTIONS = [
  { id: 'veg',    label: 'Vegetarian', icon: '🥦' },
  { id: 'egg',    label: 'Eggetarian', icon: '🥚' },
  { id: 'nonveg', label: 'Non-Veg',   icon: '🍗' },
]
const GOAL_OPTIONS = [
  { id: 'lose',     label: 'Lose Weight', icon: '📉' },
  { id: 'maintain', label: 'Maintain',    icon: '⚖️' },
  { id: 'gain',     label: 'Gain Weight', icon: '📈' },
]

function autoGoal(userStats) {
  if (!userStats?.bmi) return null
  if (userStats.bmi >= 25)   return 'lose'
  if (userStats.bmi < 18.5)  return 'gain'
  return 'maintain'
}

export default function Recipes({ userStats }) {
  const [dietPref, setDietPref] = useState(
    () => localStorage.getItem('nm_dietpref') || 'veg'
  )
  const [goalOverride, setGoalOverride] = useState(null)
  const [expandedId, setExpandedId]     = useState(null)

  function chooseDiet(id) {
    setDietPref(id)
    localStorage.setItem('nm_dietpref', id)
  }

  const activeGoal   = goalOverride || autoGoal(userStats)
  const goalLabel    = GOAL_OPTIONS.find(g => g.id === activeGoal)?.label || ''
  const bmiAutoGoal  = autoGoal(userStats)

  const filtered = RECIPES.filter(r =>
    r.diet === dietPref &&
    (activeGoal ? r.goal.includes(activeGoal) : true)
  )

  function toggleCard(id) {
    setExpandedId(prev => prev === id ? null : id)
  }

  return (
    <div className={styles.wrap}>

      {/* Intro */}
      <div className="tab-intro" style={{
        background:'linear-gradient(135deg,rgba(251,191,36,0.07) 0%,rgba(248,113,113,0.05) 100%)',
        borderColor:'rgba(251,191,36,0.22)'
      }}>
        <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,#fbbf24,#f87171)'}}/>
        <div className="tab-intro-icon" style={{background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.25)'}}>🍽️</div>
        <div>
          <div className="tab-intro-title">Healthy Recipes</div>
          <div className="tab-intro-sub">Simple salads and bowls filtered by your diet type and weight goal</div>
        </div>
      </div>

      {/* ── Filter card ── */}
      <div className={styles.filterCard}>
        <div className={styles.filterInner}>
          {/* Diet type section */}
          <div className={styles.filterSection}>
            <div className={styles.filterLabel}>Diet Type</div>
            <div className={styles.dietRow}>
              {DIET_OPTIONS.map(d => (
                <button
                  key={d.id}
                  className={`${styles.dietBtn} ${dietPref === d.id ? styles.dietActive : ''}`}
                  onClick={() => chooseDiet(d.id)}
                >
                  <span className={styles.dietIcon}>{d.icon}</span>
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Goal section */}
          <div className={styles.filterSection}>
            <div className={styles.filterLabel}>
              Goal
              {bmiAutoGoal && !goalOverride && (
                <span className={styles.autoTag}>auto from BMI</span>
              )}
            </div>
            <div className={styles.goalRow}>
              {GOAL_OPTIONS.map(g => (
                <button
                  key={g.id}
                  className={`${styles.goalChip} ${activeGoal === g.id ? styles.goalActive : ''}`}
                  onClick={() => setGoalOverride(prev => prev === g.id ? null : g.id)}
                >
                  {g.icon} {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* No BMI notice */}
        {!userStats && !goalOverride && (
          <div className={styles.noStats}>
            Calculate your BMI first to get auto-personalised recipes — or pick a goal above.
          </div>
        )}
      </div>

      {/* ── Results header ── */}
      {filtered.length > 0 && (
        <div className={styles.resultsHeader}>
          <span className={styles.resultsCount}>{filtered.length} recipe{filtered.length !== 1 ? 's' : ''}</span>
          {activeGoal && (
            <span className={styles.resultsMeta}>
              for <strong>{goalLabel}</strong> · {DIET_OPTIONS.find(d => d.id === dietPref)?.label}
            </span>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🍽️</div>
          <div className={styles.emptyTitle}>No recipes found</div>
          <div className={styles.emptyText}>Try changing diet type or goal above.</div>
        </div>
      )}

      {/* ── Recipe cards ── */}
      <div className={styles.grid}>
        {filtered.map(recipe => {
          const isOpen = expandedId === recipe.id
          return (
            <div key={recipe.id} className={`${styles.card} ${isOpen ? styles.cardOpen : ''}`}>

              {/* Card top */}
              <div className={styles.cardTop}>
                <div className={styles.recipeEmoji}>{recipe.emoji}</div>
                <div className={styles.recipeMeta}>
                  <div className={styles.recipeName}>{recipe.name}</div>
                  <div className={styles.chips}>
                    <span className={styles.tagChip}>{recipe.tag}</span>
                    <span className={styles.timeChip}>⏱ {recipe.time}</span>
                    <span className={styles.calChip}>🔥 {recipe.calories} kcal</span>
                  </div>
                </div>
              </div>

              {/* Nutrition strip */}
              <div className={styles.nutrRow}>
                <span className={styles.nutrItem} style={{ color: 'var(--accent)' }}>
                  P <strong>{recipe.protein}g</strong>
                </span>
                <span className={styles.nutrDot}>·</span>
                <span className={styles.nutrItem} style={{ color: 'var(--amber)' }}>
                  C <strong>{recipe.carbs}g</strong>
                </span>
                <span className={styles.nutrDot}>·</span>
                <span className={styles.nutrItem} style={{ color: 'var(--purple)' }}>
                  F <strong>{recipe.fat}g</strong>
                </span>
              </div>

              {/* Expand toggle */}
              <button className={styles.expandBtn} onClick={() => toggleCard(recipe.id)}>
                {isOpen ? 'Hide details ▲' : 'Ingredients & Steps ▾'}
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className={styles.expandedContent}>
                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Ingredients</div>
                    <ul className={styles.ingredientList}>
                      {recipe.ingredients.map((ing, i) => (
                        <li key={i} className={styles.ingredient}>
                          <span className={styles.bullet} />
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.section}>
                    <div className={styles.sectionTitle}>Steps</div>
                    <ol className={styles.stepList}>
                      {recipe.steps.map((step, i) => (
                        <li key={i} className={styles.step}>
                          <span className={styles.stepNum}>{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className={styles.tip}>
                    <span className={styles.tipIcon}>💡</span>
                    <span>{recipe.tip}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
