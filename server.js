require('dotenv').config();
const express = require('express');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { createSocketServer } = require('./ws');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nutrimetrics_jwt_secret_change_in_prod';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('\n  Missing SUPABASE_URL / SUPABASE_SERVICE_KEY environment variables.\n  Set them before starting the server (see supabase-schema.sql for setup).\n');
  process.exit(1);
}

// Service-role client — full DB access, server-side only.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { pushToUser, pushToUsers } = createSocketServer(httpServer, JWT_SECRET);

// ── Middleware ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Media upload (feed posts) ───────────────────────────────────
// Buffers the file in memory (never touches disk) then hands it straight to
// the "media" Supabase Storage bucket — matches its own 50MB / mime allow-list.
const ALLOWED_MEDIA_MIME = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/webp': 'image',
  'image/gif': 'gif',
  'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED_MEDIA_MIME[file.mimetype]),
});

app.post('/api/media/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file, or unsupported file type' });

  const mediaType = ALLOWED_MEDIA_MIME[req.file.mimetype];
  const ext = req.file.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const objectPath = `${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from('media').upload(objectPath, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false,
  });
  if (error) { console.error('media upload error:', error.message); return res.status(500).json({ error: 'Upload failed' }); }

  const { data: pub } = supabase.storage.from('media').getPublicUrl(objectPath);
  res.json({ url: pub.publicUrl, type: mediaType });
});

// APK download — explicit route with an attachment filename + Android package
// MIME so mobile browsers save it as a real installable .apk (otherwise some
// treat it as a generic document with no install option).
app.get('/downloads/NutriMetrics.apk', (req, res) => {
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="NutriMetrics.apk"');
  res.sendFile(path.join(__dirname, 'downloads', 'NutriMetrics.apk'));
});
// (kept outside public/ so the client build's emptyOutDir doesn't wipe it)
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// IST (UTC+5:30) local date — the server runs in UTC, and a plain toISOString()
// would flip the "day" at 5:30am IST instead of local midnight.
function today() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0];
}

function issueToken(profile) {
  return jwt.sign({ id: profile.id, username: profile.username }, JWT_SECRET, { expiresIn: '7d' });
}

// ── Auth: username/password ────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields are required' });
  if (username.trim().length < 3)
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/\S+@\S+\.\S+/.test(email))
    return res.status(400).json({ error: 'Invalid email address' });

  const { data: existingUser } = await supabase
    .from('profiles').select('id').ilike('username', username.trim()).maybeSingle();
  if (existingUser) return res.status(409).json({ error: 'Username already taken' });

  const { data: existingEmail } = await supabase
    .from('profiles').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (existingEmail) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const { data: user, error } = await supabase
    .from('profiles')
    .insert({ username: username.trim(), email: email.trim().toLowerCase(), password_hash: hash })
    .select().single();
  if (error) { console.error('register insert error:', error.message); return res.status(500).json({ error: 'Could not create account' }); }

  res.json({ token: issueToken(user), username: user.username, message: 'Account created successfully!' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const { data: user } = await supabase
    .from('profiles').select('*').ilike('username', username.trim()).maybeSingle();
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid username or password' });

  if (!bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  res.json({ token: issueToken(user), username: user.username, message: 'Logged in successfully!' });
});

// ── Protein Log ──────────────────────────────────────────────────
app.get('/api/protein-log', authMiddleware, async (req, res) => {
  const date = req.query.date || today();
  const { data: logs } = await supabase
    .from('protein_logs').select('*').eq('user_id', req.user.id).eq('date', date).order('logged_at', { ascending: true });
  const { data: lastEntry } = await supabase
    .from('protein_logs').select('protein_goal').eq('user_id', req.user.id).order('logged_at', { ascending: false }).limit(1).maybeSingle();
  res.json({ logs: logs || [], protein_goal: lastEntry ? lastEntry.protein_goal : 120 });
});

app.post('/api/protein-log', authMiddleware, async (req, res) => {
  const { date, food_name, grams, protein, emoji, protein_goal } = req.body;
  if (!food_name || !grams || protein === undefined)
    return res.status(400).json({ error: 'food_name, grams and protein are required' });

  const { data: doc, error } = await supabase
    .from('protein_logs')
    .insert({
      user_id: req.user.id, date: date || today(),
      food_name, grams, protein, emoji: emoji || '', protein_goal: protein_goal || 120,
    })
    .select().single();
  if (error) { console.error('protein-log insert error:', error.message); return res.status(500).json({ error: 'Could not save log' }); }
  res.json({ id: doc.id, message: 'Logged!' });
});

app.delete('/api/protein-log/:id', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('protein_logs').delete().eq('id', req.params.id).eq('user_id', req.user.id).select();
  if (!data || data.length === 0) return res.status(404).json({ error: 'Log entry not found' });
  res.json({ message: 'Deleted' });
});

app.put('/api/protein-goal', authMiddleware, async (req, res) => {
  const { protein_goal, date } = req.body;
  await supabase
    .from('protein_logs').update({ protein_goal }).eq('user_id', req.user.id).eq('date', date || today());
  res.json({ message: 'Goal updated' });
});

// ── Diet Log ─────────────────────────────────────────────────────
// Postgres folds unquoted column names to lowercase (vitb12/vitc/vitd), but the
// frontend reads/writes camelCase (vitB12/vitC/vitD) — translate at the boundary.
function dietLogToApi(row) {
  if (!row) return row;
  const { vitb12, vitc, vitd, ...rest } = row;
  return { ...rest, vitB12: vitb12, vitC: vitc, vitD: vitd };
}

app.get('/api/diet-log', authMiddleware, async (req, res) => {
  const date = req.query.date || today();
  const { data: logs } = await supabase
    .from('diet_logs').select('*').eq('user_id', req.user.id).eq('date', date).order('logged_at', { ascending: true });
  const { data: goals } = await supabase
    .from('diet_goals').select('*').eq('user_id', req.user.id).maybeSingle();
  res.json({
    logs: (logs || []).map(dietLogToApi),
    goals: {
      calories: goals?.calories ?? 2000,
      protein:  goals?.protein  ?? 120,
      carbs:    goals?.carbs    ?? 250,
      fat:      goals?.fat      ?? 65,
    },
  });
});

app.post('/api/diet-log', authMiddleware, async (req, res) => {
  const { date, food_name, emoji, grams, protein, carbs, fat, calories, fiber, vitB12, vitC, vitD, iron, calcium } = req.body;
  if (!food_name || !grams) return res.status(400).json({ error: 'food_name and grams required' });
  const { data: doc, error } = await supabase
    .from('diet_logs')
    .insert({
      user_id: req.user.id, date: date || today(),
      food_name, emoji: emoji || '', grams,
      protein: protein || 0, carbs: carbs || 0, fat: fat || 0, calories: calories || 0,
      fiber: fiber || 0, vitb12: vitB12 || 0, vitc: vitC || 0, vitd: vitD || 0,
      iron: iron || 0, calcium: calcium || 0,
    })
    .select().single();
  if (error) { console.error('diet-log insert error:', error.message); return res.status(500).json({ error: 'Could not save log' }); }
  res.json({ id: doc.id, message: 'Logged!' });
});

app.delete('/api/diet-log/:id', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('diet_logs').delete().eq('id', req.params.id).eq('user_id', req.user.id).select();
  if (!data || data.length === 0) return res.status(404).json({ error: 'Log entry not found' });
  res.json({ message: 'Deleted' });
});

app.get('/api/diet-goals', authMiddleware, async (req, res) => {
  const { data: goals } = await supabase
    .from('diet_goals').select('*').eq('user_id', req.user.id).maybeSingle();
  res.json({
    calories: goals?.calories ?? 2000,
    protein:  goals?.protein  ?? 120,
    carbs:    goals?.carbs    ?? 250,
    fat:      goals?.fat      ?? 65,
  });
});

app.put('/api/diet-goals', authMiddleware, async (req, res) => {
  const { calories, protein, carbs, fat } = req.body;
  const { error } = await supabase
    .from('diet_goals')
    .upsert({ user_id: req.user.id, calories, protein, carbs, fat }, { onConflict: 'user_id' });
  if (error) { console.error('diet-goals upsert error:', error.message); return res.status(500).json({ error: 'Could not update goals' }); }
  res.json({ message: 'Goals updated' });
});

// ── BMI Log ──────────────────────────────────────────────────────
app.post('/api/bmi-log', authMiddleware, async (req, res) => {
  const { bmi, weight_kg, height_cm, category, age, gender } = req.body;
  const { data: doc, error } = await supabase
    .from('bmi_logs')
    .insert({ user_id: req.user.id, bmi, weight_kg, height_cm, category, age: age || null, gender: gender || null })
    .select().single();
  if (error) { console.error('bmi-log insert error:', error.message); return res.status(500).json({ error: 'Could not save BMI log' }); }
  res.json({ id: doc.id });
});

app.get('/api/bmi-log', authMiddleware, async (req, res) => {
  const { data: logs } = await supabase
    .from('bmi_logs').select('*').eq('user_id', req.user.id).order('logged_at', { ascending: false }).limit(30);
  res.json({ logs: logs || [] });
});

// ── Workout Log ──────────────────────────────────────────────────
app.post('/api/workout-log', authMiddleware, async (req, res) => {
  const { goal, level } = req.body;
  const { data: doc, error } = await supabase
    .from('workout_logs')
    .insert({ user_id: req.user.id, date: today(), goal, level })
    .select().single();
  if (error) { console.error('workout-log insert error:', error.message); return res.status(500).json({ error: 'Could not save workout log' }); }
  res.json({ id: doc.id });
});

// ── Profile ──────────────────────────────────────────────────────
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  const { data: user } = await supabase
    .from('profiles').select('id, username, email, phone, created_at').eq('id', req.user.id).maybeSingle();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── Activity Log ─────────────────────────────────────────────────
app.get('/api/activity-log', authMiddleware, async (req, res) => {
  // Daily rows are stored permanently; default returns the last week, but a
  // larger window (up to a year) can be requested for history views.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 7, 1), 400);
  const { data: logs } = await supabase
    .from('activity_logs').select('*').eq('user_id', req.user.id).order('date', { ascending: false }).limit(limit);
  res.json({ logs: logs || [] });
});

// Upsert today's activity (steps, distance, calories, activeMinutes)
app.post('/api/activity-log', authMiddleware, async (req, res) => {
  const { date, steps, distanceKm, caloriesBurned, activeMinutes, stepGoal } = req.body;
  const d = date || today();
  const { data: doc, error } = await supabase
    .from('activity_logs')
    .upsert({
      user_id: req.user.id, date: d,
      steps: steps || 0, distance_km: distanceKm || 0,
      calories_burned: caloriesBurned || 0, active_minutes: activeMinutes || 0,
      step_goal: stepGoal || 10000, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,date' })
    .select().single();
  if (error) { console.error('activity-log upsert error:', error.message); return res.status(500).json({ error: 'Could not save activity log' }); }
  res.json({ id: doc.id, message: 'Saved' });
});

// ── Social: shared helpers ─────────────────────────────────────────
async function profilesByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map();
  const { data } = await supabase.from('profiles').select('id, username').in('id', unique);
  return new Map((data || []).map(p => [p.id, p]));
}

async function friendIdsOf(userId) {
  const { data } = await supabase
    .from('friendships').select('requester_id, addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');
  return (data || []).map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
}

async function groupIdsOf(userId) {
  const { data } = await supabase.from('group_members').select('group_id').eq('user_id', userId);
  return (data || []).map(g => g.group_id);
}

async function enrichPosts(posts, myId) {
  if (!posts.length) return [];
  const postIds = posts.map(p => p.id);
  const authorIds = posts.map(p => p.user_id);

  const [{ data: likes }, { data: comments }, authors] = await Promise.all([
    supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    supabase.from('post_comments').select('post_id').in('post_id', postIds),
    profilesByIds(authorIds),
  ]);

  const likeCounts = {}, likedByMe = {}, commentCounts = {};
  for (const l of (likes || [])) {
    likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
    if (l.user_id === myId) likedByMe[l.post_id] = true;
  }
  for (const c of (comments || [])) commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;

  return posts.map(p => ({
    ...p,
    author: authors.get(p.user_id)?.username || 'Unknown',
    is_mine: p.user_id === myId,
    like_count: likeCounts[p.id] || 0,
    liked_by_me: !!likedByMe[p.id],
    comment_count: commentCounts[p.id] || 0,
  }));
}

// ── Friends ──────────────────────────────────────────────────────
app.post('/api/friends/request', authMiddleware, async (req, res) => {
  const targetUsername = String(req.body.username || '').trim();
  if (!targetUsername) return res.status(400).json({ error: 'Username required' });
  if (targetUsername.toLowerCase() === req.user.username.toLowerCase())
    return res.status(400).json({ error: "You can't add yourself" });

  const { data: target } = await supabase
    .from('profiles').select('id, username').ilike('username', targetUsername).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { data: existing } = await supabase
    .from('friendships').select('id, status')
    .or(`and(requester_id.eq.${req.user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${req.user.id})`)
    .maybeSingle();
  if (existing) return res.status(409).json({ error: `Friend request already ${existing.status}` });

  const { data: doc, error } = await supabase
    .from('friendships')
    .insert({ requester_id: req.user.id, addressee_id: target.id, status: 'pending' })
    .select().single();
  if (error) { console.error('friend request insert error:', error.message); return res.status(500).json({ error: 'Could not send request' }); }

  pushToUser(target.id, { type: 'friend_request', from: { id: req.user.id, username: req.user.username } });
  res.json({ id: doc.id, message: 'Friend request sent' });
});

app.post('/api/friends/:id/accept', authMiddleware, async (req, res) => {
  const { data: row } = await supabase.from('friendships').select('*').eq('id', req.params.id).maybeSingle();
  if (!row || row.addressee_id !== req.user.id || row.status !== 'pending')
    return res.status(404).json({ error: 'Request not found' });

  await supabase.from('friendships').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', row.id);
  pushToUser(row.requester_id, { type: 'friend_accepted', by: { id: req.user.id, username: req.user.username } });
  res.json({ message: 'Friend request accepted' });
});

app.post('/api/friends/:id/decline', authMiddleware, async (req, res) => {
  const { data: row } = await supabase.from('friendships').select('*').eq('id', req.params.id).maybeSingle();
  if (!row || row.addressee_id !== req.user.id || row.status !== 'pending')
    return res.status(404).json({ error: 'Request not found' });

  await supabase.from('friendships').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', row.id);
  res.json({ message: 'Friend request declined' });
});

app.delete('/api/friends/:id', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('friendships').delete().eq('id', req.params.id)
    .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`).select();
  if (!data || !data.length) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Removed' });
});

