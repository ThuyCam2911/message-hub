# Message Hub — GiftZone

Portal trung tâm gửi tin/thông báo đa kênh (Zalo/ZBS, SMS, Telegram, LINE, WhatsApp, Email) với failover engine tự động chuyển kênh khi gửi thất bại.

**Stack**: NestJS (`apps/api`, `apps/worker`) + Next.js 14 App Router (`frontend`) + PostgreSQL + Redis/BullMQ, monorepo npm workspaces. Chạy local qua Docker Compose (`docker compose up -d`).

**Cấu trúc chính**:
```
apps/api/src/modules/{channels,templates,contacts,failover-policies,message-requests,campaigns,webhooks,analytics,auth,audit-log,alerts,realtime,organizations}
apps/worker/src/processors/{dispatch,attempt,timeout-check,webhook-in}.processor.ts
libs/domain/src/entities        — TypeORM entities
libs/adapters/src/{zbs,sms,telegram,line,whatsapp,email,mock}  — ChannelAdapter implementations
libs/failover/src/failover-engine.service.ts  — state machine cốt lõi
frontend/app/{channels,templates,contacts,failover-policies,campaigns,messages,analytics,audit-log}
```

Adapter pattern là seam duy nhất: thêm channel/provider mới = viết 1 class implement `ChannelAdapter` (`libs/adapters/src/channel-adapter.interface.ts`) + đăng ký trong `libs/adapters/src/adapters.module.ts`. Không đụng core (`FailoverEngineService` chỉ biết registry, không import adapter cụ thể). Quy trình chi tiết: `.claude/skills/add-channel-adapter/SKILL.md`.

**File cấu hình/kiến thức đi kèm** (đọc trước khi làm việc lớn):
@.claude/rules/design.md
@.claude/rules/tech-defaults.md
@.claude/rules/workflow.md

`.claude/memory.md` — log bug/quyết định không hiển nhiên, cập nhật mỗi khi fix xong 1 việc không tầm thường (xem workflow.md mục "Vòng lặp tự hoàn thiện").

---

## 1. Những gì đã hoàn thành

**Core (Phase 1–4, đã merge lên `main`)**:
- Data model đầy đủ: channels/channel_strategies, templates, contacts/contact_identifiers, failover_policies/steps, message_requests/attempts, campaigns, webhook_events, audit_logs, alerts — tất cả scope theo `organization_id` (soft multi-tenant, hiện chỉ 1 default org).
- Failover engine: state machine dựa trên BullMQ + Postgres CAS update (tránh race condition webhook-vs-timeout đến gần đồng thời).
- 6 kênh thật + 1 mock: `zbs_uid`/`zbs_phone` (Zalo, có auto-refresh access token), `sms_http` (generic, config-driven) + `sms_vietguys`, `telegram_default`, `line_push`, `whatsapp_cloud`, `email_smtp`, `mock_default`.
- Auth thật (JWT + RBAC admin/operator/viewer), audit log, CSV import contact, campaign gửi hàng loạt + trang chi tiết, policy builder kéo-thả, dashboard realtime qua WebSocket, analytics + alerting.
- Hạ tầng: Docker Compose (postgres/redis/api/worker/frontend), TypeORM migrations (đã bỏ `synchronize: true`), rate limiting, encryption AES-256-GCM cho credentials.
- Rebrand UI theo nhận diện GiftZone (theme sáng, logo, nav).

**Channels page UX (session gần đây)**:
- CRUD đầy đủ cho channel + strategy (edit/delete, fallback tự động deactivate nếu đang bị FK reference thay vì chặn xoá).
- Form config động theo schema từng adapter (không còn textarea JSON thô), layout dạng lưới ngang.
- Provider template selector khi 1 channelType có nhiều adapter (vd SMS: `sms_http` vs `sms_vietguys`).
- Edit form hiển thị lại giá trị đã lưu — field thường hiện đầy đủ, field secret (password/token) che 4 ký tự cuối bằng `*` (endpoint riêng `GET /channels/:id/config`, admin-only, giải mã + mask phía server, không bao giờ trả plaintext đầy đủ về client).
- Dọn dẹp: bỏ mock khỏi list tạo mới, nút xoá hàng loạt channel test.

**Failover policy**:
- Edit/xoá policy đã tồn tại (fallback deactivate tương tự channel).
- Phát hiện + hướng dẫn sửa bug: policy dùng adapter không có webhook thật (email_smtp, sms chưa cấu hình webhook) mà để `advance_on = either/no_confirmation_timeout` sẽ luôn báo `failed` do timeout dù gửi thành công — đúng ra phải set `provider_error` cho các kênh này.

