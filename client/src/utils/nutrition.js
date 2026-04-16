// Mifflin-St Jeor BMR
export function calcBMR(weightKg, heightCm, age, gender) {
  if (!weightKg || !heightCm) return 0
  const a = age || 25
  const base = 10 * weightKg + 6.25 * heightCm - 5 * a
  return gender === 'f' ? base - 161 : base + 5
}

export function calcTDEE(bmr, activity = 'moderate') {
  const factors = { sedentary: 1.2, moderate: 1.55, active: 1.725 }
  return Math.round(bmr * (factors[activity] || 1.55))
}

export function getDietGoal(bmi) {
  if (!bmi) return 'maintain'
  if (bmi >= 25) return 'lose'
  if (bmi < 18.5) return 'gain'
  return 'maintain'
}

export function getCalorieTarget(tdee, dietGoal) {
  if (dietGoal === 'lose') return Math.max(1200, tdee - 500)
  if (dietGoal === 'gain') return tdee + 300
  return tdee
}

export function getMacros(calories, dietGoal) {
  const ratios = {
    lose:     { protein: 0.35, carbs: 0.35, fat: 0.30 },
    maintain: { protein: 0.30, carbs: 0.40, fat: 0.30 },
    gain:     { protein: 0.30, carbs: 0.45, fat: 0.25 },
  }
  const r = ratios[dietGoal] || ratios.maintain
  return {
    protein: Math.round((calories * r.protein) / 4),
    carbs:   Math.round((calories * r.carbs)   / 4),
    fat:     Math.round((calories * r.fat)      / 9),
  }
}

const MEAL_PLANS = {
  lose: {
    goalLabel: 'Weight Loss',
    meals: [
      { name: 'Breakfast', icon: '🌅', pct: 0.25, foods: ['Boiled Eggs (2)', 'Greek Yogurt (150g)', 'Oatmeal (40g)', 'Black Coffee / Green Tea'] },
      { name: 'Lunch',     icon: '☀️', pct: 0.35, foods: ['Grilled Chicken (150g)', 'Steamed Broccoli', 'Brown Rice (80g)', 'Cucumber-Tomato Salad'] },
      { name: 'Snack',     icon: '🍎', pct: 0.15, foods: ['Almonds (25g)', 'Low-fat Cottage Cheese', 'Green Apple'] },
      { name: 'Dinner',    icon: '🌙', pct: 0.25, foods: ['Grilled Salmon / Tofu (150g)', 'Stir-fried Vegetables', 'Quinoa / Soup'] },
    ],
    tips: [
      'Eat protein with every meal to stay satiated',
      'Avoid refined sugars, white bread, and fried foods',
      'Drink a glass of water 30 min before each meal',
      'Aim for 7–8 hours of quality sleep',
    ],
  },
  maintain: {
    goalLabel: 'Maintain Weight',
    meals: [
      { name: 'Breakfast', icon: '🌅', pct: 0.25, foods: ['Scrambled Eggs (2)', 'Whole Grain Toast (2 slices)', 'Banana', 'Low-fat Milk (200ml)'] },
      { name: 'Lunch',     icon: '☀️', pct: 0.35, foods: ['Chicken / Dal (150g)', 'White / Brown Rice (100g)', 'Mixed Salad', 'Curd (100g)'] },
      { name: 'Snack',     icon: '🍎', pct: 0.15, foods: ['Mixed Nuts (30g)', 'Seasonal Fruit', 'Buttermilk'] },
      { name: 'Dinner',    icon: '🌙', pct: 0.25, foods: ['Fish / Paneer (120g)', 'Roti / Chapati (2)', 'Stir-fried Sabzi', 'Salad'] },
    ],
    tips: [
      'Eat at consistent meal times every day',
      'Balance all macronutrients across meals',
      'Include 5 servings of fruits and vegetables daily',
      'Stay active with at least 30 min of movement',
    ],
  },
  gain: {
    goalLabel: 'Muscle Gain',
    meals: [
      { name: 'Breakfast', icon: '🌅', pct: 0.25, foods: ['Oatmeal with Banana (80g)', 'Scrambled Eggs (3)', 'Whole Milk (250ml)', 'Peanut Butter (1 tbsp)'] },
      { name: 'Lunch',     icon: '☀️', pct: 0.35, foods: ['Chicken Breast (200g)', 'White Rice (150g)', 'Sweet Potato (100g)', 'Olive Oil drizzle'] },
      { name: 'Snack',     icon: '🍎', pct: 0.15, foods: ['Protein Shake (30g whey)', 'Almonds (30g)', 'Banana'] },
      { name: 'Dinner',    icon: '🌙', pct: 0.25, foods: ['Beef / Paneer (150g)', 'Pasta / Rice (120g)', 'Steamed Broccoli', 'Cottage Cheese (100g)'] },
    ],
    tips: [
      'Eat in a calorie surplus consistently',
      'Consume protein within 30 min post-workout',
      'Include calorie-dense whole foods (nuts, avocado, milk)',
      'Strength train 4–5 days per week for best results',
    ],
  },
}

export function generateDietPlan(stats) {
  const { weightKg, heightCm, age, gender, bmi } = stats
  const bmr       = calcBMR(weightKg, heightCm, age, gender)
  const tdee      = calcTDEE(bmr, 'moderate')
  const dietGoal  = getDietGoal(bmi)
  const calories  = getCalorieTarget(tdee, dietGoal)
  const macros    = getMacros(calories, dietGoal)
  const waterL    = Math.round(weightKg * 0.033 * 10) / 10
  const template  = MEAL_PLANS[dietGoal]

  const meals = template.meals.map(m => ({
    ...m,
    calories: Math.round(calories * m.pct),
    protein:  Math.round(macros.protein * m.pct),
  }))

  return {
    bmr:      Math.round(bmr),
    tdee,
    dietGoal,
    goalLabel: template.goalLabel,
    calories,
    macros,
    waterL,
    meals,
    tips: template.tips,
  }
}

// Maps BMI to recommended workout goal string matching PLANS keys
export function getWorkoutGoal(bmi) {
  if (!bmi) return null
  if (bmi >= 25)   return 'lose'
  if (bmi < 18.5)  return 'muscle'
  return 'maintain'
}
