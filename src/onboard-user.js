import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function onboardUser(lineUserId, difficulty = 'easy') {
  // Get user id
  const { rows: userRows } = await pool.query(
    'SELECT id FROM users WHERE line_user_id = $1',
    [lineUserId]
  );
  if (!userRows.length) throw new Error('User not found');
  const userId = userRows[0].id;

  // Get first 5 master cards by id
  const { rows: cardRows } = await pool.query(
    'SELECT card_front, card_back FROM master_cards WHERE difficulty = $1 ORDER BY id ASC LIMIT 5',
    [difficulty]
  );

  // Insert into cards table for this user
  for (const card of cardRows) {
    await pool.query(
      `INSERT INTO cards (user_id, card_front, card_back, introduced, next_review)
       VALUES ($1, $2, $3, TRUE, NOW()) ON CONFLICT DO NOTHING`,
      [userId, card.card_front, card.card_back]
    );
  }

  // Send study message (kanji + meaning) for each card
  for (const card of cardRows) {
    // Replace this with your actual message sending logic
    console.log(`Study: ${card.card_front} = ${card.card_back}`);
  }
}