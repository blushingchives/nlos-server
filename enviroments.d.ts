declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TELEGRAM_API_KEY;
      DATABASE_CONNECTION_STRING;
      TELEGRAM_GROUP_ID;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
