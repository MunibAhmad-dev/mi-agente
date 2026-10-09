'use strict';

/**
 * Smoke check: verify every api/models/ file can be required.
 * No MongoDB connection needed — Mongoose registers schemas at require-time.
 * Run: node scripts/smoke-models.js
 * Exit 0 = all models load. Exit 1 = missing file or syntax error.
 */

const path = require('path');
const modelsDir = path.resolve(__dirname, '../api/models');
const { readdirSync } = require('fs');

const files = readdirSync(modelsDir).filter((f) => f.endsWith('.js'));

let failed = false;

for (const file of files) {
  const full = path.join(modelsDir, file);
  try {
    require(full);
    console.log(`  ✓  ${file}`);
  } catch (err) {
    console.error(`  ✗  ${file} — ${err.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nSmoke check FAILED — fix the errors above before deploying.');
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} model(s) loaded successfully.`);
}
