import { Pool } from "pg"


export async function checkMessage(userAnswer, userId) {
    console.log('[checkMessage] Called with:', { userAnswer, userId });

    const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    });

    // find most recent kanji sent to user
    let lastKanji;
    try {
        const result = await pool.query(
            'SELECT last_kanji_sent FROM users WHERE line_user_id = $1',
            [userId]
        );
        lastKanji = result.rows[0]?.last_kanji_sent.toLowerCase().trim();
        console.log('[checkMessage] lastKanji from DB:', lastKanji);
    } catch (err) {
        console.error('[checkMessage] DB error:', err);
        return;
    }


    if (userAnswer === lastKanji) {
        // send 'correct' message
        const payload = {
            to: userId,
            messages: [{ type: 'text', text: 'You are correct sir' }]
        };
        console.log('[checkMessage] Sending CORRECT payload:', payload);
        try {
            const res = await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const text = await res.text();
            console.log('[checkMessage] LINE API response (correct):', res.status, text);
        } catch (err) {
            console.error('[checkMessage] Fetch error (correct):', err);
        }
    }
    else {
        // send incorrect message
        const payload = {
            to: userId,
            messages: [{ type: 'text', text: 'That is not the definition' }]
        };
        console.log('[checkMessage] Sending INCORRECT payload:', payload);
        try {
            const res = await fetch('https://api.line.me/v2/bot/message/push', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const text = await res.text();
            console.log('[checkMessage] LINE API response (incorrect):', res.status, text);
        } catch (err) {
            console.error('[checkMessage] Fetch error (incorrect):', err);
        }
    }
}
