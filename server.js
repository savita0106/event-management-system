const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'eventdb'
});

db.connect((err) => {
  if (err) {
    console.log('db connection failed', err);
  } else {
    console.log('mysql connected');
  }
});

app.get('/', (req, res) => {
  res.send('event backend running');
});

app.post('/signup', (req, res) => {
  const { username, password, role } = req.body;

  const sql = 'insert into users (username, password, role) values (?, ?, ?)';
  db.query(sql, [username, password, role], (err) => {
    if (err) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    res.json({ message: 'Signup successful' });
  });
});

app.post('/login', (req, res) => {
  const { username, password, role } = req.body;

  const sql = 'select * from users where username = ? and password = ? and role = ?';
  db.query(sql, [username, password, role], (err, result) => {
    if (err) return res.status(500).json({ message: 'Server error' });

    if (result.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result[0];
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });
});

app.get('/events', (req, res) => {
  const q = req.query.q || '';

  let sql = 'select * from events';
  let values = [];

  if (q) {
    sql += ' where name like ? or location like ?';
    values = [`%${q}%`, `%${q}%`];
  }

  sql += ' order by id desc';

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json(result);
  });
});

app.get('/events/:id', (req, res) => {
  const sql = 'select * from events where id = ?';
  db.query(sql, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (result.length === 0) return res.status(404).json({ message: 'Event not found' });
    res.json(result[0]);
  });
});

app.post('/events', (req, res) => {
  const { name, date, time, location, description, total_seats } = req.body;

  const sql = `
    insert into events (name, date, time, location, description, total_seats, available_seats)
    values (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, date, time, location, description, total_seats, total_seats],
    (err) => {
      if (err) return res.status(500).json({ message: 'Server error' });
      res.json({ message: 'Event created' });
    }
  );
});

app.put('/events/:id', (req, res) => {
  const { name, date, time, location, description, total_seats } = req.body;
  const eventId = req.params.id;

  const getSql = 'select * from events where id = ?';
  db.query(getSql, [eventId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (rows.length === 0) return res.status(404).json({ message: 'Event not found' });

    const oldEvent = rows[0];
    const seatsUsed = oldEvent.total_seats - oldEvent.available_seats;
    const newAvailable = total_seats - seatsUsed < 0 ? 0 : total_seats - seatsUsed;

    const updateSql = `
      update events
      set name = ?, date = ?, time = ?, location = ?, description = ?, total_seats = ?, available_seats = ?
      where id = ?
    `;

    db.query(
      updateSql,
      [name, date, time, location, description, total_seats, newAvailable, eventId],
      (err2) => {
        if (err2) return res.status(500).json({ message: 'Server error' });
        res.json({ message: 'Event updated' });
      }
    );
  });
});

app.delete('/events/:id', (req, res) => {
  const sql = 'delete from events where id = ?';
  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json({ message: 'Event deleted' });
  });
});

app.post('/register', (req, res) => {
  const { user_id, event_id } = req.body;

  const checkSql = 'select * from registrations where user_id = ? and event_id = ?';
  db.query(checkSql, [user_id, event_id], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });

    if (rows.length > 0) {
      return res.status(400).json({ message: 'Already registered or waitlisted' });
    }

    const eventSql = 'select * from events where id = ?';
    db.query(eventSql, [event_id], (err2, events) => {
      if (err2) return res.status(500).json({ message: 'Server error' });
      if (events.length === 0) return res.status(404).json({ message: 'Event not found' });

      const event = events[0];

      if (event.available_seats > 0) {
        const regSql = 'insert into registrations (user_id, event_id, status) values (?, ?, ?)';
        db.query(regSql, [user_id, event_id, 'registered'], (err3) => {
          if (err3) return res.status(500).json({ message: 'Server error' });

          const updateSeatSql = 'update events set available_seats = available_seats - 1 where id = ?';
          db.query(updateSeatSql, [event_id], (err4) => {
            if (err4) return res.status(500).json({ message: 'Server error' });
            res.json({ message: 'Registration successful' });
          });
        });
      } else {
        const waitSql = 'insert into registrations (user_id, event_id, status) values (?, ?, ?)';
        db.query(waitSql, [user_id, event_id, 'waitlisted'], (err5) => {
          if (err5) return res.status(500).json({ message: 'Server error' });
          res.json({ message: 'Seats full. Added to waitlist' });
        });
      }
    });
  });
});

app.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});