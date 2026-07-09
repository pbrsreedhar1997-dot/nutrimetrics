import styles from './Header.module.css'

/* ── Crisp SVG icons (Lucide-style, 24×24 grid) ── */
function Ico({ size = 17, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const IcoHome = ({ size }) => (
  <Ico size={size}>
    <path d="M3 10.5L12 3l9 7.5"/>
    <path d="M5 9.5V21h14V9.5"/>
    <path d="M9 21v-6h6v6"/>
  </Ico>
)
const IcoActivity = ({ size }) => (
  <Ico size={size}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </Ico>
)
const IcoNutrition = ({ size }) => (
  <Ico size={size}>
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/>
    <path d="M7 2v20"/>
    <path d="M21 15V2l-9 5V2"/>
  </Ico>
)
const IcoSocial = ({ size }) => (
  <Ico size={size}>
    <circle cx="9" cy="8" r="3"/>
    <path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/>
    <circle cx="18" cy="7" r="2.3"/>
    <path d="M15.5 14c2.7.3 5 2.2 5 4.7"/>
  </Ico>
)

const TABS = [
  { id: 'home',      fullLabel: 'Home',      navLabel: 'Home',      Icon: IcoHome      },
  { id: 'activity',  fullLabel: 'Activity',  navLabel: 'Activity',  Icon: IcoActivity  },
  { id: 'nutrition', fullLabel: 'Nutrition', navLabel: 'Nutrition', Icon: IcoNutrition },
  { id: 'social',    fullLabel: 'Social',    navLabel: 'Social',    Icon: IcoSocial    },
]

export default function Header({ tab, onTabChange, username, isLoggedIn, onLoginClick, onLogout, theme, onThemeToggle, hasNotif }) {
  return (
    <>
      <div className={styles.topbar}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <div className={styles.logoName}>Nutri<span>Metrics</span></div>
            <div className={styles.logoTag}>Health Intelligence Platform</div>
          </div>
          <div className={styles.actions}>
            <button className={styles.themeToggle} onClick={onThemeToggle}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              data-theme={theme} />
            {isLoggedIn ? (
              <div className={styles.userChip}>
                <div className={styles.avatar}>{username?.[0]?.toUpperCase()}</div>
                <span className={styles.uname}>{username}</span>
                <button className={styles.logoutBtn} onClick={onLogout}>Sign out</button>
              </div>
            ) : (
              <button className={styles.loginBtn} onClick={onLoginClick}>Sign In</button>
            )}
          </div>
        </header>

        {/* Desktop tab bar */}
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${styles.tabBtn} ${tab === t.id ? styles.active : ''}`}
              onClick={() => onTabChange(t.id)}>
              <span className={styles.tabIco}><t.Icon size={15} /></span>
              {t.fullLabel}
              {t.id === 'social' && hasNotif && <span className={styles.notifBadge} />}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav className={styles.bottomNav} aria-label="Main navigation">
        <div className={styles.bottomNavInner}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${styles.navItem} ${tab === t.id ? styles.active : ''}`}
              onClick={() => onTabChange(t.id)}>
              <span className={styles.navIcon}>
                <t.Icon size={20} />
                {t.id === 'social' && hasNotif && <span className={styles.notifBadge} />}
              </span>
              <span className={styles.navLabel}>{t.navLabel}</span>
              <span className={styles.navDot} />
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
