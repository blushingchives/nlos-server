// npx knex migrate:latest --env production
// npx knex migrate:rollback --env production

import { Knex } from "knex";

export async function up(knex: Knex): Promise<Array<void>> {
  return Promise.all([
    knex.schema.raw(`
CREATE TABLE telegram_data (
    group_id VARCHAR NOT NULL,
    thread_id VARCHAR NOT NULL,
    message_id VARCHAR NOT NULL,
    PRIMARY KEY (group_id, thread_id)
    );
        `),
  ]);
}

export async function down(knex: Knex): Promise<Array<void>> {
  return Promise.all([
    knex.schema.raw(`
            DROP TABLE IF EXISTS telegram_data;
        `),
  ]);
}
