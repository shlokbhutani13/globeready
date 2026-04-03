# 🚀 Deploying Globe Ready

## Deploy to Railway (Easiest)

1. Go to https://railway.app
2. Click "New Project"
3. Click "Deploy from GitHub"
4. Connect your GitHub account
5. Select this repository
6. Railway will auto-detect and deploy

Environment Variables to add:

PORT=5051
NODE_ENV=production
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral

## Deploy to Heroku
```bash
heroku login
heroku create your-app-name
git push heroku main
```

## Deploy with Docker
```bash
docker build -t globeready .
docker run -p 5051:5051 globeready
```

## Production URLs

- Frontend: https://your-domain.com
- Backend: https://your-domain.com/api