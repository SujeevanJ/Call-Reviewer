const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function main() { 
  const count = await prisma.transcript.count({ where: { callId: '11111111-1111-1111-1111-000000000004' }}); 
  console.log('Transcript count for 0004:', count); 
  const allTranscripts = await prisma.transcript.findMany({ select: { callId: true } });
  console.log('All transcript callIds:', allTranscripts.map(t => t.callId));
} 
main().catch(console.error).finally(() => prisma.$disconnect());
