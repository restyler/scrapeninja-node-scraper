#!/bin/sh

# Create an empty database with tables
npx knex migrate:latest --env production

# Insert seed test values
npx knex seed:run --env production