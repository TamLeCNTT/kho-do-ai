# Kho Đồ AI

PWA mobile-first để lưu ảnh đồ vật trong IndexedDB và tìm lại bằng **AI image embedding chạy local**. Không có backend, Firebase, Supabase hay API AI. Ảnh cá nhân không được gửi lên server.

## Công nghệ và model

- Vite + JavaScript modules, CSS, PWA Service Worker.
- Dexie/IndexedDB `KhoDoAIDatabase`, JSZip backup/restore.
- Transformers.js 3 + ONNX Runtime Web, backend **WASM** để tương thích Safari iOS.
- Model: `plhery/mobileclip2-onnx`, biến thể **MobileCLIP2-S0** vision FP32, khoảng **43 MB**.
- Embedding: vector image embedding **512 chiều** từ MobileCLIP2, sau đó chuẩn hóa L2. Model mới phân tách ảnh khác loại tốt hơn MobileCLIP-S0 q8 cũ nhưng vẫn đủ nhẹ để ưu tiên Safari iPhone. Đây là model được huấn luyện để tạo không gian đặc trưng ảnh, không dùng logits phân loại, hash, màu hay filename.
- Tìm kiếm: query dùng đúng model/version, dot product giữa các vector đã chuẩn hóa (tương đương cosine similarity), sort giảm dần, lấy Top 5 trong Web Worker. Điểm phần trăm chỉ là độ tương đồng, **không phải xác suất** cùng một đồ vật.

Model được tải từ Hugging Face ở lần dùng đầu, sau đó Transformers.js lưu model trong browser cache. Inference nhận ảnh qua Blob/Object URL local; mã ứng dụng không upload ảnh. Để kiểm chứng, mở Safari Web Inspector/Network: sau khi model đã cache và tắt mạng, thêm/tìm ảnh vẫn hoạt động; không có request nào chứa ảnh người dùng.

## Chạy trên Windows

Yêu cầu Node.js 20.19+ hoặc 22.12+:

```powershell
npm install
npm run dev
```

Mở URL Vite hiển thị. Camera và Service Worker cần HTTPS (localhost được ngoại lệ). Build kiểm tra:

```powershell
npm run build
npm run preview
```

## Deploy GitHub Pages bằng GitHub Actions

Dự án đã có workflow `.github/workflows/deploy-pages.yml`. Mỗi lần push lên nhánh `main`, GitHub tự chạy `npm ci`, build dự án và deploy riêng nội dung thư mục `dist`. Không cần commit thư mục `dist`.

### 1. Tạo repository

Tạo một repository trống trên GitHub, ví dụ `kho-do-ai`. Không chọn tạo sẵn README hoặc `.gitignore` nếu thư mục local đã có các tệp này.

### 2. Khởi tạo và đẩy source từ Windows

Mở PowerShell trong thư mục dự án:

```powershell
git init
git branch -M main
git add .
git commit -m "Kho Do AI PWA"
git remote add origin https://github.com/USERNAME/kho-do-ai.git
git push -u origin main
```

Thay `USERNAME` và `kho-do-ai` bằng tài khoản/tên repository thực tế.

### 3. Bật GitHub Pages

Trong repository GitHub:

1. Mở **Settings**.
2. Chọn **Pages**.
3. Tại **Build and deployment → Source**, chọn **GitHub Actions**.
4. Mở tab **Actions** và chờ workflow `Deploy Kho Đồ AI to GitHub Pages` có dấu tích xanh.

Sau khi hoàn tất, ứng dụng thường nằm tại:

```text
https://USERNAME.github.io/kho-do-ai/
```

Nếu workflow chưa tự chạy, mở **Actions → Deploy Kho Đồ AI to GitHub Pages → Run workflow**.

Mọi đường dẫn trong app đều tương đối nên hoạt động tại subdirectory GitHub Pages. Không đưa ảnh cá nhân vào Git: ảnh chỉ tồn tại trong IndexedDB trên thiết bị sử dụng app.

## Cài trên iPhone

