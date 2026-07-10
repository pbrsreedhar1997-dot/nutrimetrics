import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import StepSync from '../Activity/StepSync'
import ActivityTracker from '../Activity/ActivityTracker'
import WorkoutPlans from '../Workout/WorkoutPlans'
import styles from './Hubs.module.css'

const TABS = [
  { id: 'steps',    label: '🚶 Steps' },
  { id: 'workouts', label: '💪 Workouts' },
]

// In the installed app → accurate Health Connect steps (StepSync).
// On web / iPhone (no Health Connect) → the phone's motion-sensor pedometer.
const isNative = Capacitor.isNativePlatform()

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
      {tab === 'steps'    && (isNative
        ? <StepSync token={token} userStats={userStats} />
        : <ActivityTracker token={token} userStats={userStats} />)}
      {tab === 'workouts' && <WorkoutPlans userStats={userStats} />}
    </div>
  )
}
