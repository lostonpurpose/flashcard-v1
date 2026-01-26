import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function introduceNextBatch(userId, difficulty = 'easy', batchSize = 5) {
  // Check if all introduced cards have correct_count >= 1
  const { rows: notReady } = await pool.query(
    `SELECT 1 FROM cards WHERE user_id = $1 AND introduced = TRUE AND correct_count < 1 LIMIT 1`,
    [userId]
  );
  if (notReady.length) return false; // Not ready for next batch

  // Get next batch from master_cards not yet in cards
  const { rows: nextCards } = await pool.query(
    `SELECT mc.card_front, mc.card_back FROM master_cards mc
     WHERE mc.difficulty = $1
     AND NOT EXISTS (
       SELECT 1 FROM cards c WHERE c.user_id = $2 AND c.card_front = mc.card_front
     )
     ORDER BY mc.id ASC
     LIMIT $3`,
    [difficulty, userId, batchSize]
  );

  // Insert and introduce
  for (const card of nextCards) {
    await pool.query(
      `INSERT INTO cards (user_id, card_front, card_back, introduced, next_review)
       VALUES ($1, $2, $3, TRUE, NOW()) ON CONFLICT DO NOTHING`,
      [userId, card.card_front, card.card_back]
    );
    // Send study message (kanji + meaning)
    console.log(`Study: ${card.card_front} = ${card.card_back}`);
  }
  return true;
}