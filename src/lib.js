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
}