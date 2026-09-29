# 🚀 Hướng dẫn Deploy TOEIC Practice App

## Kiến trúc deploy

```
[Mobile/Browser]
      ↓ HTTPS
[Vercel] — React Frontend
      ↓ fetch HTTPS
[Railway] — NestJS Backend
      ↓
[Gemini API]
```

> ⚠️ **HTTPS là bắt buộc** để microphone hoạt động trên mobile. Railway + Vercel đều cấp HTTPS miễn phí.

---

## PHẦN 1 — Deploy Backend lên Railway

### Bước 1: Push code lên GitHub

```bash
# Tại thư mục gốc toeic-practice/
git init
git add .
git commit -m "feat: initial toeic practice app"

# Tạo repo mới trên github.com rồi:
git remote add origin https://github.com/YOUR_USERNAME/toeic-practice.git
git push -u origin main
```

### Bước 2: Deploy Backend

1. Vào **[railway.app](https://railway.app)** → Sign in với GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Chọn repo `toeic-practice`
4. Set **Root Directory** = `backend`
5. Sau khi deploy, vào tab **"Variables"** và thêm:

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | API key của bạn |
| `PORT` | `3000` |

6. Vào **"Settings"** → **"Networking"** → **"Generate Domain"**
   → Có URL dạng: `https://toeic-backend-xxxx.railway.app`

7. **Test**: Vào `https://toeic-backend-xxxx.railway.app/api/toeic/listen`
   → Ra lỗi 400 "Missing audio file" = backend OK ✅

---

## PHẦN 2 — Deploy Frontend lên Vercel

1. Vào **[vercel.com](https://vercel.com)** → Sign in với GitHub
2. Click **"Add New Project"** → Import repo `toeic-practice`
3. Cấu hình:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (tự detect)
4. Thêm **Environment Variable**:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://toeic-backend-xxxx.railway.app` |

5. Click **"Deploy"**
   → Có URL dạng: `https://toeic-practice-xxxx.vercel.app`

---

## PHẦN 3 — Dùng trên điện thoại

1. Mở Chrome/Safari trên điện thoại
2. Vào `https://toeic-practice-xxxx.vercel.app`
3. Cho phép quyền **microphone** khi được hỏi
4. Nhấn nút mic → Bắt đầu luyện TOEIC!

**Thêm vào màn hình chính như app native:**
- **iOS Safari**: Share → "Add to Home Screen"
- **Android Chrome**: Menu ⋮ → "Add to Home Screen"

---

## Tóm tắt chi phí

| Service | Chi phí |
|---------|---------|
| Railway Hobby | Miễn phí ($5 credit/tháng) |
| Vercel Free | Miễn phí |
| Gemini API Free | Miễn phí (15 req/phút) |

---

## Local Development

```bash
# Terminal 1 — Backend
cd backend && npm run start:dev   # :3000

# Terminal 2 — Frontend
cd frontend && npm run dev         # :5173 (proxy → :3000)
```
