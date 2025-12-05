const fs = require('fs');

// 1. Read file as text
const rawData = fs.readFileSync('kanji.json', 'utf8');

// 2. Parse JSON
const flashcards = JSON.parse(rawData);

console.log(flashcards);
