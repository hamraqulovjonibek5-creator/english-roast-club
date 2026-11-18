from flask import Flask, request, jsonify, render_template, session
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, UniqueConstraint
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date, timedelta
import re, random, json, os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'roast-club-super-secret-key-2026-b1-b2')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///strict_english.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JSON_AS_ASCII'] = False

db = SQLAlchemy(app)

# --- 5 TA DARAJA TIZIMI ---
LEVELS = {
    1: {"name": "1. Warm-up (Razmalka)", "vocab_words": 10, "essay_words": 40, "badge": "🌱 Warm-up"},
    2: {"name": "2. Tezlashish (Razgon)", "vocab_words": 12, "essay_words": 60, "badge": "⚡ Striker"},
    3: {"name": "3. Normal (Standart)", "vocab_words": 15, "essay_words": 80, "badge": "🔥 Warrior"},
    4: {"name": "4. Hardcore (Turbo)", "vocab_words": 20, "essay_words": 100, "badge": "🚀 Beast"},
    5: {"name": "5. Beast Mode (O'lim zonasi)", "vocab_words": 25, "essay_words": 120, "badge": "👑 Titan"}
}

TASK_POINTS = 20
CYCLE_PENALTY = 25000

# --- MODELLAR ---
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)
    display_name = db.Column(db.String(100), nullable=True)
    password_hash = db.Column(db.String(256), nullable=True)
    avatar = db.Column(db.String(255), default='⚡', nullable=False)
    bio = db.Column(db.String(255), default='B1 warrior on the road to B2 fluency 🔥', nullable=False)
    current_level = db.Column(db.Integer, default=1, nullable=False)
    target_level = db.Column(db.Integer, default=3, nullable=False)
    total_fine = db.Column(db.Integer, default=0, nullable=False)
    total_points = db.Column(db.Integer, default=0, nullable=False)
    streak = db.Column(db.Integer, default=0, nullable=False)
    immunity_used = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    logs = db.relationship('DailyLog', backref='user', lazy=True, cascade='all, delete-orphan')
    vocab = db.relationship('Vocab', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        if password:
            self.password_hash = generate_password_hash(password)
        else:
            self.password_hash = None

    def check_password(self, password):
        if not self.password_hash:
            return True  # If no password set, allow passwordless login for demo
        return check_password_hash(self.password_hash, password)


class DailyLog(db.Model):
    __tablename__ = 'daily_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    day_num = db.Column(db.Integer, nullable=False)
    date = db.Column(db.Date, nullable=False, default=date.today)
    vocab_done = db.Column(db.Boolean, default=False, nullable=False)
    grammar_done = db.Column(db.Boolean, default=False, nullable=False)
    listening_done = db.Column(db.Boolean, default=False, nullable=False)
    reading_done = db.Column(db.Boolean, default=False, nullable=False)
    writing_done = db.Column(db.Boolean, default=False, nullable=False)
    writing_text = db.Column(db.Text, default='', nullable=False)
    points = db.Column(db.Integer, default=0, nullable=False)
    daily_fine = db.Column(db.Integer, default=0, nullable=False)
    immunity_applied = db.Column(db.Boolean, default=False, nullable=False)
    
    __table_args__ = (UniqueConstraint('user_id', 'date', name='uq_user_date'),)


class Vocab(db.Model):
    __tablename__ = 'vocab'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    word = db.Column(db.String(120), nullable=False)
    translation = db.Column(db.String(200), nullable=False)
    example = db.Column(db.Text, default='', nullable=False)
    part_of_speech = db.Column(db.String(40), default='word', nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class CyclePenalty(db.Model):
    __tablename__ = 'cycle_penalties'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    last_log_id = db.Column(db.Integer, db.ForeignKey('daily_logs.id'), nullable=False)
    amount = db.Column(db.Integer, default=CYCLE_PENALTY, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    __table_args__ = (UniqueConstraint('user_id', 'last_log_id', name='uq_cycle_user_lastlog'),)


class AppSetting(db.Model):
    __tablename__ = 'app_settings'
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Text, nullable=False)


# --- YORDAMCHI FUNKSIYALAR ---
def as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes', 'on')
    return bool(value)

def count_words(text):
    if not text:
        return 0
    return len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text))

