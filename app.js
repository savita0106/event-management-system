const API_BASE = 'http://localhost:3000';

function $(id) {
  return document.getElementById(id);
}

function page() {
  const p = (location.pathname || '').toLowerCase();
  return p.slice(p.lastIndexOf('/') + 1);
}

function roleFromPage() {
  const p = page();
  if (p.indexOf('admin-') === 0) return 'admin';
  if (p.indexOf('user-') === 0) return 'user';
  return '';
}

function getSession() {
  return JSON.parse(sessionStorage.getItem('session') || 'null');
}

function setSession(data) {
  sessionStorage.setItem('session', JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem('session');
}

function requireLogin() {
  const session = getSession();
  if (!session) {
    location.href = 'role.html';
    return null;
  }
  return session;
}

function removeEl(id) {
  const el = $(id);
  if (el) el.remove();
}

function applyNav(role) {
  if (role === 'user') {
    removeEl('navCreate');
    removeEl('navEdit');
    removeEl('navManage');
    removeEl('navAna');
  } else if (role === 'admin') {
    removeEl('navReg');
    removeEl('navSeat');
    removeEl('navWait');
    removeEl('navMy');
  }
}

function initLogout() {
  const link = $('logoutLink');
  if (!link) return;

  link.onclick = function () {
    clearSession();
  };
}

function initLogin() {
  const form = $('loginForm');
  if (!form) return;

  const role = roleFromPage();

  form.onsubmit = async function (e) {
    e.preventDefault();

    const username = ($('username').value || '').trim();
    const password = $('password').value || '';
    const msg = $('msg');

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });

      const data = await res.json();

      if (!res.ok) {
        if (msg) msg.textContent = data.message || 'Login failed';
        return;
      }

      setSession(data.user);
      location.href = 'view-events.html';
    } catch (err) {
      if (msg) msg.textContent = 'Server error';
    }
  };
}

function initSignup() {
  const form = $('signupForm');
  if (!form) return;

  const role = roleFromPage();

  form.onsubmit = async function (e) {
    e.preventDefault();

    const username = ($('username').value || '').trim();
    const password = $('password').value || '';
    const msg = $('msg');

    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });

      const data = await res.json();

      if (!res.ok) {
        if (msg) msg.textContent = data.message || 'Signup failed';
        return;
      }

      location.href = role === 'admin' ? 'admin-login.html' : 'user-login.html';
    } catch (err) {
      if (msg) msg.textContent = 'Server error';
    }
  };
}

async function renderEvents() {
  const session = requireLogin();
  if (!session) return;

  applyNav(session.role);

  const welcome = $('welcomeText');
  if (welcome) {
    welcome.textContent = 'Logged in as ' + session.role.toUpperCase() + ' (' + session.username + ')';
  }

  const q = (($('searchBox') && $('searchBox').value) || '').trim();
  const grid = $('eventGrid');
  const empty = $('emptyMsg');

  if (!grid || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/events?q=${encodeURIComponent(q)}`);
    const events = await res.json();

    grid.innerHTML = '';

    if (!events.length) {
      empty.style.display = 'block';
      empty.textContent = q ? 'No events found.' : 'Nothing is created.';
      return;
    }

    empty.style.display = 'none';

    events.forEach(function (ev) {
      const card = document.createElement('div');
      card.className = 'card';

      let extra = `
        <p><b>Date:</b> ${ev.date || ''} &nbsp; <b>Time:</b> ${ev.time || ''}</p>
        <p><b>Location:</b> ${ev.location || ''}</p>
        <p><b>Description:</b> ${ev.description || ''}</p>
      `;

      if (session.role === 'user') {
        extra += `
          <p><b>Total Seats:</b> ${ev.total_seats}</p>
          <p><b>Available Seats:</b> ${ev.available_seats}</p>
          <button class="btn-small" onclick="registerEvent(${ev.id})">Register</button>
        `;
      }

      card.innerHTML = `<h3>${ev.name || ''}</h3>${extra}`;
      grid.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load events.';
  }
}

function initViewEvents() {
  if (!$('eventGrid')) return;
  renderEvents();
}

async function initAdminCreate() {
  const form = $('eventForm');
  if (!form) return;

  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'admin') {
    location.href = 'role.html';
    return;
  }

  const params = new URLSearchParams(location.search);
  const editId = params.get('editId');

  if (editId) {
    try {
      const res = await fetch(`${API_BASE}/events/${editId}`);
      const ev = await res.json();

      if (ev) {
        if ($('pageTitle')) $('pageTitle').textContent = 'Edit Event';
        if ($('saveBtn')) $('saveBtn').textContent = 'Update Event';
        $('name').value = ev.name || '';
        $('date').value = ev.date || '';
        $('time').value = ev.time || '';
        $('location').value = ev.location || '';
        $('totalSeats').value = ev.total_seats || '';
        $('desc').value = ev.description || '';
      }
    } catch (err) {}
  }

  form.onsubmit = async function (e) {
    e.preventDefault();

    const body = {
      name: $('name').value || '',
      date: $('date').value || '',
      time: $('time').value || '',
      location: $('location').value || '',
      total_seats: parseInt($('totalSeats').value, 10),
      description: $('desc').value || ''
    };

    try {
      let res;

      if (editId) {
        res = await fetch(`${API_BASE}/events/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        res = await fetch(`${API_BASE}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }

      if (res.ok) {
        location.href = 'view-events.html';
      }
    } catch (err) {}
  };
}

function initAdminEdit() {
  const grid = $('editGrid');
  if (!grid) return;

  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'admin') {
    location.href = 'role.html';
    return;
  }

  renderAdminEdit();
}

async function renderAdminEdit() {
  const grid = $('editGrid');
  const empty = $('emptyMsg');
  if (!grid || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/events`);
    const list = await res.json();

    grid.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'Nothing is created.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (ev) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${ev.name || ''}</h3>
        <p><b>Date:</b> ${ev.date || ''} &nbsp; <b>Time:</b> ${ev.time || ''}</p>
        <p><b>Location:</b> ${ev.location || ''}</p>
        <p><b>Total Seats:</b> ${ev.total_seats}</p>
        <p><b>Available Seats:</b> ${ev.available_seats}</p>
        <p><b>Description:</b> ${ev.description || ''}</p>
        <button class="btn-small" onclick="editEvent(${ev.id})">Edit</button>
        <button class="btn-small btn-danger" onclick="deleteEvent(${ev.id})">Delete</button>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load events.';
  }
}

function editEvent(id) {
  location.href = 'admin-create.html?editId=' + encodeURIComponent(id);
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;

  try {
    const res = await fetch(`${API_BASE}/events/${id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      renderAdminEdit();
    }
  } catch (err) {}
}

async function registerEvent(eventId) {
  const session = getSession();
  if (!session || session.role !== 'user') {
    alert('Please login as user');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: session.id,
        event_id: eventId
      })
    });

    const data = await res.json();
    alert(data.message || 'Done');
    renderEvents();
  } catch (err) {
    alert('Registration failed');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initLogout();
  initLogin();
  initSignup();
  initViewEvents();
  initAdminCreate();
  initAdminEdit();
});

window.renderEvents = renderEvents;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.registerEvent = registerEvent;