import CallsReviewEvaluateView from '@calls/components/pages/CallsReviewEvaluateView';

export default function Page({ params }: { params: { reviewId: string } }) {
  return <CallsReviewEvaluateView reviewId={params.reviewId} />;
}
