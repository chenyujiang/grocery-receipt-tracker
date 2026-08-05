// Issue 15 decision 2: also what a non-admin sees at the hidden admin
// route — a plain 404, not a login redirect, so the route's existence
// isn't confirmed to anyone probing it.
export default function NotFound() {
  return (
    <div className="page">
      <h1>Not found</h1>
      <p>This page doesn't exist.</p>
    </div>
  );
}
