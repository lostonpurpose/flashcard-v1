import 'dotenv/config';
import { Pool } from 'pg';

const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelToken) {
  throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN env var');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Fetch a random card from the database (e.g., easy deck)
const { rows: cardRows } = await pool.query(
  "SELECT card_front, card_back FROM master_cards WHERE difficulty = $1 ORDER BY RANDOM() LIMIT 1",
  ['easy']
);

if (!cardRows.length) {
  console.log('No cards found in the database.');
  process.exit(0);
}

const randomCard = cardRows[0];
// message with kanji only (card_front is kanji, card_back is English)
const message = `${randomCard.card_front} = ?`;

// Fetch all user IDs from the database
const { rows } = await pool.query('SELECT line_user_id FROM users');
if (!rows.length) {
  console.log('No users found in the database.');
  process.exit(0);
}

let successCount = 0;
for (const row of rows) {
  const userId = row.line_user_id;
  // Update last_kanji_sent to the card_front (kanji)
  try {
    await pool.query(
      'UPDATE users SET last_kanji_sent = $1 WHERE line_user_id = $2',
      [randomCard.card_front, userId]
    );
    console.log(`Updated last_kanji_sent for ${userId} to ${randomCard.card_front}`);
  } catch (err) {
    console.error(`Failed to update last_kanji_sent for ${userId}:`, err);
    continue;
  }
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

await pool.end();
