const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'usage.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) {
    const initial = { customers: {} };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.customers) {
      return parsed;
    }
  } catch (err) {
    console.error('[storage] Failed to read state, reinitializing:', err.message);
  }
  return { customers: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function recordEvent(payload) {
  const state = loadState();
  const key = `${payload.customerId || 'unknown'}|${payload.hostname || 'unknown'}`;
  const existing = state.customers[key] || {
    customerId: payload.customerId || 'unknown',
    customerName: payload.customerName || null,
    host: payload.hostname || 'unknown',
    uniqueUsers: [],
    totalSessions: 0,
    lastSeen: null
  };

  if (payload.customerName && !existing.customerName) {
    existing.customerName = payload.customerName;
  }

  const userId = payload.userId || null;
  if (userId && !existing.uniqueUsers.includes(userId)) {
    existing.uniqueUsers.push(userId);
  }

  existing.totalSessions += 1;
  existing.lastSeen = payload.timestamp || new Date().toISOString();

  state.customers[key] = existing;
  saveState(state);
}

function getSummary() {
  const state = loadState();
  return Object.values(state.customers).map((entry) => ({
    customerId: entry.customerId,
    customerName: entry.customerName || null,
    host: entry.host,
    uniqueUsers: entry.uniqueUsers.length,
    totalSessions: entry.totalSessions,
    lastSeen: entry.lastSeen
  }));
}

module.exports = {
  recordEvent,
  getSummary,
  loadState,
  saveState,
  ensureDir,
  DATA_DIR,
  STATE_FILE
};
