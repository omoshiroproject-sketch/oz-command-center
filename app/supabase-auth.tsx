"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";

type OzAuthBridge = {
  configured: boolean;
  waitUntilReady(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
};

declare global { interface Window { OZ_AUTH?: OzAuthBridge } }

let resolveReady: (() => void) | undefined;
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });

export default function SupabaseAuth() {
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? "";
    let client: SupabaseClient | null = null;
    let unsubscribe = () => {};

    const bridge: OzAuthBridge = {
      configured: Boolean(url && publishableKey), waitUntilReady: () => ready,
      async getAccessToken() {
        if (!client) return null;
        const { data } = await client.auth.getSession();
        return data.session?.access_token ?? null;
      },
      async signIn() {
        if (!client) throw new Error("Development Google OAuth is not configured.");
        const { error } = await client.auth.signInWithOAuth({
          provider: "google", options: { redirectTo: window.location.origin, scopes: "openid email profile" },
        });
        if (error) throw new Error("Google sign-in could not be started.");
      },
      async signOut() { if (client) await client.auth.signOut({ scope: "local" }); },
    };

    if (bridge.configured) {
      client = createClient(url, publishableKey, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = client.auth.onAuthStateChange(() => window.dispatchEvent(new Event("oz:auth-changed")));
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getSession().finally(() => resolveReady?.());
    } else resolveReady?.();
    window.OZ_AUTH = bridge;
    return () => { unsubscribe(); delete window.OZ_AUTH; };
  }, []);
  return null;
}