// Search users by (partial, case-insensitive) username — for finding friends.
app.get('/api/users/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });

  const { data: matches } = await supabase
    .from('profiles').select('id, username')
    .ilike('username', `%${q}%`)
    .neq('id', req.user.id)
    .limit(12);

  // Annotate each match with the current friendship status so the UI can show
  // "Add" / "Pending" / "Friends" without a second round-trip.
  const ids = (matches || []).map(m => m.id);
  const statusById = {};
  if (ids.length) {
    const { data: fr } = await supabase
      .from('friendships').select('requester_id, addressee_id, status')
      .or(`and(requester_id.eq.${req.user.id},addressee_id.in.(${ids.join(',')})),and(addressee_id.eq.${req.user.id},requester_id.in.(${ids.join(',')}))`);
    for (const f of (fr || [])) {
      const other = f.requester_id === req.user.id ? f.addressee_id : f.requester_id;
      statusById[other] = f.status;
    }
  }
  res.json({ results: (matches || []).map(m => ({ ...m, status: statusById[m.id] || 'none' })) });
});

app.get('/api/friends', authMiddleware, async (req, res) => {
  const { data: rows } = await supabase
    .from('friendships').select('*')
    .or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`)
    .eq('status', 'accepted');
  const otherIds = (rows || []).map(r => r.requester_id === req.user.id ? r.addressee_id : r.requester_id);
  const profiles = await profilesByIds(otherIds);
  res.json({
    friends: (rows || []).map(r => {
      const otherId = r.requester_id === req.user.id ? r.addressee_id : r.requester_id;
      return { friendshipId: r.id, id: otherId, username: profiles.get(otherId)?.username || 'Unknown' };
    }),
  });
});

app.get('/api/friends/requests', authMiddleware, async (req, res) => {
  const { data: rows } = await supabase
    .from('friendships').select('*').eq('addressee_id', req.user.id).eq('status', 'pending');
  const profiles = await profilesByIds((rows || []).map(r => r.requester_id));
  res.json({
    requests: (rows || []).map(r => ({
      id: r.id, from: { id: r.requester_id, username: profiles.get(r.requester_id)?.username || 'Unknown' }, created_at: r.created_at,
    })),
  });
});

// ── Groups ───────────────────────────────────────────────────────
app.post('/api/groups', authMiddleware, async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name required' });

  const { data: group, error } = await supabase.from('groups').insert({ name, created_by: req.user.id }).select().single();
  if (error) { console.error('group insert error:', error.message); return res.status(500).json({ error: 'Could not create group' }); }

  await supabase.from('group_members').insert({ group_id: group.id, user_id: req.user.id, role: 'owner' });
  res.json({ id: group.id, name: group.name });
});

app.post('/api/groups/:id/members', authMiddleware, async (req, res) => {
  const groupId = req.params.id;
  const targetUsername = String(req.body.username || '').trim();

  const { data: membership } = await supabase
    .from('group_members').select('*').eq('group_id', groupId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

  const { data: target } = await supabase.from('profiles').select('id, username').ilike('username', targetUsername).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found' });

  const friendIds = await friendIdsOf(req.user.id);
  if (!friendIds.includes(target.id)) return res.status(400).json({ error: 'You can only add friends to a group' });

  const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: target.id, role: 'member' });
  if (error) { return res.status(409).json({ error: 'Already a member' }); }

  pushToUser(target.id, { type: 'group_invite', group: { id: groupId } });
  res.json({ message: 'Added to group' });
});

app.get('/api/groups', authMiddleware, async (req, res) => {
  const { data: memberships } = await supabase.from('group_members').select('group_id, role').eq('user_id', req.user.id);
  const groupIds = (memberships || []).map(m => m.group_id);
  if (!groupIds.length) return res.json({ groups: [] });

  const { data: groups } = await supabase.from('groups').select('*').in('id', groupIds);
  const roleByGroup = Object.fromEntries((memberships || []).map(m => [m.group_id, m.role]));
  res.json({ groups: (groups || []).map(g => ({ ...g, role: roleByGroup[g.id] })) });
});

app.get('/api/groups/:id', authMiddleware, async (req, res) => {
  const groupId = req.params.id;
  const { data: membership } = await supabase
    .from('group_members').select('*').eq('group_id', groupId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

  const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  const { data: members } = await supabase.from('group_members').select('user_id, role').eq('group_id', groupId);
  const profiles = await profilesByIds((members || []).map(m => m.user_id));

  const { data: posts } = await supabase
    .from('posts').select('*').eq('group_id', groupId).order('created_at', { ascending: false });
  const enriched = await enrichPosts(posts || [], req.user.id);

  res.json({
    group,
    members: (members || []).map(m => ({ id: m.user_id, username: profiles.get(m.user_id)?.username || 'Unknown', role: m.role })),
    posts: enriched,
  });
});

// Group chat — a message thread per group, shown next to 1:1 DMs in the
// unified Connections list (mirrors WhatsApp: group name + last message).
app.get('/api/groups/:id/messages', authMiddleware, async (req, res) => {
  const groupId = req.params.id;
  const { data: membership } = await supabase
    .from('group_members').select('*').eq('group_id', groupId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

  const { data: rows } = await supabase
    .from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
  const profiles = await profilesByIds((rows || []).map(m => m.sender_id));
  res.json({
    messages: (rows || []).map(m => ({ ...m, sender_username: profiles.get(m.sender_id)?.username || 'Unknown' })),
  });
});

app.post('/api/groups/:id/messages', authMiddleware, async (req, res) => {
  const groupId = req.params.id;
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message content required' });

  const { data: membership } = await supabase
    .from('group_members').select('*').eq('group_id', groupId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this group' });

  const { data: doc, error } = await supabase
    .from('group_messages').insert({ group_id: groupId, sender_id: req.user.id, content }).select().single();
  if (error) { console.error('group message insert error:', error.message); return res.status(500).json({ error: 'Could not send message' }); }

  const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
  const targetIds = (members || []).map(m => m.user_id).filter(id => id !== req.user.id);
  pushToUsers(targetIds, {
    type: 'new_group_message', group_id: groupId,
    from: { id: req.user.id, username: req.user.username }, content, created_at: doc.created_at,
  });
  res.json({ id: doc.id, message: 'Sent' });
});

app.delete('/api/group-messages/:id', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('group_messages').delete().eq('id', req.params.id).eq('sender_id', req.user.id).select();
  if (!data || !data.length) return res.status(404).json({ error: 'Message not found' });

  const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', data[0].group_id);
  pushToUsers((members || []).map(m => m.user_id), { type: 'group_message_deleted', group_id: data[0].group_id, id: req.params.id });
  res.json({ message: 'Deleted' });
});

// Unified conversation list — 1:1 DMs and group chats together, sorted by
// most recent activity, so Connections can show one WhatsApp-style list
// instead of separate People/Groups/Chats tabs.
app.get('/api/conversations', authMiddleware, async (req, res) => {
  const { data: dmRows } = await supabase
    .from('messages').select('*')
    .or(`sender_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false });

  const byOther = new Map();
  for (const m of (dmRows || [])) {
    const otherId = m.sender_id === req.user.id ? m.recipient_id : m.sender_id;
    if (!byOther.has(otherId)) byOther.set(otherId, { lastMessage: m, unread: 0 });
    if (m.recipient_id === req.user.id && !m.read_at) byOther.get(otherId).unread++;
  }

  const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', req.user.id);
  const groupIds = (memberships || []).map(m => m.group_id);
  const [{ data: groups }, { data: groupMsgRows }] = await Promise.all([
    groupIds.length ? supabase.from('groups').select('*').in('id', groupIds) : Promise.resolve({ data: [] }),
    groupIds.length
      ? supabase.from('group_messages').select('*').in('group_id', groupIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const lastGroupMsg = new Map();
  for (const m of (groupMsgRows || [])) if (!lastGroupMsg.has(m.group_id)) lastGroupMsg.set(m.group_id, m);

  const profiles = await profilesByIds([...byOther.keys()]);
  const dmConvos = [...byOther.entries()].map(([id, v]) => ({
    type: 'dm', id, name: profiles.get(id)?.username || 'Unknown',
    lastMessage: v.lastMessage.content, lastAt: v.lastMessage.created_at, unread: v.unread,
  }));
  const groupConvos = (groups || []).map(g => {
    const last = lastGroupMsg.get(g.id);
    return {
      type: 'group', id: g.id, name: g.name,
      lastMessage: last ? last.content : 'No messages yet',
      lastAt: last ? last.created_at : g.created_at, unread: 0,
    };
  });

  const merged = [...dmConvos, ...groupConvos].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  res.json({ conversations: merged });
});

// ── Feed / Posts ─────────────────────────────────────────────────
app.post('/api/posts', authMiddleware, async (req, res) => {
  const { kind, content, activityLogId, groupId, mediaUrl, mediaType } = req.body;
  if (!['activity', 'thought'].includes(kind)) return res.status(400).json({ error: 'Invalid post kind' });
  if (mediaUrl && !['image', 'gif', 'video'].includes(mediaType))
    return res.status(400).json({ error: 'Invalid media type' });

  let snapshot = { steps: null, distance_km: null, calories_burned: null, active_minutes: null };
  if (kind === 'activity') {
    if (!activityLogId) return res.status(400).json({ error: 'activityLogId required for activity posts' });
    const { data: log } = await supabase
      .from('activity_logs').select('*').eq('id', activityLogId).eq('user_id', req.user.id).maybeSingle();
    if (!log) return res.status(404).json({ error: 'Activity log not found' });
    snapshot = { steps: log.steps, distance_km: log.distance_km, calories_burned: log.calories_burned, active_minutes: log.active_minutes };
  } else if (!String(content || '').trim() && !mediaUrl) {
    return res.status(400).json({ error: 'Content or media required for a thought post' });
  }

  if (groupId) {
    const { data: membership } = await supabase
      .from('group_members').select('*').eq('group_id', groupId).eq('user_id', req.user.id).maybeSingle();
    if (!membership) return res.status(403).json({ error: 'Not a member of this group' });
  }

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      user_id: req.user.id, kind, content: content || null, group_id: groupId || null,
      media_url: mediaUrl || null, media_type: mediaUrl ? mediaType : null,
      ...snapshot,
    })
    .select().single();
  if (error) { console.error('post insert error:', error.message); return res.status(500).json({ error: 'Could not create post' }); }

  // Best-effort notification fan-out — never blocks the response.
  (async () => {
    try {
      const targetIds = groupId
        ? (await supabase.from('group_members').select('user_id').eq('group_id', groupId)).data?.map(m => m.user_id) || []
        : await friendIdsOf(req.user.id);
      for (const id of targetIds) {
        if (id !== req.user.id) pushToUser(id, { type: 'new_post', post_id: post.id, author: req.user.username });
      }
    } catch (e) { console.error('post fan-out error:', e.message); }
  })();

  res.json({ id: post.id, message: 'Posted' });
});

