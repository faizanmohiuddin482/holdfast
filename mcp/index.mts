// Holdfast MCP server over stdio. Configure with HOLDFAST_URL and the spending policy env vars.
// Never write to stdout here: it carries the MCP protocol.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { holdfastApi } from "./api.mts";
import { policyFromEnv } from "./policy.mts";
import { createHoldfastMcp } from "./server.mts";

const server = createHoldfastMcp({ api: holdfastApi(process.env.HOLDFAST_URL ?? "http://localhost:3000"), policy: policyFromEnv() });
await server.connect(new StdioServerTransport());
