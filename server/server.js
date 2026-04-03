import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5051;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Globe Ready API is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Globe Ready API',
    version: '1.0.0',
  });
});

// Serve static files from client build
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve React app for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  Globe Ready - Backend Server              ║
║  Version: 1.0.0                            ║
╚════════════════════════════════════════════╝

📍 Server running on: http://localhost:${PORT}
🌐 Client URL: ${CLIENT_URL}
🔧 Environment: ${process.env.NODE_ENV || 'development'}

Press Ctrl+C to stop the server
  `);
});