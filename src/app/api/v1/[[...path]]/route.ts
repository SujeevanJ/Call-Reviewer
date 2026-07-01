import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser, UserContext } from '@/lib/auth';
import { generateDynamicQuestions } from '@/lib/ai-question-generator';
import { pickDemoRecordingUrl } from '@/shared/lib/demo-recordings';
import { transcribeAudioUrl, saveTranscriptToDb } from '@/lib/assemblyai-transcriber';
import crypto from 'crypto';
import fs from 'fs';

// Explicitly export HTTP methods
export async function GET(req: Request, { params }: { params: { path?: string[] } }) {
  return handleRequest('GET', req, params.path || []);
}

export async function POST(req: Request, { params }: { params: { path?: string[] } }) {
  return handleRequest('POST', req, params.path || []);
}

export async function PATCH(req: Request, { params }: { params: { path?: string[] } }) {
  return handleRequest('PATCH', req, params.path || []);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// Map call IDs to review IDs for synchronization
const CALL_TO_REVIEW_MAP: Record<string, string> = {
  '00000000-0000-0000-0001-000000000001': 'rv_001',
  '00000000-0000-0000-0001-000000000002': 'rv_002',
  '11111111-1111-1111-1111-000000000001': 'rv_003',
  '11111111-1111-1111-1111-000000000002': 'rv_004',
  '11111111-1111-1111-1111-000000000003': 'rv_005',
  '11111111-1111-1111-1111-000000000004': 'rv_006',
};

const REVIEW_TO_CALL_MAP = Object.fromEntries(
  Object.entries(CALL_TO_REVIEW_MAP).map(([cId, rvId]) => [rvId, cId])
);

// Unified JSON response wrapper
function successResponse(data: any) {
  return NextResponse.json({
    success: true,
    data: data,
    meta: {}
  });
}

function errorResponse(message: string, code = 'ERROR', status = 400) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status }
  );
}

