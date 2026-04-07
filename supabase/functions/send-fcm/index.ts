// deno-lint-ignore-file no-explicit-any

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importPkcs8PrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const keyData = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createJwt(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 60 * 60,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPkcs8PrivateKey(serviceAccount.private_key);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwt = await createJwt(serviceAccount);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token_exchange_failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("missing_access_token");
  return json.access_token as string;
}

type SendRequest = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  app_type?: 'resident' | 'responder'; // NEW: specify which Firebase project to use
};

Deno.serve(async (req) => {
  try {
    // Allow CORS for direct calls from Electron app
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      const rawBody = await req.text().catch(() => "");
      const snippet = String(rawBody).slice(0, 120);
      return new Response(
        `Invalid request JSON: ${(e as Error)?.message ?? e} | len=${rawBody.length} | startsWith=${JSON.stringify(snippet)}`,
        { status: 400 },
      );
    }
    
    // Handle both direct calls and database webhook calls
    let payload: SendRequest;
    
    if (body.type === 'INSERT' && body.table === 'notifications' && body.record) {
      // Database webhook format
      return new Response("Webhook format not yet supported - use direct call", { status: 501 });
    } else {
      // Direct call format
      payload = body as SendRequest;
      if (!payload?.token) return new Response("Missing token", { status: 400 });
    }

    // Determine which Firebase project to use
    const appType = payload.app_type || 'responder'; // Default to responder for backward compatibility
    
    // Load the appropriate service account based on app_type
    let rawJson = "";
    let rawB64 = "";
    
    if (appType === 'resident') {
      rawJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_RESIDENT") ?? "";
      rawB64 = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_B64_RESIDENT") ?? "";
    } else {
      // responder (default)
      rawJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_RESPONDER") ?? Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") ?? "";
      rawB64 = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_B64_RESPONDER") ?? Deno.env.get("FCM_SERVICE_ACCOUNT_JSON_B64") ?? "";
    }
    
    if (!rawJson && !rawB64) {
      return new Response(
        `Missing FCM service account for app_type=${appType}. Expected FCM_SERVICE_ACCOUNT_JSON_${appType.toUpperCase()} or _B64 variant`,
        { status: 500 },
      );
    }

    let serviceAccount: any;
    let usedEnv: string = rawB64 ? `FCM_SERVICE_ACCOUNT_JSON_B64_${appType.toUpperCase()}` : `FCM_SERVICE_ACCOUNT_JSON_${appType.toUpperCase()}`;

    try {
      if (rawB64) {
        const decoded = atob(rawB64);
        serviceAccount = JSON.parse(decoded);
      } else {
        serviceAccount = JSON.parse(rawJson);
      }
    } catch (e) {
      const rawUsed = rawB64 || rawJson;
      const snippet = String(rawUsed).slice(0, 80);
      return new Response(
        `Invalid ${usedEnv}: ${(e as Error)?.message ?? e} | len=${rawUsed.length} | startsWith=${JSON.stringify(snippet)}`,
        { status: 500 },
      );
    }

    const projectId = serviceAccount.project_id;
    if (!projectId) {
      return new Response("Missing project_id in service account", { status: 500 });
    }

    console.log(`[FCM] Getting access token for app_type=${appType}, project_id=${projectId}`);
    let accessToken: string;
    try {
      accessToken = await getAccessToken(serviceAccount);
      console.log(`[FCM] Access token obtained successfully`);
    } catch (e) {
      console.error(`[FCM] Failed to get access token:`, e);
      return new Response(`OAuth token exchange failed for ${appType}: ${e}`, { status: 401 });
    }

    const resolvedTitle =
      payload.title && payload.title.trim().length > 0 ? payload.title : "iReport";
    const resolvedBody =
      payload.body && payload.body.trim().length > 0 ? payload.body : "";

    const message: any = {
      message: {
        token: payload.token,
        notification: {
          title: resolvedTitle,
          body: resolvedBody,
        },
        data: payload.data ?? {},
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "ireport_notifications",
            title: resolvedTitle,
            body: resolvedBody,
          },
        },
      },
    };

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      },
    );

    const fcmText = await fcmRes.text();
    if (!fcmRes.ok) {
      return new Response(`FCM Error for ${appType}: ${fcmText}`, { status: 502 });
    }

    return new Response(fcmText, { status: 200 });
  } catch (e) {
    return new Response(String(e?.message ?? e), { status: 500 });
  }
});
