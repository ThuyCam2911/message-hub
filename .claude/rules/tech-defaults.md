# Tech defaults — Message Hub

Mặc định kỹ thuật đã chốt cho repo này. Khi làm việc mới mà rơi vào các tình huống dưới, áp dụng đúng mặc định — đừng suy nghĩ lại từ đầu.

## Failover policy
- `advance_on` mặc định phải là `provider_error` cho bất kỳ step nào dùng adapter **không có** webhook xác nhận delivery thật (hiện tại: `zbs_uid`, `zbs_phone`, `telegram_default`, `line_push`, `email_smtp` — xem `.claude/memory.md` mục "advance_on false-failed" để biết vì sao).
- Chỉ dùng `either` / `no_confirmation_timeout` cho step có adapter thật sự gọi webhook cập nhật status (`sms_http` khi đã cấu hình webhook, `whatsapp_cloud`, `mock_default`).
- Trước khi tạo policy mới hoặc thêm step mới, kiểm tra `parseWebhook()` của adapter đó có phải stub trả `null` không (`libs/adapters/src/*/*.adapter.ts`).

## Secret / credential
- Không bao giờ trả plaintext đầy đủ của secret field (password/token) về client.
- Khi hiển thị lại cho edit: field thường hiện đầy đủ, field `secret: true` trong `getConfigSchema()` che bằng `EncryptionService.maskSecretFields()` — giữ nguyên hết, chỉ che 4 ký tự cuối bằng `*`.
- Test/verify với credential thật: viết script Node tạm, `docker cp` vào container `api` (có sẵn `ENCRYPTION_KEY`, `DATABASE_URL`), chạy trong đó, chỉ in ra length/prefix/boolean — không bao giờ in giá trị secret thật. Xoá script khỏi container + scratchpad sau khi dùng xong.

## Xoá dữ liệu có FK reference
- Pattern `isForeignKeyViolation` + deactivate-fallback dùng nhất quán ở mọi chỗ xoá (channel, strategy, policy, template): thử hard-delete trước, nếu Postgres trả 23503 (FK violation) thì chuyển `isActive = false` thay vì chặn hẳn thao tác xoá.

## Docker / migration
- Rebuild từng service riêng khi 1 service build fail giữa lệnh gộp (`docker compose up -d --build api worker frontend`) — nếu 1 service lỗi, các service khác có thể chạy image cũ dù lệnh "thành công". Luôn `docker compose build <service>` rồi `docker compose up -d <service>` tách riêng khi nghi ngờ.
- Migration: `npm run typeorm -- migration:generate src/migrations/<Name>` chạy từ `apps/api/`. Migration tự áp dụng khi boot (`migrationsRun: true`).

## Git
- Tạo commit theo từng nhóm logic riêng biệt thay vì 1 commit khổng lồ khi có nhiều thay đổi không liên quan (vd: responsive UI riêng, doc riêng, feature riêng).
- Luôn grep diff tìm secret/credential trước khi commit.
- Trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` theo convention repo.

## Adapter mới
- Xem `.claude/skills/add-channel-adapter/SKILL.md` cho quy trình đầy đủ.