// Router main entry
async function handleRequest(method: string, req: Request, pathSegments: string[]): Promise<NextResponse> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return errorResponse('Unauthorized session', 'UNAUTHORIZED', 401);
  }

  const path = pathSegments.join('/');
  console.log(`[API ${method}] /api/v1/${path} (User: ${user.name}, Role: ${user.role})`);

  try {
    // -------------------------------------------------------------
    // Route 1: Scorecards List
    // -------------------------------------------------------------
    if (method === 'GET' && path === 'conversation-intelligence/scorecards') {
      return successResponse({
        scorecards: [
          { scorecardId: 'sc_01', scorecardName: 'Discovery Call Scorecard', version: 'v2.3' },
          { scorecardId: 'sc_02', scorecardName: 'Demo Call Scorecard', version: 'v2.3' },
          { scorecardId: 'sc_03', scorecardName: 'Negotiation Scorecard', version: 'v2.3' },
          { scorecardId: 'sc_04', scorecardName: 'Closing Call Scorecard', version: 'v2.3' },
          { scorecardId: 'sc_05', scorecardName: 'Follow-Up Call Scorecard', version: 'v2.3' }
        ]
      });
    }

    // -------------------------------------------------------------
    // Route 2: Users List (for Manager Assignment)
    // -------------------------------------------------------------
    if (method === 'GET' && path === 'conversation-intelligence/users') {
      const dbUsers = await db.user.findMany({
        where: { tenantid: user.tenantId }
      });
      return successResponse({
        users: dbUsers.map(u => ({
          userId: u.id,
          userName: u.name,
          email: u.email,
          role: u.role
        }))
      });
    }

    // -------------------------------------------------------------
    // Route 3: Manager List Reviews / Call Records
    // -------------------------------------------------------------
    if (method === 'GET' && (path === 'conversation-intelligence/call-reviews' || path === 'conversation-intelligence/manager/calls')) {
      const { searchParams } = new URL(req.url);
      const search = searchParams.get('search')?.toLowerCase() || '';
      const status = searchParams.get('status') || '';
      const callType = searchParams.get('type') || searchParams.get('callType') || '';
      const view = searchParams.get('view') || '';

      // Initialize reviews if missing
      await ensureSeededReviews(user.tenantId);

      // Construct filter conditions
      const whereClause: any = {
        tenantid: user.tenantId
      };

      if (user.role === 'SALES_REP') {
        // Enforce strict rep data isolation - filter reviews assigned to this representative
        whereClause.salesRep = {
          mode: 'insensitive',
          equals: user.name
        };
      }

      if (status && status !== 'All' && status !== 'All Statuses') {
        whereClause.status = status;
      }
      if (callType && callType !== 'All' && callType !== 'All Types') {
        whereClause.callType = callType;
      }

      let reviews = await db.callReview.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });

      // Simple memory search fallback
      if (search) {
        reviews = reviews.filter(r => 
          (r.callTitle?.toLowerCase().includes(search)) || 
          (r.customer?.toLowerCase().includes(search)) ||
          (r.salesRep?.toLowerCase().includes(search))
        );
      }

      // Format response list matching expected structure
      // NOTE: CallsTable expects `account` and `callDate` (not `customer`/`dateTime`)
      const mappedReviews = reviews.map(r => {
        const derivedAccount = (r.customer && r.customer !== 'Unknown Account' && !/^[0-9a-f-]{36}$/i.test(r.customer))
          ? r.customer
          : (extractAccountFromTitle(r.callTitle) || 'Acme Corp');

        const safeCallDate = (() => {
          const raw = r.dateTime || r.createdAt;
          if (!raw) return new Date().toISOString();
          const d = new Date(raw);
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        })();

        return {
          id: r.id,
          reviewId: r.reviewId,
          callTitle: r.callTitle,
          // UI-expected keys:
          account: derivedAccount,
          callDate: safeCallDate,
          scorecardName: r.scorecardName,
          // legacy keys kept for compatibility:
          customer: r.customer,
          dateTime: safeCallDate,
          duration: r.duration,
          callType: r.callType,
          dealLinked: r.dealLinked,
          status: r.status,
          reviewer: r.reviewer,
          salesRep: r.salesRep,
          priority: r.priority,
          overallScore: r.overallScore,
          aiFlags: r.aiFlags || [],
          dueDate: r.dueDate,
          hasReview: r.hasReview
        };
      });

      return successResponse({
        data: mappedReviews,
        totalCount: mappedReviews.length,
        pagination: {
          page: 1,
          size: 50,
          total: mappedReviews.length,
          totalPages: 1
        }
      });
    }

    // -------------------------------------------------------------
    // Route 4: Rep List Calls (M01 endpoint)
    // -------------------------------------------------------------
    if (method === 'GET' && path === 'capture-transcription/calls') {
      const { searchParams } = new URL(req.url);
      const search = searchParams.get('search')?.toLowerCase() || '';
      const type = searchParams.get('type') || '';

      await ensureSeededReviews(user.tenantId);

      const whereClause: any = { tenantid: user.tenantId };
      if (user.role === 'SALES_REP') {
        whereClause.salesRep = { mode: 'insensitive', equals: user.name };
      }
      if (type && type !== 'All' && type !== 'All Types') {
        whereClause.callType = type;
      }

      let reviews = await db.callReview.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });

      if (search) {
        reviews = reviews.filter(r => 
          r.callTitle?.toLowerCase().includes(search) || 
          r.customer?.toLowerCase().includes(search)
        );
      }

      const allCallRecords = await db.callRecord.findMany({ where: { tenantid: user.tenantId } });

      // Convert reviews to AI call list schema (matching AiCallReviewerCall interface)
      const calls = reviews.map(r => {
        let callId = REVIEW_TO_CALL_MAP[r.reviewId];
        if (!callId) {
          const matched = allCallRecords.find(c => c.title === r.callTitle);
          if (matched) callId = matched.id;
        }
        callId = callId || r.id;
        
        return {
          id: callId,
          reviewId: r.reviewId,
          callName: r.callTitle,
          account: (r.customer && r.customer !== 'Unknown Account' && !/^[0-9a-f-]{36}$/i.test(r.customer))
            ? r.customer
            : (extractAccountFromTitle(r.callTitle) || 'Acme Corp'),
          dateTime: r.dateTime,
          duration: r.duration || '0:00',
          type: r.callType || 'Discovery',
          stage: r.scorecardName || 'Discovery',
          score: r.overallScore || 0,
          status: r.status,
          tags: r.aiFlags || [],
          talkRatio: r.talkRatio || { rep: 50, customer: 50 }
        };
      });

      return successResponse({
        calls,
        pagination: {
          page: 1,
          size: 50,
          total: calls.length,
          totalPages: 1
        }
      });
    }

    // -------------------------------------------------------------
    // Route 4b: Proxy Audio Endpoint
    // -------------------------------------------------------------
    if (method === 'GET' && path === 'conversation-intelligence/calls/audio') {
      const { searchParams } = new URL(req.url);
      const src = searchParams.get('src');
      if (!src) return errorResponse('Missing src', 'BAD_REQUEST', 400);

      // Map the internal AssemblyAI upload URL to the local file on disk using the registry
      let registry: Record<string, string> = {};
      const registryPath = './audio-registry.json';
      if (fs.existsSync(registryPath)) {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      }

      // Special fallback for the first custom call to avoid breaking existing mappings
      if (src.includes('83859910-187f-420f-9de1-c302261e363a')) {
        registry[src] = 'c:\\Users\\Relanto\\126-demo\\long_call_15m_1778057634769.wav';
      }

      let localPath = registry[src];
      
      // Docker/Linux compatibility: If the Windows absolute path doesn't exist, try just the filename in the root directory or audio directory
      if (localPath && !fs.existsSync(localPath)) {
        const filename = localPath.split('\\').pop()?.split('/').pop();
        if (filename) {
          if (fs.existsSync(`./audio/${filename}`)) {
            localPath = `./audio/${filename}`;
          } else if (fs.existsSync(`./${filename}`)) {
            localPath = `./${filename}`;
          }
        }
      }

      if (localPath && fs.existsSync(localPath)) {
        const buffer = fs.readFileSync(localPath);
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }

      try {
        const audioRes = await fetch(src);
        if (!audioRes.ok) return errorResponse('Failed to fetch audio', 'BAD_GATEWAY', 502);
        
        const arrayBuffer = await audioRes.arrayBuffer();
        return new NextResponse(arrayBuffer, {
          status: 200,
          headers: {
            'Content-Type': audioRes.headers.get('content-type') || 'audio/mpeg',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      } catch (err) {
        return errorResponse('Proxy error', 'INTERNAL_SERVER_ERROR', 500);
      }
    }

    // -------------------------------------------------------------
    // Route 5: Single Call Detail (M01 endpoint)
    // -------------------------------------------------------------
    if (method === 'GET' && path.startsWith('capture-transcription/calls/')) {
      const parts = pathSegments;
      const callId = parts[2];

      let actualCallId = callId;
      let matchedReview = null;
      let matchedCallRecord = null;

      const isCallIdUuid = /^[0-9a-fA-F-]{36}$/.test(callId);

      // 1. Try to find the CallReview directly (if callId is a Review ID)
      matchedReview = await db.callReview.findFirst({
        where: isCallIdUuid ? { OR: [{ reviewId: callId }, { id: callId }] } : { reviewId: callId }
      });

      if (matchedReview) {
        // If we found a review, try to find its corresponding CallRecord
        actualCallId = REVIEW_TO_CALL_MAP[matchedReview.reviewId];
        if (!actualCallId) {
          matchedCallRecord = await db.callRecord.findFirst({
            where: { title: matchedReview.callTitle, tenantid: user.tenantId }
          });
          if (matchedCallRecord) actualCallId = matchedCallRecord.id;
          else actualCallId = callId;
        }
      } else if (isCallIdUuid) {
        // 2. If no review found, maybe callId IS the CallRecord ID
        matchedCallRecord = await db.callRecord.findUnique({
          where: { id: callId }
        });
        if (matchedCallRecord) {
          actualCallId = matchedCallRecord.id;
          matchedReview = await db.callReview.findFirst({
            where: { callTitle: matchedCallRecord.title, tenantid: user.tenantId }
          });
        }
      }

      // If getting sub-paths of single call
      if (parts[3] === 'transcript-entries') {
        return getCallTranscript(actualCallId, user.tenantId);
      }
      if (parts[3] === 'ai-insights') {
        return getCallAiInsights(actualCallId);
      }
      if (parts[3] === 'audio-url') {
        const matchingCall = await db.callRecord.findUnique({ where: { id: actualCallId } });
        const rawAudioUrl = (matchingCall as any)?.audioUrl;
        const finalUrl = rawAudioUrl && rawAudioUrl.length > 5 ? rawAudioUrl : pickDemoRecordingUrl(actualCallId);
        return successResponse({
          audioUrl: finalUrl,
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        });
      }
      if (parts[3] === 'review') {
        const review = matchedReview;
        if (!review || review.status === 'Pending' || review.status === 'In Progress') {
          return successResponse({ notReviewed: true });
        }
        
        let reviewerName = review.reviewer || 'Manager';
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (review.reviewer) {
          const orClauses: any[] = [{ name: review.reviewer }, { email: review.reviewer }];
          if (UUID_RE.test(review.reviewer)) orClauses.push({ id: review.reviewer });
          const reviewerUser = await db.user.findFirst({ where: { OR: orClauses } });
          if (reviewerUser?.name) reviewerName = reviewerUser.name;
        }

        const sections = buildSectionsFromAnswers(review.questions);
        const statusLabel =
          review.status === 'Completed' || review.status === 'Acknowledged'
            ? 'Reviewed'
            : review.status === 'In Progress' || review.status === 'Feedback Pending'
              ? 'In Review'
              : 'Pending Review';

        return successResponse({
          notReviewed: false,
          scorecardName: review.scorecardName || 'Discovery Call Scorecard',
          scorecardVersion: review.scorecardVersion || 'v2.3',
          reviewedBy: { name: reviewerName, role: 'Sales Manager' },
          reviewDate: new Date(review.updatedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          overallScore: review.overallScore || 0,
          status: statusLabel,
          sections,
        });
      }
      if (parts[3] === 'feedback') {
        const review = matchedReview;
        if (!review) {
          return successResponse(null);
        }
        const fb = review.feedback ? (typeof review.feedback === 'string' ? JSON.parse(review.feedback) : review.feedback) : {};
        const hasFeedback =
          (fb.strengths?.length > 0) ||
          (fb.improvements?.length > 0) ||
          fb.coachingNotes ||
          (fb.recommendedActions?.length > 0) ||
          (fb.tags?.length > 0);

        return successResponse({
          notReviewed: !hasFeedback,
          tags: fb.tags || [],
          strengths: fb.strengths || [],
          improvementAreas: fb.improvements || [],
          coachingNotes: fb.coachingNotes || '',
          recommendedActions: fb.recommendedActions || [],
          actionItems: (fb.actionItems || []).map((ai: any, idx: number) => ({
            id: ai.id || `ai-${idx + 1}`,
            title: ai.title || 'Action Item',
            description: ai.description || '',
            dueDate: ai.dueDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
            assignedBy: ai.assignedBy || review.reviewer || 'Manager',
            status: ai.status || 'pending',
            notes: ai.notes || '',
          })),
          acknowledged: fb.acknowledged || false,
          acknowledgement: {
            isAcknowledged: fb.acknowledged || false,
            acknowledgedAt: fb.acknowledgedAt || null,
            repResponse: fb.repResponse || null,
          },
        });
      }
      if (parts[3] === 'feedback' && parts[4] === 'acknowledge') {
        // Handled in Route 6 below
      }

      // Fetch single call record details
      const callRecord = await db.callRecord.findUnique({
        where: { id: actualCallId }
      });

      if (!callRecord) {
        return errorResponse('Call record not found', 'NOT_FOUND', 404);
      }

      const review = matchedReview;
      const finalReviewId = review ? review.reviewId : callId;

      return successResponse({
        id: callRecord.id,
        reviewId: finalReviewId,
        title: callRecord.title,
        accountId: callRecord.accountId || 'Acme Corp',
        callDate: callRecord.callDate,
        durationSeconds: callRecord.durationSeconds,
        callType: callRecord.callType,
        callOwner: callRecord.callOwner,
        status: review?.status || 'Pending',
        score: review?.overallScore || 0
      });
    }

    // -------------------------------------------------------------
    // Route 6: Acknowledge Representative Feedback (M01 POST endpoint)
    // -------------------------------------------------------------
    if (method === 'POST' && path.startsWith('capture-transcription/calls/') && path.endsWith('/feedback/acknowledge')) {
      const callId = pathSegments[2];
      const body = await req.json().catch(() => ({}));
      const reviewId = CALL_TO_REVIEW_MAP[callId];
      const isCallIdUuid = /^[0-9a-fA-F-]{36}$/.test(callId);

      let review = await db.callReview.findFirst({
        where: isCallIdUuid ? { OR: [{ reviewId: reviewId || callId }, { id: callId }] } : { reviewId: reviewId || callId }
      });

      if (!review && isCallIdUuid) {
        const matchingCall = await db.callRecord.findUnique({ where: { id: callId } });
        if (matchingCall) {
          review = await db.callReview.findFirst({
            where: { callTitle: matchingCall.title, tenantid: matchingCall.tenantid }
          });
        }
      }

      if (!review) {
        return errorResponse('Review record not found to acknowledge', 'NOT_FOUND', 404);
      }

      // Update feedback json object with acknowledgement field
      const currentFeedback = review.feedback ? (typeof review.feedback === 'string' ? JSON.parse(review.feedback) : review.feedback) : {};
      const acknowledgedAt = new Date().toISOString();
      
      const updatedFeedback = {
        ...currentFeedback,
        acknowledged: true,
        acknowledgedAt,
        repResponse: body.repResponse || null,
        acknowledgement: {
          isAcknowledged: true,
          acknowledgedAt,
          repResponse: body.repResponse || null
        }
      };

      await db.callReview.update({
        where: { id: review.id },
        data: {
          status: 'Acknowledged',
          feedback: updatedFeedback
        }
      });

      return successResponse({
        success: true,
        acknowledgedAt
      });
    }

    // -------------------------------------------------------------
    // Route 6.5: Update Action Item (M01 PATCH endpoint)
    // -------------------------------------------------------------
    if (method === 'PATCH' && path.startsWith('capture-transcription/calls/') && pathSegments[3] === 'action-items') {
      const callId = pathSegments[2];
      const actionItemId = pathSegments[4];
      const body = await req.json().catch(() => ({}));
      const reviewId = CALL_TO_REVIEW_MAP[callId] || callId;
      const isCallIdUuid = /^[0-9a-fA-F-]{36}$/.test(callId);

      const review = await db.callReview.findFirst({
        where: isCallIdUuid ? { OR: [{ reviewId }, { id: callId }] } : { reviewId }
      });

      if (!review) {
        return errorResponse('Review record not found to update action item', 'NOT_FOUND', 404);
      }

      const currentFeedback = review.feedback ? (typeof review.feedback === 'string' ? JSON.parse(review.feedback) : review.feedback) : {};
      
      const actionItems = Array.isArray(currentFeedback.actionItems) ? [...currentFeedback.actionItems] : [];
      const idx = actionItems.findIndex((ai: any) => ai.id === actionItemId || ai.actionItemId === actionItemId);
      if (idx > -1) {
        actionItems[idx] = {
          ...actionItems[idx],
          status: body.status ?? actionItems[idx].status,
          notes: body.notes ?? actionItems[idx].notes
        };
      }

      const updatedFeedback = {
        ...currentFeedback,
        actionItems
      };

      await db.callReview.update({
        where: { id: review.id },
        data: {
          feedback: updatedFeedback
        }
      });

      return successResponse({
        success: true,
        updatedAt: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------
    // Route 7: Fetch Coaching Analytics (coaching/insights)
    // -------------------------------------------------------------
    if (method === 'GET' && path === 'capture-transcription/coaching/insights') {
      const reviews = await db.callReview.findMany({
        where: { tenantid: user.tenantId, status: { in: ['Completed', 'Feedback Pending', 'Acknowledged'] } }
      });

      const totalReviewed = reviews.length;
      const avgScore = totalReviewed > 0 ? Math.round(reviews.reduce((sum, r) => sum + (r.overallScore || 0), 0) / totalReviewed) : 0;
      
      return successResponse({
        overallCompliance: avgScore,
        totalEvaluations: totalReviewed,
        pendingFeedback: reviews.filter(r => r.status === 'Feedback Pending').length,
        focusAreas: [
          { name: 'Objection Handling', score: Math.round(avgScore * 0.9) },
          { name: 'Product Knowledge', score: Math.round(avgScore * 0.95) },
          { name: 'Closing', score: Math.round(avgScore * 0.85) }
        ]
      });
    }

    // -------------------------------------------------------------
    // Route 8: Single Call Review Detail (M02)
    // -------------------------------------------------------------
    if (path.startsWith('conversation-intelligence/call-reviews/')) {
      const parts = pathSegments;
      const reviewId = parts[2];
      const isReviewIdUuid = /^[0-9a-fA-F-]{36}$/.test(reviewId);

      // Get review detail
      const review = await db.callReview.findFirst({
        where: isReviewIdUuid ? { OR: [{ reviewId }, { id: reviewId }] } : { reviewId }
      });

      if (!review) {
        return errorResponse('Review record not found', 'NOT_FOUND', 404);
      }

      // SUB-ROUTE: scorecard evaluation form
      if (parts[3] === 'scorecard') {
        // Always load transcript first so AI suggestions are transcript-aware
        let callId = REVIEW_TO_CALL_MAP[review.reviewId];
        if (!callId) {
          const matchingCall = await db.callRecord.findFirst({
            where: { title: review.callTitle, tenantid: user.tenantId }
          });
          callId = matchingCall?.id || review.id;
        }

        const transcript = await db.transcript.findUnique({
          where: { callId },
          include: { utterances: { orderBy: { sequenceIndex: 'asc' }, take: 200 } }
        });

        const transcriptText = transcript?.fullText
          || (transcript?.utterances?.map((u: any) => `${u.speaker}: ${u.text}`).join('\n') || '')
          || 'No transcript available.';

        let questions = review.questions
          ? (typeof review.questions === 'string' ? JSON.parse(review.questions) : review.questions)
          : [];

        // Check if scorecard has changed via query param
        const sp = new URL(req.url).searchParams;
        const requestedScorecardId = sp.get('scorecardId') || review.scorecardId || 'sc_01';
        const currentScorecardId = review.scorecardId || 'sc_01';
        const scorecardChanged = requestedScorecardId !== currentScorecardId;

        // Regenerate if: no questions exist OR scorecard changed OR fewer than expected 10
        const needsRegeneration = !questions || questions.length === 0 || scorecardChanged || questions.length < 10;
        if (needsRegeneration) {
          const scorecardNames: Record<string, string> = {
            sc_01: 'Discovery Call Scorecard',
            sc_02: 'Demo Call Scorecard',
            sc_03: 'Negotiation Scorecard',
            sc_04: 'Closing Call Scorecard',
            sc_05: 'Follow-Up Call Scorecard'
          };
          const targetScorecardName = scorecardNames[requestedScorecardId] || 'Discovery Call Scorecard';

          questions = await generateDynamicQuestions(
            transcriptText,
            requestedScorecardId,
            targetScorecardName
          );

          await db.callReview.update({
            where: { id: review.id },
            data: {
              questions,
              scorecardId: requestedScorecardId,
              scorecardName: targetScorecardName
            }
          });
        }

        return successResponse({
          reviewId: review.reviewId,
          scorecardId: review.scorecardId,
          scorecardName: review.scorecardName,
          transcriptAvailable: transcriptText !== 'No transcript available.',
          questions
        });
      }

      // SUB-ROUTE: transcript view
      if (parts[3] === 'transcript') {
        // Try mapped call ID, then fall back to looking up by reviewId in CallRecord
        let callId = REVIEW_TO_CALL_MAP[review.reviewId];
        if (!callId) {
          // Find the CallRecord that has a matching title
          const matchingCall = await db.callRecord.findFirst({
            where: { title: review.callTitle, tenantid: user.tenantId }
          });
          callId = matchingCall?.id || review.id;
        }
        return getCallTranscript(callId, user.tenantId);
      }

      // SUB-ROUTE: ai insights
      if (parts[3] === 'ai-insights') {
        let callId = REVIEW_TO_CALL_MAP[review.reviewId];
        if (!callId) {
          const matchingCall = await db.callRecord.findFirst({
            where: { title: review.callTitle, tenantid: user.tenantId }
          });
          callId = matchingCall?.id || review.id;
        }
        return getCallAiInsights(callId);
      }

      // SUB-ROUTE: coaching notes
      if (parts[3] === 'coaching') {
        if (method === 'POST') {
          const coachingBody = await req.json();
          const currentFeedback = review.feedback ? (typeof review.feedback === 'string' ? JSON.parse(review.feedback) : review.feedback) : {};
          
          const updatedFeedback = {
            ...currentFeedback,
            ...coachingBody,
            shareWithRep: coachingBody.shareWithRep ?? true
          };

          // Mark status as 'Feedback Pending' to enable Rep dashboard access
          await db.callReview.update({
            where: { id: review.id },
            data: {
              status: 'Feedback Pending',
              feedback: updatedFeedback
            }
          });

          return successResponse({ success: true });
        }

        const feedback = review.feedback ? (typeof review.feedback === 'string' ? JSON.parse(review.feedback) : review.feedback) : {};
        return successResponse(feedback);
      }

      // SUB-ROUTE: save-draft
      if (method === 'POST' && parts[3] === 'save-draft') {
        const { answers, coaching } = await req.json();
        
        const storedQuestions: any[] = review.questions
          ? (typeof review.questions === 'string' ? JSON.parse(review.questions) : review.questions)
          : [];

        const answersDict = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
        const mergedQuestions = mergeAnswersIntoQuestions(storedQuestions, answersDict);

        await db.callReview.update({
          where: { id: review.id },
          data: {
            questions: mergedQuestions,
            feedback: coaching || review.feedback,
            status: 'In Progress'
          }
        });
        return successResponse({ success: true });
      }

      // SUB-ROUTE: submit final review
      if (method === 'POST' && parts[3] === 'submit') {
        const { answers, coaching } = await req.json();

        // answers from the frontend is a key-value dict: { [questionId]: { value, comment, isNa, isAccepted } }
        // Merge with stored questions for scoring
        const storedQuestions: any[] = review.questions
          ? (typeof review.questions === 'string' ? JSON.parse(review.questions) : review.questions)
          : [];

        const answersDict = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};

        let earnedPoints = 0;
        let maxPoints = 0;

        storedQuestions.forEach((q: any) => {
          const qId = q.id;
          const ans = answersDict[qId] || {};
          if (ans.isNa) return; // skip N/A

          const val = ans.value;
          if (!val && val !== 0 && val !== false) return; // skip unanswered

          if (q.type === 'yes_no') {
            maxPoints += 10;
            if (val === 'Yes' || val === true || val === 'true' || val === 1 || val === '1') {
              earnedPoints += 10;
            }
          } else if (q.type === 'scale_1_5') {
            maxPoints += 10;
            const scoreVal = Number(val) || 0;
            earnedPoints += Math.min(scoreVal, 5) * 2; // 1-5 scale -> 2-10 points
          }
        });

        const finalScore = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;

        // Merge answers into questions for storage
        const mergedQuestions = mergeAnswersIntoQuestions(storedQuestions, answersDict);

        await db.callReview.update({
          where: { id: review.id },
          data: {
            questions: mergedQuestions,
            feedback: coaching || review.feedback,
            overallScore: finalScore,
            status: 'Completed',
            hasReview: true
          }
        });

        return successResponse({
          success: true,
          finalScore
        });
      }

      // SUB-ROUTE: mark-na
      if (method === 'POST' && parts[3] === 'mark-na') {
        await db.callReview.update({
          where: { id: review.id },
          data: { status: 'N/A' }
        });
        return successResponse({ success: true });
      }

      // PATCH update (e.g. scorecard change, user assignment, or sales rep assignment)
      if (method === 'PATCH') {
        const body: any = await req.json();
        const updateData: any = {};

        if (body.scorecardId) {
          updateData.scorecardId = body.scorecardId;
          updateData.scorecardName =
            body.scorecardId === 'sc_02' ? 'Demo Call Scorecard' :
            body.scorecardId === 'sc_03' ? 'Negotiation Scorecard' : 'Discovery Call Scorecard';
          
          // Regenerate scorecard questions for the new scorecard type
          const callId = REVIEW_TO_CALL_MAP[review.reviewId] || review.id;
          const transcript = await db.transcript.findUnique({
            where: { callId }
          });
          const text = transcript?.fullText || '';
          updateData.questions = await generateDynamicQuestions(text, body.scorecardId, updateData.scorecardName);
        }

        if (body.reviewerId) {
          const reviewerUser = await db.user.findUnique({ where: { id: body.reviewerId } });
          if (reviewerUser) {
            updateData.reviewer = reviewerUser.name;
          }
        }

        if (body.salesRepId) {
          const repUser = await db.user.findUnique({ where: { id: body.salesRepId } });
          if (repUser) {
            updateData.salesRep = repUser.name;
          }
        }

        await db.callReview.update({
          where: { id: review.id },
          data: updateData
        });

        return successResponse({ success: true });
      }

      // Fallback single review detail
      const mapped = await mapReviewDetail(review);
      return successResponse(mapped);
    }

    // -------------------------------------------------------------
    // Route 9: Analytics Endpoints (M02)
    // -------------------------------------------------------------
    if (path.startsWith('conversation-intelligence/analytics/')) {
      const reviews = await db.callReview.findMany({
        where: { tenantid: user.tenantId, status: { in: ['Completed', 'Feedback Pending', 'Acknowledged'] } }
      });

      const subPath = pathSegments[2];

      if (subPath === 'summary') {
        const count = reviews.length;
        const sum = reviews.reduce((s, r) => s + (r.overallScore || 0), 0);
        const avg = count > 0 ? Math.round(sum / count) : 0;

        // Group status counts
        const allReviews = await db.callReview.findMany({ where: { tenantid: user.tenantId } });
        const completed = allReviews.filter(r => r.status === 'Completed' || r.status === 'Acknowledged').length;
        const inProgress = allReviews.filter(r => r.status === 'In Progress' || r.status === 'Feedback Pending').length;
        const pending = allReviews.filter(r => r.status === 'Pending').length;

        return successResponse({
          totalCalls: allReviews.length,
          evaluatedCalls: completed,
          averageScore: avg,
          completionRate: allReviews.length > 0 ? Math.round((completed / allReviews.length) * 100) : 0,
          pendingReviews: pending,
          inProgressReviews: inProgress
        });
      }

      if (subPath === 'score-trend') {
        // Build mock time series or group by day
        const trendData = [
          { date: 'Mon', score: 78 },
          { date: 'Tue', score: 82 },
          { date: 'Wed', score: 80 },
          { date: 'Thu', score: 85 },
          { date: 'Fri', score: 88 },
        ];
        return successResponse({ trendData });
      }

      if (subPath === 'focus-areas') {
        return successResponse({
          focusAreas: [
            { area: 'Discovery questioning', score: 88, status: 'Excellent' },
            { area: 'Pricing handling', score: 72, status: 'Needs Improvement' },
            { area: 'Next steps clarity', score: 80, status: 'Good' }
          ]
        });
      }

      if (subPath === 'common-tags') {
        return successResponse({
          tags: [
            { tag: 'Enterprise', count: 4 },
            { tag: 'Technical Objection', count: 2 },
            { tag: 'Competitor Mentioned', count: 3 }
          ]
        });
      }

      if (subPath === 'review-history') {
        return successResponse({
          history: reviews.map(r => ({
            id: r.id,
            callTitle: r.callTitle,
            salesRep: r.salesRep,
            score: r.overallScore,
            reviewedAt: r.updatedAt.toISOString(),
            status: r.status
          }))
        });
      }
    }

    return errorResponse(`No handler matched for ${method} /api/v1/${path}`, 'NOT_IMPLEMENTED', 404);

  } catch (err: any) {
    console.error('API Error:', err);
    return errorResponse(err.message || 'API request failed', 'SERVER_ERROR', 500);
  }
}

// Ensure review tables have seeded data if empty; also fix UUID customer names on existing rows
async function ensureSeededReviews(tenantId: string) {
  const count = await db.callReview.count({ where: { tenantid: tenantId } });

  if (count > 0) {
    // Reviews exist — fix any rows where customer is a UUID or missing
    const reviews = await db.callReview.findMany({ where: { tenantid: tenantId } });
    const needsFix = reviews.filter(r =>
      !r.customer ||
      r.customer === 'Unknown Account' ||
      /^[0-9a-f-]{36}$/i.test(r.customer)
    );
    for (const r of needsFix) {
      const callId = REVIEW_TO_CALL_MAP[r.reviewId];
      if (callId) {
        const callRec = await db.callRecord.findUnique({ where: { id: callId } });
        if (callRec) {
          const betterName = (callRec as any).accountName || extractAccountFromTitle(callRec.title);
          if (betterName) {
            await db.callReview.update({
              where: { id: r.id },
              data: { customer: betterName }
            });
          }
        }
      }
    }
    
    // Sync any new CallRecords that don't have a CallReview yet
    const allCalls = await db.callRecord.findMany({ where: { tenantid: tenantId } });
    const existingReviews = await db.callReview.findMany({ where: { tenantid: tenantId } });
    
    for (const c of allCalls) {
      // Find by title or matching ID
      const hasReview = existingReviews.some(r => r.callTitle === c.title || REVIEW_TO_CALL_MAP[r.reviewId] === c.id);
      if (!hasReview) {
        const reviewId = CALL_TO_REVIEW_MAP[c.id] || `rv_${crypto.randomUUID().split('-')[0]}`;
        await db.callReview.create({
          data: {
            tenantid: tenantId,
            reviewId,
            callTitle: c.title,
            customer: (c as any).accountName || extractAccountFromTitle(c.title) || 'Acme Corp',
            dateTime: c.callDate.toISOString(),
            callType: c.callType || 'Demo',
            duration: formatSecondsToMmSs(c.durationSeconds),
            priority: 'High',
            status: 'Pending',
            salesRep: c.callOwner || 'Sarah Chen',
            reviewer: 'Alex Morgan',
            overallScore: 0,
            aiSummary: 'AI transcript summary pending.',
            aiFlags: [],
            hasReview: false,
          }
        });
      }
    }
    return;
  }

  console.log('No reviews found in db. Automatically seeding reviews from CallRecords...');
  const calls = await db.callRecord.findMany({
    where: { tenantid: tenantId },
    include: { transcript: true }
  });

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    const reviewId = CALL_TO_REVIEW_MAP[c.id] || `rv_${String(i + 1).padStart(3, '0')}`;

    const callTypes = ['Discovery', 'Demo', 'Negotiation', 'Training', 'Discovery', 'Demo'];
    const statuses = ['Pending', 'In Progress', 'Completed', 'Completed', 'Pending', 'In Progress'];
    const priorities = ['High', 'Medium', 'High', 'Medium', 'High', 'Medium'];
    const scores = [80, 84, 88, 90, 92, 94];

    await db.callReview.create({
      data: {
        tenantid: tenantId,
        reviewId,
        callTitle: c.title,
        customer: (c as any).accountName || extractAccountFromTitle(c.title) || 'Acme Corp',
        dateTime: c.callDate.toISOString(),
        callType: callTypes[i] || 'Discovery',
        duration: formatSecondsToMmSs(c.durationSeconds),
        priority: priorities[i] || 'Medium',
        status: statuses[i] || 'Pending',
        salesRep: c.callOwner || 'Sarah Chen',
        reviewer: 'Alex Morgan',
        overallScore: scores[i] || 85,
        aiSummary: c.transcript?.summary || 'AI transcript summary pending.',
        talkRatio: c.transcript?.talkRatio || { rep: 45, customer: 55 },
        keyHighlights: c.transcript?.keyHighlights ? (c.transcript.keyHighlights as any).map((h: any) => h.text || '') : [],
        scorecardId: i === 2 ? 'sc_03' : i === 1 ? 'sc_02' : 'sc_01',
        scorecardName: i === 2 ? 'Negotiation Scorecard' : i === 1 ? 'Demo Call Scorecard' : 'Discovery Call Scorecard',
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        hasReview: statuses[i] === 'Completed'
      }
    });
  }
}

// Helpers
function isPlaceholderSummary(summary: string | null, fullText: string | null): boolean {
  if (!summary || !fullText) return true;
  const cleanSummary = summary.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanStart = fullText.slice(0, 1000).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanStart.includes(cleanSummary) || cleanSummary.slice(0, 50) === cleanStart.slice(0, 50)) {
    return true;
  }
  if (summary.includes('pending') || summary.includes('Automatically generated placeholder')) {
    return true;
  }
  return false;
}

async function getOrGenerateAiInsights(review: any, call: any) {
  const callId = REVIEW_TO_CALL_MAP[review.reviewId] || review.id;
  let transcript = call?.transcript;
  if (!transcript) {
    transcript = await db.transcript.findUnique({ where: { callId } });
  }
  if (!transcript) return null;

  const currentSummary = transcript.summary || review.aiSummary;
  if (currentSummary && !isPlaceholderSummary(currentSummary, transcript.fullText)) {
    return {
      summary: currentSummary,
      keyHighlights: (transcript.keyHighlights && transcript.keyHighlights.length > 0)
        ? transcript.keyHighlights
        : (review.keyHighlights || []),
      sentimentSummary: review.sentimentSummary || '',
      risksDetected: review.risksDetected || []
    };
  }

  const fullText = transcript.fullText;
  if (fullText && process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('your_')) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: `You are an expert sales call analyst. Analyze this sales call transcript and return a JSON object with:
1. "summary": A 2-3 sentence summary of what happened in the call
2. "keyHighlights": An array of 3-5 key moments or quotes from the transcript (as strings)
3. "sentimentSummary": A brief sentiment description (e.g. "Positive with budget caution")
4. "risksDetected": An array of risk strings (e.g. "Competitor mentioned", "Budget timeline unclear")

Transcript:
${fullText.slice(0, 12000)}

Return ONLY the raw JSON object, no markdown, no explanation.`
          }]
        })
      });

      if (groqRes.ok) {
        const groqJson = await groqRes.json();
        let raw = groqJson.choices?.[0]?.message?.content || '{}';
        raw = raw.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(raw);

        // Update Transcript
        await db.transcript.update({
          where: { id: transcript.id },
          data: {
            summary: parsed.summary || null,
            keyHighlights: parsed.keyHighlights || [],
          }
        });

        // Update CallReview
        await db.callReview.update({
          where: { id: review.id },
          data: {
            aiSummary: parsed.summary || null,
            keyHighlights: parsed.keyHighlights || [],
            sentimentSummary: parsed.sentimentSummary || null,
            risksDetected: parsed.risksDetected || [],
          }
        });

        return {
          summary: parsed.summary,
          keyHighlights: parsed.keyHighlights || [],
          sentimentSummary: parsed.sentimentSummary || '',
          risksDetected: parsed.risksDetected || []
        };
      }
    } catch (err) {
      console.warn('[Groq] getOrGenerateAiInsights failed:', err);
    }
  }

  return {
    summary: currentSummary || 'AI summary generation pending.',
    keyHighlights: review.keyHighlights || [],
    sentimentSummary: review.sentimentSummary || '',
    risksDetected: review.risksDetected || []
  };
}

