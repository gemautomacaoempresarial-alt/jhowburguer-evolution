'use strict';

const REPLACE_CONFLICT_COLUMNS = {
  message_hidden_users: ['message_id', 'user_id'],
  notification_reads: ['notification_id', 'user_id'],
};

function splitTopLevelComma(value) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];
    if (quote) {
      current += char;
      if (char === quote) {
        if (quote === "'" && next === "'") {
          current += next;
          i += 1;
        } else {
          quote = '';
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function safeIdentifier(value) {
  return String(value || '').replace(/^['"`]|['"`]$/g, '').replace(/[^a-zA-Z0-9_]/g, '');
}

function translatePragma(sql) {
  const trimmed = sql.trim().replace(/;$/, '');
  const tableInfo = trimmed.match(/^PRAGMA\s+table_info\s*\(\s*(.+?)\s*\)$/i);
  if (tableInfo) {
    const table = safeIdentifier(tableInfo[1]);
    return `
      SELECT
        c.ordinal_position - 1 AS cid,
        c.column_name AS name,
        c.data_type AS type,
        CASE WHEN c.is_nullable='NO' THEN 1 ELSE 0 END AS notnull,
        c.column_default AS dflt_value,
        CASE WHEN tc.constraint_type='PRIMARY KEY' THEN 1 ELSE 0 END AS pk
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON kcu.table_schema=c.table_schema AND kcu.table_name=c.table_name AND kcu.column_name=c.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON tc.constraint_schema=kcu.constraint_schema AND tc.constraint_name=kcu.constraint_name AND tc.constraint_type='PRIMARY KEY'
      WHERE c.table_schema='public' AND c.table_name='${table}'
      ORDER BY c.ordinal_position
    `;
  }
  if (/^PRAGMA\s+/i.test(trimmed)) return 'SELECT 1 WHERE FALSE';
  return null;
}

function translateSqliteMaster(sql) {
  if (!/\bsqlite_master\b/i.test(sql)) return sql;
  let translated = sql;
  translated = translated.replace(/FROM\s+sqlite_master/ig, "FROM information_schema.tables");
  translated = translated.replace(/\btype\s*=\s*'table'\s*(?:AND\s*)?/ig, "table_schema='public' AND ");
  translated = translated.replace(/\bname\b/ig, 'table_name');
  translated = translated.replace(/^\s*SELECT\s+table_name\s+/i, 'SELECT table_name AS name ');
  translated = translated.replace(/^\s*SELECT\s+1\s+/i, 'SELECT 1 ');
  translated = translated.replace(/table_name\s+NOT\s+LIKE\s+'sqlite_%'\s*(?:AND\s*)?/ig, '');
  translated = translated.replace(/WHERE\s+table_schema='public'\s+AND\s*(ORDER BY|$)/ig, "WHERE table_schema='public' $1");
  return translated;
}

function translateInsertOrReplace(sql) {
  const match = sql.match(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([\w"]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^;]+)\)\s*;?\s*$/is);
  if (!match) return sql.replace(/INSERT\s+OR\s+REPLACE/ig, 'INSERT');
  const rawTable = match[1];
  const table = safeIdentifier(rawTable);
  const columns = splitTopLevelComma(match[2]).map((item) => safeIdentifier(item));
  const conflictColumns = REPLACE_CONFLICT_COLUMNS[table] || columns.slice(0, 1);
  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const updates = updateColumns.length
    ? updateColumns.map((column) => `"${column}"=EXCLUDED."${column}"`).join(', ')
    : `${conflictColumns[0]}=EXCLUDED.${conflictColumns[0]}`;
  return `INSERT INTO ${rawTable} (${match[2]}) VALUES (${match[3]}) ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updates}`;
}

function translateInsertOrIgnore(sql) {
  if (!/^\s*INSERT\s+OR\s+IGNORE\b/i.test(sql)) return sql;
  let translated = sql.replace(/INSERT\s+OR\s+IGNORE/ig, 'INSERT');
  const semicolon = /;\s*$/.test(translated) ? ';' : '';
  translated = translated.replace(/;\s*$/, '');
  if (!/\bON\s+CONFLICT\b/i.test(translated)) translated += ' ON CONFLICT DO NOTHING';
  return translated + semicolon;
}

function translateDateFunctions(sql) {
  let translated = sql;
  translated = translated.replace(/datetime\(\s*'now'\s*,\s*'-(\d+)\s+day(?:s)?'\s*\)/ig, "(CURRENT_TIMESTAMP - INTERVAL '$1 day')");
  translated = translated.replace(/datetime\(\s*'now'\s*\)/ig, 'CURRENT_TIMESTAMP');
  translated = translated.replace(/datetime\(\s*([^()]+?)\s*\)/ig, 'CAST($1 AS TIMESTAMPTZ)');
  translated = translated.replace(/\(julianday\(([^)]+)\)-julianday\(([^)]+)\)\)\*86400/ig, 'EXTRACT(EPOCH FROM (CAST($1 AS TIMESTAMPTZ) - CAST($2 AS TIMESTAMPTZ)))');
  return translated;
}

function translateJsonAggregates(sql) {
  let translated = sql;
  translated = translated.replace(
    /json_group_array\(json_object\('emoji',r\.emoji,'user_id',r\.user_id,'user_name',rx\.name\)\)/ig,
    "COALESCE(json_agg(json_build_object('emoji',r.emoji,'user_id',r.user_id,'user_name',rx.name))::text,'[]')",
  );
  translated = translated.replace(
    /GROUP_CONCAT\(CAST\(([^)]+)\s+AS\s+TEXT\)\|\|'x '\|\|([^,]+),\s*'([^']*)'\)/ig,
    "string_agg(CAST($1 AS TEXT)||'x '||$2,'$3')",
  );
  return translated;
}


function replaceKeywordOutsideQuotes(sql, keyword, replacement) {
  let output = '';
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  const upperKeyword = keyword.toUpperCase();
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      output += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) {
          output += next;
          i += 1;
        } else quote = '';
      }
      continue;
    }
    if (char === '-' && next === '-') {
      output += char + next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      output += char + next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }
    const candidate = sql.slice(i, i + keyword.length);
    const before = sql[i - 1] || '';
    const after = sql[i + keyword.length] || '';
    if (candidate.toUpperCase() === upperKeyword && !/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
      output += replacement;
      i += keyword.length - 1;
      continue;
    }
    output += char;
  }
  return output;
}

