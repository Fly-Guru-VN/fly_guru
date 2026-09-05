// Изолированная PostgreSQL, без DATABASE_URL/.env и доступа к рабочей БД.
// FLYGURU_TEST_PG_PACKAGE — абсолютный путь к embedded-postgres/dist/index.js,
// установленному во временную папку; в зависимости приложения он не входит.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const packagePath = process.env.FLYGURU_TEST_PG_PACKAGE;
if (!packagePath) throw new Error("Укажите FLYGURU_TEST_PG_PACKAGE: см. docs/security-fixes-0055-0057.md");
const { default: EmbeddedPostgres } = await import(pathToFileURL(packagePath).href);

test("security migrations: чистая БД, RLS, телефоны и конкурентное списание", async (t) => {
  const databaseDir = await mkdtemp(join(tmpdir(), "flyguru-security-db-"));
  const pg = new EmbeddedPostgres({
    databaseDir, user: "postgres", password: randomUUID(), port: 55439,
    persistent: true, // Ничего рекурсивно не удаляем; при сбое БД доступна для разбора.
    postgresFlags: ["-h", "127.0.0.1", "-k", databaseDir],
    onLog: () => {}, onError: (error) => console.error(error),
  });
  const connections = [];
  let started = false;
  async function connect() {
    const c = pg.getPgClient("postgres", "127.0.0.1");
    await c.connect();
    connections.push(c);
    return c;
  }
  try {
    await pg.initialise();
    await pg.start();
    started = true;
    const db = await connect();
    // Минимальная инфраструктура Supabase; таблицы/политики самого проекта
    // создаются исключительно настоящими миграциями, без подмены их SQL.
    await db.query(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      grant usage on schema auth to anon, authenticated, service_role;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean);
      create publication supabase_realtime;
    `);
    const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(await readFile(new URL(file, migrationsDir), "utf8"));
    }
    await db.query(await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"));
    await db.query(`grant usage on schema public to anon, authenticated, service_role;
      grant all on all tables in schema public to anon, authenticated, service_role;
      grant all on all sequences in schema public to anon, authenticated, service_role;`);
    assert.equal((await db.query("select count(*) from services")).rows[0].count, "13");

    const users = {};
    for (const role of ["admin", "dev", "instructor", "mechanic", "smm", "member"]) {
      users[role] = randomUUID();
      await db.query("insert into users(id,auth_id,role,name) values($1,$1,$2::text::user_role,$2::text)", [users[role], role]);
    }
    const clientId = randomUUID();
    await db.query("insert into clients(id,name,phone,source) values($1,'Клиент','+84 90 123 45 67','offline')", [clientId]);
    async function asRole(role, authId, sql, args = []) {
      assert.ok(["authenticated", "anon", "service_role"].includes(role));
      await db.query("begin");
      try {
        await db.query(`set local role ${role}`);
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [authId ?? ""]);
        const result = await db.query(sql, args);
        await db.query("commit");
        return result;
      } catch (error) { await db.query("rollback"); throw error; }
    }

    await t.test("JWT сотрудников не может писать занятия, заявки механика и расходы напрямую", async () => {
      await assert.rejects(asRole("authenticated", users.instructor,
        "insert into sessions(date,amount,instructor_id,created_by) values(current_date,0,$1,$1)", [users.instructor]), /row-level security/);
      await assert.rejects(asRole("authenticated", users.mechanic,
        "insert into bookings(client_name,phone) values('Подмена','123456789')"), /row-level security/);
      for (const role of ["instructor", "mechanic", "smm"]) {
        await assert.rejects(asRole("authenticated", users[role],
          "insert into expenses(date,amount,created_by) values(current_date,100,$1)", [users[role]]), /row-level security/);
        const id = randomUUID();
        await asRole("service_role", null, "insert into expenses(id,date,amount,created_by) values($1,current_date,100,$2)", [id, users[role]]);
        assert.equal((await asRole("authenticated", users[role], "delete from expenses where id=$1", [id])).rowCount, 0);
      }
      await asRole("authenticated", users.admin, "insert into expenses(date,amount) values(current_date,1)");
      await assert.rejects(db.query("insert into expenses(date,amount) values(current_date,-1)"), /expenses_amount_positive/);
      await assert.rejects(db.query("insert into sessions(date,minutes_used) values(current_date,-10)"), /sessions_minutes_positive/);
      await assert.rejects(db.query("insert into sessions(date,amount) values(current_date,-1)"), /sessions_amount_nonnegative/);
    });

    await t.test("полный телефон: форматирование, разные страны, дубликаты, больше 1000 клиентов", async () => {
      for (const phone of ["84901234567", "+84 (90) 123-45-67", "0084901234567", "0901234567"]) {
        assert.equal((await db.query("select member_phone_key($1) as key", [phone])).rows[0].key, "84901234567");
        assert.equal((await asRole("service_role", null, "select * from find_member_client_by_phone($1)", [phone])).rows[0].id, clientId);
      }
      assert.equal((await db.query("select * from find_member_client_by_phone('+7 990 123 45 67')")).rowCount, 0);
      for (const phone of ["", "123", "+0901234567", "abc84901234567", "++84901234567"]) {
        assert.equal((await db.query("select member_phone_key($1) as key", [phone])).rows[0].key, null);
      }
      await db.query("insert into clients(name,phone,source) select 'Без телефона',null,'offline' from generate_series(1,1100)");
      await db.query("insert into clients(name,phone,source) values('Вторая страна','+7 990 123 45 67','offline')");
      assert.equal((await db.query("select * from find_member_client_by_phone('79901234567')")).rows[0].name, "Вторая страна");
      await db.query("insert into clients(name,phone,source) values('Дубликат','0901234567','offline')");
      assert.equal((await db.query("select * from find_member_client_by_phone('84901234567')")).rowCount, 2);
      await assert.rejects(asRole("authenticated", users.instructor, "select * from find_member_client_by_phone('84901234567')"), /permission denied/);
    });

    async function subscription(minutes = 60, status = "active", expired = false) {
      const id = randomUUID();
      await db.query(`insert into subscriptions(id,client_id,total_minutes,status,expires_at)
        values($1,$2,$3,$4, now() + case when $5 then interval '-1 day' else interval '1 day' end)`,
      [id, clientId, minutes, status, expired]);
      return id;
    }
    const debitSql = `select * from write_off_subscription($1,$2,
      timezone('Asia/Ho_Chi_Minh',now())::date,$3,$4,null)`;
    const debitArgs = (id, minutes, actor = users.instructor) => [id, minutes, actor, actor];

    await t.test("списание отклоняет истёкшие, отменённые и исчерпанные абонементы", async () => {
      for (const [status, expired] of [["active", true], ["expired", false], ["cancelled", false], ["used_up", false]]) {
        const id = await subscription(60, status, expired);
        await assert.rejects(asRole("service_role", null, debitSql, debitArgs(id, 10, users.admin)), /не активен или истёк/);
        assert.equal((await db.query("select count(*) from sessions where subscription_id=$1", [id])).rows[0].count, "0");
      }
    });

    await t.test("корректировки входят в остаток; офисные роли и инструктор могут списывать", async () => {
      for (const role of ["admin", "dev", "smm", "instructor"]) {
        const id = await subscription();
        await db.query("insert into subscription_adjustments(subscription_id,delta_minutes,comment) values($1,-15,'Сверка')", [id]);
        const result = await asRole("service_role", null, debitSql, debitArgs(id, 40, users[role]));
        assert.equal(result.rows[0].left_minutes, "5");
      }
    });

    await t.test("RPC закрыт для JWT; повторно проверяет роль, увольнение и автора инструктора", async () => {
      const id = await subscription();
      await assert.rejects(asRole("authenticated", users.instructor, debitSql, debitArgs(id, 10)), /permission denied/);
      await assert.rejects(asRole("anon", null, debitSql, debitArgs(id, 10)), /permission denied/);
      await assert.rejects(asRole("service_role", null, debitSql, debitArgs(id, 10, users.mechanic)), /Нет доступа/);
      await assert.rejects(asRole("service_role", null, debitSql, [id, 10, users.admin, users.instructor]), /от своего имени/);
      await db.query("update users set left_at=timezone('Asia/Ho_Chi_Minh',now())::date where id=$1", [users.instructor]);
      await assert.rejects(asRole("service_role", null, debitSql, debitArgs(id, 10)), /Нет доступа/);
      await db.query("update users set left_at=null where id=$1", [users.instructor]);
    });

    await t.test("два соединения: из 60 минут два списания по 40 пропускают только одно", async () => {
      const id = await subscription();
      const first = await connect();
      const second = await connect();
      await first.query("begin");
      assert.equal((await first.query(debitSql, debitArgs(id, 40))).rows[0].left_minutes, "20");
      let settled = false;
      const pending = second.query(debitSql, debitArgs(id, 40, users.admin))
        .then(() => { settled = true; return null; }, (error) => { settled = true; return error; });
      try {
        let blocked = false;
        for (let i = 0; i < 100 && !settled; i++) {
          const activity = await db.query("select wait_event_type from pg_stat_activity where pid=$1", [second.processID]);
          if (activity.rows[0]?.wait_event_type === "Lock") { blocked = true; break; }
          await delay(10);
        }
        assert.ok(blocked, "второе соединение должно ждать блокировку абонемента");
      } finally { await first.query("commit"); }
      assert.match((await pending)?.message ?? "", /Остаток 20 мин/);
      assert.equal((await db.query("select sum(minutes_used) from sessions where subscription_id=$1", [id])).rows[0].sum, "40");
      assert.equal((await db.query(debitSql, debitArgs(id, 20))).rows[0].left_minutes, "0");
      assert.equal((await db.query("select status from subscriptions where id=$1", [id])).rows[0].status, "used_up");
    });

    await t.test("ошибка обновления статуса откатывает и вставленное списание", async () => {
      const id = await subscription(30);
      await db.query(`create function test_reject_status() returns trigger language plpgsql as
        $$ begin raise exception 'test status failure'; end $$;
        create trigger test_reject_status before update on subscriptions
        for each row execute function test_reject_status();`);
      try {
        await assert.rejects(db.query(debitSql, debitArgs(id, 30)), /test status failure/);
        assert.equal((await db.query("select count(*) from sessions where subscription_id=$1", [id])).rows[0].count, "0");
      } finally { await db.query("drop trigger test_reject_status on subscriptions; drop function test_reject_status()"); }
    });
  } finally {
    await Promise.allSettled(connections.map((c) => c.end()));
    if (started) await pg.stop();
    console.log(`Тестовая БД остановлена; временные данные: ${databaseDir}`);
  }
});
