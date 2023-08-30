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
      url: 'make.com'
    },
    {
      url: 'acquia.com'
    },
    {
      url: 'apple.com'
    },
    {
      url: 'similarweb.com'
    },
    {
      url: 'searchanise.io'
    },
    {
      url: 'fly.io'
    },
    {
      url: 'osii.com'
    },
    {
      url: 'non-existent-domain.com'
    },
    {
      url: 'bad-url'
    }
    
  ]);
}
