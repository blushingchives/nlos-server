import axios from "axios";
import https from "https";
import pino from "pino";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { CreateDatabaseClient } from "./tools/CreateDatabaseClient";
import { MotionDetection, SensorData } from "./types/database";
const agent = new https.Agent({ family: 4 }); // forces IPv4

require("dotenv").config();
const DATABASE_CONNECTION_STRING = process.env.DATABASE_CONNECTION_STRING;
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_API_KEY}`;

const logger = CreateLoggerClient();

let hasInitialized = false;

async function initiate() {
  if (hasInitialized) {
    logger.info("⚠️  Already initialized, skipping...");
    return;
  }
  hasInitialized = true;
  const poolClient = await CreateDatabaseClient(DATABASE_CONNECTION_STRING);

  // Unlisten first to remove any stale listeners
  try {
    await poolClient.query("UNLISTEN motion_detection_changes");
    logger.info("✓ Removed any existing listeners");
  } catch (error) {
    logger.info("No existing listeners to remove");
  }

  // Drop existing trigger and function if they exist (allows edits on restart)
  await poolClient.query(`
      DROP TRIGGER IF EXISTS motion_detection_notify_trigger ON motion_detection;
    `);

  await poolClient.query(`
      DROP FUNCTION IF EXISTS notify_motion_detection_change();
    `);

  // Create notification function
  await poolClient.query(`
      CREATE OR REPLACE FUNCTION notify_motion_detection_change()
      RETURNS TRIGGER AS $$
      DECLARE
        payload JSON;
      BEGIN
        -- Build JSON payload with the new row data
        payload = json_build_object(
          'operation', TG_OP,
          'id', NEW.id,
          'sensor_id', NEW.sensor_id,
          'timestamp', NEW.timestamp,
          'occupied_status', NEW.occupied_status,
          'detection_period', NEW.detection_period,
          'accel_threshold', NEW.accel_threshold,
          'gyro_threshold', NEW.gyro_threshold,
          'motion_threshold_percent', NEW.motion_threshold_percent
        );

        -- Send notification on the 'motion_detection_changes' channel
        PERFORM pg_notify('motion_detection_changes', payload::text);

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

  // Create trigger that fires on INSERT
  await poolClient.query(`
      CREATE TRIGGER motion_detection_notify_trigger
      AFTER INSERT ON motion_detection
      FOR EACH ROW
      EXECUTE FUNCTION notify_motion_detection_change();
    `);

  logger.info("✓ Motion detection trigger and function created successfully");

  // Listen for notifications
  await poolClient.query("LISTEN motion_detection_changes");
  logger.info(
    "✓ Listening for motion_detection changes on channel: motion_detection_changes"
  );

  // Set up notification handler
  poolClient.on("notification", async (msg) => {
    if (msg.channel === "motion_detection_changes") {
      try {
        const payload: MotionDetection = JSON.parse(msg.payload || "{}");
        logger.info("=== MOTION DETECTION CHANGE ===");
        logger.info("Sensor ID:", payload.sensor_id);
        logger.info("Occupied Status:", payload.occupied_status);
        logger.info("Timestamp:", payload.timestamp);
        logger.info("==============================");

        let string = `NUS Laundry Occupancy System - NLOS\n`;
        string += `${payload.sensor_id}: ${
          payload.occupied_status ? "Occupied" : "Free"
        }\n`;

        await axios
          .post(
            `${TELEGRAM_API}/sendMessage`,
            {
              parse_mode: "markdown",
              chat_id: TELEGRAM_GROUP_ID,
              disable_web_page_preview: true,
              text: string,
            },
            { httpsAgent: agent }
          )
          .catch((e) => logger.info(e));
      } catch (error) {
        console.error("Error parsing notification payload:", error);
      }
    }
  });
}
initiate();
