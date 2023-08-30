import knex from 'knex';
import knexfile from '../knexfile.js';


export const db = knex(knexfile.production);



// implement log function to save logs to the database and output to the console
export const log = async (message, severity = 'info', itemId = null) => {
    const ALLOWED_SEVERITY = ['info', 'warning', 'error'];
    if (!ALLOWED_SEVERITY.includes(severity)) {
        throw new Error(`Invalid severity: ${severity}`);
    }
    let cl = console.log;
    if (severity == 'error') {
        cl = console.error;
    }

    cl(`[ITEM ${itemId}] [${severity}] ${message}`);
    await db('logs').insert({
        message,
        severity,
        itemId,
        createdAt: db.fn.now()
    });

    // IPC for realtime updates
    if (typeof process.send === 'function') {
        process.send({ type: 'log', data: { itemId } });
    }
}

// creating a way to debounce functions, state aware (so the debounced function can be re-created each time and maintain debounced state, distinct by "key"):
// const createDebouncer = debounceFactory();
// const key = 'your_runtime_key';
// const debouncedFunc = createDebouncer(myFunction, 300, key);
// Then you can invoke the debounced function as usual:
// debouncedFunc(arg1, arg2, ...);
export function debounceFactory() {
    const timerMap = new Map();

    return function(func, delay, key = null) {
        return function() {
            const context = this;
            const args = arguments;

            if (timerMap.has(key)) {
                clearTimeout(timerMap.get(key));
            }

            timerMap.set(key, setTimeout(() => {
                func.apply(context, args);
                timerMap.delete(key);
            }, delay));
        };
    };
}


