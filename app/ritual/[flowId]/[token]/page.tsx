import { notFound } from "next/navigation";
import SecretCameraFlow from "./SecretCameraFlow";
import { getSecretFlow, isValidSecretFlowToken } from "@/lib/secretCamera";

export const metadata = {
  title: "Private camera flow",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function SecretRitualPage({
  params,
}: {
  params: Promise<{ flowId: string; token: string }>;
}) {
  const { flowId, token } = await params;
  const flow = getSecretFlow(flowId);

  if (!flow || !isValidSecretFlowToken(flowId, token)) {
    notFound();
  }

  return (
    <SecretCameraFlow
      flowId={flow.id}
      token={token}
      prompt={flow.prompt}
    />
  );
}
