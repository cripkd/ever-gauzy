// scripts/lib/precondition.mjs
export function assertStatus(task, expectedStatus) {
  const actual = task?.status?.status;
  if (actual !== expectedStatus) {
    throw new Error(
      `Ticket ${task.id} is at status "${actual}", expected "${expectedStatus}" for this stage. ` +
      `Refusing to proceed — this is the local path's stand-in for the poller's own status filter.`
    );
  }
}
