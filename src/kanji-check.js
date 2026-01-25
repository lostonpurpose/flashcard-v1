import { Pool } from "pg"


export async function checkMessage(userAnswer, userId) {

    const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    });

    // find most recent kanji sent to user
    const result = await pool.query(
    'SELECT last_kanji_sent FROM users WHERE line_user_id = $1',
    [userId]
    );
    const lastKanji = result.rows[0]?.last_kanji_sent;


    if (userAnswer === lastKanji) {
        // send 'correct' message
        const payload = {
        to: userId,
        messages: [{ type: 'text', text: 'You are correct sir' }]
        };
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        });
    }
    else {
        // send incorrect message
        const payload = {
        to: userId,
        messages: [{ type: 'text', text: 'That is not the definition' }]
        };
        const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        });
    }
};
