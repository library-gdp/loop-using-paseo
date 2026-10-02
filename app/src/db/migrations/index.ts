import { Baseline1790000000000 } from "./1790000000000-baseline.js";

/**
 * 적용 순서대로 나열한다. 새 마이그레이션은 더 큰 타임스탬프로 만들어 끝에 추가한다.
 * (glob이 아니라 import로 등록해야 tsx 실행과 dist 실행에서 똑같이 불러온다.)
 */
export const migrations = [Baseline1790000000000];
