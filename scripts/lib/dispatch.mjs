// scripts/lib/dispatch.mjs
export async function dispatchEvent(eventType, clientPayload, repo, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: eventType, client_payload: clientPayload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub dispatch API returned HTTP ${res.status}: ${text}`);
  }
}
