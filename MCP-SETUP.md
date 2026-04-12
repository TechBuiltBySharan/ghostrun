# GhostRun MCP Server

GhostRun exposes a standard [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server. Any MCP-compatible AI client can connect to it — not just Claude Desktop.

**Works with:** Claude Desktop · Cursor · Windsurf · OpenClaw · Zed · any MCP client

## Quick Start

```bash
# Compiled version (recommended)
node mcp-server.js

# TypeScript source (dev)
npx tsx mcp-server.ts
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_flows` | List all saved flows with pass rates |
| `get_flow` | Get flow details and step graph |
| `run_flow` | Execute a flow with Playwright (headless) |
| `get_run_result` | Detailed per-step results with screenshots |
| `list_runs` | Recent run history |
| `delete_flow` | Remove a flow |
| `get_status` | Statistics, AI provider, creator breakdown |

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/ghostrun/mcp-server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "optional — enables AI failure analysis"
      }
    }
  }
}
```

Restart Claude Desktop. Ask it:
- *"List my GhostRun flows"*
- *"Run the login flow and tell me if it passed"*
- *"What failed in the last checkout run?"*

## Cursor / Windsurf / Other MCP Clients

Point your MCP client at the server process:

```
command: node
args:    ["/absolute/path/to/ghostrun/mcp-server.js"]
```

Refer to your client's MCP documentation for the exact config format.

## Programmatic (stdio transport)

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/mcp-server.js"],
});
const client = new Client({ name: "my-app", version: "1.0" }, { capabilities: {} });
await client.connect(transport);

// List flows
const result = await client.callTool({ name: "list_flows", arguments: {} });
```

## AI Analysis

Set `ANTHROPIC_API_KEY` (or run Ollama locally) to enable plain-English failure summaries. When a flow fails, GhostRun explains what broke and how to fix it.