app.get('/api/feed', authMiddleware, async (req, res) => {
  const [friendIds, myGroupIds] = await Promise.all([friendIdsOf(req.user.id), groupIdsOf(req.user.id)]);
  const friendScopeIds = [...friendIds, req.user.id];

  const [{ data: friendPosts }, { data: groupPosts }] = await Promise.all([
    supabase.from('posts').select('*').in('user_id', friendScopeIds).is('group_id', null).order('created_at', { ascending: false }).limit(50),
    myGroupIds.length
      ? supabase.from('posts').select('*').in('group_id', myGroupIds).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const merged = [...(friendPosts || []), ...(groupPosts || [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);

  res.json({ posts: await enrichPosts(merged, req.user.id) });
});

app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  const { data } = await supabase.from('posts').delete().eq('id', req.params.id).eq('user_id', req.user.id).select();
  if (!data || !data.length) return res.status(404).json({ error: 'Post not found' });
  res.json({ message: 'Deleted' });
});

// ── Likes ────────────────────────────────────────────────────────
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  const { data: post } = await supabase.from('posts').select('user_id').eq('id', req.params.id).maybeSingle();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { error } = await supabase.from('post_likes').insert({ post_id: req.params.id, user_id: req.user.id });
  if (error && error.code !== '23505') { console.error('like insert error:', error.message); return res.status(500).json({ error: 'Could not like post' }); }

  if (post.user_id !== req.user.id)
    pushToUser(post.user_id, { type: 'new_like', post_id: req.params.id, by: req.user.username });
  res.json({ message: 'Liked' });
});

