import { useState } from 'react'
import Feed from './Feed'
import Challenges from './Challenges'
import Connections from './Connections'
import { useSocket } from '../../hooks/useSocket'
import styles from './Social.module.css'

const SUB_TABS = [
  { id: 'feed',        label: 'Feed' },
  { id: 'challenges',  label: '🏆 Challenges' },
  { id: 'connections', label: '👥 Connections' },
]

export default function Social({ token }) {
  const [tab, setTab] = useState('feed')
  const socket = useSocket(token)

  if (!token) {
    return <div className={styles.panel}><div className={styles.empty}>Sign in to connect with friends.</div></div>
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.subTabs}>
        {SUB_TABS.map(t => (
          <button key={t.id} className={`${styles.subTab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'feed'        && <Feed        token={token} socket={socket} />}
      {tab === 'challenges'  && <Challenges  token={token} socket={socket} />}
      {tab === 'connections' && <Connections token={token} socket={socket} />}
    </div>
  )
}
