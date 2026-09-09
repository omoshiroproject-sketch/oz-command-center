// PostgreSQL schema is authoritative. Runtime access uses Supabase Auth + PostgREST
// so the caller's JWT and row-level security remain the authorization boundary.
export * from "./schema";
