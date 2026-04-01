const API_BASE = window.location.origin;
let barChartInstance = null;
let donutChartInstance = null;

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
    removeEl('navManageTeams');
    removeEl('navAna');
  } else if (role === 'admin') {
    removeEl('navMy');
    removeEl('navTeams');
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
  const availability = (($('availabilityFilter') && $('availabilityFilter').value) || 'all').trim();
  const grid = $('eventGrid');
  const empty = $('emptyMsg');

  if (!grid || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/events?q=${encodeURIComponent(q)}&availability=${encodeURIComponent(availability)}`);
    const events = await res.json();

    grid.innerHTML = '';

    if (!events.length) {
      empty.style.display = 'block';
      empty.textContent = q ? 'No events found.' : 'Nothing is created.';
      return;
    }

    empty.style.display = 'none';

    for (const ev of events) {
      const card = document.createElement('div');
      card.className = 'card';

      let extra = `
        <p><b>Date:</b> ${ev.date || ''} &nbsp; <b>Time:</b> ${ev.time || ''}</p>
        <p><b>Location:</b> ${ev.location || ''}</p>
        <p><b>Description:</b> ${ev.description || ''}</p>
        <p><b>Total Seats:</b> ${ev.total_seats}</p>
        <p><b>Available Seats:</b> ${ev.available_seats}</p>
        <p>
          <b>Status:</b>
          <span style="
            display:inline-block;
            padding:6px 10px;
            border-radius:999px;
            font-size:12px;
            font-weight:700;
            margin-left:6px;
            background:${Number(ev.available_seats) > 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'};
            color:${Number(ev.available_seats) > 0 ? '#86efac' : '#fca5a5'};
            border:1px solid ${Number(ev.available_seats) > 0 ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'};
          ">
            ${Number(ev.available_seats) > 0 ? 'Open' : 'Full / Waitlist'}
          </span>
        </p>
      `;

      if (session.role === 'user') {
        extra += `
          <div class="team-actions">
            <button class="btn-small" onclick="registerIndividual(${ev.id})">Register Individually</button>
            <button class="btn-small" onclick="showTeamRegistrationPrompt(${ev.id})">Register as Team</button>
          </div>
        `;
      }

      card.innerHTML = `<h3>${ev.name || ''}</h3>${extra}`;
      grid.appendChild(card);
    }
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

async function registerIndividual(eventId) {
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

function showTeamRegistrationPrompt(eventId) {
  const session = getSession();
  if (!session || session.role !== 'user') return;

  const teamName = prompt('Enter team name');
  if (!teamName || !teamName.trim()) return;

  const totalMembersInput = prompt('Enter total number of members including you (max 5)');
  if (!totalMembersInput) return;

  const totalMembers = parseInt(totalMembersInput, 10);

  if (isNaN(totalMembers) || totalMembers < 2 || totalMembers > 5) {
    alert('Team size must be between 2 and 5');
    return;
  }

  const memberUsernames = [];
  const otherCount = totalMembers - 1;

  for (let i = 1; i <= otherCount; i++) {
    const username = prompt(`Enter username of member ${i}`);
    if (!username || !username.trim()) {
      alert('Username is required');
      return;
    }
    memberUsernames.push(username.trim());
  }

  registerAsTeam(eventId, teamName.trim(), memberUsernames);
}

async function registerAsTeam(eventId, teamName, memberUsernames) {
  const session = getSession();
  if (!session || session.role !== 'user') {
    alert('Please login as user');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/register-team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        team_name: teamName,
        leader_user_id: session.id,
        member_usernames: memberUsernames
      })
    });

    const data = await res.json();
    alert(data.message || 'Done');
    renderEvents();
  } catch (err) {
    alert('Team registration failed');
  }
}

async function renderMyRegistrations() {
  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'user') {
    location.href = 'view-events.html';
    return;
  }

  const wrap = $('myRegGrid');
  const empty = $('emptyMsg');
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/my-registrations/${session.id}`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No registrations found.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (r) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${r.name || ''}</h3>
        <p><b>Date:</b> ${r.date || ''} &nbsp; <b>Time:</b> ${r.time || ''}</p>
        <p><b>Location:</b> ${r.location || ''}</p>
        <p><b>Status:</b> ${r.status || ''}</p>
        <p><b>Description:</b> ${r.description || ''}</p>
        <button class="btn-small btn-danger" onclick="cancelRegistration(${r.id})">Cancel</button>
      `;
      wrap.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load registrations.';
  }
}

async function cancelRegistration(registrationId) {
  if (!confirm('Cancel this registration?')) return;

  try {
    const res = await fetch(`${API_BASE}/my-registrations/${registrationId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    alert(data.message || 'Done');
    renderMyRegistrations();
    if ($('eventGrid')) renderEvents();
  } catch (err) {
    alert('Failed to cancel registration');
  }
}

function initMyRegistrations() {
  if (!$('myRegGrid')) return;
  renderMyRegistrations();
}

async function renderManageEvents() {
  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'admin') {
    location.href = 'view-events.html';
    return;
  }

  const wrap = $('manageEventGrid');
  const empty = $('emptyEvents');
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/admin/events-with-counts`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No events found.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (ev) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${ev.name || ''}</h3>
        <p><b>Registered:</b> ${Number(ev.registered_count || 0)}</p>
        <p><b>Waitlisted:</b> ${Number(ev.waitlisted_count || 0)}</p>
        <p><b>Available Seats:</b> ${ev.available_seats}</p>
        <button class="btn-small" onclick="loadAttendees(${ev.id}, '${(ev.name || '').replace(/'/g, "\\'")}')">Manage Attendees</button>
      `;
      wrap.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load events.';
  }
}

async function loadAttendees(eventId, eventName) {
  const title = $('selectedEventTitle');
  const listWrap = $('attendeeGrid');
  const empty = $('attendeeEmpty');
  const promoteBtn = $('promoteBtn');

  if (title) title.textContent = 'Attendees - ' + eventName;
  if (promoteBtn) {
    promoteBtn.style.display = 'inline-block';
    promoteBtn.onclick = function () {
      promoteWaitlist(eventId);
    };
  }

  try {
    const res = await fetch(`${API_BASE}/admin/attendees/${eventId}`);
    const list = await res.json();

    if (!listWrap || !empty) return;

    listWrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No attendees for this event.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (row) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${row.username || ''}</h3>
        <p><b>User ID:</b> ${row.user_id || ''}</p>
        <p><b>Role:</b> ${row.role || ''}</p>
        <p><b>Registration Status:</b> ${row.status || ''}</p>
        <p><b>Registered At:</b> ${row.registered_at || ''}</p>
        <p><b>Event:</b> ${row.event_name || ''}</p>
        <p><b>Date:</b> ${row.event_date || ''}</p>
        <p><b>Time:</b> ${row.event_time || ''}</p>
        <p><b>Location:</b> ${row.event_location || ''}</p>
      `;
      listWrap.appendChild(card);
    });
  } catch (err) {
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = 'Failed to load attendees.';
    }
  }
}

async function promoteWaitlist(eventId) {
  try {
    const res = await fetch(`${API_BASE}/admin/promote/${eventId}`, {
      method: 'POST'
    });
    const data = await res.json();
    alert(data.message || 'Done');
    renderManageEvents();
  } catch (err) {
    alert('Failed to promote waitlisted user');
  }
}

function initManageAttendees() {
  if (!$('manageEventGrid')) return;
  renderManageEvents();
}

function showCreateTeamPrompt(eventId) {
  const session = getSession();
  if (!session || session.role !== 'user') return;

  const teamName = prompt('Enter team name');
  if (!teamName) return;

  let maxMembers = prompt('Enter max members (default 4)');
  if (!maxMembers) maxMembers = 4;

  createTeam(eventId, teamName.trim(), parseInt(maxMembers, 10));
}

async function createTeam(eventId, teamName, maxMembers) {
  const session = getSession();
  if (!session) return;

  try {
    const res = await fetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        team_name: teamName,
        leader_user_id: session.id,
        max_members: maxMembers || 4
      })
    });

    const data = await res.json();
    alert(data.message || 'Done');
    loadTeamsForEvent(eventId);
  } catch (err) {
    alert('Failed to create team');
  }
}

async function loadTeamsForEvent(eventId) {
  const session = getSession();
  if (!session || session.role !== 'user') return;

  const wrap = $('teamWrap' + eventId);
  if (!wrap) return;

  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/teams`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      wrap.innerHTML = '<p class="empty">No teams yet.</p>';
      return;
    }

    list.forEach(function (team) {
      const item = document.createElement('div');
      item.className = 'team-item';
      item.innerHTML = `
        <p><b>Team:</b> ${team.team_name}</p>
        <p><b>Leader:</b> ${team.leader_name}</p>
        <p><b>Members:</b> ${team.member_count} / ${team.max_members}</p>
        <div class="team-actions">
          <button class="btn-small" onclick="joinTeam(${team.id}, ${eventId})">Join Team</button>
          <button class="btn-small" onclick="viewTeamMembers(${team.id})">View Members</button>
        </div>
      `;
      wrap.appendChild(item);
    });
  } catch (err) {
    wrap.innerHTML = '<p class="empty">Failed to load teams.</p>';
  }
}

