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

Adapter pattern là seam duy nhất: thêm channel/provider mới = viết 1 class implement `ChannelAdapter` (`libs/adapters/src/channel-adapter.interface.ts`) + đăng ký trong `libs/adapters/src/adapters.module.ts`. Không đụng core (`FailoverEngineService` chỉ biết registry, không import adapter cụ thể).

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

**Template management v2 (vừa xong, CHƯA commit — xem mục 2)**:
- Trang Templates chia tab theo channel type, có Edit/Delete (trước đây chỉ Create+Preview).
- Sync template đã duyệt từ Zalo (`POST /templates/sync/:channelId`) — tự tạo/refresh Template row local từ danh sách provider trả về.
- Submit template mới lên WhatsApp (Meta API thật `POST /{waba_id}/message_templates`) — **chưa test với tài khoản WABA thật**.
- Zalo ZNS: xác nhận không có API submit công khai (chỉ list/sync) — không giả lập tính năng không tồn tại.
- Biến `{{var}}` tự động extract từ body, không cần khai báo tay; nút chèn param nhanh trong UI.
- CSV import: cột ngoài identifier (name, hocphi, ...) giờ được lưu vào `contact.attributes` thay vì bị bỏ — campaign trigger vốn đã map `attributes` → `templateVariables` theo tên trùng khớp, nên param CSV tự động điền đúng mà không cần thêm cơ chế mapping riêng.
- Webhook route mới `POST /webhooks/sms/:channelId` cho `sms_http` (trước đây thiếu hẳn — generic SMS adapter có parseWebhook thật nhưng không có URL nào nhận).

---

## 2. Trạng thái hiện tại của từng phần

| Phần | Trạng thái |
|---|---|
| Core send + failover engine | Hoạt động, có test (`libs/failover` 14 test, `libs/shared` 12 test) |
| 6 channel adapter + mock | Code xong, **chưa có tài khoản provider thật nào** để test end-to-end (task #39, đang chờ user) |
| Channels page (CRUD, mask secret) | Hoàn thành, đã verify qua UI thật |
| Templates page v2 | **Code xong, build/test sạch, đã verify qua Docker + script kiểm tra logic — nhưng đang là uncommitted changes, chưa git commit** |
| Webhook Zalo/Telegram/LINE thật | **Chưa làm** — `parseWebhook()` của 3 adapter này chỉ là stub trả `null` (chờ Phase 3+ theo comment gốc). Email SMTP thuần vốn không có cơ chế bounce webhook. |
| WhatsApp submit-template API | Viết theo docs công khai của Meta, **chưa verify với WABA thật** |
| Code review (đang chạy khi bị dừng) | 7 finder agent đã chạy xong ở effort "high" trên diff hiện tại (uncommitted), nhưng **chưa tổng hợp/verify/report kết quả** — bị user interrupt giữa chừng để chuyển sang việc này |
| Docker stack local | Đang chạy, migration mới nhất (`AddTemplateApprovalFields`) đã apply |

---

## 3. Bước tiếp theo cần làm

1. **Hoàn tất review đang dang dở**: tổng hợp kết quả 7 finder agent (line-by-line, removed-behavior, cross-file, reuse, simplification, efficiency, altitude) → verify từng finding → áp fix nếu hợp lệ, trước khi commit Templates v2.
2. **Commit Templates v2** sau khi review xong (hiện đang là working-tree changes, chưa lên git).
3. Khi user có tài khoản provider thật (VietGuys, Zalo OA/ZNS, WhatsApp WABA...): verify lại toàn bộ send flow, đặc biệt WhatsApp `submitTemplate` (chưa test thật) và Zalo token refresh.
4. Cân nhắc implement webhook thật cho Zalo/Telegram/LINE nếu user cần (hiện chỉ là URL đã có route, không đưa vào scope cho tới khi được yêu cầu rõ).
5. Rà lại các failover policy hiện có: policy nào dùng channel không có webhook thật mà set `advance_on` sai (giống bug "Gmail" đã tìm thấy) sẽ luôn báo `failed` sai — nên audit toàn bộ policy đang active.

---

## 4. Quyết định quan trọng và lý do

- **`channel_type` ≠ adapter**: 1 channel (vd "Zalo OA - Marketing") có thể có nhiều `channel_strategies` trỏ tới các adapter khác nhau dùng chung credential. Lý do: cho phép failover trong cùng 1 provider (vd ZBS UID → ZBS phone) mà không cần tạo channel riêng.
- **Mọi lần gửi đều đi qua 1 failover policy**, kể cả gửi qua đúng 1 kênh (policy 1-step) — không có code path "gửi thẳng channel" riêng biệt, để tránh 2 luồng logic song song dễ lệch hành vi.
- **Secret/credential không bao giờ round-trip plaintext đầy đủ về client**: encrypt at rest (AES-256-GCM), khi hiển thị lại cho edit thì mask 4 ký tự cuối — theo yêu cầu rõ ràng của user, đã hỏi lại để chốt kiểu che (hiện phần lớn, che 4 ký tự cuối) vì đây là quyết định ảnh hưởng bảo mật.
- **Zalo ZNS không có API submit template** — xác nhận qua research thực tế (docs/PROVIDER_SETUP.md + không tìm thấy endpoint nào trong tài liệu Zalo), nên hệ thống chỉ hỗ trợ sync (kéo template đã duyệt qua cổng zns.zalo.me) chứ không giả lập "submit qua API" cho Zalo — tránh xây tính năng dựa trên API không tồn tại.
- **WhatsApp là kênh duy nhất có submitTemplate thật** (Meta có API `POST /{waba_id}/message_templates` công khai) — implement theo docs nhưng đánh dấu rõ "chưa verify" vì chưa có tài khoản WABA thật để test.
- **CSV → template param**: không xây cơ chế mapping cột-CSV-tới-biến-template riêng, vì kiến trúc sẵn có (`campaign.trigger()` dùng `contact.attributes` làm `templateVariables`) đã đủ — chỉ cần sửa 1 chỗ (contacts-import giữ lại cột thừa vào `attributes`) là toàn bộ pipeline tự chạy đúng, tránh xây trùng lặp.
- **Webhook SMS generic dùng URL theo từng channel** (`/webhooks/sms/:channelId`) thay vì 1 URL chung — vì `sms_http` là adapter config-driven, mỗi channel có thể trỏ tới provider khác nhau với payload khác nhau, không thể tự phân biệt như WhatsApp (dùng `phone_number_id` trong payload để match).
- **`isForeignKeyViolation` + deactivate-fallback** là pattern dùng lại nhất quán ở mọi chỗ xoá (channel, strategy, policy, template): thử hard-delete trước, nếu bị FK chặn (Postgres 23503) thì chuyển `isActive=false` thay vì chặn hẳn thao tác xoá của user.