app.delete('/api/posts/:id/like', authMiddleware, async (req, res) => {
  await supabase.from('post_likes').delete().eq('post_id', req.params.id).eq('user_id', req.user.id);
  res.json({ message: 'Unliked' });
});

// ── Comments ─────────────────────────────────────────────────────
app.post('/api/posts/:id/comments', authMiddleware, async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Comment content required' });

  const { data: post } = await supabase.from('posts').select('user_id').eq('id', req.params.id).maybeSingle();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { data: doc, error } = await supabase
    .from('post_comments').insert({ post_id: req.params.id, user_id: req.user.id, content }).select().single();
  if (error) { console.error('comment insert error:', error.message); return res.status(500).json({ error: 'Could not add comment' }); }

  if (post.user_id !== req.user.id)
    pushToUser(post.user_id, { type: 'new_comment', post_id: req.params.id, by: req.user.username, content });
  res.json({ id: doc.id, message: 'Commented' });
});

app.get('/api/posts/:id/comments', authMiddleware, async (req, res) => {
  const { data: comments } = await supabase
    .from('post_comments').select('*').eq('post_id', req.params.id).order('created_at', { ascending: true });
  const profiles = await profilesByIds((comments || []).map(c => c.user_id));
  res.json({
    comments: (comments || []).map(c => ({ ...c, author: profiles.get(c.user_id)?.username || 'Unknown' })),
  });
});

