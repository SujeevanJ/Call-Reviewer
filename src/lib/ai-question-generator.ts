import { db } from './db';

interface ScorecardQuestion {
  id: string;
  category: string;
  question: string;
  type: 'yes_no' | 'scale_1_5';
  score?: number | null;
  comment?: string | null;
  transcriptReference?: string | null;
  snippet?: string | null;
}

const DEFAULT_DISCOVERY_QUESTIONS: Omit<ScorecardQuestion, 'score' | 'comment'>[] = [
  // Opening (3)
  { id: 'q_disc_1', category: 'Opening', question: 'Did the rep establish a clear agenda and state the purpose of the call?', type: 'yes_no', transcriptReference: 'Opening minutes', snippet: 'Agenda discussion' },
  { id: 'q_disc_2', category: 'Opening', question: 'Did the rep confirm the timeframe and verify who else was attending the meeting?', type: 'yes_no', transcriptReference: 'Opening minutes', snippet: 'Time check' },
  { id: 'q_disc_3', category: 'Opening', question: 'Did the rep build rapport and verify the current stage of the prospect\'s project?', type: 'yes_no', transcriptReference: 'Opening minutes', snippet: 'Rapport build' },
  // Discovery (3)
  { id: 'q_disc_4', category: 'Discovery', question: 'Did the rep identify the prospect\'s primary pain points and business challenges?', type: 'scale_1_5', transcriptReference: 'Middle of conversation', snippet: 'Pain points exploration' },
  { id: 'q_disc_5', category: 'Discovery', question: 'Did the rep ask about the budget size, approval workflow, or cost expectations?', type: 'scale_1_5', transcriptReference: 'Budget discussion', snippet: 'Budget search' },
  { id: 'q_disc_6', category: 'Discovery', question: 'Did the rep explore the prospect\'s current vendor or alternative solution?', type: 'scale_1_5', transcriptReference: 'Vendor discussion', snippet: 'Competitor check' },
  // Product Fit (3)
  { id: 'q_disc_7', category: 'Product Fit', question: 'Did the rep successfully align our product capabilities to the client\'s needs?', type: 'scale_1_5', transcriptReference: 'Product mapping', snippet: 'Solution pitching' },
  { id: 'q_disc_8', category: 'Product Fit', question: 'Did the rep highlight the unique selling points and advantages of our solution?', type: 'scale_1_5', transcriptReference: 'USP presentation', snippet: 'Value highlight' },
  { id: 'q_disc_9', category: 'Product Fit', question: 'Did the rep confirm if the prospect understands the value proposition?', type: 'yes_no', transcriptReference: 'Value alignment', snippet: 'Value check' },
  // Objection Handling (3)
  { id: 'q_disc_10', category: 'Objection Handling', question: 'Did the rep handle client concerns about timing, price, or complexity professionally?', type: 'yes_no', transcriptReference: 'Objection phase', snippet: 'Handling timeline questions' },
  { id: 'q_disc_11', category: 'Objection Handling', question: 'Did the rep clarify next steps and gain agreement to schedule a follow-up demo?', type: 'yes_no', transcriptReference: 'Closing phase', snippet: 'Next steps schedule' },
  { id: 'q_disc_12', category: 'Objection Handling', question: 'Did the rep address competitor mentions or technical fit anxieties effectively?', type: 'scale_1_5', transcriptReference: 'Objection phase', snippet: 'Competitor response' }
];

