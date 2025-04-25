import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv'; // 1. Importar dotenv

// 2. Carregar variáveis do arquivo .env para process.env
//    Faça isso o mais cedo possível no seu aplicativo.
dotenv.config();

const app = express();
app.use(cors()); // Habilita CORS para todas as rotas

// 3. Ler as variáveis do ambiente (ou do .env)
//    É uma boa prática verificar se as variáveis essenciais existem.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'ZimoBot/1.0 by NodeServer'; // User Agent pode ter um padrão
const PORT = process.env.PORT || 3000; // Usa a porta do .env ou 3000 como padrão

// Validação das variáveis essenciais
if (!YOUTUBE_API_KEY || !REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    console.error("ERRO CRÍTICO: Variáveis de ambiente obrigatórias (YOUTUBE_API_KEY, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET) não estão definidas!");
    console.error("Verifique seu arquivo .env ou as configurações de ambiente do servidor.");
    process.exit(1); // Encerra o processo se chaves críticas faltarem
}

// --- Funções de Busca ---

// Buscar vídeos no YouTube (mais recentes e com filtro de views)
async function buscarNoYouTube(tag) {
  console.log(`[Server] Buscando YouTube para tag: ${tag}`);
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        q: tag,
        part: 'snippet',
        type: 'video',
        maxResults: 15,
        order: 'date', // Busca mais recentes
        key: YOUTUBE_API_KEY // 4. Usa a variável do process.env
      }
    });

    const videoItems = response.data.items;
    if (!videoItems || videoItems.length === 0) { return []; }
    const videoIds = videoItems.map(v => v.id.videoId).join(',');

    const detalhes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        id: videoIds,
        part: 'statistics',
        key: YOUTUBE_API_KEY // 4. Usa a variável do process.env
      }
    });

    const viewsMap = {};
    detalhes.data.items.forEach(v => {
      viewsMap[v.id] = v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0;
    });

    const resultadosFiltrados = videoItems
      .filter(v => viewsMap[v.id.videoId] >= 5000)
      .map(video => ({
        fonte: 'youtube', tag,
        titulo: video.snippet.title,
        link: `https://www.youtube.com/watch?v=${video.id.videoId}`, // Link padrão do YouTube
        canal: video.snippet.channelTitle,
        views: viewsMap[video.id.videoId]
      }));

    console.log(`[Server] YouTube: Encontrados ${resultadosFiltrados.length} vídeos para "${tag}" (após filtro).`);
    return resultadosFiltrados;

  } catch (error) {
    console.error(`[Server] ERRO ao buscar no YouTube para tag "${tag}":`, error.response?.data?.error?.message || error.message);
    return [];
  }
}

// --- Reddit Auth & Search ---
let redditToken = null;
let tokenExpiry = 0;

async function autenticarReddit() {
  if (redditToken && Date.now() < tokenExpiry - 60 * 1000) {
    console.log("[Server] Reutilizando token Reddit existente.");
    return redditToken;
  }
  console.log("[Server] Autenticando no Reddit...");

  // 5. Constrói o Basic Auth usando as variáveis de ambiente
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');

  try {
    const response = await axios.post('https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Authorization': `Basic ${auth}`, // Usa o token construído
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': REDDIT_USER_AGENT // 6. Usa a variável do process.env
        }
      }
    );
    redditToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    console.log("[Server] Token Reddit obtido com sucesso.");
    return redditToken;
  } catch (error) {
    console.error("[Server] ERRO ao autenticar no Reddit:", error.response?.data || error.message);
    redditToken = null; tokenExpiry = 0;
    throw new Error('Falha na autenticação do Reddit');
  }
}

async function buscarNoReddit(tag) {
  console.log(`[Server] Buscando Reddit para tag: ${tag}`);
  try {
    const token = await autenticarReddit();
    const tagLimpa = tag.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const response = await axios.get(
      `https://oauth.reddit.com/search?q=${encodeURIComponent(tagLimpa)}&limit=15&sort=hot`, // Busca 15 e ordena por 'hot'
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': REDDIT_USER_AGENT // 6. Usa a variável do process.env
        }
      }
    );

    if (!response.data?.data?.children) { return []; }

    const resultadosFiltrados = response.data.data.children
      .filter(post => post.data.ups >= 100)
      .map(post => ({
        fonte: 'reddit', tag,
        titulo: post.data.title,
        link: `https://reddit.com${post.data.permalink}`,
        upvotes: post.data.ups
      }));

    console.log(`[Server] Reddit: Encontrados ${resultadosFiltrados.length} posts para "${tag}" (após filtro).`);
    return resultadosFiltrados;

  } catch (error) {
    console.error(`[Server] ERRO ao buscar no Reddit para tag "${tag}":`, error.response?.data || error.message);
    return [];
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
    // Cria um array de Promises para todas as buscas de todas as tags
    const promessas = tags.flatMap(tag => [
        buscarNoYouTube(tag),
        buscarNoReddit(tag)
    ]);

    // Executa todas em paralelo e espera todas terminarem (sucesso ou falha)
    const resultadosPromises = await Promise.allSettled(promessas);

    const resultadosFinais = [];
    // Processa os resultados de allSettled
    resultadosPromises.forEach((resultado, index) => {
        const tagIndex = Math.floor(index / 2);
        const tagOriginal = tags[tagIndex];
        const fonte = index % 2 === 0 ? 'youtube' : 'reddit';

      if (resultado.status === 'fulfilled') {
          // Adiciona os resultados ao array final se a busca foi bem-sucedida
          if (Array.isArray(resultado.value)) {
             resultadosFinais.push(...resultado.value);
          }
      } else {
        // Loga o erro se uma busca específica falhou, mas não quebra a resposta
        console.error(`[Server] Falha ao buscar ${fonte} para tag "${tagOriginal}":`, resultado.reason?.message || resultado.reason);
        // Opcional: Adicionar um item de erro na resposta para o frontend saber
        // resultadosFinais.push({ fonte: fonte, tag: tagOriginal, erro: `Falha ao buscar dados` });
      }
    });

    console.log(`[Server] Enviando ${resultadosFinais.length} resultados finais para o cliente.`);
    res.json(resultadosFinais);

  } catch (error) {
    console.error("[Server] Erro inesperado na rota /trends:", error);
    res.status(500).json({ erro: 'Erro interno no servidor ao processar a solicitação.' });
  }
});

// --- Iniciar Servidor ---
app.listen(PORT, '0.0.0.0', () => { // Usa a variável PORT
  console.log(`[Server] Servidor /trends rodando em http://0.0.0.0:${PORT}`);
  console.log(`[Server] Usando User Agent Reddit: ${REDDIT_USER_AGENT || '(Não definido)'}`);
  // Testa autenticação Reddit ao iniciar (opcional, bom para verificar credenciais)
  autenticarReddit().catch(err => {/* Já logado dentro da função */});
});
