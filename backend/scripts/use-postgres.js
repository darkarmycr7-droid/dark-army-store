// Flips the Prisma datasource from SQLite (local dev) to PostgreSQL.
// Run inside the Docker build only — keeps schema.prisma as the single source
// of truth while letting dev stay on zero-config SQLite.
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'prisma', 'schema.prisma');
let s = fs.readFileSync(file, 'utf8');

if (s.includes('provider = "sqlite"')) {
  s = s.replace('provider = "sqlite"', 'provider = "postgresql"');
  fs.writeFileSync(file, s);
  console.log('✔ Prisma datasource set to postgresql');
} else if (s.includes('provider = "postgresql"')) {
  console.log('• Prisma datasource already postgresql');
} else {
  console.error('✖ Could not find a datasource provider line to switch');
  process.exit(1);
}
