import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import { db, debounceFactory, wsStruct, ITEMS_FIELDS, ITEMS_JSON_FIELDS_TRANSFORMED } from '../../src/lib.js';


// Setup paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));


let child;
export async function startProcess(broadcast) {
    
    if (child) {
        broadcast(wsStruct('log_stdout', 'Killing previous process'));
        child.kill();
    }
    console.log('starting process');

    const step1ScriptPath = path.join(__dirname, '..', '..', 'src', 'step1.js');

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
        
        const items = await db('items')
            .select(ITEMS_FIELDS.filter(field => field !== 'data')
            .concat(ITEMS_JSON_FIELDS_TRANSFORMED))
            .where('id', itemId);
        //console.log('processItemUpdate', itemId, items);
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
        broadcast(wsStruct('runner_state', runnerState));
    });
}

export async function stopProcess(broadcast) {
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
