import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct) {
  // Get current frequency
  const { rows } = await pool.query(
    'SELECT frequency FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  if (!rows.length) throw new Error('Card not found');
  let frequency = Number(rows[0].frequency);

  // Adjust frequency
  if (correct) {
    frequency = Math.min(frequency * 2, 1440); // max 1 day
    const freqStr = String(frequency);
    await pool.query(
      `UPDATE cards SET
        correct_count = correct_count + 1,
        frequency = $1,
        next_review = NOW() + (($2 || ' minutes')::interval)
       WHERE id = $3 AND user_id = $4`,
      [frequency, freqStr, cardId, userId]
    );
  } else {
    const MIN_FREQUENCY = 2; // Set your minimum here
    if (Math.floor(frequency / 2) >= MIN_FREQUENCY) {
      frequency = Math.floor(frequency / 2);
    }
    // else, frequency stays the same
    const freqStr = String(frequency);
    await pool.query(
      `UPDATE cards SET
        incorrect_count = incorrect_count + 1,
        frequency = $1,
        next_review = NOW() + (($2 || ' minutes')::interval)
       WHERE id = $3 AND user_id = $4`,
      [frequency, freqStr, cardId, userId]
    );
  }
}