async function mapReviewDetail(review: any) {
  const callId = REVIEW_TO_CALL_MAP[review.reviewId] || review.id;
  const call = await db.callRecord.findUnique({
    where: { id: callId },
    include: { transcript: true }
  });

  const insights = await getOrGenerateAiInsights(review, call);

  const summary = insights?.summary || review.aiSummary;
  const highlights = insights?.keyHighlights && insights.keyHighlights.length > 0
    ? insights.keyHighlights
    : (Array.isArray(call?.transcript?.keyHighlights)
      ? (call.transcript.keyHighlights as any[]).map((h: any) => h.text || h.description || String(h))
      : review.keyHighlights);

  const accountFromTitle = call?.title?.includes(' — ')
    ? call.title.split(' — ').slice(1).join(' — ').trim()
    : null;
  const resolvedCustomer =
    accountFromTitle ||
    (review.customer && review.customer !== 'Unknown Account' && !/^[0-9a-f-]{36}$/i.test(review.customer)
      ? review.customer
      : null) ||
    (review.callTitle?.includes(' — ')
      ? review.callTitle.split(' — ').slice(1).join(' — ').trim()
      : null) ||
    'Unknown Account';

  const safeDateTime = (() => {
    const raw = review.dateTime || review.callDate;
    if (!raw) return new Date().toISOString();
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date().toISOString() : raw;
  })();

  const dealLinked =
    review.dealLinked && review.dealLinked !== 'Account — Q2 Initiative' && !review.dealLinked.startsWith('Unknown')
      ? review.dealLinked
      : call?.title
        ? `${resolvedCustomer !== 'Unknown Account' ? resolvedCustomer : call.title} — Q2`
        : resolvedCustomer !== 'Unknown Account'
          ? `${resolvedCustomer} — Q2`
          : '—';

  const rawParticipants: string[] = Array.isArray(call?.participants) ? call.participants : [];
  const participants = rawParticipants.length > 0
    ? rawParticipants.map((name: string) => {
        const isRep = /rep/i.test(name);
        return {
          name: isRep ? (review.salesRep || name.replace(/\s*\(.*\)/, '').trim()) : name.replace(/\s*\(.*\)/, '').trim(),
          role: isRep ? 'Rep' : 'Customer',
        };
      })
    : [
        { name: review.salesRep || 'Sales Rep', role: 'Rep' },
        { name: resolvedCustomer !== 'Unknown Account' ? resolvedCustomer : 'Customer', role: 'Customer' },
      ];

  const parsedQuestions = review.questions
    ? (typeof review.questions === 'string' ? JSON.parse(review.questions) : review.questions)
    : [];

  const parsedFeedback = review.feedback
    ? (typeof review.feedback === 'string' ? JSON.parse(review.feedback) : review.feedback)
    : {};

  return {
    reviewId: review.reviewId,
    callTitle: review.callTitle,
    salesRep: review.salesRep,
    customer: resolvedCustomer,
    dateTime: safeDateTime,
    duration: review.duration,
    callType: review.callType,
    dealLinked,
    callSource: call?.callSource || (call as any)?.source || 'Zoom',
    participants,
    aiSummary: summary,
    keyHighlights: highlights,
    talkRatio: review.talkRatio || { rep: 45, customer: 55 },
    sentimentSummary: insights?.sentimentSummary || review.sentimentSummary,
    sentimentScore: review.sentimentScore,
    risksDetected: insights?.risksDetected || review.risksDetected || [],
    scorecardName: review.scorecardName,
    scorecardVersion: review.scorecardVersion || 'v2.3',
    reviewMode: review.reviewMode || 'AI-Assisted',
    dueDate: review.dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
    status: review.status,
    reviewer: review.reviewer,
    quickStats: review.quickStats || { topics: 4, actionItems: 3 },
    questions: parsedQuestions,
    feedback: parsedFeedback,
    overallScore: review.overallScore
  };
}

