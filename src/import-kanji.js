import fs from 'fs';
import { Pool } from 'pg';

// Get command-line arguments: [node, script, jsonFile, difficulty]
const [,, jsonFile, difficulty] = process.argv;

// Check for required arguments
if (!jsonFile || !difficulty) {
  console.error('Usage: node import-kanji.js <jsonFile> <difficulty>');
  process.exit(1);
}

// Read and parse the JSON file containing kanji cards
const kanji = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

// Create a connection pool to the Postgres database
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // For each kanji card, insert into master_cards with the given difficulty
  for (const [kanjiChar, english] of Object.entries(kanji)) {
    await pool.query(
      // Use ON CONFLICT DO NOTHING to avoid duplicate entries (thanks to UNIQUE constraint)
      'INSERT INTO master_cards (card_front, card_back, difficulty) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [kanjiChar, english, difficulty]
    );
  }
  // Close the database connection pool
  await pool.end();
  console.log('Import complete');
})();