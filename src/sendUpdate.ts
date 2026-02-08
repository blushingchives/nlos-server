import { PoolClient } from "pg";
import axios from "axios";
import https from "https";
import { CreateLoggerClient } from "./tools/CreateLoggerClient";
import { MotionDetection, TelegramData } from "./types/database";
import { formatDate } from "./formatDate";
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
    return "-1";
  }

  let string = `============\n`;
  motionData.forEach((data) => {
    string += `${data.sensor_id}: ${
      data.occupied_status ? "🔴 Occupied" : "🟢 Free"
    }\n`;
  });
  string += `============\n`;
  string += `Last Update: ${formatDate(new Date())}\n`;

  const telegramData: TelegramData = (
    await poolClient.query(
      `
      SELECT *
      FROM telegram_data
      WHERE group_id = $1 AND thread_id = $2;
          `,
      [TELEGRAM_GROUP_ID, TELEGRAM_THREAD_ID],
    )
  ).rows[0];

  const response = await axios
    .post(
      `${TELEGRAM_API}/sendMessage`,
      {
        parse_mode: "markdown",
        chat_id: TELEGRAM_GROUP_ID,
        message_thread_id: TELEGRAM_THREAD_ID,
        text: string,
      },
      { httpsAgent: agent },
    )
    .catch((e) => {
      logger.info(e);
      return null;
    });

  if (telegramData !== undefined) {
    await axios
      .post(
        `${TELEGRAM_API}/deleteMessage`,
        {
          chat_id: TELEGRAM_GROUP_ID,
          message_id: telegramData.message_id,
        },
        { httpsAgent: agent },
      )
      .catch((e) => logger.info(e));
  }

  const newMessageId = response?.data?.result?.message_id;
  if (newMessageId) {
    await poolClient.query(
      `INSERT INTO telegram_data (group_id, thread_id, message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, thread_id)
       DO UPDATE SET message_id = $3`,
      [TELEGRAM_GROUP_ID, TELEGRAM_THREAD_ID, newMessageId],
    );
  }
  logger.info(`Update sent at ${new Date().toLocaleTimeString()}`);
}