def get_category(points):
    if points >= 100:
        return "🔥 ALFA / LEGEND"
    if 60 <= points < 100:
        return "🐢 CHALA / SUDRALUVCHI"
    return "💀 DANGASA / O'LIK"

def parse_date(value):
    if not value:
        return date.today()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValueError("date formati YYYY-MM-DD bo'lishi kerak")

def calculate_points_and_fine(user, vocab_done, grammar_done, listening_done, reading_done, writing_done, writing_text):
    level_info = LEVELS.get(user.current_level, LEVELS[1])
    
    if vocab_done:
        required_vocab = level_info['vocab_words']
        vocab_count = Vocab.query.filter_by(user_id=user.id).count()
        if vocab_count < required_vocab:
            raise ValueError(f"Vocab vazifasi uchun kamida {required_vocab} ta so'z bazada bo'lishi kerak. Hozir: {vocab_count}")
            
    if writing_done:
        required_essay = level_info['essay_words']
        words = count_words(writing_text)
        if words < required_essay:
            raise ValueError(f"Insho kamida {required_essay} so'z bo'lishi kerak. Hozirgi so'zlar soni: {words}")
            
    points = sum(TASK_POINTS for done in [vocab_done, grammar_done, listening_done, reading_done, writing_done] if done)
    
    if points == 100:
        fine = 0
    elif 60 <= points <= 80:
        fine = 5000
    else:
        fine = 10000
    return points, fine

def recalculate_streak(user_id):
    logs = DailyLog.query.filter_by(user_id=user_id).order_by(DailyLog.date.desc()).all()
    if not logs:
        return 0
    streak = 0
    expected_date = logs[0].date
    for log in logs:
        if log.date != expected_date:
            break
        if log.points >= 60:
            streak += 1
            expected_date = expected_date - timedelta(days=1)
        else:
            break
    return streak

def user_to_dict(user):
    completed_days = DailyLog.query.filter_by(user_id=user.id).count()
    full_score_days = DailyLog.query.filter_by(user_id=user.id, points=100).count()
    return {
        "id": user.id,
        "name": user.name,
        "display_name": user.display_name or user.name,
        "avatar": user.avatar or '⚡',
        "bio": user.bio or 'B1 warrior on the road to B2 fluency 🔥',
        "current_level": user.current_level,
        "target_level": user.target_level or 3,
        "level_info": LEVELS.get(user.current_level, LEVELS[1]),
        "total_fine": user.total_fine,
        "total_points": user.total_points,
        "streak": user.streak,
        "immunity_used": user.immunity_used,
        "completed_days": completed_days,
        "full_score_days": full_score_days,
        "category": get_category(100 if user.streak > 3 else (70 if user.total_points > 100 else 40)),
        "has_password": bool(user.password_hash)
    }

def log_to_dict(log):
    return {
        "id": log.id,
        "user_id": log.user_id,
        "day_num": log.day_num,
        "date": log.date.isoformat(),
        "vocab_done": log.vocab_done,
        "grammar_done": log.grammar_done,
        "listening_done": log.listening_done,
        "reading_done": log.reading_done,
        "writing_done": log.writing_done,
        "writing_text": log.writing_text,
        "points": log.points,
        "daily_fine": log.daily_fine,
        "immunity_applied": log.immunity_applied,
        "category": get_category(log.points)
    }

def vocab_to_dict(v):
    return {
        "id": v.id,
        "user_id": v.user_id,
        "word": v.word,
        "translation": v.translation,
        "example": v.example,
        "part_of_speech": getattr(v, 'part_of_speech', 'word') or 'word'
    }

def get_current_user():
    user_id = session.get('user_id')
    if user_id:
        user = User.query.get(user_id)
        if user:
            return user
    # Fallback to first user for seamless multi-user testing
    user = User.query.first()
    if user:
        session['user_id'] = user.id
    return user

