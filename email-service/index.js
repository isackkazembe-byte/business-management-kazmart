const express = require('express');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Configure SendGrid ──────────────────────────────────────
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) {
  console.error('❌ SENDGRID_API_KEY is not set in environment variables.');
}
sgMail.setApiKey(SENDGRID_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'isackkazembe@gmail.com';

// ─── Health Check ────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('Email service is running.');
});

// ─── Send Single Email ──────────────────────────────────────
app.post('/send-email', async (req, res) => {
  try {
    const { to, subject, html, from } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
    }

    const msg = {
      to,
      from: from || FROM_EMAIL,
      subject,
      html,
    };

    await sgMail.send(msg);
    console.log(`✅ Email sent to ${to}`);
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('SendGrid error:', error.response?.body || error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Send Bulk Email ──────────────────────────────────────
app.post('/send-bulk', async (req, res) => {
  try {
    const { recipients, subject, html, from } = req.body;
    if (!recipients || !recipients.length || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: recipients, subject, html' });
    }

    const results = [];
    for (const to of recipients) {
      const msg = {
        to,
        from: from || FROM_EMAIL,
        subject,
        html,
      };
      try {
        await sgMail.send(msg);
        results.push({ to, status: 'success' });
        console.log(`✅ Bulk email sent to ${to}`);
      } catch (e) {
        results.push({ to, status: 'failed', error: e.message });
        console.error(`❌ Failed to send to ${to}:`, e.message);
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ─── Send WhatsApp via CallMeBot ────────────────────────────
app.post('/send-whatsapp', async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    const apiKey = process.env.CALLMEBOT_KEY;
    if (!apiKey) {
      console.error('❌ CALLMEBOT_KEY is not set.');
      return res.status(500).json({ error: 'WhatsApp service not configured' });
    }

    // Default phone if not provided by the caller
    const targetPhone = (phone || '255747123133').replace(/[^0-9]/g, '');

    const url = `https://api.callmebot.com/whatsapp.php?phone=${targetPhone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;

    const response = await fetch(url);
    const body = await response.text();

    // CallMeBot returns plain text on success, HTML error page on failure
    if (!response.ok || body.includes('ERROR')) {
      console.error('CallMeBot error:', body.substring(0, 200));
      return res.status(500).json({ error: 'WhatsApp send failed', detail: body.substring(0, 200) });
    }

    console.log(`✅ WhatsApp sent to ${targetPhone}`);
    res.json({ success: true, message: 'WhatsApp sent successfully' });
  } catch (error) {
    console.error('WhatsApp error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// ─── AI Chat Assistant ──────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let geminiClient = null;
if (GEMINI_API_KEY) {
  geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
} else {
  console.warn('⚠️ GEMINI_API_KEY not set — /ai-chat will be disabled.');
}

const AI_SYSTEM_PROMPT = `You are the KazMart Business Assistant — an AI that helps shop owners understand their business.

Your rules:
- Answer using ONLY the context data provided below. Never invent numbers.
- Keep replies short and direct (2-4 sentences max). Shop owners are busy.
- Currency is TZS. Format numbers with commas.
- If the context doesn't contain the answer, say "I don't have that information right now. Try asking about today's sales, stock, debts, or approvals."
- Be helpful, friendly, and professional. No emojis.
- Never discuss anything outside of running a retail/wholesale shop.`;

app.post('/ai-chat', async (req, res) => {
  try {
    if (!geminiClient) {
      return res.status(500).json({ error: 'AI not configured. Set GEMINI_API_KEY on Render.' });
    }

    const { question, context } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing required field: question' });
    }

    const contextStr = context
      ? JSON.stringify(context, null, 2).substring(0, 4000)
      : 'No context provided.';

    const model = geminiClient.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: AI_SYSTEM_PROMPT,
    });

    const prompt = `Here is the current business context:\n\n${contextStr}\n\n---\n\nQuestion from the shop owner: ${question}`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    console.log(`🤖 AI replied (${reply.length} chars) to: "${question.substring(0, 60)}"`);
    res.json({ success: true, reply });
  } catch (error) {
    console.error('AI chat error:', error.message);
    res.status(500).json({
      error: 'AI request failed',
      detail: error.message
    });
  }
});


// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Email service running on port ${PORT}`);
});
