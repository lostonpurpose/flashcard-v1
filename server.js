import express from 'express';

const app = express();

// DEBUG: log every request method & URL
app.use((req, res, next) => {
  console.log("Got request:", req.method, req.url);
  next();
});

// Middleware to parse JSON
app.use(express.json());

// POST route for webhook
app.post('/webhook', (req, res) => {
  console.log("Received event JSON:", req.body);

  if (req.body.events) {
    for (const event of req.body.events) {
      if (event.source && event.source.userId) {
        console.log("UserId:", event.source.userId);
      }
    }
  }

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Server listening on http://localhost:3000"));
