#!/usr/bin/env node
// Assembles one structured JSON run record from environment variables and writes it to
// stdout. Used by every agent workflow's final "Emit run record" step (if: always()), so
// a failed run still produces a record — that's exactly the kind of event an audit trail
// exists to show. See docs/dashboard-plan.md for the schema's purpose and the dashboard
// that ingests these.
//
// Every field is optional (empty string / unset) except RUN_ID, RUN_URL, WORKFLOW,
// EVENT_TYPE, TICKET_ID, STARTED_AT, FINISHED_AT, OUTCOME — a workflow with nothing to
// report for a field (e.g. agent-react-to-e2e.yml never invokes Claude) just leaves the
// corresponding env var unset, and this script null/blank-fills it rather than requiring
// every caller to pass every field.

const env = process.env;

function str(name) {
	const v = env[name];
	return v === undefined || v === '' ? null : v;
}

function num(name) {
	const v = env[name];
	if (v === undefined || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function required(name) {
	const v = str(name);
	if (v === null) {
		console.error(`record-run.mjs: missing required env var ${name}`);
		process.exit(1);
	}
	return v;
}

// The `claude` object is null in its entirety when this run never invoked Claude —
// distinguishing "no Claude call happened" from "Claude was called but produced no
// usable session_id" (which record-run.mjs treats as a caller bug worth surfacing, not
// silently swallowing into a half-populated object).
const claudeSessionId = str('CLAUDE_SESSION_ID');
const claude =
	claudeSessionId === null
		? null
		: {
				session_id: claudeSessionId,
				model: str('CLAUDE_MODEL_USED'),
				cost_usd: num('CLAUDE_COST_USD'),
				input_tokens: num('CLAUDE_INPUT_TOKENS'),
				output_tokens: num('CLAUDE_OUTPUT_TOKENS'),
				cache_read_tokens: num('CLAUDE_CACHE_READ_TOKENS'),
				cache_creation_tokens: num('CLAUDE_CACHE_CREATION_TOKENS'),
				num_turns: num('CLAUDE_NUM_TURNS'),
				duration_ms: num('CLAUDE_DURATION_MS')
		  };

const record = {
	schema_version: 1,
	run_id: required('RUN_ID'),
	run_url: required('RUN_URL'),
	workflow: required('WORKFLOW'),
	event_type: required('EVENT_TYPE'),
	ticket_id: required('TICKET_ID'),
	spec_id: str('SPEC_ID'),
	mode: str('MODE'),
	caused_by_run_id: str('CAUSED_BY_RUN_ID'),
	triggered_by: str('TRIGGERED_BY'),
	started_at: required('STARTED_AT'),
	finished_at: required('FINISHED_AT'),
	outcome: required('OUTCOME'),
	failure_class: str('FAILURE_CLASS'),
	clickup_status_before: str('CLICKUP_STATUS_BEFORE'),
	clickup_status_after: str('CLICKUP_STATUS_AFTER'),
	claude
};

process.stdout.write(JSON.stringify(record, null, 2));
