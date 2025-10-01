const path = require('path');
const fs = require('fs');
const storage = require('../storage');

function cleanup() {
  if (fs.existsSync(storage.STATE_FILE)) {
    fs.unlinkSync(storage.STATE_FILE);
  }
}

cleanup();

storage.recordEvent({
  event: 'widget_opened',
  customerId: 'demo_customer',
  hostname: 'demo.example.com',
  userId: 'user-123',
  timestamp: '2025-01-01T10:00:00.000Z'
});

storage.recordEvent({
  event: 'widget_opened',
  customerId: 'demo_customer',
  hostname: 'demo.example.com',
  userId: 'user-456',
  timestamp: '2025-01-01T11:00:00.000Z'
});

storage.recordEvent({
  event: 'widget_opened',
  customerId: 'demo_customer',
  hostname: 'demo.example.com',
  userId: 'user-123',
  timestamp: '2025-01-02T09:00:00.000Z'
});

const summary = storage.getSummary();

console.log(JSON.stringify(summary, null, 2));

cleanup();