**Template management v2**:
- Trang Templates chia tab theo channel type, có Edit/Delete (trước đây chỉ Create+Preview).
- Sync template đã duyệt từ Zalo (`POST /templates/sync/:channelId`) — tự tạo/refresh Template row local từ danh sách provider trả về.
- Submit template mới lên WhatsApp (Meta API thật `POST /{waba_id}/message_templates`) — **chưa test với tài khoản WABA thật**.
- Zalo ZNS: xác nhận không có API submit công khai (chỉ list/sync) — không giả lập tính năng không tồn tại.
- Biến `{{var}}` tự động extract từ body, không cần khai báo tay; nút chèn param nhanh trong UI.
- CSV import: cột ngoài identifier (name, hocphi, ...) giờ được lưu vào `contact.attributes` thay vì bị bỏ — campaign trigger vốn đã map `attributes` → `templateVariables` theo tên trùng khớp, nên param CSV tự động điền đúng mà không cần thêm cơ chế mapping riêng.
- Webhook route mới `POST /webhooks/sms/:channelId` cho `sms_http` (trước đây thiếu hẳn — generic SMS adapter có parseWebhook thật nhưng không có URL nào nhận).

**Opt-in capture cho Telegram/Zalo/LINE + cấu trúc `.claude/` (session này)**:
- Telegram: deep-link `/start <contactId>` → webhook tự gắn `chat_id`. Zalo/LINE: webhook match theo text tin nhắn user gửi (contact id) vì không có deep-link payload xác nhận. UI Contacts có nút "Tạo invite link".
- Fix bug nghiêm trọng: strategy-level config override từng bị bỏ qua hoàn toàn ở `FailoverEngineService` + `testStrategyConnection` (chỉ đọc channel-level) — đã fix merge `{...channelConfig, ...strategyConfig}`.
- Fix bug endpoint Zalo `getoa` dùng nhầm v3.0 (404) thay vì v2.0 — khiến "Test connection" cho `zbs_uid` từng luôn fail.
- Dựng `.claude/` (rules/, memory.md, agents/, skills/) làm kho kiến thức chung — xem đầu file.

---

## 2. Trạng thái hiện tại của từng phần

| Phần | Trạng thái |
|---|---|
| Core send + failover engine | Hoạt động, có test (`libs/failover` 14 test, `libs/shared` 12 test) |
| 6 channel adapter + mock | Code xong, **chưa có tài khoản provider thật nào** để test end-to-end (task #39, đang chờ user) |
| Channels page (CRUD, mask secret) | Hoàn thành, đã verify qua UI thật |
| Templates page v2 | Hoàn thành, đã commit + push lên `main` |
| Webhook Zalo/Telegram/LINE — opt-in capture | **Xong** — webhook riêng cho từng kênh (`/webhooks/telegram/:channelId`, `/webhooks/zbs/:channelId`, `/webhooks/line/:channelId`) tự gắn chat_id/uid/user_id vào Contact khi user nhắn trước; UI Contacts có nút tạo invite link |
| Webhook Zalo/Telegram/LINE — delivery status thật | **Chưa làm** — `parseWebhook()` của 3 adapter này vẫn là stub trả `null` (khác với opt-in capture ở trên, đây là xác nhận đã gửi/đã đọc). Email SMTP thuần vốn không có cơ chế bounce webhook. → mọi step dùng 3 adapter này + email phải để `advance_on = provider_error` (xem `.claude/rules/tech-defaults.md`). |
| WhatsApp submit-template API | Viết theo docs công khai của Meta, **chưa verify với WABA thật** |
| Code review Templates v2 | Hoàn tất — 10 finding, 8 fix / 2 skip có lý do, đã report qua `ReportFindings` |
| Docker stack local | Migration mới nhất (`AddTemplateApprovalFields`) đã apply |
| `.claude/` config structure | Xong (session này) — rules/, memory.md, agents/, skills/ |

---

## 3. Bước tiếp theo cần làm

1. Khi user có tài khoản provider thật (VietGuys, Zalo OA/ZNS, WhatsApp WABA...): verify lại toàn bộ send flow, đặc biệt WhatsApp `submitTemplate` (chưa test thật) và Zalo token refresh.
2. Implement webhook delivery-status thật cho Zalo/Telegram/LINE nếu user cần (khác với opt-in capture đã xong — đây là xác nhận đã gửi/đã đọc). Chưa đưa vào scope cho tới khi được yêu cầu rõ.
3. ~~Audit toàn bộ failover policy đang active theo bug pattern "advance_on sai"~~ — **Xong (2026-07-08)**: tìm thấy 2 policy ("Gmail", "ZBS") vẫn còn bug dù đã "phát hiện" trước đó nhưng chưa thực sự fix trong DB — đã sửa, verify lại toàn bộ 5 policy active đều đúng. Chi tiết: `.claude/memory.md`.

---

## 4. Quyết định quan trọng và lý do

Đã chuyển toàn bộ nội dung mục này sang `.claude/rules/design.md` (nguyên tắc kiến trúc bền vững) và `.claude/memory.md` (log bug/quyết định theo thời gian, kèm ngày). Đọc 2 file đó thay vì mục này — tránh 2 nguồn dữ liệu lệch nhau theo thời gian.
