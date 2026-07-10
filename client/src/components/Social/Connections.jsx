import { useState } from 'react'
import Friends from './Friends'
import Groups from './Groups'
import Messages from './Messages'
import styles from './Social.module.css'

const SEG = [
  { id: 'people', label: '👥 People' },
  { id: 'groups', label: '🏘 Groups' },
  { id: 'chats',  label: '💬 Chats' },
]

// One tab for the whole relationship graph — friends, groups and DMs together.
export default function Connections({ token, socket }) {
  const [seg, setSeg] = useState('people')
  return (
    <div className={styles.connections}>
      <div className={styles.segRow}>
        {SEG.map(s => (
          <button key={s.id} className={`${styles.seg} ${seg === s.id ? styles.segActive : ''}`}
            onClick={() => setSeg(s.id)}>{s.label}</button>
        ))}
      </div>
      {seg === 'people' && <Friends  token={token} socket={socket} />}
      {seg === 'groups' && <Groups   token={token} socket={socket} />}
      {seg === 'chats'  && <Messages token={token} socket={socket} />}
    </div>
  )
}
