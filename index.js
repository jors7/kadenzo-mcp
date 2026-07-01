#!/usr/bin/env node
/**
 * Kadenzo MCP server — exposes the Kadenzo Studio public API (studio.kadenzo.app/api/v1)
 * as Model Context Protocol tools, so any MCP-capable agent (Claude Desktop, Cursor,
 * ChatGPT, …) can schedule, manage, and analyze social posts across 11 networks.
 *
 * Auth: set KADENZO_API_KEY (generate at studio.kadenzo.app/dashboard/settings?section=api).
 * Transport: stdio (the standard for locally-run MCP servers).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const API_KEY = process.env.KADENZO_API_KEY
const BASE = (process.env.KADENZO_API_BASE || 'https://studio.kadenzo.app/api/v1').replace(/\/$/, '')

if (!API_KEY) {
  console.error('KADENZO_API_KEY is not set. Generate a key at https://studio.kadenzo.app/dashboard/settings?section=api and set it in your MCP client config.')
  process.exit(1)
}

async function api(method, path, { body, query } = {}) {
  const url = new URL(BASE + path)
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v))
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${API_KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    const msg = data && typeof data === 'object' ? data.error || JSON.stringify(data) : String(data)
    throw new Error(`${res.status} ${msg}`)
  }
  return data
}

const ok = (data) => ({ content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true })

const server = new McpServer({ name: 'kadenzo', version: '1.0.0' })

server.tool(
  'list_accounts',
  'List the social accounts connected to this Kadenzo workspace — returns each account id, platform, and username. Use the ids as account_ids when scheduling.',
  {},
  async () => { try { return ok(await api('GET', '/accounts')) } catch (e) { return fail(e) } },
)

server.tool(
  'schedule_post',
  'Schedule a social post to one or more connected accounts for a FUTURE time (it publishes automatically). Set validate_only=true to check accounts/limits/timing without scheduling.',
  {
    content: z.string().optional().describe('Post text. Optional only if media_urls is provided.'),
    account_ids: z.array(z.string()).describe('Account ids from list_accounts (at least one).'),
    scheduled_for: z.string().describe('ISO 8601 future datetime, e.g. "2026-07-02T09:00:00Z".'),
    media_urls: z.array(z.string()).optional().describe('Public image/video URLs, or URLs returned by upload_media.'),
    platform_content: z.record(z.string()).optional().describe('Per-platform text overrides, e.g. {"twitter":"shorter text"}.'),
    options: z.record(z.any()).optional().describe('Per-platform format options, e.g. {"instagram":{"as_reel":true,"first_comment":"#tags"},"tiktok":{"privacy_level":"PUBLIC_TO_EVERYONE"}}.'),
    thread: z.record(z.array(z.string())).optional().describe('Multi-post threads, e.g. {"x":["1/…","2/…"],"bluesky":["…"]}.'),
    validate_only: z.boolean().optional().describe('If true, validate only (dry run) and do not schedule.'),
  },
  async ({ validate_only, ...rest }) => {
    try {
      const body = { ...rest }
      if (validate_only) body.dry_run = true
      return ok(await api('POST', '/posts', { body }))
    } catch (e) { return fail(e) }
  },
)

server.tool(
  'list_posts',
  'List your posts, newest first. Optionally filter by status (comma-separated, e.g. "pending,posted") and paginate with limit (1-100) and offset.',
  {
    status: z.string().optional().describe('Comma-separated statuses, or omit for all.'),
    limit: z.number().optional(),
    offset: z.number().optional(),
  },
  async (a) => { try { return ok(await api('GET', '/posts', { query: a })) } catch (e) { return fail(e) } },
)

server.tool(
  'get_post',
  'Get one post: roll-up status, per-channel outcome, and any options/thread that were set on it.',
  { id: z.string().describe('The post id.') },
  async ({ id }) => { try { return ok(await api('GET', `/posts/${id}`)) } catch (e) { return fail(e) } },
)

server.tool(
  'update_post',
  'Edit a post that has not published yet — change content, accounts, time, media, options, or thread.',
  {
    id: z.string(),
    content: z.string().optional(),
    account_ids: z.array(z.string()).optional(),
    scheduled_for: z.string().optional(),
    media_urls: z.array(z.string()).optional(),
    platform_content: z.record(z.string()).optional(),
    options: z.record(z.any()).optional(),
    thread: z.record(z.array(z.string())).optional(),
  },
  async ({ id, ...body }) => { try { return ok(await api('PATCH', `/posts/${id}`, { body })) } catch (e) { return fail(e) } },
)

server.tool(
  'cancel_post',
  'Cancel a scheduled post before it publishes. Already-published posts cannot be cancelled.',
  { id: z.string() },
  async ({ id }) => { try { return ok(await api('DELETE', `/posts/${id}`)) } catch (e) { return fail(e) } },
)

server.tool(
  'upload_media',
  'Upload a local image or video file and get a hosted URL to use in media_urls when scheduling.',
  { path: z.string().describe('Absolute path to a local image/video file.') },
  async ({ path }) => {
    try {
      const buf = await readFile(path)
      const fd = new FormData()
      fd.append('file', new Blob([buf]), basename(path))
      const res = await fetch(`${BASE}/media`, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}` }, body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`${res.status} ${data.error || JSON.stringify(data)}`)
      return ok(data)
    } catch (e) { return fail(e) }
  },
)

server.tool(
  'get_account_analytics',
  'Recent posts and their engagement metrics for one connected account (likes, comments, views, etc.). The reliable analytics surface.',
  { account_id: z.string(), limit: z.number().optional().describe('1-100, default 25.') },
  async ({ account_id, limit }) => { try { return ok(await api('GET', `/accounts/${account_id}/analytics`, { query: { limit } })) } catch (e) { return fail(e) } },
)

server.tool(
  'get_post_analytics',
  'Per-channel engagement metrics for a specific post you scheduled (best-effort; use get_account_analytics for the full picture).',
  { id: z.string() },
  async ({ id }) => { try { return ok(await api('GET', `/posts/${id}/analytics`)) } catch (e) { return fail(e) } },
)

server.tool(
  'generate_content',
  'Generate post copy for a platform from a topic — great for a "generate then schedule" flow. Returns a caption/post/description you can feed into schedule_post. Platform must be one of: instagram, tiktok, snapchat, facebook, youtube.',
  {
    topic: z.string().describe('What the post is about (2-500 characters).'),
    platform: z.enum(['instagram', 'tiktok', 'snapchat', 'facebook', 'youtube']),
    goal: z.enum(['story', 'educate', 'promote']).optional().describe('Angle for the copy. Defaults to "story".'),
  },
  async (a) => { try { return ok(await api('POST', '/generate', { body: a })) } catch (e) { return fail(e) } },
)

server.tool(
  'get_best_times',
  'Personalized best posting times for one connected account, computed from its own engagement history. Requires the Professional plan or higher. Hours are UTC; shift to the poster’s timezone. Use it to pick scheduled_for.',
  { account_id: z.string() },
  async ({ account_id }) => { try { return ok(await api('GET', `/accounts/${account_id}/best-times`)) } catch (e) { return fail(e) } },
)

server.tool(
  'list_mentions',
  'Your social-listening mentions — who is talking about the keywords you track (reddit/bluesky/youtube/hackernews/…), newest first. Filter by platform, since (ISO), or unread.',
  {
    platform: z.string().optional(),
    since: z.string().optional().describe('ISO datetime; only mentions published after this.'),
    unread: z.boolean().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  },
  async (a) => {
    try {
      const query = { platform: a.platform, since: a.since, limit: a.limit, offset: a.offset }
      if (a.unread) query.unread = 'true'
      return ok(await api('GET', '/mentions', { query }))
    } catch (e) { return fail(e) }
  },
)

server.tool(
  'post_comment',
  'Post a comment/reply to one of your posts. account_id from list_accounts; target_id is the platform post/media/comment id to comment on. Supported: instagram, facebook, linkedin.',
  {
    account_id: z.string(),
    target_id: z.string().describe('The platform post/media/comment id to comment on.'),
    text: z.string(),
  },
  async (a) => { try { return ok(await api('POST', '/comments', { body: a })) } catch (e) { return fail(e) } },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Kadenzo MCP server running (stdio). 13 tools available.')
