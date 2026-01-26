import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct) {
  // Get current frequency
  const { rows } = await pool.query(
    'SELECT frequency FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  if (!rows.length) throw new Error('Card not found');
  let frequency = rows[0].frequency;

  // Adjust frequency
  if (correct) {
    frequency = Math.min(frequency * 2, 1440); // max 1 day
    await pool.query(
      `UPDATE cards SET
        correct_count = correct_count + 1,
        frequency = $1,
        next_review = NOW() + ($1 || ' minutes')::interval
       WHERE id = $2 AND user_id = $3`,
      [frequency, cardId, userId]
    );
  } else {
    frequency = Math.max(Math.floor(frequency / 2), 1); // min 1 min
    await pool.query(
      `UPDATE cards SET
        incorrect_count = incorrect_count + 1,
        frequency = $1,
        next_review = NOW() + ($1 || ' minutes')::interval
       WHERE id = $2 AND user_id = $3`,
      [frequency, cardId, userId]
    );
  }
}