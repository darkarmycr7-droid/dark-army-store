import fs from 'fs';
import path from 'path';
import { env } from '../lib/env';

/**
 * Storage abstraction. `local` writes to ./uploads and serves via Express
 * static. Swap STORAGE_DRIVER=s3 and implement S3Storage to move to AWS S3
 * without touching call sites.
 */
export interface Storage {
  save(buffer: Buffer, filename: string): Promise<string>; // returns public URL
}

class LocalStorage implements Storage {
  private dir = path.resolve(process.cwd(), 'uploads');
  constructor() {
    fs.mkdirSync(this.dir, { recursive: true });
  }
  async save(buffer: Buffer, filename: string): Promise<string> {
    const safe = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await fs.promises.writeFile(path.join(this.dir, safe), buffer);
    // Relative, same-origin URL — served by the Next proxy (/uploads/*). Works
    // over localhost, LAN, and tunnels without baking in a host/IP.
    return `/uploads/${safe}`;
  }
}

// Placeholder — implement with @aws-sdk/client-s3 when credentials are ready.
class S3Storage implements Storage {
  async save(): Promise<string> {
    throw new Error('S3 storage not configured. Set STORAGE_DRIVER=local or implement S3Storage.');
  }
}

export const storage: Storage = env.storageDriver === 's3' ? new S3Storage() : new LocalStorage();
