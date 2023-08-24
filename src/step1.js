import { db } from './lib.js';
import fetch from 'node-fetch';
import { forEachLimit } from 'modern-async'
// dotenv
import dotenv from 'dotenv';
dotenv.config();


//console.log(await db.select('*').from('items'));
const THREAD_NUM = parseInt(process.env.THREAD_NUM ?? 3);

if (!process.env.APIROAD_KEY) {
    throw new Error('APIROAD_KEY env variable is not set');
}

const scraperLoop = async () => {
    console.log('loop');
    let newItems = await db.select('*').from('items')
        .where({ ep1StartedAt: null })
        .orWhere(q =>
            q.where('ep1StartedAt', '<', db.raw(`datetime('now', '-1 minutes')`))
                .andWhere('ep1FinishedAt', null)
                .andWhere('ep1ErrorCount', '<', 3)
        ).limit(parseInt(process.env.SINGLE_RUN_ITEMS_LIMIT ?? 1000));


    return newItems;
    //console.log(newItems);
}

// read more about extractors: https://scrapeninja.net/docs/js-extractor/
// for more extractor examples, see ScrapeNinja Playground: https://scrapeninja.net/scraper-sandbox?slug=metadata
let extractor = `function extract (input, cheerio) {
    let $ = cheerio.load(input);
    return { 
      title: $(".title .titleline").text(),
      url:  $(".title .titleline a:first").attr('href') 
    }
  }`;

const scrape = async (item) => {
    await db('items').update({ ep1StartedAt: db.fn.now() }).where('id', item.id);

    let geo = Math.random() > 0.5 ? "us" : "eu";
    console.log(`scraping ${item.url}... with ${geo} geo`);

    // change to 'https://scrapeninja.p.rapidapi.com/scrape-js' if you are subsribed to ScrapeNinja via RapidAPI
    const url = 'https://scrapeninja.apiroad.net/scrape';

    // prefer to use /scrape if you don't need to execute JS!


    const PAYLOAD = {
        "url": item.url,
        "method": "GET",
        "retryNum": 2,
        geo,
        extractor
    };

    const options = {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            // get your key on https://apiroad.net/marketplace/apis/scrapeninja or 
            // replace with 'x-rapidapi-key' from RapidAPI: https://rapidapi.com/restyler/api/scrapeninja
            'x-apiroad-key': process.env.APIROAD_KEY
        },
        body: JSON.stringify(PAYLOAD)
    };

    let resJson, resText;
    try {
        let res = await fetch(url, options);

        try {
            resText = await res.text();
            resJson = JSON.parse(resText);
        } catch (e) {
            console.error('err parsing json:', resText);
        }

        if (res.status == 429) {
            console.log('429 error', res.headers);
        }

        // Basic error handling. Modify if neccessary
        if (!resJson || !resJson.info || ![200, 404].includes(resJson.info.statusCode)) {

            throw new Error('http code:' + res.status + ' body:' + resText);
        }

        console.log('target website response status: ', resJson.info.statusCode);
        if (!resJson.extractor.result || !resJson.extractor.result.name) {
            //console.log('empty extractor, target website response body: ', resJson);
        }

        console.log('target website response extractor: ', resJson.extractor);

        if (!resJson.extractor || !resJson.extractor.result) {
            throw new Error('Bad extractor result:' + JSON.stringify(resJson.extractor));
        }

        await db('items').update({
            data: JSON.stringify(resJson),
            ep1FinishedAt: db.fn.now()
        }).where('id', item.id);

    } catch (e) {
        await db('items')
            .update({
                data: resJson ? JSON.stringify(resJson) : null,
                ep1ErrorAt: db.fn.now(),
                ep1ErrorMsg: e.toString(),
                ep1ErrorCount: db.raw('?? + 1', ['ep1ErrorCount'])
            })
            .where('id', item.id);

        console.error(e);
    }
}

let items = await scraperLoop();
console.log(`items to scrape: ${items.length} with THREAD_NUM: ${THREAD_NUM}`);
if (!items.length) {
    console.log('No more items! Exiting');
    process.exit(0);
}

await forEachLimit(items, async (item) => {
    try {
        await scrape(item);
    } catch (e) {
        console.error(e);
    }
}, THREAD_NUM);

process.exit(0);

