const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const { WebSocket, WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const port = 4000;

app.use(express.json());
app.use(cors());

const buildPath = path.resolve('C:/Users/rossa/Desktop/WHAT/frontEnd/FrontEndWHAT/build');

// Connect to local MongoDB
const url = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/WHATProject';
const KEY = process.env.SECRET_KEY;

const client = new MongoClient(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let latestData = {
  heartRate: 72,
  temperature: 36.6,
  location: { lat: 53.270962, lng: -9.062691 },
  timestamp: new Date().toISOString(),
};

async function run() {
  try {
    console.log('Attempting to connect to MongoDB at:', url);
    await client.connect();
    console.log('Successfully connected to local MongoDB');

    const db = client.db('WHATProject');
    const collections = await db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));

    // API Routes
    app.get('/data/last10', async (req, res) => {
      try {
        console.log('Fetching last 10 records from sensorData collection');
        const collection = db.collection('sensorData');
        const data = await collection.find({}).sort({ timestamp: -1 }).limit(10).toArray();
        if (data.length === 0) {
          console.log('No data found in sensorData collection');
        }
        res.json(data.reverse());
      } catch (error) {
        console.error('Error fetching last 10 values:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to fetch data',
          error: error.message
        });
      }
    });

    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'Unauthorized: Token missing' });
      }

      jwt.verify(token, KEY, (err, user) => {
        if (err) {
          return res.status(403).json({ message: 'Forbidden: Invalid or expired token' });
        }
        console.log('Authenticated User:', user);
        req.user = user;
        next();
      });
    };

    app.get("/runreports", authenticateToken, async (req, res) => {
      try {
        const reportsCollection = client.db('WHATProject').collection('runReports');
        const reports = await reportsCollection.find({
          userId: new ObjectId(req.user.id)
        }).toArray();
        res.json(reports);
      } catch (error) {
        res.status(500).json({ message: "Error fetching run reports" });
      }
    });

    app.post('/runreport', authenticateToken, async (req, res) => {
      const { time, distance, path, caloriesBurned, pace, startTime, endTime } = req.body;
      if (!time || !distance || !path || !startTime || !endTime) {
        return res.status(400).json({ status: 'error', message: 'Missing run report data' });
      }

      const runReport = {
        time,
        distance,
        path,
        caloriesBurned,
        pace,
        startTime,
        endTime,
        createdAt: new Date().toISOString(),
        userId: new ObjectId(req.user.id),
      };

      try {
        const reportsCollection = db.collection('runReports');
        await reportsCollection.insertOne(runReport);
        res.json({ status: 'success', message: 'Run report saved successfully!' });
      } catch (error) {
        console.error('Error saving run report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save run report' });
      }
    });

    app.get("/walkreports", authenticateToken, async (req, res) => {
      try {
        const reportsCollection = db.collection('walkReports');
        const reports = await reportsCollection.find({
          userId: new ObjectId(req.user.id)
        }).toArray();
        res.json(reports);
      } catch (error) {
        console.error('Error fetching walk reports:', error);
        res.status(500).json({
          status: 'error',
          message: 'Error fetching walk reports',
          error: error.message
        });
      }
    });

    app.post('/walkreport', authenticateToken, async (req, res) => {
      const { time, distance, path, caloriesBurned, pace, startTime, endTime } = req.body;

      if (!time || !distance || !path || !startTime || !endTime) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing Walk report data',
          required: ['time', 'distance', 'path', 'startTime', 'endTime']
        });
      }

      const walkReport = {
        time,
        distance,
        path,
        caloriesBurned,
        pace,
        startTime,
        endTime,
        createdAt: new Date().toISOString(),
        userId: new ObjectId(req.user.id)
      };

      try {
        const reportsCollection = db.collection('walkReports');
        const result = await reportsCollection.insertOne(walkReport);

        if (!result.insertedId) {
          throw new Error('Failed to insert walk report');
        }

        res.json({
          status: 'success',
          message: 'Walk report saved successfully!',
          reportId: result.insertedId
        });
      } catch (error) {
        console.error('Error saving walk report:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to save Walk report',
          error: error.message
        });
      }
    });

    app.post('/data', authenticateToken, async (req, res) => {
      if (!req.body || !req.body.heartRate || !req.body.temperature || !req.body.location) {
        return res.status(400).json({ status: 'error', message: 'Invalid data!' });
      }

      const sensorData = {
        ...req.body,
        userId: new ObjectId(req.user.id),
        timestamp: new Date().toISOString(),
      };

      try {
        const collection = db.collection('sensorData');
        await collection.insertOne(sensorData);
        console.log('Data inserted into MongoDB');

        // Update latestData for WebSocket clients
        latestData = sensorData;

        wsClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(latestData));
          }
        });

        res.json({ status: 'success', message: 'Data updated and saved successfully!' });
      } catch (error) {
        console.error('Error inserting data:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save data' });
      }
    });

    app.get('/data/user', authenticateToken, async (req, res) => {
      try {
        const collection = db.collection('sensorData');
        const data = await collection.find({
          userId: new ObjectId(req.user.id)
        }).sort({ timestamp: -1 }).limit(10).toArray();

        if (data.length === 0) {
          console.log('No data found for user');
        }
        res.json(data.reverse());
      } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to fetch user data',
          error: error.message
        });
      }
    });

    app.post('/signup', async (req, res) => {
      const { name, password, age, weight, gender, height } = req.body;

      if (!name || !password || !age || !weight || !gender || !height) {
        return res.status(400).json({ status: 'error', message: 'All fields are required!' });
      }

      try {
        const users = db.collection('users');
        const existingUser = await users.findOne({ name });

        if (existingUser) {
          return res.status(400).json({ status: 'error', message: 'User already exists!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await users.insertOne({
          name,
          password: hashedPassword,
          age,
          weight,
          gender,
          height
        });

        // Generate JWT token for the new user
        const token = jwt.sign({ id: result.insertedId.toString(), name }, KEY, { expiresIn: '1h' });

        res.json({
          status: 'success',
          message: 'User registered successfully!',
          token
        });
      } catch (error) {
        console.error('Error signing up:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
      }
    });

    // Login endpoint to authenticate and issue a token for the ESP32
    app.post('/login', async (req, res) => {
      const { name, password } = req.body;

      try {
        const users = db.collection('users');
        const user = await users.findOne({ name });

        if (!user) {
          return res.status(400).json({ status: 'error', message: 'User not found!' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ status: 'error', message: 'Invalid credentials!' });
        }

        // Issue JWT token
        const token = jwt.sign({ id: user._id.toString(), name: user.name }, KEY, { expiresIn: '1h' });

        res.json({ status: 'success', token });
      } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
      }
    });


    app.get('/profile', authenticateToken, async (req, res) => {
      try {
        const users = db.collection('users');
        const user = await users.findOne({ _id: new ObjectId(req.user.id) });

        if (!user) {
          return res.status(404).json({ status: 'error', message: 'User not found!' });
        }

        const { name, age, weight, height, gender } = user;
        res.json({ status: 'success', user: { name, age, weight, height, gender } });
      } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
      }
    });

    app.get("/workoutHistory", authenticateToken, async (req, res) => {
      try {
        const workoutsCollection = db.collection('workouts');
        const workouts = await workoutsCollection.find({
          userId: new ObjectId(req.user.id)
        }).toArray();
        const formattedWorkouts = workouts.map(workout => ({
          ...workout,
          _id: workout._id.toString(),
          userId: workout.userId.toString()
        }));

        res.json({ status: 'success', data: formattedWorkouts });
      } catch (error) {
        console.error("Error fetching workout history:", error);
        res.status(500).json({
          status: 'error',
          message: 'Failed to fetch workout history',
          error: error.message
        });
      }
    });

    app.post('/workoutreport', authenticateToken, async (req, res) => {
      try {
        const { time, exercises, startTime, endTime } = req.body;

        if (!time || !exercises || !startTime || !endTime) {
          return res.status(400).json({ status: 'error', message: 'Missing required workout data' });
        }

        const workoutData = {
          userId: new ObjectId(req.user.id),
          time: Number(time),
          exercises: exercises,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          createdAt: new Date()
        };

        const result = await db.collection('workouts').insertOne(workoutData);

        res.json({
          status: 'success',
          message: 'Workout saved successfully',
          insertedId: result.insertedId
        });
      } catch (error) {
        console.error('Error saving workout:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save workout' });
      }
    });


    app.delete('/walkreports/:id', authenticateToken, async (req, res) => {
      try {
        const result = await db.collection('walkReports').deleteOne({
          _id: new ObjectId(req.params.id),
          userId: new ObjectId(req.user.id)
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ status: 'error', message: 'Report not found' });
        }

        res.json({ status: 'success', message: 'Walk report deleted' });
      } catch (error) {
        console.error('Error deleting walk report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete walk report' });
      }
    });

    app.delete('/runreports/:id', authenticateToken, async (req, res) => {
      try {
        const result = await db.collection('runReports').deleteOne({
          _id: new ObjectId(req.params.id),
          userId: new ObjectId(req.user.id)
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ status: 'error', message: 'Report not found' });
        }

        res.json({ status: 'success', message: 'Run report deleted' });
      } catch (error) {
        console.error('Error deleting run report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete run report' });
      }
    });

    app.delete('/workoutHistory/:id', authenticateToken, async (req, res) => {
      try {
        const result = await db.collection('workouts').deleteOne({
          _id: new ObjectId(req.params.id),
          userId: new ObjectId(req.user.id)
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ status: 'error', message: 'Workout not found' });
        }

        res.json({ status: 'success', message: 'Workout deleted' });
      } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete workout' });
      }
    });

    const wsServer = new WebSocketServer({ noServer: true });
    const wsClients = new Set();

    wsServer.on('connection', (ws) => {
      wsClients.add(ws);
      ws.send(JSON.stringify(latestData));

      ws.on('close', () => wsClients.delete(ws));
    });

    // Serve frontend static files
    app.use(express.static(buildPath));

    // Fallback for React Router
    app.get('*', (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });

    const host = '18.214.225.15';
    const server = app.listen(port, '0.0.0.0', () => {
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
