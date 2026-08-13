 ## Tóm tắt

  - Popup Đề xuất vật liệu trên desktop rộng bằng popup Báo giá (sm:max-w-3xl); mobile/tablet tiếp
    tục dùng chiều rộng responsive hiện có.

  - Popup Báo giá bổ sung cụm nút trên header giống Đề xuất vật liệu: Xuất PDF và Xóa.
  - Xuất PDF xuất thẳng bản draft hiện tại để review, không mở popup tùy chọn in và không đóng form.
  - Nút Lưu ở cả hai popup chỉ lưu; popup chỉ đóng bằng X hoặc nút Đóng.

  ## Thay đổi triển khai

  ### Popup Báo giá

  - Thêm Xuất PDF và Xóa vào header khi báo giá đã có ID; bản tạo mới chưa lưu sẽ chưa hiện hai nút
    này.

  - Sau lần lưu đầu tiên, giữ popup mở, chuyển state sang báo giá vừa tạo và hiện ngay hai nút
    header; các lần lưu sau cập nhật cùng bản ghi, không tạo trùng.

  - Xuất PDF dùng trực tiếp API xuất báo giá hiện có với cấu hình draft mặc định từ dữ liệu vừa lưu;
    không mở ExportQuoteDialog hay các tùy chọn in.

  - Nếu form đang có thay đổi chưa lưu, nút PDF lưu dữ liệu hiện tại trước rồi mới xuất draft để
    file phản ánh đúng bảng đang review.

  - Xóa hiển thị xác nhận, gọi API xóa hiện có, refresh dữ liệu liên quan và chỉ đóng popup sau khi
    xóa thành công.

  - Đổi nút Hủy thành Đóng; Lưu không gọi onOpenChange(false).

  ### Popup Đề xuất vật liệu

  - Đổi chiều rộng desktop thành sm:max-w-3xl, đồng nhất với Báo giá.
  - Giữ nguyên cụm xuất/xóa hiện tại.
  - Lưu chỉ tạo/cập nhật dữ liệu và giữ popup mở; sau lần tạo đầu tiên chuyển sang trạng thái chỉnh
    sửa bản ghi vừa tạo.

  - Đổi nút Hủy thành Đóng.

  ### Quy tắc đóng popup

  - Chặn đóng do click overlay bằng onPointerDownOutside(event.preventDefault()).
  - Chặn đóng bằng phím Escape qua onEscapeKeyDown(event.preventDefault()).
  - Nút X trên header và nút Đóng vẫn đóng chủ động.
  - Khi đang lưu, xuất hoặc xóa, disable các thao tác xung đột để tránh gửi lặp.

  ## Giao diện và callback

  - Mở rộng props/callback của NewQuoteDialog để nhận luồng xuất PDF, xóa và cập nhật bản ghi sau
    lần tạo đầu tiên.

  - Callback lưu của cả hai dialog trả về bản ghi đã lưu để dialog cập nhật ID/state mà không cần
    đóng rồi mở lại.

  - Tái sử dụng API lưu, xóa và xuất PDF hiện có; không thay đổi schema, công thức báo giá hoặc nội
    dung PDF.

  ## Kiểm thử

  - Tạo mới và sửa Đề xuất vật liệu: bấm Lưu nhiều lần, popup vẫn mở và không tạo bản ghi trùng.
  - Tạo mới và sửa Báo giá: hành vi tương tự; sau lần lưu đầu xuất hiện Xuất PDF và Xóa.
  - Xuất PDF trong Báo giá lưu thay đổi hiện tại nếu cần, tải thẳng draft và không mở tùy chọn in.
  - Xóa Báo giá yêu cầu xác nhận, cập nhật danh sách và đóng popup sau khi thành công; lỗi xóa giữ
    popup mở.

  - Click bên ngoài và nhấn Escape không đóng; X và Đóng đóng đúng.
  - Hai popup có cùng chiều rộng desktop, không tràn trên mobile/tablet.
  - Chạy TypeScript, ESLint mục tiêu, build và GitNexus detect_changes trước commit.