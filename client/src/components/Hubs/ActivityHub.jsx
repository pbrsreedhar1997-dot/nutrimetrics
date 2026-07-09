import { useState } from 'react'
import StepSync from '../Activity/StepSync'
import WorkoutPlans from '../Workout/WorkoutPlans'
import styles from './Hubs.module.css'

const TABS = [
  { id: 'steps',    label: '🚶 Steps' },
  { id: 'workouts', label: '💪 Workouts' },
]

export default function ActivityHub({ token, userStats }) {
  const [tab, setTab] = useState('steps')
  return (
    <div className={styles.wrap}>
      <div className={styles.subTabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.subTab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'steps'    && <StepSync token={token} userStats={userStats} />}
      {tab === 'workouts' && <WorkoutPlans userStats={userStats} />}
    </div>
  )
}
