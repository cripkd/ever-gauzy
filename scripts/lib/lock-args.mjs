// scripts/lib/lock-args.mjs
//
// CLI argument parsing for scripts/lock-ticket.mjs, split out so it's unit-testable
// without the real ClickUp network calls the script itself makes.
export function parseLockArgs(argv) {
  const [ticketId, ...rest] = argv;
  if (!ticketId) {
    throw new Error('ticket_id is required');
  }

  let expectStatus = null;
  let setStatus = null;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--expect') {
      expectStatus = rest[i + 1] ?? null;
      i += 1;
    } else if (rest[i] === '--set') {
      setStatus = rest[i + 1] ?? null;
      i += 1;
    }
  }

  return { ticketId, expectStatus, setStatus };
}
