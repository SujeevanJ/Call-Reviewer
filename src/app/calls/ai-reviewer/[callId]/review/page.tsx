import CallDetailReview from '@calls/components/rep/CallDetailReview';

interface Props {
  params: { callId: string } | Promise<{ callId: string }>;
}

export default async function ReviewPage({ params }: Props) {
  const resolvedParams = await params;
  const { callId } = resolvedParams;
  return <CallDetailReview callId={callId} />;
}
