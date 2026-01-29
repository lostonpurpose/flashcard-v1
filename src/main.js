import 'dotenv/config';
import { Pool } from 'pg';

const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelToken) {
  throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN env var');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Fetch all user IDs and DB IDs from the database
const { rows: users } = await pool.query('SELECT id, line_user_id FROM users');
if (!users.length) {
  console.log('No users found in the database.');
  process.exit(0);
}

let successCount = 0;
for (const user of users) {
  const userId = user.line_user_id;
  const dbUserId = user.id;

  // 1. Get all due cards for the user
  const { rows: dueCards } = await pool.query(
    `SELECT * FROM cards
     WHERE user_id = $1 AND introduced = TRUE AND (next_review IS NULL OR next_review <= NOW())`,
    [dbUserId]
  );

  if (!dueCards.length) {
    console.log(`No due cards for ${userId}`);
    continue;
  }

  // 2. Find the minimum frequency among due cards
  const minFreq = Math.min(...dueCards.map(card => card.frequency));

  // 3. Filter cards with that minimum frequency
  const minFreqCards = dueCards.filter(card => card.frequency === minFreq);

  // 4. Pick one at random
  const dueCard = minFreqCards[Math.floor(Math.random() * minFreqCards.length)];

  // 3. Send quiz message (kanji only)
  const message = `${dueCard.card_front} = ?`;

  // Update last_kanji_sent to the kanji
  try {
    await pool.query(
      'UPDATE users SET last_kanji_sent = $1 WHERE id = $2',
      [dueCard.card_front, dbUserId]
    );
    console.log(`Updated last_kanji_sent for ${userId} to ${dueCard.card_front}`);
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