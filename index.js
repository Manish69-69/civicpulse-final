const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// ── PORT: Railway injects PORT automatically – never hardcode it ──
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'civicpulse-default-secret-change-me';

// ── Database: persist to volume if Railway provides one ──
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const DB_PATH = path.join(DB_DIR, 'civicpulse.db');

console.log('DB path:', DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'citizen',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    image TEXT,
    admin_notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ── Seed demo accounts ──
const adminRow = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@demo.com');
if (!adminRow) {
  const ap = bcrypt.hashSync('admin123', 10);
  const cp = bcrypt.hashSync('demo123', 10);
  db.prepare('INSERT INTO users (email,password,name,role) VALUES (?,?,?,?)').run('admin@demo.com', ap, 'Admin User', 'admin');
  db.prepare('INSERT INTO users (email,password,name,role) VALUES (?,?,?,?)').run('citizen@demo.com', cp, 'Demo Citizen', 'citizen');

  // Seed sample complaints
  const citizenId = db.prepare('SELECT id FROM users WHERE email=?').get('citizen@demo.com').id;
  const categories = ['Roads','Water','Electricity','Sanitation','Parks'];
  const statuses = ['pending','in_progress','resolved'];
  const titles = [
    'Pothole on Main Street',
    'Water leakage near park',
    'Street light not working',
    'Garbage not collected for 3 days',
    'Park benches broken'
  ];
  titles.forEach((t, i) => {
    db.prepare(
      'INSERT INTO complaints (user_id,title,description,category,location,status) VALUES (?,?,?,?,?,?)'
    ).run(citizenId, t, `Detailed description for: ${t}`, categories[i], `Sector ${i+1}, Block A`, statuses[i % 3]);
  });
  console.log('Demo data seeded');
}

// ── Middleware ──
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ── Auth helpers ──
function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

// ════════════════════════════
//  AUTH ROUTES
// ════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: makeToken(user), user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (email,password,name,role) VALUES (?,?,?,?)').run(
      email.trim().toLowerCase(), hash, name.trim(), 'citizen'
    );
    const user = { id: result.lastInsertRowid, email: email.trim().toLowerCase(), name: name.trim(), role: 'citizen' };
    res.status(201).json({ token: makeToken(user), user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════
//  COMPLAINT ROUTES
// ════════════════════════════
app.get('/api/complaints', requireAuth, (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = db.prepare(`
        SELECT c.*, u.name AS user_name, u.email AS user_email
        FROM complaints c
        JOIN users u ON c.user_id = u.id
        ORDER BY c.created_at DESC
      `).all();
    } else {
      rows = db.prepare(`
        SELECT c.*, u.name AS user_name
        FROM complaints c
        JOIN users u ON c.user_id = u.id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
      `).all(req.user.id);
    }
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load complaints' });
  }
});

app.post('/api/complaints', requireAuth, upload.single('image'), (req, res) => {
  const { title, description, category, location } = req.body;
  if (!title || !description || !category || !location) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  let imageData = null;
  if (req.file) {
    imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }

  try {
    const result = db.prepare(
      'INSERT INTO complaints (user_id,title,description,category,location,image) VALUES (?,?,?,?,?,?)'
    ).run(req.user.id, title.trim(), description.trim(), category, location.trim(), imageData);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Complaint submitted successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
});

app.patch('/api/complaints/:id', requireAdmin, (req, res) => {
  const { status, admin_notes } = req.body;
  const valid = ['pending', 'in_progress', 'resolved', 'rejected'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  try {
    db.prepare(
      'UPDATE complaints SET status=?, admin_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).run(status, admin_notes || '', req.params.id);
    res.json({ message: 'Complaint updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update complaint' });
  }
});

app.get('/api/stats', requireAdmin, (req, res) => {
  try {
    const total    = db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n;
    const pending  = db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE status='pending'").get().n;
    const progress = db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE status='in_progress'").get().n;
    const resolved = db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE status='resolved'").get().n;
    const rejected = db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE status='rejected'").get().n;
    const byCategory = db.prepare(
      "SELECT category, COUNT(*) AS n FROM complaints GROUP BY category ORDER BY n DESC"
    ).all();
    res.json({ total, pending, progress, resolved, rejected, byCategory });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ── Health check ──
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Fallback: serve index.html for any unknown route ──
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──  MUST bind 0.0.0.0 for Railway (not localhost/127.0.0.1)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏛️  CivicPulse API  →  http://0.0.0.0:${PORT}/api`);
  console.log(`   Demo logins:`);
  console.log(`   citizen@demo.com  /  demo123`);
  console.log(`   admin@demo.com    /  admin123\n`);
});