def auto_migrate_and_seed():
    """Ma'lumotlar bazasini yangilab, kerakli maydonlar va boshlang'ich ma'lumotlarni kiritadi."""
    db.create_all()
    
    # 1. Boshlang'ich 4 do'st foydalanuvchilarini tekshirish
    if not User.query.first():
        users_meta = [
            ('Ali', '⚡ Ali The Grinder', '🦁', 'Aiming for 30/30 days 100 points! No mercy!'),
            ('Vali', '🚀 Vali Speedster', '⚡', 'Murphy grammar master in training.'),
            ('Hasan', '🐺 Hasan Iron Will', '🐺', 'Zero fines policy this month!'),
            ('Husan', '🔥 Husan Phoenix', '🔥', 'Writing essays like a native speaker.')
        ]
        for name, dname, av, bio in users_meta:
            u = User(name=name, display_name=dname, avatar=av, bio=bio, current_level=1, target_level=3)
            db.session.add(u)
        db.session.commit()

    # 2. Standart sozlamalar
    default_settings = {
        'telegram_link': 'https://t.me/english_roast_club',
        'meet_link': 'https://meet.google.com/new',
        'daily_call_time': '21:00'
    }
    for k, v in default_settings.items():
        if not AppSetting.query.get(k):
            db.session.add(AppSetting(key=k, value=v))
    db.session.commit()

    # 3. Agar lug'at bo'sh bo'lsa, foydali so'zlar kiritish
    if Vocab.query.count() == 0:
        starter_vocab = [
            ('perseverance', 'matonat, qat\'iyat', 'Perseverance is key to mastering the English language.', 'noun'),
            ('ambiguous', 'noaniq, ikki ma\'noli', 'His answer was ambiguous and caused confusion.', 'adjective'),
            ('comprehend', 'tushunmoq, idrok qilmoq', 'It took me a while to comprehend the grammar rule.', 'verb'),
            ('reluctant', 'istamay, ikkilanib', 'He was reluctant to pay the 10,000 UZS roast fine.', 'adjective'),
            ('inevitable', 'muqarrar, qochib bo\'lmas', 'Making grammar mistakes is inevitable when learning.', 'adjective'),
            ('diligent', 'mehnatkash, g\'ayratli', 'Diligent students always finish Murphy exercises on time.', 'adjective'),
            ('eloquent', 'notiq, so\'zamol', 'She gave an eloquent speech during the evening debate.', 'adjective'),
            ('scrutinize', 'sinchkovlik bilan tekshirmoq', 'The roast club will scrutinize your essay word count.', 'verb'),
            ('fluency', 'ravonlik, erkin gapirish', 'Our 30-day challenge is designed to achieve true fluency.', 'noun'),
            ('procrastinate', 'paysallamoq, keyinga qoldirmoq', 'Do not procrastinate your daily English tasks!', 'verb'),
            ('ubiquitous', 'hamma joyda mavjud', 'Smartphones have become ubiquitous in modern life.', 'adjective'),
            ('resilience', 'chidam, moslashuvchanlik', 'Building English habit requires high mental resilience.', 'noun')
        ]
        all_users = User.query.all()
        for u in all_users:
            for w, tr, ex, pos in starter_vocab:
                db.session.add(Vocab(user_id=u.id, word=w, translation=tr, example=ex, part_of_speech=pos))
        db.session.commit()


# --- AUTH VA PROFIL ENDPOINTLARI ---

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({"authenticated": False, "user": None})
    return jsonify({"authenticated": True, "user": user_to_dict(user)})

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username:
        return jsonify({"error": "Foydalanuvchi nomi majburiy"}), 400

    user = User.query.filter((User.name == username) | (User.display_name == username)).first()
    if not user:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404

    if user.password_hash and not user.check_password(password):
        return jsonify({"error": "Parol noto'g'ri"}), 401

    session['user_id'] = user.id
    return jsonify({"message": f"Xush kelibsiz, {user.display_name or user.name}!", "user": user_to_dict(user)})

