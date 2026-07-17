# Message Hub — GiftZone

Portal trung tâm gửi tin/thông báo đa kênh (Zalo/ZBS, SMS, Telegram, LINE, WhatsApp, Email) với failover engine tự động chuyển kênh khi gửi thất bại.

**Stack**: NestJS (`message-hub-backend/apps/api`, `message-hub-backend/apps/worker`) + Next.js 14 App Router (`message-hub-frontend`) + PostgreSQL + Redis/BullMQ. 2 folder độc lập ở root, mỗi folder tự chạy Docker Compose riêng (`cd message-hub-backend && docker compose up -d`, `cd message-hub-frontend && docker compose up -d`) — tách để push/deploy lên server độc lập nhau, xem `.claude/rules/tech-defaults.md` mục Docker.

**Cấu trúc chính**:
```
message-hub-backend/
  apps/api/src/modules/{channels,templates,contacts,failover-policies,message-requests,campaigns,webhooks,analytics,auth,audit-log,alerts,realtime,organizations}
  apps/worker/src/processors/{dispatch,attempt,timeout-check,webhook-in}.processor.ts
  libs/domain/src/entities        — TypeORM entities
  libs/adapters/src/{zbs,sms,telegram,line,whatsapp,email,mock}  — ChannelAdapter implementations
  libs/failover/src/failover-engine.service.ts  — state machine cốt lõi
  package.json (npm workspaces: apps/*, libs/*) — không còn gồm frontend
message-hub-frontend/
  app/{channels,templates,contacts,failover-policies,campaigns,messages,analytics,audit-log}  — standalone Next.js, không phụ thuộc libs/ backend
```

Adapter pattern là seam duy nhất: thêm channel/provider mới = viết 1 class implement `ChannelAdapter` (`message-hub-backend/libs/adapters/src/channel-adapter.interface.ts`) + đăng ký trong `message-hub-backend/libs/adapters/src/adapters.module.ts`. Không đụng core (`FailoverEngineService` chỉ biết registry, không import adapter cụ thể). Quy trình chi tiết: `.claude/skills/add-channel-adapter/SKILL.md`.

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

**Webhook delivery-status thật cho Zalo ZNS (session này, 2026-07-09)**:
- Research xác nhận: Zalo ZNS (`zbs_phone`) có webhook callback delivery thật; Zalo OA (`zbs_uid`) chưa xác nhận được; Telegram/LINE là platform limitation thật, không hỗ trợ.
- Implement `parseWebhook` cho `zbs_phone` + route `POST /webhooks/zns/:channelId` — chưa verify với callback thật (chưa có tài khoản ZNS live), field name dựng từ docs bên thứ 3.

**Tracking (view/click) + Campaign Insights dashboard (session này, 2026-07-10)**:
- Entity `TrackingEvent` (view/click, FK → message_attempts) + `Campaign.campaignType` (voucher/loyalty/reward/other). Endpoint public `GET /t/o/:attemptId` (open-pixel) + `GET /t/c/:attemptId?u=` (click redirect) — IP luôn hash SHA-256, không lưu raw IP.
- Tự động wrap link + chèn open-pixel (email) trong `FailoverEngineService` khi env `PUBLIC_API_URL` có set — no-op nếu không set.
- `GET /analytics/campaigns` + `/analytics/campaigns/summary` — sent/delivered/opened/clicked/rate theo campaign, filter theo loại + ngày.
- Seed demo (`npm run seed:demo` trong `apps/api`) — 18 campaign giả (6 mỗi loại), ~5,165 request/attempt, insert thẳng DB (không qua BullMQ thật).
- Trang mới `/analytics/campaigns` ("Campaign Insights") — KPI tile, breakdown theo loại, funnel, trend chart, bảng top campaign (dùng `recharts`).
- Làm qua 2 subagent song song (backend + frontend) — cả 2 tự báo "đã verify xong" nhưng bar chart breakdown thực ra render rỗng (Recharts v3 animation bug, thiếu `isAnimationActive={false}`) — session tự phát hiện qua đọc DOM SVG trực tiếp, đã fix. Chi tiết `.claude/memory.md` mục 2026-07-10.

