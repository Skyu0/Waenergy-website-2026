// server/db/sqlite-adapter.js
//
// A small wrapper around Node.js's built-in `node:sqlite` module, giving it
// the same shape as the popular `better-sqlite3` package (new Database(path),
// db.prepare(sql).run/get/all(), db.exec(sql), db.transaction(fn)).
//
// Why: `better-sqlite3` is a native module — it has to compile a small piece
// of C++ for your exact operating system the first time you `npm install`.
// On Windows that requires the Visual Studio C++ Build Tools, which most
// computers don't have installed, causing the "gyp ERR! find VS" error.
// Node's own built-in SQLite module needs no compiling at all, so the site
// installs and runs on any machine (Windows, Mac, Linux) with zero extra
// setup. It ships inside Node.js itself from version 22.5 onward.
//
// Requires Node.js 22.5+.

const { DatabaseSync } = require('node:sqlite');

class Statement {
  constructor(stmt) {
    this._stmt = stmt;
  }
  run(...args) {
    const info = this._stmt.run(...args);
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
  }
  get(...args) {
    return this._stmt.get(...args);
  }
  all(...args) {
    return this._stmt.all(...args);
  }
}

class Database {
  constructor(path) {
    this._db = new DatabaseSync(path);
  }
  // Accepts a raw "PRAGMA foo = bar" style string, same call shape as
  // better-sqlite3's db.pragma('journal_mode = WAL').
  pragma(str) {
    try { this._db.exec(`PRAGMA ${str}`); } catch (err) { /* non-fatal */ }
  }
  exec(sql) {
    this._db.exec(sql);
  }
  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }
  // Wraps fn in a real SQL transaction (BEGIN/COMMIT, ROLLBACK on error) —
  // mirrors better-sqlite3's `db.transaction(fn)` helper, which returns a
  // callable function rather than running immediately.
  transaction(fn) {
    return (...args) => {
      this._db.exec('BEGIN');
      try {
        const result = fn(...args);
        this._db.exec('COMMIT');
        return result;
      } catch (err) {
        try { this._db.exec('ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    };
  }
}

module.exports = Database;
