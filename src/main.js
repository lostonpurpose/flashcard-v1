import 'dotenv/config';
import { Pool } from 'pg';

const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!channelToken) {
  throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN env var');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const { rows: users } = await pool.query('SELECT id, line_user_id FROM users');
if (!users.length) {
  console.log('No users found in the database.');
  process.exit(0);
}

let successCount = 0;
for (const user of users) {
  const userId = user.line_user_id;
  const dbUserId = user.id;

  // Get next card: prioritize unseen (correct_count = 0), then by lowest score
  const { rows: cards } = await pool.query(
    `SELECT * FROM cards
     WHERE user_id = $1 AND introduced = TRUE
     ORDER BY CASE WHEN correct_count = 0 THEN 0 ELSE 1 END ASC, score ASC
     LIMIT 1`,
    [dbUserId]
  );

  if (!cards.length) {
    console.log(`No cards for ${userId}`);
    continue;
  }

  const card = cards[0];
  const message = `${card.card_front} = ?`;

  try {
    await pool.query(
      'UPDATE users SET last_kanji_sent = $1 WHERE id = $2',
      [card.card_front, dbUserId]
    );
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