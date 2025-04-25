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

// Buscar vídeos no YouTube com LOGS DETALHADOS
async function buscarNoYouTube(tag) {
  console.log(`[Server] Buscando YouTube para tag: "${tag}" (Hardcoded Key)`);
  const paramsSearch = {
    q: tag, part: 'snippet', type: 'video',
    maxResults: 15, order: 'date', key: YOUTUBE_API_KEY
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
    // console.log(`[Server] Views Map para "${tag}":`, viewsMap); // Log opcional

    const resultadosFiltrados = videoItems
      .filter(v => viewsMap[v.id.videoId] >= 5000)
      .map(video => ({
        fonte: 'youtube', tag,
        titulo: video.snippet.title,
        link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        canal: video.snippet.channelTitle,
        views: viewsMap[video.id.videoId]
      }));

    console.log(`[Server] YouTube: Encontrados ${resultadosFiltrados.length} vídeos para "${tag}" (APÓS filtro de views >= 5000).`);
    return resultadosFiltrados;

  } catch (error) {
    // *** LOG DETALHADO DO ERRO DO YOUTUBE ***
    console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    console.error(`[Server] !!!!!!!!!! ERRO CRÍTICO em buscarNoYouTube para tag "${tag}" !!!!!!!!!!`);
    if (error.response) {
      // Erro veio da resposta da API do YouTube
      console.error('[Server] Status do Erro YouTube:', error.response.status);
      console.error('[Server] Headers do Erro YouTube:', JSON.stringify(error.response.headers, null, 2));
      console.error('[Server] Dados do Erro YouTube:', JSON.stringify(error.response.data, null, 2)); // MOSTRA A RESPOSTA COMPLETA DO ERRO DA API
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      console.error('[Server] Erro YouTube: Nenhuma resposta recebida. Request:', error.request);
    } else {
      // Erro ao configurar a requisição
      console.error('[Server] Erro YouTube (Configuração):', error.message);
    }
    console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
    return []; // Retorna array vazio, mas o erro foi logado acima
  }
}

// --- Reddit (Auth e Busca - sem alterações nos logs internos agora) ---
let redditToken = null; let tokenExpiry = 0;
async function autenticarReddit() { /* ... código anterior ... */ }
async function buscarNoReddit(tag) { /* ... código anterior ... */ }

// --- Rota Principal /trends ---
app.get('/trends', async (req, res) => { /* ... código anterior ... */ });

// --- Iniciar Servidor ---
app.listen(port, '0.0.0.0', () => { /* ... código anterior ... */ });
