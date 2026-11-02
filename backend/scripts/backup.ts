import 'dotenv/config';
import { runBackup } from '../src/services/backup.service';

try {
  const dest = runBackup(Number(process.env.BACKUP_KEEP) || 14);
  console.log(`✔ Backup written: ${dest}`);
} catch (e) {
  console.error('✖ Backup failed:', (e as Error).message);
  process.exit(1);
}
