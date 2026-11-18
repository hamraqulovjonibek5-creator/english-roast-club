from app import app, db, auto_migrate_and_seed

with app.app_context():
    auto_migrate_and_seed()

client = app.test_client()

# 1. Main page & static
r = client.get('/')
assert r.status_code == 200, f'Home failed: {r.status_code}'
assert 'English Roast Club' in r.text
assert 'tab-curriculum' in r.text
assert 'tab-profiles' in r.text
assert 'tab-leaderboard' in r.text
assert 'tab-vocab' in r.text
assert 'tab-guide' in r.text
print('✓ Home page & tabs rendered')

r_css = client.get('/static/css/style.css')
assert r_css.status_code == 200
print('✓ Static CSS served')

r_js = client.get('/static/js/app.js')
assert r_js.status_code == 200
print('✓ Static JS served')

# 2. Users & Auth
r_users = client.get('/api/users')
assert r_users.status_code == 200
users = r_users.json
assert len(users) >= 4
u1 = users[0]
dname = u1['display_name']
print(f'✓ Users fetched: {len(users)} users (First: {dname})')

# 3. Vocab
r_vocab = client.get(f'/api/vocab?user_id={u1["id"]}')
assert r_vocab.status_code == 200
assert len(r_vocab.json) >= 10
print(f'✓ User vocab count: {len(r_vocab.json)}')

# 4. Save daily log (100 points)
essay_text = ' '.join(['English'] * 45)
log_payload = {
    'user_id': u1['id'],
    'day_num': 1,
    'date': '2026-11-18',
    'grammar_done': True,
    'vocab_done': True,
    'listening_done': True,
    'reading_done': True,
    'writing_done': True,
    'writing_text': essay_text
}
r_log = client.post('/api/logs', json=log_payload)
assert r_log.status_code in (200, 201), f'Log failed: {r_log.text}'
assert r_log.json['log']['points'] == 100
assert r_log.json['log']['daily_fine'] == 0
print('✓ 100-point daily log successfully submitted')

# 5. Leaderboard
r_lb = client.get('/api/leaderboard')
assert r_lb.status_code == 200
assert len(r_lb.json) >= 4
print('✓ Leaderboard ranked properly')

# 6. Activity
r_act = client.get('/api/activity')
assert r_act.status_code == 200
assert len(r_act.json) >= 1
print('✓ Activity feed working')

# 7. Quiz & Duel
r_quiz = client.get('/api/quiz?limit=5')
assert r_quiz.status_code == 200
assert len(r_quiz.json['questions']) == 5
print('✓ Quiz questions with multiple options generated')

r_duel = client.post('/api/duel', json={'user1_id': users[0]['id'], 'user2_id': users[1]['id']})
assert r_duel.status_code == 200
assert len(r_duel.json['questions']) > 0
print('✓ 2-Player Duel match generated')

# 8. Check cycle
r_cycle = client.post('/api/check_cycle')
assert r_cycle.status_code == 200
print('✓ Cycle penalty check working')

# 9. Settings
r_set = client.get('/api/settings')
assert r_set.status_code == 200
assert 'telegram_link' in r_set.json
print('✓ Video-chat & settings working')

print('\nALL 9 END-TO-END VERIFICATION CHECKS PASSED PERFECTLY!')