function buildSectionsFromAnswers(answersJson: any): any[] {
  let questionsArray: any[] = [];
  if (Array.isArray(answersJson)) {
    questionsArray = answersJson;
  } else if (typeof answersJson === 'string') {
    try {
      questionsArray = JSON.parse(answersJson);
    } catch {
      questionsArray = [];
    }
  }

  const sectionsMap: Record<string, { sectionName: string; scored: number; total: number; questions: any[] }> = {
    opening:            { sectionName: 'Opening',            scored: 0, total: 0, questions: [] },
    discovery:          { sectionName: 'Discovery',          scored: 0, total: 0, questions: [] },
    product_fit:        { sectionName: 'Product Fit',        scored: 0, total: 0, questions: [] },
    objection_handling: { sectionName: 'Objection Handling', scored: 0, total: 0, questions: [] },
  };

  const sectionKeyMap: Record<string, string> = {
    'Opening': 'opening',
    'Discovery': 'discovery',
    'Product Fit': 'product_fit',
    'Objection Handling': 'objection_handling'
  };

  for (const q of questionsArray) {
    const sectionNameRaw = q.category || q.sectionTitle || 'Opening';
    const sectionKey = sectionKeyMap[sectionNameRaw] || q.section || 'opening';

    if (!sectionsMap[sectionKey]) {
      sectionsMap[sectionKey] = { sectionName: sectionNameRaw, scored: 0, total: 0, questions: [] };
    }

    const isNa = !!(q.isNa || q.na);
    const maxScore = q.type === 'scale_1_5' ? 5 : 10;
    
    // Normalize score for section totals
    let normalizedScore = 0;
    if (!isNa && q.score != null) {
      if (q.type === 'scale_1_5') {
        normalizedScore = Number(q.score);
      } else {
        normalizedScore = Number(q.score) === 10 ? 10 : 0;
      }
      sectionsMap[sectionKey].scored += normalizedScore;
      sectionsMap[sectionKey].total += maxScore;
    }

    let managerAnswer = '—';
    if (isNa) {
      managerAnswer = 'N/A';
    } else if (q.value !== undefined && q.value !== null) {
      managerAnswer = String(q.value);
    }

    sectionsMap[sectionKey].questions.push({
      questionText:        q.question || q.text || 'Question?',
      managerAnswer,
      score:               isNa ? 0 : (q.score ?? null),
      maxScore,
      managerComments:     q.comment || q.coachingComment || '',
      aiSuggestion:        q.snippet || q.aiSuggestion || '',
      transcriptReference: q.transcriptReference || '—',
    });
  }

  return Object.values(sectionsMap)
    .filter(s => s.questions.length > 0)
    .map((s) => ({
      sectionName:  s.sectionName,
      sectionScore: s.total > 0 ? `${s.scored}/${s.total}` : '—',
      questions:    s.questions,
    }));
}

