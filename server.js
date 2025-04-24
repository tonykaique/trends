import express from 'express';
import axios from 'axios';

const app = express();
import cors from 'cors';
app.use(cors());
const port = 3000;

// Substitua pela sua chave da API do YouTube
const YOUTUBE_API_KEY = 'AIzaSyCv4t0EIYJmr8YOvfRl0sdMPFdvG9viV1M';

// Buscar vídeos no YouTube com +5.000 views
async function buscarNoYouTube(tag) {
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        q: tag,
        part: 'snippet',
        type: 'video',
        maxResults: 5,
        key: YOUTUBE_API_KEY
      }
    });

    const videoItems = response.data.items;

    const detalhes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        id: videoItems.map(v => v.id.videoId).join(','),
        part: 'statistics',
        key: YOUTUBE_API_KEY
      }
    });

    const viewsMap = {};
    detalhes.data.items.forEach(v => {
      viewsMap[v.id] = parseInt(v.statistics.viewCount);
    });

    return videoItems
      .filter(v => viewsMap[v.id.videoId] >= 5000)
      .map(video => ({
        fonte: 'youtube',
        tag,
        titulo: video.snippet.title,
        link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        canal: video.snippet.channelTitle,
        views: viewsMap[video.id.videoId]
      }));
  } catch (error) {
    return [{ fonte: 'youtube', tag, erro: 'Erro ao buscar no YouTube' }];
  }
}

// Buscar posts no Reddit com +100 upvotes
// Função para autenticar no Reddit com OAuth2
async function autenticarReddit() {
  const auth = Buffer.from("KxUq00DmZI4nksgB1uTSfw:0vfoFQWuYTOz-hGCHUKR7vuVOCmBUA").toString('base64');

  const response = await axios.post('https://www.reddit.com/api/v1/access_token',
    new URLSearchParams({
      grant_type: 'client_credentials'
    }),
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ZimoBot/1.0 by Fit-Bend2298'
      }
    }
  );

  return response.data.access_token;
}

// Função para buscar posts no Reddit com autenticação
async function buscarNoReddit(tag) {
  try {
    const token = await autenticarReddit();
    const tagLimpa = tag.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const response = await axios.get(
      `https://oauth.reddit.com/search?q=${encodeURIComponent(tagLimpa)}&limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'ZimoBot/1.0 by Fit-Bend2298'
        }
      }
    );

    return response.data.data.children
      .filter(post => post.data.ups >= 100)
      .map(post => ({
        fonte: 'reddit',
        tag,
        titulo: post.data.title,
        link: `https://reddit.com${post.data.permalink}`,
        upvotes: post.data.ups
      }));

  } catch (error) {
    console.error("ERRO AUTENTICADO REDDIT:", {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });

    return [{ fonte: 'reddit', tag, erro: 'Erro ao buscar no Reddit (autenticado)' }];
  }
}

app.get('/trends', async (req, res) => {
  const tags = (req.query.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  if (tags.length === 0) return res.status(400).json({ erro: 'Envie tags como ?tags=exemplo1,exemplo2' });

  const resultados = [];
  for (const tag of tags) {
    const [youtube, reddit] = await Promise.all([
      buscarNoYouTube(tag),
      buscarNoReddit(tag)
    ]);
    resultados.push(...youtube, ...reddit);
  }

  res.json(resultados);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor /trends ativo com filtro de engajamento em http://0.0.0.0:${port}`);
});