**Redesign Campaign Insights bằng Shadcn UI + time range/status filter (session này, 2026-07-11)**:
- Thêm Tailwind v3.4 (`corePlugins.preflight: false` bắt buộc — app khác không dùng Tailwind, `globals.css` chung cho toàn app) + component Shadcn (card/button/badge/table/select/popover/calendar/chart/tabs/skeleton/tooltip/separator).
- Time range picker (preset 7/30/90 ngày + custom range) — backend đổi `from`/`to` từ lọc theo ngày tạo campaign sang lọc theo **thời điểm gửi thật** (`message_requests.createdAt`) để filter đúng nghĩa.
- Filter trạng thái campaign (mới, cùng với filter loại đã có) — `byStatus` breakdown mới trong `/analytics/campaigns/summary`.
- Thêm chart: breakdown theo trạng thái (donut), scatter openRate×clickRate từng campaign, spotlight "xuất sắc nhất"/"cần chú ý", bảng sort được theo cột.
- Agent tự tìm + fix 3 bug không nằm trong brief: `shadcn add chart` âm thầm hạ version `recharts`, CSS shorthand cũ (`button { background: ... }`) đè xuyên qua mọi component shadcn (chỉ thấy qua soi DOM, không thấy qua screenshot), cache `.next` hỏng khi build lúc dev server đang chạy. Chi tiết `.claude/memory.md` mục 2026-07-11.
- Session tự verify lại độc lập sau khi agent báo xong (đếm path/rect thật trong SVG, test time range đổi số liệu thật, soi trang Channels/Templates không bị Tailwind phá).

**Deploy lần đầu lên server thật — staging chung với các app khác của công ty (session này, 2026-07-14)**:
- Đăng nhập server qua SSH bằng username/password do tech lead cấp (không dùng SSH key cho việc này), deploy key riêng tạo trên server cho GitHub (không dùng credential cá nhân của user), cài `docker-compose-plugin` + `docker-buildx-plugin` trên server (ban đầu chỉ có Docker Engine trơn).
- Fix 3 lớp bug hạ tầng liên tiếp, không cái nào liên quan tới code app: (1) npm "Exit handler never called!" khiến `npm ci` báo thành công nhưng cài dở `node_modules` — pin `npm@10.9.2` trong cả 3 Dockerfile; (2) DNS trong container bị chặn hoàn toàn (`EAI_AGAIN`) — hoá ra do `ufw` `deny (routed)` chặn mọi traffic ra ngoài từ container chứ không phải sai DNS server — né bằng `network: host` cho `build:` trong `docker-compose.yml`; (3) port mặc định (3001/3000) trùng/không được phép trên server dùng chung nhiều app công ty — đổi sang dải `40xx` (4011 api / 4001 frontend) theo xác nhận của tech lead.
- Toàn bộ stack đã chạy đúng trên server (5 container, migration tự áp dụng, CORS đúng, login được) — nghẽn cloud firewall (port 4001/4011) đã được tech lead mở, **truy cập được từ ngoài internet**. Bug pattern kỹ thuật (npm/DNS/ufw) đã ghi vào `.claude/memory.md` mục 2026-07-14 để tái sử dụng khi deploy server khác.
- **Gắn domain thật (2026-07-17)**: `message-hub.giftzone.vn` (FE) + `message-hub-api.giftzone.vn` (BE), route qua reverse proxy 443 chung của tech lead → vẫn trỏ vào cùng container `4001`/`4011`. Sau khi gắn domain, đăng nhập lỗi vì `NEXT_PUBLIC_API_URL` vẫn còn trỏ IP:port cũ — biến này bake thẳng vào bundle Next.js lúc **build**, đổi `.env` không đủ, phải rebuild lại frontend image mới áp dụng. Đã sửa `NEXT_PUBLIC_API_URL`/`FRONTEND_URL` sang domain https, rebuild, xác nhận login được.

