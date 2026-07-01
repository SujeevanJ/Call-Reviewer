import CallsReviewViewView from '@calls/components/pages/CallsReviewViewView';

export default function Page({ params }: { params: { reviewId: string } }) {
  return <CallsReviewViewView reviewId={params.reviewId} />;
}
