const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads');
    },
    filename: (req, file, cb) => {
        const safeName = path.basename(file.originalname || 'file').replace(/[^a-zA-Z0-9._ -]/g, '_');
        cb(null, new Date().toISOString().replace(/:/g, '-') + '-' + safeName);
    }
});

const filefilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/json',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png',
        'image/jpg',
        'image/jpeg'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(null, false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: filefilter,
    limits: { fileSize: 25 * 1024 * 1024, files: 20 }
});

module.exports = { upload };
