const express = require('express');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');

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

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Email service running on port ${PORT}`);
});