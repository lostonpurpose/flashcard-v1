import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { checkMessage } from './kanji-check.js';
import { onboardUser } from './onboard-user.js';
import { reviewCard } from './review-card.js';
import { introduceNextBatch } from './introduce-next-batch.js';

const app = express();

// line token to allow messaging
const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use((req, res, next) => {
  console.log("Got request:", req.method, req.url);
  next();
});

app.use(express.json());

app.post('/webhook', async (req, res) => {
  console.log("Received event JSON:", req.body);

  if (req.body.events) {
    for (const event of req.body.events) {
      if (event.source && event.source.userId) {
        const lineUserId = event.source.userId;
        console.log("UserId:", lineUserId);

        // 1. Ensure user exists
        let userId;
        try {
          const result = await pool.query(
            'INSERT INTO users (line_user_id) VALUES ($1) ON CONFLICT (line_user_id) DO NOTHING RETURNING id',
            [lineUserId]
          );
          if (result.rowCount === 1) {
            console.log("Inserted new user", lineUserId);
            await onboardUser(lineUserId, 'easy'); // Onboard with first 5 cards
            // Optionally send a welcome message here -- message is in onboard file
          } else {
            console.log("User already exists", lineUserId);
          }
          // Get userId for later use
          const userRes = await pool.query('SELECT id FROM users WHERE line_user_id = $1', [lineUserId]);
          userId = userRes.rows[0].id;
        } catch (err) {
          console.error("Failed to insert user", err);
          continue;
        }

        // 2. Handle user message
        const userResponseObj = event;
        const userAnswer = userResponseObj.message?.text?.trim();
        if (!userAnswer) continue;

        // Check if user is creating a custom card or changing difficulty (format: "x = y")
        if (userAnswer.includes(' = ')) {
          const parts = userAnswer.split(' = ').map(s => s.trim());
          
          // Check if it's a difficulty change command
          if (parts[0].toLowerCase() === 'difficulty' && parts[1]) {
            const newDifficulty = parts[1].toLowerCase();
            if (['easy', 'medium', 'hard'].includes(newDifficulty)) {
              try {
                await pool.query('UPDATE users SET difficulty = $1 WHERE id = $2', [newDifficulty, userId]);
                await pool.query('DELETE FROM cards WHERE user_id = $1', [userId]);
                await onboardUser(lineUserId, newDifficulty);
                
                const payload = {
                  to: lineUserId,
                  messages: [{ type: 'text', text: `Difficulty changed to ${newDifficulty}. Your progress has been reset.` }]
                };
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${channelToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                continue;
              } catch (err) {
                console.error("Failed to change difficulty", err);
              }
            }
          } else {
            // Custom card creation
            const [cardFront, cardBack] = parts;
            if (cardFront && cardBack) {
              try {
                await pool.query(
                  `INSERT INTO cards (user_id, card_front, card_back, introduced, next_review) VALUES ($1, $2, $3, TRUE, NOW())`,
                  [userId, cardFront, cardBack]
                );
                
                const payload = {
                  to: lineUserId,
                  messages: [{ type: 'text', text: `Card created: ${cardFront} = ${cardBack}` }]
                };
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${channelToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                continue;
              } catch (err) {
                console.error("Failed to create custom card", err);
              }
            }
          }
        }

        // Check if user wants to delete a card (format: "x :: delete")
        if (userAnswer.includes(' :: delete')) {
          const cardFront = userAnswer.replace(' :: delete', '').trim();
          
          if (cardFront) {
            try {
              const deleteResult = await pool.query(
                'DELETE FROM cards WHERE user_id = $1 AND card_front = $2 RETURNING card_front, card_back',
                [userId, cardFront]
              );
              
              if (deleteResult.rowCount > 0) {
                const deletedCard = deleteResult.rows[0];
                const payload = {
                  to: lineUserId,
                  messages: [{ type: 'text', text: `Card deleted: ${deletedCard.card_front} = ${deletedCard.card_back}` }]
                };
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${channelToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
              } else {
                const payload = {
                  to: lineUserId,
                  messages: [{ type: 'text', text: `Card not found: ${cardFront}` }]
                };
                await fetch('https://api.line.me/v2/bot/message/push', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${channelToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
              }
              continue;
            } catch (err) {
              console.error("Failed to delete card", err);
            }
          }
        }

        // Skip webhook processing for 'help' - let LINE Manager auto-reply handle it
        if (userAnswer.toLowerCase() === 'help') {
          continue;
        }

        const userAnswerLower = userAnswer.toLowerCase();

        let cardId;
        try {
          const cardRes = await pool.query(
            'SELECT id FROM cards WHERE user_id = $1 AND card_front = (SELECT last_kanji_sent FROM users WHERE id = $1) LIMIT 1',
            [userId]
          );
          cardId = cardRes.rows[0]?.id;
        } catch (err) {
          console.error("Failed to get card id", err);
        }

        // 3. Check answer and update review stats
        if (cardId) {
          let checkResult = null;
          try {
            checkResult = await checkMessage(userAnswerLower, userId);
          } catch (err) {
            console.error("checkMessage failed:", err);
          }

          // Fetch last kanji sent and its meanings from cards table
          const lastKanjiRes = await pool.query(
            'SELECT c.id, c.card_front, c.card_back, c.readings, u.last_prompt_type FROM cards c JOIN users u ON u.id = c.user_id WHERE u.id = $1 AND c.card_front = u.last_kanji_sent LIMIT 1',
            [userId]
          );
          const lastKanji = lastKanjiRes.rows[0]?.card_front;
          const cardBack = lastKanjiRes.rows[0]?.card_back;
          const cardReadings = lastKanjiRes.rows[0]?.readings;
          const lastPromptType = lastKanjiRes.rows[0]?.last_prompt_type || 'meaning';
          const cardIdFromQuery = lastKanjiRes.rows[0]?.id;

          let allValues;
          const raw = lastPromptType === 'reading' ? cardReadings : cardBack;
          try { allValues = JSON.parse(raw); } catch { allValues = [raw]; }

          // Build and send feedback message if right/wrong
          let feedbackText;
          const correct = checkResult !== null;

          if (correct) {
            const matchedValue = checkResult.matchedValue;

            if (lastPromptType === 'reading') {
              await pool.query(
                `INSERT INTO card_readings (card_id, reading, correct_count, last_tested)
                 VALUES ($1, $2, 1, NOW())
                 ON CONFLICT (card_id, reading)
                 DO UPDATE SET correct_count = card_readings.correct_count + 1, last_tested = NOW()`,
                [cardIdFromQuery, matchedValue]
              );
              feedbackText = `Correct! ${lastKanji} is read ${allValues.join(', ')}`;
            } else {
              await pool.query(
                `INSERT INTO card_meanings (card_id, meaning, correct_count, last_tested)
                 VALUES ($1, $2, 1, NOW())
                 ON CONFLICT (card_id, meaning)
                 DO UPDATE SET correct_count = card_meanings.correct_count + 1, last_tested = NOW()`,
                [cardIdFromQuery, matchedValue]
              );
              feedbackText = `Correct! ${lastKanji} means ${allValues.join(', ')}`;
            }
          } else {
            if (lastPromptType === 'reading') {
              const readingStatsRes = await pool.query(
                `SELECT reading, correct_count FROM card_readings WHERE card_id = $1 ORDER BY correct_count ASC LIMIT 1`,
                [cardIdFromQuery]
              );
              if (readingStatsRes.rows.length > 0) {
                const least = readingStatsRes.rows[0].reading;
                await pool.query(
                  `UPDATE card_readings SET incorrect_count = incorrect_count + 1, last_tested = NOW()
                   WHERE card_id = $1 AND reading = $2`,
                  [cardIdFromQuery, least]
                );
              }
              feedbackText = `Incorrect. ${lastKanji} is read ${allValues.join(', ')}`;
            } else {
              const meaningStatsRes = await pool.query(
                `SELECT meaning, correct_count FROM card_meanings WHERE card_id = $1 ORDER BY correct_count ASC LIMIT 1`,
                [cardIdFromQuery]
              );
              if (meaningStatsRes.rows.length > 0) {
                const least = meaningStatsRes.rows[0].meaning;
                await pool.query(
                  `UPDATE card_meanings SET incorrect_count = incorrect_count + 1, last_tested = NOW()
                   WHERE card_id = $1 AND meaning = $2`,
                  [cardIdFromQuery, least]
                );
              }
              feedbackText = `Incorrect. ${lastKanji} means ${allValues.join(', ')}`;
            }
          }

          const payload = {
            to: lineUserId,
            messages: [{ type: 'text', text: feedbackText }]
          };
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${channelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          // Now update review stats
          await reviewCard(userId, cardId, correct);

        } else {
          console.error("No valid cardId found, skipping reviewCard");
        }

        // 4. Try to introduce the next batch if ready
        try {
          await introduceNextBatch(userId, lineUserId, 'easy');
        } catch (err) {
          console.error("introduceNextBatch failed:", err);
        }
      }
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server listening on http://localhost:3000"));