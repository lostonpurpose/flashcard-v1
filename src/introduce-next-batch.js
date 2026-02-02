import { Pool } from 'pg';
import fetch from 'node-fetch';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export async function introduceNextBatch(userId, lineUserId, difficulty = 'easy') {
  // 1. Get all cards for user, ordered by id
  const { rows: userCards } = await pool.query(
    'SELECT c.* FROM cards c JOIN master_cards mc ON c.card_front = mc.card_front WHERE c.user_id = $1 ORDER BY c.id ASC',
    [userId]
  );

  // 2. Split into batches of 5
  const batches = [];
  for (let i = 0; i < userCards.length; i += 5) {
    batches.push(userCards.slice(i, i + 5));
  }

  // 3. Find the latest batch (the last group of 5)
  const currentBatch = batches[batches.length - 1];

  // 4. Check if current batch is mastered
  const mastered = currentBatch.length === 5 && currentBatch.every(card => card.correct_count >= 1);

  if (mastered) {
    // 5. Get next 5 master_cards not yet assigned to user, filtered by difficulty
    const { rows: nextCards } = await pool.query(
      `SELECT card_front, card_back FROM master_cards
       WHERE difficulty = $2
       AND card_front NOT IN (
         SELECT card_front FROM cards WHERE user_id = $1
       )
       ORDER BY id ASC LIMIT 5`,
      [userId, difficulty]
    );


    // Send message telling them about next 5 kanji
    const nextBatchUnlocked = {
      to: lineUserId,
      messages: [
        { type: 'text', text: "Nice work! You're on to the next 5 cards. Here they are:" }
      ]
    };
      await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${channelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nextBatchUnlocked),
    });



    // 6. Insert new cards and send study messages
    for (const card of nextCards) {
      const insertResult = await pool.query(
        `INSERT INTO cards (user_id, card_front, card_back, introduced, next_review)
         VALUES ($1, $2, $3, TRUE, NOW())
         RETURNING id`,
        [userId, card.card_front, card.card_back]
      );
      
      const newCardId = insertResult.rows[0].id;
      
      // Initialize card_meanings for each meaning
      let meanings;
      try {
        meanings = JSON.parse(card.card_back);
      } catch {
        meanings = [card.card_back];
      }
      
      for (const meaning of meanings) {
        await pool.query(
          `INSERT INTO card_meanings (card_id, meaning) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newCardId, meaning]
        );
      }
      
      // Send next five flashcards to learn via LINE
      const meaningText = meanings.join(', ');
      const payload = {
        to: lineUserId,
        messages: [{ type: 'text', text: `${card.card_front} = ${meaningText}` }]
      };
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${channelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

// Send empty block so you don't accidentally see the teachings
  const emptyBlock = {
    to: lineUserId,
    messages: [
      { type: 'text', text: "\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nScroll up for the new words (this is so you don't accidentally see the meanings :))" }
    ]
  };
    await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${channelToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emptyBlock),
  });

    return true; // Next batch introduced
  }
  return false; // Not ready for next batch
}