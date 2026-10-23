import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { uploadReceipt } from "@/lib/receipts";
import { useLanguage } from "@/lib/LanguageProvider";
import { useAuth } from "@/lib/AuthProvider";
import type { Translate } from "@/lib/i18n";
import { creditAmounts } from "@/lib/creditAmounts";
import LoadingOverlay from "@/components/LoadingOverlay";
import { errorMessage } from "@/lib/errorMessage";
import { AiAccessRefusedError, SUPPORT_EMAIL, type AiAccessRefusal } from "@/lib/aiAccessRefusal";
import { FREE_TRIAL_LIMIT } from "@/lib/aiAccessPolicy";

// Spec Section 16: what a user blocked from AI recognition is told, and who
// to ask, since nothing lifts the block automatically.
function refusalMessage(
  refusal: AiAccessRefusal,
  t: Translate
): string {
  if (refusal.code === "ai_trial_exhausted") {
    return t("errors.aiTrialExhausted", { limit: FREE_TRIAL_LIMIT, email: SUPPORT_EMAIL });
  }
  return t("errors.aiCreditExhausted", { ...creditAmounts(refusal), email: SUPPORT_EMAIL });
}

// Spec Section 16: opens the user's own email client on a draft to the admin;
// the app sends nothing itself. encodeURIComponent, not URLSearchParams: mail
// clients read a "+" in a mailto: query literally rather than as a space.
// The body names the account (email and user id), so the admin can find whom
// to grant credit to without asking back — or leaves it out, rather than
// sending blank lines, when there's no session (or no email) to read it from.
function creditRequestDraft(
  session: { email: string | null; userId: string } | null,
  t: Translate
): string {
  const subject = encodeURIComponent(t("upload.creditRequestSubject"));
  const accountLines = session
    ? [
        session.email !== null && t("upload.creditRequestEmail", { email: session.email }),
        t("upload.creditRequestUserId", { userId: session.userId }),
      ].filter((line) => line !== false)
    : [];
  const greeting = t("upload.creditRequestBody");
  const body = encodeURIComponent(
    accountLines.length > 0 ? `${greeting}\n\n${accountLines.join("\n")}` : greeting
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

// Section 6 + 15, page 2: photo upload flow.
// take photo / pick from library -> AI processing -> preview/confirm -> save.
// No `capture` attribute here on purpose: setting it makes most mobile
// browsers jump straight to the camera and skip the OS chooser, which is
// exactly what hides the "choose from gallery" option (Section 3, ticket 03).
export default function ReceiptUpload() {
  const { t } = useLanguage();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Held as the refusal, not its text, so it's worded at render: it carries a
  // link, and it follows a language switch made while it's on screen.
  const [refusal, setRefusal] = useState<AiAccessRefusal | null>(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setRefusal(null);
    setUploading(true);
    try {
      const { receiptId } = await uploadReceipt(file);
      navigate(`/receipts/${receiptId}/review`);
    } catch (err) {
      if (err instanceof AiAccessRefusedError) setRefusal(err.refusal);
      else setError(errorMessage(err, t("errors.uploadFailed")));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page">
      <h1>{t("upload.title")}</h1>
      <label className="upload-control">
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
        {uploading ? t("upload.recognizing") : t("upload.prompt")}
      </label>
      {error && <p role="alert">{error}</p>}
      {refusal && (
        <p role="alert">
          {refusalMessage(refusal, t)} <a
            href={creditRequestDraft(session, t)}
          >{t("upload.emailAdmin")}</a>
        </p>
      )}
      {uploading && <LoadingOverlay message={t("upload.recognizing")} />}
    </div>
  );
}
