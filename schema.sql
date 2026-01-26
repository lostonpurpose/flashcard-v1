CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  line_user_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  last_kanji_sent VARCHAR(255)
);

CREATE TABLE cards (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    card_front VARCHAR(255) NOT NULL,
    card_back VARCHAR(255) NOT NULL,
    introduced BOOLEAN NOT NULL DEFAULT FALSE,
    next_review TIMESTAMP,
    correct_count INT NOT NULL DEFAULT 0,
    incorrect_count INT NOT NULL DEFAULT 0,
    frequency INT NOT NULL DEFAULT 8
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    card_id INT NOT NULL REFERENCES cards(id),
    correct_answer BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    next_review TIMESTAMP NOT NULL
);

CREATE TABLE master_cards (
    id SERIAL PRIMARY KEY,
    card_front VARCHAR(255) NOT NULL,
    card_back VARCHAR(255) NOT NULL,
    difficulty VARCHAR(255) NOT NULL,
    UNIQUE (card_front, card_back, difficulty)
);