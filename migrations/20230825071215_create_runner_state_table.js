export const up = knex => {
    return knex.schema.createTable('runner_state', (table) => {
      table.increments('id').primary();
      table.string('processId').notNullable();
      table.string('scraperPath');
      table.boolean('isRunning').defaultTo(false);
      table.text('lastOutput');
      table.timestamp('createdAt').defaultTo(knex.fn.now());
      table.timestamp('updatedAt').defaultTo(knex.fn.now());
    });
  };
  
  export const down = knex => {
    return knex.schema.dropTable('runner_state');
  };
  