async function joinTeam(teamId, eventId) {
  const session = getSession();
  if (!session) return;

  try {
    const res = await fetch(`${API_BASE}/teams/${teamId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: session.id })
    });

    const data = await res.json();
    alert(data.message || 'Done');
    loadTeamsForEvent(eventId);
  } catch (err) {
    alert('Failed to join team');
  }
}

async function viewTeamMembers(teamId) {
  try {
    const res = await fetch(`${API_BASE}/teams/${teamId}/members`);
    const list = await res.json();

    let text = 'Team Members:\n\n';
    list.forEach(function (m, index) {
      text += (index + 1) + '. ' + m.username + '\n';
    });

    alert(text);
  } catch (err) {
    alert('Failed to load team members');
  }
}

async function renderMyTeams() {
  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'user') {
    location.href = 'view-events.html';
    return;
  }

  const wrap = $('myTeamsGrid');
  const empty = $('emptyTeamsMsg');
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/my-teams/${session.id}`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No teams found.';
      return;
    }

    empty.style.display = 'none';

    for (const team of list) {
      const membersRes = await fetch(`${API_BASE}/teams/${team.team_id}/members`);
      const members = await membersRes.json();

      const card = document.createElement('div');
      card.className = 'card';

      const isLeader = String(team.leader_user_id) === String(session.id);

      let memberHtml = '';
      members.forEach(function (m) {
        memberHtml += `<p>${m.username}</p>`;
      });

      card.innerHTML = `
        <h3>${team.team_name}</h3>
        <p><b>Event:</b> ${team.event_name}</p>
        <p><b>Date:</b> ${team.event_date || ''} &nbsp; <b>Time:</b> ${team.event_time || ''}</p>
        <p><b>Location:</b> ${team.event_location || ''}</p>
        <p><b>Role:</b> ${isLeader ? 'Leader' : 'Member'}</p>
        <p><b>Max Members:</b> ${team.max_members}</p>
        <div class="team-box">
          <h4>Members</h4>
          ${memberHtml}
        </div>
        <div class="team-actions">
          <button class="btn-small btn-danger" onclick="leaveTeam(${team.team_id})">${isLeader ? 'Delete Team' : 'Leave Team'}</button>
        </div>
      `;
      wrap.appendChild(card);
    }
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load teams.';
  }
}

