const config = require('dotenv')
    .config({ path: `${__dirname}/.env` })
    .parsed;

const cheerio = require('cheerio');
const fetch = require('node-fetch');
const fs = require('fs');

const enableTelegram = true;
const Telegram = require('telegraf/telegram');
const telegram = new Telegram(config.TELEGRAM_TOKEN);

const enableTwilio = true;
const Twilio = require('twilio');
const twilio = new Twilio(config.TWILIO_APPID, config.TWILIO_APPSECRET);

const roadTestFolder = "roadtest";
const roadTestUrl = "https://www.icbc.com/driver-licensing/visit-dl-office/Pages/Book-a-road-test.aspx";

const covidFolder = "covid";
const covidUrl = "https://www.icbc.com/about-icbc/contact-us/Pages/covid-19.aspx";

async function getHtml(url) {
    const res = await fetch(url);
    const html = await res.text();

    return html;
}

async function getIcbcRoadTest() {
    const html = await getHtml(roadTestUrl);
    const $ = cheerio.load(html);

    const el = $('#interiorPageContentZone');
    return el && el.text();
}

async function getIcbcCovid() {
    const html = await getHtml(covidUrl);
    const $ = cheerio.load(html);

    const els = $('.expandable');
    const el = els && els.filter((i, el) => {
        const title = $(el).find(".item-title-container h3").text();
        return title.startsWith("Road tests");
    });

    return el && el.text();
}

function getLatest(folder) {
    const dirStr = `${config.OUTDIR}/${folder}`;

    if (!fs.existsSync(dirStr)) {
        fs.mkdirSync(dirStr, { recursive: true });
    }

    const dir = fs.readdirSync(dirStr);
    let max = 0;

    for (const file of dir) {
        const timestamp = parseInt(file.replace('.txt', ''));
        if (timestamp > max) {
            max = timestamp;
        }
    }

    return !!max && fs.readFileSync(`${dirStr}/${max}.txt`, 'utf8');
}

function setLatest(folder, now, text) {
    const dirStr = `${config.OUTDIR}/${folder}`;

    if (!fs.existsSync(dirStr)) {
        fs.mkdirSync(dirStr, { recursive: true });
    }

    fs.writeFileSync(`${dirStr}/${now}.txt`, text, 'utf8');
}

async function notify(url) {
    if (enableTwilio) {
        await twilio.messages.create({
            to: config.RECEIVER_PHONE,
            from: config.TWILIO_PHONE,
            body: url
        });
    }

    if (enableTelegram) {
        await telegram.sendMessage(config.TELEGRAM_CHATID, url);
    }
}

async function compare(actual, expected, folder, url) {
    const now = Date.now();
    const nowStr = new Date(now).toLocaleString();

    if (!!actual && expected != actual) {
        console.log(`[${nowStr}] [${folder}] FOUND CHANGES!`);

        setLatest(folder, now, actual);
        await notify(url);
    }
    else {
        console.log(`[${nowStr}] [${folder}] Nothing...`);
    }
}

async function process(url, folder, getActual) {
    const expected = getLatest(folder);
    const actual = await getActual();
    await compare(actual, expected, folder, url);
}

(async () => {
    try {
        await process(roadTestUrl, roadTestFolder, getIcbcRoadTest);
        await process(covidUrl, covidFolder, getIcbcCovid);
    }
    catch (e) {
        console.error(e);
    }
})();