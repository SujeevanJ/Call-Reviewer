const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function uploadAndCreateCall() {
  const filePath = 'c:\\Users\\Relanto\\126-demo\\long_call_15m_1778057634769.wav';
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    console.error('ASSEMBLYAI_API_KEY is not defined in .env');
    process.exit(1);
  }

  console.log(`1. Uploading ${filePath} to AssemblyAI...`);
  console.log('   (This may take a minute for a 26min file...)');
  
  const audioData = fs.readFileSync(filePath);

  // Upload to AssemblyAI
  const response = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      'authorization': apiKey
    },
    body: audioData
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to upload to AssemblyAI:', errorText);
    process.exit(1);
  }

  const data = await response.json();
  const uploadUrl = data.upload_url;
  console.log('2. Successfully uploaded! AssemblyAI URL:', uploadUrl);

  const callTitle = 'David Park - Long Demo Call Review';
  const salesRepName = 'David Park';
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const callRecordId = crypto.randomUUID();

  console.log('3. Creating CallRecord mapping to David Park...');
  await prisma.callRecord.create({
    data: {
      id: callRecordId,
      tenantid: tenantId,
      title: callTitle,
      callDate: new Date(),
      durationSeconds: 1595, // Approx 26.5 mins
      callOwner: salesRepName, 
      audioUrl: uploadUrl, // The secure AssemblyAI playback URL
    }
  });

  console.log('4. CallRecord Created!');
  console.log('   You can now go to the Calls List, click this call, and it will auto-transcribe!');
}

uploadAndCreateCall().catch(console.error).finally(() => prisma.$disconnect());
