import { Pool } from "pg";

// Return true if correct, false if not. Do not send messages here.
export async function checkMessage(userAnswer, userId) {
    console.log('[checkMessage] Called with:', { userAnswer, userId });

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Get the most recent kanji sent to the user (the kanji character)
    let lastKanji;
    try {
        // FIX: use id = $1, not line_user_id = $1
        const result = await pool.query(
            'SELECT last_kanji_sent FROM users WHERE id = $1',
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
        }
        console.log('[checkMessage] correctAnswer from DB:', correctAnswer);
    } catch (err) {
        console.error('[checkMessage] DB error (master_cards):', err);
        return;
    }

    // Compare user answer to correct answer
    return userAnswer === correctAnswer;
}
