import { useState } from 'react'
import { apiCall } from '../../api'
import styles from './BMICalculator.module.css'

const colorMap = { blue: '#5b9cf6', green: '#4ade80', yellow: '#fbbf24', red: '#ff5a5a' }
const catColor  = { Underweight: 'blue', 'Normal Weight': 'green', Overweight: 'yellow', Obese: 'red' }
const catDetail = {
  Underweight:    'Below the healthy range. Consider consulting a nutritionist.',
  'Normal Weight':'Great! You are within a healthy BMI range.',
  Overweight:     'Slightly above healthy range. A balanced diet can help.',
  Obese:          'Consider consulting a healthcare professional for a plan.',
}

function buildResult(bmi, cat, wKg, hCm) {
  const colorKey    = catColor[cat] || 'green'
  const hM          = hCm / 100
  const minW        = (18.5 * hM * hM).toFixed(1)
  const maxW        = (24.9 * hM * hM).toFixed(1)
  const rangeStr    = `${minW}kg – ${maxW}kg`
  const pct         = Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100))
  const proteinGoal = Math.round(wKg * 1.6)
  return { bmi, cat, colorKey, detail: catDetail[cat] || '', rangeStr, pct, proteinGoal, wKg, hCm }
}

export default function BMICalculator({ token, onBMIResult, savedStats }) {
  const [heightUnit, setHeightUnit] = useState('cm')
  const [weightUnit, setWeightUnit] = useState('kg')

  // Pre-fill from saved stats (always metric — we store weightKg / heightCm)
  const [gender,   setGender]   = useState(savedStats?.gender || 'm')
  const [heightCm, setHeightCm] = useState(savedStats?.heightCm ? String(Math.round(savedStats.heightCm)) : '')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weight,   setWeight]   = useState(savedStats?.weightKg  ? String(savedStats.weightKg)  : '')
  const [age,      setAge]      = useState(savedStats?.age       ? String(savedStats.age)        : '')

  // Restore last result immediately if saved stats exist
  const [result, setResult] = useState(() => {
    if (savedStats?.bmi && savedStats?.category && savedStats?.weightKg && savedStats?.heightCm) {
      return buildResult(savedStats.bmi, savedStats.category, savedStats.weightKg, savedStats.heightCm)
    }
    return null
  })

  function calculate() {
    let hCm = heightUnit === 'cm'
      ? parseFloat(heightCm)
      : ((parseFloat(heightFt) || 0) * 12 + (parseFloat(heightIn) || 0)) * 2.54
    const wKg = weightUnit === 'kg' ? parseFloat(weight) : parseFloat(weight) * 0.453592

    if (!hCm || !wKg || hCm < 50 || wKg < 5) return

    const hM  = hCm / 100
    const bmi = Math.round((wKg / (hM * hM)) * 10) / 10

    let cat
    if      (bmi < 18.5) cat = 'Underweight'
    else if (bmi < 25)   cat = 'Normal Weight'
    else if (bmi < 30)   cat = 'Overweight'
    else                 cat = 'Obese'

    const res    = buildResult(bmi, cat, wKg, hCm)
    const ageNum = parseInt(age) || null
    setResult(res)

    onBMIResult && onBMIResult({
      weightKg: wKg, heightCm: hCm, age: ageNum, gender, bmi, category: cat
    })

    if (token) {
      apiCall('POST', '/bmi-log', {
        bmi, weight_kg: wKg, height_cm: hCm, category: cat, age: ageNum, gender
      }, token)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Body Measurements</div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span>Height</span>
              <div className={styles.unitToggle}>
                <button className={heightUnit === 'cm'   ? styles.active : ''} onClick={() => setHeightUnit('cm')}>cm</button>
                <button className={heightUnit === 'ftin' ? styles.active : ''} onClick={() => setHeightUnit('ftin')}>ft/in</button>
              </div>
            </div>
            {heightUnit === 'cm' ? (
              <div className={styles.inputWrap}>
                <input type="number" inputMode="decimal" placeholder="170"
                  value={heightCm} onChange={e => setHeightCm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && calculate()} />
                <span className={styles.unit}>cm</span>
              </div>
            ) : (
              <div className={styles.ftinRow}>
                <div className={styles.inputWrap}><input type="number" placeholder="5" value={heightFt} onChange={e => setHeightFt(e.target.value)} /><span className={styles.unit}>ft</span></div>
                <div className={styles.inputWrap}><input type="number" placeholder="7" value={heightIn} onChange={e => setHeightIn(e.target.value)} /><span className={styles.unit}>in</span></div>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <span>Weight</span>
              <div className={styles.unitToggle}>
                <button className={weightUnit === 'kg'  ? styles.active : ''} onClick={() => setWeightUnit('kg')}>kg</button>
                <button className={weightUnit === 'lbs' ? styles.active : ''} onClick={() => setWeightUnit('lbs')}>lbs</button>
              </div>
            </div>
            <div className={styles.inputWrap}>
              <input type="number" inputMode="decimal" placeholder="70"
                value={weight} onChange={e => setWeight(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && calculate()} />
              <span className={styles.unit}>{weightUnit}</span>
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.labelRow}><span>Age <small style={{ color: 'var(--text3)', fontSize: 10 }}>(optional)</small></span></div>
            <div className={styles.inputWrap}>
              <input type="number" inputMode="numeric" placeholder="25"
                value={age} onChange={e => setAge(e.target.value)} />
              <span className={styles.unit}>yrs</span>
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.labelRow}><span>Gender <small style={{ color: 'var(--text3)', fontSize: 10 }}>(optional)</small></span></div>
            <div className={styles.genderRow}>
              <button className={gender === 'm' ? styles.active : ''} onClick={() => setGender('m')}>Male</button>
              <button className={gender === 'f' ? styles.active : ''} onClick={() => setGender('f')}>Female</button>
            </div>
          </div>
        </div>

        <button className={styles.calcBtn} onClick={calculate}>
          {result ? 'Recalculate BMI' : 'Calculate BMI'}
        </button>
      </div>

      {result && (
        <div className={styles.result}>
          <div className={styles.scoreWrap}>
            <div className={styles.circle} style={{
              borderColor: colorMap[result.colorKey],
              boxShadow: `0 0 20px ${colorMap[result.colorKey]}30`
            }}>
              <div className={styles.circleBg} />
              <div className={styles.scoreInner}>
                <div className={styles.score}>{result.bmi}</div>
                <div className={styles.scoreLabel}>BMI</div>
              </div>
            </div>
            <div className={styles.info}>
              <div className={styles.cat} style={{ color: colorMap[result.colorKey] }}>{result.cat}</div>
              <div className={styles.detail}>{result.detail}</div>
              <div className={styles.rangeTag}>
                Healthy range: 18.5–24.9 &nbsp;·&nbsp; {result.rangeStr}
              </div>
            </div>
          </div>

          <div className={styles.gauge}>
            <div className={styles.gaugeTrack}>
              <div className={styles.gaugeNeedle} style={{ left: `${result.pct}%` }} />
            </div>
            <div className={styles.gaugeLabels}>
              <span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span>
            </div>
          </div>

          <div className={styles.proteinSuggest}>
            <div className={styles.suggestLabel}>Suggested daily protein from your weight</div>
            <div className={styles.suggestVal}>
              {result.proteinGoal}g / day &nbsp;
              <small style={{ color: 'var(--text3)', fontSize: 12 }}>(body weight × 1.6)</small>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
