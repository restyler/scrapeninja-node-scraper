import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import Papa from 'papaparse';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { db, wsStruct, fetchItems, createFilteredQuery, ITEMS_FIELDS, ITEMS_PER_PAGE, ITEMS_JSON_FIELDS_TRANSFORMED } from '../../src/lib.js';
import { startProcess, stopProcess } from './processHandlers.js';

// Setup paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '..', '.env');

// Load environment variables
dotenv.config({ path: envPath });

// Log environment variable (optional)
console.log(`process.env.APIROAD_KEY: ${process.env.APIROAD_KEY}`);

// Create express app and WebSocket server
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// add logger to console mw
app.use((req, res, next) => {
    console.log(req.method, req.url);
    next();
});

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

function broadcast(data) {
    console.log('broadcasting to ', wss.clients.size, 'data', data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// websocket processing
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
            await startProcess(broadcast, wsStruct);
        } else if (message == 'stop_process') {
            await stopProcess(broadcast, wsStruct);
        }
    });
});



server.listen(3020, () => {
    console.log('Server listening on port 3020');
});
