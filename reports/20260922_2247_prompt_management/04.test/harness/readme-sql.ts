// README "프롬프트 변경" 절의 SQL을 stdout으로 내보낸다 (psql 표준입력으로 흘려 넣는 용도).
import { readmeSql } from "./common.js";
process.stdout.write(readmeSql());
