import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center px-5">
      <p className="eyebrow">Missing</p>
      <h1 className="display mt-3 text-5xl">That page is not part of Nokware.</h1>
      <p className="mt-3 text-muted">Nothing was deleted by opening it.</p>
      <Link href="/" className="btn mt-6 w-fit">Go home</Link>
    </main>
  );
}
