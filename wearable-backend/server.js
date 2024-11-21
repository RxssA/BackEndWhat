const express = require('express');
const app = express();
const port = 4000;
const cors = require('cors');
app.use(cors());



app.use(express.json());

app.post('/data', (req, res) => {
  console.log('Received data:', req.body);

  // Destructure the body data (heartRate, temperature, location, accelerometer)
  const { heartRate, temperature, location, accelerometer } = req.body;

  // Log individual data fields to check them
  console.log(`Heart Rate: ${heartRate} BPM`);
  console.log(`Temperature: ${temperature} °C`);
  console.log(`Location: Lat ${location.lat}, Lng ${location.lng}`);
  console.log(`Accelerometer: X=${accelerometer.x}, Y=${accelerometer.y}, Z=${accelerometer.z}`);

  // Respond with a success message
  res.json({ status: 'success', message: 'Data received successfully!' });
});

// Default route (root route)
app.get('/', (req, res) => {
  res.send('Backend is working! Send data to /data using POST requests.');
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