@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    display_name = data.get('display_name', '').strip() or username
    password = data.get('password', '').strip()
    avatar = data.get('avatar', '⚡').strip() or '⚡'
    bio = data.get('bio', 'B1 warrior on the road to B2 fluency 🔥').strip()
    current_level = int(data.get('current_level', 1))
    target_level = int(data.get('target_level', 3))

    if not username:
        return jsonify({"error": "Foydalanuvchi nomi majburiy"}), 400
    if User.query.filter_by(name=username).first():
        return jsonify({"error": "Bu username allaqachon band"}), 400

    user = User(
        name=username,
        display_name=display_name,
        avatar=avatar,
        bio=bio,
        current_level=current_level if current_level in LEVELS else 1,
        target_level=target_level if target_level in LEVELS else 3
    )
    if password:
        user.set_password(password)

    db.session.add(user)
    db.session.commit()

    # Boshlang'ich so'zlar to'plami
    seed_vocab = [
        ('perseverance', 'matonat, qat\'iyat', 'Perseverance is key to mastering the English language.', 'noun'),
        ('comprehend', 'tushunmoq, idrok qilmoq', 'It took me a while to comprehend the grammar rule.', 'verb'),
        ('diligent', 'mehnatkash, g\'ayratli', 'Diligent students always finish Murphy exercises on time.', 'adjective'),
        ('fluency', 'ravonlik, erkin gapirish', 'Our 30-day challenge is designed to achieve true fluency.', 'noun'),
        ('ubiquitous', 'hamma joyda mavjud', 'Smartphones have become ubiquitous in modern life.', 'adjective'),
        ('resilience', 'chidam, moslashuvchanlik', 'Building English habit requires high mental resilience.', 'noun'),
        ('ambitious', 'maqsadga intiluvchan', 'Ambitious learners study everyday.', 'adjective'),
        ('consistent', 'qat\'iy, doimiy', 'Consistent study creates remarkable results.', 'adjective'),
        ('dedication', 'fidoyilik', 'English mastery requires dedication.', 'noun'),
        ('articulate', 'fikrini aniq bayon qiluvchi', 'She is very articulate in English debates.', 'adjective')
    ]
    for w, tr, ex, pos in seed_vocab:
        db.session.add(Vocab(user_id=user.id, word=w, translation=tr, example=ex, part_of_speech=pos))
    db.session.commit()

    session['user_id'] = user.id
    return jsonify({"message": "Ro'yxatdan muvaffaqiyatli o'tdingiz!", "user": user_to_dict(user)}), 201

@app.route('/api/auth/switch', methods=['POST'])
def auth_switch():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id majburiy"}), 400
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404

    session['user_id'] = user.id
    return jsonify({"message": f"{user.display_name or user.name} hisobiga o'tildi", "user": user_to_dict(user)})

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.pop('user_id', None)
    return jsonify({"message": "Chiqildi"})

@app.route('/api/users/<int:user_id>/profile', methods=['PUT'])
def update_profile(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}

    if 'display_name' in data and data['display_name'].strip():
        user.display_name = data['display_name'].strip()
    if 'avatar' in data and data['avatar'].strip():
        user.avatar = data['avatar'].strip()
    if 'bio' in data:
        user.bio = data['bio'].strip()
    if 'target_level' in data:
        try:
            tl = int(data['target_level'])
            if tl in LEVELS:
                user.target_level = tl
        except (ValueError, TypeError):
            pass
    if 'current_level' in data:
        try:
            cl = int(data['current_level'])
            if cl in LEVELS:
                user.current_level = cl
        except (ValueError, TypeError):
            pass
    if 'password' in data and data['password']:
        user.set_password(data['password'])

    db.session.commit()
    return jsonify({"message": "Profil muvaffaqiyatli yangilandi", "user": user_to_dict(user)})


# --- ASOSIY FOYDALANUVCHILAR VA STATISTIKA ---

@app.route('/api/levels', methods=['GET'])
def get_levels():
    return jsonify(LEVELS)

@app.route('/api/users', methods=['GET'])
def get_users():
    users = User.query.order_by(User.id).all()
    return jsonify([user_to_dict(u) for u in users])

