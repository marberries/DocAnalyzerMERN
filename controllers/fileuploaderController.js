const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const SingleFile = require('../models/singlefile');
const MultipleFile = require('../models/multiplefile');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const fileSizeFormatter = (bytes, decimal) => {
    if (bytes === 0) return '0 Bytes';
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
        } else if (mimeType === DOCX_MIME || originalName.toLowerCase().endsWith('.docx')) {
            const result = await mammoth.extractRawText({ path: absolutePath });
            text = result.value || '';
        } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
            text = fs.readFileSync(absolutePath, 'utf8');
        } else if (mimeType.startsWith('image/')) {
            text = '';
        }
    } catch (err) {
        console.error('Extraction error:', err.message);
    }
    return text.replace(/\s+/g, ' ').trim();
};

const buildLocalSummary = (cleanText, originalName) => {
    if (!cleanText || cleanText.length < 15) {
        return `File "${originalName}" uploaded. No readable plain text layer detected.`;
    }
    const sentences = cleanText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30 && s.length < 320);

    if (sentences.length >= 2) {
        return sentences.slice(0, 3).join(' ');
    }
    return cleanText.length > 320 ? cleanText.slice(0, 320) + '...' : cleanText;
};

const extractLocalKeywords = (cleanText) => {
    if (!cleanText) return [];
    const words = cleanText
        .toLowerCase()
        .replace(/[^a-zа-яё0-9\s-]/gi, '')
        .split(/\s+/)
        .filter((w) => w.length > 3 && w.length < 24);

    const stopWords = new Set([
        'this', 'that', 'with', 'from', 'have', 'were', 'been', 'their', 'which',
        'will', 'would', 'there', 'about', 'into', 'more', 'other', 'such', 'only',
        'also', 'than', 'then', 'them', 'these', 'some', 'could', 'what', 'when',
        'where', 'each', 'every', 'both', 'most', 'many', 'must', 'shall', 'should',
        'document', 'file', 'page', 'using', 'based'
    ]);

    const freq = {};
    words.forEach((w) => {
        if (!stopWords.has(w)) {
            freq[w] = (freq[w] || 0) + 1;
        }
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map((entry) => entry[0]);
};

const callGeminiWithAutoFallback = async (ai, apiKey, contentsPayload) => {
    const primaryModels = ['gemini-3.8-flash', 'gemini-3.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
    const tried = new Set();
    let lastError = null;

    const tryModel = async (modelName) => {
        if (!modelName || tried.has(modelName)) return null;
        tried.add(modelName);
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: contentsPayload,
                config: { responseMimeType: 'application/json' }
            });
            if (response && response.text) {
                console.log(`Gemini analysis succeeded with model: ${modelName}`);
                return response.text;
            }
        } catch (err) {
            lastError = err;
            try {
                const plainResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: contentsPayload
                });
                if (plainResponse && plainResponse.text) {
                    console.log(`Gemini analysis (plain JSON) succeeded with model: ${modelName}`);
                    return plainResponse.text;
                }
            } catch (plainErr) {
                lastError = plainErr;
            }
        }
        return null;
    };

    for (const modelName of primaryModels) {
        const resText = await tryModel(modelName);
        if (resText) return resText;
    }

    try {
        const listRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        );
        if (listRes.ok) {
            const listData = await listRes.json();
            const candidates = (listData.models || [])
                .filter(
                    (m) =>
                        Array.isArray(m.supportedGenerationMethods) &&
                        m.supportedGenerationMethods.includes('generateContent') &&
                        m.name &&
                        m.name.includes('gemini') &&
                        !m.name.includes('embedding') &&
                        !m.name.includes('aqa') &&
                        !m.name.includes('imagen') &&
                        !m.name.includes('veo')
                )
                .map((m) => m.name.replace(/^models\//, ''))
                .sort((a, b) => (b.includes('flash') ? 1 : 0) - (a.includes('flash') ? 1 : 0));

            for (const candidate of candidates) {
                const resText = await tryModel(candidate);
                if (resText) return resText;
            }
        }
    } catch (discoveryErr) {
        lastError = discoveryErr;
    }

    throw lastError || new Error('No compatible Gemini model responded');
};