const DEFAULT_DEMO_QUESTIONS: Omit<ScorecardQuestion, 'score' | 'comment'>[] = [
  // Opening (3)
  { id: 'q_demo_1', category: 'Opening', question: 'Did the rep verify the attendees and re-confirm the demo agenda?', type: 'yes_no', transcriptReference: 'First 2 minutes', snippet: 'Agenda check' },
  { id: 'q_demo_2', category: 'Opening', question: 'Did the rep recap previous requirements before starting the screen share?', type: 'yes_no', transcriptReference: 'First 2 minutes', snippet: 'Requirements recap' },
  { id: 'q_demo_3', category: 'Opening', question: 'Did the rep establish expectations for interactive questions during the demo?', type: 'yes_no', transcriptReference: 'First 2 minutes', snippet: 'Interactive demo check' },
  // Discovery (3)
  { id: 'q_demo_4', category: 'Discovery', question: 'Did the rep connect the demo flows directly to previously discussed requirements?', type: 'scale_1_5', transcriptReference: 'Feature walk-through', snippet: 'Connecting value' },
  { id: 'q_demo_5', category: 'Discovery', question: 'Did the rep check if additional stakeholders need to see specific features?', type: 'yes_no', transcriptReference: 'Stakeholder check', snippet: 'Stakeholder discovery' },
  { id: 'q_demo_6', category: 'Discovery', question: 'Did the rep uncover any new business requirements or custom integration needs?', type: 'scale_1_5', transcriptReference: 'Integration discussion', snippet: 'Integration requirements' },
  // Product Fit (3)
  { id: 'q_demo_7', category: 'Product Fit', question: 'Was the demonstration clear, structured, and focused on value over features?', type: 'scale_1_5', transcriptReference: 'Demo presentation', snippet: 'Value demonstration' },
  { id: 'q_demo_8', category: 'Product Fit', question: 'Did the rep show relevant customer success stories or case studies?', type: 'scale_1_5', transcriptReference: 'Success stories', snippet: 'Case studies shared' },
  { id: 'q_demo_9', category: 'Product Fit', question: 'Did the rep explain the onboarding process and timeline clearly?', type: 'yes_no', transcriptReference: 'Onboarding presentation', snippet: 'Onboarding timeline' },
  // Objection Handling (3)
  { id: 'q_demo_10', category: 'Objection Handling', question: 'How effectively did the rep handle usability or technical questions?', type: 'scale_1_5', transcriptReference: 'Q&A section', snippet: 'Technical response' },
  { id: 'q_demo_11', category: 'Objection Handling', question: 'Did the rep address security, compliance, or data hosting concerns?', type: 'yes_no', transcriptReference: 'Security Q&A', snippet: 'Security review' },
  { id: 'q_demo_12', category: 'Objection Handling', question: 'Did the rep secure a commitment for a deeper technical review or trial?', type: 'yes_no', transcriptReference: 'Demo wrap-up', snippet: 'Trial commitment' }
];

const DEFAULT_NEGOTIATION_QUESTIONS: Omit<ScorecardQuestion, 'score' | 'comment'>[] = [
  // Opening (3)
  { id: 'q_neg_1', category: 'Opening', question: 'Did the rep open the negotiation by summarizing the agreed-upon value first?', type: 'yes_no', transcriptReference: 'Opening talk', snippet: 'Value recap' },
  { id: 'q_neg_2', category: 'Opening', question: 'Did the rep verify all key decision makers are present for pricing discussions?', type: 'yes_no', transcriptReference: 'Opening talk', snippet: 'Attendees check' },
  { id: 'q_neg_3', category: 'Opening', question: 'Did the rep confirm the evaluation criteria has been fully satisfied?', type: 'yes_no', transcriptReference: 'Opening talk', snippet: 'Evaluation check' },
  // Discovery (3)
  { id: 'q_neg_4', category: 'Discovery', question: 'Did the rep uncover budget constraints or competitor pressure during the talk?', type: 'scale_1_5', transcriptReference: 'Pricing discussion', snippet: 'Competitor check' },
  { id: 'q_neg_5', category: 'Discovery', question: 'Did the rep clarify the legal/contract signoff workflow and timeline?', type: 'yes_no', transcriptReference: 'Legal talk', snippet: 'Contract approval path' },
  { id: 'q_neg_6', category: 'Discovery', question: 'Did the rep identify the critical dates or consequences of delaying?', type: 'scale_1_5', transcriptReference: 'Timeline talk', snippet: 'Timeline urgency' },
  // Product Fit (3)
  { id: 'q_neg_7', category: 'Product Fit', question: 'Did the rep maintain pricing integrity before offering discounts?', type: 'scale_1_5', transcriptReference: 'Discount talks', snippet: 'Handling discount requests' },
  { id: 'q_neg_8', category: 'Product Fit', question: 'Did the rep package discounts with reciprocal commitments (e.g. multi-year)?', type: 'scale_1_5', transcriptReference: 'Reciprocal negotiation', snippet: 'Reciprocal trade-offs' },
  { id: 'q_neg_9', category: 'Product Fit', question: 'Did the rep reiterate the business case and ROI to justify the investment?', type: 'scale_1_5', transcriptReference: 'ROI justification', snippet: 'ROI review' },
  // Objection Handling (3)
  { id: 'q_neg_10', category: 'Objection Handling', question: 'Did the rep secure a clear commitment to next steps or contract signing?', type: 'yes_no', transcriptReference: 'Closing segment', snippet: 'Timeline commitment' },
  { id: 'q_neg_11', category: 'Objection Handling', question: 'How well did the rep navigate discount requests or contract term objections?', type: 'scale_1_5', transcriptReference: 'Objection segment', snippet: 'Friction handling' },
  { id: 'q_neg_12', category: 'Objection Handling', question: 'Did the rep outline the implementation roadmap to build post-sale confidence?', type: 'yes_no', transcriptReference: 'Wrap-up', snippet: 'Implementation roadmap' }
];