**Dọn UI + gộp module (session này, 2026-07-17)**:
- Xoá hẳn tab/trang Messages (không còn dùng — kể cả `ws-client.ts`/dependency `socket.io-client` không ai import nữa, đã gỡ khỏi `package.json`).
- Gộp `/analytics` (channel delivery-rate + alerts) vào `/analytics/campaigns` làm tab thứ 2 ("Channels & Alerts") bằng shadcn `Tabs` — nav chỉ còn 1 mục "Analytics" duy nhất thay vì 2.
- Phát hiện + fix bug UI thật do user báo (không phải chỉ theo yêu cầu gộp module): nav topbar tràn ngang toàn trang ở độ rộng laptop phổ biến (1024–1360px, kể cả 1280/1366 rất thường gặp) vì `.gz-nav-links` không có `flex-wrap` và breakpoint hamburger cũ (860px) quá thấp so với tổng bề rộng nav thật (~1390px với đủ nav link + Audit Log + user chip + Logout) — đo bằng `scrollWidth` vs `clientWidth` thật, không đoán. Fix: `flex-wrap: wrap` cho nav thay vì đoán lại breakpoint, tự thích ứng nếu sau này thêm/bớt tab. Đồng thời phát hiện `TabsTrigger` (component `Tabs` mới thêm) bị tái phát đúng bug CSS-shorthand-đè-shadcn đã ghi ở 2026-07-11 (thiếu `bg-none`/`shadow-none`) — đã fix. Chi tiết đầy đủ: `.claude/memory.md` mục 2026-07-17.

---

## 2. Trạng thái hiện tại của từng phần

