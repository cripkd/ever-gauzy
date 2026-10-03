// scripts/lib/clickup.mjs
const BASE = 'https://api.clickup.com/api/v2';

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
