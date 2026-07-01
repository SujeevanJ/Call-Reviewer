import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';

export async function POST(req: Request) {
  try {
    const { tenantName, tenantSlug, name, email, password, role } = await req.json();

    const slug = String(tenantSlug || 'relanto').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const dbRole = role === 'sales_manager' ? 'SALES_MANAGER' : 'SALES_REP';

    // 1. Get or Create Tenant
    const tenant = await db.tenant.upsert({
      where: { slug },
      update: {},
      create: {
        name: tenantName || 'Relanto',
        slug,
        status: 'ACTIVE'
      }
    });

    // 2. Check if user exists
    const existingUser = await db.user.findFirst({
      where: {
        tenantid: tenant.id,
        email: cleanEmail
      }
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'User already exists in this tenant' } },
        { status: 409 }
      );
    }

    // 3. Hash Password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Create User
    const user = await db.user.create({
      data: {
        tenantid: tenant.id,
        email: cleanEmail,
        name: name.trim(),
        passwordHash,
        role: dbRole as any,
        status: 'ACTIVE'
      }
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
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message || 'Server error' } },
      { status: 500 }
    );
  }
}
