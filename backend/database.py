import sqlite3
import os

DB_PATH = 'classsync.db'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT    NOT NULL,
            roll      TEXT    NOT NULL UNIQUE,
            password  TEXT    NOT NULL,
            created_at TEXT   DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS posts (
            id         TEXT    PRIMARY KEY,
            subject    TEXT    NOT NULL,
            topic      TEXT    NOT NULL,
            extra      TEXT    DEFAULT '',
            due        TEXT    DEFAULT '',
            category   TEXT    NOT NULL,
            image_url  TEXT    DEFAULT '',
            author_id  INTEGER NOT NULL,
            author_name TEXT   NOT NULL,
            done       INTEGER DEFAULT 0,
            pinned     INTEGER DEFAULT 0,
            created_at TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (author_id) REFERENCES users(id)
        );
    ''')

    conn.commit()
    conn.close()
    print("✅ Database initialized.")