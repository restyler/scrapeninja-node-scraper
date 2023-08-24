# ScrapeNinja Demo Node.js Scraper
This example showcases a multithreaded web scraper that utilizes SQLite for storage and the ScrapeNinja API as its scraping engine.

# Running in Docker
Run these commands from cloned repo folder:
```bash
# Build container from project folder. Run once.
docker-compose build

# Init db (run once). this will create /data/scraper.sqlite3 on host machine, mirrored to Docker container
docker-compose run scraper /bin/sh init.sh

# Run the scraper. Run multiple times to scrape more items
docker-compose up
```

# Alternative: Running manually without Docker
## Pre-requisites:
- Node.js 16+
- SQLite 3.31+


## Setting up the database
Create an empty database with tables:
```bash
npx knex migrate:latest --env production
```
This command will create an empty `/data/scraper.sqlite3` database.

## Inserting seed test values:
```bash
npx knex seed:run --env production
```
This will add 3 sample URLs into the `items` table in the database for scraping.


## ScrapeNinja Subscription
ScrapeNinja is a scraping API with smart retries and rotating proxies under the hood.

### Via APIRoad
Subscribe to ScrapeNinja at [ScrapeNinja API on APIRoad](https://apiroad.net/marketplace/apis/scrapeninja) and obtain your API key.

### Via RapidAPI
ScrapeNinja is also available on RapidAPI: https://rapidapi.com/restyler/api/scrapeninja (you will need to change API key name in the HTTP request then, check the code of `src/step1.js`)

## Configure scraper settings:

- Create a .env file in the project folder (you can copy from .env.dist).
- Set your `APIROAD_KEY` within this file.

# Running the scraper
Launch the scraper by entering the following in your terminal:
```bash
node src/step1.js
```
This command fetches a set of items from the items table, available for scraping. If ScrapeNinja encounters an error, the `ep1ErrorCount` counter field will increment. Subsequent runs of `step1.js` will only fetch new items or failed items where `ep1ErrorCount` is less than 3.



# Querying the scraped data
The scraper stores the ScrapeNinja response in a data TEXT blob with embedded JSON. You can extract specific values at runtime using SQL queries:
```sql
select
  id,
  json_extract(data, '$.extractor') as extracted
from items
```

Retrieve raw HTML response and website response status code:
```sql
select
  id,
  json_extract(data, '$.info.statusCode') as httpStatus,
  json_extract(data, '$.body') as html
from items
```

Selecting just titles:
```sql
SELECT json_extract(data, '$.extractor.result.title') from items;
```

### Boosting Query Performance

Use generated columns:
Generated column support was added with SQLite version 3.31.0 (2020-01-22).

Add new virtual column:
```sql
alter table items
add column title string
as (json_extract(value, '$.extractor.result.title'));
```

Build an index:
```sql
create index items_title on items(title);
```

With the index in place, the following query should execute almost instantly:
```sql
select id, title
from items;
```
