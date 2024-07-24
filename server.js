const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ใช้ bodyParser เพื่อแปลงข้อมูล JSON และการใช้ URL-encoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ใช้ express-session เพื่อจัดการเซสชันของผู้ใช้
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

(async () => {
  // การเชื่อมต่อกับฐานข้อมูล MySQL
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'TadPhi@2276',
    database: 'chat_app'
  });

  console.log('Connected to MySQL database');

  // ตั้งค่าให้ Express ใช้โฟลเดอร์ 'public' สำหรับไฟล์สาธารณะ
  app.use(express.static('public'));

  // เส้นทางสำหรับตรวจสอบเซสชันของผู้ใช้
  app.get('/session', (req, res) => {
    if (req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).send('Unauthorized');
    }
  });

  // เส้นทางหลัก สำหรับหน้าแรก
  app.get('/', (req, res) => {
    if (!req.session.user) {
      res.redirect('/login.html');
    } else {
      res.sendFile(__dirname + '/public/chat.html');
    }
  });

  // เส้นทางสำหรับหน้าเข้าสู่ระบบ
  app.get('/login.html', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
  });

  // เส้นทางสำหรับการลงทะเบียนผู้ใช้ใหม่
  app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    await db.execute(query, [username, password]);
    res.send('User registered');
  });

  // เส้นทางสำหรับการเข้าสู่ระบบ
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

  // เส้นทางสำหรับดึงข้อมูลกลุ่มแชท
  app.get('/groups', async (req, res) => {
    if (!req.session.user) {
      return res.status(401).send('Unauthorized');
    }
  
    const query = 'SELECT * FROM chat_groups';
    const [rows] = await db.execute(query);
    res.json(rows);
  });

  // ตั้งค่า Socket.IO เพื่อจัดการการเชื่อมต่อแบบเรียลไทม์
  io.on('connection', (socket) => {
    console.log('New client connected');

    // เมื่อผู้ใช้เข้าร่วมกลุ่มแชท
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

    // เมื่อมีการส่งข้อความแชทในกลุ่ม
    socket.on('chat message', async ({ groupId, userId, msg }) => {
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

    // เมื่อมีการส่งไฟล์ในกลุ่มแชท
    socket.on('file message', async ({ groupId, userId, file, filename, filetype }) => {
      try {
        const [groupRows] = await db.execute('SELECT id FROM chat_groups WHERE id = ?', [groupId]);
        if (groupRows.length > 0) {
          const query = 'INSERT INTO messages (group_id, user_id, content, filetype) VALUES (?, ?, ?, ?)';
          await db.execute(query, [groupId, userId, file, filetype]);
          io.to(groupId).emit('file message', { userId, file, filename, filetype });
        } else {
          socket.emit('error', 'Invalid group ID');
        }
      } catch (err) {
        console.error(err);
      }
    });

    // เมื่อผู้ใช้ตัดการเชื่อมต่อ
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  // เริ่มต้นเซิร์ฟเวอร์ที่พอร์ต 3000
  server.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
})();
