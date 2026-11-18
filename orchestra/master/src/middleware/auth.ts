// import { Request, Response, NextFunction } from 'express';
// import { verifyToken } from '@clerk/backend';
// import { config } from '../config';
// import { pool } from '../db';

// declare global {
//   // eslint-disable-next-line @typescript-eslint/no-namespace
//   namespace Express {
//     interface Request {
//       userId?: string;
//     }
//   }
// }

// const DEV_FALLBACK_USER_ID = 'dev-local-user';

// /**
//  * Verifies the `Authorization: Bearer <clerk-session-token>` header using
//  * Clerk's backend SDK, and sets `req.userId` to the Clerk user id.
//  *
//  * On first sight of a user id, upserts a row into `users` + a default
//  * "free" row into `subscriptions`, so every authenticated user always has
//  * billing state to read.
//  */
// export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
//   try {
//     const header = req.headers.authorization;
//     const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

//     if (!token) {
//       if (config.authOptional) {
//         req.userId = DEV_FALLBACK_USER_ID;
//         await ensureUser(DEV_FALLBACK_USER_ID);
//         return next();
//       }
//       res.status(401).json({ error: 'Missing Authorization bearer token' });
//       return;
//     }
//     config.clerkSecretKey = process.env.CLERK_SECRET_KEY as string;

//     if (!config.clerkSecretKey) {
//       res.status(500).json({ error: 'Server is missing CLERK_SECRET_KEY' });
//       return;
//     }

//     const verified = await verifyToken(token, { secretKey: config.clerkSecretKey });
//     const userId = verified.sub;
//     if (!userId) {
//       res.status(401).json({ error: 'Invalid session token' });
//       return;
//     }

//     req.userId = userId;
//     await ensureUser(userId);
//     next();
//   } catch (err) {
//     console.error('[auth] token verification failed', err);
//     res.status(401).json({ error: 'Invalid or expired session token' });
//   }
// }

// async function ensureUser(userId: string): Promise<void> {
//   await pool.query(
//     `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
//     [userId]
//   );
//   await pool.query(
//     `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active')
//      ON CONFLICT (user_id) DO NOTHING`,
//     [userId]
//   );
// }


import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { config } from '../config';
import { pool } from '../db';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const DEV_FALLBACK_USER_ID = 'dev-local-user';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    // No token at all
    if (!token) {
      if (config.authOptional) {
        req.userId = DEV_FALLBACK_USER_ID;
        await ensureUser(DEV_FALLBACK_USER_ID);
        return next();
      }
      res.status(401).json({ error: 'Missing Authorization bearer token' });
      return;
    }

    // Key not configured
    if (!config.clerkSecretKey) {
      console.error('[auth] CLERK_SECRET_KEY is empty — check master/.env');
      res.status(500).json({ error: 'Server is missing CLERK_SECRET_KEY' });
      return;
    }

    // Verify the Clerk session JWT.
    // authorizedParties tells Clerk which frontend origins are allowed to
    // have issued this token — without this, Clerk rejects tokens with
    // "Invalid JWT: azp claim not authorized". This must include whatever
    // origin the browser actually loads the frontend from — for GitHub
    // Codespaces that's the forwarded https://<codespace>-3000.app.github.dev
    // URL, NOT http://localhost:3000. See config.ts for how this list is
    // built (FRONTEND_URL / ORCHESTRA_EXTRA_AUTHORIZED_PARTIES env vars).
    const verified = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
      authorizedParties: config.authorizedParties,
    });

    const userId = verified.sub;
    if (!userId) {
      res.status(401).json({ error: 'Invalid session token: no sub claim' });
      return;
    }

    req.userId = userId;
    await ensureUser(userId);
    next();
  } catch (err: any) {
    // Log the full error so you can see exactly what Clerk rejected
    console.error('[auth] token verification failed:', err?.message || err);
    res.status(401).json({ error: `Invalid or expired session token: ${err?.message || 'unknown error'}` });
  }
}

async function ensureUser(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId]
  );
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}