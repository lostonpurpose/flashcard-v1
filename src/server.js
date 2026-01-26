import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { checkMessage } from './kanji-check.js';
import { onboardUser } from './onboard-user.js';
import { reviewCard } from './review-card.js';
import { introduceNextBatch } from './introduce-next-batch.js';

const app = express();

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
            // Optionally send a welcome message here
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
        const userAnswer = userResponseObj.message?.text?.toLowerCase().trim();
        if (!userAnswer) continue;

        // Here you would look up the last card sent to the user, get its card id, and check the answer.
        // For demonstration, let's assume you have last_kanji_sent and can get the card id:
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
            correct = await checkMessage(userAnswer, userId);
          } catch (err) {
            console.error("checkMessage failed:", err);
          }
          if (cardId) {
            await reviewCard(userId, cardId, correct);
          } else {
            console.error("No valid cardId found, skipping reviewCard");
          }
        } else {
          console.error("No cardId found for user, skipping reviewCard");
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