import { useState, useEffect, useRef } from 'react'
import { EXERCISE_IMG_MAP } from '../../data/exercises'
import styles from './ExerciseCard.module.css'

// How long each frame stays fully visible (ms)
const HOLD_MS = 1400

export default function ExerciseCard({ exKey, exercise }) {
  const folder   = EXERCISE_IMG_MAP[exKey]
  const [imgError, setImgError]     = useState(false)
  const [img1Ready, setImg1Ready]   = useState(false)
  const [showSecond, setShowSecond] = useState(false)
  const intervalRef = useRef(null)

  // Preload both images; only start cycling once img1 has loaded
  useEffect(() => {
    if (!folder || imgError) return

    const im0 = new Image()
    const im1 = new Image()

    im0.src = `${folder}0.jpg`
    im1.src = `${folder}1.jpg`

    im1.onload  = () => setImg1Ready(true)
    im1.onerror = () => setImgError(true)
    im0.onerror = () => setImgError(true)

    return () => {
      im0.onload = im0.onerror = null
      im1.onload = im1.onerror = null
    }
  }, [folder])

  // Start cycling only after img1 has loaded
  useEffect(() => {
    if (!img1Ready) return
    intervalRef.current = setInterval(() => {
      setShowSecond(v => !v)
    }, HOLD_MS)
    return () => clearInterval(intervalRef.current)
  }, [img1Ready])

  return (
    <div className={styles.card}>
      <div className={styles.animBox}>
        {folder && !imgError ? (
          <div className={styles.imgWrap}>
            {/* Frame 0 */}
            <img
              className={styles.img}
              style={{ opacity: showSecond ? 0 : 1 }}
              src={`${folder}0.jpg`}
              alt={exercise.name}
              loading="eager"
              onError={() => setImgError(true)}
            />
            {/* Frame 1 — rendered only after it loads to avoid blank flash */}
            {img1Ready && (
              <img
                className={styles.img}
                style={{ opacity: showSecond ? 1 : 0 }}
                src={`${folder}1.jpg`}
                alt={exercise.name}
              />
            )}
            {/* Loading shimmer before img1 is ready */}
            {!img1Ready && <div className={styles.shimmer} />}
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
