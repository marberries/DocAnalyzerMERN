const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const singleFileSchema = new Schema({
    fileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true
    },
    fileSize: {
        type: String,
        required: true
    },
    extractedText: {
        type: String,
        default: ''
    },
    summary: {
        type: String,
        default: ''
    },
    keyFindings: {
        type: [String],
        default: []
    },
    keywords: {
        type: [String],
        default: []
    },
    wordCount: {
        type: Number,
        default: 0
    },
    category: {
        type: String,
        default: 'General Document'
    }
}, { timestamps: true });

module.exports = mongoose.model('SingleFile', singleFileSchema);