async function getCallTranscript(callId: string, tenantId?: string) {
  // 1. Try direct transcript lookup by callId
  let transcript = await db.transcript.findUnique({
    where: { callId },
    include: { utterances: { orderBy: { sequenceIndex: 'asc' } } }
  });

  // 2. Fallback — load via callRecord include
  if (!transcript) {
    const callRecord = await db.callRecord.findUnique({
      where: { id: callId },
      include: { transcript: { include: { utterances: { orderBy: { sequenceIndex: 'asc' } } } } }
    });
    if (callRecord?.transcript) {
      transcript = callRecord.transcript as any;
    }

    // 3. If still no transcript but call has an audio URL — trigger AssemblyAI
    if (!transcript && callRecord && tenantId) {
      const rawAudioUrl = (callRecord as any).audioUrl;
      const audioUrl = rawAudioUrl && rawAudioUrl.length > 5 ? rawAudioUrl : pickDemoRecordingUrl(callId);
      if (audioUrl) {
        console.log(`[AssemblyAI] No transcript found for ${callId}, triggering transcription with URL: ${audioUrl.slice(0, 50)}...`);
        const assembled = await transcribeAudioUrl(audioUrl);
        if (assembled) {
          await saveTranscriptToDb(db, callId, tenantId, assembled);
          // Re-fetch the newly saved transcript
          transcript = await db.transcript.findUnique({
            where: { callId },
            include: { utterances: { orderBy: { sequenceIndex: 'asc' } } }
          }) as any;
        }
      }
    }
  }

  if (!transcript) {
    return successResponse({ entries: [], message: 'No transcript available for this call.' });
  }

  const utterances = (transcript as any).utterances || [];
  const entries = utterances.map((u: any) => ({
    id: u.id,
    speaker: u.speaker,
    text: u.text,
    startMs: u.startMs,
    endMs: u.endMs,
    confidence: u.confidence
  }));

  return successResponse({ entries });
}


