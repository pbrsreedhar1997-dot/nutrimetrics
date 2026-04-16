import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import AuthModal from './components/Auth/AuthModal'
import Header from './components/Header/Header'
import BMICalculator from './components/BMI/BMICalculator'
import ProteinTracker from './components/Protein/ProteinTracker'
import WorkoutPlans from './components/Workout/WorkoutPlans'
import DietPlan from './components/DietPlan/DietPlan'

export default function App() {
  const { token, username, login, logout, isLoggedIn } = useAuth()
  const [tab, setTab]         = useState('bmi')
  const [authOpen, setAuthOpen] = useState(false)
  const [theme, setTheme]     = useState(() => localStorage.getItem('nm_theme') || 'dark')
  const [userStats, setUserStats] = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('nm_theme', theme)
  }, [theme])

  function handleBMIResult(stats) {
    setUserStats(stats)
  }

  return (
    <>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onLogin={login} />
      <div className="container">
        <Header
          tab={tab} onTabChange={setTab}
          username={username} isLoggedIn={isLoggedIn}
          onLoginClick={() => setAuthOpen(true)} onLogout={logout}
          theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        />
        {tab === 'bmi'     && <BMICalculator token={token} onBMIResult={handleBMIResult} />}
        {tab === 'protein' && <ProteinTracker token={token} userStats={userStats} />}
        {tab === 'workout' && <WorkoutPlans userStats={userStats} />}
        {tab === 'plan'    && <DietPlan userStats={userStats} onGoToBMI={() => setTab('bmi')} />}
      </div>
    </>
  )
}
