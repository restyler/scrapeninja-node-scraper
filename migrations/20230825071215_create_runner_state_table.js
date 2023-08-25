export const up = knex => {
    return knex.schema.createTable('runner_state', (table) => {
      table.increments('id').primary();
      table.boolean('isRunning').defaultTo(false);
      table.text('lastOutput');
      table.timestamp('updatedAt').defaultTo(knex.fn.now());
    });
  };
  
  export const down = knex => {
    return knex.schema.dropTable('runner_state');
  };
  