const express = require('express');
const app = express();
const port = 3000;

// Dummy data endpoint
app.get('/data', (req, res) => {
  res.json({
    heartRate: 72,
    temperature: 36.6,
  });
});

// Default root route
app.get('/', (req, res) => {
  res.send('Backend is working! Access /data for the dummy data.');
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
