import { db, log } from './lib.js';
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


const scrape = async (item) => {

    // add test delay 5 seconds
    // await new Promise(resolve => setTimeout(resolve, 5000));

    await db('items').update({ ep1StartedAt: db.fn.now() }).where('id', item.id);

    log(`scraping ${item.url}...`, 'info', item.id);

    const url = `https://company-intelligence.apiroad.net/lookup?domain=${item.url}`;



    const options = {
        method: 'GET',
        headers: {
            'content-type': 'application/json',
            // get your key on https://apiroad.net/apis/company-intelligence
            'x-apiroad-key': process.env.APIROAD_KEY
        }
    };

    let resJson, resText, resStatus;
    try {
        let res = await fetch(url, options);
        resStatus = res.status;
        try {
            resText = await res.text();
            resJson = JSON.parse(resText);
            
        } catch (e) {
            log('err parsing json: ' + resText.substring(0, 300), 'error', item.id);
        }

        if (res.status == 429) {
            log('429 error' + JSON.stringify(res.headers), 'error', item.id);
        }

        if (![200, 404].includes(res.status)) {
            log('http code:' + res.status + ' body:' + resText, 'error', item.id);
            throw new Error('http code:' + res.status + ' body:' + resText.substring(0, 300));
        }


        
        await db('items').update({
            data: JSON.stringify(resJson),
            updatedAt: db.fn.now(),
            ep1FinishedAt: db.fn.now(),
            ep1HttpResponseCode: resStatus,
            ep1ErrorAt: null,
            ep1ErrorMsg: null,
        }).where('id', item.id);
        await log(`Success with ${resStatus} http code`, 'info', item.id);
        
    } catch (e) {
        await db('items')
            .update({
                data: resJson ? JSON.stringify(resJson) : null,
                updatedAt: db.fn.now(),
                ep1ErrorAt: db.fn.now(),
                ep1ErrorMsg: e.toString(),
                ep1HttpResponseCode: resStatus,
                ep1ErrorCount: db.raw('?? + 1', ['ep1ErrorCount'])
            })
            .where('id', item.id);
        log(e.toString(), 'error', item.id);
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

