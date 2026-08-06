const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tutors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      bio TEXT,
      subjects TEXT NOT NULL,
      levels TEXT NOT NULL,
      price_per_hour INTEGER NOT NULL,
      location TEXT NOT NULL,
      education TEXT,
      is_approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (tutor_id) REFERENCES tutors(id),
      UNIQUE(tutor_id, day_of_week, start_time)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS monthly_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_per_month INTEGER NOT NULL,
      sessions_included INTEGER NOT NULL DEFAULT 4,
      subjects TEXT NOT NULL,
      levels TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tutor_id) REFERENCES tutors(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      tutor_id INTEGER NOT NULL,
      package_id INTEGER,
      booking_type TEXT DEFAULT 'session',
      subject TEXT NOT NULL,
      session_date TEXT NOT NULL,
      session_time TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      room_url TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (tutor_id) REFERENCES tutors(id),
      FOREIGN KEY (package_id) REFERENCES monthly_packages(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      tutor_id INTEGER NOT NULL,
      package_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      sessions_used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (tutor_id) REFERENCES tutors(id),
      FOREIGN KEY (package_id) REFERENCES monthly_packages(id)
    )
  `);

  // NEW: password reset tokens
  await run(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminExists = await get("SELECT id FROM users WHERE email = ?", ['admin@learnlink.bw']);
  if (!adminExists) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    await run(`INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      ['Admin User', 'admin@learnlink.bw', '+267 00000000', adminHash, 'admin']);
    console.log('Admin user created: admin@learnlink.bw / admin123');
  }

  const tutorCount = await get("SELECT COUNT(*) as count FROM tutors WHERE is_approved = 1");
  if (tutorCount.count === 0) {
    await seedSampleTutors();
  }

  console.log('Database initialized');
}

async function seedSampleTutors() {
  const tutors = [
    { name: 'Keletso M.', email: 'keletso@example.com', phone: '+267 71 234 567',
      bio: 'Passionate mathematics and physics tutor with 5 years experience.',
      subjects: 'Mathematics,Physics', levels: 'BGCSE,IGCSE', price: 180, location: 'Gaborone', education: 'BSc Mathematics, UB' },
    { name: 'Thabo N.', email: 'thabo@example.com', phone: '+267 72 345 678',
      bio: 'English literature specialist focusing on reading, writing, and critical analysis.',
      subjects: 'English,Setswana', levels: 'PSLE,JCE,BGCSE', price: 150, location: 'Francistown', education: 'BA English, UB' },
    { name: 'Lebogang M.', email: 'lebogang@example.com', phone: '+267 73 456 789',
      bio: 'Biology and chemistry tutor. Makes science fun and accessible.',
      subjects: 'Biology,Chemistry', levels: 'JCE,BGCSE,IGCSE', price: 170, location: 'Gaborone', education: 'BSc Biological Sciences, UB' },
    { name: 'Onneile R.', email: 'onneile@example.com', phone: '+267 74 567 890',
      bio: 'Accounting and business studies expert with real-world examples.',
      subjects: 'Accounting,Business Studies', levels: 'BGCSE,IGCSE,University', price: 200, location: 'Gaborone', education: 'BCom Accounting, UCT' },
    { name: 'Kagiso D.', email: 'kagiso@example.com', phone: '+267 75 678 901',
      bio: 'Computer science tutor specializing in programming and IT fundamentals.',
      subjects: 'Computer Science,Mathematics', levels: 'BGCSE,IGCSE,University', price: 190, location: 'Palapye', education: 'BSc Computer Science, BIUST' },
    { name: 'Amantle K.', email: 'amantle@example.com', phone: '+267 76 789 012',
      bio: 'History and geography tutor making social sciences engaging.',
      subjects: 'History,Geography', levels: 'JCE,BGCSE,IGCSE', price: 140, location: 'Maun', education: 'BA Humanities, UB' }
  ];

  for (const t of tutors) {
    const hash = bcrypt.hashSync('password123', 10);
    const userResult = await run(`INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [t.name, t.email, t.phone, hash, 'tutor']);
    const tutorResult = await run(`INSERT INTO tutors (user_id, bio, subjects, levels, price_per_hour, location, education, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [userResult.lastID, t.bio, t.subjects, t.levels, t.price, t.location, t.education]);

    const days = [[1, '09:00', '12:00'], [1, '14:00', '17:00'], [2, '09:00', '17:00'], [3, '09:00', '12:00'], [3, '14:00', '17:00'], [4, '09:00', '17:00'], [5, '09:00', '12:00']];
    for (const [dow, st, et] of days) {
      await run(`INSERT INTO schedules (tutor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)`,
        [tutorResult.lastID, dow, st, et]);
    }

    await run(`INSERT INTO monthly_packages (tutor_id, name, description, price_per_month, sessions_included, subjects, levels) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tutorResult.lastID, 'Monthly Plan', `4 sessions/month — ${t.subjects}`, Math.round(t.price * 4 * 0.9), 4, t.subjects, t.levels]);
  }
  console.log('Seeded tutors, schedules, and packages');
}

module.exports = { db, run, get, all, initDatabase };
