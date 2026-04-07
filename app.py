from flask import Flask
from flask_cors import CORS
from backend.database import init_db
from backend.routes.auth import auth_bp
from backend.routes.posts import posts_bp
import os

app = Flask(__name__)

# 🔐 Secret key
app.config['SECRET_KEY'] = 'classsync-secret-key-change-in-production'

# ✅ CORRECT CORS (WORKS WITH JWT HEADERS)
CORS(app,
     resources={r"/api/*": {"origins": "*"}},
     supports_credentials=False)

# ✅ HANDLE PREFLIGHT (OPTIONS) REQUESTS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    return response

# 🗄️ Init DB
init_db()

# 🔗 Routes
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(posts_bp, url_prefix='/api/posts')

# 🏠 Root route
@app.route('/')
def index():
    return {'message': 'ClassSync API running'}

# 🚀 Run (Render compatible)
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)