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

  // 1. Check if user has any introduced cards
  const { rows: introducedCards } = await pool.query(
    `SELECT * FROM cards
     WHERE user_id = $1 AND introduced = TRUE
     ORDER BY next_review ASC NULLS FIRST, id ASC`,
    [dbUserId]
  );

  if (!introducedCards.length) {
    // Introduce first 5 cards from master_cards
    const { rows: firstFive } = await pool.query(
      `SELECT card_front, card_back FROM master_cards
       WHERE difficulty = $1
       ORDER BY id ASC LIMIT 5`,
      ['easy']
    );
    for (const card of firstFive) {
      await pool.query(
        `INSERT INTO cards (user_id, card_front, card_back, introduced, next_review)
         VALUES ($1, $2, $3, TRUE, NOW()) ON CONFLICT DO NOTHING`,
        [dbUserId, card.card_front, card.card_back]
      );
      // Send study message (kanji + meaning)
      const studyPayload = {
        to: userId,
        messages: [{ type: 'text', text: `Study: ${card.card_front} = ${card.card_back}` }]
      };
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${channelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(studyPayload),
      });
    }
    console.log(`Introduced first 5 cards to ${userId}`);
    continue; // Don't send a quiz message this cycle
  }

  // 2. Find the next due card (introduced, due for review)
  const dueCard = introducedCards.find(
    c => !c.next_review || new Date(c.next_review) <= new Date()
  );
  if (!dueCard) {
    console.log(`No due cards for ${userId}`);
    continue;
  }

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