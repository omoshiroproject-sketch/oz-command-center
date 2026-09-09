export interface OwnerAuthEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  OZ_ALLOWED_EMAIL?: string;
}

export type OwnerContext = {
  userId: string;
  email: string;
  accessToken: string;
};

type SupabaseUser = {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  confirmed_at?: unknown;
  app_metadata?: { provider?: unknown; providers?: unknown };
  identities?: Array<{ provider?: unknown }>;
};

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403 | 503) {
    super(message);
    this.name = "AuthError";
  }
}

function requireConfiguration(env: OwnerAuthEnvironment) {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY)?.trim();
  const allowedEmail = env.OZ_ALLOWED_EMAIL?.trim().toLowerCase();
  if (!url || !publishableKey || !allowedEmail) {
    throw new AuthError("Development authentication is not configured.", 503);
  }
  return { url, publishableKey, allowedEmail };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length < 20 || match[1].length > 16_384) {
    throw new AuthError("Authentication is required.", 401);
  }
  return match[1];
}

function isGoogleIdentity(user: SupabaseUser) {
  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata?.providers : [];
  return user.app_metadata?.provider === "google"
    || providers.includes("google")
    || user.identities?.some((identity) => identity.provider === "google") === true;
}

export async function requireOwner(
  request: Request,
  env: OwnerAuthEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<OwnerContext> {
  const { url, publishableKey, allowedEmail } = requireConfiguration(env);
  const accessToken = bearerToken(request);
  let response: Response;
  try {
    response = await fetcher(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new AuthError("Authentication service is unavailable.", 503);
  }
  if (!response.ok) throw new AuthError("Authentication is required.", 401);

  const user = await response.json() as SupabaseUser;
  const userId = typeof user.id === "string" ? user.id : "";
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!userId || !email || !confirmed || !isGoogleIdentity(user)) {
    throw new AuthError("A verified Google account is required.", 403);
  }
  if (email !== allowedEmail) throw new AuthError("This account is not allowed.", 403);
  return { userId, email, accessToken };
}
