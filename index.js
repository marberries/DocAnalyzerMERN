require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const connectDB = require('./database');
const fileRoutes = require('./routes/file-upload-routes');

const app = express();
const PORT = process.env.PORT || 5001;

connectDB();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
