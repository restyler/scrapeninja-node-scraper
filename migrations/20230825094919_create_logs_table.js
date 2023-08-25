/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = knex =>  {
    return knex.schema.createTable('logs', table => {
        table.increments('id').primary();
        table.text('message').notNullable();
        table.string('severity').notNullable();  // you can also consider making this an ENUM type if the severity values are predefined
        table.integer('itemId').unsigned().references('id').inTable('items'); // assuming items is the name of the related table
        table.datetime('createdAt').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = knex => {
    return knex.schema.dropTable('logs');
};
