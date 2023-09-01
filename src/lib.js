import knex from 'knex';
import knexfile from '../knexfile.js';


export const db = knex(knexfile.production);

export const ITEMS_FIELDS = [
    'id',
    'url',
    'createdAt',
    'updatedAt',
    'data',
    'ep1HttpResponseCode',
    'ep1StartedAt',
    'ep1FinishedAt',
    'ep1ErrorAt',
    'ep1ErrorMsg',
    'ep1ErrorCount'
];

export const wsStruct = (type, data) => {
    return JSON.stringify({ type, data });
};

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



export const ITEMS_PER_PAGE = 20;


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

export const ITEMS_JSON_FIELDS_TRANSFORMED = ITEMS_JSON_FIELDS.map(v => db.raw(`JSON_EXTRACT(data, "$.${v}") as ${fieldShortAlias(v)}`));


export function createFilteredQuery(req) {
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



export async function fetchItems(req, usePagination = true) {
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
