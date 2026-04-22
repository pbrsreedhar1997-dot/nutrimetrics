const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Datastore = require('@seald-io/nedb');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nutrimetrics_jwt_secret_change_in_prod';
const DB_DIR = path.join(__dirname, 'data');

require('fs').mkdirSync(DB_DIR, { recursive: true });

// ── Databases ────────────────────────────────────────────────────
const db = {
  users:        new Datastore({ filename: path.join(DB_DIR, 'users.db'),        autoload: true }),
  proteinLogs:  new Datastore({ filename: path.join(DB_DIR, 'protein_logs.db'), autoload: true }),
  bmiLogs:      new Datastore({ filename: path.join(DB_DIR, 'bmi_logs.db'),     autoload: true }),
  workoutLogs:  new Datastore({ filename: path.join(DB_DIR, 'workout_logs.db'), autoload: true }),
  dietLogs:     new Datastore({ filename: path.join(DB_DIR, 'diet_logs.db'),     autoload: true }),
  dietGoals:    new Datastore({ filename: path.join(DB_DIR, 'diet_goals.db'),    autoload: true }),
  activityLogs: new Datastore({ filename: path.join(DB_DIR, 'activity_logs.db'), autoload: true }),
};

// Indexes
db.users.ensureIndex({ fieldName: 'username', unique: true });
db.users.ensureIndex({ fieldName: 'email',    unique: true });
db.proteinLogs.ensureIndex({ fieldName: 'userId' });
db.bmiLogs.ensureIndex({ fieldName: 'userId' });
db.dietLogs.ensureIndex({ fieldName: 'userId' });
db.dietGoals.ensureIndex({ fieldName: 'userId' });
db.activityLogs.ensureIndex({ fieldName: 'userId' });

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

// ── Auth ─────────────────────────────────────────────────────────
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

  // Check for existing user
  const existingUser = await db.users.findOneAsync({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });
  if (existingUser) return res.status(409).json({ error: 'Username already taken' });
  const existingEmail = await db.users.findOneAsync({ email: email.trim().toLowerCase() });
  if (existingEmail) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const user = await db.users.insertAsync({
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password_hash: hash,
    created_at: new Date().toISOString()
  });
  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, message: 'Account created successfully!' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = await db.users.findOneAsync({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  if (!bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, message: 'Logged in successfully!' });
});

// ── Protein Log ──────────────────────────────────────────────────
app.get('/api/protein-log', authMiddleware, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const logs = await db.proteinLogs.findAsync({ userId: req.user.id, date }).sort({ logged_at: 1 });
  // Get latest protein goal
  const lastEntry = await db.proteinLogs.findOneAsync({ userId: req.user.id }).sort({ logged_at: -1 });
  res.json({ logs, protein_goal: lastEntry ? lastEntry.protein_goal : 120 });
});

app.post('/api/protein-log', authMiddleware, async (req, res) => {
  const { date, food_name, grams, protein, emoji, protein_goal } = req.body;
  if (!food_name || !grams || protein === undefined)
    return res.status(400).json({ error: 'food_name, grams and protein are required' });

  const doc = await db.proteinLogs.insertAsync({
    userId: req.user.id,
    date: date || new Date().toISOString().split('T')[0],
    food_name, grams, protein,
    emoji: emoji || '',
    protein_goal: protein_goal || 120,
    logged_at: new Date().toISOString()
  });
  res.json({ id: doc._id, message: 'Logged!' });
});

app.delete('/api/protein-log/:id', authMiddleware, async (req, res) => {
  const removed = await db.proteinLogs.removeAsync({ _id: req.params.id, userId: req.user.id });
  if (removed === 0) return res.status(404).json({ error: 'Log entry not found' });
  res.json({ message: 'Deleted' });
});

app.put('/api/protein-goal', authMiddleware, async (req, res) => {
  const { protein_goal, date } = req.body;
  const today = date || new Date().toISOString().split('T')[0];
  await db.proteinLogs.updateAsync({ userId: req.user.id, date: today }, { $set: { protein_goal } }, { multi: true });
  res.json({ message: 'Goal updated' });
});

// ── Diet Log ─────────────────────────────────────────────────────
app.get('/api/diet-log', authMiddleware, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const logs = await db.dietLogs.findAsync({ userId: req.user.id, date }).sort({ logged_at: 1 });
  const goals = await db.dietGoals.findOneAsync({ userId: req.user.id }) || {};
  res.json({
    logs,
    goals: {
      calories: goals.calories || 2000,
      protein:  goals.protein  || 120,
      carbs:    goals.carbs    || 250,
      fat:      goals.fat      || 65,
    }
  });
});

