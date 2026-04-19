const Database = require('better-sqlite3');
const db = new Database('shop.db');

try {
  const users = db.prepare('SELECT id, email, name FROM users').all();
  console.log('✅ Users in database:', users.length);
  users.forEach(u => console.log(`  - ${u.name} (${u.email})`));
} catch (e) {
  console.error('Error:', e.message);
}

db.close();
