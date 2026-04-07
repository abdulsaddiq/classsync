from flask import Blueprint, request, jsonify
from backend.database import get_db
from backend.utils.jwt_helper import generate_token, decode_token
import bcrypt

auth_bp = Blueprint('auth', __name__)


# 🔐 REGISTER
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    name = (data.get('name') or '').strip()
    roll = (data.get('roll') or '').strip().upper()
    password = (data.get('password') or '').strip()

    if not name or not roll or not password:
        return jsonify({'error': 'All fields are required.'}), 400

    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters.'}), 400

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    try:
        conn = get_db()
        conn.execute(
            'INSERT INTO users (name, roll, password) VALUES (?, ?, ?)',
            (name, roll, hashed)
        )
        conn.commit()

        user = conn.execute(
            'SELECT id, name, roll FROM users WHERE roll = ?', (roll,)
        ).fetchone()
        conn.close()

        token = generate_token(user['id'], user['name'], user['roll'])

        return jsonify({
            'message': 'Account created successfully.',
            'token': token,
            'user': dict(user)
        }), 201

    except Exception as e:
        if 'UNIQUE' in str(e):
            return jsonify({'error': 'Roll number already registered.'}), 409
        return jsonify({'error': str(e)}), 500


# 🔐 LOGIN
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    roll = (data.get('roll') or '').strip().upper()
    password = (data.get('password') or '').strip()

    if not roll or not password:
        return jsonify({'error': 'Roll number and password required.'}), 400

    conn = get_db()
    user = conn.execute(
        'SELECT * FROM users WHERE roll = ?', (roll,)
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({'error': 'No account found.'}), 404

    if not bcrypt.checkpw(password.encode(), user['password'].encode()):
        return jsonify({'error': 'Incorrect password.'}), 401

    token = generate_token(user['id'], user['name'], user['roll'])

    return jsonify({
        'message': 'Login successful.',
        'token': token,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'roll': user['roll']
        }
    }), 200


# 🔐 GET CURRENT USER
@auth_bp.route('/me', methods=['GET'])
def me():
    auth_header = request.headers.get('Authorization', '')

    if not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Token missing'}), 401

    token = auth_header.split(' ')[1]

    try:
        payload = decode_token(token)

        conn = get_db()
        user = conn.execute(
            'SELECT id, name, roll FROM users WHERE id = ?',
            (int(payload['sub']),)
        ).fetchone()
        conn.close()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify(dict(user)), 200

    except Exception as e:
        print("JWT ERROR:", e)
        return jsonify({'error': str(e)}), 401