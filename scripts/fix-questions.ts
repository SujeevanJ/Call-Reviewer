import { PrismaClient } from '@prisma/client';
import { generateDynamicQuestions } from './src/lib/ai-question-generator';

const db = new PrismaClient();

async function fixQuestions() {
  const callId = 'feda5366-3a76-466c-a0fc-00b5ec7453a7';
  
  const transcript = await db.transcript.findUnique({
    where: { callId },
    include: { utterances: { orderBy: { sequenceIndex: 'asc' } } }
  });
  
  if (!transcript || transcript.utterances.length === 0) {
    console.log('No transcript found!');
    return;
  }
  
  const fullText = transcript.utterances.map((u: any) => u.speaker + ': ' + u.text).join('\n');
  console.log('Got transcript, length:', fullText.length);
  
  const review = await db.callReview.findFirst({
    where: { callTitle: 'David Park - Long Demo Call Review' }
  });
  
  if (!review) {
    console.log('Review not found!');
    return;
  }
  
  console.log('Generating dynamic questions via LLM...');
  const questions = await generateDynamicQuestions(fullText, 'sc_01', 'Discovery Call Scorecard');
  
  console.log('Generated questions:', questions.length);
  
  await db.callReview.update({
    where: { id: review.id },
    data: { questions: questions as any }
  });
  
  console.log('Successfully updated CallReview with dynamic AI scorecard questions!');
}

fixQuestions().catch(console.error);
