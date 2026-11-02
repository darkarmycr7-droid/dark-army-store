import { NextFunction, Request, Response } from 'express';
import { verifyToken, JwtPayload, TokenKind } from '../lib/auth';
import { HttpError } from './error';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

function extract(req: Request): JwtPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}

/** Optional auth — attaches req.auth if a valid token is present, never blocks. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const payload = extract(req);
  if (payload) req.auth = payload;
  next();
}

/** Required auth of a given kind. */
export function requireAuth(kind: TokenKind) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const payload = extract(req);
    if (!payload || payload.kind !== kind) {
      throw new HttpError(401, 'Authentication required');
    }
    req.auth = payload;
    next();
  };
}