const analyzeDocument = async (filePath, mimeType, extractedText, originalName) => {
    const words = extractedText
        ? extractedText.split(/\s+/).filter((w) => w.length > 0)
        : [];
    const wordCount = words.length;

    let category = 'General Document';
    const lower = (extractedText + ' ' + originalName).toLowerCase();
    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('clause') || lower.includes('legal')) {
        category = 'Legal / Contract';
    } else if (lower.includes('invoice') || lower.includes('payment') || lower.includes('budget') || lower.includes('financial')) {
        category = 'Financial Report';
    } else if (lower.includes('lecture') || lower.includes('research') || lower.includes('algorithm') || lower.includes('university') || lower.includes('laboratory')) {
        category = 'Academic / Research';
    } else if (lower.includes('api') || lower.includes('server') || lower.includes('database') || lower.includes('architecture') || lower.includes('resume') || lower.includes('cv')) {
        category = 'Technical Documentation';
    }

    let summary = buildLocalSummary(extractedText, originalName);
    let keywords = extractLocalKeywords(extractedText);
    let keyFindings = [];
    let aiAnalyzed = false;
    let aiError = '';
    let finalText = extractedText;

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
        aiError = 'GEMINI_API_KEY is empty in server .env file';
    } else {
        try {
            const { GoogleGenAI } = require('@google/genai');
            const ai = new GoogleGenAI({ apiKey });

            const instruction = `You are a professional document analysis engine. Analyze the provided document (even if the source text is in Russian or another language, write ALL output fields strictly in English). Return ONLY valid JSON with these exact keys:
{
  "summary": "2-3 sentence executive summary in English explaining the document purpose, role/subject, and main conclusions",
  "category": "Choose strictly one: Legal / Contract, Financial Report, Academic / Research, Technical Documentation, General Document",
  "keywords": ["5 to 6 concise English topic tags in lowercase"],
  "keyFindings": ["3 specific factual takeaways in English extracted from the document"],
  "ocrText": "If input is an image without extracted text, transcribe the visible text; otherwise leave empty string"
}`;

            let contentsPayload;
            if (mimeType && mimeType.startsWith('image/')) {
                const imgBase64 = fs.readFileSync(path.resolve(filePath)).toString('base64');
                contentsPayload = [
                    instruction,
                    {
                        inlineData: {
                            data: imgBase64,
                            mimeType: mimeType
                        }
                    }
                ];
            } else if (extractedText && extractedText.length > 10) {
                contentsPayload = `${instruction}\n\nFilename: ${originalName}\nDocument content:\n${extractedText.slice(0, 8000)}`;
            } else {
                aiError = 'No readable text extracted from file to send to AI';
            }

            if (contentsPayload) {
                const rawResponseText = await callGeminiWithAutoFallback(ai, apiKey, contentsPayload);
                const cleanJson = rawResponseText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/```\s*$/i, '')
                    .trim();
                const parsed = JSON.parse(cleanJson);
                if (parsed.summary) summary = parsed.summary;
                if (parsed.category) category = parsed.category;
                if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
                    keywords = parsed.keywords.slice(0, 6).map((k) => String(k).toLowerCase());
                }
                if (Array.isArray(parsed.keyFindings) && parsed.keyFindings.length > 0) {
                    keyFindings = parsed.keyFindings.slice(0, 4);
                }
                if (!finalText && parsed.ocrText) {
                    finalText = parsed.ocrText;
                }
                aiAnalyzed = true;
                aiError = '';
            }
        } catch (aiErr) {
            aiError = aiErr.message || 'Unknown Gemini API error';
            console.error('Gemini API error:', aiError);
        }
    }

    return {
        summary,
        keyFindings,
        keywords,
        wordCount: finalText ? finalText.split(/\s+/).filter(Boolean).length : wordCount,
        category,
        aiAnalyzed,
        aiError,
        extractedText: finalText
    };
};

const singleFileUpload = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded or unsupported file format');
        }
        const rawText = await extractDocumentContent(
            req.file.path,
            req.file.mimetype,
            req.file.originalname
        );
        const analysis = await analyzeDocument(
            req.file.path,
            req.file.mimetype,
            rawText,
            req.file.originalname
        );

        const file = new SingleFile({
            fileName: req.file.originalname,
            filePath: req.file.path,
            fileType: req.file.mimetype,
            fileSize: fileSizeFormatter(req.file.size, 2),
            extractedText: (analysis.extractedText || '').slice(0, 15000),
            summary: analysis.summary,
            keyFindings: analysis.keyFindings,
            keywords: analysis.keywords,
            wordCount: analysis.wordCount,
            category: analysis.category,
            aiAnalyzed: analysis.aiAnalyzed,
            aiError: analysis.aiError
        });
        await file.save();
        res.status(201).send(file);
    } catch (error) {
        res.status(400).send(error.message);
    }
};

const reanalyzeSingleFile = async (req, res) => {
    try {
        const file = await SingleFile.findById(req.params.id);
        if (!file) {
            return res.status(404).send('Document not found');
        }
        let rawText = file.extractedText;
        if (!rawText || rawText.length < 15) {
            rawText = await extractDocumentContent(file.filePath, file.fileType, file.fileName);
        }
        const analysis = await analyzeDocument(
            file.filePath,
            file.fileType,
            rawText,
            file.fileName
        );

        file.extractedText = (analysis.extractedText || '').slice(0, 15000);
        file.summary = analysis.summary;
        file.keyFindings = analysis.keyFindings;
        file.keywords = analysis.keywords;
        file.wordCount = analysis.wordCount;
        file.category = analysis.category;
        file.aiAnalyzed = analysis.aiAnalyzed;
        file.aiError = analysis.aiError;

        await file.save();
        res.status(200).send(file);
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
            const rawText = await extractDocumentContent(
                element.path,
                element.mimetype,
                element.originalname
            );
            const analysis = await analyzeDocument(
                element.path,
                element.mimetype,
                rawText,
                element.originalname
            );
            combinedTexts.push(`${element.originalname}: ${analysis.summary}`);

            filesArray.push({
                fileName: element.originalname,
                filePath: element.path,
                fileType: element.mimetype,
                fileSize: fileSizeFormatter(element.size, 2),
                extractedText: (analysis.extractedText || '').slice(0, 8000),
                summary: analysis.summary,
                keyFindings: analysis.keyFindings,
                keywords: analysis.keywords,
                wordCount: analysis.wordCount,
                category: analysis.category,
                aiAnalyzed: analysis.aiAnalyzed,
                aiError: analysis.aiError
            });
        }

        const multipleFiles = new MultipleFile({
            title: req.body.title || 'Document Batch',
            files: filesArray,
            batchSummary: combinedTexts.join(' | ').slice(0, 600)
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
    reanalyzeSingleFile,
    multipleFileUpload,
    getallSingleFiles,
    getallMultipleFiles,
    deleteSingleFile
};
