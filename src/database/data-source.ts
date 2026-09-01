import "dotenv/config";
import { DataSource } from "typeorm";

import { buildTypeOrmOptions } from "./database.config.js";

const AppDataSource = new DataSource(buildTypeOrmOptions());

export default AppDataSource;