const DEFAULT_CLOSING_QUESTIONS: Omit<ScorecardQuestion, 'score' | 'comment'>[] = [
  // Opening (3)
  { id: 'q_cls_1', category: 'Opening', question: 'Did the rep summarize all previously agreed points before initiating the close?', type: 'yes_no', transcriptReference: 'Pre-close recap', snippet: 'Value summary recap' },
  { id: 'q_cls_2', category: 'Opening', question: 'Did the rep confirm that all technical objections have been resolved?', type: 'yes_no', transcriptReference: 'Technical check', snippet: 'Technical alignment' },
  { id: 'q_cls_3', category: 'Opening', question: 'Did the rep align the call\'s target output to signing or final approval?', type: 'yes_no', transcriptReference: 'Pre-close recap', snippet: 'Target outcome' },
  // Discovery (3)
  { id: 'q_cls_4', category: 'Discovery', question: 'Did the rep confirm there were no remaining unresolved blockers to signing?', type: 'yes_no', transcriptReference: 'Blocker check', snippet: 'Confirming readiness' },
  { id: 'q_cls_5', category: 'Discovery', question: 'Did the rep identify the exact billing contact and invoice routing details?', type: 'yes_no', transcriptReference: 'Billing discuss', snippet: 'Billing info' },
  { id: 'q_cls_6', category: 'Discovery', question: 'Did the rep verify the timeline for implementation team onboarding?', type: 'scale_1_5', transcriptReference: 'Onboarding talk', snippet: 'Onboarding check' },
  // Product Fit (3)
  { id: 'q_cls_7', category: 'Product Fit', question: 'Did the rep reiterate the ROI and business impact clearly during the close?', type: 'scale_1_5', transcriptReference: 'ROI reinforcement', snippet: 'Business value reinforcement' },
  { id: 'q_cls_8', category: 'Product Fit', question: 'Did the rep confirm the customer feels fully prepared to start onboarding?', type: 'yes_no', transcriptReference: 'Preparation check', snippet: 'Onboarding preparation' },
  { id: 'q_cls_9', category: 'Product Fit', question: 'Did the rep reinforce key value drivers that match executive priorities?', type: 'scale_1_5', transcriptReference: 'Value drivers', snippet: 'Executive alignment' },
  // Objection Handling (3)
  { id: 'q_cls_10', category: 'Objection Handling', question: 'How effectively did the rep handle last-minute objections or hesitation?', type: 'scale_1_5', transcriptReference: 'Final objections', snippet: 'Last-minute concern handling' },
  { id: 'q_cls_11', category: 'Objection Handling', question: 'Did the rep secure signed contracts or a firm date for final submission?', type: 'yes_no', transcriptReference: 'Closing agreement', snippet: 'Firm date commitment' },
  { id: 'q_cls_12', category: 'Objection Handling', question: 'Did the rep schedule the kickoff meeting to ensure project momentum?', type: 'yes_no', transcriptReference: 'Kickoff planning', snippet: 'Kickoff schedule' }
];

