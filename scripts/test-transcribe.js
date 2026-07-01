require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { transcribeAudioUrl, saveTranscriptToDb } = require('./src/lib/assemblyai-transcriber.ts'); // Wait, require won't work for .ts

// But I can just do a fetch directly:
async function testTranscription() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const audioUrl = 'https://cdn.assemblyai.com/upload/8ce6aabaf115d46f648583ee218ad7f8cbf6c7c6e5697494aa87918ccf8463f9/83859910-187f-420f-9de1-c302261e363a';

  console.log('Submitting to AssemblyAI for 26min transcription (this takes a few mins)...');
  const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: audioUrl, speaker_labels: true, language_detection: true })
  });
  const { id } = await submitRes.json();
  console.log('Job ID:', id);
  
  while (true) {
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { 'Authorization': apiKey }
    });
    const data = await pollRes.json();
    if (data.status === 'completed') {
      console.log('Transcript completed! Length:', data.text?.length);
      break;
    } else if (data.status === 'error') {
      console.error('Failed:', data.error);
      break;
    }
    console.log('Polling... (Status:', data.status, ')');
    await new Promise(r => setTimeout(r, 10000));
  }
}

testTranscription().catch(console.error);
