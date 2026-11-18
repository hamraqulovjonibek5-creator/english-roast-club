/**
 * English Roast Club — Client Application
 * Ultra-Modern Vercel / Linear inspired Interactive Engine
 */

// Global State
const state = {
  currentUser: null,
  users: [],
  levels: {},
  curriculum: null,
  selectedDay: 1,
  activeTab: 'tab-curriculum',
  settings: {
    telegram_link: 'https://t.me/english_roast_club',
    meet_link: 'https://meet.google.com/new',
    daily_call_time: '21:00'
  },
  vocabList: [],
  quiz: {
    questions: [],
    currentIndex: 0,
    score: 0,
    answered: false
  },
  duel: {
    user1: null,
    user2: null,
    questions: [],
    currentRound: 0,
    p1Score: 0,
    p2Score: 0,
    activeTurn: 1, // 1 or 2
    answeredThisRound: 0
  }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  setupTabNavigation();
  await loadInitialData();
  setupEventListeners();
});

async function loadInitialData() {
  try {
    const [lvlRes, curRes, setRes] = await Promise.all([
      fetch('/api/levels'),
      fetch('/api/curriculum'),
      fetch('/api/settings')
    ]);

    state.levels = await lvlRes.json();
    state.curriculum = await curRes.json();
    state.settings = await setRes.json();

    updateSettingsUI();
    await loadCurrentUserAndUsers();
    renderDayScroller();
    await loadDayDetails(state.selectedDay);
    renderMurphyRoadmap();
  } catch (err) {
    console.error("Initialization error:", err);
    showToast("Ma'lumotlarni yuklashda xatolik yuz berdi", "error");
  }
}

async function loadCurrentUserAndUsers() {
  const [meRes, usersRes] = await Promise.all([
    fetch('/api/auth/me'),
    fetch('/api/users')
  ]);
  const meData = await meRes.json();
  state.users = await usersRes.json();

  if (meData.authenticated && meData.user) {
    state.currentUser = meData.user;
  } else if (state.users.length > 0) {
    state.currentUser = state.users[0];
  }

  // Set default selected day based on completed days
  if (state.currentUser) {
    state.selectedDay = Math.min((state.currentUser.completed_days || 0) + 1, 30);
  }

  updateHeaderUserPill();
  renderProfilesTab();
  renderLeaderboardTab();
  updateImmunityUI();
}

function updateSettingsUI() {
  const tgBtn = document.getElementById('btnTelegramLink');
  const meetBtn = document.getElementById('btnMeetLink');
  const tgHero = document.getElementById('heroTelegramBtn');
  const meetHero = document.getElementById('heroMeetBtn');

  if (tgBtn) tgBtn.href = state.settings.telegram_link || '#';
  if (meetBtn) meetBtn.href = state.settings.meet_link || '#';
  if (tgHero) tgHero.href = state.settings.telegram_link || '#';
  if (meetHero) meetHero.href = state.settings.meet_link || '#';

  const timeEl = document.getElementById('callTimeDisplay');
  if (timeEl) timeEl.textContent = state.settings.daily_call_time || '21:00';
}

// --- TAB NAVIGATION ---
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.nav-pill-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // Update nav buttons
  document.querySelectorAll('.nav-pill-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });

  // Update tab contents
  document.querySelectorAll('.tab-content-section').forEach(sec => {
    sec.classList.toggle('d-none', sec.id !== tabId);
  });

  // Trigger tab-specific refreshes
  if (tabId === 'tab-profiles') renderProfilesTab();
  if (tabId === 'tab-curriculum') loadDayDetails(state.selectedDay);
  if (tabId === 'tab-leaderboard') { renderLeaderboardTab(); loadActivityFeed(); }
  if (tabId === 'tab-vocab') { loadVocabVault(); }
  if (tabId === 'tab-guide') { renderMurphyRoadmap(); }
}

// --- HEADER USER PILL & SWITCHER ---
function updateHeaderUserPill() {
  const u = state.currentUser;
  if (!u) return;

  const avatarEl = document.getElementById('headerAvatar');
  const nameEl = document.getElementById('headerUserName');
  const streakEl = document.getElementById('headerStreak');
  const pointsEl = document.getElementById('headerPoints');

  if (avatarEl) avatarEl.textContent = u.avatar || '⚡';
  if (nameEl) nameEl.textContent = u.display_name || u.name;
  if (streakEl) streakEl.textContent = u.streak || 0;
  if (pointsEl) pointsEl.textContent = u.total_points || 0;
}

