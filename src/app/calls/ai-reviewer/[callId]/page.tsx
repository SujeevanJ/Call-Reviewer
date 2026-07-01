import { redirect } from 'next/navigation';

interface Props {
  params: { callId: string } | Promise<{ callId: string }>;
}

export default async function CallDetailIndexPage({ params }: Props) {
  const resolvedParams = await params;
  const { callId } = resolvedParams;
  redirect(`/calls/ai-reviewer/${callId}/overview`);
}