async function leaveTeam(teamId) {
  const session = getSession();
  if (!session) return;

  if (!confirm('Are you sure?')) return;

  try {
    const res = await fetch(`${API_BASE}/teams/${teamId}/leave/${session.id}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    alert(data.message || 'Done');
    renderMyTeams();
  } catch (err) {
    alert('Failed to leave team');
  }
}

function initMyTeams() {
  if (!$('myTeamsGrid')) return;
  renderMyTeams();
}

async function renderManageTeams() {
  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'admin') {
    location.href = 'view-events.html';
    return;
  }

  const wrap = $('teamSummaryGrid');
  const empty = $('emptyTeamSummary');
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/admin/teams-summary`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No teams found.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (team) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${team.team_name}</h3>
        <p><b>Event:</b> ${team.event_name}</p>
        <p><b>Users:</b> ${team.members || ''}</p>
      `;
      wrap.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load teams.';
  }
}

async function loadAdminTeams(eventId, eventName) {
  const title = $('selectedTeamEventTitle');
  const wrap = $('adminTeamGrid');
  const empty = $('emptyAdminTeams');

  if (title) title.textContent = 'Teams - ' + eventName;
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/admin/teams/${eventId}`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No teams found for this event.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (team) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${team.team_name}</h3>
        <p><b>Leader:</b> ${team.leader_name}</p>
        <p><b>Members:</b> ${team.member_count} / ${team.max_members}</p>
        <div class="team-actions">
          <button class="btn-small" onclick="loadAdminTeamMembers(${team.id}, '${(team.team_name || '').replace(/'/g, "\\'")}')">View Members</button>
          <button class="btn-small btn-danger" onclick="deleteAdminTeam(${team.id}, ${eventId}, '${(eventName || '').replace(/'/g, "\\'")}')">Delete Team</button>
        </div>
      `;
      wrap.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load teams.';
  }
}

async function loadAdminTeamMembers(teamId, teamName) {
  const title = $('selectedAdminTeamTitle');
  const wrap = $('adminTeamMembersGrid');
  const empty = $('emptyAdminTeamMembers');

  if (title) title.textContent = 'Members - ' + teamName;
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/admin/team-members/${teamId}`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No members found.';
      return;
    }

    empty.style.display = 'none';

    list.forEach(function (member) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${member.username}</h3>
        <p><b>User ID:</b> ${member.user_id}</p>
        <p><b>Joined At:</b> ${member.joined_at || ''}</p>
        <button class="btn-small btn-danger" onclick="removeAdminMember(${teamId}, ${member.user_id})">Remove Member</button>
      `;
      wrap.appendChild(card);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load team members.';
  }
}

async function deleteAdminTeam(teamId, eventId, eventName) {
  if (!confirm('Delete this team?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/teams/${teamId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    alert(data.message || 'Done');
    renderManageTeams();
    loadAdminTeams(eventId, eventName);
    if ($('adminTeamMembersGrid')) $('adminTeamMembersGrid').innerHTML = '';
  } catch (err) {
    alert('Failed to delete team');
  }
}

async function removeAdminMember(teamId, userId) {
  if (!confirm('Remove this member?')) return;

  try {
    const res = await fetch(`${API_BASE}/admin/team-members/${teamId}/${userId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    alert(data.message || 'Done');
    loadAdminTeamMembers(teamId, 'Selected Team');
  } catch (err) {
    alert('Failed to remove member');
  }
}

