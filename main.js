// Import the kanji JSON as a JavaScript object
import kanjiData from './kanji.json' assert { type: 'json' }; // JSON import is ESM-only; kanjiData is now a JS object

// Pick a random key from the kanji JSON
const keys = Object.keys(kanjiData); // Get an array of all keys: ["water", "fire", ...]
const randomKey = keys[Math.floor(Math.random() * keys.length)]; // Pick one key at random

// Construct the message to send
const message = `${randomKey} → ${kanjiData[randomKey]}`; // Example: "fire → 火"

// LINE Notify personal access token
const token = "OOcjAhZZ16+0XsLyflSni+GF4Wiq8SgzSRl26l72p/EUaGXQH+rPiJg3ZKGnOdr6z0XUwFXa35DaABWR2FiWOlbjwjS0/N0qBD6/NteiV68GaGLXffuv3AdjeGN2Wil8KHV4lUGQLpEaXziA2ZhUAwdB04t89/1O/w1cDnyilFU="; // Replace this with your own token

// Send the message via LINE Notify API
await fetch("https://api.line.me/v2/bot/message/push", { // POST request to LINE Notify endpoint
  method: "POST", // HTTP method
  headers: { // Request headers
    "Authorization": `Bearer ${token}`, // Bearer token identifies your account
    "Content-Type": "application/x-www-form-urlencoded", // LINE API expects form-encoded data
  },
  body: new URLSearchParams({ message }), // Encode the message in URL-encoded format
});

console.log(message); // Log confirmation to console
