import CallDetailFeedback from '@calls/components/rep/CallDetailFeedback';

interface Props {
  params: { callId: string } | Promise<{ callId: string }>;
}

export default async function FeedbackPage({ params }: Props) {
  const resolvedParams = await params;
  const { callId } = resolvedParams;
  return <CallDetailFeedback callId={callId} />;
}
