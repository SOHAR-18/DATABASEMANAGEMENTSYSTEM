import express from "express";
import sqlite3Package from "sqlite3";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize dotenv
config();

// Get sqlite3 constructor
const { verbose } = sqlite3Package;
const sqlite3 = verbose();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const SECRET_KEY = process.env.JWT_SECRET || "defaultsecretkey";

// Database setup
const db = new sqlite3.Database("./music.db", (err) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log("Connected to SQLite database.");
});

// Create tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        isAdmin INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        artist TEXT,
        filePath TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        userId INTEGER,
        FOREIGN KEY (userId) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS playlist_songs (
        playlistId INTEGER,
        songId INTEGER,
        FOREIGN KEY (playlistId) REFERENCES playlists(id),
        FOREIGN KEY (songId) REFERENCES songs(id),
        PRIMARY KEY (playlistId, songId)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS favorites (
        userId INTEGER,
        songId INTEGER,
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (songId) REFERENCES songs(id),
        PRIMARY KEY (userId, songId)
    )`);

    // Insert sample songs if they don't exist
    const sampleSongs = [
        { title: "Espresso", artist: "Sabrina Carpenter", filePath: "/songs/Sabrina Carpenter - Espresso (Official Video).mp3" },
        { title: "Blank Space", artist: "Taylor Swift", filePath: "/songs/Taylor Swift - Blank Space.mp3" },
        { title: "Baby", artist: "Justin Bieber", filePath: "/songs/Justin Bieber - Baby (Lyrics) Feat. Ludacris.mp3" }
    ];

    sampleSongs.forEach(song => {
        db.get("SELECT id FROM songs WHERE title = ? AND artist = ?", [song.title, song.artist], (err, row) => {
            if (!row) {
                db.run("INSERT INTO songs (title, artist, filePath) VALUES (?, ?, ?)", 
                    [song.title, song.artist, song.filePath]);
            }
        });
    });
});

// Middleware for verifying tokens
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(403).json({ error: "Access denied. No token provided." });

    jwt.verify(token.split(" ")[1], SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid token" });
        req.user = decoded;
        next();
    });
};

// Signup Route
app.post("/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing fields" });

        const hashedPassword = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function (err) {
            if (err) return res.status(400).json({ error: "Username already exists" });
            res.json({ message: "User registered successfully", userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// Login Route
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign({ id: user.id, isAdmin: user.isAdmin }, SECRET_KEY, { expiresIn: "2h" });
        res.json({ token, userId: user.id, isAdmin: user.isAdmin });
    });
});

// Logout Route
app.post("/logout", verifyToken, (req, res) => {
    res.json({ message: "Logout successful" });
});

// Playlist Routes
app.post("/playlists", verifyToken, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing playlist name" });

    db.run("INSERT INTO playlists (name, userId) VALUES (?, ?)", [name, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Playlist created successfully", playlistId: this.lastID });
    });
});

app.post("/playlists/:playlistId/songs", verifyToken, (req, res) => {
    const { songId } = req.body;
    const playlistId = req.params.playlistId;
    if (!songId) return res.status(400).json({ error: "Missing song ID" });

    // First check if the playlist belongs to the user
    db.get("SELECT id FROM playlists WHERE id = ? AND userId = ?", [playlistId, req.user.id], (err, playlist) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!playlist) return res.status(403).json({ error: "Playlist not found or unauthorized" });

        db.run("INSERT INTO playlist_songs (playlistId, songId) VALUES (?, ?)", [playlistId, songId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Song added to playlist successfully" });
        });
    });
});

app.get("/playlists", verifyToken, (req, res) => {
    db.all("SELECT * FROM playlists WHERE userId = ?", [req.user.id], (err, playlists) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // For each playlist, get its songs
        const playlistsWithSongs = playlists.map(playlist => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT songs.* FROM playlist_songs
                    JOIN songs ON playlist_songs.songId = songs.id
                    WHERE playlist_songs.playlistId = ?
                `, [playlist.id], (err, songs) => {
                    if (err) return reject(err);
                    resolve({ ...playlist, songs });
                });
            });
        });

        Promise.all(playlistsWithSongs)
            .then(results => res.json(results))
            .catch(error => res.status(500).json({ error: error.message }));
    });
});

// Songs Routes
app.get("/songs", (req, res) => {
    db.all("SELECT * FROM songs", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Favorites Routes
app.post("/favorites", verifyToken, (req, res) => {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: "Missing song ID" });

    db.run("INSERT INTO favorites (userId, songId) VALUES (?, ?)", [req.user.id, songId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Added to favorites", favoriteId: this.lastID });
    });
});

app.get("/favorites", verifyToken, (req, res) => {
    db.all(
        "SELECT songs.* FROM favorites JOIN songs ON favorites.songId = songs.id WHERE favorites.userId = ?",
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Delete a Song (Admin Only)
app.delete("/songs/:id", verifyToken, (req, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: "Unauthorized access" });

    const songId = req.params.id;
    db.run("DELETE FROM songs WHERE id = ?", [songId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Song not found" });
        res.json({ message: "Song deleted successfully" });
    });
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));