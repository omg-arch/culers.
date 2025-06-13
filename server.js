const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs'); // For password hashing
const WebSocket = require('ws'); // For real-time chat

const app = express();
const PORT = 3000;
const WS_PORT = 8080;

// Middleware
app.use(cors()); // Allow cross-origin requests from your frontend
app.use(express.json({ limit: '50mb' })); // To parse JSON bodies, increased limit for base64 images/videos

// Initialize SQLite Database
// The database file will be created in the 'server' directory
const db = new sqlite3.Database('./culers.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the culers.db SQLite database.');
        // Create tables if they don't exist
        db.serialize(() => {
            // Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                bio TEXT,
                profilePic TEXT
            )`);

            // Posts Table
            db.run(`CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY,
                user TEXT NOT NULL,
                text TEXT,
                mediaUrl TEXT,
                mediaType TEXT,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (user) REFERENCES users(username) ON DELETE CASCADE
            )`);

            // Likes Table
            db.run(`CREATE TABLE IF NOT EXISTS likes (
                postId TEXT NOT NULL,
                userId TEXT NOT NULL,
                PRIMARY KEY (postId, userId),
                FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES users(username) ON DELETE CASCADE
            )`);

            // Comments Table
            db.run(`CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                postId TEXT NOT NULL,
                user TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
                FOREIGN KEY (user) REFERENCES users(username) ON DELETE CASCADE
            )`);

            // Follows Table
            db.run(`CREATE TABLE IF NOT EXISTS follows (
                follower TEXT NOT NULL,
                followed TEXT NOT NULL,
                PRIMARY KEY (follower, followed),
                FOREIGN KEY (follower) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY (followed) REFERENCES users(username) ON DELETE CASCADE
            )`);

            // Notifications Table
            db.run(`CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL, -- 'follow', 'like'
                byUser TEXT NOT NULL,
                recipientUser TEXT NOT NULL,
                targetPostId TEXT, -- Nullable for follow notifications
                timestamp INTEGER NOT NULL,
                read INTEGER DEFAULT 0, -- 0 for unread, 1 for read
                FOREIGN KEY (byUser) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY (recipientUser) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY (targetPostId) REFERENCES posts(id) ON DELETE CASCADE
            )`);

            // Live Chat Messages Table (for persistence, though WebSocket handles real-time)
            db.run(`CREATE TABLE IF NOT EXISTS live_chat_messages (
                id TEXT PRIMARY KEY,
                sender TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (sender) REFERENCES users(username) ON DELETE CASCADE
            )`);

            console.log('All tables checked/created.');
        });
    }
});

// Helper function to generate unique IDs
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

// --- USER AUTHENTICATION & PROFILE APIS ---

// Register User
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, bio, profilePic) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, '', ''], // Default empty bio and pic
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(409).json({ message: 'Username already exists.' });
                    }
                    console.error('Error registering user:', err.message);
                    return res.status(500).json({ message: 'Error registering user.' });
                }
                res.status(201).json({ message: 'User registered successfully!' });
            }
        );
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// Login User
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Error during login:', err.message);
            return res.status(500).json({ message: 'Error during login.' });
        }
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password.' });
        }
        try {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid username or password.' });
            }
            // In a real app, you'd issue a JWT token here
            res.status(200).json({ message: 'Login successful!', user: user.username });
        } catch (error) {
            console.error('Error comparing passwords:', error);
            res.status(500).json({ message: 'Server error during login.' });
        }
    });
});

// Get User Profile
app.get('/api/users/:username', (req, res) => {
    const { username } = req.params;
    db.get('SELECT username, bio, profilePic FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error('Error fetching user profile:', err.message);
            return res.status(500).json({ message: 'Error fetching user profile.' });
        }
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(user);
    });
});

// Update User Profile (Bio)
app.put('/api/users/:username/bio', (req, res) => {
    const { username } = req.params;
    const { bio } = req.body;
    db.run('UPDATE users SET bio = ? WHERE username = ?', [bio, username], function (err) {
        if (err) {
            console.error('Error updating user bio:', err.message);
            return res.status(500).json({ message: 'Error updating bio.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'User not found or no changes made.' });
        }
        res.json({ message: 'Bio updated successfully!' });
    });
});

// Update User Profile (Picture)
app.put('/api/users/:username/profilePic', (req, res) => {
    const { username } = req.params;
    const { profilePic } = req.body; // Base64 string of the image
    db.run('UPDATE users SET profilePic = ? WHERE username = ?', [profilePic, username], function (err) {
        if (err) {
            console.error('Error updating user profile picture:', err.message);
            return res.status(500).json({ message: 'Error updating profile picture.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'User not found or no changes made.' });
        }
        res.json({ message: 'Profile picture updated successfully!' });
    });
});

// Get all users (for following/followers lists)
app.get('/api/users', (req, res) => {
    db.all('SELECT username, bio, profilePic FROM users', [], (err, users) => {
        if (err) {
            console.error('Error fetching all users:', err.message);
            return res.status(500).json({ message: 'Error fetching users.' });
        }
        res.json(users);
    });
});

// --- POST APIS ---

// Create Post
app.post('/api/posts', (req, res) => {
    const { user, text, mediaUrl, mediaType } = req.body;
    if (!user || (!text && !mediaUrl)) {
        return res.status(400).json({ message: 'User and either text or media are required.' });
    }
    const id = generateId();
    const timestamp = Date.now();
    db.run('INSERT INTO posts (id, user, text, mediaUrl, mediaType, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [id, user, text, mediaUrl, mediaType, timestamp],
        function (err) {
            if (err) {
                console.error('Error creating post:', err.message);
                return res.status(500).json({ message: 'Error creating post.' });
            }
            res.status(201).json({ id, user, text, mediaUrl, mediaType, timestamp, likes: [], comments: [] });
        }
    );
});

// Get All Posts (with likes and comments)
app.get('/api/posts', (req, res) => {
    db.all('SELECT * FROM posts ORDER BY timestamp DESC', [], (err, posts) => {
        if (err) {
            console.error('Error fetching posts:', err.message);
            return res.status(500).json({ message: 'Error fetching posts.' });
        }

        if (posts.length === 0) {
            return res.json([]);
        }

        // Fetch likes and comments for each post
        const fetchDetails = posts.map(post => {
            return new Promise((resolve, reject) => {
                db.all('SELECT userId FROM likes WHERE postId = ?', [post.id], (err, likes) => {
                    if (err) {
                        return reject(err);
                    }
                    post.likes = likes.map(l => l.userId);
                    db.all('SELECT user, text, id FROM comments WHERE postId = ? ORDER BY timestamp ASC', [post.id], (err, comments) => {
                        if (err) {
                            return reject(err);
                        }
                        post.comments = comments;
                        resolve(post);
                    });
                });
            });
        });

        Promise.all(fetchDetails)
            .then(detailedPosts => res.json(detailedPosts))
            .catch(error => {
                console.error('Error fetching post details:', error.message);
                res.status(500).json({ message: 'Error fetching post details.' });
            });
    });
});

// Get Single Post
app.get('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
        if (err) {
            console.error('Error fetching single post:', err.message);
            return res.status(500).json({ message: 'Error fetching post.' });
        }
        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }
        // Fetch likes and comments for this specific post
        db.all('SELECT userId FROM likes WHERE postId = ?', [post.id], (err, likes) => {
            if (err) {
                console.error('Error fetching likes for post:', err.message);
                return res.status(500).json({ message: 'Error fetching post likes.' });
            }
            post.likes = likes.map(l => l.userId);
            db.all('SELECT user, text, id FROM comments WHERE postId = ? ORDER BY timestamp ASC', [post.id], (err, comments) => {
                if (err) {
                    console.error('Error fetching comments for post:', err.message);
                    return res.status(500).json({ message: 'Error fetching post comments.' });
                }
                post.comments = comments;
                res.json(post);
            });
        });
    });
});


// Update Post (Text only for now)
app.put('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    const { text, mediaUrl, mediaType } = req.body;
    db.run('UPDATE posts SET text = ?, mediaUrl = ?, mediaType = ? WHERE id = ?', [text, mediaUrl, mediaType, id], function (err) {
        if (err) {
            console.error('Error updating post:', err.message);
            return res.status(500).json({ message: 'Error updating post.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Post not found or no changes made.' });
        }
        res.json({ message: 'Post updated successfully!' });
    });
});

// Delete Post
app.delete('/api/posts/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM posts WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Error deleting post:', err.message);
            return res.status(500).json({ message: 'Error deleting post.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Post not found.' });
        }
        res.json({ message: 'Post deleted successfully!' });
    });
});

// --- LIKES APIS ---

// Toggle Like
app.post('/api/posts/:postId/like', (req, res) => {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID is required.' });

    db.get('SELECT * FROM likes WHERE postId = ? AND userId = ?', [postId, userId], (err, like) => {
        if (err) {
            console.error('Error checking like status:', err.message);
            return res.status(500).json({ message: 'Error toggling like.' });
        }

        if (like) {
            // Unlike
            db.run('DELETE FROM likes WHERE postId = ? AND userId = ?', [postId, userId], function (err) {
                if (err) {
                    console.error('Error unliking post:', err.message);
                    return res.status(500).json({ message: 'Error unliking post.' });
                }
                res.json({ message: 'Post unliked.', liked: false });
            });
        } else {
            // Like
            db.run('INSERT INTO likes (postId, userId) VALUES (?, ?)', [postId, userId], function (err) {
                if (err) {
                    console.error('Error liking post:', err.message);
                    return res.status(500).json({ message: 'Error liking post.' });
                }
                // Add notification for the post owner
                db.get('SELECT user FROM posts WHERE id = ?', [postId], (err, post) => {
                    if (post && post.user !== userId) { // Don't notify if user liked their own post
                        db.run('INSERT INTO notifications (id, type, byUser, recipientUser, targetPostId, timestamp, read) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [generateId(), 'like', userId, post.user, postId, Date.now(), 0],
                            (notificationErr) => {
                                if (notificationErr) console.error('Error adding like notification:', notificationErr.message);
                            }
                        );
                    }
                });
                res.json({ message: 'Post liked.', liked: true });
            });
        }
    });
});

// --- COMMENTS APIS ---

// Add Comment
app.post('/api/posts/:postId/comments', (req, res) => {
    const { postId } = req.params;
    const { user, text } = req.body;
    if (!user || !text) {
        return res.status(400).json({ message: 'User and text are required for a comment.' });
    }
    const id = generateId();
    const timestamp = Date.now();
    db.run('INSERT INTO comments (id, postId, user, text, timestamp) VALUES (?, ?, ?, ?, ?)',
        [id, postId, user, text, timestamp],
        function (err) {
            if (err) {
                console.error('Error adding comment:', err.message);
                return res.status(500).json({ message: 'Error adding comment.' });
            }
            res.status(201).json({ id, postId, user, text, timestamp });
        }
    );
});

// Delete Comment
app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
    const { postId, commentId } = req.params;
    // For simplicity, we just delete by commentId. In a real app, you'd verify if the current user owns the comment or the post.
    db.run('DELETE FROM comments WHERE id = ? AND postId = ?', [commentId, postId], function (err) {
        if (err) {
            console.error('Error deleting comment:', err.message);
            return res.status(500).json({ message: 'Error deleting comment.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Comment not found or already deleted.' });
        }
        res.json({ message: 'Comment deleted successfully.' });
    });
});

// --- FOLLOW APIS ---

// Toggle Follow
app.post('/api/users/:targetUser/follow', (req, res) => {
    const { targetUser } = req.params;
    const { followerUser } = req.body; // The user initiating the follow/unfollow
    if (!followerUser || !targetUser) {
        return res.status(400).json({ message: 'Follower and target user are required.' });
    }

    if (followerUser === targetUser) {
        return res.status(400).json({ message: 'Cannot follow yourself.' });
    }

    db.get('SELECT * FROM follows WHERE follower = ? AND followed = ?', [followerUser, targetUser], (err, follow) => {
        if (err) {
            console.error('Error checking follow status:', err.message);
            return res.status(500).json({ message: 'Error toggling follow.' });
        }

        if (follow) {
            // Unfollow
            db.run('DELETE FROM follows WHERE follower = ? AND followed = ?', [followerUser, targetUser], function (err) {
                if (err) {
                    console.error('Error unfollowing user:', err.message);
                    return res.status(500).json({ message: 'Error unfollowing user.' });
                }
                res.json({ message: 'Unfollowed.', following: false });
            });
        } else {
            // Follow
            db.run('INSERT INTO follows (follower, followed) VALUES (?, ?)', [followerUser, targetUser], function (err) {
                if (err) {
                    console.error('Error following user:', err.message);
                    return res.status(500).json({ message: 'Error following user.' });
                }
                // Add notification for the followed user
                db.run('INSERT INTO notifications (id, type, byUser, recipientUser, targetPostId, timestamp, read) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [generateId(), 'follow', followerUser, targetUser, null, Date.now(), 0],
                    (notificationErr) => {
                        if (notificationErr) console.error('Error adding follow notification:', notificationErr.message);
                    }
                );
                res.json({ message: 'Followed.', following: true });
            });
        }
    });
});

// Get Following list for a user
app.get('/api/users/:username/following', (req, res) => {
    const { username } = req.params;
    db.all('SELECT followed FROM follows WHERE follower = ?', [username], (err, users) => {
        if (err) {
            console.error('Error fetching following list:', err.message);
            return res.status(500).json({ message: 'Error fetching following list.' });
        }
        res.json(users.map(u => u.followed));
    });
});

// Get Followers list for a user
app.get('/api/users/:username/followers', (req, res) => {
    const { username } = req.params;
    db.all('SELECT follower FROM follows WHERE followed = ?', [username], (err, users) => {
        if (err) {
            console.error('Error fetching followers list:', err.message);
            return res.status(500).json({ message: 'Error fetching followers list.' });
        }
        res.json(users.map(u => u.follower));
    });
});

// --- NOTIFICATION APIS ---

// Get Notifications for a user
app.get('/api/notifications/:username', (req, res) => {
    const { username } = req.params;
    db.all('SELECT * FROM notifications WHERE recipientUser = ? ORDER BY timestamp DESC', [username], (err, notifications) => {
        if (err) {
            console.error('Error fetching notifications:', err.message);
            return res.status(500).json({ message: 'Error fetching notifications.' });
        }
        res.json(notifications);
    });
});

// Mark Notification as Read
app.put('/api/notifications/:notificationId/read', (req, res) => {
    const { notificationId } = req.params;
    db.run('UPDATE notifications SET read = 1 WHERE id = ?', [notificationId], function (err) {
        if (err) {
            console.error('Error marking notification as read:', err.message);
            return res.status(500).json({ message: 'Error marking notification as read.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Notification not found or already read.' });
        }
        res.json({ message: 'Notification marked as read.' });
    });
});


// --- LIVE CHAT APIS (for historical messages and initial load) ---

// Get Live Chat History (last N messages)
app.get('/api/livechat', (req, res) => {
    db.all('SELECT sender, text, timestamp FROM live_chat_messages ORDER BY timestamp ASC LIMIT 100', [], (err, messages) => {
        if (err) {
            console.error('Error fetching live chat history:', err.message);
            return res.status(500).json({ message: 'Error fetching live chat history.' });
        }
        res.json(messages);
    });
});

// Store a live chat message (for persistence)
const storeLiveChatMessage = (sender, text) => {
    const id = generateId();
    const timestamp = Date.now();
    db.run('INSERT INTO live_chat_messages (id, sender, text, timestamp) VALUES (?, ?, ?, ?)',
        [id, sender, text, timestamp],
        (err) => {
            if (err) console.error('Error storing live chat message:', err.message);
        }
    );
};


// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API documentation:`);
    console.log(`- POST /api/register`);
    console.log(`- POST /api/login`);
    console.log(`- GET /api/users/:username`);
    console.log(`- PUT /api/users/:username/bio`);
    console.log(`- PUT /api/users/:username/profilePic`);
    console.log(`- GET /api/users (all users)`);
    console.log(`- POST /api/posts`);
    console.log(`- GET /api/posts`);
    console.log(`- GET /api/posts/:id`);
    console.log(`- PUT /api/posts/:id`);
    console.log(`- DELETE /api/posts/:id`);
    console.log(`- POST /api/posts/:postId/like`);
    console.log(`- POST /api/posts/:postId/comments`);
    console.log(`- DELETE /api/posts/:postId/comments/:commentId`);
    console.log(`- POST /api/users/:targetUser/follow`);
    console.log(`- GET /api/users/:username/following`);
    console.log(`- GET /api/users/:username/followers`);
    console.log(`- GET /api/notifications/:username`);
    console.log(`- PUT /api/notifications/:notificationId/read`);
    console.log(`- GET /api/livechat`);
});


// --- WEBSOCKET SERVER FOR LIVE CHAT ---
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', ws => {
    console.log('Client connected to WebSocket.');

    ws.on('message', message => {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        if (msg.type === 'chatMessage') {
            const { sender, text } = msg;
            console.log(`Received chat message from ${sender}: ${text}`);

            // Store message in DB for persistence
            storeLiveChatMessage(sender, text);

            // Broadcast message to all connected clients
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'chatMessage', sender, text, timestamp: Date.now() }));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket.');
    });

    ws.on('error', error => {
        console.error('WebSocket error:', error);
    });
});

console.log(`WebSocket server for live chat is running on ws://localhost:${WS_PORT}`);