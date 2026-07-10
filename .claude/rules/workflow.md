# Quy trình làm việc — Message Hub

## Trước khi bắt đầu việc mới
1. Lướt `.claude/memory.md` xem có sự cố/bug pattern nào liên quan tới phần sắp đụng vào không.
2. Lướt `.claude/rules/design.md` + `tech-defaults.md` nếu việc đụng tới failover policy, adapter, secret, hoặc xoá dữ liệu có FK.

## Xác minh trước khi báo "xong"
- Trong `message-hub-backend/`: `npm run build:libs` + build từng app (`apps/api`, `apps/worker` qua `tsc --noEmit`) phải sạch. Trong `message-hub-frontend/`: `npx tsc --noEmit` + `npm run build` phải sạch.
- `libs/failover` + `libs/shared` jest suite (trong `message-hub-backend/`) phải pass.
- Nếu đổi UI: dùng `preview_*` tools chạy thật qua trình duyệt (không bao giờ đăng nhập bằng password thật vào UI — mọi verify với credential thật đi qua script chạy trong container, xem tech-defaults.md).
- Nếu đổi route/webhook mới: grep log Docker xác nhận route đã map (`docker compose logs api | grep <path>`).
- Nếu đổi provider integration: verify với credential thật qua script disposable trong container trước khi báo đã xong (không suy đoán từ đọc docs).

## Review code
Dùng skill `code-review` (7 góc: line-by-line, removed-behavior, cross-file, reuse, simplification, efficiency, altitude) ở effort phù hợp độ lớn diff. Sau khi finder agent trả kết quả: **verify từng finding bằng cách đọc lại code hiện tại** trước khi áp fix — không tin blind theo agent. Report qua `ReportFindings` với `verdict`/`outcome`.

## Vòng lặp tự hoàn thiện (research → review → fix → memory)
1. **Research**: xác định phạm vi cụ thể (1 bug, 1 tính năng, 1 phần code) — không audit toàn repo mơ hồ.
2. **Review**: tìm root cause thật (đọc code, query DB, gọi API thật nếu cần) — không đoán.
3. **Fix**: sửa đúng chỗ, verify lại theo mục "Xác minh trước khi báo xong" ở trên.
4. **Memory**: mọi bug/quyết định không hiển nhiên từ code phải được ghi vào `.claude/memory.md` (what broke, why, fix) — kèm ngày. Nếu là quy tắc sẽ lặp lại (áp dụng cho nhiều chỗ tương lai), promote lên `.claude/rules/tech-defaults.md` hoặc `design.md` thay vì chỉ nằm trong memory log.
5. Session sau đọc lại rules/memory trước khi làm việc mới → vòng lặp khép kín, không lặp lại lỗi cũ.

## Docker local
2 folder độc lập, 2 compose riêng: `cd message-hub-backend && docker compose up -d` (postgres/redis/api/worker) và `cd message-hub-frontend && docker compose up -d` (frontend). Cấu hình server preview trong `.claude/launch.json` (api :3001, worker :3099, frontend :3000).

## Git
Chỉ commit khi user yêu cầu rõ. Không tự ý push trừ khi được yêu cầu. Xem `.claude/rules/tech-defaults.md` mục Git cho convention chi tiết.
