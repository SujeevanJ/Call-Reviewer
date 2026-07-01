import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function resetDemoCall() {
  const args = process.argv.slice(2);
  const callTitle = args.length > 0 ? args.join(' ') : 'New Demo Backup Call';

  console.log(`\n=================================================`);
  console.log(`🔄 DEMO RESET: Restoring call "${callTitle}" to fresh state`);
  console.log(`=================================================\n`);

  const review = await db.callReview.findFirst({
    where: { callTitle }
  });

  if (!review) {
    console.error(`❌ Could not find a CallReview with the title "${callTitle}".`);
    console.log(`Please check the exact title in your dashboard and run: npx tsx reset-demo-call.ts "Exact Title"`);
    process.exit(1);
  }

  // Clear answers from questions array
  let questions = [];
  if (review.questions) {
    questions = typeof review.questions === 'string' ? JSON.parse(review.questions) : review.questions;
    
    // Reset each question's manager answers
    questions = questions.map((q: any) => ({
      ...q,
      score: undefined,
      value: undefined,
      comment: undefined,
      isNa: false,
      na: false
    }));
  }

  // Update the database
  await db.callReview.update({
    where: { id: review.id },
    data: {
      status: 'Pending',
      overallScore: 0,
      feedback: {},
      questions: questions as any
    }
  });

  console.log(`✅ Reset complete!`);
  console.log(`- Status: Pending`);
  console.log(`- Overall Score: 0`);
  console.log(`- Coaching feedback: Cleared`);
  console.log(`- Manager answers: Cleared`);
  console.log(`\nYou can now refresh the Manager Dashboard to perform the evaluation again!`);
}

resetDemoCall().catch(console.error).finally(() => db.$disconnect());
