require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const connectDB = require('./database');
const fileRoutes = require('./routes/file-upload-routes');

const app = express();
const PORT = process.env.PORT || 5001;

connectDB();

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

const AI_KEY_CACHE_MS = 5 * 60 * 1000;
let aiKeyCache = { valid: null, checkedAt: 0 };

const checkAiKey = async () => {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return false;
    if (aiKeyCache.checkedAt && Date.now() - aiKeyCache.checkedAt < AI_KEY_CACHE_MS) {
        return aiKeyCache.valid;
    }
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey),
            { signal: controller.signal }
        );
        clearTimeout(timer);
        aiKeyCache = { valid: response.ok, checkedAt: Date.now() };
    } catch (err) {
        aiKeyCache = { valid: false, checkedAt: Date.now() };
    }
    return aiKeyCache.valid;
};

app.get('/api/health', async (req, res) => {
    const aiKeyValid = await checkAiKey();
    res.json({
        status: 'ok',
        database: DB_STATES[mongoose.connection.readyState] || 'unknown',
        aiConfigured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
        aiKeyValid,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.use('/api', fileRoutes.routes);

app.get('/', (req, res) => {
    res.send('DocAnalyzer API is running');
});

// Always answer with JSON so the React client can show a real message
// instead of an HTML error page (multer errors, disk errors, etc.).
app.use((err, req, res, next) => {
    if (!err) return next();
    if (err instanceof multer.MulterError || err.name === 'MulterError') {
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large. Maximum size is 25 MB.'
            : err.message;
        return res.status(400).json({ error: message });
    }
    console.error('Request failed:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});
