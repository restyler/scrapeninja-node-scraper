import express from 'express';
import http from 'http';
import { spawn } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { db, debounceFactory } from '../src/lib.js';
import path from 'path';
import Papa from 'papaparse';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

import dotenv from 'dotenv';
dotenv.config({ path: envPath });
console.log(`process.env.APIROAD_KEY: ${process.env.APIROAD_KEY}`);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });




app.use('/static', express.static(new URL('./static', import.meta.url).pathname));
app.use(express.json()) //For JSON requests
app.post('/add-items', (req, res) => {
    const items = req.body.items;

    if (items && items.length) {
        // Insert items into the "items" table
        db('items').insert(items.map(url => ({ url })))
            .then(() => {
                res.json({ success: true });
            })
            .catch(error => {
                console.error(error);
                res.json({ success: false });
            });
    } else {
        res.json({ success: false });
    }
});

const ITEMS_PER_PAGE = 20;
const ITEMS_FIELDS = ['id',
'url',
'createdAt',
'updatedAt',
'data',
'ep1HttpResponseCode',
'ep1StartedAt',
'ep1FinishedAt',
'ep1ErrorAt',
'ep1ErrorMsg',
'ep1ErrorCount'];

const ITEMS_JSON_FIELDS = [
    'data.info.semrush_summary.semrush_global_rank', 
    'data.info.social_fields.linkedin.value', 
    'data.info.semrush_summary.semrush_visits_latest_month',
    'data.properties.short_description',
    'data.properties.identifier.permalink',
    'data.info.funding_rounds_summary.funding_total.value_usd',
    'data.info.acquisitions_summary.num_acquisitions',
    'data.info.overview_company_fields.company_type',
    'data.info.company_about_fields.website.hostname',
];

// build a simple alias function which will return word after last dot and pre-last + 'value' if last word is 'value'
// example: .info.social_fields.linkedin.value -> linkedin_value
// example2: .info.social_fields.linkedin -> linkedin
const fieldShortAlias = (field) => {
    let parts = field.split('.');
    let last = parts.pop();
    let preLast = parts.pop();
    if (last === 'value' || last === 'value_usd') {
        return 'data_' + preLast + '_' + last;
    } else {
        return 'data_' + last;
    }
}

const ITEMS_JSON_FIELDS_TRANSFORMED = ITEMS_JSON_FIELDS.map(v => db.raw(`JSON_EXTRACT(data, "$.${v}") as ${fieldShortAlias(v)}`));


function createFilteredQuery(req) {
    const tier = req.query.tier; 
    const companyName = req.query.companyName; 

    let query = db('items');
    
    if (tier) {
        query = query.where((builder) => {
            if (tier === "gem") {
                builder
                    .whereRaw(`JSON_EXTRACT(data, "$.data.info.semrush_summary.semrush_visits_latest_month") > ?`, [1000000])
                    .orWhereRaw(`JSON_EXTRACT(data, "$.data.info.acquisitions_summary.num_acquisitions") > ?`, [2])
                    .orWhereRaw(`JSON_EXTRACT(data, "$.data.info.funding_rounds_summary.funding_total.value_usd") > ?`, [5000000]);
            } else if (tier === "mature") {
                builder
                    .whereRaw(`JSON_EXTRACT(data, "$.data.info.semrush_summary.semrush_visits_latest_month") > ?`, [200000])
                    .orWhereRaw(`JSON_EXTRACT(data, "$.data.info.funding_rounds_summary.funding_total.value_usd") > ?`, [1000000]);
            }
        });
    }

    if (companyName && companyName.length > 2) {
        query = query.where('url', 'like', `%${companyName}%`);
    }

    // debug sql
    console.log(query.toSQL().toNative());

    return query;
}



async function fetchItems(req, usePagination = true) {
    const page = parseInt(req.query.page) || 1; 
    const offset = (page - 1) * ITEMS_PER_PAGE;
    const order = req.query.order || 'desc';
    const orderBy = req.query.orderBy || 'updatedAt';
    
    let query = createFilteredQuery(req)
        .select(ITEMS_FIELDS.filter(field => field !== 'data').concat(ITEMS_JSON_FIELDS_TRANSFORMED))
        .orderBy(orderBy, order);

    if (usePagination) {
        query = query.limit(ITEMS_PER_PAGE).offset(offset);
    }

    const items = await query;
    return items;
}


app.get('/items/csv', async (req, res) => {
    try {
        // Instead of calling fetchItems directly, we'll create the filtered query and then add necessary transformations.
        let query = createFilteredQuery(req)
            .select(ITEMS_FIELDS.filter(field => field !== 'data').concat(ITEMS_JSON_FIELDS_TRANSFORMED));
        
        const items = await query;

        // Convert items to CSV using PapaParse
        const csv = Papa.unparse(items);

        // Set the response header for CSV and download the file
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=items.csv');
        res.send(csv);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to export items to CSV." });
    }
});

app.get('/items', async (req, res) => {
    try {
        const items = await fetchItems(req); 
        const totalItemsQuery = createFilteredQuery(req);
        const countResult = await totalItemsQuery.count('* as total');
        const totalPages = Math.ceil(countResult[0].total / ITEMS_PER_PAGE);
        
        res.json({ items, totalPages, totalItems: countResult[0].total });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch items." });
    }
});



