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

// check if most recent batch has been mastered

export async function checkAndIntroduceNextBatch(userId, sendStudyMessage) {
  // 1. Get all cards for user, ordered by id
  const { rows: userCards } = await pool.query(
    'SELECT * FROM cards WHERE user_id = $1 ORDER BY id ASC',
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
    // 5. Get next 5 master_cards not yet assigned to user
    const { rows: nextCards } = await pool.query(
      `SELECT card_front, card_back FROM master_cards
       WHERE card_front NOT IN (
         SELECT card_front FROM cards WHERE user_id = $1
       )
       ORDER BY id ASC LIMIT 5`,
      [userId]
    );

    // 6. Insert new cards and send study messages
    for (const card of nextCards) {
      await pool.query(
        `INSERT INTO cards (user_id, card_front, card_back, introduced, next_review)
         VALUES ($1, $2, $3, TRUE, NOW())`,
        [userId, card.card_front, card.card_back]
      );
      // Send study message (implement sendStudyMessage to push to LINE)
      if (sendStudyMessage) {
        await sendStudyMessage(userId, card.card_front, card.card_back);
      }
    }
    return true; // Next batch introduced
  }
  return false; // Not ready for next batch
}