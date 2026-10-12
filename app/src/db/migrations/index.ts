import { InitialSchema1791802800000 } from "./1791802800000-InitialSchema.js";

/**
 * `DB_SYNCHRONIZE=false`일 때 기동하면서 적용하는 마이그레이션. 새 마이그레이션은 끝에 추가한다.
 *
 * 마이그레이션은 현재 엔티티로 synchronize된 DB에 적용해도 실패하지 않게 쓴다
 * (`IF NOT EXISTS` 등). synchronize로 돌던 DB를 나중에 전환하면 그때까지의
 * 마이그레이션이 모두 미적용으로 실행되기 때문이다.
 */
export const migrations = [InitialSchema1791802800000];
