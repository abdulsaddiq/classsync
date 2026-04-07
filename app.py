from flask import Flask
from flask_cors import CORS
from backend.database import init_db
from backend.routes.auth import auth_bp
from backend.routes.posts import posts_bp

app = Flask(__name__)
app.config['SECRET_KEY'] = 'classsync-secret-key-change-in-production'

CORS(app,
     origins=["https://classsync-six.vercel.app"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)

init_db()

app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(posts_bp, url_prefix='/api/posts')

@app.route('/')
def index():
    return {'message': 'ClassSync API running'}

if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)