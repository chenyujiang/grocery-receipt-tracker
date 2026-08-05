import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { uploadReceipt } from "@/lib/receipts";
import { useLanguage } from "@/lib/LanguageProvider";

// Section 6 + 15, page 2: photo upload flow.
// take photo / pick from library -> AI processing -> preview/confirm -> save.
// The <input capture="environment"> gives the OS camera + gallery picker for free (Section 3, ticket 03).
export default function ReceiptUpload() {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const { receiptId } = await uploadReceipt(file);
      navigate(`/receipts/${receiptId}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page">
      <h1>{t("upload.title")}</h1>
      <label className="upload-control">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading ? t("upload.recognizing") : t("upload.prompt")}
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
