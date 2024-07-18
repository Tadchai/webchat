const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

(async () => {
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'TadPhi@2276',
    database: 'chat_app'
  });

  console.log('Connected to MySQL database');

  app.use(express.static('public'));

  app.get('/session', (req, res) => {
    if (req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).send('Unauthorized');
    }
  });
  

  app.get('/', (req, res) => {
    if (!req.session.user) {
      res.redirect('/login.html');
    } else {
      res.sendFile(__dirname + '/public/chat.html');
    }
  });
  
  app.get('/login.html', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
  });
  

  app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    await db.execute(query, [username, password]);
    res.send('User registered');
  });

  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    const [rows] = await db.execute(query, [username, password]);

    if (rows.length > 0) {
      req.session.user = rows[0];
      res.send('Login successful');
    } else {
      res.status(401).send('Invalid username or password');
    }
  });

  app.get('/groups', async (req, res) => {
    if (!req.session.user) {
      return res.status(401).send('Unauthorized');
    }
  
    const query = 'SELECT * FROM chat_groups';
    const [rows] = await db.execute(query);
    res.json(rows);
  });
  
  io.on('connection', (socket) => {
    console.log('New client connected');
  
    socket.on('join group', async (groupId) => {
      const [groupRows] = await db.execute('SELECT id FROM chat_groups WHERE id = ?', [groupId]);
      if (groupRows.length > 0) {
        socket.join(groupId);
        const [messages] = await db.execute('SELECT * FROM messages WHERE group_id = ?', [groupId]);
        socket.emit('load messages', messages);
      } else {
        socket.emit('error', 'Invalid group ID');
      }
    });
  
    socket.on('chat message', async ({ groupId, userId, msg }) => {
      console.log('Received message:', msg); 
      try {
        const [groupRows] = await db.execute('SELECT id FROM chat_groups WHERE id = ?', [groupId]);
        if (groupRows.length > 0) {
          const query = 'INSERT INTO messages (group_id, user_id, content) VALUES (?, ?, ?)';
          await db.execute(query, [groupId, userId, msg]);
          io.to(groupId).emit('chat message', { userId, msg });
        } else {
          socket.emit('error', 'Invalid group ID');
        }
      } catch (err) {
        console.error(err);
      }
    });
  
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });
  
  

  server.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
})();
