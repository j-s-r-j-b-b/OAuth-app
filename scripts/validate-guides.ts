/**
 * Validate guide JSON files against the schema plus cross-field lint rules.
 *   npm run validate                      # all files in data/library
 *   npm run validate -- path/to/guide.json
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Guide, lintGuide } from '../shared/schema.ts';

const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync('data/library')
      .filter((f) => f.endsWith('.json'))
      .map((f) => join('data/library', f));

let failed = 0;
for (const file of files) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`✗ ${file}: invalid JSON — ${(e as Error).message}`);
    failed++;
    continue;
  }
  const parsed = Guide.safeParse(raw);
  if (!parsed.success) {
    console.log(`✗ ${file}: schema errors`);
    for (const issue of parsed.error.issues.slice(0, 40)) {
      console.log(`   - ${issue.path.join('.')}: ${issue.message}`);
    }
    failed++;
    continue;
  }
  const problems = lintGuide(parsed.data);
  if (problems.length) {
    console.log(`✗ ${file}: ${problems.length} lint problem(s)`);
    for (const p of problems.slice(0, 40)) console.log(`   - ${p}`);
    failed++;
    continue;
  }
  const g = parsed.data;
  const steps = g.phases.reduce((n, p) => n + p.steps.length, 0);
  console.log(
    `✓ ${file}: ${g.app.name} — ${g.verdict.difficulty}, ${steps} steps, ${g.evidence.sources.length} sources, ${g.evidence.probes.length} probes`,
  );
}
process.exit(failed ? 1 : 0);