app.post('/api/diet-log', authMiddleware, async (req, res) => {
  const { date, food_name, emoji, grams, protein, carbs, fat, calories, fiber, vitB12, vitC, vitD, iron, calcium } = req.body;
  if (!food_name || !grams) return res.status(400).json({ error: 'food_name and grams required' });
  const doc = await db.dietLogs.insertAsync({
    userId: req.user.id,
    date: date || new Date().toISOString().split('T')[0],
    food_name, emoji: emoji || '', grams,
    protein: protein || 0, carbs: carbs || 0, fat: fat || 0, calories: calories || 0,
    fiber: fiber || 0, vitB12: vitB12 || 0, vitC: vitC || 0,
    vitD: vitD || 0, iron: iron || 0, calcium: calcium || 0,
    logged_at: new Date().toISOString()
  });
  res.json({ id: doc._id, message: 'Logged!' });
});

app.delete('/api/diet-log/:id', authMiddleware, async (req, res) => {
  const removed = await db.dietLogs.removeAsync({ _id: req.params.id, userId: req.user.id });
  if (removed === 0) return res.status(404).json({ error: 'Log entry not found' });
  res.json({ message: 'Deleted' });
});

app.get('/api/diet-goals', authMiddleware, async (req, res) => {
  const goals = await db.dietGoals.findOneAsync({ userId: req.user.id }) || {};
  res.json({
    calories: goals.calories || 2000,
    protein:  goals.protein  || 120,
    carbs:    goals.carbs    || 250,
    fat:      goals.fat      || 65,
  });
});

app.put('/api/diet-goals', authMiddleware, async (req, res) => {
  const { calories, protein, carbs, fat } = req.body;
  const existing = await db.dietGoals.findOneAsync({ userId: req.user.id });
  if (existing) {
    await db.dietGoals.updateAsync({ userId: req.user.id }, { $set: { calories, protein, carbs, fat } });
  } else {
    await db.dietGoals.insertAsync({ userId: req.user.id, calories, protein, carbs, fat });
  }
  res.json({ message: 'Goals updated' });
});

// ── BMI Log ──────────────────────────────────────────────────────
app.post('/api/bmi-log', authMiddleware, async (req, res) => {
  const { bmi, weight_kg, height_cm, category } = req.body;
  const doc = await db.bmiLogs.insertAsync({
    userId: req.user.id, bmi, weight_kg, height_cm, category,
    logged_at: new Date().toISOString()
  });
  res.json({ id: doc._id });
});

app.get('/api/bmi-log', authMiddleware, async (req, res) => {
  const logs = await db.bmiLogs.findAsync({ userId: req.user.id }).sort({ logged_at: -1 }).limit(30);
  res.json({ logs });
});

// ── Workout Log ──────────────────────────────────────────────────
app.post('/api/workout-log', authMiddleware, async (req, res) => {
  const { goal, level } = req.body;
  const doc = await db.workoutLogs.insertAsync({
    userId: req.user.id,
    date: new Date().toISOString().split('T')[0],
    goal, level,
    logged_at: new Date().toISOString()
  });
  res.json({ id: doc._id });
});

// ── Profile ──────────────────────────────────────────────────────
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  const user = await db.users.findOneAsync({ _id: req.user.id });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user._id, username: user.username, email: user.email, created_at: user.created_at });
});

// ── Activity Log ─────────────────────────────────────────────────
// Get last 7 days of activity
app.get('/api/activity-log', authMiddleware, async (req, res) => {
  const logs = await db.activityLogs.findAsync({ userId: req.user.id }).sort({ date: -1 }).limit(7);
  res.json({ logs });
});

// Upsert today's activity (steps, distance, calories, activeMinutes)
app.post('/api/activity-log', authMiddleware, async (req, res) => {
  const { date, steps, distanceKm, caloriesBurned, activeMinutes, stepGoal } = req.body;
  const d = date || new Date().toISOString().split('T')[0];
  const existing = await db.activityLogs.findOneAsync({ userId: req.user.id, date: d });
  if (existing) {
    await db.activityLogs.updateAsync(
      { userId: req.user.id, date: d },
      { $set: { steps, distanceKm, caloriesBurned, activeMinutes, stepGoal, updated_at: new Date().toISOString() } }
    );
    res.json({ id: existing._id, message: 'Updated' });
  } else {
    const doc = await db.activityLogs.insertAsync({
      userId: req.user.id, date: d,
      steps: steps || 0, distanceKm: distanceKm || 0,
      caloriesBurned: caloriesBurned || 0, activeMinutes: activeMinutes || 0,
      stepGoal: stepGoal || 10000,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    res.json({ id: doc._id, message: 'Saved' });
  }
});

// ── Serve frontend ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  NutriMetrics server → http://localhost:${PORT}\n`);
});
