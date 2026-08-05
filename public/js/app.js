// ===== AUTH HELPERS =====
function getToken() { return localStorage.getItem('token'); }
function getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function isLoggedIn() { return !!getToken(); }
function isAdmin() { const u = getUser(); return u && u.role === 'admin'; }
function isTutor() { const u = getUser(); return u && u.role === 'tutor'; }
function logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/'; }

function updateNavbar() {
  const nav = document.getElementById('nav-links');
  if (!nav) return;
  const u = getUser();
  if (u) {
    let links = `<span class="user-name">${u.full_name}</span><a href="/dashboard.html" class="nav-link">Dashboard</a>`;
    if (u.role === 'admin') links += `<a href="/admin.html" class="nav-link">Admin</a>`;
    links += `<button onclick="logout()" class="btn btn-sm btn-outline">Logout</button>`;
    nav.innerHTML = links;
  } else {
    nav.innerHTML = `<a href="/login.html" class="nav-link">Log in</a><a href="/register.html" class="btn btn-sm btn-primary">Sign up</a>`;
  }
}

function requireAuth() {
  if (!isLoggedIn()) window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
}

function requireAdmin() { requireAuth(); if (!isAdmin()) window.location.href = '/'; }

// ===== API CLIENT =====
const API_URL = window.location.origin;

async function api(endpoint, options = {}) {
  const url = `${API_URL}/api${endpoint}`;
  const token = getToken();
  const config = { headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }, ...options };
  if (config.body && typeof config.body === 'object') config.body = JSON.stringify(config.body);
  const res = await fetch(url, config);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const auth = {
  register: (data) => api('/auth/register', { method: 'POST', body: data }),
  login: (data) => api('/auth/login', { method: 'POST', body: data }),
  me: () => api('/auth/me')
};

const tutors = {
  list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api(`/tutors?${qs}`); },
  get: (id) => api(`/tutors/${id}`),
  apply: (data) => api('/tutors/apply', { method: 'POST', body: data }),
  availability: (id, date) => api(`/tutors/${id}/availability?date=${date}`)
};

const schedules = {
  list: () => api('/my-schedule'),
  create: (data) => api('/my-schedule', { method: 'POST', body: data }),
  remove: (id) => api(`/my-schedule/${id}`, { method: 'DELETE' })
};

const packages = {
  list: (tutorId) => api(`/tutors/${tutorId}/packages`),
  myPackages: () => api('/my-packages'),
  create: (data) => api('/my-packages', { method: 'POST', body: data }),
  update: (id, data) => api(`/my-packages/${id}`, { method: 'PUT', body: data }),
  remove: (id) => api(`/my-packages/${id}`, { method: 'DELETE' })
};

const bookings = {
  create: (data) => api('/bookings', { method: 'POST', body: data }),
  list: () => api('/bookings'),
  update: (id, data) => api(`/bookings/${id}`, { method: 'PUT', body: data })
};

const subscriptions = {
  create: (data) => api('/subscriptions', { method: 'POST', body: data }),
  list: () => api('/my-subscriptions')
};

const admin = {
  stats: () => api('/admin/stats'),
  pendingTutors: () => api('/admin/pending-tutors'),
  approveTutor: (id) => api(`/admin/tutors/${id}/approve`, { method: 'PUT' }),
  rejectTutor: (id) => api(`/admin/tutors/${id}`, { method: 'DELETE' }),
  allBookings: () => api('/admin/bookings'),
  allUsers: () => api('/admin/users')
};

// ===== UTILS =====
function formatDay(dow) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
}

function isRoomActive(sessionDate, sessionTime) {
  const now = new Date();
  const session = new Date(sessionDate + 'T' + sessionTime);
  const diff = (now - session) / 60000; // minutes
  return diff >= -5 && diff <= 90; // active 5 min before to 90 min after
}

document.addEventListener('DOMContentLoaded', updateNavbar);
