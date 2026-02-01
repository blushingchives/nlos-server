import { PoolClient } from "pg";
import axios from "axios";
import https from "https";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { MotionDetection } from "./types/database";
const agent = new https.Agent({ family: 4 }); // forces IPv4

const logger = CreateLoggerClient();

export async function sendUpdate(
  poolClient: PoolClient,
  TELEGRAM_GROUP_ID: string,
  TELEGRAM_THREAD_ID: string,
  TELEGRAM_API: string,
) {
  const motionData: MotionDetection[] = (
    await poolClient.query(
      `
    SELECT DISTINCT ON (sensor_id) *
    FROM motion_detection
    ORDER BY sensor_id, timestamp DESC;
        `,
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
        message_thread_id: TELEGRAM_THREAD_ID,
        disable_web_page_preview: true,
        text: string,
      },
      { httpsAgent: agent },
    )
    .catch((e) => logger.info(e));

  logger.info(`Update sent at ${new Date().toLocaleTimeString()}`);
}
