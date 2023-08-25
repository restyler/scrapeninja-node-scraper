// Update with your config settings.
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
const knex_config = {
  production: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'data', 'scraper.sqlite3')
    },
    migrations: {
      tableName: 'knex_migrations'
    },
    useNullAsDefault: true
  }

};

export default knex_config;
