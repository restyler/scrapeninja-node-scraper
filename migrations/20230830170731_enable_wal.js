// No need to import knex, since it's passed in by the migration runner

export const up = (knex) => {
    return knex.schema.raw('PRAGMA journal_mode=WAL;').then(result => {
        console.log(result);
    });
};

export const down = async (knex) => {
    // To revert the WAL mode, we set the journal_mode back to DELETE (default mode).
    return knex.schema.raw('PRAGMA journal_mode=DELETE;');
};

export const config = { transaction: false };
