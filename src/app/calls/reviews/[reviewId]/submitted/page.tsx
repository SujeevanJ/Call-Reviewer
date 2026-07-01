import CallsReviewSubmittedView from '@calls/components/pages/CallsReviewSubmittedView';

export default function Page({ params }: { params: { reviewId: string } }) {
  return <CallsReviewSubmittedView reviewId={params.reviewId} />;
}
