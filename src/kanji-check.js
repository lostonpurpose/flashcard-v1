import { Pool } from "pg";

export async function checkMessage(userAnswer, userId) {
    console.log('[checkMessage] Called with:', { userAnswer, userId });

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Get the most recent kanji sent to the user (the kanji character)
    let lastKanji;
    try {
        const result = await pool.query(
            'SELECT last_kanji_sent FROM users WHERE line_user_id = $1',
            [userId]
        );
        lastKanji = result.rows[0]?.last_kanji_sent;
        if (!lastKanji) {
            console.error('[checkMessage] No lastKanji found for user:', userId);
            return;
        }
        console.log('[checkMessage] lastKanji from DB:', lastKanji);
    } catch (err) {
        console.error('[checkMessage] DB error:', err);
        return;
    }

    // Look up the correct answer (English) from master_cards
    let correctAnswer;
    try {
        const result = await pool.query(
            'SELECT card_back FROM master_cards WHERE card_front = $1 LIMIT 1',
            [lastKanji]
        );
        correctAnswer = result.rows[0]?.card_back?.toLowerCase().trim();
        if (!correctAnswer) {
            console.error('[checkMessage] No correct answer found for kanji:', lastKanji);
            return;
        }
        console.log('[checkMessage] correctAnswer from DB:', correctAnswer);
    } catch (err) {
        console.error('[checkMessage] DB error (master_cards):', err);
        return;
    }

    // Compare user answer to correct answer
    if (userAnswer === correctAnswer) {
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
    } else {
        // send incorrect message with the correct answer
        const payload = {
            to: userId,
            messages: [{ type: 'text', text: `That is not the definition. ${lastKanji} means ${correctAnswer}` }]
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

    await pool.end();
}
