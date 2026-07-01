import CallDetailLayout from '@calls/components/rep/CallDetailLayout';

interface Props {
  children: React.ReactNode;
  params: { callId: string } | Promise<{ callId: string }>;
}

export default async function CallDetailRootLayout({ children, params }: Props) {
  // Handle Next.js 14/15 params wrapping
  const resolvedParams = await params;
  const { callId } = resolvedParams;
  return <CallDetailLayout callId={callId}>{children}</CallDetailLayout>;
}
