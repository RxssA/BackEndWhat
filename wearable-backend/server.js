const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Dummy health data
const dummyData = {
  heartRate: 72, // Example BPM
  temperature: 36.5, // Example temperature in °C
};

// Endpoint to serve health data
app.get('/data', (req, res) => {
  res.json(dummyData);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
