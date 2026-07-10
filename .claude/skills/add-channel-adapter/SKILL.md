---
name: add-channel-adapter
description: Thêm 1 channel/provider adapter mới vào Message Hub (vd thêm 1 SMS provider khác, hoặc kênh hoàn toàn mới). Dùng khi user nói "thêm provider", "thêm kênh gửi mới", "tích hợp thêm SMS/Zalo/..." — đây là seam mở rộng duy nhất của hệ thống, không đụng core.
---

# Thêm channel adapter mới

Tham chiếu: `.claude/rules/design.md` mục "Adapter pattern là seam duy nhất".

## Các bước

1. **Xác định `channelType`**: adapter mới thuộc `channel_type` nào đã có (`zbs`, `sms`, `telegram`, `line`, `whatsapp`, `email`) hay cần thêm type hoàn toàn mới (thêm vào `ChannelType` enum ở `message-hub-backend/libs/domain/src/enums`).

2. **Viết class implement `ChannelAdapter`** (`message-hub-backend/libs/adapters/src/channel-adapter.interface.ts`) tại `message-hub-backend/libs/adapters/src/<provider>/<provider>.adapter.ts`:
   - `strategyKey` — unique, dùng để đăng ký (vd `sms_vietguys`).
   - `channelType`, `identifierKind`.
   - `send(input)` — trả `SendResult` với `status: 'sent' | 'provider_error'`. Lỗi đồng bộ từ provider (auth fail, invalid recipient...) phải trả `provider_error`, không throw, để failover engine advance đúng.
   - `parseWebhook()` — nếu provider có webhook delivery status thật thì implement thật; nếu không, trả `null` (stub) — **và ghi rõ trong `.claude/memory.md`/CLAUDE.md rằng adapter này chưa có webhook thật**, để policy builder không set sai `advance_on` (xem tech-defaults.md).
   - `validateConfig(config)` — dùng cho nút "Test connection", phải gọi API thật để verify, không chỉ check field có tồn tại.
   - `getConfigSchema()` — khai báo field nào `secret: true` (sẽ tự động mask khi hiển thị lại).
   - Optional: `refreshCredentials`, `listTemplates`, `submitTemplate`, `verifyWebhookSignature`, `getInviteLink` — chỉ implement nếu provider hỗ trợ thật, đừng giả lập.

3. **Đăng ký** trong `message-hub-backend/libs/adapters/src/adapters.module.ts` (provider + push vào danh sách registry).

4. **Nếu cần config UI đặc thù**: kiểm tra `getConfigSchema()` đã đủ để frontend render form động chưa (`message-hub-frontend/app/channels` đọc schema, không cần sửa gì thêm nếu field type chuẩn).

5. **Nếu có webhook delivery status thật**: thêm controller ở `message-hub-backend/apps/api/src/modules/webhooks/` theo pattern channel-scoped (`/webhooks/<type>/:channelId`) trừ khi provider tự phân biệt channel qua payload (như WhatsApp dùng `phone_number_id`) thì dùng 1 URL chung — xem design.md mục "Webhook URL theo từng channel".

6. **Nếu provider yêu cầu opt-in trước khi gửi được** (giống Telegram/Zalo/LINE): xem pattern capture ở `message-hub-backend/apps/api/src/modules/webhooks/telegram-webhook.controller.ts` + `contacts.service.ts#upsertIdentifier` — không tự chế cơ chế mới nếu pattern có sẵn áp dụng được.

7. **Build + test**: trong `message-hub-backend/`, `npm run build:libs`, rebuild `apps/api`/`apps/worker` nếu cần, đảm bảo `libs/failover` + `libs/shared` test vẫn pass.

8. **Verify với credential thật** (nếu có): script Node disposable trong container — xem tech-defaults.md mục "Secret / credential". Không báo "xong" nếu chưa verify được, ghi rõ "chưa verify với tài khoản thật" trong CLAUDE.md nếu đúng vậy.

9. **Sau khi xong**: cập nhật `CLAUDE.md` (bảng trạng thái + danh sách adapter) và ghi vào `.claude/memory.md` nếu có bug/quyết định không hiển nhiên phát sinh trong lúc làm.
