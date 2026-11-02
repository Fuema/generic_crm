import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema"; // Points to your Drizzle schema definition file

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is missing from environment configuration");
}

// 1. Initialize Neon serverless driver over HTTP connection
const sql = neon(process.env.DATABASE_URL);

// 2. Export the instance wrapped with Drizzle ORM
export const db = drizzle({ client: sql, schema });
