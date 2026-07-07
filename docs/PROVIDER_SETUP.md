# Hướng dẫn tạo tài khoản provider cho từng kênh

Khi có tài khoản/API key thật, vào **Channels** trên dashboard, tạo channel với `channelType` tương ứng, và dán đúng JSON config bên dưới vào ô "Config (JSON credentials)". Không cần sửa code cho bất kỳ bước nào ở đây.

---

## 1. Email (SMTP)

Dễ nhất, nên làm trước để test luồng end-to-end.

- **Test nhanh (sandbox)**: [Mailtrap](https://mailtrap.io) — tạo account free, vào Inbox → SMTP Settings, lấy host/port/user/pass.
- **Dùng thật**: Gmail với [App Password](https://myaccount.google.com/apppasswords) (không dùng mật khẩu chính), hoặc AWS SES / SendGrid SMTP.

```json
{ "host": "smtp.gmail.com", "port": 587, "secure": false, "user": "your@gmail.com", "pass": "app-password", "fromAddress": "your@gmail.com" }
```

Strategy: `email_smtp`

---

## 2. SMS gateway (Việt Nam)

Nhà cung cấp phổ biến: **eSMS.vn**, **SpeedSMS**, hoặc brandname qua nhà mạng trực tiếp (Viettel/VNPT). Đăng ký brandname cần giấy phép kinh doanh + duyệt mẫu tin, thường mất vài ngày.

Adapter `sms_http` là generic (config-driven, không hardcode 1 hãng cụ thể):

```json
{
  "endpoint": "https://api.provider.vn/sms/send",
  "method": "POST",
  "bodyTemplate": "{\"apiKey\":\"...\",\"phone\":\"{{phone}}\",\"message\":\"{{message}}\"}",
  "successPath": "data.code",
  "messageIdPath": "data.msg_id"
}
```

Khi có hợp đồng, gửi tài liệu API của họ (endpoint, cách auth, format response) — cần điền đúng `bodyTemplate`/`successPath`/`messageIdPath` theo tài liệu đó.

Strategy: `sms_http`

---

## 3. Zalo (ZBS UID + ZNS)

- **ZBS UID (Zalo OA)**: tạo Official Account tại [Zalo OA Manager](https://oa.zalo.me) → vào [Zalo Developers](https://developers.zalo.me) lấy `access_token` qua OAuth.
- **ZBS phone (ZNS)**: đăng ký riêng tại [Zalo Notification Service](https://zns.zalo.me), submit mẫu template để Zalo duyệt trước (vài ngày), mỗi mẫu có `template_id` riêng.

```json
{ "accessToken": "..." }
```

Strategies: `zbs_uid`, `zbs_phone`. Với ZNS, khi tạo Template chọn "ZNS structured template" và điền `templateId` đã được Zalo duyệt.

---

## 4. Telegram Bot

Nhanh nhất (~2 phút). Chat với [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên → nhận token dạng `123456:ABC-DEF...`.

```json
{ "botToken": "123456:ABC-DEF..." }
```

Strategy: `telegram_default`

---

## 5. LINE

Tạo tài khoản tại [LINE Developers Console](https://developers.line.biz) → tạo Messaging API channel → lấy `Channel Access Token` (long-lived) trong tab Messaging API.

```json
{ "channelAccessToken": "..." }
```

Strategy: `line_push`

---

## 6. WhatsApp Business Cloud API

[Meta for Developers](https://developers.facebook.com) → tạo App loại "Business" → thêm sản phẩm WhatsApp → lấy `Phone Number ID`, `Access Token` (test token hết hạn 24h, cần đổi sang permanent token qua System User), và `App Secret` (dùng verify webhook).

```json
{ "phoneNumberId": "...", "accessToken": "...", "appSecret": "...", "graphApiVersion": "v20.0" }
```

Strategy: `whatsapp_cloud`

---

## Sau khi điền config

1. Bấm **Test connection** trên channel/strategy vừa tạo (chỉ có ở các adapter hỗ trợ — email/telegram/line/whatsapp có, zbs/sms thì kiểm tra qua lần gửi thử đầu tiên).
2. Tạo hoặc cập nhật **Template** đúng `channelType`.
3. Thêm **Failover Policy** dùng strategy tương ứng.
4. Gửi thử ở trang **Send Test** trước khi dùng cho **Campaigns**.

Nếu "Test connection" báo lỗi hoặc provider trả response khác định dạng mong đợi, báo lại — thường chỉ cần chỉnh cấu hình, không cần sửa code.
