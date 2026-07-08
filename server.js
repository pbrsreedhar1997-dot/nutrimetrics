require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
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

// ── Middleware ───────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

function today() {
  return new Date().toISOString().split('T')[0];
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
  const { data: logs } = await supabase
    .from('activity_logs').select('*').eq('user_id', req.user.id).order('date', { ascending: false }).limit(7);
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

// ── Serve frontend ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  NutriMetrics server → http://localhost:${PORT}\n`);
});
