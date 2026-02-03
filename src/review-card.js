import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct) {
  // Get current score + streaks
  const { rows } = await pool.query(
    'SELECT score, correct_streak, incorrect_streak FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  if (!rows.length) throw new Error('Card not found');
  let score = Number(rows[0].score);
  const correctStreak = Number(rows[0].correct_streak || 0);
  const incorrectStreak = Number(rows[0].incorrect_streak || 0);

  const streakDelta = (streak) => 5 + 3 * ((streak - 1) * streak) / 2;

  let newScore;

  if (correct) {
    const newCorrectStreak = correctStreak + 1;
    const delta = streakDelta(newCorrectStreak);
    newScore = score + delta;
  } else {
    const newIncorrectStreak = incorrectStreak + 1;
    const delta = streakDelta(newIncorrectStreak);
    newScore = Math.max(score - delta, 5);
  }

  await pool.query(
    `UPDATE cards SET
      score = $1,
      correct_count = correct_count + $2,
      incorrect_count = incorrect_count + $3,
      correct_streak = CASE WHEN $6 THEN correct_streak + 1 ELSE 0 END,
      incorrect_streak = CASE WHEN $6 THEN 0 ELSE incorrect_streak + 1 END
     WHERE id = $4 AND user_id = $5`,
    [newScore, correct ? 1 : 0, correct ? 0 : 1, cardId, userId, correct]
  );
}