const DEFAULT_FOLLOWUP_QUESTIONS: Omit<ScorecardQuestion, 'score' | 'comment'>[] = [
  // Opening (3)
  { id: 'q_fu_1', category: 'Opening', question: 'Did the rep reference the previous meeting and confirm the follow-up agenda?', type: 'yes_no', transcriptReference: 'Opening minutes', snippet: 'Context recap' },
  { id: 'q_fu_2', category: 'Opening', question: 'Did the rep check in on outstanding action items from both sides?', type: 'yes_no', transcriptReference: 'Opening minutes', snippet: 'Action items review' },
  { id: 'q_fu_3', category: 'Opening', question: 'Did the rep set a positive and collaborative tone for the discussion?', type: 'yes_no', transcriptReference: 'Opening minutes', snippet: 'Rapport review' },
  // Discovery (3)
  { id: 'q_fu_4', category: 'Discovery', question: 'Did the rep check if the prospect had reviewed any shared materials or proposals?', type: 'yes_no', transcriptReference: 'Proposal review check', snippet: 'Material follow-through' },
  { id: 'q_fu_5', category: 'Discovery', question: 'Did the rep uncover any feedback or concerns from the internal team review?', type: 'scale_1_5', transcriptReference: 'Team feedback', snippet: 'Internal feedback' },
  { id: 'q_fu_6', category: 'Discovery', question: 'Did the rep verify if the procurement or legal process has begun?', type: 'yes_no', transcriptReference: 'Procurement check', snippet: 'Procurement status' },
  // Product Fit (3)
  { id: 'q_fu_7', category: 'Product Fit', question: 'Did the rep reinforce solution value based on feedback from the previous call?', type: 'scale_1_5', transcriptReference: 'Value reinforcement', snippet: 'Addressing previous concerns' },
  { id: 'q_fu_8', category: 'Product Fit', question: 'Did the rep clarify pricing tiers or quote details in response to feedback?', type: 'scale_1_5', transcriptReference: 'Pricing review', snippet: 'Pricing clarification' },
  { id: 'q_fu_9', category: 'Product Fit', question: 'Did the rep address custom integration or deployment support needs?', type: 'scale_1_5', transcriptReference: 'Integration talk', snippet: 'Deployment needs' },
  // Objection Handling (3)
  { id: 'q_fu_10', category: 'Objection Handling', question: 'Did the rep confirm clear next steps and ownership before ending the call?', type: 'yes_no', transcriptReference: 'Next steps alignment', snippet: 'Action items confirmed' },
  { id: 'q_fu_11', category: 'Objection Handling', question: 'How well did the rep handle competitor comparisons or budget friction?', type: 'scale_1_5', transcriptReference: 'Objection Handling', snippet: 'Friction handling' },
  { id: 'q_fu_12', category: 'Objection Handling', question: 'Did the rep secure a date for the next executive presentation or demo?', type: 'yes_no', transcriptReference: 'Wrap-up', snippet: 'Next meeting date' }
];

function isKeyConfigured(key: string | undefined): boolean {
  return !!key && key !== 'your_groq_api_key_here' && key !== 'your_gemini_api_key_here' && key !== 'your_openai_api_key_here' && !key.startsWith('your_');
}

export async function generateDynamicQuestions(
  transcriptText: string,
  scorecardId: string,
  scorecardName: string
): Promise<ScorecardQuestion[]> {
  const gKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (isKeyConfigured(gKey)) {
    try {
      return await generateWithGroq(transcriptText, scorecardName, gKey!);
    } catch (err) {
      console.warn('Groq question generation failed, trying Gemini...', err);
    }
  }

  if (isKeyConfigured(geminiKey)) {
    try {
      return await generateWithGemini(transcriptText, scorecardName, geminiKey!);
    } catch (err) {
      console.warn('Gemini question generation failed, using local rule-based builder...', err);
    }
  }

  // Fallback to local rule-based transcript-aware generation
  return buildLocalRuleQuestions(transcriptText, scorecardId);
}

async function generateWithGroq(text: string, stage: string, key: string): Promise<ScorecardQuestion[]> {
  const truncatedText = text.slice(0, 15000); // Prevent token limit issues
  const prompt = `
    You are an expert sales manager and coach. Review this truncated transcript of a sales call:
    "${truncatedText}"

    Based on the transcript's actual contents, generate a list of exactly 12 specific evaluation questions for a "${stage}" call.
    You MUST generate exactly 3 questions for each of the following 4 sections: "Opening", "Discovery", "Product Fit", and "Objection Handling".
    The questions MUST NOT be generic. Mention specific topics, products, features, or client names discussed in the transcript.
    For each question, supply:
    1. A unique ID (e.g. "q_1", "q_2")
    2. A category matching one of the 4 sections ("Opening", "Discovery", "Product Fit", "Objection Handling")
    3. A clear question text
    4. A type: "yes_no" or "scale_1_5"
    5. A "transcriptReference" showing where the topic was discussed
    6. A "snippet" showing the actual quote or summary from the transcript

    Format your output strictly as a JSON array matching this typescript interface:
    interface ScorecardQuestion {
      id: string;
      category: string;
      question: string;
      type: 'yes_no' | 'scale_1_5';
      transcriptReference: string;
      snippet: string;
    }
    Return ONLY the raw JSON array. No explanations, no markdown codeblocks, just the JSON.
  `;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    })
  });

  if (!res.ok) throw new Error(`Groq API returned ${res.status}`);
  const json = await res.json();
  const rawText = json.choices?.[0]?.message?.content || '';
  return cleanAndParseJson<ScorecardQuestion[]>(rawText);
}

