/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = function(knex) {
    return knex.schema.createTable('items', table => {
        table.increments('id').primary();
        table.string('url');
        table.text('data');
        table.datetime('createdAt').defaultTo(knex.fn.now());
        table.datetime('updatedAt').defaultTo(knex.fn.now());
        table.datetime('ep1StartedAt');
        table.datetime('ep1FinishedAt');
        table.datetime('ep1ErrorAt');
        table.integer('ep1HttpResponseCode', 3);
        table.text('ep1ErrorMsg');
        table.integer('ep1ErrorCount').defaultTo(0);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = function(knex) {
    return knex.schema.dropTable('items');
};
