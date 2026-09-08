// api/freefire.js

const https = require("https");

function cleanText(value = "") {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function decodeUrl(value = "") {
  try {
    return value
      .replace(/&amp;/gi, "&")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCodePoint(parseInt(hex, 16))
      )
      .replace(/&#([0-9]+);/g, (_, dec) =>
        String.fromCodePoint(parseInt(dec, 10))
      );
  } catch {
    return value;
  }
}

function getNumber(value) {
  if (!value) return null;

  const number = String(value)
    .replace(/\./g, "")
    .replace(/[^\d]/g, "");

  return number ? Number(number) : null;
}

function extractProfile(html) {
  /*
   * =========================
   * NICK
   * =========================
   */

  let nick = null;

  const nickMatch = html.match(
    /<div\s+class=["']ffp-side-profile["'][\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i
  );

  if (nickMatch) {
    nick = cleanText(nickMatch[1]);
  }

  /*
   * =========================
   * AVATAR
   * =========================
   */

  let avatar = null;

  const avatarMatch = html.match(
    /<div\s+class=["']ffp-side-profile["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i
  );

  if (avatarMatch) {
    avatar = decodeUrl(avatarMatch[1]);
  }

  /*
   * =========================
   * LEVEL
   * =========================
   */

  let level = null;

  const levelMatch = html.match(
    /<div\s+class=["']ffp-side-profile["'][\s\S]*?<span>\s*BR\s*·\s*N[íi]vel\s*(\d+)\s*<\/span>/i
  );

  if (levelMatch) {
    level = Number(levelMatch[1]);
  }

  /*
   * =========================
   * LIKES
   * =========================
   */

  let like = null;

  const likeMatch = html.match(
    /<dt>\s*Likes\s*<\/dt>\s*<dd>\s*([\d.,]+)\s*<\/dd>/i
  );

  if (likeMatch) {
    like = getNumber(likeMatch[1]);
  }

  /*
   * =========================
   * SKIN
   * =========================
   *
   * Procura por uma imagem de skin
   * dentro das seções do perfil.
   */

  let skin = null;

  const skinPatterns = [
    /class=["'][^"']*skin[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i,

    /class=["'][^"']*ffp[^"']*item[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i,

    /class=["'][^"']*ffp[^"']*skin[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i
  ];

  for (const pattern of skinPatterns) {
    const match = html.match(pattern);

    if (match) {
      skin = decodeUrl(match[1]);
      break;
    }
  }

  /*
   * =========================
   * RESULTADO
   * =========================
   */

  return {
    nick,
    avatar,
    skin,
    like,
    level
  };
}


/*
 * =========================================
 * FETCH
 * =========================================
 */

function fetchHTML(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

          "Accept-Language":
            "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",

          ...headers
        }
      },
      response => {
        let data = "";

        response.setEncoding("utf8");

        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: data
          });
        });
      }
    );

    request.on("error", reject);

    request.setTimeout(20000, () => {
      request.destroy();
      reject(new Error("Timeout ao acessar o site"));
    });
  });
}


/*
 * =========================================
 * CAPTCHA / BLOCK DETECTION
 * =========================================
 */

function detectBlock(html = "") {
  const text = html.toLowerCase();

  const indicators = [
    "captcha",
    "cloudflare",
    "checking your browser",
    "verify you are human",
    "just a moment",
    "cf-chl",
    "challenge-platform"
  ];

  return indicators.some(item => text.includes(item));
}


/*
 * =========================================
 * API
 * =========================================
 */

module.exports = async (req, res) => {

  /*
   * CORS
   */

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });
  }

  /*
   * ID
   */

  const id =
    req.query?.id ||
    req.query?.playerId ||
    req.query?.uid;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: "Informe o ID do jogador"
    });
  }

  /*
   * Validação básica
   */

  if (!/^\d+$/.test(String(id))) {
    return res.status(400).json({
      success: false,
      error: "ID inválido"
    });
  }

  /*
   * URL
   */

  const url =
    `https://freefirejornal.com/perfil/${encodeURIComponent(id)}/`;

  try {

    /*
     * Requisição normal
     */

    const response = await fetchHTML(url);

    /*
     * CAPTCHA / bloqueio
     */

    if (detectBlock(response.body)) {
      return res.status(502).json({
        success: false,
        error: "O site retornou CAPTCHA ou bloqueio anti-bot"
      });
    }

    /*
     * HTTP inválido
     */

    if (response.status < 200 || response.status >= 400) {
      return res.status(502).json({
        success: false,
        error: `O site respondeu HTTP ${response.status}`
      });
    }

    /*
     * Extrair dados
     */

    const data = extractProfile(response.body);

    /*
     * Verificação mínima
     */

    if (!data.nick && !data.avatar && data.level === null) {
      return res.status(404).json({
        success: false,
        error: "Perfil não encontrado ou HTML alterado"
      });
    }

    /*
     * RESPOSTA FINAL
     */

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Erro ao consultar o perfil"
    });
  }
};
