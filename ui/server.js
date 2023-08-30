import express from 'express';
import http from 'http';
import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import { db, debounceFactory } from '../src/lib.js';
import path from 'path';


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
'ep1StartedAt',
'ep1FinishedAt',
'ep1ErrorAt',
'ep1ErrorMsg',
'ep1ErrorCount'];

app.get('/items', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const offset = (page - 1) * ITEMS_PER_PAGE;

    // order
    const order = req.query.order || 'desc';
    const orderBy = req.query.orderBy || 'updatedAt';

    try {
        const items = await db('items').select(ITEMS_FIELDS.filter(field => field !== 'data')
        ).orderBy(orderBy, order).limit(ITEMS_PER_PAGE).offset(offset);
        const totalItems = await db('items').count('* as total');
        const totalPages = Math.ceil(totalItems[0].total / ITEMS_PER_PAGE);
        
        res.json({ items, totalPages, totalItems: totalItems[0].total });
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

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (message) => {
        console.log(`Received message: ${message}`);
        if (message == 'start_process') {
            if (child) {
                child.kill();
            }
            console.log('starting process');
            await db('runner_state').update({
                isRunning: true,
                lastOutput: 'Process started',
                updatedAt: db.fn.now()
            });

            const step1ScriptPath = path.join(__dirname, '..', 'src', 'step1.js');

            child = spawn('node', [step1ScriptPath], {
                env: {
                    ...process.env,
                    // any other env variables you want to set or override
                },
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // ipc is required for the child to send messages back to the parent
            });

            child.stdout.on('data', (data) => {
                ws.send(wsStruct('log_stdout', data.toString()));
            });

            child.stderr.on('data', (data) => {
                ws.send(wsStruct('log_stderr', data.toString()));
            });


            // The logic to process item updates
            async function processItemUpdate(itemId) {
                const items = await db('items').select(ITEMS_FIELDS.filter(field => field !== 'data')).where('id', itemId);
                if (items.length) {
                    ws.send(wsStruct('item_update', items[0]));
                }
            }
            // Create a debounced version of the processItemUpdate function
            //const debouncedItemUpdate = debounce(processItemUpdate, 500);

            const createDebouncer = debounceFactory();

            // Add a listener for IPC messages
            child.on('message', (ipcMessage) => {
                // Handle IPC messages as needed
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
                ws.send(wsStruct('log_stdout', `Process exited with code ${code}`));
            });
        } else if (message === 'stop_process') {
            if (child) {
                child.kill();
            }

            await db('runner_state').update({
                is_running: false,
                last_output: 'Process stopped',
                updated_at: new Date()
            });
        }
    });
});



server.listen(3020, () => {
    console.log('Server listening on port 3020');
});
