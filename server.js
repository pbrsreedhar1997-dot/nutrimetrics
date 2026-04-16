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
};

// Indexes
db.users.ensureIndex({ fieldName: 'username', unique: true });
db.users.ensureIndex({ fieldName: 'email',    unique: true });
db.proteinLogs.ensureIndex({ fieldName: 'userId' });
db.bmiLogs.ensureIndex({ fieldName: 'userId' });

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

// ── Serve frontend ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  NutriMetrics server → http://localhost:${PORT}\n`);
});
