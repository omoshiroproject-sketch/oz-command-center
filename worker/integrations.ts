import {
  buildOpenAiConnectorTools,
  connectorStatuses,
  type ConnectorRuntimeEnvironment,
} from "../packages/connectors/src/index";

export interface OzIntegrationEnvironment extends ConnectorRuntimeEnvironment {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  OZ_MCP_SERVER_URL?: string;
}

export function getIntegrationStatus(env: OzIntegrationEnvironment) {
  const databaseConfigured = Boolean(env.SUPABASE_URL && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY));
  return [
    {
      id: "project-database",
      label: "OZ Tasks / PostgreSQL",
      capability: "project-data",
      configured: databaseConfigured,
      connected: databaseConfigured,
      state: databaseConfigured ? "connected" : "needs-auth",
      adapter: "oz-core",
      mode: "formal-source",
      scopes: [],
    },
    ...connectorStatuses(env),
    {
      id: "chatgpt-bridge",
      label: "ChatGPT / OZ MCP",
      capability: "project-data",
      configured: Boolean(env.OZ_MCP_SERVER_URL),
      connected: false,
      state: env.OZ_MCP_SERVER_URL ? "configured" : "needs-auth",
      adapter: "remote-mcp-boundary",
      mode: "not-connected",
      scopes: [],
    },
  ];
}

export { buildOpenAiConnectorTools };
