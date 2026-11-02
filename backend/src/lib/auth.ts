import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './env';

export type TokenKind = 'customer' | 'admin';

export interface JwtPayload {
  sub: number;
  kind: TokenKind;
  email: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as unknown as JwtPayload;
  } catch {
    return null;
  }
}
