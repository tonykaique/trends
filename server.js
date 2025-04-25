import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(cors());
const port = 3000;

// ================================================================
// !!! ATENÇÃO: Chaves Hardcoded - INSEGURO !!!
// !!! Verifique se estas chaves são VÁLIDAS no Google Cloud e Reddit Dev Hub !!!
// ================================================================
const YOUTUBE_API_KEY = 'AIzaSyCv4t0EIYJmr8YOvfRl0sdMPFdvG9viV1M'; // Substitua se necessário
const REDDIT_CLIENT_ID = 'KxUq00DmZI4nksgB1uTSfw';             // Substitua se necessário
const REDDIT_CLIENT_SECRET = '0vfoFQWuYTOz-hGCHUKR7vuVOCmBUA'; // Substitua se necessário
const REDDIT_USER_AGENT = 'ZimoBot/1.0 by Fit-Bend2298';
// ================================================================

// Buscar vídeos no YouTube com critérios RELAXADOS
async function buscarNoYouTube(tag) {
  console.log(`[Server] Buscando YouTube para tag: "${tag}" (Critérios Relaxados)`);
  const paramsSearch = {
    q: tag,
    part: 'snippet',
    type: 'video',
    maxResults: 15,
    // order: 'date', // <-- REMOVIDO/COMENTADO para buscar por relevância/popularidade
    key: YOUTUBE_API_KEY
  };
  console.log('[Server] Youtube Params:', paramsSearch); // Log dos parâmetros de busca

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', { params: paramsSearch });
    const videoItems = response.data.items;
    console.log(`[Server] Youtube API retornou ${videoItems?.length || 0} vídeos para "${tag}".`);

    if (!videoItems || videoItems.length === 0) { return []; }
    const videoIds = videoItems.map(v => v.id.videoId).join(',');
    console.log(`[Server] YouTube Video IDs encontrados: ${videoIds}`);

    const paramsDetails = { id: videoIds, part: 'statistics', key: YOUTUBE_API_KEY };
    console.log('[Server] YouTube Details Params:', paramsDetails); // Log dos parâmetros de detalhes

    const detalhes = await axios.get('https://www.googleapis.com/youtube/v3/videos', { params: paramsDetails });
    console.log(`[Server] YouTube Videos API retornou ${detalhes.data?.items?.length || 0} detalhes.`);

    const viewsMap = {};
    detalhes.data.items.forEach(v => {
      viewsMap[v.id] = v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0;
    });

    // *** LIMITE DE VIEWS REDUZIDO AQUI ***
    const limiteViews = 1000; // <-- Defina o limite desejado aqui (ex: 1000)
    console.log(`[Server] Aplicando filtro de views >= ${limiteViews}`);

    const resultadosFiltrados = videoItems
      .filter(v => viewsMap[v.id.videoId] >= limiteViews) // Usa o limite definido acima
      .map(video => ({
        fonte: 'youtube', tag,
        titulo: video.snippet.title,
        link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        canal: video.snippet.channelTitle,
        views: viewsMap[video.id.videoId],
        dataPublicacao: video.snippet.publishedAt
      }));

    console.log(`[Server] YouTube: Encontrados ${resultadosFiltrados.length} vídeos para "${tag}" (APÓS filtro de views >= ${limiteViews}).`);
    return resultadosFiltrados;

  } catch (error) {
    // Log detalhado do erro (mantido)
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[Server] !!!!!!!!!! ERRO CRÍTICO em buscarNoYouTube para tag "${tag}" !!!!!!!!!!`);
    if (error.response) {
      console.error('[Server] Status do Erro YouTube:', error.response.status);
      console.error('[Server] Headers do Erro YouTube:', JSON.stringify(error.response.headers, null, 2));
      console.error('[Server] Dados do Erro YouTube:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('[Server] Erro YouTube: Nenhuma resposta recebida. Request:', error.request);
    } else {
      console.error('[Server] Erro YouTube (Configuração):', error.message);
    }
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    return [];
  }
}

// --- Reddit (Auth e Busca - mantendo 'sort=hot' e limite 15) ---
let redditToken = null; let tokenExpiry = 0;
async function autenticarReddit() {
    if (redditToken && Date.now() < tokenExpiry - 60 * 1000) {
        console.log("[Server] Reutilizando token Reddit existente.");
        return redditToken;
      }
      console.log("[Server] Autenticando no Reddit (Hardcoded Credentials)...");
      const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
      try {
        const response = await axios.post('https://www.reddit.com/api/v1/access_token',
          new URLSearchParams({ grant_type: 'client_credentials' }), { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': REDDIT_USER_AGENT } });
        redditToken = response.data.access_token; tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        console.log("[Server] Token Reddit obtido com sucesso."); return redditToken;
      } catch (error) {
          console.error("[Server] ERRO ao autenticar no Reddit:", error.response?.data || error.message);
          redditToken = null; tokenExpiry = 0; throw new Error('Falha na autenticação do Reddit');
      }
}
async function buscarNoReddit(tag) {
    console.log(`[Server] Buscando Reddit para tag: ${tag} (Hardcoded Credentials)`);
    try {
        const token = await autenticarReddit(); const tagLimpa = tag.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const response = await axios.get( `https://oauth.reddit.com/search?q=${encodeURIComponent(tagLimpa)}&limit=15&sort=hot`, // Mantido sort=hot
        { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': REDDIT_USER_AGENT } });
        if (!response.data?.data?.children) { console.log(`[Server] Reddit: Resposta inválida para "${tag}".`); return []; }
        const resultadosFiltrados = response.data.data.children
        .filter(post => post.data.ups >= 100)
        .map(post => ({ fonte: 'reddit', tag, titulo: post.data.title, link: `https://reddit.com${post.data.permalink}`, upvotes: post.data.ups, dataPublicacao: post.data.created_utc }));
        console.log(`[Server] Reddit: Encontrados ${resultadosFiltrados.length} posts para "${tag}" (após filtro).`);
        return resultadosFiltrados;
    } catch (error) {
        const errorMessage = error.response?.data?.message || error.message;
        console.error(`[Server] ERRO ao buscar no Reddit para tag "${tag}": ${errorMessage}`); return [];
    }
}

