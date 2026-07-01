import CallsReviewSummaryView from '@calls/components/pages/CallsReviewSummaryView';

export default function Page({ params }: { params: { reviewId: string } }) {
  return <CallsReviewSummaryView reviewId={params.reviewId} />;
}