async function getCallAiInsights(callId: string) {
  let transcript = await db.transcript.findUnique({ where: { callId } });

  // Fallback via callRecord
  if (!transcript) {
    const callRecord = await db.callRecord.findUnique({
      where: { id: callId },
      include: { transcript: true }
    });
    if (callRecord?.transcript) transcript = callRecord.transcript;
  }

  if (!transcript) {
    return successResponse({
      summary: 'AI insights are currently pending transcript completion.',
      keyHighlights: [],
      talkRatio: { rep: 50, customer: 50 }
    });
  }

  const reviewId = CALL_TO_REVIEW_MAP[callId];
  let review = await db.callReview.findFirst({
    where: { OR: [{ id: callId }, { reviewId }] }
  });

  // Fallback: lookup review by matching callTitle
  if (!review) {
    const callRecord = await db.callRecord.findUnique({ where: { id: callId } });
    if (callRecord) {
      review = await db.callReview.findFirst({
        where: { callTitle: callRecord.title, tenantid: callRecord.tenantid }
      });
    }
  }

  if (!review) {
    return successResponse({
      summary: 'AI insights pending.',
      keyHighlights: [],
      talkRatio: { rep: 50, customer: 50 }
    });
  }

  const insights = await getOrGenerateAiInsights(review, { transcript });
  return successResponse({
    summary: insights?.summary || 'AI summary generation pending.',
    keyHighlights: insights?.keyHighlights || [],
    talkRatio: (transcript.talkRatio as any) || { rep: 50, customer: 50 },
    sentimentSummary: insights?.sentimentSummary || '',
    risksDetected: insights?.risksDetected || []
  });
}

