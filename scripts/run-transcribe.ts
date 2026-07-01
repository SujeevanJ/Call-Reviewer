import { PrismaClient } from '@prisma/client';
import { transcribeAudioUrl, saveTranscriptToDb } from './src/lib/assemblyai-transcriber';

const db = new PrismaClient();

async function run() {
  const callId = 'feda5366-3a76-466c-a0fc-00b5ec7453a7';
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const audioUrl = 'https://cdn.assemblyai.com/upload/8ce6aabaf115d46f648583ee218ad7f8cbf6c7c6e5697494aa87918ccf8463f9/83859910-187f-420f-9de1-c302261e363a';

  console.log('Transcribing...');
  const assembled = await transcribeAudioUrl(audioUrl);
  if (assembled) {
    console.log('Saving to DB...');
    await saveTranscriptToDb(db, callId, tenantId, assembled);
    console.log('Done!');
  } else {
    console.log('Transcription failed');
  }
}

run().catch(console.error).finally(() => db.$disconnect());
