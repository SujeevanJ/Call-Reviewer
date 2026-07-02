import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import crypto from 'crypto';
import { transcribeAudioUrl, saveTranscriptToDb } from '../src/lib/assemblyai-transcriber';
import { generateDynamicQuestions } from '../src/lib/ai-question-generator';

const db = new PrismaClient();

async function runDemoUpload() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: npx tsx create-demo-call.ts <audio-file-path> <call-title> <sales-rep-name>');
    console.log('Example: npx tsx create-demo-call.ts ./sample.wav "ACME Corp Discovery" "David Park"');
    process.exit(1);
  }

  const [audioPath, callTitle, salesRepName] = args;
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey || apiKey.startsWith('your_')) {
    console.error('ERROR: Missing or invalid ASSEMBLYAI_API_KEY in .env');
    process.exit(1);
  }

  if (!fs.existsSync(audioPath)) {
    console.error(`ERROR: Audio file not found at ${audioPath}`);
    process.exit(1);
  }

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const callRecordId = crypto.randomUUID();

  console.log(`\n=================================================`);
  console.log(`🎙️  LIVE DEMO SCRIPT: INJECTING CALL`);
  console.log(`=================================================\n`);

  // 1. Upload to AssemblyAI
  console.log('⏳ [1/5] Uploading audio to AssemblyAI CDN...');
  const audioData = fs.readFileSync(audioPath);
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { 'authorization': apiKey },
    body: audioData
  });
  if (!uploadRes.ok) throw new Error('Failed to upload audio');
  const { upload_url } = await uploadRes.json();
  console.log('✅ Upload complete! URL:', upload_url);

  // Map the URL to local path for the audio proxy
  let registry: Record<string, string> = {};
  const registryPath = './audio-registry.json';
  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }
  registry[upload_url] = audioPath;
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  console.log('✅ Audio registry updated for local streaming proxy.');

  // 2. Create CallRecord in DB
  console.log('⏳ [2/5] Creating CallRecord in database...');
  await db.callRecord.create({
    data: {
      id: callRecordId,
      tenantid: tenantId,
      title: callTitle,
      callDate: new Date(),
      durationSeconds: 180, // arbitrary
      callOwner: salesRepName, 
      audioUrl: upload_url,
      callType: 'meeting',
      callSource: 'zoom'
    }
  });
  console.log('✅ CallRecord created!');

  // 3. Transcribe Audio
  console.log('⏳ [3/5] Starting AssemblyAI transcription (this may take a moment)...');
  const transcriptData = await transcribeAudioUrl(upload_url);
  if (!transcriptData) throw new Error('Transcription failed');
  
  // 4. Save Transcript to DB
  console.log('⏳ [4/5] Saving utterances to database...');
  await saveTranscriptToDb(db, callRecordId, tenantId, transcriptData as any);
  console.log('✅ Transcript saved!');

  // Fetch full transcript for LLM
  const savedTranscript = await db.transcript.findUnique({
    where: { callId: callRecordId },
    include: { utterances: { orderBy: { sequenceIndex: 'asc' } } }
  });
  const fullText = savedTranscript?.utterances.map((u: any) => `${u.speaker}: ${u.text}`).join('\n') || '';

  // 5. Generate AI Scorecard Questions
  console.log('⏳ [5/5] Generating contextual scorecard questions via LLM...');
  const questions = await generateDynamicQuestions(fullText, 'sc_01', 'Discovery Call Scorecard');
  
  // Create the CallReview record (Pending status for rep isolation)
  await db.callReview.create({
    data: {
      reviewId: crypto.randomUUID(),
      tenantid: tenantId,
      callTitle: callTitle,
      salesRep: salesRepName,
      reviewer: 'Manager',
      status: 'Pending',
      overallScore: 0,
      aiSummary: 'AI generated summary.',
      keyHighlights: [],
      scorecardId: 'sc_01',
      scorecardName: 'Discovery Call Scorecard',
      questions: questions as any,
    }
  });

  console.log('✅ AI Scorecard generated and mapped!');
  
  console.log(`\n🎉 SUCCESS! The call is fully processed and ready for the demo.`);
  console.log(`👉 Go to the Calls List -> Click on "${callTitle}"`);
  console.log(`👉 Go to Manager Reviews -> You'll see the context-aware scorecard ready to evaluate!`);
}

runDemoUpload().catch(console.error).finally(() => db.$disconnect());
