// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
const knex_config = {
  production: {
    client: 'sqlite3',
    connection: {
      filename: './scraper.sqlite3'
    },
    migrations: {
      tableName: 'knex_migrations'
    },
    useNullAsDefault: true
  }

};

export default knex_config;
