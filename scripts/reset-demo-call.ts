import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function resetCall() {
  const args = process.argv.slice(2);
  const callTitle = args.length > 0 ? args[0] : 'New Demo Backup Call';

  console.log(`\n=================================================`);
  console.log(`🔄  LIVE DEMO SCRIPT: RESETTING CALL STATE`);
  console.log(`=================================================\n`);

  console.log(`Looking for CallReview with title: "${callTitle}"`);

  const review = await db.callReview.findFirst({
    where: { callTitle }
  });

  if (!review) {
    console.error(`ERROR: Could not find call with title "${callTitle}"`);
    process.exit(1);
  }

  // Strip answers, scores, and comments from questions
  let questions = review.questions;
  if (typeof questions === 'string') {
    questions = JSON.parse(questions);
  }

  if (Array.isArray(questions)) {
    questions = questions.map((q: any) => ({
      id: q.id,
      type: q.type,
      snippet: q.snippet,
      category: q.category,
      question: q.question,
      transcriptReference: q.transcriptReference
    }));
  }

  // Reset fields
  await db.callReview.update({
    where: { id: review.id },
    data: {
      status: 'Pending',
      overallScore: 0,
      feedback: {},
      questions: questions as any
    }
  });

  console.log(`✅ Successfully reset call status back to "Pending"!`);
  console.log(`✅ Cleared all coaching feedback and scorecard answers!`);
  console.log(`\nYou can now re-run your entire demo flow on this call.\n`);
  process.exit(0);
}

resetCall();
