const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

let browser = null;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        });
    }

    return browser;
}

app.get("/", async (req, res) => {
    const id = String(req.query.id || "").trim();

    if (!id) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe o ID do jogador. Exemplo: /?id=8053399383"
        });
    }

    if (!/^\d+$/.test(id)) {
        return res.status(400).json({
            sucesso: false,
            erro: "O ID deve conter apenas números."
        });
    }

    let page = null;

    try {
        const browser = await getBrowser();

        page = await browser.newPage();

        await page.setViewport({
            width: 1366,
            height: 768
        });

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/153.0.0.0 Safari/537.36"
        );

        await page.goto("https://recargajogo.com.br/", {
            waitUntil: "networkidle2",
            timeout: 60000
        });

        // Procura pelo input através do placeholder,
        // pois o ID ":r2a:" pode mudar a cada carregamento.
        const inputSelector =
            'input[placeholder="Insira o ID de jogador aqui"]';

        await page.waitForSelector(inputSelector, {
            visible: true,
            timeout: 30000
        });

        // Limpa o campo
        await page.click(inputSelector);

        await page.evaluate((selector) => {
            const input = document.querySelector(selector);

            if (input) {
                input.value = "";
                input.dispatchEvent(new Event("input", {
                    bubbles: true
                }));
            }
        }, inputSelector);

        // Digita o ID
        await page.type(inputSelector, id, {
            delay: 50
        });

        // Dá um pequeno tempo para o site processar a digitação
        await new Promise(resolve => setTimeout(resolve, 1000));

        /*
         * O site pode consultar automaticamente depois que o ID
         * é digitado. Também procuramos por um botão de consulta
         * caso exista.
         */
        const botoes = await page.$$("button");

        for (const botao of botoes) {
            try {
                const texto = await page.evaluate(
                    el => el.innerText || el.textContent || "",
                    botao
                );

                const textoNormalizado = texto
                    .trim()
                    .toLowerCase();

                if (
                    textoNormalizado.includes("consultar") ||
                    textoNormalizado.includes("pesquisar") ||
                    textoNormalizado.includes("buscar") ||
                    textoNormalizado.includes("continuar")
                ) {
                    await botao.click();
                    break;
                }
            } catch (e) {
                // Ignora botão que não puder ser lido
            }
        }

        /*
         * Espera aparecer o texto "Usuário:".
         */
        await page.waitForFunction(
            () => {
                return document.body.innerText.includes("Usuário:");
            },
            {
                timeout: 30000
            }
        );

        // Extrai os dados da página
        const resultado = await page.evaluate(() => {
            const elementos = Array.from(
                document.querySelectorAll("div")
            );

            let usuario = null;
            let idJogador = null;

            for (const elemento of elementos) {
                const texto = (elemento.innerText || "").trim();

                if (texto.startsWith("Usuário:")) {
                    usuario = texto
                        .replace(/^Usuário:\s*/i, "")
                        .trim();
                }

                if (texto.startsWith("ID do jogador:")) {
                    idJogador = texto
                        .replace(/^ID do jogador:\s*/i, "")
                        .trim();
                }
            }

            return {
                usuario,
                idJogador
            };
        });

        if (!resultado.usuario && !resultado.idJogador) {
            return res.status(404).json({
                sucesso: false,
                erro: "Não foi possível encontrar os dados do jogador.",
                id_consultado: id
            });
        }

        return res.json({
            sucesso: true,
            id_consultado: id,
            usuario: resultado.usuario,
            id_jogador: resultado.idJogador
        });

    } catch (error) {
        console.error("Erro:", error);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao consultar o jogador.",
            detalhes: error.message
        });

    } finally {
        if (page) {
            try {
                await page.close();
            } catch (e) {}
        }
    }
});

process.on("SIGINT", async () => {
    if (browser) {
        await browser.close();
    }

    process.exit(0);
});

app.listen(PORT, () => {
    console.log("");
    console.log("====================================");
    console.log(" API FF iniciada");
    console.log("====================================");
    console.log(`http://localhost:${PORT}/?id=8053399383`);
    console.log("");
});
