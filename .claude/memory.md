# Memory — kho kiến thức chung (Message Hub)

Log các bug/quyết định không hiển nhiên từ code, ghi lại để không lặp lại sai lầm cũ. Mỗi mục: **what** (chuyện gì) → **why** (nguyên nhân gốc) → **fix/rule** (đã sửa thế nào / quy tắc rút ra). Khác với memory cá nhân của Claude (không nằm trong repo, không share team) — file này **commit vào git**, cả team + mọi session Claude sau đều đọc được.

Quy tắc lặp lại (đã promote lên `.claude/rules/`) không ghi lại chi tiết ở đây nữa — chỉ giữ tóm tắt + link.

---

### 2026-07-10 — Tách monorepo thành `message-hub-backend/` + `message-hub-frontend/` để deploy độc lập
**What**: Repo trước đây là 1 npm workspace gộp (`apps/*`, `libs/*`, `frontend` cùng 1 root `package.json`). User cần push code lên server riêng cho từng phần (đang chuẩn bị domain/VPS thật cho webhook ZNS) nên yêu cầu tách thành 2 folder độc lập ở root: `message-hub-backend/` (apps/api, apps/worker, libs/*, package.json/workspaces riêng, docker-compose.yml riêng cho postgres/redis/api/worker) và `message-hub-frontend/` (Next.js đứng một mình, không còn là npm workspace member).
**Why tách được sạch sẽ**: `frontend/package.json` vốn đã không có bất kỳ dependency nào vào `@message-hub/*` (không import `libs/domain` v.v.) và có `next.config.js`/`tsconfig.json` độc lập — xác nhận bằng grep trước khi tách, không giả định.
**Fix/thực hiện**:
- Dùng `git mv` giữ history: `apps/`, `libs/`, `package.json`, `package-lock.json`, `tsconfig.base.json` → vào `message-hub-backend/`; `frontend/` → đổi tên thành `message-hub-frontend/` (giữ nguyên node_modules/.next gitignored đi theo vì là OS-level rename).
- `.env`/`.env.example` gốc tách làm 2: biến `NEXT_PUBLIC_API_URL` sang `message-hub-frontend/.env` (Next.js tự đọc `.env` lẫn `.env.local`, dùng chung file này cho cả `next dev` lẫn docker-compose build arg), còn lại (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY...) ở `message-hub-backend/.env`.
- `docker-compose.yml` gốc (5 service) tách thành 2 file riêng theo từng folder — không giữ 1 compose gộp ở root nữa. Dockerfile của api/worker gần như không đổi (context giờ là `message-hub-backend/` thay vì repo root); Dockerfile frontend phải bỏ hết flag `-w frontend` vì không còn là workspace member.
- `.dockerignore` gốc cũng tách theo từng folder (context build giờ riêng biệt, không dùng chung 1 ignore file nữa).
- Xoá root `node_modules` cũ (491M) vì symlink workspace bên trong trỏ sai vị trí sau khi `apps/`+`libs/` dời chỗ — phải `npm install` lại từ đầu bên trong `message-hub-backend/`.
**Rule rút ra**: khi tách 1 monorepo npm workspaces thành nhiều phần độc lập, luôn verify trước bằng grep xem phần định tách có import chéo gì không (đừng giả định "chắc là độc lập") — nếu có, phải xử lý dependency đó trước (vd publish package riêng hoặc giữ chung workspace), tách ẩu sẽ vỡ symlink `node_modules/@scope/*` ngay lập tức.

### 2026-07-09 — Webhook delivery-status: kết luận cũ "Zalo/Telegram/LINE đều chưa làm" sai — ZNS thực ra khả thi và đã implement
**What**: CLAUDE.md cũ gộp chung "Zalo/Telegram/LINE — delivery status thật: chưa làm" thành 1 dòng. Rà lại bằng research thật (đọc docs + code) cho thấy đây là 4 tình huống khác nhau, không phải 1:
- **Zalo ZNS (`zbs_phone`)**: Zalo CÓ webhook callback thật ("Sự kiện người dùng nhận thông báo ZNS") — đã implement `parseWebhook` (`libs/adapters/src/zbs/zbs-phone.adapter.ts`) + route riêng `POST /webhooks/zns/:channelId` (`apps/api/src/modules/webhooks/webhooks.controller.ts`, theo đúng pattern `sms/:channelId` — channel-scoped, decrypt config thật, unauthenticated vì không có signature scheme nào được xác nhận).
- **Zalo OA (`zbs_uid`)**: vẫn chưa xác nhận được — docs OA webhook là SPA JS, WebFetch không đọc được nội dung thật. Comment cũ trong code tự nhận "chưa wire up". **Chưa làm gì thêm** — không tự suy diễn.
- **Telegram Bot API / LINE Messaging API**: xác nhận thật là **platform limitation** — không có update/event type nào cho delivery/read của tin bot/OA gửi ra (đã tra `core.telegram.org/bots/api#update` và `developers.line.biz` — chỉ có action từ user vào bot/OA, không có xác nhận ngược). Giữ nguyên `advance_on = provider_error` vĩnh viễn cho 2 kênh này, không đầu tư thêm.
**Why root cause của việc gộp nhầm**: `parseWebhook()` stub trả `null` giống hệt nhau ở cả 3 adapter khiến nhìn qua tưởng cùng 1 tình trạng "chưa làm vì chưa cần" — nhưng thực ra 1 trong 3 là "chưa làm dù làm được", còn 2 kia là "không làm được do platform".
**Fix/implement chi tiết ZNS**:
- Payload field: `msg_id` (= `providerMessageId`, đã trả về sẵn từ lúc `send()`), `tracking_id` (đã set = `attempt.id` từ trước, dù engine match theo `providerMessageId` chứ không dùng `tracking_id`), `error_code` (0 hoặc thiếu = delivered, khác 0 = failed).
- **Quan trọng — chưa verify được với call thật**: khác với rule tech-defaults.md ("mọi endpoint mới phải verify bằng call thật"), đây là *nhận* webhook chứ không phải *gọi* API, và chưa có tài khoản ZNS thật gửi tin để trigger callback thật. Field name dựng từ 2+ nguồn tài liệu bên thứ 3 độc lập (docs.yoursales.vn, docs.etelecom.vn) hội tụ cùng kết quả — docs chính chủ `developers.zalo.me` là SPA JS, WebFetch/jina reader không đọc được nội dung thật dù thử nhiều URL. Giống tình trạng WhatsApp `submitTemplate` (viết theo docs công khai, chưa verify WABA thật) — **cần re-check field name khi có callback ZNS thật đầu tiên** (xem `rawPayload` lưu trong `webhook_events` table).
- Verify đã làm được (không cần tài khoản ZNS thật): `npm run build:libs` sạch, `tsc --noEmit` apps/api sạch, jest `libs/failover`+`libs/shared` pass, rebuild `docker compose up -d --build api`, grep log xác nhận `Mapped {/webhooks/zns/:channelId, POST} route`, curl smoke test trả 404 đúng cho channel không tồn tại.
**Rule rút ra**: "3 adapter cùng stub `parseWebhook` trả `null`" không có nghĩa là "3 platform cùng không hỗ trợ" — phải tra riêng từng platform trước khi gộp chung 1 kết luận trong CLAUDE.md/status table. Khi không tự tin field name webhook payload vì docs chính chủ không đọc được, best-effort từ ≥2 nguồn thứ 3 độc lập hội tụ + verify build/route-mount là chấp nhận được, miễn ghi rõ "chưa verify với callback thật" để lần sau còn nhớ mà re-check.

### 2026-07-08 — Bug cùng loại "config merge" lan sang 3 chỗ khác (getInviteLink, listProviderTemplates, submitProviderTemplate)
**What**: Dùng subagent `researcher` (mới tạo) audit lại toàn bộ call site gọi capability adapter (`listTemplates`, `submitTemplate`, `getInviteLink`) xem có bị bug "chỉ đọc channelConfig, quên merge strategyConfig" giống bug đã fix ở `executeStep`/`testStrategyConnection` không. Kết quả: **cả 3 hàm này đều bị**, và **đang live-manifest thật** với channel Telegram thật (`giftzone_message_bot`) — channel-level `botToken` (35 ký tự) khác strategy-level `botToken` (46 ký tự, cái thực sự dùng để gửi tin), nên nút "Tạo invite link" ở Contacts từng tạo link trỏ nhầm bot.
**Why**: `findAdapterWithCapability` resolve adapter theo `channelType`, không qua 1 `channel_strategy` row cụ thể nên code gốc chỉ nghĩ tới `channel.config_encrypted`, quên rằng vẫn có strategy override khả dụng cần merge vào.
**Fix**: thêm helper `strategyConfigOverride(channelId, strategyKey)` trong `channels.service.ts`, merge `{...channelConfig, ...strategyConfig}` ở cả 3 call site — dùng subagent `reviewer` (mới tạo) verify lại trước khi coi là xong; verify thêm bằng script disposable trong container so sánh fingerprint token (xem tech-defaults.md) — xác nhận merged config giờ đúng bằng strategy-level token.
**Bonus fix**: `reviewer` phát hiện `strategyConfigOverride` match theo `(channelId, strategyKey)` không có ràng buộc unique trong DB — `addStrategy` trước đây cho phép thêm 2 strategy cùng `strategyKey` trên 1 channel (dữ liệu hiện tại chưa bị, nhưng là lỗ hổng tiềm ẩn). Đã thêm guard chặn trùng `strategyKey` trong `addStrategy` (application-level, không cần migration).
**Rule rút ra**: khi fix 1 bug "quên merge config" ở 1 chỗ, phải audit **toàn bộ call site khác gọi cùng 1 adapter capability pattern** (`findAdapterWithCapability`) — bug lớp này rất dễ lặp lại ở chỗ khác vì cùng root cause kiến trúc (resolve theo channelType thay vì theo 1 strategy row cụ thể).

### 2026-07-08 — Audit toàn bộ active policy: tìm thấy 2 policy vẫn còn bug "advance_on sai" dù đã từng phát hiện trước đó
**What**: Chạy audit theo `.claude/rules/tech-defaults.md` mục "Failover policy" trên toàn bộ `failover_policy_steps` đang active. Phát hiện policy **"Gmail"** (step 0, `email_smtp`) và **"ZBS"** (step 0 `zbs_uid` + step 1 `zbs_phone`) vẫn đang để `advance_on = 'either'` — dù bug pattern này đã được "phát hiện + hướng dẫn sửa" ở 1 session trước (ghi trong CLAUDE.md cũ) nhưng **chưa từng thực sự UPDATE trong DB**.
**Why**: Phát hiện bug ≠ đã fix — session trước chỉ dừng ở mức giải thích cho user, không có bước áp dụng fix thật vào dữ liệu.
**Fix**: `UPDATE failover_policy_steps SET advance_on = 'provider_error'` cho 3 dòng cụ thể (Gmail step 0; ZBS step 0+1) — đã hỏi xác nhận user trước khi chạy vì đây là mutation trên dữ liệu production đang active. Verify lại: toàn bộ 5 policy active (Gmail, SMS, Telegram, Telegram->SMS->Email, ZBS, ZBS UID->ZBS phone->LINE) giờ đều đúng.
**Rule rút ra**: "đã phát hiện bug" trong memory/CLAUDE.md phải phân biệt rõ với "đã fix" — nếu chỉ dừng ở mức giải thích/khuyến nghị mà chưa chạy fix thật, phải ghi rõ trạng thái "chưa áp dụng" để lần audit sau còn bắt lại được, đừng mặc định coi là đã xong.

### 2026-07-08 — Strategy-level config override bị bỏ qua hoàn toàn
**What**: User nhập đúng Bot Token ở strategy-level (`telegram_default`), nhưng gửi vẫn lỗi như chưa có token.
**Why**: `FailoverEngineService.executeStep()` và `ChannelsService.testStrategyConnection()` chỉ đọc `channel.config_encrypted`, không bao giờ merge `channel_strategy.config_encrypted` — bug tồn tại từ đầu, chỉ `mock`/`sms_http` "vô tình đúng" vì test trước đó luôn set ở channel-level.
**Fix**: merge `{...channelConfig, ...strategyConfig}` trước khi gọi `adapter.send()`. → đã promote thành bất biến bắt buộc, xem `.claude/rules/design.md` mục "channel_type ≠ adapter".

### 2026-07-08 — Zalo API endpoint sai version (v3.0 thay vì v2.0)
**What**: `getInviteLink` và `validateConfig` (nút Test Connection) của `zbs_uid` gọi `openapi.zalo.me/v3.0/oa/getoa` → HTTP 404 với access token thật.
**Why**: endpoint `getoa` chỉ tồn tại ở v2.0, không có ở v3.0 — copy nhầm version từ chỗ khác (message API dùng v3.0 thật). Bug này khiến "Test connection" cho zbs_uid **luôn fail** từ lúc viết adapter tới giờ, không ai phát hiện vì chưa test với OA thật.
**Fix**: đổi cả 2 call site sang `v2.0/oa/getoa`, verify thật (trả về `oa_id`, tên OA, follower count đúng).
**Rule rút ra**: mọi endpoint provider mới thêm vào adapter phải verify bằng call thật (script disposable trong container), không tin theo suy đoán từ endpoint tương tự.

### 2026-07-08 — advance_on sai khiến gửi thành công vẫn báo "failed" (bug pattern lặp lại, lần đầu phát hiện ở policy "Gmail")
**What**: Policy dùng adapter không có webhook xác nhận delivery thật (email_smtp, sms chưa cấu hình webhook) nhưng để `advance_on = either/no_confirmation_timeout` → luôn timeout → luôn báo step đó "failed" dù gửi thành công thật.
**Why**: `advance_on` mặc định UI/policy builder không tự biết adapter nào có webhook thật.
**Fix/Rule**: đã promote thành default bắt buộc — `.claude/rules/tech-defaults.md` mục "Failover policy". Audit định kỳ toàn bộ policy đang active theo quy tắc này (xem thêm entry audit bên dưới nếu có).

### 2026-07-08 — WhatsApp submitTemplate: biến `{{var}}` phải đổi thành positional `{{1}}, {{2}}...` đúng thứ tự xuất hiện
**What**: Meta API yêu cầu template variables ở dạng positional number, không phải tên biến gốc.
**Fix**: filter đúng các biến thực sự xuất hiện trong body, map sang index theo thứ tự xuất hiện trước khi submit.

### 2026-07-08 — LINE webhook signature check: bug tự bắt trước khi ship
**What**: Code nháp ban đầu gọi `verifyWebhookSignature` vô điều kiện và reject nếu false — nhưng hàm này luôn trả `false` khi `channelSecret` chưa cấu hình (secret là optional theo thiết kế) → tính năng sẽ không bao giờ hoạt động nếu user không set thêm secret, mâu thuẫn với doc comment "optional".
**Fix**: chỉ enforce check khi `config.channelSecret` thực sự có giá trị.
**Rule rút ra**: field "optional" trong config schema nghĩa là "chấp nhận unauthenticated nếu chưa set", không phải "luôn enforce, default false = reject".

### 2026-07-08 — Masking secret field: chọn "hiện hết, che 4 ký tự cuối"
**What/Why**: User chọn rõ qua AskUserQuestion — ưu tiên UX (nhận ra được giá trị đã lưu) hơn là che phần lớn — chấp nhận đánh đổi bảo mật ở mức thấp hơn vì token/password vẫn không round-trip plaintext đầy đủ.
**Rule**: `.claude/rules/tech-defaults.md` mục Secret/credential — áp dụng nhất quán cho mọi field `secret: true`.

<!-- Thêm entry mới ở trên, mới nhất lên đầu sau dòng "---" — giữ format what/why/fix để entry sau vẫn đọc nhanh được. -->