// --- TAB 1: PROFILES & AUTH ---
function renderProfilesTab() {
  const u = state.currentUser;
  if (!u) return;

  // Render showcase card
  document.getElementById('profCardAvatar').textContent = u.avatar || '⚡';
  document.getElementById('profCardName').textContent = u.display_name || u.name;
  document.getElementById('profCardUsername').textContent = `@${u.name}`;
  document.getElementById('profCardBio').textContent = u.bio || 'B1 warrior on the road to B2 fluency 🔥';
  document.getElementById('profCardStreak').textContent = `🔥 ${u.streak} kunlik streak`;
  document.getElementById('profCardPoints').textContent = `${u.total_points} ball`;
  document.getElementById('profCardFine').textContent = `${u.total_fine.toLocaleString()} so'm`;
  document.getElementById('profCardDays').textContent = `${u.completed_days || 0}/30 kun`;
  document.getElementById('profCardLevelBadge').textContent = `Daraja ${u.current_level} • Target: Lvl ${u.target_level || 3}`;

  const shieldEl = document.getElementById('profCardShieldBadge');
  if (shieldEl) {
    shieldEl.className = u.immunity_used ? 'badge bg-secondary' : 'badge bg-success';
    shieldEl.textContent = u.immunity_used ? '🛡️ Qalqon Ishlatilgan' : '🛡️ Qalqon Mavjud (1x)';
  }

  // Populate edit form
  document.getElementById('editDisplayName').value = u.display_name || u.name;
  document.getElementById('editAvatar').value = u.avatar || '⚡';
  document.getElementById('editBio').value = u.bio || '';
  document.getElementById('editTargetLevel').value = u.target_level || 3;
  document.getElementById('editCurrentLevel').value = u.current_level || 1;

  // Render quick switcher list of all users
  const switchList = document.getElementById('quickSwitchUserList');
  if (switchList) {
    switchList.innerHTML = state.users.map(user => `
      <div class="d-flex align-items-center justify-content-between p-2 rounded mb-2" 
           style="background: ${user.id === u.id ? 'rgba(198, 255, 0, 0.12)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${user.id === u.id ? 'var(--accent-lime)' : 'var(--border-subtle)'}; cursor: pointer;"
           onclick="switchUserAccount(${user.id})">
        <div class="d-flex align-items-center gap-2">
          <span style="font-size:1.3rem;">${user.avatar || '⚡'}</span>
          <div>
            <div class="fw-bold small ${user.id === u.id ? 'text-lime' : 'text-light'}">${user.display_name || user.name}</div>
            <div class="text-dim" style="font-size:0.75rem;">Ball: ${user.total_points} | 🔥 ${user.streak} | Jarima: ${user.total_fine.toLocaleString()} so'm</div>
          </div>
        </div>
        <div>
          ${user.id === u.id ? '<span class="badge rule-badge">Faol</span>' : '<button class="btn btn-dark-subtle btn-sm py-1 px-2" style="font-size:0.75rem;">O\'tish</button>'}
        </div>
      </div>
    `).join('');
  }
}