| Phần | Trạng thái |
|---|---|
| Core send + failover engine | Hoạt động, có test (`libs/failover` 14 test, `libs/shared` 12 test) |
| 6 channel adapter + mock | Code xong, **chưa có tài khoản provider thật nào** để test end-to-end (task #39, đang chờ user) |
| Channels page (CRUD, mask secret) | Hoàn thành, đã verify qua UI thật |
| Templates page v2 | Hoàn thành, đã commit + push lên `main` |
| Webhook Zalo/Telegram/LINE — opt-in capture | **Xong** — webhook riêng cho từng kênh (`/webhooks/telegram/:channelId`, `/webhooks/zbs/:channelId`, `/webhooks/line/:channelId`) tự gắn chat_id/uid/user_id vào Contact khi user nhắn trước; UI Contacts có nút tạo invite link |
| Webhook delivery status — Zalo ZNS (`zbs_phone`) | **Xong (2026-07-09)** — `parseWebhook` thật + route `POST /webhooks/zns/:channelId`, đã verify route map + smoke test. **Chưa verify với callback thật** (chưa có tài khoản ZNS live) — field name dựng từ docs bên thứ 3 vì docs chính chủ Zalo là SPA JS không đọc được. Chi tiết `.claude/memory.md` mục 2026-07-09. |
| Webhook delivery status — Zalo OA (`zbs_uid`) | **Chưa xác nhận được** platform có hỗ trợ hay không (docs không fetch được) — `parseWebhook` vẫn stub trả `null`, giữ `advance_on = provider_error`. |
| Webhook delivery status — Telegram/LINE | **Platform không hỗ trợ** (xác nhận qua docs chính thức) — không đầu tư thêm, giữ `advance_on = provider_error` vĩnh viễn. Email SMTP thuần cũng không có cơ chế bounce webhook, tương tự. |
| WhatsApp submit-template API | Viết theo docs công khai của Meta, **chưa verify với WABA thật** |
| Code review Templates v2 | Hoàn tất — 10 finding, 8 fix / 2 skip có lý do, đã report qua `ReportFindings` |
| Docker stack local | Migration mới nhất (`AddTrackingAndCampaignType`) đã apply |
| `.claude/` config structure | Xong (session này) — rules/, memory.md, agents/, skills/ |
| Tracking view/click + Campaign Insights dashboard | **Xong (2026-07-10)** — backend (entity/endpoint/wiring/analytics/seed) + frontend (`/analytics/campaigns`) đã verify qua preview thật với dữ liệu demo thật. Bug Recharts bar-chart-rỗng đã fix. **Chưa test wrap-link/open-pixel với kênh thật** (chỉ verify no-op khi `PUBLIC_API_URL` chưa set + unit test cũ vẫn pass) — cần thử với 1 send thật (vd mock hoặc email) khi có nhu cầu. |
| Redesign Campaign Insights — Shadcn UI + time range/status filter | **Xong (2026-07-11)** — Tailwind v3 (`preflight: false`) + shadcn component, time range picker lọc theo hoạt động thật, filter status, thêm chart (status donut, scatter, spotlight). Đã verify độc lập (đếm path/rect SVG thật, test filter đổi số liệu thật, xác nhận trang khác không bị Tailwind phá). Chi tiết `.claude/memory.md` mục 2026-07-11. |
| Deploy staging server (103.245.255.126, dùng chung công ty) | **Xong — truy cập được từ ngoài internet qua domain thật** (`message-hub.giftzone.vn`/`message-hub-api.giftzone.vn`, HTTPS qua reverse proxy chung của tech lead). Chi tiết đầy đủ: `CLAUDE.local.md`. |
| Nav topbar + module UI | **Xong (2026-07-17)** — bỏ tab Messages, gộp Analytics vào Campaign Insights (2 tab trong 1 trang), fix nav tràn ngang ở laptop width (`flex-wrap`) + fix `TabsTrigger` bị CSS cũ đè. Đã verify qua preview thật ở nhiều breakpoint (mobile/laptop/desktop). Chi tiết `.claude/memory.md` mục 2026-07-17. |

---

## 3. Bước tiếp theo cần làm

1. Khi user có tài khoản provider thật (VietGuys, Zalo OA/ZNS, WhatsApp WABA...): verify lại toàn bộ send flow, đặc biệt WhatsApp `submitTemplate` (chưa test thật), Zalo token refresh, **và re-check field name của ZNS webhook callback** (`ZbsPhoneAdapter.parseWebhook`) đối chiếu `rawPayload` thật lưu trong `webhook_events` — hiện dựng từ docs bên thứ 3, chưa có callback thật để xác nhận.
2. ~~Implement webhook delivery-status thật cho Zalo/Telegram/LINE~~ — **Xong một phần (2026-07-09)**: ZNS (`zbs_phone`) đã implement (route `/webhooks/zns/:channelId`, chưa verify callback thật). Zalo OA (`zbs_uid`) vẫn chưa xác nhận được platform có hỗ trợ không. Telegram/LINE xác nhận là platform limitation thật — không làm nữa. Chi tiết `.claude/memory.md`.
3. ~~Audit toàn bộ failover policy đang active theo bug pattern "advance_on sai"~~ — **Xong (2026-07-08)**: tìm thấy 2 policy ("Gmail", "ZBS") vẫn còn bug dù đã "phát hiện" trước đó nhưng chưa thực sự fix trong DB — đã sửa, verify lại toàn bộ 5 policy active đều đúng. Chi tiết: `.claude/memory.md`.
4. ~~Tracking view/click + Campaign Insights dashboard~~ — **Xong (2026-07-10)**. Việc còn lại nếu cần: thử wrap-link/open-pixel với 1 send thật (mock hoặc email) để xác nhận link/pixel thật sự chèn đúng vào nội dung gửi đi, hiện mới verify no-op path + unit test.
5. ~~Redesign Campaign Insights bằng Shadcn UI~~ — **Xong (2026-07-11)**.
6. ~~Deploy staging server — chờ tech lead mở port firewall~~ — **Xong**: tech lead đã mở, server truy cập được từ ngoài internet.
7. ~~Xin domain + HTTPS thật~~ — **Xong (2026-07-17)**: `message-hub.giftzone.vn` (FE) + `message-hub-api.giftzone.vn` (BE), route qua reverse proxy 443 chung của tech lead.
8. ~~Xoá module Messages, gộp Analytics vào Campaign Insights~~ — **Xong (2026-07-17)**. Việc còn lại nếu phát sinh nữa: theo dõi xem nav topbar có tràn lại không nếu thêm tab mới trong tương lai (đã có `flex-wrap` phòng ngừa, nhưng chưa test với >8 mục).

---

## 4. Quyết định quan trọng và lý do

Đã chuyển toàn bộ nội dung mục này sang `.claude/rules/design.md` (nguyên tắc kiến trúc bền vững) và `.claude/memory.md` (log bug/quyết định theo thời gian, kèm ngày). Đọc 2 file đó thay vì mục này — tránh 2 nguồn dữ liệu lệch nhau theo thời gian.
