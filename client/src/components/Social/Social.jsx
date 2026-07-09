import { useState } from 'react'
import Feed from './Feed'
import Friends from './Friends'
import Groups from './Groups'
import Messages from './Messages'
import Challenges from './Challenges'
import { useSocket } from '../../hooks/useSocket'
import styles from './Social.module.css'

const SUB_TABS = [
  { id: 'feed',       label: 'Feed' },
  { id: 'challenges', label: '🏆 Challenges' },
  { id: 'friends',    label: 'Friends' },
  { id: 'groups',     label: 'Groups' },
  { id: 'messages',   label: 'Messages' },
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

      {tab === 'feed'       && <Feed       token={token} socket={socket} />}
      {tab === 'challenges' && <Challenges token={token} socket={socket} />}
      {tab === 'friends'    && <Friends    token={token} socket={socket} />}
      {tab === 'groups'     && <Groups     token={token} socket={socket} />}
      {tab === 'messages'   && <Messages   token={token} socket={socket} />}
    </div>
  )
}
