import styles from './Header.module.css'

const TABS = [
  { id: 'bmi',     label: '⚖ BMI',      fullLabel: '⚖ BMI Calculator', icon: '⚖',  navLabel: 'BMI' },
  { id: 'protein', label: '🥩 Protein',  fullLabel: '🥩 Protein Tracker', icon: '🥩', navLabel: 'Protein' },
  { id: 'workout', label: '💪 Workout',  fullLabel: '💪 Workout Plans',   icon: '💪', navLabel: 'Workout' },
  { id: 'plan',    label: '📋 My Plan',  fullLabel: '📋 My Plan',         icon: '📋', navLabel: 'My Plan' },
]

export default function Header({ tab, onTabChange, username, isLoggedIn, onLoginClick, onLogout, theme, onThemeToggle }) {
  return (
    <>
      <div className={styles.topbar}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <div className={styles.logoName}>Nutri<span>Metrics</span></div>
            <div className={styles.logoTag}>Health Intelligence</div>
          </div>
          <div className={styles.actions}>
            <button className={styles.themeToggle} onClick={onThemeToggle} title="Toggle theme" data-theme={theme} />
            {isLoggedIn ? (
              <div className={styles.userChip}>
                <div className={styles.avatar}>{username?.[0]?.toUpperCase()}</div>
                <span className={styles.uname}>{username}</span>
                <button className={styles.logoutBtn} onClick={onLogout}>Logout</button>
              </div>
            ) : (
              <button className={styles.loginBtn} onClick={onLoginClick}>Sign In</button>
            )}
          </div>
        </header>

        <div className={styles.tabs}>
          {TABS.map(t => (
            <button key={t.id} className={`${styles.tabBtn} ${tab === t.id ? styles.active : ''}`}
              onClick={() => onTabChange(t.id)}>
              {t.fullLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className={styles.bottomNav}>
        <div className={styles.bottomNavInner}>
          {TABS.map(t => (
            <button key={t.id} className={`${styles.navItem} ${tab === t.id ? styles.active : ''}`}
              onClick={() => onTabChange(t.id)}>
              <span className={styles.navIcon}>{t.icon}</span>
              <span className={styles.navLabel}>{t.navLabel}</span>
              <span className={styles.navDot} />
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
