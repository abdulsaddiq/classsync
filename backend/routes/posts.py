from flask import Blueprint, request, jsonify
from backend.database import get_db
from backend.utils.jwt_helper import token_required
import uuid

posts_bp = Blueprint('posts', __name__)


@posts_bp.route('/', methods=['GET'])
@token_required
def get_posts():
    category = request.args.get('category', '')
    status   = request.args.get('status', '')
    search   = request.args.get('search', '').lower()
    sort     = request.args.get('sort', 'newest')

    query  = 'SELECT * FROM posts WHERE 1=1'
    params = []

    if category and category != 'all':
        query += ' AND category = ?'
        params.append(category)

    if status == 'done':
        query += ' AND done = 1'
    elif status == 'pending':
        query += ' AND done = 0'

    if search:
        query += ' AND (LOWER(subject) LIKE ? OR LOWER(topic) LIKE ? OR LOWER(extra) LIKE ? OR LOWER(author_name) LIKE ?)'
        like = f'%{search}%'
        params.extend([like, like, like, like])

    sort_map = {
        'newest':  'pinned DESC, created_at DESC',
        'oldest':  'pinned DESC, created_at ASC',
        'subject': 'pinned DESC, subject ASC',
        'due':     'pinned DESC, CASE WHEN due = "" THEN 1 ELSE 0 END, due ASC'
    }
    query += f' ORDER BY {sort_map.get(sort, "pinned DESC, created_at DESC")}'

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()

    posts = [dict(row) for row in rows]
    for p in posts:
        p['done']   = bool(p['done'])
        p['pinned'] = bool(p['pinned'])

    return jsonify(posts), 200


@posts_bp.route('/', methods=['POST'])
@token_required
def create_post():
    data = request.get_json()

    subject  = (data.get('subject')  or '').strip()
    topic    = (data.get('topic')    or '').strip()
    category = (data.get('category') or '').strip()

    if not subject or not topic or not category:
        return jsonify({'error': 'subject, topic, and category are required.'}), 400

    valid_cats = {'assignment', 'record', 'classwork', 'homework', 'important'}
    if category not in valid_cats:
        return jsonify({'error': f'Invalid category. Choose from: {", ".join(valid_cats)}'}), 400

    post_id = str(uuid.uuid4())

    conn = get_db()
    conn.execute('''
        INSERT INTO posts
            (id, subject, topic, extra, due, category, image_url, author_id, author_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        post_id,
        subject,
        topic,
        data.get('extra', ''),
        data.get('due', ''),
        category,
        data.get('image_url', ''),
        request.user['id'],
        request.user['name']
    ))
    conn.commit()

    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()
    conn.close()

    result = dict(post)
    result['done']   = bool(result['done'])
    result['pinned'] = bool(result['pinned'])

    return jsonify(result), 201


@posts_bp.route('/<post_id>/done', methods=['PATCH'])
@token_required
def toggle_done(post_id):
    conn = get_db()
    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()

    if not post:
        conn.close()
        return jsonify({'error': 'Post not found.'}), 404

    new_done = 0 if post['done'] else 1
    conn.execute('UPDATE posts SET done = ? WHERE id = ?', (new_done, post_id))
    conn.commit()

    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()
    conn.close()

    result = dict(post)
    result['done']   = bool(result['done'])
    result['pinned'] = bool(result['pinned'])
    return jsonify(result), 200


@posts_bp.route('/<post_id>/pin', methods=['PATCH'])
@token_required
def toggle_pin(post_id):
    conn = get_db()
    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()

    if not post:
        conn.close()
        return jsonify({'error': 'Post not found.'}), 404

    new_pin = 0 if post['pinned'] else 1
    conn.execute('UPDATE posts SET pinned = ? WHERE id = ?', (new_pin, post_id))
    conn.commit()

    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()
    conn.close()

    result = dict(post)
    result['done']   = bool(result['done'])
    result['pinned'] = bool(result['pinned'])
    return jsonify(result), 200


@posts_bp.route('/<post_id>', methods=['DELETE'])
@token_required
def delete_post(post_id):
    conn = get_db()
    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()

    if not post:
        conn.close()
        return jsonify({'error': 'Post not found.'}), 404

    if post['author_id'] != request.user['id']:
        conn.close()
        return jsonify({'error': 'You can only delete your own posts.'}), 403

    conn.execute('DELETE FROM posts WHERE id = ?', (post_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Post deleted.'}), 200


@posts_bp.route('/stats', methods=['GET'])
@token_required
def get_stats():
    from datetime import date
    today = date.today().isoformat()

    conn = get_db()

    total   = conn.execute('SELECT COUNT(*) FROM posts').fetchone()[0]
    pending = conn.execute('SELECT COUNT(*) FROM posts WHERE done = 0').fetchone()[0]
    done    = conn.execute('SELECT COUNT(*) FROM posts WHERE done = 1').fetchone()[0]
    overdue = conn.execute(
        "SELECT COUNT(*) FROM posts WHERE done = 0 AND due != '' AND due < ?",
        (today,)
    ).fetchone()[0]

    cats = {}
    for row in conn.execute(
        'SELECT category, COUNT(*) as cnt FROM posts GROUP BY category'
    ).fetchall():
        cats[row['category']] = row['cnt']

    conn.close()

    return jsonify({
        'total':   total,
        'pending': pending,
        'done':    done,
        'overdue': overdue,
        'by_category': cats
    }), 200