/**
 * ExerciseAnim — Cartoon SVG animations for each exercise type.
 * Two-pose SMIL crossfade at 3.5 s/cycle (~1.75 s per pose).
 * No external images or API keys needed.
 */

const DUR   = '3.5s'
const ACC   = '#00e5c0'        // teal accent  (head / joints)
const W     = 'rgba(255,255,255,0.90)' // main limbs
const WT    = 'rgba(255,255,255,0.60)' // thinner / secondary limbs

// ── shared SVG prop objects ────────────────────────────────────────
const cap = { strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
const sw  = { ...cap, stroke: W,  strokeWidth: 4.5 }
const swt = { ...cap, stroke: WT, strokeWidth: 3.5 }

// ── primitive helpers (plain functions → React elements) ───────────
const Hd  = (cx, cy, r = 13) =>
  <circle cx={cx} cy={cy} r={r} fill="none" stroke={ACC} strokeWidth={3} />

const Ln  = (x1, y1, x2, y2, thin = false) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} {...(thin ? swt : sw)} />

const Jt  = (cx, cy) =>
  <circle cx={cx} cy={cy} r={3.5} fill={ACC} opacity={0.65} />

const Bar = (y = 14) =>
  <rect x={20} y={y - 3} width={80} height={6} rx={3}
    fill={ACC} opacity={0.35} />

const Floor = (y = 178) =>
  <line x1={8} y1={y} x2={112} y2={y}
    stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />

