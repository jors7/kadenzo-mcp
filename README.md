# Kadenzo MCP server

Connect any MCP-capable AI agent — **Claude Desktop, Cursor, ChatGPT, Codex** — to
[Kadenzo](https://kadenzo.app) and let it schedule, manage, and analyze social posts
across **11 networks** (Instagram, TikTok, X, LinkedIn, YouTube, Facebook, Pinterest,
Threads, Bluesky, Mastodon, Telegram). It wraps the Kadenzo Studio public API as
[Model Context Protocol](https://modelcontextprotocol.io) tools, so your agent doesn't
just *draft* content — it can **ship** it.

## Tools

| Tool | What it does |
|------|--------------|
| `list_accounts` | List connected accounts (ids + platforms) |
| `schedule_post` | Schedule a post for a future time (+ `validate_only`, `options`, `thread`) |
| `list_posts` | List your posts, newest first (filter by status, paginate) |
| `get_post` | One post: status, per-channel outcome, options/thread |
| `update_post` | Edit a not-yet-published post |
| `cancel_post` | Cancel a scheduled post before it publishes |
| `upload_media` | Upload a local image/video file, get a URL for `media_urls` |
| `get_account_analytics` | Recent posts + engagement metrics for an account |
| `get_post_analytics` | Per-channel metrics for a post you scheduled |
| `generate_content` | Generate post copy for a platform from a topic ("generate then schedule") |
| `get_best_times` | Personalized best posting times for an account (Professional+) |
| `list_mentions` | Social-listening mentions (who's talking about your keywords) |
| `post_comment` | Post a comment/reply to your post (instagram/facebook/linkedin) |

## Setup

1. Generate an API key in Kadenzo: **Settings → API keys** (`studio.kadenzo.app/dashboard/settings?section=api`). The API is available on paid plans.
2. Add the server to your MCP client. **Claude Desktop** (`claude_desktop_config.json`) / **Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "kadenzo": {
      "command": "npx",
      "args": ["-y", "kadenzo-mcp"],
      "env": { "KADENZO_API_KEY": "kdz_live_xxxxxxxxxxxxxxxxxxxxxxxx" }
    }
  }
}
```

3. Restart the client. Ask your agent things like *"list my connected accounts,"* *"schedule this to X and Bluesky tomorrow at 9am,"* or *"how did my last Instagram posts perform?"*

## Notes

- Posts are **schedule-only** — provide a future `scheduled_for`; they publish automatically.
- `KADENZO_API_BASE` overrides the API base URL (default `https://studio.kadenzo.app/api/v1`).
- Requires Node 18+ (uses the built-in `fetch`/`FormData`).
- Learn more / full API reference: <https://studio.kadenzo.app/developers> · <https://kadenzo.app>
