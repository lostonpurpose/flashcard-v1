// Import the kanji JSON as a JavaScript object
import kanjiData from './kanji.json' assert { type: 'json' }; // JSON import is ESM-only; kanjiData is now a JS object

// Pick a random key from the kanji JSON
const keys = Object.keys(kanjiData); // Get an array of all keys: ["water", "fire", ...]
const randomKey = keys[Math.floor(Math.random() * keys.length)]; // Pick one key at random

// Construct the message to send
const message = `${randomKey} → ${kanjiData[randomKey]}`; // Example: "fire → 火"

// just random not good enough, need to track difficulty for repetition

// LINE Notify personal access token
const token = ""
const myID = ""

const payload = {
  to: myID, // Step 2: Who should receive the message
  messages: [
    { type: 'text', text: message } // Step 3: The actual message content
  ]
};

// Send the message via LINE Notify API
await fetch("https://api.line.me/v2/bot/message/push", { // POST request to LINE Notify endpoint
  method: "POST", // HTTP method
  headers: { // Request headers
    "Authorization": `Bearer ${token}`, // Bearer token identifies your account
    "Content-Type": "application/json", // LINE API expects form-encoded data
  },
  body: JSON.stringify(payload) // Step 8: Convert the JS object to JSON string

  // how does stringify parse out an object??
  
});

console.log(message); // Log confirmation to console
