import { Pool } from "pg";

// Return the specific meaning the user answered, or null if incorrect
export async function checkMessage(userAnswer, userId) {
    console.log('[checkMessage] Called with:', { userAnswer, userId });

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Get the most recent kanji sent to the user (the kanji character)
    let lastKanji;
    try {
        const result = await pool.query(
            'SELECT last_kanji_sent FROM users WHERE id = $1',
            [userId]
        );
        lastKanji = result.rows[0]?.last_kanji_sent;
        if (!lastKanji) {
            console.error('[checkMessage] No lastKanji found for user:', userId);
            return null;
        }
        console.log('[checkMessage] lastKanji from DB:', lastKanji);
    } catch (err) {
        console.error('[checkMessage] DB error:', err);
        return null;
    }

    // Fetch prompt type
    let lastPromptType = 'meaning';
    try {
        const promptRes = await pool.query(
            'SELECT last_prompt_type FROM users WHERE id = $1',
            [userId]
        );
        lastPromptType = promptRes.rows[0]?.last_prompt_type || 'meaning';
    } catch {}

    // Look up meanings/readings
    let correctItems;
    let cardId;
    try {
        const result = await pool.query(
            'SELECT id, card_back, readings FROM cards WHERE card_front = $1 AND user_id = $2 LIMIT 1',
            [lastKanji, userId]
        );
        cardId = result.rows[0]?.id;
        const raw = lastPromptType === 'reading' ? result.rows[0]?.readings : result.rows[0]?.card_back;

        if (!raw) return null;

        try {
            correctItems = JSON.parse(raw);
        } catch {
            correctItems = [raw];
        }
    } catch (err) {
        console.error('[checkMessage] DB error (cards):', err);
        return null;
    }

    const userAnswerNormalized = userAnswer.toLowerCase().trim();
    const matchedValue = correctItems.find(item =>
        item.toLowerCase().trim() === userAnswerNormalized
    );

    if (matchedValue) {
        return { cardId, matchedValue, allValues: correctItems, promptType: lastPromptType };
    }

    return null;
}
