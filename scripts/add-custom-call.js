require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function uploadNewCall() {
  // CONFIGURATION
  // 1. Put your audio file URL or local path here (e.g., '/my-audio.mp3' if you placed it in the public folder)
  const audioUrl = '/my-audio.mp3'; 
  const callTitle = 'My Custom Test Call';
  const salesRepName = 'Alex Morgan'; // Ensure this matches a rep in your system

  const tenantId = '00000000-0000-0000-0000-000000000000'; // Default demo tenant
  const callRecordId = crypto.randomUUID();

  console.log(`Creating new CallRecord for: ${callTitle}...`);
  
  await prisma.callRecord.create({
    data: {
      id: callRecordId,
      tenantid: tenantId,
      title: callTitle,
      callDate: new Date(),
      durationSeconds: 180, // Default 3 mins
      callOwner: salesRepName, 
      audioUrl: audioUrl,
      // We explicitly DO NOT create a transcript here!
      // This will force the backend API to use AssemblyAI to automatically transcribe the audioUrl when you click on the call.
    }
  });

  console.log('Success! The new call is added to the database.');
  console.log('---');
  console.log('Next Steps:');
  console.log('1. Go to the Calls List in the UI.');
  console.log('2. Click on the new call ("My Custom Test Call").');
  console.log('3. The UI will automatically trigger AssemblyAI to transcribe the audio and generate insights!');
}

uploadNewCall().catch(console.error).finally(() => prisma.$disconnect());
