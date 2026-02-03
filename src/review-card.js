import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct) {
  // Get current score
  const { rows } = await pool.query(
    'SELECT score FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  if (!rows.length) throw new Error('Card not found');
  let score = Number(rows[0].score);

  // Adjust score
  let newScore;
  if (correct) {
    newScore = score + 5;
  } else {
    // Penalty scales by distance from baseline (50)
    if (score <= 75) {
      newScore = Math.max(score - 5, 5);
    } else if (score <= 100) {
      newScore = Math.max(score - 25, 5);
    } else {
      newScore = Math.max(score - 50, 5);
    }
  }

  await pool.query(
    `UPDATE cards SET
      score = $1,
      correct_count = correct_count + $2,
      incorrect_count = incorrect_count + $3
     WHERE id = $4 AND user_id = $5`,
    [newScore, correct ? 1 : 0, correct ? 0 : 1, cardId, userId]
  );
}