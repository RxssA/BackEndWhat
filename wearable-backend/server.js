const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
const port = 4000;

app.use(express.json());
app.use(cors());

let latestData = {
  heartRate: 72,
  temperature: 36.6,
  location: { lat: 53.270962, lng: -9.062691 },
  timestamp: new Date().toISOString(),
};

app.post('/data', (req, res) => {
  latestData = {
    ...req.body,
    timestamp: new Date().toISOString(), // Add timestamp
  };

  wsClients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(latestData));
    }
  });

  res.json({ status: 'success', message: 'Data updated successfully!' });
});

const wsServer = new WebSocketServer({ noServer: true });
const wsClients = new Set();

wsServer.on('connection', (ws) => {
  wsClients.add(ws);

  // Send the latest data including the timestamp
  ws.send(JSON.stringify(latestData));

  ws.on('close', () => wsClients.delete(ws));
});

const server = app.listen(port, () => console.log(`Server running on port ${port}`));
server.on('upgrade', (req, socket, head) => {
  wsServer.handleUpgrade(req, socket, head, (ws) => {
    wsServer.emit('connection', ws, req);
  });
});
