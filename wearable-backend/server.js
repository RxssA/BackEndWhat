const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { WebSocket, WebSocketServer } = require('ws');
require('dotenv').config();

const app = express();
const port = 4000;

app.use(express.json());
app.use(cors());

const url = `mongodb+srv://rossarmo99:Kwp20201!@whatproject.bpv1d.mongodb.net/?retryWrites=true&w=majority&appName=WHATProject`;
const client = new MongoClient(url);

app.get('/data/last10', async (req, res) => {
  try {
    const db = client.db('WHATProject');
    const collection = db.collection('sensorData');
    const data = await collection.find({}).sort({ timestamp: -1 }).limit(10).toArray();

    res.json(data.reverse());
  } catch (error) {
    console.error('Error fetching last 10 values from MongoDB:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch data' });
  }
});

let latestData = {
  heartRate: 72,
  temperature: 36.6,
  location: { lat: 53.270962, lng: -9.062691 },
  timestamp: new Date().toISOString(),
};

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log('Successfully connected to MongoDB Atlas');

    // POST endpoint to receive and save data to MongoDB
    app.post('/data', async (req, res) => {
      if (!req.body || !req.body.heartRate || !req.body.temperature || !req.body.location) {
        return res.status(400).json({ status: 'error', message: 'Invalid data!' });
      }

      latestData = {
        ...req.body,
        timestamp: new Date().toISOString(),
      };

      try {
        const db = client.db('WHATProject')
        const collection = db.collection('sensorData'); 
        await collection.insertOne(latestData); // Insert the data into MongoDB
        console.log('Data inserted into MongoDB');

        // Broadcast the data to all WebSocket clients
        wsClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(latestData));
          }
        });

        res.json({ status: 'success', message: 'Data updated and saved to MongoDB successfully!' });
      } catch (error) {
        console.error('Error inserting data into MongoDB:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save data to MongoDB' });
      }
    });

    // GET endpoint for the last 10 minutes of data
   /* app.get('/data/last10minutes', async (req, res) => {
      try {
        const db = client.db('WHATProject');
        const collection = db.collection('sensorData');
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const data = await collection.find({ timestamp: { $gte: tenMinutesAgo } }).toArray();
        res.json(data);
      } catch (error) {
        console.error('Error fetching data from MongoDB:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch data' });
      }
    });*/

    // WebSocket setup
    const wsServer = new WebSocketServer({ noServer: true });
    const wsClients = new Set();

    wsServer.on('connection', (ws) => {
      wsClients.add(ws);
      ws.send(JSON.stringify(latestData)); // Send latest data to new clients

      ws.on('close', () => wsClients.delete(ws));
    });

    const host = '192.168.1.14';
    const server = app.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
    });

    server.on('upgrade', (req, socket, head) => {
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        wsServer.emit('connection', ws, req);
      });
    });

  } catch (err) {
    console.error(err.stack);
  }
}

run().catch(console.dir);