// ── Two-pose crossfade wrapper ─────────────────────────────────────
function Fig({ pA, pB, speed = DUR, bg }) {
  const kA = { attributeName:'opacity', values:'1;1;0;0;1', keyTimes:'0;0.4;0.5;0.9;1', dur:speed, repeatCount:'indefinite' }
  const kB = { attributeName:'opacity', values:'0;0;1;1;0', keyTimes:'0;0.4;0.5;0.9;1', dur:speed, repeatCount:'indefinite' }
  return (
    <svg viewBox="0 0 120 200" width="100%" height="100%" style={{ display:'block', overflow:'visible' }}>
      {bg}
      <g><animate {...kA} />{pA}</g>
      <g opacity={0}><animate {...kB} />{pB}</g>
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════
//  SQUAT  — squats / lunges / deadlifts / calf-raises
// ══════════════════════════════════════════════════════════════════
function SquatAnim() {
  const pA = [   // ── standing
    Hd(60, 22),
    Ln(60,35, 60,100),               // torso
    Ln(60,65, 38,82, true),          // L upper-arm
    Ln(38,82, 30,102, true),         // L forearm
    Ln(60,65, 82,82, true),          // R upper-arm
    Ln(82,82, 90,102, true),         // R forearm
    Ln(60,100, 47,136),              // L thigh
    Ln(47,136, 40,170),              // L shin
    Ln(60,100, 73,136),              // R thigh
    Ln(73,136, 80,170),              // R shin
    Ln(40,170, 24,176),              // L foot
    Ln(80,170, 96,176),              // R foot
    Floor(),
  ]
  const pB = [   // ── deep squat
    Hd(60, 56),
    Ln(60,69, 60,108),               // shorter torso
    Ln(60,88, 20,88, true),          // L arm out front (balance)
    Ln(20,88, 12,100, true),
    Ln(60,88, 100,88, true),         // R arm out front
    Ln(100,88, 108,100, true),
    Ln(60,108, 28,132),              // L thigh (wide squat)
    Ln(28,132, 28,170),              // L shin vertical
    Ln(60,108, 92,132),              // R thigh
    Ln(92,132, 92,170),              // R shin vertical
    Ln(28,170, 12,176),              // L foot (turned out)
    Ln(92,170, 108,176),             // R foot
    Jt(28,132), Jt(92,132),          // knee joints
    Floor(),
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  PUSH  — push-ups / bench-press / tricep-dips
//  (side-view horizontal figure)
// ══════════════════════════════════════════════════════════════════
function PushAnim() {
  const floor = Floor(132)
  const pA = [   // ── up position (arms extended)
    Hd(15, 75, 11),
    Ln(25,78, 96,78),                // back / torso horizontal
    Ln(40,78, 40,110),               // L arm extended down
    Ln(40,110, 26,114),              // L hand on floor
    Ln(75,78, 75,110),               // R arm extended
    Ln(75,110, 89,114),              // R hand
    Ln(96,78, 108,88),               // upper leg
    Ln(108,88, 110,110),             // lower leg / foot
    floor,
  ]
  const pB = [   // ── down position (body near floor)
    Hd(15, 95, 11),
    Ln(25,98, 96,98),                // back lowered 20 px
    Ln(40,98, 40,112),               // L arm very short (bent)
    Ln(40,112, 26,114),              // hand same spot
    Ln(75,98, 75,112),               // R arm
    Ln(75,112, 89,114),
    Ln(96,98, 108,108),
    Ln(108,108, 110,122),
    floor,
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  JUMP  — jumping-jacks / burpees / box-jumps / jump-rope
// ══════════════════════════════════════════════════════════════════
function JumpAnim() {
  const pA = [   // ── ground: arms down, feet together
    Hd(60, 24),
    Ln(60,37, 60,98),
    Ln(60,65, 40,82, true),          // L arm down
    Ln(40,82, 34,105, true),
    Ln(60,65, 80,82, true),          // R arm down
    Ln(80,82, 86,105, true),
    Ln(60,98, 52,133),               // L leg
    Ln(52,133, 47,168),
    Ln(60,98, 68,133),               // R leg
    Ln(68,133, 73,168),
    Ln(47,168, 32,174),
    Ln(73,168, 88,174),
    Floor(),
  ]
  const pB = [   // ── air: arms wide up, legs spread, body 18 px higher
    Hd(60, 6),
    Ln(60,19, 60,80),
    Ln(60,42, 18,22, true),          // L arm swept up-left
    Ln(18,22, 8,10, true),
    Ln(60,42, 102,22, true),         // R arm swept up-right
    Ln(102,22, 112,10, true),
    Ln(60,80, 32,114),               // L leg spread wide
    Ln(32,114, 22,150),
    Ln(60,80, 88,114),               // R leg
    Ln(88,114, 98,150),
    Ln(22,150, 8,156),
    Ln(98,150, 112,156),
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  RUN  — high-knees / mountain-climbers / walking
// ══════════════════════════════════════════════════════════════════
function RunAnim() {
  const pA = [   // ── stride left (L knee high, R arm forward)
    Hd(62, 22),
    Ln(62,35, 60,98),                // torso (slight lean)
    Ln(60,62, 76,80, true),          // L arm back
    Ln(76,80, 80,100, true),
    Ln(60,62, 44,76, true),          // R arm forward
    Ln(44,76, 40,94, true),
    Ln(60,98, 50,124),               // L thigh (knee raised high)
    Ln(50,124, 55,108),              // L shin (foot up)
    Ln(60,98, 72,128),               // R leg pushing off
    Ln(72,128, 76,162),
    Ln(76,162, 92,168),              // R foot on floor
    Floor(),
  ]
  const pB = [   // ── stride right (R knee high, L arm forward)
    Hd(58, 22),
    Ln(58,35, 60,98),
    Ln(60,62, 44,80, true),          // R arm back
    Ln(44,80, 40,100, true),
    Ln(60,62, 76,76, true),          // L arm forward
    Ln(76,76, 80,94, true),
    Ln(60,98, 70,124),               // R thigh (knee raised)
    Ln(70,124, 65,108),              // R shin up
    Ln(60,98, 48,128),               // L leg pushing off
    Ln(48,128, 44,162),
    Ln(44,162, 28,168),
    Floor(),
  ]
  return <Fig pA={pA} pB={pB} speed="2.2s" />
}

// ══════════════════════════════════════════════════════════════════
//  PULL  — pull-ups / rows
//  (figure hanging from a bar, pulling up)
// ══════════════════════════════════════════════════════════════════
function PullAnim() {
  const bar = Bar(16)
  const pA = [   // ── dead hang (arms fully extended)
    bar,
    Hd(60, 54),
    Ln(38,16, 48,44),                // L arm extended overhead
    Ln(82,16, 72,44),                // R arm
    Ln(48,44, 60,67),                // L shoulder → head level
    Ln(72,44, 60,67),                // R shoulder
    Ln(60,67, 60,122),               // torso
    Ln(60,122, 50,155),              // L leg hanging
    Ln(50,155, 46,175),
    Ln(60,122, 70,155),              // R leg
    Ln(70,155, 74,175),
  ]
  const pB = [   // ── top of pull-up (chin above bar)
    bar,
    Hd(60, 22),                      // head near bar
    Ln(38,16, 42,30),                // L arm bent short
    Ln(82,16, 78,30),                // R arm bent
    Ln(42,30, 54,40),                // shoulder
    Ln(78,30, 66,40),
    Ln(60,35, 60,92),                // torso (raised ~30px)
    Ln(60,92, 52,125),               // legs bent / hanging
    Ln(52,125, 48,155),
    Ln(60,92, 68,125),
    Ln(68,125, 72,155),
    Jt(42,30), Jt(78,30),            // elbow joints
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  PRESS  — shoulder-press / overhead-press / lateral-raises
// ══════════════════════════════════════════════════════════════════
function PressAnim() {
  const pA = [   // ── start: arms at shoulder level (elbows bent 90°)
    Hd(60, 22),
    Ln(60,35, 60,100),
    Ln(60,58, 30,52, true),          // L upper-arm out
    Ln(30,52, 28,32, true),          // L forearm up
    Ln(60,58, 90,52, true),          // R upper-arm out
    Ln(90,52, 92,32, true),          // R forearm up
    Ln(60,100, 48,136),
    Ln(48,136, 42,170),
    Ln(60,100, 72,136),
    Ln(72,136, 78,170),
    Ln(42,170, 27,176), Ln(78,170,93,176),
    Floor(),
  ]
  const pB = [   // ── top: arms fully overhead
    Hd(60, 22),
    Ln(60,35, 60,100),
    Ln(60,52, 36,28, true),          // L arm straight up-left
    Ln(36,28, 32,10, true),
    Ln(60,52, 84,28, true),          // R arm straight up-right
    Ln(84,28, 88,10, true),
    Ln(60,100, 48,136),
    Ln(48,136, 42,170),
    Ln(60,100, 72,136),
    Ln(72,136, 78,170),
    Ln(42,170, 27,176), Ln(78,170,93,176),
    Floor(),
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  CURL  — bicep-curls
//  (elbow stays pinned to side, forearm rotates up/down)
// ══════════════════════════════════════════════════════════════════
function CurlAnim() {
  const legs = [
    Ln(60,100, 48,136), Ln(48,136, 42,170),
    Ln(60,100, 72,136), Ln(72,136, 78,170),
    Ln(42,170, 27,176), Ln(78,170,93,176),
    Floor(),
  ]
  const pA = [   // ── arms down
    Hd(60, 22),
    Ln(60,35, 60,100),
    Ln(60,65, 38,80, true),          // L upper-arm
    Ln(38,80, 32,110, true),         // L forearm down
    Ln(60,65, 82,80, true),          // R upper-arm
    Ln(82,80, 88,110, true),         // R forearm down
    ...legs,
  ]
  const pB = [   // ── arms curled up (forearm rotates to shoulder)
    Hd(60, 22),
    Ln(60,35, 60,100),
    Ln(60,65, 38,80, true),          // L upper-arm same
    Ln(38,80, 36,52, true),          // L forearm UP
    Ln(60,65, 82,80, true),          // R upper-arm same
    Ln(82,80, 84,52, true),          // R forearm UP
    Jt(38,80), Jt(82,80),            // elbows highlighted
    ...legs,
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  CORE  — bicycle-crunches / russian-twist
//  (seated figure rotating torso left → right)
// ══════════════════════════════════════════════════════════════════
function CoreAnim() {
  const flr = Floor(158)
  // Seated position: butt on floor, legs bent, torso reclined ~40°
  const pA = [   // ── twist left (arms reach right)
    Hd(60, 58),
    Ln(60,71, 50,108),               // torso reclined slightly
    Ln(55,88, 95,74, true),          // arms reaching RIGHT
    Ln(95,74, 105,84, true),
    Ln(50,108, 32,138),              // L leg bent
    Ln(32,138, 38,155),
    Ln(50,108, 72,132),              // R leg extended
    Ln(72,132, 80,152),
    flr,
  ]
  const pB = [   // ── twist right (arms reach left)
    Hd(60, 58),
    Ln(60,71, 70,108),               // torso leaning other way
    Ln(65,88, 25,74, true),          // arms reaching LEFT
    Ln(25,74, 15,84, true),
    Ln(70,108, 48,132),              // L leg
    Ln(48,132, 40,152),
    Ln(70,108, 88,138),              // R leg
    Ln(88,138, 82,155),
    flr,
  ]
  return <Fig pA={pA} pB={pB} />
}

// ══════════════════════════════════════════════════════════════════
//  PLANK  — plank hold
//  (side-view, slight hip dip → engaged position breathing)
// ══════════════════════════════════════════════════════════════════
function PlankAnim() {
  const flr = Floor(145)
  const pA = [   // ── relaxed plank (slight hip sag)
    Hd(14, 84, 11),
    Ln(24,86, 96,90),                // back (slight sag in middle)
    Ln(42,90, 42,122),               // L arm (forearm on floor)
    Ln(42,122, 26,126),              // L elbow on floor
    Ln(74,90, 74,122),               // R arm
    Ln(74,122, 90,126),
    Ln(96,90, 108,100),              // thigh
    Ln(108,100, 110,128),            // lower leg / foot
    flr,
  ]
  const pB = [   // ── engaged plank (hips up, abs tight)
    Hd(14, 80, 11),
    Ln(24,82, 96,82),                // back flat / slightly raised
    Ln(42,82, 42,118),
    Ln(42,118, 26,122),
    Ln(74,82, 74,118),
    Ln(74,118, 90,122),
    Ln(96,82, 108,92),
    Ln(108,92, 110,118),
    flr,
  ]
  return <Fig pA={pA} pB={pB} speed="4s" />
}

// ══════════════════════════════════════════════════════════════════
//  STRETCH  — full body stretch
//  (standing, arms out wide → forward fold)
// ══════════════════════════════════════════════════════════════════
function StretchAnim() {
  const pA = [   // ── arms open wide (T-pose, big inhale)
    Hd(60, 22),
    Ln(60,35, 60,100),
    Ln(60,60, 10,60, true),          // L arm straight out
    Ln(10,60, 6,52, true),
    Ln(60,60, 110,60, true),         // R arm straight out
    Ln(110,60, 114,52, true),
    Ln(60,100, 48,136),
    Ln(48,136, 42,170),
    Ln(60,100, 72,136),
    Ln(72,136, 78,170),
    Ln(42,170, 27,176), Ln(78,170,93,176),
    Floor(),
  ]
  const pB = [   // ── forward fold (hands toward toes)
    Hd(60, 80),                      // head forward / down
    Ln(60,93, 60,110),               // torso compressed (bent over)
    Ln(60,93, 40,125, true),         // arms hanging toward floor
    Ln(40,125, 38,148, true),
    Ln(60,93, 80,125, true),
    Ln(80,125, 82,148, true),
    Ln(60,110, 50,136),              // L leg straight
    Ln(50,136, 46,170),
    Ln(60,110, 70,136),              // R leg straight
    Ln(70,136, 74,170),
    Ln(46,170, 31,176), Ln(74,170,89,176),
    Floor(),
  ]
  return <Fig pA={pA} pB={pB} speed="4.5s" />
}

// ══════════════════════════════════════════════════════════════════
//  MAPPING  — exercise key → animation type → component
// ══════════════════════════════════════════════════════════════════
export const EXERCISE_ANIM_TYPE = {
  'squats':            'squat',
  'lunges':            'squat',
  'deadlifts':         'squat',
  'calf-raises':       'squat',
  'push-ups':          'push',
  'bench-press':       'push',
  'tricep-dips':       'push',
  'jumping-jacks':     'jump',
  'burpees':           'jump',
  'box-jumps':         'jump',
  'jump-rope':         'jump',
  'high-knees':        'run',
  'mountain-climbers': 'run',
  'walking':           'run',
  'pull-ups':          'pull',
  'rows':              'pull',
  'shoulder-press':    'press',
  'overhead-press':    'press',
  'lateral-raises':    'press',
  'bicep-curls':       'curl',
  'bicycle-crunches':  'core',
  'russian-twist':     'core',
  'plank':             'plank',
  'stretching':        'stretch',
}

const COMPONENTS = {
  squat:   SquatAnim,
  push:    PushAnim,
  jump:    JumpAnim,
  run:     RunAnim,
  pull:    PullAnim,
  press:   PressAnim,
  curl:    CurlAnim,
  core:    CoreAnim,
  plank:   PlankAnim,
  stretch: StretchAnim,
}

export default function ExerciseAnim({ exKey }) {
  const type = EXERCISE_ANIM_TYPE[exKey] || 'squat'
  const Comp = COMPONENTS[type] || SquatAnim
  return <Comp />
}
