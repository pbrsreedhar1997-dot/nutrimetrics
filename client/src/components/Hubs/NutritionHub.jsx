import { useState } from 'react'
import DietTracker from '../DietTracker/DietTracker'
import BMICalculator from '../BMI/BMICalculator'
import DietPlan from '../DietPlan/DietPlan'
import Recipes from '../Recipes/Recipes'
import styles from './Hubs.module.css'

const TABS = [
  { id: 'diet',    label: '🍽 Diet' },
  { id: 'bmi',     label: '⚖️ BMI' },
  { id: 'plan',    label: '📋 Plan' },
  { id: 'recipes', label: '🥑 Recipes' },
]

export default function NutritionHub({ token, userStats, onBMIResult }) {
  const [tab, setTab] = useState('diet')
  return (
    <div className={styles.wrap}>
      <div className={styles.subTabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.subTab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'diet'    && <DietTracker   token={token} userStats={userStats} />}
      {tab === 'bmi'     && <BMICalculator token={token} onBMIResult={onBMIResult} savedStats={userStats} />}
      {tab === 'plan'    && <DietPlan      userStats={userStats} onGoToBMI={() => setTab('bmi')} />}
      {tab === 'recipes' && <Recipes       userStats={userStats} />}
    </div>
  )
}
