# Memory — kho kiến thức chung (Message Hub)

Log các bug/quyết định không hiển nhiên từ code, ghi lại để không lặp lại sai lầm cũ. Mỗi mục: **what** (chuyện gì) → **why** (nguyên nhân gốc) → **fix/rule** (đã sửa thế nào / quy tắc rút ra). Khác với memory cá nhân của Claude (không nằm trong repo, không share team) — file này **commit vào git**, cả team + mọi session Claude sau đều đọc được.

Quy tắc lặp lại (đã promote lên `.claude/rules/`) không ghi lại chi tiết ở đây nữa — chỉ giữ tóm tắt + link.

---

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
