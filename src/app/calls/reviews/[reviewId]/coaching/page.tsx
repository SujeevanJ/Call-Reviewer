import CallsReviewCoachingView from '@calls/components/pages/CallsReviewCoachingView';

export default function Page({ params }: { params: { reviewId: string } }) {
  return <CallsReviewCoachingView reviewId={params.reviewId} />;
}