@app.route('/api/users', methods=['POST'])
def create_user():
    return auth_register()

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user_detail(user_id):
    user = User.query.get_or_404(user_id)
    data = user_to_dict(user)
    data['logs_count'] = DailyLog.query.filter_by(user_id=user.id).count()
    data['vocab_count'] = Vocab.query.filter_by(user_id=user.id).count()
    last_log = DailyLog.query.filter_by(user_id=user.id).order_by(DailyLog.date.desc()).first()
    data['last_log'] = log_to_dict(last_log) if last_log else None
    return jsonify(data)

@app.route('/api/users/<int:user_id>/level', methods=['PUT'])
def update_user_level(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    try:
        level = int(data.get('current_level'))
    except (TypeError, ValueError):
        return jsonify({"error": "current_level raqam bo'lishi kerak"}), 400
        
    if level not in LEVELS:
        return jsonify({"error": "current_level 1-5 oralig'ida bo'lishi kerak"}), 400
        
    user.current_level = level
    db.session.commit()
    return jsonify(user_to_dict(user))


# --- LUG'AT (VOCAB VA VAULT) ---

@app.route('/api/vocab', methods=['GET'])
def get_vocab_list():
    user_id = request.args.get('user_id', type=int)
    search = request.args.get('q', '').strip().lower()
    
    query = Vocab.query
    if user_id:
        query = query.filter_by(user_id=user_id)
    if search:
        query = query.filter(
            (Vocab.word.ilike(f'%{search}%')) | 
            (Vocab.translation.ilike(f'%{search}%')) |
            (Vocab.example.ilike(f'%{search}%'))
        )
    
    words = query.order_by(Vocab.id.desc()).all()
    return jsonify([vocab_to_dict(w) for w in words])

@app.route('/api/vocab', methods=['POST'])
def add_vocab():
    data = request.get_json() or {}
    user_id = data.get('user_id') or session.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id majburiy"}), 400
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
        
    word = data.get('word', '').strip()
    translation = data.get('translation', '').strip()
    example = data.get('example', '').strip()
    part_of_speech = data.get('part_of_speech', 'word').strip()

    if not word or not translation:
        return jsonify({"error": "So'z va tarjimasi majburiy!"}), 400
        
    vocab = Vocab(
        user_id=user.id,
        word=word,
        translation=translation,
        example=example,
        part_of_speech=part_of_speech
    )
    db.session.add(vocab)
    db.session.commit()
    return jsonify(vocab_to_dict(vocab)), 201

@app.route('/api/vocab/<int:vocab_id>', methods=['DELETE'])
def delete_vocab(vocab_id):
    v = Vocab.query.get_or_404(vocab_id)
    db.session.delete(v)
    db.session.commit()
    return jsonify({"message": "So'z o'chirildi"})

@app.route('/api/users/<int:user_id>/vocab', methods=['GET'])
def get_user_vocab(user_id):
    user = User.query.get_or_404(user_id)
    words = Vocab.query.filter_by(user_id=user.id).order_by(Vocab.id.desc()).all()
    return jsonify([vocab_to_dict(w) for w in words])


# --- KUNLIK TOPSHIRIQLAR VA LOGLAR ---

@app.route('/api/logs', methods=['POST'])
def save_daily_log():
    data = request.get_json() or {}
    user_id = data.get('user_id') or session.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id majburiy"}), 400
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
        
    try:
        log_date = parse_date(data.get('date'))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    tasks = data.get('tasks', {})
    vocab_done = as_bool(data.get('vocab_done', tasks.get('vocab_done', False)))
    grammar_done = as_bool(data.get('grammar_done', tasks.get('grammar_done', False)))
    listening_done = as_bool(data.get('listening_done', tasks.get('listening_done', False)))
    reading_done = as_bool(data.get('reading_done', tasks.get('reading_done', False)))
    writing_done = as_bool(data.get('writing_done', tasks.get('writing_done', False)))
    writing_text = data.get('writing_text', tasks.get('writing_text', '')) or ''

    try:
        points, fine = calculate_points_and_fine(
            user, vocab_done, grammar_done, listening_done, reading_done, writing_done, writing_text
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    log = DailyLog.query.filter_by(user_id=user.id, date=log_date).first()
    created = False
    
    if log:
        user.total_points -= log.points
        user.total_fine -= log.daily_fine
        if user.total_fine < 0:
            user.total_fine = 0
            
        if log.immunity_applied:
            fine = 0
            
        log.vocab_done = vocab_done
        log.grammar_done = grammar_done
        log.listening_done = listening_done
        log.reading_done = reading_done
        log.writing_done = writing_done
        log.writing_text = writing_text
        log.points = points
        log.daily_fine = fine
        if data.get('day_num') is not None:
            log.day_num = int(data.get('day_num'))
    else:
        created = True
        day_num = data.get('day_num')
        if day_num is None:
            max_day = db.session.query(func.max(DailyLog.day_num)).filter(DailyLog.user_id == user.id).scalar()
            day_num = (max_day or 0) + 1
        else:
            day_num = int(day_num)
            
        log = DailyLog(
            user_id=user.id,
            day_num=day_num,
            date=log_date,
            vocab_done=vocab_done,
            grammar_done=grammar_done,
            listening_done=listening_done,
            reading_done=reading_done,
            writing_done=writing_done,
            writing_text=writing_text,
            points=points,
            daily_fine=fine
        )
        db.session.add(log)

    user.total_points += points
    user.total_fine += fine
    db.session.flush()
    user.streak = recalculate_streak(user.id)
    db.session.commit()
    
    return jsonify({
        "message": "Daily log muvaffaqiyatli saqlandi! Tabriklaymiz!",
        "log": log_to_dict(log),
        "user": user_to_dict(user)
    }), 201 if created else 200

@app.route('/api/users/<int:user_id>/logs', methods=['GET'])
def get_user_logs(user_id):
    User.query.get_or_404(user_id)
    logs = DailyLog.query.filter_by(user_id=user_id).order_by(DailyLog.day_num.desc(), DailyLog.date.desc()).all()
    return jsonify([log_to_dict(l) for l in logs])

@app.route('/api/users/<int:user_id>/day/<int:day_num>', methods=['GET'])
def get_user_day_log(user_id, day_num):
    log = DailyLog.query.filter_by(user_id=user_id, day_num=day_num).first()
    if log:
        return jsonify(log_to_dict(log))
    return jsonify(None)


# --- LEADERBOARD VA HAMJAMOYAT AKTIVLIGI ---

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    users = User.query.order_by(User.total_points.desc(), User.streak.desc(), User.total_fine.asc()).all()
    ranked = []
    for rank, u in enumerate(users, 1):
        d = user_to_dict(u)
        d['rank'] = rank
        ranked.append(d)
    return jsonify(ranked)

@app.route('/api/activity', methods=['GET'])
def get_activity_feed():
    logs = DailyLog.query.order_by(DailyLog.id.desc()).limit(20).all()
    items = []
    for l in logs:
        u = User.query.get(l.user_id)
        if not u:
            continue
        items.append({
            "id": l.id,
            "user_id": u.id,
            "user_name": u.display_name or u.name,
            "avatar": u.avatar or '⚡',
            "day_num": l.day_num,
            "date": l.date.isoformat(),
            "points": l.points,
            "daily_fine": l.daily_fine,
            "category": get_category(l.points),
            "essay_snippet": (l.writing_text[:140] + '...') if len(l.writing_text) > 140 else l.writing_text,
            "tasks_summary": {
                "grammar": l.grammar_done,
                "vocab": l.vocab_done,
                "listening": l.listening_done,
                "reading": l.reading_done,
                "writing": l.writing_done
            }
        })
    return jsonify(items)

@app.route('/api/check_cycle', methods=['POST'])
def check_cycle_penalty():
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id') or request.args.get('user_id', type=int)
    
    if user_id:
        users = [User.query.get(user_id)]
        if not users[0]:
            return jsonify({"error": "Foydalanuvchi topilmadi"}), 404
    else:
        users = User.query.all()

    results = []
    for user in users:
        logs = DailyLog.query.filter_by(user_id=user.id).order_by(DailyLog.date.desc()).limit(5).all()
        if len(logs) < 5:
            results.append({
                "user_id": user.id,
                "user_name": user.display_name or user.name,
                "avatar": user.avatar,
                "checked": False,
                "message": f"Oxirgi 5 kunlik log yetarli emas ({len(logs)}/5)",
                "logs_count": len(logs)
            })
            continue
            
        total_points = sum(l.points for l in logs)
        last_log_id = logs[0].id
        
        if total_points < 350:
            existing = CyclePenalty.query.filter_by(user_id=user.id, last_log_id=last_log_id).first()
            if existing:
                results.append({
                    "user_id": user.id,
                    "user_name": user.display_name or user.name,
                    "avatar": user.avatar,
                    "checked": True,
                    "total_points": total_points,
                    "penalty_applied": False,
                    "message": "Bu 5 kunlik sikl uchun jarima allaqachon hisoblangan",
                    "amount": existing.amount
                })
            else:
                user.total_fine += CYCLE_PENALTY
                penalty = CyclePenalty(user_id=user.id, last_log_id=last_log_id, amount=CYCLE_PENALTY)
                db.session.add(penalty)
                results.append({
                    "user_id": user.id,
                    "user_name": user.display_name or user.name,
                    "avatar": user.avatar,
                    "checked": True,
                    "total_points": total_points,
                    "penalty_applied": True,
                    "message": f"5 kunlik ball 350 dan kam ({total_points} ball)! +25 000 so'm katta jarima qo'shildi! 💀",
                    "amount": CYCLE_PENALTY
                })
        else:
            results.append({
                "user_id": user.id,
                "user_name": user.display_name or user.name,
                "avatar": user.avatar,
                "checked": True,
                "total_points": total_points,
                "penalty_applied": False,
                "message": f"Ajoyib natija ({total_points}/500 ball)! Jarima yo'q. 🔥",
                "amount": 0
            })
            
    db.session.commit()
    return jsonify({"results": results})

@app.route('/api/users/<int:user_id>/immunity', methods=['POST'])
def use_immunity(user_id):
    user = User.query.get_or_404(user_id)
    if user.immunity_used:
        return jsonify({"error": "Siz immunitet qalqonidan allaqachon foydalangansiz!"}), 400
        
    data = request.get_json(silent=True) or {}
    log = None
    if data.get('log_id'):
        log = DailyLog.query.filter_by(id=data.get('log_id'), user_id=user.id).first()
    elif data.get('date'):
        try:
            d = parse_date(data.get('date'))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        log = DailyLog.query.filter_by(user_id=user.id, date=d).first()
    else:
        # Find the latest log with an unpaid fine
        log = DailyLog.query.filter(DailyLog.user_id == user.id, DailyLog.daily_fine > 0).order_by(DailyLog.date.desc()).first()
        if not log:
            log = DailyLog.query.filter_by(user_id=user.id, date=date.today()).first()
        
    if not log:
        return jsonify({"error": "Bekor qilinadigan jarimali kunlik log topilmadi"}), 404
        
    if log.daily_fine <= 0:
        return jsonify({"error": "Bu kun uchun bekor qilinadigan jarima mavjud emas (jarima: 0 so'm)"}), 400
        
    old_fine = log.daily_fine
    user.total_fine = max(0, user.total_fine - old_fine)
    log.daily_fine = 0
    log.immunity_applied = True
    user.immunity_used = True
    db.session.commit()
    
    return jsonify({
        "message": f"Immunitet qalqoni muvaffaqiyatli faollashtirildi! Kun {log.day_num} uchun {old_fine:,} so'm jarima bekor qilindi. 🛡️",
        "cancelled_fine": old_fine,
        "log": log_to_dict(log),
        "user": user_to_dict(user)
    })


# --- MINI QUIZ VA DUEL ARENA ---

@app.route('/api/quiz', methods=['GET'])
def get_quiz_words():
    user_id = request.args.get('user_id', type=int)
    limit = request.args.get('limit', default=10, type=int)
    limit = max(5, min(limit, 30))
    
    # Barcha mavjud so'zlarni olamiz
    all_vocab = Vocab.query.all()
    if not all_vocab:
        return jsonify({"count": 0, "questions": []})
        
    # Quiz uchun so'zlarni tanlash
    selected = random.sample(all_vocab, min(limit, len(all_vocab)))
    
    # Har bir savolga 4 ta variant (1 to'g'ri + 3 noto'g'ri) tayyorlash
    all_translations = list({w.translation for w in all_vocab})
    
    questions = []
    for item in selected:
        correct = item.translation
        other_options = [t for t in all_translations if t != correct]
        if len(other_options) < 3:
            distractors = other_options + ["albatta, shubhasiz", "aniq va ravshan", "keyingi rejalar"][:3 - len(other_options)]
        else:
            distractors = random.sample(other_options, 3)
            
        options = distractors + [correct]
        random.shuffle(options)
        
        questions.append({
            "id": item.id,
            "word": item.word,
            "correct_answer": correct,
            "options": options,
            "example": item.example,
            "part_of_speech": getattr(item, 'part_of_speech', 'word') or 'word'
        })
        
    return jsonify({
        "count": len(questions),
        "questions": questions
    })

@app.route('/api/duel', methods=['POST'])
def start_duel():
    data = request.get_json(silent=True) or {}
    user1_id = data.get('user1_id')
    user2_id = data.get('user2_id')
    
    users = User.query.all()
    if not user1_id and len(users) > 0:
        user1_id = users[0].id
    if not user2_id and len(users) > 1:
        user2_id = users[1].id

    user1 = User.query.get(user1_id)
    user2 = User.query.get(user2_id)
    
    # 8-10 ta duel savoli generatsiya qilamiz
    all_vocab = Vocab.query.all()
    count = min(10, len(all_vocab))
    selected = random.sample(all_vocab, count) if all_vocab else []
    all_translations = list({w.translation for w in all_vocab})
    
    questions = []
    for item in selected:
        correct = item.translation
        other_options = [t for t in all_translations if t != correct]
        distractors = random.sample(other_options, min(3, len(other_options))) if len(other_options) >= 3 else ["noto'g'ri variant 1", "noto'g'ri variant 2", "noto'g'ri variant 3"]
        options = distractors + [correct]
        random.shuffle(options)
        
        questions.append({
            "id": item.id,
            "word": item.word,
            "correct_answer": correct,
            "options": options,
            "example": item.example
        })
        
    return jsonify({
        "user1": user_to_dict(user1) if user1 else None,
        "user2": user_to_dict(user2) if user2 else None,
        "rounds": len(questions),
        "questions": questions
    })


# --- SOZLAMALAR VA QO'LLANMA ---

@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = {s.key: s.value for s in AppSetting.query.all()}
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    data = request.get_json() or {}
    for k, v in data.items():
        s = AppSetting.query.get(k)
        if s:
            s.value = str(v)
        else:
            db.session.add(AppSetting(key=k, value=str(v)))
    db.session.commit()
    return jsonify({"message": "Sozlamalar saqlandi", "settings": {s.key: s.value for s in AppSetting.query.all()}})

@app.route('/api/curriculum', methods=['GET'])
def get_curriculum():
    json_path = os.path.join(app.root_path, 'curriculum.json')
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    return jsonify({"error": "curriculum.json fayli topilmadi"}), 404

@app.route('/api/curriculum/day/<int:day_num>', methods=['GET'])
def get_curriculum_day(day_num):
    json_path = os.path.join(app.root_path, 'curriculum.json')
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        days = data.get('days', [])
        day_data = next((d for d in days if d.get('day') == day_num), None)
        if day_data:
            return jsonify(day_data)
        return jsonify({"error": f"Kun {day_num} topilmadi"}), 404
    return jsonify({"error": "curriculum.json topilmadi"}), 404


# --- ASOSIY SAHIFA ---
@app.route('/')
def home():
    return render_template('index.html')


# --- SERVERNI ISHGA TUSHIRISH ---
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
