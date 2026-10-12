// 보충 확인: 프로덕션 리포지토리(TypeORM)로 읽은 labels 값. simple-array 컬럼의 원시 값과 대조한다.
import { loadApp, openDataSource } from "./common.mjs";

const app = await loadApp();
const { dataSource } = await openDataSource(app);
const rows = await dataSource.getRepository("Issue").find({ order: { id: "ASC" } });
console.log("LABELS_VIA_TYPEORM", JSON.stringify(rows.map((r) => ({ issueId: r.issueId, labels: r.labels }))));
await dataSource.destroy();
