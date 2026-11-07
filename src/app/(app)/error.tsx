"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-md py-16">
      <p className="eyebrow">Interrupted</p>
      <h1 className="display mt-3 text-5xl">We couldn’t load this view.</h1>
      <p className="mt-4 text-muted">Your data hasn’t been deleted. If you saved a status on this phone, it is still the last copy — not a live one.</p>
      <button className="btn mt-6" type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
