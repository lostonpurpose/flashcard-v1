import fs from 'fs';
import { Pool } from 'pg';

const [,, jsonFile, difficulty] = process.argv;

if (!jsonFile || !difficulty) {
  console.error('Usage: node import-kanji.js <jsonFile> <difficulty>');
  process.exit(1);
}

const kanji = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  for (const [kanjiChar, data] of Object.entries(kanji)) {
    // Extract meanings array from the new structure { meanings: [...], readings: [...] }
    let meaningsArray;
    if (typeof data === 'object' && data.meanings && Array.isArray(data.meanings)) {
      meaningsArray = data.meanings;
    } else if (Array.isArray(data)) {
      meaningsArray = data;
    } else {
      meaningsArray = [data];
    }
    
    const meaningsJson = JSON.stringify(meaningsArray);
    
    await pool.query(
      'INSERT INTO master_cards (card_front, card_back, difficulty) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [kanjiChar, meaningsJson, difficulty]
    );
  }
  await pool.end();
  console.log('Import complete');
})();