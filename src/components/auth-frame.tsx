import Link from "next/link";

export function AuthFrame({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-5 py-12">
      <Link href="/" className="display text-3xl italic">Nokware</Link>
      <h1 className="display text-5xl">{title}</h1>
      <p className="text-sm text-muted">{body}</p>
      {children}
    </main>
  );
}
