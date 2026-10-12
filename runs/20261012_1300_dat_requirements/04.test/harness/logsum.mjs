// 데몬 JSON 로그에서 판정에 쓰는 필드만 뽑는다: node logsum.mjs <logfile>
import { readFileSync } from "node:fs";

for (const line of readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)) {
  try {
    const j = JSON.parse(line);
    const picked = {};
    for (const key of ["schemaMode", "appliedCount", "applied", "promptVersion", "exitCode"]) {
      if (key in j) picked[key] = j[key];
    }
    if (j.err) picked.err = { type: j.err.type, message: j.err.message };
    console.log(`level=${j.level} msg="${j.msg}" ${JSON.stringify(picked)}`);
  } catch {
    console.log(`(non-json) ${line}`);
  }
}
