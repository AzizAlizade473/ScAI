// Database helpers for the pipeline. Settings come only from environment variables (Backend/.env).
'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function connect() {
  for (const k of ['DB_HOST', 'DB_USER', 'DB_PASSWORD']) if (!process.env[k]) throw new Error(`${k} is not set (see Backend/.env.example)`);
  return mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    connectionLimit: 3, timezone: 'Z', decimalNumbers: true, charset: 'utf8mb4',
    multipleStatements: true                                      // a .sql step file is one script
  });
}

/* A step written in plain SQL. It runs on the step's connection, inside the transaction that
 * run.js opens for the step, so the step and its quality checks commit together or not at all. */
function sqlStep(file) {
  const full = path.join(__dirname, 'sql', file);
  return async ({ conn }) => {
    const [results] = await conn.query(fs.readFileSync(full, 'utf8'));
    const list = Array.isArray(results) ? results : [results];
    return list.reduce((n, r) => n + (r && typeof r.affectedRows === 'number' ? r.affectedRows : 0), 0);   // rows written
  };
}

module.exports = { connect, sqlStep };
