import express from 'express';
import axios from 'axios';
import cors from 'cors'; // Certifique-se de que cors está importado

const app = express();
app.use(cors()); // Habilita CORS para todas as rotas
const port = 3000;

// ================================================================
// ATENÇÃO: Chaves e Credenciais Hardcoded - Risco de Segurança!
// Considere usar variáveis de ambiente ou um serviço de segredos.
// ================================================================
const YOUTUBE_API_KEY = 'AIzaSyCv4t0EIYJmr8YOvfRl0sdMPFdvG9viV1M'; // Chave fornecida
const REDDIT_CLIENT_ID = 'KxUq00DmZI4nksgB1uTSfw';             // Credencial fornecida
const REDDIT_CLIENT_SECRET = '0vfoFQWuYTOz-hGCHUKR7vuVOCmBUA'; // Credencial fornecida
const REDDIT_USER_AGENT = 'ZimoBot/1.0 by Fit-Bend2298';     // User Agent fornecido
// ================================================================

// Buscar vídeos no YouTube (mais recentes e com filtro de views)
async function buscarNoYouTube(tag) {
  console.log(`[Server] Buscando YouTube para tag: ${tag}`);
  try {
    // Busca inicial por vídeos recentes
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        q: tag,
        part: 'snippet',
        type: 'video',
        maxResults: 15,     // <-- Alterado para 15
        order: 'date',      // <-- Adicionado para buscar mais recentes
        key: YOUTUBE_API_KEY
      }
    });

    const videoItems = response.data.items;
    if (!videoItems || videoItems.length === 0) {
        console.log(`[Server] YouTube: Nenhum vídeo encontrado para "${tag}" ordenado por data.`);
        return [];
    }

    const videoIds = videoItems.map(v => v.id.videoId).join(',');

    // Busca detalhes (estatísticas) dos vídeos encontrados
    const detalhes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        id: videoIds,
        part: 'statistics',
        key: YOUTUBE_API_KEY
      }
    });

    const viewsMap = {};
    detalhes.data.items.forEach(v => {
      // Garante que viewCount existe e é um número antes de converter
      viewsMap[v.id] = v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0;
    });

    // Filtra por view count e mapeia para o formato desejado
    const resultadosFiltrados = videoItems
      .filter(v => viewsMap[v.id.videoId] >= 5000) // Mantém filtro de 5000 views
      .map(video => ({
        fonte: 'youtube',
        tag,
        titulo: video.snippet.title,
        // Corrigindo formato do link para o padrão YouTube
        link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        canal: video.snippet.channelTitle,
        views: viewsMap[video.id.videoId]
      }));

    console.log(`[Server] YouTube: Encontrados ${resultadosFiltrados.length} vídeos para "${tag}" (após filtro).`);
    return resultadosFiltrados;

  } catch (error) {
    console.error(`[Server] ERRO ao buscar no YouTube para tag "${tag}":`, error.response?.data || error.message);
    // Retorna um array vazio em caso de erro para não quebrar o Promise.all
    // Ou poderia retornar [{ fonte: 'youtube', tag, erro: '...' }] se o frontend tratar
    return [];
  }
}

// --- Reddit ---
let redditToken = null;
let tokenExpiry = 0;

async function autenticarReddit() {
  // Reutiliza token se ainda for válido (com uma margem de segurança)
  if (redditToken && Date.now() < tokenExpiry - 60 * 1000) {
     console.log("[Server] Reutilizando token Reddit existente.");
    return redditToken;
  }

  console.log("[Server] Autenticando no Reddit...");
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post('https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({
        grant_type: 'client_credentials'
      }),
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': REDDIT_USER_AGENT
        }
      }
    );

    redditToken = response.data.access_token;
    // Define tempo de expiração (em milissegundos)
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    console.log("[Server] Token Reddit obtido com sucesso.");
    return redditToken;

  } catch (error) {
      console.error("[Server] ERRO ao autenticar no Reddit:", error.response?.data || error.message);
      redditToken = null; // Reseta token em caso de erro
      tokenExpiry = 0;
      throw new Error('Falha na autenticação do Reddit'); // Lança erro para ser pego na busca
  }
}

