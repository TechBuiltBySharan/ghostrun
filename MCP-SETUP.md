# Flowmind MCP Server Setup

The Flowmind MCP server lets AI assistants (Claude, etc.) directly list flows, run them, and inspect results.

## Quick Start

Run the server directly:
```bash
npx tsx mcp-server.ts
# or using compiled version:
node mcp-server.js
```

## Claude Desktop Integration

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ghostrun": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/ghostrun/mcp-server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see Flowmind tools available.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_flows` | List all saved flows |
| `get_flow` | Get flow details and steps |
| `run_flow` | Execute a flow with Playwright |
| `get_run_result` | Detailed step-by-step results |
| `list_runs` | Recent run history |
| `delete_flow` | Remove a flow |
| `get_status` | Statistics and system info |

## Example Usage with Claude

Once connected, you can ask Claude:
- *"List all my Flowmind flows"*
- *"Run the login flow and tell me if it passed"*
- *"What failed in the last run of the checkout flow?"*
- *"Run all flows and summarize the results"*

## With AI Analysis

Set `ANTHROPIC_API_KEY` in the env block above to enable Claude to generate
plain-English failure summaries when flows fail. Claude will explain what
went wrong and how to fix it.
