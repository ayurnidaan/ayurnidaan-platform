const defaultOrigins = [
  "https://dist-vikriti.vercel.app",
  "https://dist-fawn-zeta-72.vercel.app",
  "http://localhost:8081",
  "http://localhost:19006",
];

const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_WEB_ORIGINS") || defaultOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

export const corsHeadersFor = (request: Request) => {
  const origin = request.headers.get("Origin")?.replace(/\/$/, "") ?? "";
  return {
    ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
};

export async function consumeRateLimit(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  endpoint: string,
  limit: number,
  windowSeconds: number,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_api_rate_limit`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      p_endpoint: endpoint,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }),
  });
  if (!response.ok) {
    console.error("Rate-limit service failed", endpoint, response.status);
    return { allowed: false, unavailable: true };
  }
  return { allowed: (await response.json()) === true, unavailable: false };
}

export const publicError = (headers: Record<string, string>, message: string, status = 500) =>
  Response.json({ error: message }, { status, headers });
