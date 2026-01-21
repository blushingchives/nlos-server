// npx knex migrate:latest --env production
// npx knex migrate:rollback --env production

import { Knex } from "knex";

export async function up(knex: Knex): Promise<Array<void>> {
  return Promise.all([
    knex.schema.raw(`
CREATE TABLE sensor_data (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR NOT NULL,
    event_id VARCHAR NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    raw_acx INTEGER NOT NULL,
    raw_acy INTEGER NOT NULL,
    raw_acz INTEGER NOT NULL,
    raw_gyx INTEGER NOT NULL,
    raw_gyy INTEGER NOT NULL,
    raw_gyz INTEGER NOT NULL,
    delta_acx INTEGER NOT NULL,
    delta_acy INTEGER NOT NULL,
    delta_acz INTEGER NOT NULL,
    delta_gyx INTEGER NOT NULL,
    delta_gyy INTEGER NOT NULL,
    delta_gyz INTEGER NOT NULL,
    baseline_acx INTEGER NOT NULL,
    baseline_acy INTEGER NOT NULL,
    baseline_acz INTEGER NOT NULL,
    baseline_gyx INTEGER NOT NULL,
    baseline_gyy INTEGER NOT NULL,
    baseline_gyz INTEGER NOT NULL
);
CREATE TABLE motion_detection (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    occupied_status BOOLEAN NOT NULL,
    detection_period INTEGER NOT NULL,
    rms DECIMAL NOT NULL,
    rms_threshold_free DECIMAL NOT NULL,
    rms_threshold_occupied DECIMAL NOT NULL
);
        `),
  ]);
}

export async function down(knex: Knex): Promise<Array<void>> {
  return Promise.all([
    knex.schema.raw(`
            DROP TABLE IF EXISTS sensor_data;
            DROP TABLE IF EXISTS motion_detection;
        `),
  ]);
}
