import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { checkMessage } from './kanji-check.js';

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// DEBUG: log every request method & URL
app.use((req, res, next) => {
  console.log("Got request:", req.method, req.url);
  next();
});

// Middleware to parse JSON
app.use(express.json());

// POST route for webhook
app.post('/webhook', async (req, res) => {
  console.log("Received event JSON:", req.body);

  if (req.body.events) {
    for (const event of req.body.events) {
      if (event.source && event.source.userId) {
        const lineUserId = event.source.userId;
        console.log("UserId:", lineUserId);

        try {
          const result = await pool.query(
            'INSERT INTO users (line_user_id) VALUES ($1) ON CONFLICT (line_user_id) DO NOTHING RETURNING id',
            [lineUserId]
          );
          if (result.rowCount === 1) {
            console.log("Inserted new user", lineUserId);

            if (event.replyToken && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
              const welcomeBody = {
                replyToken: event.replyToken,
                messages: [
                  {
                    type: 'text',
                    text: 'Welcome! You can add a card by sending:\nADD front :: back'
                  }
                ]
              };

              const resLine = await fetch('https://api.line.me/v2/bot/message/reply', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                },
                body: JSON.stringify(welcomeBody)
              });

              if (!resLine.ok) {
                console.error('Failed to send welcome', await resLine.text());
              }
            }
          } else {
            console.log("User already exists", lineUserId);
          }
        } catch (err) {
          console.error("Failed to insert user", err);
        }
      }
    }

    // show actual text of messages sent to line app (first one only) - for testing
    const userResponseObj = req.body.events[0];
    console.log("User message:", userResponseObj.message.text);
    const userAnswer = userResponseObj.message.text.toLowerCase().trim();
    const userId = userResponseObj.source.userId;
    try {
      await checkMessage(userAnswer, userId);
    } catch (err) {
      console.error("checkMessage failed:", err);
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server listening on http://localhost:3000"));





// here i need to take event.source.userId and add it to the db if it doesn't exist
// 1. check if user id exists
// 2. if not, add the user and send welcome message with instructions for adding cards or adding a premade deck
// 3. if it exists, check if it has a specific syntax
// 4. if it does, run code that adds a card for that user
// 5. if the message does not have that syntax, check the message against the user's most recent card sent
// 6. if message matches the card's answer, schedule the next card for review and send a 'correct' message with the card's details
// 7. if message does not match, send an 'incorrect' message with card's details so they can check answer
// 8. need to make sure no new cards are sent until the user answers the most recent card
// 9. need code that remaps? filters? the user's card deck to shift to change card priority based on difficulty aka how many times wrong. 
// 10. should have another syntax for users to specify how often they want to get messages. ie, once every two hours (assuming they reply in that window). they can say 'more often', 'less often', etc.
// 11. need to set up a scheduler that checks which users are due for a card and sends it to them