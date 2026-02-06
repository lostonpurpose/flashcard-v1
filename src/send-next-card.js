import { Pool } from 'pg';
import fetch from 'node-fetch';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export async function sendNextCard(userId, lineUserId) {
  // Get the next card due for review
  const { rows } = await pool.query(
    `SELECT c.* FROM cards c
     WHERE c.user_id = $1 AND c.introduced = TRUE
     ORDER BY CASE WHEN (c.correct_count + c.incorrect_count) = 0 THEN 0 ELSE 1 END ASC,
              c.score ASC
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return false; // No cards due
  }

  const card = rows[0];

  // Parse meanings + readings
  let allMeanings;
  let allReadings;
  try { allMeanings = JSON.parse(card.card_back); } catch { allMeanings = [card.card_back]; }
  try { allReadings = JSON.parse(card.readings || '[]'); } catch { allReadings = []; }

  // Init meanings if missing
  const meaningStatsRes = await pool.query(
    `SELECT meaning, correct_count FROM card_meanings WHERE card_id = $1 ORDER BY correct_count ASC`,
    [card.id]
  );
  if (meaningStatsRes.rows.length === 0) {
    for (const meaning of allMeanings) {
      await pool.query(
        `INSERT INTO card_meanings (card_id, meaning) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [card.id, meaning]
      );
    }
  }

  const meaningStats = meaningStatsRes.rows.length
    ? meaningStatsRes.rows
    : allMeanings.map(m => ({ meaning: m, correct_count: 0 }));

  const meaningsComplete = meaningStats.every(m => m.correct_count >= 1);

  let promptText;
  let promptType = 'meaning';

  if (!meaningsComplete || allReadings.length === 0) {
    const maxCount = Math.max(...meaningStats.map(m => m.correct_count));
    const laggingMeanings = meaningStats.filter(m => maxCount - m.correct_count >= 3);

    if (laggingMeanings.length > 0) {
      const knownMeanings = meaningStats
        .filter(m => !laggingMeanings.find(lm => lm.meaning === m.meaning))
        .map(m => m.meaning);

      promptText = knownMeanings.length > 0
        ? `${card.card_front} means ${knownMeanings.join(', ')}, and ?`
        : card.card_front;
    } else {
      promptText = card.card_front;
    }
  } else {
    // Meanings done → quiz readings
    promptType = 'reading';

    const readingStatsRes = await pool.query(
      `SELECT reading, correct_count FROM card_readings WHERE card_id = $1 ORDER BY correct_count ASC`,
      [card.id]
    );
    if (readingStatsRes.rows.length === 0) {
      for (const reading of allReadings) {
        await pool.query(
          `INSERT INTO card_readings (card_id, reading) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [card.id, reading]
        );
      }
    }

    const readingStats = readingStatsRes.rows.length
      ? readingStatsRes.rows
      : allReadings.map(r => ({ reading: r, correct_count: 0 }));

    const maxCount = Math.max(...readingStats.map(r => r.correct_count));
    const laggingReadings = readingStats.filter(r => maxCount - r.correct_count >= 3);

    if (laggingReadings.length > 0) {
      const knownReadings = readingStats
        .filter(r => !laggingReadings.find(lr => lr.reading === r.reading))
        .map(r => r.reading);

      promptText = knownReadings.length > 0
        ? `${card.card_front} is read ${knownReadings.join(', ')}, and ?`
        : card.card_front;
    } else {
      promptText = card.card_front;
    }
  }

  await pool.query(
    'UPDATE users SET last_kanji_sent = $1, last_prompt_type = $2 WHERE id = $3',
    [card.card_front, promptType, userId]
  );

  const payload = {
    to: lineUserId,
    messages: [{ type: 'text', text: promptText }]
  };
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${channelToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  return true;
}