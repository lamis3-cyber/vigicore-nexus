#!/usr/bin/env python3
"""
One-shot data copy: SQLite (current dev/prod file) -> empty PostgreSQL database created from
prisma/postgres/migrations (baseline). Safe by construction:
  * the SQLite file is opened READ-ONLY and never modified or deleted;
  * the target must contain the schema and be EMPTY (every table), otherwise it aborts;
  * everything is inserted in ONE transaction and row counts are compared per table before COMMIT;
    any difference or error => ROLLBACK, nothing is left in PostgreSQL.
Usage:  python3 migrate_sqlite_to_postgres.py --sqlite prisma/dev.db --pg "postgresql://user:pass@host/db" [--dry-run]
Requires: pip install "psycopg[binary]"
"""
import argparse, datetime as dt, json, sqlite3, sys
import psycopg

p = argparse.ArgumentParser()
p.add_argument('--sqlite', required=True); p.add_argument('--pg', required=True); p.add_argument('--dry-run', action='store_true')
a = p.parse_args()

src = sqlite3.connect(f'file:{a.sqlite}?mode=ro', uri=True); src.row_factory = sqlite3.Row
pg = psycopg.connect(a.pg, autocommit=False)
cur = pg.cursor()

pg_tables = [r[0] for r in cur.execute("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations'")]
lite_tables = [r[0] for r in src.execute("select name from sqlite_master where type='table' and name not like '\\_%' escape '\\' and name<>'sqlite_sequence'")]
missing = sorted(set(lite_tables) - set(pg_tables))
if missing: sys.exit(f'ABORT: tables missing in PostgreSQL (apply the baseline migration first): {missing}')

non_empty = [t for t in pg_tables if cur.execute(f'select exists(select 1 from "{t}")').fetchone()[0]]
if non_empty: sys.exit(f'ABORT: target is not empty ({non_empty}). Nothing was written.')

# columns: name -> pg type (udt)
coltypes = {}
for t, c, dtp, udt in cur.execute("select table_name, column_name, data_type, udt_name from information_schema.columns where table_schema='public'"):
    coltypes.setdefault(t, {})[c] = (dtp, udt)

# FK order (parents first)
deps = {t: set() for t in lite_tables}
for t, ref in cur.execute("""select cl.relname, cf.relname from pg_constraint c join pg_class cl on cl.oid=c.conrelid
                             join pg_class cf on cf.oid=c.confrelid where c.contype='f'"""):
    if t in deps and ref in deps and ref != t: deps[t].add(ref)
order, done = [], set()
while len(order) < len(deps):
    ready = sorted(t for t in deps if t not in done and deps[t] <= done)
    if not ready: sys.exit(f'ABORT: cyclic foreign keys among {sorted(set(deps)-done)}')
    for t in ready: order.append(t); done.add(t)

def conv(v, dtp, udt):
    if v is None: return None
    if dtp.startswith('timestamp'):
        if isinstance(v, (int, float)): return dt.datetime.fromtimestamp(v / 1000, dt.timezone.utc).replace(tzinfo=None)  # Prisma/SQLite: ms epoch
        return dt.datetime.fromisoformat(str(v).replace('Z', '')).replace(tzinfo=None)
    if dtp == 'boolean': return bool(v)
    if udt in ('json', 'jsonb'): return psycopg.types.json.Jsonb(json.loads(v) if isinstance(v, str) else v)
    return v

counts = {}
try:
    for t in order:
        cols = [r[1] for r in src.execute(f'pragma table_info("{t}")')]
        rows = src.execute(f'select * from "{t}"').fetchall()
        counts[t] = len(rows)
        if not rows: continue
        ph = ', '.join(['%s'] * len(cols))
        sql = f'insert into "{t}" ({", ".join(chr(34)+c+chr(34) for c in cols)}) values ({ph})'
        for r in rows:
            cur.execute(sql, [conv(r[c], *coltypes[t][c]) for c in cols])
    for t in order:
        n = cur.execute(f'select count(*) from "{t}"').fetchone()[0]
        if n != counts[t]: raise RuntimeError(f'row count mismatch in {t}: sqlite={counts[t]} pg={n}')
    if a.dry_run: pg.rollback(); print('DRY RUN OK (rolled back):', {k: v for k, v in counts.items() if v})
    else: pg.commit(); print('MIGRATION COMMITTED:', {k: v for k, v in counts.items() if v})
except Exception as e:
    pg.rollback(); sys.exit(f'ROLLED BACK, PostgreSQL left empty: {e}')
