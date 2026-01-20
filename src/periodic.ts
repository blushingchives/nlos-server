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

async function initiate() {
  logger.info(`Initiating database pool.`);
  poolClient = await CreateDatabaseClient(DATABASE_CONNECTION_STRING);

  start();
}
initiate();

async function start() {
  logger.info(`Starting polling. Triggers at 15-minute mark of each hour.`);

  // Function to calculate milliseconds until next 15-minute mark
  function getMillisecondsUntilNext15Min(): number {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    // Calculate minutes until next 15-minute mark
    const minutesUntilNext15 = 15 - (minutes % 15);

    // Calculate total milliseconds to wait
    const msToWait =
      minutesUntilNext15 * 60 * 1000 - // minutes to ms
      seconds * 1000 - // subtract current seconds
      milliseconds; // subtract current milliseconds

    return msToWait;
  }

  // Wait until the next 15-minute mark, then loop
  while (true) {
    const waitTime = getMillisecondsUntilNext15Min();
    logger.info(
      `Next update in ${Math.floor(waitTime / 1000)} seconds at ${new Date(
        Date.now() + waitTime
      ).toLocaleTimeString()}`
    );

    await new Promise((resolve) => setTimeout(resolve, waitTime));
    await sendUpdate();
  }
}

export async function sendUpdate() {
  const sensorData: MotionDetection[] = (
    await poolClient.query(
      `
    SELECT DISTINCT ON (sensor_id) *
    FROM motion_detection
    ORDER BY sensor_id, timestamp DESC;
        `
    )
  ).rows;

  let string = `NUS Laundry Occupancy System - NLOS\n`;
  sensorData.forEach((data) => {
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
