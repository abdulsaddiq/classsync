import jwt
import datetime
from flask import current_app, request, jsonify
from functools import wraps

def generate_token(user_id, name, roll):
    payload = {
        'sub': str(user_id),   # ✅ store as string (important)
        'name': name,
        'roll': roll,
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }
    return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')


def decode_token(token):
    return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')

        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Token missing'}), 401

        token = auth_header.split(' ')[1]

        try:
            payload = decode_token(token)
            request.user = {
                'id': int(payload['sub']),
                'name': payload['name'],
                'roll': payload['roll']
            }
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError as e:
            return jsonify({'error': str(e)}), 401

        return f(*args, **kwargs)

    return decorated