function parseDurationToSeconds(durStr: string | null): number {
  if (!durStr) return 0;
  const parts = durStr.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(durStr) || 0;
}

function formatSecondsToMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function extractAccountFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const parts = title.includes(' — ') 
    ? title.split(' — ') 
    : (title.includes(' - ') ? title.split(' - ') : [title]);
  if (parts.length < 2) return title.trim();
  const stageKeywords = [
    'discovery', 'demo', 'negotiation', 'closing', 'follow-up', 'follow up', 'training',
    'call', 'usability', 'testing', 'initiative', 'meeting', 'review'
  ];
  const scorePart = (p: string) => {
    const low = p.toLowerCase();
    return stageKeywords.filter(kw => low.includes(kw)).length;
  };
  const part0 = parts[0].trim();
  const part1 = parts[1].trim();
  if (scorePart(part0) > scorePart(part1)) {
    return part1;
  }
  return part0;
}

function mergeAnswersIntoQuestions(questionsJson: any, answersObj: any): any[] {
  let questions: any[] = [];
  if (Array.isArray(questionsJson)) {
    questions = questionsJson;
  } else if (typeof questionsJson === 'string') {
    try {
      questions = JSON.parse(questionsJson);
    } catch {
      questions = [];
    }
  }
  if (!Array.isArray(questions)) {
    questions = [];
  }
  const ans = answersObj || {};
  return questions.map(q => {
    const qId = q.id;
    const answer = ans[qId] || {};
    let score: number | null = null;
    if (answer.isNa) {
      score = null;
    } else if (answer.value === 'Yes' || answer.value === 'Good' || answer.value === 'Excellent' || answer.value === 'true' || answer.value === true) {
      score = 10;
    } else if (answer.value === 'No' || answer.value === 'Poor' || answer.value === 'Fair' || answer.value === 'false' || answer.value === false) {
      score = 0;
    } else if (answer.value != null && !isNaN(Number(answer.value))) {
      score = Number(answer.value);
    }
    return {
      ...q,
      score,
      comment: answer.comment || '',
      isNa: !!answer.isNa,
      isAccepted: !!answer.isAccepted,
      value: answer.value
    };
  });
}
