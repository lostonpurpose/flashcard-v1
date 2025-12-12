import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import kanjiData from './kanji.json' assert { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Pick a random key from the kanji JSON
const keys = Object.keys(kanjiData);
const randomKey = keys[Math.floor(Math.random() * keys.length)];

// Construct the message to send
// message with meaning (key) and kanji (value)
// const message = `${randomKey} → ${kanjiData[randomKey]}`;

// message with kanji only
const message = `${kanjiData[randomKey]} = ?`;


// Read from env vars
const channelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const userId = process.env.LINE_USER_ID;

if (!channelToken || !userId) {
  throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_USER_ID env vars');
}

const payload = {
  to: userId,
  messages: [{ type: 'text', text: message }]
};

// Send the message via LINE Messaging API
const res = await fetch('https://api.line.me/v2/bot/message/push', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${channelToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const errText = await res.text();
  console.error('LINE push failed', res.status, errText);
  process.exit(1);
}

console.log('Sent:', message);

// Optional: persist edits to kanji.json
// kanjiData.test = 'added';
const jsonPath = join(__dirname, 'kanji.json');
writeFileSync(jsonPath, JSON.stringify(kanjiData, null, 2), 'utf8');