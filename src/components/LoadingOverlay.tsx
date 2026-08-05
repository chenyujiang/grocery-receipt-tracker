interface LoadingOverlayProps {
  message: string;
}

// A full-screen scrim that blocks interaction with the rest of the page —
// covering the whole viewport at a high z-index means nothing beneath it is
// clickable, no extra event handling needed.
export default function LoadingOverlay({ message }: LoadingOverlayProps) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-overlay-spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
