/**
 * Open Lexicon Foundation — Bangla <-> Hindi <-> English Bilingual Bridge Builder
 * Discovers verified Tatsama/Sanskrit & Perso-Arabic cognates via Devanagari-to-Bengali
 * phonological/nasal-assimilation transliteration across 495k Bangla x 411k Hindi words.
 */
const fs = require('fs');
const path = require('path');

const BN_DIST = path.resolve(__dirname, '../../Bangla-Lexicon-Mega-Archive/dist');
const HI_DIST = path.resolve(__dirname, '../../Hindi-Lexicon-Mega-Archive/dist');
const DIST_DIR = path.resolve(__dirname, '../dist');
const CHUNKS_DIR = path.join(DIST_DIR, 'chunks');

fs.mkdirSync(CHUNKS_DIR, { recursive: true });

console.log('1. Loading Bangla & Hindi verified lexicons...');
const bnRich = fs.readFileSync(path.join(BN_DIST, 'bangla_lexicon_rich.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));
const bnRichMap = new Map(bnRich.map(e => [e.word, e]));
const bnWordSet = new Set(
  fs.readFileSync(path.join(BN_DIST, 'bangla_wordlist_verified.txt'), 'utf8').trim().split('\n')
);

const hiRich = [
  ...fs.readFileSync(path.join(HI_DIST, 'hindi_lexicon_rich_part1.jsonl'), 'utf8').trim().split('\n'),
  ...fs.readFileSync(path.join(HI_DIST, 'hindi_lexicon_rich_part2.jsonl'), 'utf8').trim().split('\n')
].map(l => JSON.parse(l));
const hiRichMap = new Map(hiRich.map(e => [e.word, e]));
const hiWordList = fs.readFileSync(path.join(HI_DIST, 'hindi_wordlist_verified.txt'), 'utf8').trim().split('\n');

// Devanagari -> Canonical Bengali orthographic variants (with nasal assimilation)
function devaToBengaliCandidates(hiWord) {
  // First normalize nukta consonants to base Indic equivalents for Perso-Arabic/common loans
  const cleanHi = hiWord
    .replace(/\u0958/g, '\u0915') // क़ -> क
    .replace(/\u0959/g, '\u0916') // ख़ -> ख
    .replace(/\u095A/g, '\u0917') // ग़ -> ग
    .replace(/\u095B/g, '\u091C') // ज़ -> ज
    .replace(/\u095E/g, '\u092B') // फ़ -> फ
    .replace(/\u095F/g, '\u092F'); // य़ -> य

  const chars = Array.from(cleanHi);
  let direct = '';
  let assimilated = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0);
    const nextCp = i + 1 < chars.length ? chars[i + 1].codePointAt(0) : 0;

    if (cp === 0x0902) {
      // Anusvara (ं)
      direct += '\u0982';
      if (nextCp >= 0x0915 && nextCp <= 0x0918) assimilated += '\u0999\u09CD';      // velar -> ঙ্
      else if (nextCp >= 0x091A && nextCp <= 0x091D) assimilated += '\u099E\u09CD'; // palatal -> ঞ্
      else if (nextCp >= 0x091F && nextCp <= 0x0923) assimilated += '\u09A3\u09CD'; // retroflex -> ণ্
      else if (nextCp >= 0x0924 && nextCp <= 0x0928) assimilated += '\u09A8\u09CD'; // dental -> ন্
      else if (nextCp >= 0x092A && nextCp <= 0x092E) assimilated += '\u09AE\u09CD'; // labial -> ম্
      else assimilated += '\u0982';
      continue;
    }

    const mapChar = (c, code) => {
      if (code === 0x0935) return '\u09AC'; // व -> ব
      if (code === 0x095C) return '\u09DC'; // ड़ -> ড়
      if (code === 0x095D) return '\u09DD'; // ढ़ -> ঢ়
      if (code >= 0x0901 && code <= 0x094D) return String.fromCodePoint(code + 0x80);
      return c;
    };

    const mapped = mapChar(ch, cp);
    direct += mapped;
    assimilated += mapped;
  }

  const candidates = new Set([assimilated, direct]);
  // Generate য <-> য় non-initial variant (e.g. নিয়ম, সময়, অরণ্য)
  for (const base of Array.from(candidates)) {
    if (base.length > 1 && base.includes('\u09AF')) {
      // Only replace standalone য preceded by vowel/matra/anusvara or vowel-inherent consonant (not virama ্)
      const replaced = base[0] + base.slice(1).replace(/([^\u09CD])\u09AF/g, '$1\u09DF');
      candidates.add(replaced);
    }
  }
  return Array.from(candidates);
}

console.log('2. Discovering Bilingual Rich Pairs (Tier 1)...');
const richPairs = [];
const seenRichKey = new Set();
let bothRichCount = 0;

