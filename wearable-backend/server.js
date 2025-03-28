const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const { WebSocket, WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = 4000;

app.use(express.json());
app.use(cors());

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
    await client.connect();
    console.log('Successfully connected to local MongoDB');

    const db = client.db('WHATProject');

    // Authentication middleware
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
        console.log('Authenticated User:', user); // Debugging output
        req.user = user;
        next();
      });
    };

    // Fetch last 10 sensor data entries
    app.get('/data/last10', async (req, res) => {
      try {
        const collection = db.collection('sensorData');
        const data = await collection.find({}).sort({ timestamp: -1 }).limit(10).toArray();
        res.json(data.reverse());
      } catch (error) {
        console.error('Error fetching last 10 values:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch data' });
      }
    });

    app.get("/runreports", authenticateToken, async (req, res) => {
      try {
        const reportsCollection = client.db('WHATProject').collection('runReports');
        const reports = await reportsCollection.find({ userId: req.user.id }).toArray();
        res.json(reports);
      } catch (error) {
        res.status(500).json({ message: "Error fetching walk reports" });
      }
    });
    // POST endpoint to save a run report
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
        userId: req.user.id,
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
        const reportsCollection = client.db('WHATProject').collection('walkReports');
        const reports = await reportsCollection.find({ userId: req.user.id }).toArray();
        res.json(reports);
      } catch (error) {
        res.status(500).json({ message: "Error fetching walk reports" });
      }
    });
    app.post('/walkreport', authenticateToken, async (req, res) => {
      const { time, distance, path, caloriesBurned, pace, startTime, endTime } = req.body;
    
      if (!time || !distance || !path || !startTime || !endTime) {
        return res.status(400).json({ status: 'error', message: 'Missing Walk report data' });
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
        userId: req.user.id,
      };
    
      try {
        const reportsCollection = db.collection('walkReports');
        await reportsCollection.insertOne(walkReport);
        res.json({ status: 'success', message: 'Walk report saved successfully!' });
      } catch (error) {
        console.error('Error saving walk report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save Walk report' });
      }
    });
    
    // POST endpoint to receive and save sensor data
    app.post('/data', async (req, res) => {
      if (!req.body || !req.body.heartRate || !req.body.temperature || !req.body.location) {
        return res.status(400).json({ status: 'error', message: 'Invalid data!' });
      }

      latestData = {
        ...req.body,
        timestamp: new Date().toISOString(),
      };

      try {
        const collection = db.collection('sensorData');
        await collection.insertOne(latestData);
        console.log('Data inserted into MongoDB');

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

    // User Signup
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
        await users.insertOne({ 
          name, 
          password: hashedPassword, 
          age, 
          weight, 
          gender,
          height 
        });

        res.json({ status: 'success', message: 'User registered successfully!' });
      } catch (error) {
        console.error('Error signing up:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
      }
    });

    // User Login
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

        const token = jwt.sign({ id: user._id.toString(), name: user.name }, KEY, { expiresIn: '1h' });
        res.json({ status: 'success', token });
      } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ status: 'error', message: 'Server error' });
      }
    });

    app.get('/profile', async (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
          return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }
  
      const token = authHeader.split(' ')[1];
      if (!token) {
          return res.status(401).json({ status: 'error', message: 'Token missing' });
      }
  
      try {
          const decoded = jwt.verify(token, KEY);
          const id = decoded.id; 
  
          const users = db.collection('users');
          const user = await users.findOne({ _id: new ObjectId(id) });
  
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

  app.get("/workoutreports", async (req, res) =>{
    try{
      const token = req.header.authorization?.split(' ')[1];
      if(!token) return res.status(401).json({status: 'error', message: 'Unauthorized'})

      const decoded = jwt.verify(token, KEY);
      const id = decoded.id;

      const users = db.collection('users')
      const workouts = await users.collection('workouts').find({userId: new ObjectId(id)}).toArray();

      res.json(workouts);
    }
    catch(error){
      console.error("Error Fetching Workout History!", error);
      res.status(500).json({status: 'error', message: 'Server Error'});
    }
  });

  app.post('/workoutreport', authenticateToken, async (req, res) => {
    try {
        const { time, exercises, startTime, endTime } = req.body;
        
        if (!time || !exercises || !startTime || !endTime) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Missing required workout data' 
            });
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
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to save workout' 
        });
    }
});



    // WebSocket setup
    const wsServer = new WebSocketServer({ noServer: true });
    const wsClients = new Set();

    wsServer.on('connection', (ws) => {
      wsClients.add(ws);
      ws.send(JSON.stringify(latestData));

      ws.on('close', () => wsClients.delete(ws));
    });

    const host = '192.168.0.23';
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
