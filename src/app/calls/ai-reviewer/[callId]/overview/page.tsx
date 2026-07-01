import CallDetailOverview from '@calls/components/rep/CallDetailOverview';

interface Props {
  params: { callId: string } | Promise<{ callId: string }>;
}

export default async function OverviewPage({ params }: Props) {
  const resolvedParams = await params;
  const { callId } = resolvedParams;
  return <CallDetailOverview callId={callId} />;
}
