require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const { db, run, get, all, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const DAILY_API_KEY = process.env.DAILY_API_KEY || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

initDatabase().catch(console.error);

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ===== AUTH =====
app.post('/api/auth/register', async (req, res) => {
  try {
    const { full_name, email, phone, password, role } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hash = bcrypt.hashSync(password, 10);
    const userRole = role === 'tutor' ? 'tutor' : 'student';
    const result = await run(`INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, phone || '', hash, userRole]);
    const token = jwt.sign({ id: result.lastID, email, role: userRole }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastID, full_name, email, role: userRole } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, phone: user.phone } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await get('SELECT id, full_name, email, phone, role FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'No account found with that email' });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    await run('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [email, token, expires]);
    res.json({ message: 'Reset token generated. Use it within 1 hour.', token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Reset password with token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'Token and new password required' });
    const reset = await get('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > ?', [token, new Date().toISOString()]);
    if (!reset) return res.status(400).json({ error: 'Invalid or expired token' });
    const hash = bcrypt.hashSync(new_password, 10);
    await run('UPDATE users SET password_hash = ? WHERE email = ?', [hash, reset.email]);
    await run('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Update own profile
app.put('/api/auth/profile', authenticate, async (req, res) => {
  try {
    const { full_name, email, phone } = req.body;
    if (!full_name || !email) return res.status(400).json({ error: 'Name and email required' });
    const existing = await get('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
    if (existing) return res.status(400).json({ error: 'Email already in use' });
    await run('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?', [full_name, email, phone || '', req.user.id]);
    res.json({ message: 'Profile updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Change own password
app.put('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    const user = await get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = bcrypt.hashSync(new_password, 10);
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== TUTORS =====
app.get('/api/tutors', async (req, res) => {
  try {
    const { subject, level, location, search } = req.query;
    let sql = `SELECT t.*, u.full_name, u.email, u.phone FROM tutors t JOIN users u ON t.user_id = u.id WHERE t.is_approved = 1`;
    const params = [];
    if (subject) { sql += ` AND t.subjects LIKE ?`; params.push(`%${subject}%`); }
    if (level) { sql += ` AND t.levels LIKE ?`; params.push(`%${level}%`); }
    if (location) { sql += ` AND t.location LIKE ?`; params.push(`%${location}%`); }
    if (search) { sql += ` AND (u.full_name LIKE ? OR t.subjects LIKE ? OR t.bio LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ` ORDER BY t.created_at DESC`;
    const tutors = await all(sql, params);
    res.json(tutors);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tutors/:id', async (req, res) => {
  try {
    const tutor = await get(`SELECT t.*, u.full_name, u.email, u.phone FROM tutors t JOIN users u ON t.user_id = u.id WHERE t.id = ? AND t.is_approved = 1`, [req.params.id]);
    if (!tutor) return res.status(404).json({ error: 'Tutor not found' });
    const packages = await all('SELECT * FROM monthly_packages WHERE tutor_id = ? AND is_active = 1', [req.params.id]);
    tutor.packages = packages;
    res.json(tutor);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tutors/apply', authenticate, async (req, res) => {
  try {
    const { bio, subjects, levels, price_per_hour, location, education } = req.body;
    if (!subjects || !levels || !price_per_hour || !location) return res.status(400).json({ error: 'Missing required fields' });
    const existing = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (existing) return res.status(400).json({ error: 'You already have a tutor profile' });
    const result = await run(`INSERT INTO tutors (user_id, bio, subjects, levels, price_per_hour, location, education, is_approved) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [req.user.id, bio || '', subjects, levels, price_per_hour, location, education || '']);
    await run("UPDATE users SET role = 'tutor' WHERE id = ?", [req.user.id]);
    res.json({ id: result.lastID, message: 'Application submitted. Awaiting approval.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Update tutor profile
app.put('/api/tutors/me', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    const { bio, subjects, levels, price_per_hour, location, education } = req.body;
    await run('UPDATE tutors SET bio=?, subjects=?, levels=?, price_per_hour=?, location=?, education=? WHERE id=?',
      [bio, subjects, levels, price_per_hour, location, education, tutor.id]);
    res.json({ message: 'Tutor profile updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SCHEDULES =====
app.get('/api/tutors/:id/availability', async (req, res) => {
  try {
    const { date } = req.query;
    const tutorId = req.params.id;
    if (!date) return res.status(400).json({ error: 'Date required' });
    const dow = new Date(date).getDay();
    const schedules = await all('SELECT * FROM schedules WHERE tutor_id = ? AND day_of_week = ?', [tutorId, dow]);
    const bookings = await all("SELECT session_time FROM bookings WHERE tutor_id = ? AND session_date = ? AND status IN ('pending','confirmed')", [tutorId, date]);
    const bookedTimes = bookings.map(b => b.session_time);
    const availableSlots = [];
    for (const s of schedules) {
      let current = s.start_time;
      while (current < s.end_time) {
        if (!bookedTimes.includes(current)) {
          availableSlots.push(current);
        }
        const [h, m] = current.split(':').map(Number);
        const nextH = h + 1;
        current = `${String(nextH).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
    }
    res.json({ date, day_of_week: dow, slots: availableSlots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/my-schedule', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.json([]);
    const schedules = await all('SELECT * FROM schedules WHERE tutor_id = ? ORDER BY day_of_week, start_time', [tutor.id]);
    res.json(schedules);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/my-schedule', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    const { day_of_week, start_time, end_time } = req.body;
    const result = await run(`INSERT INTO schedules (tutor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)`,
      [tutor.id, day_of_week, start_time, end_time]);
    res.json({ id: result.lastID, message: 'Schedule added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/my-schedule/:id', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    await run('DELETE FROM schedules WHERE id = ? AND tutor_id = ?', [req.params.id, tutor.id]);
    res.json({ message: 'Schedule removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== MONTHLY PACKAGES =====
app.get('/api/tutors/:id/packages', async (req, res) => {
  try {
    const packages = await all('SELECT * FROM monthly_packages WHERE tutor_id = ? AND is_active = 1', [req.params.id]);
    res.json(packages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/my-packages', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    const packages = await all('SELECT * FROM monthly_packages WHERE tutor_id = ?', [tutor.id]);
    res.json(packages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/my-packages', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    const { name, description, price_per_month, sessions_included, subjects, levels } = req.body;
    const result = await run(`INSERT INTO monthly_packages (tutor_id, name, description, price_per_month, sessions_included, subjects, levels) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tutor.id, name, description, price_per_month, sessions_included, subjects, levels]);
    res.json({ id: result.lastID, message: 'Package created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/my-packages/:id', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    const { name, description, price_per_month, sessions_included, subjects, levels, is_active } = req.body;
    await run(`UPDATE monthly_packages SET name=?, description=?, price_per_month=?, sessions_included=?, subjects=?, levels=?, is_active=? WHERE id=? AND tutor_id=?`,
      [name, description, price_per_month, sessions_included, subjects, levels, is_active, req.params.id, tutor.id]);
    res.json({ message: 'Package updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/my-packages/:id', authenticate, async (req, res) => {
  try {
    const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
    if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
    await run('DELETE FROM monthly_packages WHERE id = ? AND tutor_id = ?', [req.params.id, tutor.id]);
    res.json({ message: 'Package deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== BOOKINGS =====
app.post('/api/bookings', authenticate, async (req, res) => {
  try {
    const { tutor_id, package_id, booking_type, subject, session_date, session_time, notes } = req.body;
    if (!tutor_id || !subject || !session_date || !session_time) return res.status(400).json({ error: 'Missing required fields' });
    const bt = booking_type || 'session';
    const result = await run(`INSERT INTO bookings (student_id, tutor_id, package_id, booking_type, subject, session_date, session_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, tutor_id, package_id || null, bt, subject, session_date, session_time, notes || '']);
    res.json({ id: result.lastID, message: 'Booking request sent' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bookings', authenticate, async (req, res) => {
  try {
    let sql, params;
    if (req.user.role === 'student') {
      sql = `SELECT b.*, u.full_name as tutor_name, u.phone as tutor_phone, p.name as package_name FROM bookings b JOIN tutors t ON b.tutor_id = t.id JOIN users u ON t.user_id = u.id LEFT JOIN monthly_packages p ON b.package_id = p.id WHERE b.student_id = ? ORDER BY b.created_at DESC`;
      params = [req.user.id];
    } else if (req.user.role === 'tutor') {
      const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
      if (!tutor) return res.json([]);
      sql = `SELECT b.*, u.full_name as student_name, u.phone as student_phone, p.name as package_name FROM bookings b JOIN users u ON b.student_id = u.id LEFT JOIN monthly_packages p ON b.package_id = p.id WHERE b.tutor_id = ? ORDER BY b.created_at DESC`;
      params = [tutor.id];
    } else { return res.status(403).json({ error: 'Forbidden' }); }
    const bookings = await all(sql, params);
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Get single booking detail
app.get('/api/bookings/:id', authenticate, async (req, res) => {
  try {
    let sql, params;
    if (req.user.role === 'student') {
      sql = `SELECT b.*, u.full_name as tutor_name, u.phone as tutor_phone, u.email as tutor_email, p.name as package_name FROM bookings b JOIN tutors t ON b.tutor_id = t.id JOIN users u ON t.user_id = u.id LEFT JOIN monthly_packages p ON b.package_id = p.id WHERE b.id = ? AND b.student_id = ?`;
      params = [req.params.id, req.user.id];
    } else if (req.user.role === 'tutor') {
      const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
      if (!tutor) return res.status(403).json({ error: 'Not a tutor' });
      sql = `SELECT b.*, u.full_name as student_name, u.phone as student_phone, u.email as student_email, p.name as package_name FROM bookings b JOIN users u ON b.student_id = u.id LEFT JOIN monthly_packages p ON b.package_id = p.id WHERE b.id = ? AND b.tutor_id = ?`;
      params = [req.params.id, tutor.id];
    } else if (req.user.role === 'admin') {
      sql = `SELECT b.*, s.full_name as student_name, s.phone as student_phone, s.email as student_email, t_user.full_name as tutor_name, t_user.phone as tutor_phone, t_user.email as tutor_email, p.name as package_name FROM bookings b JOIN users s ON b.student_id = s.id JOIN tutors t ON b.tutor_id = t.id JOIN users t_user ON t.user_id = t_user.id LEFT JOIN monthly_packages p ON b.package_id = p.id WHERE b.id = ?`;
      params = [req.params.id];
    } else { return res.status(403).json({ error: 'Forbidden' }); }
    const booking = await get(sql, params);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== DAILY.CO ROOM CREATION =====
async function createDailyRoom(bookingId) {
  if (!DAILY_API_KEY) return null;
  try {
    const roomName = `learnlink-${bookingId}-${Date.now()}`;
    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DAILY_API_KEY}` },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: { max_participants: 2, enable_screenshare: true, enable_chat: true }
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url;
  } catch (e) { return null; }
}

app.put('/api/bookings/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (req.user.role === 'student' && booking.student_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (req.user.role === 'tutor') {
      const tutor = await get('SELECT id FROM tutors WHERE user_id = ?', [req.user.id]);
      if (!tutor || booking.tutor_id !== tutor.id) return res.status(403).json({ error: 'Not authorized' });
    }

    let roomUrl = booking.room_url;
    if (status === 'confirmed' && !roomUrl) {
      roomUrl = await createDailyRoom(booking.id);
      if (roomUrl) {
        await run('UPDATE bookings SET status = ?, room_url = ? WHERE id = ?', [status, roomUrl, req.params.id]);
      } else {
        await run('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
      }
    } else {
      await run('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
    }

    res.json({ message: 'Booking updated', room_url: roomUrl || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== SUBSCRIPTIONS =====
app.post('/api/subscriptions', authenticate, async (req, res) => {
  try {
    const { tutor_id, package_id, start_date } = req.body;
    if (!tutor_id || !package_id || !start_date) return res.status(400).json({ error: 'Missing fields' });
    const pkg = await get('SELECT * FROM monthly_packages WHERE id = ?', [package_id]);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    const start = new Date(start_date);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const result = await run(`INSERT INTO subscriptions (student_id, tutor_id, package_id, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, tutor_id, package_id, start_date, end.toISOString().split('T')[0]]);
    res.json({ id: result.lastID, message: 'Subscription created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/my-subscriptions', authenticate, async (req, res) => {
  try {
    const subs = await all(`SELECT s.*, u.full_name as tutor_name, p.name as package_name, p.sessions_included FROM subscriptions s JOIN tutors t ON s.tutor_id = t.id JOIN users u ON t.user_id = u.id JOIN monthly_packages p ON s.package_id = p.id WHERE s.student_id = ? ORDER BY s.created_at DESC`, [req.user.id]);
    res.json(subs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== ADMIN =====
app.get('/api/admin/pending-tutors', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const tutors = await all(`SELECT t.*, u.full_name, u.email, u.phone FROM tutors t JOIN users u ON t.user_id = u.id WHERE t.is_approved = 0 ORDER BY t.created_at DESC`);
    res.json(tutors);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/tutors/:id/approve', authenticate, requireRole('admin'), async (req, res) => {
  try { await run("UPDATE tutors SET is_approved = 1 WHERE id = ?", [req.params.id]); res.json({ message: 'Tutor approved' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/tutors/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const tutor = await get('SELECT user_id FROM tutors WHERE id = ?', [req.params.id]);
    if (tutor) { await run("UPDATE users SET role = 'student' WHERE id = ?", [tutor.user_id]); await run("DELETE FROM tutors WHERE id = ?", [req.params.id]); }
    res.json({ message: 'Tutor rejected' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/bookings', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const bookings = await all(`SELECT b.*, s.full_name as student_name, t_user.full_name as tutor_name FROM bookings b JOIN users s ON b.student_id = s.id JOIN tutors t ON b.tutor_id = t.id JOIN users t_user ON t.user_id = t_user.id ORDER BY b.created_at DESC`);
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', authenticate, requireRole('admin'), async (req, res) => {
  try { const users = await all(`SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC`); res.json(users); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Admin reset user password
app.put('/api/admin/users/:id/reset-password', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: 'New password required' });
    const hash = bcrypt.hashSync(new_password, 10);
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const totalUsers = await get("SELECT COUNT(*) as count FROM users");
    const totalTutors = await get("SELECT COUNT(*) as count FROM tutors WHERE is_approved = 1");
    const pendingTutors = await get("SELECT COUNT(*) as count FROM tutors WHERE is_approved = 0");
    const totalBookings = await get("SELECT COUNT(*) as count FROM bookings");
    const pendingBookings = await get("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'");
    res.json({ totalUsers: totalUsers.count, totalTutors: totalTutors.count, pendingTutors: pendingTutors.count, totalBookings: totalBookings.count, pendingBookings: pendingBookings.count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => { console.log(`LearnLink server running on http://localhost:${PORT}`); });
