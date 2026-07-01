import CallsReviewDetailView from '@calls/components/pages/CallsReviewDetailView';

export default function Page({ params }: { params: { reviewId: string } }) {
  return <CallsReviewDetailView reviewId={params.reviewId} />;
}
