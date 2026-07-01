import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';

export interface UserContext {
  userId: string;
  tenantId: string;
  role: 'SALES_MANAGER' | 'SALES_REP';
  email: string;
  name: string;
}

export async function getAuthenticatedUser(req: Request): Promise<UserContext | null> {
  try {
    // 1. Get cookies from request
    const cookieHeader = req.headers.get('cookie') || '';
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(c => {
      const parts = c.trim().split('=');
      if (parts[0]) {
        cookies[parts[0]] = decodeURIComponent(parts[1] || '');
      }
    });

    const accessToken = cookies['access_token'];
    const userIdCookie = cookies['user_id'];
    const userRoleCookie = cookies['user_role'];

    // Try decoding JWT first
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as any;
        return {
          userId: decoded.sub,
          tenantId: decoded.tenantId,
          role: decoded.role,
          email: decoded.email,
          name: decoded.name
        };
      } catch (jwtErr) {
        console.warn('JWT verify failed, falling back to cookie lookup:', jwtErr);
      }
    }

    // Fallback: lookup by user_id cookie (highly robust for local dev / restarts)
    if (userIdCookie) {
      const user = await db.user.findUnique({
        where: { id: userIdCookie },
        include: { tenant: true }
      });

      if (user && user.status === 'ACTIVE') {
        return {
          userId: user.id,
          tenantId: user.tenantid,
          role: user.role as 'SALES_MANAGER' | 'SALES_REP',
          email: user.email,
          name: user.name
        };
      }
    }

    return null;
  } catch (error) {
    console.error('getAuthenticatedUser error:', error);
    return null;
  }
}