function translateQuestionPlaceholders(sql) {
  let output = '';
  let index = 1;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let dollarQuote = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      output += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (dollarQuote) {
      output += char;
      if (sql.startsWith(dollarQuote, i)) {
        output += dollarQuote.slice(1);
        i += dollarQuote.length - 1;
        dollarQuote = '';
      }
      continue;
    }
    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) {
          output += next;
          i += 1;
        } else {
          quote = '';
        }
      }
      continue;
    }
    if (char === '-' && next === '-') {
      output += char + next;
      i += 1;
      lineComment = true;
      continue;
    }
    if (char === '/' && next === '*') {
      output += char + next;
      i += 1;
      blockComment = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }
    if (char === '$') {
      const tag = sql.slice(i).match(/^\$[a-zA-Z0-9_]*\$/)?.[0];
      if (tag) {
        dollarQuote = tag;
        output += tag;
        i += tag.length - 1;
        continue;
      }
    }
    if (char === '?') {
      output += `$${index}`;
      index += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function extractCreateTableBlocks(sql) {
  const blocks = [];
  const regex = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([\w"]+)\s*\(/ig;
  let match;
  while ((match = regex.exec(sql))) {
    const start = match.index;
    let depth = 1;
    let quote = '';
    let end = regex.lastIndex;
    for (; end < sql.length; end += 1) {
      const char = sql[end];
      const next = sql[end + 1];
      if (quote) {
        if (char === quote) {
          if (quote === "'" && next === "'") end += 1;
          else quote = '';
        }
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === '(') depth += 1;
      else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          while (/\s/.test(sql[end] || '')) end += 1;
          if (sql[end] === ';') end += 1;
          break;
        }
      }
    }
    blocks.push({ table: safeIdentifier(match[1]), rawTable: match[1], start, end, text: sql.slice(start, end) });
    regex.lastIndex = end;
  }
  return blocks;
}

function translateCreateTableBlock(block) {
  const openIndex = block.text.indexOf('(');
  const closeIndex = block.text.lastIndexOf(')');
  const header = block.text.slice(0, openIndex + 1);
  const body = block.text.slice(openIndex + 1, closeIndex);
  const entries = splitTopLevelComma(body);
  const kept = [];
  const foreignKeys = [];

  for (const entry of entries) {
    const fk = entry.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([\w"]+)\s*\(([^)]+)\)(.*)$/is);
    if (fk) {
      foreignKeys.push({ columns: fk[1].trim(), refTable: fk[2], refColumns: fk[3].trim(), suffix: fk[4].trim() });
    } else {
      kept.push(entry);
    }
  }

  let translatedBody = kept.join(',\n      ');
  translatedBody = translatedBody.replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/ig, 'BIGSERIAL PRIMARY KEY');
  translatedBody = translatedBody.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*_id|id)\s+INTEGER\b/ig, '$1 BIGINT');
  translatedBody = translatedBody.replace(/\bREAL\b/ig, 'DOUBLE PRECISION');
  translatedBody = translatedBody.replace(/\bAUTOINCREMENT\b/ig, '');

  const createSql = `${header}\n      ${translatedBody}\n    )`;
  const constraintSql = foreignKeys.map((fk, index) => {
    const columnKey = safeIdentifier(fk.columns.split(',')[0]);
    const name = `fk_${block.table}_${columnKey}_${index + 1}`.slice(0, 60);
    const suffix = fk.suffix.replace(/\s+/g, ' ');
    return `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${name}') THEN
        ALTER TABLE ${block.rawTable} ADD CONSTRAINT ${name} FOREIGN KEY (${fk.columns}) REFERENCES ${fk.refTable} (${fk.refColumns}) ${suffix} DEFERRABLE INITIALLY IMMEDIATE;
      END IF;
    END $$`;
  }).join(';\n');
  return { createSql, constraintSql };
}