// Buscar posts no Reddit (mais "quentes" e com filtro de upvotes)
async function buscarNoReddit(tag) {
  console.log(`[Server] Buscando Reddit para tag: ${tag}`);
  try {
    const token = await autenticarReddit(); // Obtém token (novo ou reutilizado)
    const tagLimpa = tag.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos

    // Busca posts ordenando por 'hot'
    const response = await axios.get(
       // URL atualizada com limit=15 e sort=hot
      `https://oauth.reddit.com/search?q=${encodeURIComponent(tagLimpa)}&limit=15&sort=hot`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': REDDIT_USER_AGENT
        }
      }
    );

    if (!response.data?.data?.children) {
         console.log(`[Server] Reddit: Resposta inválida ou sem 'children' para "${tag}".`);
         return [];
    }

    // Filtra por upvotes e mapeia
    const resultadosFiltrados = response.data.data.children
      .filter(post => post.data.ups >= 100) // Mantém filtro de 100 upvotes
      .map(post => ({
        fonte: 'reddit',
        tag,
        titulo: post.data.title,
        link: `https://reddit.com${post.data.permalink}`,
        upvotes: post.data.ups
      }));

    console.log(`[Server] Reddit: Encontrados ${resultadosFiltrados.length} posts para "${tag}" (após filtro).`);
    return resultadosFiltrados;

  } catch (error) {
    // Log detalhado do erro da busca, diferente do erro de autenticação
    console.error(`[Server] ERRO ao buscar no Reddit para tag "${tag}":`, {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data // Pode conter mais detalhes do erro da API do Reddit
    });
    return []; // Retorna array vazio em caso de erro
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
        buscarNoYouTube(tag),
        buscarNoReddit(tag)
    ]);

    // Promise.allSettled é mais robusto, pois continua mesmo se uma API falhar
    const resultadosPromises = await Promise.allSettled(promessas);

    const resultadosFinais = [];
    resultadosPromises.forEach((resultado, index) => {
        const tagIndex = Math.floor(index / 2); // Associa resultado à tag original
        const tagOriginal = tags[tagIndex];
        const fonte = index % 2 === 0 ? 'youtube' : 'reddit'; // Determina a fonte

      if (resultado.status === 'fulfilled') {
          // Se a promessa foi resolvida (mesmo que retorne array vazio ou com erro interno tratado)
          if (Array.isArray(resultado.value)) {
             resultadosFinais.push(...resultado.value);
          } else {
              console.warn(`[Server] Resultado inesperado para ${fonte} (tag: ${tagOriginal}):`, resultado.value);
          }
      } else {
        // Se a promessa foi rejeitada (ex: erro na autenticação do Reddit)
        console.error(`[Server] Falha crítica ao buscar ${fonte} para tag "${tagOriginal}":`, resultado.reason);
        // Adiciona um item de erro ao resultado final para feedback no frontend
        resultadosFinais.push({ fonte: fonte, tag: tagOriginal, erro: `Falha ao buscar dados (${resultado.reason?.message || 'Erro desconhecido'})` });
      }
    });

    console.log(`[Server] Enviando ${resultadosFinais.length} resultados finais para o cliente.`);
    res.json(resultadosFinais);

  } catch (error) {
      // Erro geral no processamento da rota /trends
    console.error("[Server] Erro inesperado na rota /trends:", error);
    res.status(500).json({ erro: 'Erro interno no servidor ao processar a solicitação.' });
  }
});

// --- Iniciar Servidor ---
app.listen(port, '0.0.0.0', () => {
  console.log(`[Server] Servidor /trends rodando em http://0.0.0.0:${port}`);
  console.log(`[Server] Usando User Agent Reddit: ${REDDIT_USER_AGENT}`);
  // Teste inicial de autenticação do Reddit (opcional)
  autenticarReddit().catch(err => console.error("[Server] Teste inicial de autenticação Reddit falhou."));
});
