#!/usr/bin/env node
// Converts a constrained subset of Markdown into ClickUp's rich-comment block format
// (the `comment` field). Reads markdown from stdin, writes the block array as JSON to
// stdout. Used instead of `comment_text`, which stores markdown as literal syntax
// characters (#, **, -) rather than rendering it — ClickUp comments don't accept a
// markdown string the way a task's `markdown_content` does; they need this block
// structure instead.
//
// Deliberately narrow: covers exactly what a propose.md-generated proposal.md uses —
// headings, bullet lists (possibly indented), inline `code` spans, and plain
// paragraphs. Not a general CommonMark parser: no bold/italic spans, links, numbered
// lists, or code blocks, because the real output this feeds from doesn't use them.

import { readFileSync } from 'node:fs';

const input = readFileSync(0, 'utf8');
const lines = input.split('\n');

const blocks = [];

function pushText(text, attributes = {}) {
	if (text === '') return;
	blocks.push({ text, attributes });
}

// Splits a line on `...`-delimited spans, alternating plain and inline-code segments.
function pushInlineSegments(line, baseAttributes = {}) {
	const parts = line.split(/(`[^`]+`)/);
	for (const part of parts) {
		if (part === '') continue;
		if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
			pushText(part.slice(1, -1), { ...baseAttributes, code: true });
		} else {
			pushText(part, baseAttributes);
		}
	}
}

for (const rawLine of lines) {
	const heading = rawLine.match(/^(#{1,6})\s+(.*)$/);
	const bullet = rawLine.match(/^(\s*)-\s+(.*)$/);

	if (heading) {
		// No native heading formatting in ClickUp's comment schema — bold on its own
		// line is the closest visual approximation.
		pushInlineSegments(heading[2], { bold: true });
		pushText('\n');
	} else if (bullet) {
		const indent = Math.floor(bullet[1].length / 2);
		pushInlineSegments(bullet[2]);
		// The list attribute belongs on the trailing newline, not the text — matches
		// ClickUp's documented format.
		pushText('\n', { list: { list: 'bullet' }, ...(indent > 0 ? { indent } : {}) });
	} else if (rawLine.trim() === '') {
		pushText('\n');
	} else {
		pushInlineSegments(rawLine);
		pushText('\n');
	}
}

process.stdout.write(JSON.stringify(blocks));
