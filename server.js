require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting (simple in-memory implementation)
const rateLimitStore = new Map();
const RATE_LIMIT = 30; // requests per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function checkRateLimit(ip) {
    const now = Date.now();
    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, []);
    }
    
    const requests = rateLimitStore.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW);
    rateLimitStore.set(ip, requests);
    
    if (requests.length >= RATE_LIMIT) {
        return false;
    }
    
    requests.push(now);
    rateLimitStore.set(ip, requests);
    return true;
}

// System prompt
const SYSTEM_PROMPT = "आप एक अत्यंत वफादार, समझदार और आज्ञाकारी Personal AI हैं। आप अपने मालिक के हर निर्देश का सही और मददगार तरीके से पालन करेंगे। हमेशा सुरक्षित और जिम्मेदार सलाह दें।";

// Routes
app.post('/api/chat', async (req, res) => {
    try {
        // Validate API key
        if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_api_key_here') {
            return res.status(500).json({ error: 'API Key not configured on server' });
        }

        // Rate limiting
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: 'बहुत सारे अनुरोध! कृपया कुछ समय प्रतीक्षा करें।' });
        }

        // Input validation
        const { message, chatHistory } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Invalid message' });
        }

        if (!Array.isArray(chatHistory)) {
            return res.status(400).json({ error: 'Invalid chat history' });
        }

        if (message.length > 5000) {
            return res.status(400).json({ error: 'Message too long' });
        }

        // Build contents array
        const contents = [
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            ...chatHistory,
            { role: "user", parts: [{ text: message }] }
        ];

        // Call Gemini API
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            { contents },
            { timeout: 30000 }
        );

        if (response.data.error) {
            throw new Error(response.data.error.message);
        }

        const reply = response.data.candidates[0].content.parts[0].text;
        
        res.json({ reply });

    } catch (err) {
        console.error('Error:', err.message);
        
        if (err.response?.status === 401) {
            return res.status(401).json({ error: 'Invalid API Key' });
        }
        
        if (err.message.includes('timeout')) {
            return res.status(504).json({ error: 'API timeout, कृपया फिर से कोशिश करें' });
        }
        
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server चल रहा है: http://localhost:${PORT}`);
});