for (const h of hiRich) {
  const candidates = devaToBengaliCandidates(h.word);
  let matchedBn = '';
  let bnEntry = null;

  for (const cand of candidates) {
    if (bnRichMap.has(cand)) {
      matchedBn = cand;
      bnEntry = bnRichMap.get(cand);
      break;
    }
  }
  if (!matchedBn) {
    for (const cand of candidates) {
      if (bnWordSet.has(cand)) {
        matchedBn = cand;
        break;
      }
    }
  }

  if (matchedBn && !seenRichKey.has(`${matchedBn}|${h.word}`)) {
    seenRichKey.add(`${matchedBn}|${h.word}`);
    if (bnEntry) bothRichCount++;

    richPairs.push({
      id: `bn-hi-${String(richPairs.length + 1).padStart(6, '0')}`,
      bn: matchedBn,
      hi: h.word,
      pos: Array.from(new Set([...(bnEntry ? bnEntry.pos : []), ...h.pos])),
      romanised: bnEntry ? bnEntry.romanised : [],
      en: bnEntry ? bnEntry.en : [],
      hi_def: h.def.slice(0, 2),
      bn_synonyms: bnEntry ? bnEntry.synonyms.slice(0, 5) : [],
      hi_synonyms: h.synonyms.slice(0, 5),
      hi_antonyms: h.antonyms.slice(0, 4),
      examples: h.examples.slice(0, 1),
      match_tier: bnEntry ? 'rich-both' : 'rich-wordnet'
    });
  }
}

console.log(`→ Tier 1 Bilingual Rich Pairs: ${richPairs.length} (Both Rich: ${bothRichCount})`);

console.log('3. Discovering Full Corpus Cognate Pairs (495k Bangla x 411k Hindi)...');
const allCognates = [];
const seenCognate = new Set();

for (const hw of hiWordList) {
  const candidates = devaToBengaliCandidates(hw);
  for (const cand of candidates) {
    if (bnWordSet.has(cand)) {
      const key = `${cand}\t${hw}`;
      if (!seenCognate.has(key)) {
        seenCognate.add(key);
        allCognates.push({ bn: cand, hi: hw });
      }
      break;
    }
  }
}

console.log(`→ Total Verified Bangla <-> Hindi Parallel Cognates: ${allCognates.length}`);

// Sort Rich Pairs by Bangla word
richPairs.sort((a, b) => a.bn.localeCompare(b.bn, 'bn'));
richPairs.forEach((p, i) => { p.id = `bn-hi-${String(i + 1).padStart(6, '0')}`; });

// Export 1: Rich JSONL & JSON
fs.writeFileSync(
  path.join(DIST_DIR, 'bangla_hindi_bridge_rich.jsonl'),
  richPairs.map(e => JSON.stringify(e)).join('\n') + '\n',
  'utf8'
);
fs.writeFileSync(
  path.join(DIST_DIR, 'bangla_hindi_bridge_rich.json'),
  JSON.stringify(richPairs),
  'utf8'
);

// Export 2: Rich CSV
const csvEsc = v => `"${String(v).replace(/"/g, '""')}"`;
const csvLines = ['id,bangla,hindi,pos,romanised,english,hindi_definition,hindi_synonyms'];
for (const p of richPairs) {
  csvLines.push([
    p.id, p.bn, p.hi, p.pos.join('; '), p.romanised.join('; '),
    p.en.join('; '), p.hi_def.join(' | '), p.hi_synonyms.join('; ')
  ].map(csvEsc).join(','));
}
fs.writeFileSync(path.join(DIST_DIR, 'bangla_hindi_bridge_core.csv'), '\uFEFF' + csvLines.join('\n') + '\n', 'utf8');

// Export 3: Full Parallel Cognates TSV
allCognates.sort((a, b) => a.bn.localeCompare(b.bn, 'bn'));
fs.writeFileSync(
  path.join(DIST_DIR, 'bangla_hindi_cognate_pairs.tsv'),
  'bangla\thindi\n' + allCognates.map(c => `${c.bn}\t${c.hi}`).join('\n') + '\n',
  'utf8'
);

// Export 4: Alphabetical Web Chunks
const buckets = new Map();
for (const p of richPairs) {
  const firstChar = Array.from(p.bn)[0] || 'other';
  const code = firstChar.codePointAt(0).toString(16);
  if (!buckets.has(code)) buckets.set(code, { char: firstChar, items: [] });
  buckets.get(code).items.push(p);
}
const manifest = [];
for (const [code, bucket] of buckets.entries()) {
  const fname = `bridge_${code}.json`;
  fs.writeFileSync(path.join(CHUNKS_DIR, fname), JSON.stringify(bucket.items), 'utf8');
  manifest.push({ char: bucket.char, code, file: fname, count: bucket.items.length });
}
manifest.sort((a, b) => a.char.localeCompare(b.char, 'bn'));
fs.writeFileSync(path.join(CHUNKS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

// Export 5: Stats
const stats = {
  title: 'Bangla <-> Hindi <-> English Bilingual Bridge',
  rich_bilingual_pairs: richPairs.length,
  both_rich_verified: bothRichCount,
  with_english_meanings: richPairs.filter(p => p.en.length > 0).length,
  with_hindi_definitions: richPairs.filter(p => p.hi_def.length > 0).length,
  total_parallel_cognates: allCognates.length,
  chunk_files: manifest.length,
  license: 'GPL-3.0',
  generated_at: new Date().toISOString()
};
fs.writeFileSync(path.join(DIST_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');
console.log('✅ Bilingual Bridge Build Complete!', stats);
