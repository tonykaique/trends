import express from 'express'
import axios from 'axios'
import Parser from 'rss-parser'

const app = express()
const port = 3000
const parser = new Parser()

// Simulação de scraping leve (substituir depois por scraping real ou API)
async function getGoogleTrends() {
  return ["feriado 1º de maio", "dólar hoje", "Big Brother", "camisa do Brasil"];
}

async function getNoticias() {
  const feeds = [
    "https://g1.globo.com/rss/g1/",
    "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml",
    "https://www.cnnbrasil.com.br/rss/"
  ]

  const allItems = []
  for (let url of feeds) {
    try {
      const feed = await parser.parseURL(url)
      feed.items.slice(0, 5).forEach(item => {
        allItems.push(item.title)
      })
    } catch (err) {
      allItems.push(`[erro ao carregar ${url}]`)
    }
  }
  return allItems
}

async function getTikTokTrends() {
  return ["#sextou", "#trendbr", "#maequefala", "#estilobr", "#chatgptnozap"];
}

app.get('/trends', async (req, res) => {
  const google = await getGoogleTrends()
  const noticias = await getNoticias()
  const tiktok = await getTikTokTrends()

  res.json({ google, noticias, tiktok })
})

app.listen(port, () => {
  console.log(`Servidor de trends rodando em http://localhost:${port}/trends`)
})
