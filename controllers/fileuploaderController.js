const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const SingleFile = require('../models/singlefile');
const MultipleFile = require('../models/multiplefile');

const fileSizeFormatter = (bytes, decimal) => {
    if (bytes === 0) {
        return '0 Bytes';
    }
    const dm = decimal || 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1000));
    return parseFloat((bytes / Math.pow(1000, index)).toFixed(dm)) + ' ' + sizes[index];
};

const extractDocumentContent = async (filePath, mimeType, originalName) => {
    let text = '';
    try {
        const absolutePath = path.resolve(filePath);
        if (mimeType === 'application/pdf') {
            const dataBuffer = fs.readFileSync(absolutePath);
            if (typeof pdfParse === 'function') {
                const parsed = await pdfParse(dataBuffer);
                text = parsed.text || '';
            } else if (pdfParse && pdfParse.PDFParse) {
                const parser = new pdfParse.PDFParse({ data: dataBuffer });
                const parsed = await parser.getText();
                text = parsed.text || '';
            }
        } else if (
            mimeType.startsWith('text/') ||
            mimeType === 'application/json'
        ) {
            text = fs.readFileSync(absolutePath, 'utf8');
        } else if (mimeType.startsWith('image/')) {
            text = `Document image: ${originalName} (${mimeType})`;
        } else {
            text = `Document of type ${mimeType}: ${originalName}`;
        }
    } catch (err) {
        text = `File uploaded: ${originalName}. Automatic text extraction is unavailable.`;
    }
    return text.replace(/\s+/g, ' ').trim();
};

const analyzeDocumentText = async (text, originalName) => {
    const cleanText = text || originalName;
    const words = cleanText
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/gi, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);

    const wordCount = words.length;

    const stopWords = new Set([
        'this', 'that', 'with', 'from', 'have', 'were', 'been', 'their', 'which',
        'will', 'would', 'there', 'about', 'into', 'more', 'other', 'such', 'only',
        'also', 'than', 'then', 'them', 'these', 'some', 'could', 'what', 'when',
        'where', 'each', 'every', 'both', 'most', 'many', 'must', 'shall', 'should'
    ]);

    const freq = {};
    words.forEach((w) => {
        if (!stopWords.has(w)) {
            freq[w] = (freq[w] || 0) + 1;
        }
    });

    const keywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map((entry) => entry[0]);

    let category = 'General Document';
    const lower = cleanText.toLowerCase();
    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('clause') || lower.includes('legal')) {
        category = 'Legal / Contract';
    } else if (lower.includes('invoice') || lower.includes('payment') || lower.includes('budget') || lower.includes('financial')) {
        category = 'Financial Report';
    } else if (lower.includes('lecture') || lower.includes('research') || lower.includes('algorithm') || lower.includes('university')) {
        category = 'Academic / Research';
    } else if (lower.includes('api') || lower.includes('server') || lower.includes('database') || lower.includes('architecture')) {
        category = 'Technical Documentation';
    }

    let summary = cleanText.length > 220
        ? cleanText.slice(0, 220) + '...'
        : cleanText;

    if (process.env.GEMINI_API_KEY && cleanText.length > 30) {
        try {
            const { GoogleGenAI } = require('@google/genai');
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Provide a concise, structured summary (2-3 sentences in English) for the following document:\n\n${cleanText.slice(0, 4000)}`
            });
            if (response && response.text) {
                summary = response.text.trim();
            }
        } catch (aiErr) {
            // Keep local summary if external API is unavailable
        }
    }

    return { summary, keywords, wordCount, category };
};

const singleFileUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded or unsupported file format');
        }
        const extractedText = await extractDocumentContent(
            req.file.path,
            req.file.mimetype,
            req.file.originalname
        );
        const analysis = await analyzeDocumentText(extractedText, req.file.originalname);

        const file = new SingleFile({
            fileName: req.file.originalname,
            filePath: req.file.path,
            fileType: req.file.mimetype,
            fileSize: fileSizeFormatter(req.file.size, 2),
            extractedText: extractedText.slice(0, 10000),
            summary: analysis.summary,
            keywords: analysis.keywords,
            wordCount: analysis.wordCount,
            category: analysis.category
        });
        await file.save();
        res.status(201).send(file);
    } catch (error) {
        res.status(400).send(error.message);
    }
};

const multipleFileUpload = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('No files selected');
        }
        let filesArray = [];
        let combinedTexts = [];

        for (const element of req.files) {
            const extractedText = await extractDocumentContent(
                element.path,
                element.mimetype,
                element.originalname
            );
            const analysis = await analyzeDocumentText(extractedText, element.originalname);
            combinedTexts.push(`${element.originalname}: ${analysis.summary}`);

            const file = {
                fileName: element.originalname,
                filePath: element.path,
                fileType: element.mimetype,
                fileSize: fileSizeFormatter(element.size, 2),
                summary: analysis.summary,
                keywords: analysis.keywords,
                wordCount: analysis.wordCount,
                category: analysis.category
            };
            filesArray.push(file);
        }

        const multipleFiles = new MultipleFile({
            title: req.body.title || 'Document Batch',
            files: filesArray,
            batchSummary: `Analyzed files: ${filesArray.length}. ${combinedTexts.join(' | ').slice(0, 400)}`
        });
        await multipleFiles.save();
        res.status(201).send(multipleFiles);
    } catch (error) {
        res.status(400).send(error.message);
    }
};

const getallSingleFiles = async (req, res) => {
    try {
        const files = await SingleFile.find().sort({ createdAt: -1 });
        res.status(200).send(files);
    } catch (error) {
        res.status(400).send(error.message);
    }
};

const getallMultipleFiles = async (req, res) => {
    try {
        const files = await MultipleFile.find().sort({ createdAt: -1 });
        res.status(200).send(files);
    } catch (error) {
        res.status(400).send(error.message);
    }
};

const deleteSingleFile = async (req, res) => {
    try {
        const file = await SingleFile.findById(req.params.id);
        if (!file) {
            return res.status(404).send('Document not found');
        }
        const absolutePath = path.resolve(file.filePath);
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
        await SingleFile.findByIdAndDelete(req.params.id);
        res.status(200).send({ message: 'Document deleted successfully', id: req.params.id });
    } catch (error) {
        res.status(400).send(error.message);
    }
};

module.exports = {
    singleFileUpload,
    multipleFileUpload,
    getallSingleFiles,
    getallMultipleFiles,
    deleteSingleFile
};
