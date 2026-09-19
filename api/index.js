
const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();

app.get("/", async (req, res) => {
    const id = String(req.query.id || "").trim();

    if (!id) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe o ID. Exemplo: ?id=8053399383"
        });
    }

    if (!/^\d+$/.test(id)) {
        return res.status(400).json({
            sucesso: false,
            erro: "O ID deve conter somente números."
        });
    }

    let browser;

    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless
        });

        const page = await browser.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/153.0.0.0 Safari/537.36"
        );

        await page.goto("https://recargajogo.com.br/", {
            waitUntil: "domcontentloaded",
            timeout: 20000
        });

        const inputSelector =
            'input[placeholder="Insira o ID de jogador aqui"]';

        await page.waitForSelector(inputSelector, {
            visible: true,
            timeout: 10000
        });

        await page.click(inputSelector);

        await page.type(inputSelector, id, {
            delay: 30
        });

        // Espera algum resultado aparecer
        await page.waitForFunction(
            () => document.body.innerText.includes("Usuário:"),
            {
                timeout: 10000
            }
        );

        const resultado = await page.evaluate(() => {
            const textoPagina = document.body.innerText;

            const usuarioMatch =
                textoPagina.match(/Usuário:\s*(.+)/);

            const idMatch =
                textoPagina.match(/ID do jogador:\s*(\d+)/);

            return {
                usuario: usuarioMatch
                    ? usuarioMatch[1].split("\n")[0].trim()
                    : null,

                idJogador: idMatch
                    ? idMatch[1]
                    : null
            };
        });

        if (!resultado.usuario) {
            return res.status(404).json({
                sucesso: false,
                erro: "Jogador não encontrado ou consulta não respondeu.",
                id
            });
        }

        return res.json({
            sucesso: true,
            usuario: resultado.usuario,
            id_jogador: resultado.idJogador || id
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            sucesso: false,
            erro: error.message
        });

    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }
    }
});

module.exports = app;
