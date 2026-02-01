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
          let correct = false;
          try {
            correct = await checkMessage(userAnswerLower, userId);
          } catch (err) {
            console.error("checkMessage failed:", err);
          }

          // Fetch last kanji sent
          const lastKanjiRes = await pool.query(
            'SELECT last_kanji_sent FROM users WHERE id = $1',
            [userId]
          );
          const lastKanji = lastKanjiRes.rows[0]?.last_kanji_sent;

          // Fetch correct meaning
          let correctMeaning = '';
          if (lastKanji) {
            const meaningRes = await pool.query(
              'SELECT card_back FROM master_cards WHERE card_front = $1 LIMIT 1',
              [lastKanji]
            );
            correctMeaning = meaningRes.rows[0]?.card_back;
          }

          // Build and send feedback message if right/wrong
          let feedbackText;
          if (correct) {
            feedbackText = `Correct! ${lastKanji} means ${correctMeaning}`;
          } else {
            feedbackText = `Incorrect. ${lastKanji} means ${correctMeaning}`;
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
          await introduceNextBatch(userId, 'easy', 5);
        } catch (err) {
          console.error("introduceNextBatch failed:", err);
        }
      }
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server listening on http://localhost:3000"));