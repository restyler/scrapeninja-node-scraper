# Example multithreaded scraper which uses sqlite to get a list of items to scrape 
# and then launches ScrapeNinja for each item, putting scraped data back into database

Pre-requisites:
Node.js 16+
Sqlite 3.35+


Create empty database with tables:
```bash
npx knex migrate:latest --env production
```

This will create `scraper.sqlite3` database in project folder.

Create seed test values:
```bash
npx knex seed:run --env production
```
This will insert 2 sample URLs to scrape into `items` table of the database.

## Subscribe to ScrapeNinja
https://apiroad.net/marketplace/apis/scrapeninja and get your API key

## Settings
Create .env in project folder and set your APIROAD_KEY 

## Launching the scraper

```bash
node src/step1.js
```

## Working with data in production
Scraper puts all data into `data` TEXT blob with JSON inside. It is possible to extract particular values at runtime:
```sql
select
  id,
  json_extract(data, '$.extractor') as extracted
from items
```

Selecting just titles:
```sql
SELECT json_extract(data, '$.extractor.result.title') from items;
```

## When you need more speed...

Use generated columns:
Generated column support was added with SQLite version 3.31.0 (2020-01-22).

```sql
alter table items
add column title string
as (json_extract(value, '$.extractor.result.title'));
```

### Build an index:
```sql
create index items_some_key on items(some_key);
```

Now the query works instantly:

```sql
select id, some_key
from items
where id = 3;
```
