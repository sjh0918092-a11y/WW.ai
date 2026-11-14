import { DatabaseSync } from "node:sqlite";
// 실제 SQLite 트랜잭션·JSON·트리거로 D1 저장 조건을 검사한다.
export class D1 {
  constructor() { this.sqlite = new DatabaseSync(":memory:"); }
  prepare(sql) {
    const result = { sql, args: [], bind(...args) { return { ...result, args }; } };
    result.first = async () => this.sqlite.prepare(sql).get(...result.args) || null;
    const decorate = st => ({ ...st, bind: (...args) => decorate({ ...st, args }),
      first: async () => this.sqlite.prepare(sql).get(...st.args) || null,
      all: async () => ({ results: this.sqlite.prepare(sql).all(...st.args) }),
      run: async () => ({ success: true, meta: this.sqlite.prepare(sql).run(...st.args) }),
    });
    return decorate(result);
  }
  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const out = statements.map(s => {
        const st = this.sqlite.prepare(s.sql);
        return /^\s*SELECT/i.test(s.sql) ? { results: st.all(...s.args), success: true } : { results: [], success: true, meta: st.run(...s.args) };
      });
      this.sqlite.exec("COMMIT"); return out;
    } catch (e) { this.sqlite.exec("ROLLBACK"); throw e; }
  }
}
