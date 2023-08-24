// seeds/seed_items.mjs

/**
 * @param {import('knex')} knex
 */
export const seed = async (knex) => {
  // Deletes ALL existing entries
  await knex('items').del();

  // Inserts seed entries
  await knex('items').insert([
    {
      url: 'https://news.ycombinator.com/item?id=37231276'
    },
    {
      url: 'https://news.ycombinator.com/item?id=37247394'
    },
    {
      url: 'https://non-existing.url/'
    }
    
  ]);
}
