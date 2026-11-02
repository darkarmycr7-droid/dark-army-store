import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // A malformed JSON body is the caller's mistake, not ours. body-parser throws
  // a SyntaxError that already carries status 400; without this it fell through
  // to a 500 and a stack trace in the log for what is really a bad request.
  if (err instanceof SyntaxError && (err as { status?: number }).status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON in the request body' });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
}