function initManageTeams() {
  if (!$('teamSummaryGrid')) return;
  renderManageTeams();
}

async function renderAnalytics() {
  const session = requireLogin();
  if (!session) return;
  if (session.role !== 'admin') {
    location.href = 'view-events.html';
    return;
  }

  const wrap = $('analyticsGrid');
  const empty = $('emptyMsg');
  if (!wrap || !empty) return;

  try {
    const res = await fetch(`${API_BASE}/admin/analytics`);
    const list = await res.json();

    wrap.innerHTML = '';

    if (!list.length) {
      empty.style.display = 'block';
      empty.textContent = 'No analytics available.';
      return;
    }

    empty.style.display = 'none';

    let totalEvents = list.length;
    let totalRegistrations = 0;
    let totalWaitlisted = 0;
    let totalTeams = 0;
    let totalFilledSeats = 0;
    let totalAvailableSeats = 0;

    const eventNames = [];
    const registeredCounts = [];

    list.forEach(function (ev) {
      totalRegistrations += Number(ev.registered_count || 0);
      totalWaitlisted += Number(ev.waitlisted_count || 0);
      totalTeams += Number(ev.team_count || 0);
      totalFilledSeats += Number(ev.filled_seats || 0);
      totalAvailableSeats += Number(ev.available_seats || 0);

      eventNames.push(ev.name || 'Event');
      registeredCounts.push(Number(ev.registered_count || 0));

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${ev.name || ''}</h3>
        <p><b>Total Seats:</b> ${ev.total_seats}</p>
        <p><b>Filled Seats:</b> ${ev.filled_seats}</p>
        <p><b>Available Seats:</b> ${ev.available_seats}</p>
        <p><b>Registered Users:</b> ${Number(ev.registered_count || 0)}</p>
        <p><b>Waitlisted Users:</b> ${Number(ev.waitlisted_count || 0)}</p>
        <p><b>Total Teams:</b> ${Number(ev.team_count || 0)}</p>
        <p><b>Team Members:</b> ${Number(ev.team_member_count || 0)}</p>
      `;
      wrap.appendChild(card);
    });

    if ($('totalEvents')) $('totalEvents').textContent = totalEvents;
    if ($('totalRegistrations')) $('totalRegistrations').textContent = totalRegistrations;
    if ($('totalWaitlisted')) $('totalWaitlisted').textContent = totalWaitlisted;
    if ($('totalTeams')) $('totalTeams').textContent = totalTeams;

    const barCanvas = $('barChart');
    const donutCanvas = $('donutChart');

    if (barChartInstance) barChartInstance.destroy();
    if (donutChartInstance) donutChartInstance.destroy();

    if (barCanvas && typeof Chart !== 'undefined') {
      barChartInstance = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: eventNames,
          datasets: [{
            label: 'Registered Users',
            data: registeredCounts,
            borderWidth: 1,
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              labels: { color: '#ffffff' }
            }
          },
          scales: {
            x: {
              ticks: { color: '#cbd5e1' },
              grid: { color: 'rgba(255,255,255,0.08)' }
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#cbd5e1' },
              grid: { color: 'rgba(255,255,255,0.08)' }
            }
          }
        }
      });
    }

    if (donutCanvas && typeof Chart !== 'undefined') {
      donutChartInstance = new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Filled Seats', 'Available Seats', 'Waitlisted'],
          datasets: [{
            data: [totalFilledSeats, totalAvailableSeats, totalWaitlisted],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#ffffff' }
            }
          }
        }
      });
    }
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Failed to load analytics.';
  }
}

function initAnalytics() {
  if (!$('analyticsGrid')) return;
  renderAnalytics();
}

document.addEventListener('DOMContentLoaded', function () {
  initLogout();
  initLogin();
  initSignup();
  initViewEvents();
  initAdminCreate();
  initAdminEdit();
  initMyRegistrations();
  initManageAttendees();
  initMyTeams();
  initManageTeams();
  initAnalytics();
});

window.renderEvents = renderEvents;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.cancelRegistration = cancelRegistration;
window.loadAttendees = loadAttendees;


window.leaveTeam = leaveTeam;

window.registerIndividual = registerIndividual;
window.showTeamRegistrationPrompt = showTeamRegistrationPrompt;