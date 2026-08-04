// Section 6 + 15, page 2: photo upload flow.
// take photo / pick from library -> AI processing -> preview/confirm -> save.
// The <input capture="environment"> gives the OS camera + gallery picker for free (Section 3, ticket 03).
export default function ReceiptUpload() {
  return (
    <div className="page">
      <h1>拍照上传 Upload Receipt</h1>
      <label className="upload-control">
        <input type="file" accept="image/*" capture="environment" />
        拍照 / 选择图片 · Take photo / choose image
      </label>
      <p>上传后调用后端 /api/receipts/recognize 完成 OCR + 翻译 + 商品匹配建议（草稿 status = pending_review）。</p>
    </div>
  );
}