app.get('/items/:id/data', async (req, res) => {
    const itemId = parseInt(req.params.id);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID." });
    }

    try {
        // Fetch the data field for the provided item ID
        const items = await db('items').select('data').where('id', itemId);
        
        // Check if the item exists
        if (items.length === 0) {
            return res.status(404).json({ error: "Item not found." });
        }

        // load logs for the item
        const logs = await db('logs').select('id', 'message', 'severity', 'createdAt').where('itemId', itemId).orderBy('createdAt', 'desc');
        
        // Return the data of the item
        res.json({ data: items[0].data, logs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch item data." });
    }
});


app.get('/', (req, res) => {
    // Redirect the root path to the /static/index.html file
    res.redirect('/static/index.html');
});


const wsStruct = (type, data) => {
    return JSON.stringify({ type, data });
};

let child;

function broadcast(data) {
    console.log('broadcasting to ', wss.clients.size, 'data', data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}


wss.on('connection', (ws) => {
    console.log('Client connected');

    // Send the current runner state to the client
    db('runner_state').select().then((runnerState) => {
        
        // verify if process is running
        if (runnerState[0] && runnerState[0].isRunning) {
            // check if process is alive by runnerState[0].processId
            try {
                process.kill(runnerState[0].processId, 0);
            } catch (e) {
                // process is not alive
                runnerState[0].isRunning = false;
                runnerState[0].lastOutput = 'Process is not alive';
                db('runner_state').update({
                    isRunning: false,
                    lastOutput: 'Process is not alive',
                    updatedAt: db.fn.now()
                });
            }
        }

        broadcast(wsStruct('runner_state', runnerState[0] ?? { isRunning: false, lastOutput: 'Process is not alive' }));
    });

    ws.on('message', async (message) => {
        console.log(`Received message: ${message}`);
        if (message == 'start_process') {
            if (child) {
                broadcast(wsStruct('log_stdout', 'Killing previous process'));
                child.kill();
            }
            console.log('starting process');

            const step1ScriptPath = path.join(__dirname, '..', 'src', 'step1.js');

            child = spawn('node', [step1ScriptPath], {
                env: {
                    ...process.env,
                    // any other env variables you want to set or override
                },
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // ipc is required for the child to send messages back to the parent
            });

            // get pid and status of a child process
            console.log('child pid:', child.pid);
            console.log('child status:', child.connected);

            let runnerState = {
                isRunning: true,
                processId: child.pid,
                scraperPath: step1ScriptPath,
                lastOutput: 'Process started',
                createdAt: db.fn.now(),
                updatedAt: db.fn.now()
            };

            // First check if a row exists
            // @TODO: adapt for multiple runners
            const existingState = await db('runner_state').select('*').first();

            if (!existingState) {
                // If no row exists, insert
                await db('runner_state').insert(runnerState);
            } else {
                // If row exists, update
                await db('runner_state').update(runnerState);
                
            }

            delete runnerState.updatedAt;

            // convert db.fn.now() to Date object
            runnerState.createdAt = new Date(runnerState.createdAt);

            broadcast(wsStruct('runner_state', runnerState));


            child.stdout.on('data', (data) => {
                broadcast(wsStruct('log_stdout', data.toString()));
            });

            child.stderr.on('data', (data) => {
                broadcast(wsStruct('log_stderr', data.toString()));
            });


            // The logic to process item updates
            async function processItemUpdate(itemId) {
                
                const items = await db('items').select(ITEMS_FIELDS.filter(field => field !== 'data').concat(ITEMS_JSON_FIELDS_TRANSFORMED)
                ).where('id', itemId);
                console.log('processItemUpdate', itemId, items);
                if (items.length) {
                    broadcast(wsStruct('item_update', items[0]));
                }
            }
            // Create a debounced version of the processItemUpdate function
            //const debouncedItemUpdate = debounce(processItemUpdate, 500);

            const createDebouncer = debounceFactory();

            // Add a listener for IPC messages
            child.on('message', (ipcMessage) => {
                // Handle IPC messages as needed
                console.log('Received IPC message',new Date, ipcMessage);
                if (ipcMessage.type === 'log') {
                    console.log(`Received custom IPC message: ${JSON.stringify(ipcMessage.data)}`);
                    // Do something with the custom IPC message
                    //ws.send(wsStruct('log_stdout', `IPC Message: ${JSON.stringify(ipcMessage.data)}`));

                    if (ipcMessage.data.itemId) {
                        // Use the debounced function here
                        //debouncedItemUpdate(ipcMessage.data.itemId);
                        let debouncedItemUpdate = createDebouncer(processItemUpdate, 500, ipcMessage.data.itemId);
                        
                        debouncedItemUpdate(ipcMessage.data.itemId);
                    }
                }
            });

            child.on('exit', (code) => {
                broadcast(wsStruct('log_stdout', `Process exited with code ${code}`));
                let runnerState = {
                    isRunning: false,
                    lastOutput: `Process exited with code ${code}`,
                    updatedAt: db.fn.now()
                };

                db('runner_state').update(runnerState);
                // prevent conflict of JSON.stringify with Date object
                delete runnerState.updatedAt;
                ws.send(wsStruct('runner_state', runnerState));
            });
        } else if (message == 'stop_process') {
            if (child) {
                child.kill();
                console.log(`killing process ${child.pid}`);

                let runnerState = {
                    isRunning: false,
                    lastOutput: 'Process stopped',
                    updatedAt: db.fn.now()
                };
    
                await db('runner_state').update(runnerState);
                delete runnerState.updatedAt;
                
                broadcast(wsStruct('runner_state', runnerState));
            } else {
                broadcast(wsStruct('log_stdout', 'Received stop_process ws signal but no process to kill'));
            }

            
        }
    });
});



server.listen(3020, () => {
    console.log('Server listening on port 3020');
});
