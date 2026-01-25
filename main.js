
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import kanjiData from './kanji.json' assert { type: 'json' };
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pick a random key from the kanji JSON
const keys = Object.keys(kanjiData);
const randomKey = keys[Math.floor(Math.random() * keys.length)];

// Construct the message to send
// message with meaning (key) and kanji (value)
// const message = `${randomKey} → ${kanjiData[randomKey]}`;

// message with kanji only
const message = `${kanjiData[randomKey]} = ?`;



// Read from env vars
const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelToken) {
  throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN env var');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Fetch all user IDs from the database
const { rows } = await pool.query('SELECT line_user_id FROM users');
if (!rows.length) {
  console.log('No users found in the database.');
  process.exit(0);
}

let successCount = 0;
for (const row of rows) {
  const userId = row.line_user_id;
  const payload = {
    to: userId,
    messages: [{ type: 'text', text: message }]
  };

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${channelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`LINE push failed for user ${userId}`, res.status, errText);
  } else {
    console.log(`Sent to ${userId}:`, message);
    successCount++;
  }
}

console.log(`Done. Sent to ${successCount} user(s).`);

// Optional: persist edits to kanji.json
// kanjiData.test = 'added';
const jsonPath = join(__dirname, 'kanji.json');
writeFileSync(jsonPath, JSON.stringify(kanjiData, null, 2), 'utf8');

// app currently broken thanks to chatgpt.
// it thinks, but is likely wrong, that ngrok needs to be rerun and a new webhook set in line official
// it now suggests another free, permanent service, cloudfare tunnel. why we had to bother with ngrok mystifies me.
