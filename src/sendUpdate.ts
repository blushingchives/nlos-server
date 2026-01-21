import { Pool, PoolClient } from "pg";
import axios from "axios";
import https from "https";
import pino from "pino";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { CreateDatabaseClient } from "./tools/CreateDatabaseClient";
import { MotionDetection, SensorData } from "./types/database";
const agent = new https.Agent({ family: 4 }); // forces IPv4

const logger = CreateLoggerClient();

require("dotenv").config();
const DATABASE_CONNECTION_STRING = process.env.DATABASE_CONNECTION_STRING;
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_API_KEY}`;

var poolClient: PoolClient;

export async function sendUpdate() {
  const motionData: MotionDetection[] = (
    await poolClient.query(
      `
    SELECT DISTINCT ON (sensor_id) *
    FROM motion_detection
    ORDER BY sensor_id, timestamp DESC;
        `
    )
  ).rows;

  if (motionData.length === 0) {
    return;
  }

  let string = `===  NLOS  ===\n`;
  motionData.forEach((data) => {
    string += `${data.sensor_id}: ${
      data.occupied_status ? "Occupied" : "Free\n"
    }`;
  });

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

  logger.info(`Update sent at ${new Date().toLocaleTimeString()}`);
}
