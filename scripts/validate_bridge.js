const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../dist');
const stats = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'stats.json'), 'utf8'));
const jsonlPath = path.join(DIST_DIR, 'bangla_hindi_bridge_rich.jsonl');
const tsvPath = path.join(DIST_DIR, 'bangla_hindi_cognate_pairs.tsv');
const manifestPath = path.join(DIST_DIR, 'chunks/manifest.json');

let errors = 0;
const seenPairs = new Set();
const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n');

if (lines.length !== stats.rich_bilingual_pairs) {
  console.error(`❌ Stats mismatch: stats=${stats.rich_bilingual_pairs}, lines=${lines.length}`);
  errors++;
}

for (let i = 0; i < lines.length; i++) {
  const entry = JSON.parse(lines[i]);
  if (!entry.id || !/^bn-hi-\d{6}$/.test(entry.id)) {
    console.error(`❌ Invalid ID at line ${i + 1}: ${entry.id}`);
    errors++;
  }
  if (!entry.bn || !entry.hi) {
    console.error(`❌ Missing bn/hi word at line ${i + 1}`);
    errors++;
  }
  const key = `${entry.bn}|${entry.hi}`;
  if (seenPairs.has(key)) {
    console.error(`❌ Duplicate pair at line ${i + 1}: ${key}`);
    errors++;
  }
  seenPairs.add(key);
}

const tsvLines = fs.readFileSync(tsvPath, 'utf8').trim().split('\n').slice(1);
if (tsvLines.length !== stats.total_parallel_cognates) {
  console.error(`❌ Cognate TSV mismatch: stats=${stats.total_parallel_cognates}, lines=${tsvLines.length}`);
  errors++;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const m of manifest) {
  if (!fs.existsSync(path.join(DIST_DIR, 'chunks', m.file))) {
    console.error(`❌ Missing chunk: ${m.file}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`❌ Bridge validation failed with ${errors} errors.`);
  process.exit(1);
}
console.log(`✅ Validation Passed! ${lines.length} rich pairs, ${tsvLines.length} parallel cognates, ${manifest.length} chunks verified.`);
