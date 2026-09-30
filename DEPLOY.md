# TOEIC Listening AI — cách chạy và deploy

App nghe liên tục đề Listening (Part 1 → 4) qua micro, tự chia từng câu, rồi:

| Part | AI làm gì |
|------|-----------|
| 1 | Dịch 4 câu A-D sang tiếng Việt kèm gợi ý cần nhìn gì trong ảnh (AI không thấy ảnh nên không đoán đáp án) |
| 2 | Chọn A/B/C và nêu lý do ngắn |
| 3, 4 | Tóm tắt hội thoại/bài nói, rồi trả **nội dung đáp án** cho từng câu hỏi khi nó được đọc (đáp án A-D chỉ in trong đề, không có trong audio) |

## Kiến trúc

```
[Micro] -> trình duyệt: VAD cắt câu theo khoảng im lặng, đóng gói WAV 16 kHz
        -> POST /api/toeic/chunk  (multipart)  <- phản hồi là luồng NDJSON
[NestJS] -> STT: Groq Whisper (fallback Gemini) -> máy trạng thái theo cấu trúc đề
         -> LLM: Groq gpt-oss -> Gemini Flash-Lite (tự chuyển khi bị 429/lỗi)
```

Toàn bộ dùng gói **miễn phí**. Cần ít nhất một trong hai key (có cả hai thì tự dự phòng cho nhau):

- Groq: https://console.groq.com/keys
- Google AI Studio: https://aistudio.google.com/app/apikey

> Hạn mức free thay đổi thường xuyên, hãy xem trang Limits trong console của từng nhà cung cấp.
> Mỗi lần nghe hết 100 câu tốn khoảng 120-130 request STT và khoảng 120 request LLM.

## Chạy local

```bash
cd backend && cp .env.example .env   # điền GROQ_API_KEY và/hoặc GEMINI_API_KEY
npm install && npm run start:dev     # :3000

cd frontend && npm install && npm run dev   # :5173 (proxy /api -> :3000)
```

Micro chỉ hoạt động trên `localhost` hoặc HTTPS.

## Deploy

1. **Backend (Railway hoặc Render)**: Root Directory = `backend`. Biến môi trường: `GROQ_API_KEY`, `GEMINI_API_KEY`, `PORT`. Kiểm tra: mở `https://<backend>/api/health`, kết quả `{"ok":true,"groq":true,...}`.
   Render free tier tự ngủ sau một thời gian không dùng, request đầu có thể chậm 30 giây trở lên, nên hãy mở app trước khi vào bài.
2. **Frontend (Vercel)**: Root Directory = `frontend`, biến `VITE_API_URL` = URL backend.
3. **Chống người lạ dùng hết quota (tùy chọn)**: đặt `APP_TOKEN` ở backend và `VITE_APP_TOKEN` cùng giá trị ở frontend. Đây chỉ là rào cản đơn giản vì token nằm trong bundle frontend. Đặt thêm `ALLOWED_ORIGINS=https://<frontend>` để giới hạn CORS.

## Cách dùng khi luyện

1. Đặt thiết bị phát đề gần micro, âm lượng vừa phải, tránh méo tiếng.
2. Chọn Part bắt đầu rồi bấm **Bắt đầu nghe**. Điện thoại được giữ sáng màn hình trong lúc nghe.
3. Nếu số câu bị lệch (ví dụ lỡ một đoạn), dùng nút Part hoặc ô "Sửa số câu tiếp theo".
4. Thanh trượt "Im lặng bao lâu thì chốt một câu" cân bằng giữa tốc độ và độ chính xác: ngắn thì đáp án đến sớm nhưng dễ cắt đôi một câu. Giá trị mặc định là 2.2 giây, hãy tinh chỉnh sau vài lần thử với file audio thật của bạn.

## Tinh chỉnh model

Trong `backend/.env`:

```
STT_CHAIN=groq:whisper-large-v3-turbo,gemini:gemini-3.1-flash-lite
LLM_CHAIN=groq:openai/gpt-oss-120b,gemini:gemini-3.1-flash-lite,groq:openai/gpt-oss-20b
```

Mỗi phần tử là `nhà-cung-cấp:model`, thử theo thứ tự. Model nào trả 429 sẽ bị bỏ qua một lúc rồi tự thử lại.

## Test

```bash
cd backend && npm test    # máy trạng thái + end-to-end với server Groq/Gemini giả lập
cd frontend && npm test   # VAD cắt câu + client đọc luồng NDJSON
```
