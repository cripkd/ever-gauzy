// scripts/lib/clickup.mjs
import { spawn } from 'node:child_process';

const BASE = 'https://api.clickup.com/api/v2';

// Shells out to the existing .github/scripts/markdown-to-clickup-comment.mjs, piping
// markdown in via stdin and parsing the block-array JSON it writes to stdout — same
// contract the original bash uses (`printf '%s' "$text" | node .github/scripts/...`).
// Exported (not just used internally) so its conversion logic is unit-testable without
// a network call.
export function markdownToBlocks(markdown) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['.github/scripts/markdown-to-clickup-comment.mjs']);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`markdown-to-clickup-comment.mjs exited ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout));
    });
    child.stdin.write(markdown);
    child.stdin.end();
  });
}

function token() {
  const t = process.env.CLICKUP_API_TOKEN;
  if (!t) throw new Error('CLICKUP_API_TOKEN is not set in the environment.');
  return t;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

export async function getTask(ticketId) {
  const res = await request('GET', `/task/${ticketId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp GET task returned HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export async function putStatus(ticketId, status) {
  const res = await request('PUT', `/task/${ticketId}`, { status });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp PUT status returned HTTP ${res.status}: ${text}`);
  }
}

export async function removeTag(ticketId, tag) {
  const res = await request('DELETE', `/task/${ticketId}/tag/${tag}`);
  return res.status;
}

export async function addTag(ticketId, tag) {
  const res = await request('POST', `/task/${ticketId}/tag/${tag}`);
  return res.status;
}

export async function postPlainComment(ticketId, text) {
  const res = await request('POST', `/task/${ticketId}/comment`, {
    comment_text: text,
    notify_all: false,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp POST comment returned HTTP ${res.status}: ${body}`);
  }
}

export async function postMarkdownComment(ticketId, markdownText) {
  const blocks = await markdownToBlocks(markdownText);
  const res = await request('POST', `/task/${ticketId}/comment`, { comment: blocks, notify_all: false });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp POST comment (markdown) returned HTTP ${res.status}: ${body}`);
  }
}

export async function putCustomField(ticketId, fieldId, value) {
  const res = await request('POST', `/task/${ticketId}/field/${fieldId}`, { value });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp POST custom field returned HTTP ${res.status}: ${body}`);
  }
}

export async function putDescriptionMarkdown(ticketId, markdownContent) {
  const res = await request('PUT', `/task/${ticketId}`, { markdown_content: markdownContent });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp PUT task (description) returned HTTP ${res.status}: ${body}`);
  }
}