// ── Messages ─────────────────────────────────────────────────────
app.get('/api/messages/conversations', authMiddleware, async (req, res) => {
  const { data: rows } = await supabase
    .from('messages').select('*')
    .or(`sender_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false });

  const byOther = new Map();
  for (const m of (rows || [])) {
    const otherId = m.sender_id === req.user.id ? m.recipient_id : m.sender_id;
    if (!byOther.has(otherId)) byOther.set(otherId, { lastMessage: m, unread: 0 });
    if (m.recipient_id === req.user.id && !m.read_at) byOther.get(otherId).unread++;
  }
  const profiles = await profilesByIds([...byOther.keys()]);
  res.json({
    conversations: [...byOther.entries()].map(([id, v]) => ({
      id, username: profiles.get(id)?.username || 'Unknown',
      lastMessage: v.lastMessage.content, lastMessageAt: v.lastMessage.created_at, unread: v.unread,
    })),
  });
});

app.get('/api/messages/:userId', authMiddleware, async (req, res) => {
  const otherId = req.params.userId;
  const { data: rows } = await supabase
    .from('messages').select('*')
    .or(`and(sender_id.eq.${req.user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${req.user.id})`)
    .order('created_at', { ascending: true });

  supabase.from('messages').update({ read_at: new Date().toISOString() })
    .eq('sender_id', otherId).eq('recipient_id', req.user.id).is('read_at', null)
    .then(() => {}).catch(e => console.error('mark-read error:', e.message));

  res.json({ messages: rows || [] });
});

app.post('/api/messages/:userId', authMiddleware, async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message content required' });

  const { data: doc, error } = await supabase
    .from('messages').insert({ sender_id: req.user.id, recipient_id: req.params.userId, content }).select().single();
  if (error) { console.error('message insert error:', error.message); return res.status(500).json({ error: 'Could not send message' }); }

  pushToUser(req.params.userId, { type: 'new_message', from: { id: req.user.id, username: req.user.username }, content, created_at: doc.created_at });
  res.json({ id: doc.id, message: 'Sent' });
});

// Delete a message you sent (removes it from the conversation for both people).
app.delete('/api/messages/:id', authMiddleware, async (req, res) => {
  const { data } = await supabase
    .from('messages').delete().eq('id', req.params.id).eq('sender_id', req.user.id).select();
  if (!data || !data.length) return res.status(404).json({ error: 'Message not found' });
  pushToUser(data[0].recipient_id, { type: 'message_deleted', id: req.params.id });
  res.json({ message: 'Deleted' });
});

// ── Challenges ───────────────────────────────────────────────────
app.post('/api/challenges', authMiddleware, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const { startDate, endDate, groupId } = req.body;
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'Name, start and end date required' });

  const { data: chal, error } = await supabase
    .from('challenges')
    .insert({ name, start_date: startDate, end_date: endDate, created_by: req.user.id, group_id: groupId || null })
    .select().single();
  if (error) { console.error('challenge insert error:', error.message); return res.status(500).json({ error: 'Could not create challenge' }); }

  // Auto-enroll the creator, plus all group members if it's a group challenge.
  let memberIds = [req.user.id];
  if (groupId) {
    const { data: gm } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
    memberIds = [...new Set([req.user.id, ...(gm || []).map(m => m.user_id)])];
  }
  await supabase.from('challenge_participants').insert(memberIds.map(uid => ({ challenge_id: chal.id, user_id: uid })));

  for (const id of memberIds) if (id !== req.user.id) pushToUser(id, { type: 'challenge_invite', challenge: { id: chal.id, name } });
  res.json({ id: chal.id, message: 'Challenge created' });
});

app.post('/api/challenges/:id/join', authMiddleware, async (req, res) => {
  const { error } = await supabase.from('challenge_participants').insert({ challenge_id: req.params.id, user_id: req.user.id });
  if (error && error.code !== '23505') return res.status(500).json({ error: 'Could not join' });
  res.json({ message: 'Joined' });
});

app.post('/api/challenges/:id/invite', authMiddleware, async (req, res) => {
  const targetUsername = String(req.body.username || '').trim();
  const { data: me } = await supabase
    .from('challenge_participants').select('id').eq('challenge_id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (!me) return res.status(403).json({ error: 'Join the challenge first' });

  const { data: target } = await supabase.from('profiles').select('id, username').ilike('username', targetUsername).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found' });

  const friendIds = await friendIdsOf(req.user.id);
  if (!friendIds.includes(target.id)) return res.status(400).json({ error: 'You can only invite friends' });

  const { error } = await supabase.from('challenge_participants').insert({ challenge_id: req.params.id, user_id: target.id });
  if (error && error.code !== '23505') return res.status(500).json({ error: 'Could not invite' });

  const { data: chal } = await supabase.from('challenges').select('name').eq('id', req.params.id).maybeSingle();
  pushToUser(target.id, { type: 'challenge_invite', challenge: { id: req.params.id, name: chal?.name } });
  res.json({ message: 'Invited' });
});

app.get('/api/challenges', authMiddleware, async (req, res) => {
  const { data: parts } = await supabase.from('challenge_participants').select('challenge_id').eq('user_id', req.user.id);
  const ids = (parts || []).map(p => p.challenge_id);
  if (!ids.length) return res.json({ challenges: [] });

  const { data: chals } = await supabase.from('challenges').select('*').in('id', ids).order('end_date', { ascending: false });
  const todayStr = today();
  res.json({
    challenges: (chals || []).map(c => ({
      ...c,
      status: todayStr < c.start_date ? 'upcoming' : todayStr > c.end_date ? 'ended' : 'active',
    })),
  });
});

app.get('/api/challenges/:id', authMiddleware, async (req, res) => {
  const { data: chal } = await supabase.from('challenges').select('*').eq('id', req.params.id).maybeSingle();
  if (!chal) return res.status(404).json({ error: 'Challenge not found' });

  const { data: parts } = await supabase.from('challenge_participants').select('user_id').eq('challenge_id', chal.id);
  const participantIds = (parts || []).map(p => p.user_id);
  if (!participantIds.includes(req.user.id)) return res.status(403).json({ error: 'Not part of this challenge' });

  const [profiles, { data: logs }] = await Promise.all([
    profilesByIds(participantIds),
    supabase.from('activity_logs').select('user_id, steps')
      .in('user_id', participantIds).gte('date', chal.start_date).lte('date', chal.end_date),
  ]);

  const totals = {};
  for (const id of participantIds) totals[id] = 0;
  for (const l of (logs || [])) totals[l.user_id] = (totals[l.user_id] || 0) + (l.steps || 0);

  const leaderboard = participantIds
    .map(id => ({ id, username: profiles.get(id)?.username || 'Unknown', steps: totals[id] || 0 }))
    .sort((a, b) => b.steps - a.steps)
    .map((row, i) => ({ ...row, rank: i + 1, isMe: row.id === req.user.id }));

  const todayStr = today();
  res.json({
    challenge: { ...chal, status: todayStr < chal.start_date ? 'upcoming' : todayStr > chal.end_date ? 'ended' : 'active' },
    leaderboard,
  });
});

// ── Serve frontend ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`\n  NutriMetrics server → http://localhost:${PORT}\n`);
});
