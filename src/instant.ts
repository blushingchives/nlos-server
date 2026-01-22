import axios from "axios";
import https from "https";
import pino from "pino";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { CreateDatabaseClient } from "./tools/CreateDatabaseClient";
import { MotionDetection, SensorData } from "./types/database";
import { sendUpdate } from "./sendUpdate";
const agent = new https.Agent({ family: 4 }); // forces IPv4

require("dotenv").config();
const DATABASE_CONNECTION_STRING = process.env.DATABASE_CONNECTION_STRING;
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_API_KEY}`;

const logger = CreateLoggerClient();

let hasInitialized = false;
let poolClient: any;
let reconnectAttempts = 0;

async function initiate() {
  if (hasInitialized && poolClient) {
    logger.info("⚠️  Already initialized, skipping...");
    return;
  }
  hasInitialized = true;

  try {
    poolClient = await CreateDatabaseClient(DATABASE_CONNECTION_STRING);
    reconnectAttempts = 0; // Reset on successful connection
    await setupListener();
    setupHealthChecks();
  } catch (error) {
    logger.error("Failed to initialize:", error);
    handleReconnect();
  }
}

async function setupListener() {
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
          'occupied_status', NEW.occupied_status
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
  poolClient.on("notification", async (msg: any) => {
    if (msg.channel === "motion_detection_changes") {
      try {
        const payload: MotionDetection = JSON.parse(msg.payload || "{}");
        logger.info("=== MOTION DETECTION CHANGE ===");
        logger.info("Sensor ID:", payload.sensor_id);
        logger.info("Occupied Status:", payload.occupied_status);
        logger.info("Timestamp:", payload.timestamp);
        logger.info("Sending update...");
        logger.info("==============================");

        sendUpdate(poolClient, TELEGRAM_GROUP_ID, TELEGRAM_API);
      } catch (error) {
        console.error("Error parsing notification payload:", error);
      }
    }
  });

  // Monitor connection errors
  poolClient.on("error", (err: Error) => {
    logger.error("PostgreSQL client error:", err);
    handleReconnect();
  });

  poolClient.on("end", () => {
    logger.warn("PostgreSQL connection ended unexpectedly");
    handleReconnect();
  });
}

function setupHealthChecks() {
  // Keepalive: Send a simple query every 30 seconds
  setInterval(async () => {
    try {
      if (!poolClient) return;
      await poolClient.query("SELECT 1");
      logger.debug("✓ Keepalive: Connection healthy");
    } catch (error) {
      logger.error("✗ Keepalive failed:", error);
      handleReconnect();
    }
  }, 30000);

  // Verify LISTEN status every minute
  setInterval(async () => {
    try {
      if (!poolClient) return;

      const result = await poolClient.query(`
        SELECT COUNT(*)
        FROM pg_listening_channels()
        WHERE channel = 'motion_detection_changes'
      `);

      if (result.rows[0].count === "0") {
        logger.warn(
          "⚠️  Not listening to motion_detection_changes! Re-subscribing..."
        );
        await poolClient.query("LISTEN motion_detection_changes");
        logger.info("✓ Re-subscribed to motion_detection_changes");
      } else {
        logger.debug("✓ LISTEN status verified");
      }
    } catch (error) {
      logger.error("Failed to verify LISTEN status:", error);
      handleReconnect();
    }
  }, 60000);
}

async function handleReconnect() {
  reconnectAttempts++;
  const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s

  logger.info(
    `Attempting to reconnect in ${
      backoffTime / 1000
    }s (attempt ${reconnectAttempts})...`
  );

  setTimeout(async () => {
    hasInitialized = false;
    poolClient = null;
    await initiate();
  }, backoffTime);
}

initiate();