async function generateWithGemini(text: string, stage: string, key: string): Promise<ScorecardQuestion[]> {
  const truncatedText = text.slice(0, 15000);
  const prompt = `
    You are an expert sales coach. Review this truncated transcript:
    "${truncatedText}"

    Based on the transcript's contents, generate exactly 12 evaluation questions for a "${stage}" call.
    You must generate exactly 3 questions for each of the following 4 sections: "Opening", "Discovery", "Product Fit", and "Objection Handling".
    Questions must be specific to what was said (e.g. mention the pricing discussed, features showcased, or objections raised).
    Include fields: id, category, question, type ("yes_no" | "scale_1_5"), transcriptReference, snippet.
    
    Output strictly a JSON array without markdown headers.
  `;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!res.ok) throw new Error(`Gemini API returned ${res.status}`);
  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return cleanAndParseJson<ScorecardQuestion[]>(rawText);
}

function cleanAndParseJson<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }
  return JSON.parse(cleaned) as T;
}

function buildLocalRuleQuestions(text: string, scorecardId: string): ScorecardQuestion[] {
  // Select base questions from scorecard type
  let baseQuestions = DEFAULT_DISCOVERY_QUESTIONS;
  if (scorecardId === 'sc_02') baseQuestions = DEFAULT_DEMO_QUESTIONS;
  if (scorecardId === 'sc_03') baseQuestions = DEFAULT_NEGOTIATION_QUESTIONS;
  if (scorecardId === 'sc_04') baseQuestions = DEFAULT_CLOSING_QUESTIONS;
  if (scorecardId === 'sc_05') baseQuestions = DEFAULT_FOLLOWUP_QUESTIONS;

  const textLower = text.toLowerCase();

  // Per-category keyword maps for transcript-aware snippet extraction
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'Opening':            ['hello', 'good morning', 'good afternoon', 'agenda', 'introduce', 'joining', 'purpose', 'today we', 'start with'],
    'Discovery':          ['pain', 'problem', 'challenge', 'need', 'budget', 'cost', 'price', 'timeline', 'decision', 'authority', 'goal', 'currently using'],
    'Product Fit':        ['feature', 'capability', 'solution', 'integrate', 'api', 'platform', 'demonstrate', 'showcase', 'value', 'benefit', 'roi', 'use case'],
    'Objection Handling': ['concern', 'hesitation', 'worried', 'not sure', 'but', 'however', 'issue', 'objection', 'competitor', 'alternative', 'expensive', 'complex'],
  };

  return baseQuestions.map((q) => {
    const keywords = CATEGORY_KEYWORDS[q.category] || [];
    const snippet = extractKeywordSnippet(text, keywords) || q.snippet || `${q.category} discussed in call.`;

    // Customize question text based on what the transcript actually mentions
    let questionText = q.question;
    if (q.category === 'Discovery') {
      if (textLower.includes('budget') || textLower.includes('cost') || textLower.includes('pricing')) {
        questionText = q.question.replace('pain points and business challenges', 'budget, cost, and pricing expectations');
      } else if (textLower.includes('crm') || textLower.includes('integration') || textLower.includes('api')) {
        questionText = q.question.replace('pain points and business challenges', 'CRM integration needs and technical requirements');
      }
    }
    if (q.category === 'Product Fit') {
      if (textLower.includes('competitor') || textLower.includes('alternative') || textLower.includes('other vendor')) {
        questionText = q.question + ' (competitor alternatives mentioned)';
      }
    }
    if (q.category === 'Objection Handling') {
      if (textLower.includes('timeline') || textLower.includes('contract') || textLower.includes('deadline')) {
        questionText = q.question.replace('timing, price, or complexity', 'timeline commitments and contract deadlines');
      }
    }

    return {
      ...q,
      question: questionText,
      snippet,
      score: null,
      comment: ''
    };
  });
}

function extractKeywordSnippet(text: string, keywords: string[]): string {
  const sentences = text.split(/(?<=[.?!])\s+/);
  for (const sentence of sentences) {
    const sLower = sentence.toLowerCase();
    if (keywords.some(kw => sLower.includes(kw))) {
      return sentence.trim().slice(0, 150) + (sentence.length > 150 ? '...' : '');
    }
  }
  return '';
}