// --- Rota Principal /trends ---
app.get('/trends', async (req, res) => {
  const tagsQuery = req.query.tags || '';
  console.log(`[Server] Rota /trends chamada com tags: "${tagsQuery}"`);
  const tags = tagsQuery.split(',').map(t => t.trim()).filter(Boolean);

  if (tags.length === 0) {
    console.log("[Server] Erro 400: Nenhuma tag válida fornecida.");
    return res.status(400).json({ erro: 'Envie tags válidas na query string ?tags=exemplo1,exemplo2' });
  }

  try {
    const promessas = tags.flatMap(tag => [
        buscarNoYouTube(tag), // Chama a versão com critérios relaxados
        buscarNoReddit(tag)
    ]);

    const resultadosPromises = await Promise.allSettled(promessas);
    const resultadosFinais = [];
    resultadosPromises.forEach((resultado, index) => {
        const tagIndex = Math.floor(index / 2);
        const tagOriginal = tags[tagIndex];
        const fonte = index % 2 === 0 ? 'youtube' : 'reddit';

      if (resultado.status === 'fulfilled') {
          if (Array.isArray(resultado.value)) {
             resultadosFinais.push(...resultado.value);
          }
      } else {
        console.error(`[Server] Falha crítica ao buscar ${fonte} para tag "${tagOriginal}":`, resultado.reason?.message || resultado.reason);
      }
    });

    console.log(`[Server] Enviando ${resultadosFinais.length} resultados finais para o cliente.`);
    res.json(resultadosFinais);

  } catch (error) {
    console.error("[Server] Erro inesperado na rota /trends:", error);
    res.status(500).json({ erro: 'Erro interno no servidor ao processar a solicitação.' });
  }
});

const https = require('https');
const fs = require('fs');
const express = require('express');
const app = express();

const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/api.zimo.vc/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/api.zimo.vc/fullchain.pem')
};

https.createServer(options, app).listen(3000, () => {
  console.log('Servidor rodando em HTTPS na porta 3000');
  autenticarReddit().catch(err => {/* Já logado */});
});
