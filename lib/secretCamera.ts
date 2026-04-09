import crypto from "crypto";
import path from "path";

export const SECRET_CAMERA_ROUTE_BASE = "/ritual";

export type SecretFlowDefinition = {
  id: string;
  tokenEnvKey: string;
  referencePublicPath: string;
  referenceFilePath: string;
  prompt: string;
  title: string;
  subtitle: string;
  tips: string[];
};

export const SECRET_FLOWS: Record<string, SecretFlowDefinition> = {
  pectoral: {
    id: "pectoral",
    tokenEnvKey: "SECRET_CAMERA_TOKEN_PECTORAL",
    referencePublicPath: "/secret/pectoral-reference.jpg",
    referenceFilePath: path.join(process.cwd(), "public", "secret", "pectoral-reference.jpg"),
    prompt:
      "Згенеруй таке саме фото але пектораль на людині. Вертикальний портрет 9:16, фотореалістично, збережи людину, позу, ракурс і світло, додай на шию саме цю золоту пектораль як реальний ювелірний предмет, природно підігнаний по масштабу й посадці.",
    title: "Референс пекторалі",
    subtitle:
      "Після фото система генерує вертикальний кадр 9:16 і додає цю прикрасу на людину.",
    tips: ["Плечі рівно", "Голова прямо", "Шия відкрита"],
  },
};

function normalizedToken(value: string | null | undefined) {
  return String(value || "").trim();
}

export function getSecretFlow(flowId: string | null | undefined) {
  const id = String(flowId || "").trim();
  return SECRET_FLOWS[id] || null;
}

export function getSecretFlowToken(flowId: string | null | undefined) {
  const flow = getSecretFlow(flowId);
  if (!flow) return "";
  const exact = normalizedToken(process.env[flow.tokenEnvKey]);
  if (exact) return exact;

  if (flow.id === "pectoral") {
    return normalizedToken(process.env.SECRET_CAMERA_TOKEN);
  }

  return "";
}

export function isValidSecretFlowToken(
  flowId: string | null | undefined,
  candidate: string | null | undefined
) {
  const expected = getSecretFlowToken(flowId);
  const actual = normalizedToken(candidate);

  if (!expected || !actual) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
