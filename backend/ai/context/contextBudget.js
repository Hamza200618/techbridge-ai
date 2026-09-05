'use strict';

// Character/token budget for focused AI context (docs/PROJECT_SPEC.md
// section 4.2, docs/TEAM_RULES.md section 17): context must stay bounded no
// matter how large the analyzed project is, and must never silently drop
// entries — truncation is always announced.
//
// A ContextBudget is filled section by section in priority order: callers add
// the most important sections first, so when the budget runs out the least
// important data is what gets cut. Each section carries a title and
// pre-rendered lines; entries that do not fit are dropped and replaced by an
// explicit "... N more entries omitted (context budget)" note.
//
// Provider-independent: the output is plain text/data with no provider
// concepts (docs/PROJECT_SPEC.md section 4.2).

// Rough token estimate — 4 characters per token is the standard heuristic
// for English/code-heavy text and is deliberately conservative.
const CHARS_PER_TOKEN = 4;

// Characters held back while a section still has unplaced entries, so the
// truncation note always fits after the last kept entry.
const TRUNCATION_NOTE_RESERVE = 64;

class ContextBudget {
  constructor(maxChars) {
    this.maxChars = Math.max(1, Number(maxChars) || 1);
    this.used = 0;
    this.sections = [];
    this._rendered = null;
  }

  get remaining() {
    return Math.max(0, this.maxChars - this.used);
  }

  static estimateTokens(text) {
    return Math.ceil(String(text).length / CHARS_PER_TOKEN);
  }

  // Adds one section. `lines` are pre-rendered entries in display order.
  // Returns { added, omitted } so callers can log how much of the available
  // data actually made it into the context. Sections with no entries are
  // skipped entirely (no empty headers).
  addSection(title, lines) {
    const entries = (Array.isArray(lines) ? lines : [lines]).filter((line) => line != null);
    if (entries.length === 0) {
      return { added: 0, omitted: 0 };
    }

    const header = `## ${title}`;
    if (this.remaining < header.length + 2) {
      // Not even the header fits — record the omission, add nothing.
      this.sections.push({ title, lines: [], omitted: entries.length });
      this._rendered = null;
      return { added: 0, omitted: entries.length };
    }
    this.used += header.length + 2;

    const kept = [];
    let omitted = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const line = String(entries[index]);
      const moreEntriesRemain = index < entries.length - 1;
      const reserve = moreEntriesRemain ? TRUNCATION_NOTE_RESERVE : 0;
      if (line.length + 1 + reserve > this.remaining) {
        omitted = entries.length - index;
        break;
      }
      this.used += line.length + 1;
      kept.push(line);
    }

    if (omitted > 0) {
      const noun = omitted === 1 ? 'entry' : 'entries';
      const note = `... ${omitted} more ${noun} omitted (context budget)`;
      if (note.length + 1 <= this.remaining) {
        this.used += note.length + 1;
        kept.push(note);
      }
    }

    this.sections.push({ title, lines: kept, omitted });
    this._rendered = null;
    return { added: kept.length, omitted };
  }

  // The rendered context: "## Title" headers with one entry per line,
  // sections separated by blank lines. Sections that could not place a
  // single entry render nothing.
  render() {
    if (this._rendered === null) {
      const parts = [];
      for (const section of this.sections) {
        if (section.lines.length === 0) continue;
        parts.push([`## ${section.title}`, ...section.lines].join('\n'));
      }
      this._rendered = parts.join('\n\n');
    }
    return this._rendered;
  }

  // Structured summary for logging/debugging: which sections made it, how
  // many entries each placed, and whether anything was cut.
  toJSON() {
    const text = this.render();
    return {
      totalChars: text.length,
      estimatedTokens: ContextBudget.estimateTokens(text),
      truncated: this.sections.some((section) => section.omitted > 0),
      sections: this.sections.map((section) => ({
        title: section.title,
        lineCount: section.lines.length,
        omitted: section.omitted,
      })),
    };
  }
}

module.exports = { ContextBudget, CHARS_PER_TOKEN };