function translateSchema(sql) {
  const blocks = extractCreateTableBlocks(sql);
  if (!blocks.length) return null;
  let cursor = 0;
  let main = '';
  const constraints = [];
  for (const block of blocks) {
    main += sql.slice(cursor, block.start);
    const translated = translateCreateTableBlock(block);
    main += translated.createSql + ';';
    if (translated.constraintSql) constraints.push(translated.constraintSql);
    cursor = block.end;
  }
  main += sql.slice(cursor);
  main = main.replace(/PRAGMA\s+[^;]+;?/ig, '');
  main = main.replace(/\bBEGIN\s+IMMEDIATE\b/ig, 'BEGIN');
  return `${main}\n${constraints.join(';\n')}`;
}

function translateSql(sql, { schema = false } = {}) {
  if (typeof sql !== 'string') throw new TypeError('A consulta SQL precisa ser texto.');
  const pragma = translatePragma(sql);
  if (pragma) return translateQuestionPlaceholders(pragma);

  let translated = schema ? (translateSchema(sql) || sql) : sql;
  translated = translateSqliteMaster(translated);
  translated = translateInsertOrReplace(translated);
  translated = translateInsertOrIgnore(translated);
  translated = translateDateFunctions(translated);
  translated = translateJsonAggregates(translated);
  translated = translated.replace(/\bALTER\s+TABLE\s+([\w\"]+)\s+ADD\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*_id|id)\s+INTEGER\b/ig, 'ALTER TABLE $1 ADD COLUMN $2 BIGINT');
  translated = translated.replace(/\bBEGIN\s+IMMEDIATE\b/ig, 'BEGIN');
  translated = translated.replace(/([a-zA-Z_][a-zA-Z0-9_."]*)\s+COLLATE\s+NOCASE/ig, 'LOWER($1)');
  translated = replaceKeywordOutsideQuotes(translated, 'LIKE', 'ILIKE');
  translated = translated.replace(/\bVACUUM\s*;?\s*$/ig, 'VACUUM');
  translated = translated.replace(/PRAGMA\s+[^;]+;?/ig, '');
  translated = translateQuestionPlaceholders(translated);
  return translated.trim() || 'SELECT 1';
}

module.exports = {
  translateSql,
  translateQuestionPlaceholders,
  translateSchema,
};
