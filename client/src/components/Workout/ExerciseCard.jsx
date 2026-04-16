import { useState } from 'react'
import { EXERCISE_IMG_MAP } from '../../data/exercises'
import styles from './ExerciseCard.module.css'

export default function ExerciseCard({ exKey, exercise }) {
  const folder = EXERCISE_IMG_MAP[exKey]
  const [imgError, setImgError] = useState(false)

  return (
    <div className={styles.card}>
      <div className={styles.animBox}>
        {folder && !imgError ? (
          <div className={styles.imgWrap}>
            <img className={`${styles.img} ${styles.img0}`} src={`${folder}0.jpg`} alt={exercise.name} loading="lazy" onError={() => setImgError(true)} />
            <img className={`${styles.img} ${styles.img1}`} src={`${folder}1.jpg`} alt={exercise.name} loading="lazy" />
          </div>
        ) : (
          <div className={styles.fallback}>
            <span className={styles.fallbackIcon}>💪</span>
          </div>
        )}
      </div>
      <div className={styles.name}>{exercise.name}</div>
      <div className={styles.sets}>{exercise.sets}</div>
      <div className={styles.muscles}>{exercise.muscles}</div>
      <div className={styles.tip}>{exercise.tip}</div>
    </div>
  )
}
