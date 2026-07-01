const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function createCall() {
  const uploadUrl = 'https://cdn.assemblyai.com/upload/8ce6aabaf115d46f648583ee218ad7f8cbf6c7c6e5697494aa87918ccf8463f9/83859910-187f-420f-9de1-c302261e363a';
  
  const callTitle = 'David Park - Long Demo Call Review';
  const salesRepName = 'David Park';
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const callRecordId = crypto.randomUUID();

  console.log('Creating CallRecord mapping to David Park...');
  await prisma.callRecord.create({
    data: {
      id: callRecordId,
      tenantid: tenantId,
      title: callTitle,
      callType: 'Demo',
      callDate: new Date(),
      durationSeconds: 1595, // Approx 26.5 mins
      callOwner: salesRepName, 
      audioUrl: uploadUrl, // The secure AssemblyAI playback URL
      callSource: 'Zoom',
    }
  });

  console.log('CallRecord Created!');
  console.log('You can now go to the Calls List, click this call, and it will auto-transcribe!');
}

createCall().catch(console.error).finally(() => prisma.$disconnect());
