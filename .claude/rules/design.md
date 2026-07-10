# Nguyên tắc thiết kế — Message Hub

Các quyết định kiến trúc mang tính ràng buộc — thay đổi cần cân nhắc kỹ vì nhiều phần code phụ thuộc vào các bất biến này.

## Adapter pattern là seam duy nhất
Thêm channel/provider mới = viết 1 class implement `ChannelAdapter` (`message-hub-backend/libs/adapters/src/channel-adapter.interface.ts`) + đăng ký trong `message-hub-backend/libs/adapters/src/adapters.module.ts`. **Không đụng core** — `FailoverEngineService` chỉ biết `ChannelAdapterRegistry`, không bao giờ import adapter cụ thể.

## `channel_type` ≠ adapter
1 `channel` (vd "Zalo OA - Marketing") có thể có nhiều `channel_strategies`, mỗi strategy trỏ tới 1 adapter khác nhau nhưng dùng chung credential ở channel-level (vd ZBS UID → ZBS phone). Lý do: cho phép failover trong cùng 1 provider mà không cần tạo channel riêng. Config layer thật sự: `channel.config_encrypted` (base) bị `channel_strategy.config_encrypted` (override) đè lên khi merge — **cả hai adapter.send() và testStrategyConnection() đều phải merge `{...channelConfig, ...strategyConfig}`**, không được chỉ đọc channelConfig (đây từng là 1 bug nghiêm trọng, xem memory.md).

## Mọi lần gửi đều qua 1 failover policy
Kể cả gửi qua đúng 1 kênh (policy 1-step) — không có code path "gửi thẳng channel" riêng biệt, để tránh 2 luồng logic song song dễ lệch hành vi.

## Secret không round-trip plaintext
Encrypt at rest (AES-256-GCM). Khi hiển thị lại cho edit thì mask 4 ký tự cuối. Đây là quyết định đã hỏi lại user để chốt (không phải suy đoán) — xem `.claude/rules/tech-defaults.md`.

## Mô hình opt-in cho Telegram/Zalo/LINE
Bot Telegram, Zalo OA, LINE OA **không thể** chủ động nhắn cho user cho tới khi user nhắn/follow trước (chính sách chống spam của nền tảng). Vì vậy cần cơ chế capture qua webhook để gắn định danh provider-specific (chat_id / uid / user_id) vào `Contact`:
- Telegram có deep-link `/start <payload>` xác nhận rõ trong docs — 1-tap flow, `getInviteLink` nhúng thẳng contact id vào link.
- Zalo/LINE **không có** cơ chế truyền payload xác nhận qua link follow — dùng fallback "match theo text": user gửi đúng contact id dưới dạng tin nhắn, webhook nhận và match.
- Không giả lập tính năng platform không hỗ trợ (vd Zalo ZNS không có API submit template công khai — chỉ list/sync).

## CSV → template param không xây mapping riêng
Kiến trúc sẵn có (`campaign.trigger()` dùng `contact.attributes` làm `templateVariables`) đã đủ — cột CSV ngoài identifier lưu thẳng vào `contact.attributes`, tự động match theo tên biến `{{var}}` trong template. Không xây cơ chế mapping cột-tới-biến riêng.

## Webhook URL theo từng channel (không phải 1 URL chung)
`sms_http` là adapter config-driven — mỗi channel có thể trỏ provider khác nhau với payload khác nhau, không tự phân biệt được như WhatsApp (dùng `phone_number_id` trong payload để match) → route `/webhooks/sms/:channelId` theo channelId thay vì 1 endpoint chung.
