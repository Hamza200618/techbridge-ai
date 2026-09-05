'use strict';

// Database usage detection (docs/PROJECT_SPEC.md section 3.10).
// Detects SQL table references, ORM models and connection/database names.
// Credentials are never captured — only database names
// ("Secrets and credentials must not be stored as plain text").

const SQL_RESERVED = new Set([
  'select', 'from', 'where', 'set', 'values', 'insert', 'update', 'delete',
  'into', 'join', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'on',
  'as', 'order', 'group', 'limit', 'offset', 'and', 'or', 'not', 'null',
  'exists', 'case', 'when', 'then', 'else', 'end', 'distinct', 'count',
  'sum', 'avg', 'min', 'max', 'create', 'table', 'if', 'union', 'having',
  'between', 'in', 'is', 'like', 'asc', 'desc', 'with',
]);

// Table references inside SQL statements: FROM x, JOIN x, INTO x, UPDATE x.
const TABLE_REF = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+[`"[]?([A-Za-z_][\w]*)[`"\]]?/gi;
const CREATE_TABLE = /\bCREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([A-Za-z_][\w]*)/gi;
const MONGOOSE_MODEL = /\bmongoose\s*\.\s*model\s*\(\s*['"]([\w-]+)['"]/g;
const SEQUELIZE_MODEL = /\bsequelize\s*\.\s*define\s*\(\s*['"]([\w-]+)['"]/gi;
const PRISMA_MODEL = /^\s*model\s+([A-Za-z_]\w*)\s*\{/gm;
// Connection URL / config database name (name capture only, never credentials).
const CONNECTION_DB = /\b(?:mysql|mariadb|postgres|postgresql|mongodb(?:\+srv)?):\/\/[^\s'"`/]*\/([\w-]+)/i;
const CONFIG_DB = /\bdatabase\s*[:=]\s*['"]([\w-]+)['"]/i;
const CONFIG_DB_EQ = /\bdatabase=([\w-]+)/i;
// String literals (single, double or backtick) that look like SQL statements.
const SQL_STRING = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const SQL_INTENT = /\b(?:SELECT\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+TABLE\b)/i;

function addEntity(entities, entity) {
  const key = `${entity.entityType}:${entity.name.toLowerCase()}`;
  if (!entities.has(key)) {
    entities.set(key, entity);
  }
}

function detectDatabaseName(text) {
  const connection = text.match(CONNECTION_DB);
  if (connection) return connection[1];
  const config = text.match(CONFIG_DB);
  if (config) return config[1];
  const configEq = text.match(CONFIG_DB_EQ);
  if (configEq) return configEq[1];
  return null;
}

function collectTableRefs(text, entities, filePath, databaseName) {
  for (const pattern of [TABLE_REF, CREATE_TABLE]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const name = match[1];
      if (!SQL_RESERVED.has(name.toLowerCase())) {
        addEntity(entities, {
          filePath,
          entityType: 'table',
          name,
          databaseName,
        });
      }
      match = pattern.exec(text);
    }
  }
}

// Returns [{ filePath, entityType, name, databaseName }] — de-duplicated
// per (entityType, name) across the project.
function detectDatabaseEntities(sourceFiles) {
  const entities = new Map();
  for (const file of sourceFiles) {
    const isSqlFile = file.extension === 'sql';
    const databaseName = detectDatabaseName(file.text);

    if (isSqlFile) {
      collectTableRefs(file.text, entities, file.path, databaseName);
      continue;
    }

    // ORM models
    for (const pattern of [MONGOOSE_MODEL, SEQUELIZE_MODEL]) {
      pattern.lastIndex = 0;
      let match = pattern.exec(file.text);
      while (match) {
        addEntity(entities, {
          filePath: file.path,
          entityType: 'model',
          name: match[1],
          databaseName,
        });
        match = pattern.exec(file.text);
      }
    }
    if (file.path.endsWith('.prisma')) {
      PRISMA_MODEL.lastIndex = 0;
      let match = PRISMA_MODEL.exec(file.text);
      while (match) {
        addEntity(entities, {
          filePath: file.path,
          entityType: 'model',
          name: match[1],
          databaseName,
        });
        match = PRISMA_MODEL.exec(file.text);
      }
    }

    // SQL embedded in string literals
    SQL_STRING.lastIndex = 0;
    let stringMatch = SQL_STRING.exec(file.text);
    while (stringMatch) {
      const literal = stringMatch[2];
      if (literal.length <= 5000 && SQL_INTENT.test(literal)) {
        collectTableRefs(literal, entities, file.path, databaseName);
      }
      stringMatch = SQL_STRING.exec(file.text);
    }
  }
  return [...entities.values()].sort(
    (a, b) => a.entityType.localeCompare(b.entityType) || a.name.localeCompare(b.name),
  );
}

module.exports = { detectDatabaseEntities };
