const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixTenant() {
  const correctTenant = '00000000-0000-0000-0000-000000000001';
  
  await prisma.callRecord.updateMany({
    where: { title: 'David Park - Long Demo Call Review' },
    data: { tenantid: correctTenant }
  });

  await prisma.callReview.updateMany({
    where: { callTitle: 'David Park - Long Demo Call Review' },
    data: { tenantid: correctTenant }
  });

  console.log('Fixed tenant IDs to', correctTenant);
}

fixTenant().catch(console.error).finally(() => prisma.$disconnect());
