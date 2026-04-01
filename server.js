const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eventdb',
  port: process.env.DB_PORT || 3306
});

const dbp = db.promise();

db.connect((err) => {
  if (err) {
    console.log('db connection failed', err);
  } else {
    console.log('mysql connected');
  }
});

function promoteWaitlisted(eventId, done) {
  const waitSql = `
    select id from registrations
    where event_id = ? and status = 'waitlisted'
    order by id asc
    limit 1
  `;

  db.query(waitSql, [eventId], (err, rows) => {
    if (err) return done(err);

    if (!rows.length) return done();

    const regId = rows[0].id;

    const promoteSql = `update registrations set status = 'registered' where id = ?`;
    db.query(promoteSql, [regId], (err2) => {
      if (err2) return done(err2);

      const seatSql = `update events set available_seats = available_seats - 1 where id = ? and available_seats > 0`;
      db.query(seatSql, [eventId], (err3) => {
        done(err3);
      });
    });
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'role.html'));
});

app.post('/signup', (req, res) => {
  const { username, password, role } = req.body;

  const sql = 'insert into users (username, password, role) values (?, ?, ?)';
  db.query(sql, [username, password, role], (err) => {
    if (err) {
      console.log('signup error:', err);

      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ message: 'Username already exists' });
      }

      return res.status(500).json({ message: 'Signup failed due to database error' });
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
  const availability = req.query.availability || 'all';

  let sql = 'select * from events where 1=1';
  let values = [];

  if (q) {
    sql += ' and (name like ? or location like ?)';
    values.push(`%${q}%`, `%${q}%`);
  }

  if (availability === 'available') {
    sql += ' and available_seats > 0';
  } else if (availability === 'full') {
    sql += ' and available_seats = 0';
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
  const eventId = req.params.id;

  db.query('delete from team_members where team_id in (select id from teams where event_id = ?)', [eventId], (err0) => {
    if (err0) return res.status(500).json({ message: 'Server error' });

    db.query('delete from teams where event_id = ?', [eventId], (err01) => {
      if (err01) return res.status(500).json({ message: 'Server error' });

      db.query('delete from registrations where event_id = ?', [eventId], (err02) => {
        if (err02) return res.status(500).json({ message: 'Server error' });

        db.query('delete from events where id = ?', [eventId], (err) => {
          if (err) return res.status(500).json({ message: 'Server error' });
          res.json({ message: 'Event deleted' });
        });
      });
    });
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

app.post('/register-team', async (req, res) => {
  const { event_id, team_name, leader_user_id, member_emails } = req.body;

  if (!event_id || !team_name || !leader_user_id) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const others = Array.isArray(member_emails) ? member_emails : [];
  const cleanedEmails = others.map(x => String(x || '').trim().toLowerCase()).filter(Boolean);

  const uniqueEmails = [...new Set(cleanedEmails)];

  if (uniqueEmails.length !== cleanedEmails.length) {
    return res.status(400).json({ message: 'Duplicate email IDs are not allowed' });
  }

  const totalMembers = 1 + cleanedEmails.length;

  if (totalMembers < 2 || totalMembers > 5) {
    return res.status(400).json({ message: 'Team size must be between 2 and 5' });
  }

  try {
    const [eventRows] = await dbp.query('select * from events where id = ?', [event_id]);
    if (!eventRows.length) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const event = eventRows[0];

    if (Number(event.available_seats) < totalMembers) {
      return res.status(400).json({ message: 'Not enough seats available for the whole team' });
    }

    const [leaderRows] = await dbp.query('select * from users where id = ?', [leader_user_id]);
    if (!leaderRows.length) {
      return res.status(404).json({ message: 'Leader not found' });
    }

    const leader = leaderRows[0];

    if (uniqueEmails.includes(String(leader.email || '').toLowerCase())) {
      return res.status(400).json({ message: 'Do not enter your own email ID in team members' });
    }

    const placeholders = cleanedEmails.map(() => '?').join(',');
    const [memberRows] = await dbp.query(
      `select * from users where lower(email) in (${placeholders})`,
      cleanedEmails
    );

    if (memberRows.length !== cleanedEmails.length) {
      return res.status(400).json({ message: 'One or more email IDs do not exist' });
    }

    const allUserIds = [leader_user_id, ...memberRows.map(x => x.id)];
    const checkPlaceholders = allUserIds.map(() => '?').join(',');

    const [existingRegs] = await dbp.query(
      `select * from registrations where event_id = ? and user_id in (${checkPlaceholders})`,
      [event_id, ...allUserIds]
    );

    if (existingRegs.length > 0) {
      return res.status(400).json({ message: 'One or more users are already registered/waitlisted for this event' });
    }

    await dbp.beginTransaction();

    try {
      const [teamResult] = await dbp.query(
        'insert into teams (event_id, team_name, leader_user_id, max_members) values (?, ?, ?, ?)',
        [event_id, team_name, leader_user_id, 5]
      );

      const teamId = teamResult.insertId;

      await dbp.query(
        'insert into registrations (user_id, event_id, status) values (?, ?, ?)',
        [leader_user_id, event_id, 'registered']
      );

      for (const member of memberRows) {
        await dbp.query(
          'insert into registrations (user_id, event_id, status) values (?, ?, ?)',
          [member.id, event_id, 'registered']
        );
      }

      await dbp.query(
        'insert into team_members (team_id, user_id) values (?, ?)',
        [teamId, leader_user_id]
      );

      for (const member of memberRows) {
        await dbp.query(
          'insert into team_members (team_id, user_id) values (?, ?)',
          [teamId, member.id]
        );
      }

      await dbp.query(
        'update events set available_seats = available_seats - ? where id = ?',
        [totalMembers, event_id]
      );

      await dbp.commit();
      return res.json({ message: 'Team registered successfully' });
    } catch (err2) {
      await dbp.rollback();
      return res.status(400).json({ message: 'Team name already exists or team registration failed' });
    }
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
});

app.get('/my-registrations/:userId', (req, res) => {
  const sql = `
    select
      r.id,
      r.status,
      r.user_id,
      r.event_id,
      e.name,
      e.date,
      e.time,
      e.location,
      e.description
    from registrations r
    join events e on r.event_id = e.id
    where r.user_id = ?
    order by r.id desc
  `;

  db.query(sql, [req.params.userId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json(rows);
  });
});

app.delete('/my-registrations/:registrationId', (req, res) => {
  const registrationId = req.params.registrationId;

  const getSql = 'select * from registrations where id = ?';
  db.query(getSql, [registrationId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (!rows.length) return res.status(404).json({ message: 'Registration not found' });

    const reg = rows[0];

    const deleteTeamsSql = `
      delete tm from team_members tm
      join teams t on tm.team_id = t.id
      where tm.user_id = ? and t.event_id = ?
    `;

    db.query(deleteTeamsSql, [reg.user_id, reg.event_id], (teamErr) => {
      if (teamErr) return res.status(500).json({ message: 'Server error' });

      const deleteLeaderTeamsSql = 'select id from teams where leader_user_id = ? and event_id = ?';
      db.query(deleteLeaderTeamsSql, [reg.user_id, reg.event_id], (leaderErr, leaderTeams) => {
        if (leaderErr) return res.status(500).json({ message: 'Server error' });

        if (leaderTeams.length) {
          const teamIds = leaderTeams.map((x) => x.id);

          db.query('delete from team_members where team_id in (?)', [teamIds], (errA) => {
            if (errA) return res.status(500).json({ message: 'Server error' });

            db.query('delete from teams where id in (?)', [teamIds], (errB) => {
              if (errB) return res.status(500).json({ message: 'Server error' });
              continueRegistrationDelete();
            });
          });
        } else {
          continueRegistrationDelete();
        }
      });
    });

    function continueRegistrationDelete() {
      const deleteSql = 'delete from registrations where id = ?';
      db.query(deleteSql, [registrationId], (err2) => {
        if (err2) return res.status(500).json({ message: 'Server error' });

        if (reg.status === 'registered') {
          const seatSql = 'update events set available_seats = available_seats + 1 where id = ?';
          db.query(seatSql, [reg.event_id], (err3) => {
            if (err3) return res.status(500).json({ message: 'Server error' });

            promoteWaitlisted(reg.event_id, (err4) => {
              if (err4) return res.status(500).json({ message: 'Server error' });
              res.json({ message: 'Registration cancelled' });
            });
          });
        } else {
          res.json({ message: 'Waitlist entry removed' });
        }
      });
    }
  });
});

app.get('/admin/events-with-counts', (req, res) => {
  const sql = `
    select
      e.*,
      sum(case when r.status = 'registered' then 1 else 0 end) as registered_count,
      sum(case when r.status = 'waitlisted' then 1 else 0 end) as waitlisted_count
    from events e
    left join registrations r on e.id = r.event_id
    group by e.id
    order by e.id desc
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json(rows);
  });
});

app.get('/admin/attendees/:eventId', (req, res) => {
  const sql = `
    select
      r.id as registration_id,
      r.status,
      r.registered_at,
      u.id as user_id,
      u.username,
      u.role,
      e.name as event_name,
      e.date as event_date,
      e.time as event_time,
      e.location as event_location
    from registrations r
    join users u on r.user_id = u.id
    join events e on r.event_id = e.id
    where r.event_id = ?
    order by
      case when r.status = 'registered' then 0 else 1 end,
      r.id asc
  `;

  db.query(sql, [req.params.eventId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json(rows);
  });
});

app.post('/admin/promote/:eventId', (req, res) => {
  const eventId = req.params.eventId;

  const seatSql = 'select available_seats from events where id = ?';
  db.query(seatSql, [eventId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    if (!rows.length) return res.status(404).json({ message: 'Event not found' });

    if (rows[0].available_seats <= 0) {
      return res.status(400).json({ message: 'No free seats available' });
    }

    promoteWaitlisted(eventId, (err2) => {
      if (err2) return res.status(500).json({ message: 'Server error' });
      res.json({ message: 'Waitlisted user promoted if available' });
    });
  });
});

/* TEAM ROUTES */


app.get('/admin/analytics', (req, res) => {
  const sql = `
    select
      e.id,
      e.name,
      e.total_seats,
      e.available_seats,
      (e.total_seats - e.available_seats) as filled_seats,
      sum(case when r.status = 'registered' then 1 else 0 end) as registered_count,
      sum(case when r.status = 'waitlisted' then 1 else 0 end) as waitlisted_count,
      count(distinct t.id) as team_count,
      count(distinct tm.user_id) as team_member_count
    from events e
    left join registrations r on e.id = r.event_id
    left join teams t on e.id = t.event_id
    left join team_members tm on t.id = tm.team_id
    group by e.id
    order by e.id desc
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json(rows);
  });
});

app.get('/admin/teams-summary', (req, res) => {
  const sql = `
    select
      t.id,
      t.team_name,
      e.name as event_name,
      group_concat(u.email order by u.email separator ', ') as members
    from teams t
    join events e on t.event_id = e.id
    join team_members tm on tm.team_id = t.id
    join users u on u.id = tm.user_id
    group by t.id, t.team_name, e.name
    order by t.id desc
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Server error' });
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});