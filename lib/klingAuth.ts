import jwt from "jsonwebtoken";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

export function generateKlingJwt(): string {
  const ak = mustEnv("KLING_API_KEY");
  const sk = mustEnv("KLING_SECRET_KEY");

  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ak, exp: now + 1800, nbf: now - 5 };

  const token = jwt.sign(payload, sk, {
    algorithm: "HS256",
    header: { alg: "HS256", typ: "JWT" },
  });

  return token;
}

export function klingHeaders() {
  const token = generateKlingJwt();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