async function switchUserAccount(userId) {
  try {
    const res = await fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.currentUser = data.user;
    showToast(`${data.user.display_name || data.user.name} profiliga o'tildi!`, 'info');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveProfileSettings() {
  const u = state.currentUser;
  if (!u) return;

  const payload = {
    display_name: document.getElementById('editDisplayName').value.trim(),
    avatar: document.getElementById('editAvatar').value.trim() || '⚡',
    bio: document.getElementById('editBio').value.trim(),
    target_level: parseInt(document.getElementById('editTargetLevel').value),
    current_level: parseInt(document.getElementById('editCurrentLevel').value),
    password: document.getElementById('editPassword').value.trim()
  };

  try {
    const res = await fetch(`/api/users/${u.id}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.currentUser = data.user;
    showToast("Profil ma'lumotlari muvaffaqiyatli saqlandi!", 'success');
    document.getElementById('editPassword').value = '';
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegisterNewUser() {
  const username = document.getElementById('regUsername').value.trim();
  const display_name = document.getElementById('regDisplayName').value.trim() || username;
  const password = document.getElementById('regPassword').value.trim();
  const avatar = document.getElementById('regAvatar').value.trim() || '⚡';
  const current_level = parseInt(document.getElementById('regLevel').value) || 1;

  if (!username) return showToast("Foydalanuvchi nomini kiriting!", "error");

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, display_name, password, avatar, current_level })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.currentUser = data.user;
    showToast("Yangi foydalanuvchi yaratildi va tizimga kirildi! Xush kelibsiz!", "success");
    bootstrap.Modal.getInstance(document.getElementById('registerModal')).hide();
    await loadInitialData();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleLoginUser() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!username) return showToast("Foydalanuvchi nomini kiriting!", "error");

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.currentUser = data.user;
    showToast(data.message, "success");
    bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
    await loadInitialData();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function selectPresetAvatar(emoji) {
  document.getElementById('editAvatar').value = emoji;
}

// --- TAB 2: 30-DAY CURRICULUM & DAILY TASKS ---
function renderDayScroller() {
  const container = document.getElementById('dayScrollerTrack');
  if (!container) return;

  let html = '';
  for (let i = 1; i <= 30; i++) {
    const isCompleted = state.currentUser && i <= (state.currentUser.completed_days || 0);
    const isActive = i === state.selectedDay;
    html += `
      <div class="day-chip ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" onclick="selectChallengeDay(${i})">
        <div class="chip-label">Day</div>
        <div class="chip-num">${i}</div>
        <div style="font-size:0.65rem;">${isCompleted ? '✓ 100' : (isActive ? '● Faol' : '—')}</div>
      </div>
    `;
  }
  container.innerHTML = html;
}

async function selectChallengeDay(dayNum) {
  state.selectedDay = dayNum;
  renderDayScroller();
  await loadDayDetails(dayNum);
}

async function loadDayDetails(dayNum) {
  if (!state.curriculum || !state.curriculum.days) return;

  const dayData = state.curriculum.days.find(d => d.day === dayNum) || state.curriculum.days[0];
  const u = state.currentUser;
  const userLvl = u ? u.current_level : 1;
  const lvlInfo = state.levels[userLvl] || { vocab_words: 10, essay_words: 40 };

  // Set Day Title and Subtitle
  document.getElementById('curriculumDayBadge').textContent = `KUN ${dayNum} / 30`;
  document.getElementById('curriculumDate').textContent = new Date().toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', year: 'numeric' });
  
  // Grammar Info
  document.getElementById('grammarUnitTitle').textContent = `Raymond Murphy Unit ${dayData.grammar_topic.unit}: ${dayData.grammar_topic.name}`;
  document.getElementById('grammarRuleSummary').textContent = dayData.grammar_topic.rule;
  document.getElementById('taskLabelGrammar').textContent = `Murphy Unit ${dayData.grammar_topic.unit} nazariyasi va barcha mashqlari bajarildi`;

  // Bonus Idiom
  document.getElementById('idiomPhrase').textContent = dayData.bonus_idiom.phrase;
  document.getElementById('idiomTranslation').textContent = dayData.bonus_idiom.translation;

  // Speaking Debate
  document.getElementById('debateQuestion').textContent = dayData.speaking_debate;

  // Writing topic
  document.getElementById('writingTopicHeader').textContent = dayData.writing_topic;
  document.getElementById('requiredWordsThreshold').textContent = lvlInfo.essay_words;
  document.getElementById('taskLabelWriting').textContent = `Insho yozildi (kamida ${lvlInfo.essay_words} so'z)`;

  // Vocab task label
  document.getElementById('taskLabelVocab').textContent = `Yangi so'zlar qo'shildi (baza talabi: ${lvlInfo.vocab_words} ta)`;

  // Fetch if user already submitted log for this day
  if (u) {
    try {
      const res = await fetch(`/api/users/${u.id}/day/${dayNum}`);
      const log = await res.json();
      if (log) {
        document.getElementById('taskGrammar').checked = log.grammar_done;
        document.getElementById('taskVocab').checked = log.vocab_done;
        document.getElementById('taskListening').checked = log.listening_done;
        document.getElementById('taskReading').checked = log.reading_done;
        document.getElementById('taskWriting').checked = log.writing_done;
        document.getElementById('essayInputArea').value = log.writing_text || '';
        document.getElementById('dayStatusAlert').classList.remove('d-none');
        document.getElementById('dayStatusText').textContent = `Kun topshirilgan! Natija: ${log.points} ball • Jarima: ${log.daily_fine.toLocaleString()} so'm (${log.category})`;
      } else {
        // Reset inputs
        ['taskGrammar', 'taskVocab', 'taskListening', 'taskReading', 'taskWriting'].forEach(id => {
          document.getElementById(id).checked = false;
        });
        document.getElementById('essayInputArea').value = '';
        document.getElementById('dayStatusAlert').classList.add('d-none');
      }
    } catch (e) {
      console.warn("Could not fetch log for day", e);
    }
  }

  updateLiveWordCounter();
  updateLiveScoreCalculator();
  updateTaskCardStyles();
}

function updateTaskCardStyles() {
  ['taskGrammar', 'taskVocab', 'taskListening', 'taskReading', 'taskWriting'].forEach(id => {
    const chk = document.getElementById(id);
    const card = chk.closest('.task-item-card');
    if (chk && card) {
      card.classList.toggle('done', chk.checked);
    }
  });
}

function toggleTask(id) {
  const chk = document.getElementById(id);
  chk.checked = !chk.checked;
  updateTaskCardStyles();
  updateLiveScoreCalculator();
}

function updateLiveWordCounter() {
  const text = document.getElementById('essayInputArea').value.trim();
  const words = text ? text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [] : [];
  const count = words.length;

  const u = state.currentUser;
  const userLvl = u ? u.current_level : 1;
  const required = state.levels[userLvl] ? state.levels[userLvl].essay_words : 40;

  const countBadge = document.getElementById('liveWordCountBadge');
  const progressBar = document.getElementById('liveWordProgressBar');

  countBadge.textContent = `${count} / ${required} so'z`;

  const percent = Math.min(100, Math.round((count / required) * 100));
  progressBar.style.width = `${percent}%`;

  if (count >= required) {
    countBadge.className = 'badge bg-success';
    progressBar.classList.add('met');
  } else if (count >= required * 0.6) {
    countBadge.className = 'badge bg-warning text-dark';
    progressBar.classList.remove('met');
  } else {
    countBadge.className = 'badge bg-danger';
    progressBar.classList.remove('met');
  }

  updateLiveScoreCalculator();
}

function updateLiveScoreCalculator() {
  const g = document.getElementById('taskGrammar').checked;
  const v = document.getElementById('taskVocab').checked;
  const l = document.getElementById('taskListening').checked;
  const r = document.getElementById('taskReading').checked;
  const w = document.getElementById('taskWriting').checked;

  const tasksCount = [g, v, l, r, w].filter(Boolean).length;
  const points = tasksCount * 20;

  let fine = 0;
  let fineLabel = "0 so'm (Jarima yo'q 🎉)";
  let fineClass = "text-success";

  if (points === 100) {
    fine = 0;
    fineLabel = "0 so'm (Jarima yo'q! 🔥)";
    fineClass = "text-lime fw-bold";
  } else if (points >= 60) {
    fine = 5000;
    fineLabel = "5,000 so'm (O'rtacha jarima ⚠️)";
    fineClass = "text-warning fw-bold";
  } else {
    fine = 10000;
    fineLabel = "10,000 so'm (Katta jarima 💀)";
    fineClass = "text-danger fw-bold";
  }

  document.getElementById('liveScorePreview').textContent = `${points} / 100 Ball`;
  const finePreviewEl = document.getElementById('liveFinePreview');
  finePreviewEl.textContent = fineLabel;
  finePreviewEl.className = fineClass;
}

async function submitDailyLogForm() {
  const u = state.currentUser;
  if (!u) return showToast("Iltimos, avval foydalanuvchini tanlang", "error");

  const writingText = document.getElementById('essayInputArea').value.trim();
  const payload = {
    user_id: u.id,
    day_num: state.selectedDay,
    grammar_done: document.getElementById('taskGrammar').checked,
    vocab_done: document.getElementById('taskVocab').checked,
    listening_done: document.getElementById('taskListening').checked,
    reading_done: document.getElementById('taskReading').checked,
    writing_done: document.getElementById('taskWriting').checked,
    writing_text: writingText
  };

  try {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.currentUser = data.user;

    if (data.log.points === 100) {
      launchConfetti();
      showToast(`Ajoyib! 100 ball to'plandi va kun muvaffaqiyatli topshirildi! 🔥`, 'success');
    } else {
      showToast(`Kun saqlandi! Ball: ${data.log.points} • Jarima: ${data.log.daily_fine.toLocaleString()} so'm`, 'info');
    }

    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// --- TAB 3: LEADERBOARD & ACTIVITY ---
async function renderLeaderboardTab() {
  try {
    const res = await fetch('/api/leaderboard');
    const leaders = await res.json();

    // Top 3 Podium
    const p1 = leaders[0] || null;
    const p2 = leaders[1] || null;
    const p3 = leaders[2] || null;

    renderPodiumSlot('podium1', p1, 1);
    renderPodiumSlot('podium2', p2, 2);
    renderPodiumSlot('podium3', p3, 3);

    // Full Leaderboard Table
    const tbody = document.getElementById('leaderboardTableBody');
    if (tbody) {
      tbody.innerHTML = leaders.map(u => {
        let catClass = 'badge-alfa';
        if (u.total_points < 300) catClass = 'badge-sudraluvchi';
        if (u.total_fine > 20000) catClass = 'badge-dangasa';

        return `
          <tr style="border-bottom: 1px solid var(--border-subtle); vertical-align: middle;">
            <td class="fw-bold ps-3">${u.rank === 1 ? '🥇 1' : (u.rank === 2 ? '🥈 2' : (u.rank === 3 ? '🥉 3' : u.rank))}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <span style="font-size:1.4rem;">${u.avatar || '⚡'}</span>
                <div>
                  <div class="fw-bold text-light">${u.display_name || u.name}</div>
                  <div class="text-dim" style="font-size:0.75rem;">@${u.name} • Lvl ${u.current_level}</div>
                </div>
              </div>
            </td>
            <td><span class="badge ${catClass}">${u.category}</span></td>
            <td class="fw-bold text-lime">🔥 ${u.streak} kun</td>
            <td class="fw-bold fs-6">${u.total_points}</td>
            <td class="text-danger fw-semibold">${u.total_fine.toLocaleString()} so'm</td>
            <td>
              ${u.immunity_used 
                ? '<span class="badge bg-secondary">Ishlatilgan</span>' 
                : '<span class="badge bg-success">🛡️ Mavjud</span>'}
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error("Leaderboard load error:", err);
  }
}

function renderPodiumSlot(containerId, user, rank) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!user) {
    el.innerHTML = '<div class="text-dim small">Ishtirokchi yo\'q</div>';
    return;
  }
  const medal = rank === 1 ? '👑 CHEMPION' : (rank === 2 ? '⚡ 2-O\'RIN' : '🚀 3-O\'RIN');
  el.innerHTML = `
    <div class="podium-rank-badge ${rank === 1 ? 'badge-alfa' : 'badge-sudraluvchi'}">${medal}</div>
    <div style="font-size: 2.5rem; margin-bottom: 8px;">${user.avatar || '⚡'}</div>
    <h5 class="fw-bold mb-1 text-light">${user.display_name || user.name}</h5>
    <div class="small text-dim mb-2">🔥 ${user.streak} kunlik streak</div>
    <div class="fs-4 fw-black text-lime mb-1">${user.total_points} <small class="fs-6 text-dim">ball</small></div>
    <div class="small ${user.total_fine > 0 ? 'text-danger' : 'text-success'}">Jarima: ${user.total_fine.toLocaleString()} so'm</div>
  `;
}

async function loadActivityFeed() {
  const feedEl = document.getElementById('activityFeedContainer');
  if (!feedEl) return;
  try {
    const res = await fetch('/api/activity');
    const items = await res.json();
    if (!items.length) {
      feedEl.innerHTML = `<div class="text-dim p-3">Hozircha yangi topshiriqlar qayd etilmagan. Birinchi bo'lib topshiring!</div>`;
      return;
    }

    feedEl.innerHTML = items.map(act => `
      <div class="p-3 rounded mb-2" style="background: rgba(14, 18, 28, 0.7); border: 1px solid var(--border-subtle);">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="d-flex align-items-center gap-2">
            <span style="font-size:1.2rem;">${act.avatar}</span>
            <strong class="text-light">${act.user_name}</strong>
            <span class="badge rule-badge">Kun ${act.day_num}</span>
          </div>
          <div class="small text-dim">${act.date}</div>
        </div>
        <div class="d-flex justify-content-between align-items-center small mt-2">
          <span class="fw-bold text-lime">+${act.points} ball (${act.category})</span>
          <span class="${act.daily_fine > 0 ? 'text-danger' : 'text-success'}">Jarima: ${act.daily_fine.toLocaleString()} so'm</span>
        </div>
        ${act.essay_snippet ? `<div class="text-muted small mt-2 fst-italic" style="border-left: 2px solid var(--accent-lime); padding-left: 8px;">"${act.essay_snippet}"</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error("Activity load error:", err);
  }
}

async function runCyclePenaltyCheck() {
  try {
    const res = await fetch('/api/check_cycle', { method: 'POST' });
    const data = await res.json();
    let msg = "5 Kunlik Sikl Tekshiruvi Natijalari:\n\n";
    data.results.forEach(r => {
      msg += `• ${r.user_name}: ${r.message}\n`;
    });
    alert(msg);
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateImmunityUI() {
  const u = state.currentUser;
  const btn = document.getElementById('btnUseImmunity');
  const statusEl = document.getElementById('immunityStatusText');
  if (!u || !btn || !statusEl) return;

  if (u.immunity_used) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
    statusEl.textContent = "Siz ushbu 30 kunlik intensiv davomida 1 martalik immunitet qalqonidan foydalangansiz.";
  } else {
    btn.disabled = false;
    btn.classList.remove('opacity-50');
    statusEl.textContent = "Immunitet qalqoni mavjud! Jarimali kuningiz bo'lsa, 1 martalik jarimani bekor qilishingiz mumkin.";
  }
}

async function triggerEmergencyImmunity() {
  const u = state.currentUser;
  if (!u) return;

  if (!confirm("Haqiqatan ham 1 martalik Favqulodda Immunitet qalqonini faollashtirmoqchimisiz? Ushbu huquq 30 kunda faqat bir marta beriladi!")) {
    return;
  }

  try {
    const res = await fetch(`/api/users/${u.id}/immunity`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    await loadInitialData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- TAB 4: VOCAB VAULT & MINI QUIZ / DUEL ARENA ---
async function loadVocabVault() {
  const search = document.getElementById('vocabSearchInput')?.value || '';
  const userFilter = document.getElementById('vocabUserFilter')?.value || '';

  let url = `/api/vocab?q=${encodeURIComponent(search)}`;
  if (userFilter) url += `&user_id=${userFilter}`;

  try {
    const res = await fetch(url);
    state.vocabList = await res.json();
    renderVocabVaultList();
    renderVocabStats();
  } catch (err) {
    console.error("Vocab load error:", err);
  }
}

function renderVocabVaultList() {
  const listEl = document.getElementById('vocabVaultItems');
  if (!listEl) return;

  if (!state.vocabList.length) {
    listEl.innerHTML = `<div class="text-dim p-4 text-center">Lug'atda so'zlar topilmadi. Yangi so'z qo'shing!</div>`;
    return;
  }

  listEl.innerHTML = state.vocabList.map(v => `
    <div class="vocab-row">
      <div class="d-flex align-items-center gap-3">
        <button class="audio-btn" onclick="speakWord('${v.word.replace(/'/g, "\\'")}')" title="Tinglash">🔊</button>
        <div>
          <div class="d-flex align-items-center gap-2">
            <strong class="text-light fs-6">${v.word}</strong>
            <span class="badge bg-secondary" style="font-size:0.65rem;">${v.part_of_speech || 'word'}</span>
          </div>
          <div class="text-dim small">${v.translation}</div>
          ${v.example ? `<div class="text-muted small fst-italic mt-1" style="font-size:0.8rem;">"${v.example}"</div>` : ''}
        </div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteVocabWord(${v.id})" title="O'chirish">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderVocabStats() {
  const countEl = document.getElementById('vaultTotalWordsCount');
  if (countEl) countEl.textContent = state.vocabList.length;

  const u = state.currentUser;
  const reqEl = document.getElementById('vaultRequiredWordsCount');
  if (u && reqEl) {
    const lvlInfo = state.levels[u.current_level] || { vocab_words: 10 };
    reqEl.textContent = lvlInfo.vocab_words;
  }
}

function speakWord(word) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } else {
    showToast("Brauzeringiz ovozli o'qishni qo'llab-quvvatlamaydi", "info");
  }
}

async function addVocabWord() {
  const u = state.currentUser;
  if (!u) return showToast("Foydalanuvchi tanlanmagan", "error");

  const word = document.getElementById('newVocabWord').value.trim();
  const translation = document.getElementById('newVocabTrans').value.trim();
  const example = document.getElementById('newVocabExample').value.trim();
  const part_of_speech = document.getElementById('newVocabPos').value;

  if (!word || !translation) {
    return showToast("Inglizcha so'z va tarjimasini kiriting!", "error");
  }

  try {
    const res = await fetch('/api/vocab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: u.id,
        word,
        translation,
        example,
        part_of_speech
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('newVocabWord').value = '';
    document.getElementById('newVocabTrans').value = '';
    document.getElementById('newVocabExample').value = '';

    showToast(`"${word}" lug'at bazasiga qo'shildi!`, 'success');
    await loadVocabVault();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteVocabWord(id) {
  if (!confirm("Ushbu so'zni o'chirmoqchimisiz?")) return;
  try {
    const res = await fetch(`/api/vocab/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error("O'chirishda xatolik");
    showToast("So'z o'chirildi", 'info');
    await loadVocabVault();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Mini Quiz Logic
async function startMiniQuiz() {
  try {
    const res = await fetch('/api/quiz?limit=10');
    const data = await res.json();
    if (!data.questions || !data.questions.length) {
      return showToast("Quiz uchun lug'atda so'zlar yetarli emas!", "error");
    }

    state.quiz.questions = data.questions;
    state.quiz.currentIndex = 0;
    state.quiz.score = 0;
    state.quiz.answered = false;

    document.getElementById('quizStartScreen').classList.add('d-none');
    document.getElementById('quizArenaScreen').classList.remove('d-none');
    document.getElementById('quizResultScreen').classList.add('d-none');

    renderCurrentQuizQuestion();
  } catch (err) {
    showToast("Quizni yuklashda xatolik yuz berdi", "error");
  }
}

function renderCurrentQuizQuestion() {
  const q = state.quiz.questions[state.quiz.currentIndex];
  state.quiz.answered = false;

  document.getElementById('quizProgressBadge').textContent = `Savol ${state.quiz.currentIndex + 1} / ${state.quiz.questions.length}`;
  document.getElementById('quizCurrentScore').textContent = `Ball: ${state.quiz.score}`;
  document.getElementById('quizQuestionWord').textContent = q.word;
  document.getElementById('quizQuestionExample').textContent = q.example ? `"${q.example}"` : '';

  const optionsContainer = document.getElementById('quizOptionsContainer');
  optionsContainer.innerHTML = q.options.map(opt => `
    <button class="quiz-option-btn" onclick="handleQuizAnswer(this, '${opt.replace(/'/g, "\\'")}', '${q.correct_answer.replace(/'/g, "\\'")}')">
      <span>${opt}</span>
      <span class="quiz-feedback-icon"></span>
    </button>
  `).join('');
}

function handleQuizAnswer(buttonEl, selected, correct) {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const buttons = document.querySelectorAll('.quiz-option-btn');
  if (selected === correct) {
    buttonEl.classList.add('correct');
    buttonEl.querySelector('.quiz-feedback-icon').textContent = '✓';
    state.quiz.score += 10;
    showToast("To'g'ri javob! +10 ball", "success");
  } else {
    buttonEl.classList.add('wrong');
    buttonEl.querySelector('.quiz-feedback-icon').textContent = '✗';
    buttons.forEach(b => {
      if (b.innerText.trim().startsWith(correct)) {
        b.classList.add('correct');
      }
    });
    showToast(`Noto'g'ri! To'g'ri javob: ${correct}`, "error");
  }

  document.getElementById('quizCurrentScore').textContent = `Ball: ${state.quiz.score}`;

  setTimeout(() => {
    state.quiz.currentIndex++;
    if (state.quiz.currentIndex < state.quiz.questions.length) {
      renderCurrentQuizQuestion();
    } else {
      finishQuiz();
    }
  }, 1200);
}

function finishQuiz() {
  document.getElementById('quizArenaScreen').classList.add('d-none');
  document.getElementById('quizResultScreen').classList.remove('d-none');

  const finalScore = state.quiz.score;
  const total = state.quiz.questions.length * 10;
  document.getElementById('quizFinalScoreText').textContent = `${finalScore} / ${total} Ball`;

  if (finalScore >= total * 0.8) {
    launchConfetti();
    document.getElementById('quizFeedbackMsg').textContent = "Ajoyib natija! So'zlarni mukammal bilasiz! 🔥";
  } else if (finalScore >= total * 0.5) {
    document.getElementById('quizFeedbackMsg').textContent = "Yaxshi! Yana biroz mashq qiling. 👍";
  } else {
    document.getElementById('quizFeedbackMsg').textContent = "Biroz sustroq. Murphy va lug'atni qayta ko'rib chiqing! 🐢";
  }
}

// 2-Player Duel Logic
async function setupDuelPlayers() {
  const sel1 = document.getElementById('duelPlayer1Select');
  const sel2 = document.getElementById('duelPlayer2Select');

  if (sel1 && sel2) {
    const opts = state.users.map(u => `<option value="${u.id}">${u.avatar} ${u.display_name || u.name}</option>`).join('');
    sel1.innerHTML = opts;
    sel2.innerHTML = opts;
    if (state.users.length > 1) sel2.selectedIndex = 1;
  }
}

async function startDuelMatch() {
  const p1Id = document.getElementById('duelPlayer1Select').value;
  const p2Id = document.getElementById('duelPlayer2Select').value;

  if (p1Id === p2Id) {
    return showToast("Ikkita har xil ishtirokchini tanlang!", "error");
  }

  try {
    const res = await fetch('/api/duel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user1_id: p1Id, user2_id: p2Id })
    });
    const data = await res.json();
    if (!data.questions || !data.questions.length) {
      return showToast("Duel uchun lug'atda so'zlar yetarli emas!", "error");
    }

    state.duel = {
      user1: data.user1,
      user2: data.user2,
      questions: data.questions,
      currentRound: 0,
      p1Score: 0,
      p2Score: 0,
      activeTurn: 1
    };

    document.getElementById('duelSetupScreen').classList.add('d-none');
    document.getElementById('duelArenaScreen').classList.remove('d-none');
    document.getElementById('duelWinnerScreen').classList.add('d-none');

    document.getElementById('duelP1Name').textContent = data.user1.display_name || data.user1.name;
    document.getElementById('duelP1Avatar').textContent = data.user1.avatar || '⚡';
    document.getElementById('duelP2Name').textContent = data.user2.display_name || data.user2.name;
    document.getElementById('duelP2Avatar').textContent = data.user2.avatar || '🚀';

    renderCurrentDuelRound();
  } catch (err) {
    showToast("Duelni boshlashda xatolik", "error");
  }
}

function renderCurrentDuelRound() {
  const d = state.duel;
  const q = d.questions[d.currentRound];

  document.getElementById('duelRoundBadge').textContent = `Raund ${d.currentRound + 1} / ${d.questions.length}`;
  document.getElementById('duelP1Score').textContent = d.p1Score;
  document.getElementById('duelP2Score').textContent = d.p2Score;

  const activePlayer = d.activeTurn === 1 ? d.user1 : d.user2;
  document.getElementById('duelTurnBanner').textContent = `Navbat: ${activePlayer.avatar} ${activePlayer.display_name || activePlayer.name}`;

  document.getElementById('duelWordTitle').textContent = q.word;

  const optsContainer = document.getElementById('duelOptionsContainer');
  optsContainer.innerHTML = q.options.map(opt => `
    <button class="quiz-option-btn" onclick="handleDuelAnswer(this, '${opt.replace(/'/g, "\\'")}', '${q.correct_answer.replace(/'/g, "\\'")}')">
      <span>${opt}</span>
    </button>
  `).join('');
}

function handleDuelAnswer(btn, selected, correct) {
  const d = state.duel;
  const buttons = document.querySelectorAll('#duelOptionsContainer .quiz-option-btn');
  buttons.forEach(b => b.disabled = true);

  if (selected === correct) {
    btn.classList.add('correct');
    if (d.activeTurn === 1) d.p1Score += 10;
    else d.p2Score += 10;
    showToast(`To'g'ri! +10 ball`, 'success');
  } else {
    btn.classList.add('wrong');
    showToast(`Noto'g'ri! To'g'ri javob: ${correct}`, 'error');
  }

  // Switch turns and advance round
  setTimeout(() => {
    d.activeTurn = d.activeTurn === 1 ? 2 : 1;
    d.currentRound++;

    if (d.currentRound < d.questions.length) {
      renderCurrentDuelRound();
    } else {
      finishDuel();
    }
  }, 1000);
}

function finishDuel() {
  const d = state.duel;
  document.getElementById('duelArenaScreen').classList.add('d-none');
  document.getElementById('duelWinnerScreen').classList.remove('d-none');

  launchConfetti();

  const titleEl = document.getElementById('duelWinnerTitle');
  const detailsEl = document.getElementById('duelWinnerDetails');

  if (d.p1Score > d.p2Score) {
    titleEl.textContent = `🏆 G'olib: ${d.user1.avatar} ${d.user1.display_name || d.user1.name}!`;
    detailsEl.textContent = `Hisob: ${d.p1Score} vs ${d.p2Score}. Mag'lub bo'lgan ${d.user2.display_name} guruhga kofe olib beradi! ☕`;
  } else if (d.p2Score > d.p1Score) {
    titleEl.textContent = `🏆 G'olib: ${d.user2.avatar} ${d.user2.display_name || d.user2.name}!`;
    detailsEl.textContent = `Hisob: ${d.p2Score} vs ${d.p1Score}. Mag'lub bo'lgan ${d.user1.display_name} guruhga kofe olib beradi! ☕`;
  } else {
    titleEl.textContent = `🤝 Do'stlik g'alaba qozondi (Durrang)!`;
    detailsEl.textContent = `Hisob: ${d.p1Score} - ${d.p2Score}. Ikkala ishtirokchi ham ajoyib bilim namoyish etdi!`;
  }
}

// --- TAB 5: GUIDE & MURPHY ROADMAP ---
function renderMurphyRoadmap() {
  const tableBody = document.getElementById('murphyRoadmapBody');
  if (!tableBody || !state.curriculum || !state.curriculum.days) return;

  tableBody.innerHTML = state.curriculum.days.map(d => `
    <tr style="border-bottom: 1px solid var(--border-subtle); vertical-align: middle;">
      <td class="fw-bold ps-3 text-lime">Kun ${d.day}</td>
      <td class="fw-semibold text-light">Unit ${d.grammar_topic.unit}: ${d.grammar_topic.name}</td>
      <td class="text-dim small">${d.writing_topic}</td>
      <td class="small text-muted"><span class="badge bg-warning text-dark me-1">${d.bonus_idiom.phrase}</span> ${d.bonus_idiom.translation}</td>
      <td>
        <button class="btn btn-dark-subtle btn-sm py-1 px-2" style="font-size:0.75rem;" onclick="jumpToDay(${d.day})">O'tish</button>
      </td>
    </tr>
  `).join('');
}

function jumpToDay(dayNum) {
  selectChallengeDay(dayNum);
  switchTab('tab-curriculum');
}

async function saveVideoChatLinks() {
  const telegram = document.getElementById('editTgLink').value.trim();
  const meet = document.getElementById('editMeetLink').value.trim();
  const time = document.getElementById('editCallTime').value.trim();

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_link: telegram,
        meet_link: meet,
        daily_call_time: time
      })
    });
    const data = await res.json();
    state.settings = data.settings;
    updateSettingsUI();
    showToast("Video-chat va havolalar yangilandi!", "success");
    bootstrap.Modal.getInstance(document.getElementById('videoLinkModal')).hide();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openVideoLinkSettingsModal() {
  document.getElementById('editTgLink').value = state.settings.telegram_link || '';
  document.getElementById('editMeetLink').value = state.settings.meet_link || '';
  document.getElementById('editCallTime').value = state.settings.daily_call_time || '21:00';
  new bootstrap.Modal(document.getElementById('videoLinkModal')).show();
}

// --- UTILITIES & TOASTS ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `custom-toast toast-${type}`;
  const icon = type === 'success' ? '⚡' : (type === 'error' ? '⚠️' : 'ℹ️');
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function setupEventListeners() {
  // Essay text input live counter
  const essayInput = document.getElementById('essayInputArea');
  if (essayInput) {
    essayInput.addEventListener('input', updateLiveWordCounter);
  }

  // Vocab search live filter
  const vocabSearch = document.getElementById('vocabSearchInput');
  if (vocabSearch) {
    vocabSearch.addEventListener('input', () => {
      clearTimeout(window._vocabSearchTimeout);
      window._vocabSearchTimeout = setTimeout(loadVocabVault, 300);
    });
  }

  // Vocab user filter
  const vocabUser = document.getElementById('vocabUserFilter');
  if (vocabUser) {
    vocabUser.addEventListener('change', loadVocabVault);
  }
}
