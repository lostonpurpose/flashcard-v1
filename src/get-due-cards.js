import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getDueCards(userId, limit = 5) {
  const { rows } = await pool.query(
    `SELECT * FROM cards
     WHERE user_id = $1 AND introduced = TRUE AND (next_review IS NULL OR next_review <= NOW())
     ORDER BY next_review ASC NULLS FIRST, id ASC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}