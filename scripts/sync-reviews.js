const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function sync() {
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const allCalls = await prisma.callRecord.findMany({ where: { tenantid: tenantId } });
  const existingReviews = await prisma.callReview.findMany({ where: { tenantid: tenantId } });
  
  let added = 0;
  for (const c of allCalls) {
    const hasReview = existingReviews.some(r => r.callTitle === c.title);
    if (!hasReview) {
      const reviewId = `rv_${crypto.randomUUID().split('-')[0]}`;
      await prisma.callReview.create({
        data: {
          tenantid: tenantId,
          reviewId,
          callTitle: c.title,
          customer: c.title.split(' - ')[0] || 'Acme Corp',
          dateTime: c.callDate.toISOString(),
          callType: c.callType || 'Demo',
          duration: "26:35",
          priority: 'High',
          status: 'Pending',
          salesRep: c.callOwner || 'Sarah Chen',
          reviewer: 'Alex Morgan',
          overallScore: 0,
          aiSummary: 'AI transcript summary pending.',
          aiFlags: [],
          hasReview: false,
        }
      });
      added++;
    }
  }
  console.log('Synced records:', added);
}

sync().catch(console.error).finally(() => prisma.$disconnect());
