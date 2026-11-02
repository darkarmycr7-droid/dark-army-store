import fs from 'fs';
import path from 'path';

/**
 * Backs up the SQLite database to ./backups with a timestamp and prunes to the
 * most recent `keep` copies. For PostgreSQL (production) use `pg_dump` instead —
 * see DEPLOY notes.
 */
export function runBackup(keep = 14): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  if (!dbUrl.startsWith('file:')) {
    throw new Error('File backup only supports SQLite. For PostgreSQL schedule `pg_dump` instead.');
  }

  const rel = dbUrl.slice('file:'.length).replace(/^\.\//, '');
  // Prisma resolves the SQLite path relative to the prisma/ schema dir.
  const dbPath = path.resolve(process.cwd(), 'prisma', rel);
  if (!fs.existsSync(dbPath)) throw new Error(`Database file not found at ${dbPath}`);

  const dir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(dir, `backup-${stamp}.db`);
  fs.copyFileSync(dbPath, dest);
  // Include WAL/SHM if present so the copy is consistent.
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, dest + ext);
  }

  // Prune old backups (keep newest `keep` .db files)
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.db'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) {
    for (const ext of ['', '-wal', '-shm']) {
      const p = path.join(dir, f + ext);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  return dest;
}
