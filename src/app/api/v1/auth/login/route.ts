import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';

export async function POST(req: Request) {
  try {
    const { email, password, tenantSlug } = await req.json();

    const slug = String(tenantSlug || 'relanto').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();

    // 1. Fetch Tenant
    const tenant = await db.tenant.findUnique({
      where: { slug }
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid tenant or credentials' } },
        { status: 401 }
      );
    }

    // 2. Fetch User
    const user = await db.user.findUnique({
      where: {
        tenantid_email: {
          tenantid: tenant.id,
          email: cleanEmail
        }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // 3. Compare password hash
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // 4. Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // 5. Sign Token
    const frontendRole = user.role === 'SALES_REP' ? 'sales_rep' : 'sales_manager';
    const token = jwt.sign(
      {
        sub: user.id,
        tenantId: user.tenantid,
        role: user.role,
        email: user.email,
        name: user.name
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return NextResponse.json({
      success: true,
      data: {
        accessToken: token,
        refreshToken: token,
        expiresIn: 86400,
        tokenType: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          frontendRole,
          tenantId: user.tenantid,
          tenantSlug: tenant.slug,
          permissions: user.role === 'SALES_REP' ? ['read:calls'] : ['read:calls', 'write:coaching']
        }
      }
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Server error' } },
      { status: 500 }
    );
  }
}
