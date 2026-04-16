import ExerciseAnim from './ExerciseAnim'
import styles from './ExerciseCard.module.css'

export default function ExerciseCard({ exKey, exercise }) {
  return (
    <div className={styles.card}>
      <div className={styles.animBox}>
        <ExerciseAnim exKey={exKey} />
      </div>
      <div className={styles.name}>{exercise.name}</div>
      <div className={styles.sets}>{exercise.sets}</div>
      <div className={styles.muscles}>{exercise.muscles}</div>
      <div className={styles.tip}>{exercise.tip}</div>
    </div>
  )
}