Mở URL GitHub Pages bằng Safari → nút Share → **Add to Home Screen**. Mở app khi còn mạng một lần và chờ trạng thái “AI: Sẵn sàng” để model được cache. Sau đó icon hoạt động độc lập với máy Windows. iOS có thể thu hồi dữ liệu web khi thiếu dung lượng; hãy sao lưu thường xuyên và bấm “Yêu cầu lưu trữ bền vững” trong Dữ liệu.

## IndexedDB schema

Database `KhoDoAIDatabase` có store `items`: `id`, `name`, `description`, `location`, `category`, `tags`, `createdAt`, `updatedAt`, `favorite`, `imageBlob`, `thumbnailBlob`, kích thước ảnh, `embedding` (`Float32Array`), `embeddingModel`, `embeddingVersion`, `imageFingerprint`. Trường `name` được dùng nội bộ để lưu **nội dung liên quan đến ảnh** và làm tiêu đề hiển thị, không bắt buộc phải là tên một đồ vật. Store `categories` lưu các danh mục do người dùng tự tạo để có thể chọn lại trong form. Thiết kế record cho phép migration sang bảng ảnh phụ khi bổ sung nhiều góc ảnh.

Kiểm tra trên máy tính: DevTools → Application → IndexedDB → `KhoDoAIDatabase` → `items`. Trên iPhone cần kết nối Safari Web Inspector từ macOS; nếu không có Mac, dùng chức năng sao lưu ZIP để kiểm tra `backup.json` và ảnh.

## Ảnh, lưu trữ và hiệu năng

Ảnh chính được sửa orientation bằng `createImageBitmap`, resize cạnh dài tối đa 1600 px và JPEG quality 0.82; thumbnail tối đa 300 px. Danh sách chỉ lấy thumbnail, dùng lazy loading và thu hồi Object URL khi đổi màn hình. Similarity Worker chỉ nhận ID + embedding. 10.000 embedding 1.000 chiều tốn khoảng 40 MB trước overhead; UI không nạp ảnh full-size để tìm.

## Backup / Restore

Trong **Dữ liệu**, chọn “Sao lưu toàn bộ” để tạo `khodo-ai-backup-YYYY-MM-DD.zip`, gồm `backup.json`, `images/`, `thumbnails/` và embedding/model version. “Khôi phục ZIP” validate định dạng rồi nhập theo tiến độ; ID trùng được ghi đè. Nên copy ZIP sang Files/iCloud/PC định kỳ vì xóa website data hoặc gỡ PWA có thể xóa IndexedDB.

## Offline và cập nhật

Service Worker cache app shell và các static asset cùng origin; module/runtime/model được browser cache khi tải. Ảnh cá nhân không nằm trong Cache Storage. Update code không xóa IndexedDB. Lần đầu tải model bắt buộc có mạng. Chính sách cache dung lượng của iOS thuộc quyền Safari nên offline AI không thể được bảo đảm tuyệt đối nếu hệ điều hành đã tự dọn cache.

## Kiểm thử AI thủ công

1. Lưu ảnh A của một đồ vật và ảnh C của đồ vật khác.
2. Tìm bằng ảnh B (cùng vật/góc hơi khác).
3. Xác nhận `Similarity(A,B) > Similarity(A,C)` và kết quả thay đổi khi đổi query.
4. DevTools Network → Offline, lặp lại sau khi model đã cache.

## Giới hạn kỹ thuật

- MobileCLIP2 nhận biết tương đồng ngữ nghĩa và hình dạng tốt hơn logits phân loại, nhưng hai sản phẩm giống hệt cùng model/màu vẫn có thể khó phân biệt; nền và góc chụp khác mạnh làm giảm điểm.
- Ngưỡng mặc định 0.55 chỉ là khởi điểm và có thể chỉnh ở màn hình tìm. Logits cosine không được hiệu chuẩn thành xác suất.
- Lần đầu tải/inference có thể mất thời gian trên iPhone cũ. Nếu model/version đổi, trang Dữ liệu yêu cầu tạo lại embedding; app không so trực tiếp embedding khác version.
- SVG icon hoạt động trên trình duyệt hiện đại; nếu một bản iOS cũ không dùng nó làm icon Home Screen, hãy xuất `icons/icon.svg` thành PNG 192×192 và 512×512 rồi thêm vào manifest.
